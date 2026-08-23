import {
  fitsPrecisionScale,
  moneyCompare,
  parseMoney,
  type MoneyValue,
} from "@kastur/numeric";

import type { AuthenticatedRequestContext } from "./auth.js";
import { requirePermission } from "./auth.js";
import {
  appendAuditEvent,
  appendChange,
  executeIdempotent,
  type CommandIdentity,
} from "./command-support.js";
import type { RequestDatabase } from "./database.js";
import { ApiError } from "./http.js";
import {
  enumValue,
  integerValue,
  nullableStringValue,
  objectValue,
  stringValue,
  timestampValue,
  uuidValue,
  validationError,
} from "./validation.js";

interface TerminalRow {
  readonly id: string;
}

interface ShiftRow {
  readonly cashier_user_id: string;
  readonly closed_at: Date | string | null;
  readonly location_id: string;
  readonly opening_device_id: string | null;
  readonly opening_cash: string;
  readonly status: string;
  readonly terminal_id: string;
}

interface ClosingCalculationRow {
  readonly cash_in: string;
  readonly cash_out: string;
  readonly cash_refunds: string;
  readonly cash_sales: string;
  readonly expected_cash: string;
  readonly refund_count: number;
  readonly transaction_count: number;
  readonly void_count: number;
}

interface OpenShiftPayload {
  readonly business_id: string;
  readonly cashier_user_id: string;
  readonly device_id: string;
  readonly location_id: string;
  readonly opened_at: string;
  readonly opening_cash: MoneyValue;
  readonly shift_id: string;
  readonly shift_number: string;
  readonly terminal_id: string;
}

interface ManualMovementPayload {
  readonly actor_user_id: string;
  readonly amount: MoneyValue;
  readonly business_id: string;
  readonly correlation_id: string;
  readonly id: string;
  readonly location_id: string;
  readonly movement_type: "CASH_IN" | "CASH_OUT" | "SAFE_DROP";
  readonly notes: string | null;
  readonly occurred_at: string;
  readonly reason_code: string;
  readonly shift_id: string;
  readonly source_id: string;
  readonly source_type: string;
}

interface CloseShiftPayload {
  readonly actual_cash: MoneyValue;
  readonly created_at: string;
  readonly id: string;
  readonly location_id: string;
  readonly shift_id: string;
  readonly variance_reason: string | null;
}

export interface CashCommandInput {
  readonly command: CommandIdentity;
  readonly command_authorization_version: number;
  readonly device_id: string;
  readonly payload: unknown;
}

function money(value: unknown, field: string, allowZero: boolean): MoneyValue {
  if (typeof value !== "string") throw validationError(field, "wajib berupa string desimal");
  try {
    const parsed = parseMoney(value);
    const comparison = moneyCompare(parsed, parseMoney("0"));
    if (
      !fitsPrecisionScale(parsed, 20, 4) ||
      comparison < 0 ||
      (!allowZero && comparison === 0)
    ) {
      throw validationError(field, allowZero ? "tidak boleh negatif" : "harus lebih besar dari nol");
    }
    return parsed;
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    throw validationError(field, "bukan nilai uang yang valid");
  }
}

function assertCommandContext(
  context: AuthenticatedRequestContext,
  input: CashCommandInput,
  businessId: string,
  locationId: string,
  actorUserId: string,
): void {
  if (
    businessId !== context.authorization.membership.business_id ||
    locationId !== context.authorization.default_location_id ||
    actorUserId !== context.authorization.user.id ||
    context.device_id === null ||
    context.device_id !== input.device_id
  ) {
    throw new ApiError(403, "CASH_CONTEXT_MISMATCH", "Konteks operasi kas tidak cocok dengan sesi.");
  }
}

function assertShiftAuthority(
  context: AuthenticatedRequestContext,
  input: CashCommandInput,
  shift: ShiftRow,
): void {
  if (
    shift.cashier_user_id !== context.authorization.user.id ||
    context.selected_terminal_id === null ||
    shift.terminal_id !== context.selected_terminal_id ||
    context.device_id === null ||
    context.device_id !== input.device_id ||
    shift.opening_device_id !== input.device_id
  ) {
    throw new ApiError(
      403,
      "CASH_CONTEXT_MISMATCH",
      "Shift kas tidak dimiliki oleh konteks pengguna, terminal, dan perangkat ini.",
    );
  }
}

function readOpenShift(value: unknown): OpenShiftPayload {
  const envelope = objectValue(value, "payload");
  const row = envelope.payload_version === undefined
    ? envelope
    : (() => {
        const version = integerValue(
          envelope.payload_version,
          "payload.payload_version",
          1,
        );
        if (version !== 1) {
          throw new ApiError(
            400,
            "UNSUPPORTED_PAYLOAD_VERSION",
            "Versi payload Open Shift tidak didukung.",
          );
        }
        return objectValue(envelope.shift, "payload.shift");
      })();
  return {
    business_id: uuidValue(row.business_id, "payload.business_id"),
    cashier_user_id: uuidValue(row.cashier_user_id, "payload.cashier_user_id"),
    device_id: uuidValue(row.device_id, "payload.device_id"),
    location_id: uuidValue(row.location_id, "payload.location_id"),
    opened_at: timestampValue(row.opened_at, "payload.opened_at"),
    opening_cash: money(row.opening_cash, "payload.opening_cash", true),
    shift_id: uuidValue(row.shift_id, "payload.shift_id"),
    shift_number: stringValue(row.shift_number, "payload.shift_number"),
    terminal_id: uuidValue(row.terminal_id, "payload.terminal_id"),
  };
}

export async function openShiftCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: CashCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "workspace.pos.access");
  requirePermission(context, "shift.open");
  if (input.command_authorization_version !== context.authorization.authorization_version) {
    throw new ApiError(409, "AUTHORIZATION_STALE", "Otorisasi Shift sudah berubah.");
  }
  const payload = readOpenShift(input.payload);
  assertCommandContext(context, input, payload.business_id, payload.location_id, payload.cashier_user_id);
  if (
    payload.device_id !== input.device_id ||
    payload.opened_at !== input.command.occurred_at ||
    payload.location_id !== input.command.location_id ||
    payload.terminal_id !== context.selected_terminal_id
  ) {
    throw new ApiError(400, "SHIFT_CONTEXT_MISMATCH", "Envelope Open Shift tidak konsisten.");
  }

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const terminal = await executor.query<TerminalRow>(
      `SELECT id FROM core.terminals
       WHERE id = $1 AND business_id = $2 AND location_id = $3 AND status = 'ACTIVE'`,
      [payload.terminal_id, payload.business_id, payload.location_id],
    );
    if (terminal.rows[0] === undefined) {
      throw new ApiError(409, "TERMINAL_NOT_AVAILABLE", "Terminal tidak aktif pada lokasi ini.");
    }
    await executor.query(
      `INSERT INTO cash.shifts (
         id, business_id, location_id, terminal_id, cashier_user_id,
         shift_number, status, opening_cash, opened_at, review_status, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $8, 'UNREVIEWED', CURRENT_TIMESTAMP)`,
      [
        payload.shift_id,
        payload.business_id,
        payload.location_id,
        payload.terminal_id,
        payload.cashier_user_id,
        payload.shift_number,
        payload.opening_cash,
        payload.opened_at,
      ],
    );
    await executor.query(
      `INSERT INTO cash.cash_movements (
         id, business_id, location_id, terminal_id, shift_id, movement_type,
         amount, direction, source_type, source_id, occurred_at,
         actor_user_id, device_id, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, 'OPENING_BALANCE', $6, 'IN',
                 'SHIFT', $5, $7, $8, $9, $10)`,
      [
        crypto.randomUUID(),
        payload.business_id,
        payload.location_id,
        payload.terminal_id,
        payload.shift_id,
        payload.opening_cash,
        payload.opened_at,
        payload.cashier_user_id,
        input.device_id,
        input.command.correlation_id,
      ],
    );
    const result = {
      shift_id: payload.shift_id,
      shift_number: payload.shift_number,
      status: "OPEN",
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "SHIFT_OPENED",
      after_data: result,
      entity_id: payload.shift_id,
      entity_type: "cash_shift",
    });
    await appendChange(executor, context, input.command, {
      change_type: "EVENT",
      entity_id: payload.shift_id,
      entity_type: "cash_shift",
      payload: result,
    });
    return result;
  });
}

function readManualMovement(value: unknown): ManualMovementPayload {
  const row = objectValue(value, "payload");
  return {
    actor_user_id: uuidValue(row.actor_user_id, "payload.actor_user_id"),
    amount: money(row.amount, "payload.amount", false),
    business_id: uuidValue(row.business_id, "payload.business_id"),
    correlation_id: uuidValue(row.correlation_id, "payload.correlation_id"),
    id: uuidValue(row.id, "payload.id"),
    location_id: uuidValue(row.location_id, "payload.location_id"),
    movement_type: enumValue(row.movement_type, "payload.movement_type", [
      "CASH_IN",
      "CASH_OUT",
      "SAFE_DROP",
    ] as const),
    notes: nullableStringValue(row.notes, "payload.notes"),
    occurred_at: timestampValue(row.occurred_at, "payload.occurred_at"),
    reason_code: stringValue(row.reason_code, "payload.reason_code"),
    shift_id: uuidValue(row.shift_id, "payload.shift_id"),
    source_id: uuidValue(row.source_id, "payload.source_id"),
    source_type: stringValue(row.source_type, "payload.source_type"),
  };
}

function movementPermission(
  movementType: ManualMovementPayload["movement_type"],
): "cash.in" | "cash.out" | "cash.safe_drop" {
  if (movementType === "CASH_IN") return "cash.in";
  if (movementType === "CASH_OUT") return "cash.out";
  return "cash.safe_drop";
}

export async function recordCashMovementCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: CashCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  const payload = readManualMovement(input.payload);
  requirePermission(context, movementPermission(payload.movement_type));
  assertCommandContext(context, input, payload.business_id, payload.location_id, payload.actor_user_id);
  if (
    payload.id !== input.command.command_id ||
    payload.correlation_id !== input.command.correlation_id ||
    payload.occurred_at !== input.command.occurred_at
  ) {
    throw new ApiError(400, "CASH_CONTEXT_MISMATCH", "Envelope Cash Movement tidak konsisten.");
  }
  const warnings =
    input.command_authorization_version === context.authorization.authorization_version
      ? []
      : ["AUTHORIZATION_STALE_EXCEPTION"];

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const shifts = await executor.query<ShiftRow>(
      `SELECT s.terminal_id, s.location_id, s.cashier_user_id, s.status,
              s.opening_cash::text, s.closed_at,
              (SELECT movement.device_id
               FROM cash.cash_movements movement
               WHERE movement.shift_id = s.id
                 AND movement.business_id = s.business_id
                 AND movement.location_id = s.location_id
                 AND movement.terminal_id = s.terminal_id
                 AND movement.movement_type = 'OPENING_BALANCE'
                 AND movement.source_type = 'SHIFT'
                 AND movement.source_id = s.id
               LIMIT 1) AS opening_device_id
       FROM cash.shifts s WHERE s.id = $1 AND s.business_id = $2
       FOR UPDATE`,
      [payload.shift_id, payload.business_id],
    );
    const shift = shifts.rows[0];
    if (shift === undefined || shift.location_id !== payload.location_id) {
      throw new ApiError(409, "SHIFT_NOT_OPEN", "Shift tidak terbuka.");
    }
    assertShiftAuthority(context, input, shift);
    const closedAt = shift.closed_at === null ? null : new Date(shift.closed_at).getTime();
    const occurredAt = new Date(payload.occurred_at).getTime();
    const isLate =
      (shift.status === "CLOSED" || shift.status === "FORCED_CLOSED") &&
      closedAt !== null &&
      occurredAt <= closedAt;
    if (shift.status !== "OPEN" && !isLate) {
      throw new ApiError(409, "SHIFT_NOT_OPEN", "Shift tidak terbuka.");
    }
    if (isLate) warnings.push("LATE_SHIFT_EVENT");
    const direction = payload.movement_type === "CASH_IN" ? "IN" : "OUT";
    await executor.query(
      `INSERT INTO cash.cash_movements (
         id, business_id, location_id, terminal_id, shift_id, movement_type,
         amount, direction, source_type, source_id, reason_code, notes,
         occurred_at, actor_user_id, device_id, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 $13, $14, $15, $16)`,
      [
        payload.id,
        payload.business_id,
        payload.location_id,
        shift.terminal_id,
        payload.shift_id,
        payload.movement_type,
        payload.amount,
        direction,
        payload.source_type,
        payload.source_id,
        payload.reason_code,
        payload.notes,
        payload.occurred_at,
        payload.actor_user_id,
        input.device_id,
        payload.correlation_id,
      ],
    );
    if (isLate) {
      await executor.query(
        `INSERT INTO cash.shift_reconciliations (
           id, shift_id, reason_type, expected_cash_delta, notes,
           source_type, source_id, created_at, created_by
         ) VALUES (
           $1, $2, 'LATE_CASH_MOVEMENT',
           CASE WHEN $3 = 'IN' THEN $4::numeric ELSE -($4::numeric) END,
           $5, 'CASH_MOVEMENT', $6, CURRENT_TIMESTAMP, $7
         )`,
        [
          crypto.randomUUID(),
          payload.shift_id,
          direction,
          payload.amount,
          "Cash Movement offline diterima setelah Shift ditutup; snapshot penutupan tidak diubah.",
          payload.id,
          context.authorization.user.id,
        ],
      );
    }
    const result = {
      amount: payload.amount,
      movement_id: payload.id,
      movement_type: payload.movement_type,
      warnings,
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "CASH_MOVEMENT_RECORDED",
      after_data: result,
      entity_id: payload.id,
      entity_type: "cash_movement",
      reason: payload.reason_code,
    });
    await appendChange(executor, context, input.command, {
      change_type: "EVENT",
      entity_id: payload.id,
      entity_type: "cash_movement",
      payload: result,
    });
    return result;
  });
}

function readCloseShift(value: unknown): CloseShiftPayload {
  const row = objectValue(value, "payload");
  return {
    actual_cash: money(row.actual_cash, "payload.actual_cash", true),
    created_at: timestampValue(row.created_at, "payload.created_at"),
    id: uuidValue(row.id, "payload.id"),
    location_id: uuidValue(row.location_id, "payload.location_id"),
    shift_id: uuidValue(row.shift_id, "payload.shift_id"),
    variance_reason: nullableStringValue(row.variance_reason, "payload.variance_reason"),
  };
}

export async function closeShiftCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: CashCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "shift.close");
  if (input.command_authorization_version !== context.authorization.authorization_version) {
    throw new ApiError(409, "AUTHORIZATION_STALE", "Otorisasi Shift sudah berubah.");
  }
  const payload = readCloseShift(input.payload);
  if (
    payload.id !== input.command.command_id ||
    payload.location_id !== context.authorization.default_location_id ||
    payload.created_at !== input.command.occurred_at
  ) {
    throw new ApiError(400, "SHIFT_CONTEXT_MISMATCH", "Envelope Close Shift tidak konsisten.");
  }

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const shifts = await executor.query<ShiftRow>(
      `SELECT s.terminal_id, s.location_id, s.cashier_user_id, s.status,
              s.opening_cash::text, s.closed_at,
              (SELECT movement.device_id
               FROM cash.cash_movements movement
               WHERE movement.shift_id = s.id
                 AND movement.business_id = s.business_id
                 AND movement.location_id = s.location_id
                 AND movement.terminal_id = s.terminal_id
                 AND movement.movement_type = 'OPENING_BALANCE'
                 AND movement.source_type = 'SHIFT'
                 AND movement.source_id = s.id
               LIMIT 1) AS opening_device_id
       FROM cash.shifts s
       WHERE s.id = $1 AND s.business_id = $2
       FOR UPDATE`,
      [payload.shift_id, context.authorization.membership.business_id],
    );
    const shift = shifts.rows[0];
    if (
      shift === undefined ||
      shift.location_id !== payload.location_id ||
      (shift.status !== "OPEN" && shift.status !== "CLOSING")
    ) {
      throw new ApiError(409, "INVALID_SHIFT_STATE", "Shift tidak dapat ditutup.");
    }
    assertShiftAuthority(context, input, shift);

    const calculations = await executor.query<ClosingCalculationRow>(
      `WITH movement_totals AS (
         SELECT
           COALESCE(sum(amount) FILTER (WHERE movement_type = 'CASH_SALE'), 0)::text AS cash_sales,
           COALESCE(sum(amount) FILTER (WHERE movement_type = 'CASH_IN'), 0)::text AS cash_in,
           COALESCE(sum(amount) FILTER (WHERE movement_type IN ('CASH_OUT', 'SAFE_DROP')), 0)::text AS cash_out,
           COALESCE(sum(amount) FILTER (WHERE movement_type IN ('CASH_REFUND', 'CASH_REVERSAL')), 0)::text AS cash_refunds
         FROM cash.cash_movements
         WHERE shift_id = $1
       ), transaction_totals AS (
         SELECT
           count(*) FILTER (WHERE status = 'COMPLETED')::integer AS transaction_count,
           count(*) FILTER (WHERE status = 'VOIDED')::integer AS void_count
         FROM sales.transactions
         WHERE shift_id = $1
       ), refund_totals AS (
         SELECT count(*)::integer AS refund_count
         FROM returns.refunds r
         WHERE r.business_id = $2 AND r.shift_id = $1 AND r.status = 'COMPLETED'
           AND r.requested_at <= $3
       )
       SELECT mt.cash_sales, mt.cash_in, mt.cash_out, mt.cash_refunds,
              ($4::numeric + mt.cash_sales::numeric + mt.cash_in::numeric
                - mt.cash_out::numeric - mt.cash_refunds::numeric)::text AS expected_cash,
              tt.transaction_count, tt.void_count, rt.refund_count
       FROM movement_totals mt CROSS JOIN transaction_totals tt CROSS JOIN refund_totals rt`,
      [
        payload.shift_id,
        context.authorization.membership.business_id,
        payload.created_at,
        shift.opening_cash,
      ],
    );
    const calculation = calculations.rows[0];
    if (calculation === undefined) throw new Error("Shift calculation did not return a row.");

    const varianceRows = await executor.query<{
      readonly variance: string;
      readonly variance_type: "MATCHED" | "OVER" | "SHORT";
    }>(
      `SELECT ($1::numeric - $2::numeric)::text AS variance,
              CASE
                WHEN $1::numeric = $2::numeric THEN 'MATCHED'
                WHEN $1::numeric > $2::numeric THEN 'OVER'
                ELSE 'SHORT'
              END AS variance_type`,
      [payload.actual_cash, calculation.expected_cash],
    );
    const variance = varianceRows.rows[0];
    if (variance === undefined) throw new Error("Variance calculation did not return a row.");

    await executor.query(
      `INSERT INTO cash.shift_closing_snapshots (
         id, shift_id, opening_cash, cash_sales, cash_in, cash_out,
         cash_refunds, expected_cash, actual_cash, actual_cash_verified,
         variance, variance_type, reason, transaction_count, void_count,
         refund_count, created_at, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $12,
                 $13, $14, $15, CURRENT_TIMESTAMP, $16)`,
      [
        payload.id,
        payload.shift_id,
        shift.opening_cash,
        calculation.cash_sales,
        calculation.cash_in,
        calculation.cash_out,
        calculation.cash_refunds,
        calculation.expected_cash,
        payload.actual_cash,
        variance.variance,
        variance.variance_type,
        payload.variance_reason,
        calculation.transaction_count,
        calculation.void_count,
        calculation.refund_count,
        context.authorization.user.id,
      ],
    );
    await executor.query(
      `UPDATE cash.shifts
       SET status = 'CLOSED', closing_started_at = COALESCE(closing_started_at, $2), closed_at = $2,
           review_status = CASE WHEN $3 = 'MATCHED' THEN 'UNREVIEWED' ELSE 'REQUIRES_FOLLOW_UP' END
       WHERE id = $1`,
      [payload.shift_id, payload.created_at, variance.variance_type],
    );
    if (variance.variance_type !== "MATCHED") {
      await executor.query(
        `INSERT INTO audit.business_exceptions (
           id, business_id, location_id, domain, exception_type, severity,
           status, source_entity_type, source_entity_id, summary, impact_amount,
           created_at
         ) VALUES ($1, $2, $3, 'CASH', 'SHIFT_VARIANCE', 'REVIEW_REQUIRED',
                   'OPEN', 'cash_shift', $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          crypto.randomUUID(),
          context.authorization.membership.business_id,
          payload.location_id,
          payload.shift_id,
          `Variance Shift ${variance.variance_type}.`,
          variance.variance,
        ],
      );
    }

    const result = {
      actual_cash: payload.actual_cash,
      expected_cash: calculation.expected_cash,
      shift_id: payload.shift_id,
      status: "CLOSED",
      variance: variance.variance,
      variance_type: variance.variance_type,
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "SHIFT_CLOSED",
      after_data: result,
      entity_id: payload.shift_id,
      entity_type: "cash_shift",
      ...(payload.variance_reason === null
        ? {}
        : { reason: payload.variance_reason }),
    });
    await appendChange(executor, context, input.command, {
      change_type: "EVENT",
      entity_id: payload.shift_id,
      entity_type: "cash_shift",
      payload: result,
    });
    return result;
  });
}
