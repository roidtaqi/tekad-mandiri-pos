/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import {
  addItem,
  calculateCartTotals,
  createCart,
  type LookupResultBoundary,
} from "@kastur/domain";
import { afterEach, describe, expect, it } from "vitest";

import { CartPanel } from "./CartPanel.js";

afterEach(cleanup);

function lookup(
  overrides: Partial<LookupResultBoundary> = {},
): LookupResultBoundary {
  return {
    business_id: "business-1",
    product_id: "product-1",
    product_unit_id: "unit-1",
    product_name: "Produk Uji",
    variant_name: "PCS",
    sku: "SKU-1",
    barcode: "123",
    unit_price: "100",
    price_effective_from: "2026-08-01T00:00:00.000Z",
    unit_code: "PCS",
    allow_decimal_qty: false,
    price_version_id: "price-1",
    conversion_factor: "1",
    track_inventory: true,
    price_tiers: [
      {
        tier_id: "tier-retail",
        tier_code: "RETAIL",
        min_qty: "1",
        unit_price: "100",
        sort_order: 0,
      },
      {
        tier_id: "tier-wholesale",
        tier_code: "WHOLESALE",
        min_qty: "10",
        unit_price: "80",
        sort_order: 1,
      },
    ],
    promotions: [{
      promotion_id: "promo-1",
      promotion_type: "FIXED_DISCOUNT",
      value: "5",
      min_qty: "10",
      priority: 1,
      effective_from: "2026-08-01T00:00:00.000Z",
      effective_to: "2026-09-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
    }],
    pricing_resolved_at: "2026-08-23T00:00:00.000Z",
    pricing_time_status: "TRUSTED",
    ...overrides,
  };
}

function renderCart(item: LookupResultBoundary, quantity = "1") {
  const cart = addItem(createCart(item.business_id), item, quantity);
  render(
    <CartPanel
      cart={cart}
      currency="IDR"
      onChangeQuantity={() => undefined}
      onClear={() => undefined}
      onRemove={() => undefined}
      totals={calculateCartTotals(cart)}
    />,
  );
}

describe("CartPanel pricing explanation", () => {
  it("shows the selected non-retail tier and promotion benefit", () => {
    renderCart(lookup(), "10");

    expect(screen.getByText("Tier WHOLESALE")).toBeDefined();
    expect(screen.getByText(/Promo · hemat/u)).toBeDefined();
  });

  it("shows an explicit warning when cached pricing time is untrusted", () => {
    renderCart(lookup({ pricing_time_status: "CLOCK_UNTRUSTED" }));

    expect(screen.getByRole("status").textContent).toContain("Waktu harga perlu verifikasi");
    expect(screen.queryByText(/Promo · hemat/u)).toBeNull();
  });
});
