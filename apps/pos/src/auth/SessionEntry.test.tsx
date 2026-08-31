// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionEntry } from "./SessionEntry";
import { PosRuntimeValueProvider } from "../runtime/PosRuntimeProvider";
import type { PosRuntimeValue } from "../runtime/PosRuntimeProvider";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockRuntime(overrides: Partial<PosRuntimeValue> = {}): PosRuntimeValue {
  return {
    activeShift: null,
    completeReturn: vi.fn(),
    connect: vi.fn(async () => {}),
    database: {} as any,
    deviceId: "device-123",
    error: null,
    getOperationTimestamp: () => new Date().toISOString(),
    online: true,
    operational: {
      auth: {
        authorization_version: 1,
        default_location_id: "loc-1",
        membership: { business_id: "biz-1", status: "ACTIVE" },
        offline_valid_until: "2027-01-01T00:00:00.000Z",
        permissions: ["workspace.pos.access"],
        primary_role: "CASHIER",
        server_time: "2026-08-31T00:00:00.000Z",
        user: {
          display_name: "Budi Kasir",
          email: "budi@tekadmandiri.local",
          id: "user-1",
        },
      },
      business: {
        currency_code: "IDR",
        id: "biz-1",
        name: "Tekad Mandiri",
        timezone: "Asia/Makassar",
      },
      location: { code: "MAIN", id: "loc-1", name: "Toko Utama" },
      settings: { language: "id", receipt_width: "80mm" },
      source: "ONLINE",
      terminal: { code: "POS-1", id: "term-1", name: "Kasir 1" },
    },
    quickLock: vi.fn(),
    recoverOutbox: vi.fn(async () => {}),
    recoveryRequired: false,
    refreshOperationalState: vi.fn(async () => {}),
    runSync: vi.fn(async () => {}),
    searchReturnableSales: vi.fn(async () => []),
    signOut: vi.fn(async () => {}),
    status: "SIGNED_OUT",
    sync: {
      lastSuccessAt: null,
      message: "Siap",
      pendingCount: 0,
      requiresReviewCount: 0,
      retryableCount: 0,
      status: "IDLE",
    },
    terminalId: "term-1",
    unlock: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("POS SessionEntry Component", () => {
  it("renders POS onboarding with Tekad Mandiri branding and standard login inputs", () => {
    const runtime = mockRuntime();
    render(
      <PosRuntimeValueProvider value={runtime}>
        <SessionEntry />
      </PosRuntimeValueProvider>,
    );

    expect(screen.getByText("Tekad Mandiri")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Tekad Mandiri POS" })).toBeDefined();
    expect(screen.getByLabelText(/^Email/i)).toBeDefined();
    expect(screen.getByLabelText(/^Password/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Hubungkan Perangkat" })).toBeDefined();
  });

  it("auto-connects when exactly 1 terminal exists", async () => {
    const runtime = mockRuntime();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return Response.json({
          data: {
            business_id: "biz-1",
            default_location_id: "loc-1",
            primary_role: "CASHIER",
            session_secret: "mock-session-secret-12345",
            user: { display_name: "Budi Kasir", email: "budi@tekadmandiri.local", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/auth/terminals")) {
        return Response.json({
          data: [
            { code: "POS-1", id: "term-1", location_id: "loc-1", location_name: "Toko Utama", name: "Kasir 1" },
          ],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", mockFetch);

    render(
      <PosRuntimeValueProvider value={runtime}>
        <SessionEntry />
      </PosRuntimeValueProvider>,
    );

    fireEvent.change(screen.getByLabelText(/^Email/i), {
      target: { value: "budi@tekadmandiri.local" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: "ValidPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hubungkan Perangkat" }));

    await waitFor(() => {
      expect(runtime.connect).toHaveBeenCalledWith({
        bearer: "mock-session-secret-12345",
        terminalId: "term-1",
      });
    });
  });

  it("prompts terminal selection when 2+ terminals exist without silently picking index 0", async () => {
    const runtime = mockRuntime();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return Response.json({
          data: {
            business_id: "biz-1",
            default_location_id: "loc-1",
            primary_role: "CASHIER",
            session_secret: "mock-session-secret-12345",
            user: { display_name: "Budi Kasir", email: "budi@tekadmandiri.local", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/auth/terminals")) {
        return Response.json({
          data: [
            { code: "POS-1", id: "term-1", location_id: "loc-1", location_name: "Toko Utama", name: "Kasir 1" },
            { code: "POS-2", id: "term-2", location_id: "loc-1", location_name: "Toko Utama", name: "Kasir 2" },
            { code: "POS-3", id: "term-3", location_id: "loc-2", location_name: "Cabang B", name: "Kasir 3" },
          ],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", mockFetch);

    render(
      <PosRuntimeValueProvider value={runtime}>
        <SessionEntry />
      </PosRuntimeValueProvider>,
    );

    fireEvent.change(screen.getByLabelText(/^Email/i), {
      target: { value: "budi@tekadmandiri.local" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: "ValidPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hubungkan Perangkat" }));

    expect(await screen.findByRole("heading", { name: "Pilih Terminal" })).toBeDefined();
    expect(screen.getByText("Kasir 1 — Toko Utama")).toBeDefined();
    expect(screen.getByText("Kasir 2 — Toko Utama")).toBeDefined();
    expect(screen.getByText("Kasir 3 — Cabang B")).toBeDefined();

    // Select Kasir 2 (term-2)
    fireEvent.click(screen.getByLabelText("Kasir 2 — Toko Utama"));
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan" }));

    await waitFor(() => {
      expect(runtime.connect).toHaveBeenCalledWith({
        bearer: "mock-session-secret-12345",
        terminalId: "term-2",
      });
    });
  });

  it("shows error when 0 terminals exist", async () => {
    const runtime = mockRuntime();
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return Response.json({
          data: {
            business_id: "biz-1",
            default_location_id: "loc-1",
            primary_role: "CASHIER",
            session_secret: "mock-session-secret-12345",
            user: { display_name: "Budi Kasir", email: "budi@tekadmandiri.local", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/auth/terminals")) {
        return Response.json({ data: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", mockFetch);

    render(
      <PosRuntimeValueProvider value={runtime}>
        <SessionEntry />
      </PosRuntimeValueProvider>,
    );

    fireEvent.change(screen.getByLabelText(/^Email/i), {
      target: { value: "budi@tekadmandiri.local" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: "ValidPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hubungkan Perangkat" }));

    expect(
      await screen.findByText(/Tidak ada terminal kasir aktif yang terdaftar untuk bisnis ini/i),
    ).toBeDefined();
    expect(runtime.connect).not.toHaveBeenCalled();
  });

  it("unlocks POS via runtime.unlock without passing password as bearer", async () => {
    const runtime = mockRuntime({ status: "LOCKED" });

    render(
      <PosRuntimeValueProvider value={runtime}>
        <SessionEntry overlay />
      </PosRuntimeValueProvider>,
    );

    expect(screen.getByRole("heading", { name: "POS Terkunci" })).toBeDefined();
    expect(screen.getByText(/Terkunci untuk Budi Kasir/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/^Password Akun/i), {
      target: { value: "CashierPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buka Kunci" }));

    expect(runtime.unlock).toHaveBeenCalledWith({
      password: "CashierPassword123!",
    });
    expect(runtime.connect).not.toHaveBeenCalled();
  });

  it("submits recovery approval with Owner email, password, and reason", async () => {
    const runtime = mockRuntime({ recoveryRequired: true, status: "LOCKED" });

    render(
      <PosRuntimeValueProvider value={runtime}>
        <SessionEntry overlay />
      </PosRuntimeValueProvider>,
    );

    expect(screen.getByRole("heading", { name: "Persetujuan Owner Diperlukan" })).toBeDefined();

    fireEvent.change(screen.getByLabelText(/^Email Owner/i), {
      target: { value: "owner@tekadmandiri.local" },
    });
    fireEvent.change(screen.getByLabelText(/^Password Owner/i), {
      target: { value: "OwnerPassword123!" },
    });
    fireEvent.change(screen.getByLabelText(/^Alasan Recovery/i), {
      target: { value: "Pemulihan transaksi kasir setelah restart jaringan" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Setujui & Pulihkan Fakta" }));

    expect(runtime.recoverOutbox).toHaveBeenCalledWith({
      approverEmail: "owner@tekadmandiri.local",
      approverPassword: "OwnerPassword123!",
      reason: "Pemulihan transaksi kasir setelah restart jaringan",
    });
  });
});
