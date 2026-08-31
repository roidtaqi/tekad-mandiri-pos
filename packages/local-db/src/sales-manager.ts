import type { Dexie } from "dexie";
import type { AuthContextResponse } from "@kastur/contracts";
import type { LocalAuditEventRecord } from "./audit-store.js";
import type { LocalCashMovementRecord } from "./cash-manager.js";
import { 
  parseMoney, 
  parseDecimal, 
  multiplyQuantityByFactor, 
  quantityNegate,
  fitsPrecisionScale,
  parseQuantity,
  moneyAdd,
  multiplyMoneyByQuantity,
  moneySubtract,
  quantityCompare,
  moneyCompare,
  decimalCompare,
  type MoneyValue,
  type QuantityValue,
  type DecimalValue
} from "@kastur/numeric";

export const SHIFT_REQUIRED = "SHIFT_REQUIRED";
export const SALE_SHIFT_CONTEXT_MISMATCH = "SALE_SHIFT_CONTEXT_MISMATCH";
export const SALE_TERMINAL_REQUIRED = "SALE_TERMINAL_REQUIRED";
export const EMPTY_CART = "EMPTY_CART";
export const SALE_CART_INTEGRITY_INVALID = "SALE_CART_INTEGRITY_INVALID";
export const SALE_NUMERIC_BOUNDARY_INVALID = "SALE_NUMERIC_BOUNDARY_INVALID";
export const SALE_UNIT_CONVERSION_INVALID = "SALE_UNIT_CONVERSION_INVALID";
export const PAYMENT_INSUFFICIENT = "PAYMENT_INSUFFICIENT";
export const IDEMPOTENCY_KEY_REUSE_ERROR = "IDEMPOTENCY_KEY_REUSE_ERROR";
export const SALE_PERMISSION_DENIED = "SALE_PERMISSION_DENIED";
export const SALE_AUTHORIZATION_EXPIRED = "SALE_AUTHORIZATION_EXPIRED";

export class CompleteSaleError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CompleteSaleError";
  }
}

export interface CartLine {
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly product_name: string;
  readonly unit_code: string;
  readonly variant_name: string;
  readonly sku: string;
  readonly barcode: string | null;

  readonly allow_decimal_qty: boolean;
  readonly price_version_id: string;
  readonly price_effective_from: string;

  readonly quantity: string;
  readonly unit_price: string;
  readonly line_total: string;
  readonly base_unit_price: string;
  readonly tier_id: string | null;
  readonly tier_code: string | null;
  readonly tier_min_qty: string | null;
  readonly tier_unit_price: string;
  readonly promotion_id: string | null;
  readonly promotion_type: "FIXED_PRICE" | "PERCENT_DISCOUNT" | "FIXED_DISCOUNT" | null;
  readonly promotion_value: string | null;
  /** Per-unit promotion benefit. */
  readonly promotion_discount: string;
  readonly pricing_resolved_at: string;
  readonly pricing_time_status: "TRUSTED" | "CLOCK_UNTRUSTED";
  
  readonly conversion_factor: string;
  readonly track_inventory: boolean;
}

export interface Cart {
  readonly business_id: string;
  readonly lines: readonly CartLine[];
}

export interface CompleteSaleInput {
  auth: AuthContextResponse;
  device_id: string;
  command_id: string;
  occurred_at: string;
  cart: Cart;
  amount_tendered: string;
}

export interface CompleteSaleResult {
  transaction_id: string;
}

export interface LocalCompletedTransaction {
  readonly transaction_id: string;
  readonly command_id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly terminal_id: string;
  readonly device_id: string;
  readonly shift_id: string;
  readonly transaction_number: string;
  readonly status: "COMPLETED";
  readonly sync_status: "PENDING" | "SYNCED" | "REQUIRES_REVIEW";
  readonly customer_id: string | null;
  readonly subtotal: string;
  readonly promotion_discount_total: string;
  readonly line_discount_total: string;
  readonly transaction_discount_total: string;
  readonly tax_total: string;
  readonly grand_total: string;
  readonly total_paid: string;
  readonly change_amount: string;
  readonly cost_status: "COST_PENDING";
  readonly created_by: string;
  readonly authorization_version: number;
  readonly occurred_at: string;
  readonly completed_at: string;
  readonly created_at: string;
  readonly correlation_id: string;
}

export interface LocalCompletedTransactionItem {
  readonly transaction_item_id: string;
  readonly transaction_id: string;
  readonly line_index: number;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly product_name_snapshot: string;
  readonly sku_snapshot: string;
  readonly unit_code_snapshot: string;
  readonly unit_name_snapshot: string;
  readonly conversion_snapshot: string;
  readonly quantity: string;
  readonly base_quantity: string;
  readonly price_version_id_snapshot: string;
  readonly price_effective_from_snapshot: string;
  readonly pricing_resolved_at_snapshot: string;
  readonly pricing_time_status_snapshot: "TRUSTED" | "CLOCK_UNTRUSTED";
  readonly base_unit_price_snapshot: string;
  readonly tier_id_snapshot: string | null;
  readonly tier_code_snapshot: string | null;
  readonly tier_min_qty_snapshot: string | null;
  readonly tier_unit_price_snapshot: string;
  readonly promotion_id: string | null;
  readonly promotion_type_snapshot: "FIXED_PRICE" | "PERCENT_DISCOUNT" | "FIXED_DISCOUNT" | null;
  readonly promotion_value_snapshot: string | null;
  readonly promotion_discount_snapshot: string;
  readonly manual_line_discount_snapshot: string;
  readonly transaction_discount_allocation: string;
  readonly final_unit_price_snapshot: string;
  readonly line_total: string;
  readonly tax_mode_snapshot: "NO_PPN";
  readonly tax_rate_snapshot: string;
  readonly tax_amount_snapshot: string;
  readonly cost_unit_snapshot: null;
  readonly cost_status: "COST_PENDING";
  readonly track_inventory_snapshot: boolean;
  readonly created_at: string;
}

export interface LocalCompletedPayment {
  readonly payment_id: string;
  readonly business_id: string;
  readonly transaction_id: string;
  readonly method_code: "CASH";
  readonly amount: string;
  readonly amount_tendered: string;
  readonly change_amount: string;
  readonly status: "COMPLETED";
  readonly confirmation_type: "CASH_CONFIRMED";
  readonly external_reference: string | null;
  readonly received_at: string;
  readonly completed_at: string;
  readonly recorded_by: string;
  readonly device_id: string;
  readonly correlation_id: string;
}

export interface LocalSaleStockMovement {
  readonly stock_movement_id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly product_id: string;
  readonly movement_type: "SALE";
  readonly base_quantity_delta: string;
  readonly source_unit_id: string;
  readonly source_quantity: string;
  readonly conversion_snapshot: string;
  readonly source_type: "SALE_TRANSACTION";
  readonly source_id: string;
  readonly source_line_id: string;
  readonly occurred_at: string;
  readonly actor_user_id: string;
  readonly device_id: string;
  readonly correlation_id: string;
}

export interface NormalizedSaleLine extends CartLine {
  readonly parsed_quantity: QuantityValue;
  readonly parsed_unit_price: MoneyValue;
  readonly parsed_line_total: MoneyValue;
  readonly parsed_conversion_factor: DecimalValue;
  readonly parsed_base_quantity: QuantityValue;
  readonly parsed_base_unit_price: MoneyValue;
  readonly parsed_tier_unit_price: MoneyValue;
  readonly parsed_tier_min_qty: QuantityValue | null;
  readonly parsed_promotion_value: DecimalValue | null;
  readonly parsed_promotion_discount: MoneyValue;
  readonly parsed_promotion_discount_total: MoneyValue;
  readonly parsed_tier_line_total: MoneyValue;
}

export interface CompletedSaleAggregate {
  readonly transaction: LocalCompletedTransaction;
  readonly items: readonly LocalCompletedTransactionItem[];
  readonly payments: readonly LocalCompletedPayment[];
  readonly stock_movements: readonly LocalSaleStockMovement[];
  readonly cash_movements: readonly LocalCashMovementRecord[];
  readonly audit_events: readonly LocalAuditEventRecord[];
}

export interface LocalCompleteSaleOutboxPayloadV1 {
  readonly payload_version: 1;
  readonly transaction: LocalCompletedTransaction;
  readonly items: readonly LocalCompletedTransactionItem[];
  readonly payments: readonly LocalCompletedPayment[];
  readonly stock_movements: readonly LocalSaleStockMovement[];
  readonly cash_movements: readonly LocalCashMovementRecord[];
  readonly audit_events: readonly LocalAuditEventRecord[];
}

export type SaleFaultPoint =
  | "after_transaction"
  | "after_items"
  | "after_payment"
  | "after_stock"
  | "after_cash"
  | "after_audit"
  | "before_outbox";

const testFaults = new WeakMap<PosSalesManager, SaleFaultPoint>();

export function _setSalesFaultForTest(manager: PosSalesManager, fault: SaleFaultPoint | undefined) {
  if (fault) {
    testFaults.set(manager, fault);
  } else {
    testFaults.delete(manager);
  }
}

export class PosSalesManager {
  constructor(private readonly db: Dexie) {}

  async getCompletedSale(transactionId: string): Promise<CompletedSaleAggregate> {
    return this.db.transaction("r", 
      [
        this.db.table("transactions"),
        this.db.table("transaction_items"),
        this.db.table("payments"),
        this.db.table("stock_movements"),
        this.db.table("cash_movements"),
        this.db.table("audit_events"),
      ],
      async () => {
        const transaction = await this.db.table("transactions").get(transactionId);
        if (!transaction || transaction.status !== "COMPLETED") {
          throw new Error("Transaction not found or not completed");
        }

        const items = await this.db.table("transaction_items")
          .where({ transaction_id: transactionId })
          .sortBy("line_index");

        const payments = await this.db.table("payments")
          .where({ transaction_id: transactionId })
          .toArray();

        const stock_movements = await this.db.table("stock_movements")
          .where({ source_id: transactionId })
          .toArray();

        const cash_movements = await this.db
          .table<LocalCashMovementRecord>("cash_movements")
          .where("source_id")
          .equals(transactionId)
          .filter((movement) => movement.source_type === "SALE_TRANSACTION")
          .toArray();

        const audit_events = await this.db
          .table<LocalAuditEventRecord>("audit_events")
          .where("[business_id+entity_type+entity_id]")
          .equals([
            transaction.business_id,
            "SALES_TRANSACTION",
            transactionId,
          ])
          .sortBy("occurred_at");

        return {
          transaction,
          items,
          payments,
          stock_movements,
          cash_movements,
          audit_events,
        };
      }
    );
  }

  async getCompletedSaleByCommandId(
    commandId: string,
  ): Promise<CompletedSaleAggregate> {
    const transaction = await this.db
      .table<LocalCompletedTransaction>("transactions")
      .where("command_id")
      .equals(commandId)
      .first();

    if (transaction === undefined) {
      throw new Error("Transaction not found or not completed");
    }

    return this.getCompletedSale(transaction.transaction_id);
  }

  async listCompletedTransactions(
    businessId: string,
    limit = 100,
  ): Promise<readonly LocalCompletedTransaction[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new TypeError("limit must be a positive safe integer.");
    }

    const transactions = await this.db
      .table<LocalCompletedTransaction>("transactions")
      .where("business_id")
      .equals(businessId)
      .filter((transaction) => transaction.status === "COMPLETED")
      .toArray();

    return transactions
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .slice(0, limit);
  }

  async completeSale(input: CompleteSaleInput): Promise<CompleteSaleResult> {
    const { auth, device_id, command_id, occurred_at, cart, amount_tendered } = input;

    // Check authorization
    const requiredPermissions = [
      "workspace.pos.access",
      "pos.use",
      "transaction.create",
      "transaction.complete",
      "payment.record"
    ];
    for (const perm of requiredPermissions) {
      if (!auth.permissions.includes(perm)) {
        throw new CompleteSaleError(`Missing permission: ${perm}`, SALE_PERMISSION_DENIED);
      }
    }

    if (!auth.offline_valid_until || !occurred_at) {
      throw new CompleteSaleError("Missing timestamp for authorization", SALE_AUTHORIZATION_EXPIRED);
    }
    
    const validUntilMs = new Date(auth.offline_valid_until).getTime();
    const occurredAtMs = new Date(occurred_at).getTime();
    const issuedAtMs =
      auth.offline_authorization === undefined
        ? null
        : new Date(auth.offline_authorization.issued_at).getTime();

    if (isNaN(validUntilMs) || isNaN(occurredAtMs)) {
      throw new CompleteSaleError("Malformed timestamp for authorization", SALE_AUTHORIZATION_EXPIRED);
    }

    if (
      validUntilMs < occurredAtMs ||
      (issuedAtMs !== null &&
        (!Number.isFinite(issuedAtMs) || occurredAtMs < issuedAtMs))
    ) {
      throw new CompleteSaleError("Offline authorization expired", SALE_AUTHORIZATION_EXPIRED);
    }

    // Business Isolation
    if (cart.business_id !== auth.membership.business_id) {
      throw new CompleteSaleError("Cross-Business Cart", SALE_CART_INTEGRITY_INVALID);
    }

    // 1. Validate + normalize immutable request values.
    if (!cart.lines || cart.lines.length === 0) {
      throw new CompleteSaleError("Cart is empty", EMPTY_CART);
    }

    const normalizedLines: Array<NormalizedSaleLine> = [];
    let recomputedSubtotal = parseMoney("0");
    let recomputedPromotionDiscountTotal = parseMoney("0");
    let recomputedGrandTotal = parseMoney("0");

    for (const line of cart.lines) {
      // Revalidate each line
      let quantityStr: QuantityValue;
      try {
        quantityStr = parseQuantity(line.quantity);
        if (quantityCompare(quantityStr, parseQuantity("0")) <= 0) {
          throw new CompleteSaleError("Invalid cart line quantity", SALE_CART_INTEGRITY_INVALID);
        }
      } catch {
        throw new CompleteSaleError("Invalid cart line quantity", SALE_CART_INTEGRITY_INVALID);
      }
      if (!fitsPrecisionScale(quantityStr, 20, 6)) {
        throw new CompleteSaleError("Quantity precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      let unitPriceStr: MoneyValue;
      try {
        unitPriceStr = parseMoney(line.unit_price);
        if (moneyCompare(unitPriceStr, parseMoney("0")) < 0) {
          throw new CompleteSaleError("Invalid cart line price", SALE_CART_INTEGRITY_INVALID);
        }
      } catch {
        throw new CompleteSaleError("Invalid cart line price", SALE_CART_INTEGRITY_INVALID);
      }
      if (!fitsPrecisionScale(unitPriceStr, 20, 4)) {
        throw new CompleteSaleError("Price precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      let baseUnitPriceStr: MoneyValue;
      let tierUnitPriceStr: MoneyValue;
      let promotionDiscountStr: MoneyValue;
      try {
        baseUnitPriceStr = parseMoney(line.base_unit_price);
        tierUnitPriceStr = parseMoney(line.tier_unit_price);
        promotionDiscountStr = parseMoney(line.promotion_discount);
        if (
          moneyCompare(baseUnitPriceStr, parseMoney("0")) < 0 ||
          moneyCompare(tierUnitPriceStr, parseMoney("0")) < 0 ||
          moneyCompare(promotionDiscountStr, parseMoney("0")) < 0 ||
          moneyCompare(promotionDiscountStr, tierUnitPriceStr) > 0 ||
          moneySubtract(tierUnitPriceStr, promotionDiscountStr) !== unitPriceStr
        ) {
          throw new Error("pricing layer mismatch");
        }
      } catch {
        throw new CompleteSaleError("Cart pricing layers are invalid", SALE_CART_INTEGRITY_INVALID);
      }
      if (
        !fitsPrecisionScale(baseUnitPriceStr, 20, 4) ||
        !fitsPrecisionScale(tierUnitPriceStr, 20, 4) ||
        !fitsPrecisionScale(promotionDiscountStr, 20, 4)
      ) {
        throw new CompleteSaleError("Pricing snapshot precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      const hasTierIdentity =
        line.tier_id !== null || line.tier_code !== null || line.tier_min_qty !== null;
      if (
        hasTierIdentity &&
        (line.tier_id === null || line.tier_code === null || line.tier_min_qty === null)
      ) {
        throw new CompleteSaleError("Tier snapshot is incomplete", SALE_CART_INTEGRITY_INVALID);
      }
      let tierMinQtyStr: QuantityValue | null = null;
      if (line.tier_min_qty !== null) {
        try {
          tierMinQtyStr = parseQuantity(line.tier_min_qty);
          if (
            quantityCompare(tierMinQtyStr, parseQuantity("0")) <= 0 ||
            quantityCompare(tierMinQtyStr, quantityStr) > 0 ||
            !fitsPrecisionScale(tierMinQtyStr, 20, 6)
          ) {
            throw new Error("invalid tier minimum");
          }
        } catch {
          throw new CompleteSaleError("Tier snapshot is invalid", SALE_CART_INTEGRITY_INVALID);
        }
      }

      const hasPromotion = line.promotion_id !== null;
      if (
        hasPromotion !== (line.promotion_type !== null) ||
        hasPromotion !== (line.promotion_value !== null) ||
        (!hasPromotion && moneyCompare(promotionDiscountStr, parseMoney("0")) !== 0)
      ) {
        throw new CompleteSaleError("Promotion snapshot is inconsistent", SALE_CART_INTEGRITY_INVALID);
      }
      let promotionValueStr: DecimalValue | null = null;
      if (line.promotion_value !== null) {
        try {
          promotionValueStr = parseDecimal(line.promotion_value);
          if (
            decimalCompare(promotionValueStr, parseDecimal("0")) < 0 ||
            !fitsPrecisionScale(promotionValueStr, 20, 4)
          ) {
            throw new Error("invalid promotion value");
          }
        } catch {
          throw new CompleteSaleError("Promotion value is invalid", SALE_CART_INTEGRITY_INVALID);
        }
      }
      if (
        !Number.isFinite(new Date(line.pricing_resolved_at).getTime()) ||
        (line.pricing_time_status !== "TRUSTED" &&
          line.pricing_time_status !== "CLOCK_UNTRUSTED")
      ) {
        throw new CompleteSaleError("Pricing time snapshot is invalid", SALE_CART_INTEGRITY_INVALID);
      }

      let conversionFactorStr: DecimalValue;
      try {
        conversionFactorStr = parseDecimal(line.conversion_factor);
        if (decimalCompare(conversionFactorStr, parseDecimal("0")) <= 0) {
          throw new CompleteSaleError("Invalid cart line conversion factor", SALE_UNIT_CONVERSION_INVALID);
        }
      } catch {
        throw new CompleteSaleError("Invalid cart line conversion factor", SALE_UNIT_CONVERSION_INVALID);
      }
      if (!fitsPrecisionScale(conversionFactorStr, 20, 8)) {
        throw new CompleteSaleError("Conversion precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      const expectedLineTotal = multiplyMoneyByQuantity(unitPriceStr, quantityStr);
      if (expectedLineTotal !== parseMoney(line.line_total)) {
        throw new CompleteSaleError("Cart line total is tampered", SALE_CART_INTEGRITY_INVALID);
      }
      if (!fitsPrecisionScale(expectedLineTotal, 20, 4)) {
        throw new CompleteSaleError("Line total precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      const baseQuantityStr = multiplyQuantityByFactor(quantityStr, conversionFactorStr);
      if (!fitsPrecisionScale(baseQuantityStr, 20, 6)) {
        throw new CompleteSaleError("Base quantity precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      const tierLineTotal = multiplyMoneyByQuantity(tierUnitPriceStr, quantityStr);
      const promotionDiscountTotal = multiplyMoneyByQuantity(
        promotionDiscountStr,
        quantityStr,
      );
      recomputedSubtotal = moneyAdd(recomputedSubtotal, tierLineTotal);
      recomputedPromotionDiscountTotal = moneyAdd(
        recomputedPromotionDiscountTotal,
        promotionDiscountTotal,
      );
      recomputedGrandTotal = moneyAdd(recomputedGrandTotal, expectedLineTotal);
      if (!fitsPrecisionScale(recomputedGrandTotal, 20, 4)) {
        throw new CompleteSaleError("Grand total precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      normalizedLines.push({
        ...line,
        parsed_quantity: quantityStr,
        parsed_unit_price: unitPriceStr,
        parsed_line_total: expectedLineTotal,
        parsed_conversion_factor: conversionFactorStr,
        parsed_base_quantity: baseQuantityStr,
        parsed_base_unit_price: baseUnitPriceStr,
        parsed_tier_unit_price: tierUnitPriceStr,
        parsed_tier_min_qty: tierMinQtyStr,
        parsed_promotion_value: promotionValueStr,
        parsed_promotion_discount: promotionDiscountStr,
        parsed_promotion_discount_total: promotionDiscountTotal,
        parsed_tier_line_total: tierLineTotal,
      });
    }

    // Evaluate cash settlement
    let tenderedStr: MoneyValue;
    try {
      tenderedStr = parseMoney(amount_tendered);
      if (moneyCompare(tenderedStr, parseMoney("0")) < 0) {
        throw new CompleteSaleError("Invalid tendered amount", SALE_CART_INTEGRITY_INVALID);
      }
    } catch {
      throw new CompleteSaleError("Invalid tendered amount", SALE_CART_INTEGRITY_INVALID);
    }
    
    if (moneyCompare(tenderedStr, recomputedGrandTotal) < 0) {
      throw new CompleteSaleError("Insufficient payment", PAYMENT_INSUFFICIENT);
    }
    
    const changeDueStr = moneySubtract(tenderedStr, recomputedGrandTotal);
    const paymentAmountStr = recomputedGrandTotal;

    if (!fitsPrecisionScale(tenderedStr, 20, 4) ||
        !fitsPrecisionScale(changeDueStr, 20, 4) ||
        !fitsPrecisionScale(paymentAmountStr, 20, 4)) {
      throw new CompleteSaleError("Payment precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
    }

    // 2. Build request_fingerprint
    const requestFingerprintPayload = {
      business_id: auth.membership.business_id,
      user_id: auth.user.id,
      authorization_version: auth.authorization_version,
      location_id: auth.default_location_id,
      device_id,
      occurred_at,
      cart: {
        business_id: cart.business_id
      },
      lines: normalizedLines.map(l => ({
        product_id: l.product_id,
        product_unit_id: l.product_unit_id,
        product_name: l.product_name,
        variant_name: l.variant_name,
        unit_code: l.unit_code,
        sku: l.sku,
        quantity: l.parsed_quantity,
        unit_price: l.parsed_unit_price,
        base_unit_price: l.parsed_base_unit_price,
        tier_id: l.tier_id,
        tier_code: l.tier_code,
        tier_min_qty: l.parsed_tier_min_qty,
        tier_unit_price: l.parsed_tier_unit_price,
        promotion_id: l.promotion_id,
        promotion_type: l.promotion_type,
        promotion_value: l.parsed_promotion_value,
        promotion_discount: l.parsed_promotion_discount,
        pricing_resolved_at: l.pricing_resolved_at,
        pricing_time_status: l.pricing_time_status,
        line_total: l.parsed_line_total,
        conversion_factor: l.parsed_conversion_factor,
        track_inventory: l.track_inventory,
        price_version_id: l.price_version_id,
        price_effective_from: l.price_effective_from,
      })),
      amount_tendered: tenderedStr,
    };
    const requestFingerprint = JSON.stringify(requestFingerprintPayload);

    // Provide auth values
    const businessId = auth.membership.business_id;
    const locationId = auth.default_location_id;
    const cashierUserId = auth.user.id;

    return this.db.transaction("rw",
      [
        this.db.table("shifts"),
        this.db.table("transactions"),
        this.db.table("transaction_items"),
        this.db.table("payments"),
        this.db.table("stock_movements"),
        this.db.table("cash_movements"),
        this.db.table("audit_events"),
        this.db.table("outbox"),
      ],
      async () => {
        // 3. Check existing command_id.
        const existingOutbox = await this.db.table("outbox").where({ command_id }).first();
        if (existingOutbox) {
          if (existingOutbox.request_fingerprint === requestFingerprint) {
            // Return prior result
            const existingTx = await this.db.table("transactions").where({ command_id }).first();
            return { transaction_id: existingTx.transaction_id };
          } else {
            throw new CompleteSaleError("Command ID reused with different payload", IDEMPOTENCY_KEY_REUSE_ERROR);
          }
        }

        // Validate Shift
        const shifts = await this.db.table("shifts")
          .where({ business_id: businessId })
          .toArray();
        const activeShift = shifts.find(s => 
          s.status === "OPEN" && 
          s.location_id === locationId && 
          s.device_id === device_id && 
          s.cashier_user_id === cashierUserId
        );

        if (!activeShift) {
          // Check if there is an open shift for this device but wrong user
          const wrongUserShift = shifts.find(s => s.status === "OPEN" && s.device_id === device_id);
          if (wrongUserShift) {
            throw new CompleteSaleError("Active shift context mismatch", SALE_SHIFT_CONTEXT_MISMATCH);
          }
          throw new CompleteSaleError("No active shift found", SHIFT_REQUIRED);
        }

        if (!activeShift.terminal_id) {
          throw new CompleteSaleError("Terminal ID is required for sale", SALE_TERMINAL_REQUIRED);
        }

        const transactionId = crypto.randomUUID();
        const correlationId = crypto.randomUUID();
        const transactionNumber = `TRX-${transactionId}`;

        const transaction: LocalCompletedTransaction = {
          transaction_id: transactionId,
          command_id,
          business_id: businessId,
          location_id: locationId,
          terminal_id: activeShift.terminal_id,
          device_id,
          shift_id: activeShift.shift_id,
          transaction_number: transactionNumber,
          status: "COMPLETED",
          sync_status: "PENDING",
          customer_id: null,
          subtotal: recomputedSubtotal,
          promotion_discount_total: recomputedPromotionDiscountTotal,
          line_discount_total: "0.0000",
          transaction_discount_total: "0.0000",
          tax_total: "0.0000",
          grand_total: recomputedGrandTotal,
          total_paid: paymentAmountStr,
          change_amount: changeDueStr,
          cost_status: "COST_PENDING",
          created_by: cashierUserId,
          authorization_version: auth.authorization_version,
          occurred_at,
          completed_at: occurred_at,
          created_at: occurred_at,
          correlation_id: correlationId
        };
        await this.db.table("transactions").add(transaction);
        if (testFaults.get(this) === "after_transaction") throw new Error("Fault: after_transaction");

        let lineIndex = 0;
        const transactionItems: LocalCompletedTransactionItem[] = [];
        const stockMovements: LocalSaleStockMovement[] = [];
        for (const line of normalizedLines) {
          const transactionItemId = crypto.randomUUID();
          
          const transactionItem: LocalCompletedTransactionItem = {
            transaction_item_id: transactionItemId,
            transaction_id: transactionId,
            line_index: lineIndex++,
            product_id: line.product_id,
            product_unit_id: line.product_unit_id,
            product_name_snapshot: line.product_name,
            sku_snapshot: line.sku,
            unit_code_snapshot: line.unit_code,
            unit_name_snapshot: line.variant_name,
            conversion_snapshot: line.parsed_conversion_factor,
            quantity: line.parsed_quantity,
            base_quantity: line.parsed_base_quantity,
            price_version_id_snapshot: line.price_version_id,
            price_effective_from_snapshot: line.price_effective_from,
            pricing_resolved_at_snapshot: line.pricing_resolved_at,
            pricing_time_status_snapshot: line.pricing_time_status,
            base_unit_price_snapshot: line.parsed_base_unit_price,
            tier_id_snapshot: line.tier_id,
            tier_code_snapshot: line.tier_code,
            tier_min_qty_snapshot: line.parsed_tier_min_qty,
            tier_unit_price_snapshot: line.parsed_tier_unit_price,
            promotion_id: line.promotion_id,
            promotion_type_snapshot: line.promotion_type,
            promotion_value_snapshot: line.parsed_promotion_value,
            promotion_discount_snapshot: line.parsed_promotion_discount,
            manual_line_discount_snapshot: "0.0000",
            transaction_discount_allocation: "0.0000",
            final_unit_price_snapshot: line.parsed_unit_price,
            line_total: line.parsed_line_total,
            tax_mode_snapshot: "NO_PPN",
            tax_rate_snapshot: "0.0000",
            tax_amount_snapshot: "0.0000",
            cost_unit_snapshot: null,
            cost_status: "COST_PENDING",
            track_inventory_snapshot: line.track_inventory,
            created_at: occurred_at
          };
          transactionItems.push(transactionItem);

          if (line.track_inventory) {
            const stockMovementId = crypto.randomUUID();
            stockMovements.push({
              stock_movement_id: stockMovementId,
              business_id: businessId,
              location_id: locationId,
              product_id: line.product_id,
              movement_type: "SALE",
              base_quantity_delta: quantityNegate(line.parsed_base_quantity),
              source_unit_id: line.product_unit_id,
              source_quantity: line.parsed_quantity,
              conversion_snapshot: line.parsed_conversion_factor,
              source_type: "SALE_TRANSACTION",
              source_id: transactionId,
              source_line_id: transactionItemId,
              occurred_at,
              actor_user_id: cashierUserId,
              device_id,
              correlation_id: correlationId
            });
          }
        }
        await this.db.table("transaction_items").bulkAdd(transactionItems);
        if (testFaults.get(this) === "after_items") throw new Error("Fault: after_items");

        const payment: LocalCompletedPayment = {
          payment_id: crypto.randomUUID(),
          business_id: businessId,
          transaction_id: transactionId,
          method_code: "CASH",
          amount: paymentAmountStr,
          amount_tendered: tenderedStr,
          change_amount: changeDueStr,
          status: "COMPLETED",
          confirmation_type: "CASH_CONFIRMED",
          external_reference: null,
          received_at: occurred_at,
          completed_at: occurred_at,
          recorded_by: cashierUserId,
          device_id,
          correlation_id: correlationId
        };
        await this.db.table("payments").add(payment);
        if (testFaults.get(this) === "after_payment") throw new Error("Fault: after_payment");

        if (stockMovements.length > 0) {
          await this.db.table("stock_movements").bulkAdd(stockMovements);
        }
        if (testFaults.get(this) === "after_stock") throw new Error("Fault: after_stock");

        const cashMovement: LocalCashMovementRecord = {
          id: crypto.randomUUID(),
          shift_id: activeShift.shift_id,
          business_id: businessId,
          location_id: locationId,
          movement_type: "CASH_SALE",
          direction: "IN",
          amount: paymentAmountStr,
          source_type: "SALE_TRANSACTION",
          source_id: transactionId,
          reason_code: null,
          notes: null,
          occurred_at,
          actor_user_id: cashierUserId,
          correlation_id: correlationId,
        };
        await this.db.table("cash_movements").add(cashMovement);
        if (testFaults.get(this) === "after_cash") throw new Error("Fault: after_cash");

        const auditEvent: LocalAuditEventRecord = {
          id: crypto.randomUUID(),
          business_id: businessId,
          location_id: locationId,
          actor_type: "USER",
          actor_user_id: cashierUserId,
          actor_role_snapshot: auth.primary_role ?? null,
          action: "TRANSACTION_COMPLETED",
          entity_type: "SALES_TRANSACTION",
          entity_id: transactionId,
          occurred_at,
          recorded_at: new Date().toISOString(),
          device_id,
          session_id: null,
          reason: null,
          before_data: null,
          after_data: {
            status: transaction.status,
            transaction_number: transaction.transaction_number,
            grand_total: transaction.grand_total,
            payment_method: payment.method_code,
          },
          correlation_id: correlationId,
          authorization_version: auth.authorization_version,
          sync_status: "PENDING",
        };
        await this.db.table("audit_events").add(auditEvent);
        if (testFaults.get(this) === "after_audit") throw new Error("Fault: after_audit");

        const canonicalPayload: LocalCompleteSaleOutboxPayloadV1 = {
          payload_version: 1,
          transaction,
          items: transactionItems,
          payments: [payment],
          stock_movements: stockMovements,
          cash_movements: [cashMovement],
          audit_events: [auditEvent],
        };
        const outboxPayload = JSON.stringify(canonicalPayload);

        const outboxRecord = {
          outbox_id: crypto.randomUUID(),
          command_id,
          business_id: businessId,
          business_event_id: transactionId,
          command_type: "sales.complete",
          schema_version: 1,
          location_id: locationId,
          device_id,
          authorization_version: auth.authorization_version,
          ...(auth.offline_authorization === undefined
            ? {}
            : { offline_authorization: auth.offline_authorization }),
          correlation_id: correlationId,
          occurred_at,
          payload: outboxPayload,
          request_fingerprint: requestFingerprint,
          created_at: new Date().toISOString(),
          attempt_count: 0,
          last_attempt_at: null,
          status: "PENDING",
          last_error: null
        };
        if (testFaults.get(this) === "before_outbox") throw new Error("Fault: before_outbox");
        await this.db.table("outbox").add(outboxRecord);

        return { transaction_id: transactionId };
      }
    ).catch(async err => {
      // Catch native Dexie constraint errors and wrap if needed
      if (err.name === 'ConstraintError') {
         const existingOutbox = await this.db.table("outbox").where({ command_id }).first();
         if (existingOutbox) {
           if (existingOutbox.request_fingerprint === requestFingerprint) {
             const existingTx = await this.db.table("transactions").where({ command_id }).first();
             return { transaction_id: existingTx.transaction_id };
           } else {
             throw new CompleteSaleError("Command ID reused with different payload", IDEMPOTENCY_KEY_REUSE_ERROR);
           }
         }
      }
      throw err;
    });
  }
}
