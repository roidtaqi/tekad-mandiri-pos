import type Dexie from "dexie";
import type { PosCatalogBootstrapSnapshot } from "@kastur/contracts";

export interface LocalCatalogBootstrapState {
  readonly business_id: string;
  readonly bootstrap_version: 1;
  readonly server_time: string;
}

export interface LocalPosProduct {
  readonly id: string;
  readonly business_id: string;
  readonly sku: string;
  readonly name: string;
  readonly base_unit_code: string;
  readonly track_inventory: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: string;
  readonly updated_at: string;
}

export interface LocalPosProductUnit {
  readonly id: string;
  readonly business_id: string;
  readonly product_id: string;
  readonly unit_code: string;
  readonly display_name: string;
  readonly conversion_factor: string;
  readonly can_sell: boolean;
  readonly can_purchase: boolean;
  readonly allow_decimal_qty: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly version: string;
  readonly updated_at: string;
}

export interface LocalPosBarcode {
  readonly id: string;
  readonly business_id: string;
  readonly product_unit_id: string;
  readonly barcode: string;
  readonly is_internal: boolean;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly deactivated_at: string | null;
}

export class CATALOG_ALREADY_BOOTSTRAPPED extends Error {
  constructor(businessId: string) {
    super(`Catalog is already bootstrapped for business: ${businessId}`);
    this.name = "CATALOG_ALREADY_BOOTSTRAPPED";
  }
}

export class PosCatalogCache {
  readonly #database: Dexie;

  constructor(database: Dexie) {
    this.#database = database;
  }

  async getBootstrapState(
    businessId: string,
  ): Promise<LocalCatalogBootstrapState | null> {
    const state = await this.#database
      .table("catalog_bootstrap_state")
      .get(businessId);
    return state ?? null;
  }

  async listProducts(businessId: string): Promise<LocalPosProduct[]> {
    return this.#database
      .table("products")
      .where("business_id")
      .equals(businessId)
      .toArray();
  }

  async listProductUnits(
    businessId: string,
    productId?: string,
  ): Promise<LocalPosProductUnit[]> {
    if (productId !== undefined) {
      return this.#database
        .table("product_units")
        .where("[business_id+product_id]")
        .equals([businessId, productId])
        .toArray();
    }
    return this.#database
      .table("product_units")
      .where("business_id")
      .equals(businessId)
      .toArray();
  }

  async listBarcodes(
    businessId: string,
    productUnitId?: string,
  ): Promise<LocalPosBarcode[]> {
    if (productUnitId !== undefined) {
      return this.#database
        .table("barcodes")
        .where("[business_id+product_unit_id]")
        .equals([businessId, productUnitId])
        .toArray();
    }
    return this.#database
      .table("barcodes")
      .where("business_id")
      .equals(businessId)
      .toArray();
  }

  async applyInitialBootstrap(
    snapshot: PosCatalogBootstrapSnapshot,
  ): Promise<void> {
    // Structural integrity validation
    if (snapshot.bootstrap_version !== 1) {
      throw new Error("Unsupported bootstrap version");
    }
    if (!snapshot.business_id) {
      throw new Error("business_id is required");
    }

    const productIds = new Set<string>();
    const productUnitIds = new Set<string>();
    const barcodeIds = new Set<string>();

    for (const p of snapshot.products) {
      if (productIds.has(p.id)) throw new Error("Duplicate Product ID");
      if (p.status !== "ACTIVE" && p.status !== "INACTIVE") {
        throw new Error(`Invalid Product.status: ${String(p.status)}`);
      }
      productIds.add(p.id);
    }

    for (const u of snapshot.product_units) {
      if (productUnitIds.has(u.id)) throw new Error("Duplicate ProductUnit ID");
      if (!productIds.has(u.product_id)) {
        throw new Error("Dangling ProductUnit.product_id");
      }
      if (u.status !== "ACTIVE" && u.status !== "INACTIVE") {
        throw new Error(`Invalid ProductUnit.status: ${String(u.status)}`);
      }
      if (typeof u.conversion_factor !== "string") {
        throw new Error("ProductUnit.conversion_factor must be a string");
      }
      productUnitIds.add(u.id);
    }

    const activeBarcodes = new Set<string>();
    for (const b of snapshot.barcodes) {
      if (barcodeIds.has(b.id)) throw new Error("Duplicate Barcode ID");
      if (!productUnitIds.has(b.product_unit_id)) {
        throw new Error("Dangling Barcode.product_unit_id");
      }
      if (b.status !== "ACTIVE" && b.status !== "INACTIVE") {
        throw new Error(`Invalid Barcode.status: ${String(b.status)}`);
      }
      if (typeof b.barcode !== "string") {
        throw new Error("Barcode must be a string");
      }
      if (b.status === "ACTIVE") {
        if (activeBarcodes.has(b.barcode)) {
          throw new Error("Duplicate ACTIVE barcode for same business");
        }
        activeBarcodes.add(b.barcode);
      }
      barcodeIds.add(b.id);
    }

    const businessId = snapshot.business_id;

    // Explicit field mapping to drop sensitive/extra fields and override injected child identities
    const state: LocalCatalogBootstrapState = {
      business_id: businessId,
      bootstrap_version: 1,
      server_time: snapshot.server_time,
    };

    const products: LocalPosProduct[] = snapshot.products.map((p) => ({
      id: p.id,
      business_id: businessId,
      sku: p.sku,
      name: p.name,
      base_unit_code: p.base_unit_code,
      track_inventory: p.track_inventory,
      status: p.status,
      version: p.version,
      updated_at: p.updated_at,
    }));

    const units: LocalPosProductUnit[] = snapshot.product_units.map((u) => ({
      id: u.id,
      business_id: businessId,
      product_id: u.product_id,
      unit_code: u.unit_code,
      display_name: u.display_name,
      conversion_factor: u.conversion_factor,
      can_sell: u.can_sell,
      can_purchase: u.can_purchase,
      allow_decimal_qty: u.allow_decimal_qty,
      status: u.status,
      version: u.version,
      updated_at: u.updated_at,
    }));

    const barcodes: LocalPosBarcode[] = snapshot.barcodes.map((b) => ({
      id: b.id,
      business_id: businessId,
      product_unit_id: b.product_unit_id,
      barcode: b.barcode,
      is_internal: b.is_internal,
      status: b.status,
      deactivated_at: b.deactivated_at,
    }));

    await this.#database.transaction(
      "rw",
      [
        this.#database.table("products"),
        this.#database.table("product_units"),
        this.#database.table("barcodes"),
        this.#database.table("catalog_bootstrap_state"),
      ],
      async () => {
        const existing = await this.#database
          .table("catalog_bootstrap_state")
          .get(businessId);
        if (existing) {
          throw new CATALOG_ALREADY_BOOTSTRAPPED(businessId);
        }

        await this.#database.table("products").bulkAdd(products);
        await this.#database.table("product_units").bulkAdd(units);
        await this.#database.table("barcodes").bulkAdd(barcodes);
        await this.#database.table("catalog_bootstrap_state").add(state);
      },
    );
  }
}
