// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AuthContextResponse } from "@kastur/contracts";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

function authContext(permissions: readonly string[]): AuthContextResponse {
  return {
    authorization_version: 4,
    default_location_id: "location-1",
    membership: { business_id: "business-1", status: "ACTIVE" },
    offline_valid_until: "2027-01-01T00:00:00.000Z",
    permissions,
    primary_role: "OWNER",
    server_time: "2026-08-23T00:00:00.000Z",
    user: { display_name: "Ayu Operator", id: "user-1" },
  };
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function requestPath(input: RequestInfo | URL): string {
  const raw = String(input);
  return raw.startsWith("http") ? new URL(raw).pathname : raw.split("?")[0]!;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("Back Office production runtime", () => {
  it("shows operator login entry when initial cookie verification is unauthenticated", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/context") {
        return json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
      }
      if (path === "/api/v1/system/setup/status") {
        return json({ initialized: true });
      }
      throw new Error(`Unexpected request ${String(input)}`);
    });

    render(
      <MemoryRouter>
        <App runtimeOptions={{ fetchImplementation }} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Masuk ke Back Office" })).toBeDefined();
    expect(screen.getByLabelText(/^Email/i)).toHaveProperty("type", "email");
    expect(screen.getByLabelText(/^Password/i)).toHaveProperty("type", "password");
  });

  it("authenticates using email and password without session_secret or sessionStorage, using HttpOnly cookie, and loads overview", async () => {
    let authContextCount = 0;
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/context") {
        authContextCount += 1;
        if (authContextCount === 1) {
          return json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
        }
        return json({ data: authContext(["workspace.backoffice.access"]) });
      }
      if (path === "/api/v1/system/setup/status") {
        return json({ initialized: true });
      }
      if (path === "/api/v1/auth/login") {
        expect(init?.credentials).toBe("include");
        return json({
          data: {
            business_id: "business-1",
            default_location_id: "location-1",
            primary_role: "OWNER",
            user: {
              display_name: "Owner",
              email: "owner@tekadmandiri.local",
              id: "user-1",
            },
          },
        });
      }
      if (path === "/api/v1/backoffice/overview") {
        return json({
          data: {
            attention: [],
            summary: {
              active_products: 2,
              negative_stock_products: 0,
              open_attention: 0,
              open_purchases: 1,
              open_shift_count: 1,
              today_sales: "125000.0000",
              today_transactions: 3,
            },
          },
        });
      }
      throw new Error(`Unexpected request ${String(input)} ${init?.method ?? "GET"}`);
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App runtimeOptions={{ fetchImplementation }} />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText(/^Email/i), {
      target: { value: "owner@tekadmandiri.local" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));

    expect(await screen.findByRole("heading", { name: "Ringkasan" })).toBeDefined();
    expect(await screen.findByText(/Rp\s+125\.000/u)).toBeDefined();

    // Verify no tokens in sessionStorage
    expect(window.sessionStorage.length).toBe(0);

    const loginCall = fetchImplementation.mock.calls.find(
      ([input]) => requestPath(input) === "/api/v1/auth/login",
    );
    expect(loginCall).toBeDefined();
    expect(loginCall?.[1]?.credentials).toBe("include");

    const authCalls = fetchImplementation.mock.calls.filter(
      ([input]) => requestPath(input) === "/api/v1/auth/context",
    );
    expect(authCalls.length).toBeGreaterThanOrEqual(2);
    const authHeaders = new Headers(authCalls[1]?.[1]?.headers);
    expect(authHeaders.get("authorization")).toBeNull();
    expect(authCalls[1]?.[1]?.credentials).toBe("include");
  });

  it("restores cookie session and serves a deep-linked inventory screen", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/context") {
        return json({
          data: authContext(["workspace.backoffice.access", "inventory.read"]),
        });
      }
      if (path === "/api/v1/backoffice/inventory") {
        return json({
          data: {
            items: [
              {
                base_quantity: "-2.0000",
                base_unit_code: "PCS",
                location_name: "Toko Utama",
                product_id: "product-1",
                product_name: "Kopi Tekad",
                sku: "KOPI-01",
                updated_at: "2026-08-23T02:00:00.000Z",
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected request ${String(input)}`);
    });

    render(
      <MemoryRouter initialEntries={["/inventory"]}>
        <App runtimeOptions={{ fetchImplementation }} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Inventory" })).toBeDefined();
    expect(await screen.findByText("Kopi Tekad")).toBeDefined();
    expect(screen.getByText("-2")).toBeDefined();
    expect(
      fetchImplementation.mock.calls.some(
        ([input]) => requestPath(input) === "/api/v1/backoffice/inventory",
      ),
    ).toBe(true);
  });

  it("shows refund settlement and actionable refund-record status as separate facts", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/context") {
        return json({
          data: authContext(["workspace.backoffice.access", "return.read"]),
        });
      }
      if (path === "/api/v1/backoffice/returns") {
        return json({
          data: {
            items: [
              {
                created_at: "2026-08-23T02:00:00.000Z",
                id: "return-1",
                item_count: 1,
                refund_id: "refund-technical-id-1",
                refund_record_status: "FAILED",
                refund_status: "PENDING",
                refund_version: "3",
                return_number: "RET-001",
                return_total: "15000.0000",
                status: "COMPLETED",
                transaction_number: "SALE-001",
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected request ${String(input)}`);
    });

    render(
      <MemoryRouter initialEntries={["/returns"]}>
        <App runtimeOptions={{ fetchImplementation }} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("RET-001")).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Settlement Refund" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Operasional Refund" })).toBeDefined();
    expect(screen.getByText("PENDING")).toBeDefined();
    expect(screen.getByText("FAILED")).toBeDefined();
    expect(screen.getByText("refund-technical-id-1")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("shows cached permission denial without requesting the protected resource", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      if (requestPath(input) === "/api/v1/auth/context") {
        return json({ data: authContext(["workspace.backoffice.access"]) });
      }
      throw new Error(`Protected resource should not be requested: ${String(input)}`);
    });

    render(
      <MemoryRouter initialEntries={["/inventory"]}>
        <App runtimeOptions={{ fetchImplementation }} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Akses Ditolak")).toBeDefined();
    expect(
      fetchImplementation.mock.calls.some(
        ([input]) => requestPath(input) === "/api/v1/backoffice/inventory",
      ),
    ).toBe(false);
  });

  it("posts a focused purchasing workflow through the real command endpoint", async () => {
    let commandAttempts = 0;
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/context") {
        return json({
          data: authContext(["workspace.backoffice.access", "purchase.post"]),
        });
      }
      if (path === "/api/v1/commands") {
        commandAttempts += 1;
        if (commandAttempts === 1) {
          throw new Error("Unknown network outcome");
        }
        const request = JSON.parse(String(init?.body)) as {
          command: { command_id: string };
        };
        return json({
          command_id: request.command.command_id,
          result: { purchase_id: "purchase-1", replayed: false, status: "POSTED" },
          server_time: "2026-08-23T00:00:01.000Z",
        });
      }
      throw new Error(`Unexpected request ${String(input)}`);
    });

    render(
      <MemoryRouter initialEntries={["/purchasing/post"]}>
        <App runtimeOptions={{ fetchImplementation }} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Post Purchase" })).toBeDefined();
    fireEvent.change(screen.getByLabelText(/ID perangkat aktif/u), {
      target: { value: "11111111-1111-4111-8111-111111111111" },
    });
    fireEvent.change(screen.getByLabelText(/Purchase ID/u), {
      target: { value: "22222222-2222-4222-8222-222222222222" },
    });
    fireEvent.change(screen.getByLabelText("Integrity exception ID yang diterima"), {
      target: { value: "33333333-3333-4333-8333-333333333333" },
    });
    fireEvent.change(screen.getByLabelText("Catatan"), {
      target: { value: "Sudah diverifikasi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post purchase" }));

    expect(await screen.findByText(/NETWORK_ERROR/u)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Post purchase" }));
    expect(await screen.findByText(/Command .* diterima server/u)).toBeDefined();
    const commandCalls = fetchImplementation.mock.calls.filter(
      ([input]) => requestPath(input) === "/api/v1/commands",
    );
    expect(commandCalls).toHaveLength(2);
    const commandCall = commandCalls[1];
    expect(commandCall).toBeDefined();
    const headers = new Headers(commandCall?.[1]?.headers);
    const body = JSON.parse(String(commandCall?.[1]?.body)) as {
      command: Record<string, unknown>;
    };
    const retryBody = JSON.parse(String(commandCalls[0]?.[1]?.body)) as {
      command: Record<string, unknown>;
    };
    expect(headers.get("idempotency-key")).toBe(body.command.command_id);
    expect(retryBody.command.command_id).toBe(body.command.command_id);
    expect(retryBody.command.correlation_id).toBe(body.command.correlation_id);
    expect(body.command).toMatchObject({
      authorization_version: 4,
      command_type: "purchasing.purchase.post",
      device_id: "11111111-1111-4111-8111-111111111111",
      location_id: "location-1",
      payload: {
        accepted_integrity_exception_ids: ["33333333-3333-4333-8333-333333333333"],
        expected_version: 1,
        notes: "Sudah diverifikasi",
        purchase_id: "22222222-2222-4222-8222-222222222222",
      },
      schema_version: 1,
    });
  });

  it("logs out server-side best effort and shows login screen", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const path = requestPath(input);
      if (path === "/api/v1/auth/context") {
        return json({ data: authContext(["workspace.backoffice.access"]) });
      }
      if (path === "/api/v1/backoffice/overview") {
        return json({ data: { attention: [], summary: {} } });
      }
      if (path === "/api/v1/auth/logout") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request ${String(input)}`);
    });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App runtimeOptions={{ fetchImplementation }} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Keluar" }));
    expect(await screen.findByRole("heading", { name: "Masuk ke Back Office" })).toBeDefined();
    await waitFor(() => {
      expect(
        fetchImplementation.mock.calls.some(
          ([input]) => requestPath(input) === "/api/v1/auth/logout",
        ),
      ).toBe(true);
    });
  });
});
