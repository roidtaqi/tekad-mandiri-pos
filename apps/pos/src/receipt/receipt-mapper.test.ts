import { describe, it, expect } from "vitest";
import { mapTransactionToReceipt } from "./receipt-mapper";
import type { CompletedSaleAggregate } from "@kastur/local-db";

describe("Receipt Mapper", () => {
  const mockTransaction: CompletedSaleAggregate = {
    transaction: {
      transaction_id: "tx-123456",
      command_id: "cmd-1",
      business_id: "biz-1",
      location_id: "loc-1",
      terminal_id: "term-1",
      device_id: "dev-1",
      shift_id: "shift-1",
      transaction_number: "TX-1",
      occurred_at: "2026-08-18T10:00:00Z",
      status: "COMPLETED",
      sync_status: "PENDING",
      customer_id: null,
      subtotal: "150000.5000",
      promotion_discount_total: "0",
      line_discount_total: "0",
      transaction_discount_total: "0",
      tax_total: "0.0000",
      grand_total: "150000.5000",
      total_paid: "200000.0000",
      change_amount: "49999.5000",
      cost_status: "COST_PENDING",
      created_by: "cashier-2",
      authorization_version: 1,
      completed_at: "2026-08-18T10:00:00Z",
      created_at: "2026-08-18T10:00:00Z",
      correlation_id: "corr-1"
    },
    items: [
      {
        transaction_item_id: "item-1",
        transaction_id: "tx-123456",
        line_index: 0,
        product_id: "prod-1",
        product_unit_id: "unit-1",
        product_name_snapshot: "Kopi Hitam",
        sku_snapshot: "SKU-KOPI",
        unit_code_snapshot: "CUP",
        unit_name_snapshot: "Cup",
        conversion_snapshot: "1",
        quantity: "2.500000",
        base_quantity: "2.500000",
        price_version_id_snapshot: "pv-1",
        price_effective_from_snapshot: "2026-08-18T00:00:00Z",
        pricing_resolved_at_snapshot: "2026-08-18T10:00:00Z",
        pricing_time_status_snapshot: "TRUSTED",
        base_unit_price_snapshot: "20000.2000",
        tier_id_snapshot: "tier-retail-1",
        tier_code_snapshot: "RETAIL",
        tier_min_qty_snapshot: "1",
        tier_unit_price_snapshot: "20000.2000",
        promotion_id: null,
        promotion_type_snapshot: null,
        promotion_value_snapshot: null,
        promotion_discount_snapshot: "0",
        manual_line_discount_snapshot: "0",
        transaction_discount_allocation: "0.0000",
        final_unit_price_snapshot: "20000.2000",
        line_total: "50000.5000",
        tax_mode_snapshot: "NO_PPN",
        tax_rate_snapshot: "0",
        tax_amount_snapshot: "0",
        cost_unit_snapshot: null,
        cost_status: "COST_PENDING",
        track_inventory_snapshot: true,
        created_at: "2026-08-18T10:00:00Z"
      },
      {
        transaction_item_id: "item-2",
        transaction_id: "tx-123456",
        line_index: 1,
        product_id: "prod-2",
        product_unit_id: "unit-2",
        product_name_snapshot: "Gula",
        sku_snapshot: "SKU-GULA",
        unit_code_snapshot: "KG",
        unit_name_snapshot: "Kg",
        conversion_snapshot: "1",
        quantity: "1.000000",
        base_quantity: "1.000000",
        price_version_id_snapshot: "pv-1",
        price_effective_from_snapshot: "2026-08-18T00:00:00Z",
        pricing_resolved_at_snapshot: "2026-08-18T10:00:00Z",
        pricing_time_status_snapshot: "TRUSTED",
        base_unit_price_snapshot: "100000.0000",
        tier_id_snapshot: "tier-retail-2",
        tier_code_snapshot: "RETAIL",
        tier_min_qty_snapshot: "1",
        tier_unit_price_snapshot: "100000.0000",
        promotion_id: null,
        promotion_type_snapshot: null,
        promotion_value_snapshot: null,
        promotion_discount_snapshot: "0",
        manual_line_discount_snapshot: "0",
        transaction_discount_allocation: "0.0000",
        final_unit_price_snapshot: "100000.0000",
        line_total: "100000.0000",
        tax_mode_snapshot: "NO_PPN",
        tax_rate_snapshot: "0",
        tax_amount_snapshot: "0",
        cost_unit_snapshot: null,
        cost_status: "COST_PENDING",
        track_inventory_snapshot: true,
        created_at: "2026-08-18T10:00:00Z"
      }
    ],
    payments: [
      {
        payment_id: "pay-1",
        business_id: "biz-1",
        transaction_id: "tx-123456",
        method_code: "CASH",
        amount: "150000.5000",
        amount_tendered: "200000.0000",
        change_amount: "49999.5000",
        status: "COMPLETED",
        confirmation_type: "CASH_CONFIRMED",
        external_reference: null,
        received_at: "2026-08-18T10:00:00Z",
        completed_at: "2026-08-18T10:00:00Z",
        recorded_by: "cashier-2",
        device_id: "dev-1",
        correlation_id: "corr-1"
      }
    ],
    stock_movements: [],
    cash_movements: [],
    audit_events: []
  };

  const storeContext = {
    name: "Toko Tekad Mandiri",
    address: "Jl. Raya No. 1",
    phone: "08123456789",
    footer: "Terima Kasih"
  };

  it("maps transaction to receipt without exposing cost/margin", () => {
    const receipt = mapTransactionToReceipt(mockTransaction, storeContext, "58mm");
    
    expect(receipt.transactionId).toBe("TX-1");
    expect(receipt.cashierName).toBe("cashier-2");
    expect(receipt.items.length).toBe(2);
    expect(receipt.items[0]?.qty).toBe("2.500000"); // Fractional qty preserved
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

  it("expands a per-unit promotion snapshot into the receipt line discount", () => {
    const promotedTransaction: CompletedSaleAggregate = {
      ...mockTransaction,
      items: [
        {
          ...mockTransaction.items[0]!,
          promotion_discount_snapshot: "2500.2000",
          manual_line_discount_snapshot: "100.0000",
          transaction_discount_allocation: "50.0000",
        },
      ],
    };

    const receipt = mapTransactionToReceipt(promotedTransaction, storeContext);

    expect(receipt.items[0]?.discount).toBe("6400.5");
  });
});
