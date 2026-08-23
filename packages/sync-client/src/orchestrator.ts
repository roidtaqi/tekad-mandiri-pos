import type { SyncPushRequest } from "@kastur/contracts";

import { SyncProtocolError, defaultRetryPolicy } from "./retry.js";
import type { RetryPolicy } from "./retry.js";
import type {
  AckRunResult,
  LocalCommandResolution,
  LocalSyncCommand,
  LocalSyncStore,
  PullRunFailure,
  PullRunResult,
  PushRunResult,
  SyncGateway,
  SyncOperationFailure,
  SyncPushBatchResult,
  SyncRunResult,
  SyncStoreContext,
} from "./types.js";

export interface SyncOrchestratorOptions {
  readonly gateway: SyncGateway;
  readonly store: LocalSyncStore;
  readonly businessId: string;
  readonly deviceId: string;
  readonly clientSchemaVersion: number;
  readonly retryPolicy?: RetryPolicy;
  readonly now?: () => Date;
  readonly pushClaimLimit?: number;
  readonly pullLimit?: number;
  readonly maxPullPages?: number;
  readonly claimLeaseMs?: number;
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

function commandForWire(
  command: LocalSyncCommand,
): SyncPushRequest["commands"][number] {
  return {
    command_id: command.command_id,
    command_type: command.command_type,
    occurred_at: command.occurred_at,
    ...(command.location_id === undefined ? {} : { location_id: command.location_id }),
    device_id: command.device_id,
    authorization_version: command.authorization_version,
    ...(command.offline_authorization === undefined
      ? {}
      : { offline_authorization: command.offline_authorization }),
    correlation_id: command.correlation_id,
    payload: command.payload,
  };
}

function findCommandResult(result: SyncPushBatchResult, commandId: string) {
  const accepted = result.accepted.find((entry) => entry.command_id === commandId);
  const rejected = result.rejected.find((entry) => entry.command_id === commandId);
  if ((accepted === undefined) === (rejected === undefined)) {
    throw new SyncProtocolError(
      `Push response must contain exactly one result for command ${commandId}.`,
    );
  }
  return accepted === undefined
    ? { kind: "REJECTED" as const, result: rejected! }
    : { kind: "ACCEPTED" as const, result: accepted };
}

function emptyPushResult(claimed: number): PushRunResult {
  return {
    claimed,
    accepted: 0,
    accepted_with_review: 0,
    failed_retryable: 0,
    requires_review: 0,
  };
}

export class SyncOrchestrator {
  readonly #retryPolicy: RetryPolicy;
  readonly #now: () => Date;
  readonly #pushClaimLimit: number;
  readonly #pullLimit: number;
  readonly #maxPullPages: number;
  readonly #claimLeaseMs: number;

  constructor(private readonly options: SyncOrchestratorOptions) {
    if (options.businessId.trim() === "") throw new TypeError("businessId is required.");
    if (options.deviceId.trim() === "") throw new TypeError("deviceId is required.");
    this.#retryPolicy = options.retryPolicy ?? defaultRetryPolicy;
    this.#now = options.now ?? (() => new Date());
    this.#pushClaimLimit = options.pushClaimLimit ?? 25;
    this.#pullLimit = options.pullLimit ?? 500;
    this.#maxPullPages = options.maxPullPages ?? 100;
    this.#claimLeaseMs = options.claimLeaseMs ?? 60_000;
    for (const [name, value] of [
      ["pushClaimLimit", this.#pushClaimLimit],
      ["pullLimit", this.#pullLimit],
      ["maxPullPages", this.#maxPullPages],
      ["claimLeaseMs", this.#claimLeaseMs],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${name} must be a positive finite number.`);
      }
    }
  }

  #storeContext(): SyncStoreContext {
    return {
      business_id: this.options.businessId,
      device_id: this.options.deviceId,
    };
  }

  async bootstrap(): Promise<void> {
    const response = await this.options.gateway.bootstrap();
    if (response.authorization.membership.business_id !== this.options.businessId) {
      throw new SyncProtocolError(
        "Bootstrap authorization belongs to a different business.",
      );
    }
    await this.options.store.applyBootstrapAtomically(this.#storeContext(), response);
  }

  #operationFailure(error: unknown, attemptCount: number): SyncOperationFailure {
    const classification = this.#retryPolicy.classify(error);
    if (!classification.retryable) {
      return {
        disposition: "REQUIRES_REVIEW",
        error_code: classification.errorCode,
        message: classification.message,
      };
    }
    return {
      disposition: "FAILED_RETRYABLE",
      error_code: classification.errorCode,
      message: classification.message,
      retry_after_ms: this.#retryPolicy.backoff({
        attemptCount,
        failure: classification,
      }),
    };
  }

  async #persistFailure(
    command: LocalSyncCommand,
    error: unknown,
    resolvedAt: string,
  ): Promise<"FAILED_RETRYABLE" | "REQUIRES_REVIEW"> {
    const failure = this.#operationFailure(error, command.attempt_count);
    let resolution: LocalCommandResolution;
    if (failure.disposition === "FAILED_RETRYABLE") {
      resolution = {
        state: "FAILED_RETRYABLE",
        resolved_at: resolvedAt,
        error_code: failure.error_code,
        message: failure.message,
        next_attempt_at: addMilliseconds(resolvedAt, failure.retry_after_ms ?? 0),
      };
    } else {
      resolution = {
        state: "REQUIRES_REVIEW",
        resolved_at: resolvedAt,
        error_code: failure.error_code,
        message: failure.message,
      };
    }
    await this.options.store.resolveCommandAtomically(command.command_id, resolution);
    return resolution.state;
  }

  async pushPending(): Promise<PushRunResult> {
    const claimedAt = this.#now().toISOString();
    const commands = await this.options.store.claimPushCandidates({
      business_id: this.options.businessId,
      device_id: this.options.deviceId,
      limit: this.#pushClaimLimit,
      claimed_at: claimedAt,
      lease_expires_at: addMilliseconds(claimedAt, this.#claimLeaseMs),
    });
    const counts = { ...emptyPushResult(commands.length) };

    for (const command of commands) {
      if (
        command.business_id !== this.options.businessId ||
        command.device_id !== this.options.deviceId
      ) {
        await this.options.store.resolveCommandAtomically(command.command_id, {
          state: "REQUIRES_REVIEW",
          resolved_at: this.#now().toISOString(),
          error_code: "OUTBOX_CONTEXT_MISMATCH",
          message: "Outbox command belongs to a different business or device.",
        });
        counts.requires_review += 1;
        continue;
      }

      let batchResult: SyncPushBatchResult;
      try {
        batchResult = await this.options.gateway.push({
          batch_id: command.command_id,
          client_schema_version: this.options.clientSchemaVersion,
          commands: [commandForWire(command)],
        });
      } catch (error: unknown) {
        const state = await this.#persistFailure(
          command,
          error,
          this.#now().toISOString(),
        );
        counts[
          state === "FAILED_RETRYABLE" ? "failed_retryable" : "requires_review"
        ] += 1;
        continue;
      }

      let outcome: ReturnType<typeof findCommandResult>;
      try {
        outcome = findCommandResult(batchResult, command.command_id);
      } catch (error: unknown) {
        const state = await this.#persistFailure(
          command,
          error,
          this.#now().toISOString(),
        );
        counts[
          state === "FAILED_RETRYABLE" ? "failed_retryable" : "requires_review"
        ] += 1;
        continue;
      }

      const resolvedAt = this.#now().toISOString();
      if (outcome.kind === "ACCEPTED") {
        if (outcome.result.status === "ACCEPTED_WITH_REVIEW") {
          await this.options.store.resolveCommandAtomically(command.command_id, {
            state: "ACCEPTED_WITH_REVIEW",
            resolved_at: resolvedAt,
            warnings: outcome.result.warnings,
          });
          counts.accepted_with_review += 1;
        } else {
          await this.options.store.resolveCommandAtomically(command.command_id, {
            state: "ACCEPTED",
            resolved_at: resolvedAt,
          });
          counts.accepted += 1;
        }
        continue;
      }

      if (outcome.result.status === "REJECTED_RETRYABLE") {
        const classification = {
          retryable: true,
          errorCode: outcome.result.error_code,
          message: outcome.result.message,
        } as const;
        const delay = this.#retryPolicy.backoff({
          attemptCount: command.attempt_count,
          failure: classification,
        });
        await this.options.store.resolveCommandAtomically(command.command_id, {
          state: "FAILED_RETRYABLE",
          resolved_at: resolvedAt,
          error_code: classification.errorCode,
          message: classification.message,
          next_attempt_at: addMilliseconds(resolvedAt, delay),
        });
        counts.failed_retryable += 1;
      } else {
        await this.options.store.resolveCommandAtomically(command.command_id, {
          state: "REQUIRES_REVIEW",
          resolved_at: resolvedAt,
          error_code: outcome.result.error_code,
          message: outcome.result.message,
        });
        counts.requires_review += 1;
      }
    }

    return counts;
  }

  async #ack(cursor: string): Promise<AckRunResult> {
    try {
      await this.options.gateway.ack({
        device_id: this.options.deviceId,
        last_applied_sequence: cursor,
      });
      return { status: "ACKED" };
    } catch (error: unknown) {
      return {
        status: "FAILED",
        failure: this.#operationFailure(error, 1),
      };
    }
  }

  async pullAvailable(): Promise<PullRunResult> {
    const storeContext = this.#storeContext();
    let cursor = await this.options.store.getPullCursor(storeContext);
    let appliedPages = 0;
    let appliedChanges = 0;
    let hasMore = false;

    for (let page = 0; page < this.#maxPullPages; page += 1) {
      let response;
      try {
        response = await this.options.gateway.pull({
          device_id: this.options.deviceId,
          cursor,
          limit: this.#pullLimit,
        });
      } catch (error: unknown) {
        const result: PullRunFailure = {
          status: "FAILED",
          applied_pages: appliedPages,
          applied_changes: appliedChanges,
          cursor,
          failure: this.#operationFailure(error, 1),
        };
        return result;
      }

      if (response.has_more && response.next_cursor === cursor) {
        const result: PullRunFailure = {
          status: "FAILED",
          applied_pages: appliedPages,
          applied_changes: appliedChanges,
          cursor,
          failure: this.#operationFailure(
            new SyncProtocolError(
              "Pull response with more pages did not advance its cursor.",
            ),
            1,
          ),
        };
        return result;
      }

      // This is the sole cursor-advance boundary. The store contract requires one
      // local transaction for all changes plus next_cursor.
      try {
        await this.options.store.applyPullAtomically(storeContext, response);
      } catch (error: unknown) {
        const result: PullRunFailure = {
          status: "FAILED",
          applied_pages: appliedPages,
          applied_changes: appliedChanges,
          cursor,
          failure: this.#operationFailure(error, 1),
        };
        return result;
      }
      cursor = response.next_cursor;
      appliedPages += 1;
      appliedChanges += response.changes.length;
      hasMore = response.has_more;
      if (!hasMore) break;
    }

    return {
      status: "SUCCESS",
      applied_pages: appliedPages,
      applied_changes: appliedChanges,
      cursor,
      has_more: hasMore,
      acknowledgement: await this.#ack(cursor),
    };
  }

  async synchronize(): Promise<SyncRunResult> {
    const push = await this.pushPending();
    const pull = await this.pullAvailable();
    return { push, pull };
  }
}
