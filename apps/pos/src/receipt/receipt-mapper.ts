import type { CompletedSaleAggregate } from "@kastur/local-db";
import {
  moneyAdd,
  multiplyMoneyByQuantity,
  parseMoney,
  parseQuantity,
} from "@kastur/numeric";
import type { ReceiptProps } from "@kastur/ui";

export function mapTransactionToReceipt(
  transaction: CompletedSaleAggregate,
  storeContext: {
    name: string;
    address: string;
    phone: string;
    footer: string;
    cashierName?: string;
  },
  width: "80mm" | "58mm" = "58mm"
): ReceiptProps {
  // We don't expose cost or margin
  const items = transaction.items.map((item) => ({
    name: item.product_name_snapshot,
    unitName: item.unit_name_snapshot,
    qty: item.quantity,
    price: item.tier_unit_price_snapshot,
    discount: moneyAdd(
      moneyAdd(
        multiplyMoneyByQuantity(
          parseMoney(item.promotion_discount_snapshot),
          parseQuantity(item.quantity),
        ),
        parseMoney(item.manual_line_discount_snapshot),
      ),
      parseMoney(item.transaction_discount_allocation),
    ),
    subtotal: item.line_total,
  }));

  const payments = transaction.payments.map((p) => ({
    method: p.method_code,
    amount: p.amount,
  }));

  const discountTotal = moneyAdd(
    moneyAdd(
      parseMoney(transaction.transaction.promotion_discount_total),
      parseMoney(transaction.transaction.line_discount_total),
    ),
    parseMoney(transaction.transaction.transaction_discount_total),
  );

  return {
    transactionId: transaction.transaction.transaction_number,
    cashierName: storeContext.cashierName ?? transaction.transaction.created_by,
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
    paid: transaction.payments[0]?.amount_tendered ?? transaction.transaction.total_paid,
    change: transaction.transaction.change_amount,
    payments,
    width,
  };
}
