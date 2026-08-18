import type { Dexie } from "dexie";
import type { AuthContextResponse, CashMovementType, RecordCashMovementCommand, CompleteShiftClosingCommand, CashMovementDirection } from "@kastur/contracts";
import { parseMoney, moneyAdd, moneySubtract, moneyCompare } from "@kastur/numeric";
import { PosShiftCache } from "./shift-cache.js";

export const CASH_MOVEMENT_PERMISSION_DENIED = "CASH_MOVEMENT_PERMISSION_DENIED";
export const SHIFT_NOT_OPEN = "SHIFT_NOT_OPEN";
export const INVALID_AMOUNT = "INVALID_AMOUNT";
export const SHIFT_ALREADY_CLOSING = "SHIFT_ALREADY_CLOSING";
export const INVALID_SHIFT_STATE = "INVALID_SHIFT_STATE";

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

export class PosCashManager {
  constructor(private readonly db: Dexie, private readonly shifts: PosShiftCache) {}

  async recordCashMovement(
    command: RecordCashMovementCommand,
    auth: AuthContextResponse,
    deviceId: string,
    occurredAt: string
  ): Promise<LocalCashMovementRecord> {
    const permissions = new Set(auth.permissions);
    if (!permissions.has("cash.movement.create")) {
      throw new CashOperationError("Missing cash.movement.create permission", CASH_MOVEMENT_PERMISSION_DENIED);
    }

    const businessId = auth.membership.business_id;
    const locationId = auth.default_location_id;
    
    // Retrieve shift
    const shift = await this.shifts.getActiveShift(businessId, locationId, deviceId);
    if (!shift || shift.shift_id !== command.shift_id) {
      throw new CashOperationError("No active shift matches the provided shift_id", SHIFT_NOT_OPEN);
    }

    // Validate amount
    if (typeof command.amount !== "string") {
      throw new CashOperationError("amount must be a string.", INVALID_AMOUNT);
    }

    try {
      parseMoney(command.amount);
    } catch {
      throw new CashOperationError("amount is not a valid decimal string.", INVALID_AMOUNT);
    }

    if (command.amount.startsWith("-") || command.amount === "0") {
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

    await this.db.transaction("rw", [this.db.table("cash_movements"), this.db.table("outbox")], async () => {
      await this.db.table("cash_movements").add(record);
      await this.db.table("outbox").add(outboxRecord);
    });

    return record;
  }

  async beginShiftClosing(shiftId: string, auth: AuthContextResponse, deviceId: string): Promise<void> {
    const permissions = new Set(auth.permissions);
    if (!permissions.has("shift.close")) {
      throw new CashOperationError("Missing shift.close permission", CASH_MOVEMENT_PERMISSION_DENIED); // Reuse same code or maybe different? Wait, we can reuse.
    }

    const businessId = auth.membership.business_id;
    const locationId = auth.default_location_id;
    
    // Retrieve shift
    const shift = await this.shifts.getActiveShift(businessId, locationId, deviceId);
    if (!shift || shift.shift_id !== shiftId) {
      throw new CashOperationError("No active shift matches the provided shift_id", SHIFT_NOT_OPEN);
    }
    
    // We update the shift state in PosShiftCache
    await this.shifts.markShiftClosingStarted(shiftId, new Date().toISOString());
  }

  async completeShiftClosing(
    command: CompleteShiftClosingCommand,
    auth: AuthContextResponse,
    deviceId: string,
    occurredAt: string
  ): Promise<LocalShiftClosingSnapshotRecord> {
    const permissions = new Set(auth.permissions);
    if (!permissions.has("shift.close")) {
      throw new CashOperationError("Missing shift.close permission", CASH_MOVEMENT_PERMISSION_DENIED);
    }

    const businessId = auth.membership.business_id;
    const locationId = auth.default_location_id;
    
    // Retrieve shift
    const shift = await this.shifts.getActiveShift(businessId, locationId, deviceId);
    if (!shift || shift.shift_id !== command.shift_id) {
      throw new CashOperationError("No active shift matches the provided shift_id", SHIFT_NOT_OPEN);
    }

    // Retrieve cash movements
    const movements = await this.db.table("cash_movements").where("shift_id").equals(command.shift_id).toArray() as LocalCashMovementRecord[];

    let expectedCash = shift.opening_cash;
    for (const mov of movements) {
      if (mov.direction === "IN") {
        expectedCash = moneyAdd(parseMoney(expectedCash), parseMoney(mov.amount));
      } else {
        expectedCash = moneySubtract(parseMoney(expectedCash), parseMoney(mov.amount));
      }
    }
    
    if (moneyCompare(parseMoney(expectedCash), parseMoney("0")) < 0) {
      expectedCash = "0"; // Should not be negative in drawer conceptually, but ledger could be?
    }

    let variance: string | null = null;
    let varianceType: "MATCHED" | "SHORT" | "OVER" | null = null;
    
    if (command.actual_cash != null) {
      const actual = command.actual_cash;
      const cmp = moneyCompare(parseMoney(actual), parseMoney(expectedCash));
      if (cmp === 0) {
        varianceType = "MATCHED";
        variance = "0";
      } else if (cmp > 0) {
        varianceType = "OVER";
        variance = moneySubtract(parseMoney(actual), parseMoney(expectedCash));
      } else {
        varianceType = "SHORT";
        variance = moneySubtract(parseMoney(expectedCash), parseMoney(actual));
      }
    }

    const snapshotId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();

    const record: LocalShiftClosingSnapshotRecord = {
      id: snapshotId,
      shift_id: command.shift_id,
      business_id: businessId,
      location_id: locationId,
      expected_cash: expectedCash,
      actual_cash: command.actual_cash,
      variance,
      variance_type: varianceType,
      variance_reason: command.variance_reason,
      created_at: occurredAt,
      created_by: auth.user.id,
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

    await this.db.transaction("rw", [this.db.table("cash_movements"), this.db.table("shift_closing_snapshots"), this.db.table("shifts"), this.db.table("outbox")], async () => {
      await this.db.table("shift_closing_snapshots").add(record);
      await this.db.table("outbox").add(outboxRecord);
      await this.shifts.markShiftClosed(command.shift_id, occurredAt);
    });

    return record;
  }
}
