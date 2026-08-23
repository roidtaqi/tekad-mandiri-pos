import {
  decimalAdd,
  decimalCompare,
  decimalDivide,
  decimalMultiply,
  decimalNegate,
  decimalSubtract,
  parseDecimal,
  quantizeDecimal,
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
import { appendStockBalanceProjection } from "./inventory.js";
import {
  assertFreshAuthorization,
  decimalValue,
  nullableDecimalValue,
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

export interface PurchasingCommandInput {
  readonly command: CommandIdentity;
  readonly command_authorization_version: number;
  readonly device_id: string;
  readonly payload: unknown;
}

interface PurchaseItemInput {
  readonly agreed_discount_amount: DecimalValue;
  readonly agreed_free_qty: DecimalValue;
  readonly agreed_unit_price: DecimalValue | null;
  readonly conversion_snapshot: DecimalValue;
  readonly expected_qty: DecimalValue;
  readonly item_id: string;
  readonly product_id: string;
  readonly product_unit_id: string;
}

interface PurchaseCreatePayload {
  readonly items: readonly PurchaseItemInput[];
  readonly notes: string | null;
  readonly purchase_date: string;
  readonly purchase_id: string;
  readonly purchase_number: string;
  readonly supplier_id: string;
}

interface ProductUnitRow {
  readonly display_name: string;
  readonly product_id: string;
  readonly product_name: string;
}

interface LockedPurchaseRow {
  readonly integrity_status: string;
  readonly location_id: string;
  readonly status: string;
  readonly supplier_id: string;
  readonly version: string;
}

interface ReceiptItemInput {
  readonly accepted_qty: DecimalValue;
  readonly conversion_snapshot: DecimalValue;
  readonly free_qty_received: DecimalValue;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly purchase_item_id: string;
  readonly receipt_item_id: string;
  readonly received_qty: DecimalValue;
  readonly rejected_qty: DecimalValue;
  readonly rejection_reason: string | null;
}

interface ReceiptPayload {
  readonly items: readonly ReceiptItemInput[];
  readonly notes: string | null;
  readonly purchase_id: string;
  readonly receipt_id: string;
  readonly receipt_number: string;
  readonly received_at: string;
}

interface PurchaseLineRow {
  readonly agreed_discount_amount: string;
  readonly agreed_free_qty: string;
  readonly agreed_unit_price: string | null;
  readonly conversion_snapshot: string;
  readonly expected_qty: string;
  readonly invoice_discount_amount: string;
  readonly invoice_free_qty: string;
  readonly invoice_unit_price: string | null;
  readonly product_id: string;
  readonly product_unit_id: string;
}

interface BalanceRow {
  readonly base_quantity: string;
}

interface ProductCostRow {
  readonly cost_source_id: string | null;
  readonly cost_source_type: string | null;
  readonly cost_status: "FINAL" | "PROVISIONAL";
  readonly last_valid_mwa_unit_cost: string | null;
  readonly mwa_unit_cost: string | null;
}

interface InvoiceItemInput {
  readonly free_qty: DecimalValue;
  readonly invoice_item_id: string;
  readonly invoiced_qty: DecimalValue;
  readonly item_discount_amount: DecimalValue;
  readonly purchase_item_id: string;
  readonly tax_amount: DecimalValue;
  readonly unit_price: DecimalValue;
}

interface ChargeInput {
  readonly allocation_method: "BY_ITEM_VALUE";
  readonly amount: DecimalValue;
  readonly charge_id: string;
  readonly description: string | null;
  readonly type: "FREIGHT" | "HANDLING" | "NON_RECOVERABLE_TAX" | "OTHER_DIRECT_ACQUISITION";
}

interface InvoicePayload {
  readonly acquisition_charge_total: DecimalValue;
  readonly captured_at: string;
  readonly charges: readonly ChargeInput[];
  readonly expected_invoice_version: number;
  readonly expected_purchase_version: number;
  readonly global_discount_total: DecimalValue;
  readonly grand_total: DecimalValue;
  readonly invoice_date: string | null;
  readonly invoice_id: string;
  readonly item_discount_total: DecimalValue;
  readonly items: readonly InvoiceItemInput[];
  readonly purchase_id: string;
  readonly subtotal: DecimalValue;
  readonly supplier_invoice_number: string | null;
  readonly tax_total: DecimalValue;
}

interface PostPayload {
  readonly accepted_integrity_exception_ids: readonly string[];
  readonly expected_version: number;
  readonly notes: string | null;
  readonly purchase_id: string;
}

interface InvoiceRow {
  readonly acquisition_charge_total: string;
  readonly global_discount_total: string;
  readonly id: string;
}

interface PostLineRow {
  readonly item_discount_amount: string;
  readonly physical_base_qty: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly purchase_item_id: string;
  readonly provisional_value: string;
  readonly tax_amount: string;
  readonly unit_price: string;
  readonly invoiced_qty: string;
}

interface NegativeSaleRow {
  readonly cost_unit_snapshot: string | null;
  readonly transaction_item_id: string;
  readonly unresolved_quantity: string;
}

interface NegativeReplacementRow {
  readonly baseline_unit_cost: string | null;
  readonly quantity: string;
  readonly receipt_provisional_unit_cost: string | null;
  readonly receipt_item_id: string;
  readonly transaction_item_id: string;
}

interface OutstandingProvisionalRow {
  readonly source_id: string;
  readonly source_type: string;
}

interface ReceiptCostResult {
  readonly provisional_unit_cost: string | null;
  readonly warnings: readonly string[];
}

function dateValue(value: unknown, field: string): string {
  const text = stringValue(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw validationError(field, "harus berupa tanggal YYYY-MM-DD yang valid");
  }
  return text;
}

function money(value: unknown, field: string, allowZero = true): DecimalValue {
  return decimalValue(value, field, { allowZero, precision: 20, scale: 4 });
}

function quantity(value: unknown, field: string, allowZero = false): DecimalValue {
  return decimalValue(value, field, { allowZero, precision: 20, scale: 6 });
}

function factor(value: unknown, field: string): DecimalValue {
  return decimalValue(value, field, { precision: 20, scale: 8 });
}

function nullableMoney(value: unknown, field: string): DecimalValue | null {
  return nullableDecimalValue(value, field, {
    allowZero: true,
    precision: 20,
    scale: 4,
  });
}

function money8(value: DecimalValue): DecimalValue {
  return quantizeDecimal(value, 8, "HALF_UP");
}

function money4(value: DecimalValue): DecimalValue {
  return quantizeDecimal(value, 4, "HALF_UP");
}

function readPurchaseItem(value: unknown, index: number): PurchaseItemInput {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  return {
    agreed_discount_amount: money(
      row.agreed_discount_amount ?? "0",
      `${field}.agreed_discount_amount`,
    ),
    agreed_free_qty: quantity(row.agreed_free_qty ?? "0", `${field}.agreed_free_qty`, true),
    agreed_unit_price: nullableMoney(row.agreed_unit_price, `${field}.agreed_unit_price`),
    conversion_snapshot: factor(row.conversion_snapshot, `${field}.conversion_snapshot`),
    expected_qty: quantity(row.expected_qty, `${field}.expected_qty`),
    item_id: uuidValue(row.item_id, `${field}.item_id`),
    product_id: uuidValue(row.product_id, `${field}.product_id`),
    product_unit_id: uuidValue(row.product_unit_id, `${field}.product_unit_id`),
  };
}

function readPurchaseCreate(value: unknown): PurchaseCreatePayload {
  const row = objectValue(value, "payload");
  const items = arrayValue(row.items, "payload.items").map(readPurchaseItem);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  if (new Set(items.map((item) => item.item_id)).size !== items.length) {
    throw new ApiError(400, "PURCHASE_ITEM_DUPLICATE", "item_id Purchase duplikat.");
  }
  return {
    items,
    notes: nullableStringValue(row.notes, "payload.notes"),
    purchase_date: dateValue(row.purchase_date, "payload.purchase_date"),
    purchase_id: uuidValue(row.purchase_id, "payload.purchase_id"),
    purchase_number: stringValue(row.purchase_number, "payload.purchase_number"),
    supplier_id: uuidValue(row.supplier_id, "payload.supplier_id"),
  };
}

async function assertActiveDevice(
  executor: SqlExecutor,
  businessId: string,
  deviceId: string,
): Promise<void> {
  const device = await executor.query(
    `SELECT 1 FROM identity.devices
     WHERE id = $1 AND business_id = $2 AND status = 'ACTIVE'`,
    [deviceId, businessId],
  );
  if (device.rows[0] === undefined) {
    throw new ApiError(403, "DEVICE_REVOKED", "Perangkat tidak aktif untuk Business ini.");
  }
}

export async function createPurchaseCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: PurchasingCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "purchase.create");
  const locationId = requireCommandLocation(context, input.command);
  const payload = readPurchaseCreate(input.payload);
  const businessId = context.authorization.membership.business_id;
  const staleAuthorization =
    input.command_authorization_version !== context.authorization.authorization_version;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    await assertActiveDevice(executor, businessId, input.device_id);
    const supplier = await executor.query(
      `SELECT 1 FROM catalog.suppliers
       WHERE id = $1 AND business_id = $2 AND status = 'ACTIVE'`,
      [payload.supplier_id, businessId],
    );
    if (supplier.rows[0] === undefined) {
      throw new ApiError(404, "SUPPLIER_NOT_FOUND", "Supplier aktif tidak ditemukan.");
    }
    await executor.query(
      `INSERT INTO purchasing.purchases (
         id, business_id, location_id, supplier_id, purchase_number,
         status, integrity_status, payment_status, purchase_date, notes,
         created_by, created_at, updated_at, version
       ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', 'CLEAR', 'UNPAID', $6, $7,
                 $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
      [
        payload.purchase_id,
        businessId,
        locationId,
        payload.supplier_id,
        payload.purchase_number,
        payload.purchase_date,
        payload.notes,
        context.authorization.user.id,
      ],
    );

    for (const item of payload.items) {
      const identity = await executor.query<ProductUnitRow>(
        `SELECT pu.product_id, pu.display_name, p.name AS product_name
         FROM catalog.product_units pu
         JOIN catalog.products p ON p.id = pu.product_id AND p.business_id = pu.business_id
         WHERE pu.id = $1 AND pu.business_id = $2 AND pu.product_id = $3
           AND pu.status = 'ACTIVE' AND pu.can_purchase = TRUE AND p.status = 'ACTIVE'`,
        [item.product_unit_id, businessId, item.product_id],
      );
      const row = identity.rows[0];
      if (row === undefined) {
        throw new ApiError(
          404,
          "PURCHASE_PRODUCT_UNIT_NOT_FOUND",
          "Product Unit pembelian tidak ditemukan pada Business ini.",
        );
      }
      await executor.query(
        `INSERT INTO purchasing.purchase_items (
           id, purchase_id, product_id, product_unit_id, product_name_snapshot,
           unit_name_snapshot, conversion_snapshot, expected_qty,
           agreed_unit_price, agreed_discount_amount, agreed_free_qty, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
        [
          item.item_id,
          payload.purchase_id,
          item.product_id,
          item.product_unit_id,
          row.product_name,
          row.display_name,
          item.conversion_snapshot,
          item.expected_qty,
          item.agreed_unit_price,
          item.agreed_discount_amount,
          item.agreed_free_qty,
        ],
      );
    }

    const result = {
      purchase_id: payload.purchase_id,
      purchase_number: payload.purchase_number,
      status: "DRAFT",
      version: "1",
      warnings: staleAuthorization ? ["AUTHORIZATION_STALE_EXCEPTION"] : [],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "PURCHASE_DRAFT_CREATED",
      after_data: result,
      entity_id: payload.purchase_id,
      entity_type: "purchase",
    });
    await appendChange(executor, context, input.command, {
      change_type: "UPSERT",
      entity_id: payload.purchase_id,
      entity_type: "purchase",
      entity_version: "1",
      payload: result,
    });
    return result;
  });
}

function readReceiptItem(value: unknown, index: number): ReceiptItemInput {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  const received = quantity(row.received_qty, `${field}.received_qty`, true);
  const accepted = quantity(row.accepted_qty, `${field}.accepted_qty`, true);
  const rejected = quantity(row.rejected_qty, `${field}.rejected_qty`, true);
  if (decimalCompare(decimalAdd(accepted, rejected), received) > 0) {
    throw new ApiError(
      400,
      "RECEIPT_QUANTITY_INVALID",
      "Accepted + rejected tidak boleh melebihi received quantity.",
      { field },
    );
  }
  if (decimalCompare(decimalAdd(accepted, quantity(row.free_qty_received, `${field}.free_qty_received`, true)), ZERO) <= 0) {
    throw validationError(field, "harus memiliki accepted atau free quantity positif");
  }
  return {
    accepted_qty: accepted,
    conversion_snapshot: factor(row.conversion_snapshot, `${field}.conversion_snapshot`),
    free_qty_received: quantity(row.free_qty_received, `${field}.free_qty_received`, true),
    product_id: uuidValue(row.product_id, `${field}.product_id`),
    product_unit_id: uuidValue(row.product_unit_id, `${field}.product_unit_id`),
    purchase_item_id: uuidValue(row.purchase_item_id, `${field}.purchase_item_id`),
    receipt_item_id: uuidValue(row.receipt_item_id, `${field}.receipt_item_id`),
    received_qty: received,
    rejected_qty: rejected,
    rejection_reason: nullableStringValue(row.rejection_reason, `${field}.rejection_reason`),
  };
}

function readReceipt(value: unknown): ReceiptPayload {
  const row = objectValue(value, "payload");
  const items = arrayValue(row.items, "payload.items").map(readReceiptItem);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  return {
    items,
    notes: nullableStringValue(row.notes, "payload.notes"),
    purchase_id: uuidValue(row.purchase_id, "payload.purchase_id"),
    receipt_id: uuidValue(row.receipt_id, "payload.receipt_id"),
    receipt_number: stringValue(row.receipt_number, "payload.receipt_number"),
    received_at: timestampValue(row.received_at, "payload.received_at"),
  };
}

function calculateProvisionalCost(
  line: PurchaseLineRow,
  accepted: DecimalValue,
  free: DecimalValue,
  fallback: string | null,
): DecimalValue | null {
  const unitPrice = line.invoice_unit_price ?? line.agreed_unit_price;
  if (unitPrice === null) return fallback === null ? null : parseDecimal(fallback);
  const discount = parseDecimal(
    line.invoice_unit_price === null
      ? line.agreed_discount_amount
      : line.invoice_discount_amount,
  );
  const physicalUnits = decimalAdd(accepted, free);
  if (decimalCompare(physicalUnits, ZERO) === 0) return null;
  const allocatedDiscount = decimalMultiply(
    discount,
    decimalDivide(accepted, parseDecimal(line.expected_qty)),
  );
  const consideration = decimalSubtract(
    decimalMultiply(parseDecimal(unitPrice), accepted),
    allocatedDiscount,
  );
  if (decimalCompare(consideration, ZERO) < 0) {
    throw new ApiError(
      409,
      "PROVISIONAL_COST_INVALID",
      "Discount Purchase menghasilkan provisional cost negatif.",
    );
  }
  return money8(
    decimalDivide(
      decimalDivide(consideration, physicalUnits),
      parseDecimal(line.conversion_snapshot),
    ),
  );
}

async function recordNegativeStockReplacements(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  locationId: string,
  receiptItem: ReceiptItemInput,
  oldQuantity: DecimalValue,
  receiptQuantity: DecimalValue,
  provisionalUnitCost: DecimalValue | null,
  provisionalCostEventId: string | null,
): Promise<readonly string[]> {
  if (decimalCompare(oldQuantity, ZERO) >= 0) return [];

  const businessId = context.authorization.membership.business_id;
  const deficit = decimalNegate(oldQuantity);
  let remainingReplacement =
    decimalCompare(receiptQuantity, deficit) < 0 ? receiptQuantity : deficit;
  const candidates = await executor.query<NegativeSaleRow>(
    `WITH movement_positions AS (
       SELECT sm.ledger_sequence,
              sm.movement_type,
              sm.source_line_id AS transaction_item_id,
              sm.base_quantity_delta,
              sum(sm.base_quantity_delta) OVER (
                ORDER BY sm.ledger_sequence
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              ) AS quantity_after
       FROM inventory.stock_movements sm
       WHERE sm.business_id = $1
         AND sm.location_id = $2
         AND sm.product_id = $3
     ), negative_sales AS (
       SELECT ledger_sequence,
              transaction_item_id,
              GREATEST(
                0::numeric,
                GREATEST(-quantity_after, 0::numeric)
                  - GREATEST(-(quantity_after - base_quantity_delta), 0::numeric)
              ) AS negative_quantity
       FROM movement_positions
       WHERE movement_type = 'SALE' AND transaction_item_id IS NOT NULL
     ), unresolved_tail AS (
       SELECT ledger_sequence,
              transaction_item_id,
              LEAST(
                negative_quantity,
                GREATEST(
                  0::numeric,
                  $4::numeric - COALESCE(
                    sum(negative_quantity) OVER (
                      ORDER BY ledger_sequence DESC
                      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                    ),
                    0::numeric
                  )
                )
              ) AS unresolved_quantity
       FROM negative_sales
       WHERE negative_quantity > 0
     )
     SELECT unresolved.transaction_item_id,
            unresolved.unresolved_quantity::text,
            ti.cost_unit_snapshot::text
     FROM unresolved_tail unresolved
     JOIN sales.transaction_items ti ON ti.id = unresolved.transaction_item_id
     WHERE unresolved.unresolved_quantity > 0
     ORDER BY unresolved.ledger_sequence`,
    [
      businessId,
      locationId,
      receiptItem.product_id,
      deficit,
    ],
  );

  if (candidates.rows.length === 0) return ["NEGATIVE_STOCK_RECONCILIATION_INCOMPLETE"];

  for (const candidate of candidates.rows) {
    if (decimalCompare(remainingReplacement, ZERO) <= 0) break;
    const unresolved = parseDecimal(candidate.unresolved_quantity);
    const allocated =
      decimalCompare(unresolved, remainingReplacement) < 0 ? unresolved : remainingReplacement;
    await executor.query(
      `INSERT INTO costing.negative_stock_replacements (
         id, business_id, location_id, product_id, receipt_item_id,
         purchase_item_id, transaction_item_id, quantity, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        crypto.randomUUID(),
        businessId,
        locationId,
        receiptItem.product_id,
        receiptItem.receipt_item_id,
        receiptItem.purchase_item_id,
        candidate.transaction_item_id,
        allocated,
      ],
    );
    if (provisionalUnitCost !== null && provisionalCostEventId !== null) {
      const originalCost =
        candidate.cost_unit_snapshot === null
          ? null
          : parseDecimal(candidate.cost_unit_snapshot);
      const valueDelta = money8(
        decimalMultiply(
          originalCost === null
            ? provisionalUnitCost
            : decimalSubtract(provisionalUnitCost, originalCost),
          allocated,
        ),
      );
      await executor.query(
        `INSERT INTO costing.cogs_reconciliations (
           id, business_id, transaction_item_id, original_cost_snapshot,
           final_unit_cost, quantity, value_delta, source_cost_event_id,
           reconciliation_role, cost_status, source_purchase_item_id,
           source_receipt_item_id, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                   'NEGATIVE_STOCK_REPLACEMENT_PROVISIONAL', 'PROVISIONAL',
                   $9, $10, CURRENT_TIMESTAMP)`,
        [
          crypto.randomUUID(),
          businessId,
          candidate.transaction_item_id,
          candidate.cost_unit_snapshot,
          provisionalUnitCost,
          allocated,
          valueDelta,
          provisionalCostEventId,
          receiptItem.purchase_item_id,
          receiptItem.receipt_item_id,
        ],
      );
    }
    remainingReplacement = decimalSubtract(remainingReplacement, allocated);
  }
  return decimalCompare(remainingReplacement, ZERO) > 0
    ? ["NEGATIVE_STOCK_RECONCILIATION_INCOMPLETE"]
    : [];
}

async function applyReceiptCost(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  input: PurchasingCommandInput,
  receiptItem: ReceiptItemInput,
  line: PurchaseLineRow,
  basePhysical: DecimalValue,
): Promise<ReceiptCostResult> {
  const businessId = context.authorization.membership.business_id;
  const locationId = input.command.location_id as string;
  const balance = await executor.query<BalanceRow>(
    `SELECT base_quantity::text FROM inventory.stock_balances
     WHERE business_id = $1 AND location_id = $2 AND product_id = $3
     FOR UPDATE`,
    [businessId, locationId, receiptItem.product_id],
  );
  const cost = await executor.query<ProductCostRow>(
    `SELECT mwa_unit_cost::text, last_valid_mwa_unit_cost::text,
            cost_status, cost_source_type, cost_source_id
     FROM costing.product_cost_states
     WHERE business_id = $1 AND location_id = $2 AND product_id = $3
     FOR UPDATE`,
    [businessId, locationId, receiptItem.product_id],
  );
  const prior = {
    base_quantity: balance.rows[0]?.base_quantity ?? "0",
    last_valid_mwa_unit_cost: cost.rows[0]?.last_valid_mwa_unit_cost ?? null,
    mwa_unit_cost: cost.rows[0]?.mwa_unit_cost ?? null,
  };
  const provisional = calculateProvisionalCost(
    line,
    receiptItem.accepted_qty,
    receiptItem.free_qty_received,
    prior.last_valid_mwa_unit_cost ?? prior.mwa_unit_cost,
  );
  const oldQty = parseDecimal(prior.base_quantity);
  if (provisional === null) {
    const warnings = await recordNegativeStockReplacements(
      executor,
      context,
      locationId,
      receiptItem,
      oldQty,
      basePhysical,
      null,
      null,
    );
    return { provisional_unit_cost: null, warnings };
  }

  const newQty = decimalAdd(oldQty, basePhysical);
  const oldCost = prior.mwa_unit_cost === null ? null : parseDecimal(prior.mwa_unit_cost);
  let newMwa = provisional;
  if (decimalCompare(oldQty, ZERO) > 0 && oldCost !== null && decimalCompare(newQty, ZERO) > 0) {
    newMwa = money8(
      decimalDivide(
        decimalAdd(decimalMultiply(oldQty, oldCost), decimalMultiply(basePhysical, provisional)),
        newQty,
      ),
    );
  } else if (decimalCompare(newQty, ZERO) <= 0 && oldCost !== null) {
    newMwa = oldCost;
  }
  const eventId = crypto.randomUUID();
  await executor.query(
    `INSERT INTO costing.cost_events (
       id, business_id, location_id, product_id, event_type, quantity_basis,
       unit_cost_before, unit_cost_after, value_delta, source_type, source_id,
       reason, occurred_at, actor_user_id, correlation_id
     ) VALUES ($1, $2, $3, $4, 'PROVISIONAL_COST', $5, $6, $7, $8,
               'PURCHASE_RECEIPT_ITEM', $9, 'Best available receipt cost', $10, $11, $12)`,
    [
      eventId,
      businessId,
      locationId,
      receiptItem.product_id,
      basePhysical,
      oldCost,
      newMwa,
      money8(decimalMultiply(basePhysical, provisional)),
      receiptItem.receipt_item_id,
      input.command.occurred_at,
      context.authorization.user.id,
      input.command.correlation_id,
    ],
  );
  await executor.query(
    `INSERT INTO costing.product_cost_states (
       business_id, location_id, product_id, mwa_unit_cost, last_valid_mwa_unit_cost,
       cost_status, cost_source_type, cost_source_id, last_cost_event_id, updated_at
     ) VALUES ($1, $2, $3, $4, $4, 'PROVISIONAL',
               'PURCHASE_RECEIPT_ITEM', $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (business_id, location_id, product_id) DO UPDATE
     SET mwa_unit_cost = EXCLUDED.mwa_unit_cost,
         last_valid_mwa_unit_cost = EXCLUDED.last_valid_mwa_unit_cost,
         cost_status = EXCLUDED.cost_status,
         cost_source_type = EXCLUDED.cost_source_type,
         cost_source_id = EXCLUDED.cost_source_id,
         last_cost_event_id = EXCLUDED.last_cost_event_id,
         updated_at = CURRENT_TIMESTAMP`,
    [
      businessId,
      locationId,
      receiptItem.product_id,
      newMwa,
      receiptItem.receipt_item_id,
      eventId,
    ],
  );
  const warnings = await recordNegativeStockReplacements(
    executor,
    context,
    locationId,
    receiptItem,
    oldQty,
    basePhysical,
    provisional,
    eventId,
  );
  return { provisional_unit_cost: provisional, warnings };
}

export async function receiveGoodsCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: PurchasingCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "purchase.receive");
  const locationId = requireCommandLocation(context, input.command);
  const payload = readReceipt(input.payload);
  if (payload.received_at !== input.command.occurred_at) {
    throw new ApiError(400, "RECEIPT_CONTEXT_MISMATCH", "Waktu Receipt dan envelope berbeda.");
  }
  const businessId = context.authorization.membership.business_id;
  const staleAuthorization =
    input.command_authorization_version !== context.authorization.authorization_version;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    await assertActiveDevice(executor, businessId, input.device_id);
    const purchaseRows = await executor.query<LockedPurchaseRow>(
      `SELECT location_id, supplier_id, status, integrity_status, version::text
       FROM purchasing.purchases
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [payload.purchase_id, businessId],
    );
    const purchase = purchaseRows.rows[0];
    if (purchase === undefined) throw new ApiError(404, "PURCHASE_NOT_FOUND", "Purchase tidak ditemukan.");
    if (purchase.location_id !== locationId) {
      throw new ApiError(403, "PURCHASE_TENANT_MISMATCH", "Purchase bukan milik lokasi sesi.");
    }
    if (purchase.status === "POSTED" || purchase.status === "CANCELLED") {
      throw new ApiError(409, "PURCHASE_RECEIPT_STATE_INVALID", "Purchase tidak dapat menerima barang.");
    }

    await executor.query(
      `INSERT INTO purchasing.receipts (
         id, business_id, location_id, purchase_id, receipt_number,
         received_at, received_by, notes, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        payload.receipt_id,
        businessId,
        locationId,
        payload.purchase_id,
        payload.receipt_number,
        payload.received_at,
        context.authorization.user.id,
        payload.notes,
      ],
    );

    const stockMovements: Array<Readonly<Record<string, unknown>>> = [];
    const warnings = new Set<string>();
    if (staleAuthorization) warnings.add("AUTHORIZATION_STALE_EXCEPTION");
    for (const item of payload.items) {
      const lines = await executor.query<PurchaseLineRow>(
        `SELECT pi.product_id, pi.product_unit_id, pi.conversion_snapshot::text,
                pi.expected_qty::text, pi.agreed_unit_price::text,
                pi.agreed_discount_amount::text, pi.agreed_free_qty::text,
                pi.invoice_unit_price::text, pi.invoice_discount_amount::text,
                pi.invoice_free_qty::text
         FROM purchasing.purchase_items pi
         WHERE pi.id = $1 AND pi.purchase_id = $2
         FOR UPDATE`,
        [item.purchase_item_id, payload.purchase_id],
      );
      const line = lines.rows[0];
      if (
        line === undefined ||
        line.product_id !== item.product_id ||
        line.product_unit_id !== item.product_unit_id ||
        parseDecimal(line.conversion_snapshot) !== item.conversion_snapshot
      ) {
        throw new ApiError(
          409,
          "RECEIPT_PURCHASE_LINE_MISMATCH",
          "Item Receipt tidak cocok dengan Purchase Item.",
        );
      }
      const baseAccepted = decimalMultiply(item.accepted_qty, item.conversion_snapshot);
      const basePhysical = decimalMultiply(
        decimalAdd(item.accepted_qty, item.free_qty_received),
        item.conversion_snapshot,
      );
      await executor.query(
        `INSERT INTO purchasing.receipt_items (
           id, receipt_id, purchase_item_id, product_id, product_unit_id,
           conversion_snapshot, received_qty, accepted_qty, rejected_qty,
           free_qty_received, base_qty_accepted, rejection_reason, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
        [
          item.receipt_item_id,
          payload.receipt_id,
          item.purchase_item_id,
          item.product_id,
          item.product_unit_id,
          item.conversion_snapshot,
          item.received_qty,
          item.accepted_qty,
          item.rejected_qty,
          item.free_qty_received,
          baseAccepted,
          item.rejection_reason,
        ],
      );
      const receiptCost = await applyReceiptCost(
        executor,
        context,
        input,
        item,
        line,
        basePhysical,
      );
      for (const warning of receiptCost.warnings) warnings.add(warning);
      const movementId = crypto.randomUUID();
      await executor.query(
        `INSERT INTO inventory.stock_movements (
           id, business_id, location_id, product_id, movement_type,
           base_quantity_delta, source_unit_id, source_quantity,
           conversion_snapshot, source_type, source_id, source_line_id,
           occurred_at, actor_user_id, device_id, correlation_id
         ) VALUES ($1, $2, $3, $4, 'PURCHASE_RECEIPT', $5, $6, $7, $8,
                   'PURCHASE_RECEIPT', $9, $10, $11, $12, $13, $14)`,
        [
          movementId,
          businessId,
          locationId,
          item.product_id,
          basePhysical,
          item.product_unit_id,
          decimalAdd(item.accepted_qty, item.free_qty_received),
          item.conversion_snapshot,
          payload.receipt_id,
          item.receipt_item_id,
          payload.received_at,
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
        [businessId, locationId, item.product_id, basePhysical, movementId],
      );
      await appendStockBalanceProjection(executor, context, input.command, {
        business_id: businessId,
        last_movement_id: movementId,
        location_id: locationId,
        product_id: item.product_id,
      });
      if (decimalCompare(item.rejected_qty, ZERO) > 0) warnings.add("SHORT_DELIVERY");
      const expectedFree =
        line.invoice_unit_price === null ? line.agreed_free_qty : line.invoice_free_qty;
      if (decimalCompare(item.free_qty_received, parseDecimal(expectedFree)) !== 0) {
        warnings.add("BONUS_VARIANCE");
      }
      const cumulative = await executor.query<{ readonly accepted: string }>(
        `SELECT COALESCE(sum(ri.accepted_qty), 0)::text AS accepted
         FROM purchasing.receipt_items ri
         WHERE ri.purchase_item_id = $1`,
        [item.purchase_item_id],
      );
      if (decimalCompare(parseDecimal(cumulative.rows[0]?.accepted ?? "0"), parseDecimal(line.expected_qty)) > 0) {
        warnings.add("OVER_DELIVERY");
      }
      stockMovements.push({
        base_quantity_delta: basePhysical,
        id: movementId,
        product_id: item.product_id,
        provisional_unit_cost: receiptCost.provisional_unit_cost,
      });
      await appendChange(executor, context, input.command, {
        change_type: "EVENT",
        entity_id: movementId,
        entity_type: "stock_movement",
        payload: stockMovements.at(-1),
      });
    }

    const completion = await executor.query<{ readonly complete: boolean }>(
      `SELECT bool_and(received.accepted_qty >= pi.expected_qty) AS complete
       FROM purchasing.purchase_items pi
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(ri.accepted_qty), 0) AS accepted_qty
         FROM purchasing.receipt_items ri WHERE ri.purchase_item_id = pi.id
       ) received ON TRUE
       WHERE pi.purchase_id = $1`,
      [payload.purchase_id],
    );
    const status = completion.rows[0]?.complete === true ? "RECEIVED" : "PARTIALLY_RECEIVED";
    const version = (BigInt(purchase.version) + 1n).toString();
    await executor.query(
      `UPDATE purchasing.purchases
       SET status = $3, received_at = $4, updated_at = CURRENT_TIMESTAMP, version = $5
       WHERE id = $1 AND business_id = $2`,
      [payload.purchase_id, businessId, status, payload.received_at, version],
    );
    const result = {
      purchase_id: payload.purchase_id,
      purchase_status: status,
      receipt_id: payload.receipt_id,
      stock_movements: stockMovements,
      version,
      warnings: [...warnings],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "PURCHASE_GOODS_RECEIVED",
      after_data: result,
      entity_id: payload.receipt_id,
      entity_type: "purchase_receipt",
    });
    await appendChange(executor, context, input.command, {
      change_type: "EVENT",
      entity_id: payload.receipt_id,
      entity_type: "purchase_receipt",
      payload: result,
    });
    return result;
  });
}

function readInvoiceItem(value: unknown, index: number): InvoiceItemInput {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  return {
    free_qty: quantity(row.free_qty ?? "0", `${field}.free_qty`, true),
    invoice_item_id: uuidValue(row.invoice_item_id, `${field}.invoice_item_id`),
    invoiced_qty: quantity(row.invoiced_qty, `${field}.invoiced_qty`),
    item_discount_amount: money(row.item_discount_amount ?? "0", `${field}.item_discount_amount`),
    purchase_item_id: uuidValue(row.purchase_item_id, `${field}.purchase_item_id`),
    tax_amount: money(row.tax_amount ?? "0", `${field}.tax_amount`),
    unit_price: money(row.unit_price, `${field}.unit_price`),
  };
}

function readCharge(value: unknown, index: number): ChargeInput {
  const field = `payload.charges[${index}]`;
  const row = objectValue(value, field);
  const allocationMethod = stringValue(row.allocation_method, `${field}.allocation_method`);
  if (allocationMethod !== "BY_ITEM_VALUE") {
    throw new ApiError(
      400,
      "PURCHASE_CHARGE_ALLOCATION_UNSUPPORTED",
      "Hanya alokasi charge BY_ITEM_VALUE yang tersedia.",
    );
  }
  return {
    allocation_method: allocationMethod,
    amount: money(row.amount, `${field}.amount`),
    charge_id: uuidValue(row.charge_id, `${field}.charge_id`),
    description: nullableStringValue(row.description, `${field}.description`),
    type: enumValue(row.type, `${field}.type`, [
      "FREIGHT",
      "HANDLING",
      "NON_RECOVERABLE_TAX",
      "OTHER_DIRECT_ACQUISITION",
    ] as const),
  };
}

function readInvoice(value: unknown): InvoicePayload {
  const row = objectValue(value, "payload");
  const items = arrayValue(row.items, "payload.items").map(readInvoiceItem);
  const charges = arrayValue(row.charges ?? [], "payload.charges").map(readCharge);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  if (new Set(items.map((item) => item.invoice_item_id)).size !== items.length) {
    throw new ApiError(400, "INVOICE_ITEM_ID_DUPLICATE", "invoice_item_id duplikat.");
  }
  if (new Set(items.map((item) => item.purchase_item_id)).size !== items.length) {
    throw new ApiError(400, "INVOICE_PURCHASE_LINE_DUPLICATE", "Purchase Item Invoice duplikat.");
  }
  if (new Set(charges.map((charge) => charge.charge_id)).size !== charges.length) {
    throw new ApiError(400, "INVOICE_CHARGE_ID_DUPLICATE", "charge_id Invoice duplikat.");
  }
  return {
    acquisition_charge_total: money(row.acquisition_charge_total, "payload.acquisition_charge_total"),
    captured_at: timestampValue(row.captured_at, "payload.captured_at"),
    charges,
    expected_invoice_version: integerValue(row.expected_invoice_version, "payload.expected_invoice_version"),
    expected_purchase_version: integerValue(row.expected_purchase_version, "payload.expected_purchase_version", 1),
    global_discount_total: money(row.global_discount_total, "payload.global_discount_total"),
    grand_total: money(row.grand_total, "payload.grand_total"),
    invoice_date:
      row.invoice_date === null || row.invoice_date === undefined
        ? null
        : dateValue(row.invoice_date, "payload.invoice_date"),
    invoice_id: uuidValue(row.invoice_id, "payload.invoice_id"),
    item_discount_total: money(row.item_discount_total, "payload.item_discount_total"),
    items,
    purchase_id: uuidValue(row.purchase_id, "payload.purchase_id"),
    subtotal: money(row.subtotal, "payload.subtotal"),
    supplier_invoice_number: nullableStringValue(
      row.supplier_invoice_number,
      "payload.supplier_invoice_number",
    ),
    tax_total: money(row.tax_total, "payload.tax_total"),
  };
}

function sum(values: readonly DecimalValue[]): DecimalValue {
  return values.reduce((total, value) => decimalAdd(total, value), ZERO);
}

export async function capturePurchaseInvoiceCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: PurchasingCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "purchase.update_draft");
  const locationId = requireCommandLocation(context, input.command);
  const payload = readInvoice(input.payload);
  if (payload.captured_at !== input.command.occurred_at) {
    throw new ApiError(400, "INVOICE_CONTEXT_MISMATCH", "Waktu Invoice dan envelope berbeda.");
  }
  const lineGrossValues = payload.items.map((item) =>
    decimalMultiply(item.invoiced_qty, item.unit_price),
  );
  for (const [index, item] of payload.items.entries()) {
    if (decimalCompare(item.item_discount_amount, lineGrossValues[index] as DecimalValue) > 0) {
      throw new ApiError(
        400,
        "INVOICE_ITEM_DISCOUNT_INVALID",
        "Diskon item Invoice tidak boleh melebihi nilai bruto item.",
      );
    }
  }
  const recomputedSubtotal = money4(sum(lineGrossValues));
  const recomputedItemDiscountTotal = money4(
    sum(payload.items.map((item) => item.item_discount_amount)),
  );
  const recomputedTaxTotal = money4(sum(payload.items.map((item) => item.tax_amount)));
  if (decimalCompare(recomputedSubtotal, payload.subtotal) !== 0) {
    throw new ApiError(400, "INVOICE_SUBTOTAL_MISMATCH", "Subtotal Invoice tidak konsisten dengan item.");
  }
  if (decimalCompare(recomputedItemDiscountTotal, payload.item_discount_total) !== 0) {
    throw new ApiError(
      400,
      "INVOICE_ITEM_DISCOUNT_TOTAL_MISMATCH",
      "Total diskon item Invoice tidak konsisten dengan item.",
    );
  }
  if (decimalCompare(recomputedTaxTotal, payload.tax_total) !== 0) {
    throw new ApiError(400, "INVOICE_TAX_TOTAL_MISMATCH", "Total pajak Invoice tidak konsisten dengan item.");
  }
  const chargeTotal = money4(sum(payload.charges.map((charge) => charge.amount)));
  if (decimalCompare(chargeTotal, payload.acquisition_charge_total) !== 0) {
    throw new ApiError(400, "INVOICE_CHARGE_TOTAL_MISMATCH", "Total charge Invoice tidak konsisten.");
  }
  const netItemValue = decimalSubtract(recomputedSubtotal, recomputedItemDiscountTotal);
  if (decimalCompare(payload.global_discount_total, netItemValue) > 0) {
    throw new ApiError(
      400,
      "INVOICE_GLOBAL_DISCOUNT_INVALID",
      "Diskon global Invoice tidak boleh melebihi nilai item setelah diskon.",
    );
  }
  const expectedGrand = money4(
    decimalAdd(
      decimalSubtract(
        netItemValue,
        payload.global_discount_total,
      ),
      decimalAdd(recomputedTaxTotal, chargeTotal),
    ),
  );
  if (decimalCompare(expectedGrand, payload.grand_total) !== 0) {
    throw new ApiError(400, "INVOICE_TOTAL_MISMATCH", "Grand total Invoice tidak konsisten.");
  }
  const businessId = context.authorization.membership.business_id;
  const staleAuthorization =
    input.command_authorization_version !== context.authorization.authorization_version;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const purchases = await executor.query<LockedPurchaseRow>(
      `SELECT location_id, supplier_id, status, integrity_status, version::text
       FROM purchasing.purchases WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [payload.purchase_id, businessId],
    );
    const purchase = purchases.rows[0];
    if (purchase === undefined) throw new ApiError(404, "PURCHASE_NOT_FOUND", "Purchase tidak ditemukan.");
    if (purchase.location_id !== locationId) throw new ApiError(403, "PURCHASE_TENANT_MISMATCH", "Purchase bukan milik lokasi sesi.");
    if (purchase.status === "POSTED" || purchase.status === "CANCELLED") {
      throw new ApiError(409, "PURCHASE_INVOICE_STATE_INVALID", "Invoice Purchase tidak dapat diubah.");
    }
    if (purchase.version !== payload.expected_purchase_version.toString()) {
      throw new ApiError(409, "PURCHASE_VERSION_CONFLICT", "Versi Purchase sudah berubah.");
    }
    const existing = await executor.query<{ readonly id: string; readonly version: string }>(
      `SELECT id, version::text FROM purchasing.purchase_invoices
       WHERE purchase_id = $1 FOR UPDATE`,
      [payload.purchase_id],
    );
    const invoice = existing.rows[0];
    if (
      (invoice === undefined && payload.expected_invoice_version !== 0) ||
      (invoice !== undefined && invoice.version !== payload.expected_invoice_version.toString())
    ) {
      throw new ApiError(409, "PURCHASE_INVOICE_VERSION_CONFLICT", "Versi Invoice sudah berubah.");
    }
    if (invoice !== undefined && invoice.id !== payload.invoice_id) {
      throw new ApiError(409, "PURCHASE_INVOICE_ID_CONFLICT", "Purchase sudah memiliki Invoice lain.");
    }

    for (const item of payload.items) {
      const line = await executor.query(
        `SELECT 1 FROM purchasing.purchase_items
         WHERE id = $1 AND purchase_id = $2`,
        [item.purchase_item_id, payload.purchase_id],
      );
      if (line.rows[0] === undefined) {
        throw new ApiError(409, "INVOICE_PURCHASE_LINE_MISMATCH", "Invoice Item bukan bagian Purchase.");
      }
    }
    const nextInvoiceVersion = payload.expected_invoice_version + 1;
    if (invoice === undefined) {
      await executor.query(
        `INSERT INTO purchasing.purchase_invoices (
           id, purchase_id, supplier_invoice_number, invoice_date, subtotal,
           item_discount_total, global_discount_total, tax_total,
           acquisition_charge_total, grand_total, captured_at, captured_by, version
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          payload.invoice_id,
          payload.purchase_id,
          payload.supplier_invoice_number,
          payload.invoice_date,
          payload.subtotal,
          payload.item_discount_total,
          payload.global_discount_total,
          payload.tax_total,
          payload.acquisition_charge_total,
          payload.grand_total,
          payload.captured_at,
          context.authorization.user.id,
          nextInvoiceVersion,
        ],
      );
    } else {
      await executor.query(
        `UPDATE purchasing.purchase_invoices
         SET supplier_invoice_number = $2, invoice_date = $3, subtotal = $4,
             item_discount_total = $5, global_discount_total = $6, tax_total = $7,
             acquisition_charge_total = $8, grand_total = $9, captured_at = $10,
             captured_by = $11, version = $12
         WHERE id = $1`,
        [
          payload.invoice_id,
          payload.supplier_invoice_number,
          payload.invoice_date,
          payload.subtotal,
          payload.item_discount_total,
          payload.global_discount_total,
          payload.tax_total,
          payload.acquisition_charge_total,
          payload.grand_total,
          payload.captured_at,
          context.authorization.user.id,
          nextInvoiceVersion,
        ],
      );
      await executor.query(`DELETE FROM purchasing.purchase_invoice_items WHERE invoice_id = $1`, [payload.invoice_id]);
      await executor.query(`DELETE FROM purchasing.purchase_charges WHERE purchase_id = $1`, [payload.purchase_id]);
    }
    for (const item of payload.items) {
      await executor.query(
        `INSERT INTO purchasing.purchase_invoice_items (
           id, invoice_id, purchase_item_id, invoiced_qty, unit_price,
           item_discount_amount, tax_amount, free_qty
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          item.invoice_item_id,
          payload.invoice_id,
          item.purchase_item_id,
          item.invoiced_qty,
          item.unit_price,
          item.item_discount_amount,
          item.tax_amount,
          item.free_qty,
        ],
      );
      await executor.query(
        `UPDATE purchasing.purchase_items
         SET invoice_unit_price = $2, invoice_discount_amount = $3, invoice_free_qty = $4
         WHERE id = $1`,
        [item.purchase_item_id, item.unit_price, item.item_discount_amount, item.free_qty],
      );
    }
    for (const charge of payload.charges) {
      await executor.query(
        `INSERT INTO purchasing.purchase_charges (
           id, purchase_id, type, description, amount, allocation_method, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          charge.charge_id,
          payload.purchase_id,
          charge.type,
          charge.description,
          charge.amount,
          charge.allocation_method,
        ],
      );
    }
    const duplicate = payload.supplier_invoice_number === null
      ? { rows: [] }
      : await executor.query(
          `SELECT id FROM purchasing.purchases
           WHERE business_id = $1 AND supplier_id = $2
             AND supplier_invoice_number = $3 AND id <> $4
           LIMIT 1`,
          [businessId, purchase.supplier_id, payload.supplier_invoice_number, payload.purchase_id],
        );
    const integrityStatus = duplicate.rows[0] === undefined ? purchase.integrity_status : "WARNING";
    const hasReceipt = await executor.query(
      `SELECT 1 FROM purchasing.receipts WHERE purchase_id = $1 LIMIT 1`,
      [payload.purchase_id],
    );
    const status = hasReceipt.rows[0] === undefined ? purchase.status : "READY_TO_POST";
    const nextPurchaseVersion = (BigInt(purchase.version) + 1n).toString();
    await executor.query(
      `UPDATE purchasing.purchases
       SET supplier_invoice_number = $3, integrity_status = $4, status = $5,
           ready_to_post_at = CASE WHEN $5 = 'READY_TO_POST' THEN CURRENT_TIMESTAMP ELSE ready_to_post_at END,
           updated_at = CURRENT_TIMESTAMP, version = $6
       WHERE id = $1 AND business_id = $2`,
      [
        payload.purchase_id,
        businessId,
        payload.supplier_invoice_number,
        integrityStatus,
        status,
        nextPurchaseVersion,
      ],
    );
    const warnings = [
      ...(staleAuthorization ? ["AUTHORIZATION_STALE_EXCEPTION"] : []),
      ...(duplicate.rows[0] === undefined ? [] : ["DUPLICATE_SUPPLIER_INVOICE_REVIEW"]),
    ];
    const result = {
      invoice_id: payload.invoice_id,
      invoice_version: nextInvoiceVersion.toString(),
      purchase_id: payload.purchase_id,
      purchase_status: status,
      purchase_version: nextPurchaseVersion,
      warnings,
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: invoice === undefined ? "PURCHASE_INVOICE_CAPTURED" : "PURCHASE_INVOICE_REVISED",
      after_data: result,
      entity_id: payload.invoice_id,
      entity_type: "purchase_invoice",
    });
    await appendChange(executor, context, input.command, {
      change_type: "UPSERT",
      entity_id: payload.invoice_id,
      entity_type: "purchase_invoice",
      entity_version: nextInvoiceVersion.toString(),
      payload: result,
    });
    return result;
  });
}

function readPost(value: unknown): PostPayload {
  const row = objectValue(value, "payload");
  return {
    accepted_integrity_exception_ids: arrayValue(
      row.accepted_integrity_exception_ids ?? [],
      "payload.accepted_integrity_exception_ids",
    ).map((id, index) => uuidValue(id, `payload.accepted_integrity_exception_ids[${index}]`)),
    expected_version: integerValue(row.expected_version, "payload.expected_version", 1),
    notes: nullableStringValue(row.notes, "payload.notes"),
    purchase_id: uuidValue(row.purchase_id, "payload.purchase_id"),
  };
}

export async function postPurchaseCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: PurchasingCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "purchase.post");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readPost(input.payload);
  const businessId = context.authorization.membership.business_id;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const purchases = await executor.query<LockedPurchaseRow>(
      `SELECT location_id, supplier_id, status, integrity_status, version::text
       FROM purchasing.purchases WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [payload.purchase_id, businessId],
    );
    const purchase = purchases.rows[0];
    if (purchase === undefined) throw new ApiError(404, "PURCHASE_NOT_FOUND", "Purchase tidak ditemukan.");
    if (purchase.location_id !== locationId) throw new ApiError(403, "PURCHASE_TENANT_MISMATCH", "Purchase bukan milik lokasi sesi.");
    if (purchase.version !== payload.expected_version.toString()) {
      throw new ApiError(409, "PURCHASE_VERSION_CONFLICT", "Versi Purchase sudah berubah.");
    }
    if (purchase.status !== "READY_TO_POST" && purchase.status !== "RECEIVED") {
      throw new ApiError(409, "PURCHASE_NOT_READY_TO_POST", "Purchase belum siap di-POST.");
    }
    if (
      purchase.integrity_status === "DISPUTED" ||
      (purchase.integrity_status === "REVIEW_REQUIRED" && payload.accepted_integrity_exception_ids.length === 0)
    ) {
      throw new ApiError(409, "PURCHASE_INTEGRITY_REVIEW_REQUIRED", "Exception integritas belum diterima.");
    }
    const invoiceRows = await executor.query<InvoiceRow>(
      `SELECT id, global_discount_total::text, acquisition_charge_total::text
       FROM purchasing.purchase_invoices WHERE purchase_id = $1 FOR UPDATE`,
      [payload.purchase_id],
    );
    const invoice = invoiceRows.rows[0];
    if (invoice === undefined) {
      throw new ApiError(409, "PURCHASE_INVOICE_REQUIRED", "Invoice diperlukan sebelum POST.");
    }
    const lineRows = await executor.query<PostLineRow>(
      `SELECT pi.id AS purchase_item_id, pi.product_id, pi.product_unit_id,
              pii.invoiced_qty::text, pii.unit_price::text,
              pii.item_discount_amount::text, pii.tax_amount::text,
              COALESCE(received.physical_base_qty, 0)::text AS physical_base_qty,
              COALESCE(received.provisional_value, 0)::text AS provisional_value
       FROM purchasing.purchase_items pi
       JOIN purchasing.purchase_invoice_items pii
         ON pii.purchase_item_id = pi.id AND pii.invoice_id = $2
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(sum((ri.accepted_qty + ri.free_qty_received) * ri.conversion_snapshot), 0) AS physical_base_qty,
           COALESCE(sum(ce.value_delta), 0) AS provisional_value
         FROM purchasing.receipt_items ri
         LEFT JOIN costing.cost_events ce
           ON ce.business_id = $3 AND ce.location_id = $4
          AND ce.source_type = 'PURCHASE_RECEIPT_ITEM'
          AND ce.source_id = ri.id AND ce.event_type = 'PROVISIONAL_COST'
         WHERE ri.purchase_item_id = pi.id
       ) received ON TRUE
       WHERE pi.purchase_id = $1
       ORDER BY pi.id`,
      [payload.purchase_id, invoice.id, businessId, locationId],
    );
    if (lineRows.rows.length === 0) {
      throw new ApiError(409, "PURCHASE_RECEIPT_REQUIRED", "Receipt diperlukan sebelum POST.");
    }
    if (lineRows.rows.some((line) => decimalCompare(parseDecimal(line.physical_base_qty), ZERO) <= 0)) {
      throw new ApiError(409, "PURCHASE_ACCEPTED_QUANTITY_REQUIRED", "Semua Invoice Item harus memiliki accepted quantity.");
    }

    const allocationBases = lineRows.rows.map((line) =>
      decimalSubtract(
        decimalMultiply(parseDecimal(line.invoiced_qty), parseDecimal(line.unit_price)),
        parseDecimal(line.item_discount_amount),
      ),
    );
    const allocationTotal = sum(allocationBases);
    if (decimalCompare(allocationTotal, ZERO) <= 0) {
      throw new ApiError(409, "PURCHASE_ALLOCATION_BASE_INVALID", "Basis alokasi landed cost harus positif.");
    }
    const finalCosts: Array<Readonly<Record<string, unknown>>> = [];
    for (const [index, line] of lineRows.rows.entries()) {
      const ratio = decimalDivide(allocationBases[index] as DecimalValue, allocationTotal);
      const allocatedDiscount = decimalMultiply(parseDecimal(invoice.global_discount_total), ratio);
      const allocatedCharge = decimalMultiply(parseDecimal(invoice.acquisition_charge_total), ratio);
      const finalValue = decimalAdd(
        decimalSubtract(
          decimalAdd(allocationBases[index] as DecimalValue, parseDecimal(line.tax_amount)),
          allocatedDiscount,
        ),
        allocatedCharge,
      );
      if (decimalCompare(finalValue, ZERO) < 0) {
        throw new ApiError(409, "LANDED_COST_NEGATIVE", "Landed cost tidak boleh negatif.");
      }
      const landedUnitCost = money8(decimalDivide(finalValue, parseDecimal(line.physical_base_qty)));
      await executor.query(
        `UPDATE purchasing.purchase_items
         SET final_landed_cost_per_base_unit = $2 WHERE id = $1`,
        [line.purchase_item_id, landedUnitCost],
      );

      const lockedBalance = await executor.query<BalanceRow>(
        `SELECT base_quantity::text FROM inventory.stock_balances
         WHERE business_id = $1 AND location_id = $2 AND product_id = $3
         FOR UPDATE`,
        [businessId, locationId, line.product_id],
      );
      const lockedCost = await executor.query<ProductCostRow>(
        `SELECT mwa_unit_cost::text, last_valid_mwa_unit_cost::text,
                cost_status, cost_source_type, cost_source_id
         FROM costing.product_cost_states
         WHERE business_id = $1 AND location_id = $2 AND product_id = $3
         FOR UPDATE`,
        [businessId, locationId, line.product_id],
      );
      const state = {
        base_quantity: lockedBalance.rows[0]?.base_quantity ?? "0",
        last_valid_mwa_unit_cost: lockedCost.rows[0]?.last_valid_mwa_unit_cost ?? null,
        mwa_unit_cost: lockedCost.rows[0]?.mwa_unit_cost ?? null,
      };
      const oldMwa = state.mwa_unit_cost === null ? landedUnitCost : parseDecimal(state.mwa_unit_cost);
      const totalValueDelta = decimalSubtract(finalValue, parseDecimal(line.provisional_value));
      const finalCostEventId = crypto.randomUUID();
      await executor.query(
        `INSERT INTO costing.cost_events (
           id, business_id, location_id, product_id, event_type, quantity_basis,
           unit_cost_before, unit_cost_after, value_delta, source_type, source_id,
           reason, occurred_at, actor_user_id, correlation_id
         ) VALUES ($1, $2, $3, $4, 'FINAL_LANDED_COST', $5, NULL, $6, $7,
                   'PURCHASE_ITEM', $8, $9, $10, $11, $12)`,
        [
          finalCostEventId,
          businessId,
          locationId,
          line.product_id,
          line.physical_base_qty,
          landedUnitCost,
          money8(finalValue),
          line.purchase_item_id,
          payload.notes,
          input.command.occurred_at,
          context.authorization.user.id,
          input.command.correlation_id,
        ],
      );

      const replacements = await executor.query<NegativeReplacementRow>(
        `SELECT replacement.transaction_item_id,
                replacement.receipt_item_id,
                replacement.quantity::text,
                COALESCE(provisional.final_unit_cost, ti.cost_unit_snapshot)::text
                  AS baseline_unit_cost,
                receipt_cost.provisional_unit_cost::text
                  AS receipt_provisional_unit_cost
         FROM costing.negative_stock_replacements replacement
         JOIN sales.transaction_items ti ON ti.id = replacement.transaction_item_id
         LEFT JOIN LATERAL (
           SELECT cr.final_unit_cost
           FROM costing.cogs_reconciliations cr
           WHERE cr.business_id = replacement.business_id
             AND cr.transaction_item_id = replacement.transaction_item_id
             AND cr.source_receipt_item_id = replacement.receipt_item_id
             AND cr.reconciliation_role = 'NEGATIVE_STOCK_REPLACEMENT_PROVISIONAL'
           LIMIT 1
         ) provisional ON TRUE
         LEFT JOIN LATERAL (
           SELECT ce.value_delta / NULLIF(ce.quantity_basis, 0) AS provisional_unit_cost
           FROM costing.cost_events ce
           WHERE ce.business_id = replacement.business_id
             AND ce.location_id = replacement.location_id
             AND ce.source_type = 'PURCHASE_RECEIPT_ITEM'
             AND ce.source_id = replacement.receipt_item_id
             AND ce.event_type = 'PROVISIONAL_COST'
           LIMIT 1
         ) receipt_cost ON TRUE
         WHERE replacement.business_id = $1
           AND replacement.location_id = $2
           AND replacement.purchase_item_id = $3
         ORDER BY replacement.created_at, replacement.id`,
        [businessId, locationId, line.purchase_item_id],
      );
      let purchaseDeltaAllocatedToCogs = ZERO;
      for (const replacement of replacements.rows) {
        const replacementQuantity = parseDecimal(replacement.quantity);
        const receiptProvisionalCost =
          replacement.receipt_provisional_unit_cost === null
            ? ZERO
            : parseDecimal(replacement.receipt_provisional_unit_cost);
        purchaseDeltaAllocatedToCogs = decimalAdd(
          purchaseDeltaAllocatedToCogs,
          decimalMultiply(
            decimalSubtract(landedUnitCost, receiptProvisionalCost),
            replacementQuantity,
          ),
        );
        const baselineCost =
          replacement.baseline_unit_cost === null
            ? null
            : parseDecimal(replacement.baseline_unit_cost);
        const cogsValueDelta = money8(
          decimalMultiply(
            baselineCost === null
              ? landedUnitCost
              : decimalSubtract(landedUnitCost, baselineCost),
            replacementQuantity,
          ),
        );
        await executor.query(
          `INSERT INTO costing.cogs_reconciliations (
             id, business_id, transaction_item_id, original_cost_snapshot,
             final_unit_cost, quantity, value_delta, source_cost_event_id,
             reconciliation_role, cost_status, source_purchase_item_id,
             source_receipt_item_id, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                     'NEGATIVE_STOCK_REPLACEMENT_FINAL_DELTA', 'FINAL',
                     $9, $10, CURRENT_TIMESTAMP)`,
          [
            crypto.randomUUID(),
            businessId,
            replacement.transaction_item_id,
            replacement.baseline_unit_cost,
            landedUnitCost,
            replacement.quantity,
            cogsValueDelta,
            finalCostEventId,
            line.purchase_item_id,
            replacement.receipt_item_id,
          ],
        );
      }

      const inventoryValueDelta = money8(
        decimalSubtract(totalValueDelta, purchaseDeltaAllocatedToCogs),
      );
      const replacementQuantity = sum(
        replacements.rows.map((replacement) => parseDecimal(replacement.quantity)),
      );
      const inventoryQuantityBasis = decimalSubtract(
        parseDecimal(line.physical_base_qty),
        replacementQuantity,
      );
      const currentQuantity = parseDecimal(state.base_quantity);
      if (
        decimalCompare(currentQuantity, ZERO) <= 0 &&
        decimalCompare(inventoryValueDelta, ZERO) !== 0
      ) {
        throw new ApiError(
          409,
          "COST_RECONCILIATION_ALLOCATION_INCOMPLETE",
          "Koreksi cost tidak dapat dialokasikan tanpa hubungan consumption yang lengkap.",
        );
      }
      let newMwa = oldMwa;
      if (decimalCompare(currentQuantity, ZERO) > 0) {
        const candidate = decimalAdd(
          oldMwa,
          decimalDivide(inventoryValueDelta, currentQuantity),
        );
        if (decimalCompare(candidate, ZERO) < 0) {
          throw new ApiError(
            409,
            "COST_RECONCILIATION_NEGATIVE_VALUE",
            "Koreksi cost menghasilkan nilai inventory negatif.",
          );
        }
        newMwa = money8(candidate);
      }
      const reconciliationEventId = crypto.randomUUID();
      await executor.query(
        `INSERT INTO costing.cost_events (
           id, business_id, location_id, product_id, event_type, quantity_basis,
           unit_cost_before, unit_cost_after, value_delta, source_type, source_id,
           reason, occurred_at, actor_user_id, correlation_id
         ) VALUES ($1, $2, $3, $4, 'COST_RECONCILIATION', $5, $6, $7, $8,
                   'PURCHASE_ITEM', $9, $10, $11, $12, $13)`,
        [
          reconciliationEventId,
          businessId,
          locationId,
          line.product_id,
          inventoryQuantityBasis,
          oldMwa,
          newMwa,
          inventoryValueDelta,
          line.purchase_item_id,
          payload.notes,
          input.command.occurred_at,
          context.authorization.user.id,
          input.command.correlation_id,
        ],
      );
      const outstandingProvisional = await executor.query<OutstandingProvisionalRow>(
        `SELECT ce.source_type, ce.source_id
         FROM costing.cost_events ce
         JOIN purchasing.receipt_items ri ON ri.id = ce.source_id
         JOIN purchasing.purchase_items pi ON pi.id = ri.purchase_item_id
         JOIN purchasing.purchases p ON p.id = pi.purchase_id
         WHERE ce.business_id = $1
           AND ce.location_id = $2
           AND ce.product_id = $3
           AND ce.event_type = 'PROVISIONAL_COST'
           AND p.id <> $4
           AND p.status <> 'POSTED'
         ORDER BY ce.occurred_at DESC, ce.id DESC
         LIMIT 1`,
        [businessId, locationId, line.product_id, payload.purchase_id],
      );
      const authorityStatus =
        outstandingProvisional.rows[0] === undefined ? "FINAL" : "PROVISIONAL";
      const authoritySourceType =
        outstandingProvisional.rows[0]?.source_type ?? "PURCHASE_ITEM";
      const authoritySourceId =
        outstandingProvisional.rows[0]?.source_id ?? line.purchase_item_id;
      await executor.query(
        `INSERT INTO costing.product_cost_states (
           business_id, location_id, product_id, mwa_unit_cost, last_valid_mwa_unit_cost,
           latest_landed_unit_cost, pricing_reference_unit_cost,
           pricing_reference_source_type, pricing_reference_source_id,
           cost_status, cost_source_type, cost_source_id,
           last_cost_event_id, updated_at
         ) VALUES ($1, $2, $3, $4, $4, $5, $5, 'PURCHASE_ITEM', $6,
                   $7, $8, $9, $10, CURRENT_TIMESTAMP)
         ON CONFLICT (business_id, location_id, product_id) DO UPDATE
         SET mwa_unit_cost = EXCLUDED.mwa_unit_cost,
             last_valid_mwa_unit_cost = EXCLUDED.last_valid_mwa_unit_cost,
             latest_landed_unit_cost = EXCLUDED.latest_landed_unit_cost,
             pricing_reference_unit_cost = EXCLUDED.pricing_reference_unit_cost,
             pricing_reference_source_type = EXCLUDED.pricing_reference_source_type,
             pricing_reference_source_id = EXCLUDED.pricing_reference_source_id,
             cost_status = EXCLUDED.cost_status,
             cost_source_type = EXCLUDED.cost_source_type,
             cost_source_id = EXCLUDED.cost_source_id,
             last_cost_event_id = EXCLUDED.last_cost_event_id,
             updated_at = CURRENT_TIMESTAMP`,
        [
          businessId,
          locationId,
          line.product_id,
          newMwa,
          landedUnitCost,
          line.purchase_item_id,
          authorityStatus,
          authoritySourceType,
          authoritySourceId,
          reconciliationEventId,
        ],
      );
      await executor.query(
        `INSERT INTO pricing.pricing_review_items (
           id, business_id, product_unit_id, reason_type, cost_before, cost_after,
           current_price, status, source_cost_event_id, created_at
         ) SELECT $1, $2, $3, 'COST_CHANGED', $4, $5,
                  retail.unit_price, 'OPEN', $6, CURRENT_TIMESTAMP
           FROM (SELECT 1) anchor
           LEFT JOIN LATERAL (
             SELECT pt.unit_price
             FROM pricing.price_versions pv
             JOIN pricing.price_tier_versions pt ON pt.price_version_id = pv.id
             WHERE pv.business_id = $2 AND pv.product_unit_id = $3
               AND pv.status = 'ACTIVE' AND pt.tier_code = 'RETAIL'
             ORDER BY pv.effective_from DESC LIMIT 1
           ) retail ON TRUE`,
        [crypto.randomUUID(), businessId, line.product_unit_id, oldMwa, landedUnitCost, finalCostEventId],
      );
      finalCosts.push({
        cost_source_id: authoritySourceId,
        cost_source_type: authoritySourceType,
        cost_status: authorityStatus,
        purchase_value_delta_allocated_to_cogs: money8(purchaseDeltaAllocatedToCogs),
        final_landed_cost_per_base_unit: landedUnitCost,
        inventory_reconciliation_value_delta: inventoryValueDelta,
        mwa_unit_cost: newMwa,
        product_id: line.product_id,
        product_unit_id: line.product_unit_id,
      });
    }

    const nextVersion = (BigInt(purchase.version) + 1n).toString();
    await executor.query(
      `UPDATE purchasing.purchases
       SET status = 'POSTED', integrity_status = CASE WHEN integrity_status = 'WARNING' THEN 'RESOLVED' ELSE integrity_status END,
           posted_at = CURRENT_TIMESTAMP, notes = COALESCE($3, notes),
           updated_at = CURRENT_TIMESTAMP, version = $4
       WHERE id = $1 AND business_id = $2`,
      [payload.purchase_id, businessId, payload.notes, nextVersion],
    );
    const result = {
      final_costs: finalCosts,
      purchase_id: payload.purchase_id,
      status: "POSTED",
      version: nextVersion,
      warnings: [] as readonly string[],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "PURCHASE_POSTED",
      after_data: result,
      entity_id: payload.purchase_id,
      entity_type: "purchase",
      ...(payload.notes === null ? {} : { reason: payload.notes }),
    });
    await appendChange(executor, context, input.command, {
      change_type: "EVENT",
      entity_id: payload.purchase_id,
      entity_type: "purchase",
      entity_version: nextVersion,
      payload: result,
    });
    return result;
  });
}
