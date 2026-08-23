import type {
  SyncAckRequest,
  SyncBootstrapResponse,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
} from "@kastur/contracts";

export type MaybePromise<T> = T | Promise<T>;

/** Header values accepted from an auth provider without exposing DOM-only types. */
export type SyncRequestHeaders = Readonly<Record<string, string>>;

/** Fetch credential modes used by the sync transport. */
export type SyncRequestCredentials = "omit" | "same-origin" | "include";

export interface SyncRequestAuth {
  /**
   * Request-scoped authorization headers. A bearer implementation should resolve
   * its current session token here instead of placing a static token in config.
   */
  readonly headers?: SyncRequestHeaders;
  /** Use `include` for an API authenticated by a secure session cookie. */
  readonly credentials?: SyncRequestCredentials;
}

export interface SyncAuthProvider {
  getRequestAuth(): MaybePromise<SyncRequestAuth>;
}

export interface SyncWarning {
  readonly code: string;
  readonly message?: string;
  readonly severity?: string;
}

export type SyncRejectedStatus =
  | "REJECTED_VALIDATION"
  | "REJECTED_PERMISSION"
  | "REJECTED_CONFLICT"
  | "REJECTED_ONLINE_REQUIRED"
  | "REJECTED_RETRYABLE"
  | "REJECTED_FINAL";

export interface AcceptedSyncCommand {
  readonly command_id: string;
  readonly status: "ACCEPTED" | "ACCEPTED_WITH_REVIEW";
  readonly warnings: readonly SyncWarning[];
}

export interface RejectedSyncCommand {
  readonly command_id: string;
  readonly status: SyncRejectedStatus;
  readonly error_code: string;
  readonly message: string;
}

/** Normalized result supporting both the current contracts shape and the richer API spec. */
export interface SyncPushBatchResult {
  readonly accepted: readonly AcceptedSyncCommand[];
  readonly rejected: readonly RejectedSyncCommand[];
}

export interface SyncGateway {
  bootstrap(): Promise<SyncBootstrapResponse>;
  push(request: SyncPushRequest): Promise<SyncPushBatchResult>;
  pull(request: SyncPullRequest): Promise<SyncPullResponse>;
  ack(request: SyncAckRequest): Promise<void>;
}

export type SyncPushCommand = SyncPushRequest["commands"][number];

/** A stable outbound command claimed from durable local storage. */
export interface LocalSyncCommand extends SyncPushCommand {
  /** Local provenance; the server still derives authority from the session. */
  readonly business_id: string;
  /** Attempt number after the current claim was durably recorded. */
  readonly attempt_count: number;
}

export interface SyncStoreContext {
  readonly business_id: string;
  readonly device_id: string;
}

export interface ClaimPushCandidatesInput extends SyncStoreContext {
  readonly limit: number;
  readonly claimed_at: string;
  readonly lease_expires_at: string;
}

export type LocalCommandResolution =
  | {
      readonly state: "ACCEPTED";
      readonly resolved_at: string;
    }
  | {
      readonly state: "ACCEPTED_WITH_REVIEW";
      readonly resolved_at: string;
      readonly warnings: readonly SyncWarning[];
    }
  | {
      readonly state: "FAILED_RETRYABLE";
      readonly resolved_at: string;
      readonly error_code: string;
      readonly message: string;
      readonly next_attempt_at: string;
    }
  | {
      readonly state: "REQUIRES_REVIEW";
      readonly resolved_at: string;
      readonly error_code: string;
      readonly message: string;
    };

/**
 * Persistence boundary implemented by Dexie (or another local database).
 *
 * `claimPushCandidates` must atomically lease eligible PENDING / retryable / expired
 * SENDING entries and increment their attempt count without changing command identity
 * or payload. `resolveCommandAtomically` must retain review/final failures. Accepted
 * entries may be compacted only after any ACCEPTED_WITH_REVIEW warning is persisted.
 *
 * Both apply methods must update their cursor in the same local transaction as the
 * supplied data. Bootstrap must preserve pending business records and the outbox.
 */
export interface LocalSyncStore {
  claimPushCandidates(
    input: ClaimPushCandidatesInput,
  ): Promise<readonly LocalSyncCommand[]>;
  resolveCommandAtomically(
    commandId: string,
    resolution: LocalCommandResolution,
  ): Promise<void>;
  getPullCursor(context: SyncStoreContext): Promise<string>;
  applyPullAtomically(
    context: SyncStoreContext,
    response: SyncPullResponse,
  ): Promise<void>;
  applyBootstrapAtomically(
    context: SyncStoreContext,
    response: SyncBootstrapResponse,
  ): Promise<void>;
}

export interface SyncOperationFailure {
  readonly disposition: "FAILED_RETRYABLE" | "REQUIRES_REVIEW";
  readonly error_code: string;
  readonly message: string;
  readonly retry_after_ms?: number;
}

export interface PushRunResult {
  readonly claimed: number;
  readonly accepted: number;
  readonly accepted_with_review: number;
  readonly failed_retryable: number;
  readonly requires_review: number;
}

export type AckRunResult =
  | { readonly status: "ACKED" }
  | {
      readonly status: "FAILED";
      readonly failure: SyncOperationFailure;
    };

export interface PullRunSuccess {
  readonly status: "SUCCESS";
  readonly applied_pages: number;
  readonly applied_changes: number;
  readonly cursor: string;
  readonly has_more: boolean;
  readonly acknowledgement: AckRunResult;
}

export interface PullRunFailure {
  readonly status: "FAILED";
  readonly applied_pages: number;
  readonly applied_changes: number;
  readonly cursor: string;
  readonly failure: SyncOperationFailure;
}

export type PullRunResult = PullRunSuccess | PullRunFailure;

export interface SyncRunResult {
  readonly push: PushRunResult;
  readonly pull: PullRunResult;
}
