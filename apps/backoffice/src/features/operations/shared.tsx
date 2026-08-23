import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { hasCachedPermission } from "@kastur/auth-client";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Heading,
  Input,
  Stack,
  Surface,
  Text,
} from "@kastur/ui";

import { useAuthContext } from "../auth/AuthContext";
import type {
  CommandIdentityInput,
  OperationalCommandResult,
} from "../../runtime/command-gateway";
import { HttpError } from "../../runtime/http";

const COMMAND_DEVICE_KEY = "kastur.backoffice.command-device-id.v1";

export interface OperationLink {
  readonly label: string;
  readonly path: string;
  readonly permission: string;
}

export function nowLocalInput(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function toIso(localValue: string): string {
  const parsed = new Date(localValue);
  if (!Number.isFinite(parsed.getTime())) throw new Error("Waktu command tidak valid.");
  return parsed.toISOString();
}

export function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function idLines(value: string): readonly string[] {
  return value
    .split(/[\n,]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

export function integerInput(value: string, field: string, minimum = 0): number {
  if (!/^[0-9]+$/u.test(value)) throw new Error(`${field} harus bilangan bulat.`);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${field} tidak valid.`);
  }
  return parsed;
}

function commandError(error: unknown): string {
  if (error instanceof HttpError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : "Command tidak berhasil.";
}

export function useStoredDeviceId(): readonly [string, (value: string) => void] {
  const [deviceId, setDeviceIdState] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(COMMAND_DEVICE_KEY) ?? "",
  );
  const setDeviceId = (value: string) => {
    setDeviceIdState(value);
    if (typeof window !== "undefined") {
      if (value.trim() === "") window.localStorage.removeItem(COMMAND_DEVICE_KEY);
      else window.localStorage.setItem(COMMAND_DEVICE_KEY, value.trim());
    }
  };
  return [deviceId, setDeviceId] as const;
}

interface Attempt {
  readonly fingerprint: string;
  readonly identity: CommandIdentityInput;
}

export function useCommandSubmission() {
  const attempt = useRef<Attempt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OperationalCommandResult | null>(null);

  const execute = async <TPayload,>(
    deviceId: string,
    payload: TPayload,
    submit: (
      identity: CommandIdentityInput,
      submittedPayload: TPayload,
    ) => Promise<OperationalCommandResult>,
  ): Promise<void> => {
    const cleanDeviceId = deviceId.trim();
    if (cleanDeviceId === "") {
      setError("ID perangkat aktif wajib diisi.");
      return;
    }
    const fingerprint = JSON.stringify({ device_id: cleanDeviceId, payload });
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = {
        fingerprint,
        identity: {
          commandId: crypto.randomUUID(),
          correlationId: crypto.randomUUID(),
          deviceId: cleanDeviceId,
          occurredAt: new Date().toISOString(),
        },
      };
    }

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const completed = await submit(attempt.current.identity, payload);
      setResult(completed);
      attempt.current = null;
    } catch (submitError: unknown) {
      setError(commandError(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return { error, execute, result, submitting } as const;
}

export function OperationIndex({
  children,
  links,
}: {
  readonly children: ReactNode;
  readonly links: readonly OperationLink[];
}) {
  const auth = useAuthContext();
  const visible = links.filter((link) => hasCachedPermission(auth, link.permission));
  return (
    <Stack gap={4}>
      {visible.length > 0 ? (
        <Surface elevation={1} padding="default">
          <Stack gap={2}>
            <Heading level={2}>Aksi Operasional</Heading>
            <div className="operation-links">
              {visible.map((link) => (
                <Link className="operation-link" key={link.path} to={link.path}>
                  {link.label}
                </Link>
              ))}
            </div>
          </Stack>
        </Surface>
      ) : null}
      {children}
    </Stack>
  );
}

export function OperationFormPage({
  children,
  description,
  permission,
  title,
  backTo,
}: {
  readonly backTo: string;
  readonly children: ReactNode;
  readonly description: string;
  readonly permission: string;
  readonly title: string;
}) {
  const auth = useAuthContext();
  if (!hasCachedPermission(auth, permission)) {
    return (
      <EmptyState
        action={<Link className="operation-link" to={backTo}>Kembali</Link>}
        description={`Izin ${permission} diperlukan untuk workflow ini.`}
        title="Akses ditolak"
      />
    );
  }
  return (
    <Stack gap={4}>
      <div className="operation-heading">
        <div>
          <Heading level={1}>{title}</Heading>
          <Text tone="secondary">{description}</Text>
        </div>
        <Link className="operation-link operation-link--secondary" to={backTo}>Kembali</Link>
      </div>
      {children}
    </Stack>
  );
}

export function CommandSurface({
  children,
  deviceId,
  error,
  onDeviceIdChange,
  result,
  submitting,
  submitLabel,
  onSubmit,
}: {
  readonly children: ReactNode;
  readonly deviceId: string;
  readonly error: string | null;
  readonly onDeviceIdChange: (value: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly result: OperationalCommandResult | null;
  readonly submitLabel: string;
  readonly submitting: boolean;
}) {
  return (
    <Surface elevation={1} padding="spacious">
      <form className="operation-form" onSubmit={onSubmit}>
        <Stack gap={4}>
          {error === null ? null : (
            <Alert description={error} severity="CRITICAL" title="Command belum berhasil" />
          )}
          {result === null ? null : (
            <Alert
              description={`Command ${result.command_id} diterima server.`}
              severity="INFO"
              title="Command selesai"
            />
          )}
          <Field
            description="Gunakan UUID perangkat aktif yang terdaftar pada business ini. Nilai non-secret disimpan di browser ini."
            label="ID perangkat aktif"
            required
          >
            <Input
              autoComplete="off"
              onChange={(event) => onDeviceIdChange(event.currentTarget.value)}
              required
              value={deviceId}
            />
          </Field>
          {children}
          <Button loading={submitting} loadingLabel="Mengirim command" type="submit">
            {submitLabel}
          </Button>
        </Stack>
      </form>
    </Surface>
  );
}

export function TechnicalId({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="technical-id">
      <Text size="caption" tone="muted">{label}</Text>
      <code>{value}</code>
    </div>
  );
}

export function RemoveLineButton({ onClick }: { readonly onClick: () => void }) {
  return <Button onClick={onClick} size="compact" type="button" variant="ghost">Hapus baris</Button>;
}
