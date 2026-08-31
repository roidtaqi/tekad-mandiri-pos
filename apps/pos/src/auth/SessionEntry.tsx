import { useEffect, useState, type FormEvent } from "react";

import {
  Alert,
  Button,
  Field,
  Heading,
  Input,
  Surface,
  Text,
  Textarea,
} from "@kastur/ui";

import { usePosRuntime } from "../runtime/PosRuntimeProvider.js";

export function SessionEntry({ overlay = false }: { readonly overlay?: boolean }) {
  const runtime = usePosRuntime();
  const [bearer, setBearer] = useState("");
  const [terminalId, setTerminalId] = useState(runtime.terminalId);
  const [recoveryReason, setRecoveryReason] = useState("");

  useEffect(() => setTerminalId(runtime.terminalId), [runtime.terminalId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (runtime.recoveryRequired) {
      void runtime.recoverOutbox({ approverBearer: bearer, reason: recoveryReason });
    } else {
      void runtime.connect({ bearer, terminalId });
    }
  };

  return (
    <div className={overlay ? "pos-lock-overlay" : "session-page"} role={overlay ? "dialog" : undefined} aria-modal={overlay || undefined}>
      <Surface className="session-card" elevation={2} padding="spacious">
        <div className="session-brand">Kastur Retail System</div>
        <Heading level={1} size="display">Kastur POS</Heading>
        <Text tone="secondary">
          {overlay
            ? runtime.recoveryRequired
              ? "Perangkat telah dicabut. Fakta yang sudah tersimpan lokal hanya dapat diimpor dengan persetujuan Owner aktif."
              : `Terkunci untuk ${runtime.operational?.auth.user.display_name ?? "pengguna"}. Masukkan kembali sesi pribadi yang sama.`
            : "Masukkan sesi pengguna pribadi untuk menyiapkan terminal ini."}
        </Text>

        {runtime.error ? (
          <Alert severity="CRITICAL" title="Sesi belum dapat digunakan" description={runtime.error} />
        ) : null}

        <form className="session-form" onSubmit={submit}>
          <Field
            label={runtime.recoveryRequired ? "Sesi approver Owner" : "Sesi pengguna"}
            description={
              runtime.recoveryRequired
                ? "Digunakan hanya untuk permintaan recovery ini dan tidak pernah disimpan."
                : "Hanya disimpan selama tab ini aktif. Nilainya tidak masuk localStorage atau bundle aplikasi."
            }
            required
          >
            <Input
              autoComplete="off"
              autoFocus
              name="session-bearer"
              onChange={(event) => setBearer(event.currentTarget.value)}
              placeholder="Tempel secret sesi pribadi"
              spellCheck={false}
              type="password"
              value={bearer}
            />
          </Field>
          {runtime.recoveryRequired ? (
            <Field
              label="Alasan recovery"
              description="Wajib 10–500 karakter dan dicatat pada audit server."
              required
            >
              <Textarea
                name="recovery-reason"
                onChange={(event) => setRecoveryReason(event.currentTarget.value)}
                value={recoveryReason}
              />
            </Field>
          ) : (
            <Field
              label="ID terminal"
              description={`Perangkat lokal: ${runtime.deviceId}`}
              required
            >
              <Input
                name="terminal-id"
                onChange={(event) => setTerminalId(event.currentTarget.value)}
                placeholder="UUID terminal yang aktif"
                spellCheck={false}
                value={terminalId}
              />
            </Field>
          )}
          <Button
            fullWidth
            loading={runtime.status === "CONNECTING"}
            loadingLabel="Memverifikasi sesi"
            size="large"
            type="submit"
          >
            {runtime.recoveryRequired
              ? "Setujui dan Pulihkan Fakta"
              : overlay
                ? "Buka Kunci"
                : "Masuk dan Siapkan POS"}
          </Button>
          {overlay ? (
            <Button fullWidth onClick={runtime.signOut} variant="ghost">
              Keluar dari perangkat
            </Button>
          ) : null}
        </form>

        <Text size="caption" tone="muted">
          {runtime.recoveryRequired
            ? "Recovery hanya mengirim fakta bertanda tangan yang sudah ada; akses perangkat tidak diaktifkan kembali."
            : "Jika jaringan terputus, sesi yang sama dapat membuka cache izin sampai waktu izinnya berakhir."}
        </Text>
      </Surface>
    </div>
  );
}
