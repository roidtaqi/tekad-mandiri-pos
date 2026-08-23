import { PricingError, type PosPublishedRetailPrice } from "@kastur/contracts";
import { describe, expect, test } from "vitest";
import {
  resolveOfflineUnitPrice,
  resolvePublishedRetailPrice,
  type OfflinePriceResolutionInput,
  type PublishedPromotion,
} from "../../src/pricing/resolver.js";

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

const promotion = (
  overrides: Partial<PublishedPromotion> = {},
): PublishedPromotion => ({
  promotion_id: "promo-default",
  promotion_type: "FIXED_DISCOUNT",
  value: "5",
  min_qty: "1",
  priority: 10,
  effective_from: "2026-08-01T00:00:00.000Z",
  effective_to: "2026-09-01T00:00:00.000Z",
  created_at: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

const offlineInput = (
  overrides: Partial<OfflinePriceResolutionInput> = {},
): OfflinePriceResolutionInput => ({
  product_unit_id: "unit-1",
  price_version_id: "price-1",
  price_effective_from: "2026-08-01T00:00:00.000Z",
  base_unit_price: "100",
  quantity: "1",
  price_tiers: [],
  promotions: [],
  pricing_resolved_at: "2026-08-23T00:00:00.000Z",
  pricing_time_status: "TRUSTED",
  ...overrides,
});

describe("resolveOfflineUnitPrice", () => {
  test("uses the published base when no same-unit tier or promotion applies", () => {
    const resolved = resolveOfflineUnitPrice(offlineInput());

    expect(resolved).toMatchObject({
      quantity: "1",
      base_unit_price: "100",
      applied_tier: null,
      tier_unit_price: "100",
      applied_promotion: null,
      promotion_discount: "0",
      final_unit_price: "100",
      warnings: [],
    });
  });

  test("selects the greatest eligible same-unit tier independent of input order", () => {
    const resolved = resolveOfflineUnitPrice(offlineInput({
      quantity: "12",
      price_tiers: [
        { tier_id: "tier-40", tier_code: "FORTY", min_qty: "40", unit_price: "70", sort_order: 2 },
        { tier_id: "tier-1", tier_code: "RETAIL", min_qty: "1", unit_price: "100", sort_order: 0 },
        { tier_id: "tier-10", tier_code: "TEN", min_qty: "10", unit_price: "80", sort_order: 1 },
      ],
    }));

    expect(resolved.applied_tier).toMatchObject({
      tier_id: "tier-10",
      tier_code: "TEN",
      min_qty: "10",
      unit_price: "80",
    });
    expect(resolved.final_unit_price).toBe("80");
  });

  test.each([
    ["FIXED_PRICE", "75", "75", "25"],
    ["FIXED_DISCOUNT", "7.25", "92.75", "7.25"],
    ["PERCENT_DISCOUNT", "12.5", "87.5", "12.5"],
  ] as const)(
    "applies one %s promotion with an explainable per-unit snapshot",
    (promotionType, value, finalPrice, discount) => {
      const resolved = resolveOfflineUnitPrice(offlineInput({
        promotions: [promotion({ promotion_type: promotionType, value })],
      }));

      expect(resolved.applied_promotion).toMatchObject({
        promotion_type: promotionType,
        value,
        discount_per_unit: discount,
        final_unit_price: finalPrice,
      });
      expect(resolved.promotion_discount).toBe(discount);
      expect(resolved.final_unit_price).toBe(finalPrice);
    },
  );

  test("quantizes percentage-derived unit money deterministically at NUMERIC(20,4)", () => {
    const resolved = resolveOfflineUnitPrice(offlineInput({
      base_unit_price: "10.005",
      promotions: [promotion({ promotion_type: "PERCENT_DISCOUNT", value: "12.5" })],
    }));

    expect(resolved.final_unit_price).toBe("8.7544");
    expect(resolved.promotion_discount).toBe("1.2506");
  });

  test("promotion precedence is priority, benefit, earliest creation, then lowercase ID ascending", () => {
    const common = {
      priority: 50,
      created_at: "2026-07-01T00:00:00.000Z",
    } as const;
    const candidates: PublishedPromotion[] = [
      promotion({ ...common, promotion_id: "promo-z", value: "20" }),
      promotion({ ...common, promotion_id: "Promo-A", value: "20" }),
      promotion({ ...common, promotion_id: "promo-better", value: "25", created_at: "2026-07-02T00:00:00.000Z" }),
      promotion({ ...common, promotion_id: "promo-earliest", value: "25", created_at: "2026-06-30T00:00:00.000Z" }),
      promotion({ promotion_id: "promo-priority", value: "1", priority: 51 }),
    ];

    expect(resolveOfflineUnitPrice(offlineInput({ promotions: candidates })).applied_promotion?.promotion_id)
      .toBe("promo-priority");
    expect(resolveOfflineUnitPrice(offlineInput({ promotions: candidates.slice(0, 4) })).applied_promotion?.promotion_id)
      .toBe("promo-earliest");
    expect(resolveOfflineUnitPrice(offlineInput({ promotions: candidates.slice(0, 2) })).applied_promotion?.promotion_id)
      .toBe("Promo-A");
    expect(resolveOfflineUnitPrice(offlineInput({ promotions: candidates.slice(0, 2).reverse() })).applied_promotion?.promotion_id)
      .toBe("Promo-A");
  });

  test("applies promotion windows as start-inclusive and end-exclusive", () => {
    const timed = promotion({
      effective_from: "2026-08-23T00:00:00.000Z",
      effective_to: "2026-08-24T00:00:00.000Z",
    });

    expect(resolveOfflineUnitPrice(offlineInput({
      promotions: [timed],
      pricing_resolved_at: timed.effective_from,
    })).applied_promotion?.promotion_id).toBe(timed.promotion_id);
    expect(resolveOfflineUnitPrice(offlineInput({
      promotions: [timed],
      pricing_resolved_at: timed.effective_to,
    })).applied_promotion).toBeNull();
  });

  test("does not activate a cached promotion when server-adjusted time is untrusted", () => {
    const resolved = resolveOfflineUnitPrice(offlineInput({
      price_tiers: [
        { tier_id: "tier-1", tier_code: "RETAIL", min_qty: "1", unit_price: "90", sort_order: 0 },
      ],
      promotions: [promotion({ value: "25" })],
      pricing_time_status: "CLOCK_UNTRUSTED",
    }));

    expect(resolved.tier_unit_price).toBe("90");
    expect(resolved.applied_promotion).toBeNull();
    expect(resolved.final_unit_price).toBe("90");
    expect(resolved.warnings).toEqual(["CLOCK_UNTRUSTED"]);
  });

  test("ignores an applicable promotion that would not benefit the customer", () => {
    const resolved = resolveOfflineUnitPrice(offlineInput({
      promotions: [promotion({ promotion_type: "FIXED_PRICE", value: "110" })],
    }));

    expect(resolved.applied_promotion).toBeNull();
    expect(resolved.final_unit_price).toBe("100");
  });

  test("preserves decimal exactness beyond the JavaScript safe-integer range", () => {
    const resolved = resolveOfflineUnitPrice(offlineInput({
      base_unit_price: "999999999999999.9999",
      quantity: "99999999999999.999999",
      promotions: [promotion({ promotion_type: "FIXED_DISCOUNT", value: "0.0001" })],
    }));

    expect(resolved.final_unit_price).toBe("999999999999999.9998");
    expect(resolved.quantity).toBe("99999999999999.999999");
  });

  test("rejects ambiguous tiers, duplicate promotion IDs, and invalid promotion values", () => {
    expect(() => resolveOfflineUnitPrice(offlineInput({
      price_tiers: [
        { tier_id: "tier-1", tier_code: "A", min_qty: "10", unit_price: "90", sort_order: 0 },
        { tier_id: "tier-2", tier_code: "B", min_qty: "10.0", unit_price: "80", sort_order: 1 },
      ],
    }))).toThrowError(expect.objectContaining({ code: "INVALID_PRICE_TIER" }));

    expect(() => resolveOfflineUnitPrice(offlineInput({
      promotions: [
        promotion({ promotion_id: "Promo-A" }),
        promotion({ promotion_id: "promo-a" }),
      ],
    }))).toThrowError(expect.objectContaining({ code: "INVALID_PROMOTION" }));

    expect(() => resolveOfflineUnitPrice(offlineInput({
      promotions: [promotion({ promotion_type: "PERCENT_DISCOUNT", value: "100.0001" })],
    }))).toThrowError(expect.objectContaining({ code: "INVALID_PROMOTION" }));

    expect(() => resolveOfflineUnitPrice(offlineInput({
      promotions: [promotion({ promotion_type: "FIXED_DISCOUNT", value: "100.0001" })],
    }))).toThrowError(expect.objectContaining({ code: "INVALID_PROMOTION" }));
  });

  test("rejects invalid quantity, money, timestamps, and runtime clock state with stable codes", () => {
    expect(() => resolveOfflineUnitPrice(offlineInput({ quantity: "0" })))
      .toThrowError(expect.objectContaining({ code: "INVALID_PRICING_QUANTITY" }));
    expect(() => resolveOfflineUnitPrice(offlineInput({ base_unit_price: "1.00001" })))
      .toThrowError(expect.objectContaining({ code: "INVALID_BASE_PRICE" }));
    expect(() => resolveOfflineUnitPrice(offlineInput({ pricing_resolved_at: "not-a-date" })))
      .toThrowError(expect.objectContaining({ code: "INVALID_PRICING_TIMESTAMP" }));
    expect(() => resolveOfflineUnitPrice(offlineInput({
      pricing_time_status: "UNKNOWN" as OfflinePriceResolutionInput["pricing_time_status"],
    }))).toThrowError(expect.objectContaining({ code: "INVALID_PRICING_CONTEXT" }));
  });
});
