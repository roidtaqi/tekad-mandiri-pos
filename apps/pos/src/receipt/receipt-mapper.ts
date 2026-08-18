import type { CompletedSaleAggregate } from "@kastur/local-db";
import type { ReceiptProps } from "@kastur/ui";

export function mapTransactionToReceipt(
  transaction: CompletedSaleAggregate,
  storeContext: { name: string; address: string; phone: string; footer: string },
  width: "80mm" | "58mm" = "58mm"
): ReceiptProps {
  // We don't expose cost or margin
  const items = transaction.items.map((item) => ({
    name: item.product_name_snapshot,
    unitName: item.unit_name_snapshot,
    qty: item.quantity,
    price: item.base_unit_price_snapshot,
    discount: item.transaction_discount_allocation, // Or line manual discount
    subtotal: item.line_total,
  }));

  const payments = transaction.payments.map((p) => ({
    method: p.method_code,
    amount: p.amount,
  }));

  // Aggregate discounts if we have transaction-level discounts
  // In M2-007 there is discount_allocation but we'll use a placeholder for total discount if needed
  const discountTotal = "0"; // Placeholder until M7 promotions

  return {
    transactionId: (transaction.transaction.transaction_id.split("-")[0] ?? "").toUpperCase(), // Short visual ID
    cashierName: transaction.transaction.created_by, // We should lookup name, but for now ID or if we have it in auth
    createdAt: transaction.transaction.occurred_at,
    storeName: storeContext.name,
    storeAddress: storeContext.address,
    storePhone: storeContext.phone,
    receiptFooter: storeContext.footer,
    items,
    subtotal: transaction.transaction.subtotal,
    discountTotal,
    taxTotal: transaction.transaction.tax_total,
    total: transaction.transaction.grand_total, // M2 has no tax/discount separate total yet, it's all in amount_total
    paid: transaction.transaction.total_paid || transaction.transaction.grand_total,
    change: transaction.transaction.change_amount || "0",
    payments,
    width,
  };
}
