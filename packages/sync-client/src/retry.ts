export type SyncTransportFailureKind = "NETWORK" | "HTTP" | "PROTOCOL";

export class SyncTransportError extends Error {
  readonly causeValue: unknown;

  constructor(
    public readonly kind: SyncTransportFailureKind,
    message: string,
    causeValue?: unknown,
  ) {
    super(message);
    this.name = "SyncTransportError";
    this.causeValue = causeValue;
  }
}

export class SyncHttpError extends SyncTransportError {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly serverRetryable: boolean | undefined,
    public readonly retryAfterMs: number | undefined,
  ) {
    super("HTTP", message);
    this.name = "SyncHttpError";
  }
}

export class SyncProtocolError extends SyncTransportError {
  constructor(message: string, causeValue?: unknown) {
    super("PROTOCOL", message, causeValue);
    this.name = "SyncProtocolError";
  }
}

export interface FailureClassification {
  readonly retryable: boolean;
  readonly errorCode: string;
  readonly message: string;
  readonly minimumDelayMs?: number;
}

export interface BackoffInput {
  readonly attemptCount: number;
  readonly failure: FailureClassification;
}

export type BackoffStrategy = (input: BackoffInput) => number;

export interface RetryPolicy {
  classify(error: unknown): FailureClassification;
  backoff: BackoffStrategy;
}

function isHttpStatusRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function classifySyncFailure(error: unknown): FailureClassification {
  if (error instanceof SyncHttpError) {
    const retryable = error.serverRetryable ?? isHttpStatusRetryable(error.status);
    return {
      retryable,
      errorCode: error.errorCode,
      message: error.message,
      ...(error.retryAfterMs === undefined
        ? {}
        : { minimumDelayMs: error.retryAfterMs }),
    };
  }

  if (error instanceof SyncTransportError) {
    return {
      // A malformed/incompatible response is deterministic. Repeating it
      // forever cannot repair local state and hides the need for review or an
      // atomic bootstrap. Only an unknown network outcome is retried here.
      retryable: error.kind === "NETWORK",
      errorCode:
        error.kind === "NETWORK" ? "NETWORK_UNKNOWN_RESULT" : "SYNC_PROTOCOL_ERROR",
      message: error.message,
    };
  }

  return {
    retryable: false,
    errorCode: "SYNC_CLIENT_ERROR",
    message: error instanceof Error ? error.message : "Unknown sync client failure.",
  };
}

export interface ExponentialBackoffOptions {
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
}

export function createExponentialBackoff(
  options: ExponentialBackoffOptions = {},
): BackoffStrategy {
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;

  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new TypeError("baseDelayMs must be a finite non-negative number.");
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new TypeError("maxDelayMs must be finite and at least baseDelayMs.");
  }

  return ({ attemptCount, failure }) => {
    const safeAttempt = Math.max(1, Math.trunc(attemptCount));
    const exponentialDelay = Math.min(
      maxDelayMs,
      baseDelayMs * 2 ** Math.min(30, safeAttempt - 1),
    );
    return Math.max(exponentialDelay, failure.minimumDelayMs ?? 0);
  };
}

export const defaultRetryPolicy: RetryPolicy = {
  classify: classifySyncFailure,
  backoff: createExponentialBackoff(),
};
