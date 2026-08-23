import type { CompletedSaleAggregate } from "@kastur/local-db";
import { Button, Heading, ReceiptDocument, Surface } from "@kastur/ui";

import type { PosOperationalContext } from "../runtime/types.js";
import { mapTransactionToReceipt } from "../receipt/receipt-mapper.js";
import { useReceiptPrinter } from "../receipt/use-receipt-printer.js";
import { formatMoney } from "../shared/format.js";

export function SaleComplete({
  aggregate,
  operational,
  onNewSale,
}: {
  readonly aggregate: CompletedSaleAggregate;
  readonly operational: PosOperationalContext;
  readonly onNewSale: () => void;
}) {
  const { receiptRef, print } = useReceiptPrinter();
  const receipt = mapTransactionToReceipt(
    aggregate,
    {
      name: operational.business.name,
      address: operational.location.name,
      phone: "-",
      footer: "Terima kasih telah berbelanja.",
      cashierName: operational.auth.user.display_name,
    },
    operational.settings.receipt_width,
  );
  const payment = aggregate.payments[0];

  return (
    <Surface className="sale-complete" elevation={1} padding="spacious">
      <div className="sale-complete__mark" aria-hidden="true">✓</div>
      <Heading level={1}>Transaksi Selesai</Heading>
      <p className="sale-complete__number">{aggregate.transaction.transaction_number}</p>
      <dl className="sale-complete__summary">
        <div><dt>Total</dt><dd>{formatMoney(aggregate.transaction.grand_total)}</dd></div>
        <div><dt>Diterima</dt><dd>{formatMoney(payment?.amount_tendered ?? aggregate.transaction.total_paid)}</dd></div>
        <div><dt>Kembali</dt><dd>{formatMoney(aggregate.transaction.change_amount)}</dd></div>
        <div><dt>Status sync</dt><dd>{aggregate.transaction.sync_status}</dd></div>
      </dl>
      <div className="sale-complete__actions">
        <Button onClick={() => print()} variant="secondary">Cetak Struk</Button>
        <Button onClick={onNewSale}>Transaksi Baru</Button>
      </div>
      <div className="receipt-print-host" aria-hidden="true">
        <ReceiptDocument ref={receiptRef} {...receipt} />
      </div>
    </Surface>
  );
}
