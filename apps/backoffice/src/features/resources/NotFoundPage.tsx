import { Link } from "react-router-dom";
import { EmptyState } from "@kastur/ui";

export function NotFoundPage() {
  return (
    <EmptyState
      action={
        <Link className="text-link" to="/dashboard">
          Kembali ke Ringkasan
        </Link>
      }
      description="Alamat yang dibuka tidak tersedia di Back Office."
      title="Halaman tidak ditemukan"
    />
  );
}
