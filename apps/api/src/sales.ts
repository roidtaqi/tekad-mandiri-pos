import {
  decimalCompare,
  fitsPrecisionScale,
  moneyAdd,
  moneyCompare,
  moneySubtract,
  multiplyMoneyByQuantity,
  multiplyQuantityByFactor,
  parseDecimal,
  parseMoney,
  parseQuantity,
  quantityAdd,
  quantityCompare,
  quantitySubtract,
  type DecimalValue,
  type MoneyValue,
  type QuantityValue,
} from "@kastur/numeric";
import {
  PricingResolutionError,
  resolveOfflineUnitPrice,
  type PublishedPriceTier,
  type PublishedPromotion,
} from "@kastur/domain";

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

interface SaleTransaction {
  readonly authorization_version: number;
  readonly business_id: string;
  readonly change_amount: MoneyValue;
  readonly completed_at: string;
  readonly correlation_id: string;
  readonly created_by: string;
  readonly customer_id: string | null;
  readonly device_id: string;
  readonly grand_total: MoneyValue;
  readonly line_discount_total: MoneyValue;
  readonly location_id: string;
  readonly occurred_at: string;
  readonly promotion_discount_total: MoneyValue;
  readonly shift_id: string;
  readonly subtotal: MoneyValue;
  readonly tax_total: MoneyValue;
  readonly terminal_id: string;
  readonly total_paid: MoneyValue;
  readonly transaction_discount_total: MoneyValue;
  readonly transaction_id: string;
  readonly transaction_number: string;
}

interface SaleItem {
  readonly base_quantity: QuantityValue;
  readonly base_unit_price_snapshot: MoneyValue;
  readonly conversion_snapshot: DecimalValue;
  readonly final_unit_price_snapshot: MoneyValue;
  readonly line_index: number;
  readonly line_total: MoneyValue;
  readonly manual_line_discount_snapshot: MoneyValue;
  readonly price_effective_from_snapshot: string | null;
  readonly price_version_id_snapshot: string | null;
  readonly pricing_resolved_at_snapshot: string;
  readonly pricing_time_status_snapshot: "CLOCK_UNTRUSTED" | "TRUSTED";
  readonly product_id: string;
  readonly product_name_snapshot: string;
  readonly product_unit_id: string;
  readonly promotion_discount_snapshot: MoneyValue;
  readonly promotion_id: string | null;
  readonly promotion_type_snapshot:
    | "FIXED_DISCOUNT"
    | "FIXED_PRICE"
    | "PERCENT_DISCOUNT"
    | null;
  readonly promotion_value_snapshot: MoneyValue | null;
  readonly quantity: QuantityValue;
  readonly sku_snapshot: string;
  readonly tax_amount_snapshot: MoneyValue;
  readonly tax_mode_snapshot: string;
  readonly tax_rate_snapshot: DecimalValue;
  readonly tier_code_snapshot: string | null;
  readonly tier_id_snapshot: string | null;
  readonly tier_min_qty_snapshot: QuantityValue | null;
  readonly tier_unit_price_snapshot: MoneyValue | null;
  readonly track_inventory_snapshot: boolean;
  readonly transaction_discount_allocation: MoneyValue;
  readonly transaction_item_id: string;
  readonly unit_code_snapshot: string;
  readonly unit_name_snapshot: string;
}

interface SalePayment {
  readonly amount: MoneyValue;
  readonly amount_tendered: MoneyValue | null;
  readonly change_amount: MoneyValue | null;
  readonly confirmation_type: "CASH_CONFIRMED";
  readonly external_reference: string | null;
  readonly method_code: "CASH";
  readonly payment_id: string;
  readonly received_at: string;
}

interface CompleteSalePayload {
  readonly items: readonly SaleItem[];
  readonly payments: readonly SalePayment[];
  readonly transaction: SaleTransaction;
}

interface ShiftRow {
  readonly cashier_user_id: string;
  readonly closed_at: Date | string | null;
  readonly location_id: string;
  readonly opened_at: Date | string;
  readonly status: string;
  readonly terminal_id: string;
}

interface ProductIdentityRow {
  readonly business_id: string;
  readonly conversion_factor: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly track_inventory: boolean;
}

interface PriceTierRow {
  readonly created_at: Date | string;
  readonly effective_from: Date | string;
  readonly effective_to: Date | string | null;
  readonly price_version_id: string;
  readonly product_unit_id: string;
  readonly status: "ACTIVE" | "CANCELLED" | "SCHEDULED" | "SUPERSEDED";
  readonly tier_code: string;
  readonly tier_id: string;
  readonly tier_min_qty: string;
  readonly tier_sort_order: number;
  readonly tier_unit_price: string;
}

interface PromotionRow {
  readonly created_at: Date | string;
  readonly effective_from: Date | string;
  readonly effective_to: Date | string;
  readonly min_qty: string;
  readonly priority: number;
  readonly product_unit_id: string;
  readonly promotion_id: string;
  readonly promotion_type: "FIXED_DISCOUNT" | "FIXED_PRICE" | "PERCENT_DISCOUNT";
  readonly value: string;
}

interface PaymentMethodRow {
  readonly id: string;
}

interface CostRow {
  readonly cost_status: "FINAL" | "PROVISIONAL";
  readonly last_valid_mwa_unit_cost: string | null;
  readonly mwa_unit_cost: string | null;
  readonly product_id: string;
}

interface StockBalanceRow {
  readonly base_quantity: string;
  readonly product_id: string;
}

interface ResolvedItemCost {
  readonly cost_status: "COST_PENDING" | "FINAL" | "PROVISIONAL";
  readonly unit_cost: string | null;
}

export interface CompleteSaleCommandInput {
  readonly command: CommandIdentity;
  readonly command_authorization_version: number;
  readonly device_id: string;
  readonly payload: unknown;
}

export interface CompleteSaleCommandResult {
  readonly cost_status: "COST_PENDING" | "FINAL" | "PROVISIONAL";
  readonly payment_status: "COMPLETED";
  readonly status: "COMPLETED";
  readonly transaction_id: string;
  readonly transaction_number: string;
  readonly warnings: readonly string[];
}

function money(value: unknown, field: string): MoneyValue {
  if (typeof value !== "string") throw validationError(field, "wajib berupa string desimal");
  try {
    const parsed = parseMoney(value);
    if (!fitsPrecisionScale(parsed, 20, 4) || moneyCompare(parsed, parseMoney("0")) < 0) {
      throw validationError(field, "di luar batas NUMERIC(20,4)");
    }
    return parsed;
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    throw validationError(field, "bukan nilai uang yang valid");
  }
}

function quantity(value: unknown, field: string): QuantityValue {
  if (typeof value !== "string") throw validationError(field, "wajib berupa string desimal");
  try {
    const parsed = parseQuantity(value);
    if (!fitsPrecisionScale(parsed, 20, 6) || quantityIsNonPositive(parsed)) {
      throw validationError(field, "harus positif dan sesuai NUMERIC(20,6)");
    }
    return parsed;
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    throw validationError(field, "bukan kuantitas yang valid");
  }
}

function quantityIsNonPositive(value: QuantityValue): boolean {
  return quantityCompare(value, parseQuantity("0")) <= 0;
}

function decimal(value: unknown, field: string, precision: number, scale: number): DecimalValue {
  if (typeof value !== "string") throw validationError(field, "wajib berupa string desimal");
  try {
    const parsed = parseDecimal(value);
    if (!fitsPrecisionScale(parsed, precision, scale)) {
      throw validationError(field, `di luar batas NUMERIC(${precision},${scale})`);
    }
    return parsed;
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    throw validationError(field, "bukan angka desimal yang valid");
  }
}

function nullableUuid(value: unknown, field: string): string | null {
  return value === null || value === undefined ? null : uuidValue(value, field);
}

function nullableQuantity(value: unknown, field: string): QuantityValue | null {
  return value === null || value === undefined ? null : quantity(value, field);
}

function readTransaction(value: unknown): SaleTransaction {
  const row = objectValue(value, "payload.transaction");
  return {
    authorization_version: integerValue(
      row.authorization_version,
      "payload.transaction.authorization_version",
      1,
    ),
    business_id: uuidValue(row.business_id, "payload.transaction.business_id"),
    change_amount: money(row.change_amount, "payload.transaction.change_amount"),
    completed_at: timestampValue(row.completed_at, "payload.transaction.completed_at"),
    correlation_id: uuidValue(row.correlation_id, "payload.transaction.correlation_id"),
    created_by: uuidValue(row.created_by, "payload.transaction.created_by"),
    customer_id: nullableUuid(row.customer_id, "payload.transaction.customer_id"),
    device_id: uuidValue(row.device_id, "payload.transaction.device_id"),
    grand_total: money(row.grand_total, "payload.transaction.grand_total"),
    line_discount_total: money(
      row.line_discount_total,
      "payload.transaction.line_discount_total",
    ),
    location_id: uuidValue(row.location_id, "payload.transaction.location_id"),
    occurred_at: timestampValue(row.occurred_at, "payload.transaction.occurred_at"),
    promotion_discount_total: money(
      row.promotion_discount_total,
      "payload.transaction.promotion_discount_total",
    ),
    shift_id: uuidValue(row.shift_id, "payload.transaction.shift_id"),
    subtotal: money(row.subtotal, "payload.transaction.subtotal"),
    tax_total: money(row.tax_total, "payload.transaction.tax_total"),
    terminal_id: uuidValue(row.terminal_id, "payload.transaction.terminal_id"),
    total_paid: money(row.total_paid, "payload.transaction.total_paid"),
    transaction_discount_total: money(
      row.transaction_discount_total,
      "payload.transaction.transaction_discount_total",
    ),
    transaction_id: uuidValue(row.transaction_id, "payload.transaction.transaction_id"),
    transaction_number: stringValue(
      row.transaction_number,
      "payload.transaction.transaction_number",
    ),
  };
}

function readItem(
  value: unknown,
  index: number,
  fallbackPricingResolvedAt: string,
): SaleItem {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  const parsedQuantity = quantity(row.quantity, `${field}.quantity`);
  const conversion = decimal(row.conversion_snapshot, `${field}.conversion_snapshot`, 20, 8);
  if (decimalCompare(conversion, parseDecimal("0")) <= 0) {
    throw validationError(`${field}.conversion_snapshot`, "harus lebih besar dari nol");
  }
  const baseQuantity = quantity(row.base_quantity, `${field}.base_quantity`);
  if (multiplyQuantityByFactor(parsedQuantity, conversion) !== baseQuantity) {
    throw new ApiError(
      400,
      "SALE_UNIT_CONVERSION_INVALID",
      "Kuantitas dasar tidak sesuai snapshot konversi.",
      { field: `${field}.base_quantity` },
    );
  }
  const finalUnitPrice = money(row.final_unit_price_snapshot, `${field}.final_unit_price_snapshot`);
  const lineTotal = money(row.line_total, `${field}.line_total`);
  if (multiplyMoneyByQuantity(finalUnitPrice, parsedQuantity) !== lineTotal) {
    throw new ApiError(400, "SALE_CART_INTEGRITY_INVALID", "Total baris tidak konsisten.", {
      field: `${field}.line_total`,
    });
  }

  const tierUnitPrice =
    row.tier_unit_price_snapshot === null || row.tier_unit_price_snapshot === undefined
      ? null
      : money(row.tier_unit_price_snapshot, `${field}.tier_unit_price_snapshot`);
  const priceEffective =
    row.price_effective_from_snapshot === null ||
    row.price_effective_from_snapshot === undefined
      ? null
      : timestampValue(
          row.price_effective_from_snapshot,
          `${field}.price_effective_from_snapshot`,
        );

  return {
    base_quantity: baseQuantity,
    base_unit_price_snapshot: money(
      row.base_unit_price_snapshot,
      `${field}.base_unit_price_snapshot`,
    ),
    conversion_snapshot: conversion,
    final_unit_price_snapshot: finalUnitPrice,
    line_index: integerValue(row.line_index, `${field}.line_index`),
    line_total: lineTotal,
    manual_line_discount_snapshot: money(
      row.manual_line_discount_snapshot,
      `${field}.manual_line_discount_snapshot`,
    ),
    price_effective_from_snapshot: priceEffective,
    price_version_id_snapshot: nullableUuid(
      row.price_version_id_snapshot,
      `${field}.price_version_id_snapshot`,
    ),
    // Payload v1 existed before these explicit snapshots were added. Existing
    // durable outbox entries must remain pushable, so an older item is treated
    // as having been resolved at the transaction occurrence time with a
    // trusted clock. New clients always send the precise line-level context.
    pricing_resolved_at_snapshot:
      row.pricing_resolved_at_snapshot === undefined
        ? fallbackPricingResolvedAt
        : timestampValue(
            row.pricing_resolved_at_snapshot,
            `${field}.pricing_resolved_at_snapshot`,
          ),
    pricing_time_status_snapshot:
      row.pricing_time_status_snapshot === undefined
        ? "TRUSTED"
        : enumValue(
            row.pricing_time_status_snapshot,
            `${field}.pricing_time_status_snapshot`,
            ["TRUSTED", "CLOCK_UNTRUSTED"] as const,
          ),
    product_id: uuidValue(row.product_id, `${field}.product_id`),
    product_name_snapshot: stringValue(
      row.product_name_snapshot,
      `${field}.product_name_snapshot`,
    ),
    product_unit_id: uuidValue(row.product_unit_id, `${field}.product_unit_id`),
    promotion_discount_snapshot: money(
      row.promotion_discount_snapshot,
      `${field}.promotion_discount_snapshot`,
    ),
    promotion_id: nullableUuid(row.promotion_id, `${field}.promotion_id`),
    promotion_type_snapshot:
      row.promotion_type_snapshot === null || row.promotion_type_snapshot === undefined
        ? null
        : enumValue(row.promotion_type_snapshot, `${field}.promotion_type_snapshot`, [
            "FIXED_PRICE",
            "PERCENT_DISCOUNT",
            "FIXED_DISCOUNT",
          ] as const),
    promotion_value_snapshot:
      row.promotion_value_snapshot === null || row.promotion_value_snapshot === undefined
        ? null
        : money(row.promotion_value_snapshot, `${field}.promotion_value_snapshot`),
    quantity: parsedQuantity,
    sku_snapshot: stringValue(row.sku_snapshot, `${field}.sku_snapshot`),
    tax_amount_snapshot: money(row.tax_amount_snapshot, `${field}.tax_amount_snapshot`),
    tax_mode_snapshot: enumValue(row.tax_mode_snapshot, `${field}.tax_mode_snapshot`, [
      "NO_PPN",
      "TAX_INCLUDED",
      "TAX_EXCLUDED",
    ] as const),
    tax_rate_snapshot: decimal(row.tax_rate_snapshot, `${field}.tax_rate_snapshot`, 12, 8),
    tier_code_snapshot: nullableStringValue(
      row.tier_code_snapshot,
      `${field}.tier_code_snapshot`,
    ),
    tier_id_snapshot: nullableUuid(row.tier_id_snapshot, `${field}.tier_id_snapshot`),
    tier_min_qty_snapshot: nullableQuantity(
      row.tier_min_qty_snapshot,
      `${field}.tier_min_qty_snapshot`,
    ),
    tier_unit_price_snapshot: tierUnitPrice,
    track_inventory_snapshot: booleanValue(
      row.track_inventory_snapshot,
      `${field}.track_inventory_snapshot`,
    ),
    transaction_discount_allocation: money(
      row.transaction_discount_allocation,
      `${field}.transaction_discount_allocation`,
    ),
    transaction_item_id: uuidValue(
      row.transaction_item_id,
      `${field}.transaction_item_id`,
    ),
    unit_code_snapshot: stringValue(row.unit_code_snapshot, `${field}.unit_code_snapshot`),
    unit_name_snapshot: stringValue(row.unit_name_snapshot, `${field}.unit_name_snapshot`),
  };
}

function readPayment(value: unknown, index: number): SalePayment {
  const field = `payload.payments[${index}]`;
  const row = objectValue(value, field);
  return {
    amount: money(row.amount, `${field}.amount`),
    amount_tendered:
      row.amount_tendered === null || row.amount_tendered === undefined
        ? null
        : money(row.amount_tendered, `${field}.amount_tendered`),
    change_amount:
      row.change_amount === null || row.change_amount === undefined
        ? null
        : money(row.change_amount, `${field}.change_amount`),
    confirmation_type: enumValue(
      row.confirmation_type,
      `${field}.confirmation_type`,
      ["CASH_CONFIRMED"] as const,
    ),
    external_reference: nullableStringValue(
      row.external_reference,
      `${field}.external_reference`,
    ),
    method_code: enumValue(row.method_code, `${field}.method_code`, ["CASH"] as const),
    payment_id: uuidValue(row.payment_id, `${field}.payment_id`),
    received_at: timestampValue(row.received_at, `${field}.received_at`),
  };
}

function readCompleteSalePayload(value: unknown): CompleteSalePayload {
  const payload = objectValue(value, "payload");
  const version = integerValue(payload.payload_version, "payload.payload_version", 1);
  if (version !== 1) {
    throw new ApiError(400, "UNSUPPORTED_PAYLOAD_VERSION", "Versi payload Sale tidak didukung.");
  }
  const transaction = readTransaction(payload.transaction);
  const items = arrayValue(payload.items, "payload.items").map((item, index) =>
    readItem(item, index, transaction.occurred_at),
  );
  const payments = arrayValue(payload.payments, "payload.payments").map(readPayment);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  if (payments.length === 0) throw validationError("payload.payments", "tidak boleh kosong");
  return { items, payments, transaction };
}

function assertAggregateMath(payload: CompleteSalePayload): void {
  let subtotal = parseMoney("0");
  let promotionDiscount = parseMoney("0");
  let lineDiscount = parseMoney("0");
  let transactionDiscount = parseMoney("0");
  let taxTotal = parseMoney("0");
  let grandTotal = parseMoney("0");
  for (const item of payload.items) {
    const tierUnitPrice = item.tier_unit_price_snapshot ?? item.base_unit_price_snapshot;
    const grossLine = multiplyMoneyByQuantity(tierUnitPrice, item.quantity);
    const promotionLine = multiplyMoneyByQuantity(
      item.promotion_discount_snapshot,
      item.quantity,
    );
    const manualLine = multiplyMoneyByQuantity(
      item.manual_line_discount_snapshot,
      item.quantity,
    );
    const expectedLineTotal = moneySubtract(
      moneySubtract(moneySubtract(grossLine, promotionLine), manualLine),
      item.transaction_discount_allocation,
    );
    if (moneyCompare(expectedLineTotal, parseMoney("0")) < 0 || expectedLineTotal !== item.line_total) {
      throw new ApiError(
        400,
        "SALE_CART_INTEGRITY_INVALID",
        "Layer harga pada baris Sale tidak konsisten.",
      );
    }
    if (item.tax_mode_snapshot === "NO_PPN" && item.tax_amount_snapshot !== parseMoney("0")) {
      throw new ApiError(
        400,
        "SALE_TAX_INTEGRITY_INVALID",
        "Baris NO_PPN tidak boleh memuat pajak.",
      );
    }
    subtotal = moneyAdd(subtotal, grossLine);
    promotionDiscount = moneyAdd(promotionDiscount, promotionLine);
    lineDiscount = moneyAdd(lineDiscount, manualLine);
    transactionDiscount = moneyAdd(
      transactionDiscount,
      item.transaction_discount_allocation,
    );
    taxTotal = moneyAdd(taxTotal, item.tax_amount_snapshot);
    grandTotal = moneyAdd(grandTotal, item.line_total);
    if (item.tax_mode_snapshot === "TAX_EXCLUDED") {
      grandTotal = moneyAdd(grandTotal, item.tax_amount_snapshot);
    }
  }
  if (subtotal !== payload.transaction.subtotal) {
    throw new ApiError(400, "SALE_CART_INTEGRITY_INVALID", "Subtotal transaksi tidak konsisten.");
  }
  if (
    promotionDiscount !== payload.transaction.promotion_discount_total ||
    lineDiscount !== payload.transaction.line_discount_total ||
    transactionDiscount !== payload.transaction.transaction_discount_total ||
    taxTotal !== payload.transaction.tax_total ||
    grandTotal !== payload.transaction.grand_total
  ) {
    throw new ApiError(400, "SALE_CART_INTEGRITY_INVALID", "Grand total transaksi tidak konsisten.");
  }
  let paymentTotal = parseMoney("0");
  let changeTotal = parseMoney("0");
  for (const payment of payload.payments) {
    paymentTotal = moneyAdd(paymentTotal, payment.amount);
    if (
      payment.amount_tendered === null ||
      payment.change_amount === null ||
      moneyCompare(payment.amount_tendered, payment.amount) < 0 ||
      moneySubtract(payment.amount_tendered, payment.amount) !== payment.change_amount
    ) {
      throw new ApiError(
        400,
        "CASH_SETTLEMENT_INVALID",
        "Uang diterima dan kembalian CASH tidak konsisten.",
      );
    }
    changeTotal = moneyAdd(changeTotal, payment.change_amount);
  }
  if (
    paymentTotal !== payload.transaction.total_paid ||
    paymentTotal !== payload.transaction.grand_total
  ) {
    throw new ApiError(400, "PAYMENT_SETTLEMENT_INVALID", "Jumlah pembayaran tidak melunasi transaksi.");
  }
  if (changeTotal !== payload.transaction.change_amount) {
    throw new ApiError(
      400,
      "CASH_SETTLEMENT_INVALID",
      "Total kembalian CASH tidak konsisten.",
    );
  }
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function sameTimestamp(left: string, right: Date | string): boolean {
  return new Date(left).getTime() === new Date(right).getTime();
}

function publishedTier(row: PriceTierRow): PublishedPriceTier {
  return {
    min_qty: row.tier_min_qty,
    sort_order: row.tier_sort_order,
    tier_code: row.tier_code,
    tier_id: row.tier_id,
    unit_price: row.tier_unit_price,
  };
}

function publishedPromotion(row: PromotionRow): PublishedPromotion {
  return {
    created_at: new Date(row.created_at).toISOString(),
    effective_from: new Date(row.effective_from).toISOString(),
    effective_to: new Date(row.effective_to).toISOString(),
    min_qty: row.min_qty,
    priority: row.priority,
    promotion_id: row.promotion_id,
    promotion_type: row.promotion_type,
    value: row.value,
  };
}

function resolveServerPrice(input: Parameters<typeof resolveOfflineUnitPrice>[0]) {
  try {
    return resolveOfflineUnitPrice(input);
  } catch (error: unknown) {
    if (error instanceof PricingResolutionError) {
      throw new ApiError(
        409,
        "SALE_PRICING_REFERENCE_INVALID",
        "Referensi harga Sale tidak valid.",
        { pricing_error: error.code },
      );
    }
    throw error;
  }
}

async function validateAuthoritativePricing(
  executor: SqlExecutor,
  payload: CompleteSalePayload,
  warnings: string[],
): Promise<void> {
  const transaction = payload.transaction;
  const priceVersionIds = payload.items.map((item) => {
    if (item.price_version_id_snapshot === null) {
      throw new ApiError(
        409,
        "SALE_PRICE_VERSION_REQUIRED",
        "Sale harus mereferensikan Published Price Version.",
      );
    }
    if (item.price_effective_from_snapshot === null) {
      throw new ApiError(
        409,
        "SALE_PRICE_EFFECTIVE_SNAPSHOT_REQUIRED",
        "Snapshot waktu efektif harga wajib diisi.",
      );
    }
    return item.price_version_id_snapshot;
  });
  const priceRows = await executor.query<PriceTierRow>(
    `SELECT pv.id AS price_version_id, pv.product_unit_id, pv.status,
            pv.effective_from, pv.effective_to, pv.created_at,
            pt.id AS tier_id, pt.tier_code, pt.min_qty::text AS tier_min_qty,
            pt.unit_price::text AS tier_unit_price, pt.sort_order AS tier_sort_order
     FROM pricing.price_versions pv
     JOIN pricing.price_tier_versions pt ON pt.price_version_id = pv.id
     WHERE pv.business_id = $1 AND pv.id = ANY($2::uuid[])
     ORDER BY pv.id, pt.sort_order, pt.min_qty`,
    [transaction.business_id, [...new Set(priceVersionIds)]],
  );
  const pricesByVersion = new Map<string, PriceTierRow[]>();
  for (const row of priceRows.rows) {
    const rows = pricesByVersion.get(row.price_version_id) ?? [];
    rows.push(row);
    pricesByVersion.set(row.price_version_id, rows);
  }

  const quantityByUnit = new Map<string, QuantityValue>();
  for (const item of payload.items) {
    quantityByUnit.set(
      item.product_unit_id,
      quantityAdd(
        quantityByUnit.get(item.product_unit_id) ?? parseQuantity("0"),
        item.quantity,
      ),
    );
  }
  const promotionRows = await executor.query<PromotionRow>(
    `SELECT id AS promotion_id, product_unit_id, promotion_type,
            value::text, min_qty::text, priority, effective_from,
            effective_to, created_at
     FROM pricing.promotions
     WHERE business_id = $1
       AND product_unit_id = ANY($2::uuid[])
       AND status IN ('ACTIVE', 'SCHEDULED', 'ENDED')
       AND effective_from <= CURRENT_TIMESTAMP
     ORDER BY product_unit_id, priority DESC, created_at, id`,
    [
      transaction.business_id,
      [...new Set(payload.items.map((item) => item.product_unit_id))],
    ],
  );
  const promotionsByUnit = new Map<string, PromotionRow[]>();
  for (const row of promotionRows.rows) {
    const rows = promotionsByUnit.get(row.product_unit_id) ?? [];
    rows.push(row);
    promotionsByUnit.set(row.product_unit_id, rows);
  }

  const occurredAt = new Date(transaction.occurred_at).getTime();
  const serverNow = Date.now();
  for (const item of payload.items) {
    const priceVersionId = item.price_version_id_snapshot;
    if (priceVersionId === null || item.price_effective_from_snapshot === null) {
      throw new Error("Required price snapshots were checked before database validation.");
    }
    const versionRows = pricesByVersion.get(priceVersionId);
    if (versionRows === undefined || versionRows.length === 0) {
      throw new ApiError(
        409,
        "SALE_PRICE_VERSION_INVALID",
        "Price Version tidak cocok dengan Product Unit Sale.",
      );
    }
    const version = versionRows[0]!;
    if (version.product_unit_id !== item.product_unit_id || version.status === "CANCELLED") {
      throw new ApiError(
        409,
        "SALE_PRICE_VERSION_INVALID",
        "Price Version tidak cocok dengan Product Unit Sale.",
      );
    }
    const effectiveFrom = new Date(version.effective_from).getTime();
    const createdAt = new Date(version.created_at).getTime();
    if (
      effectiveFrom > occurredAt ||
      effectiveFrom > serverNow ||
      createdAt > occurredAt ||
      !sameTimestamp(item.price_effective_from_snapshot, version.effective_from)
    ) {
      throw new ApiError(
        409,
        "SALE_PRICE_VERSION_NOT_EFFECTIVE",
        "Price Version belum sah saat Sale terjadi.",
      );
    }
    if (
      (version.effective_to !== null &&
        occurredAt >= new Date(version.effective_to).getTime()) ||
      (version.status === "SUPERSEDED" && version.effective_to === null)
    ) {
      addWarning(warnings, "STALE_PRICING_EXCEPTION");
    }

    const tiers = versionRows.map(publishedTier);
    const retail = versionRows.find(
      (tier) => tier.tier_code === "RETAIL" && tier.tier_min_qty === "1.000000",
    ) ?? versionRows.find((tier) => tier.tier_code === "RETAIL");
    if (retail === undefined || parseMoney(retail.tier_unit_price) !== item.base_unit_price_snapshot) {
      throw new ApiError(
        409,
        "SALE_BASE_PRICE_MISMATCH",
        "Base Price Sale berbeda dari Published Price Version.",
      );
    }

    const pricingResolvedAt = new Date(item.pricing_resolved_at_snapshot).getTime();
    if (!Number.isFinite(pricingResolvedAt) || pricingResolvedAt > occurredAt) {
      throw new ApiError(
        409,
        "SALE_PRICING_CONTEXT_INVALID",
        "Waktu resolusi harga Sale tidak konsisten.",
      );
    }
    const availablePromotions = promotionsByUnit.get(item.product_unit_id) ?? [];
    const eligiblePromotions = availablePromotions.filter((promotion) => {
      const effectiveFrom = new Date(promotion.effective_from).getTime();
      const effectiveTo = new Date(promotion.effective_to).getTime();
      const createdAt = new Date(promotion.created_at).getTime();
      return (
        createdAt <= pricingResolvedAt &&
        effectiveFrom <= pricingResolvedAt &&
        pricingResolvedAt < effectiveTo
      );
    });
    const resolutionInput = {
      base_unit_price: retail.tier_unit_price,
      price_effective_from: new Date(version.effective_from).toISOString(),
      price_tiers: tiers,
      price_version_id: version.price_version_id,
      pricing_resolved_at: item.pricing_resolved_at_snapshot,
      pricing_time_status: item.pricing_time_status_snapshot,
      product_unit_id: item.product_unit_id,
      promotions: eligiblePromotions.map(publishedPromotion),
      quantity: quantityByUnit.get(item.product_unit_id) ?? item.quantity,
    };
    const authoritative = resolveServerPrice(resolutionInput);
    const appliedTier = authoritative.applied_tier;
    if (
      appliedTier === null ||
      item.tier_code_snapshot !== appliedTier.tier_code ||
      item.tier_unit_price_snapshot !== appliedTier.unit_price ||
      (item.tier_id_snapshot !== null && item.tier_id_snapshot !== appliedTier.tier_id) ||
      (item.tier_min_qty_snapshot !== null &&
        item.tier_min_qty_snapshot !== appliedTier.min_qty)
    ) {
      throw new ApiError(
        409,
        "SALE_PRICE_TIER_MISMATCH",
        "Quantity Tier Sale berbeda dari tier authoritative.",
      );
    }

    if (item.promotion_id === null) {
      if (
        item.promotion_type_snapshot !== null ||
        item.promotion_value_snapshot !== null ||
        item.promotion_discount_snapshot !== parseMoney("0")
      ) {
        throw new ApiError(
          409,
          "SALE_PROMOTION_SNAPSHOT_INVALID",
          "Snapshot Promotion Sale tidak konsisten.",
        );
      }
      if (authoritative.applied_promotion !== null) {
        addWarning(warnings, "STALE_PRICING_EXCEPTION");
      }
      continue;
    }

    const selectedPromotion = eligiblePromotions.find(
      (promotion) => promotion.promotion_id === item.promotion_id,
    );
    if (selectedPromotion === undefined) {
      throw new ApiError(
        409,
        "SALE_PROMOTION_INVALID",
        "Promotion tidak berlaku untuk Product Unit dan waktu Sale.",
      );
    }
    const selected = resolveServerPrice({
      ...resolutionInput,
      promotions: [publishedPromotion(selectedPromotion)],
    }).applied_promotion;
    if (
      selected === null ||
      item.promotion_type_snapshot !== selected.promotion_type ||
      item.promotion_value_snapshot === null ||
      parseDecimal(item.promotion_value_snapshot) !== selected.value ||
      item.promotion_discount_snapshot !== selected.discount_per_unit
    ) {
      throw new ApiError(
        409,
        "SALE_PROMOTION_SNAPSHOT_INVALID",
        "Nilai Promotion Sale berbeda dari Promotion authoritative.",
      );
    }
    if (authoritative.applied_promotion?.promotion_id !== item.promotion_id) {
      addWarning(warnings, "STALE_PRICING_EXCEPTION");
    }
    const eligibleAtCompletion = availablePromotions.filter((promotion) => {
      const effectiveFrom = new Date(promotion.effective_from).getTime();
      const effectiveTo = new Date(promotion.effective_to).getTime();
      const createdAt = new Date(promotion.created_at).getTime();
      return createdAt <= occurredAt && effectiveFrom <= occurredAt && occurredAt < effectiveTo;
    });
    const completionResolution = resolveServerPrice({
      ...resolutionInput,
      pricing_resolved_at: transaction.occurred_at,
      pricing_time_status: "TRUSTED",
      promotions: eligibleAtCompletion.map(publishedPromotion),
    });
    if (completionResolution.applied_promotion?.promotion_id !== item.promotion_id) {
      addWarning(warnings, "STALE_PRICING_EXCEPTION");
    }
  }
}

async function assertOperationalContext(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  payload: CompleteSalePayload,
  deviceId: string,
): Promise<{
  readonly identity_by_unit: ReadonlyMap<string, ProductIdentityRow>;
  readonly late: boolean;
}> {
  const transaction = payload.transaction;
  if (
    transaction.business_id !== context.authorization.membership.business_id ||
    transaction.location_id !== context.authorization.default_location_id ||
    transaction.created_by !== context.authorization.user.id ||
    transaction.device_id !== deviceId
  ) {
    throw new ApiError(403, "SALE_CONTEXT_MISMATCH", "Konteks Sale tidak cocok dengan sesi.");
  }
  if (context.device_id !== null && context.device_id !== deviceId) {
    throw new ApiError(403, "DEVICE_CONTEXT_MISMATCH", "Perangkat command tidak cocok dengan sesi.");
  }

  const shifts = await executor.query<ShiftRow>(
    `SELECT terminal_id, location_id, cashier_user_id, status, opened_at, closed_at
     FROM cash.shifts
     WHERE id = $1 AND business_id = $2
     FOR UPDATE`,
    [transaction.shift_id, transaction.business_id],
  );
  const shift = shifts.rows[0];
  if (
    shift === undefined ||
    shift.terminal_id !== transaction.terminal_id ||
    shift.location_id !== transaction.location_id ||
    shift.cashier_user_id !== transaction.created_by
  ) {
    throw new ApiError(409, "SALE_SHIFT_CONTEXT_MISMATCH", "Shift Sale tidak valid.");
  }
  const occurred = new Date(transaction.occurred_at).getTime();
  const opened = new Date(shift.opened_at).getTime();
  const closed = shift.closed_at === null ? null : new Date(shift.closed_at).getTime();
  if (occurred < opened || (closed !== null && occurred > closed)) {
    throw new ApiError(409, "SALE_OUTSIDE_SHIFT_WINDOW", "Sale berada di luar waktu Shift.");
  }
  if (shift.status !== "OPEN" && shift.status !== "CLOSING" && closed === null) {
    throw new ApiError(409, "SHIFT_NOT_OPEN", "Shift tidak menerima Sale.");
  }

  const identities = await executor.query<ProductIdentityRow>(
    `SELECT p.business_id, p.id AS product_id, pu.id AS product_unit_id,
            pu.conversion_factor::text, p.track_inventory
     FROM catalog.products p
     JOIN catalog.product_units pu
       ON pu.business_id = p.business_id AND pu.product_id = p.id
     WHERE p.business_id = $1 AND pu.id = ANY($2::uuid[])`,
    [transaction.business_id, payload.items.map((item) => item.product_unit_id)],
  );
  const identityByUnit = new Map(identities.rows.map((row) => [row.product_unit_id, row]));
  for (const item of payload.items) {
    const identity = identityByUnit.get(item.product_unit_id);
    if (identity === undefined || identity.product_id !== item.product_id) {
      throw new ApiError(409, "PRODUCT_UNIT_CONTEXT_INVALID", "Identitas Product Unit tidak valid.");
    }
    if (parseDecimal(identity.conversion_factor) !== item.conversion_snapshot) {
      throw new ApiError(
        409,
        "SALE_UNIT_CONVERSION_INVALID",
        "Konversi Product Unit berbeda dari fakta server.",
      );
    }
    if (identity.track_inventory !== item.track_inventory_snapshot) {
      throw new ApiError(
        409,
        "SALE_TRACK_INVENTORY_MISMATCH",
        "Snapshot track-inventory berbeda dari fakta server.",
      );
    }
  }

  if (transaction.customer_id !== null) {
    const customer = await executor.query(
      `SELECT 1 FROM sales.customers
       WHERE id = $1 AND business_id = $2 AND status = 'ACTIVE'`,
      [transaction.customer_id, transaction.business_id],
    );
    if (customer.rows[0] === undefined) {
      throw new ApiError(
        409,
        "SALE_CUSTOMER_CONTEXT_INVALID",
        "Customer Sale tidak valid untuk Business aktif.",
      );
    }
  }

  return { identity_by_unit: identityByUnit, late: closed !== null };
}

async function resolveSaleCostSnapshots(
  executor: SqlExecutor,
  payload: CompleteSalePayload,
  identityByUnit: ReadonlyMap<string, ProductIdentityRow>,
): Promise<{
  readonly aggregate_status: "COST_PENDING" | "FINAL" | "PROVISIONAL";
  readonly by_item: ReadonlyMap<string, ResolvedItemCost>;
}> {
  const transaction = payload.transaction;
  const productIds = [
    ...new Set(payload.items.map((item) => item.product_id)),
  ].sort();
  const trackedProductIds = [
    ...new Set(
      payload.items.flatMap((item) =>
        identityByUnit.get(item.product_unit_id)?.track_inventory === true
          ? [item.product_id]
          : [],
      ),
    ),
  ].sort();

  // Deterministic per-product locks cover an as-yet missing balance row; the
  // following row locks serialize against domains that already own a balance.
  for (const productId of trackedProductIds) {
    await executor.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `stock:${transaction.business_id}:${transaction.location_id}:${productId}`,
    ]);
  }
  const balances = await executor.query<StockBalanceRow>(
    `SELECT product_id, base_quantity::text
     FROM inventory.stock_balances
     WHERE business_id = $1 AND location_id = $2
       AND product_id = ANY($3::uuid[])
     ORDER BY product_id
     FOR UPDATE`,
    [transaction.business_id, transaction.location_id, trackedProductIds],
  );
  const projectedBalance = new Map<string, QuantityValue>(
    balances.rows.map((row) => [row.product_id, parseQuantity(row.base_quantity)]),
  );
  for (const productId of trackedProductIds) {
    if (!projectedBalance.has(productId)) projectedBalance.set(productId, parseQuantity("0"));
  }

  const costs = await executor.query<CostRow>(
    `SELECT product_id, mwa_unit_cost::text, last_valid_mwa_unit_cost::text,
            cost_status
     FROM costing.product_cost_states
     WHERE business_id = $1 AND location_id = $2
       AND product_id = ANY($3::uuid[])
     ORDER BY product_id
     FOR UPDATE`,
    [transaction.business_id, transaction.location_id, productIds],
  );
  const costByProduct = new Map(costs.rows.map((row) => [row.product_id, row]));
  const byItem = new Map<string, ResolvedItemCost>();
  for (const item of payload.items) {
    const identity = identityByUnit.get(item.product_unit_id);
    if (identity === undefined) {
      throw new Error("Validated Product Unit identity disappeared from Sale context.");
    }
    const state = costByProduct.get(item.product_id);
    let useNegativeFallback = false;
    if (identity.track_inventory) {
      const before = projectedBalance.get(item.product_id) ?? parseQuantity("0");
      const after = quantitySubtract(before, item.base_quantity);
      projectedBalance.set(item.product_id, after);
      useNegativeFallback = quantityCompare(after, parseQuantity("0")) < 0;
    }

    const unitCost = useNegativeFallback
      ? (state?.last_valid_mwa_unit_cost ?? null)
      : (state?.mwa_unit_cost ?? state?.last_valid_mwa_unit_cost ?? null);
    const status: ResolvedItemCost["cost_status"] =
      unitCost === null
        ? "COST_PENDING"
        : useNegativeFallback || state?.cost_status === "PROVISIONAL"
          ? "PROVISIONAL"
          : "FINAL";
    byItem.set(item.transaction_item_id, { cost_status: status, unit_cost: unitCost });
  }

  const statuses = [...byItem.values()].map((item) => item.cost_status);
  const aggregateStatus: "COST_PENDING" | "FINAL" | "PROVISIONAL" =
    statuses.includes("COST_PENDING")
      ? "COST_PENDING"
      : statuses.includes("PROVISIONAL")
        ? "PROVISIONAL"
        : "FINAL";
  return { aggregate_status: aggregateStatus, by_item: byItem };
}

async function insertSaleAggregate(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  command: CommandIdentity,
  payload: CompleteSalePayload,
  warnings: string[],
  identityByUnit: ReadonlyMap<string, ProductIdentityRow>,
): Promise<CompleteSaleCommandResult> {
  const transaction = payload.transaction;
  const resolvedCosts = await resolveSaleCostSnapshots(executor, payload, identityByUnit);
  const costStatus = resolvedCosts.aggregate_status;
  if (costStatus === "COST_PENDING") addWarning(warnings, "COST_MISSING_EXCEPTION");

  await executor.query(
    `INSERT INTO sales.transactions (
       id, business_id, location_id, terminal_id, device_id, shift_id,
       transaction_number, status, customer_id, subtotal,
       promotion_discount_total, line_discount_total, transaction_discount_total,
       tax_total, grand_total, total_paid, change_amount, cost_status,
       created_by, authorization_version, occurred_at, completed_at,
       correlation_id, created_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, 'COMPLETED', $8, $9,
       $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, CURRENT_TIMESTAMP
     )`,
    [
      transaction.transaction_id,
      transaction.business_id,
      transaction.location_id,
      transaction.terminal_id,
      transaction.device_id,
      transaction.shift_id,
      transaction.transaction_number,
      transaction.customer_id,
      transaction.subtotal,
      transaction.promotion_discount_total,
      transaction.line_discount_total,
      transaction.transaction_discount_total,
      transaction.tax_total,
      transaction.grand_total,
      transaction.total_paid,
      transaction.change_amount,
      costStatus,
      transaction.created_by,
      transaction.authorization_version,
      transaction.occurred_at,
      transaction.completed_at,
      transaction.correlation_id,
    ],
  );

  for (const item of payload.items) {
    const identity = identityByUnit.get(item.product_unit_id);
    if (identity === undefined) {
      throw new Error("Validated Product Unit identity disappeared from Sale context.");
    }
    const resolvedCost = resolvedCosts.by_item.get(item.transaction_item_id);
    if (resolvedCost === undefined) {
      throw new Error("Resolved Sale cost snapshot is missing.");
    }
    const unitCost = resolvedCost.unit_cost;
    const itemCostStatus = resolvedCost.cost_status;
    await executor.query(
      `INSERT INTO sales.transaction_items (
         id, transaction_id, line_index, product_id, product_unit_id,
         product_name_snapshot, sku_snapshot, unit_code_snapshot, unit_name_snapshot,
         conversion_snapshot, quantity, base_quantity, price_version_id_snapshot,
         price_effective_from_snapshot, pricing_resolved_at_snapshot,
         pricing_time_status_snapshot, base_unit_price_snapshot, tier_code_snapshot,
         tier_id_snapshot, tier_min_qty_snapshot, tier_unit_price_snapshot,
         promotion_id, promotion_type_snapshot, promotion_value_snapshot,
         promotion_discount_snapshot,
         manual_line_discount_snapshot, transaction_discount_allocation,
         final_unit_price_snapshot, line_total, tax_mode_snapshot,
         tax_rate_snapshot, tax_amount_snapshot, cost_unit_snapshot, cost_status,
         track_inventory_snapshot, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
         $27, $28, $29, $30, $31, $32, $33, $34, $35, CURRENT_TIMESTAMP
       )`,
      [
        item.transaction_item_id,
        transaction.transaction_id,
        item.line_index,
        item.product_id,
        item.product_unit_id,
        item.product_name_snapshot,
        item.sku_snapshot,
        item.unit_code_snapshot,
        item.unit_name_snapshot,
        item.conversion_snapshot,
        item.quantity,
        item.base_quantity,
        item.price_version_id_snapshot,
        item.price_effective_from_snapshot,
        item.pricing_resolved_at_snapshot,
        item.pricing_time_status_snapshot,
        item.base_unit_price_snapshot,
        item.tier_code_snapshot,
        item.tier_id_snapshot,
        item.tier_min_qty_snapshot,
        item.tier_unit_price_snapshot,
        item.promotion_id,
        item.promotion_type_snapshot,
        item.promotion_value_snapshot,
        item.promotion_discount_snapshot,
        item.manual_line_discount_snapshot,
        item.transaction_discount_allocation,
        item.final_unit_price_snapshot,
        item.line_total,
        item.tax_mode_snapshot,
        item.tax_rate_snapshot,
        item.tax_amount_snapshot,
        unitCost,
        itemCostStatus,
        identity.track_inventory,
      ],
    );

    if (identity.track_inventory) {
      const movementId = crypto.randomUUID();
      await executor.query(
        `INSERT INTO inventory.stock_movements (
           id, business_id, location_id, product_id, movement_type,
           base_quantity_delta, source_unit_id, source_quantity,
           conversion_snapshot, source_type, source_id, source_line_id,
           occurred_at, actor_user_id, device_id, correlation_id
         ) VALUES (
           $1, $2, $3, $4, 'SALE', -($5::numeric), $6, $7, $8,
           'SALE_TRANSACTION', $9, $10, $11, $12, $13, $14
         )`,
        [
          movementId,
          transaction.business_id,
          transaction.location_id,
          item.product_id,
          item.base_quantity,
          item.product_unit_id,
          item.quantity,
          item.conversion_snapshot,
          transaction.transaction_id,
          item.transaction_item_id,
          transaction.occurred_at,
          transaction.created_by,
          transaction.device_id,
          transaction.correlation_id,
        ],
      );
      await executor.query(
        `INSERT INTO inventory.stock_balances (
           business_id, location_id, product_id, base_quantity,
           last_movement_id, updated_at
         ) VALUES ($1, $2, $3, -($4::numeric), $5, CURRENT_TIMESTAMP)
         ON CONFLICT (business_id, location_id, product_id) DO UPDATE
         SET base_quantity = inventory.stock_balances.base_quantity + EXCLUDED.base_quantity,
             last_movement_id = EXCLUDED.last_movement_id,
             updated_at = CURRENT_TIMESTAMP`,
        [
          transaction.business_id,
          transaction.location_id,
          item.product_id,
          item.base_quantity,
          movementId,
        ],
      );
      await appendStockBalanceProjection(executor, context, command, {
        business_id: transaction.business_id,
        last_movement_id: movementId,
        location_id: transaction.location_id,
        product_id: item.product_id,
      });
    }
  }

  const paymentMethods = await executor.query<PaymentMethodRow>(
    `SELECT id FROM sales.payment_methods
     WHERE business_id = $1 AND code = 'CASH' AND status = 'ACTIVE'
       AND offline_allowed = TRUE
     LIMIT 1`,
    [transaction.business_id],
  );
  const cashMethodId = paymentMethods.rows[0]?.id;
  if (cashMethodId === undefined) {
    throw new ApiError(
      409,
      "CASH_PAYMENT_METHOD_NOT_CONFIGURED",
      "Metode pembayaran CASH offline belum dikonfigurasi.",
    );
  }
  for (const payment of payload.payments) {
    await executor.query(
      `INSERT INTO sales.payments (
         id, business_id, transaction_id, payment_method_id,
         method_code_snapshot, amount, amount_tendered, change_amount,
         status, confirmation_type, external_reference, received_at,
         completed_at, recorded_by, device_id, correlation_id
       ) VALUES (
         $1, $2, $3, $4, 'CASH', $5, $6, $7, 'COMPLETED', $8, $9,
         $10, $10, $11, $12, $13
       )`,
      [
        payment.payment_id,
        transaction.business_id,
        transaction.transaction_id,
        cashMethodId,
        payment.amount,
        payment.amount_tendered,
        payment.change_amount,
        payment.confirmation_type,
        payment.external_reference,
        payment.received_at,
        transaction.created_by,
        transaction.device_id,
        transaction.correlation_id,
      ],
    );
  }

  await executor.query(
    `INSERT INTO cash.cash_movements (
       id, business_id, location_id, terminal_id, shift_id, movement_type,
       amount, direction, source_type, source_id, occurred_at,
       actor_user_id, device_id, correlation_id
     ) VALUES (
       $1, $2, $3, $4, $5, 'CASH_SALE', $6, 'IN',
       'SALE_TRANSACTION', $7, $8, $9, $10, $11
     )`,
    [
      crypto.randomUUID(),
      transaction.business_id,
      transaction.location_id,
      transaction.terminal_id,
      transaction.shift_id,
      transaction.total_paid,
      transaction.transaction_id,
      transaction.occurred_at,
      transaction.created_by,
      transaction.device_id,
      transaction.correlation_id,
    ],
  );

  if (warnings.includes("COST_MISSING_EXCEPTION")) {
    await executor.query(
      `INSERT INTO audit.business_exceptions (
         id, business_id, location_id, domain, exception_type, severity,
         status, source_entity_type, source_entity_id, summary, created_at
       ) VALUES (
         $1, $2, $3, 'COSTING', 'COST_MISSING', 'REVIEW_REQUIRED',
         'OPEN', 'sales_transaction', $4, $5, CURRENT_TIMESTAMP
       )`,
      [
        crypto.randomUUID(),
        transaction.business_id,
        transaction.location_id,
        transaction.transaction_id,
        `Cost belum tersedia untuk ${transaction.transaction_number}.`,
      ],
    );
  }
  if (warnings.includes("STALE_PRICING_EXCEPTION")) {
    await executor.query(
      `INSERT INTO audit.business_exceptions (
         id, business_id, location_id, domain, exception_type, severity,
         status, source_entity_type, source_entity_id, summary, created_at
       ) VALUES (
         $1, $2, $3, 'PRICING', 'STALE_PRICING', 'REVIEW_REQUIRED',
         'OPEN', 'sales_transaction', $4, $5, CURRENT_TIMESTAMP
       )`,
      [
        crypto.randomUUID(),
        transaction.business_id,
        transaction.location_id,
        transaction.transaction_id,
        `Harga cached memerlukan review untuk ${transaction.transaction_number}.`,
      ],
    );
  }

  await appendAuditEvent(executor, context, command, {
    action: "TRANSACTION_COMPLETED",
    after_data: {
      cost_status: costStatus,
      grand_total: transaction.grand_total,
      status: "COMPLETED",
      transaction_number: transaction.transaction_number,
    },
    entity_id: transaction.transaction_id,
    entity_type: "sales_transaction",
  });
  await appendChange(executor, context, command, {
    change_type: "EVENT",
    entity_id: transaction.transaction_id,
    entity_type: "sales_transaction",
    payload: {
      cost_status: costStatus,
      grand_total: transaction.grand_total,
      location_id: transaction.location_id,
      occurred_at: transaction.occurred_at,
      status: "COMPLETED",
      transaction_id: transaction.transaction_id,
      transaction_number: transaction.transaction_number,
    },
  });

  return {
    cost_status: costStatus,
    payment_status: "COMPLETED",
    status: "COMPLETED",
    transaction_id: transaction.transaction_id,
    transaction_number: transaction.transaction_number,
    warnings,
  };
}

export async function completeSaleCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: CompleteSaleCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: CompleteSaleCommandResult }> {
  requirePermission(context, "workspace.pos.access");
  requirePermission(context, "transaction.create");
  requirePermission(context, "transaction.complete");
  requirePermission(context, "payment.record");
  const payload = readCompleteSalePayload(input.payload);
  assertAggregateMath(payload);
  if (payload.transaction.authorization_version !== input.command_authorization_version) {
    throw new ApiError(
      400,
      "AUTHORIZATION_VERSION_MISMATCH",
      "Versi otorisasi Sale tidak cocok dengan command envelope.",
    );
  }
  if (payload.transaction.correlation_id !== input.command.correlation_id) {
    // command_id and transaction_id are intentionally distinct, but correlation must bind the envelope.
    throw new ApiError(400, "CORRELATION_MISMATCH", "Correlation Sale tidak konsisten.");
  }
  if (
    payload.transaction.occurred_at !== input.command.occurred_at ||
    payload.transaction.location_id !== input.command.location_id
  ) {
    throw new ApiError(400, "SALE_CONTEXT_MISMATCH", "Envelope Sale tidak cocok dengan payload.");
  }

  const warnings: string[] = [];
  if (input.command_authorization_version !== context.authorization.authorization_version) {
    warnings.push("AUTHORIZATION_STALE_EXCEPTION");
  }

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const operational = await assertOperationalContext(
      executor,
      context,
      payload,
      input.device_id,
    );
    if (operational.late) warnings.push("LATE_SHIFT_EVENT");
    await validateAuthoritativePricing(executor, payload, warnings);
    const result = await insertSaleAggregate(
      executor,
      context,
      input.command,
      payload,
      warnings,
      operational.identity_by_unit,
    );
    if (operational.late) {
      await executor.query(
        `INSERT INTO cash.shift_reconciliations (
           id, shift_id, reason_type, expected_cash_delta, notes,
           source_type, source_id, created_at, created_by
         ) VALUES ($1, $2, 'LATE_CASH_SALE', $3, $4, 'SALE_TRANSACTION', $5,
                   CURRENT_TIMESTAMP, $6)`,
        [
          crypto.randomUUID(),
          payload.transaction.shift_id,
          payload.transaction.total_paid,
          "Sale offline diterima setelah Shift ditutup; snapshot penutupan tidak diubah.",
          payload.transaction.transaction_id,
          context.authorization.user.id,
        ],
      );
    }
    return result;
  });
}
