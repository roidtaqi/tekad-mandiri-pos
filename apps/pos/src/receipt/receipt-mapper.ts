import type { LocalCompletedTransaction } from "@kastur/local-db";
import type { ReceiptProps } from "@kastur/ui";

export function mapTransactionToReceipt(
  transaction: LocalCompletedTransaction,
  storeContext: { name: string; address: string; phone: string; footer: string },
  width: "80mm" | "58mm" = "58mm"
): ReceiptProps {
  // We don't expose cost or margin
  const items = transaction.items.map((item) => ({
    name: item.product_name,
    unitName: item.unit_name,
    qty: item.quantity,
    price: item.unit_price,
    discount: item.discount_allocation, // Or line manual discount
    subtotal: item.line_total,
  }));

  const payments = transaction.payments.map((p) => ({
    method: p.payment_method_id,
    amount: p.amount,
  }));

  // Aggregate discounts if we have transaction-level discounts
  // In M2-007 there is discount_allocation but we'll use a placeholder for total discount if needed
  const discountTotal = "0"; // Placeholder until M7 promotions

  return {
    transactionId: transaction.transaction.transaction_id.split("-")[0].toUpperCase(), // Short visual ID
    cashierName: transaction.transaction.cashier_id, // We should lookup name, but for now ID or if we have it in auth
    createdAt: transaction.transaction.occurred_at,
    storeName: storeContext.name,
    storeAddress: storeContext.address,
    storePhone: storeContext.phone,
    receiptFooter: storeContext.footer,
    items,
    subtotal: transaction.transaction.amount_total,
    discountTotal,
    taxTotal: transaction.transaction.tax_total,
    total: transaction.transaction.amount_total, // M2 has no tax/discount separate total yet, it's all in amount_total
    paid: transaction.transaction.amount_tendered || transaction.transaction.amount_total,
    change: transaction.transaction.amount_change || "0",
    payments,
    width,
  };
}
