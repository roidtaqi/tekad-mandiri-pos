import type { BackofficeResource } from "../../runtime/resource-gateway";

export type CellKind = "count" | "date" | "id" | "money" | "quantity" | "status" | "text";

export interface ResourceColumn {
  readonly key: string;
  readonly kind?: CellKind;
  readonly label: string;
}

export interface ResourcePageConfig {
  readonly columns: readonly ResourceColumn[];
  readonly description: string;
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly permission: string;
  readonly resource: Exclude<BackofficeResource, "overview">;
  readonly title: string;
}

export const resourcePageConfigs = {
  attention: {
    columns: [
      { key: "summary", label: "Ringkasan" },
      { key: "domain", label: "Domain" },
      { key: "exception_type", label: "Jenis" },
      { key: "severity", kind: "status", label: "Prioritas" },
      { key: "status", kind: "status", label: "Status" },
      { key: "created_at", kind: "date", label: "Dibuat" },
    ],
    description: "Pengecualian operasional yang memerlukan perhatian atau tindak lanjut.",
    emptyDescription: "Tidak ada pengecualian operasional yang perlu ditampilkan.",
    emptyTitle: "Tidak ada item untuk ditinjau",
    permission: "workspace.backoffice.access",
    resource: "attention",
    title: "Perlu Ditinjau",
  },
  inventory: {
    columns: [
      { key: "product_id", kind: "id", label: "Product ID" },
      { key: "product_name", label: "Produk" },
      { key: "sku", label: "SKU" },
      { key: "location_name", label: "Lokasi" },
      { key: "base_quantity", kind: "quantity", label: "Stok Unit Dasar" },
      { key: "base_unit_code", label: "Unit" },
      { key: "mwa_unit_cost", kind: "money", label: "Biaya MWA" },
      { key: "updated_at", kind: "date", label: "Diperbarui" },
    ],
    description: "Proyeksi saldo stok per produk dan lokasi dari ledger pergerakan stok.",
    emptyDescription: "Belum ada saldo stok yang tersedia untuk bisnis ini.",
    emptyTitle: "Inventory kosong",
    permission: "inventory.read",
    resource: "inventory",
    title: "Inventory",
  },
  pricing: {
    columns: [
      { key: "id", kind: "id", label: "Price Set ID" },
      { key: "name", label: "Price Set" },
      { key: "source_type", label: "Sumber" },
      { key: "status", kind: "status", label: "Status" },
      { key: "effective_from", kind: "date", label: "Mulai Berlaku" },
      { key: "item_count", kind: "count", label: "Item" },
      { key: "high_risk_item_count", kind: "count", label: "Risiko Tinggi" },
      { key: "version", label: "Versi" },
    ],
    description: "Daftar price set dan status publikasi harga yang berlaku.",
    emptyDescription: "Belum ada price set yang tersedia.",
    emptyTitle: "Pricing kosong",
    permission: "pricing.read",
    resource: "pricing",
    title: "Pricing",
  },
  purchases: {
    columns: [
      { key: "id", kind: "id", label: "Purchase ID" },
      { key: "purchase_number", label: "Nomor Purchase" },
      { key: "supplier_name", label: "Supplier" },
      { key: "location_name", label: "Lokasi" },
      { key: "purchase_date", kind: "date", label: "Tanggal" },
      { key: "item_count", kind: "count", label: "Item" },
      { key: "integrity_status", kind: "status", label: "Integritas" },
      { key: "status", kind: "status", label: "Status" },
      { key: "version", label: "Versi" },
    ],
    description: "Purchase dan penerimaan terbaru dari platform bersama.",
    emptyDescription: "Belum ada purchase yang tersedia.",
    emptyTitle: "Purchasing kosong",
    permission: "purchase.read",
    resource: "purchases",
    title: "Purchasing",
  },
  reports: {
    columns: [
      { key: "business_date", kind: "date", label: "Tanggal Bisnis" },
      { key: "transaction_count", kind: "count", label: "Transaksi" },
      { key: "gross_sales", kind: "money", label: "Penjualan Kotor" },
      { key: "returns_total", kind: "money", label: "Retur" },
      { key: "net_sales", kind: "money", label: "Penjualan Bersih" },
    ],
    description: "Ringkasan penjualan harian berdasarkan tanggal bisnis.",
    emptyDescription: "Belum ada data penjualan harian untuk dilaporkan.",
    emptyTitle: "Reports kosong",
    permission: "workspace.backoffice.access",
    resource: "reports",
    title: "Reports",
  },
  returns: {
    columns: [
      { key: "id", kind: "id", label: "Return ID" },
      { key: "refund_id", kind: "id", label: "Refund ID Aktif" },
      { key: "refund_version", label: "Versi Refund" },
      { key: "return_number", label: "Nomor Retur" },
      { key: "transaction_number", label: "Transaksi Asal" },
      { key: "created_at", kind: "date", label: "Dibuat" },
      { key: "item_count", kind: "count", label: "Item" },
      { key: "return_total", kind: "money", label: "Nilai Retur" },
      { key: "refund_status", kind: "status", label: "Settlement Refund" },
      { key: "refund_record_status", kind: "status", label: "Operasional Refund" },
      { key: "status", kind: "status", label: "Status Retur" },
    ],
    description:
      "Riwayat retur barang, agregat settlement, dan status operasional refund yang terpisah.",
    emptyDescription: "Belum ada retur yang tersedia.",
    emptyTitle: "Retur kosong",
    permission: "return.read",
    resource: "returns",
    title: "Retur",
  },
  sales: {
    columns: [
      { key: "transaction_number", label: "Nomor Transaksi" },
      { key: "occurred_at", kind: "date", label: "Waktu" },
      { key: "cashier_name", label: "Kasir" },
      { key: "item_count", kind: "count", label: "Item" },
      { key: "grand_total", kind: "money", label: "Total" },
      { key: "returned_total", kind: "money", label: "Diretur" },
      { key: "status", kind: "status", label: "Status" },
    ],
    description: "Riwayat transaksi selesai dari seluruh terminal bisnis.",
    emptyDescription: "Belum ada transaksi penjualan yang tersedia.",
    emptyTitle: "Sales kosong",
    permission: "transaction.history.read",
    resource: "sales",
    title: "Sales",
  },
  terminals: {
    columns: [
      { key: "code", label: "Kode" },
      { key: "name", label: "Terminal" },
      { key: "location_name", label: "Lokasi" },
      { key: "status", kind: "status", label: "Status" },
      { key: "active_shift_number", label: "Shift Aktif" },
      { key: "shift_opened_at", kind: "date", label: "Dibuka" },
    ],
    description: "Terminal terdaftar dan shift aktifnya.",
    emptyDescription: "Belum ada terminal yang terdaftar.",
    emptyTitle: "Terminal kosong",
    permission: "settings.read",
    resource: "terminals",
    title: "Terminal",
  },
  users: {
    columns: [
      { key: "display_name", label: "Pengguna" },
      { key: "email", label: "Email" },
      { key: "primary_role", label: "Peran Utama" },
      { key: "user_status", kind: "status", label: "Status Pengguna" },
      { key: "membership_status", kind: "status", label: "Membership" },
      { key: "active_session_count", kind: "count", label: "Sesi Aktif" },
    ],
    description: "Akses pengguna, membership, peran utama, dan sesi aktif.",
    emptyDescription: "Belum ada pengguna yang dapat ditampilkan.",
    emptyTitle: "User Access kosong",
    permission: "user.read",
    resource: "users",
    title: "User Access",
  },
} as const satisfies Readonly<Record<string, ResourcePageConfig>>;

export type ResourcePageKey = keyof typeof resourcePageConfigs;
