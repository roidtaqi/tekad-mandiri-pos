import { describe, expect, it } from "vitest";
import { 
  serializeProductListItem,
  serializeProductDetail,
  serializePosCatalogBootstrapSnapshot
} from "../src/catalog/serializers";
import { ActorContext } from "../src/core/context";

const baseCtx: ActorContext = {
  business_id: "biz-1",
  user_id: "user-1",
  permissions: new Set(["product.read", "workspace.pos.access"])
};

const broadCtx: ActorContext = {
  business_id: "biz-1",
  user_id: "user-1",
  permissions: new Set([
    "product.read",
    "workspace.pos.access",
    "cost.read",
    "pricing.read",
    "inventory.read",
    "supplier.read",
    "cash.read",
    "payment.read",
    "audit.sensitive.read"
  ])
};

const pollutedProductRow = {
  id: "prod-1",
  sku: "SKU-1",
  name: "Product 1",
  base_unit_code: "PCS",
  track_inventory: true,
  status: "ACTIVE",
  version: "v1",
  created_at: new Date(),
  updated_at: new Date(),
  category_id: "cat-1",
  category_name: "Cat 1",
  brand_id: "brand-1",
  brand_name: "Brand 1",
  
  // POLLUTION
  cost_snapshot: 50,
  gross_profit: 20,
  margin: 10,
  supplier_cost: 45,
  supplier_bank_account: "1234-5678",
  selling_price: 100,
  stock: 500,
  cash_expected: 1000,
  audit_secret: "sssh",
  session_secret_hash: "must-never-leak"
};

const nullBrandProductRow = {
  ...pollutedProductRow,
  brand_id: null,
  brand_name: null,
};

const pollutedUnitRow = {
  id: "unit-1",
  product_id: "prod-1",
  unit_code: "PCS",
  display_name: "Pieces",
  conversion_factor: "1.000",
  can_sell: true,
  can_purchase: true,
  allow_decimal_qty: false,
  status: "ACTIVE",
  version: "v1",
  created_at: new Date(),
  updated_at: new Date(),

  // POLLUTION
  margin: 10,
  stock: 100,
  selling_price: 150
};

const pollutedBarcodeRow = {
  id: "bc-1",
  product_unit_id: "unit-1",
  barcode: "00123",
  is_internal: false,
  status: "ACTIVE",
  deactivated_at: null,

  // POLLUTION
  audit_secret: "secret-barcode"
};

describe("Catalog Serializers & Redaction Boundary", () => {
  it("serializeProductListItem drops unknown/polluted properties", () => {
    const res = serializeProductListItem(baseCtx, pollutedProductRow);
    const expectedKeys = [
      "id", "sku", "name", "base_unit_code", 
      "track_inventory", "status", "version", 
      "category", "brand"
    ];
    
    expect(Object.keys(res).sort()).toEqual(expectedKeys.sort());
    expect(Object.keys(res.category).sort()).toEqual(["id", "name"].sort());
    expect(res.brand).not.toBeNull();
    if (res.brand) {
        expect(Object.keys(res.brand).sort()).toEqual(["id", "name"].sort());
    }

    expect("cost_snapshot" in res).toBe(false);
    expect("margin" in res).toBe(false);
    expect("stock" in res).toBe(false);
    expect(Object.hasOwn(res, "session_secret_hash")).toBe(false);
  });

  it("serializeProductListItem handles null brand correctly", () => {
    const res = serializeProductListItem(baseCtx, nullBrandProductRow);
    expect(res.brand).toBeNull();
  });

  it("serializeProductDetail drops unknown/polluted properties in all nested layers", () => {
    const res = serializeProductDetail(broadCtx, pollutedProductRow, [pollutedUnitRow], [pollutedBarcodeRow]);
    
    const expectedTopKeys = [
      "id", "sku", "name", "base_unit_code", "track_inventory", 
      "status", "version", "created_at", "updated_at", 
      "category", "brand", "units"
    ];
    expect(Object.keys(res).sort()).toEqual(expectedTopKeys.sort());
    expect(Object.keys(res.category).sort()).toEqual(["id", "name"].sort());
    expect(res.brand).not.toBeNull();
    if (res.brand) {
        expect(Object.keys(res.brand).sort()).toEqual(["id", "name"].sort());
    }

    const unit = res.units[0];
    expect(unit).toBeDefined();
    if (!unit) throw new Error("Missing unit");

    const expectedUnitKeys = [
      "id", "unit_code", "display_name", "conversion_factor",
      "can_sell", "can_purchase", "allow_decimal_qty",
      "status", "version", "barcodes"
    ];
    expect(Object.keys(unit).sort()).toEqual(expectedUnitKeys.sort());

    const barcode = unit.barcodes[0];
    expect(barcode).toBeDefined();
    if (!barcode) throw new Error("Missing barcode");

    const expectedBarcodeKeys = [
      "id", "barcode", "is_internal", "status", "deactivated_at"
    ];
    expect(Object.keys(barcode).sort()).toEqual(expectedBarcodeKeys.sort());

    // Proof broad permissions do not widen DTO
    expect("selling_price" in res).toBe(false);
    expect(Object.hasOwn(res, "session_secret_hash")).toBe(false);
    expect("margin" in unit).toBe(false);
    expect("audit_secret" in barcode).toBe(false);
  });

  it("serializePosCatalogBootstrapSnapshot drops unknown/polluted properties and is not widened by broad permissions", () => {
    const serverTime = new Date().toISOString();
    const res = serializePosCatalogBootstrapSnapshot(broadCtx, serverTime, [pollutedProductRow], [pollutedUnitRow], [pollutedBarcodeRow]);

    const expectedTopKeys = [
      "bootstrap_version", "business_id", "server_time", 
      "products", "product_units", "barcodes"
    ];
    expect(Object.keys(res).sort()).toEqual(expectedTopKeys.sort());

    const p = res.products[0];
    expect(p).toBeDefined();
    if (!p) throw new Error("Missing product");

    const expectedProductKeys = [
      "id", "sku", "name", "base_unit_code", "track_inventory", 
      "status", "version", "updated_at"
    ];
    expect(Object.keys(p).sort()).toEqual(expectedProductKeys.sort());

    const u = res.product_units[0];
    expect(u).toBeDefined();
    if (!u) throw new Error("Missing product unit");

    const expectedUnitKeys = [
      "id", "product_id", "unit_code", "display_name", "conversion_factor",
      "can_sell", "can_purchase", "allow_decimal_qty",
      "status", "version", "updated_at"
    ];
    expect(Object.keys(u).sort()).toEqual(expectedUnitKeys.sort());

    const b = res.barcodes[0];
    expect(b).toBeDefined();
    if (!b) throw new Error("Missing barcode");

    const expectedBarcodeKeys = [
      "id", "product_unit_id", "barcode", "is_internal", "status", "deactivated_at"
    ];
    expect(Object.keys(b).sort()).toEqual(expectedBarcodeKeys.sort());

    // Deep check
    expect("stock" in p).toBe(false);
    expect("margin" in u).toBe(false);
    expect("audit_secret" in b).toBe(false);
  });
});
