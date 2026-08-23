import type {
  SyncBootstrapResponse,
  SyncPullResponse,
  SyncPushRequest,
} from "@kastur/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  HttpSyncGateway,
  SyncHttpError,
  classifySyncFailure,
  createBearerAuthProvider,
  createCookieSessionAuthProvider,
} from "../src/index.js";

type FetchInput = Parameters<typeof fetch>[0];

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function bootstrapResponse(): SyncBootstrapResponse {
  return {
    bootstrap_version: 1,
    server_time: "2026-08-23T00:00:00.000Z",
    business: { id: "business-1" },
    location: { id: "location-1" },
    terminal: { id: "terminal-1" },
    authorization: {
      user: { id: "user-1", display_name: "Kasir Satu" },
      membership: { business_id: "business-1", status: "ACTIVE" },
      primary_role: "CASHIER",
      permissions: ["pos.use"],
      authorization_version: 3,
      offline_valid_until: "2026-08-24T00:00:00.000Z",
      default_location_id: "location-1",
      server_time: "2026-08-23T00:00:00.000Z",
    },
    settings: {},
    products: [],
    product_units: [],
    barcodes: [],
    published_price_versions: [],
    published_price_tiers: [],
    promotions: [],
    payment_methods: [],
    stock_balances: [],
    sync_cursor: "10",
  };
}

function pushRequest(): SyncPushRequest {
  return {
    batch_id: "command-1",
    client_schema_version: 6,
    commands: [
      {
        command_id: "command-1",
        command_type: "sales.complete",
        occurred_at: "2026-08-23T00:00:00.000Z",
        location_id: "location-1",
        device_id: "device-1",
        authorization_version: 3,
        correlation_id: "correlation-1",
        payload: { transaction_id: "transaction-1" },
      },
    ],
  };
}

function makeGateway(fetchImplementation: typeof fetch, bearer = false): HttpSyncGateway {
  return new HttpSyncGateway({
    baseUrl: "https://kastur.example.test",
    client: "pos",
    clientVersion: "2.0.0",
    clientSchemaVersion: 6,
    deviceId: "device-1",
    authProvider: bearer
      ? createBearerAuthProvider(() => "rotating-session-token")
      : createCookieSessionAuthProvider(),
    fetch: fetchImplementation,
    createRequestId: () => "request-1",
  });
}

describe("HttpSyncGateway", () => {
  it("uses cookie credentials and a stable single-command idempotency key", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImplementation = vi.fn(
      async (input: FetchInput, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedInit = init;
        return jsonResponse({ accepted_commands: ["command-1"], rejected_commands: [] });
      },
    ) as typeof fetch;
    const gateway = makeGateway(fetchImplementation);

    const result = await gateway.push(pushRequest());

    expect(capturedUrl).toBe("https://kastur.example.test/api/v1/sync/push");
    expect(capturedInit?.credentials).toBe("include");
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("Idempotency-Key")).toBe("command-1");
    expect(headers.get("X-Kastur-Device-Id")).toBe("device-1");
    expect(result.accepted).toEqual([
      { command_id: "command-1", status: "ACCEPTED", warnings: [] },
    ]);
  });

  it("resolves bearer authorization per request and handles bootstrap, pull, and ack", async () => {
    const captured: Array<{ url: string; init: RequestInit | undefined }> = [];
    let tokenVersion = 0;
    const fetchImplementation = vi.fn(
      async (input: FetchInput, init?: RequestInit) => {
        captured.push({ url: String(input), init });
        const url = String(input);
        if (url.endsWith("/bootstrap")) return jsonResponse(bootstrapResponse());
        if (url.includes("/pull?")) {
          return jsonResponse({
            changes: [],
            next_cursor: "11",
            has_more: false,
            server_time: "2026-08-23T00:01:00.000Z",
          } satisfies SyncPullResponse);
        }
        return new Response(null, { status: 204 });
      },
    ) as typeof fetch;
    const gateway = new HttpSyncGateway({
      baseUrl: "https://kastur.example.test",
      client: "pos",
      clientVersion: "2.0.0",
      clientSchemaVersion: 6,
      deviceId: "device-1",
      authProvider: createBearerAuthProvider(() => `session-${++tokenVersion}`),
      fetch: fetchImplementation,
      createRequestId: () => `request-${tokenVersion}`,
    });

    expect((await gateway.bootstrap()).sync_cursor).toBe("10");
    expect(
      (
        await gateway.pull({ device_id: "device-1", cursor: "10", limit: 25 })
      ).next_cursor,
    ).toBe("11");
    await gateway.ack({ device_id: "device-1", last_applied_sequence: "11" });

    expect(captured.map(({ init }) => new Headers(init?.headers).get("Authorization"))).toEqual([
      "Bearer session-1",
      "Bearer session-2",
      "Bearer session-3",
    ]);
    expect(captured[1]?.url).toBe(
      "https://kastur.example.test/api/v1/sync/pull?cursor=10&limit=25",
    );
  });

  it("normalizes accepted-with-review and final rejection results", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({
        batch_id: "batch-1",
        results: [
          {
            command_id: "command-1",
            status: "ACCEPTED_WITH_REVIEW",
            warnings: [{ code: "AUTHORIZATION_STALE", severity: "WARNING" }],
          },
          {
            command_id: "command-2",
            status: "REJECTED_FINAL",
            error: { code: "UNSUPPORTED_SCHEMA", message: "Upgrade required." },
          },
        ],
      }),
    ) as typeof fetch;

    const result = await makeGateway(fetchImplementation).push({
      ...pushRequest(),
      batch_id: "batch-1",
      commands: [
        pushRequest().commands[0]!,
        { ...pushRequest().commands[0]!, command_id: "command-2" },
      ],
    });

    expect(result.accepted[0]).toEqual({
      command_id: "command-1",
      status: "ACCEPTED_WITH_REVIEW",
      warnings: [{ code: "AUTHORIZATION_STALE", severity: "WARNING" }],
    });
    expect(result.rejected[0]).toEqual({
      command_id: "command-2",
      status: "REJECTED_FINAL",
      error_code: "UNSUPPORTED_SCHEMA",
      message: "Upgrade required.",
    });
  });

  it("uses the controlled recovery endpoint after session/device rejection when every fact carries a grant", async () => {
    const urls: string[] = [];
    const fetchImplementation = vi.fn(async (input: FetchInput) => {
      urls.push(String(input));
      if (urls.length === 1) {
        return jsonResponse(
          { error: { code: "DEVICE_REVOKED", message: "Device revoked." } },
          { status: 403 },
        );
      }
      return jsonResponse({
        results: [
          {
            command_id: "command-1",
            status: "ACCEPTED_WITH_REVIEW",
            warnings: [{ code: "AUTHORIZATION_STALE_EXCEPTION" }],
          },
        ],
      });
    }) as typeof fetch;
    const request = pushRequest();
    request.commands[0]!.offline_authorization = {
      schema_version: 1,
      algorithm: "ECDSA_P256_SHA256",
      key_id: "offline-1",
      session_id: "session-1",
      device_id: "device-1",
      terminal_id: "terminal-1",
      issued_at: "2026-08-22T00:00:00.000Z",
      offline_valid_until: "2026-08-24T00:00:00.000Z",
      authorization: {
        user_id: "user-1",
        business_id: "business-1",
        primary_role: "CASHIER",
        permissions: ["workspace.pos.access", "transaction.complete"],
        authorization_version: 3,
        default_location_id: "location-1",
      },
      signature: "signed-proof",
    };

    const result = await makeGateway(fetchImplementation, true).push(request);

    expect(urls).toEqual([
      "https://kastur.example.test/api/v1/sync/push",
      "https://kastur.example.test/api/v1/sync/recovery-push",
    ]);
    expect(result.accepted[0]?.status).toBe("ACCEPTED_WITH_REVIEW");
  });

  it("classifies HTTP retryability and honors Retry-After", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: "TEMPORARY_UNAVAILABLE",
            message: "Try later.",
            retryable: true,
          },
        },
        { status: 503, headers: { "Retry-After": "7" } },
      ),
    ) as typeof fetch;

    let thrown: unknown;
    try {
      await makeGateway(fetchImplementation, true).push(pushRequest());
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SyncHttpError);
    expect(classifySyncFailure(thrown)).toEqual({
      retryable: true,
      errorCode: "TEMPORARY_UNAVAILABLE",
      message: "Try later.",
      minimumDelayMs: 7_000,
    });
  });

  it("rejects a request whose device differs from the gateway device", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const gateway = makeGateway(fetchImplementation);

    await expect(
      gateway.pull({ device_id: "other-device", cursor: "0" }),
    ).rejects.toThrow("does not match gateway device");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
