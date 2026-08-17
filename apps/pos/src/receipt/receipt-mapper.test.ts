import { describe, it, expect } from "vitest";
import { mapTransactionToReceipt } from "./receipt-mapper";
import type { LocalCompletedTransaction } from "@kastur/local-db";

describe("Receipt Mapper", () => {
  const mockTransaction: LocalCompletedTransaction = {
    transaction: {
      transaction_id: "tx-123456",
      shift_id: "shift-1",
      cashier_id: "cashier-2",
      terminal_id: "term-1",
      occurred_at: "2026-08-18T10:00:00Z",
      status: "COMPLETED",
      sync_status: "PENDING",
      amount_total: "150000.5000",
      tax_total: "0.0000",
      amount_tendered: "200000.0000",
      amount_change: "49999.5000",
      cost_status: "COST_PENDING"
    },
    items: [
      {
        transaction_item_id: "item-1",
        transaction_id: "tx-123456",
        product_unit_id: "unit-1",
        product_name: "Kopi Hitam",
        unit_name: "Cup",
        quantity: "2.500000",
        base_quantity: "2.500000",
        unit_price: "20000.2000",
        discount_allocation: "0.0000",
        line_total: "50000.5000",
        track_inventory: true
      },
      {
        transaction_item_id: "item-2",
        transaction_id: "tx-123456",
        product_unit_id: "unit-2",
        product_name: "Gula",
        unit_name: "Kg",
        quantity: "1.000000",
        base_quantity: "1.000000",
        unit_price: "100000.0000",
        discount_allocation: "0.0000",
        line_total: "100000.0000",
        track_inventory: true
      }
    ],
    payments: [
      {
        payment_id: "pay-1",
        transaction_id: "tx-123456",
        payment_method_id: "CASH",
        amount: "150000.5000"
      }
    ],
    stock_movements: [],
    outbox: {
      event_id: "evt-1",
      aggregate_id: "tx-123456",
      aggregate_type: "TRANSACTION",
      event_type: "TRANSACTION_COMPLETED",
      payload: {},
      occurred_at: "2026-08-18T10:00:00Z"
    }
  };

  const storeContext = {
    name: "Toko Kastur",
    address: "Jl. Raya No. 1",
    phone: "08123456789",
    footer: "Terima Kasih"
  };

  it("maps transaction to receipt without exposing cost/margin", () => {
    const receipt = mapTransactionToReceipt(mockTransaction, storeContext, "58mm");
    
    expect(receipt.transactionId).toBe("TX");
    expect(receipt.cashierName).toBe("cashier-2");
    expect(receipt.items.length).toBe(2);
    expect(receipt.items[0].qty).toBe("2.500000"); // Fractional qty preserved
    expect(receipt.total).toBe("150000.5000"); // Exact string
    expect(receipt.paid).toBe("200000.0000");
    expect(receipt.change).toBe("49999.5000");
    
    // No cost/margin anywhere
    expect(JSON.stringify(receipt)).not.toContain("cost");
    expect(JSON.stringify(receipt)).not.toContain("margin");
  });

  it("assigns width correctly", () => {
    const receipt80 = mapTransactionToReceipt(mockTransaction, storeContext, "80mm");
    expect(receipt80.width).toBe("80mm");
  });
});
