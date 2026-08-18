import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { _createPosLocalDatabaseInternal, type PosLocalDatabase } from "../src/pos-database.js";
import { CASH_MOVEMENT_PERMISSION_DENIED, SHIFT_NOT_OPEN, INVALID_AMOUNT } from "../src/cash-manager.js";
import { AuthContextResponse } from "@kastur/contracts";
import { createTestDatabaseRuntime, type TestDatabaseRuntime } from "./test-runtime";

const mockAuth = (business_id: string, user_id: string, permissions: string[]): AuthContextResponse => ({
  user: { id: user_id, display_name: "Test" },
  membership: { business_id, status: "ACTIVE" },
  permissions,
  primary_role: "CASHIER",
  default_location_id: "LOC1",
  authorization_version: 1,
  offline_valid_until: new Date(Date.now() + 86400000).toISOString(),
  server_time: new Date().toISOString(),
});

describe("PosCashManager", () => {
  let runtime: TestDatabaseRuntime;
  let db: PosLocalDatabase;

  beforeEach(async () => {
    runtime = createTestDatabaseRuntime();
    db = runtime.track(
      _createPosLocalDatabaseInternal({
        databaseName: `test-cash-manager-${crypto.randomUUID()}`,
        dependencies: runtime.dependencies,
      })
    );
    await db.open();
  });

  afterEach(() => {
    runtime.cleanup();
  });

  it("records a valid cash movement", async () => {
    const auth = mockAuth("B1", "U1", ["workspace.pos.access", "shift.open", "cash.movement.create"]);
    const deviceId = "D1";
    
    // Open shift first
    const shift = await db.shifts.openShift({
      auth,
      device_id: deviceId,
      opening_cash: "100000",
      opened_at: new Date().toISOString(),
    });

    const movement = await db.cash.recordCashMovement(
      { shift_id: shift.shift_id, movement_type: "CASH_IN", amount: "50000", reason_code: "DEPOSIT", notes: "Test" },
      auth,
      deviceId,
      new Date().toISOString()
    );

    expect(movement.shift_id).toBe(shift.shift_id);
    expect(movement.amount).toBe("50000");
    expect(movement.direction).toBe("IN");
    expect(movement.movement_type).toBe("CASH_IN");
    expect(movement.actor_user_id).toBe("U1");
    expect(movement.business_id).toBe("B1");
    expect(movement.location_id).toBe("LOC1");
  });

  it("fails if permission is missing", async () => {
    const auth = mockAuth("B1", "U1", ["workspace.pos.access", "shift.open"]);
    const deviceId = "D1";

    await expect(
      db.cash.recordCashMovement(
        { shift_id: "s1", movement_type: "CASH_IN", amount: "50000", reason_code: "DEPOSIT", notes: null },
        auth,
        deviceId,
        new Date().toISOString()
      )
    ).rejects.toMatchObject({ code: CASH_MOVEMENT_PERMISSION_DENIED });
  });

  it("fails if shift is not active", async () => {
    const auth = mockAuth("B1", "U1", ["cash.movement.create"]);
    const deviceId = "D1";

    await expect(
      db.cash.recordCashMovement(
        { shift_id: "s1", movement_type: "CASH_IN", amount: "50000", reason_code: "DEPOSIT", notes: null },
        auth,
        deviceId,
        new Date().toISOString()
      )
    ).rejects.toMatchObject({ code: SHIFT_NOT_OPEN });
  });

  it("fails if amount is invalid", async () => {
    const auth = mockAuth("B1", "U1", ["workspace.pos.access", "shift.open", "cash.movement.create"]);
    const deviceId = "D1";
    
    const shift = await db.shifts.openShift({
      auth,
      device_id: deviceId,
      opening_cash: "100000",
      opened_at: new Date().toISOString(),
    });

    await expect(
      db.cash.recordCashMovement(
        { shift_id: shift.shift_id, movement_type: "CASH_IN", amount: "-5000", reason_code: "DEPOSIT", notes: null },
        auth,
        deviceId,
        new Date().toISOString()
      )
    ).rejects.toMatchObject({ code: INVALID_AMOUNT });

    await expect(
      db.cash.recordCashMovement(
        { shift_id: shift.shift_id, movement_type: "CASH_IN", amount: "0", reason_code: "DEPOSIT", notes: null },
        auth,
        deviceId,
        new Date().toISOString()
      )
    ).rejects.toMatchObject({ code: INVALID_AMOUNT });
  });

  it("can begin and complete shift closing with exact match", async () => {
    const auth = mockAuth("B1", "U1", ["workspace.pos.access", "shift.open", "cash.movement.create", "shift.close"]);
    const deviceId = "D1";
    const openedAt = new Date().toISOString();
    
    // Open shift
    const shift = await db.shifts.openShift({
      auth,
      device_id: deviceId,
      opening_cash: "100000",
      opened_at: openedAt,
    });

    // Record cash in
    await db.cash.recordCashMovement(
      { shift_id: shift.shift_id, movement_type: "CASH_IN", amount: "50000", reason_code: "", notes: null },
      auth,
      deviceId,
      new Date().toISOString()
    );

    // Record cash out
    await db.cash.recordCashMovement(
      { shift_id: shift.shift_id, movement_type: "CASH_OUT", amount: "10000", reason_code: "EXPENSE", notes: null },
      auth,
      deviceId,
      new Date().toISOString()
    );

    // Begin close
    await db.cash.beginShiftClosing(shift.shift_id, auth, deviceId);
    
    const activeShift = await db.shifts.getActiveShift("B1", "LOC1", deviceId);
    expect(activeShift?.status).toBe("CLOSING");

    // Complete close (expected: 100k + 50k - 10k = 140k)
    const snapshot = await db.cash.completeShiftClosing(
      {
        shift_id: shift.shift_id,
        actual_cash: "140000",
        variance_reason: null
      },
      auth,
      deviceId,
      new Date().toISOString()
    );

    expect(snapshot.expected_cash).toBe("140000");
    expect(snapshot.actual_cash).toBe("140000");
    expect(snapshot.variance_type).toBe("MATCHED");
    expect(snapshot.variance).toBe("0");

    // Verify shift is closed and context is cleared
    const closedShift = await db.shifts.getActiveShift("B1", "LOC1", deviceId);
    expect(closedShift).toBeNull();
  });
});
