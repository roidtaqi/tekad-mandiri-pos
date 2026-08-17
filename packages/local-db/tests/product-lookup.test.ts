import { test, expect, beforeEach, afterEach } from "vitest";
import { _createPosLocalDatabaseInternal, type PosLocalDatabase } from "../src/pos-database.js";
import { 
  PRODUCT_NOT_FOUND, 
  AMBIGUOUS_IDENTIFIER, 
  NO_PUBLISHED_PRICE,
  INVALID_LOOKUP_INPUT
} from "../src/product-lookup.js";

import { createTestDatabaseRuntime, type TestDatabaseRuntime } from "./test-runtime.js";

let db: PosLocalDatabase;
let runtime: TestDatabaseRuntime;
let dbName: string;

beforeEach(async () => {
  runtime = createTestDatabaseRuntime();
  dbName = runtime.createDatabaseName("pos");
  db = _createPosLocalDatabaseInternal({
    dependencies: runtime.dependencies,
    databaseName: dbName,
  });
  await db.open();
});

afterEach(async () => {
  db.close();
  await runtime.cleanup();
});

const defaultServerTime = new Date().toISOString();

async function bootstrapTestCatalog(b: string) {
  await db.catalog.applyInitialBootstrap({
    business_id: b,
    bootstrap_version: 1,
    server_time: defaultServerTime,
    products: [
      {
        id: "p1", sku: "SKU-1", name: "Product 1", base_unit_code: "PCS", track_inventory: true, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "p2", sku: "SKU-AMB", name: "Product Ambiguous", base_unit_code: "PCS", track_inventory: true, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "p3", sku: "SKU-INACTIVE", name: "Product Inactive", base_unit_code: "PCS", track_inventory: true, status: "INACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "p4", sku: "SKU-NO-PRICE", name: "Product No Price", base_unit_code: "PCS", track_inventory: true, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "p5", sku: "SKU-DUP-BARCODE", name: "Product Dup Barcode", base_unit_code: "PCS", track_inventory: true, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      }
    ],
    product_units: [
      {
        id: "u1", product_id: "p1", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "u2-1", product_id: "p2", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "u2-2", product_id: "p2", unit_code: "BOX", display_name: "BOX", conversion_factor: "10", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "u3", product_id: "p3", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "u4", product_id: "p4", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "u5-1", product_id: "p5", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      },
      {
        id: "u5-2", product_id: "p5", unit_code: "BOX", display_name: "BOX", conversion_factor: "10", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime
      }
    ],
    barcodes: [
      {
        id: "b1", product_unit_id: "u1", barcode: "8991234567890", is_internal: false, status: "ACTIVE", deactivated_at: null
      },
      {
        id: "b2", product_unit_id: "u1", barcode: "BARCODE-INACTIVE", is_internal: false, status: "INACTIVE", deactivated_at: defaultServerTime
      },
      {
        id: "b3", product_unit_id: "u5-1", barcode: "AMB-BARCODE", is_internal: false, status: "ACTIVE", deactivated_at: null
      },
      // Note: we can't test duplicate ACTIVE barcodes for the SAME business because applyInitialBootstrap explicitly rejects it!
      // But we CAN test duplicate barcodes across DIFFERENT businesses.
    ]
  });

  await db.pricing.applyInitialBootstrap({
    business_id: b,
    bootstrap_version: 1,
    server_time: defaultServerTime,
    prices: [
      {
        price_version_id: "pv1-1",
        product_unit_id: "u1",
        unit_price: "100.00",
        effective_from: new Date(Date.now() - 10000).toISOString(),
        effective_to: null
      },
      {
        price_version_id: "pv2-1",
        product_unit_id: "u2-1",
        unit_price: "50.00",
        effective_from: new Date(Date.now() - 10000).toISOString(),
        effective_to: null
      },
      {
        price_version_id: "pv2-2",
        product_unit_id: "u2-2",
        unit_price: "450.00",
        effective_from: new Date(Date.now() - 10000).toISOString(),
        effective_to: null
      },
      {
        price_version_id: "pv5-1",
        product_unit_id: "u5-1",
        unit_price: "10.00",
        effective_from: new Date(Date.now() - 10000).toISOString(),
        effective_to: null
      },
      {
        price_version_id: "pv5-2",
        product_unit_id: "u5-2",
        unit_price: "90.00",
        effective_from: new Date(Date.now() - 10000).toISOString(),
        effective_to: null
      }
      // Note: u4 has no price
    ]
  });
}

test("LOOKUP-01: Exact Barcode", async () => {
  await bootstrapTestCatalog("biz-1");
  const result = await db.productLookup.findByBarcode("biz-1", "8991234567890");
  expect(result.product_id).toBe("p1");
  expect(result.product_unit_id).toBe("u1");
  expect(result.barcode).toBe("8991234567890");
  expect(result.unit_price).toBe("100.00");
});

test("LOOKUP-02: Exact SKU", async () => {
  await bootstrapTestCatalog("biz-1");
  const result = await db.productLookup.findBySku("biz-1", "SKU-1");
  expect(result.product_id).toBe("p1");
  expect(result.product_unit_id).toBe("u1");
  expect(result.sku).toBe("SKU-1");
  expect(result.barcode).toBe("8991234567890");
  expect(result.unit_price).toBe("100.00");
});

test("LOOKUP-03: Not Found", async () => {
  await bootstrapTestCatalog("biz-1");
  
  await expect(db.productLookup.findByBarcode("biz-1", "UNKNOWN"))
    .rejects.toMatchObject({ code: PRODUCT_NOT_FOUND });
    
  await expect(db.productLookup.findBySku("biz-1", "UNKNOWN-SKU"))
    .rejects.toMatchObject({ code: PRODUCT_NOT_FOUND });
    
  // Barcode inactive
  await expect(db.productLookup.findByBarcode("biz-1", "BARCODE-INACTIVE"))
    .rejects.toMatchObject({ code: PRODUCT_NOT_FOUND });
    
  // Product inactive
  await expect(db.productLookup.findBySku("biz-1", "SKU-INACTIVE"))
    .rejects.toMatchObject({ code: PRODUCT_NOT_FOUND });
});

test("LOOKUP-04: Business Isolation", async () => {
  await bootstrapTestCatalog("biz-1");
  // Try to lookup from biz-2
  await expect(db.productLookup.findByBarcode("biz-2", "8991234567890"))
    .rejects.toMatchObject({ code: PRODUCT_NOT_FOUND });
  await expect(db.productLookup.findBySku("biz-2", "SKU-1"))
    .rejects.toMatchObject({ code: PRODUCT_NOT_FOUND });
});

test("LOOKUP-05: Published Price Integration", async () => {
  await bootstrapTestCatalog("biz-1");
  const result = await db.productLookup.findBySku("biz-1", "SKU-1");
  expect(result.unit_price).toBe("100.00");
  expect(result.price_effective_from).toBeTruthy();
});

test("LOOKUP-06: No Published Price", async () => {
  await bootstrapTestCatalog("biz-1");
  // u4 has no price
  await expect(db.productLookup.findBySku("biz-1", "SKU-NO-PRICE"))
    .rejects.toMatchObject({ code: NO_PUBLISHED_PRICE });
});

test("LOOKUP-07: Ambiguous / Duplicate Barcode/SKU", async () => {
  await bootstrapTestCatalog("biz-1");
  // p2 has multiple sellable units (PCS and BOX)
  await expect(db.productLookup.findBySku("biz-1", "SKU-AMB"))
    .rejects.toMatchObject({ code: AMBIGUOUS_IDENTIFIER });
});

test("LOOKUP-08: Manual Search", async () => {
  await bootstrapTestCatalog("biz-1");
  
  // Search by partial name
  const resName = await db.productLookup.searchProducts("biz-1", "duct 1");
  expect(resName).toHaveLength(1);
  expect(resName[0]!.product_id).toBe("p1");

  // Search by exact barcode should put it first
  const resBarcode = await db.productLookup.searchProducts("biz-1", "8991234567890");
  expect(resBarcode[0]!.barcode).toBe("8991234567890");
  
  // Search for ambiguous sku should return both sellable variants for the manual search!
  const resAmb = await db.productLookup.searchProducts("biz-1", "SKU-AMB");
  expect(resAmb).toHaveLength(2); // PCS and BOX
  
  // Search for something with no price shouldn't show up
  const resNoPrice = await db.productLookup.searchProducts("biz-1", "Product No Price");
  expect(resNoPrice).toHaveLength(0);
});

test("LOOKUP-09: Empty Search Safety", async () => {
  await bootstrapTestCatalog("biz-1");
  
  await expect(db.productLookup.findByBarcode("biz-1", "   "))
    .rejects.toMatchObject({ code: INVALID_LOOKUP_INPUT });
    
  await expect(db.productLookup.findBySku("biz-1", ""))
    .rejects.toMatchObject({ code: INVALID_LOOKUP_INPUT });
    
  await expect(db.productLookup.searchProducts("biz-1", ""))
    .rejects.toMatchObject({ code: INVALID_LOOKUP_INPUT });
});

test("LOOKUP-10: Restart Persistence", async () => {
  await bootstrapTestCatalog("biz-1");
  db.close();
  
  const db2 = _createPosLocalDatabaseInternal({
    dependencies: runtime.dependencies,
    databaseName: dbName,
  });
  await db2.open();
  
  const result = await db2.productLookup.findByBarcode("biz-1", "8991234567890");
  expect(result.product_id).toBe("p1");
  
  db2.close();
});





test("LOOKUP-14: Exact Barcode Boundary", async () => {
  const defaultServerTime = new Date().toISOString();
  await db.catalog.applyInitialBootstrap({
    business_id: "biz-14",
    bootstrap_version: 1,
    server_time: defaultServerTime,
    products: [
      { id: "p14", sku: "SKU-14", name: "P14", base_unit_code: "PCS", track_inventory: true, status: "ACTIVE", version: "v1", updated_at: defaultServerTime }
    ],
    product_units: [
      { id: "u14", product_id: "p14", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime }
    ],
    barcodes: [
      { id: "b14-0", product_unit_id: "u14", barcode: "001234567890", is_internal: false, status: "ACTIVE", deactivated_at: null }
    ]
  });

  await db.pricing.applyInitialBootstrap({
    business_id: "biz-14",
    bootstrap_version: 1,
    server_time: defaultServerTime,
    prices: [
      { price_version_id: "pv14", product_unit_id: "u14", unit_price: "100", effective_from: "2020-01-01T00:00:00Z", effective_to: null }
    ]
  });

  // "001234567890" matches exactly
  const resExact = await db.productLookup.findByBarcode("biz-14", "001234567890");
  expect(resExact.barcode).toBe("001234567890");

  // "1234567890" does NOT match it
  await expect(db.productLookup.findByBarcode("biz-14", "1234567890"))
    .rejects.toMatchObject({ code: PRODUCT_NOT_FOUND });
});
