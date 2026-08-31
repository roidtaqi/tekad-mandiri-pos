import { SYSTEM_HEALTH_PATH } from "@kastur/contracts";
import { describe, expect, it } from "vitest";

import type { RequestDatabase, SqlQueryResult } from "./database.js";
import { handleRequest } from "./index.js";
import worker from "./index";
import { hashPassword } from "./password.js";

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

  it("accepts OPTIONS CORS preflight requesting x-kastur-setup-token header", async () => {
    const environment = {
      ALLOWED_ORIGINS: "https://backoffice.kastur.app",
    };

    const response = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        headers: {
          "Access-Control-Request-Headers": "content-type,x-kastur-setup-token",
          "Access-Control-Request-Method": "POST",
          Origin: "https://backoffice.kastur.app",
        },
        method: "OPTIONS",
      }),
      environment,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://backoffice.kastur.app",
    );
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "x-kastur-setup-token",
    );
  });

  it("accepts realistic browser OPTIONS CORS preflight for POS sync bootstrap and push requests", async () => {
    const environment = {
      ALLOWED_ORIGINS: "https://pos.kastur.app",
    };

    // 1. Preflight for GET /api/v1/sync/bootstrap
    const bootstrapPreflight = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/sync/bootstrap", {
        headers: {
          "Access-Control-Request-Headers":
            "authorization, x-kastur-client, x-kastur-client-version, x-kastur-schema-version, x-kastur-device-id, x-request-id, x-terminal-id",
          "Access-Control-Request-Method": "GET",
          Origin: "https://pos.kastur.app",
        },
        method: "OPTIONS",
      }),
      environment,
    );

    expect(bootstrapPreflight.status).toBe(204);
    expect(bootstrapPreflight.headers.get("access-control-allow-origin")).toBe(
      "https://pos.kastur.app",
    );
    expect(bootstrapPreflight.headers.get("access-control-allow-credentials")).toBe("true");
    const allowedHeaders = bootstrapPreflight.headers.get("access-control-allow-headers") ?? "";
    expect(allowedHeaders).toContain("authorization");
    expect(allowedHeaders).toContain("x-kastur-client");
    expect(allowedHeaders).toContain("x-kastur-client-version");
    expect(allowedHeaders).toContain("x-kastur-schema-version");
    expect(allowedHeaders).toContain("x-kastur-device-id");
    expect(allowedHeaders).toContain("x-request-id");
    expect(allowedHeaders).toContain("x-terminal-id");
    expect(allowedHeaders).toContain("idempotency-key");

    // 2. Preflight for POST /api/v1/sync/push
    const pushPreflight = await worker.fetch(
      new Request("https://api.kastur.test/api/v1/sync/push", {
        headers: {
          "Access-Control-Request-Headers":
            "content-type, authorization, idempotency-key, x-kastur-client, x-kastur-client-version, x-kastur-schema-version, x-kastur-device-id, x-request-id",
          "Access-Control-Request-Method": "POST",
          Origin: "https://pos.kastur.app",
        },
        method: "OPTIONS",
      }),
      environment,
    );

    expect(pushPreflight.status).toBe(204);
    expect(pushPreflight.headers.get("access-control-allow-origin")).toBe(
      "https://pos.kastur.app",
    );
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

  it("succeeds when correct setup token and valid password are provided", async () => {
    const database = new MockSetupDatabase();
    const environment = { KASTUR_SETUP_TOKEN: "super-secret-setup-key" };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({
          business_name: "Toko Berkah",
          owner_password: "ValidPassword123!",
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
      session_secret?: string;
    };
    expect(body.business_name).toBe("Toko Berkah");
    expect(body.session_secret).toBeUndefined(); // default setup omits session_secret
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("kastur_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=None");
    expect(setCookie).toContain("Secure");
  });

  it("rejects setup when owner_password is missing or shorter than 8 characters", async () => {
    const database = new MockSetupDatabase();

    // 1. Missing password
    const missingPassword = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({
          business_name: "Toko Berkah",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {},
      { database },
    );
    expect(missingPassword.status).toBe(400);
    const missingBody = (await missingPassword.json()) as { error: { code: string } };
    expect(missingBody.error.code).toBe("VALIDATION_ERROR");

    // 2. Short password (< 8 chars)
    const shortPassword = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({
          business_name: "Toko Berkah",
          owner_password: "short",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {},
      { database },
    );
    expect(shortPassword.status).toBe(400);
    const shortBody = (await shortPassword.json()) as { error: { code: string } };
    expect(shortBody.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects second initialization attempt with ALREADY_INITIALIZED", async () => {
    const database = new MockSetupDatabase([{ id: "biz-1", name: "Existing Biz" }]);
    const environment = { KASTUR_SETUP_TOKEN: "super-secret-setup-key" };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({
          business_name: "Toko Kedua",
          owner_password: "ValidPassword123!",
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

  it("fails closed in production if KASTUR_SETUP_TOKEN is missing", async () => {
    const database = new MockSetupDatabase();
    const environment = { NODE_ENV: "production" };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({ business_name: "Toko Berkah", owner_password: "ValidPassword123!" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      environment,
      { database },
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SETUP_DISABLED");
  });

  it("does not create a phantom device during first-run business setup", async () => {
    const queries: string[] = [];
    const database: RequestDatabase = {
      async close() {},
      async query<TRow = Readonly<Record<string, unknown>>>(
        text: string,
      ): Promise<SqlQueryResult<TRow>> {
        queries.push(text);
        if (text.includes("SELECT count(*)::int AS count FROM core.businesses")) {
          return { rowCount: 1, rows: [{ count: 0 }] as unknown as TRow[] };
        }
        return { rowCount: 1, rows: [] };
      },
      async transaction<TResult>(
        operation: (executor: RequestDatabase) => Promise<TResult>,
      ): Promise<TResult> {
        return operation(this);
      },
    };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({ business_name: "Toko Baru", owner_password: "ValidPassword123!" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {},
      { database },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.device_id).toBeUndefined();
    // Default / Back Office setup response must NOT contain session_secret
    expect(body.session_secret).toBeUndefined();
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("kastur_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=None");
    expect(setCookie).toContain("Secure");

    // Verify no insert into identity.devices occurred
    expect(queries.some((q) => q.includes("INSERT INTO identity.devices"))).toBe(false);

    // Verify category insert uses canonical schema without code column
    const categoryQuery = queries.find((q) => q.includes("INSERT INTO catalog.categories"));
    expect(categoryQuery).toBeDefined();
    expect(categoryQuery).toContain("(id, business_id, name, status)");
    expect(categoryQuery).not.toContain("code");
  });

  it("returns session_secret in first-run business setup when requested by POS client", async () => {
    const database: RequestDatabase = {
      async close() {},
      async query<TRow = Readonly<Record<string, unknown>>>(
        text: string,
      ): Promise<SqlQueryResult<TRow>> {
        if (text.includes("SELECT count(*)::int AS count FROM core.businesses")) {
          return { rowCount: 1, rows: [{ count: 0 }] as unknown as TRow[] };
        }
        return { rowCount: 1, rows: [] };
      },
      async transaction<TResult>(
        operation: (executor: RequestDatabase) => Promise<TResult>,
      ): Promise<TResult> {
        return operation(this);
      },
    };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/system/setup", {
        body: JSON.stringify({
          business_name: "Toko POS",
          client: "pos",
          owner_password: "ValidPassword123!",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {},
      { database },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.session_secret).toBe("string");
    expect((body.session_secret as string).length).toBeGreaterThan(20);
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

  const terminal2 = {
    code: "POS-2",
    id: "99999999-9999-4999-8999-999999999999",
    location_id: "22222222-2222-4222-8222-222222222222",
    name: "Kasir 2",
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
    const multipleTerminals = [activeTerminal, terminal2];
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

  it("allows terminal discovery with unbound session, followed by device enrollment and terminal selection", async () => {
    const freshDeviceId = "33333333-3333-4333-8333-333333333333";
    const multipleTerminals = [activeTerminal, terminal2];
    let currentSession: Record<string, unknown> = {
      ...activeSessionRow,
      primary_role: "OWNER",
      session_device_id: null,
    };
    let registeredDevice: Record<string, unknown> | undefined;

    const dynamicDatabase: RequestDatabase = {
      async close() {},
      async query<TRow = Readonly<Record<string, unknown>>>(
        text: string,
        values: readonly unknown[] = [],
      ): Promise<SqlQueryResult<TRow>> {
        if (text.includes("FROM identity.sessions s")) {
          return { rowCount: 1, rows: [currentSession as unknown as TRow] };
        }
        if (text.includes("SELECT t.id, t.name, t.code, t.status, t.location_id, l.name AS location_name")) {
          return { rowCount: multipleTerminals.length, rows: multipleTerminals as unknown as TRow[] };
        }
        if (text.includes("FROM core.terminals") && text.includes("WHERE")) {
          const terminalId = String(values[0]);
          const match = multipleTerminals.find((t) => t.id === terminalId);
          return { rowCount: match ? 1 : 0, rows: match ? [match as unknown as TRow] : [] };
        }
        if (text.includes("FROM identity.membership_roles")) {
          return {
            rowCount: 1,
            rows: [{ code: "workspace.pos.access", effect: null }] as unknown as TRow[],
          };
        }
        if (text.includes("FROM identity.devices WHERE id = $1")) {
          return {
            rowCount: registeredDevice ? 1 : 0,
            rows: registeredDevice ? [registeredDevice as unknown as TRow] : [],
          };
        }
        if (text.includes("INSERT INTO identity.devices")) {
          registeredDevice = {
            business_id: activeSessionRow.business_id,
            id: values[0],
            status: "ACTIVE",
          };
          return { rowCount: 1, rows: [] };
        }
        if (text.includes("UPDATE identity.sessions SET device_id")) {
          currentSession = {
            ...currentSession,
            device_status: "ACTIVE",
            session_device_id: values[0],
          };
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 1, rows: [] };
      },
      async transaction<TResult>(
        operation: (executor: RequestDatabase) => Promise<TResult>,
      ): Promise<TResult> {
        return operation(this);
      },
    };

    // Step 1: Terminal discovery before device enrollment must NOT deadlock
    const termDiscoveryResponse = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/terminals", {
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "X-Kastur-Client": "pos",
        },
      }),
      {},
      { database: dynamicDatabase },
    );
    expect(termDiscoveryResponse.status).toBe(200);
    const termsBody = (await termDiscoveryResponse.json()) as {
      data: Array<{ id: string; name: string }>;
    };
    expect(termsBody.data.length).toBe(2);
    expect(termsBody.data[1]?.name).toBe("Kasir 2");

    // Step 2: Enroll device
    const enrollResponse = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/enroll-device", {
        body: JSON.stringify({
          device_id: freshDeviceId,
          device_name: "Tablet Kasir 2",
        }),
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "Content-Type": "application/json",
          "X-Kastur-Client": "pos",
        },
        method: "POST",
      }),
      {},
      { database: dynamicDatabase },
    );
    expect(enrollResponse.status).toBe(201);

    // Step 3: Context resolution with selected terminal Kasir 2 succeeds!
    const contextResponse = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/context", {
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "X-Kastur-Client": "pos",
          "X-Kastur-Device-Id": freshDeviceId,
          "X-Terminal-Id": terminal2.id,
        },
      }),
      {},
      { database: dynamicDatabase },
    );
    expect(contextResponse.status).toBe(200);
  });

  it("enrolls a new device using canonical schema, binds session, and writes audit event", async () => {
    const freshDeviceId = "55555555-5555-4555-8555-555555555555";
    const queries: Array<{ text: string; values: readonly unknown[] }> = [];

    const dynamicDatabase: RequestDatabase = {
      async close() {},
      async query<TRow = Readonly<Record<string, unknown>>>(
        text: string,
        values: readonly unknown[] = [],
      ): Promise<SqlQueryResult<TRow>> {
        queries.push({ text, values });
        if (text.includes("FROM identity.sessions s")) {
          return {
            rowCount: 1,
            rows: [{ ...activeSessionRow, session_device_id: null }] as unknown as TRow[],
          };
        }
        if (text.includes("FROM identity.membership_roles")) {
          return {
            rowCount: 1,
            rows: [{ code: "workspace.pos.access", effect: null }] as unknown as TRow[],
          };
        }
        if (text.includes("FROM identity.devices WHERE id = $1")) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 1, rows: [] };
      },
      async transaction<TResult>(
        operation: (executor: RequestDatabase) => Promise<TResult>,
      ): Promise<TResult> {
        return operation(this);
      },
    };

    const enrollResponse = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/enroll-device", {
        body: JSON.stringify({
          device_id: freshDeviceId,
          device_name: "Tablet Kasir Utama",
        }),
        headers: {
          Authorization: "Bearer mock-session-token-32-chars-long",
          "Content-Type": "application/json",
          "X-Kastur-Client": "pos",
        },
        method: "POST",
      }),
      {},
      { database: dynamicDatabase },
    );
    expect(enrollResponse.status).toBe(201);
    const enrollBody = (await enrollResponse.json()) as { device_id: string; status: string };
    expect(enrollBody.device_id).toBe(freshDeviceId);
    expect(enrollBody.status).toBe("ACTIVE");

    // 1. Verify INSERT INTO identity.devices query conforms to canonical schema
    const deviceInsert = queries.find((q) => q.text.includes("INSERT INTO identity.devices"));
    expect(deviceInsert).toBeDefined();
    expect(deviceInsert?.text).toContain(
      "INSERT INTO identity.devices (id, business_id, device_key, name, platform, status)",
    );
    expect(deviceInsert?.text).not.toContain("code");
    expect(deviceInsert?.text).not.toContain("display_name");
    expect(deviceInsert?.text).not.toContain("device_type");
    expect(deviceInsert?.values).toEqual([
      freshDeviceId,
      activeSessionRow.business_id,
      freshDeviceId,
      "Tablet Kasir Utama",
    ]);

    // 2. Verify UPDATE identity.sessions binds session to device
    const sessionUpdate = queries.find((q) => q.text.includes("UPDATE identity.sessions SET device_id"));
    expect(sessionUpdate).toBeDefined();
    expect(sessionUpdate?.values[0]).toBe(freshDeviceId);

    // 3. Verify DEVICE_ENROLLED audit event
    const auditInsert = queries.find((q) => q.text.includes("INSERT INTO audit.audit_events"));
    expect(auditInsert).toBeDefined();
    expect(auditInsert?.text).toContain("DEVICE_ENROLLED");
    const afterData = JSON.parse(String(auditInsert?.values[7])) as Record<string, unknown>;
    expect(afterData.device_key).toBe(freshDeviceId);
    expect(afterData.device_name).toBe("Tablet Kasir Utama");
    expect(afterData.platform).toBe("PWA");
  });

  it("rejects device enrollment when device is registered to another business", async () => {
    const database: RequestDatabase = {
      async close() {},
      async query<TRow = Readonly<Record<string, unknown>>>(
        text: string,
      ): Promise<SqlQueryResult<TRow>> {
        if (text.includes("FROM identity.sessions s")) {
          return { rowCount: 1, rows: [activeSessionRow as unknown as TRow] };
        }
        if (text.includes("FROM identity.membership_roles")) {
          return { rowCount: 1, rows: [{ code: "workspace.pos.access", effect: null }] as unknown as TRow[] };
        }
        if (text.includes("FROM identity.devices WHERE id = $1")) {
          return {
            rowCount: 1,
            rows: [{ business_id: "other-business-uuid", status: "ACTIVE" }] as unknown as TRow[],
          };
        }
        return { rowCount: 1, rows: [] };
      },
      async transaction<TResult>(op: (db: RequestDatabase) => Promise<TResult>): Promise<TResult> {
        return op(this);
      },
    };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/enroll-device", {
        body: JSON.stringify({
          device_id: "66666666-6666-4666-8666-666666666666",
          device_name: "Alien Tablet",
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
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CROSS_BUSINESS_DEVICE_FORBIDDEN");
  });

  it("rejects device enrollment when existing device status is revoked", async () => {
    const database: RequestDatabase = {
      async close() {},
      async query<TRow = Readonly<Record<string, unknown>>>(
        text: string,
      ): Promise<SqlQueryResult<TRow>> {
        if (text.includes("FROM identity.sessions s")) {
          return { rowCount: 1, rows: [activeSessionRow as unknown as TRow] };
        }
        if (text.includes("FROM identity.membership_roles")) {
          return { rowCount: 1, rows: [{ code: "workspace.pos.access", effect: null }] as unknown as TRow[] };
        }
        if (text.includes("FROM identity.devices WHERE id = $1")) {
          return {
            rowCount: 1,
            rows: [{ business_id: activeSessionRow.business_id, status: "REVOKED" }] as unknown as TRow[],
          };
        }
        return { rowCount: 1, rows: [] };
      },
      async transaction<TResult>(op: (db: RequestDatabase) => Promise<TResult>): Promise<TResult> {
        return op(this);
      },
    };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/enroll-device", {
        body: JSON.stringify({
          device_id: "77777777-7777-4777-8777-777777777777",
          device_name: "Revoked Tablet",
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
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DEVICE_REVOKED");
  });

  it("safely reuses existing active device for same business without re-inserting", async () => {
    const queries: string[] = [];
    const database: RequestDatabase = {
      async close() {},
      async query<TRow = Readonly<Record<string, unknown>>>(
        text: string,
      ): Promise<SqlQueryResult<TRow>> {
        queries.push(text);
        if (text.includes("FROM identity.sessions s")) {
          return { rowCount: 1, rows: [{ ...activeSessionRow, session_device_id: null }] as unknown as TRow[] };
        }
        if (text.includes("FROM identity.membership_roles")) {
          return { rowCount: 1, rows: [{ code: "workspace.pos.access", effect: null }] as unknown as TRow[] };
        }
        if (text.includes("FROM identity.devices WHERE id = $1")) {
          return {
            rowCount: 1,
            rows: [{ business_id: activeSessionRow.business_id, status: "ACTIVE" }] as unknown as TRow[],
          };
        }
        return { rowCount: 1, rows: [] };
      },
      async transaction<TResult>(op: (db: RequestDatabase) => Promise<TResult>): Promise<TResult> {
        return op(this);
      },
    };

    const response = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/enroll-device", {
        body: JSON.stringify({
          device_id: "88888888-8888-4888-8888-888888888888",
          device_name: "Existing Tablet",
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
    // Verify no INSERT query was made into identity.devices
    expect(queries.some((q) => q.includes("INSERT INTO identity.devices"))).toBe(false);
    // Verify session was bound
    expect(queries.some((q) => q.includes("UPDATE identity.sessions SET device_id"))).toBe(true);
  });

  it("applies configured ALLOWED_ORIGINS to error responses", async () => {
    const environment = {
      ALLOWED_ORIGINS: "https://pos.kastur.app",
    };

    const disallowed = await handleRequest(
      new Request("https://api.kastur.test/api/v1/nonexistent", {
        headers: { Origin: "https://evil.com" },
      }),
      environment,
    );
    expect(disallowed.status).toBe(404);
    expect(disallowed.headers.get("access-control-allow-origin")).toBeNull();

    const allowed = await handleRequest(
      new Request("https://api.kastur.test/api/v1/nonexistent", {
        headers: { Origin: "https://pos.kastur.app" },
      }),
      environment,
    );
    expect(allowed.status).toBe(404);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://pos.kastur.app");
  });

  it("verifies live database connectivity via /api/v1/system/health and /health/ready", async () => {
    const healthyDatabase: RequestDatabase = {
      async close() {},
      async query<TRow = Readonly<Record<string, unknown>>>(): Promise<SqlQueryResult<TRow>> {
        return { rowCount: 1, rows: [{ ready: 1 }] as unknown as TRow[] };
      },
      async transaction<TResult>(op: (db: RequestDatabase) => Promise<TResult>): Promise<TResult> {
        return op(this);
      },
    };

    const healthyResponse = await handleRequest(
      new Request("https://api.kastur.test/health/ready"),
      { DATABASE_URL: "postgres://mock" },
      { database: healthyDatabase },
    );
    expect(healthyResponse.status).toBe(200);
    await expect(healthyResponse.json()).resolves.toEqual({ status: "ok" });

    const brokenDatabase: RequestDatabase = {
      async close() {},
      async query(): Promise<never> {
        throw new Error("Connection refused");
      },
      async transaction<TResult>(op: (db: RequestDatabase) => Promise<TResult>): Promise<TResult> {
        return op(this);
      },
    };

    const brokenResponse = await handleRequest(
      new Request("https://api.kastur.test/health/ready"),
      { DATABASE_URL: "postgres://mock" },
      { database: brokenDatabase },
    );
    expect(brokenResponse.status).toBe(503);
    const body = (await brokenResponse.json()) as { reason: string; status: string };
    expect(body.status).toBe("unhealthy");
    expect(body.reason).toBe("DATABASE_UNAVAILABLE");
  });

  it("authenticates active users via POST /api/v1/auth/login, sets session cookie, and allows logout", async () => {
    const hashedPassword = await hashPassword("ValidPassword123!");

    const users: Array<Record<string, unknown>> = [
      {
        algorithm: hashedPassword.algorithm,
        business_id: "biz-1",
        default_location_id: "loc-1",
        display_name: "Owner Test",
        email: "owner@kastur.local",
        iterations: hashedPassword.iterations,
        membership_status: "ACTIVE",
        password_hash: hashedPassword.hash,
        password_salt: hashedPassword.salt,
        primary_role: "OWNER",
        user_id: "user-1",
        user_status: "ACTIVE",
      },
      {
        algorithm: hashedPassword.algorithm,
        business_id: "biz-2",
        default_location_id: "loc-2",
        display_name: "Inactive User",
        email: "inactive@kastur.local",
        iterations: hashedPassword.iterations,
        membership_status: "INACTIVE",
        password_hash: hashedPassword.hash,
        password_salt: hashedPassword.salt,
        primary_role: "CASHIER",
        user_id: "user-2",
        user_status: "ACTIVE",
      },
    ];

    class MockLoginDatabase implements RequestDatabase {
      #sessions: Array<Record<string, unknown>> = [];

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
        if (text.includes("FROM identity.users u") && text.includes("JOIN identity.password_credentials pc")) {
          const email = String(values[0]).toLowerCase();
          const match = users.find((u) => String(u.email).toLowerCase() === email);
          return {
            rowCount: match ? 1 : 0,
            rows: match ? [match as unknown as TRow] : [],
          };
        }
        if (text.includes("INSERT INTO identity.sessions")) {
          this.#sessions.push({ id: values[0], user_id: values[1], session_secret_hash: values[3] });
          return { rowCount: 1, rows: [] };
        }
        if (text.includes("INSERT INTO audit.audit_events")) {
          return { rowCount: 1, rows: [] };
        }
        if (text.includes("UPDATE identity.sessions SET revoked_at = CURRENT_TIMESTAMP")) {
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 1, rows: [] };
      }
    }

    const db = new MockLoginDatabase();

    // 1. Successful Login
    const validLogin = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/login", {
        body: JSON.stringify({
          client: "pos",
          email: "owner@kastur.local",
          password: "ValidPassword123!",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      { ALLOWED_ORIGINS: "https://pos.kastur.app" },
      { database: db },
    );

    expect(validLogin.status).toBe(200);
    const loginData = (await validLogin.json()) as {
      readonly data: {
        readonly business_id: string;
        readonly session_secret: string;
        readonly user: { readonly id: string; readonly display_name: string };
      };
    };
    expect(loginData.data.business_id).toBe("biz-1");
    expect(loginData.data.user.display_name).toBe("Owner Test");
    expect(typeof loginData.data.session_secret).toBe("string");
    expect(loginData.data.session_secret.length).toBeGreaterThan(20);

    const setCookie = validLogin.headers.get("set-cookie");
    expect(setCookie).toContain(`kastur_session=${loginData.data.session_secret}`);
    expect(setCookie).toContain("HttpOnly");

    // 1a. Successful Login for Back Office (omits session_secret from body, sets HttpOnly cookie)
    const backofficeLogin = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/login", {
        body: JSON.stringify({
          client: "backoffice",
          email: "owner@kastur.local",
          password: "ValidPassword123!",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      { ALLOWED_ORIGINS: "https://backoffice.kastur.app" },
      { database: db },
    );

    expect(backofficeLogin.status).toBe(200);
    const boData = (await backofficeLogin.json()) as {
      readonly data: {
        readonly business_id: string;
        readonly session_secret?: string;
        readonly user: { readonly id: string; readonly display_name: string };
      };
    };
    expect(boData.data.business_id).toBe("biz-1");
    expect(boData.data.user.display_name).toBe("Owner Test");
    expect(boData.data.session_secret).toBeUndefined(); // Back Office JS must NEVER receive session_secret

    const boCookie = backofficeLogin.headers.get("set-cookie");
    expect(boCookie).toContain("kastur_session=");
    expect(boCookie).toContain("HttpOnly");
    expect(boCookie).toContain("SameSite=None");
    expect(boCookie).toContain("Secure");

    // 2. Wrong Password -> 401
    const wrongPassword = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/login", {
        body: JSON.stringify({
          email: "owner@kastur.local",
          password: "WrongPassword!",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {},
      { database: db },
    );
    expect(wrongPassword.status).toBe(401);

    // 3. Unknown User -> 401
    const unknownUser = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/login", {
        body: JSON.stringify({
          email: "nonexistent@kastur.local",
          password: "AnyPassword123!",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {},
      { database: db },
    );
    expect(unknownUser.status).toBe(401);

    // 4. Inactive Membership -> 403
    const inactiveUser = await handleRequest(
      new Request("https://api.kastur.test/api/v1/auth/login", {
        body: JSON.stringify({
          email: "inactive@kastur.local",
          password: "ValidPassword123!",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
      {},
      { database: db },
    );
    expect(inactiveUser.status).toBe(403);
  });
});
