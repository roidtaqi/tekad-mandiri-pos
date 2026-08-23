import {
  decimalAdd,
  decimalCompare,
  decimalDivide,
  decimalMultiply,
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
import { ApiError, parsePositiveInteger } from "./http.js";
import { appendStockBalanceProjection } from "./inventory.js";
import {
  assertFreshAuthorization,
  decimalValue,
  requireCommandLocation,
} from "./operational-values.js";
import {
  arrayValue,
  booleanValue,
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

export interface ReturnCommandInput {
  readonly command: CommandIdentity;
  readonly command_authorization_version: number;
  readonly device_id: string;
  readonly payload: unknown;
}

interface ReturnItemInput {
  readonly condition_notes: string | null;
  readonly conversion_snapshot: DecimalValue;
  readonly disposition: "RESTOCK" | "NOT_RESTOCKED";
  readonly disposition_override: boolean;
  readonly disposition_override_reason: string | null;
  readonly original_transaction_item_id: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly reason_code: string;
  readonly return_item_id: string;
  readonly return_qty: DecimalValue;
}

interface RefundInput {
  readonly amount: DecimalValue;
  readonly external_reference: string | null;
  readonly original_payment_id: string;
  readonly override_amount: boolean;
  readonly override_method: boolean;
  readonly override_reason: string | null;
  readonly payment_method_id: string;
  readonly refund_id: string;
  readonly refund_number: string;
}

interface ReturnPayload {
  readonly items: readonly ReturnItemInput[];
  readonly notes: string | null;
  readonly occurred_at: string;
  readonly original_transaction_id: string;
  readonly override_window: boolean;
  readonly receipt_mode: "TRANSACTION_LINKED";
  readonly refund: RefundInput;
  readonly return_id: string;
  readonly return_number: string;
  readonly return_type: "PARTIAL" | "FULL";
  readonly shift_id: string;
  readonly terminal_id: string;
  readonly window_override_reason: string | null;
}

interface TransactionRow {
  readonly customer_id: string | null;
  readonly location_id: string;
  readonly return_age_days: number;
  readonly sale_completed_at: Date | string;
  readonly status: string;
}

interface BusinessReturnPolicyRow {
  readonly return_window_days: number;
}

interface SaleItemRow {
  readonly base_quantity: string;
  readonly cost_status: "COST_PENDING" | "FINAL" | "PROVISIONAL";
  readonly conversion_snapshot: string;
  readonly cost_unit_snapshot: string | null;
  readonly final_unit_price_snapshot: string;
  readonly line_total: string;
  readonly product_id: string;
  readonly product_name_snapshot: string;
  readonly product_unit_id: string;
  readonly quantity: string;
  readonly unit_name_snapshot: string;
}

interface PaymentRow {
  readonly amount: string;
  readonly payment_method_id: string;
  readonly status: string;
}

interface MethodRow {
  readonly is_cash: boolean;
}

interface ShiftRow {
  readonly cashier_user_id: string;
  readonly location_id: string;
  readonly status: string;
  readonly terminal_id: string;
}

interface BalanceCostRow {
  readonly base_quantity: string;
  readonly mwa_unit_cost: string | null;
}

interface ResolvedReturnItem {
  readonly base_return_qty: DecimalValue;
  readonly disposition: "RESTOCK" | "NOT_RESTOCKED";
  readonly disposition_override: boolean;
  readonly disposition_override_reason: string | null;
  readonly normal_disposition_snapshot: "RESTOCK" | "NOT_RESTOCKED";
  readonly original_cost_status: "COST_PENDING" | "FINAL" | "PROVISIONAL";
  readonly original_cost_unit_snapshot: DecimalValue | null;
  readonly original_effective_unit_price: DecimalValue;
  readonly original_transaction_item_id: string;
  readonly product_id: string;
  readonly product_name_snapshot: string;
  readonly product_unit_id: string;
  readonly reason_code: string;
  readonly return_item_id: string;
  readonly return_qty: DecimalValue;
  readonly refundable_amount: DecimalValue;
  readonly unit_name_snapshot: string;
  readonly conversion_snapshot: DecimalValue;
  readonly condition_notes: string | null;
}

interface RefundSummaryRow {
  readonly refunded_total: string;
  readonly refund_status: "NONE" | "PENDING" | "PARTIAL" | "COMPLETED";
}

export interface ReturnableSaleItem {
  readonly conversion_snapshot: string;
  readonly final_unit_price_snapshot: string;
  readonly line_total: string;
  readonly product_id: string;
  readonly product_name_snapshot: string;
  readonly product_unit_id: string;
  readonly quantity: string;
  readonly remaining_returnable_qty: string;
  readonly sku_snapshot: string;
  readonly transaction_item_id: string;
  readonly unit_code_snapshot: string;
  readonly unit_name_snapshot: string;
}

export interface ReturnableSalePayment {
  readonly amount: string;
  readonly amount_tendered: string | null;
  readonly change_amount: string | null;
  readonly external_reference: string | null;
  readonly method_code: string;
  readonly payment_id: string;
  readonly payment_method_id: string;
  readonly status: string;
}

export interface ReturnableSaleDetail {
  readonly transaction: {
    readonly change_amount: string;
    readonly completed_at: Date | string | null;
    readonly grand_total: string;
    readonly line_discount_total: string;
    readonly location_id: string;
    readonly occurred_at: Date | string;
    readonly promotion_discount_total: string;
    readonly status: "COMPLETED";
    readonly subtotal: string;
    readonly tax_total: string;
    readonly terminal_id: string;
    readonly transaction_discount_total: string;
    readonly transaction_id: string;
    readonly transaction_number: string;
  };
  readonly items: readonly ReturnableSaleItem[];
  readonly payments: readonly ReturnableSalePayment[];
}

interface ReturnableSaleRow {
  readonly change_amount: string;
  readonly completed_at: Date | string | null;
  readonly grand_total: string;
  readonly items: readonly ReturnableSaleItem[];
  readonly line_discount_total: string;
  readonly location_id: string;
  readonly occurred_at: Date | string;
  readonly payments: readonly ReturnableSalePayment[];
  readonly promotion_discount_total: string;
  readonly status: "COMPLETED";
  readonly subtotal: string;
  readonly tax_total: string;
  readonly terminal_id: string;
  readonly transaction_discount_total: string;
  readonly transaction_id: string;
  readonly transaction_number: string;
}

const RETURNABLE_SALE_SELECT = `
  SELECT t.id AS transaction_id, t.transaction_number, t.location_id,
         t.terminal_id, t.status, t.subtotal::text,
         t.promotion_discount_total::text, t.line_discount_total::text,
         t.transaction_discount_total::text, t.tax_total::text,
         t.grand_total::text, t.change_amount::text, t.occurred_at,
         t.completed_at, COALESCE(item_rows.items, '[]'::jsonb) AS items,
         COALESCE(payment_rows.payments, '[]'::jsonb) AS payments
  FROM sales.transactions t
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'transaction_item_id', ti.id::text,
        'product_id', ti.product_id::text,
        'product_unit_id', ti.product_unit_id::text,
        'product_name_snapshot', ti.product_name_snapshot,
        'sku_snapshot', ti.sku_snapshot,
        'unit_code_snapshot', ti.unit_code_snapshot,
        'unit_name_snapshot', ti.unit_name_snapshot,
        'conversion_snapshot', ti.conversion_snapshot::text,
        'quantity', ti.quantity::text,
        'final_unit_price_snapshot', ti.final_unit_price_snapshot::text,
        'line_total', ti.line_total::text,
        'remaining_returnable_qty',
          (ti.quantity - COALESCE(returned.return_qty, 0))::text
      ) ORDER BY ti.line_index
    ) AS items
    FROM sales.transaction_items ti
    LEFT JOIN LATERAL (
      SELECT sum(ri.return_qty) AS return_qty
      FROM returns.return_items ri
      JOIN returns.customer_returns cr ON cr.id = ri.customer_return_id
      WHERE ri.original_transaction_item_id = ti.id
        AND cr.business_id = t.business_id
        AND cr.status = 'COMPLETED'
    ) returned ON TRUE
    WHERE ti.transaction_id = t.id
  ) item_rows ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'payment_id', p.id::text,
        'payment_method_id', p.payment_method_id::text,
        'method_code', p.method_code_snapshot,
        'amount', p.amount::text,
        'amount_tendered', p.amount_tendered::text,
        'change_amount', p.change_amount::text,
        'status', p.status,
        'external_reference', p.external_reference
      ) ORDER BY p.received_at, p.id
    ) AS payments
    FROM sales.payments p
    WHERE p.transaction_id = t.id AND p.business_id = t.business_id
  ) payment_rows ON TRUE`;

function returnableSale(row: ReturnableSaleRow): ReturnableSaleDetail {
  return {
    transaction: {
      change_amount: row.change_amount,
      completed_at: row.completed_at,
      grand_total: row.grand_total,
      line_discount_total: row.line_discount_total,
      location_id: row.location_id,
      occurred_at: row.occurred_at,
      promotion_discount_total: row.promotion_discount_total,
      status: row.status,
      subtotal: row.subtotal,
      tax_total: row.tax_total,
      terminal_id: row.terminal_id,
      transaction_discount_total: row.transaction_discount_total,
      transaction_id: row.transaction_id,
      transaction_number: row.transaction_number,
    },
    items: row.items,
    payments: row.payments,
  };
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function listReturnableSales(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  url: URL,
): Promise<readonly ReturnableSaleDetail[]> {
  requirePermission(context, "return.read");
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length > 120) {
    throw new ApiError(400, "RETURN_SALE_QUERY_TOO_LONG", "Pencarian transaksi maksimal 120 karakter.");
  }
  const limit = parsePositiveInteger(url.searchParams.get("limit"), 20, 50);
  const rows = await database.query<ReturnableSaleRow>(
    `${RETURNABLE_SALE_SELECT}
     WHERE t.business_id = $1 AND t.location_id = $2 AND t.status = 'COMPLETED'
       AND ($3 = '' OR t.id::text = $4 OR t.transaction_number ILIKE '%' || $3 || '%' ESCAPE '\\')
     ORDER BY t.occurred_at DESC, t.id
     LIMIT $5`,
    [
      context.authorization.membership.business_id,
      context.authorization.default_location_id,
      escapeLike(query),
      query,
      limit,
    ],
  );
  return rows.rows.map(returnableSale);
}

export async function getReturnableSale(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  transactionId: string,
): Promise<ReturnableSaleDetail> {
  requirePermission(context, "return.read");
  const id = uuidValue(transactionId, "transaction_id");
  const rows = await database.query<ReturnableSaleRow>(
    `${RETURNABLE_SALE_SELECT}
     WHERE t.id = $1 AND t.business_id = $2 AND t.location_id = $3
       AND t.status = 'COMPLETED'`,
    [
      id,
      context.authorization.membership.business_id,
      context.authorization.default_location_id,
    ],
  );
  const row = rows.rows[0];
  if (row === undefined) {
    throw new ApiError(404, "RETURN_TRANSACTION_NOT_FOUND", "Transaksi asli tidak ditemukan.");
  }
  return returnableSale(row);
}

function money(value: unknown, field: string): DecimalValue {
  return decimalValue(value, field, { allowZero: true, precision: 20, scale: 4 });
}

function quantity(value: unknown, field: string): DecimalValue {
  return decimalValue(value, field, { precision: 20, scale: 6 });
}

function factor(value: unknown, field: string): DecimalValue {
  return decimalValue(value, field, { precision: 20, scale: 8 });
}

function optionalReason(value: unknown, field: string): string | null {
  const reason = nullableStringValue(value, field);
  if (reason === null) return null;
  const normalized = reason.trim();
  if (normalized === "") throw validationError(field, "tidak boleh kosong");
  return normalized;
}

function readReturnItem(value: unknown, index: number): ReturnItemInput {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  return {
    condition_notes: nullableStringValue(row.condition_notes, `${field}.condition_notes`),
    conversion_snapshot: factor(row.conversion_snapshot, `${field}.conversion_snapshot`),
    disposition: enumValue(row.disposition, `${field}.disposition`, [
      "RESTOCK",
      "NOT_RESTOCKED",
    ] as const),
    disposition_override:
      row.disposition_override === undefined
        ? false
        : booleanValue(row.disposition_override, `${field}.disposition_override`),
    disposition_override_reason: optionalReason(
      row.disposition_override_reason,
      `${field}.disposition_override_reason`,
    ),
    original_transaction_item_id: uuidValue(
      row.original_transaction_item_id,
      `${field}.original_transaction_item_id`,
    ),
    product_id: uuidValue(row.product_id, `${field}.product_id`),
    product_unit_id: uuidValue(row.product_unit_id, `${field}.product_unit_id`),
    reason_code: stringValue(row.reason_code, `${field}.reason_code`),
    return_item_id: uuidValue(row.return_item_id, `${field}.return_item_id`),
    return_qty: quantity(row.return_qty, `${field}.return_qty`),
  };
}

function readRefund(value: unknown): RefundInput {
  const row = objectValue(value, "payload.refund");
  return {
    amount: money(row.amount, "payload.refund.amount"),
    external_reference: nullableStringValue(
      row.external_reference,
      "payload.refund.external_reference",
    ),
    original_payment_id: uuidValue(
      row.original_payment_id,
      "payload.refund.original_payment_id",
    ),
    override_amount: booleanValue(row.override_amount, "payload.refund.override_amount"),
    override_method: booleanValue(row.override_method, "payload.refund.override_method"),
    override_reason: nullableStringValue(
      row.override_reason,
      "payload.refund.override_reason",
    ),
    payment_method_id: uuidValue(
      row.payment_method_id,
      "payload.refund.payment_method_id",
    ),
    refund_id: uuidValue(row.refund_id, "payload.refund.refund_id"),
    refund_number: stringValue(row.refund_number, "payload.refund.refund_number"),
  };
}

function readReturn(value: unknown): ReturnPayload {
  const row = objectValue(value, "payload");
  const items = arrayValue(row.items, "payload.items").map(readReturnItem);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  if (
    new Set(items.map((item) => item.return_item_id)).size !== items.length ||
    new Set(items.map((item) => item.original_transaction_item_id)).size !== items.length
  ) {
    throw new ApiError(400, "RETURN_ITEM_DUPLICATE", "Return Item atau original line duplikat.");
  }
  return {
    items,
    notes: nullableStringValue(row.notes, "payload.notes"),
    occurred_at: timestampValue(row.occurred_at, "payload.occurred_at"),
    original_transaction_id: uuidValue(
      row.original_transaction_id,
      "payload.original_transaction_id",
    ),
    override_window:
      row.override_window === undefined
        ? false
        : booleanValue(row.override_window, "payload.override_window"),
    receipt_mode: enumValue(row.receipt_mode, "payload.receipt_mode", [
      "TRANSACTION_LINKED",
    ] as const),
    refund: readRefund(row.refund),
    return_id: uuidValue(row.return_id, "payload.return_id"),
    return_number: stringValue(row.return_number, "payload.return_number"),
    return_type: enumValue(row.return_type, "payload.return_type", ["PARTIAL", "FULL"] as const),
    shift_id: uuidValue(row.shift_id, "payload.shift_id"),
    terminal_id: uuidValue(row.terminal_id, "payload.terminal_id"),
    window_override_reason: optionalReason(
      row.window_override_reason,
      "payload.window_override_reason",
    ),
  };
}

function fixed4(value: DecimalValue): DecimalValue {
  return quantizeDecimal(value, 4, "HALF_UP");
}

function fixed8(value: DecimalValue): DecimalValue {
  return quantizeDecimal(value, 8, "HALF_UP");
}

function returnLossCategory(reasonCode: string):
  | "DAMAGED_RETURN"
  | "EXPIRED_RETURN"
  | "QUALITY_RETURN"
  | "OTHER_RETURN_LOSS" {
  switch (reasonCode) {
    case "DAMAGED":
      return "DAMAGED_RETURN";
    case "EXPIRED":
      return "EXPIRED_RETURN";
    case "DEFECTIVE":
    case "QUALITY_ISSUE":
      return "QUALITY_RETURN";
    default:
      return "OTHER_RETURN_LOSS";
  }
}

async function resolveReturnItem(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  payload: ReturnPayload,
  item: ReturnItemInput,
): Promise<ResolvedReturnItem> {
  const businessId = context.authorization.membership.business_id;
  const originalRows = await executor.query<SaleItemRow>(
    `SELECT ti.product_id, ti.product_unit_id, ti.product_name_snapshot,
            ti.unit_name_snapshot, ti.conversion_snapshot::text,
            ti.quantity::text, ti.base_quantity::text,
            ti.final_unit_price_snapshot::text, ti.line_total::text,
            ti.cost_unit_snapshot::text, ti.cost_status
     FROM sales.transaction_items ti
     JOIN sales.transactions t ON t.id = ti.transaction_id
     WHERE ti.id = $1 AND ti.transaction_id = $2 AND t.business_id = $3
     FOR UPDATE OF ti`,
    [item.original_transaction_item_id, payload.original_transaction_id, businessId],
  );
  const original = originalRows.rows[0];
  if (
    original === undefined ||
    original.product_id !== item.product_id ||
    original.product_unit_id !== item.product_unit_id ||
    parseDecimal(original.conversion_snapshot) !== item.conversion_snapshot
  ) {
    throw new ApiError(
      409,
      "RETURN_ORIGINAL_LINE_MISMATCH",
      "Return Item tidak cocok dengan baris transaksi asli.",
    );
  }
  const dispositionPolicies = await executor.query<{
    readonly normal_disposition: "RESTOCK" | "NOT_RESTOCKED";
  }>(
    `SELECT normal_disposition
     FROM returns.return_reason_policies
     WHERE business_id = $1 AND reason_code = $2 AND status = 'ACTIVE'
     FOR SHARE`,
    [businessId, item.reason_code],
  );
  const normalDisposition = dispositionPolicies.rows[0]?.normal_disposition;
  if (normalDisposition === undefined) {
    throw new ApiError(
      409,
      "RETURN_DISPOSITION_POLICY_NOT_CONFIGURED",
      `Policy disposition untuk alasan ${item.reason_code} belum dikonfigurasi.`,
    );
  }
  const dispositionDiffers = item.disposition !== normalDisposition;
  if (dispositionDiffers && !item.disposition_override) {
    throw new ApiError(
      409,
      "RETURN_DISPOSITION_OVERRIDE_REQUIRED",
      "Disposition menyimpang dari policy normal dan harus diproses sebagai override.",
    );
  }
  if (dispositionDiffers && item.disposition_override_reason === null) {
    throw new ApiError(
      400,
      "RETURN_DISPOSITION_OVERRIDE_REASON_REQUIRED",
      "Alasan override disposition wajib diisi.",
    );
  }
  if (!dispositionDiffers && item.disposition_override) {
    throw new ApiError(
      409,
      "RETURN_DISPOSITION_OVERRIDE_NOT_REQUIRED",
      "Disposition sudah sesuai policy normal dan tidak memerlukan override.",
    );
  }
  if (!item.disposition_override && item.disposition_override_reason !== null) {
    throw new ApiError(
      400,
      "RETURN_DISPOSITION_OVERRIDE_CONTEXT_INVALID",
      "Alasan override disposition hanya boleh diisi untuk override yang nyata.",
    );
  }
  if (dispositionDiffers) requirePermission(context, "return.override_disposition");

  const prior = await executor.query<{
    readonly refundable_amount: string;
    readonly returned_qty: string;
  }>(
    `SELECT COALESCE(sum(ri.return_qty), 0)::text AS returned_qty,
            COALESCE(sum(ri.refundable_amount), 0)::text AS refundable_amount
     FROM returns.return_items ri
     JOIN returns.customer_returns cr ON cr.id = ri.customer_return_id
     WHERE ri.original_transaction_item_id = $1
       AND cr.business_id = $2
       AND cr.status = 'COMPLETED'`,
    [item.original_transaction_item_id, businessId],
  );
  const priorReturnedQty = parseDecimal(prior.rows[0]?.returned_qty ?? "0");
  const priorRefundableAmount = parseDecimal(prior.rows[0]?.refundable_amount ?? "0");
  const newTotal = decimalAdd(priorReturnedQty, item.return_qty);
  if (decimalCompare(newTotal, parseDecimal(original.quantity)) > 0) {
    throw new ApiError(
      409,
      "RETURN_QUANTITY_CONFLICT",
      "Kuantitas Return melebihi sisa kuantitas yang dapat diretur.",
    );
  }
  const effectiveUnit = fixed4(
    decimalDivide(parseDecimal(original.line_total), parseDecimal(original.quantity)),
  );
  const refundable =
    decimalCompare(newTotal, parseDecimal(original.quantity)) === 0
      ? fixed4(decimalSubtract(parseDecimal(original.line_total), priorRefundableAmount))
      : fixed4(
          decimalDivide(
            decimalMultiply(parseDecimal(original.line_total), item.return_qty),
            parseDecimal(original.quantity),
          ),
        );
  return {
    base_return_qty: decimalMultiply(item.return_qty, item.conversion_snapshot),
    condition_notes: item.condition_notes,
    conversion_snapshot: item.conversion_snapshot,
    disposition: item.disposition,
    disposition_override: dispositionDiffers,
    disposition_override_reason: item.disposition_override_reason,
    normal_disposition_snapshot: normalDisposition,
    original_cost_status: original.cost_status,
    original_cost_unit_snapshot:
      original.cost_unit_snapshot === null ? null : parseDecimal(original.cost_unit_snapshot),
    original_effective_unit_price: effectiveUnit,
    original_transaction_item_id: item.original_transaction_item_id,
    product_id: item.product_id,
    product_name_snapshot: original.product_name_snapshot,
    product_unit_id: item.product_unit_id,
    reason_code: item.reason_code,
    refundable_amount: refundable,
    return_item_id: item.return_item_id,
    return_qty: item.return_qty,
    unit_name_snapshot: original.unit_name_snapshot,
  };
}

async function restockReturnItem(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  input: ReturnCommandInput,
  payload: ReturnPayload,
  item: ResolvedReturnItem,
): Promise<string> {
  const businessId = context.authorization.membership.business_id;
  const locationId = input.command.location_id as string;
  await executor.query(
    `SELECT 1 FROM inventory.stock_balances
     WHERE business_id = $1 AND location_id = $2 AND product_id = $3
     FOR UPDATE`,
    [businessId, locationId, item.product_id],
  );
  const movementId = crypto.randomUUID();
  await executor.query(
    `INSERT INTO inventory.stock_movements (
       id, business_id, location_id, product_id, movement_type,
       base_quantity_delta, source_unit_id, source_quantity, conversion_snapshot,
       source_type, source_id, source_line_id, reason_code, occurred_at,
       actor_user_id, device_id, correlation_id
     ) VALUES ($1, $2, $3, $4, 'CUSTOMER_RETURN', $5, $6, $7, $8,
               'CUSTOMER_RETURN', $9, $10, $11, $12, $13, $14, $15)`,
    [
      movementId,
      businessId,
      locationId,
      item.product_id,
      item.base_return_qty,
      item.product_unit_id,
      item.return_qty,
      item.conversion_snapshot,
      payload.return_id,
      item.return_item_id,
      item.reason_code,
      payload.occurred_at,
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
    [businessId, locationId, item.product_id, item.base_return_qty, movementId],
  );
  await appendStockBalanceProjection(executor, context, input.command, {
    business_id: businessId,
    last_movement_id: movementId,
    location_id: locationId,
    product_id: item.product_id,
  });

  if (
    item.original_cost_unit_snapshot !== null &&
    item.original_cost_status !== "COST_PENDING"
  ) {
    const rows = await executor.query<BalanceCostRow>(
      `SELECT COALESCE(sb.base_quantity - $4::numeric, 0)::text AS base_quantity,
              pcs.mwa_unit_cost::text
       FROM inventory.stock_balances sb
       LEFT JOIN costing.product_cost_states pcs
         ON pcs.business_id = sb.business_id AND pcs.location_id = sb.location_id
        AND pcs.product_id = sb.product_id
       WHERE sb.business_id = $1 AND sb.location_id = $2 AND sb.product_id = $3
       FOR UPDATE OF sb`,
      [businessId, locationId, item.product_id, item.base_return_qty],
    );
    const prior = rows.rows[0] ?? { base_quantity: "0", mwa_unit_cost: null };
    const oldQty = parseDecimal(prior.base_quantity);
    const newQty = decimalAdd(oldQty, item.base_return_qty);
    const oldMwa = prior.mwa_unit_cost === null ? null : parseDecimal(prior.mwa_unit_cost);
    let newMwa = item.original_cost_unit_snapshot;
    if (decimalCompare(oldQty, ZERO) > 0 && oldMwa !== null && decimalCompare(newQty, ZERO) > 0) {
      newMwa = fixed8(
        decimalDivide(
          decimalAdd(
            decimalMultiply(oldQty, oldMwa),
            decimalMultiply(item.base_return_qty, item.original_cost_unit_snapshot),
          ),
          newQty,
        ),
      );
    }
    const costEventId = crypto.randomUUID();
    await executor.query(
      `INSERT INTO costing.cost_events (
         id, business_id, location_id, product_id, event_type, quantity_basis,
         unit_cost_before, unit_cost_after, value_delta, source_type, source_id,
         reason, occurred_at, actor_user_id, correlation_id
       ) VALUES ($1, $2, $3, $4, 'CUSTOMER_RETURN', $5, $6, $7, $8,
                 'CUSTOMER_RETURN_ITEM', $9, $10, $11, $12, $13)`,
      [
        costEventId,
        businessId,
        locationId,
        item.product_id,
        item.base_return_qty,
        oldMwa,
        newMwa,
        decimalMultiply(item.base_return_qty, item.original_cost_unit_snapshot),
        item.return_item_id,
        item.reason_code,
        payload.occurred_at,
        context.authorization.user.id,
        input.command.correlation_id,
      ],
    );
    await executor.query(
      `INSERT INTO costing.product_cost_states (
         business_id, location_id, product_id, mwa_unit_cost,
         last_valid_mwa_unit_cost, last_cost_event_id, cost_status,
         cost_source_type, cost_source_id, updated_at
       ) VALUES ($1, $2, $3, $4, $4, $5, $6,
                 'CUSTOMER_RETURN_ITEM', $7, CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, location_id, product_id) DO UPDATE
       SET mwa_unit_cost = EXCLUDED.mwa_unit_cost,
           last_valid_mwa_unit_cost = EXCLUDED.last_valid_mwa_unit_cost,
           last_cost_event_id = EXCLUDED.last_cost_event_id,
           cost_status = EXCLUDED.cost_status,
           cost_source_type = EXCLUDED.cost_source_type,
           cost_source_id = EXCLUDED.cost_source_id,
           updated_at = CURRENT_TIMESTAMP`,
      [
        businessId,
        locationId,
        item.product_id,
        newMwa,
        costEventId,
        item.original_cost_status,
        item.return_item_id,
      ],
    );
  }
  return movementId;
}

export async function completeReturnCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: ReturnCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "return.process");
  requirePermission(context, "refund.process");
  const locationId = requireCommandLocation(context, input.command);
  const payload = readReturn(input.payload);
  if (payload.occurred_at !== input.command.occurred_at) {
    throw new ApiError(400, "RETURN_CONTEXT_MISMATCH", "Waktu Return dan envelope berbeda.");
  }
  if ((payload.refund.override_amount || payload.refund.override_method) && payload.refund.override_reason === null) {
    throw new ApiError(400, "REFUND_OVERRIDE_REASON_REQUIRED", "Alasan override Refund wajib diisi.");
  }
  if (payload.refund.override_amount) requirePermission(context, "refund.override_amount");
  if (payload.refund.override_method) requirePermission(context, "refund.override_method");
  const businessId = context.authorization.membership.business_id;
  const staleAuthorization =
    input.command_authorization_version !== context.authorization.authorization_version;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const transactions = await executor.query<TransactionRow>(
      `SELECT t.location_id, t.customer_id, t.status,
              COALESCE(t.completed_at, t.occurred_at) AS sale_completed_at,
              (
                ($3::timestamptz AT TIME ZONE b.timezone)::date
                - (COALESCE(t.completed_at, t.occurred_at) AT TIME ZONE b.timezone)::date
              )::integer AS return_age_days
       FROM sales.transactions t
       JOIN core.businesses b ON b.id = t.business_id
       WHERE t.id = $1 AND t.business_id = $2
       FOR UPDATE OF t`,
      [payload.original_transaction_id, businessId, payload.occurred_at],
    );
    const transaction = transactions.rows[0];
    if (transaction === undefined || transaction.location_id !== locationId) {
      throw new ApiError(404, "RETURN_TRANSACTION_NOT_FOUND", "Transaksi asli tidak ditemukan.");
    }
    if (transaction.status !== "COMPLETED") {
      throw new ApiError(409, "RETURN_TRANSACTION_STATE_INVALID", "Hanya transaksi COMPLETED yang dapat diretur.");
    }
    if (transaction.return_age_days < 0) {
      throw new ApiError(
        409,
        "RETURN_TIME_BEFORE_SALE",
        "Waktu Return tidak boleh mendahului penyelesaian transaksi asli.",
      );
    }
    const policyRows = await executor.query<BusinessReturnPolicyRow>(
      `SELECT return_window_days
       FROM core.business_settings
       WHERE business_id = $1
       FOR SHARE`,
      [businessId],
    );
    const businessPolicy = policyRows.rows[0];
    if (businessPolicy === undefined) {
      throw new ApiError(
        409,
        "RETURN_POLICY_NOT_CONFIGURED",
        "Business belum memiliki konfigurasi Return yang authoritative.",
      );
    }
    const outsideWindow = transaction.return_age_days > businessPolicy.return_window_days;
    if (outsideWindow && !payload.override_window) {
      throw new ApiError(
        409,
        "RETURN_WINDOW_EXPIRED",
        `Return melewati policy ${businessPolicy.return_window_days} hari kalender.`,
      );
    }
    if (outsideWindow && payload.window_override_reason === null) {
      throw new ApiError(
        400,
        "RETURN_WINDOW_OVERRIDE_REASON_REQUIRED",
        "Alasan override window Return wajib diisi.",
      );
    }
    if (!outsideWindow && (payload.override_window || payload.window_override_reason !== null)) {
      throw new ApiError(
        409,
        "RETURN_WINDOW_OVERRIDE_NOT_REQUIRED",
        "Return masih berada di dalam window normal.",
      );
    }
    if (outsideWindow) requirePermission(context, "return.override_window");

    const shifts = await executor.query<ShiftRow>(
      `SELECT s.cashier_user_id, s.location_id, s.terminal_id, s.status
       FROM cash.shifts s
       JOIN core.terminals t
         ON t.id = s.terminal_id
        AND t.business_id = s.business_id
        AND t.location_id = s.location_id
       WHERE s.id = $1 AND s.business_id = $2 AND t.status = 'ACTIVE'
       FOR UPDATE OF s`,
      [payload.shift_id, businessId],
    );
    const currentShift = shifts.rows[0];
    if (
      currentShift === undefined ||
      currentShift.status !== "OPEN" ||
      currentShift.location_id !== locationId ||
      currentShift.terminal_id !== payload.terminal_id ||
      currentShift.cashier_user_id !== context.authorization.user.id
    ) {
      throw new ApiError(
        409,
        "RETURN_SHIFT_CONTEXT_INVALID",
        "Return harus diproses pada Shift OPEN milik actor, Location, dan Terminal saat ini.",
      );
    }

    const resolvedItems: ResolvedReturnItem[] = [];
    for (const item of payload.items) {
      resolvedItems.push(await resolveReturnItem(executor, context, payload, item));
    }
    const returnTotal = resolvedItems.reduce(
      (total, item) => decimalAdd(total, item.refundable_amount),
      ZERO,
    );
    if (
      !payload.refund.override_amount &&
      decimalCompare(payload.refund.amount, returnTotal) !== 0
    ) {
      throw new ApiError(
        409,
        "REFUND_AMOUNT_MISMATCH",
        "Jumlah Refund harus sama dengan nilai historis Return.",
      );
    }
    if (
      payload.refund.override_amount &&
      decimalCompare(payload.refund.amount, returnTotal) > 0
    ) {
      // An authorized override may change allocation/rounding, but cannot create
      // value beyond the immutable original sale economics.
      throw new ApiError(
        409,
        "REFUND_EXCEEDS_RETURN_VALUE",
        "Jumlah Refund melebihi nilai transaksi asli yang diretur.",
      );
    }

    const payments = await executor.query<PaymentRow>(
      `SELECT amount::text, payment_method_id, status
       FROM sales.payments
       WHERE id = $1 AND transaction_id = $2 AND business_id = $3
       FOR UPDATE`,
      [payload.refund.original_payment_id, payload.original_transaction_id, businessId],
    );
    const originalPayment = payments.rows[0];
    if (originalPayment === undefined || originalPayment.status !== "COMPLETED") {
      throw new ApiError(409, "REFUND_ORIGINAL_PAYMENT_INVALID", "Pembayaran asli tidak valid untuk Refund.");
    }
    if (
      !payload.refund.override_method &&
      originalPayment.payment_method_id !== payload.refund.payment_method_id
    ) {
      throw new ApiError(409, "REFUND_METHOD_MISMATCH", "Metode Refund harus mengikuti pembayaran asli.");
    }
    const refunded = await executor.query<{ readonly amount: string }>(
      `SELECT COALESCE(sum(amount), 0)::text AS amount
       FROM returns.refunds
       WHERE original_payment_id = $1 AND status IN ('PENDING', 'COMPLETED', 'REQUIRES_ACTION')`,
      [payload.refund.original_payment_id],
    );
    const paymentRefundTotal = decimalAdd(
      parseDecimal(refunded.rows[0]?.amount ?? "0"),
      payload.refund.amount,
    );
    if (decimalCompare(paymentRefundTotal, parseDecimal(originalPayment.amount)) > 0) {
      throw new ApiError(409, "REFUND_PAYMENT_LIMIT_EXCEEDED", "Refund melebihi pembayaran asli.");
    }
    await assertExternalReferenceAvailable(
      executor,
      businessId,
      payload.refund.refund_id,
      payload.refund.external_reference,
    );
    const methods = await executor.query<MethodRow>(
      `SELECT is_cash FROM sales.payment_methods
       WHERE id = $1 AND business_id = $2 AND status = 'ACTIVE'`,
      [payload.refund.payment_method_id, businessId],
    );
    const method = methods.rows[0];
    if (method === undefined) throw new ApiError(404, "REFUND_METHOD_NOT_FOUND", "Metode Refund tidak ditemukan.");

    let refundStatus: "COMPLETED" | "PENDING" = "PENDING";
    let cashMovementId: string | null = null;
    if (method.is_cash) {
      refundStatus = "COMPLETED";
      cashMovementId = crypto.randomUUID();
      await executor.query(
        `INSERT INTO cash.cash_movements (
           id, business_id, location_id, terminal_id, shift_id, movement_type,
           amount, direction, source_type, source_id, reason_code, notes,
           occurred_at, actor_user_id, device_id, correlation_id
         ) VALUES ($1, $2, $3, $4, $5, 'CASH_REFUND', $6, 'OUT',
                   'CUSTOMER_REFUND', $7, 'CUSTOMER_RETURN', $8,
                   $9, $10, $11, $12)`,
        [
          cashMovementId,
          businessId,
          locationId,
          payload.terminal_id,
          payload.shift_id,
          payload.refund.amount,
          payload.refund.refund_id,
          payload.refund.override_reason,
          payload.occurred_at,
          context.authorization.user.id,
          input.device_id,
          input.command.correlation_id,
        ],
      );
    }

    await executor.query(
      `INSERT INTO returns.customer_returns (
         id, business_id, location_id, return_number, original_transaction_id,
         customer_id, status, refund_status, return_total, refunded_total,
         reason_code, notes, created_by, created_at, completed_at, version,
         return_type, receipt_mode, risk_level, reason_summary, processed_by,
         shift_id, terminal_id, device_id, occurred_at, correlation_id,
         return_window_days_snapshot, return_age_days, window_override,
         window_override_reason
       ) VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', 'NONE', $7, 0,
                 $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1,
                 $11, 'TRANSACTION_LINKED', 'STANDARD', $12, $10,
                 $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        payload.return_id,
        businessId,
        locationId,
        payload.return_number,
        payload.original_transaction_id,
        transaction.customer_id,
        returnTotal,
        resolvedItems[0]?.reason_code ?? "OTHER",
        payload.notes,
        context.authorization.user.id,
        payload.return_type,
        payload.notes ?? resolvedItems[0]?.reason_code ?? null,
        payload.shift_id,
        payload.terminal_id,
        input.device_id,
        payload.occurred_at,
        input.command.correlation_id,
        businessPolicy.return_window_days,
        transaction.return_age_days,
        outsideWindow,
        outsideWindow ? payload.window_override_reason : null,
      ],
    );

    const stockMovements: Array<Readonly<Record<string, unknown>>> = [];
    for (const item of resolvedItems) {
      let movementId: string | null = null;
      if (item.disposition === "RESTOCK") {
        movementId = await restockReturnItem(executor, context, input, payload, item);
        const projection = {
          base_quantity_delta: item.base_return_qty,
          id: movementId,
          product_id: item.product_id,
        } as const;
        stockMovements.push(projection);
        await appendChange(executor, context, input.command, {
          change_type: "EVENT",
          entity_id: movementId,
          entity_type: "stock_movement",
          payload: projection,
        });
      }
      await executor.query(
        `INSERT INTO returns.return_items (
           id, customer_return_id, original_transaction_item_id, product_id,
           product_unit_id, return_qty, base_return_qty, refund_unit_price,
           refund_total, disposition, posted_movement_id, reason_code,
           condition_notes, product_name_snapshot, unit_name_snapshot,
           conversion_snapshot, original_effective_unit_price,
           original_cost_unit_snapshot, return_loss_category, refundable_amount,
           normal_disposition_snapshot, disposition_override,
           disposition_override_reason, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                   $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                   CURRENT_TIMESTAMP)`,
        [
          item.return_item_id,
          payload.return_id,
          item.original_transaction_item_id,
          item.product_id,
          item.product_unit_id,
          item.return_qty,
          item.base_return_qty,
          item.original_effective_unit_price,
          item.refundable_amount,
          item.disposition,
          movementId,
          item.reason_code,
          item.condition_notes,
          item.product_name_snapshot,
          item.unit_name_snapshot,
          item.conversion_snapshot,
          item.original_effective_unit_price,
          item.original_cost_unit_snapshot,
          item.disposition === "NOT_RESTOCKED"
            ? returnLossCategory(item.reason_code)
            : null,
          item.refundable_amount,
          item.normal_disposition_snapshot,
          item.disposition_override,
          item.disposition_override_reason,
        ],
      );
    }

    await executor.query(
      `INSERT INTO returns.refunds (
         id, customer_return_id, business_id, location_id, amount,
         payment_method_id, status, processed_at, processed_by, created_at,
         version, original_payment_id, refund_number, shift_id, terminal_id,
         device_id, override_method, override_amount, override_reason,
         external_reference, requested_at, completed_at, correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7,
                 CASE WHEN $7 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,
                 CASE WHEN $7 = 'COMPLETED' THEN $8::uuid ELSE NULL END,
                 CURRENT_TIMESTAMP, 1, $9, $10, $11, $12, $13, $14, $15, $16,
                 $17, CURRENT_TIMESTAMP,
                 CASE WHEN $7 = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,
                 $18)`,
      [
        payload.refund.refund_id,
        payload.return_id,
        businessId,
        locationId,
        payload.refund.amount,
        payload.refund.payment_method_id,
        refundStatus,
        context.authorization.user.id,
        payload.refund.original_payment_id,
        payload.refund.refund_number,
        payload.shift_id,
        payload.terminal_id,
        input.device_id,
        payload.refund.override_method,
        payload.refund.override_amount,
        payload.refund.override_reason,
        payload.refund.external_reference,
        input.command.correlation_id,
      ],
    );
    const summaries = await executor.query<RefundSummaryRow>(
      `SELECT refund_status, refunded_total::text
       FROM returns.customer_returns
       WHERE id = $1 AND business_id = $2`,
      [payload.return_id, businessId],
    );
    const refundSummary = summaries.rows[0];
    if (refundSummary === undefined) {
      throw new Error("Return refund summary disappeared after Refund insert.");
    }
    const result = {
      cash_movement_id: cashMovementId,
      refund_id: payload.refund.refund_id,
      refund_record_status: refundStatus,
      refund_status: refundSummary.refund_status,
      refunded_total: refundSummary.refunded_total,
      return_id: payload.return_id,
      return_status: "COMPLETED",
      stock_movements: stockMovements,
      warnings: [
        ...(staleAuthorization ? ["AUTHORIZATION_STALE_EXCEPTION"] : []),
        ...(refundStatus === "PENDING" ? ["REFUND_PROVIDER_PENDING"] : []),
      ],
    } as const;
    if (outsideWindow) {
      await appendAuditEvent(executor, context, input.command, {
        action: "RETURN_WINDOW_OVERRIDDEN",
        after_data: {
          return_age_days: transaction.return_age_days,
          return_window_days: businessPolicy.return_window_days,
        },
        entity_id: payload.return_id,
        entity_type: "customer_return",
        reason: payload.window_override_reason as string,
      });
    }
    for (const item of resolvedItems) {
      if (!item.disposition_override) continue;
      await appendAuditEvent(executor, context, input.command, {
        action: "RETURN_DISPOSITION_OVERRIDDEN",
        after_data: {
          disposition: item.disposition,
          normal_disposition: item.normal_disposition_snapshot,
          reason_code: item.reason_code,
        },
        entity_id: item.return_item_id,
        entity_type: "return_item",
        reason: item.disposition_override_reason as string,
      });
    }
    if (payload.refund.override_amount) {
      await appendAuditEvent(executor, context, input.command, {
        action: "REFUND_AMOUNT_OVERRIDDEN",
        after_data: { amount: payload.refund.amount, historical_amount: returnTotal },
        entity_id: payload.refund.refund_id,
        entity_type: "refund",
        reason: payload.refund.override_reason as string,
      });
    }
    if (payload.refund.override_method) {
      await appendAuditEvent(executor, context, input.command, {
        action: "REFUND_METHOD_OVERRIDDEN",
        after_data: {
          original_payment_method_id: originalPayment.payment_method_id,
          refund_payment_method_id: payload.refund.payment_method_id,
        },
        entity_id: payload.refund.refund_id,
        entity_type: "refund",
        reason: payload.refund.override_reason as string,
      });
    }
    await appendAuditEvent(executor, context, input.command, {
      action: "CUSTOMER_RETURN_COMPLETED",
      after_data: result,
      entity_id: payload.return_id,
      entity_type: "customer_return",
      ...(
        payload.notes === null && resolvedItems[0]?.reason_code === undefined
          ? {}
          : { reason: payload.notes ?? (resolvedItems[0]?.reason_code as string) }
      ),
    });
    await appendChange(executor, context, input.command, {
      change_type: "EVENT",
      entity_id: payload.return_id,
      entity_type: "customer_return",
      entity_version: "1",
      payload: result,
    });
    return result;
  });
}

type RefundRecordStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "REVERSED"
  | "REQUIRES_ACTION";

interface LockedRefundRow {
  readonly amount: string;
  readonly customer_return_id: string;
  readonly external_reference: string | null;
  readonly is_cash: boolean;
  readonly location_id: string;
  readonly original_payment_id: string | null;
  readonly return_total: string;
  readonly status: RefundRecordStatus;
  readonly version: string;
}

interface RefundRetryPayload {
  readonly expected_version: number;
  readonly reason: string;
  readonly refund_id: string;
}

interface RefundResolvePayload extends RefundRetryPayload {
  readonly external_reference: string | null;
  readonly resolution_status: "COMPLETED" | "FAILED" | "REQUIRES_ACTION";
  readonly shift_id: string | null;
  readonly terminal_id: string | null;
}

interface RefundReversePayload extends RefundRetryPayload {
  readonly shift_id: string | null;
  readonly terminal_id: string | null;
}

interface CashLifecycleContext {
  readonly shift_id: string;
  readonly terminal_id: string;
}

function refundReason(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, "REFUND_REASON_REQUIRED", "Alasan tindak lanjut Refund wajib diisi.");
  }
  return value.trim();
}

function optionalUuid(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : uuidValue(value, field);
}

function readRefundRetry(value: unknown): RefundRetryPayload {
  const row = objectValue(value, "payload");
  return {
    expected_version: integerValue(row.expected_version, "payload.expected_version", 1),
    reason: refundReason(row.reason),
    refund_id: uuidValue(row.refund_id, "payload.refund_id"),
  };
}

function readRefundResolve(value: unknown): RefundResolvePayload {
  const row = objectValue(value, "payload");
  return {
    expected_version: integerValue(row.expected_version, "payload.expected_version", 1),
    external_reference: optionalReason(
      row.external_reference,
      "payload.external_reference",
    ),
    reason: refundReason(row.reason),
    refund_id: uuidValue(row.refund_id, "payload.refund_id"),
    resolution_status: enumValue(
      row.resolution_status,
      "payload.resolution_status",
      ["COMPLETED", "FAILED", "REQUIRES_ACTION"] as const,
    ),
    shift_id: optionalUuid(row.shift_id, "payload.shift_id"),
    terminal_id: optionalUuid(row.terminal_id, "payload.terminal_id"),
  };
}

function readRefundReverse(value: unknown): RefundReversePayload {
  const row = objectValue(value, "payload");
  return {
    expected_version: integerValue(row.expected_version, "payload.expected_version", 1),
    reason: refundReason(row.reason),
    refund_id: uuidValue(row.refund_id, "payload.refund_id"),
    shift_id: optionalUuid(row.shift_id, "payload.shift_id"),
    terminal_id: optionalUuid(row.terminal_id, "payload.terminal_id"),
  };
}

async function lockRefund(
  executor: SqlExecutor,
  businessId: string,
  refundId: string,
): Promise<LockedRefundRow> {
  const rows = await executor.query<LockedRefundRow>(
    `SELECT r.customer_return_id, r.location_id, r.amount::text, r.status,
            r.version::text, r.external_reference, r.original_payment_id,
            cr.return_total::text, pm.is_cash
     FROM returns.refunds r
     JOIN returns.customer_returns cr
       ON cr.id = r.customer_return_id AND cr.business_id = r.business_id
     JOIN sales.payment_methods pm
       ON pm.id = r.payment_method_id AND pm.business_id = r.business_id
     WHERE r.id = $1 AND r.business_id = $2 AND cr.status = 'COMPLETED'
     FOR UPDATE OF r, cr`,
    [refundId, businessId],
  );
  const refund = rows.rows[0];
  if (refund === undefined) {
    throw new ApiError(404, "REFUND_NOT_FOUND", "Refund tidak ditemukan.");
  }
  return refund;
}

function assertRefundVersion(refund: LockedRefundRow, expectedVersion: number): string {
  if (refund.version !== expectedVersion.toString()) {
    throw new ApiError(409, "REFUND_VERSION_CONFLICT", "Versi Refund sudah berubah.");
  }
  return (BigInt(refund.version) + 1n).toString();
}

async function assertRefundCapacity(
  executor: SqlExecutor,
  businessId: string,
  refundId: string,
  refund: LockedRefundRow,
): Promise<void> {
  if (refund.original_payment_id === null) {
    throw new ApiError(
      409,
      "REFUND_ORIGINAL_PAYMENT_INVALID",
      "Pembayaran asli tidak valid untuk Refund.",
    );
  }

  // Every path which makes a Refund financially active locks the immutable
  // original Payment. This serializes it with CompleteReturn and with lifecycle
  // recovery for another Return made against the same Payment.
  const payments = await executor.query<PaymentRow>(
    `SELECT amount::text, payment_method_id, status
     FROM sales.payments
     WHERE id = $1 AND business_id = $2
     FOR UPDATE`,
    [refund.original_payment_id, businessId],
  );
  const payment = payments.rows[0];
  if (payment === undefined || payment.status !== "COMPLETED") {
    throw new ApiError(
      409,
      "REFUND_ORIGINAL_PAYMENT_INVALID",
      "Pembayaran asli tidak valid untuk Refund.",
    );
  }

  const totals = await executor.query<{
    readonly payment_amount: string;
    readonly return_amount: string;
  }>(
    `SELECT
       COALESCE(sum(amount) FILTER (WHERE original_payment_id = $3), 0)::text
         AS payment_amount,
       COALESCE(sum(amount) FILTER (WHERE customer_return_id = $4), 0)::text
         AS return_amount
     FROM returns.refunds
     WHERE business_id = $1
       AND id <> $2
       AND status IN ('PENDING', 'COMPLETED', 'REQUIRES_ACTION')
       AND (original_payment_id = $3 OR customer_return_id = $4)`,
    [businessId, refundId, refund.original_payment_id, refund.customer_return_id],
  );
  const activePaymentAmount = decimalAdd(
    parseDecimal(totals.rows[0]?.payment_amount ?? "0"),
    parseDecimal(refund.amount),
  );
  if (decimalCompare(activePaymentAmount, parseDecimal(payment.amount)) > 0) {
    throw new ApiError(
      409,
      "REFUND_PAYMENT_LIMIT_EXCEEDED",
      "Refund melebihi pembayaran asli.",
    );
  }

  const activeReturnAmount = decimalAdd(
    parseDecimal(totals.rows[0]?.return_amount ?? "0"),
    parseDecimal(refund.amount),
  );
  if (decimalCompare(activeReturnAmount, parseDecimal(refund.return_total)) > 0) {
    throw new ApiError(
      409,
      "REFUND_RETURN_LIMIT_EXCEEDED",
      "Refund melebihi nilai historis Return.",
    );
  }
}

async function requireCashLifecycleContext(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  locationId: string,
  input: ReturnCommandInput,
  shiftId: string | null,
  terminalId: string | null,
): Promise<CashLifecycleContext> {
  if (shiftId === null || terminalId === null) {
    throw new ApiError(
      409,
      "REFUND_CASH_SHIFT_REQUIRED",
      "Tindak lanjut Refund tunai memerlukan Shift OPEN dan Terminal saat ini.",
    );
  }
  const shifts = await executor.query<ShiftRow>(
    `SELECT s.cashier_user_id, s.location_id, s.terminal_id, s.status
     FROM cash.shifts s
     JOIN core.terminals t
       ON t.id = s.terminal_id AND t.business_id = s.business_id
      AND t.location_id = s.location_id
     WHERE s.id = $1 AND s.business_id = $2 AND t.status = 'ACTIVE'
     FOR UPDATE OF s`,
    [shiftId, context.authorization.membership.business_id],
  );
  const shift = shifts.rows[0];
  if (
    shift === undefined ||
    shift.status !== "OPEN" ||
    shift.location_id !== locationId ||
    shift.terminal_id !== terminalId ||
    shift.cashier_user_id !== context.authorization.user.id ||
    (context.selected_terminal_id !== null && context.selected_terminal_id !== terminalId) ||
    (context.device_id !== null && context.device_id !== input.device_id)
  ) {
    throw new ApiError(
      409,
      "REFUND_CASH_SHIFT_CONTEXT_INVALID",
      "Shift Refund tunai harus OPEN dan dimiliki actor pada Location, Terminal, serta Device saat ini.",
    );
  }
  return { shift_id: shiftId, terminal_id: terminalId };
}

async function assertExternalReferenceAvailable(
  executor: SqlExecutor,
  businessId: string,
  refundId: string,
  externalReference: string | null,
): Promise<void> {
  if (externalReference === null) return;
  // The unique index is the final invariant. The transaction-scoped advisory
  // lock also makes concurrent command failures deterministic instead of
  // leaking a provider-reference unique violation.
  await executor.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`refund-reference:${businessId}:${externalReference}`],
  );
  const duplicate = await executor.query(
    `SELECT 1 FROM returns.refunds
     WHERE business_id = $1 AND external_reference = $2 AND id <> $3
     LIMIT 1`,
    [businessId, externalReference, refundId],
  );
  if (duplicate.rows[0] !== undefined) {
    throw new ApiError(
      409,
      "REFUND_EXTERNAL_REFERENCE_CONFLICT",
      "Referensi eksternal Refund sudah dipakai.",
    );
  }
}

async function writeRefundCashMovement(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  input: ReturnCommandInput,
  refund: LockedRefundRow,
  refundId: string,
  lifecycleEventId: string,
  reason: string,
  cashContext: CashLifecycleContext,
  mode: "COMPLETE" | "REVERSE",
): Promise<string> {
  const businessId = context.authorization.membership.business_id;
  const refundCash = await executor.query<{ readonly id: string }>(
    `SELECT id FROM cash.cash_movements
     WHERE business_id = $1 AND source_type = 'CUSTOMER_REFUND' AND source_id = $2
     LIMIT 1`,
    [businessId, refundId],
  );
  if (mode === "COMPLETE" && refundCash.rows[0] !== undefined) {
    throw new ApiError(
      409,
      "REFUND_CASH_EFFECT_CONFLICT",
      "Refund belum settled tetapi cash effect sudah tercatat.",
    );
  }
  if (mode === "REVERSE" && refundCash.rows[0] === undefined) {
    throw new ApiError(
      409,
      "REFUND_CASH_EFFECT_MISSING",
      "Cash Refund asli tidak ditemukan untuk reversal.",
    );
  }

  const movementId = crypto.randomUUID();
  await executor.query(
    `INSERT INTO cash.cash_movements (
       id, business_id, location_id, terminal_id, shift_id, movement_type,
       amount, direction, source_type, source_id, reason_code, notes,
       occurred_at, actor_user_id, device_id, correlation_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16)`,
    [
      movementId,
      businessId,
      refund.location_id,
      cashContext.terminal_id,
      cashContext.shift_id,
      mode === "COMPLETE" ? "CASH_REFUND" : "CASH_REVERSAL",
      refund.amount,
      mode === "COMPLETE" ? "OUT" : "IN",
      mode === "COMPLETE" ? "CUSTOMER_REFUND" : "REFUND_REVERSAL",
      mode === "COMPLETE" ? refundId : lifecycleEventId,
      mode === "COMPLETE" ? "REFUND_RESOLVED" : "REFUND_REVERSED",
      reason,
      input.command.occurred_at,
      context.authorization.user.id,
      input.device_id,
      input.command.correlation_id,
    ],
  );
  return movementId;
}

async function insertRefundLifecycleEvent(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  input: ReturnCommandInput,
  refund: LockedRefundRow,
  refundId: string,
  eventId: string,
  eventType:
    | "RETRY_REQUESTED"
    | "RESOLVED_COMPLETED"
    | "RESOLVED_FAILED"
    | "RESOLVED_REQUIRES_ACTION"
    | "REVERSED",
  newStatus: RefundRecordStatus,
  reason: string,
  externalReference: string | null,
  cashMovementId: string | null,
): Promise<void> {
  await executor.query(
    `INSERT INTO returns.refund_lifecycle_events (
       id, business_id, location_id, customer_return_id, refund_id, command_id,
       event_type, prior_status, new_status, reason, external_reference,
       cash_movement_id, occurred_at, actor_user_id, device_id, correlation_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16)`,
    [
      eventId,
      context.authorization.membership.business_id,
      refund.location_id,
      refund.customer_return_id,
      refundId,
      input.command.command_id,
      eventType,
      refund.status,
      newStatus,
      reason,
      externalReference,
      cashMovementId,
      input.command.occurred_at,
      context.authorization.user.id,
      input.device_id,
      input.command.correlation_id,
    ],
  );
}

async function refundLifecycleResult(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  input: ReturnCommandInput,
  refund: LockedRefundRow,
  refundId: string,
  newStatus: RefundRecordStatus,
  version: string,
  eventId: string,
  cashMovementId: string | null,
  reason: string,
): Promise<Readonly<Record<string, unknown>>> {
  const summaries = await executor.query<RefundSummaryRow>(
    `SELECT refund_status, refunded_total::text
     FROM returns.customer_returns
     WHERE id = $1 AND business_id = $2`,
    [refund.customer_return_id, context.authorization.membership.business_id],
  );
  const summary = summaries.rows[0];
  if (summary === undefined) throw new Error("Return refund summary disappeared.");
  const warnings =
    newStatus === "PENDING"
      ? ["REFUND_RETRY_PENDING"]
      : newStatus === "FAILED"
        ? ["REFUND_FAILED_OUTSTANDING"]
        : newStatus === "REQUIRES_ACTION"
          ? ["REFUND_REQUIRES_ACTION"]
          : [];
  const result = {
    cash_movement_id: cashMovementId,
    customer_return_id: refund.customer_return_id,
    lifecycle_event_id: eventId,
    refund_id: refundId,
    refund_record_status: newStatus,
    refunded_total: summary.refunded_total,
    return_refund_status: summary.refund_status,
    version,
    warnings,
  } as const;
  await appendAuditEvent(executor, context, input.command, {
    action:
      newStatus === "PENDING"
        ? "REFUND_RETRY_REQUESTED"
        : newStatus === "REVERSED"
          ? "REFUND_REVERSED"
          : `REFUND_RESOLVED_${newStatus}`,
    after_data: result,
    before_data: { status: refund.status, version: refund.version },
    entity_id: refundId,
    entity_type: "refund",
    reason,
  });
  await appendChange(executor, context, input.command, {
    change_type: "EVENT",
    entity_id: refund.customer_return_id,
    entity_type: "customer_return",
    payload: result,
  });
  return result;
}

export async function retryRefundCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: ReturnCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "refund.process");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readRefundRetry(input.payload);
  const businessId = context.authorization.membership.business_id;
  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const refund = await lockRefund(executor, businessId, payload.refund_id);
    if (refund.location_id !== locationId) {
      throw new ApiError(404, "REFUND_NOT_FOUND", "Refund tidak ditemukan.");
    }
    const version = assertRefundVersion(refund, payload.expected_version);
    if (refund.status !== "FAILED" && refund.status !== "REQUIRES_ACTION") {
      throw new ApiError(409, "REFUND_STATE_INVALID", "Hanya Refund gagal atau perlu tindakan yang dapat dicoba ulang.");
    }
    await assertRefundCapacity(executor, businessId, payload.refund_id, refund);
    await executor.query(
      `UPDATE returns.refunds
       SET status = 'PENDING', processed_at = $3, processed_by = $4,
           completed_at = NULL, failed_at = NULL, version = $5
       WHERE id = $1 AND business_id = $2`,
      [payload.refund_id, businessId, input.command.occurred_at, context.authorization.user.id, version],
    );
    const eventId = crypto.randomUUID();
    await insertRefundLifecycleEvent(
      executor,
      context,
      { ...input, payload },
      refund,
      payload.refund_id,
      eventId,
      "RETRY_REQUESTED",
      "PENDING",
      payload.reason,
      refund.external_reference,
      null,
    );
    return refundLifecycleResult(
      executor,
      context,
      input,
      refund,
      payload.refund_id,
      "PENDING",
      version,
      eventId,
      null,
      payload.reason,
    );
  });
}

export async function resolveRefundCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: ReturnCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "refund.process");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readRefundResolve(input.payload);
  const businessId = context.authorization.membership.business_id;
  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const refund = await lockRefund(executor, businessId, payload.refund_id);
    if (refund.location_id !== locationId) {
      throw new ApiError(404, "REFUND_NOT_FOUND", "Refund tidak ditemukan.");
    }
    const version = assertRefundVersion(refund, payload.expected_version);
    if (!["PENDING", "FAILED", "REQUIRES_ACTION"].includes(refund.status)) {
      throw new ApiError(409, "REFUND_STATE_INVALID", "Refund tidak berada pada state yang dapat diselesaikan.");
    }
    if (refund.status === payload.resolution_status) {
      throw new ApiError(
        409,
        "REFUND_STATE_INVALID",
        "Hasil penyelesaian Refund harus mengubah lifecycle state.",
      );
    }
    await assertExternalReferenceAvailable(
      executor,
      businessId,
      payload.refund_id,
      payload.external_reference,
    );
    if (
      payload.resolution_status === "COMPLETED" ||
      payload.resolution_status === "REQUIRES_ACTION"
    ) {
      await assertRefundCapacity(executor, businessId, payload.refund_id, refund);
    }
    const eventId = crypto.randomUUID();
    let cashMovementId: string | null = null;
    if (refund.is_cash && payload.resolution_status === "COMPLETED") {
      const cashContext = await requireCashLifecycleContext(
        executor,
        context,
        locationId,
        input,
        payload.shift_id,
        payload.terminal_id,
      );
      cashMovementId = await writeRefundCashMovement(
        executor,
        context,
        { ...input, payload },
        refund,
        payload.refund_id,
        eventId,
        payload.reason,
        cashContext,
        "COMPLETE",
      );
    } else if (payload.shift_id !== null || payload.terminal_id !== null) {
      throw new ApiError(
        409,
        "REFUND_CASH_CONTEXT_NOT_APPLICABLE",
        "Shift dan Terminal hanya boleh dikirim untuk penyelesaian Refund tunai.",
      );
    }
    await executor.query(
      `UPDATE returns.refunds
       SET status = $3, processed_at = $4, processed_by = $5,
           external_reference = COALESCE($6, external_reference),
           processor_reference = COALESCE($6, processor_reference),
           completed_at = CASE WHEN $3 = 'COMPLETED' THEN $4::timestamptz ELSE NULL END,
           failed_at = CASE WHEN $3 = 'FAILED' THEN $4::timestamptz ELSE NULL END,
           version = $7
       WHERE id = $1 AND business_id = $2`,
      [
        payload.refund_id,
        businessId,
        payload.resolution_status,
        input.command.occurred_at,
        context.authorization.user.id,
        payload.external_reference,
        version,
      ],
    );
    const effectiveExternalReference = payload.external_reference ?? refund.external_reference;
    await insertRefundLifecycleEvent(
      executor,
      context,
      { ...input, payload },
      refund,
      payload.refund_id,
      eventId,
      `RESOLVED_${payload.resolution_status}`,
      payload.resolution_status,
      payload.reason,
      effectiveExternalReference,
      cashMovementId,
    );
    return refundLifecycleResult(
      executor,
      context,
      input,
      refund,
      payload.refund_id,
      payload.resolution_status,
      version,
      eventId,
      cashMovementId,
      payload.reason,
    );
  });
}

export async function reverseRefundCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: ReturnCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "refund.reverse");
  assertFreshAuthorization(context, input.command_authorization_version);
  const locationId = requireCommandLocation(context, input.command);
  const payload = readRefundReverse(input.payload);
  const businessId = context.authorization.membership.business_id;
  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const refund = await lockRefund(executor, businessId, payload.refund_id);
    if (refund.location_id !== locationId) {
      throw new ApiError(404, "REFUND_NOT_FOUND", "Refund tidak ditemukan.");
    }
    const version = assertRefundVersion(refund, payload.expected_version);
    if (refund.status !== "COMPLETED") {
      throw new ApiError(409, "REFUND_STATE_INVALID", "Hanya Refund COMPLETED yang dapat dibalik.");
    }
    const eventId = crypto.randomUUID();
    let cashMovementId: string | null = null;
    if (refund.is_cash) {
      const cashContext = await requireCashLifecycleContext(
        executor,
        context,
        locationId,
        input,
        payload.shift_id,
        payload.terminal_id,
      );
      cashMovementId = await writeRefundCashMovement(
        executor,
        context,
        { ...input, payload },
        refund,
        payload.refund_id,
        eventId,
        payload.reason,
        cashContext,
        "REVERSE",
      );
    } else if (payload.shift_id !== null || payload.terminal_id !== null) {
      throw new ApiError(
        409,
        "REFUND_CASH_CONTEXT_NOT_APPLICABLE",
        "Shift dan Terminal hanya boleh dikirim untuk reversal Refund tunai.",
      );
    }
    await executor.query(
      `UPDATE returns.refunds
       SET status = 'REVERSED', processed_at = $3, processed_by = $4, version = $5
       WHERE id = $1 AND business_id = $2`,
      [payload.refund_id, businessId, input.command.occurred_at, context.authorization.user.id, version],
    );
    await insertRefundLifecycleEvent(
      executor,
      context,
      { ...input, payload },
      refund,
      payload.refund_id,
      eventId,
      "REVERSED",
      "REVERSED",
      payload.reason,
      refund.external_reference,
      cashMovementId,
    );
    return refundLifecycleResult(
      executor,
      context,
      input,
      refund,
      payload.refund_id,
      "REVERSED",
      version,
      eventId,
      cashMovementId,
      payload.reason,
    );
  });
}
