# Kastur Retail System — Business Rules v1
## Domain 06: Sales & POS Transaction

**Status:** Draft for Approval  
**Depends on:** Domain 01 Product Catalog, Domain 03 Costing & Inventory Valuation, Domain 04 Pricing, Margin & Price Governance, Domain 05 Inventory & Stock Control  
**Primary User:** Cashier  
**Supervisors:** Owner, Admin  
**Consumed by:** POS, Inventory, Reporting, Customer Return, Shift & Cash

---

## 1. Tujuan domain

Sales & POS harus mampu menjawab secara konsisten:

```text
Apa yang dibeli pelanggan?
Unit apa yang dijual?
Harga apa yang berlaku?
Tier/promo/diskon apa yang diterapkan?
Siapa kasirnya?
Kapan transaksi selesai?
Bagaimana pembayarannya?
Berapa stok yang harus berkurang?
Berapa COGS saat transaksi?
Bagaimana transaksi dikoreksi tanpa menghapus sejarah?
```

POS adalah **sales execution layer**, bukan tempat menentukan kebijakan margin atau cost.

---

## 2. POS menggunakan published commercial data

POS hanya menggunakan data yang telah dipublikasikan dari domain lain:

```text
Product
Product Unit
Barcode
Active Price Version
Price Tier
Promotion
Inventory availability
```

POS tidak menghitung:

```text
Target Margin
Pricing Reference Cost
Price Recommendation
Price Approval
```

---

## 3. Primary cashier flow

Flow utama:

```text
Open POS
↓
Scan / Search Product
↓
Add Product Unit to Cart
↓
Set Quantity
↓
Resolve Price
↓
Review Cart
↓
Payment
↓
Finalize Transaction
↓
Receipt
```

Flow harus dapat diselesaikan dengan sedikit perpindahan halaman.

---

## 4. Cashier landing

Cashier setelah login diarahkan langsung ke:

```text
POS / Kasir
```

bukan generic dashboard.

Kasir harus dapat mulai transaksi secepat mungkin.

---

## 5. Transaction lifecycle

Recommended technical lifecycle:

```text
DRAFT
↓
PAYMENT_PENDING
↓
COMPLETED
```

Alternate states:

```text
CANCELLED
VOIDED
REFUNDED_PARTIAL
REFUNDED_FULL
```

`REFUNDED_*` dapat berasal dari Return/Refund domain.

---

## 6. Draft transaction

`DRAFT` berarti cart masih dapat berubah.

Pada state ini:

- item dapat ditambah,
- quantity dapat diubah,
- item dapat dihapus,
- customer dapat dipilih,
- authorized discount dapat diubah,
- pembayaran belum final,
- stock belum dikurangi authoritative ledger.

---

## 7. Cart bukan completed transaction

Cart/draft tidak boleh dianggap sebagai sale.

Tidak boleh menghasilkan:

```text
SALE stock movement
final COGS
final revenue
```

sebelum transaction finalized.

---

## 8. No stock reservation by default

Sesuai Domain 05:

```text
Cart
≠ Stock Reservation
```

Menambahkan Product ke cart tidak mengunci stok.

---

## 9. Product search priority

POS lookup memprioritaskan:

```text
1. Barcode exact match
2. Product Name
3. SKU
```

Barcode exact match harus menjadi jalur tercepat.

---

## 10. Barcode resolves Product Unit

Barcode mengidentifikasi:

```text
Product
+
Product Unit
```

Contoh:

```text
Barcode A
→ Aqua 600ml / PCS

Barcode B
→ Aqua 600ml / CARTON
```

Kasir tidak perlu memilih unit ulang setelah barcode unit-specific ditemukan.

---

## 11. Unknown barcode

Jika barcode tidak ditemukan:

```text
BARCODE_NOT_FOUND
```

POS tidak boleh membuat Product baru secara otomatis.

Cashier dapat:

- mencoba search,
- membatalkan scan,
- meminta Admin memperbaiki catalog.

---

## 12. Product search result

Search result minimal menampilkan informasi operasional:

```text
Product Name
Unit
Selling Price / starting price
Stock indication if enabled
```

Cashier tidak melihat cost/margin.

---

## 13. Non-sellable Product Unit

Product Unit dengan:

```text
can_sell = false
```

tidak dapat ditambahkan ke normal POS sale.

---

## 14. Inactive Product

Product:

```text
INACTIVE
```

tidak boleh ditambahkan ke transaksi baru.

Historical transaction tetap valid.

---

## 15. Decimal quantity support

POS mendukung decimal quantity bila Product/Unit mengizinkan.

Contoh:

```text
0.5 KG
1.25 L
```

Default retail PCS tetap whole number.

---

## 16. Quantity validation

Quantity normal harus:

```text
> 0
```

Negative quantity tidak digunakan untuk customer return dalam cart sale biasa.

Return menggunakan dedicated return workflow.

---

## 17. Same Product Unit line merge

Jika Product Unit yang sama ditambahkan lagi dengan pricing context yang sama, POS sebaiknya:

```text
merge quantity
```

daripada menciptakan duplicate lines.

Contoh:

```text
5 PCS
+
7 PCS
→ 12 PCS
```

---

## 18. Line merge exceptions

Jangan merge jika line memiliki contextual difference yang memang harus dipertahankan, misalnya:

```text
different manual discount
different promotion lock/reference
different notes when business-relevant
```

---

## 19. Mixed Product Units remain separate

Contoh:

```text
Indomie PCS
+
Indomie CARTON
```

tetap menjadi dua cart lines untuk pricing.

Inventory nanti menormalisasi keduanya ke Base Unit.

---

## 20. POS price resolution

Default sequence mengikuti Domain 04:

```text
Active Base Price
↓
Applicable Quantity Tier
↓
Applicable Promotion
↓
Authorized Manual Discount
↓
Final Unit Price
```

---

## 21. Price resolution is deterministic

Input pricing context yang sama harus menghasilkan harga yang sama.

Tidak boleh ada harga berbeda karena screen berbeda.

---

## 22. Same-unit quantity tier aggregation

Quantity tier menggunakan effective quantity Product Unit yang sama.

Contoh:

```text
5 PCS + 7 PCS
= 12 PCS
```

Jika tier:

```text
10+ = Rp3.300
```

maka Rp3.300 berlaku.

---

## 23. Cross-unit tier independence

Contoh:

```text
1 CARTON = 40 PCS
```

tidak berarti 1 CARTON otomatis menggunakan PCS tier 40+.

Pricing tetap per Product Unit.

---

## 24. Price tier recalculation in cart

Jika quantity berubah:

```text
9 PCS → 10 PCS
```

POS harus mengevaluasi tier kembali.

Jika kembali:

```text
10 PCS → 8 PCS
```

tier juga dievaluasi kembali.

---

## 25. Promotion resolution

Promotion hanya berlaku jika:

```text
active at transaction time
Product Unit eligible
conditions met
```

Jika beberapa Promotion cocok, gunakan deterministic conflict rule Domain 04.

---

## 26. Promotion transparency

Cart line harus dapat menjelaskan:

```text
Harga Normal
Harga Tier
Promo
Diskon Manual
Harga Akhir
```

tanpa membuat cashier melihat detail margin.

---

## 27. Manual Discount

Manual discount hanya tersedia jika user mempunyai permission dan berada dalam limit.

Contoh:

```text
Cashier limit:
5%
```

---

## 28. Discount types

Minimal v2 dapat mendukung:

```text
PERCENT
FIXED_AMOUNT
```

baik per-line maupun transaction-level jika diaktifkan.

---

## 29. Transaction-level discount allocation

Jika transaction-level discount digunakan, reporting/snapshot harus dapat mengalokasikan nilai discount ke lines secara deterministik.

Recommended default:

```text
PROPORTIONAL_BY_LINE_NET_VALUE
```

---

## 30. Manual price edit prohibited for Cashier

Cashier tidak boleh bebas:

```text
Rp10.000 → Rp8.000
```

melalui generic price field.

Gunakan:

```text
Manual Discount
```

atau authorized override workflow.

---

## 31. Floor Price guard

Jika discount/promotion menghasilkan harga di bawah Floor Price:

- normal Cashier diblokir,
- user dengan override permission dapat melanjutkan,
- reason + audit wajib.

---

## 32. Negative stock warning

Jika requested quantity melebihi local stock:

```text
Stock:
2

Cart:
5
```

POS menampilkan warning.

Jika business policy mengizinkan:

```text
Continue
```

tetap tersedia.

---

## 33. Negative stock warning timing

Warning dapat diberikan saat:

```text
quantity edit
```

dan harus diverifikasi kembali saat finalization.

Hal ini penting karena stock local dapat berubah selama cart terbuka.

---

## 34. Out-of-stock does not necessarily block

`OUT_OF_STOCK` mengikuti business negative-stock policy.

Jangan hardcode selalu block.

---

## 35. Cart subtotal

Cart harus menghitung secara deterministik:

```text
Gross Subtotal
Tier Adjustment
Promotion Discount
Manual Discount
Tax if applicable
Grand Total
```

---

## 36. Money precision

Calculation menggunakan decimal arithmetic.

Display menggunakan IDR formatting.

Jangan menggunakan binary floating point tanpa kontrol untuk money calculation.

---

## 37. Tax treatment

POS mengikuti published tax configuration:

```text
NO_PPN
TAX_INCLUDED
TAX_EXCLUDED
```

POS tidak menentukan policy sendiri.

---

## 38. Customer optional

Normal retail transaction tidak wajib memiliki Customer.

Transaction dapat:

```text
customer_id = null
```

Customer dapat dipilih jika dibutuhkan.

---

## 39. Walk-in customer

Tanpa customer selection, transaction diperlakukan sebagai:

```text
Walk-in / General Customer
```

tanpa menciptakan fake customer record setiap transaksi.

---

## 40. Customer attachment before completion

Customer dapat dipilih/diganti selama transaction masih DRAFT.

Setelah completion, perubahan customer harus melalui controlled correction jika memang diizinkan.

---

## 41. Payment is required for normal completion

Normal sale tidak menjadi `COMPLETED` sampai payment requirement terpenuhi.

Credit/customer receivable sale bukan default v2 unless explicitly added later.

---

## 42. Payment methods

Minimal POS mendukung configuration untuk:

```text
CASH
QRIS
BANK_TRANSFER
OTHER
```

Method dapat diaktif/nonaktifkan melalui business settings.

---

## 43. Split payment readiness

Architecture sebaiknya mendukung lebih dari satu payment record per transaction.

Contoh:

```text
Total Rp100.000

Cash Rp60.000
QRIS Rp40.000
```

Jika UI split payment belum diprioritaskan, schema tetap tidak boleh membatasi satu payment selamanya.

---

## 44. Cash payment

Untuk CASH:

```text
amount_tendered
change_due
```

dihitung.

Contoh:

```text
Total:
Rp37.000

Cash:
Rp50.000

Change:
Rp13.000
```

---

## 45. Insufficient payment

Normal transaction tidak dapat completed jika:

```text
total valid payment < amount_due
```

kecuali future payment/credit workflow explicitly exists.

---

## 46. Overpayment

Cash dapat melebihi amount due karena change.

Non-cash overpayment harus divalidasi sesuai payment method rules.

---

## 47. Payment reference

Non-cash payment dapat menyimpan:

```text
reference
provider
notes
```

sesuai kebutuhan.

---

## 48. Payment confirmation

POS v2 dapat membedakan:

```text
payment entered
```

dan:

```text
transaction finalized
```

agar kasir dapat membatalkan sebelum final confirmation.

---

## 49. Finalization boundary

Saat user menekan final confirmation:

```text
Transaction
+
Transaction Items
+
Payments
+
Pricing Snapshots
+
Cost Snapshots
+
Inventory Movements
+
Audit/Sync Event
```

harus diperlakukan sebagai satu business commit.

---

## 50. Atomic local transaction

Pada local database, finalization harus atomic sejauh technology mendukung.

Tidak boleh ada kondisi:

```text
Transaction COMPLETED
```

tetapi:

```text
SALE movement missing
```

atau sebaliknya.

---

## 51. Transaction Item snapshot

Setiap completed line minimal menyimpan:

```text
product_id
product_name_snapshot

product_unit_id
unit_name_snapshot

quantity
conversion_snapshot
base_quantity

base_price_snapshot
tier_snapshot
promotion_snapshot
manual_discount_snapshot
final_unit_price_snapshot

cost_snapshot
tax_snapshot
```

---

## 52. Cost snapshot

Pada completion, transaction item menggunakan cost sesuai Domain 03.

Jika stock negatif:

```text
provisional COGS
```

boleh digunakan dan nanti direkonsiliasi tanpa menghapus original snapshot.

---

## 53. Historical transaction immutability

Perubahan setelahnya terhadap:

```text
Product Name
Barcode
Unit
Price
Cost
Promotion
```

tidak mengubah historical transaction.

---

## 54. Transaction number

Setiap completed transaction harus memiliki human-readable transaction number.

Contoh:

```text
TRX-20260816-000123
```

Format final ditentukan architecture/config.

Internal immutable ID tetap terpisah.

---

## 55. Internal ID vs display number

Gunakan:

```text
transaction_id
→ immutable unique technical ID

transaction_number
→ human-readable business reference
```

Jangan gunakan display number sebagai database identity tunggal.

---

## 56. Offline transaction identity

Transaction ID harus dapat dibuat secara aman ketika offline.

Gunakan collision-resistant identifier.

---

## 57. Offline transaction numbering

Human-readable sequential numbering tidak boleh membuat offline sale gagal.

Jika strict global sequential number sulit dijamin offline:

- gunakan device/local sequence component, atau
- assign display-safe provisional/final scheme.

Jangan korbankan offline sale hanya demi sequence cantik.

---

## 58. Transaction timestamp

Simpan minimal:

```text
created_at
completed_at
```

dan sync metadata.

Jika offline, system harus dapat membedakan:

```text
business event time
```

dari:

```text
server received time
```

---

## 59. Cashier snapshot/reference

Completed transaction menyimpan:

```text
cashier_user_id
```

dan optional display snapshot bila diperlukan.

Historical sale tetap dapat menunjukkan kasir meskipun user later inactive.

---

## 60. Location reference

Transaction menyimpan:

```text
location_id
```

walaupun v2 single-store UX.

---

## 61. Shift reference

Jika Shift Domain aktif, transaction harus terkait:

```text
shift_id
```

untuk cashier/terminal context sesuai Domain 07.

---

## 62. Completed transaction

`COMPLETED` berarti:

```text
payment accepted
commercial snapshot finalized
inventory movement committed
transaction no longer editable as draft
```

---

## 63. Completed transaction cannot be edited casually

Jangan menyediakan:

```text
Edit Completed Transaction
→ Save
```

untuk mengganti item, qty, atau payment history.

Gunakan correction/reversal workflows.

---

## 64. Cancel draft

DRAFT transaction dapat:

```text
CANCELLED
```

tanpa stock movement atau revenue.

Cancel reason dapat diwajibkan berdasarkan policy.

---

## 65. Clear cart vs Cancel transaction

Jika cart belum pernah persisted sebagai meaningful draft, clear cart boleh menjadi UI action sederhana.

Jika draft sudah persisted/auditable, cancellation state dapat disimpan.

---

## 66. Void concept

Void harus dibedakan berdasarkan kapan dilakukan.

### Pre-completion cancellation

Tidak ada completed sale.

### Post-completion void

Harus menjadi reversing event.

---

## 67. Post-completion Void

Completed transaction tidak dihapus.

Void membuat:

```text
VOID event
```

yang mereferensikan original transaction.

---

## 68. Void inventory effect

Jika original transaction menghasilkan:

```text
SALE -5
```

valid void/restoration menghasilkan compensating movement:

```text
VOID_REVERSAL +5
```

atau equivalent return/reversal event.

---

## 69. Void payment effect

Void harus menghasilkan payment reversal/cash effect sesuai Domain 07.

Jangan sekadar mengubah status transaksi tanpa memperbaiki kas/payment state.

---

## 70. Void permission

Recommended permission:

```text
transaction.void
```

Cashier normal dapat dibatasi.

Owner/Admin memiliki authority lebih tinggi.

---

## 71. Void reason required

Post-completion void wajib:

```text
reason
actor
timestamp
original_transaction
```

---

## 72. Void vs Return

`VOID` dan `CUSTOMER_RETURN` berbeda.

Void biasanya digunakan untuk pembatalan/correction transaction secara keseluruhan sesuai business policy.

Return digunakan ketika pelanggan mengembalikan sebagian/seluruh barang setelah sale.

---

## 73. Partial return is not void

Jika hanya 1 dari 5 item kembali:

```text
Customer Return
```

bukan void original transaction.

---

## 74. Return linkage

Domain 06 harus menyediakan transaction/line identity agar Domain Return dapat merujuk:

```text
transaction_id
transaction_item_id
original_qty
already_returned_qty
```

---

## 75. Return quantity protection

Total return quantity untuk satu transaction line tidak boleh melebihi original sold quantity setelah memperhitungkan return sebelumnya.

---

## 76. Receipt

Completed transaction dapat menghasilkan receipt.

Receipt menggunakan historical snapshots, bukan current Product/Price data.

---

## 77. Receipt content

Minimal:

```text
Business Name
Transaction Number
Date/Time
Cashier
Items
Qty × Unit Price
Discount/Promotion
Total
Payment Method
Amount Paid
Change
```

Tax detail bila berlaku.

---

## 78. Receipt reprint

Reprint tidak membuat transaction baru.

Audit dapat mencatat reprint jika diperlukan.

---

## 79. Receipt correction prohibited

Receipt tidak boleh diedit independen dari transaction.

Jika business transaction salah, koreksi transaction melalui workflow yang benar.

---

## 80. Hold/Suspend Cart

POS sebaiknya siap mendukung:

```text
SUSPENDED / HELD CART
```

agar kasir dapat melayani pelanggan lain tanpa kehilangan cart.

Jika implementasi awal ingin sederhana, fitur dapat staged tetapi schema draft sebaiknya tidak menutup kemungkinan.

---

## 81. Held cart does not affect inventory

Sama seperti DRAFT:

```text
HELD CART
≠ stock reservation
≠ sale
```

---

## 82. Multiple open carts

Jika fitur hold digunakan, satu cashier/device dapat mempunyai beberapa draft/held cart.

POS harus mencegah kebingungan dengan clear customer/time/reference display.

---

## 83. Cart expiry

Old abandoned drafts dapat dibersihkan/archived dengan policy.

Jangan biarkan draft lama dianggap transaksi bisnis final.

---

## 84. Offline-first sale

Cashier dapat:

```text
Search cached catalog
Resolve cached published price
Create transaction
Accept configured offline-capable payment
Finalize sale
Update local inventory
```

tanpa koneksi internet.

---

## 85. Offline payment constraints

Tidak semua payment provider dapat diverifikasi offline.

Payment method dapat memiliki capability:

```text
offline_allowed = true/false
```

Contoh CASH biasanya offline-safe.

QRIS/provider-specific behavior ditentukan oleh integration capability, bukan diasumsikan berhasil offline.

---

## 86. Stale pricing indication

Jika pricing cache mungkin tidak terbaru:

```text
Last Synced
```

atau warning dapat ditampilkan.

Tetapi POS menggunakan versioned pricing cache yang telah berhasil diterima.

---

## 87. Offline finalized transaction remains final locally

Setelah sale selesai offline:

```text
COMPLETED_LOCAL
```

secara business tidak boleh hilang hanya karena belum tersinkron.

Sync status terpisah dari transaction business status.

---

## 88. Business status ≠ Sync status

Contoh:

```text
Transaction Status:
COMPLETED

Sync Status:
PENDING
```

valid.

Jangan menggunakan satu field status untuk keduanya.

---

## 89. Recommended sync states

Conceptual:

```text
PENDING
SYNCING
SYNCED
FAILED
CONFLICT
```

Sync domain akan memformalkan detail nanti.

---

## 90. Idempotent transaction sync

Retry tidak boleh menciptakan duplicate transaction.

Gunakan stable:

```text
transaction_id
idempotency_key
```

atau equivalent.

---

## 91. Idempotent inventory sync

Original completed sale hanya boleh menghasilkan inventory movement sekali.

Retry transaction sync tidak boleh menggandakan `SALE`.

---

## 92. Duplicate payment protection

Sync/retry juga tidak boleh menggandakan payment record.

---

## 93. Device identity

Offline transaction sebaiknya dapat ditelusuri ke:

```text
device_id
```

untuk audit, reconciliation, dan numbering strategy.

---

## 94. POS session context

Operational context dapat mencakup:

```text
user_id
device_id
location_id
shift_id
```

Transaction mengambil snapshot/reference dari context tersebut.

---

## 95. Price changes while cart is open

Jika harga baru menjadi efektif setelah line sudah ditambahkan:

```text
existing line retains price snapshot
```

Jangan repricing diam-diam.

---

## 96. Explicit Reprice action

Jika business membutuhkan, user dengan appropriate flow dapat:

```text
Refresh / Reprice Cart
```

secara eksplisit sebelum payment.

Action harus jelas karena dapat mengubah total pelanggan.

---

## 97. New line after price change

Line baru setelah effective price tersedia menggunakan pricing version terbaru yang diketahui POS.

Satu cart secara teknis dapat memiliki line dari version berbeda jika transaksi berlangsung melewati activation boundary.

Snapshot menjaga kejelasan.

---

## 98. Promotion ending while cart open

Line yang sudah memperoleh promotion snapshot tidak berubah diam-diam hanya karena waktu promo habis saat cart masih aktif.

Explicit reprice/finalization policy harus deterministic.

Default v2:

```text
lock pricing at line addition / last explicit quantity re-evaluation
```

---

## 99. Quantity edit can trigger re-evaluation

Jika cashier mengubah quantity line, pricing dapat dievaluasi kembali karena tier qualification berubah.

Ini dianggap explicit user action, bukan silent background repricing.

---

## 100. Cart-level totals refresh

Setelah line modification:

```text
Add
Remove
Qty Change
Discount Change
Customer-dependent future rule
```

total dihitung ulang deterministic.

---

## 101. Non-inventory Product Sale

Product dengan:

```text
track_inventory = false
```

dapat dijual normal.

Tidak menghasilkan stock movement.

Tetap menghasilkan:

```text
transaction item
revenue
payment
```

---

## 102. Product becoming inactive while offline

Jika offline cache masih menandai Product active tetapi server sebenarnya sudah inactive, completed offline sale tetap harus direkonsiliasi sebagai historical business event.

System dapat menandai policy/integrity exception setelah sync.

Jangan menghapus sale yang benar-benar terjadi.

---

## 103. Price version conflict after offline sync

Jika offline POS menggunakan valid cached version tetapi server memiliki newer version yang belum tersinkron:

Historical transaction tetap mempertahankan harga yang benar-benar diberikan kepada customer.

System dapat mencatat stale-pricing exception untuk review.

Jangan retroactively mengubah transaksi.

---

## 104. Cashier cannot see margin/cost

POS cashier view tidak menampilkan:

```text
MWA
Pricing Reference Cost
Gross Margin
Supplier Cost
```

---

## 105. Supervisor operational visibility

Owner/Admin dapat melihat detail transaksi lebih lengkap sesuai permission.

Tetapi historical commercial snapshot tetap sama untuk semua role.

---

## 106. Transaction search

History minimal dapat dicari melalui:

```text
Transaction Number
Date/Time
Cashier
Product
Customer if attached
```

Filter:

```text
Completed
Voided
Returned
Payment Method
```

---

## 107. Cashier transaction history scope

Cashier dapat dibatasi ke:

```text
own current shift
own recent transactions
```

sesuai permission.

Owner/Admin dapat melihat cakupan lebih luas.

---

## 108. Transaction details

Detail completed sale harus dapat menjawab:

```text
Apa itemnya?
Berapa quantity?
Unit apa?
Harga dasar?
Tier?
Promo?
Diskon?
Harga akhir?
Payment?
Kasir?
Shift?
Inventory effect?
```

Cost/margin hanya tampil kepada role berpermission.

---

## 109. No delete completed transaction

Completed sale tidak pernah hard delete melalui normal UI.

Gunakan:

```text
VOID
RETURN
CORRECTION
```

sesuai kasus.

---

## 110. Audit events

Minimal audit:

```text
Transaction Created
Item Added
Manual Discount Applied
Floor Override Applied
Payment Added
Transaction Completed
Transaction Cancelled
Transaction Voided
Receipt Reprinted
Cart Repriced
Offline Transaction Synced
Sync Conflict Detected
```

Tidak semua cart keystroke harus menjadi audit event; fokus pada meaningful business actions.

---

## 111. Recommended permissions

Contoh:

```text
pos.use
transaction.create
transaction.complete
transaction.history.read
transaction.void
transaction.reprice
discount.apply
discount.override
receipt.reprint
customer.attach
```

Role adalah preset, bukan satu-satunya authority source.

---

## 112. Error recovery before completion

Jika error terjadi sebelum business commit final:

```text
transaction remains DRAFT
```

dan cashier dapat mencoba lagi.

Jangan menandai completed sebagian.

---

## 113. Error recovery after local commit

Jika local completion berhasil tetapi sync gagal:

```text
Transaction remains COMPLETED
Sync = FAILED/PENDING
```

Cashier tidak mengulangi sale.

Sync layer yang retry.

---

## 114. Finalization idempotency

Menekan tombol Bayar/Selesai dua kali tidak boleh menghasilkan dua transaction.

Finalization harus memiliki guard/idempotency boundary.

---

## 115. Payment button protection

UI harus mencegah accidental double submit melalui:

```text
processing state
disabled duplicate action
idempotent command
```

tetapi correctness tidak boleh bergantung pada UI saja.

---

## 116. Transaction total invariant

Untuk completed transaction:

```text
Grand Total
=
Σ Final Line Total
+ applicable tax/charges
- transaction-level adjustments
```

Payment reconciliation harus sesuai total tersebut.

---

## 117. Line total invariant

Conceptually:

```text
Line Total
=
Final Unit Price × Quantity
```

dengan rounding/tax behavior mengikuti published rules.

Discount/tier/promotion breakdown harus tetap traceable.

---

## 118. Stock movement invariant

Untuk setiap completed inventory-tracked transaction line:

```text
Base Quantity Sold
=
Quantity × Conversion Snapshot
```

menghasilkan corresponding `SALE` movement satu kali.

---

## 119. COGS invariant

Setiap completed line yang relevan mempunyai cost snapshot atau provisional cost state sesuai Domain 03.

Tidak boleh silently `cost = 0` jika barang memiliki economic cost tetapi cost missing.

Exception harus terlihat.

---

## 120. Price snapshot invariant

Final selling price tidak dihitung ulang dari current price ketika historical report dibuka.

Gunakan transaction snapshot.

---

## 121. Refund is separate financial event

Customer refund tidak menghapus original payment.

Refund menghasilkan explicit financial event yang merujuk original transaction/return.

Detail akan diformalisasikan pada Customer Return & Refund domain.

---

## 122. Exchange readiness

Arsitektur harus memungkinkan future/simple exchange sebagai kombinasi:

```text
Return
+
New Sale
```

daripada mengubah original transaction.

---

## 123. Non-goals Domain 06 v2

Belum termasuk:

```text
Complex layaway
Customer credit ledger
Installment sales
E-commerce order reservation
Table service / restaurant order flow
Kitchen display
Complex coupon engine
Marketplace order orchestration
Multi-currency checkout
Advanced loyalty redemption
```

---

## 124. Core Invariants

Kita lock:

1. POS adalah sales execution layer.
2. Cashier landing langsung ke POS.
3. DRAFT cart bukan sale.
4. Cart tidak mengurangi atau reserve stock.
5. Barcode resolve Product Unit.
6. Quantity dapat decimal jika Unit mengizinkan.
7. Same Product Unit quantity digabung untuk tier pricing.
8. Cross-unit pricing tetap independen.
9. Price resolution mengikuti Base Price → Tier → Promotion → Manual Discount.
10. Cashier tidak boleh bebas mengedit harga.
11. Manual discount dikontrol permission/limit.
12. Floor Price dijaga sebelum completion.
13. Negative stock dapat dilanjutkan jika policy mengizinkan.
14. Customer tidak wajib untuk normal walk-in sale.
15. Transaction dapat mempunyai multiple payment records secara schema.
16. Completed transaction memerlukan valid payment.
17. Finalization harus atomic secara local business transaction.
18. Completed sale menghasilkan SALE movement tepat sekali per inventory line.
19. Transaction Item menyimpan product/unit/pricing/cost snapshots.
20. Completed transaction tidak diedit casual.
21. Post-completion correction menggunakan Void/Return/Reversal.
22. Original completed transaction tidak dihapus.
23. Business status dan Sync status terpisah.
24. Offline completed sale tetap final secara lokal.
25. Sync retry harus idempotent.
26. Existing cart tidak direprice diam-diam ketika price version berubah.
27. Historical sale tidak berubah karena Product/Price/Cost master berubah.
28. Non-inventory Product dapat dijual tanpa stock movement.
29. Cashier tidak melihat cost/margin.
30. Transaction identity harus aman dibuat offline.

---

## 125. Definition of Done

Domain Sales & POS dianggap benar jika kasus berikut dapat ditangani.

### Barcode Sale

```text
Scan Barcode
→ Product Unit found
→ Add to cart
→ Price resolved
```

### Search Sale

```text
Search "Indomie"
→ select PCS
→ add qty
```

### Quantity Tier

```text
Qty 9
→ retail tier

Qty changed to 10
→ 10+ tier
```

### Same-unit Aggregation

```text
5 PCS + 7 PCS
→ 12 PCS
→ same-unit tier applies
```

### Mixed Unit

```text
5 PCS + 1 CARTON
→ separate pricing
→ combined base stock impact
```

### Promotion

```text
Active Base Price
→ active Promo
→ promotional line price
```

### Manual Discount

```text
Cashier within limit
→ accepted
```

### Floor Violation

```text
Discount below Floor
→ blocked for normal Cashier
→ override user may continue with reason
```

### Cash Payment

```text
Total Rp37.000
Cash Rp50.000
Change Rp13.000
→ Completed
```

### Split-payment-ready schema

```text
Total Rp100.000
Cash Rp60.000
QRIS Rp40.000
→ payments sum to total
```

### Normal Inventory Sale

```text
Sell 5 PCS
→ transaction completed
→ SALE -5 once
```

### Negative Inventory Sale

```text
Stock 2
Sell 5
→ warning
→ complete if allowed
→ Balance -3
```

### Non-inventory Sale

```text
Biaya Kirim
→ revenue/payment
→ no stock movement
```

### Cancel Draft

```text
Cart created
→ Cancel
→ no stock/revenue
```

### Void Completed Sale

```text
Original completed transaction retained
→ Void event
→ payment reversal
→ inventory compensating movement
```

### Customer Return Linkage

```text
Original line sold qty 5
→ return workflow can reference line
→ cannot return > remaining returnable qty
```

### Price Change While Cart Open

```text
Line added at Rp10.000
New price activates Rp11.000
→ existing line remains Rp10.000
```

### Offline Sale

```text
Offline
→ cached catalog/price
→ cash payment
→ completed locally
→ stock updated locally
→ sync pending
```

### Sync Retry

```text
Same transaction retried
→ no duplicate transaction
→ no duplicate payment
→ no duplicate SALE movement
```

---

# Core invariant Domain 06

> **Kastur POS mengeksekusi penjualan menggunakan catalog dan pricing yang telah dipublikasikan, lalu membekukan fakta transaksi pada saat completion. Cart bukan transaksi final; completed sale tidak pernah di-overwrite. Payment, pricing snapshot, cost snapshot, dan inventory movement harus terikat dalam satu business commit yang idempotent dan tetap aman saat offline.**

Flow utama:

```text
PRODUCT / BARCODE
       ↓
      CART
       ↓
QUANTITY + UNIT
       ↓
PRICE RESOLUTION
├── BASE PRICE
├── QUANTITY TIER
├── PROMOTION
└── MANUAL DISCOUNT
       ↓
PAYMENT
       ↓
FINALIZE
       ↓
COMPLETED TRANSACTION
├── PRICING SNAPSHOT
├── COST SNAPSHOT
├── PAYMENT RECORD
├── SALE STOCK MOVEMENT
├── RECEIPT
└── SYNC EVENT
```
