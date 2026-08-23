import type { Dexie } from "dexie";
import type { PosPricingCache } from "./pricing-cache.js";
import type { LocalPosProduct, LocalPosProductUnit, LocalPosBarcode } from "./catalog-cache.js";

export const PRODUCT_NOT_FOUND = "PRODUCT_NOT_FOUND";
export const AMBIGUOUS_IDENTIFIER = "AMBIGUOUS_IDENTIFIER";
export const NO_PUBLISHED_PRICE = "NO_PUBLISHED_PRICE";
export const INVALID_LOOKUP_INPUT = "INVALID_LOOKUP_INPUT";

export class ProductLookupError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ProductLookupError";
  }
}

export interface ProductLookupResult {
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly business_id: string;
  readonly product_name: string;
  readonly variant_name: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly unit_price: string;
  readonly price_effective_from: string;
  readonly unit_code: string;
  readonly allow_decimal_qty: boolean;
  readonly price_version_id: string;
  readonly conversion_factor: string;
  readonly track_inventory: boolean;
  readonly price_tiers: readonly {
    readonly tier_id: string;
    readonly tier_code: string;
    readonly min_qty: string;
    readonly unit_price: string;
    readonly sort_order: number;
  }[];
  readonly promotions: readonly {
    readonly promotion_id: string;
    readonly promotion_type: "FIXED_PRICE" | "PERCENT_DISCOUNT" | "FIXED_DISCOUNT";
    readonly value: string;
    readonly min_qty: string;
    readonly priority: number;
    readonly effective_from: string;
    readonly effective_to: string;
    readonly created_at: string;
  }[];
  readonly pricing_resolved_at: string;
  readonly pricing_time_status: "TRUSTED" | "CLOCK_UNTRUSTED";
}

export class PosProductLookup {
  constructor(
    private readonly db: Dexie,
    private readonly pricing: PosPricingCache
  ) {}

  private validateInput(input: string): void {
    if (!input || input.trim() === "") {
      throw new ProductLookupError("Invalid lookup input: cannot be empty", INVALID_LOOKUP_INPUT);
    }
  }

  private async resolveSellableUnit(
    businessId: string,
    product: LocalPosProduct,
    explicitUnitId?: string,
    explicitBarcode?: string
  ): Promise<ProductLookupResult> {
    if (product.status !== "ACTIVE") {
      throw new ProductLookupError("Product is not active", PRODUCT_NOT_FOUND);
    }

    let units = await this.db.table<LocalPosProductUnit>("product_units")
      .where("[business_id+product_id]")
      .equals([businessId, product.id])
      .toArray();

    units = units.filter(u => u.status === "ACTIVE" && u.can_sell);

    if (explicitUnitId) {
      units = units.filter(u => u.id === explicitUnitId);
    }

    if (units.length === 0) {
      throw new ProductLookupError("No sellable units found", PRODUCT_NOT_FOUND);
    }

    if (units.length > 1) {
      throw new ProductLookupError("Ambiguous sellable units for product", AMBIGUOUS_IDENTIFIER);
    }

    const unit = units[0]!;

    const price = await this.pricing.getPublishedRetailPrice(businessId, unit.id);
    if (!price) {
      throw new ProductLookupError("No published retail price available", NO_PUBLISHED_PRICE);
    }
    const pricingTime = await this.pricing.getPricingTimeContext(businessId);
    const promotions = await this.pricing.listApplicablePromotions(businessId, unit.id);
    const priceTiers = price.tiers?.length
      ? price.tiers
      : [{
          tier_id: `${price.price_version_id}:RETAIL`,
          tier_code: "RETAIL",
          min_qty: "1",
          unit_price: price.unit_price,
          sort_order: 0,
        }];

    // Determine the barcode to report. If they searched by barcode, report that.
    // Otherwise, maybe find an active barcode or just leave it null.
    let reportedBarcode = explicitBarcode ?? null;
    if (!reportedBarcode) {
      const activeBarcodes = await this.db.table<LocalPosBarcode>("barcodes")
        .where("[business_id+product_unit_id]")
        .equals([businessId, unit.id])
        .toArray();
      const active = activeBarcodes.find(b => b.status === "ACTIVE");
      if (active) {
        reportedBarcode = active.barcode;
      }
    }

    return {
      product_id: product.id,
      product_unit_id: unit.id,
      business_id: businessId,
      product_name: product.name,
      variant_name: unit.display_name,
      sku: product.sku,
      barcode: reportedBarcode,
      unit_price: price.unit_price,
      price_effective_from: price.effective_from,
      unit_code: unit.unit_code,
      allow_decimal_qty: unit.allow_decimal_qty,
      price_version_id: price.price_version_id,
      conversion_factor: unit.conversion_factor,
      track_inventory: product.track_inventory,
      price_tiers: priceTiers,
      promotions,
      pricing_resolved_at: pricingTime.resolved_at,
      pricing_time_status: pricingTime.status,
    };
  }

  async findByBarcode(businessId: string, barcode: string): Promise<ProductLookupResult> {
    this.validateInput(barcode);
    const exactBarcode = barcode;

    const barcodeRecords = await this.db.table<LocalPosBarcode>("barcodes")
      .where("[business_id+barcode]")
      .equals([businessId, exactBarcode])
      .toArray();

    const activeBarcodes = barcodeRecords.filter(b => b.status === "ACTIVE");

    if (activeBarcodes.length === 0) {
      throw new ProductLookupError("Barcode not found", PRODUCT_NOT_FOUND);
    }
    if (activeBarcodes.length > 1) {
      throw new ProductLookupError("Ambiguous barcode", AMBIGUOUS_IDENTIFIER);
    }

    const b = activeBarcodes[0]!;
    const unit = await this.db.table<LocalPosProductUnit>("product_units").get(b.product_unit_id);
    if (!unit || unit.business_id !== businessId) {
      throw new ProductLookupError("Product unit not found", PRODUCT_NOT_FOUND);
    }
    
    const product = await this.db.table<LocalPosProduct>("products").get(unit.product_id);
    if (!product || product.business_id !== businessId) {
      throw new ProductLookupError("Product not found", PRODUCT_NOT_FOUND);
    }

    return this.resolveSellableUnit(businessId, product, unit.id, exactBarcode);
  }

  async findBySku(businessId: string, sku: string): Promise<ProductLookupResult> {
    this.validateInput(sku);
    const exactSku = sku;

    const productRecords = await this.db.table<LocalPosProduct>("products")
      .where("[business_id+sku]")
      .equals([businessId, exactSku])
      .toArray();

    const activeProducts = productRecords.filter(p => p.status === "ACTIVE");

    if (activeProducts.length === 0) {
      throw new ProductLookupError("SKU not found", PRODUCT_NOT_FOUND);
    }
    if (activeProducts.length > 1) {
      throw new ProductLookupError("Ambiguous SKU", AMBIGUOUS_IDENTIFIER);
    }

    return this.resolveSellableUnit(businessId, activeProducts[0]!, undefined, undefined);
  }

  async searchProducts(businessId: string, query: string): Promise<ProductLookupResult[]> {
    this.validateInput(query);
    const q = query.trim().toLowerCase();

    // 1. Search products by name (contains) or sku (exact or contains)
    // Dexie doesn't have a native case-insensitive contains search index, 
    // but since this is local cache we can filter an indexed subset or full business subset.
    // For M2, bounded result set filtering business products is sufficient.
    const allProducts = await this.db.table<LocalPosProduct>("products")
      .where("business_id")
      .equals(businessId)
      .toArray();

    const activeProducts = allProducts.filter(p => p.status === "ACTIVE");

    const matchedProducts = activeProducts.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.sku.toLowerCase().includes(q)
    );

    // We also need to search barcodes.
    const allBarcodes = await this.db.table<LocalPosBarcode>("barcodes")
      .where("business_id")
      .equals(businessId)
      .toArray();
    
    const matchedBarcodes = allBarcodes.filter(b => b.status === "ACTIVE" && b.barcode.toLowerCase().includes(q));

    // For matched products, we'll try to resolve them. If they have multiple sellable units, we will expand them.
    // If a barcode matched, we also resolve that unit.
    const results: ProductLookupResult[] = [];
    const seenUnitIds = new Set<string>();

    for (const p of matchedProducts) {
      let units = await this.db.table<LocalPosProductUnit>("product_units")
        .where("[business_id+product_id]")
        .equals([businessId, p.id])
        .toArray();
      units = units.filter(u => u.status === "ACTIVE" && u.can_sell);

      for (const u of units) {
        if (!seenUnitIds.has(u.id)) {
          try {
            const res = await this.resolveSellableUnit(businessId, p, u.id, undefined);
            results.push(res);
            seenUnitIds.add(u.id);
          } catch {
            // Ignore units with no prices in search
          }
        }
      }
    }

    for (const b of matchedBarcodes) {
      if (!seenUnitIds.has(b.product_unit_id)) {
        const u = await this.db.table<LocalPosProductUnit>("product_units").get(b.product_unit_id);
        if (u && u.status === "ACTIVE" && u.can_sell) {
          const p = await this.db.table<LocalPosProduct>("products").get(u.product_id);
          if (p && p.status === "ACTIVE") {
            try {
              const res = await this.resolveSellableUnit(businessId, p, u.id, b.barcode);
              results.push(res);
              seenUnitIds.add(u.id);
            } catch {
              // Ignore
            }
          }
        }
      }
    }

    // Sort: exact matches first, then stable alphabetical
    results.sort((a, b) => {
      const aExact = a.barcode === query.trim() || a.sku === query.trim();
      const bExact = b.barcode === query.trim() || b.sku === query.trim();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      const nameCompare = a.product_name.localeCompare(b.product_name);
      if (nameCompare !== 0) return nameCompare;
      
      return a.variant_name.localeCompare(b.variant_name);
    });

    // Bounded result set
    return results.slice(0, 50);
  }
}
