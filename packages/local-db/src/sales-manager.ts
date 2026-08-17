import type { Dexie } from "dexie";
import type { AuthContextResponse } from "@kastur/contracts";
import { 
  parseMoney, 
  parseDecimal, 
  multiplyQuantityByFactor, 
  quantityNegate,
  fitsPrecisionScale,
  parseQuantity,
  moneyAdd,
  multiplyMoneyByQuantity,
  type MoneyValue,
  type QuantityValue,
  type DecimalValue
} from "@kastur/numeric";
import { evaluateCashSettlement, type Cart } from "@kastur/domain";

export const SHIFT_REQUIRED = "SHIFT_REQUIRED";
export const SALE_SHIFT_CONTEXT_MISMATCH = "SALE_SHIFT_CONTEXT_MISMATCH";
export const SALE_TERMINAL_REQUIRED = "SALE_TERMINAL_REQUIRED";
export const EMPTY_CART = "EMPTY_CART";
export const SALE_CART_INTEGRITY_INVALID = "SALE_CART_INTEGRITY_INVALID";
export const SALE_NUMERIC_BOUNDARY_INVALID = "SALE_NUMERIC_BOUNDARY_INVALID";
export const PAYMENT_INSUFFICIENT = "PAYMENT_INSUFFICIENT";
export const IDEMPOTENCY_KEY_REUSE_ERROR = "IDEMPOTENCY_KEY_REUSE_ERROR";

export class CompleteSaleError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CompleteSaleError";
  }
}

export interface CompleteSaleInput {
  auth: AuthContextResponse;
  device_id: string;
  command_id: string;
  occurred_at: string;
  cart: Cart;
  amount_tendered: string;
  _faultSeam?: "after_transaction" | "after_items" | "after_payment" | "after_stock" | "before_outbox";
}

export class PosSalesManager {
  constructor(private readonly db: Dexie) {}

  async completeSale(input: CompleteSaleInput): Promise<any> {
    const { auth, device_id, command_id, occurred_at, cart, amount_tendered } = input;

    // 1. Validate + normalize immutable request values.
    if (!cart.lines || cart.lines.length === 0) {
      throw new CompleteSaleError("Cart is empty", EMPTY_CART);
    }

    const normalizedLines: Array<any> = [];
    let recomputedGrandTotal = parseMoney("0");

    for (const line of cart.lines) {
      // Revalidate each line
      let quantityStr: QuantityValue;
      try {
        quantityStr = parseQuantity(line.quantity);
        const floatQ = parseFloat(quantityStr);
        if (isNaN(floatQ) || floatQ <= 0) {
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
        const floatP = parseFloat(unitPriceStr);
        if (isNaN(floatP) || floatP < 0) {
          throw new CompleteSaleError("Invalid cart line price", SALE_CART_INTEGRITY_INVALID);
        }
      } catch {
        throw new CompleteSaleError("Invalid cart line price", SALE_CART_INTEGRITY_INVALID);
      }
      if (!fitsPrecisionScale(unitPriceStr, 20, 4)) {
        throw new CompleteSaleError("Price precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      let conversionFactorStr: DecimalValue;
      try {
        conversionFactorStr = parseDecimal(line.conversion_factor);
        const floatC = parseFloat(conversionFactorStr);
        if (isNaN(floatC) || floatC <= 0) {
          throw new CompleteSaleError("Invalid cart line conversion factor", SALE_CART_INTEGRITY_INVALID);
        }
      } catch {
        throw new CompleteSaleError("Invalid cart line conversion factor", SALE_CART_INTEGRITY_INVALID);
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

      recomputedGrandTotal = moneyAdd(recomputedGrandTotal, expectedLineTotal);
      if (!fitsPrecisionScale(recomputedGrandTotal, 20, 4)) {
        throw new CompleteSaleError("Grand total precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
      }

      normalizedLines.push({
        ...line,
        quantity: quantityStr,
        unit_price: unitPriceStr,
        line_total: expectedLineTotal,
        conversion_factor: conversionFactorStr,
        base_quantity: baseQuantityStr,
      });
    }

    // Evaluate cash settlement
    const settlement = evaluateCashSettlement(recomputedGrandTotal, amount_tendered);
    if (settlement.status === "INSUFFICIENT") {
      throw new CompleteSaleError("Insufficient payment", PAYMENT_INSUFFICIENT);
    }
    
    if (!fitsPrecisionScale(settlement.amount_tendered, 20, 4) ||
        !fitsPrecisionScale(settlement.change_due, 20, 4) ||
        !fitsPrecisionScale(settlement.payment_amount, 20, 4)) {
      throw new CompleteSaleError("Payment precision invalid", SALE_NUMERIC_BOUNDARY_INVALID);
    }

    // 2. Build request_fingerprint
    const requestFingerprintPayload = {
      business_id: auth.membership.business_id,
      user_id: auth.user.id,
      location_id: auth.default_location_id,
      device_id,
      occurred_at,
      lines: normalizedLines.map(l => ({
        product_unit_id: l.product_unit_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        conversion_factor: l.conversion_factor,
        track_inventory: l.track_inventory,
        price_version_id: l.price_version_id,
      })),
      amount_tendered: settlement.amount_tendered,
    };
    const requestFingerprint = JSON.stringify(requestFingerprintPayload);

    // Provide auth values
    const businessId = auth.membership.business_id;
    const locationId = auth.default_location_id;
    const cashierUserId = auth.user.id;

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
        throw new CompleteSaleError(`Missing permission: ${perm}`, "PERMISSION_DENIED");
      }
    }

    if (auth.offline_valid_until && new Date(auth.offline_valid_until) < new Date(occurred_at)) {
      throw new CompleteSaleError("Offline authorization expired", "AUTHORIZATION_EXPIRED");
    }

    return this.db.transaction("rw", 
      [this.db.table("shifts"), this.db.table("transactions"), this.db.table("transaction_items"), this.db.table("payments"), this.db.table("stock_movements"), this.db.table("outbox")], 
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
        const transactionNumber = `TX-${Date.now()}`; // simple local placeholder

        const transaction = {
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
          subtotal: recomputedGrandTotal,
          promotion_discount_total: "0.0000",
          line_discount_total: "0.0000",
          transaction_discount_total: "0.0000",
          tax_total: "0.0000",
          grand_total: recomputedGrandTotal,
          total_paid: settlement.payment_amount,
          change_amount: settlement.change_due,
          cost_status: "COST_PENDING",
          created_by: cashierUserId,
          authorization_version: auth.authorization_version,
          occurred_at,
          completed_at: occurred_at,
          created_at: occurred_at,
          correlation_id: correlationId
        };
        await this.db.table("transactions").add(transaction);
        if (input._faultSeam === "after_transaction") throw new Error("Fault: after_transaction");

        let lineIndex = 0;
        const transactionItems = [];
        const stockMovements = [];
        for (const line of normalizedLines) {
          const transactionItemId = crypto.randomUUID();
          
          const transactionItem = {
            transaction_item_id: transactionItemId,
            transaction_id: transactionId,
            line_index: lineIndex++,
            product_id: line.product_id,
            product_unit_id: line.product_unit_id,
            product_name_snapshot: line.product_name,
            sku_snapshot: line.sku,
            unit_code_snapshot: line.unit_code,
            unit_name_snapshot: line.variant_name,
            conversion_snapshot: line.conversion_factor,
            quantity: line.quantity,
            base_quantity: line.base_quantity,
            price_version_id_snapshot: line.price_version_id,
            price_effective_from_snapshot: line.price_effective_from,
            base_unit_price_snapshot: line.unit_price,
            tier_code_snapshot: "RETAIL",
            tier_unit_price_snapshot: line.unit_price,
            promotion_id: null,
            promotion_discount_snapshot: "0.0000",
            manual_line_discount_snapshot: "0.0000",
            transaction_discount_allocation: "0.0000",
            final_unit_price_snapshot: line.unit_price,
            line_total: line.line_total,
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
              base_quantity_delta: quantityNegate(line.base_quantity),
              source_unit_id: line.product_unit_id,
              source_quantity: line.quantity,
              conversion_snapshot: line.conversion_factor,
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
        if (input._faultSeam === "after_items") throw new Error("Fault: after_items");

        const payment = {
          payment_id: crypto.randomUUID(),
          business_id: businessId,
          transaction_id: transactionId,
          method_code: "CASH",
          amount: recomputedGrandTotal,
          amount_tendered: settlement.amount_tendered,
          change_amount: settlement.change_due,
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
        if (input._faultSeam === "after_payment") throw new Error("Fault: after_payment");

        if (stockMovements.length > 0) {
          await this.db.table("stock_movements").bulkAdd(stockMovements);
        }
        if (input._faultSeam === "after_stock") throw new Error("Fault: after_stock");

        const outboxPayload = JSON.stringify({
          transaction,
          items: transactionItems,
          payment,
          stockMovements
        });

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
        if (input._faultSeam === "before_outbox") throw new Error("Fault: before_outbox");
        await this.db.table("outbox").add(outboxRecord);

        return { transaction_id: transactionId };
      }
    ).catch(err => {
      // Catch native Dexie constraint errors and wrap if needed
      if (err.name === 'ConstraintError') {
        throw new CompleteSaleError("Command ID reused with different payload", IDEMPOTENCY_KEY_REUSE_ERROR);
      }
      throw err;
    });
  }
}
