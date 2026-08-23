import {
  decimalAbs,
  decimalCompare,
  decimalMultiply,
  decimalNegate,
  parseDecimal,
  type DecimalValue,
} from "@kastur/numeric";

import type { AuthenticatedRequestContext } from "./auth.js";
import { requirePermission } from "./auth.js";
import {
  appendAuditEvent,
  appendChange,
  executeIdempotent,
  type CommandIdentity,
} from "./command-support.js";
import type { RequestDatabase, SqlExecutor } from "./database.js";
import { ApiError } from "./http.js";
import {
  assertFreshAuthorization,
  decimalValue,
  requireCommandLocation,
} from "./operational-values.js";
import {
  arrayValue,
  enumValue,
  integerValue,
  nullableStringValue,
  objectValue,
  stringValue,
  timestampValue,
  uuidValue,
  validationError,
} from "./validation.js";

const ZERO = parseDecimal("0");

export interface InventoryCommandInput {
  readonly command: CommandIdentity;
  readonly command_authorization_version: number;
  readonly device_id: string;
  readonly payload: unknown;
}

interface AdjustmentItem {
  readonly conversion_snapshot: DecimalValue;
  readonly item_id: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly quantity: DecimalValue;
}

interface AdjustmentPayload {
  readonly adjustment_id: string;
  readonly adjustment_number: string;
  readonly direction: "IN" | "OUT";
  readonly items: readonly AdjustmentItem[];
  readonly notes: string | null;
  readonly reason_code: "DAMAGED" | "LOST" | "FOUND" | "DATA_CORRECTION" | "EXPIRED" | "OTHER";
}

interface UnitRow {
  readonly conversion_factor: string;
  readonly product_id: string;
}

interface CostRow {
  readonly mwa_unit_cost: string | null;
}

interface StockBalanceProjectionRow {
  readonly base_quantity: string;
  readonly business_id: string;
  readonly last_movement_id: string;
  readonly location_id: string;
  readonly product_id: string;
  readonly updated_at: Date | string;
}

interface OpnameCreatePayload {
  readonly opname_id: string;
  readonly opname_number: string;
  readonly product_ids: readonly string[];
  readonly scope_type: string;
}

interface OpnameCountItem {
  readonly counted_at: string;
  readonly physical_qty: DecimalValue;
  readonly product_id: string;
}

interface OpnameCountPayload {
  readonly expected_version: number;
  readonly items: readonly OpnameCountItem[];
  readonly opname_id: string;
}

interface OpnameTransitionPayload {
  readonly expected_version: number;
  readonly opname_id: string;
  readonly notes: string | null;
}

interface OpnameRow {
  readonly location_id: string;
  readonly status: string;
  readonly version: string;
}

interface OpnameItemRow {
  readonly count_movement_sequence: string | null;
  readonly counted_at: Date | string | null;
  readonly id: string;
  readonly physical_qty: string | null;
  readonly product_id: string;
  readonly recount_recommended: boolean;
  readonly system_qty_at_count: string | null;
  readonly variance_qty: string | null;
}

export async function appendStockBalanceProjection(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  command: CommandIdentity,
  input: {
    readonly business_id: string;
    readonly last_movement_id: string;
    readonly location_id: string;
    readonly product_id: string;
  },
): Promise<void> {
  if (
    input.business_id !== context.authorization.membership.business_id ||
    input.location_id !== command.location_id
  ) {
    throw new Error("Stock Balance projection context does not match its command.");
  }
  const balances = await executor.query<StockBalanceProjectionRow>(
    `SELECT business_id, location_id, product_id, base_quantity::text,
            last_movement_id, updated_at
     FROM inventory.stock_balances
     WHERE business_id = $1 AND location_id = $2 AND product_id = $3
       AND last_movement_id = $4`,
    [
      input.business_id,
      input.location_id,
      input.product_id,
      input.last_movement_id,
    ],
  );
  const balance = balances.rows[0];
  if (balance === undefined) {
    throw new Error("Stock Balance projection is missing its authoritative movement.");
  }
  const updatedAt =
    balance.updated_at instanceof Date
      ? balance.updated_at.toISOString()
      : new Date(balance.updated_at).toISOString();
  await appendChange(executor, context, command, {
    change_type: "UPSERT",
    entity_id: balance.product_id,
    entity_type: "stock_balance",
    payload: {
      base_quantity: balance.base_quantity,
      business_id: balance.business_id,
      last_movement_id: balance.last_movement_id,
      location_id: balance.location_id,
      product_id: balance.product_id,
      updated_at: updatedAt,
    },
  });
}

function quantity(value: unknown, field: string, allowZero = false): DecimalValue {
  return decimalValue(value, field, { allowZero, precision: 20, scale: 6 });
}

function factor(value: unknown, field: string): DecimalValue {
  return decimalValue(value, field, { precision: 20, scale: 8 });
}

function readAdjustmentItem(value: unknown, index: number): AdjustmentItem {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  return {
    conversion_snapshot: factor(row.conversion_snapshot, `${field}.conversion_snapshot`),
    item_id: uuidValue(row.item_id, `${field}.item_id`),
    product_id: uuidValue(row.product_id, `${field}.product_id`),
    product_unit_id: uuidValue(row.product_unit_id, `${field}.product_unit_id`),
    quantity: quantity(row.quantity, `${field}.quantity`),
  };
}

function readAdjustment(value: unknown): AdjustmentPayload {
  const row = objectValue(value, "payload");
  const adjustmentId = uuidValue(row.adjustment_id, "payload.adjustment_id");
  const items = arrayValue(row.items, "payload.items").map(readAdjustmentItem);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  return {
    adjustment_id: adjustmentId,
    adjustment_number:
      row.adjustment_number === undefined
        ? `ADJ-${adjustmentId.replaceAll("-", "").slice(0, 12).toUpperCase()}`
        : stringValue(row.adjustment_number, "payload.adjustment_number"),
    direction: enumValue(row.direction, "payload.direction", ["IN", "OUT"] as const),
    items,
    notes: nullableStringValue(row.notes, "payload.notes"),
    reason_code: enumValue(row.reason_code, "payload.reason_code", [
      "DAMAGED",
      "LOST",
      "FOUND",
      "DATA_CORRECTION",
      "EXPIRED",
      "OTHER",
    ] as const),
  };
}

async function assertUnit(
  executor: SqlExecutor,
  businessId: string,
  item: AdjustmentItem,
): Promise<void> {
  const rows = await executor.query<UnitRow>(
    `SELECT product_id, conversion_factor::text
     FROM catalog.product_units
     WHERE id = $1 AND business_id = $2 AND status = 'ACTIVE'`,
    [item.product_unit_id, businessId],
  );
  const unit = rows.rows[0];
  if (
    unit === undefined ||
    unit.product_id !== item.product_id ||
    parseDecimal(unit.conversion_factor) !== item.conversion_snapshot
  ) {
    throw new ApiError(
      409,
      "INVENTORY_UNIT_MISMATCH",
      "Product Unit atau snapshot konversi tidak cocok.",
    );
  }
}

async function appendInventoryCostEffect(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  input: InventoryCommandInput,
  productId: string,
  sourceType: string,
  sourceId: string,
  quantityDelta: DecimalValue,
  reason: string | null,
): Promise<string | null> {
  const businessId = context.authorization.membership.business_id;
  const locationId = input.command.location_id as string;
  const state = await executor.query<CostRow>(
    `SELECT mwa_unit_cost::text FROM costing.product_cost_states
     WHERE business_id = $1 AND location_id = $2 AND product_id = $3
     FOR UPDATE`,
    [businessId, locationId, productId],
  );
  const cost = state.rows[0]?.mwa_unit_cost;
  if (cost === null || cost === undefined) return null;
  const id = crypto.randomUUID();
  await executor.query(
    `INSERT INTO costing.cost_events (
       id, business_id, location_id, product_id, event_type, quantity_basis,
       unit_cost_before, unit_cost_after, value_delta, source_type, source_id,
       reason, occurred_at, actor_user_id, correlation_id
     ) VALUES ($1, $2, $3, $4, 'STOCK_ADJUSTMENT', $5, $6, $6, $7,
               $8, $9, $10, $11, $12, $13)`,
    [
      id,
      businessId,
      locationId,
      productId,
      decimalAbs(quantityDelta),
      cost,
      decimalMultiply(quantityDelta, parseDecimal(cost)),
      sourceType,
      sourceId,
      reason,
      input.command.occurred_at,
      context.authorization.user.id,
      input.command.correlation_id,
    ],
  );
  return id;
}

export async function adjustInventoryCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: InventoryCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "inventory.adjust");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readAdjustment(input.payload);
  const businessId = context.authorization.membership.business_id;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    await executor.query(
      `INSERT INTO inventory.stock_adjustments (
         id, business_id, location_id, adjustment_number, direction, reason_code,
         notes, created_by, created_at, posted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        payload.adjustment_id,
        businessId,
        locationId,
        payload.adjustment_number,
        payload.direction,
        payload.reason_code,
        payload.notes,
        context.authorization.user.id,
      ],
    );
    const movements: Array<Readonly<Record<string, unknown>>> = [];
    for (const item of payload.items) {
      await assertUnit(executor, businessId, item);
      const baseQuantity = decimalMultiply(item.quantity, item.conversion_snapshot);
      const delta = payload.direction === "IN" ? baseQuantity : decimalNegate(baseQuantity);
      const cost = await executor.query<CostRow>(
        `SELECT mwa_unit_cost::text FROM costing.product_cost_states
         WHERE business_id = $1 AND location_id = $2 AND product_id = $3`,
        [businessId, locationId, item.product_id],
      );
      await executor.query(
        `INSERT INTO inventory.stock_adjustment_items (
           id, adjustment_id, product_id, source_unit_id, qty,
           conversion_snapshot, base_qty, cost_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          item.item_id,
          payload.adjustment_id,
          item.product_id,
          item.product_unit_id,
          item.quantity,
          item.conversion_snapshot,
          baseQuantity,
          cost.rows[0]?.mwa_unit_cost ?? null,
        ],
      );
      const movementId = crypto.randomUUID();
      const movementType = payload.direction === "IN" ? "STOCK_ADJUSTMENT_IN" : "STOCK_ADJUSTMENT_OUT";
      await executor.query(
        `INSERT INTO inventory.stock_movements (
           id, business_id, location_id, product_id, movement_type,
           base_quantity_delta, source_unit_id, source_quantity, conversion_snapshot,
           source_type, source_id, source_line_id, reason_code, occurred_at,
           actor_user_id, device_id, correlation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                   'STOCK_ADJUSTMENT', $10, $11, $12, $13, $14, $15, $16)`,
        [
          movementId,
          businessId,
          locationId,
          item.product_id,
          movementType,
          delta,
          item.product_unit_id,
          item.quantity,
          item.conversion_snapshot,
          payload.adjustment_id,
          item.item_id,
          payload.reason_code,
          input.command.occurred_at,
          context.authorization.user.id,
          input.device_id,
          input.command.correlation_id,
        ],
      );
      await executor.query(
        `INSERT INTO inventory.stock_balances (
           business_id, location_id, product_id, base_quantity, last_movement_id, updated_at
         ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (business_id, location_id, product_id) DO UPDATE
         SET base_quantity = inventory.stock_balances.base_quantity + EXCLUDED.base_quantity,
             last_movement_id = EXCLUDED.last_movement_id,
             updated_at = CURRENT_TIMESTAMP`,
        [businessId, locationId, item.product_id, delta, movementId],
      );
      await appendStockBalanceProjection(executor, context, input.command, {
        business_id: businessId,
        last_movement_id: movementId,
        location_id: locationId,
        product_id: item.product_id,
      });
      await appendInventoryCostEffect(
        executor,
        context,
        input,
        item.product_id,
        "STOCK_ADJUSTMENT_ITEM",
        item.item_id,
        delta,
        payload.notes ?? payload.reason_code,
      );
      const projection = { base_quantity_delta: delta, id: movementId, product_id: item.product_id } as const;
      movements.push(projection);
      await appendChange(executor, context, input.command, {
        change_type: "EVENT",
        entity_id: movementId,
        entity_type: "stock_movement",
        payload: projection,
      });
    }
    const result = {
      adjustment_id: payload.adjustment_id,
      movements,
      status: "POSTED",
      warnings: [] as readonly string[],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "INVENTORY_ADJUSTED",
      after_data: result,
      entity_id: payload.adjustment_id,
      entity_type: "stock_adjustment",
      reason: payload.notes ?? payload.reason_code,
    });
    await appendChange(executor, context, input.command, {
      change_type: "EVENT",
      entity_id: payload.adjustment_id,
      entity_type: "stock_adjustment",
      payload: result,
    });
    return result;
  });
}

function readOpnameCreate(value: unknown): OpnameCreatePayload {
  const row = objectValue(value, "payload");
  return {
    opname_id: uuidValue(row.opname_id, "payload.opname_id"),
    opname_number: stringValue(row.opname_number, "payload.opname_number"),
    product_ids: arrayValue(row.product_ids ?? [], "payload.product_ids").map((id, index) =>
      uuidValue(id, `payload.product_ids[${index}]`),
    ),
    scope_type: stringValue(row.scope_type, "payload.scope_type"),
  };
}

export async function createOpnameCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: InventoryCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "inventory.opname.create");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readOpnameCreate(input.payload);
  const businessId = context.authorization.membership.business_id;
  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const products = payload.product_ids.length === 0
      ? await executor.query<{ readonly id: string }>(
          `SELECT id FROM catalog.products
           WHERE business_id = $1 AND status = 'ACTIVE' AND track_inventory = TRUE
           ORDER BY id`,
          [businessId],
        )
      : await executor.query<{ readonly id: string }>(
          `SELECT id FROM catalog.products
           WHERE business_id = $1 AND status = 'ACTIVE' AND track_inventory = TRUE
             AND id = ANY($2::uuid[])
           ORDER BY id`,
          [businessId, payload.product_ids],
        );
    if (products.rows.length === 0 || (payload.product_ids.length > 0 && products.rows.length !== new Set(payload.product_ids).size)) {
      throw new ApiError(404, "OPNAME_PRODUCT_NOT_FOUND", "Produk scope Opname tidak valid.");
    }
    await executor.query(
      `INSERT INTO inventory.opname_sessions (
         id, business_id, location_id, opname_number, status, scope_type,
         created_by, created_at, version
       ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, CURRENT_TIMESTAMP, 1)`,
      [
        payload.opname_id,
        businessId,
        locationId,
        payload.opname_number,
        payload.scope_type,
        context.authorization.user.id,
      ],
    );
    for (const product of products.rows) {
      await executor.query(
        `INSERT INTO inventory.opname_items (
           id, opname_session_id, product_id, count_revision, recount_recommended
         ) VALUES ($1, $2, $3, 0, FALSE)`,
        [crypto.randomUUID(), payload.opname_id, product.id],
      );
    }
    const result = {
      item_count: products.rows.length,
      opname_id: payload.opname_id,
      status: "DRAFT",
      version: "1",
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "OPNAME_CREATED",
      after_data: result,
      entity_id: payload.opname_id,
      entity_type: "opname_session",
    });
    await appendChange(executor, context, input.command, {
      change_type: "UPSERT",
      entity_id: payload.opname_id,
      entity_type: "opname_session",
      entity_version: "1",
      payload: result,
    });
    return result;
  });
}

function readOpnameCountItem(value: unknown, index: number): OpnameCountItem {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  return {
    counted_at: timestampValue(row.counted_at, `${field}.counted_at`),
    physical_qty: quantity(row.physical_qty, `${field}.physical_qty`, true),
    product_id: uuidValue(row.product_id, `${field}.product_id`),
  };
}

function readOpnameCount(value: unknown): OpnameCountPayload {
  const row = objectValue(value, "payload");
  const items = arrayValue(row.items, "payload.items").map(readOpnameCountItem);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  return {
    expected_version: integerValue(row.expected_version, "payload.expected_version", 1),
    items,
    opname_id: uuidValue(row.opname_id, "payload.opname_id"),
  };
}

async function lockOpname(
  executor: SqlExecutor,
  businessId: string,
  opnameId: string,
): Promise<OpnameRow> {
  const rows = await executor.query<OpnameRow>(
    `SELECT location_id, status, version::text
     FROM inventory.opname_sessions
     WHERE id = $1 AND business_id = $2 FOR UPDATE`,
    [opnameId, businessId],
  );
  const row = rows.rows[0];
  if (row === undefined) throw new ApiError(404, "OPNAME_NOT_FOUND", "Sesi Opname tidak ditemukan.");
  return row;
}

export async function countOpnameCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: InventoryCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "inventory.opname.create");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readOpnameCount(input.payload);
  const businessId = context.authorization.membership.business_id;
  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const session = await lockOpname(executor, businessId, payload.opname_id);
    if (session.location_id !== locationId) throw new ApiError(403, "OPNAME_TENANT_MISMATCH", "Opname bukan milik lokasi sesi.");
    if (session.version !== payload.expected_version.toString()) throw new ApiError(409, "OPNAME_VERSION_CONFLICT", "Versi Opname sudah berubah.");
    if (!["DRAFT", "COUNTING", "REVIEW"].includes(session.status)) {
      throw new ApiError(409, "OPNAME_STATE_INVALID", "Sesi Opname tidak dapat dihitung.");
    }
    const isExplicitRecount = input.command.command_type === "inventory.opname.recount";
    for (const item of payload.items) {
      const updated = await executor.query(
        `WITH movement_snapshot AS (
           SELECT COALESCE(sum(sm.base_quantity_delta), 0) AS system_qty,
                  COALESCE(max(sm.ledger_sequence), 0) AS movement_sequence,
                  (array_agg(sm.id ORDER BY sm.ledger_sequence DESC))[1] AS movement_id
           FROM inventory.stock_movements sm
           WHERE sm.business_id = $2
             AND sm.location_id = $7
             AND sm.product_id = $3
         )
         UPDATE inventory.opname_items oi
         SET system_qty_at_count = snapshot.system_qty,
             physical_qty = $4,
             variance_qty = $4 - snapshot.system_qty,
             counted_at = $5,
             counted_by = $6,
             count_movement_sequence = snapshot.movement_sequence,
             count_movement_id = snapshot.movement_id,
             count_revision = oi.count_revision + 1,
             recount_recommended = CASE WHEN $8 THEN FALSE ELSE oi.recount_recommended END,
             recount_trigger_movement_id = CASE
               WHEN $8 THEN NULL ELSE oi.recount_trigger_movement_id
             END,
             recount_trigger_sequence = CASE
               WHEN $8 THEN NULL ELSE oi.recount_trigger_sequence
             END,
             posted_movement_id = NULL
         FROM movement_snapshot snapshot
         WHERE oi.opname_session_id = $1 AND oi.product_id = $3
           AND EXISTS (
             SELECT 1 FROM inventory.opname_sessions os
             WHERE os.id = oi.opname_session_id AND os.business_id = $2
           )`,
        [
          payload.opname_id,
          businessId,
          item.product_id,
          item.physical_qty,
          item.counted_at,
          context.authorization.user.id,
          locationId,
          isExplicitRecount,
        ],
      );
      if (updated.rowCount !== 1) {
        throw new ApiError(404, "OPNAME_ITEM_NOT_FOUND", "Item Opname tidak ditemukan.");
      }
    }
    const version = (BigInt(session.version) + 1n).toString();
    await executor.query(
      `UPDATE inventory.opname_sessions
       SET status = 'COUNTING', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), version = $3
       WHERE id = $1 AND business_id = $2`,
      [payload.opname_id, businessId, version],
    );
    const recount = await executor.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count
       FROM inventory.opname_items
       WHERE opname_session_id = $1 AND recount_recommended = TRUE`,
      [payload.opname_id],
    );
    const recountRequiredCount = recount.rows[0]?.count ?? "0";
    const result = {
      counted_items: payload.items.length,
      opname_id: payload.opname_id,
      recount_required_count: recountRequiredCount,
      status: "COUNTING",
      version,
      warnings: recountRequiredCount === "0" ? [] : ["OPNAME_RECOUNT_RECOMMENDED"],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: input.command.command_type === "inventory.opname.recount" ? "OPNAME_RECOUNTED" : "OPNAME_COUNTED",
      after_data: result,
      entity_id: payload.opname_id,
      entity_type: "opname_session",
    });
    await appendChange(executor, context, input.command, {
      change_type: "UPSERT",
      entity_id: payload.opname_id,
      entity_type: "opname_session",
      entity_version: version,
      payload: result,
    });
    return result;
  });
}

function readTransition(value: unknown): OpnameTransitionPayload {
  const row = objectValue(value, "payload");
  return {
    expected_version: integerValue(row.expected_version, "payload.expected_version", 1),
    notes: nullableStringValue(row.notes, "payload.notes"),
    opname_id: uuidValue(row.opname_id, "payload.opname_id"),
  };
}

export async function reviewOpnameCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: InventoryCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "inventory.opname.create");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readTransition(input.payload);
  const businessId = context.authorization.membership.business_id;
  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const session = await lockOpname(executor, businessId, payload.opname_id);
    if (session.location_id !== locationId) throw new ApiError(403, "OPNAME_TENANT_MISMATCH", "Opname bukan milik lokasi sesi.");
    if (session.version !== payload.expected_version.toString()) throw new ApiError(409, "OPNAME_VERSION_CONFLICT", "Versi Opname sudah berubah.");
    if (session.status !== "COUNTING") throw new ApiError(409, "OPNAME_STATE_INVALID", "Opname belum dalam COUNTING.");
    const missing = await executor.query(
      `SELECT 1 FROM inventory.opname_items
       WHERE opname_session_id = $1 AND physical_qty IS NULL LIMIT 1`,
      [payload.opname_id],
    );
    if (missing.rows[0] !== undefined) throw new ApiError(409, "OPNAME_COUNT_INCOMPLETE", "Semua item harus dihitung.");
    const recount = await executor.query<{ readonly count: string }>(
      `SELECT count(*)::text AS count FROM inventory.opname_items
       WHERE opname_session_id = $1 AND recount_recommended = TRUE`,
      [payload.opname_id],
    );
    const version = (BigInt(session.version) + 1n).toString();
    await executor.query(
      `UPDATE inventory.opname_sessions SET status = 'REVIEW', version = $3
       WHERE id = $1 AND business_id = $2`,
      [payload.opname_id, businessId, version],
    );
    const result = {
      opname_id: payload.opname_id,
      recount_required_count: recount.rows[0]?.count ?? "0",
      status: "REVIEW",
      version,
      warnings: recount.rows[0]?.count === "0" ? [] : ["OPNAME_RECOUNT_RECOMMENDED"],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "OPNAME_REVIEWED",
      after_data: result,
      entity_id: payload.opname_id,
      entity_type: "opname_session",
      ...(payload.notes === null ? {} : { reason: payload.notes }),
    });
    await appendChange(executor, context, input.command, {
      change_type: "UPSERT",
      entity_id: payload.opname_id,
      entity_type: "opname_session",
      entity_version: version,
      payload: result,
    });
    return result;
  });
}

export async function postOpnameCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: InventoryCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "inventory.opname.post");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readTransition(input.payload);
  const businessId = context.authorization.membership.business_id;
  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const session = await lockOpname(executor, businessId, payload.opname_id);
    if (session.location_id !== locationId) throw new ApiError(403, "OPNAME_TENANT_MISMATCH", "Opname bukan milik lokasi sesi.");
    if (session.version !== payload.expected_version.toString()) throw new ApiError(409, "OPNAME_VERSION_CONFLICT", "Versi Opname sudah berubah.");
    if (session.status !== "REVIEW") throw new ApiError(409, "OPNAME_STATE_INVALID", "Opname belum dalam REVIEW.");
    const itemRows = await executor.query<OpnameItemRow>(
      `SELECT id, product_id, system_qty_at_count::text, physical_qty::text,
              variance_qty::text, count_movement_sequence::text,
              counted_at, recount_recommended
       FROM inventory.opname_items
       WHERE opname_session_id = $1
       ORDER BY product_id
       FOR UPDATE`,
      [payload.opname_id],
    );
    if (itemRows.rows.some((item) => item.recount_recommended)) {
      throw new ApiError(409, "OPNAME_RECOUNT_REQUIRED", "Ada item yang harus dihitung ulang sebelum POST.");
    }
    const movements: Array<Readonly<Record<string, unknown>>> = [];
    for (const item of itemRows.rows) {
      if (
        item.system_qty_at_count === null ||
        item.physical_qty === null ||
        item.variance_qty === null ||
        item.count_movement_sequence === null
      ) {
        throw new ApiError(409, "OPNAME_COUNT_INCOMPLETE", "Item Opname belum lengkap.");
      }
      const variance = parseDecimal(item.variance_qty);
      if (decimalCompare(variance, ZERO) === 0) continue;
      await executor.query(
        `SELECT 1 FROM inventory.stock_balances
         WHERE business_id = $1 AND location_id = $2 AND product_id = $3
         FOR UPDATE`,
        [businessId, locationId, item.product_id],
      );
      const movementId = crypto.randomUUID();
      const movementType = decimalCompare(variance, ZERO) > 0 ? "OPNAME_ADJUSTMENT_IN" : "OPNAME_ADJUSTMENT_OUT";
      await executor.query(
        `INSERT INTO inventory.stock_movements (
           id, business_id, location_id, product_id, movement_type,
           base_quantity_delta, source_type, source_id, source_line_id,
           reason_code, occurred_at, actor_user_id, device_id, correlation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, 'OPNAME', $7, $8,
                   'OPNAME_VARIANCE', $9, $10, $11, $12)`,
        [
          movementId,
          businessId,
          locationId,
          item.product_id,
          movementType,
          variance,
          payload.opname_id,
          item.id,
          input.command.occurred_at,
          context.authorization.user.id,
          input.device_id,
          input.command.correlation_id,
        ],
      );
      await executor.query(
        `INSERT INTO inventory.stock_balances (
           business_id, location_id, product_id, base_quantity, last_movement_id, updated_at
         ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (business_id, location_id, product_id) DO UPDATE
         SET base_quantity = inventory.stock_balances.base_quantity + EXCLUDED.base_quantity,
             last_movement_id = EXCLUDED.last_movement_id,
             updated_at = CURRENT_TIMESTAMP`,
        [businessId, locationId, item.product_id, variance, movementId],
      );
      await appendStockBalanceProjection(executor, context, input.command, {
        business_id: businessId,
        last_movement_id: movementId,
        location_id: locationId,
        product_id: item.product_id,
      });
      await executor.query(
        `UPDATE inventory.opname_items SET posted_movement_id = $2 WHERE id = $1`,
        [item.id, movementId],
      );
      await appendInventoryCostEffect(
        executor,
        context,
        input,
        item.product_id,
        "OPNAME_ITEM",
        item.id,
        variance,
        payload.notes ?? "OPNAME_VARIANCE",
      );
      const projection = { base_quantity_delta: variance, id: movementId, product_id: item.product_id } as const;
      movements.push(projection);
      await appendChange(executor, context, input.command, {
        change_type: "EVENT",
        entity_id: movementId,
        entity_type: "stock_movement",
        payload: projection,
      });
    }
    const version = (BigInt(session.version) + 1n).toString();
    await executor.query(
      `UPDATE inventory.opname_sessions
       SET status = 'POSTED', posted_at = CURRENT_TIMESTAMP, version = $3
       WHERE id = $1 AND business_id = $2`,
      [payload.opname_id, businessId, version],
    );
    const result = {
      movements,
      opname_id: payload.opname_id,
      status: "POSTED",
      version,
      warnings: [] as readonly string[],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "OPNAME_POSTED",
      after_data: result,
      entity_id: payload.opname_id,
      entity_type: "opname_session",
      ...(payload.notes === null ? {} : { reason: payload.notes }),
    });
    await appendChange(executor, context, input.command, {
      change_type: "EVENT",
      entity_id: payload.opname_id,
      entity_type: "opname_session",
      entity_version: version,
      payload: result,
    });
    return result;
  });
}
