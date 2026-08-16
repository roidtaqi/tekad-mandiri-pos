# Kastur Retail System — Business Rules v1
## Domain 07: Shift, Cash & Payment Control

**Status:** Draft for Approval  
**Depends on:** Domain 06 Sales & POS Transaction  
**Primary User:** Cashier  
**Supervisors:** Owner, Admin  
**Consumed by:** POS, Reporting, Audit

---

## 1. Tujuan domain

Shift, Cash & Payment Control harus mampu menjawab:

```text
Siapa yang sedang bertugas?
Kapan shift dibuka?
Berapa kas awal?
Berapa transaksi selama shift?
Berapa pembayaran tunai?
Berapa pembayaran non-tunai?
Berapa cash movement di luar penjualan?
Berapa expected cash?
Berapa actual cash?
Apakah ada selisih?
Siapa yang menutup shift?
Apakah shift sudah direview?
```

Domain ini memisahkan:

```text
Sales
Payment
Cash Drawer
Shift
```

sebagai konsep yang saling berhubungan tetapi tidak sama.

---

## 2. Shift sebagai operational boundary

Shift adalah periode kerja operasional kasir.

Concept:

```text
SHIFT
├── opened_by
├── opened_at
├── opening_cash
├── transactions
├── cash_movements
├── payments
├── closed_by
├── closed_at
└── reconciliation
```

---

## 3. Shift diperlukan untuk Cashier POS

Cashier normal harus mempunyai active shift sebelum melakukan completed POS sale.

Flow:

```text
Login
↓
Open Shift
↓
POS
↓
Sales
↓
Close Shift
```

Owner/Admin dapat memiliki controlled override sesuai permission.

---

## 4. Shift lifecycle

Recommended lifecycle:

```text
OPEN
↓
CLOSING
↓
CLOSED
```

Alternative state:

```text
FORCED_CLOSED
```

bila supervisor harus menutup shift yang ditinggalkan.

---

## 5. One active shift per cashier context

Untuk satu:

```text
user
+
device/terminal
+
location
```

jangan ada dua active shift yang ambigu secara normal.

System harus mencegah accidental duplicate shift opening.

---

## 6. Shift identity

Gunakan:

```text
shift_id
```

immutable technical identifier.

Optional human-readable reference:

```text
SHF-20260816-001
```

Display number tidak menjadi database primary key.

---

## 7. Shift context

Shift minimal terkait:

```text
user_id
location_id
device_id
opened_at
```

Jika terminal concept digunakan, dapat ditambah:

```text
terminal_id
```

---

## 8. Opening cash

Saat membuka shift, Cashier memasukkan:

```text
opening_cash
```

Contoh:

```text
Rp500.000
```

Nilai ini menjadi starting cash-drawer balance.

---

## 9. Opening cash is not revenue

Opening Cash bukan penjualan dan bukan income.

Itu adalah:

```text
cash drawer opening balance
```

Reporting revenue tidak boleh memasukkannya.

---

## 10. Opening cash reason/source

Jika opening cash berasal dari float/till fund bisnis, record cukup mencatat:

```text
amount
opened_by
opened_at
```

Optional:

```text
source_note
```

---

## 11. Opening cash validation

Opening cash:

```text
>= 0
```

Negative opening cash tidak valid.

---

## 12. Opening cash visibility

Cashier melihat nilai opening cash miliknya.

Owner/Admin dapat melihat semua shift sesuai permission.

---

## 13. Active shift and POS transaction

Setiap completed POS transaction harus menyimpan:

```text
shift_id
```

jika transaksi dijalankan dalam cashier shift context.

---

## 14. Shift cannot own historical transaction after move

Transaction tidak boleh dipindahkan antar-shift secara casual setelah completed.

Jika reference salah, gunakan controlled correction/audit.

---

## 15. Payment record belongs to transaction

Payment record tetap authoritative di Sales/Payment context.

Shift mengagregasikan payment records berdasarkan:

```text
shift_id
```

Jangan membuat duplicate payment truth khusus Shift.

---

## 16. Payment methods

Minimal:

```text
CASH
QRIS
BANK_TRANSFER
OTHER
```

Business settings menentukan metode aktif.

---

## 17. Payment method capability

Payment Method dapat memiliki metadata seperti:

```text
is_cash
offline_allowed
requires_reference
```

Contoh:

```text
CASH
is_cash = true
offline_allowed = true
```

---

## 18. Cash vs non-cash

Cash drawer hanya dipengaruhi metode:

```text
is_cash = true
```

Pembayaran QRIS/Transfer tidak menambah physical drawer cash.

---

## 19. Cash sale effect

Contoh:

```text
Sale Total:
Rp37.000

Cash Tendered:
Rp50.000

Change:
Rp13.000
```

Cash drawer impact:

```text
+Rp37.000
```

bukan +Rp50.000.

---

## 20. Change is not separate expense

Change merupakan bagian dari cash payment settlement.

Jangan catat:

```text
cash received +50.000
cash expense -13.000
```

sebagai dua business events terpisah untuk normal sale.

Net drawer effect = sale amount paid in cash.

---

## 21. Split payment

Jika transaction:

```text
Total Rp100.000

Cash Rp60.000
QRIS Rp40.000
```

Cash drawer effect:

```text
+Rp60.000
```

Non-cash report:

```text
QRIS +Rp40.000
```

---

## 22. Payment reconciliation by method

Shift summary harus memisahkan:

```text
Cash
QRIS
Bank Transfer
Other
```

Jangan hanya menunjukkan total sales.

---

## 23. Cash Movement

Selain sale, physical drawer dapat berubah karena:

```text
CASH_IN
CASH_OUT
```

---

## 24. Cash In

Cash In digunakan untuk uang masuk drawer yang bukan sales revenue.

Contoh:

```text
Additional cash float
Cash top-up
Operational cash return
```

---

## 25. Cash Out

Cash Out digunakan untuk uang keluar drawer yang bukan customer change normal.

Contoh:

```text
Petty cash expense
Cash deposit/removal
Emergency purchase
```

Penggunaan detail akan ditentukan policy bisnis.

---

## 26. Cash movement is not sale

`CASH_IN` dan `CASH_OUT` tidak mengubah sales revenue.

Mereka hanya memengaruhi cash drawer reconciliation.

---

## 27. Cash movement reason required

Setiap Cash In/Out wajib mempunyai:

```text
amount
reason
actor
timestamp
shift_id
```

Optional:

```text
reference
attachment
```

---

## 28. Cash movement reason codes

Recommended:

```text
FLOAT_TOP_UP
CASH_REMOVAL
PETTY_CASH
SAFE_DROP
EXPENSE
CORRECTION
OTHER
```

---

## 29. Cash Out permissions

Cashier dapat dibatasi untuk Cash Out.

Recommended permissions:

```text
cash.in
cash.out
cash.out.override
```

Threshold dapat menentukan supervisor attention.

---

## 30. Large Cash Out warning

Contoh configurable threshold:

```text
Cash Out > Rp500.000
```

dapat menghasilkan:

```text
REVIEW_REQUIRED
```

atau supervisor authorization jika policy diaktifkan.

---

## 31. Safe Drop readiness

Retail store dapat memiliki:

```text
SAFE_DROP
```

yakni pengeluaran uang tunai dari drawer ke safe/tempat penyimpanan.

Ini bukan expense dan bukan refund.

---

## 32. Expected cash formula

Conceptually:

```text
Expected Cash
=
Opening Cash
+ Cash Sales
+ Cash In
- Cash Out
- Cash Refunds
```

Dengan penyesuaian cash reversal yang sah.

---

## 33. Non-cash does not affect expected drawer cash

QRIS/Transfer tidak masuk formula physical cash drawer.

Tetapi tetap masuk shift payment reconciliation.

---

## 34. Cash refund

Jika refund diberikan secara cash:

```text
Cash Refund
```

mengurangi expected drawer cash.

Jika refund dilakukan non-cash, tidak memengaruhi cash drawer.

---

## 35. Void payment reversal

Jika completed sale dibatalkan dan payment direversal:

- Cash reversal memengaruhi drawer jika uang benar-benar dikembalikan,
- Non-cash reversal dicatat pada payment method terkait.

Jangan hanya mengubah transaction status.

---

## 36. Actual cash

Saat closing, Cashier memasukkan:

```text
actual_cash
```

hasil physical count.

---

## 37. Cash variance

Formula:

```text
Cash Variance
=
Actual Cash - Expected Cash
```

Contoh:

```text
Expected:
Rp2.500.000

Actual:
Rp2.480.000

Variance:
-Rp20.000
```

---

## 38. Variance classification

Presentation:

```text
MATCHED
SHORT
OVER
```

berdasarkan hasil variance.

---

## 39. Exact zero variance

Jika:

```text
Actual = Expected
```

status:

```text
MATCHED
```

---

## 40. Variance reason

Jika variance ≠ 0, closing harus dapat mencatat:

```text
variance_reason
notes
```

Untuk threshold tertentu, reason wajib.

---

## 41. Variance threshold

Business setting dapat mempunyai:

```text
acceptable_variance_amount
```

Contoh:

```text
Rp5.000
```

Nilai di luar threshold menghasilkan:

```text
REVIEW_REQUIRED
```

---

## 42. Cashier cannot hide variance

Closing tidak boleh memungkinkan Cashier mengubah:

```text
Expected Cash
```

secara manual agar sama dengan Actual.

Expected Cash dihitung dari ledger/payment events.

---

## 43. Counted cash denomination readiness

V2 dapat cukup dengan total actual cash.

Schema/UX dapat dikembangkan nanti untuk denomination count:

```text
100.000 × 10
50.000 × 5
...
```

Tidak wajib untuk initial v2.

---

## 44. Closing summary

Sebelum confirm close, POS menampilkan:

```text
Opening Cash
Cash Sales
Cash In
Cash Out
Cash Refund
Expected Cash
Actual Cash
Variance

QRIS Total
Transfer Total
Other Payment Total
Transaction Count
```

---

## 45. Blind closing option future-ready

Architecture dapat mendukung:

```text
Blind Cash Count
```

Cashier memasukkan Actual Cash sebelum melihat Expected Cash.

Ini dapat mengurangi bias pencocokan.

Tidak wajib diaktifkan pada v2 awal.

---

## 46. Shift closing action

Flow:

```text
Review Summary
↓
Count Cash
↓
Enter Actual Cash
↓
Variance Calculated
↓
Reason if needed
↓
Confirm Close
```

---

## 47. Shift closed is immutable operational boundary

Setelah:

```text
CLOSED
```

shift tidak dibuka kembali secara casual.

Late corrections menggunakan explicit adjustment/reconciliation events.

---

## 48. No normal sale on closed shift

Cashier tidak dapat membuat completed transaction baru pada closed shift.

Harus membuka shift baru.

---

## 49. Open transaction during closing

Shift tidak boleh selesai ditutup jika masih ada transaction dalam state yang menghalangi closing, misalnya:

```text
PAYMENT_PENDING
```

Held/Draft carts dapat:

- dipindahkan sesuai future rule,
- dibatalkan,
- atau diselesaikan,

tetapi tidak boleh menjadi completed transaction tanpa valid shift context.

---

## 50. Held cart policy at close

Recommended v2:

```text
Held/Draft cart must be resolved before shift close
```

agar tidak ada cart terlantar antar-shift.

---

## 51. Owner/Admin forced close

Jika Cashier lupa menutup shift:

Owner/Admin dengan permission dapat:

```text
FORCE_CLOSE
```

dengan:

```text
reason
actor
timestamp
```

---

## 52. Forced close does not fabricate actual cash

Jika actual physical cash tidak diketahui saat forced close, system tidak boleh mengisi angka palsu.

State dapat menunjukkan:

```text
ACTUAL_CASH_UNVERIFIED
```

atau equivalent exception.

---

## 53. Shift review

Setelah closed, Owner/Admin dapat review:

```text
Shift Summary
Cash Variance
Payment Totals
Void
Refund
Cash Movement
High-risk Events
```

---

## 54. Review ≠ Reopen

Review tidak mengubah closed shift menjadi open.

---

## 55. Shift review status

Optional operational state:

```text
UNREVIEWED
REVIEWED
REQUIRES_FOLLOW_UP
```

terpisah dari Shift lifecycle.

---

## 56. Cashier own shift visibility

Cashier dapat melihat:

```text
current active shift
own closing summary
own permitted recent shifts
```

---

## 57. Owner/Admin visibility

Owner/Admin dapat melihat:

```text
all shifts
cash variance
payment breakdown
cash movements
void/refund activities
```

sesuai permission.

---

## 58. Shift revenue

Shift sales revenue dihitung dari transaction facts.

Jangan disimpan sebagai independent manually editable total.

---

## 59. Shift totals are projections

Metrics seperti:

```text
sales_total
cash_sales_total
qris_total
transaction_count
```

adalah aggregation/projection dari authoritative transactions/payments.

---

## 60. Rebuildable shift summary

Jika summary cache rusak, system harus dapat menghitung ulang dari:

```text
transactions
payments
cash movements
refunds
```

---

## 61. Payment record immutability

Completed payment tidak diedit casual.

Jika salah:

```text
payment reversal/correction
```

dibuat.

---

## 62. Payment correction

Contoh:

```text
Original:
CASH Rp100.000

Should have been:
QRIS Rp100.000
```

Jangan edit field method pada historical payment.

Gunakan controlled correction:

```text
Reverse CASH
+
Record corrected QRIS
```

dengan audit.

---

## 63. Payment status

Payment record dapat memiliki:

```text
PENDING
COMPLETED
REVERSED
FAILED
```

tergantung provider/payment flow.

Untuk cash normal, completion terjadi saat sale final.

---

## 64. Transaction completion only uses valid payment

`COMPLETED` transaction hanya menggunakan payment yang valid untuk settlement.

Failed payment tidak dihitung sebagai paid.

---

## 65. External payment reference

QRIS/Transfer dapat menyimpan:

```text
provider_reference
external_reference
provider_status
```

jika integration tersedia.

---

## 66. Manual non-cash confirmation

Jika tidak ada provider integration, Admin/Cashier dapat menandai payment berdasarkan bukti manual sesuai policy.

Audit harus membedakan:

```text
SYSTEM_VERIFIED
MANUAL_CONFIRMED
```

jika relevan.

---

## 67. Duplicate payment protection

Reference provider yang identik tidak boleh dipakai untuk membayar dua transaction tanpa explicit review.

---

## 68. QRIS payment duplication

Jika provider reference sama ditemukan:

```text
POSSIBLE_DUPLICATE_PAYMENT
```

system harus warning/block sesuai confidence.

---

## 69. Cash drawer opening and closing events

Shift ledger harus memiliki explicit:

```text
SHIFT_OPEN
SHIFT_CLOSE
```

audit events.

---

## 70. Cash ledger concept

Aku merekomendasikan adanya conceptual:

```text
CASH MOVEMENT LEDGER
```

berisi:

```text
OPENING_BALANCE
CASH_SALE
CASH_IN
CASH_OUT
CASH_REFUND
CASH_REVERSAL
SAFE_DROP
```

Expected Cash diturunkan dari ledger ini.

---

## 71. Cash ledger is event-based

Jangan gunakan:

```text
drawer_cash = editable number
```

sebagai authority.

Seperti inventory, cash harus dapat dijelaskan dari event.

---

## 72. Cash ledger and payment ledger are related but separate

Payment menjawab:

```text
Bagaimana customer membayar?
```

Cash ledger menjawab:

```text
Apa yang terjadi pada uang fisik di drawer?
```

Contoh:

```text
Cash payment
→ Payment record
→ Cash ledger effect
```

QRIS:

```text
Payment record
→ no physical cash ledger increase
```

---

## 73. Physical drawer balance

Concept:

```text
Drawer Balance
=
Σ Cash Ledger Events
```

untuk active shift.

---

## 74. Petty cash expense

Jika toko menggunakan drawer untuk expense kecil:

```text
CASH_OUT
reason = PETTY_CASH / EXPENSE
```

Ini tidak otomatis menjadi full accounting expense ledger.

Reporting dapat menampilkan sebagai cash movement.

---

## 75. Purchase payment from cashier drawer

Default recommendation v2:

> Purchasing payment sebaiknya tidak otomatis menggunakan cashier drawer kecuali explicit cash-out workflow dilakukan.

Jika Admin membeli barang dengan uang kas drawer:

```text
CASH_OUT
reference = Purchase
```

sehingga reconciliation tetap benar.

---

## 76. Supplier payment does not become sales refund

Cash Out untuk supplier adalah operational cash movement, bukan customer refund.

---

## 77. Shift overlap

Beberapa Cashier dapat memiliki shift bersamaan pada device/terminal berbeda jika business environment mengizinkan.

Inventory tetap shared.

Cash drawer reconciliation tetap per shift/terminal context.

---

## 78. Shared physical drawer caution

Jika dua Cashier menggunakan satu physical drawer bersamaan, individual accountability menjadi lemah.

Recommended v2 assumption:

```text
one active cashier shift
per drawer/terminal context
```

Architecture dapat support shared drawer later if explicitly required.

---

## 79. Terminal context

Jika satu store mempunyai beberapa POS terminal:

```text
Terminal A
Terminal B
```

shift/cash drawer harus dibedakan.

Current single-device store tetap menggunakan default terminal context.

---

## 80. Device ≠ terminal necessarily

Device identity digunakan untuk sync/audit.

Terminal/cash-drawer identity adalah operational concept.

V2 implementation dapat menyederhanakan keduanya jika memang satu device = satu terminal, tetapi schema jangan mengacaukan concept secara permanen.

---

## 81. Offline shift opening

Cashier dapat membuka shift offline jika:

- identity/permission cache valid,
- tidak ada conflicting active local shift,
- business policy mengizinkan.

Shift sync kemudian pending.

---

## 82. Offline opening identity

Offline shift ID harus collision-resistant.

---

## 83. Offline cash sale

Cash transaction tetap dapat masuk cash ledger lokal saat offline.

---

## 84. Offline non-cash

Hanya payment methods dengan:

```text
offline_allowed = true
```

yang dapat difinalisasi offline tanpa online provider confirmation.

---

## 85. Sync status separate from shift status

Contoh:

```text
Shift Status:
CLOSED

Sync Status:
PENDING
```

valid.

Closed shift tetap closed secara operasional walaupun belum synced.

---

## 86. Offline close

Shift dapat ditutup offline berdasarkan local transaction/payment/cash ledger.

Ketika reconnect, data disinkronkan idempotently.

---

## 87. Late remote transactions conflict

Jika server menerima event lain terkait shift yang tidak diketahui saat offline close, system harus melakukan:

```text
SHIFT_RECONCILIATION_EXCEPTION
```

bukan diam-diam mengubah historical closing figures.

---

## 88. Reconciliation after sync

System dapat menghitung:

```text
Original Closing Snapshot
vs
Post-Sync Reconciled Totals
```

Jika ada perbedaan karena late events, exception harus terlihat oleh Owner/Admin.

---

## 89. Closing snapshot

Saat shift ditutup, simpan snapshot:

```text
opening_cash
cash_sales
cash_in
cash_out
cash_refunds
expected_cash
actual_cash
variance
payment_totals_by_method
transaction_count
```

untuk historical audit.

---

## 90. Recomputed totals do not erase original closing snapshot

Jika later reconciliation menemukan late event:

```text
original_close_snapshot
```

tetap dipertahankan.

Tambahkan:

```text
reconciled_summary
```

atau adjustment reference.

---

## 91. Shift cash variance history

Owner harus dapat melihat:

```text
Cashier
Shift
Expected
Actual
Variance
Reason
Review Status
```

untuk pola discrepancy.

---

## 92. Repeated variance signal

System dapat menampilkan operational pattern:

```text
Cashier A
5 shifts with shortage in 30 days
```

sebagai review signal.

Jangan otomatis menyimpulkan fraud.

---

## 93. Cash anomaly is not fraud accusation

UI gunakan:

```text
Perlu Ditinjau
Selisih Kas
Pola Variance
```

bukan:

```text
Fraud
Pencurian
```

tanpa investigasi manusia.

---

## 94. Large refund signal

Shift review dapat menandai:

```text
unusual refund amount
```

atau banyak refund/void sebagai anomaly.

Threshold configurable.

---

## 95. High void rate signal

Contoh:

```text
Void Count > configured threshold
```

→ Owner attention.

---

## 96. Discount anomaly linkage

Shift review dapat menampilkan:

```text
Manual Discount Count
Floor Overrides
Total Discount Value
```

dari Domain 06.

---

## 97. Shift exception summary

Contoh:

```text
Shift SHF-001

Cash Shortage          Rp20.000
2 Voids
1 Refund
3 Manual Discounts
0 Floor Override
1 Cash Out             Rp200.000
```

Owner dapat menilai exception secara contextual.

---

## 98. Cash withdrawal / safe drop threshold

System dapat memberi reminder jika physical drawer cash melebihi threshold.

Contoh:

```text
Estimated Drawer Cash > Rp5.000.000
→ Consider Safe Drop
```

Ini adalah safety/operational alert.

---

## 99. Shift handover

Current v2 tidak perlu membuat complex handover workflow.

Recommended:

```text
Cashier A closes shift
↓
Cashier B opens new shift
```

dengan opening cash baru yang dihitung secara fisik.

---

## 100. Do not auto-carry opening cash silently

Jika Cashier B menggunakan cash sisa dari Shift A:

Opening Cash Shift B harus dicatat eksplisit.

Jangan otomatis menganggap Closing Cash A = Opening Cash B tanpa confirmation.

---

## 101. Shift closing with non-cash pending

Jika provider payment masih benar-benar `PENDING`:

closing dapat diizinkan dengan exception atau diblokir sesuai payment capability.

Recommended default:

- cash/confirmed payments reconcile normally,
- unresolved external payment tetap terlihat sebagai pending exception.

---

## 102. Failed non-cash payment

Failed payment tidak dihitung sebagai revenue settlement.

Jika customer akhirnya membayar dengan method lain, record method baru.

---

## 103. Payment reversal reference

Payment reversal wajib merujuk:

```text
original_payment_id
```

dan reason.

---

## 104. Refund reference

Refund wajib merujuk original:

```text
transaction
payment
return
```

sesuai Domain 09.

---

## 105. Refund method

Recommended default:

> Refund menggunakan metode yang sesuai dengan original payment bila memungkinkan.

Override method membutuhkan reason/permission.

---

## 106. Refund cash impact

Refund CASH:

```text
Cash Drawer -
```

Refund QRIS/Transfer:

```text
No physical drawer effect
```

kecuali business secara eksplisit mengembalikan dengan cash, yang harus ditandai override.

---

## 107. Shift cannot hide refund

Refund harus masuk shift reconciliation bila terjadi selama shift tersebut.

Refund terhadap sale shift lama tetap terkait refunding shift secara cash/payment activity.

---

## 108. Original sale shift remains historical

Refund hari ini atas sale kemarin tidak mengubah original shift closing snapshot kemarin.

Hari ini mencatat refund event.

---

## 109. Cash movement attachment

Untuk high-risk Cash Out, architecture dapat mendukung:

```text
photo receipt
attachment
reference document
```

tidak mandatory untuk semua cash movement.

---

## 110. Permissions

Recommended permissions:

```text
shift.open
shift.close
shift.force_close
shift.read
shift.review

cash.read
cash.in
cash.out
cash.out.override
cash.safe_drop

payment.read
payment.record
payment.reverse
payment.manual_confirm

refund.process
refund.override_method
```

---

## 111. Cashier permissions

Default Cashier:

```text
shift.open
shift.close
pos.use
payment.record
cash.in limited
cash.out limited/disabled
```

Exact preset final ditentukan Identity Domain.

---

## 112. Admin permissions

Admin dapat memiliki:

```text
shift.read
shift.review
cash movement access
payment review
```

dan operational correction permissions sesuai policy.

---

## 113. Owner permissions

Owner mempunyai authority tertinggi terhadap:

```text
Shift Review
Forced Close
Cash Adjustment
Payment Correction
Refund Override
Anomaly Review
```

Semua tetap diaudit.

---

## 114. No direct expected cash edit

Tidak ada permission yang berarti:

```text
edit_expected_cash
```

Expected Cash berasal dari events.

Jika ada kesalahan event, koreksi event yang salah.

---

## 115. Cash adjustment after close

Jika setelah close ditemukan kesalahan:

Jangan edit snapshot.

Gunakan:

```text
CASH_RECONCILIATION_ADJUSTMENT
```

atau correction event yang mereferensikan shift.

---

## 116. Closing variance does not change sales

Cash shortage/overage tidak mengubah:

```text
Sales Revenue
Transaction Total
```

Variance merupakan cash-control event.

---

## 117. Cash overage

Jika:

```text
Actual > Expected
```

catat sebagai:

```text
CASH_OVER
```

untuk reporting/review.

Jangan otomatis dianggap revenue.

---

## 118. Cash shortage

Jika:

```text
Actual < Expected
```

catat:

```text
CASH_SHORT
```

untuk reporting/review.

Jangan mengubah transaction history.

---

## 119. Shift report

Shift report minimal:

```text
Shift ID
Cashier
Open Time
Close Time
Opening Cash

Sales Count
Gross Sales
Discount
Refund
Net Sales

Cash Payment
QRIS
Transfer
Other

Cash In
Cash Out

Expected Cash
Actual Cash
Variance

Void Count
Refund Count
Override Count
```

---

## 120. Business daily report is not shift report

Daily business report dapat menggabungkan beberapa shift.

Shift report fokus pada accountability satu operational session.

---

## 121. Multiple shifts per day

Cashier/store dapat mempunyai beberapa shift dalam satu hari.

Jangan menganggap:

```text
1 calendar day = 1 shift
```

---

## 122. Shift crossing midnight

Shift boleh:

```text
open 22:00
close 06:00
```

Reporting menggunakan actual timestamps.

Jangan memaksa close pada 23:59.

---

## 123. Timezone

Business event time menggunakan configured business timezone.

Current deployment context dapat menggunakan Indonesia timezone sesuai business configuration.

Schema harus menyimpan timestamps secara konsisten.

---

## 124. Audit requirements

Minimal audited events:

```text
Shift Opened
Opening Cash Entered
Cash In
Cash Out
Safe Drop
Payment Recorded
Payment Reversed
Manual Payment Confirmed
Refund Processed
Shift Closing Started
Actual Cash Entered
Shift Closed
Shift Force Closed
Cash Variance Recorded
Shift Reviewed
Post-Close Reconciliation
```

---

## 125. Historical immutability

Perubahan user name/payment-method label/settings tidak mengubah historical shift economics.

Snapshot/reference yang diperlukan dipertahankan.

---

## 126. Idempotency

Sync retry tidak boleh menggandakan:

```text
Cash Sale effect
Cash In
Cash Out
Refund
Payment
Shift Open
Shift Close
```

Setiap business event harus mempunyai stable identity/idempotency behavior.

---

## 127. Atomic sale-payment-cash effect

Jika sale finalized dengan CASH:

```text
Transaction Completion
+
Payment
+
Cash Ledger Effect
+
Inventory Effect
```

harus berada dalam one local business commit sejauh technology memungkinkan.

---

## 128. No cash effect without source

Setiap cash ledger event harus memiliki:

```text
source_type
source_id
```

atau explicit manual reason.

---

## 129. No unexplained drawer mutation

Kastur tidak boleh memiliki:

```text
drawer_balance = new_value
```

tanpa ledger events.

---

## 130. Cash balance projection

Seperti stock:

```text
Cash Ledger
→ authoritative events

Drawer Balance
→ projection
```

---

## 131. Projection rebuild

Jika drawer projection tidak konsisten, system harus dapat rebuild dari cash ledger.

---

## 132. Non-goals Domain 07 v2

Belum termasuk:

```text
Full accounting cash book
Bank reconciliation
General Ledger
Accounts Receivable
Accounts Payable
Payroll
Cash vault management kompleks
Multi-currency drawer
Automated bank settlement accounting
Card acquiring reconciliation kompleks
```

---

## 133. Core Invariants

Kita lock:

1. Shift adalah operational accountability boundary.
2. Cashier membutuhkan active shift untuk normal POS completion.
3. Opening Cash bukan revenue.
4. Payment Method dan Cash Drawer adalah konsep berbeda.
5. Cash drawer hanya dipengaruhi cash-equivalent events.
6. Expected Cash dihitung dari event ledger.
7. Expected Cash tidak dapat diedit manual.
8. Cash In/Out selalu mempunyai reason dan actor.
9. Actual Cash berasal dari physical count saat close.
10. Cash Variance = Actual Cash − Expected Cash.
11. Cash variance tidak mengubah Sales Revenue.
12. Closing snapshot tidak di-overwrite.
13. Closed shift tidak dibuka kembali secara casual.
14. Forced Close membutuhkan authority + reason.
15. Payment historical tidak diedit casual; correction menggunakan reversal.
16. Refund adalah explicit financial event.
17. Refund hari ini tidak mengubah shift historis original sale.
18. Cash ledger dan payment ledger saling terkait tetapi tidak sama.
19. Business status dan sync status terpisah.
20. Offline Shift/Sale dapat tetap valid secara lokal.
21. Sync retry harus idempotent.
22. Shift summary adalah projection dari transactions/payments/cash events.
23. Anomaly bukan otomatis bukti fraud.
24. Owner/Admin review fokus pada exception.
25. Tidak ada unexplained physical drawer balance mutation.

---

## 134. Definition of Done

Domain Shift, Cash & Payment dianggap benar bila kasus berikut dapat ditangani.

### Open Shift

```text
Cashier
Opening Cash Rp500.000
→ Shift OPEN
```

### Cash Sale

```text
Sale Rp37.000
Cash Tendered Rp50.000
Change Rp13.000

Drawer impact:
+Rp37.000
```

### QRIS Sale

```text
Sale Rp50.000
QRIS

Drawer impact:
Rp0
QRIS total:
+Rp50.000
```

### Split Payment

```text
Sale Rp100.000
Cash Rp60.000
QRIS Rp40.000

Drawer:
+Rp60.000
```

### Cash In

```text
Float Top Up
+Rp200.000

Reason required
```

### Cash Out

```text
Safe Drop
-Rp1.000.000

Reason + actor
```

### Closing

```text
Opening Cash      Rp500.000
Cash Sales      Rp2.000.000
Cash In           Rp200.000
Cash Out          Rp500.000
Cash Refund       Rp100.000

Expected Cash   Rp2.100.000

Actual Cash     Rp2.080.000

Variance          -Rp20.000
→ SHORT
```

### Exact Match

```text
Expected Rp2.100.000
Actual   Rp2.100.000
→ MATCHED
```

### Cash Over

```text
Expected Rp2.100.000
Actual   Rp2.110.000
→ OVER Rp10.000
```

### Force Close

```text
Cashier absent
Owner force closes
→ reason required
→ ACTUAL_CASH_UNVERIFIED if not counted
```

### Payment Correction

```text
Original Cash Rp100.000
Wrong method

→ Reverse Cash Payment
→ Record QRIS Payment
→ audit preserved
```

### Refund

```text
Original sale yesterday
Refund today

→ original shift unchanged
→ refund impacts current refunding shift/payment activity
```

### Offline Shift

```text
Open offline
Sell cash offline
Close offline
→ local operational state valid
→ sync pending
```

### Sync Retry

```text
same cash/payment event retried
→ applied once only
```

---

# Core invariant Domain 07

> **Kastur memperlakukan shift sebagai batas akuntabilitas operasional dan cash drawer sebagai ledger event-based, bukan angka yang dapat diedit. Sales, Payment, dan Cash harus dapat direkonsiliasi satu sama lain tanpa mencampurkan makna masing-masing. Expected Cash berasal dari events, Actual Cash berasal dari physical count, dan setiap selisih harus terlihat serta dapat diaudit.**

Flow utama:

```text
LOGIN
  ↓
OPEN SHIFT
  ↓
OPENING CASH
  ↓
POS OPERATIONS
├── CASH SALE
├── QRIS / TRANSFER
├── CASH IN
├── CASH OUT
├── VOID
└── REFUND
  ↓
CASH / PAYMENT LEDGERS
  ↓
CLOSING
  ↓
EXPECTED CASH
vs
ACTUAL CASH
  ↓
VARIANCE
  ↓
CLOSED SHIFT
  ↓
OWNER / ADMIN REVIEW
