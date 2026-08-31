import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Field,
  Heading,
  Input,
  Stack,
  Surface,
  Text,
} from "@kastur/ui";

export interface FirstRunSetupProps {
  readonly apiBaseUrl?: string | undefined;
  readonly onCancel?: (() => void) | undefined;
  readonly onComplete: (sessionSecret: string) => void;
}

export function FirstRunSetup({
  apiBaseUrl = "",
  onCancel,
  onComplete,
}: FirstRunSetupProps) {
  const [setupToken, setSetupToken] = useState("");
  const [businessName, setBusinessName] = useState("Kastur Retail");
  const [ownerName, setOwnerName] = useState("Owner");
  const [ownerEmail, setOwnerEmail] = useState("owner@kastur.local");
  const [locationName, setLocationName] = useState("Toko Utama");
  const [terminalName, setTerminalName] = useState("Kasir 1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSessionSecret, setCreatedSessionSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const rawBase = apiBaseUrl ?? "";
    const baseUrl =
      rawBase.trim() === ""
        ? ""
        : rawBase.endsWith("/")
          ? rawBase.slice(0, -1)
          : rawBase;
    const setupUrl = `${baseUrl}/api/v1/system/setup`;

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      if (setupToken.trim() !== "") {
        headers["X-Kastur-Setup-Token"] = setupToken.trim();
      }

      const response = await fetch(setupUrl, {
        body: JSON.stringify({
          business_name: businessName.trim(),
          location_name: locationName.trim(),
          owner_email: ownerEmail.trim(),
          owner_name: ownerName.trim(),
          terminal_name: terminalName.trim(),
        }),
        headers,
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as {
        readonly error?: { readonly message?: string };
        readonly session_secret?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error?.message ??
            `Inisialisasi gagal dengan status ${response.status}.`,
        );
      }

      if (typeof body?.session_secret === "string") {
        setCreatedSessionSecret(body.session_secret);
      } else {
        throw new Error("Respons setup tidak mengembalikan kode sesi.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Inisialisasi toko gagal.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopySession() {
    if (createdSessionSecret !== null && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(createdSessionSecret).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      });
    }
  }

  if (createdSessionSecret !== null) {
    return (
      <main aria-labelledby="setup-success-title" className="ks-root session-screen">
        <Surface className="session-card" elevation={1} padding="spacious">
          <Stack gap={4}>
            <Stack gap={1}>
              <Text as="span" size="caption" tone="muted" weight="bold">
                Kastur Retail System
              </Text>
              <Heading id="setup-success-title" level={1} size="h1">
                Toko Berhasil Diinisialisasi!
              </Heading>
              <Text tone="secondary">
                Bisnis {businessName} telah aktif. Simpan atau salin kode sesi di bawah ini untuk menghubungkan terminal kasir (POS).
              </Text>
            </Stack>

            <Surface className="session-code-box" elevation={0} padding="default">
              <Stack gap={2}>
                <Text size="caption" tone="muted" weight="bold">
                  KODE SESI KASIR / OWNER (ONETIME SECRET):
                </Text>
                <code
                  style={{
                    backgroundColor: "var(--ks-color-surface-subtle, #f4f4f5)",
                    borderRadius: "4px",
                    display: "block",
                    fontFamily: "monospace",
                    fontSize: "0.875rem",
                    overflowWrap: "anywhere",
                    padding: "8px 12px",
                    wordBreak: "break-all",
                  }}
                >
                  {createdSessionSecret}
                </code>
                <Button onClick={handleCopySession} type="button" variant="secondary">
                  {copied ? "✓ Kode Sesi Disalin" : "Salin Kode Sesi POS"}
                </Button>
              </Stack>
            </Surface>

            <Alert severity="INFO" title="Langkah Menyiapkan POS">
              <Text>
                Buka aplikasi <strong>Kastur POS</strong> pada perangkat kasir Anda, lalu tempel kode sesi di atas untuk menghubungkan terminal secara otomatis.
              </Text>
            </Alert>

            <Button
              fullWidth
              onClick={() => onComplete(createdSessionSecret)}
              type="button"
            >
              Masuk ke Back Office Sekarang
            </Button>
          </Stack>
        </Surface>
      </main>
    );
  }

  return (
    <main aria-labelledby="setup-title" className="ks-root session-screen">
      <Surface className="session-card" elevation={1} padding="spacious">
        <Stack gap={4}>
          <Stack gap={1}>
            <Text as="span" size="caption" tone="muted" weight="bold">
              Kastur Retail System
            </Text>
            <Heading id="setup-title" level={1} size="h1">
              Inisialisasi Toko Baru
            </Heading>
            <Text tone="secondary">
              Database baru terdeteksi. Masukkan kunci inisialisasi server dan lengkapi data awal toko.
            </Text>
          </Stack>

          {error !== null ? (
            <Alert severity="CRITICAL" title="Inisialisasi belum berhasil">
              <Text>{error}</Text>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit}>
            <Stack gap={3}>
              <Field
                description="Kunci rahasia server (KASTUR_SETUP_TOKEN) dari environment Railway."
                label="Kunci Inisialisasi Server"
                required
              >
                <Input
                  autoComplete="off"
                  autoFocus
                  name="setup-token"
                  onChange={(event) => setSetupToken(event.target.value)}
                  placeholder="Masukkan KASTUR_SETUP_TOKEN"
                  required
                  spellCheck={false}
                  type="password"
                  value={setupToken}
                />
              </Field>

              <Field label="Nama Bisnis / Toko" required>
                <Input
                  name="business-name"
                  onChange={(event) => setBusinessName(event.target.value)}
                  required
                  value={businessName}
                />
              </Field>

              <Field label="Nama Pemilik (Owner)" required>
                <Input
                  name="owner-name"
                  onChange={(event) => setOwnerName(event.target.value)}
                  required
                  value={ownerName}
                />
              </Field>

              <Field label="Email Pemilik" required>
                <Input
                  name="owner-email"
                  onChange={(event) => setOwnerEmail(event.target.value)}
                  required
                  type="email"
                  value={ownerEmail}
                />
              </Field>

              <Field label="Nama Lokasi Toko" required>
                <Input
                  name="location-name"
                  onChange={(event) => setLocationName(event.target.value)}
                  required
                  value={locationName}
                />
              </Field>

              <Field label="Nama Terminal POS" required>
                <Input
                  name="terminal-name"
                  onChange={(event) => setTerminalName(event.target.value)}
                  required
                  value={terminalName}
                />
              </Field>

              <Button fullWidth loading={loading} type="submit">
                Inisialisasi & Buat Toko
              </Button>

              {onCancel !== undefined ? (
                <Button
                  fullWidth
                  onClick={onCancel}
                  type="button"
                  variant="secondary"
                >
                  Batal & Masuk dengan Sesi Tersedia
                </Button>
              ) : null}
            </Stack>
          </form>
        </Stack>
      </Surface>
    </main>
  );
}
