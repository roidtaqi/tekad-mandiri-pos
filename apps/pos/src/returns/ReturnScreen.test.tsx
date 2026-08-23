/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PosLocalDatabase } from "@kastur/local-db";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PosRuntimeValueProvider,
  type PosRuntimeValue,
} from "../runtime/PosRuntimeProvider.js";
import { ReturnScreen } from "./ReturnScreen.js";
import type { ReturnableSaleDetail } from "./return-api.js";

afterEach(cleanup);

const remoteSale: ReturnableSaleDetail = {
  transaction: {
    change_amount: "0.0000",
    completed_at: "2026-08-23T00:00:01.000Z",
    grand_total: "12500.0000",
    line_discount_total: "0.0000",
    location_id: "location-1",
    occurred_at: "2026-08-23T00:00:00.000Z",
    promotion_discount_total: "0.0000",
    status: "COMPLETED",
    subtotal: "12500.0000",
    tax_total: "0.0000",
    terminal_id: "terminal-other",
    transaction_discount_total: "0.0000",
    transaction_id: "transaction-other",
    transaction_number: "POS-LAIN-0001",
  },
  items: [{
    conversion_snapshot: "1.00000000",
    final_unit_price_snapshot: "12500.0000",
    line_total: "12500.0000",
    product_id: "product-1",
    product_name_snapshot: "Produk Lintas Terminal",
    product_unit_id: "unit-1",
    quantity: "2.000000",
    remaining_returnable_qty: "1.000000",
    sku_snapshot: "SKU-1",
    transaction_item_id: "transaction-item-1",
    unit_code_snapshot: "PCS",
    unit_name_snapshot: "Pcs",
  }],
  payments: [{
    amount: "12500.0000",
    amount_tendered: null,
    change_amount: null,
    external_reference: null,
    method_code: "QRIS",
    payment_id: "payment-1",
    payment_method_id: "payment-method-1",
    status: "COMPLETED",
  }],
};

function runtimeValue(overrides: Partial<PosRuntimeValue> = {}): PosRuntimeValue {
  return {
    status: "READY",
    error: null,
    database: {} as PosLocalDatabase,
    deviceId: "device-1",
    terminalId: "terminal-1",
    online: false,
    operational: {
      auth: {
        user: { id: "cashier-1", display_name: "Kasir Satu" },
        membership: { business_id: "business-1", status: "ACTIVE" },
        primary_role: "CASHIER",
        permissions: [
          "workspace.pos.access",
          "return.read",
          "return.process",
          "refund.process",
        ],
        authorization_version: 1,
        offline_valid_until: "2026-08-24T00:00:00.000Z",
        default_location_id: "location-1",
        server_time: "2026-08-23T00:00:00.000Z",
      },
      business: {
        id: "business-1",
        name: "Toko",
        currency_code: "IDR",
        timezone: "Asia/Makassar",
      },
      location: { id: "location-1", code: "UTM", name: "Utama" },
      terminal: { id: "terminal-1", code: "POS-1", name: "Kasir 1" },
      settings: { language: "id-ID", receipt_width: "80mm" },
      source: "OFFLINE_CACHE",
    },
    activeShift: null,
    sync: {
      status: "OFFLINE",
      pendingCount: 0,
      retryableCount: 0,
      requiresReviewCount: 0,
      message: "Offline",
      lastSuccessAt: null,
    },
    connect: vi.fn(async () => undefined),
    quickLock: vi.fn(),
    signOut: vi.fn(),
    runSync: vi.fn(async () => undefined),
    refreshOperationalState: vi.fn(async () => undefined),
    searchReturnableSales: vi.fn(async () => []),
    completeReturn: vi.fn(async () => {
      throw new Error("Tidak boleh dipanggil saat offline.");
    }),
    ...overrides,
  };
}

describe("ReturnScreen", () => {
  it("keeps Return explicitly online-authoritative", () => {
    render(
      <PosRuntimeValueProvider value={runtimeValue()}>
        <ReturnScreen />
      </PosRuntimeValueProvider>,
    );

    expect(screen.getByRole("heading", { name: "Retur" })).toBeDefined();
    expect(screen.getByText("Retur offline tidak diaktifkan")).toBeDefined();
    expect((screen.getByRole("button", { name: "Cari" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("discovers an authoritative Sale from another terminal instead of local Dexie", async () => {
    const searchReturnableSales = vi.fn(async () => [remoteSale]);
    render(
      <PosRuntimeValueProvider value={runtimeValue({
        online: true,
        searchReturnableSales,
      })}>
        <ReturnScreen />
      </PosRuntimeValueProvider>,
    );

    fireEvent.change(screen.getByLabelText("Cari transaksi"), {
      target: { value: "POS-LAIN-0001" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Cari" }).closest("form")!);

    expect(await screen.findByText("POS-LAIN-0001")).toBeDefined();
    expect(searchReturnableSales).toHaveBeenCalledWith("POS-LAIN-0001");
    fireEvent.click(screen.getByRole("button", { name: /POS-LAIN-0001/u }));
    expect(
      await screen.findByText(
        /Produk Lintas Terminal · terjual 2\.000000; sisa 1\.000000 PCS/u,
      ),
    ).toBeDefined();
  });
});
