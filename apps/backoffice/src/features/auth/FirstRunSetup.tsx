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
  const [businessName, setBusinessName] = useState("Kastur Retail");
  const [ownerName, setOwnerName] = useState("Owner");
  const [ownerEmail, setOwnerEmail] = useState("owner@kastur.local");
  const [locationName, setLocationName] = useState("Toko Utama");
  const [terminalName, setTerminalName] = useState("Kasir 1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const response = await fetch(setupUrl, {
        body: JSON.stringify({
          business_name: businessName.trim(),
          location_name: locationName.trim(),
          owner_email: ownerEmail.trim(),
          owner_name: ownerName.trim(),
          terminal_name: terminalName.trim(),
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
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
        onComplete(body.session_secret);
      } else {
        throw new Error("Respons setup tidak mengembalikan kode sesi.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Inisialisasi toko gagal.");
    } finally {
      setLoading(false);
    }
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
              Database baru terdeteksi. Lengkapi data awal toko dan pemilik untuk memulai.
            </Text>
          </Stack>

          {error !== null ? (
            <Alert severity="CRITICAL" title="Inisialisasi belum berhasil">
              <Text>{error}</Text>
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit}>
            <Stack gap={3}>
              <Field label="Nama Bisnis / Toko" required>
                <Input
                  autoFocus
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
                Inisialisasi & Masuk ke Back Office
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
