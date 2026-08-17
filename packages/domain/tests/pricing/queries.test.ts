import { test, expect } from "vitest";
import { buildPosPublishedRetailPriceBootstrapProjection } from "../../src/pricing/queries.js";
import { ActorContext } from "../../src/core/context.js";
import { createPricingPermissionError } from "../../src/pricing/errors.js";

test("buildPosPublishedRetailPriceBootstrapProjection requires workspace.pos.access", async () => {
  const ctx: ActorContext = {
    business_id: "b1",
    user_id: "u1",
    permissions: new Set(["product.read"])
  };

  const executor = {
    query: async () => ({ rows: [] })
  } as any;

  await expect(buildPosPublishedRetailPriceBootstrapProjection(ctx, executor, "2026-08-17T00:00:00Z")).rejects.toThrow(createPricingPermissionError());
});

test("buildPosPublishedRetailPriceBootstrapProjection captures SQL params and builds valid snapshot", async () => {
  const ctx: ActorContext = {
    business_id: "b1",
    user_id: "u1",
    permissions: new Set(["workspace.pos.access"])
  };

  let capturedSql = "";
  let capturedParams: any[] = [];
  const executor = {
    query: async <T>(sql: string, params: any[]) => {
      capturedSql = sql;
      capturedParams = params;
      return {
        rows: [
          {
            price_version_id: "pv1",
            product_unit_id: "pu1",
            unit_price: "3500.0000",
            effective_from: new Date("2026-08-17T00:00:00Z"),
            effective_to: null
          } as unknown as T
        ]
      };
    }
  } as any;

  const snapshot = await buildPosPublishedRetailPriceBootstrapProjection(ctx, executor, "2026-08-17T00:00:00Z");
  
  expect(capturedSql).toContain("pv.business_id = $1");
  expect(capturedSql).toContain("pv.status = 'ACTIVE'");
  expect(capturedSql).toContain("pv.effective_from <= $2");
  expect(capturedSql).toContain("ptv.tier_code = 'RETAIL'");
  expect(capturedSql).toContain("ptv.min_qty = 1");
  
  expect(capturedParams).toEqual(["b1", "2026-08-17T00:00:00Z"]);

  expect(snapshot.bootstrap_version).toBe(1);
  expect(snapshot.business_id).toBe("b1");
  expect(snapshot.prices.length).toBe(1);
  const price = snapshot.prices[0];
  expect(price).toBeDefined();
  expect(price?.price_version_id).toBe("pv1");
  expect(price?.product_unit_id).toBe("pu1");
  expect(price?.unit_price).toBe("3500.0000");
  expect(price?.effective_from).toBe("2026-08-17T00:00:00.000Z");
  expect(price?.effective_to).toBeNull();
});

test("Safe serializer pollution proof", async () => {
  const ctx: ActorContext = {
    business_id: "b1",
    user_id: "u1",
    permissions: new Set(["workspace.pos.access", "pricing.read", "pricing.calculate", "pricing.approve", "cost.read", "inventory.read", "audit.sensitive.read"])
  };

  const executor = {
    query: async <T>() => ({
      rows: [
        {
          price_version_id: "pv1",
          product_unit_id: "pu1",
          unit_price: "4000",
          effective_from: "2026-08-17T00:00:00.000Z",
          effective_to: null,
          cost: 100,
          cost_snapshot: {},
          pricing_reference_cost: 200,
          margin: 300,
          floor_price: 400,
          recommended_price: 500,
          supplier_cost: 600,
          stock: 700,
          approved_by: "someone",
          audit_secret: "secret",
          session_secret_hash: "hash"
        } as unknown as T
      ]
    })
  } as any;

  const snapshot = await buildPosPublishedRetailPriceBootstrapProjection(ctx, executor, "2026-08-17T00:00:00Z");
  expect(snapshot.prices.length).toBe(1);
  const price = snapshot.prices[0];
  
  expect(Object.keys(price as any).sort()).toEqual([
    "effective_from",
    "effective_to",
    "price_version_id",
    "product_unit_id",
    "unit_price"
  ]);
});

test("Safe serializer rejects malformed unit_price number", async () => {
  const ctx: ActorContext = {
    business_id: "b1",
    user_id: "u1",
    permissions: new Set(["workspace.pos.access"])
  };

  const executor = {
    query: async <T>() => ({
      rows: [
        {
          price_version_id: "pv1",
          product_unit_id: "pu1",
          unit_price: 3500.0,
          effective_from: new Date("2026-08-17T00:00:00Z"),
          effective_to: null
        } as unknown as T
      ]
    })
  } as any;

  await expect(buildPosPublishedRetailPriceBootstrapProjection(ctx, executor, "2026-08-17T00:00:00Z")).rejects.toThrow("unit_price must be string");
});
