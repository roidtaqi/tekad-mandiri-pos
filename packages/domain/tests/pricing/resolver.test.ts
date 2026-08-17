import { test, expect } from "vitest";
import { resolvePublishedRetailPrice } from "../../src/pricing/resolver.js";
import { PosPublishedRetailPrice } from "@kastur/contracts";

test("resolvePublishedRetailPrice canonicalizes MoneyValue and preserves zero", () => {
  const cached: PosPublishedRetailPrice = {
    price_version_id: "pv1",
    product_unit_id: "pu1",
    unit_price: "3500.0000",
    effective_from: "2026-08-17T00:00:00Z",
    effective_to: null
  };

  const resolved = resolvePublishedRetailPrice(cached, "pu1");
  expect(resolved.price_version_id).toBe("pv1");
  expect(resolved.unit_price).toBe("3500");
  
  const zeroCached: PosPublishedRetailPrice = {
    ...cached,
    unit_price: "0.0000"
  };
  const zeroResolved = resolvePublishedRetailPrice(zeroCached, "pu1");
  expect(zeroResolved.unit_price).toBe("0");
});

test("resolvePublishedRetailPrice throws when missing", () => {
  expect(() => resolvePublishedRetailPrice(null, "pu2")).toThrow("Published retail price not available");
});
