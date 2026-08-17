export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat("id-ID", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  } catch {
    return isoString;
  }
}

export function formatRupiah(valueStr: string): string {
  try {
    const num = Number(valueStr);
    if (isNaN(num)) return valueStr;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0, // Typical Indonesian retail drops cents
    }).format(num);
  } catch {
    return valueStr;
  }
}

export function formatQuantity(valueStr: string): string {
  try {
    const num = Number(valueStr);
    if (isNaN(num)) return valueStr;
    // Format quantity to drop trailing zeros if integer, up to 3 decimals
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(num);
  } catch {
    return valueStr;
  }
}
