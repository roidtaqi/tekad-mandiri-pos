import type {
  SyncAckRequest,
  SyncBootstrapResponse,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
} from "@kastur/contracts";
import { describe, expect, it } from "vitest";

import {
  SyncOrchestrator,
  SyncProtocolError,
  SyncTransportError,
  classifySyncFailure,
  type ClaimPushCandidatesInput,
  type LocalCommandResolution,
  type LocalSyncCommand,
  type LocalSyncStore,
  type RetryPolicy,
  type SyncGateway,
  type SyncPushBatchResult,
  type SyncStoreContext,
} from "../src/index.js";

function makeCommand(commandId: string): LocalSyncCommand {
  return {
    command_id: commandId,
    command_type: "sales.complete",
    occurred_at: "2026-08-23T00:00:00.000Z",
    location_id: "location-1",
    device_id: "device-1",
    authorization_version: 4,
    correlation_id: `correlation-${commandId}`,
    payload: { transaction_id: `transaction-${commandId}` },
    business_id: "business-1",
    attempt_count: 0,
  };
}

function makeBootstrap(cursor = "10"): SyncBootstrapResponse {
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
      authorization_version: 4,
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
    sync_cursor: cursor,
  };
}

class MemorySyncStore implements LocalSyncStore {
  readonly resolutions = new Map<string, LocalCommandResolution>();
  readonly attempts = new Map<string, number>();
  readonly leases = new Map<string, string>();
  readonly appliedChanges: unknown[] = [];
  bootstrap: SyncBootstrapResponse | undefined;
  failPullApply = false;
  cursor = "0";

  constructor(readonly commands: readonly LocalSyncCommand[]) {}

  async claimPushCandidates(
    input: ClaimPushCandidatesInput,
  ): Promise<readonly LocalSyncCommand[]> {
    const eligible = this.commands.filter((command) => {
      const resolution = this.resolutions.get(command.command_id);
      if (
        resolution !== undefined &&
        resolution.state !== "FAILED_RETRYABLE"
      ) {
        return false;
      }
      if (
        resolution?.state === "FAILED_RETRYABLE" &&
        resolution.next_attempt_at > input.claimed_at
      ) {
        return false;
      }
      const lease = this.leases.get(command.command_id);
      return lease === undefined || lease <= input.claimed_at;
    });

    return eligible.slice(0, input.limit).map((command) => {
      const attemptCount = (this.attempts.get(command.command_id) ?? 0) + 1;
      this.attempts.set(command.command_id, attemptCount);
      this.leases.set(command.command_id, input.lease_expires_at);
      return { ...command, attempt_count: attemptCount };
    });
  }

  async resolveCommandAtomically(
    commandId: string,
    resolution: LocalCommandResolution,
  ): Promise<void> {
    this.resolutions.set(commandId, resolution);
    this.leases.delete(commandId);
  }

  async getPullCursor(_context: SyncStoreContext): Promise<string> {
    return this.cursor;
  }

  async applyPullAtomically(
    _context: SyncStoreContext,
    response: SyncPullResponse,
  ): Promise<void> {
    if (this.failPullApply) throw new Error("local apply failed");
    this.appliedChanges.push(...response.changes);
    this.cursor = response.next_cursor;
  }

  async applyBootstrapAtomically(
    _context: SyncStoreContext,
    response: SyncBootstrapResponse,
  ): Promise<void> {
    this.bootstrap = response;
    this.cursor = response.sync_cursor;
  }
}

interface GatewayHandlers {
  bootstrap?: () => Promise<SyncBootstrapResponse>;
  push?: (request: SyncPushRequest) => Promise<SyncPushBatchResult>;
  pull?: (request: SyncPullRequest) => Promise<SyncPullResponse>;
  ack?: (request: SyncAckRequest) => Promise<void>;
}

function makeGateway(handlers: GatewayHandlers = {}): SyncGateway {
  return {
    bootstrap: handlers.bootstrap ?? (async () => makeBootstrap()),
    push:
      handlers.push ??
      (async (request) => ({
        accepted: request.commands.map((command) => ({
          command_id: command.command_id,
          status: "ACCEPTED" as const,
          warnings: [],
        })),
        rejected: [],
      })),
    pull:
      handlers.pull ??
      (async (request) => ({
        changes: [],
        next_cursor: request.cursor,
        has_more: false,
        server_time: "2026-08-23T00:00:00.000Z",
      })),
    ack: handlers.ack ?? (async () => undefined),
  };
}

function makeRetryPolicy(delayMs = 5_000): RetryPolicy {
  return {
    classify: classifySyncFailure,
    backoff: () => delayMs,
  };
}

describe("SyncOrchestrator push", () => {
  it("classifies protocol failures as review-required instead of retrying forever", () => {
    expect(classifySyncFailure(new SyncProtocolError("invalid projection"))).toEqual({
      retryable: false,
      errorCode: "SYNC_PROTOCOL_ERROR",
      message: "invalid projection",
    });
  });

  it("persists accepted, accepted-with-review, and final outcomes distinctly", async () => {
    const store = new MemorySyncStore([
      makeCommand("accepted"),
      makeCommand("review"),
      makeCommand("final"),
      makeCommand("retryable"),
    ]);
    const gateway = makeGateway({
      push: async (request) => {
        const commandId = request.commands[0]!.command_id;
        if (commandId === "accepted") {
          return {
            accepted: [{ command_id: commandId, status: "ACCEPTED", warnings: [] }],
            rejected: [],
          };
        }
        if (commandId === "review") {
          return {
            accepted: [
              {
                command_id: commandId,
                status: "ACCEPTED_WITH_REVIEW",
                warnings: [{ code: "AUTHORIZATION_STALE" }],
              },
            ],
            rejected: [],
          };
        }
        return {
          accepted: [],
          rejected: [
            {
              command_id: commandId,
              status:
                commandId === "retryable"
                  ? "REJECTED_RETRYABLE"
                  : "REJECTED_FINAL",
              error_code:
                commandId === "retryable"
                  ? "TEMPORARY_UNAVAILABLE"
                  : "UNSUPPORTED_SCHEMA",
              message: "Server rejected command.",
            },
          ],
        };
      },
    });
    const orchestrator = new SyncOrchestrator({
      gateway,
      store,
      businessId: "business-1",
      deviceId: "device-1",
      clientSchemaVersion: 6,
      retryPolicy: makeRetryPolicy(),
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    await expect(orchestrator.pushPending()).resolves.toEqual({
      claimed: 4,
      accepted: 1,
      accepted_with_review: 1,
      failed_retryable: 1,
      requires_review: 1,
    });
    expect(store.resolutions.get("accepted")?.state).toBe("ACCEPTED");
    expect(store.resolutions.get("review")).toEqual({
      state: "ACCEPTED_WITH_REVIEW",
      resolved_at: "2026-08-23T00:00:00.000Z",
      warnings: [{ code: "AUTHORIZATION_STALE" }],
    });
    expect(store.resolutions.get("final")?.state).toBe("REQUIRES_REVIEW");
    expect(store.resolutions.get("retryable")).toMatchObject({
      state: "FAILED_RETRYABLE",
      next_attempt_at: "2026-08-23T00:00:05.000Z",
    });
  });

  it("retries an unknown network result with the same command identity and payload", async () => {
    const store = new MemorySyncStore([makeCommand("command-unknown")]);
    const requests: SyncPushRequest[] = [];
    let callCount = 0;
    let now = new Date("2026-08-23T00:00:00.000Z");
    const gateway = makeGateway({
      push: async (request) => {
        requests.push(structuredClone(request));
        callCount += 1;
        if (callCount === 1) {
          throw new SyncTransportError("NETWORK", "connection dropped after send");
        }
        return {
          accepted: [
            {
              command_id: request.commands[0]!.command_id,
              status: "ACCEPTED",
              warnings: [],
            },
          ],
          rejected: [],
        };
      },
    });
    const orchestrator = new SyncOrchestrator({
      gateway,
      store,
      businessId: "business-1",
      deviceId: "device-1",
      clientSchemaVersion: 6,
      retryPolicy: makeRetryPolicy(),
      now: () => now,
    });

    expect((await orchestrator.pushPending()).failed_retryable).toBe(1);
    expect(store.resolutions.get("command-unknown")).toMatchObject({
      state: "FAILED_RETRYABLE",
      error_code: "NETWORK_UNKNOWN_RESULT",
    });

    now = new Date("2026-08-23T00:00:05.000Z");
    expect((await orchestrator.pushPending()).accepted).toBe(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0]?.batch_id).toBe("command-unknown");
    expect(requests[0]?.commands[0]).not.toHaveProperty("attempt_count");
  });

  it("preserves the signed offline grant byte-for-byte from durable command to gateway", async () => {
    const offlineGrant = {
      schema_version: 1 as const,
      algorithm: "ECDSA_P256_SHA256" as const,
      key_id: "offline-key-1",
      session_id: "session-1",
      device_id: "device-1",
      terminal_id: "terminal-1",
      issued_at: "2026-08-22T00:00:00.000Z",
      offline_valid_until: "2026-08-24T00:00:00.000Z",
      authorization: {
        user_id: "user-1",
        business_id: "business-1",
        primary_role: "CASHIER",
        permissions: ["transaction.complete", "workspace.pos.access"],
        authorization_version: 4,
        default_location_id: "location-1",
      },
      signature: "exact-signed-grant",
    };
    const store = new MemorySyncStore([
      { ...makeCommand("signed-offline"), offline_authorization: offlineGrant },
    ]);
    let received: SyncPushRequest | undefined;
    const orchestrator = new SyncOrchestrator({
      gateway: makeGateway({
        push: async (request) => {
          received = structuredClone(request);
          return {
            accepted: [
              {
                command_id: request.commands[0]!.command_id,
                status: "ACCEPTED",
                warnings: [],
              },
            ],
            rejected: [],
          };
        },
      }),
      store,
      businessId: "business-1",
      deviceId: "device-1",
      clientSchemaVersion: 6,
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    expect((await orchestrator.pushPending()).accepted).toBe(1);
    expect(received?.commands[0]?.offline_authorization).toEqual(offlineGrant);
  });

  it("retains a local device mismatch for review without sending it", async () => {
    const command = { ...makeCommand("wrong-device"), device_id: "device-2" };
    const store = new MemorySyncStore([command]);
    let pushCalls = 0;
    const orchestrator = new SyncOrchestrator({
      gateway: makeGateway({
        push: async () => {
          pushCalls += 1;
          return { accepted: [], rejected: [] };
        },
      }),
      store,
      businessId: "business-1",
      deviceId: "device-1",
      clientSchemaVersion: 6,
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    expect((await orchestrator.pushPending()).requires_review).toBe(1);
    expect(pushCalls).toBe(0);
    expect(store.resolutions.get("wrong-device")).toMatchObject({
      state: "REQUIRES_REVIEW",
      error_code: "OUTBOX_CONTEXT_MISMATCH",
    });
  });
});

describe("SyncOrchestrator pull and bootstrap", () => {
  it("advances the cursor only after atomic local apply, then acknowledges it", async () => {
    const store = new MemorySyncStore([]);
    store.failPullApply = true;
    const acked: string[] = [];
    const response: SyncPullResponse = {
      changes: [
        {
          sequence: "1",
          entity_type: "product",
          entity_id: "product-1",
          change_type: "UPSERT",
          entity_version: "2",
          occurred_at: "2026-08-23T00:01:00.000Z",
          payload: { name: "Produk" },
        },
      ],
      next_cursor: "1",
      has_more: false,
      server_time: "2026-08-23T00:01:00.000Z",
    };
    const gateway = makeGateway({
      pull: async () => response,
      ack: async (request) => {
        acked.push(request.last_applied_sequence);
      },
    });
    const orchestrator = new SyncOrchestrator({
      gateway,
      store,
      businessId: "business-1",
      deviceId: "device-1",
      clientSchemaVersion: 6,
    });

    await expect(orchestrator.pullAvailable()).resolves.toMatchObject({
      status: "FAILED",
      cursor: "0",
      applied_pages: 0,
      applied_changes: 0,
      failure: {
        disposition: "REQUIRES_REVIEW",
        error_code: "SYNC_CLIENT_ERROR",
        message: "local apply failed",
      },
    });
    expect(store.cursor).toBe("0");
    expect(store.appliedChanges).toEqual([]);
    expect(acked).toEqual([]);

    store.failPullApply = false;
    const result = await orchestrator.pullAvailable();
    expect(result).toMatchObject({
      status: "SUCCESS",
      applied_pages: 1,
      applied_changes: 1,
      cursor: "1",
      acknowledgement: { status: "ACKED" },
    });
    expect(store.cursor).toBe("1");
    expect(acked).toEqual(["1"]);
  });

  it("keeps an applied cursor when optional ack fails", async () => {
    const store = new MemorySyncStore([]);
    const orchestrator = new SyncOrchestrator({
      gateway: makeGateway({
        pull: async () => ({
          changes: [],
          next_cursor: "9",
          has_more: false,
          server_time: "2026-08-23T00:01:00.000Z",
        }),
        ack: async () => {
          throw new SyncTransportError("NETWORK", "ack unavailable");
        },
      }),
      store,
      businessId: "business-1",
      deviceId: "device-1",
      clientSchemaVersion: 6,
      retryPolicy: makeRetryPolicy(2_000),
    });

    const result = await orchestrator.pullAvailable();
    expect(store.cursor).toBe("9");
    expect(result).toMatchObject({
      status: "SUCCESS",
      cursor: "9",
      acknowledgement: {
        status: "FAILED",
        failure: {
          disposition: "FAILED_RETRYABLE",
          retry_after_ms: 2_000,
        },
      },
    });
  });

  it("applies bootstrap and its cursor without discarding pending commands", async () => {
    const command = makeCommand("pending-sale");
    const store = new MemorySyncStore([command]);
    const orchestrator = new SyncOrchestrator({
      gateway: makeGateway({ bootstrap: async () => makeBootstrap("42") }),
      store,
      businessId: "business-1",
      deviceId: "device-1",
      clientSchemaVersion: 6,
    });

    await orchestrator.bootstrap();

    expect(store.cursor).toBe("42");
    expect(store.bootstrap?.authorization.user.id).toBe("user-1");
    expect(store.commands).toEqual([command]);
    expect(store.resolutions.size).toBe(0);
  });
});
