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
  price_effective_from: "2020-01-01T00:00:00Z",
  unit_code: "PCS",
  allow_decimal_qty: false,
  price_version_id: "pv1",
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

test("PRICE-01 & PRICE-02: Cart captures exact price_version_id, quantity edit does not query/re-resolve price", () => {
  let cart = createCart("biz-1");
  cart = addItem(cart, mockLookupResult({ unit_price: "100.00", price_version_id: "pv-exact" }), "1");
  expect(cart.lines[0]!.price_version_id).toBe("pv-exact");
  expect(cart.lines[0]!.line_total).toBe("100");

  cart = setLineQuantity(cart, cart.lines[0]!.line_key, "3");
  expect(cart.lines[0]!.price_version_id).toBe("pv-exact");
  expect(cart.lines[0]!.line_total).toBe("300");
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
