/** @vitest-environment happy-dom */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePosCart } from "./use-pos-cart";
import type { ProductLookupResult } from "@kastur/local-db";

const mockLookupResult = (overrides: Partial<ProductLookupResult> = {}): ProductLookupResult => ({
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
  conversion_factor: "1.00000000",
  track_inventory: true,
  price_tiers: [{
    tier_id: "tier-retail",
    tier_code: "RETAIL",
    min_qty: "1",
    unit_price: "100.00",
    sort_order: 0,
  }],
  promotions: [],
  pricing_resolved_at: "2026-08-23T00:00:00Z",
  pricing_time_status: "TRUSTED",
  ...overrides,
});

describe("usePosCart Scanner->Cart Handoff", () => {
  it("SCAN-01: Scanner SUCCESS adds one item", () => {
    const { result } = renderHook(() => usePosCart("biz-1"));
    act(() => {
      result.current.addScannedItem({ type: "SUCCESS", barcode: "123", payload: mockLookupResult() });
    });
    expect(result.current.cart.lines).toHaveLength(1);
    expect(result.current.cart.lines[0]!.quantity).toBe("1");
    expect(result.current.totals.gross_subtotal).toBe("100");
  });

  it("SCAN-02: Repeated Scanner SUCCESS increments quantity", () => {
    const { result } = renderHook(() => usePosCart("biz-1"));
    const item = mockLookupResult();
    act(() => {
      result.current.addScannedItem({ type: "SUCCESS", barcode: "123", payload: item });
      result.current.addScannedItem({ type: "SUCCESS", barcode: "123", payload: item });
    });
    expect(result.current.cart.lines).toHaveLength(1);
    expect(result.current.cart.lines[0]!.quantity).toBe("2");
    expect(result.current.totals.gross_subtotal).toBe("200");
  });
  
  it("SCAN-03: Scanner FAILURE leaves Cart unchanged", () => {
    const { result } = renderHook(() => usePosCart("biz-1"));
    act(() => {
      result.current.addScannedItem({ type: "SUCCESS", barcode: "123", payload: mockLookupResult() });
    });
    const initialLines = result.current.cart.lines;
    const initialTotals = result.current.totals;
    
    act(() => {
      result.current.addScannedItem({ type: "FAILURE", barcode: "UNKNOWN", error: "Not found" });
    });
    
    expect(result.current.cart.lines).toBe(initialLines);
    expect(result.current.totals).toBe(initialTotals);
  });
  
  it("allows setting line quantity and removing line", () => {
    const { result } = renderHook(() => usePosCart("biz-1"));
    act(() => {
      result.current.addScannedItem({ type: "SUCCESS", barcode: "123", payload: mockLookupResult() });
    });
    const lineKey = result.current.cart.lines[0]!.line_key;
    
    act(() => {
      result.current.changeQuantity(lineKey, "5");
    });
    expect(result.current.cart.lines[0]!.quantity).toBe("5");
    
    act(() => {
      result.current.remove(lineKey);
    });
    expect(result.current.cart.lines).toHaveLength(0);
  });

  it("re-resolves same-unit tier and promotion when quantity crosses a threshold", () => {
    const { result } = renderHook(() => usePosCart("biz-1"));
    act(() => {
      result.current.addScannedItem({
        type: "SUCCESS",
        barcode: "123",
        payload: mockLookupResult({
          price_tiers: [
            {
              tier_id: "tier-retail",
              tier_code: "RETAIL",
              min_qty: "1",
              unit_price: "100",
              sort_order: 0,
            },
            {
              tier_id: "tier-10",
              tier_code: "WHOLESALE",
              min_qty: "10",
              unit_price: "80",
              sort_order: 1,
            },
          ],
          promotions: [{
            promotion_id: "promo-10",
            promotion_type: "PERCENT_DISCOUNT",
            value: "10",
            min_qty: "10",
            priority: 10,
            effective_from: "2026-08-01T00:00:00.000Z",
            effective_to: "2026-09-01T00:00:00.000Z",
            created_at: "2026-07-01T00:00:00.000Z",
          }],
        }),
      });
    });
    const lineKey = result.current.cart.lines[0]!.line_key;

    act(() => result.current.changeQuantity(lineKey, "10"));

    expect(result.current.cart.lines[0]).toMatchObject({
      tier_code: "WHOLESALE",
      tier_unit_price: "80",
      promotion_id: "promo-10",
      promotion_discount: "8",
      unit_price: "72",
      line_total: "720",
    });
    expect(result.current.totals).toEqual({
      gross_subtotal: "800",
      promotion_discount_total: "80",
      grand_total: "720",
    });
  });
  
  it("allows clearing the cart", () => {
    const { result } = renderHook(() => usePosCart("biz-1"));
    act(() => {
      result.current.addScannedItem({ type: "SUCCESS", barcode: "123", payload: mockLookupResult() });
      result.current.addScannedItem({ type: "SUCCESS", barcode: "456", payload: mockLookupResult({ product_unit_id: "pu2", price_version_id: "pv2" }) });
    });
    expect(result.current.cart.lines).toHaveLength(2);
    
    act(() => {
      result.current.clear();
    });
    expect(result.current.cart.lines).toHaveLength(0);
    expect(result.current.totals.gross_subtotal).toBe("0");
  });
});
