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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terminalId, setTerminalId] = useState(runtime.terminalId);
  const [recoveryReason, setRecoveryReason] = useState("");

  useEffect(() => setTerminalId(runtime.terminalId), [runtime.terminalId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (runtime.recoveryRequired) {
      void runtime.recoverOutbox({
        approverEmail: email.trim(),
        approverPassword: password,
        reason: recoveryReason,
      });
    } else if (overlay) {
      // In lock overlay, unlock with password or session
      void runtime.connect({
        bearer: password,
        email: email.trim() || undefined,
        password,
        terminalId: runtime.terminalId || undefined,
      });
    } else {
      void runtime.connect({
        email: email.trim() || undefined,
        password,
        terminalId: terminalId.trim() || undefined,
      });
    }
  };

  if (overlay && runtime.recoveryRequired) {
    return (
      <div aria-modal="true" className="pos-lock-overlay" role="dialog">
        <Surface className="session-card" elevation={2} padding="spacious">
          <div className="session-brand">Kastur Retail System</div>
          <Heading level={1} size="display">Persetujuan Owner Diperlukan</Heading>
          <Text tone="secondary">
            Perangkat ini memerlukan otorisasi Owner aktif untuk memulihkan transaksi lokal yang belum terkirim ke server.
          </Text>

          {runtime.error ? (
            <Alert description={runtime.error} severity="CRITICAL" title="Otorisasi belum berhasil" />
          ) : null}

          <form className="session-form" onSubmit={submit}>
            <Field label="Email Owner" required>
              <Input
                autoComplete="email"
                autoFocus
                name="approver-email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                placeholder="owner@kastur.local"
                required
                type="email"
                value={email}
              />
            </Field>

            <Field label="Password Owner" required>
              <Input
                autoComplete="current-password"
                name="approver-password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder="••••••••"
                required
                type="password"
                value={password}
              />
            </Field>

            <Field
              description="Wajib 10–500 karakter dan dicatat pada audit server."
              label="Alasan Recovery"
              required
            >
              <Textarea
                name="recovery-reason"
                onChange={(event) => setRecoveryReason(event.currentTarget.value)}
                placeholder="Jelaskan alasan pemulihan transaksi lokal..."
                required
                value={recoveryReason}
              />
            </Field>

            <Button
              fullWidth
              loading={runtime.status === "CONNECTING"}
              loadingLabel="Memproses otorisasi"
              size="large"
              type="submit"
            >
              Setujui & Pulihkan Fakta
            </Button>
            <Button fullWidth onClick={runtime.signOut} variant="ghost">
              Keluar dari perangkat
            </Button>
          </form>
        </Surface>
      </div>
    );
  }

  if (overlay) {
    return (
      <div aria-modal="true" className="pos-lock-overlay" role="dialog">
        <Surface className="session-card" elevation={2} padding="spacious">
          <div className="session-brand">Kastur Retail System</div>
          <Heading level={1} size="display">POS Terkunci</Heading>
          <Text tone="secondary">
            Terkunci untuk {runtime.operational?.auth.user.display_name ?? "Kasir"}. Masukkan password untuk membuka kunci.
          </Text>

          {runtime.error ? (
            <Alert description={runtime.error} severity="CRITICAL" title="Gagal membuka kunci" />
          ) : null}

          <form className="session-form" onSubmit={submit}>
            <Field label="Password Akun" required>
              <Input
                autoComplete="current-password"
                autoFocus
                name="lock-password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder="••••••••"
                required
                type="password"
                value={password}
              />
            </Field>

            <Button
              fullWidth
              loading={runtime.status === "CONNECTING"}
              loadingLabel="Membuka kunci"
              size="large"
              type="submit"
            >
              Buka Kunci
            </Button>
            <Button fullWidth onClick={runtime.signOut} variant="ghost">
              Keluar dari perangkat
            </Button>
          </form>
        </Surface>
      </div>
    );
  }

  return (
    <div className="session-page">
      <Surface className="session-card" elevation={2} padding="spacious">
        <div className="session-brand">Kastur Retail System</div>
        <Heading level={1} size="display">Kastur POS</Heading>
        <Text tone="secondary">
          Masukkan email dan password akun Anda untuk menyiapkan dan membuka terminal kasir.
        </Text>

        {runtime.error ? (
          <Alert description={runtime.error} severity="CRITICAL" title="Gagal Masuk POS" />
        ) : null}

        <form className="session-form" onSubmit={submit}>
          <Field label="Email" required>
            <Input
              autoComplete="email"
              autoFocus
              name="email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="kasir@kastur.local"
              required
              spellCheck={false}
              type="email"
              value={email}
            />
          </Field>

          <Field label="Password" required>
            <Input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="••••••••"
              required
              spellCheck={false}
              type="password"
              value={password}
            />
          </Field>

          <Button
            fullWidth
            loading={runtime.status === "CONNECTING"}
            loadingLabel="Menghubungkan ke POS"
            size="large"
            type="submit"
          >
            Masuk dan Siapkan POS
          </Button>
        </form>

        <Text size="caption" tone="muted">
          Data offline dan otorisasi kasir akan disimpan dengan aman di perangkat lokal setelah login pertama berhasil.
        </Text>
      </Surface>
    </div>
  );
}
