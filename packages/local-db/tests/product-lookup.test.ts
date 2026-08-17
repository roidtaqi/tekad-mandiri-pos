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

test("LOOKUP-11: Price Effective Date", async () => {
  const defaultServerTime = new Date().toISOString();
  await db.catalog.applyInitialBootstrap({
    business_id: "biz-11",
    bootstrap_version: 1,
    server_time: defaultServerTime,
    products: [
      { id: "p11", sku: "SKU-11", name: "P11", base_unit_code: "PCS", track_inventory: true, status: "ACTIVE", version: "v1", updated_at: defaultServerTime }
    ],
    product_units: [
      { id: "u11", product_id: "p11", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime }
    ],
    barcodes: [
      { id: "b11", product_unit_id: "u11", barcode: "11111", is_internal: false, status: "ACTIVE", deactivated_at: null }
    ]
  });
  
  const futureFrom = Date.now() + 100000;
  const futureTo = Date.now() + 200000;
  await db.pricing.applyInitialBootstrap({
    business_id: "biz-11",
    bootstrap_version: 1,
    server_time: defaultServerTime,
    prices: [
      { price_version_id: "pv11", product_unit_id: "u11", unit_price: "888.00", effective_from: new Date(futureFrom).toISOString(), effective_to: new Date(futureTo).toISOString() }
    ]
  });
  
  // Before effective_from
  const beforeFrom = new Date(futureFrom - 1).toISOString();
  await expect(db.productLookup.findByBarcode("biz-11", "11111", beforeFrom))
    .rejects.toMatchObject({ code: NO_PUBLISHED_PRICE });
    
  // Exactly at effective_from
  const atFrom = new Date(futureFrom).toISOString();
  const resFrom = await db.productLookup.findByBarcode("biz-11", "11111", atFrom);
  expect(resFrom.unit_price).toBe("888.00");
  
  // Immediately before effective_to
  const beforeTo = new Date(futureTo - 1).toISOString();
  const resBeforeTo = await db.productLookup.findByBarcode("biz-11", "11111", beforeTo);
  expect(resBeforeTo.unit_price).toBe("888.00");
  
  // Exactly at effective_to
  const atTo = new Date(futureTo).toISOString();
  await expect(db.productLookup.findByBarcode("biz-11", "11111", atTo))
    .rejects.toMatchObject({ code: NO_PUBLISHED_PRICE });
    
  // After effective_to
  const afterTo = new Date(futureTo + 1).toISOString();
  await expect(db.productLookup.findByBarcode("biz-11", "11111", afterTo))
    .rejects.toMatchObject({ code: NO_PUBLISHED_PRICE });
});

test("LOOKUP-13: Current and Future Price Selection", async () => {
  const defaultServerTime = new Date().toISOString();
  await db.catalog.applyInitialBootstrap({
    business_id: "biz-13",
    bootstrap_version: 1,
    server_time: defaultServerTime,
    products: [
      { id: "p13", sku: "SKU-13", name: "P13", base_unit_code: "PCS", track_inventory: true, status: "ACTIVE", version: "v1", updated_at: defaultServerTime }
    ],
    product_units: [
      { id: "u13", product_id: "p13", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime }
    ],
    barcodes: [
      { id: "b13", product_unit_id: "u13", barcode: "13131", is_internal: false, status: "ACTIVE", deactivated_at: null }
    ]
  });
  
  // Price A (Current) and Price B (Future)
  const currentFrom = new Date("2026-08-01T00:00:00.000Z").getTime();
  const futureFrom = new Date("2026-09-01T00:00:00.000Z").getTime();
  
  await db.pricing.applyInitialBootstrap({
    business_id: "biz-13",
    bootstrap_version: 1,
    server_time: defaultServerTime,
    prices: [
      { price_version_id: "pvA", product_unit_id: "u13", unit_price: "25000", effective_from: new Date(currentFrom).toISOString(), effective_to: null },
      { price_version_id: "pvB", product_unit_id: "u13", unit_price: "27000", effective_from: new Date(futureFrom).toISOString(), effective_to: null }
    ]
  });
  
  // 1. serverTime = 2026-08-17 -> Price A
  const t1 = new Date("2026-08-17T00:00:00.000Z").toISOString();
  const res1 = await db.productLookup.findByBarcode("biz-13", "13131", t1);
  expect(res1.unit_price).toBe("25000"); // Numeric primitive formatting preserves string verbatim
  
  // 2. serverTime = 2026-09-05 -> Price B
  const t2 = new Date("2026-09-05T00:00:00.000Z").toISOString();
  const res2 = await db.productLookup.findByBarcode("biz-13", "13131", t2);
  expect(res2.unit_price).toBe("27000");
  
  // 3. Handoff test with effective_to on Price A
  await db.catalog.applyInitialBootstrap({
    business_id: "biz-13-handoff",
    bootstrap_version: 1,
    server_time: defaultServerTime,
    products: [
      { id: "p13-handoff", sku: "SKU-13-handoff", name: "P13", base_unit_code: "PCS", track_inventory: true, status: "ACTIVE", version: "v1", updated_at: defaultServerTime }
    ],
    product_units: [
      { id: "u13-handoff", product_id: "p13-handoff", unit_code: "PCS", display_name: "PCS", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: defaultServerTime }
    ],
    barcodes: [
      { id: "b13-handoff", product_unit_id: "u13-handoff", barcode: "13131-handoff", is_internal: false, status: "ACTIVE", deactivated_at: null }
    ]
  });

  await db.pricing.applyInitialBootstrap({
    business_id: "biz-13-handoff",
    bootstrap_version: 1,
    server_time: defaultServerTime,
    prices: [
      { price_version_id: "pvA_bounded", product_unit_id: "u13-handoff", unit_price: "25000", effective_from: new Date(currentFrom).toISOString(), effective_to: new Date(futureFrom).toISOString() },
      { price_version_id: "pvB_open", product_unit_id: "u13-handoff", unit_price: "27000", effective_from: new Date(futureFrom).toISOString(), effective_to: null }
    ]
  });

  // Aug 31 23:59:59.999
  const t3 = new Date(futureFrom - 1).toISOString();
  const res3 = await db.productLookup.findByBarcode("biz-13-handoff", "13131-handoff", t3);
  expect(res3.unit_price).toBe("25000");

  // Sep 1 exactly
  const t4 = new Date(futureFrom).toISOString();
  const res4 = await db.productLookup.findByBarcode("biz-13-handoff", "13131-handoff", t4);
  expect(res4.unit_price).toBe("27000");
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
