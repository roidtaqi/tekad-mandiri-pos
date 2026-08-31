import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { AuthContextResponse } from "@kastur/contracts";
import {
  _createPosLocalDatabaseInternal,
  type PosLocalDatabase,
} from "../src/pos-database";
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from "./test-runtime";
import {
  ShiftOpenError,
  SHIFT_OPEN_PERMISSION_DENIED,
  SHIFT_AUTHORIZATION_EXPIRED,
  INVALID_SHIFT_CONTEXT,
  INVALID_OPENING_CASH,
  ACTIVE_SHIFT_ALREADY_EXISTS,
  _setShiftOpenFaultForTest,
  buildActiveContextKey,
  type OpenShiftInput,
} from "../src/shift-cache";

let runtime: TestDatabaseRuntime;
let db: PosLocalDatabase;

function makeAuth(overrides?: Partial<AuthContextResponse>): AuthContextResponse {
  return {
    user: { id: "user-1", display_name: "Kasir 1" },
    membership: { business_id: "biz-1", status: "ACTIVE" },
    primary_role: "CASHIER",
    permissions: ["workspace.pos.access", "shift.open"],
    authorization_version: 1,
    offline_valid_until: "2099-12-31T23:59:59Z",
    default_location_id: "loc-1",
    server_time: "2026-08-17T00:00:00Z",
    ...overrides,
  };
}

function makeInput(overrides?: Partial<OpenShiftInput>): OpenShiftInput {
  return {
    auth: makeAuth(),
    device_id: "dev-1",
    terminal_id: null,
    opening_cash: "500000.0000",
    opened_at: "2026-08-17T08:00:00Z",
    ...overrides,
  };
}

beforeEach(async () => {
  runtime = createTestDatabaseRuntime();
  db = _createPosLocalDatabaseInternal({
    databaseName: runtime.createDatabaseName("shift-cache"),
    dependencies: runtime.dependencies,
  });
  await db.open();
});

afterEach(async () => {
  db.close();
  await runtime.cleanup();
});

// ─── SHIFT-01: Valid offline context opens one OPEN shift ─────────────

test("SHIFT-01: valid offline context opens one OPEN shift with PENDING sync status", async () => {
  const result = await db.shifts.openShift(makeInput());

  expect(result.status).toBe("OPEN");
  expect(result.sync_status).toBe("PENDING");
  expect(result.business_id).toBe("biz-1");
  expect(result.location_id).toBe("loc-1");
  expect(result.cashier_user_id).toBe("user-1");
  expect(result.device_id).toBe("dev-1");
  expect(result.terminal_id).toBeNull();
  expect(result.opening_cash).toBe("500000.0000");
  expect(result.opened_at).toBe("2026-08-17T08:00:00Z");
  expect(result.authorization_version).toBe(1);

  await expect(db.cash.getMovementsForShift(result.shift_id)).resolves.toEqual([
    expect.objectContaining({
      amount: "500000.0000",
      movement_type: "OPENING_BALANCE",
      source_id: result.shift_id,
      source_type: "SHIFT",
    }),
  ]);
  await expect(
    db.audit.getEventsForEntity("biz-1", "CASH_SHIFT", result.shift_id),
  ).resolves.toEqual([
    expect.objectContaining({
      action: "SHIFT_OPENED",
      entity_id: result.shift_id,
    }),
  ]);
  const outbox = await db.sync.getOutboxCommand(result.shift_id);
  expect(outbox).not.toBeNull();
  expect(JSON.parse(outbox!.payload)).toMatchObject({
    payload_version: 1,
    shift: { shift_id: result.shift_id },
    cash_movements: [{ source_id: result.shift_id }],
    audit_events: [{ entity_id: result.shift_id }],
  });
});

test.each([
  "after_shift",
  "after_cash",
  "after_audit",
  "before_outbox",
] as const)("SHIFT-01 atomic rollback at %s leaves no local facts", async (fault) => {
  _setShiftOpenFaultForTest(db.shifts, fault);
  await expect(db.shifts.openShift(makeInput())).rejects.toThrow(`Fault: ${fault}`);
  _setShiftOpenFaultForTest(db.shifts, undefined);

  const rawDatabase = (db as any)._database;
  await expect(
    Promise.all([
      rawDatabase.table("shifts").count(),
      rawDatabase.table("cash_movements").count(),
      rawDatabase.table("audit_events").count(),
      rawDatabase.table("outbox").count(),
    ]),
  ).resolves.toEqual([0, 0, 0, 0]);
});

// ─── SHIFT-02: shift_id is collision-resistant ────────────────────────

test("SHIFT-02: shift_id is collision-resistant; shift_number is not identity", async () => {
  const result = await db.shifts.openShift(makeInput());

  // shift_id is a UUID
  expect(result.shift_id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );

  // shift_number is derived, not identity
  expect(typeof result.shift_number).toBe("string");
  expect(result.shift_number.length).toBeGreaterThan(0);
  expect(result.shift_number).not.toBe(result.shift_id);
});

// ─── SHIFT-03: opening_cash lexical preservation ──────────────────────

test("SHIFT-03: opening_cash '500000.0000' is preserved lexically", async () => {
  const result = await db.shifts.openShift(makeInput());
  expect(result.opening_cash).toBe("500000.0000");
});

// ─── SHIFT-04: zero opening_cash ──────────────────────────────────────

test("SHIFT-04: opening_cash '0.0000' succeeds", async () => {
  const result = await db.shifts.openShift(makeInput({ opening_cash: "0.0000" }));
  expect(result.opening_cash).toBe("0.0000");
});

// ─── SHIFT-05: invalid opening_cash ───────────────────────────────────

describe("SHIFT-05: negative/malformed/non-string opening_cash rejects", () => {
  test("negative opening_cash", async () => {
    await expect(
      db.shifts.openShift(makeInput({ opening_cash: "-100" })),
    ).rejects.toMatchObject({ code: INVALID_OPENING_CASH });
  });

  test("malformed opening_cash", async () => {
    await expect(
      db.shifts.openShift(makeInput({ opening_cash: "abc" })),
    ).rejects.toMatchObject({ code: INVALID_OPENING_CASH });
  });

  test("non-string opening_cash (runtime number)", async () => {
    await expect(
      db.shifts.openShift(makeInput({ opening_cash: 500000 as unknown as string })),
    ).rejects.toMatchObject({ code: INVALID_OPENING_CASH });
  });

  test("empty string opening_cash", async () => {
    await expect(
      db.shifts.openShift(makeInput({ opening_cash: "" })),
    ).rejects.toMatchObject({ code: INVALID_OPENING_CASH });
  });
});

// ─── SHIFT-06: duplicate same context rejects ─────────────────────────

test("SHIFT-06: duplicate same operational context rejects with ACTIVE_SHIFT_ALREADY_EXISTS", async () => {
  await db.shifts.openShift(makeInput());

  await expect(db.shifts.openShift(makeInput())).rejects.toMatchObject({
    code: ACTIVE_SHIFT_ALREADY_EXISTS,
  });
});

// ─── SHIFT-07: different contexts may open independently ──────────────

test("SHIFT-07: different device/location/business contexts may open independently", async () => {
  // Context A: default
  await db.shifts.openShift(makeInput());

  // Context C: different device
  const resultC = await db.shifts.openShift(
    makeInput({
      auth: makeAuth({ user: { id: "user-3", display_name: "Kasir 3" } }),
      device_id: "dev-2",
    }),
  );
  expect(resultC.device_id).toBe("dev-2");

  // Context D: different business
  const resultD = await db.shifts.openShift(
    makeInput({
      auth: makeAuth({
        user: { id: "user-4", display_name: "Kasir 4" },
        membership: { business_id: "biz-2", status: "ACTIVE" },
      }),
    }),
  );
  expect(resultD.business_id).toBe("biz-2");

  // Context E: different location
  const resultE = await db.shifts.openShift(
    makeInput({
      auth: makeAuth({
        user: { id: "user-5", display_name: "Kasir 5" },
        default_location_id: "loc-2",
      }),
    }),
  );
  expect(resultE.location_id).toBe("loc-2");
});

// ─── AUTH-01: workspace.pos.access + shift.open succeeds ──────────────

test("AUTH-01: workspace.pos.access + shift.open succeeds", async () => {
  const result = await db.shifts.openShift(makeInput());
  expect(result.status).toBe("OPEN");
});

// ─── AUTH-02: missing workspace.pos.access rejects ────────────────────

test("AUTH-02: missing workspace.pos.access rejects", async () => {
  const auth = makeAuth({ permissions: ["shift.open"] });
  await expect(
    db.shifts.openShift(makeInput({ auth })),
  ).rejects.toMatchObject({ code: SHIFT_OPEN_PERMISSION_DENIED });
});

// ─── AUTH-03: missing shift.open rejects ──────────────────────────────

test("AUTH-03: missing shift.open rejects", async () => {
  const auth = makeAuth({ permissions: ["workspace.pos.access"] });
  await expect(
    db.shifts.openShift(makeInput({ auth })),
  ).rejects.toMatchObject({ code: SHIFT_OPEN_PERMISSION_DENIED });
});

// ─── AUTH-04: OWNER role label without permissions rejects ─────────────

test("AUTH-04: OWNER role label without permissions rejects", async () => {
  const auth = makeAuth({
    primary_role: "OWNER",
    permissions: [],
  });
  await expect(
    db.shifts.openShift(makeInput({ auth })),
  ).rejects.toMatchObject({ code: SHIFT_OPEN_PERMISSION_DENIED });
});

// ─── AUTH-05: expired offline authorization rejects ────────────────────

test("AUTH-05: expired offline authorization rejects", async () => {
  const auth = makeAuth({
    offline_valid_until: "2020-01-01T00:00:00Z",
  });
  await expect(
    db.shifts.openShift(makeInput({ auth })),
  ).rejects.toMatchObject({ code: SHIFT_AUTHORIZATION_EXPIRED });
});

test("AUTH-05: command timestamp before signed grant issuance rejects", async () => {
  const base = makeAuth();
  const auth = makeAuth({
    offline_authorization: {
      schema_version: 1,
      algorithm: "ECDSA_P256_SHA256",
      key_id: "test-key",
      session_id: "session-1",
      device_id: "dev-1",
      terminal_id: "terminal-1",
      issued_at: "2026-08-17T09:00:00Z",
      offline_valid_until: base.offline_valid_until,
      authorization: {
        user_id: base.user.id,
        business_id: base.membership.business_id,
        primary_role: base.primary_role,
        permissions: base.permissions,
        authorization_version: base.authorization_version,
        default_location_id: base.default_location_id,
      },
      signature: "signed-proof",
    },
  });
  await expect(
    db.shifts.openShift(
      makeInput({ auth, opened_at: "2026-08-17T08:59:59Z" }),
    ),
  ).rejects.toMatchObject({ code: SHIFT_AUTHORIZATION_EXPIRED });
});

// ─── AUTH-06: authorization_version is preserved ──────────────────────

test("AUTH-06: authorization_version is preserved on shift fact", async () => {
  const auth = makeAuth({ authorization_version: 42 });
  const result = await db.shifts.openShift(makeInput({ auth }));
  expect(result.authorization_version).toBe(42);
});

// ─── RACE-01 & RACE-02: concurrent opens ─────────────────────────────

test("RACE-01/02: two concurrent opens for the same context result in exactly one committed OPEN shift", async () => {
  const input = makeInput();

  const results = await Promise.allSettled([
    db.shifts.openShift(input),
    db.shifts.openShift(input),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  expect(fulfilled.length).toBe(1);
  expect(rejected.length).toBe(1);

  const failedReason = (rejected[0] as PromiseRejectedResult).reason;
  expect(failedReason).toBeInstanceOf(ShiftOpenError);
  expect(failedReason.code).toBe(ACTIVE_SHIFT_ALREADY_EXISTS);
});

// ─── READ-01: getActiveShift is exact context-scoped ──────────────────

test("READ-01: getActiveShift is exact Business/Device/Location scoped", async () => {
  await db.shifts.openShift(makeInput());

  // Exact match returns the shift
  const found = await db.shifts.getActiveShift("biz-1", "loc-1", "dev-1");
  expect(found).not.toBeNull();
  expect(found!.shift_id).toBeDefined();

  // Wrong business → null
  expect(await db.shifts.getActiveShift("biz-X", "loc-1", "dev-1")).toBeNull();
  // Wrong location → null
  expect(await db.shifts.getActiveShift("biz-1", "loc-X", "dev-1")).toBeNull();
  // Wrong device → null
  expect(await db.shifts.getActiveShift("biz-1", "loc-1", "dev-X")).toBeNull();
  });

// ─── RST-01: restart preserves all fields exactly ─────────────────────

test("RST-01: restart preserves all Shift Open fields exactly", async () => {
  const result = await db.shifts.openShift(makeInput());

  // Close and reopen
  db.close();
  await db.open();

  const restored = await db.shifts.getActiveShift("biz-1", "loc-1", "dev-1");
  expect(restored).not.toBeNull();
  expect(restored!.shift_id).toBe(result.shift_id);
  expect(restored!.shift_number).toBe(result.shift_number);
  expect(restored!.business_id).toBe("biz-1");
  expect(restored!.location_id).toBe("loc-1");
  expect(restored!.cashier_user_id).toBe("user-1");
  expect(restored!.device_id).toBe("dev-1");
  expect(restored!.terminal_id).toBeNull();
  expect(restored!.opening_cash).toBe("500000.0000");
  expect(restored!.opened_at).toBe("2026-08-17T08:00:00Z");
  expect(restored!.authorization_version).toBe(1);
  expect(restored!.status).toBe("OPEN");
  expect(restored!.sync_status).toBe("PENDING");
  await expect(db.cash.getMovementsForShift(result.shift_id)).resolves.toHaveLength(1);
  await expect(
    db.audit.getEventsForEntity("biz-1", "CASH_SHIFT", result.shift_id),
  ).resolves.toHaveLength(1);
  await expect(db.sync.getOutboxCommand(result.shift_id)).resolves.not.toBeNull();
});

// ─── LOCAL-03: persists through close/reopen ──────────────────────────

test("LOCAL-03: open shift persists through close/reopen", async () => {
  await db.shifts.openShift(makeInput());
  db.close();
  await db.open();

  const shift = await db.shifts.getActiveShift("biz-1", "loc-1", "dev-1");
  expect(shift).not.toBeNull();
  expect(shift!.status).toBe("OPEN");
});

// ─── LOCAL-04: Business A/B coexist ───────────────────────────────────

test("LOCAL-04: Business A/B shift data coexist without clear/overwrite", async () => {
  // Open shift for Business A
  const authA = makeAuth();
  await db.shifts.openShift(makeInput({ auth: authA }));

  // Open shift for Business B
  const authB = makeAuth({
    user: { id: "user-B", display_name: "Kasir B" },
    membership: { business_id: "biz-B", status: "ACTIVE" },
  });
  await db.shifts.openShift(makeInput({ auth: authB, device_id: "dev-B" }));

  const shiftA = await db.shifts.getActiveShift("biz-1", "loc-1", "dev-1");
  const shiftB = await db.shifts.getActiveShift("biz-B", "loc-1", "dev-B");

  expect(shiftA).not.toBeNull();
  expect(shiftB).not.toBeNull();
  expect(shiftA!.business_id).toBe("biz-1");
  expect(shiftB!.business_id).toBe("biz-B");
});

// ─── context key determinism ──────────────────────────────────────────

test("buildActiveContextKey is deterministic and unambiguous", () => {
  const key1 = buildActiveContextKey("b", "l", "d");
  const key2 = buildActiveContextKey("b", "l", "d");
  expect(key1).toBe(key2);
  expect(key1).toBe(JSON.stringify(["b", "l", "d"]));

  // Different order → different key (no naive concatenation collision)
  const key3 = buildActiveContextKey("b", "d", "l");
  expect(key1).not.toBe(key3);
});

// ─── invalid context fields ──────────────────────────────────────────

describe("INVALID_SHIFT_CONTEXT for bad context fields", () => {
  test("empty device_id", async () => {
    await expect(
      db.shifts.openShift(makeInput({ device_id: "" })),
    ).rejects.toMatchObject({ code: INVALID_SHIFT_CONTEXT });
  });

  test("missing business_id via auth", async () => {
    const auth = makeAuth({
      membership: { business_id: "", status: "ACTIVE" },
    });
    await expect(
      db.shifts.openShift(makeInput({ auth })),
    ).rejects.toMatchObject({ code: INVALID_SHIFT_CONTEXT });
  });

  test("missing user id via auth", async () => {
    const auth = makeAuth({
      user: { id: "", display_name: "" },
    });
    await expect(
      db.shifts.openShift(makeInput({ auth })),
    ).rejects.toMatchObject({ code: INVALID_SHIFT_CONTEXT });
  });

  test("missing location_id via auth", async () => {
    const auth = makeAuth({
      default_location_id: "",
    });
    await expect(
      db.shifts.openShift(makeInput({ auth })),
    ).rejects.toMatchObject({ code: INVALID_SHIFT_CONTEXT });
  });
});

// ─── RACE-03: device isolation prevents different cashiers ─────────────

test("RACE-03: device isolation prevents different cashiers from opening concurrent shifts on the same device", async () => {
  const authA = makeAuth({
    user: { id: "user-A", display_name: "Cashier A" },
  });
  await db.shifts.openShift(makeInput({ auth: authA }));

  const authB = makeAuth({
    user: { id: "user-B", display_name: "Cashier B" },
  });
  await expect(
    db.shifts.openShift(makeInput({ auth: authB })),
  ).rejects.toMatchObject({ code: ACTIVE_SHIFT_ALREADY_EXISTS });
});
