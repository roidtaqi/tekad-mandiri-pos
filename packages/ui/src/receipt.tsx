import React from "react";
import "./receipt.css";
import { formatDateTime, formatRupiah, formatQuantity } from "./utils/format";

export interface ReceiptProps {
  transactionId: string;
  cashierName: string;
  createdAt: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  receiptFooter: string;
  items: {
    name: string;
    unitName: string;
    qty: string;
    price: string;
    discount: string;
    subtotal: string;
  }[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  paid: string;
  change: string;
  payments: { method: string; amount: string }[];
  width: "80mm" | "58mm";
}

export const ReceiptDocument = React.forwardRef<HTMLDivElement, ReceiptProps>(({
  transactionId,
  cashierName,
  createdAt,
  storeName,
  storeAddress,
  storePhone,
  receiptFooter,
  items,
  subtotal,
  discountTotal,
  taxTotal,
  total,
  paid,
  change,
  payments,
  width = "58mm"
}, ref) => {
  const containerClass = width === "80mm" ? "kastur-receipt-80" : "kastur-receipt-58";

  return (
    <div ref={ref} className={`kastur-receipt ${containerClass}`}>
      <div className="kastur-receipt-header">
        <h2 className="kastur-receipt-title">{storeName}</h2>
        <p className="kastur-receipt-address">{storeAddress}</p>
        <p className="kastur-receipt-phone">Telp: {storePhone}</p>
      </div>

      <div className="kastur-receipt-divider" />
      <div className="kastur-receipt-info">
        <div className="kastur-receipt-info-row">
          <span>{formatDateTime(createdAt)}</span>
          <span>Kasir: {cashierName.split(" ")[0]}</span>
        </div>
        <div className="kastur-receipt-info-row">No: {transactionId}</div>
      </div>
      <div className="kastur-receipt-divider" />

      <div className="kastur-receipt-items">
        {items.map((item, index) => (
          <div key={`${item.name}-${index}`} className="kastur-receipt-item">
            <div className="kastur-receipt-item-name">{item.name}</div>
            <div className="kastur-receipt-item-row">
              <span>{formatQuantity(item.qty)} {item.unitName} x {formatRupiah(item.price)}</span>
              <span>{formatRupiah(item.subtotal)}</span>
            </div>
            {Number(item.discount) > 0 && (
              <div className="kastur-receipt-item-row">
                <span>Diskon item</span>
                <span>-{formatRupiah(item.discount)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="kastur-receipt-divider" />

      <div className="kastur-receipt-totals">
        <div className="kastur-receipt-totals-row">
          <span>Subtotal</span>
          <span>{formatRupiah(subtotal)}</span>
        </div>
        {Number(discountTotal) > 0 && (
          <div className="kastur-receipt-totals-row">
            <span>Diskon</span>
            <span>-{formatRupiah(discountTotal)}</span>
          </div>
        )}
        {Number(taxTotal) > 0 && (
          <div className="kastur-receipt-totals-row">
            <span>Pajak</span>
            <span>{formatRupiah(taxTotal)}</span>
          </div>
        )}
        <div className="kastur-receipt-totals-row kastur-receipt-total-bold">
          <span>Total</span>
          <span>{formatRupiah(total)}</span>
        </div>
        {payments.map((payment, index) => (
          <div key={`${payment.method}-${index}`} className="kastur-receipt-totals-row">
            <span>Bayar ({payment.method.toUpperCase()})</span>
            <span>{formatRupiah(payment.amount)}</span>
          </div>
        ))}
        <div className="kastur-receipt-totals-row">
          <span>Diterima</span>
          <span>{formatRupiah(paid)}</span>
        </div>
        <div className="kastur-receipt-totals-row">
          <span>Kembali</span>
          <span>{formatRupiah(change)}</span>
        </div>
      </div>

      <div className="kastur-receipt-footer">
        <p>{receiptFooter}</p>
      </div>
    </div>
  );
});

ReceiptDocument.displayName = "ReceiptDocument";
