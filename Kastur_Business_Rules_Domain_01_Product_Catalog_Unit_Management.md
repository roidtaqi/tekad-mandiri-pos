# Kastur Retail System — Business Rules Domain 01
## Product Catalog & Unit Management

**Status:** LOCKED / Business Foundation v1  
**Domain:** D01 — Product Catalog & Unit Management  
**Purpose:** Menjadi source of truth resmi untuk Product, Product Unit, Barcode, unit conversion, catalog lifecycle, supplier relation, dan opening catalog behavior.

---

# 1. Core Invariant

> **Satu barang komersial adalah satu Product. Perbedaan PCS/PACK/CARTON atau satuan jual/beli tidak membuat Product baru; semuanya direpresentasikan sebagai Product Unit dengan konversi terhadap satu Base Unit.**

---

# 2. Product

Setiap Product memiliki minimal:

```text
Product ID
SKU
Name
Category
Brand optional
Base Unit
track_inventory
Status
Created/Updated metadata
```

Rules:

1. Product ID adalah technical immutable identity.
2. SKU unique dalam satu Business.
3. SKU dapat diedit hanya melalui controlled audited mutation; SKU bukan primary key.
4. Product Name harus human-readable dan tidak menjadi unique key.
5. Naming recommendation:
   `Brand + Product + Variant + Size` bila relevan.
6. Category adalah primary classification.
7. Brand disimpan terpisah dan optional.
8. Product lifecycle:
   `ACTIVE / INACTIVE`.
9. Product dengan historical business records tidak di-hard-delete.
10. `track_inventory = false` berarti Product tidak membuat normal inventory movement saat dijual/dibeli sesuai policy terkait.

---

# 3. Base Unit

1. Inventory-tracked Product memiliki tepat satu Base Unit.
2. Semua stock balance dan stock movement dinormalisasi ke Base Unit.
3. Base Unit memiliki conversion factor `1`.
4. Sebelum Product mempunyai inventory history, Base Unit dapat diubah dengan audit.
5. Setelah Stock Movement pertama, Base Unit **locked** pada normal UI.
6. Fundamental correction setelah history hanya melalui Controlled Migration Utility/support-admin path.
7. Historical base quantity dan conversion snapshots tidak boleh dihitung ulang akibat perubahan master.

---

# 4. Product Unit

Satu Product dapat memiliki banyak Product Unit.

Contoh:

```text
Product = Air Mineral X
Base Unit = PCS

PCS     = 1 PCS
PACK    = 6 PCS
CARTON  = 24 PCS
```

Setiap Product Unit memiliki:

```text
Product Unit ID
Product ID
Unit Code
Display Name
Conversion Factor
Can Sell
Can Purchase
Allow Decimal Qty
Status
```

Rules:

1. `conversion_factor` berarti jumlah Base Unit dalam 1 Product Unit.
2. Conversion factor harus > 0.
3. Product Unit dapat sell-only, purchase-only, atau keduanya.
4. Selling Unit dan Purchasing Unit tidak perlu sama.
5. Decimal quantity didukung sejak awal untuk unit seperti KG/L.
6. Mixed Product Units dalam satu cart tetap menjadi line terpisah.
7. Historical transaction/purchase records menyimpan conversion snapshot.
8. Perubahan conversion tidak retroaktif.
9. Product Unit yang pernah dipakai dalam history tidak di-hard-delete; gunakan inactive.

---

# 5. Barcode

1. Barcode milik **Product Unit**, bukan hanya Product.
2. Satu Product Unit boleh memiliki beberapa Barcode.
3. Active Barcode harus unique dalam satu Business.
4. Barcode lama boleh dinonaktifkan tanpa menghapus history.
5. Barcode exact match harus dapat menentukan Product Unit secara deterministik.
6. Duplicate active barcode adalah hard validation error.
7. Camera barcode scanning hanya salah satu input method; domain tidak bergantung pada camera/hardware tertentu.

---

# 6. Selling and Purchasing

1. Satu Product dapat dibeli dalam Unit A dan dijual dalam Unit B.
2. Purchase quantity dinormalisasi ke Base Unit pada inventory effect.
3. Sale quantity dinormalisasi ke Base Unit pada inventory effect.
4. Selling Price melekat pada Product Unit melalui Pricing Domain, bukan Product master mutable field.
5. Purchase Cost dinormalisasi ke Base Unit melalui Costing Domain.
6. Product Unit dan Pricing Tier adalah konsep berbeda.
7. Quantity tier pada satu Unit tidak otomatis mencampur quantity dari Unit lain.

---

# 7. Supplier Relationship

1. Product dapat mempunyai banyak Supplier.
2. Supplier dapat memasok banyak Product.
3. `Product ↔ Supplier` adalah many-to-many relationship.
4. Satu relation dapat menyimpan Supplier SKU.
5. Preferred Supplier optional.
6. Supplier bukan atribut tunggal Product.
7. Supplier relation tidak menentukan ownership Product.

---

# 8. Duplicate Prevention

Hard-block:

```text
Duplicate SKU
Duplicate Active Barcode
```

Warning/review:

```text
Similar Product Name
Same Brand + Similar Variant/Size
Potential duplicate import row
```

Fuzzy Product name match tidak boleh otomatis merge Product.

---

# 9. Product Deactivation

1. Product deactivation tidak menghapus history.
2. Product inactive tidak dapat ditambahkan ke new normal sale.
3. Jika Product memiliki scheduled/active pricing/promotion:
   - Scheduled Price → CANCELLED
   - Scheduled Promotion → CANCELLED
   - Active Promotion → ENDED
   - Product → INACTIVE
4. Historical Price Versions tetap ada.
5. Deactivation harus melalui explicit impact review dan audit.

---

# 10. Product Merge

1. Tidak ada casual merge Product pada normal v2 UI.
2. Product merge berisiko mengubah historical references dan inventory.
3. Jika di masa depan diperlukan, gunakan controlled migration operation.
4. Duplicate prevention lebih penting daripada menyediakan merge cepat.

---

# 11. Product Creation UX Rule

Product creation menggunakan progressive disclosure.

Required minimum:

```text
Name
Category
Base Unit
track_inventory
SKU
```

Optional/next steps:

```text
Brand
Additional Product Units
Barcodes
Supplier relations
Opening Stock
Pricing
```

User tidak dipaksa mengisi seluruh commercial lifecycle pada satu form.

---

# 12. Product Detail

Product Detail adalah contextual hub.

Sections:

```text
Ringkasan
Unit & Barcode
Harga
Pembelian
Stok
Riwayat
```

Product Detail dapat menampilkan current projections seperti Stock/Cost/Price, tetapi ownership masing-masing data tetap berada pada domain terkait.

---

# 13. Permissions

Owner/Admin:

```text
manage catalog according to effective permissions
```

Cashier:

```text
read only POS-required subset
```

Cashier tidak dapat membuat Product baru dari POS.

---

# 14. Import / Opening Data

1. Legacy spreadsheet/data adalah migration source, bukan schema authority.
2. Import harus melalui staging/validation.
3. Column mapping explicit.
4. Opening state menggunakan:
   - `INITIAL_STOCK`
   - `INITIAL_COST`
   - `OPENING_PRICE`
5. Jangan membuat Purchase/Sale palsu untuk mewakili opening state.
6. Legacy ID mapping harus dipertahankan saat migration diperlukan.

---

# 15. Future Readiness

Schema tidak boleh menghalangi:

```text
Multi-location
Warehouse
Lot/Expiry
Location-specific pricing override
Supplier-specific purchasing metadata
```

Tetapi v2 tidak mengaktifkan UI kompleks tersebut.

---

# 16. Non-Goals v2

Tidak termasuk:

```text
BOM / Manufacturing
Bundles/Kits as inventory composition
Serialized inventory
Lot/Expiry operational UI
Variant-parent catalog system
Customer-specific price contracts
Store-specific price override UI
Complex product merge UI
```

---

# Final D01 Principle

> **Product adalah identitas barang; Product Unit adalah cara barang tersebut dibeli/dijual; Base Unit adalah bahasa tunggal inventory. Barcode mengidentifikasi Product Unit, Pricing tidak disimpan sebagai mutable Product field, dan seluruh historical unit/conversion meaning harus tetap dapat dipahami walaupun catalog master berubah.**
