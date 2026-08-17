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

test("POS current schema is V4, pricing bootstrap applies successfully and preserves raw decimal string", async () => {
  expect((db as any)._database.verno).toBe(5);
  
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
