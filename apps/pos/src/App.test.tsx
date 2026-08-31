import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App, PosApplication } from "./App";
import {
  PosRuntimeValueProvider,
  type PosRuntimeValue,
} from "./runtime/PosRuntimeProvider.js";

function lockedRuntime(): PosRuntimeValue {
  return {
    status: "LOCKED",
    error: null,
    database: {} as PosRuntimeValue["database"],
    deviceId: "device-1",
    terminalId: "terminal-1",
    online: false,
    operational: {
      auth: {
        user: { id: "user-1", display_name: "Kasir Satu" },
        membership: { business_id: "business-1", status: "ACTIVE" },
        primary_role: "CASHIER",
        permissions: ["workspace.pos.access"],
        authorization_version: 1,
        offline_valid_until: "2026-09-01T00:00:00.000Z",
        default_location_id: "location-1",
        server_time: "2026-08-31T00:00:00.000Z",
      },
      business: {
        id: "business-1",
        name: "Toko Uji",
        currency_code: "IDR",
        timezone: "Asia/Makassar",
      },
      location: { id: "location-1", code: "MAIN", name: "Toko Utama" },
      terminal: { id: "terminal-1", code: "POS-1", name: "POS 1" },
      settings: { language: "id", receipt_width: "80mm" },
      source: "OFFLINE_CACHE",
    },
    activeShift: null,
    sync: {
      status: "OFFLINE",
      pendingCount: 1,
      retryableCount: 0,
      requiresReviewCount: 0,
      message: "Terkunci",
      lastSuccessAt: null,
    },
    recoveryRequired: false,
    connect: async () => undefined,
    getOperationTimestamp: () => {
      throw new Error("locked");
    },
    quickLock: () => undefined,
    recoverOutbox: async () => undefined,
    signOut: async () => undefined,
    runSync: async () => undefined,
    refreshOperationalState: async () => undefined,
    searchReturnableSales: async () => [],
    completeReturn: async () => {
      throw new Error("locked");
    },
  };
}

describe("POS shell", () => {
  it("renders the application identity", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain("Kastur POS");
  });

  it("unmounts every operational route while Quick Lock is active", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <PosRuntimeValueProvider value={lockedRuntime()}>
          <PosApplication />
        </PosRuntimeValueProvider>
      </MemoryRouter>,
    );

    expect(markup).toContain("Buka Kunci");
    expect(markup).not.toContain('class="pos-runtime"');
    expect(markup).not.toContain("Area tangkap scanner");
  });
});
