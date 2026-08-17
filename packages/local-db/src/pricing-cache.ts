import { PosPublishedRetailPriceBootstrapSnapshot, PosPublishedRetailPrice } from "@kastur/contracts";
import type { Dexie } from "dexie";
import { PosCatalogCache } from "./catalog-cache.js";
import { parseMoney } from "@kastur/numeric";

export const PRICING_ALREADY_BOOTSTRAPPED = "PRICING_ALREADY_BOOTSTRAPPED";

export class PricingBootstrapError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "PricingBootstrapError";
  }
}

export class PosPricingCache {
  constructor(
    private readonly db: Dexie,
    private readonly catalog: PosCatalogCache
  ) {}

  async applyInitialBootstrap(snapshot: PosPublishedRetailPriceBootstrapSnapshot): Promise<void> {
    if (!snapshot || snapshot.bootstrap_version !== 1 || typeof snapshot.business_id !== "string" || !snapshot.business_id) {
      throw new PricingBootstrapError("Invalid bootstrap snapshot");
    }

    const { business_id, server_time, prices } = snapshot;

    await this.db.transaction("rw", [this.db.table("pricing_bootstrap_state"), this.db.table("published_retail_prices"), this.db.table("product_units")], async () => {
      const existingState = await this.db.table("pricing_bootstrap_state").get(business_id);
      if (existingState) {
        throw new PricingBootstrapError("Pricing is already bootstrapped for this business.", PRICING_ALREADY_BOOTSTRAPPED);
      }

      const versionSet = new Set<string>();
      const unitSet = new Set<string>();

      const toInsert: any[] = [];
      for (const price of prices) {
        if (typeof price.price_version_id !== "string" || !price.price_version_id) {
          throw new PricingBootstrapError("Invalid price row: missing or invalid price_version_id");
        }
        if (typeof price.product_unit_id !== "string" || !price.product_unit_id) {
          throw new PricingBootstrapError("Invalid price row: missing or invalid product_unit_id");
        }
        if (typeof price.unit_price !== "string") {
          throw new PricingBootstrapError("Invalid price row: unit_price must be a string");
        }
        if (versionSet.has(price.price_version_id)) {
          throw new PricingBootstrapError(`Duplicate price_version_id in snapshot: ${price.price_version_id}`);
        }
        versionSet.add(price.price_version_id);

        if (unitSet.has(price.product_unit_id)) {
          throw new PricingBootstrapError(`Duplicate product_unit_id in snapshot: ${price.product_unit_id}`);
        }
        unitSet.add(price.product_unit_id);

        try {
          parseMoney(price.unit_price);
        } catch {
          throw new PricingBootstrapError(`Invalid unit_price for ${price.price_version_id}`);
        }

        if (typeof price.effective_from !== "string" || isNaN(new Date(price.effective_from).getTime())) {
          throw new PricingBootstrapError(`Invalid effective_from for ${price.price_version_id}`);
        }
        if (price.effective_to !== null && (typeof price.effective_to !== "string" || isNaN(new Date(price.effective_to).getTime()))) {
          throw new PricingBootstrapError(`Invalid effective_to for ${price.price_version_id}`);
        }
        if (price.effective_to !== null && new Date(price.effective_to).getTime() <= new Date(price.effective_from).getTime()) {
          throw new PricingBootstrapError(`effective_to must be after effective_from for ${price.price_version_id}`);
        }

        const pu = await this.db.table("product_units").get(price.product_unit_id);
        if (!pu || pu.business_id !== business_id) {
          throw new PricingBootstrapError(`Product unit ${price.product_unit_id} not found in catalog for business ${business_id}`);
        }

        toInsert.push({
          price_version_id: price.price_version_id,
          business_id,
          product_unit_id: price.product_unit_id,
          unit_price: price.unit_price,
          effective_from: price.effective_from,
          effective_to: price.effective_to
        });
      }

      if (toInsert.length > 0) {
        await this.db.table("published_retail_prices").bulkAdd(toInsert);
      }

      await this.db.table("pricing_bootstrap_state").add({
        business_id,
        bootstrap_version: snapshot.bootstrap_version,
        server_time
      });
    });
  }

  async getBootstrapState(businessId: string): Promise<any> {
    return await this.db.table("pricing_bootstrap_state").get(businessId);
  }

  async getPublishedRetailPrice(businessId: string, productUnitId: string): Promise<PosPublishedRetailPrice | null> {
    const table = this.db.table("published_retail_prices");
    const record = await table.where("[business_id+product_unit_id]").equals([businessId, productUnitId]).first();
    if (!record) return null;
    
    return {
      price_version_id: record.price_version_id,
      product_unit_id: record.product_unit_id,
      unit_price: record.unit_price,
      effective_from: record.effective_from,
      effective_to: record.effective_to
    };
  }

  async listPublishedRetailPrices(businessId: string): Promise<PosPublishedRetailPrice[]> {
    const records = await this.db.table("published_retail_prices").where("business_id").equals(businessId).toArray();
    return records.map(r => ({
      price_version_id: r.price_version_id,
      product_unit_id: r.product_unit_id,
      unit_price: r.unit_price,
      effective_from: r.effective_from,
      effective_to: r.effective_to
    }));
  }
}
