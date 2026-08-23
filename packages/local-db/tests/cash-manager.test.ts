import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { _createPosLocalDatabaseInternal, type PosLocalDatabase } from "../src/pos-database.js";
import {
  CASH_AUTHORIZATION_EXPIRED,
  CASH_MOVEMENT_PERMISSION_DENIED,
  INVALID_AMOUNT,
  INVALID_SHIFT_STATE,
  SHIFT_ALREADY_CLOSING,
  SHIFT_NOT_OPEN,
} from "../src/cash-manager.js";
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
    const auth = mockAuth("B1", "U1", ["workspace.pos.access", "shift.open", "cash.in"]);
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

    const auditEvents = await db.audit.getEventsForEntity(
      "B1",
      "CASH_MOVEMENT",
      movement.id,
    );
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: "CASH_MOVEMENT_RECORDED",
      actor_user_id: "U1",
      correlation_id: movement.correlation_id,
      sync_status: "PENDING",
    });
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

  it.each([
    ["CASH_IN", "cash.in"],
    ["CASH_OUT", "cash.out"],
    ["SAFE_DROP", "cash.safe_drop"],
  ] as const)(
    "requires the authoritative %s permission %s",
    async (movementType, requiredPermission) => {
      const deviceId = "D1";
      const auth = mockAuth("B1", "U1", [
        "workspace.pos.access",
        "shift.open",
        requiredPermission,
      ]);
      const shift = await db.shifts.openShift({
        auth,
        device_id: deviceId,
        opening_cash: "100000",
        opened_at: new Date().toISOString(),
      });

      await expect(
        db.cash.recordCashMovement(
          {
            shift_id: shift.shift_id,
            movement_type: movementType,
            amount: "1000",
            reason_code: "TEST",
            notes: null,
          },
          auth,
          deviceId,
          new Date().toISOString(),
        ),
      ).resolves.toMatchObject({ movement_type: movementType });

      const legacyPermissionAuth = mockAuth("B1", "U1", [
        "cash.movement.create",
      ]);
      await expect(
        db.cash.recordCashMovement(
          {
            shift_id: shift.shift_id,
            movement_type: movementType,
            amount: "1000",
            reason_code: "TEST",
            notes: null,
          },
          legacyPermissionAuth,
          deviceId,
          new Date().toISOString(),
        ),
      ).rejects.toMatchObject({ code: CASH_MOVEMENT_PERMISSION_DENIED });
    },
  );

  it("fails if shift is not active", async () => {
    const auth = mockAuth("B1", "U1", ["cash.in"]);
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
    const auth = mockAuth("B1", "U1", ["workspace.pos.access", "shift.open", "cash.in"]);
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

    await expect(
      db.cash.recordCashMovement(
        { shift_id: shift.shift_id, movement_type: "CASH_IN", amount: "0.0000", reason_code: "DEPOSIT", notes: null },
        auth,
        deviceId,
        new Date().toISOString()
      )
    ).rejects.toMatchObject({ code: INVALID_AMOUNT });
  });

  it("can begin and complete shift closing with exact match", async () => {
    const auth = mockAuth("B1", "U1", ["workspace.pos.access", "shift.open", "cash.in", "cash.out", "shift.close"]);
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
    await db.cash.beginShiftClosing(
      shift.shift_id,
      "140000",
      auth,
      deviceId,
      new Date().toISOString(),
    );
    
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

    const closeAuditEvents = await db.audit.getEventsForEntity(
      "B1",
      "CASH_SHIFT",
      shift.shift_id,
    );
    expect(closeAuditEvents.map(({ action }) => action)).toEqual([
      "SHIFT_OPENED",
      "SHIFT_CLOSED",
    ]);
    expect(closeAuditEvents[1]).toMatchObject({
      actor_user_id: "U1",
      sync_status: "PENDING",
    });

    // Verify shift is closed and context is cleared
    const closedShift = await db.shifts.getActiveShift("B1", "LOC1", deviceId);
    expect(closedShift).toBeNull();
  });

  it("derives expected drawer cash from CASH_SALE amount, not tendered cash", async () => {
    const auth = mockAuth("B1", "U1", [
      "workspace.pos.access",
      "pos.use",
      "shift.open",
      "shift.close",
      "transaction.create",
      "transaction.complete",
      "payment.record",
    ]);
    const deviceId = "D1";
    const shift = await db.shifts.openShift({
      auth,
      device_id: deviceId,
      terminal_id: "T1",
      opening_cash: "1000",
      opened_at: "2026-08-17T00:00:00Z",
    });

    const completed = await db.sales.completeSale({
      auth,
      device_id: deviceId,
      command_id: "cash-sale-command",
      occurred_at: "2026-08-17T01:00:00Z",
      cart: {
        business_id: "B1",
        lines: [
          {
            product_id: "P1",
            product_unit_id: "PU1",
            product_name: "Produk",
            unit_code: "PCS",
            variant_name: "Satuan",
            sku: "SKU1",
            barcode: null,
            allow_decimal_qty: false,
            price_version_id: "PV1",
            price_effective_from: "2026-08-01T00:00:00Z",
            quantity: "2",
            unit_price: "100",
            base_unit_price: "100",
            tier_id: "tier-retail",
            tier_code: "RETAIL",
            tier_min_qty: "1",
            tier_unit_price: "100",
            promotion_id: null,
            promotion_type: null,
            promotion_value: null,
            promotion_discount: "0",
            pricing_resolved_at: "2026-08-17T01:00:00Z",
            pricing_time_status: "TRUSTED",
            line_total: "200",
            conversion_factor: "1",
            track_inventory: true,
          },
        ],
      },
      amount_tendered: "500",
    });

    const aggregate = await db.sales.getCompletedSale(completed.transaction_id);
    expect(aggregate.cash_movements).toHaveLength(1);
    expect(aggregate.cash_movements[0]).toMatchObject({
      amount: "200",
      direction: "IN",
      movement_type: "CASH_SALE",
      source_id: completed.transaction_id,
      source_type: "SALE_TRANSACTION",
    });

    await db.cash.beginShiftClosing(
      shift.shift_id,
      "1200",
      auth,
      deviceId,
      "2026-08-17T01:59:00Z",
    );
    const snapshot = await db.cash.completeShiftClosing(
      {
        shift_id: shift.shift_id,
        actual_cash: "1200",
        variance_reason: null,
      },
      auth,
      deviceId,
      "2026-08-17T02:00:00Z",
    );

    expect(snapshot.expected_cash).toBe("1200");
    expect(snapshot.variance_type).toBe("MATCHED");
  });

  it("preserves a negative ledger-derived expected cash instead of clamping it", async () => {
    const auth = mockAuth("B1", "U1", [
      "workspace.pos.access",
      "shift.open",
      "shift.close",
      "cash.out",
    ]);
    const deviceId = "D1";
    const shift = await db.shifts.openShift({
      auth,
      device_id: deviceId,
      opening_cash: "0",
      opened_at: "2026-08-17T00:00:00Z",
    });
    await db.cash.recordCashMovement(
      {
        shift_id: shift.shift_id,
        movement_type: "CASH_OUT",
        amount: "100",
        reason_code: "TEST",
        notes: null,
      },
      auth,
      deviceId,
      "2026-08-17T01:00:00Z",
    );
    await db.cash.beginShiftClosing(
      shift.shift_id,
      "0",
      auth,
      deviceId,
      "2026-08-17T01:59:00Z",
    );

    const snapshot = await db.cash.completeShiftClosing(
      {
        shift_id: shift.shift_id,
        actual_cash: "0",
        variance_reason: "Ledger tetap negatif",
      },
      auth,
      deviceId,
      "2026-08-17T02:00:00Z",
    );

    expect(snapshot.expected_cash).toBe("-100");
    expect(snapshot.variance_type).toBe("OVER");
    expect(snapshot.variance).toBe("100");
  });

  it("locks the blind actual count before revealing expected cash", async () => {
    const auth = mockAuth("B1", "U1", [
      "workspace.pos.access",
      "shift.open",
      "shift.close",
      "cash.in",
    ]);
    const deviceId = "D1";
    const shift = await db.shifts.openShift({
      auth,
      device_id: deviceId,
      opening_cash: "100",
      opened_at: "2026-08-23T00:00:00Z",
    });

    const preview = await db.cash.beginShiftClosing(
      shift.shift_id,
      "100",
      auth,
      deviceId,
      "2026-08-23T01:00:00Z",
    );
    expect(preview).toMatchObject({
      actual_cash: "100",
      expected_cash: "100",
      variance: "0",
      variance_type: "MATCHED",
    });
    await expect(db.shifts.getActiveShift("B1", "LOC1", deviceId)).resolves.toMatchObject({
      status: "CLOSING",
      blind_actual_cash: "100",
      blind_counted_at: "2026-08-23T01:00:00Z",
    });

    await expect(
      db.cash.beginShiftClosing(
        shift.shift_id,
        "101",
        auth,
        deviceId,
        "2026-08-23T01:01:00Z",
      ),
    ).rejects.toMatchObject({ code: SHIFT_ALREADY_CLOSING });
    await expect(
      db.cash.recordCashMovement(
        {
          shift_id: shift.shift_id,
          movement_type: "CASH_IN",
          amount: "1",
          reason_code: "TOO_LATE",
          notes: null,
        },
        auth,
        deviceId,
        "2026-08-23T01:01:00Z",
      ),
    ).rejects.toMatchObject({ code: SHIFT_NOT_OPEN });
  });

  it("requires an unexpired authorization for every offline cash mutation", async () => {
    const validAuth = mockAuth("B1", "U1", [
      "workspace.pos.access",
      "shift.open",
      "shift.close",
      "cash.in",
    ]);
    const deviceId = "D1";
    const shift = await db.shifts.openShift({
      auth: validAuth,
      device_id: deviceId,
      opening_cash: "100",
      opened_at: "2026-08-23T00:00:00Z",
    });
    const expiredAuth = {
      ...validAuth,
      offline_valid_until: "2026-08-23T00:30:00Z",
    };

    await expect(
      db.cash.recordCashMovement(
        {
          shift_id: shift.shift_id,
          movement_type: "CASH_IN",
          amount: "1",
          reason_code: "EXPIRED",
          notes: null,
        },
        expiredAuth,
        deviceId,
        "2026-08-23T01:00:00Z",
      ),
    ).rejects.toMatchObject({ code: CASH_AUTHORIZATION_EXPIRED });
    await expect(
      db.cash.beginShiftClosing(
        shift.shift_id,
        "100",
        expiredAuth,
        deviceId,
        "2026-08-23T01:00:00Z",
      ),
    ).rejects.toMatchObject({ code: CASH_AUTHORIZATION_EXPIRED });

    await db.cash.beginShiftClosing(
      shift.shift_id,
      "100",
      validAuth,
      deviceId,
      "2026-08-23T00:20:00Z",
    );
    await expect(
      db.cash.completeShiftClosing(
        {
          shift_id: shift.shift_id,
          actual_cash: "100",
          variance_reason: null,
        },
        expiredAuth,
        deviceId,
        "2026-08-23T01:00:00Z",
      ),
    ).rejects.toMatchObject({ code: CASH_AUTHORIZATION_EXPIRED });
  });

  it("rejects close completion until the submitted actual is locked", async () => {
    const auth = mockAuth("B1", "U1", [
      "workspace.pos.access",
      "shift.open",
      "shift.close",
    ]);
    const deviceId = "D1";
    const shift = await db.shifts.openShift({
      auth,
      device_id: deviceId,
      opening_cash: "100",
      opened_at: "2026-08-23T00:00:00Z",
    });

    await expect(
      db.cash.completeShiftClosing(
        {
          shift_id: shift.shift_id,
          actual_cash: "100",
          variance_reason: null,
        },
        auth,
        deviceId,
        "2026-08-23T01:00:00Z",
      ),
    ).rejects.toMatchObject({ code: INVALID_SHIFT_STATE });

    await db.cash.beginShiftClosing(
      shift.shift_id,
      "100",
      auth,
      deviceId,
      "2026-08-23T01:00:00Z",
    );
    await expect(
      db.cash.completeShiftClosing(
        {
          shift_id: shift.shift_id,
          actual_cash: "99",
          variance_reason: null,
        },
        auth,
        deviceId,
        "2026-08-23T01:01:00Z",
      ),
    ).rejects.toMatchObject({ code: INVALID_SHIFT_STATE });
  });
});
