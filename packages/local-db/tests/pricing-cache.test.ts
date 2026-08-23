import { test, expect, beforeEach, afterEach } from "vitest";
import { type PosLocalDatabase, _createPosLocalDatabaseInternal } from "../src/pos-database.js";
import { PosPublishedRetailPriceBootstrapSnapshot } from "@kastur/contracts";
import { createTestDatabaseRuntime, type TestDatabaseRuntime } from "./test-runtime.js";

let runtime: TestDatabaseRuntime;
let db: PosLocalDatabase;

beforeEach(async () => {
  runtime = createTestDatabaseRuntime();
  db = runtime.track(
    _createPosLocalDatabaseInternal({
      databaseName: runtime.createDatabaseName("pricing-cache"),
      dependencies: runtime.dependencies,
    }),
  );
  await db.open();
});

afterEach(async () => {
  await runtime.cleanup();
});

const mockCatalog = async (businessId: string, pId: string, puId: string) => {
  await db.catalog.applyInitialBootstrap({
    bootstrap_version: 1,
    business_id: businessId,
    server_time: "2026-08-17T00:00:00Z",
    products: [{ id: pId, sku: "SKU1", name: "Prod1", base_unit_code: "PCS", track_inventory: false, status: "ACTIVE", version: "v1", updated_at: "2026-08-17T00:00:00Z" }],
    product_units: [{ id: puId, product_id: pId, unit_code: "PCS", display_name: "Pieces", conversion_factor: "1", can_sell: true, can_purchase: true, allow_decimal_qty: false, status: "ACTIVE", version: "v1", updated_at: "2026-08-17T00:00:00Z" }],
    barcodes: []
  });
};

test("POS current schema is V8, pricing bootstrap applies successfully and preserves raw decimal string", async () => {
  expect((db as any)._database.verno).toBe(8);
  
  const businessId = "b1";
  await mockCatalog(businessId, "p1", "pu1");

  const snapshot: PosPublishedRetailPriceBootstrapSnapshot = {
    bootstrap_version: 1,
    business_id: businessId,
    server_time: "2026-08-17T00:00:00Z",
    prices: [
      {
        price_version_id: "pv1",
        product_unit_id: "pu1",
        unit_price: "3500.0000",
        effective_from: "2026-08-17T00:00:00Z",
        effective_to: null
      }
    ]
  };

  await db.pricing.applyInitialBootstrap(snapshot);

  const price = await db.pricing.getPublishedRetailPrice(businessId, "pu1");
  expect(price).toBeDefined();
  expect(price?.unit_price).toBe("3500.0000"); // raw decimal string preserved
  expect(price?.price_version_id).toBe("pv1");
  expect(price?.product_unit_id).toBe("pu1");

  const state = await db.pricing.getBootstrapState(businessId);
  expect(state.business_id).toBe("b1");
  expect(state.bootstrap_version).toBe(1);

  // Repeat same-business bootstrap rejects with PRICING_ALREADY_BOOTSTRAPPED
  await expect(db.pricing.applyInitialBootstrap(snapshot)).rejects.toThrowError(
    expect.objectContaining({
      code: "PRICING_ALREADY_BOOTSTRAPPED"
    })
  );
});

test("pricing bootstrap atomic rollback on failure - Dexie constraint failure", async () => {
  // Test native write rollback proof
  const businessIdA = "bA";
  await mockCatalog(businessIdA, "pA", "puA");
  
  const snapshotA: PosPublishedRetailPriceBootstrapSnapshot = {
    bootstrap_version: 1,
    business_id: businessIdA,
    server_time: "2026-08-17T00:00:00Z",
    prices: [
      {
        price_version_id: "pv-shared", // shared ID
        product_unit_id: "puA",
        unit_price: "3500.00",
        effective_from: "2026-08-17T00:00:00Z",
        effective_to: null
      }
    ]
  };
  await db.pricing.applyInitialBootstrap(snapshotA);

  const businessIdB = "bB";
  await mockCatalog(businessIdB, "pB", "puB");

  const snapshotB: PosPublishedRetailPriceBootstrapSnapshot = {
    bootstrap_version: 1,
    business_id: businessIdB,
    server_time: "2026-08-17T00:00:00Z",
    prices: [
      {
        price_version_id: "pv-shared", // same shared ID
        product_unit_id: "puB",
        unit_price: "4500.00",
        effective_from: "2026-08-17T00:00:00Z",
        effective_to: null
      }
    ]
  };

  // Application validation passes because ID is unique within snapshotB
  // But Dexie native primary key throws ConstraintError
  await expect(db.pricing.applyInitialBootstrap(snapshotB)).rejects.toThrow();

  // Prove Business B rollback
  const stateB = await db.pricing.getBootstrapState(businessIdB);
  expect(stateB).toBeUndefined();
  const pricesB = await db.pricing.listPublishedRetailPrices(businessIdB);
  expect(pricesB.length).toBe(0);

  // Prove Business A unharmed
  const pricesA = await db.pricing.listPublishedRetailPrices(businessIdA);
  expect(pricesA.length).toBe(1);
});

test("close and reopen preserves data", async () => {
  const businessId = "b1";
  await mockCatalog(businessId, "p1", "pu1");

  await db.pricing.applyInitialBootstrap({
    bootstrap_version: 1,
    business_id: businessId,
    server_time: "2026-08-17T00:00:00Z",
    prices: [{ price_version_id: "pv1", product_unit_id: "pu1", unit_price: "3500.0000", effective_from: "2026-08-17T00:00:00Z", effective_to: null }]
  });

  db.close();
  await db.open();

  const price = await db.pricing.getPublishedRetailPrice(businessId, "pu1");
  expect(price?.unit_price).toBe("3500.0000");
  const state = await db.pricing.getBootstrapState(businessId);
  expect(state).toBeDefined();
});

test("validation matrix", async () => {
  const businessId = "b1";
  await mockCatalog(businessId, "p1", "pu1");

  const base = {
    bootstrap_version: 1 as const,
    business_id: businessId,
    server_time: "2026-08-17T00:00:00Z",
    prices: [{ price_version_id: "pv1", product_unit_id: "pu1", unit_price: "3500.0000", effective_from: "2026-08-17T00:00:00Z", effective_to: null }]
  };

  await expect(db.pricing.applyInitialBootstrap({ ...base, bootstrap_version: 2 as any })).rejects.toThrow();
  await expect(db.pricing.applyInitialBootstrap({ ...base, business_id: 123 as any })).rejects.toThrow();
  const p0 = base.prices[0] as import("@kastur/contracts").PosPublishedRetailPrice;
  await expect(db.pricing.applyInitialBootstrap({ ...base, prices: [{ ...p0, price_version_id: 123 as any }] })).rejects.toThrow();
  await expect(db.pricing.applyInitialBootstrap({ ...base, prices: [{ ...p0, product_unit_id: null as any }] })).rejects.toThrow();
  
  await expect(db.pricing.applyInitialBootstrap({ ...base, prices: [{ ...p0, unit_price: 3500 as any }] })).rejects.toThrow();
  await expect(db.pricing.applyInitialBootstrap({ ...base, prices: [{ ...p0, unit_price: "invalid" }] })).rejects.toThrow();
  
  await expect(db.pricing.applyInitialBootstrap({ ...base, prices: [{ ...p0, effective_from: "invalid" }] })).rejects.toThrow();
  await expect(db.pricing.applyInitialBootstrap({ ...base, prices: [{ ...p0, effective_from: "2026-08-18T00:00:00Z", effective_to: "2026-08-17T00:00:00Z" }] })).rejects.toThrow();
  
  await expect(db.pricing.applyInitialBootstrap({ ...base, prices: [p0, p0] })).rejects.toThrow(); // duplicate
});

test("trusted server-time metadata activates a cached scheduled version while an untrusted clock stays on last-known active", async () => {
  const businessId = "b-clock";
  await mockCatalog(businessId, "p-clock", "pu-clock");
  await db.pricing.applyInitialBootstrap({
    bootstrap_version: 1,
    business_id: businessId,
    server_time: "2026-08-17T00:00:00Z",
    prices: [{
      price_version_id: "pv-active",
      product_unit_id: "pu-clock",
      unit_price: "100.0000",
      effective_from: "2026-08-01T00:00:00Z",
      effective_to: "2026-08-18T00:00:00Z",
    }],
  });

  const dexie = (db as unknown as { _database: import("dexie").Dexie })._database;
  await dexie.table("published_retail_prices").put({
    price_version_id: "pv-scheduled",
    business_id: businessId,
    product_unit_id: "pu-clock",
    unit_price: "120.0000",
    effective_from: "2026-08-18T00:00:00Z",
    effective_to: null,
    status: "SCHEDULED",
    tiers: [{
      tier_id: "tier-scheduled",
      tier_code: "RETAIL",
      min_qty: "1",
      unit_price: "120.0000",
      sort_order: 0,
    }],
  });

  await dexie.table("pricing_bootstrap_state").put({
    business_id: businessId,
    bootstrap_version: 1,
    server_time: "2026-08-17T00:00:00Z",
    applied_at: new Date().toISOString(),
    clock_offset_ms: 0,
    clock_trust_status: "CLOCK_UNTRUSTED",
  });
  expect((await db.pricing.getPublishedRetailPrice(businessId, "pu-clock"))?.price_version_id)
    .toBe("pv-active");

  const scheduledAsOf = new Date("2026-08-19T00:00:00Z").getTime();
  await dexie.table("pricing_bootstrap_state").put({
    business_id: businessId,
    bootstrap_version: 1,
    server_time: "2026-08-19T00:00:00Z",
    applied_at: new Date().toISOString(),
    clock_offset_ms: scheduledAsOf - Date.now(),
    clock_trust_status: "TRUSTED",
  });
  expect((await db.pricing.getPublishedRetailPrice(businessId, "pu-clock"))?.price_version_id)
    .toBe("pv-scheduled");
});

test("promotion projection preserves created-at for deterministic offline conflict resolution", async () => {
  const businessId = "b-promo";
  await mockCatalog(businessId, "p-promo", "pu-promo");
  await db.pricing.applyInitialBootstrap({
    bootstrap_version: 1,
    business_id: businessId,
    server_time: "2026-08-17T12:00:00Z",
    prices: [{
      price_version_id: "pv-promo",
      product_unit_id: "pu-promo",
      unit_price: "100",
      effective_from: "2026-08-01T00:00:00Z",
      effective_to: null,
    }],
  });
  const dexie = (db as unknown as { _database: import("dexie").Dexie })._database;
  await dexie.table("promotions").put({
    key: `${businessId}:promotion-1`,
    business_id: businessId,
    entity_id: "promotion-1",
    entity_version: "1",
    updated_at: "2026-08-17T00:00:00Z",
    payload: {
      id: "promotion-1",
      product_unit_id: "pu-promo",
      promotion_type: "PERCENT_DISCOUNT",
      value: "10",
      min_qty: "2",
      priority: 7,
      effective_from: "2026-08-17T00:00:00Z",
      effective_to: "2026-08-18T00:00:00Z",
      status: "ACTIVE",
      created_at: "2026-08-16T00:00:00Z",
    },
  });

  await expect(db.pricing.listApplicablePromotions(businessId, "pu-promo"))
    .resolves.toEqual([expect.objectContaining({
      promotion_id: "promotion-1",
      created_at: "2026-08-16T00:00:00Z",
      priority: 7,
    })]);
});
