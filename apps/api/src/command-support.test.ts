import { describe, expect, it } from "vitest";

import type { AuthenticatedRequestContext } from "./auth.js";
import {
  executeIdempotent,
  type CommandIdentity,
} from "./command-support.js";
import type {
  RequestDatabase,
  SqlQueryResult,
} from "./database.js";

function context(userId: string): AuthenticatedRequestContext {
  return {
    authorization: {
      authorization_version: 1,
      default_location_id: "11111111-1111-4111-8111-111111111111",
      membership: {
        business_id: "22222222-2222-4222-8222-222222222222",
        status: "ACTIVE",
      },
      offline_valid_until: "2099-01-01T00:00:00.000Z",
      permissions: ["product.create"],
      primary_role: "OWNER",
      server_time: "2026-08-23T00:00:00.000Z",
      user: { display_name: "Owner", id: userId },
    },
    device_id: null,
    membership_id: "33333333-3333-4333-8333-333333333333",
    selected_terminal_id: null,
    session_id: "44444444-4444-4444-8444-444444444444",
  };
}

class IdempotencyMemoryDatabase implements RequestDatabase {
  #record: {
    request_hash: string;
    response_payload: unknown;
    status: string;
  } | null = null;

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
    if (text.includes("INSERT INTO sync.idempotency_records")) {
      if (this.#record !== null) return { rowCount: 0, rows: [] };
      this.#record = {
        request_hash: String(values[3]),
        response_payload: null,
        status: "PROCESSING",
      };
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("SELECT request_hash")) {
      return {
        rowCount: this.#record === null ? 0 : 1,
        rows: this.#record === null ? [] : [this.#record as TRow],
      };
    }
    if (text.includes("UPDATE sync.idempotency_records")) {
      if (this.#record === null) throw new Error("Missing in-memory idempotency record.");
      this.#record = {
        ...this.#record,
        response_payload: JSON.parse(String(values[3])) as unknown,
        status: "COMPLETED",
      };
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${text}`);
  }
}

function command(correlationId: string, occurredAt: string): CommandIdentity {
  return {
    command_id: "55555555-5555-4555-8555-555555555555",
    command_type: "catalog.product.create",
    correlation_id: correlationId,
    location_id: null,
    occurred_at: occurredAt,
  };
}

describe("server idempotency fingerprint", () => {
  it("replays a direct HTTP command when only server-assigned metadata changes", async () => {
    const database = new IdempotencyMemoryDatabase();
    const payload = { name: "Kopi", product_id: "product-1" };
    const fingerprint = {
      command_id: "55555555-5555-4555-8555-555555555555",
      command_type: "catalog.product.create",
      payload,
    };
    let operations = 0;

    const first = await executeIdempotent(
      database,
      context("66666666-6666-4666-8666-666666666666"),
      command("77777777-7777-4777-8777-777777777777", "2026-08-23T00:00:00.000Z"),
      payload,
      async () => ({ product_id: "product-1" }),
      fingerprint,
    );
    operations += first.replayed ? 0 : 1;
    const retry = await executeIdempotent(
      database,
      context("66666666-6666-4666-8666-666666666666"),
      command("88888888-8888-4888-8888-888888888888", "2026-08-23T00:01:00.000Z"),
      payload,
      async () => {
        operations += 1;
        return { product_id: "unexpected" };
      },
      fingerprint,
    );

    expect(first).toEqual({ replayed: false, result: { product_id: "product-1" } });
    expect(retry).toEqual({ replayed: true, result: { product_id: "product-1" } });
    expect(operations).toBe(1);
  });

  it("does not expose an existing command result to another actor", async () => {
    const database = new IdempotencyMemoryDatabase();
    const original = command(
      "77777777-7777-4777-8777-777777777777",
      "2026-08-23T00:00:00.000Z",
    );
    await executeIdempotent(
      database,
      context("66666666-6666-4666-8666-666666666666"),
      original,
      { value: "same" },
      async () => ({ secret: "business-result" }),
    );

    await expect(
      executeIdempotent(
        database,
        context("99999999-9999-4999-8999-999999999999"),
        original,
        { value: "same" },
        async () => ({ secret: "unexpected" }),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSE_ERROR" });
  });
});
