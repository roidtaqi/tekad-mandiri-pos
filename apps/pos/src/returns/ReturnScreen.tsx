import { useMemo, useRef, useState, type FormEvent } from "react";

import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Heading,
  Input,
  Select,
  Surface,
  Textarea,
} from "@kastur/ui";

import { usePosRuntime } from "../runtime/PosRuntimeProvider.js";
import { formatDateTime, formatMoney, userFacingError } from "../shared/format.js";
import {
  calculateHistoricalReturnAmount,
  isFullReturn,
} from "./return-calculation.js";
import type {
  CompleteReturnOnlineResult,
  CompleteReturnPayload,
  ReturnableSaleDetail,
  ReturnDisposition,
} from "./return-api.js";

interface ReturnLineDraft {
  readonly return_item_id: string;
  readonly selected: boolean;
  readonly quantity: string;
  readonly reason: string;
  readonly disposition: ReturnDisposition | "";
  readonly conditionNotes: string;
}

interface ReturnCommandIdentity {
  readonly commandId: string;
  readonly correlationId: string;
  readonly returnId: string;
  readonly returnNumber: string;
  readonly refundId: string;
  readonly refundNumber: string;
  readonly occurredAt: string;
}

function commandIdentity(): ReturnCommandIdentity {
  const returnId = crypto.randomUUID();
  const refundId = crypto.randomUUID();
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  return {
    commandId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    returnId,
    returnNumber: `RET-${date}-${returnId.slice(0, 8).toUpperCase()}`,
    refundId,
    refundNumber: `RFD-${date}-${refundId.slice(0, 8).toUpperCase()}`,
    occurredAt: new Date().toISOString(),
  };
}

function initialDraft(aggregate: ReturnableSaleDetail): Record<string, ReturnLineDraft> {
  return Object.fromEntries(
    aggregate.items.map((item) => [
      item.transaction_item_id,
      {
        return_item_id: crypto.randomUUID(),
        selected: false,
        quantity: "1",
        reason: "",
        disposition: "",
        conditionNotes: "",
      } satisfies ReturnLineDraft,
    ]),
  );
}

function ReturnResult({
  result,
  onDone,
}: {
  readonly result: CompleteReturnOnlineResult;
  readonly onDone: () => void;
}) {
  return (
    <Surface className="return-result" elevation={1} padding="spacious">
      <div className="sale-complete__mark" aria-hidden="true">✓</div>
      <Heading level={1}>Return Selesai</Heading>
      <dl className="transaction-detail__meta">
        <div><dt>Status Return</dt><dd>{result.return_status}</dd></div>
        <div><dt>Status Refund</dt><dd>{result.refund_status}</dd></div>
        <div><dt>Return ID</dt><dd>{result.return_id.slice(0, 13)}…</dd></div>
        <div><dt>Idempotensi</dt><dd>{result.replayed ? "Replay aman" : "Command baru"}</dd></div>
      </dl>
      {result.warnings.length > 0 ? (
        <Alert
          severity="REVIEW_REQUIRED"
          title="Perlu tindak lanjut"
          description={result.warnings.join(", ")}
        />
      ) : null}
      <Button onClick={onDone}>Cari Transaksi Lain</Button>
    </Surface>
  );
}

export function ReturnScreen() {
  const runtime = usePosRuntime();
  const context = runtime.operational;
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<readonly ReturnableSaleDetail[]>([]);
  const [selected, setSelected] = useState<ReturnableSaleDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReturnLineDraft>>({});
  const [identity, setIdentity] = useState<ReturnCommandIdentity>(commandIdentity);
  const [notes, setNotes] = useState("");
  const [pendingPayload, setPendingPayload] = useState<CompleteReturnPayload | null>(null);
  const [result, setResult] = useState<CompleteReturnOnlineResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const selectedLines = useMemo(() => {
    if (selected === null) return [];
    return selected.items.flatMap((item) => {
      const draft = drafts[item.transaction_item_id];
      return draft?.selected === true ? [{ item, draft }] : [];
    });
  }, [drafts, selected]);

  const calculatedAmount = useMemo(() => {
    try {
      return calculateHistoricalReturnAmount(
        selectedLines.map(({ item, draft }) => ({
          line_total: item.line_total,
          maximum_return_quantity: item.remaining_returnable_qty,
          sold_quantity: item.quantity,
          return_quantity: draft.quantity,
        })),
      );
    } catch {
      return null;
    }
  }, [selectedLines]);

  if (context === null) return null;
  const permissions = new Set(context.auth.permissions);
  const canRead = permissions.has("return.read");
  const canProcess = permissions.has("return.process") && permissions.has("refund.process");
  const shiftOwned =
    runtime.activeShift?.status === "OPEN" &&
    runtime.activeShift.cashier_user_id === context.auth.user.id;

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!runtime.online) {
      setError("Pencarian dan pemrosesan Return ini memerlukan koneksi online.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      setMatches(await runtime.searchReturnableSales(query));
    } catch (searchError: unknown) {
      setError(userFacingError(searchError));
    } finally {
      setSearching(false);
    }
  };

  const chooseTransaction = (aggregate: ReturnableSaleDetail) => {
    setSelected(aggregate);
    setDrafts(initialDraft(aggregate));
    setIdentity(commandIdentity());
    setPendingPayload(null);
    setNotes("");
    setError(null);
  };

  const updateDraft = (
    itemId: string,
    update: Partial<Omit<ReturnLineDraft, "return_item_id">>,
  ) => {
    setDrafts((current) => {
      const existing = current[itemId];
      return existing === undefined
        ? current
        : { ...current, [itemId]: { ...existing, ...update } };
    });
  };

  const buildPayload = (): CompleteReturnPayload => {
    if (selected === null || runtime.activeShift === null) {
      throw new Error("Transaksi dan shift aktif diperlukan.");
    }
    if (selectedLines.length === 0 || calculatedAmount === null) {
      throw new Error("Pilih item dengan jumlah Return yang valid.");
    }
    for (const { draft } of selectedLines) {
      if (draft.reason.trim() === "" || draft.disposition === "") {
        throw new Error("Reason dan disposition wajib dipilih untuk setiap item.");
      }
    }
    const payment = selected.payments.find((candidate) => candidate.status === "COMPLETED");
    if (payment === undefined) throw new Error("Pembayaran asli tidak tersedia.");
    const eligibleItems = selected.items.filter(
      (item) => !/^0(?:\.0+)?$/u.test(item.remaining_returnable_qty),
    );
    const full = isFullReturn(
      eligibleItems.length,
      selectedLines.map(({ item, draft }) => ({
        sold_quantity: item.remaining_returnable_qty,
        return_quantity: draft.quantity,
      })),
    );
    return {
      return_id: identity.returnId,
      return_number: identity.returnNumber,
      original_transaction_id: selected.transaction.transaction_id,
      return_type: full ? "FULL" : "PARTIAL",
      receipt_mode: "TRANSACTION_LINKED",
      shift_id: runtime.activeShift.shift_id,
      terminal_id: context.terminal.id,
      occurred_at: identity.occurredAt,
      notes: notes.trim() === "" ? null : notes.trim(),
      items: selectedLines.map(({ item, draft }) => ({
        return_item_id: draft.return_item_id,
        original_transaction_item_id: item.transaction_item_id,
        product_id: item.product_id,
        product_unit_id: item.product_unit_id,
        conversion_snapshot: item.conversion_snapshot,
        return_qty: draft.quantity,
        reason_code: draft.reason.trim(),
        disposition: draft.disposition as ReturnDisposition,
        condition_notes: draft.conditionNotes.trim() === "" ? null : draft.conditionNotes.trim(),
      })),
      refund: {
        refund_id: identity.refundId,
        refund_number: identity.refundNumber,
        original_payment_id: payment.payment_id,
        payment_method_id: payment.payment_method_id,
        amount: calculatedAmount,
        override_method: false,
        override_amount: false,
        override_reason: null,
        external_reference: null,
      },
    };
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || !canProcess || !shiftOwned || !runtime.online) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const payload = pendingPayload ?? buildPayload();
      if (pendingPayload === null) setPendingPayload(payload);
      const completed = await runtime.completeReturn({
        commandId: identity.commandId,
        correlationId: identity.correlationId,
        payload,
      });
      setResult(completed);
      await runtime.refreshOperationalState();
      void runtime.runSync();
    } catch (submitError: unknown) {
      setError(
        submitError instanceof TypeError
          ? "Hasil jaringan tidak diketahui. Data command dipertahankan; tekan Coba Lagi agar server memakai idempotency key yang sama."
          : userFacingError(submitError),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const resetAttempt = () => {
    if (selected === null) return;
    setIdentity(commandIdentity());
    setDrafts(initialDraft(selected));
    setPendingPayload(null);
    setError(null);
  };

  if (!canRead) {
    return <Alert severity="WARNING" title="Retur tidak tersedia" description="Izin return.read diperlukan." />;
  }
  if (result !== null) {
    return <ReturnResult result={result} onDone={() => {
      setResult(null);
      setSelected(null);
      setMatches([]);
      setQuery("");
    }} />;
  }

  return (
    <div className="return-screen">
      <div className="screen-title-row">
        <div><span className="screen-eyebrow">Online Authoritative</span><Heading level={1}>Retur</Heading></div>
      </div>
      {!runtime.online ? (
        <Alert severity="WARNING" title="Retur offline tidak diaktifkan" description="Penjualan offline tetap tersedia, tetapi Return/Refund ini dikirim langsung ke server agar quantity, historical value, dan refund tervalidasi." />
      ) : null}
      {!canProcess ? (
        <Alert severity="WARNING" title="Izin proses tidak tersedia" description="Izin return.process dan refund.process diperlukan." />
      ) : null}
      {!shiftOwned ? (
        <Alert severity="WARNING" title="Shift aktif diperlukan" description="Refund tunai memakai shift OPEN milik kasir aktif pada terminal ini." />
      ) : null}
      {error ? <Alert severity="CRITICAL" title="Return belum selesai" description={error} /> : null}

      <Surface elevation={1} padding="default">
        <form className="return-search" onSubmit={(event) => void search(event)}>
          <Field label="Cari transaksi" description="Nomor transaksi atau ID transaksi pada server Business ini.">
            <Input onChange={(event) => setQuery(event.currentTarget.value)} value={query} />
          </Field>
          <Button disabled={!runtime.online} loading={searching} loadingLabel="Mencari" type="submit">Cari</Button>
        </form>
        {matches.length === 0 ? (
          <EmptyState title="Belum ada hasil" description="Pencarian online mencakup transaksi dari terminal lain pada lokasi ini." />
        ) : (
          <div className="return-search-results">
            {matches.map((aggregate) => (
              <button
                className="transaction-row"
                key={aggregate.transaction.transaction_id}
                onClick={() => chooseTransaction(aggregate)}
                type="button"
              >
                <span><strong>{aggregate.transaction.transaction_number}</strong><small>{formatDateTime(aggregate.transaction.occurred_at)} · {aggregate.items.length} item</small></span>
                <span><strong>{formatMoney(aggregate.transaction.grand_total)}</strong><small>Server authoritative</small></span>
              </button>
            ))}
          </div>
        )}
      </Surface>

      {selected !== null ? (
        <Surface elevation={1} padding="default">
          <form className="return-form" onSubmit={(event) => void submit(event)}>
            <div className="section-heading-row">
              <div><span className="screen-eyebrow">Struk Dipilih</span><Heading level={2}>{selected.transaction.transaction_number}</Heading></div>
              <strong>{formatMoney(selected.transaction.grand_total)}</strong>
            </div>
            <div className="return-lines">
              {selected.items.map((item) => {
                const draft = drafts[item.transaction_item_id];
                if (draft === undefined) return null;
                return (
                  <article className="return-line" key={item.transaction_item_id}>
                    <Checkbox
                      checked={draft.selected}
                      disabled={pendingPayload !== null || /^0(?:\.0+)?$/u.test(item.remaining_returnable_qty)}
                      label={`${item.product_name_snapshot} · terjual ${item.quantity}; sisa ${item.remaining_returnable_qty} ${item.unit_code_snapshot}`}
                      onChange={(event) => updateDraft(item.transaction_item_id, { selected: event.currentTarget.checked })}
                    />
                    {draft.selected ? (
                      <div className="return-line__controls">
                        <Field label="Qty retur" required>
                          <Input disabled={pendingPayload !== null} inputMode="decimal" onChange={(event) => updateDraft(item.transaction_item_id, { quantity: event.currentTarget.value })} value={draft.quantity} />
                        </Field>
                        <Field label="Reason code" required>
                          <Input disabled={pendingPayload !== null} onChange={(event) => updateDraft(item.transaction_item_id, { reason: event.currentTarget.value })} placeholder="Contoh: DAMAGED" value={draft.reason} />
                        </Field>
                        <Field label="Disposition" required>
                          <Select disabled={pendingPayload !== null} onChange={(event) => updateDraft(item.transaction_item_id, { disposition: event.currentTarget.value as ReturnDisposition | "" })} value={draft.disposition}>
                            <option value="">Pilih…</option>
                            <option value="RESTOCK">Kembali ke stok jual</option>
                            <option value="NOT_RESTOCKED">Tidak kembali ke stok</option>
                          </Select>
                        </Field>
                        <Field label="Kondisi / catatan item">
                          <Input disabled={pendingPayload !== null} onChange={(event) => updateDraft(item.transaction_item_id, { conditionNotes: event.currentTarget.value })} value={draft.conditionNotes} />
                        </Field>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <Field label="Catatan Return">
              <Textarea disabled={pendingPayload !== null} onChange={(event) => setNotes(event.currentTarget.value)} value={notes} />
            </Field>
            <div className="return-total"><span>Refund historis</span><strong>{calculatedAmount === null ? "—" : formatMoney(calculatedAmount)}</strong></div>
            <p className="muted-copy">Server menghitung ulang historical effective amount, sisa quantity, metode refund, dan batas refund sebelum commit.</p>
            <div className="return-actions">
              {pendingPayload !== null ? (
                <Button onClick={resetAttempt} variant="secondary">Ubah Data (Command Baru)</Button>
              ) : null}
              <Button
                disabled={!runtime.online || !canProcess || !shiftOwned || calculatedAmount === null}
                loading={submitting}
                loadingLabel="Memproses Return"
                type="submit"
              >
                {pendingPayload === null ? "Proses Return & Refund" : "Coba Lagi Command yang Sama"}
              </Button>
            </div>
          </form>
        </Surface>
      ) : null}
    </div>
  );
}
