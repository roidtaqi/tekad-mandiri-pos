import { Button, EmptyState, Spinner } from "@kastur/ui";

import { HttpError } from "../../runtime/http";
import { useBackofficeRuntime } from "../../runtime/RuntimeContext";

export function ResourceLoading({ label }: { readonly label: string }) {
  return (
    <div className="resource-state">
      <Spinner label={label} />
    </div>
  );
}

export function PermissionDenied({ permission }: { readonly permission: string }) {
  return (
    <EmptyState
      description={`Akun Anda tidak memiliki izin ${permission}.`}
      title="Akses Ditolak"
    />
  );
}

export function InvalidResourceResponse() {
  return (
    <EmptyState
      description="Server mengembalikan data yang tidak dapat ditampilkan."
      title="Respons server tidak valid"
    />
  );
}

export function ResourceFailure({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry: () => void;
}) {
  const { logout } = useBackofficeRuntime();

  if (error instanceof HttpError && error.status === 403) {
    return <PermissionDenied permission="yang diperlukan untuk resource ini" />;
  }

  if (error instanceof HttpError && error.status === 401) {
    return (
      <EmptyState
        action={<Button onClick={logout}>Masuk kembali</Button>}
        description="Akun pengguna sudah berakhir atau telah keluar."
        title="Akses Berakhir"
      />
    );
  }

  return (
    <EmptyState
      action={<Button onClick={onRetry}>Coba lagi</Button>}
      description={
        error instanceof HttpError
          ? error.message
          : "Data tidak dapat dimuat. Periksa koneksi lalu coba lagi."
      }
      title="Gagal memuat data"
    />
  );
}
