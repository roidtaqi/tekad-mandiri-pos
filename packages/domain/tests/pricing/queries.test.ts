import { test, expect } from "vitest";
import { buildPosPublishedRetailPriceBootstrapProjection } from "../../src/pricing/queries.js";
import { ActorContext } from "../../src/core/context.js";
import { createPricingPermissionError } from "../../src/pricing/errors.js";

test("buildPosPublishedRetailPriceBootstrapProjection requires workspace.pos.access", async () => {
  const ctx: ActorContext = {
    business_id: "b1",
    user_id: "u1",
    permissions: new Set(["product.read"]) // missing workspace.pos.access
  };

  const executor = {
    query: async () => ({ rows: [] })
  } as any;

  await expect(buildPosPublishedRetailPriceBootstrapProjection(ctx, executor, "2026-08-17T00:00:00Z")).rejects.toThrow(createPricingPermissionError());
});

test("buildPosPublishedRetailPriceBootstrapProjection builds valid snapshot", async () => {
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
          unit_price: 3500.0, // numeric from db
          effective_from: new Date("2026-08-17T00:00:00Z"),
          effective_to: null
        } as unknown as T
      ]
    })
  } as any; // Cast as any to satisfy SqlExecutor

  const snapshot = await buildPosPublishedRetailPriceBootstrapProjection(ctx, executor, "2026-08-17T00:00:00Z");
  expect(snapshot.bootstrap_version).toBe(1);
  expect(snapshot.business_id).toBe("b1");
  expect(snapshot.prices.length).toBe(1);
  const price = snapshot.prices[0];
  expect(price).toBeDefined();
  expect(price?.price_version_id).toBe("pv1");
  expect(price?.product_unit_id).toBe("pu1");
  expect(price?.unit_price).toBe("3500");
  expect(price?.effective_from).toBe("2026-08-17T00:00:00.000Z");
  expect(price?.effective_to).toBeNull();
});
