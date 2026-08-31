import type {
  AuthContextResponse,
  SyncAckRequest,
  SyncBootstrapResponse,
  SyncPullChange,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
} from "@kastur/contracts";

import { SyncHttpError, SyncProtocolError, SyncTransportError } from "./retry.js";
import type {
  AcceptedSyncCommand,
  MaybePromise,
  RejectedSyncCommand,
  SyncAuthProvider,
  SyncGateway,
  SyncPushBatchResult,
  SyncRejectedStatus,
  SyncRequestAuth,
  SyncWarning,
} from "./types.js";

export const SYNC_BOOTSTRAP_PATH = "/api/v1/sync/bootstrap" as const;
export const SYNC_PUSH_PATH = "/api/v1/sync/push" as const;
export const SYNC_RECOVERY_PUSH_PATH = "/api/v1/sync/recovery-push" as const;
export const SYNC_PULL_PATH = "/api/v1/sync/pull" as const;
export const SYNC_ACK_PATH = "/api/v1/sync/ack" as const;

type FetchImplementation = typeof fetch;

export interface HttpSyncGatewayOptions {
  readonly baseUrl: string;
  readonly client: "pos" | "backoffice";
  readonly clientVersion: string;
  readonly clientSchemaVersion: number;
  readonly deviceId: string;
  readonly authProvider: SyncAuthProvider;
  readonly fetch?: FetchImplementation;
  readonly createRequestId?: () => string;
  /**
   * Explicit, human-approved import of historical POS facts. This mode never
   * activates as an automatic fallback and requires an active server-side
   * `sync.recovery.import` permission.
   */
  readonly recoveryApproval?: {
    readonly reason: string;
  };
}

export function createBearerAuthProvider(
  getAccessToken: () => MaybePromise<string>,
): SyncAuthProvider {
  return {
    async getRequestAuth(): Promise<SyncRequestAuth> {
      const accessToken = await getAccessToken();
      if (accessToken.trim() === "") {
        throw new TypeError("The current bearer session token is empty.");
      }
      return { headers: { Authorization: `Bearer ${accessToken}` } };
    },
  };
}

export function createCookieSessionAuthProvider(): SyncAuthProvider {
  return {
    getRequestAuth: () => ({ credentials: "include" }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new SyncProtocolError(`Expected response field ${key} to be a string.`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new SyncProtocolError(`Expected response field ${key} to be a string.`);
  }
  return value;
}

function decodeWarnings(value: unknown): readonly SyncWarning[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new SyncProtocolError("Expected command warnings to be an array.");
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new SyncProtocolError("Expected command warning to be an object.");
    }
    const message = optionalString(entry, "message");
    const severity = optionalString(entry, "severity");
    return {
      code: requiredString(entry, "code"),
      ...(message === undefined ? {} : { message }),
      ...(severity === undefined ? {} : { severity }),
    };
  });
}

const rejectedStatuses = new Set<SyncRejectedStatus>([
  "REJECTED_VALIDATION",
  "REJECTED_PERMISSION",
  "REJECTED_CONFLICT",
  "REJECTED_ONLINE_REQUIRED",
  "REJECTED_RETRYABLE",
  "REJECTED_FINAL",
]);

function inferRejectedStatus(errorCode: string): SyncRejectedStatus {
  if (rejectedStatuses.has(errorCode as SyncRejectedStatus)) {
    return errorCode as SyncRejectedStatus;
  }
  if (
    errorCode === "TEMPORARY_UNAVAILABLE" ||
    errorCode === "RATE_LIMITED" ||
    errorCode === "PROVIDER_TEMPORARY_FAILURE"
  ) {
    return "REJECTED_RETRYABLE";
  }
  if (errorCode === "PERMISSION_DENIED" || errorCode === "UNAUTHENTICATED") {
    return "REJECTED_PERMISSION";
  }
  if (errorCode === "ONLINE_REQUIRED") return "REJECTED_ONLINE_REQUIRED";
  if (
    errorCode === "VERSION_CONFLICT" ||
    errorCode === "BUSINESS_CONFLICT" ||
    errorCode === "IDEMPOTENCY_KEY_REUSE_ERROR"
  ) {
    return "REJECTED_CONFLICT";
  }
  if (
    errorCode === "VALIDATION_ERROR" ||
    errorCode === "ENTITY_NOT_FOUND" ||
    errorCode === "RETURN_QTY_EXCEEDED"
  ) {
    return "REJECTED_VALIDATION";
  }
  return "REJECTED_FINAL";
}

function normalizeCurrentPushResponse(body: Record<string, unknown>): SyncPushBatchResult {
  const acceptedCommands = body.accepted_commands;
  const rejectedCommands = body.rejected_commands;
  if (!isStringArray(acceptedCommands) || !Array.isArray(rejectedCommands)) {
    throw new SyncProtocolError("Invalid current sync push response shape.");
  }

  const accepted: AcceptedSyncCommand[] = acceptedCommands.map((commandId) => ({
    command_id: commandId,
    status: "ACCEPTED",
    warnings: [],
  }));
  const rejected: RejectedSyncCommand[] = [];

  for (const entry of rejectedCommands) {
    if (!isRecord(entry)) {
      throw new SyncProtocolError("Invalid rejected command response.");
    }
    const commandId = requiredString(entry, "command_id");
    const errorCode = requiredString(entry, "error_code");
    const message = requiredString(entry, "message");

    // Compatibility bridge until @kastur/contracts exposes rich per-command results.
    if (errorCode === "ACCEPTED_WITH_REVIEW") {
      accepted.push({
        command_id: commandId,
        status: "ACCEPTED_WITH_REVIEW",
        warnings: [{ code: errorCode, message }],
      });
    } else {
      rejected.push({
        command_id: commandId,
        status: inferRejectedStatus(errorCode),
        error_code: errorCode,
        message,
      });
    }
  }

  return { accepted, rejected };
}

function normalizeRichPushResponse(body: Record<string, unknown>): SyncPushBatchResult {
  const results = body.results;
  if (!Array.isArray(results)) {
    throw new SyncProtocolError("Invalid rich sync push response shape.");
  }

  const accepted: AcceptedSyncCommand[] = [];
  const rejected: RejectedSyncCommand[] = [];
  for (const entry of results) {
    if (!isRecord(entry)) throw new SyncProtocolError("Invalid command result entry.");
    const commandId = requiredString(entry, "command_id");
    const status = requiredString(entry, "status");
    if (status === "ACCEPTED" || status === "ACCEPTED_WITH_REVIEW") {
      accepted.push({
        command_id: commandId,
        status,
        warnings: decodeWarnings(entry.warnings),
      });
      continue;
    }
    if (!rejectedStatuses.has(status as SyncRejectedStatus)) {
      throw new SyncProtocolError(`Unknown command result status: ${status}.`);
    }
    const error = isRecord(entry.error) ? entry.error : entry;
    rejected.push({
      command_id: commandId,
      status: status as SyncRejectedStatus,
      error_code: optionalString(error, "code") ?? status,
      message: optionalString(error, "message") ?? "Command was rejected.",
    });
  }
  return { accepted, rejected };
}

function decodePushResponse(value: unknown): SyncPushBatchResult {
  if (!isRecord(value)) throw new SyncProtocolError("Sync push response must be an object.");
  if ("results" in value) return normalizeRichPushResponse(value);
  return normalizeCurrentPushResponse(value);
}

function decodeAuthContext(value: unknown): AuthContextResponse {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.membership)) {
    throw new SyncProtocolError("Invalid authorization bootstrap projection.");
  }
  if (
    typeof value.user.id !== "string" ||
    typeof value.user.display_name !== "string" ||
    typeof value.membership.business_id !== "string" ||
    value.membership.status !== "ACTIVE" ||
    typeof value.primary_role !== "string" ||
    !isStringArray(value.permissions) ||
    typeof value.authorization_version !== "number" ||
    typeof value.offline_valid_until !== "string" ||
    typeof value.default_location_id !== "string" ||
    typeof value.server_time !== "string"
  ) {
    throw new SyncProtocolError("Invalid authorization bootstrap projection.");
  }
  return value as unknown as AuthContextResponse;
}

function decodeBootstrapResponse(value: unknown): SyncBootstrapResponse {
  if (!isRecord(value)) throw new SyncProtocolError("Bootstrap response must be an object.");
  const arrayFields = [
    "products",
    "product_units",
    "barcodes",
    "published_price_versions",
    "published_price_tiers",
    "promotions",
    "payment_methods",
    "stock_balances",
  ] as const;
  for (const key of arrayFields) {
    if (!Array.isArray(value[key])) {
      throw new SyncProtocolError(`Expected bootstrap field ${key} to be an array.`);
    }
  }
  if (typeof value.bootstrap_version !== "number") {
    throw new SyncProtocolError("Expected bootstrap_version to be a number.");
  }

  return {
    bootstrap_version: value.bootstrap_version,
    server_time: requiredString(value, "server_time"),
    business: value.business,
    location: value.location,
    terminal: value.terminal,
    authorization: decodeAuthContext(value.authorization),
    settings: value.settings,
    products: value.products as unknown[],
    product_units: value.product_units as unknown[],
    barcodes: value.barcodes as unknown[],
    published_price_versions: value.published_price_versions as unknown[],
    published_price_tiers: value.published_price_tiers as unknown[],
    promotions: value.promotions as unknown[],
    payment_methods: value.payment_methods as unknown[],
    stock_balances: value.stock_balances as unknown[],
    sync_cursor: requiredString(value, "sync_cursor"),
  };
}

function decodePullChange(value: unknown): SyncPullChange {
  if (!isRecord(value)) throw new SyncProtocolError("Pull change must be an object.");
  const changeType = requiredString(value, "change_type");
  if (!new Set(["UPSERT", "DEACTIVATE", "EVENT", "INVALIDATE"]).has(changeType)) {
    throw new SyncProtocolError(`Unknown pull change type: ${changeType}.`);
  }
  const entityVersion = value.entity_version;
  if (
    entityVersion !== null &&
    (typeof entityVersion !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(entityVersion))
  ) {
    throw new SyncProtocolError(
      "Pull entity_version must be an unsigned decimal string or null.",
    );
  }
  return {
    sequence: requiredString(value, "sequence"),
    entity_type: requiredString(value, "entity_type"),
    entity_id: requiredString(value, "entity_id"),
    change_type: changeType as SyncPullChange["change_type"],
    entity_version: entityVersion,
    occurred_at: requiredString(value, "occurred_at"),
    payload: value.payload,
  };
}

function decodePullResponse(value: unknown): SyncPullResponse {
  if (!isRecord(value) || !Array.isArray(value.changes)) {
    throw new SyncProtocolError("Invalid sync pull response.");
  }
  if (typeof value.has_more !== "boolean") {
    throw new SyncProtocolError("Expected has_more to be a boolean.");
  }
  return {
    changes: value.changes.map(decodePullChange),
    next_cursor: requiredString(value, "next_cursor"),
    has_more: value.has_more,
    server_time: requiredString(value, "server_time"),
  };
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return undefined;
  return Math.max(0, timestamp - Date.now());
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error: unknown) {
    throw new SyncProtocolError("Sync endpoint returned invalid JSON.", error);
  }
}

async function throwHttpError(response: Response): Promise<never> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  const errorCode =
    error === undefined
      ? `HTTP_${response.status}`
      : optionalString(error, "code") ?? `HTTP_${response.status}`;
  const message =
    error === undefined
      ? `Sync request failed with HTTP ${response.status}.`
      : optionalString(error, "message") ??
        `Sync request failed with HTTP ${response.status}.`;
  const serverRetryable =
    error === undefined || typeof error.retryable !== "boolean"
      ? undefined
      : error.retryable;
  throw new SyncHttpError(
    response.status,
    errorCode,
    message,
    serverRetryable,
    parseRetryAfter(response.headers.get("Retry-After")),
  );
}

export class HttpSyncGateway implements SyncGateway {
  readonly #baseUrl: string;
  readonly #fetch: FetchImplementation;
  readonly #requestId: () => string;

  constructor(private readonly options: HttpSyncGatewayOptions) {
    if (options.baseUrl.trim() === "") throw new TypeError("baseUrl is required.");
    if (options.deviceId.trim() === "") throw new TypeError("deviceId is required.");
    if (options.recoveryApproval !== undefined) {
      const reason = options.recoveryApproval.reason.trim();
      if (options.client !== "backoffice") {
        throw new TypeError("Recovery import must use an independent backoffice approver.");
      }
      if (reason.length < 10 || reason.length > 500) {
        throw new TypeError("Recovery approval reason must contain 10–500 characters.");
      }
    }
    this.#baseUrl = options.baseUrl.endsWith("/")
      ? options.baseUrl
      : `${options.baseUrl}/`;
    this.#fetch = options.fetch ?? fetch;
    this.#requestId = options.createRequestId ?? (() => crypto.randomUUID());
  }

  async #request(path: string, init: RequestInit = {}): Promise<Response> {
    const auth = await this.options.authProvider.getRequestAuth();
    const headers = new Headers(auth.headers);
    headers.set("Accept", "application/json");
    headers.set("X-Kastur-Client", this.options.client);
    headers.set("X-Kastur-Client-Version", this.options.clientVersion);
    headers.set("X-Kastur-Schema-Version", String(this.options.clientSchemaVersion));
    headers.set("X-Kastur-Device-Id", this.options.deviceId);
    headers.set("X-Request-Id", this.#requestId());
    if (init.body !== undefined && init.body !== null) {
      headers.set("Content-Type", "application/json");
    }
    if (init.headers !== undefined) {
      new Headers(init.headers).forEach((headerValue, key) =>
        headers.set(key, headerValue),
      );
    }

    try {
      return await this.#fetch(new URL(path, this.#baseUrl), {
        ...init,
        credentials: auth.credentials ?? "same-origin",
        headers,
      });
    } catch (error: unknown) {
      throw new SyncTransportError(
        "NETWORK",
        "Sync request outcome is unknown because the network request failed.",
        error,
      );
    }
  }

  #assertDevice(deviceId: string): void {
    if (deviceId !== this.options.deviceId) {
      throw new SyncProtocolError("Sync request device does not match gateway device.");
    }
  }

  async bootstrap(): Promise<SyncBootstrapResponse> {
    const response = await this.#request(SYNC_BOOTSTRAP_PATH);
    if (!response.ok) return throwHttpError(response);
    return decodeBootstrapResponse(await readResponseJson(response));
  }

  async push(request: SyncPushRequest): Promise<SyncPushBatchResult> {
    for (const command of request.commands) this.#assertDevice(command.device_id);
    const idempotencyKey =
      request.commands.length === 1
        ? request.commands[0]!.command_id
        : request.batch_id;
    const init: RequestInit = {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(
        this.options.recoveryApproval === undefined
          ? request
          : {
              ...request,
              recovery_reason: this.options.recoveryApproval.reason.trim(),
            },
      ),
    };
    const response = await this.#request(
      this.options.recoveryApproval === undefined
        ? SYNC_PUSH_PATH
        : SYNC_RECOVERY_PUSH_PATH,
      init,
    );
    if (!response.ok) return throwHttpError(response);
    return decodePushResponse(await readResponseJson(response));
  }

  async pull(request: SyncPullRequest): Promise<SyncPullResponse> {
    this.#assertDevice(request.device_id);
    const url = new URL(SYNC_PULL_PATH, this.#baseUrl);
    url.searchParams.set("cursor", request.cursor);
    if (request.limit !== undefined) {
      url.searchParams.set("limit", String(request.limit));
    }
    const response = await this.#request(url.toString());
    if (!response.ok) return throwHttpError(response);
    return decodePullResponse(await readResponseJson(response));
  }

  async ack(request: SyncAckRequest): Promise<void> {
    this.#assertDevice(request.device_id);
    const response = await this.#request(SYNC_ACK_PATH, {
      method: "POST",
      body: JSON.stringify(request),
    });
    if (!response.ok) return throwHttpError(response);
  }
}
