# Kastur Retail System — Business Rules v1
## Domain 05: Inventory & Stock Control

**Status:** Draft for Approval  
**Depends on:** Domain 01 Product Catalog, Domain 02 Purchasing & Receiving, Domain 03 Costing & Inventory Valuation  
**Consumed by:** Back Office, POS, Reporting  
**Primary Users:** Owner, Admin  
**Operational Consumer:** Cashier melalui POS

---

## 1. Tujuan domain

Inventory harus mampu menjawab secara konsisten:

```text
Berapa stok sistem sekarang?
Kenapa stok berubah?
Dari transaksi mana perubahan berasal?
Berapa stok fisik sebenarnya?
Apakah ada selisih?
Apakah stok negatif?
Di lokasi mana stok berada?
```

Kastur tidak boleh menggunakan satu field mutable seperti:

```text
product.stock = 120
```

sebagai satu-satunya sumber kebenaran.

---

## 2. Stock Movement Ledger adalah sumber kebenaran

Semua perubahan stok berasal dari:

```text
STOCK MOVEMENT
```

Contoh:

```text
Opening Stock          +100
Purchase Receipt       +200
Sale                     -5
Customer Return          +2
Supplier Return         -10
Stock Adjustment         -3
```

Stock Balance merupakan hasil akumulasi ledger.

---

## 3. Tidak ada silent stock overwrite

UI tidak boleh mempunyai generic operation:

```text
Stok:
100 → 80

Save
```

tanpa alasan.

Jika stok berubah, harus diketahui:

```text
movement_type
quantity
reference
reason
actor
timestamp
```

---

## 4. Base Unit sebagai inventory unit

Seluruh Stock Movement disimpan dalam:

> **Base Unit Product**

Contoh:

```text
Base Unit:
PCS
```

Purchase:

```text
2 CARTON
1 CARTON = 40 PCS
```

movement:

```text
+80 PCS
```

---

## 5. Transaction unit tetap disimpan

Walaupun ledger menggunakan Base Unit, reference event harus mempertahankan:

```text
original_unit
original_qty
conversion_snapshot
base_qty
```

Contoh:

```text
Sold:
2 CARTON

Conversion:
40 PCS

Inventory:
-80 PCS
```

---

## 6. Decimal quantity

Inventory quantity mendukung decimal.

Contoh:

```text
0.5 KG
2.75 L
```

Jangan menggunakan integer-only inventory engine.

---

## 7. Stock Movement types

Minimal v2:

```text
INITIAL_STOCK

PURCHASE_RECEIPT
SUPPLIER_REPLACEMENT

SALE
CUSTOMER_RETURN

SUPPLIER_RETURN

STOCK_ADJUSTMENT_IN
STOCK_ADJUSTMENT_OUT

OPNAME_ADJUSTMENT_IN
OPNAME_ADJUSTMENT_OUT
```

Future:

```text
TRANSFER_IN
TRANSFER_OUT
LOT_ADJUSTMENT
```

---

## 8. Movement direction eksplisit

Setiap movement harus jelas apakah:

```text
IN
OUT
```

tetapi signed quantity tetap dapat digunakan secara teknis.

Contoh:

```text
PURCHASE_RECEIPT
+40
```

```text
SALE
-3
```

---

## 9. Stock Balance

Stock Balance adalah projection/cache dari ledger.

Concept:

```text
Stock Balance
=
Σ Stock Movements
```

Jika balance cache rusak, system harus mampu membangunnya ulang dari ledger.

---

## 10. Ledger authoritative, balance optimized

Secara architecture:

```text
Stock Movement Ledger
→ authoritative
```

```text
Stock Balance
→ fast-read projection
```

Jangan membalik relasi ini.

---

## 11. Location-aware inventory

Setiap inventory movement mempunyai:

```text
location_id
```

walaupun current v2 hanya memiliki:

```text
Default Store
```

User tidak perlu memilih location pada operasi normal sekarang.

---

## 12. Single-store UX

Karena scope saat ini single-store:

```text
current_location
=
default_store
```

otomatis.

Tidak perlu:

```text
Pilih Outlet
```

setiap login atau transaksi.

---

## 13. Future warehouse readiness

Location architecture dapat kelak mendukung:

```text
STORE
WAREHOUSE
```

tanpa membangun Warehouse UI sekarang.

---

## 14. Inventory Product only

Product dengan:

```text
track_inventory = false
```

tidak menghasilkan Stock Movement dari normal Sale.

Contoh:

```text
Biaya Kirim
Pulsa
Service
```

---

## 15. Initial Stock

Saat onboarding:

```text
INITIAL_STOCK
```

digunakan.

Contoh:

```text
Opening Qty:
100 PCS
```

movement:

```text
INITIAL_STOCK +100
```

Bukan fake Purchase.

---

## 16. Initial Stock requires provenance

Opening stock minimal menyimpan:

```text
quantity
location
created_by
created_at
opening_reference
```

dan terkait dengan Initial Cost jika barang bernilai ekonomi.

---

## 17. Purchase Receipt

Accepted quantity dari Domain 02 menghasilkan:

```text
PURCHASE_RECEIPT
```

Rejected/damaged goods tidak otomatis masuk sellable inventory.

---

## 18. Partial receiving

Setiap receipt menghasilkan movement sendiri.

Contoh:

```text
Order 10 CTN

Receipt 1:
+6 CTN equivalent

Receipt 2:
+4 CTN equivalent
```

Tidak menunggu Purchase selesai agar stok yang nyata sudah diterima dapat tersedia.

---

## 19. Purchase receiving immutability

Jika Receipt sudah menghasilkan inventory movement, jangan mengedit quantity lama secara diam-diam.

Correction menghasilkan event baru.

---

## 20. Sale

Completed POS transaction menghasilkan:

```text
SALE
```

movement.

Contoh:

```text
3 PCS
→ -3
```

Sale draft/cart belum mengurangi authoritative stock.

---

## 21. Kapan stok dikurangi

Stock deduction terjadi ketika transaction mencapai status final yang kita definisikan nanti pada Domain 06.

Bukan ketika:

```text
item added to cart
```

---

## 22. Cart tidak reserve stock secara default

Untuk toko retail single-register/small-medium environment, v2:

```text
Cart
≠ Inventory Reservation
```

Barang baru berkurang ketika Sale finalized.

Ini menjaga POS sederhana.

Architecture dapat menambahkan reservation di masa depan bila diperlukan.

---

## 23. Negative Stock Policy

Negative stock diperbolehkan bila business setting mengizinkan.

Contoh:

```text
System Stock:
2

Sale:
5

Result:
-3
```

POS memberikan warning.

---

## 24. Negative Stock bukan error tersembunyi

Negative stock harus muncul pada:

```text
Inventory Attention
```

contoh:

```text
12 Produk Stok Negatif
```

Owner/Admin dapat menyelidiki.

---

## 25. Negative stock audit

Sale yang menghasilkan negative stock harus diketahui.

Minimal:

```text
transaction_id
product_id
previous_balance
sold_qty
result_balance
cashier
timestamp
```

---

## 26. Negative stock tidak otomatis dikoreksi

Jangan:

```text
negative stock
→ automatically set to 0
```

Stok negatif menyampaikan bahwa ada discrepancy yang belum diselesaikan.

---

## 27. Replenishment setelah negative stock

Purchase Receipt berikutnya menambah ledger secara normal.

Contoh:

```text
Balance:
-3

Purchase:
+10

New Balance:
7
```

Cost reconciliation mengikuti Domain 03.

---

## 28. Low Stock

Kastur dapat mendukung:

```text
low_stock_threshold
```

per Product atau default business.

Contoh:

```text
Current Stock:
8

Low Stock Threshold:
10

→ LOW_STOCK
```

---

## 29. Low stock adalah alert, bukan purchase automation

V2:

```text
LOW_STOCK
→ notification / filter
```

bukan:

```text
LOW_STOCK
→ automatic purchase order
```

Automatic reorder belum scope.

---

## 30. Out of Stock

Jika:

```text
stock = 0
```

Product dapat ditandai:

```text
OUT_OF_STOCK
```

Tetapi apakah POS memblokir penjualan mengikuti Negative Stock Policy.

---

## 31. Stock availability state

UI dapat menggunakan state:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
NEGATIVE
```

sebagai derived presentation.

Bukan stored business truth yang menggantikan balance.

---

## 32. Stock Adjustment

Stock Adjustment digunakan untuk koreksi inventory yang tidak berasal dari normal Purchase/Sale/Return.

Contoh:

```text
Barang pecah
Barang hilang
Kesalahan pencatatan
Barang ditemukan
```

---

## 33. Adjustment reason wajib

Manual adjustment membutuhkan reason.

Contoh:

```text
Adjustment:
-5 PCS

Reason:
"Barang rusak di rak"
```

---

## 34. Adjustment Reason Codes

Recommended:

```text
DAMAGED
LOST
FOUND
DATA_CORRECTION
EXPIRED
OTHER
```

`EXPIRED` boleh tersedia sebagai reason walaupun lot-expiry tracking belum diimplementasikan.

---

## 35. Manual Adjustment permission

Gunakan permission:

```text
inventory.adjust
```

Owner dapat.

Admin sesuai role preset.

Cashier tidak melakukan arbitrary inventory adjustment.

---

## 36. High-value adjustment warning

System dapat memiliki configurable threshold.

Contoh:

```text
Adjustment value > Rp1.000.000
```

→ Owner Attention.

Tidak harus membutuhkan approval pada v2, tetapi audit dan exception visibility diperlukan.

---

## 37. Stock Opname

Stock Opname adalah proses membandingkan:

```text
System Quantity
vs
Physical Quantity
```

---

## 38. Opname tidak overwrite balance

Contoh:

```text
System:
100

Physical:
96
```

Jangan:

```text
stock = 96
```

Buat:

```text
OPNAME_ADJUSTMENT_OUT
-4
```

---

## 39. Opname surplus

Contoh:

```text
System:
96

Physical:
100
```

menghasilkan:

```text
OPNAME_ADJUSTMENT_IN
+4
```

---

## 40. Opname snapshot

Stock Opname harus menyimpan:

```text
system_qty_snapshot
physical_qty
variance_qty
counted_by
counted_at
location
reason/notes
```

---

## 41. Opname session

Konsep:

```text
STOCK OPNAME SESSION
```

dapat berisi banyak Product.

Contoh:

```text
Opname 31 Aug 2026

120 Products counted
15 Variances
105 Matched
```

---

## 42. Opname status

Simple lifecycle:

```text
DRAFT
COUNTING
REVIEW
POSTED
CANCELLED
```

Stock baru berubah ketika variance diposting.

---

## 43. Recount

Sebelum POSTED, item discrepancy dapat dihitung ulang.

Contoh:

```text
First Count:
95

Recount:
100
```

Historical count attempt dapat disimpan bila diperlukan, tetapi final posted count adalah authority untuk adjustment session tersebut.

---

## 44. Blind Count future option

Architecture boleh mendukung nanti:

```text
Blind Count
```

di mana petugas tidak melihat system quantity.

Tidak wajib untuk current v2 UX.

---

## 45. Opname valuation

Variance menggunakan rule Domain 03:

```text
current valid MWA
```

untuk menghitung:

```text
Inventory Gain / Loss
```

---

## 46. Customer Return

Jika customer return disposition:

```text
RESTOCK
```

maka:

```text
CUSTOMER_RETURN +qty
```

Jika:

```text
NOT_RESTOCKED
```

tidak ada stock-in ke sellable inventory.

---

## 47. Supplier Return

Barang dikembalikan ke supplier:

```text
SUPPLIER_RETURN -qty
```

dan harus merujuk Purchase/Receipt bila memungkinkan.

---

## 48. Supplier Replacement

Barang pengganti:

```text
SUPPLIER_REPLACEMENT +qty
```

Return dan replacement adalah dua movements berbeda.

---

## 49. Void sebelum completion

Jika transaction belum finalized dan dibatalkan:

```text
no SALE movement
```

karena authoritative inventory belum berubah.

---

## 50. Void setelah completion

Jika completed transaction perlu dibatalkan, jangan delete `SALE`.

Gunakan reversing business event sesuai Domain 06.

Inventory harus mempunyai compensating movement.

---

## 51. Historical movement immutability

Posted Stock Movement tidak di-edit untuk mengubah quantity/reference.

Correction menggunakan movement baru yang mereferensikan event lama.

---

## 52. Reversal concept

Jika movement salah:

```text
Original:
STOCK_ADJUSTMENT_OUT -10
```

harus dapat dibuat:

```text
REVERSAL +10
```

atau correction event equivalent.

Original tetap ada.

---

## 53. Movement reference

Setiap movement sebaiknya mereferensikan source entity.

Contoh:

```text
PURCHASE_RECEIPT
→ receipt_id

SALE
→ transaction_id

CUSTOMER_RETURN
→ return_id

SUPPLIER_RETURN
→ supplier_return_id

OPNAME_ADJUSTMENT
→ opname_id
```

---

## 54. Idempotency requirement

Satu source event tidak boleh menghasilkan Stock Movement yang sama dua kali karena retry/sync.

Contoh:

```text
Transaction TX-100
```

tidak boleh menghasilkan:

```text
SALE -5
SALE -5
```

akibat reconnect.

Idempotency menjadi mandatory architecture requirement.

---

## 55. Inventory transaction atomicity

Untuk completed Sale:

```text
Transaction Finalized
+
Stock Movement
+
Sync Queue/Audit
```

harus diperlakukan secara atomik di local transactional boundary sejauh technology memungkinkan.

Jangan menghasilkan sale final tanpa corresponding inventory effect.

---

## 56. Offline inventory behavior

POS tetap dapat menjual saat offline.

Local inventory balance diperbarui berdasarkan transaksi lokal.

Ketika reconnect:

```text
sync
↓
idempotent reconciliation
```

dilakukan.

---

## 57. Offline stock adalah operational estimate

Dalam multi-device environment, offline device mungkin tidak mengetahui transaksi terbaru dari device lain.

UI tidak boleh menjanjikan bahwa stock balance offline selalu globally current.

Kita dapat menandai:

```text
Last Synced
```

atau stale-state indicator ketika relevan.

---

## 58. Inventory conflict principle

Business events jangan diselesaikan dengan:

```text
last write wins stock = X
```

Karena itu kita menggunakan ledger.

Dua device dapat menghasilkan movements berbeda yang kemudian digabungkan.

---

## 59. Inventory balance rebuild

System harus mempunyai kemampuan teknis untuk:

```text
rebuild balance from ledger
```

jika projection/cache tidak konsisten.

Tidak harus menjadi tombol normal user.

---

## 60. Inventory reconciliation diagnostic

Jika:

```text
cached_balance
≠
ledger_computed_balance
```

system harus menandai integrity issue dan memperbaiki projection secara controlled.

---

## 61. Product deactivation dengan stock

Product yang memiliki stock > 0 dan dinonaktifkan harus mendapat warning.

Contoh:

```text
⚠ Produk masih memiliki 24 PCS.
```

Owner/Admin tetap dapat deactivate dengan reason jika bisnis memang membutuhkan.

Stock history tetap ada.

---

## 62. Unit deactivation dengan stock history

Product Unit dapat inactive, tetapi Base Unit inventory tetap konsisten.

Historical transactions menggunakan unit snapshot lama.

---

## 63. Base Unit change

Setelah Product memiliki inventory movement, Base Unit tidak boleh diubah melalui normal edit.

Perlu controlled migration.

---

## 64. Conversion change

Conversion baru hanya berlaku untuk future events.

Historical stock movement base quantity tidak dihitung ulang.

---

## 65. Inventory Search

Back Office Inventory harus dapat dicari minimal melalui:

```text
Product Name
SKU
Barcode
```

Filter berguna:

```text
Low Stock
Out of Stock
Negative Stock
Category
Brand
Active/Inactive
```

---

## 66. Inventory Product Detail

Dalam Product context, Owner/Admin idealnya dapat melihat:

```text
Current Stock
Base Unit
Low Stock Threshold

Weighted Average Cost
Inventory Value

Recent Stock Movements
Last Purchase Receipt
Last Sale
Last Opname
```

---

## 67. Stock Movement History

History harus mudah menjawab:

> “Kenapa stok produk ini dari 100 menjadi 67?”

Contoh:

```text
+100 Opening
+40 Purchase
-25 Sale
-3 Adjustment
-45 Sale

Balance: 67
```

---

## 68. Running balance

UI history dapat menampilkan:

```text
Before
Movement
After
```

Contoh:

```text
100
-5 SALE
95
```

untuk investigasi lebih mudah.

Running balance dapat dihitung/projection, tidak wajib disimpan sebagai immutable fact.

---

## 69. Inventory alerts

Owner/Admin Attention dapat meliputi:

```text
Negative Stock
Low Stock
Large Adjustment
Unposted Opname
Inventory Integrity Issue
Products Never Counted
```

Tidak semuanya harus ada di MVP pertama, tetapi domain mendukungnya.

---

## 70. Stock Aging belum diperlukan

Tanpa lot/batch tracking, Kastur tidak boleh berpura-pura mengetahui umur setiap unit inventory secara presisi.

Purchase history dapat memberi insight, tetapi bukan authoritative stock aging.

---

## 71. Expiry future readiness

Current inventory engine tidak membutuhkan:

```text
batch_number
expiry_date
```

pada setiap stock movement.

Tetapi architecture harus memungkinkan future layer:

```text
Inventory Lot
```

---

## 72. Future lot allocation

Kelak:

```text
Product
Location
Lot
Quantity
Expiry
```

dapat ditambahkan.

Current ledger Product + Location architecture tidak boleh menghalangi extension tersebut.

---

## 73. FEFO bukan scope sekarang

Tidak ada requirement current:

```text
First Expired First Out
```

karena expiry/lot belum aktif.

---

## 74. Multi-location transfer bukan scope v2

Walaupun location-aware, belum implement:

```text
TRANSFER_OUT
TRANSFER_IN
```

sebagai user-facing workflow sekarang.

Schema/event taxonomy boleh disiapkan.

---

## 75. Inventory reservation bukan scope v2

Tidak ada requirement:

```text
reserved_stock
available_to_promise
```

untuk cart biasa.

Jika e-commerce/inventory reservation muncul nanti, dapat ditambahkan.

---

## 76. Inventory Cost Integration

Inventory Quantity dan Inventory Value tetap konsep terpisah tetapi terkoordinasi.

Movement dapat mempunyai cost linkage untuk Domain 03.

Contoh:

```text
movement_id
cost_event_id
```

atau equivalent relation.

---

## 77. Inventory does not calculate Selling Price

Inventory tidak mempunyai authority atas pricing.

Low stock atau negative stock tidak otomatis menaikkan selling price.

---

## 78. Pricing does not alter stock

Price activation tidak menghasilkan stock movement.

Domain isolation harus tetap jelas.

---

## 79. Cashier visibility

Cashier dapat melihat stok hanya sebatas operasional jika diaktifkan.

Contoh:

```text
Tersedia 8
Stok Rendah
```

Cashier tidak membutuhkan:

```text
Inventory Value
MWA
Stock Adjustment History
```

---

## 80. Owner visibility

Owner dapat melihat:

```text
Total Inventory Value
Negative Stock
Low Stock
Inventory Variance
Large Adjustments
Opname Results
```

serta detail Product.

---

## 81. Admin visibility

Admin dapat:

```text
View Inventory
Adjust Stock
Perform Opname
Review Movement
```

sesuai permissions.

---

## 82. Recommended permissions

Contoh:

```text
inventory.read
inventory.adjust
inventory.opname.create
inventory.opname.post
inventory.history.read
inventory.integrity.read
inventory.initial_stock.manage
```

Role bukan satu-satunya authority mechanism.

---

## 83. Audit requirements

Minimal audit:

```text
Initial Stock Created
Stock Adjustment Created
Opname Started
Opname Posted
Negative Sale Occurred
Movement Reversed
Inventory Projection Rebuilt
Product Deactivated With Stock
```

Purchase/Sale events juga tersedia dari source domain audit.

---

## 84. Inventory integrity rule

Tidak boleh ada Stock Movement tanpa:

```text
Product
Location
Quantity
Movement Type
Timestamp
Reference/Reason
```

Actor wajib jika movement berasal dari user action.

---

## 85. Transaction snapshot independence

Perubahan Product master setelah movement terjadi tidak mengubah historical:

```text
base_qty
conversion_snapshot
source transaction
```

---

## 86. Same Product multi-unit sales

Contoh:

```text
2 CARTON
+
5 PCS
```

dengan:

```text
1 CARTON = 40 PCS
```

inventory movement total:

```text
-85 PCS
```

boleh disimpan sebagai:

- per transaction line movement, atau
- aggregated transaction movement dengan detail linkage,

tetapi traceability per line harus tetap mungkin.

---

## 87. Recommended transaction-line movement

Lebih disarankan:

```text
1 transaction line
→ 1 inventory movement
```

untuk traceability.

Contoh:

```text
Line A: 2 CARTON → -80 PCS
Line B: 5 PCS    → -5 PCS
```

Daripada hanya:

```text
-85 PCS
```

tanpa konteks.

---

## 88. Bulk operations

Import opening inventory boleh menghasilkan banyak movements melalui one controlled import job.

Setiap Product tetap memperoleh traceable opening movement.

---

## 89. Import errors

Opening inventory import harus mendeteksi:

```text
Unknown SKU
Invalid Unit
Invalid Quantity
Duplicate Product Row
Missing Cost when required
```

dan menghasilkan report.

---

## 90. Stock Count Decimal

Untuk Product decimal:

```text
System:
12.75 KG

Physical:
12.40 KG
```

variance:

```text
-0.35 KG
```

harus didukung tanpa integer conversion.

---

## 91. Unit precision

Quantity precision dapat berbeda berdasarkan unit/Product configuration di masa depan.

Untuk current schema, gunakan decimal precision yang cukup tinggi dan validation pada application level.

---

## 92. Inventory reporting

Domain harus dapat mendukung laporan:

```text
Current Stock
Stock Value
Negative Stock
Low Stock
Stock Movement
Inventory Adjustment
Stock Opname Variance
Inventory Gain/Loss
Purchase In
Sales Out
Returns
```

---

## 93. Inventory movement report vs Sales report

Inventory movement report tidak menggantikan Sales report.

Contoh:

```text
SALE -5
```

menjelaskan quantity movement.

Revenue/payment tetap berasal dari Sales Domain.

---

## 94. No reconstructed fake history

Jika toko onboarding dengan stock 100 tetapi tidak mempunyai sejarah bagaimana stok tersebut diperoleh:

Kastur mencatat:

```text
INITIAL_STOCK +100
```

Jangan menciptakan fake purchases agar ledger terlihat lengkap.

---

## 95. Core invariants

Kita lock:

1. Stock Movement Ledger adalah sumber kebenaran inventory.
2. Stock Balance adalah projection dari ledger.
3. Tidak ada silent stock overwrite.
4. Semua movement dinormalisasi ke Base Unit.
5. Conversion snapshot historical dipertahankan.
6. Decimal quantity didukung.
7. Inventory selalu location-aware secara schema.
8. Current UX tetap single-store.
9. Accepted Purchase Receipt menambah stok.
10. Sale finalized mengurangi stok.
11. Cart tidak mengurangi stok.
12. Cart tidak reserve inventory pada v2.
13. Negative stock dapat diizinkan dengan warning.
14. Negative stock tidak otomatis di-reset.
15. Stock Adjustment wajib reason dan audit.
16. Stock Opname menghasilkan adjustment, bukan overwrite.
17. Customer Return hanya menambah stok jika disposition RESTOCK.
18. Supplier Return mengurangi stok.
19. Historical movement tidak diedit.
20. Correction menggunakan reversing/new business event.
21. Duplicate stock movement dari sync harus dicegah dengan idempotency.
22. Offline conflict tidak menggunakan last-write-wins balance.
23. Product master changes tidak mengubah historical inventory.
24. Base Unit tidak dapat diedit bebas setelah inventory activity.
25. Lot/expiry belum scope tetapi architecture future-ready.

---

## 96. Definition of Done

Domain Inventory dianggap benar jika kasus berikut berjalan.

### Opening Stock

```text
Opening:
100 PCS

Movement:
INITIAL_STOCK +100

Balance:
100
```

### Purchase

```text
2 CARTON
1 CTN = 40 PCS

Movement:
+80 PCS
```

### Sale

```text
Balance:
80

Sale:
5 PCS

Balance:
75
```

### Multi-unit Sale

```text
2 CARTON + 5 PCS
→ -85 PCS
```

### Negative Stock

```text
Balance:
2

Sale:
5

Balance:
-3
```

dengan warning + audit.

### Purchase after Negative Stock

```text
-3
+10
=
7
```

### Adjustment

```text
Damaged:
-4

reason required
```

### Stock Opname

```text
System:
100

Physical:
96

OPNAME_ADJUSTMENT_OUT:
-4
```

### Customer Return

```text
RESTOCK
→ +2
```

### Customer Return Damaged

```text
NOT_RESTOCKED
→ no stock increase
```

### Supplier Return

```text
1 CTN = 40 PCS
→ -40
```

### Partial Receipt

```text
Receipt 1 +60
Receipt 2 +40
```

### Offline duplicate prevention

```text
TX-100 sync retried

SALE movement applied once only
```

---

# Core invariant Domain 05

> **Kastur memperlakukan stok sebagai hasil dari rangkaian business events, bukan angka yang dapat diedit bebas. Setiap perubahan inventory harus dapat dijelaskan dari movement ledger, dinormalisasi ke Base Unit, terkait dengan sumber transaksinya, dan tetap konsisten saat offline maupun setelah sinkronisasi.**

Flow utama:

```text
INITIAL STOCK
      │
PURCHASE RECEIPT ──────┐
CUSTOMER RETURN ───────┤
SUPPLIER REPLACEMENT ──┤
                       ↓
               STOCK MOVEMENT LEDGER
                       ↓
                  STOCK BALANCE
                       ↑
SALE ──────────────────┤
SUPPLIER RETURN ───────┤
ADJUSTMENT ────────────┤
OPNAME VARIANCE ───────┘
```
