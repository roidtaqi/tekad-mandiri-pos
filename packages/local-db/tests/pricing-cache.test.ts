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

test("pricing bootstrap applies successfully and preserves raw decimal string", async () => {
  const businessId = "b1";
  
  // mock catalog
  await db.catalog.applyInitialBootstrap({
    bootstrap_version: 1,
    business_id: businessId,
    server_time: "2026-08-17T00:00:00Z",
    products: [{
      id: "p1",
      sku: "SKU1",
      name: "Prod1",
      base_unit_code: "PCS",
      track_inventory: false,
      status: "ACTIVE",
      version: "v1",
      updated_at: "2026-08-17T00:00:00Z"
    }],
    product_units: [{
      id: "pu1",
      product_id: "p1",
      unit_code: "PCS",
      display_name: "Pieces",
      conversion_factor: "1",
      can_sell: true,
      can_purchase: true,
      allow_decimal_qty: false,
      status: "ACTIVE",
      version: "v1",
      updated_at: "2026-08-17T00:00:00Z"
    }],
    barcodes: []
  });

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
});

test("pricing bootstrap atomic rollback on failure", async () => {
  const businessId = "b1";
  const snapshot: PosPublishedRetailPriceBootstrapSnapshot = {
    bootstrap_version: 1,
    business_id: businessId,
    server_time: "2026-08-17T00:00:00Z",
    prices: [
      {
        price_version_id: "pv1",
        product_unit_id: "pu_not_exists",
        unit_price: "3500",
        effective_from: "2026-08-17T00:00:00Z",
        effective_to: null
      }
    ]
  };

  await expect(db.pricing.applyInitialBootstrap(snapshot)).rejects.toThrow("Product unit pu_not_exists not found");

  const state = await db.pricing.getBootstrapState(businessId);
  expect(state).toBeUndefined();
  const prices = await db.pricing.listPublishedRetailPrices(businessId);
  expect(prices.length).toBe(0);
});
