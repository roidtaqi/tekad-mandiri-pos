import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { CompletedSaleAggregate, LocalCompletedTransaction } from "@kastur/local-db";
import {
  Alert,
  Button,
  EmptyState,
  Heading,
  ReceiptDocument,
  Surface,
} from "@kastur/ui";

import { mapTransactionToReceipt } from "../receipt/receipt-mapper.js";
import { useReceiptPrinter } from "../receipt/use-receipt-printer.js";
import { usePosRuntime } from "../runtime/PosRuntimeProvider.js";
import { formatDateTime, formatMoney, userFacingError } from "../shared/format.js";

function TransactionDetail({
  aggregate,
  canReprint,
  onBack,
}: {
  readonly aggregate: CompletedSaleAggregate;
  readonly canReprint: boolean;
  readonly onBack: () => void;
}) {
  const runtime = usePosRuntime();
  const context = runtime.operational;
  const { receiptRef, print } = useReceiptPrinter();
  if (context === null) return null;
  const receipt = mapTransactionToReceipt(
    aggregate,
    {
      name: context.business.name,
      address: context.location.name,
      phone: "-",
      footer: "Terima kasih telah berbelanja.",
      cashierName: context.auth.user.display_name,
    },
    context.settings.receipt_width,
  );
  return (
    <Surface className="transaction-detail" elevation={1} padding="spacious">
      <div className="section-heading-row">
        <div>
          <span className="screen-eyebrow">Detail Transaksi</span>
          <Heading level={2}>{aggregate.transaction.transaction_number}</Heading>
        </div>
        <Button onClick={onBack} variant="ghost">Kembali</Button>
      </div>
      <dl className="transaction-detail__meta">
        <div><dt>Waktu</dt><dd>{formatDateTime(aggregate.transaction.occurred_at)}</dd></div>
        <div><dt>Total</dt><dd>{formatMoney(aggregate.transaction.grand_total)}</dd></div>
        <div><dt>Kembali</dt><dd>{formatMoney(aggregate.transaction.change_amount)}</dd></div>
        <div><dt>Status bisnis</dt><dd>{aggregate.transaction.status}</dd></div>
        <div><dt>Status sync</dt><dd>{aggregate.transaction.sync_status}</dd></div>
      </dl>
      <div className="transaction-items">
        {aggregate.items.map((item) => (
          <div key={item.transaction_item_id}>
            <span>{item.product_name_snapshot} · {item.quantity} {item.unit_code_snapshot}</span>
            <strong>{formatMoney(item.line_total)}</strong>
          </div>
        ))}
      </div>
      <Button disabled={!canReprint} onClick={() => print()} variant="secondary">
        Cetak Ulang Struk
      </Button>
      {!canReprint ? <p className="muted-copy">Izin receipt.reprint tidak tersedia.</p> : null}
      <div className="receipt-print-host" aria-hidden="true">
        <ReceiptDocument ref={receiptRef} {...receipt} />
      </div>
    </Surface>
  );
}

export function TransactionsScreen() {
  const runtime = usePosRuntime();
  const context = runtime.operational;
  const params = useParams<{ transactionId?: string }>();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<readonly LocalCompletedTransaction[]>([]);
  const [detail, setDetail] = useState<CompletedSaleAggregate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRead = context?.auth.permissions.includes("transaction.history.read") ?? false;

  useEffect(() => {
    if (context === null || !canRead) return;
    void runtime.database.sales
      .listCompletedTransactions(context.business.id, 100)
      .then((values) => {
        setTransactions(values.filter((transaction) => transaction.created_by === context.auth.user.id));
        setError(null);
      })
      .catch((historyError: unknown) => setError(userFacingError(historyError)));
  }, [canRead, context, runtime.database.sales, runtime.sync.pendingCount]);

  useEffect(() => {
    if (params.transactionId === undefined || context === null || !canRead) {
      setDetail(null);
      return;
    }
    void runtime.database.sales
      .getCompletedSale(params.transactionId)
      .then((aggregate) => {
        if (aggregate.transaction.created_by !== context.auth.user.id) {
          throw new Error("Transaksi ini bukan milik kasir aktif.");
        }
        setDetail(aggregate);
        setError(null);
      })
      .catch((detailError: unknown) => setError(userFacingError(detailError)));
  }, [canRead, context, params.transactionId, runtime.database.sales]);

  if (context === null) return null;
  if (!canRead) {
    return <Alert severity="WARNING" title="Riwayat tidak tersedia" description="Izin transaction.history.read diperlukan." />;
  }
  if (detail !== null) {
    return (
      <TransactionDetail
        aggregate={detail}
        canReprint={context.auth.permissions.includes("receipt.reprint")}
        onBack={() => navigate("/transaksi")}
      />
    );
  }

  return (
    <div className="transactions-screen">
      <div className="screen-title-row">
        <div><span className="screen-eyebrow">Riwayat Lokal</span><Heading level={1}>Transaksi</Heading></div>
      </div>
      {error ? <Alert severity="CRITICAL" title="Riwayat belum terbaca" description={error} /> : null}
      {transactions.length === 0 ? (
        <EmptyState title="Belum ada transaksi" description="Transaksi selesai milik kasir ini akan tampil di sini, termasuk saat offline." />
      ) : (
        <Surface elevation={1} padding="none">
          <div className="transaction-list" role="list">
            {transactions.map((transaction) => (
              <button
                className="transaction-row"
                key={transaction.transaction_id}
                onClick={() => navigate(`/transaksi/${transaction.transaction_id}`)}
                role="listitem"
                type="button"
              >
                <span><strong>{transaction.transaction_number}</strong><small>{formatDateTime(transaction.occurred_at)}</small></span>
                <span><strong>{formatMoney(transaction.grand_total)}</strong><small>{transaction.sync_status}</small></span>
              </button>
            ))}
          </div>
        </Surface>
      )}
    </div>
  );
}
