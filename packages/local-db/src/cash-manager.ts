import type { Dexie } from "dexie";
import type { AuthContextResponse, CashMovementType, RecordCashMovementCommand, CompleteShiftClosingCommand, CashMovementDirection } from "@kastur/contracts";
import { parseMoney, moneyAdd, moneySubtract, moneyCompare } from "@kastur/numeric";
import { PosShiftCache } from "./shift-cache.js";
import type { LocalAuditEventRecord } from "./audit-store.js";

export const CASH_MOVEMENT_PERMISSION_DENIED = "CASH_MOVEMENT_PERMISSION_DENIED";
export const SHIFT_NOT_OPEN = "SHIFT_NOT_OPEN";
export const INVALID_AMOUNT = "INVALID_AMOUNT";
export const SHIFT_ALREADY_CLOSING = "SHIFT_ALREADY_CLOSING";
export const INVALID_SHIFT_STATE = "INVALID_SHIFT_STATE";
export const CASH_AUTHORIZATION_EXPIRED = "CASH_AUTHORIZATION_EXPIRED";

function getCashMovementDirection(type: CashMovementType): CashMovementDirection {
  switch (type) {
    case "OPENING_BALANCE":
    case "CASH_SALE":
    case "CASH_IN":
      return "IN";
    case "CASH_OUT":
    case "CASH_REFUND":
    case "CASH_REVERSAL":
    case "SAFE_DROP":
      return "OUT";
  }
}

function getManualCashMovementPermission(
  type: RecordCashMovementCommand["movement_type"],
): "cash.in" | "cash.out" | "cash.safe_drop" {
  switch (type) {
    case "CASH_IN":
      return "cash.in";
    case "CASH_OUT":
      return "cash.out";
    case "SAFE_DROP":
      return "cash.safe_drop";
  }
}

export class CashOperationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CashOperationError";
  }
}

export interface LocalCashMovementRecord {
  readonly id: string;
  readonly shift_id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly movement_type: CashMovementType;
  readonly direction: "IN" | "OUT";
  readonly amount: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly reason_code: string | null;
  readonly notes: string | null;
  readonly occurred_at: string;
  readonly actor_user_id: string;
  readonly correlation_id: string | null;
}

export interface LocalShiftClosingSnapshotRecord {
  readonly id: string;
  readonly shift_id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly expected_cash: string;
  readonly actual_cash: string | null;
  readonly variance: string | null;
  readonly variance_type: "MATCHED" | "SHORT" | "OVER" | null;
  readonly variance_reason: string | null;
  readonly created_at: string;
  readonly created_by: string;
}

export interface LocalShiftClosingPreview {
  readonly actual_cash: string;
  readonly expected_cash: string;
  readonly variance: string;
  readonly variance_type: "MATCHED" | "SHORT" | "OVER";
}

function assertOfflineAuthorization(
  auth: AuthContextResponse,
  occurredAt: string,
): void {
  const validUntil = new Date(auth.offline_valid_until).getTime();
  const commandTime = new Date(occurredAt).getTime();
  if (
    !Number.isFinite(validUntil) ||
    !Number.isFinite(commandTime) ||
    validUntil < commandTime
  ) {
    throw new CashOperationError(
      "Cached authorization has expired.",
      CASH_AUTHORIZATION_EXPIRED,
    );
  }
}

function parseNonNegativeActualCash(value: unknown): string {
  if (typeof value !== "string") {
    throw new CashOperationError("actual_cash must be a string.", INVALID_AMOUNT);
  }
  try {
    const parsed = parseMoney(value);
    if (moneyCompare(parsed, parseMoney("0")) < 0) {
      throw new CashOperationError("actual_cash must be >= 0.", INVALID_AMOUNT);
    }
    return value;
  } catch (error: unknown) {
    if (error instanceof CashOperationError) throw error;
    throw new CashOperationError("actual_cash is not a valid decimal string.", INVALID_AMOUNT);
  }
}

function calculateClosingPreview(
  movements: readonly LocalCashMovementRecord[],
  openingCash: string,
  actualCash: string,
): LocalShiftClosingPreview {
  const hasOpeningBalance = movements.some(
    (movement) => movement.movement_type === "OPENING_BALANCE",
  );
  let expectedCash = hasOpeningBalance ? "0" : openingCash;
  for (const movement of movements) {
    expectedCash = movement.direction === "IN"
      ? moneyAdd(parseMoney(expectedCash), parseMoney(movement.amount))
      : moneySubtract(parseMoney(expectedCash), parseMoney(movement.amount));
  }

  const variance = moneySubtract(parseMoney(actualCash), parseMoney(expectedCash));
  const comparison = moneyCompare(parseMoney(variance), parseMoney("0"));
  return {
    actual_cash: actualCash,
    expected_cash: expectedCash,
    variance,
    variance_type: comparison === 0 ? "MATCHED" : comparison > 0 ? "OVER" : "SHORT",
  };
}

export class PosCashManager {
  constructor(private readonly db: Dexie, private readonly shifts: PosShiftCache) {}

  async getMovementsForShift(
    shiftId: string,
  ): Promise<readonly LocalCashMovementRecord[]> {
    return this.db
      .table<LocalCashMovementRecord>("cash_movements")
      .where("shift_id")
      .equals(shiftId)
      .sortBy("occurred_at");
  }

  async recordCashMovement(
    command: RecordCashMovementCommand,
    auth: AuthContextResponse,
    deviceId: string,
    occurredAt: string
  ): Promise<LocalCashMovementRecord> {
    assertOfflineAuthorization(auth, occurredAt);
    const permissions = new Set(auth.permissions);
    const requiredPermission = getManualCashMovementPermission(command.movement_type);
    if (!permissions.has(requiredPermission)) {
      throw new CashOperationError(
        `Missing ${requiredPermission} permission`,
        CASH_MOVEMENT_PERMISSION_DENIED,
      );
    }

    const businessId = auth.membership.business_id;
    const locationId = auth.default_location_id;
    
    // Retrieve shift
    const shift = await this.shifts.getActiveShift(businessId, locationId, deviceId);
    if (
      !shift ||
      shift.shift_id !== command.shift_id ||
      shift.cashier_user_id !== auth.user.id ||
      shift.status !== "OPEN"
    ) {
      throw new CashOperationError("No active shift matches the provided shift_id", SHIFT_NOT_OPEN);
    }

    // Validate amount
    if (typeof command.amount !== "string") {
      throw new CashOperationError("amount must be a string.", INVALID_AMOUNT);
    }

    let parsedAmount: ReturnType<typeof parseMoney>;
    try {
      parsedAmount = parseMoney(command.amount);
    } catch {
      throw new CashOperationError("amount is not a valid decimal string.", INVALID_AMOUNT);
    }

    if (moneyCompare(parsedAmount, parseMoney("0")) <= 0) {
      throw new CashOperationError("amount must be > 0.", INVALID_AMOUNT);
    }

    const direction = getCashMovementDirection(command.movement_type);
    const movementId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();

    const record: LocalCashMovementRecord = {
      id: movementId,
      shift_id: shift.shift_id,
      business_id: businessId,
      location_id: locationId,
      movement_type: command.movement_type,
      direction,
      amount: command.amount,
      source_type: "MANUAL",
      source_id: movementId,
      reason_code: command.reason_code,
      notes: command.notes,
      occurred_at: occurredAt,
      actor_user_id: auth.user.id,
      correlation_id: correlationId,
    };

    const auditEvent: LocalAuditEventRecord = {
      id: crypto.randomUUID(),
      business_id: businessId,
      location_id: locationId,
      actor_type: "USER",
      actor_user_id: auth.user.id,
      actor_role_snapshot: auth.primary_role ?? null,
      action: "CASH_MOVEMENT_RECORDED",
      entity_type: "CASH_MOVEMENT",
      entity_id: movementId,
      occurred_at: occurredAt,
      recorded_at: new Date().toISOString(),
      device_id: deviceId,
      session_id: null,
      reason: command.reason_code,
      before_data: null,
      after_data: {
        amount: command.amount,
        direction,
        movement_type: command.movement_type,
        notes: command.notes,
        shift_id: shift.shift_id,
      },
      correlation_id: correlationId,
      authorization_version: auth.authorization_version,
      sync_status: "PENDING",
    };

    const outboxRecord = {
      outbox_id: crypto.randomUUID(),
      command_id: movementId,
      business_id: businessId,
      business_event_id: movementId,
      command_type: "cash.movement.record",
      schema_version: 1,
      location_id: locationId,
      device_id: deviceId,
      authorization_version: auth.authorization_version,
      ...(auth.offline_authorization === undefined
        ? {}
        : { offline_authorization: auth.offline_authorization }),
      correlation_id: correlationId,
      occurred_at: occurredAt,
      payload: JSON.stringify({
        ...record,
        authorization_version: auth.authorization_version,
        device_id: deviceId,
      }),
      request_fingerprint: JSON.stringify({ record_cash_movement: movementId }),
      created_at: new Date().toISOString(),
      attempt_count: 0,
      last_attempt_at: null,
      status: "PENDING",
      last_error: null
    };

    await this.db.transaction("rw", [
      this.db.table("cash_movements"),
      this.db.table("audit_events"),
      this.db.table("outbox"),
    ], async () => {
      await this.db.table("cash_movements").add(record);
      await this.db.table("audit_events").add(auditEvent);
      await this.db.table("outbox").add(outboxRecord);
    });

    return record;
  }

  async beginShiftClosing(
    shiftId: string,
    actualCashInput: string,
    auth: AuthContextResponse,
    deviceId: string,
    occurredAt: string,
  ): Promise<LocalShiftClosingPreview> {
    assertOfflineAuthorization(auth, occurredAt);
    const actualCash = parseNonNegativeActualCash(actualCashInput);
    const permissions = new Set(auth.permissions);
    if (!permissions.has("shift.close")) {
      throw new CashOperationError("Missing shift.close permission", CASH_MOVEMENT_PERMISSION_DENIED); // Reuse same code or maybe different? Wait, we can reuse.
    }

    const businessId = auth.membership.business_id;
    const locationId = auth.default_location_id;
    
    // Retrieve shift
    const shift = await this.shifts.getActiveShift(businessId, locationId, deviceId);
    if (
      !shift ||
      shift.shift_id !== shiftId ||
      shift.cashier_user_id !== auth.user.id
    ) {
      throw new CashOperationError("No active shift matches the provided shift_id", SHIFT_NOT_OPEN);
    }

    if (shift.status === "CLOSING") {
      if (shift.blind_actual_cash === null || shift.blind_actual_cash === undefined) {
        await this.shifts.markShiftClosingStarted(shiftId, occurredAt, actualCash);
      } else if (shift.blind_actual_cash !== actualCash) {
        throw new CashOperationError(
          "Actual cash was already submitted for this closing.",
          SHIFT_ALREADY_CLOSING,
        );
      }
    } else if (shift.status === "OPEN") {
      await this.shifts.markShiftClosingStarted(shiftId, occurredAt, actualCash);
    } else {
      throw new CashOperationError("Shift is not open for closing.", INVALID_SHIFT_STATE);
    }

    return calculateClosingPreview(
      await this.getMovementsForShift(shiftId),
      shift.opening_cash,
      actualCash,
    );
  }

  async completeShiftClosing(
    command: CompleteShiftClosingCommand,
    auth: AuthContextResponse,
    deviceId: string,
    occurredAt: string
  ): Promise<LocalShiftClosingSnapshotRecord> {
    assertOfflineAuthorization(auth, occurredAt);
    const permissions = new Set(auth.permissions);
    if (!permissions.has("shift.close")) {
      throw new CashOperationError("Missing shift.close permission", CASH_MOVEMENT_PERMISSION_DENIED);
    }

    const businessId = auth.membership.business_id;
    const locationId = auth.default_location_id;
    
    // Retrieve shift
    const shift = await this.shifts.getActiveShift(businessId, locationId, deviceId);
    if (
      !shift ||
      shift.shift_id !== command.shift_id ||
      shift.cashier_user_id !== auth.user.id
    ) {
      throw new CashOperationError("No active shift matches the provided shift_id", SHIFT_NOT_OPEN);
    }

    const actualCash = parseNonNegativeActualCash(command.actual_cash);
    if (
      shift.status !== "CLOSING" ||
      shift.blind_actual_cash === null ||
      shift.blind_actual_cash === undefined ||
      shift.blind_actual_cash !== actualCash
    ) {
      throw new CashOperationError(
        "Actual cash must be submitted and locked before closing.",
        INVALID_SHIFT_STATE,
      );
    }

    // Retrieve cash movements
    const movements = await this.getMovementsForShift(command.shift_id);

    const preview = calculateClosingPreview(movements, shift.opening_cash, actualCash);

    const snapshotId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();

    const record: LocalShiftClosingSnapshotRecord = {
      id: snapshotId,
      shift_id: command.shift_id,
      business_id: businessId,
      location_id: locationId,
      expected_cash: preview.expected_cash,
      actual_cash: preview.actual_cash,
      variance: preview.variance,
      variance_type: preview.variance_type,
      variance_reason: command.variance_reason,
      created_at: occurredAt,
      created_by: auth.user.id,
    };

    const auditEvent: LocalAuditEventRecord = {
      id: crypto.randomUUID(),
      business_id: businessId,
      location_id: locationId,
      actor_type: "USER",
      actor_user_id: auth.user.id,
      actor_role_snapshot: auth.primary_role ?? null,
      action: "SHIFT_CLOSED",
      entity_type: "CASH_SHIFT",
      entity_id: command.shift_id,
      occurred_at: occurredAt,
      recorded_at: new Date().toISOString(),
      device_id: deviceId,
      session_id: null,
      reason: command.variance_reason,
      before_data: {
        status: shift.status,
      },
      after_data: {
        actual_cash: preview.actual_cash,
        expected_cash: preview.expected_cash,
        status: "CLOSED",
        variance: preview.variance,
        variance_type: preview.variance_type,
      },
      correlation_id: correlationId,
      authorization_version: auth.authorization_version,
      sync_status: "PENDING",
    };

    const outboxRecord = {
      outbox_id: crypto.randomUUID(),
      command_id: snapshotId,
      business_id: businessId,
      business_event_id: command.shift_id,
      command_type: "cash.shift.close",
      schema_version: 1,
      location_id: locationId,
      device_id: deviceId,
      authorization_version: auth.authorization_version,
      ...(auth.offline_authorization === undefined
        ? {}
        : { offline_authorization: auth.offline_authorization }),
      correlation_id: correlationId,
      occurred_at: occurredAt,
      payload: JSON.stringify({
        ...record,
        authorization_version: auth.authorization_version,
        device_id: deviceId,
      }),
      request_fingerprint: JSON.stringify({ close_shift: command.shift_id }),
      created_at: new Date().toISOString(),
      attempt_count: 0,
      last_attempt_at: null,
      status: "PENDING",
      last_error: null
    };

    await this.db.transaction("rw", [
      this.db.table("cash_movements"),
      this.db.table("shift_closing_snapshots"),
      this.db.table("shifts"),
      this.db.table("audit_events"),
      this.db.table("outbox"),
    ], async () => {
      await this.db.table("shift_closing_snapshots").add(record);
      await this.db.table("audit_events").add(auditEvent);
      await this.db.table("outbox").add(outboxRecord);
      await this.shifts.markShiftClosed(command.shift_id, occurredAt);
    });

    return record;
  }
}
