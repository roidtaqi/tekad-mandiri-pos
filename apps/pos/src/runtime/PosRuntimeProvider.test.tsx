// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PosRuntimeProvider, usePosRuntime } from "./PosRuntimeProvider";

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("PosRuntimeProvider connect runtime invariant", () => {
  it("stops with controlled error when 0 active terminals are available", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return Response.json({
          data: {
            business_id: "biz-1",
            default_location_id: "loc-1",
            primary_role: "CASHIER",
            session_secret: "secret-token-12345678901234567890",
            user: { display_name: "Kasir", email: "kasir@tekadmandiri.local", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/auth/terminals")) {
        return Response.json({ data: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <PosRuntimeProvider
        dependencies={{
          fetch: mockFetch as unknown as typeof fetch,
        }}
      >
        {children}
      </PosRuntimeProvider>
    );

    const { result } = renderHook(() => usePosRuntime(), { wrapper });

    await act(async () => {
      await result.current.connect({
        email: "kasir@tekadmandiri.local",
        password: "ValidPassword123!",
      });
    });

    expect(result.current.status).toBe("ERROR");
    expect(result.current.error).toBe("Tidak ada terminal kasir aktif yang tersedia.");
  });

  it("auto-selects terminal when exactly 1 active terminal exists", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return Response.json({
          data: {
            business_id: "biz-1",
            default_location_id: "loc-1",
            primary_role: "CASHIER",
            session_secret: "secret-token-12345678901234567890",
            user: { display_name: "Kasir", email: "kasir@tekadmandiri.local", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/auth/terminals")) {
        return Response.json({
          data: [
            { code: "POS-1", id: "term-single", location_id: "loc-1", location_name: "Toko Utama", name: "Kasir 1" },
          ],
        });
      }
      if (url.includes("/api/v1/auth/context")) {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-terminal-id")).toBe("term-single");
        return Response.json({
          data: {
            authorization_version: 1,
            default_location_id: "loc-1",
            membership: { business_id: "biz-1", status: "ACTIVE" },
            offline_valid_until: "2027-01-01T00:00:00.000Z",
            permissions: ["workspace.pos.access"],
            primary_role: "CASHIER",
            server_time: "2026-08-31T00:00:00.000Z",
            user: { display_name: "Kasir", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/sync/bootstrap")) {
        return Response.json({
          data: {
            business: { currency_code: "IDR", id: "biz-1", name: "Tekad Mandiri", timezone: "Asia/Makassar" },
            catalog: { categories: [], products: [] },
            device_id: "device-1",
            location: { code: "MAIN", id: "loc-1", name: "Toko Utama" },
            price_tiers: [],
            promotions: [],
            retail_prices: [],
            server_time: "2026-08-31T00:00:00.000Z",
            settings: { language: "id", receipt_width: "80mm" },
            sync_cursor: 1,
            terminal: { code: "POS-1", id: "term-single", name: "Kasir 1" },
          },
        });
      }
      return Response.json({ data: {} });
    });

    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <PosRuntimeProvider
        dependencies={{
          fetch: mockFetch as unknown as typeof fetch,
        }}
      >
        {children}
      </PosRuntimeProvider>
    );

    const { result } = renderHook(() => usePosRuntime(), { wrapper });

    await act(async () => {
      await result.current.connect({
        email: "kasir@tekadmandiri.local",
        password: "ValidPassword123!",
      });
    });

    expect(result.current.terminalId).toBe("term-single");
  });

  it("does not auto-select index 0 and stops with controlled error when 2+ terminals exist without terminalId", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return Response.json({
          data: {
            business_id: "biz-1",
            default_location_id: "loc-1",
            primary_role: "CASHIER",
            session_secret: "secret-token-12345678901234567890",
            user: { display_name: "Kasir", email: "kasir@tekadmandiri.local", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/auth/terminals")) {
        return Response.json({
          data: [
            { code: "POS-1", id: "term-1", location_id: "loc-1", location_name: "Toko Utama", name: "Kasir 1" },
            { code: "POS-2", id: "term-2", location_id: "loc-1", location_name: "Toko Utama", name: "Kasir 2" },
          ],
        });
      }
      if (url.includes("/api/v1/auth/context")) {
        throw new Error("Context should not be fetched when terminal selection is required");
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <PosRuntimeProvider
        dependencies={{
          fetch: mockFetch as unknown as typeof fetch,
        }}
      >
        {children}
      </PosRuntimeProvider>
    );

    const { result } = renderHook(() => usePosRuntime(), { wrapper });

    await act(async () => {
      await result.current.connect({
        email: "kasir@tekadmandiri.local",
        password: "ValidPassword123!",
      });
    });

    expect(result.current.status).toBe("ERROR");
    expect(result.current.error).toBe("Pilih terminal kasir terlebih dahulu.");
    expect(result.current.terminalId).toBe("");
  });

  it("connects directly when explicit terminalId is supplied alongside credentials", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return Response.json({
          data: {
            business_id: "biz-1",
            default_location_id: "loc-1",
            primary_role: "CASHIER",
            session_secret: "secret-token-12345678901234567890",
            user: { display_name: "Kasir", email: "kasir@tekadmandiri.local", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/auth/context")) {
        const headers = new Headers(init?.headers);
        expect(headers.get("x-terminal-id")).toBe("term-explicit-2");
        return Response.json({
          data: {
            authorization_version: 1,
            default_location_id: "loc-1",
            membership: { business_id: "biz-1", status: "ACTIVE" },
            offline_valid_until: "2027-01-01T00:00:00.000Z",
            permissions: ["workspace.pos.access"],
            primary_role: "CASHIER",
            server_time: "2026-08-31T00:00:00.000Z",
            user: { display_name: "Kasir", id: "user-1" },
          },
        });
      }
      if (url.includes("/api/v1/sync/bootstrap")) {
        return Response.json({
          data: {
            business: { currency_code: "IDR", id: "biz-1", name: "Tekad Mandiri", timezone: "Asia/Makassar" },
            catalog: { categories: [], products: [] },
            device_id: "device-1",
            location: { code: "MAIN", id: "loc-1", name: "Toko Utama" },
            price_tiers: [],
            promotions: [],
            retail_prices: [],
            server_time: "2026-08-31T00:00:00.000Z",
            settings: { language: "id", receipt_width: "80mm" },
            sync_cursor: 1,
            terminal: { code: "POS-2", id: "term-explicit-2", name: "Kasir 2" },
          },
        });
      }
      return Response.json({ data: {} });
    });

    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <PosRuntimeProvider
        dependencies={{
          fetch: mockFetch as unknown as typeof fetch,
        }}
      >
        {children}
      </PosRuntimeProvider>
    );

    const { result } = renderHook(() => usePosRuntime(), { wrapper });

    await act(async () => {
      await result.current.connect({
        email: "kasir@tekadmandiri.local",
        password: "ValidPassword123!",
        terminalId: "term-explicit-2",
      });
    });

    expect(result.current.terminalId).toBe("term-explicit-2");
    // Verify /api/v1/auth/terminals was not called
    expect(mockFetch.mock.calls.some(([input]) => String(input).includes("/api/v1/auth/terminals"))).toBe(false);
  });
});