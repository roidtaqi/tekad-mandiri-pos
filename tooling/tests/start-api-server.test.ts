import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { handleRequest } from "../../apps/api/src/index.js";
import {
  buildApiEnvironment,
  createNodeHttpServer,
  defaultApiEntryPath,
} from "../scripts/start-api-server.mjs";

describe("Node Railway API environment bridge (start-api-server.mjs)", () => {
  it("resolves defaultApiEntryPath relative to script location, independent of process.cwd()", () => {
    expect(defaultApiEntryPath).toMatch(/apps\/api\/dist\/index\.js$/);
    expect(defaultApiEntryPath).not.toContain("apps/api/apps/api");
  });
  it("forwards all canonical ApiEnvironment variables from process.env", () => {
    const sourceEnv = {
      ALLOWED_ORIGINS: "https://pos.kastur.app,https://backoffice.kastur.app",
      DATABASE_URL: "postgres://user:pass@host:5432/db",
      KASTUR_SETUP_TOKEN: "secret-railway-setup-token",
      NODE_ENV: "production",
      OFFLINE_AUTH_SIGNING_KEY_ID: "key-1",
      OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK: "{\"kty\":\"EC\"}",
    };

    const env = buildApiEnvironment(sourceEnv);

    expect(env.ALLOWED_ORIGINS).toBe("https://pos.kastur.app,https://backoffice.kastur.app");
    expect(env.DATABASE_URL).toBe("postgres://user:pass@host:5432/db");
    expect(env.KASTUR_SETUP_TOKEN).toBe("secret-railway-setup-token");
    expect(env.NODE_ENV).toBe("production");
    expect(env.OFFLINE_AUTH_SIGNING_KEY_ID).toBe("key-1");
    expect(env.OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK).toBe("{\"kty\":\"EC\"}");
  });

  it("enforces KASTUR_SETUP_TOKEN through the real Node HTTP server boundary", async () => {
    const mockDb = {
      async close() {},
      async query(text: string) {
        if (text.includes("SELECT count(*)::int AS count FROM core.businesses")) {
          return { rowCount: 1, rows: [{ count: 0 }] };
        }
        return { rowCount: 1, rows: [] };
      },
      async transaction(op: (db: any) => Promise<any>) {
        return op(this);
      },
    };

    const serverEnv = {
      ALLOWED_ORIGINS: "https://pos.kastur.app",
      KASTUR_SETUP_TOKEN: "railway-production-secret-token",
      NODE_ENV: "production",
    };

    const server = createNodeHttpServer(handleRequest, serverEnv, { database: mockDb });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Missing setup token -> 401
      const missingTokenRes = await fetch(`${baseUrl}/api/v1/system/setup`, {
        body: JSON.stringify({ business_name: "Toko Berkah" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(missingTokenRes.status).toBe(401);
      const missingBody = (await missingTokenRes.json()) as { error: { code: string } };
      expect(missingBody.error.code).toBe("SETUP_UNAUTHORIZED");

      // 2. Wrong setup token -> 401
      const wrongTokenRes = await fetch(`${baseUrl}/api/v1/system/setup`, {
        body: JSON.stringify({
          business_name: "Toko Berkah",
          setup_token: "incorrect-token",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(wrongTokenRes.status).toBe(401);
      const wrongBody = (await wrongTokenRes.json()) as { error: { code: string } };
      expect(wrongBody.error.code).toBe("SETUP_UNAUTHORIZED");

      // 3. Correct setup token -> 201
      const correctTokenRes = await fetch(`${baseUrl}/api/v1/system/setup`, {
        body: JSON.stringify({
          business_name: "Toko Berkah",
          setup_token: "railway-production-secret-token",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(correctTokenRes.status).toBe(201);
      const correctBody = (await correctTokenRes.json()) as {
        business_name: string;
        session_secret: string;
      };
      expect(correctBody.business_name).toBe("Toko Berkah");
      expect(typeof correctBody.session_secret).toBe("string");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("enforces ALLOWED_ORIGINS through the real Node HTTP server boundary", async () => {
    const serverEnv = {
      ALLOWED_ORIGINS: "https://pos.kastur.app,https://backoffice.kastur.app",
      NODE_ENV: "production",
    };

    const server = createNodeHttpServer(handleRequest, serverEnv);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Disallowed origin on health check
      const disallowedRes = await fetch(`${baseUrl}/health`, {
        headers: { Origin: "https://evil.com" },
      });
      expect(disallowedRes.status).toBe(200);
      expect(disallowedRes.headers.get("access-control-allow-origin")).toBeNull();

      // 2. Allowed origin on health check
      const allowedRes = await fetch(`${baseUrl}/health`, {
        headers: { Origin: "https://pos.kastur.app" },
      });
      expect(allowedRes.status).toBe(200);
      expect(allowedRes.headers.get("access-control-allow-origin")).toBe("https://pos.kastur.app");

      // 3. Disallowed origin on 404 error path
      const disallowed404 = await fetch(`${baseUrl}/api/v1/unknown-endpoint`, {
        headers: { Origin: "https://evil.com" },
      });
      expect(disallowed404.status).toBe(404);
      expect(disallowed404.headers.get("access-control-allow-origin")).toBeNull();

      // 4. Allowed origin on 404 error path
      const allowed404 = await fetch(`${baseUrl}/api/v1/unknown-endpoint`, {
        headers: { Origin: "https://backoffice.kastur.app" },
      });
      expect(allowed404.status).toBe(404);
      expect(allowed404.headers.get("access-control-allow-origin")).toBe("https://backoffice.kastur.app");

      // 5. Allowed origin on OPTIONS preflight with x-kastur-setup-token
      const preflightRes = await fetch(`${baseUrl}/api/v1/system/setup`, {
        headers: {
          "Access-Control-Request-Headers": "content-type,x-kastur-setup-token",
          "Access-Control-Request-Method": "POST",
          Origin: "https://backoffice.kastur.app",
        },
        method: "OPTIONS",
      });
      expect(preflightRes.status).toBe(204);
      expect(preflightRes.headers.get("access-control-allow-origin")).toBe("https://backoffice.kastur.app");
      expect(preflightRes.headers.get("access-control-allow-headers")).toContain("x-kastur-setup-token");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

