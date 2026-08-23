/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  LocalShiftClosingPreview,
  LocalShiftRecord,
  PosLocalDatabase,
} from "@kastur/local-db";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PosRuntimeValueProvider,
  type PosRuntimeValue,
} from "../runtime/PosRuntimeProvider.js";
import { ShiftScreen } from "./ShiftScreen.js";

afterEach(cleanup);

const shift: LocalShiftRecord = {
  shift_id: "shift-1",
  shift_number: "SHIFT-1",
  business_id: "business-1",
  location_id: "location-1",
  cashier_user_id: "cashier-1",
  device_id: "device-1",
  terminal_id: "terminal-1",
  status: "OPEN",
  sync_status: "PENDING",
  opening_cash: "100",
  opened_at: "2026-08-23T00:00:00.000Z",
  authorization_version: 1,
  active_context_key: "context-1",
  blind_actual_cash: null,
  blind_counted_at: null,
};

function runtimeValue(
  beginShiftClosing: PosLocalDatabase["cash"]["beginShiftClosing"],
): PosRuntimeValue {
  const database = {
    cash: {
      beginShiftClosing,
      completeShiftClosing: vi.fn(async () => ({ id: "snapshot-1" })),
      getMovementsForShift: vi.fn(async () => []),
      recordCashMovement: vi.fn(),
    },
  } as unknown as PosLocalDatabase;
  return {
    status: "READY",
    error: null,
    database,
    deviceId: "device-1",
    terminalId: "terminal-1",
    online: false,
    operational: {
      auth: {
        user: { id: "cashier-1", display_name: "Kasir Satu" },
        membership: { business_id: "business-1", status: "ACTIVE" },
        primary_role: "CASHIER",
        permissions: ["workspace.pos.access", "shift.close"],
        authorization_version: 1,
        offline_valid_until: "2099-08-24T00:00:00.000Z",
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
    activeShift: shift,
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
      throw new Error("Tidak digunakan.");
    }),
  };
}

describe("ShiftScreen blind close", () => {
  it("reveals expected cash only after the actual count is durably submitted", async () => {
    let resolveSubmission: ((value: LocalShiftClosingPreview) => void) | undefined;
    const beginShiftClosing = vi.fn(
      () => new Promise<LocalShiftClosingPreview>((resolve) => {
        resolveSubmission = resolve;
      }),
    );
    render(
      <PosRuntimeValueProvider value={runtimeValue(beginShiftClosing)}>
        <ShiftScreen />
      </PosRuntimeValueProvider>,
    );

    expect(screen.queryByText("Harapan")).toBeNull();
    fireEvent.change(screen.getByLabelText(/Kas fisik aktual/u), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kirim Hitungan Aktual" }));

    expect(beginShiftClosing).toHaveBeenCalledWith(
      "shift-1",
      "100",
      expect.objectContaining({ user: { id: "cashier-1", display_name: "Kasir Satu" } }),
      "device-1",
      expect.any(String),
    );
    expect(screen.queryByText("Harapan")).toBeNull();

    resolveSubmission?.({
      actual_cash: "100",
      expected_cash: "100",
      variance: "0",
      variance_type: "MATCHED",
    });
    await waitFor(() => expect(screen.getByText("Harapan")).toBeDefined());
    expect(screen.getByText("MATCHED", { exact: false })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Hitung Ulang" })).toBeNull();
  });
});
