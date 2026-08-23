import type { AuthenticatedRequestContext } from "./auth.js";
import type { RequestDatabase, SqlExecutor } from "./database.js";
import { ApiError } from "./http.js";

interface IdempotencyRow {
  readonly request_hash: string;
  readonly response_payload: unknown;
  readonly status: string;
}

export interface CommandIdentity {
  readonly command_id: string;
  readonly command_type: string;
  readonly correlation_id: string;
  readonly location_id: string | null;
  readonly occurred_at: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const target: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      target[key] = stableValue(source[key]);
    }
    return target;
  }
  return value;
}

export async function requestHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function executeIdempotent<TResult>(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  command: CommandIdentity,
  requestPayload: unknown,
  operation: (executor: SqlExecutor) => Promise<TResult>,
  fingerprintInput: unknown = { command, payload: requestPayload },
): Promise<{ readonly replayed: boolean; readonly result: TResult }> {
  const hash = await requestHash({
    actor_user_id: context.authorization.user.id,
    session_device_id: context.device_id,
    request: fingerprintInput,
  });

  return database.transaction(async (executor) => {
    const inserted = await executor.query(
      `INSERT INTO sync.idempotency_records (
         business_id, idempotency_key, command_type, request_hash, status, created_at
       ) VALUES ($1, $2, $3, $4, 'PROCESSING', CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, command_type, idempotency_key) DO NOTHING`,
      [
        context.authorization.membership.business_id,
        command.command_id,
        command.command_type,
        hash,
      ],
    );

    if (inserted.rowCount === 0) {
      const prior = await executor.query<IdempotencyRow>(
        `SELECT request_hash, status, response_payload
         FROM sync.idempotency_records
         WHERE business_id = $1 AND command_type = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [
          context.authorization.membership.business_id,
          command.command_type,
          command.command_id,
        ],
      );
      const row = prior.rows[0];

      if (row === undefined) {
        throw new Error("Idempotency record disappeared while locked.");
      }
      if (row.request_hash !== hash) {
        throw new ApiError(
          409,
          "IDEMPOTENCY_KEY_REUSE_ERROR",
          "command_id pernah digunakan dengan payload berbeda.",
        );
      }
      if (row.status === "COMPLETED") {
        return { replayed: true, result: row.response_payload as TResult };
      }

      throw new ApiError(
        409,
        "COMMAND_IN_PROGRESS",
        "Perintah yang sama sedang diproses.",
      );
    }

    const result = await operation(executor);
    await executor.query(
      `UPDATE sync.idempotency_records
       SET status = 'COMPLETED', result_code = 'ACCEPTED', response_payload = $4::jsonb,
           completed_at = CURRENT_TIMESTAMP
       WHERE business_id = $1 AND command_type = $2 AND idempotency_key = $3`,
      [
        context.authorization.membership.business_id,
        command.command_type,
        command.command_id,
        JSON.stringify(result),
      ],
    );

    return { replayed: false, result };
  });
}

export async function appendAuditEvent(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  command: CommandIdentity,
  input: {
    readonly action: string;
    readonly after_data?: unknown;
    readonly before_data?: unknown;
    readonly entity_id: string;
    readonly entity_type: string;
    readonly reason?: string;
  },
): Promise<void> {
  await executor.query(
    `INSERT INTO audit.audit_events (
       id, business_id, location_id, actor_type, actor_user_id,
       actor_role_snapshot, action, entity_type, entity_id, occurred_at,
       recorded_at, device_id, session_id, reason, before_data, after_data,
       correlation_id, authorization_version
     ) VALUES (
       $1, $2, $3, 'USER', $4, $5, $6, $7, $8, $9,
       CURRENT_TIMESTAMP, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16
     )`,
    [
      crypto.randomUUID(),
      context.authorization.membership.business_id,
      command.location_id,
      context.authorization.user.id,
      context.authorization.primary_role,
      input.action,
      input.entity_type,
      input.entity_id,
      command.occurred_at,
      context.device_id,
      context.session_id,
      input.reason ?? null,
      input.before_data === undefined ? null : JSON.stringify(input.before_data),
      input.after_data === undefined ? null : JSON.stringify(input.after_data),
      command.correlation_id,
      context.authorization.authorization_version,
    ],
  );
}

export async function appendChange(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  command: CommandIdentity,
  input: {
    readonly change_type: "UPSERT" | "DEACTIVATE" | "EVENT" | "INVALIDATE";
    readonly entity_id: string;
    readonly entity_type: string;
    readonly entity_version?: string;
    readonly payload: unknown;
  },
): Promise<string> {
  const result = await executor.query<{ readonly sequence: string }>(
    `INSERT INTO sync.change_feed (
       business_id, location_id, entity_type, entity_id, change_type,
       entity_version, payload, occurred_at, recorded_at, correlation_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, CURRENT_TIMESTAMP, $9)
     RETURNING sequence::text`,
    [
      context.authorization.membership.business_id,
      command.location_id,
      input.entity_type,
      input.entity_id,
      input.change_type,
      input.entity_version ?? null,
      JSON.stringify(input.payload),
      command.occurred_at,
      command.correlation_id,
    ],
  );

  const sequence = result.rows[0]?.sequence;
  if (sequence === undefined) {
    throw new Error("Change feed insert did not return a sequence.");
  }
  return sequence;
}
