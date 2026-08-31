import { useState, type FormEvent } from "react";

import {
  Alert,
  Button,
  Field,
  Heading,
  Input,
  Radio,
  RadioGroup,
  Surface,
  Text,
  Textarea,
} from "@kastur/ui";

import {
  fetchAvailableTerminals,
  loginPosApi,
  type AvailableTerminal,
} from "../runtime/auth-api.js";
import { readPosRuntimeConfig } from "../runtime/config.js";
import { usePosRuntime } from "../runtime/PosRuntimeProvider.js";

type OnboardingStep = "CREDENTIALS" | "SELECT_TERMINAL";

export function SessionEntry({ overlay = false }: { readonly overlay?: boolean }) {
  const runtime = usePosRuntime();
  const [step, setStep] = useState<OnboardingStep>("CREDENTIALS");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sessionSecret, setSessionSecret] = useState("");
  const [availableTerminals, setAvailableTerminals] = useState<readonly AvailableTerminal[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [recoveryReason, setRecoveryReason] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const errorMessage = localError ?? runtime.error;
  const isLoading = localLoading || runtime.status === "CONNECTING";

  const submitUnlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runtime.unlock({ password });
  };

  const submitRecovery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runtime.recoverOutbox({
      approverEmail: email.trim(),
      approverPassword: password,
      reason: recoveryReason,
    });
  };

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalLoading(true);
    setLocalError(null);

    const config = readPosRuntimeConfig();
    try {
      const loginResult = await loginPosApi(
        config.apiBaseUrl,
        email.trim(),
        password,
      );

      const terminals = await fetchAvailableTerminals(
        config.apiBaseUrl,
        loginResult.session_secret,
      );

      const firstTerminal = terminals[0];
      if (firstTerminal === undefined || terminals.length === 0) {
        setLocalError(
          "Tidak ada terminal kasir aktif yang terdaftar untuk bisnis ini. Hubungi administrator.",
        );
        return;
      }

      if (terminals.length === 1) {
        await runtime.connect({
          bearer: loginResult.session_secret,
          terminalId: firstTerminal.id,
        });
        return;
      }

      setSessionSecret(loginResult.session_secret);
      setAvailableTerminals(terminals);
      setSelectedTerminalId("");
      setStep("SELECT_TERMINAL");
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Gagal masuk ke POS.");
    } finally {
      setLocalLoading(false);
    }
  };

  const submitTerminalChoice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sessionSecret && selectedTerminalId) {
      void runtime.connect({
        bearer: sessionSecret,
        terminalId: selectedTerminalId,
      });
    }
  };

  if (overlay && runtime.recoveryRequired) {
    return (
      <div aria-modal="true" className="pos-lock-overlay" role="dialog">
        <Surface className="session-card" elevation={2} padding="spacious">
          <div className="session-brand">Tekad Mandiri</div>
          <Heading level={1} size="display">Persetujuan Owner Diperlukan</Heading>
          <Text tone="secondary">
            Perangkat ini memerlukan otorisasi Owner aktif untuk memulihkan transaksi lokal yang belum terkirim ke server.
          </Text>

          {errorMessage !== null ? (
            <Alert description={errorMessage} severity="CRITICAL" title="Otorisasi belum berhasil" />
          ) : null}

          <form className="session-form" onSubmit={submitRecovery}>
            <Field label="Email Owner" required>
              <Input
                autoComplete="email"
                autoFocus
                name="approver-email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                placeholder="owner@tekadmandiri.local"
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
              loading={isLoading}
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
          <div className="session-brand">Tekad Mandiri</div>
          <Heading level={1} size="display">POS Terkunci</Heading>
          <Text tone="secondary">
            Terkunci untuk {runtime.operational?.auth.user.display_name ?? "Kasir"}. Masukkan password akun untuk membuka kunci.
          </Text>

          {errorMessage !== null ? (
            <Alert description={errorMessage} severity="CRITICAL" title="Gagal membuka kunci" />
          ) : null}

          <form className="session-form" onSubmit={submitUnlock}>
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
              loading={isLoading}
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

  if (step === "SELECT_TERMINAL") {
    return (
      <div className="session-page">
        <Surface className="session-card" elevation={2} padding="spacious">
          <div className="session-brand">Tekad Mandiri</div>
          <Heading level={1} size="display">Pilih Terminal</Heading>
          <Text tone="secondary">
            Pilih terminal kasir yang akan digunakan pada perangkat ini.
          </Text>

          {errorMessage !== null ? (
            <Alert description={errorMessage} severity="CRITICAL" title="Gagal Memilih Terminal" />
          ) : null}

          <form className="session-form" onSubmit={submitTerminalChoice}>
            <RadioGroup label="Terminal Tersedia" name="terminal-selection" required>
              {availableTerminals.map((term) => (
                <Radio
                  checked={selectedTerminalId === term.id}
                  key={term.id}
                  label={`${term.name} — ${term.location_name}`}
                  onChange={() => setSelectedTerminalId(term.id)}
                  value={term.id}
                />
              ))}
            </RadioGroup>

            <Button
              disabled={!selectedTerminalId}
              fullWidth
              loading={isLoading}
              loadingLabel="Menyiapkan terminal..."
              size="large"
              type="submit"
            >
              Lanjutkan
            </Button>
            <Button
              fullWidth
              onClick={() => {
                setStep("CREDENTIALS");
                setSessionSecret("");
                setLocalError(null);
              }}
              variant="ghost"
            >
              Kembali
            </Button>
          </form>
        </Surface>
      </div>
    );
  }

  return (
    <div className="session-page">
      <Surface className="session-card" elevation={2} padding="spacious">
        <div className="session-brand">Tekad Mandiri</div>
        <Heading level={1} size="display">Tekad Mandiri POS</Heading>
        <Text tone="secondary">
          Masukkan email dan password akun Anda untuk menyiapkan dan membuka terminal kasir.
        </Text>

        {errorMessage !== null ? (
          <Alert description={errorMessage} severity="CRITICAL" title="Gagal Masuk POS" />
        ) : null}

        <form className="session-form" onSubmit={submitCredentials}>
          <Field label="Email" required>
            <Input
              autoComplete="email"
              autoFocus
              name="email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="kasir@tekadmandiri.local"
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
            loading={isLoading}
            loadingLabel="Menghubungkan ke POS"
            size="large"
            type="submit"
          >
            Hubungkan Perangkat
          </Button>
        </form>

        <Text size="caption" tone="muted">
          Data offline dan otorisasi kasir akan disimpan dengan aman di perangkat lokal setelah login pertama berhasil.
        </Text>
      </Surface>
    </div>
  );
}
