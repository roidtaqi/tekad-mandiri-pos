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

export interface SessionEntryProps {
  readonly errorMessage?: string;
  readonly onRetry?: () => void;
  readonly onSubmit: (bearer: string) => void;
}

export function SessionEntry({ errorMessage, onRetry, onSubmit }: SessionEntryProps) {
  const [bearer, setBearer] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(bearer);
  }

  return (
    <main className="ks-root session-screen" aria-labelledby="session-title">
      <Surface className="session-card" elevation={1} padding="spacious">
        <Stack gap={4}>
          <Stack gap={1}>
            <Text as="span" size="caption" tone="muted" weight="bold">
              Kastur Retail System
            </Text>
            <Heading id="session-title" level={1} size="h1">
              Masuk ke Back Office
            </Heading>
            <Text tone="secondary">
              Masukkan kode sesi pengguna Anda. Kode hanya disimpan untuk tab browser ini.
            </Text>
          </Stack>

          {errorMessage === undefined ? null : (
            <Alert severity="CRITICAL" title="Sesi tidak dapat digunakan">
              <Text>{errorMessage}</Text>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack gap={3}>
              <Field label="Kode sesi pengguna" required>
                <Input
                  autoComplete="off"
                  autoFocus
                  name="session-bearer"
                  onChange={(event) => setBearer(event.target.value)}
                  required
                  spellCheck={false}
                  type="password"
                  value={bearer}
                />
              </Field>
              <Button fullWidth type="submit">
                Verifikasi sesi
              </Button>
              {onRetry === undefined ? null : (
                <Button fullWidth onClick={onRetry} type="button" variant="secondary">
                  Coba sesi tersimpan lagi
                </Button>
              )}
            </Stack>
          </form>
        </Stack>
      </Surface>
    </main>
  );
}
