import { SYSTEM_HEALTH_PATH } from "@kastur/contracts";
import { describe, expect, it } from "vitest";

import type { RequestDatabase, SqlQueryResult } from "./database.js";
import { handleRequest } from "./index.js";
import worker from "./index";

class MockSetupDatabase implements RequestDatabase {
  #businesses: Array<{ id: string; name: string }> = [];

  constructor(initialBusinesses: Array<{ id: string; name: string }> = []) {
    this.#businesses = [...initialBusinesses];
  }

  async close(): Promise<void> {}

  async transaction<TResult>(
    operation: (executor: RequestDatabase) => Promise<TResult>,
  ): Promise<TResult> {
    return operation(this);
  }

  async query<TRow = Readonly<Record<string, unknown>>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<TRow>> {
    if (text.includes("SELECT count(*)::int AS count FROM core.businesses")) {
      return {
        rowCount: 1,
        rows: [{ count: this.#businesses.length }] as unknown as TRow[],
      };
    }
    if (text.includes("INSERT INTO core.businesses")) {
      this.#businesses.push({ id: String(values[0]), name: String(values[1]) });
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  }
}

class MockAuthDatabase implements RequestDatabase {
  constructor(
    readonly sessionRow: Record<string, unknown> | undefined,
    readonly terminals: Array<{
      code: string;
      id: string;
      location_id: string;
      location_name?: string;
      name: string;
    }> = [],
    readonly deviceRow?: Record<string, unknown> | undefined,
  ) {}

  async close(): Promise<void> {}

  async transaction<TResult>(
    operation: (executor: RequestDatabase) => Promise<TResult>,
  ): Promise<TResult> {
    return operation(this);
  }

  async query<TRow = Readonly<Record<string, unknown>>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<TRow>> {
    if (text.includes("FROM identity.sessions s")) {
      return {
        rowCount: this.sessionRow ? 1 : 0,
        rows: this.sessionRow ? [this.sessionRow as unknown as TRow] : [],
      };
    }
    if (text.includes("SELECT id, name FROM core.terminals")) {
      return {
        rowCount: this.terminals.length,
        rows: this.terminals as unknown as TRow[],
      };
    }
    if (text.includes("FROM core.terminals t")) {
      return {
        rowCount: this.terminals.length,
        rows: this.terminals as unknown as TRow[],
      };
    }
    if (text.includes("FROM core.terminals") && text.includes("WHERE")) {
      const terminalId = String(values[0]);
      const match = this.terminals.find((t) => t.id === terminalId);
      return {
        rowCount: match ? 1 : 0,
        rows: match ? [match as unknown as TRow] : [],
      };
    }
    if (text.includes("FROM identity.membership_roles")) {
      return {
        rowCount: 1,
        rows: [{ code: "workspace.pos.access", effect: null }] as unknown as TRow[],
      };
    }
    if (text.includes("FROM identity.devices WHERE id = $1")) {
      return {
        rowCount: this.deviceRow ? 1 : 0,
        rows: this.deviceRow ? [this.deviceRow as unknown as TRow] : [],
      };
    }
    if (text.includes("INSERT INTO identity.devices")) {
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("UPDATE identity.sessions")) {
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("INSERT INTO audit.audit_events")) {
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  }
}

describe("system health and baseline endpoints", () => {
  it("returns a minimal non-sensitive response", async () => {
    const response = await worker.fetch(
      new Request(`https://api.kastur.test${SYSTEM_HEALTH_PATH}`),
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("does not expose other routes", async () => {
    const response = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/unknown"),
      {},
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint tidak ditemukan.",
      },
    });
  });

  it("reports a clear runtime configuration error for database-backed routes", async () => {
    const response = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/auth/context"),
      {},
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "DATABASE_NOT_CONFIGURED",
        message: "Database API belum dikonfigurasi.",
      },
    });
  });

  it("responds to root /health endpoint with 200 ok", async () => {
    const response = await worker.fetch(
      new Request("https://api.kastur.test/health"),
      {},
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("responds to OPTIONS CORS preflight with 204 and CORS headers", async () => {
    const response = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/auth/context", {
        headers: { Origin: "http://localhost:5173" },
        method: "OPTIONS",
      }),
      {},
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("restricts CORS origin when ALLOWED_ORIGINS is configured", async () => {
    const environment = {
      ALLOWED_ORIGINS: "https://pos.kastur.app,https://backoffice.kastur.app",
    };

    const disallowed = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/unknown", {
        headers: { Origin: "https://evil.com" },
        method: "OPTIONS",
      }),
      environment,
    );
    expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();

    const allowed = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/unknown", {
        headers: { Origin: "https://pos.kastur.app" },
        method: "OPTIONS",
      }),
      environment,
    );
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://pos.kastur.app");
  });
});

describe("secure first-run setup endpoint", () => {
  it("rejects setup when KASTUR_SETUP_TOKEN is configured but missing in request", async () => {
    const database = new MockSetupDatabase();
    const environment = { KASTUR_SETUP_TOKEN: "super-secret-setup-key" };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({ business_name: "Toko Berkah" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      environment,
      { database },
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SETUP_UNAUTHORIZED");
  });

  it("rejects setup when wrong setup token is provided", async () => {
    const database = new MockSetupDatabase();
    const environment = { KASTUR_SETUP_TOKEN: "super-secret-setup-key" };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({
          business_name: "Toko Berkah",
          setup_token: "wrong-token",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      environment,
      { database },
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SETUP_UNAUTHORIZED");
  });

  it("succeeds when correct setup token is provided", async () => {
    const database = new MockSetupDatabase();
    const environment = { KASTUR_SETUP_TOKEN: "super-secret-setup-key" };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({
          business_name: "Toko Berkah",
          setup_token: "super-secret-setup-key",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      environment,
      { database },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      business_name: string;
      session_secret: string;
    };
    expect(body.business_name).toBe("Toko Berkah");
    expect(typeof body.session_secret).toBe("string");
    expect(body.session_secret.length).toBeGreaterThan(20);
  });

  it("rejects second initialization attempt with ALREADY_INITIALIZED", async () => {
    const database = new MockSetupDatabase([{ id: "biz-1", name: "Existing Biz" }]);
    const environment = { KASTUR_SETUP_TOKEN: "super-secret-setup-key" };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({
          business_name: "Toko Kedua",
          setup_token: "super-secret-setup-key",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      environment,
      { database },
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ALREADY_INITIALIZED");
  });

  it("exposes non-sensitive setup status including requires_setup_token flag", async () => {
    const database = new MockSetupDatabase();
    const environment = { KASTUR_SETUP_TOKEN: "configured-token" };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup/status"),
      environment,
      { database },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      initialized: boolean;
      requires_setup_token: boolean;
      status: string;
    };
    expect(body.initialized).toBe(false);
    expect(body.requires_setup_token).toBe(true);
    expect(body.status).toBe("NOT_INITIALIZED");
  });
});

describe("device authorization and terminal binding security", () => {
  const activeSessionRow = {
    authorization_version: "1",
    business_id: "11111111-1111-4111-8111-111111111111",
    default_location_id: "22222222-2222-4222-8222-222222222222",
    device_status: "ACTIVE",
    display_name: "Kasir 1",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    membership_id: "33333333-3333-4333-8333-333333333333",
    membership_status: "ACTIVE",
    primary_role: "CASHIER",
    session_device_id: "44444444-4444-4444-8444-444444444444",
    session_id: "55555555-5555-4555-8555-555555555555",
    user_id: "66666666-6666-4666-8666-666666666666",
    user_status: "ACTIVE",
  };

  const activeTerminal = {
    code: "POS-1",
    id: "77777777-7777-4777-8777-777777777777",
    location_id: "22222222-2222-4222-8222-222222222222",
    name: "Kasir 1",
  };

  it("rejects POS request when device ID does not match bound session device", async () => {
    const database = new MockAuthDatabase(activeSessionRow, [activeTerminal]);

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/context", {
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "X-Kastur-Client": "pos",
          "X-Kastur-Device-Id": "88888888-8888-4888-8888-888888888888",
        },
      }),
      {},
      { database },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DEVICE_CONTEXT_MISMATCH");
  });

  it("rejects POS request when device status is revoked", async () => {
    const revokedSession = {
      ...activeSessionRow,
      device_status: "REVOKED",
    };
    const database = new MockAuthDatabase(revokedSession, [activeTerminal]);

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/context", {
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "X-Kastur-Client": "pos",
          "X-Kastur-Device-Id": "44444444-4444-4444-8444-444444444444",
        },
      }),
      {},
      { database },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DEVICE_REVOKED");
  });

  it("rejects POS request without prior enrollment when session.device_id is null", async () => {
    const unboundSession = {
      ...activeSessionRow,
      session_device_id: null,
    };
    const database = new MockAuthDatabase(unboundSession, [activeTerminal]);

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/context", {
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "X-Kastur-Client": "pos",
          "X-Kastur-Device-Id": "44444444-4444-4444-8444-444444444444",
        },
      }),
      {},
      { database },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DEVICE_BINDING_REQUIRED");
  });

  it("requires explicit terminal selection when multiple active terminals exist", async () => {
    const multipleTerminals = [
      {
        code: "POS-1",
        id: "77777777-7777-4777-8777-777777777777",
        location_id: "22222222-2222-4222-8222-222222222222",
        name: "Kasir 1",
      },
      {
        code: "POS-2",
        id: "99999999-9999-4999-8999-999999999999",
        location_id: "22222222-2222-4222-8222-222222222222",
        name: "Kasir 2",
      },
    ];
    const database = new MockAuthDatabase(activeSessionRow, multipleTerminals);

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/context", {
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "X-Kastur-Client": "pos",
          "X-Kastur-Device-Id": "44444444-4444-4444-8444-444444444444",
        },
      }),
      {},
      { database },
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TERMINAL_SELECTION_REQUIRED");
  });

  it("allows explicit device enrollment through POST /api/v1/auth/enroll-device", async () => {
    const unboundOwnerSession = {
      ...activeSessionRow,
      primary_role: "OWNER",
      session_device_id: null,
    };
    const database = new MockAuthDatabase(unboundOwnerSession, [activeTerminal]);

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/enroll-device", {
        body: JSON.stringify({
          device_id: "33333333-3333-4333-8333-333333333333",
          device_name: "Tablet Kasir 1",
        }),
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "Content-Type": "application/json",
          "X-Kastur-Client": "pos",
        },
        method: "POST",
      }),
      {},
      { database },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      business_id: string;
      device_id: string;
      status: string;
    };
    expect(body.device_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(body.status).toBe("ACTIVE");
  });
});
