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
  readonly errorMessage?: string | undefined;
  readonly loading?: boolean | undefined;
  readonly onLogin: (credentials: { email: string; password: string }) => void;
}

export function SessionEntry({ errorMessage, loading = false, onLogin }: SessionEntryProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim() && password) {
      onLogin({ email: email.trim(), password });
    }
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
              Masukkan email dan password akun Anda untuk mengelola toko.
            </Text>
          </Stack>

          {errorMessage === undefined ? null : (
            <Alert severity="CRITICAL" title="Gagal Masuk">
              <Text>{errorMessage}</Text>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack gap={3}>
              <Field label="Email" required>
                <Input
                  autoComplete="email"
                  autoFocus
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="owner@kastur.local"
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
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  spellCheck={false}
                  type="password"
                  value={password}
                />
              </Field>

              <Button fullWidth loading={loading} type="submit">
                Masuk
              </Button>
            </Stack>
          </form>
        </Stack>
      </Surface>
    </main>
  );
}
