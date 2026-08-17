import { test, expect } from "vitest";
import { resolvePublishedRetailPrice } from "../../src/pricing/resolver.js";
import { PosPublishedRetailPrice, PricingError } from "@kastur/contracts";

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
  expect(resolved.product_unit_id).toBe("pu1");
  expect(resolved.effective_from).toBe("2026-08-17T00:00:00Z");
  expect(resolved.effective_to).toBeNull();
  expect(resolved.unit_price).toBe("3500");
  
  const zeroCached: PosPublishedRetailPrice = {
    ...cached,
    unit_price: "0.0000"
  };
  const zeroResolved = resolvePublishedRetailPrice(zeroCached, "pu1");
  expect(zeroResolved.unit_price).toBe("0");
});

test("large exact decimal string works with no JS number roundtrip", () => {
  const cached: PosPublishedRetailPrice = {
    price_version_id: "pv1",
    product_unit_id: "pu1",
    unit_price: "999999999999999.9999", // past safe integer bounds
    effective_from: "2026-08-17T00:00:00Z",
    effective_to: null
  };
  const resolved = resolvePublishedRetailPrice(cached, "pu1");
  expect(resolved.unit_price).toBe("999999999999999.9999");
});

test("Missing price throws strict PricingError", () => {
  let err: any;
  try {
    resolvePublishedRetailPrice(null, "pu2");
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(PricingError);
  expect(err.code).toBe("PUBLISHED_RETAIL_PRICE_NOT_AVAILABLE");
});

test("Product Unit ID mismatch throws strict PricingError", () => {
  const cached: PosPublishedRetailPrice = {
    price_version_id: "pv1",
    product_unit_id: "pu1",
    unit_price: "3500.0000",
    effective_from: "2026-08-17T00:00:00Z",
    effective_to: null
  };
  let err: any;
  try {
    resolvePublishedRetailPrice(cached, "pu2_different");
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(PricingError);
  expect(err.code).toBe("PUBLISHED_RETAIL_PRICE_NOT_AVAILABLE");
});

test("Malformed price string fails safely", () => {
  const cached: PosPublishedRetailPrice = {
    price_version_id: "pv1",
    product_unit_id: "pu1",
    unit_price: "invalid_money",
    effective_from: "2026-08-17T00:00:00Z",
    effective_to: null
  };
  expect(() => resolvePublishedRetailPrice(cached, "pu1")).toThrow("Invalid decimal string format"); // From @kastur/numeric
});
