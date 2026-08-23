import { expect, test } from "vitest";
import {
  addItem,
  calculateCartTotals,
  clearCart,
  createCart,
  removeLine,
  setLineQuantity,
  LookupResultBoundary,
} from "../../src/sales/cart.js";
import {
  CART_BUSINESS_MISMATCH,
  CART_PRICE_CONTEXT_CONFLICT,
  DECIMAL_QUANTITY_NOT_ALLOWED,
  INVALID_CART_PRICE,
  INVALID_CART_QUANTITY,
} from "../../src/sales/cart-errors.js";

const mockLookupResult = (overrides: Partial<LookupResultBoundary> = {}): LookupResultBoundary => ({
  business_id: "biz-1",
  product_id: "p1",
  product_unit_id: "pu1",
  product_name: "Product 1",
  variant_name: "PCS",
  sku: "SKU1",
  barcode: "123",
  unit_price: "100.00",
  price_effective_from: "2026-08-01T00:00:00Z",
  unit_code: "PCS",
  allow_decimal_qty: false,
  price_version_id: "pv-1",
  conversion_factor: "1.00000000",
  track_inventory: true,
  price_tiers: [],
  promotions: [],
  pricing_resolved_at: "2026-08-23T00:00:00.000Z",
  pricing_time_status: "TRUSTED",
  ...overrides,
});

test("CART-01: First add creates qty = 1", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult());
  expect(cart.lines).toHaveLength(1);
  expect(cart.lines[0]!.quantity).toBe("1");
});

test("CART-02: Repeated same ProductUnit + same PriceVersion increments +1", () => {
  let cart = createCart("biz-1");
  const item = mockLookupResult();
  cart = addItem(cart, item);
  cart = addItem(cart, item); // default qty is 1
  expect(cart.lines).toHaveLength(1);
  expect(cart.lines[0]!.quantity).toBe("2");
});

test("CART-03: Different ProductUnits remain separate", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ product_unit_id: "pu1" }));
  cart = addItem(cart, mockLookupResult({ product_unit_id: "pu2" }));
  expect(cart.lines).toHaveLength(2);
});

test("CART-04: Same ProductUnit + different PriceVersion remains separate", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ price_version_id: "pv1" }));
  cart = addItem(cart, mockLookupResult({ price_version_id: "pv2" }));
  expect(cart.lines).toHaveLength(2);
});

test("CART-05: Different barcode aliases for same ProductUnit/PriceVersion merge", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ barcode: "123" }));
  cart = addItem(cart, mockLookupResult({ barcode: "456" })); // same pu1 and pv1
  expect(cart.lines).toHaveLength(1);
  expect(cart.lines[0]!.quantity).toBe("2");
});

test("CART-06: Cross-Business item rejects with CART_BUSINESS_MISMATCH", () => {
  let cart = createCart("biz-1");
  expect(() => addItem(cart, mockLookupResult({ business_id: "biz-2" }))).toThrowError(
    expect.objectContaining({ code: CART_BUSINESS_MISMATCH })
  );
});

test("CART-07: Conflicting unit_price for same ProductUnit/PriceVersion rejects", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ unit_price: "100.00" }));
  expect(() => addItem(cart, mockLookupResult({ unit_price: "150.00" }))).toThrowError(
    expect.objectContaining({ code: CART_PRICE_CONTEXT_CONFLICT })
  );
});

test("QTY-01: Positive whole quantity succeeds", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult(), "5");
  expect(cart.lines[0]!.quantity).toBe("5");
});

test("QTY-02: Zero and negative reject", () => {
  let cart = createCart("biz-1");
  const item = mockLookupResult();
  expect(() => addItem(cart, item, "0")).toThrowError(expect.objectContaining({ code: INVALID_CART_QUANTITY }));
  expect(() => addItem(cart, item, "-1")).toThrowError(expect.objectContaining({ code: INVALID_CART_QUANTITY }));
});

test("QTY-03: Non-string/malformed runtime quantity rejects", () => {
  let cart = createCart("biz-1");
  const item = mockLookupResult();
  expect(() => addItem(cart, item, "abc")).toThrowError(expect.objectContaining({ code: INVALID_CART_QUANTITY }));
  expect(() => addItem(cart, item, 5 as any)).toThrowError(expect.objectContaining({ code: INVALID_CART_QUANTITY }));
  expect(() => addItem(cart, item, {} as any)).toThrowError(expect.objectContaining({ code: INVALID_CART_QUANTITY }));
});

test("QTY-04: Decimal quantity succeeds when allow_decimal_qty=true", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ allow_decimal_qty: true }), "1.5");
  expect(cart.lines[0]!.quantity).toBe("1.5");
});

test("QTY-05: Decimal quantity rejects when allow_decimal_qty=false", () => {
  let cart = createCart("biz-1");
  expect(() => addItem(cart, mockLookupResult({ allow_decimal_qty: false }), "1.5")).toThrowError(
    expect.objectContaining({ code: DECIMAL_QUANTITY_NOT_ALLOWED })
  );
});

test("QTY-06: 1.0/2.000 are accepted as mathematically whole", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ allow_decimal_qty: false }), "1.0");
  expect(cart.lines[0]!.quantity).toBe("1");
  cart = setLineQuantity(cart, cart.lines[0]!.line_key, "2.000");
  expect(cart.lines[0]!.quantity).toBe("2");
});

test("QTY-07: Resulting merged quantity remains exact and NUMERIC(20,6)-safe", () => {
  let cart = createCart("biz-1");
  const item = mockLookupResult({ allow_decimal_qty: true });
  cart = addItem(cart, item, "99999999999999.123456");
  cart = addItem(cart, item, "0.111111");
  expect(cart.lines[0]!.quantity).toBe("99999999999999.234567");
});

test("QTY-08: Cart quantity precision enforces NUMERIC(20,6)", () => {
  let cart = createCart("biz-1");
  const item = mockLookupResult({ allow_decimal_qty: true });
  
  // Valid boundaries
  cart = addItem(cart, item, "99999999999999.123456");
  expect(cart.lines[0]!.quantity).toBe("99999999999999.123456");
  
  cart = setLineQuantity(cart, cart.lines[0]!.line_key, "99999999999999.234567");
  expect(cart.lines[0]!.quantity).toBe("99999999999999.234567");

  // Invalid: exceeds precision
  expect(() => addItem(cart, item, "100000000000000")).toThrowError(
    expect.objectContaining({ code: INVALID_CART_QUANTITY })
  );

  // Invalid: exceeds scale
  expect(() => addItem(cart, item, "99999999999999.1234567")).toThrowError(
    expect.objectContaining({ code: INVALID_CART_QUANTITY })
  );

  // Invalid merge: 99999999999999.999999 + 0.000001 = 100000000000000.000000 (exceeds precision)
  cart = setLineQuantity(cart, cart.lines[0]!.line_key, "99999999999999.999999");
  expect(() => addItem(cart, item, "0.000001")).toThrowError(
    expect.objectContaining({ code: INVALID_CART_QUANTITY })
  );
});

test("TOTAL-01: line_total = exact unit_price × quantity", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ unit_price: "3.55" }), "2");
  expect(cart.lines[0]!.line_total).toBe("7.1");
});

test("TOTAL-02 & TOTAL-03: gross_subtotal = exact sum of line totals, grand_total = gross_subtotal", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ product_unit_id: "pu1", price_version_id: "pv1", unit_price: "10.00" }), "2");
  cart = addItem(cart, mockLookupResult({ product_unit_id: "pu2", price_version_id: "pv2", unit_price: "5.55" }), "1");
  
  const totals = calculateCartTotals(cart);
  expect(totals.gross_subtotal).toBe("25.55");
  expect(totals.grand_total).toBe("25.55");
});

test("TOTAL-04: empty Cart totals = zero", () => {
  const cart = createCart("biz-1");
  const totals = calculateCartTotals(cart);
  expect(totals.gross_subtotal).toBe("0");
  expect(totals.promotion_discount_total).toBe("0");
  expect(totals.grand_total).toBe("0");
});

test("TOTAL-05: zero-price line succeeds and totals correctly", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ unit_price: "0" }), "5");
  expect(cart.lines[0]!.line_total).toBe("0");
  const totals = calculateCartTotals(cart);
  expect(totals.gross_subtotal).toBe("0");
});

test("TOTAL-06: decimal/large values prove no JS number roundtrip", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ unit_price: "9999999999999.99" }), "1");
  cart = addItem(cart, mockLookupResult({ product_unit_id: "pu2", price_version_id: "pv2", unit_price: "0.01" }), "1");
  const totals = calculateCartTotals(cart);
  expect(totals.gross_subtotal).toBe("10000000000000");
  
  // also test unit_price as number to prove it rejects instead of silent coercion
  expect(() => addItem(cart, mockLookupResult({ unit_price: 100 as any }), "1")).toThrowError(
    expect.objectContaining({ code: INVALID_CART_PRICE })
  );
});

test("PRICE-01: Cart captures its exact published price version and candidate context", () => {
  const tiers = [{
    tier_id: "tier-retail",
    tier_code: "RETAIL",
    min_qty: "1",
    unit_price: "100",
    sort_order: 0,
  }];
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({
    unit_price: "100.00",
    price_version_id: "pv-exact",
    price_tiers: tiers,
  }), "1");
  expect(cart.lines[0]!.price_version_id).toBe("pv-exact");
  expect(cart.lines[0]!.base_unit_price).toBe("100");
  expect(cart.lines[0]!.tier_code).toBe("RETAIL");
  expect(cart.lines[0]!.line_total).toBe("100");
  expect(cart.lines[0]!.pricing_context.price_tiers).toEqual(tiers);
  expect(cart.lines[0]!.pricing_context.price_tiers).not.toBe(tiers);
});

test("PRICE-02: Quantity edits deterministically re-resolve tier and promotion snapshots", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({
    unit_price: "100",
    price_tiers: [
      { tier_id: "tier-10", tier_code: "WHOLESALE", min_qty: "10", unit_price: "80", sort_order: 1 },
      { tier_id: "tier-1", tier_code: "RETAIL", min_qty: "1", unit_price: "100", sort_order: 0 },
    ],
    promotions: [{
      promotion_id: "promo-10",
      promotion_type: "FIXED_DISCOUNT",
      value: "5",
      min_qty: "10",
      priority: 10,
      effective_from: "2026-08-01T00:00:00.000Z",
      effective_to: "2026-09-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
    }],
  }), "1");

  cart = setLineQuantity(cart, cart.lines[0]!.line_key, "10");
  expect(cart.lines[0]).toMatchObject({
    quantity: "10",
    base_unit_price: "100",
    tier_id: "tier-10",
    tier_code: "WHOLESALE",
    tier_min_qty: "10",
    tier_unit_price: "80",
    promotion_id: "promo-10",
    promotion_type: "FIXED_DISCOUNT",
    promotion_value: "5",
    promotion_discount: "5",
    unit_price: "75",
    line_total: "750",
  });
  expect(calculateCartTotals(cart)).toEqual({
    gross_subtotal: "800",
    promotion_discount_total: "50",
    grand_total: "750",
  });

  cart = setLineQuantity(cart, cart.lines[0]!.line_key, "2");
  expect(cart.lines[0]).toMatchObject({
    tier_code: "RETAIL",
    tier_unit_price: "100",
    promotion_id: null,
    promotion_discount: "0",
    unit_price: "100",
    line_total: "200",
  });
});

test("PRICE-03: Repeated scans cross same-unit tiers using the original line context", () => {
  const original = mockLookupResult({
    price_tiers: [
      { tier_id: "tier-1", tier_code: "RETAIL", min_qty: "1", unit_price: "100", sort_order: 0 },
      { tier_id: "tier-2", tier_code: "PAIR", min_qty: "2", unit_price: "90", sort_order: 1 },
    ],
    pricing_resolved_at: "2026-08-23T00:00:00.000Z",
  });
  let cart = addItem(createCart("biz-1"), original);

  cart = addItem(cart, mockLookupResult({
    price_tiers: [
      { tier_id: "changed", tier_code: "CHANGED", min_qty: "2", unit_price: "1", sort_order: 0 },
    ],
    pricing_resolved_at: "2026-08-23T00:01:00.000Z",
  }));

  expect(cart.lines).toHaveLength(1);
  expect(cart.lines[0]).toMatchObject({
    quantity: "2",
    tier_id: "tier-2",
    unit_price: "90",
    line_total: "180",
    pricing_resolved_at: "2026-08-23T00:00:00.000Z",
  });
  expect(cart.lines[0]!.pricing_context.price_tiers).toEqual(original.price_tiers);
});

test("PRICE-04: Untrusted device time retains last-known price and exposes review warning", () => {
  const cart = addItem(createCart("biz-1"), mockLookupResult({
    price_tiers: [
      { tier_id: "tier-1", tier_code: "RETAIL", min_qty: "1", unit_price: "95", sort_order: 0 },
    ],
    promotions: [{
      promotion_id: "future-sensitive",
      promotion_type: "FIXED_PRICE",
      value: "1",
      min_qty: "1",
      priority: 999,
      effective_from: "2026-08-01T00:00:00.000Z",
      effective_to: "2026-09-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
    }],
    pricing_time_status: "CLOCK_UNTRUSTED",
  }));

  expect(cart.lines[0]).toMatchObject({
    tier_unit_price: "95",
    promotion_id: null,
    unit_price: "95",
    pricing_time_status: "CLOCK_UNTRUSTED",
    pricing_warnings: ["CLOCK_UNTRUSTED"],
  });
});

test("Misc: clearCart and removeLine", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult());
  cart = addItem(cart, mockLookupResult({ product_unit_id: "pu2", price_version_id: "pv2" }));
  expect(cart.lines).toHaveLength(2);
  
  cart = removeLine(cart, cart.lines[0]!.line_key);
  expect(cart.lines).toHaveLength(1);
  
  cart = clearCart(cart);
  expect(cart.lines).toHaveLength(0);
});
