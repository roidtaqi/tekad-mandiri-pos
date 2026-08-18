import type { Dexie } from "dexie";
import type { AuthContextResponse } from "@kastur/contracts";
import { parseMoney } from "@kastur/numeric";

// ─── Stable Error Codes ────────────────────────────────────────────

export const SHIFT_OPEN_PERMISSION_DENIED = "SHIFT_OPEN_PERMISSION_DENIED";
export const SHIFT_AUTHORIZATION_EXPIRED = "SHIFT_AUTHORIZATION_EXPIRED";
export const INVALID_SHIFT_CONTEXT = "INVALID_SHIFT_CONTEXT";
export const INVALID_OPENING_CASH = "INVALID_OPENING_CASH";
export const ACTIVE_SHIFT_ALREADY_EXISTS = "ACTIVE_SHIFT_ALREADY_EXISTS";

export class ShiftOpenError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ShiftOpenError";
  }
}

// ─── Local Shift Record ────────────────────────────────────────────

export interface LocalShiftRecord {
  readonly shift_id: string;
  readonly shift_number: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly cashier_user_id: string;
  readonly device_id: string;
  readonly terminal_id: string | null;
  readonly status: "OPEN";
  readonly sync_status: "PENDING";
  readonly opening_cash: string;
  readonly opened_at: string;
  readonly authorization_version: number;
  readonly active_context_key: string;
}

// ─── Open Shift Input ──────────────────────────────────────────────

export interface OpenShiftInput {
  readonly auth: AuthContextResponse;
  readonly device_id: string;
  readonly terminal_id?: string | null;
  readonly opening_cash: string;
  readonly opened_at: string;
}

// ─── Context Key Builder ───────────────────────────────────────────

export function buildActiveContextKey(
  businessId: string,
  locationId: string,
  deviceId: string,
): string {
  return JSON.stringify([businessId, locationId, deviceId]);
}

// ─── Shift Cache ───────────────────────────────────────────────────

export class PosShiftCache {
  constructor(private readonly db: Dexie) {}

  async openShift(input: OpenShiftInput): Promise<LocalShiftRecord> {
    const { auth, device_id, opening_cash, opened_at } = input;
    const terminal_id = input.terminal_id ?? null;

    // ── Authorization validation ──────────────────────────────────

    const permissions = new Set(auth.permissions);
    if (!permissions.has("workspace.pos.access") || !permissions.has("shift.open")) {
      throw new ShiftOpenError(
        "Requires workspace.pos.access and shift.open permissions.",
        SHIFT_OPEN_PERMISSION_DENIED,
      );
    }

    // Validate offline authorization has not expired
    const offlineValidUntil = new Date(auth.offline_valid_until).getTime();
    const commandTime = new Date(opened_at).getTime();

    if (isNaN(offlineValidUntil) || isNaN(commandTime)) {
      throw new ShiftOpenError(
        "Invalid timestamp in authorization or command.",
        INVALID_SHIFT_CONTEXT,
      );
    }

    if (offlineValidUntil < commandTime) {
      throw new ShiftOpenError(
        "Cached authorization has expired.",
        SHIFT_AUTHORIZATION_EXPIRED,
      );
    }

    // ── Context validation ────────────────────────────────────────

    const business_id = auth.membership.business_id;
    const cashier_user_id = auth.user.id;
    const location_id = auth.default_location_id;

    if (!business_id || typeof business_id !== "string") {
      throw new ShiftOpenError("business_id is required.", INVALID_SHIFT_CONTEXT);
    }
    if (!cashier_user_id || typeof cashier_user_id !== "string") {
      throw new ShiftOpenError("cashier_user_id is required.", INVALID_SHIFT_CONTEXT);
    }
    if (!location_id || typeof location_id !== "string") {
      throw new ShiftOpenError("location_id is required.", INVALID_SHIFT_CONTEXT);
    }
    if (!device_id || typeof device_id !== "string") {
      throw new ShiftOpenError("device_id is required.", INVALID_SHIFT_CONTEXT);
    }

    // ── Opening cash validation ───────────────────────────────────

    if (typeof opening_cash !== "string") {
      throw new ShiftOpenError(
        "opening_cash must be a string.",
        INVALID_OPENING_CASH,
      );
    }

    try {
      parseMoney(opening_cash);
    } catch {
      throw new ShiftOpenError(
        "opening_cash is not a valid decimal string.",
        INVALID_OPENING_CASH,
      );
    }

    // Validate non-negative
    if (opening_cash.startsWith("-")) {
      throw new ShiftOpenError(
        "opening_cash must be >= 0.",
        INVALID_OPENING_CASH,
      );
    }

    // ── Collision-resistant IDs ────────────────────────────────────

    const shift_id = crypto.randomUUID();
    const shift_number = shift_id.split("-")[0]!.toUpperCase();

    // ── Context key for uniqueness ────────────────────────────────

    const active_context_key = buildActiveContextKey(
      business_id,
      location_id,
      device_id,
    );

    // ── Build the shift record ────────────────────────────────────

    const record: LocalShiftRecord = {
      shift_id,
      shift_number,
      business_id,
      location_id,
      cashier_user_id,
      device_id,
      terminal_id,
      status: "OPEN",
      sync_status: "PENDING",
      opening_cash,
      opened_at,
      authorization_version: auth.authorization_version,
      active_context_key,
    };

    // ── Transactional insert with uniqueness enforcement ──────────

    await this.db.transaction("rw", [this.db.table("shifts"), this.db.table("outbox")], async () => {
      // Application-level pre-check for a clear error message
      const existing = await this.db
        .table("shifts")
        .where("active_context_key")
        .equals(active_context_key)
        .first();

      if (existing) {
        throw new ShiftOpenError(
          "An active shift already exists for this operational context.",
          ACTIVE_SHIFT_ALREADY_EXISTS,
        );
      }

      const outboxPayload = JSON.stringify({
        shift_id: record.shift_id,
        shift_number: record.shift_number,
        business_id: record.business_id,
        location_id: record.location_id,
        terminal_id: record.terminal_id,
        cashier_user_id: record.cashier_user_id,
        device_id: record.device_id,
        opening_cash: record.opening_cash,
        opened_at: record.opened_at,
        authorization_version: record.authorization_version,
      });

      const outboxRecord = {
        outbox_id: crypto.randomUUID(),
        command_id: record.shift_id,
        business_id: record.business_id,
        business_event_id: record.shift_id,
        command_type: "cash.shift.open",
        schema_version: 1,
        location_id: record.location_id,
        device_id: record.device_id,
        authorization_version: record.authorization_version,
        correlation_id: crypto.randomUUID(),
        occurred_at: record.opened_at,
        payload: outboxPayload,
        request_fingerprint: JSON.stringify({ open_shift: record.shift_id }),
        created_at: new Date().toISOString(),
        attempt_count: 0,
        last_attempt_at: null,
        status: "PENDING",
        last_error: null
      };

      try {
        await this.db.table("shifts").add(record);
        await this.db.table("outbox").add(outboxRecord);
      } catch (error: unknown) {
        // Map Dexie native ConstraintError to the same stable code
        if (
          error instanceof Error &&
          (error.name === "ConstraintError" || error.message.includes("ConstraintError"))
        ) {
          throw new ShiftOpenError(
            "An active shift already exists for this operational context.",
            ACTIVE_SHIFT_ALREADY_EXISTS,
          );
        }
        throw error;
      }
    });

    return record;
  }

  async getActiveShift(
    businessId: string,
    locationId: string,
    deviceId: string,
  ): Promise<LocalShiftRecord | null> {
    const contextKey = buildActiveContextKey(
      businessId,
      locationId,
      deviceId,
    );

    const record = await this.db
      .table("shifts")
      .where("active_context_key")
      .equals(contextKey)
      .first();

    if (!record || record.status === "CLOSED" || record.status === "FORCED_CLOSED") return null;

    return record as LocalShiftRecord;
  }

  async markShiftClosingStarted(shiftId: string, timestamp: string): Promise<void> {
    await this.db.table("shifts").update(shiftId, {
      status: "CLOSING",
      closing_started_at: timestamp
    });
  }

  async markShiftClosed(shiftId: string, timestamp: string): Promise<void> {
    // When closed, remove active_context_key so a new shift can be opened
    await this.db.table("shifts").update(shiftId, {
      status: "CLOSED",
      closed_at: timestamp,
      active_context_key: null
    });
  }
}

