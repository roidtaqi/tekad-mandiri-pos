export function formatMoney(value: string, currency = "IDR"): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(parsed);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function userFacingError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { readonly code?: unknown }).code;
    if (typeof code === "string") {
      const messages: Record<string, string> = {
        PRODUCT_NOT_FOUND: "Barcode atau produk tidak ditemukan.",
        NO_PUBLISHED_PRICE: "Produk belum memiliki harga retail terbit.",
        SHIFT_REQUIRED: "Buka shift sebelum menyelesaikan penjualan.",
        SALE_AUTHORIZATION_EXPIRED: "Izin offline sudah kedaluwarsa.",
        PAYMENT_INSUFFICIENT: "Uang yang diterima belum mencukupi.",
        CASH_MOVEMENT_PERMISSION_DENIED: "Anda tidak memiliki izin untuk tindakan kas ini.",
      };
      if (messages[code]) return messages[code];
    }
  }
  return error instanceof Error ? error.message : "Operasi gagal.";
}
