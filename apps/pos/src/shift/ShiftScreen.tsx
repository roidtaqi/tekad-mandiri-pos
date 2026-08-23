import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { RecordCashMovementCommand } from "@kastur/contracts";
import type {
  LocalCashMovementRecord,
  LocalShiftClosingPreview,
  LocalShiftRecord,
} from "@kastur/local-db";
import {
  Alert,
  Button,
  Field,
  Heading,
  Input,
  Select,
  Surface,
  Textarea,
} from "@kastur/ui";

import { usePosRuntime, type PosRuntimeValue } from "../runtime/PosRuntimeProvider.js";
import type { PosOperationalContext } from "../runtime/types.js";
import { formatDateTime, formatMoney, userFacingError } from "../shared/format.js";

type ManualMovementType = RecordCashMovementCommand["movement_type"];

const movementLabels: Record<ManualMovementType, string> = {
  CASH_IN: "Kas Masuk",
  CASH_OUT: "Kas Keluar",
  SAFE_DROP: "Setor Brankas",
};

function allowedManualMovements(permissions: readonly string[]): ManualMovementType[] {
  const set = new Set(permissions);
  return [
    ...(set.has("cash.in") ? ["CASH_IN" as const] : []),
    ...(set.has("cash.out") ? ["CASH_OUT" as const] : []),
    ...(set.has("cash.safe_drop") ? ["SAFE_DROP" as const] : []),
  ];
}

function OpenShiftPanel({
  runtime,
  operational,
}: {
  readonly runtime: PosRuntimeValue;
  readonly operational: PosOperationalContext;
}) {
  const [openingCash, setOpeningCash] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canOpen = operational.auth.permissions.includes("shift.open");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await runtime.database.shifts.openShift({
        auth: operational.auth,
        device_id: runtime.deviceId,
        terminal_id: operational.terminal.id,
        opening_cash: openingCash,
        opened_at: new Date().toISOString(),
      });
      await runtime.refreshOperationalState();
      void runtime.runSync();
    } catch (shiftError: unknown) {
      setError(userFacingError(shiftError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface className="shift-open-panel" elevation={1} padding="spacious">
      <Heading level={2}>Buka Shift</Heading>
      <p>Terminal {operational.terminal.name} belum memiliki shift aktif untuk pengguna ini.</p>
      {error ? <Alert severity="CRITICAL" title="Shift belum dibuka" description={error} /> : null}
      {!canOpen ? (
        <Alert severity="WARNING" title="Izin tidak tersedia" description="Izin shift.open diperlukan." />
      ) : null}
      <form className="shift-form" onSubmit={(event) => void submit(event)}>
        <Field label="Kas awal" required>
          <Input
            inputMode="decimal"
            min="0"
            onChange={(event) => setOpeningCash(event.currentTarget.value)}
            value={openingCash}
          />
        </Field>
        <Button disabled={!canOpen} loading={saving} loadingLabel="Membuka shift" type="submit">
          Buka Shift Offline
        </Button>
      </form>
    </Surface>
  );
}

function ManualCashPanel({
  runtime,
  operational,
  shift,
  onRecorded,
}: {
  readonly runtime: PosRuntimeValue;
  readonly operational: PosOperationalContext;
  readonly shift: LocalShiftRecord;
  readonly onRecorded: () => Promise<void>;
}) {
  const options = useMemo(
    () => allowedManualMovements(operational.auth.permissions),
    [operational.auth.permissions],
  );
  const [movementType, setMovementType] = useState<ManualMovementType>(options[0] ?? "CASH_IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await runtime.database.cash.recordCashMovement(
        {
          shift_id: shift.shift_id,
          movement_type: movementType,
          amount,
          reason_code: reason,
          notes: notes.trim() === "" ? null : notes.trim(),
        },
        operational.auth,
        runtime.deviceId,
        new Date().toISOString(),
      );
      setAmount("");
      setReason("");
      setNotes("");
      await onRecorded();
      void runtime.runSync();
    } catch (movementError: unknown) {
      setError(userFacingError(movementError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface elevation={1} padding="default">
      <Heading level={2}>Pergerakan Kas Manual</Heading>
      {options.length === 0 ? (
        <Alert severity="INFO" title="Tidak ada tindakan kas" description="Tidak ada izin kas manual pada sesi ini." />
      ) : (
        <form className="shift-form" onSubmit={(event) => void submit(event)}>
          {error ? <div className="inline-error" role="alert">{error}</div> : null}
          <Field label="Jenis" required>
            <Select
              onChange={(event) => setMovementType(event.currentTarget.value as ManualMovementType)}
              value={movementType}
            >
              {options.map((option) => <option key={option} value={option}>{movementLabels[option]}</option>)}
            </Select>
          </Field>
          <Field label="Jumlah" required>
            <Input inputMode="decimal" onChange={(event) => setAmount(event.currentTarget.value)} value={amount} />
          </Field>
          <Field label="Alasan" required>
            <Input onChange={(event) => setReason(event.currentTarget.value)} value={reason} />
          </Field>
          <Field label="Catatan">
            <Textarea onChange={(event) => setNotes(event.currentTarget.value)} value={notes} />
          </Field>
          <Button loading={saving} loadingLabel="Menyimpan kas" type="submit">Simpan Pergerakan</Button>
        </form>
      )}
    </Surface>
  );
}

function BlindClosePanel({
  runtime,
  operational,
  shift,
}: {
  readonly runtime: PosRuntimeValue;
  readonly operational: PosOperationalContext;
  readonly shift: LocalShiftRecord;
}) {
  const [actualCash, setActualCash] = useState(shift.blind_actual_cash ?? "");
  const [preview, setPreview] = useState<LocalShiftClosingPreview | null>(null);
  const [varianceReason, setVarianceReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canClose = operational.auth.permissions.includes("shift.close");

  const submitBlindCount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const submitted = await runtime.database.cash.beginShiftClosing(
        shift.shift_id,
        actualCash,
        operational.auth,
        runtime.deviceId,
        new Date().toISOString(),
      );
      setPreview(submitted);
      await runtime.refreshOperationalState();
    } catch (previewError: unknown) {
      setError(userFacingError(previewError));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const lockedActualCash = shift.blind_actual_cash;
    if (
      shift.status !== "CLOSING" ||
      lockedActualCash === null ||
      lockedActualCash === undefined ||
      preview !== null
    ) {
      return;
    }
    setActualCash(lockedActualCash);
    void (async () => {
      try {
        const resumed = await runtime.database.cash.beginShiftClosing(
          shift.shift_id,
          lockedActualCash,
          operational.auth,
          runtime.deviceId,
          new Date().toISOString(),
        );
        setPreview(resumed);
      } catch (resumeError: unknown) {
        setError(userFacingError(resumeError));
      }
    })();
  }, [operational.auth, preview, runtime.database.cash, runtime.deviceId, shift]);

  const confirm = async () => {
    if (preview === null) return;
    setSaving(true);
    setError(null);
    try {
      await runtime.database.cash.completeShiftClosing(
        {
          shift_id: shift.shift_id,
          actual_cash: actualCash,
          variance_reason: varianceReason.trim() === "" ? null : varianceReason.trim(),
        },
        operational.auth,
        runtime.deviceId,
        new Date().toISOString(),
      );
      await runtime.refreshOperationalState();
      void runtime.runSync();
    } catch (closeError: unknown) {
      setError(userFacingError(closeError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface elevation={1} padding="default">
      <Heading level={2}>Tutup Shift</Heading>
      <p className="muted-copy">Hitung kas fisik terlebih dahulu. Nilai harapan baru ditampilkan setelah angka aktual dikunci.</p>
      {error ? <Alert severity="CRITICAL" title="Shift belum ditutup" description={error} /> : null}
      {preview === null ? (
        <form className="shift-form" onSubmit={(event) => void submitBlindCount(event)}>
          <Field label="Kas fisik aktual" required>
            <Input
              autoComplete="off"
              inputMode="decimal"
              onChange={(event) => setActualCash(event.currentTarget.value)}
              value={actualCash}
            />
          </Field>
          <Button
            disabled={!canClose}
            loading={saving}
            loadingLabel="Mengunci hitungan"
            type="submit"
          >
            Kirim Hitungan Aktual
          </Button>
        </form>
      ) : (
        <div className="closing-review">
          <dl>
            <div><dt>Aktual</dt><dd>{formatMoney(actualCash)}</dd></div>
            <div><dt>Harapan</dt><dd>{formatMoney(preview.expected_cash)}</dd></div>
            <div><dt>Selisih</dt><dd>{formatMoney(preview.variance)} · {preview.variance_type}</dd></div>
          </dl>
          <Field label="Alasan selisih" description="Isi bila ada konteks operasional yang perlu dicatat.">
            <Textarea onChange={(event) => setVarianceReason(event.currentTarget.value)} value={varianceReason} />
          </Field>
          <div className="closing-review__actions">
            <Button loading={saving} loadingLabel="Menutup shift" onClick={() => void confirm()}>
              Konfirmasi Tutup Shift
            </Button>
          </div>
        </div>
      )}
    </Surface>
  );
}

function ActiveShiftScreen({
  runtime,
  operational,
  shift,
}: {
  readonly runtime: PosRuntimeValue;
  readonly operational: PosOperationalContext;
  readonly shift: LocalShiftRecord;
}) {
  const [movements, setMovements] = useState<readonly LocalCashMovementRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    try {
      setMovements(await runtime.database.cash.getMovementsForShift(shift.shift_id));
      setError(null);
    } catch (movementError: unknown) {
      setError(userFacingError(movementError));
    }
  };
  useEffect(() => void refresh(), [shift.shift_id]);

  return (
    <>
      <Surface className="shift-summary" elevation={1} padding="default">
        <div><span>Nomor shift</span><strong>{shift.shift_number}</strong></div>
        <div><span>Dibuka</span><strong>{formatDateTime(shift.opened_at)}</strong></div>
        <div><span>Kas awal</span><strong>{formatMoney(shift.opening_cash)}</strong></div>
        <div><span>Status</span><strong>{shift.status}</strong></div>
      </Surface>
      {error ? <Alert severity="CRITICAL" title="Ledger kas belum terbaca" description={error} /> : null}
      <div className="shift-grid">
        {shift.status === "OPEN" ? (
          <ManualCashPanel
            onRecorded={refresh}
            operational={operational}
            runtime={runtime}
            shift={shift}
          />
        ) : (
          <Alert
            severity="INFO"
            title="Pergerakan kas dikunci"
            description="Shift sudah masuk fase penutupan; lanjutkan verifikasi kas fisik."
          />
        )}
        <BlindClosePanel
          operational={operational}
          runtime={runtime}
          shift={shift}
        />
      </div>
      <Surface elevation={1} padding="default">
        <Heading level={2}>Ledger Kas Shift</Heading>
        <div className="cash-movement-list">
          {movements.map((movement) => (
            <div className="cash-movement-row" key={movement.id}>
              <span>{movementLabels[movement.movement_type as ManualMovementType] ?? movement.movement_type}</span>
              <span>{formatDateTime(movement.occurred_at)}</span>
              <strong>{movement.direction === "OUT" ? "−" : "+"}{formatMoney(movement.amount)}</strong>
            </div>
          ))}
        </div>
      </Surface>
    </>
  );
}

export function ShiftScreen() {
  const runtime = usePosRuntime();
  const operational = runtime.operational;
  if (operational === null) return null;
  const ownedShift = runtime.activeShift?.cashier_user_id === operational.auth.user.id;
  return (
    <div className="shift-screen">
      <div className="screen-title-row">
        <div><span className="screen-eyebrow">Operasional Kas</span><Heading level={1}>Shift</Heading></div>
      </div>
      {runtime.activeShift !== null && !ownedShift ? (
        <Alert
          severity="WARNING"
          title="Shift dimiliki pengguna lain"
          description="Perangkat ini memiliki shift aktif dengan atribusi kasir lain. Tindakan kas dan penjualan diblokir untuk sesi ini."
        />
      ) : runtime.activeShift === null ? (
        <OpenShiftPanel operational={operational} runtime={runtime} />
      ) : (
        <ActiveShiftScreen operational={operational} runtime={runtime} shift={runtime.activeShift} />
      )}
    </div>
  );
}
