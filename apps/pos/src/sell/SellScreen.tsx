import { useCallback, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import type { CompletedSaleAggregate, ProductLookupResult } from "@kastur/local-db";
import { Alert, Button, Field, Heading, Input, Surface } from "@kastur/ui";

import { useCashPayment } from "../payment/use-cash-payment.js";
import { usePosRuntime, type PosRuntimeValue } from "../runtime/PosRuntimeProvider.js";
import type { PosOperationalContext } from "../runtime/types.js";
import { useScannerCapture, type ScannerCaptureResult } from "../scanner/use-scanner-capture.js";
import { formatMoney, userFacingError } from "../shared/format.js";
import { CartPanel } from "./CartPanel.js";
import { ProductSearch } from "./ProductSearch.js";
import { SaleComplete } from "./SaleComplete.js";
import { useSellSession } from "./SellSession.js";

function SellWorkspace({
  runtime,
  operational,
}: {
  readonly runtime: PosRuntimeValue;
  readonly operational: PosOperationalContext;
}) {
  const cart = useSellSession();
  const cash = useCashPayment(cart.totals.grand_total);
  const [feedback, setFeedback] = useState("Scanner siap.");
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState<CompletedSaleAggregate | null>(null);
  const scannerReadyRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);

  const restoreScannerFocus = useCallback(() => {
    window.requestAnimationFrame(() => scannerReadyRef.current?.focus());
  }, []);

  const lookupBarcode = useCallback(
    (barcode: string) => runtime.database.productLookup.findByBarcode(
      operational.business.id,
      barcode,
    ),
    [operational.business.id, runtime.database.productLookup],
  );

  const handleScanResult = useCallback(
    (result: ScannerCaptureResult<ProductLookupResult>) => {
      if (result.type === "SUCCESS") {
        cart.addScannedItem(result);
        setFeedback(`${result.payload.product_name} ditambahkan.`);
        setError(null);
      } else {
        setFeedback(`Barcode ${result.barcode} tidak ditemukan.`);
      }
      restoreScannerFocus();
    },
    [cart.addScannedItem, restoreScannerFocus],
  );

  useScannerCapture({
    onLookup: lookupBarcode,
    onResult: handleScanResult,
    enabled:
      runtime.status === "READY" &&
      runtime.activeShift?.status === "OPEN" &&
      runtime.activeShift.cashier_user_id === operational.auth.user.id &&
      completed === null &&
      !completing,
  });

  const addSearchResult = (product: ProductLookupResult) => {
    try {
      cart.addScannedItem({ type: "SUCCESS", barcode: product.barcode ?? product.sku, payload: product });
      setFeedback(`${product.product_name} ditambahkan.`);
      setError(null);
    } catch (addError: unknown) {
      setError(userFacingError(addError));
    }
  };

  const completeSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || cash.evaluation.status !== "SETTLED") return;
    if (runtime.activeShift?.status !== "OPEN") {
      setError("Buka shift sebelum menyelesaikan penjualan.");
      return;
    }
    submittingRef.current = true;
    setCompleting(true);
    setError(null);
    try {
      const result = await runtime.database.sales.completeSale({
        auth: operational.auth,
        device_id: runtime.deviceId,
        command_id: crypto.randomUUID(),
        occurred_at: new Date().toISOString(),
        cart: cart.cart,
        amount_tendered: cash.amountTenderedInput,
      });
      const aggregate = await runtime.database.sales.getCompletedSale(result.transaction_id);
      setCompleted(aggregate);
      cart.clear();
      cash.resetCashPayment();
      await runtime.refreshOperationalState();
      void runtime.runSync();
    } catch (completionError: unknown) {
      setError(userFacingError(completionError));
    } finally {
      submittingRef.current = false;
      setCompleting(false);
    }
  };

  if (completed !== null) {
    return (
      <SaleComplete
        aggregate={completed}
        onNewSale={() => {
          setCompleted(null);
          setFeedback("Scanner siap.");
          restoreScannerFocus();
        }}
        operational={operational}
      />
    );
  }

  const currency = operational.business.currency_code;
  const shiftOpen =
    runtime.activeShift?.status === "OPEN" &&
    runtime.activeShift.cashier_user_id === operational.auth.user.id;
  return (
    <div className="sell-screen">
      <div className="screen-title-row">
        <div>
          <span className="screen-eyebrow">Penjualan</span>
          <Heading level={1}>Kasir</Heading>
        </div>
        <div
          className="scanner-ready"
          ref={scannerReadyRef}
          tabIndex={-1}
          aria-label="Area tangkap scanner"
        >
          <span className="scanner-ready__dot" /> {feedback}
        </div>
      </div>

      {!shiftOpen ? (
        <Alert
          severity="WARNING"
          title="Shift aktif diperlukan"
          description={
            runtime.activeShift?.status === "OPEN"
              ? "Perangkat ini masih terikat ke shift pengguna lain. Masuk sebagai pemilik shift atau selesaikan melalui prosedur berwenang."
              : "Keranjang dapat disiapkan, tetapi transaksi hanya dapat diselesaikan setelah shift dibuka."
          }
          actions={<Link className="inline-link" to="/shift">Buka halaman Shift</Link>}
        />
      ) : null}
      {operational.source === "OFFLINE_CACHE" ? (
        <Alert
          severity="INFO"
          title="Mode offline"
          description={`Izin lokal berlaku sampai ${new Date(operational.auth.offline_valid_until).toLocaleString("id-ID")}.`}
        />
      ) : null}
      {error ? <Alert severity="CRITICAL" title="Transaksi belum selesai" description={error} /> : null}

      <div className="sell-layout">
        <Surface className="sell-layout__catalog" elevation={1} padding="default">
          <ProductSearch
            businessId={operational.business.id}
            currency={currency}
            lookup={runtime.database.productLookup}
            onAdd={addSearchResult}
            onFinished={restoreScannerFocus}
          />
        </Surface>
        <div className="sell-layout__checkout">
          <Surface elevation={1} padding="default">
            <CartPanel
              cart={cart.cart}
              currency={currency}
              onChangeQuantity={cart.changeQuantity}
              onClear={cart.clear}
              onRemove={cart.remove}
              totals={cart.totals}
            />
          </Surface>
          <Surface elevation={1} padding="default">
            <form className="cash-payment" onSubmit={(event) => void completeSale(event)}>
              <div className="section-heading-row">
                <h2>Pembayaran Tunai</h2>
                <Button
                  disabled={cart.cart.lines.length === 0}
                  onClick={cash.useExactCash}
                  size="compact"
                  variant="secondary"
                >
                  Uang Pas
                </Button>
              </div>
              <Field label="Uang diterima" required>
                <Input
                  inputMode="decimal"
                  onChange={(event) => cash.setAmountTendered(event.currentTarget.value)}
                  value={cash.amountTenderedInput}
                />
              </Field>
              <div className="cash-payment__settlement">
                <span>{cash.evaluation.status === "SETTLED" ? "Kembalian" : "Kurang"}</span>
                <strong>
                  {formatMoney(
                    cash.evaluation.status === "SETTLED"
                      ? cash.evaluation.change_due
                      : cash.evaluation.remaining_due,
                    currency,
                  )}
                </strong>
              </div>
              <Button
                disabled={
                  !shiftOpen ||
                  cart.cart.lines.length === 0 ||
                  cash.evaluation.status !== "SETTLED"
                }
                fullWidth
                loading={completing}
                loadingLabel="Menyimpan transaksi"
                size="large"
                type="submit"
              >
                Selesaikan · {formatMoney(cart.totals.grand_total, currency)}
              </Button>
            </form>
          </Surface>
        </div>
      </div>
    </div>
  );
}

export function SellScreen() {
  const runtime = usePosRuntime();
  const operational = runtime.operational;
  return operational === null
    ? null
    : <SellWorkspace operational={operational} runtime={runtime} />;
}
