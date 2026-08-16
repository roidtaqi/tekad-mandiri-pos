# Kastur Retail System — Business Rules v1
## Domain 10: Offline, Sync & Data Authority

**Status:** Draft for Approval  
**Depends on:** Domain 01–09  
**Applies to:** Kastur Back Office + Kastur POS  
**Primary Consumers:** POS, Back Office, Inventory, Pricing, Purchasing, Audit  
**Critical Context:** Offline-first retail operation

---

## 1. Tujuan domain

Offline, Sync & Data Authority harus mampu menjawab:

```text
Apa yang boleh dilakukan saat offline?
Data mana yang authoritative?
Bagaimana local change disinkronkan?
Bagaimana duplicate event dicegah?
Bagaimana conflict diselesaikan?
Bagaimana stale data ditangani?
Bagaimana completed transaction tetap aman saat koneksi putus?
Bagaimana cloud dan local state direkonsiliasi?
```

Domain ini harus memastikan bahwa gangguan jaringan **tidak menghentikan operasi toko**, tetapi juga tidak merusak integritas data.

---

## 2. Offline-first principle

Kastur menggunakan prinsip:

> **Offline-first untuk operasi yang secara bisnis aman dilakukan secara lokal.**

Offline-first tidak berarti semua action selalu dapat difinalisasi tanpa internet.

Setiap action harus diklasifikasikan.

---

## 3. Action capability classification

Setiap business action masuk salah satu kategori:

```text
OFFLINE_SAFE
LOCAL_DRAFT_ONLY
ONLINE_REQUIRED
CONDITIONALLY_OFFLINE
```

---

## 4. OFFLINE_SAFE

Action dapat difinalisasi secara lokal dan disinkronkan kemudian.

Contoh:

```text
Cash Sale
Cart
Shift Open/Close
Stock Movement from Sale
Receipt
Local Cash In/Out
Normal Customer Return with cached transaction
```

---

## 5. LOCAL_DRAFT_ONLY

Action boleh dibuat offline tetapi belum authoritative secara global sampai online.

Contoh:

```text
Price Proposal Draft
Purchase Draft
Promotion Draft
User Draft/Invitation Draft
```

---

## 6. ONLINE_REQUIRED

Action sensitif dapat diwajibkan online.

Contoh future/optional:

```text
Permission Management
Owner Transfer
Sensitive Supplier Bank Change
Certain Payment Provider Confirmations
```

Tidak semua action high-risk wajib online pada v2.

---

## 7. CONDITIONALLY_OFFLINE

Action dapat offline hanya jika dependency valid tersedia lokal.

Contoh:

```text
Customer Return
→ original transaction cached

QRIS Payment
→ only if provider supports offline confirmation

Price Resolution
→ valid cached published price exists
```

---

## 8. Business Status ≠ Sync Status

Rule fundamental:

```text
Business Status
```

dan:

```text
Sync Status
```

harus terpisah.

Contoh:

```text
Transaction:
COMPLETED

Sync:
PENDING
```

valid.

---

## 9. Recommended sync states

Minimal:

```text
PENDING
SYNCING
SYNCED
FAILED
CONFLICT
```

Optional:

```text
REQUIRES_REVIEW
```

---

## 10. Completed local business event remains valid

Jika Cash Sale selesai offline:

```text
COMPLETED
```

secara bisnis.

Sync failure tidak mengubah transaction menjadi Draft.

---

## 11. Local data is authoritative for locally completed action

Untuk action yang sah difinalisasi offline:

> Local committed event adalah authoritative business fact untuk device tersebut sampai berhasil direkonsiliasi ke cloud.

Cloud tidak boleh menghapus fakta bahwa sale benar-benar terjadi hanya karena server belum menerimanya saat itu.

---

## 12. Cloud is authoritative for shared master state

Untuk shared master/configuration:

```text
Product Master
Role/Permission
Published Pricing
Business Settings
Supplier Master
```

cloud/server menjadi authoritative shared state.

Local client menggunakan synchronized cache.

---

## 13. Event vs master-data authority

Recommended distinction:

```text
BUSINESS EVENTS
→ created locally or online
→ append/sync

MASTER DATA
→ authoritative shared version
→ cached locally
```

Ini membantu conflict handling.

---

## 14. Event-based sync preferred

Untuk domain seperti:

```text
Transaction
Stock Movement
Cash Movement
Return
Audit
```

sync sebaiknya berbasis immutable events.

Jangan sync hanya angka akhir seperti:

```text
stock = 100
cash = 2.000.000
```

---

## 15. No last-write-wins for ledgers

Jangan gunakan:

```text
latest stock balance wins
```

atau:

```text
latest cash balance wins
```

Business ledgers digabungkan melalui unique events.

---

## 16. Local commit before sync

Offline-safe business action harus:

```text
Validate
↓
Local Atomic Commit
↓
Mark Sync Pending
↓
Attempt Sync
```

Jangan menunggu server response agar Cash Sale dianggap selesai.

---

## 17. Sync failure after commit

Jika sync gagal:

```text
Business event remains committed
Sync Status = FAILED / PENDING
```

Retry dilakukan oleh sync engine.

User tidak mengulangi transaksi.

---

## 18. Stable global identifiers

Semua offline-creatable entity/event membutuhkan collision-resistant ID.

Contoh:

```text
transaction_id
stock_movement_id
payment_id
return_id
cash_movement_id
audit_event_id
```

Gunakan UUID/ULID/equivalent.

---

## 19. Human-readable number is not identity

Nomor seperti:

```text
TRX-20260816-001
```

bukan canonical technical key.

Offline behavior tidak boleh bergantung pada strict global sequence.

---

## 20. Idempotency

Setiap business command/event sync harus idempotent.

Meaning:

```text
same event retried 10 times
→ applied once
```

---

## 21. Idempotency key

Recommended setiap write-sensitive operation mempunyai:

```text
idempotency_key
```

atau stable event ID yang berfungsi equivalent.

---

## 22. Transaction idempotency

Transaction TX-100 hanya boleh menghasilkan:

```text
1 Transaction
N Items
N Payments
N valid Stock Movements
```

sesuai original business commit.

Retry tidak membuat duplicate sale.

---

## 23. Inventory idempotency

Satu transaction line:

```text
SALE -5
```

hanya diterapkan sekali.

---

## 24. Payment idempotency

Payment sync retry tidak boleh membuat duplicate payment.

---

## 25. Refund idempotency

Refund provider/local event tidak boleh diterapkan dua kali.

---

## 26. Cash ledger idempotency

Cash sale, Cash In, Cash Out, refund, reversal hanya diterapkan sekali.

---

## 27. Audit idempotency

Audit event yang sama tidak digandakan akibat sync retry.

---

## 28. Device identity

Setiap client mempunyai:

```text
device_id
```

yang stabil.

Digunakan untuk:

- event provenance,
- offline ID generation,
- conflict analysis,
- diagnostics,
- local sequencing.

---

## 29. Device local sequence

Device boleh mempunyai:

```text
local_sequence
```

untuk human-friendly ordering.

Tidak menjadi global authority.

---

## 30. Event timestamps

Simpan minimal:

```text
occurred_at
created_at
synced_at
```

jika relevan.

---

## 31. Business time vs server arrival time

Jika sale terjadi:

```text
12:00 offline
```

dan server menerima:

```text
15:00
```

business event time tetap:

```text
12:00
```

Server arrival time tidak mengganti occurred_at.

---

## 32. Clock skew readiness

Device clock dapat salah.

Architecture sebaiknya menyimpan:

```text
device_time
server_received_time
```

dan metadata clock skew jika perlu.

V2 tidak perlu full distributed-clock system.

---

## 33. Sync queue

Setiap client mempunyai persistent:

```text
SYNC QUEUE
```

berisi pending outbound operations/events.

---

## 34. Sync queue durability

Pending events tidak boleh hilang saat:

- app refresh,
- browser restart,
- device reboot,
- network transition.

---

## 35. Sync queue item

Minimal:

```text
sync_item_id
entity/event_type
entity/event_id
operation
created_at
attempt_count
last_attempt_at
status
last_error
```

---

## 36. Retry policy

Retry menggunakan controlled strategy seperti:

```text
immediate retry
↓
backoff
↓
periodic retry
```

Jangan loop agresif yang membebani network/server.

---

## 37. User retry

UI dapat menyediakan:

```text
Coba Sinkronkan Lagi
```

untuk failed state.

Manual retry menggunakan idempotent operation yang sama.

---

## 38. Automatic sync preferred

Normal user tidak perlu memahami sync internals.

Sync berjalan otomatis saat koneksi tersedia.

---

## 39. Sync UI simplicity

Normal UI cukup menunjukkan:

```text
Offline
Syncing
Synced
X Pending
Sync Problem
```

Bukan detail teknis database/network.

---

## 40. Manual Sync is recovery tool

Menu Sinkronisasi tidak boleh menjadi primary daily workflow.

Manual sync hanya untuk:

```text
troubleshooting
recovery
diagnostics
```

---

## 41. Connectivity state

App dapat mengetahui:

```text
ONLINE
OFFLINE
UNSTABLE
```

tetapi browser/device connectivity signal bukan bukti server benar-benar reachable.

Sync engine harus berdasarkan actual request success/failure.

---

## 42. Cached Product Catalog

POS menyimpan cache Product yang dibutuhkan untuk offline operation.

Minimal:

```text
Product ID
Name
SKU
Product Units
Barcodes
Active Status
Track Inventory
```

---

## 43. Cached Pricing

POS menyimpan published pricing cache:

```text
price_version_id
product_unit_id
tiers
effective_from
effective_until
promotion
```

---

## 44. Cached permission

Offline operation menggunakan cached:

```text
user
role
effective permissions
authorization version
```

---

## 45. Cached stock

POS dapat menyimpan local stock projection.

Offline stock adalah:

```text
operational estimate
```

bukan guaranteed global balance.

---

## 46. Stale data principle

Stale data tidak otomatis berarti unusable.

System perlu membedakan:

```text
usable but potentially stale
```

dan:

```text
unsafe to use
```

---

## 47. Stale pricing

Jika POS belum mendapatkan pricing terbaru:

POS menggunakan latest successfully synchronized published price.

Transaction menyimpan version yang benar-benar digunakan.

---

## 48. Stale pricing warning

Jika system mengetahui pricing cache tidak up-to-date:

UI dapat menampilkan:

```text
Harga terakhir disinkronkan ...
```

atau:

```text
Pricing data may be outdated
```

---

## 49. Stale price sale remains historical truth

Jika customer benar-benar membayar cached price lama:

Transaction tetap menyimpan harga itu.

Jangan retroactively mengubah sale setelah sync.

---

## 50. Stale price exception

Setelah sync, system dapat menghasilkan:

```text
STALE_PRICING_EXCEPTION
```

jika POS menggunakan version lama dibanding server effective version.

Untuk Owner/Admin review.

---

## 51. Scheduled pricing offline

Jika POS sudah memiliki scheduled price version sebelum offline:

Client dapat mengaktifkannya berdasarkan:

```text
effective_from
```

local business time.

---

## 52. Missing scheduled price

Jika client offline sebelum scheduled version pernah tersinkron:

client tidak dapat menggunakan version yang tidak diketahui.

Gunakan latest known published price.

---

## 53. Master-data versioning

Shared master records sebaiknya mempunyai:

```text
version
updated_at
```

atau equivalent optimistic concurrency token.

---

## 54. Optimistic concurrency

Untuk editable shared master:

Client mengirim:

```text
expected_version
```

Server dapat mendeteksi jika record telah berubah.

---

## 55. Master data conflict

Contoh:

```text
Admin A edits Product Name offline
Owner edits same Product online
```

Saat sync:

```text
CONFLICT
```

jangan silently last-write-wins untuk sensitive fields.

---

## 56. Conflict classification

Conflict dapat dibagi:

```text
AUTO_MERGEABLE
USER_REVIEW_REQUIRED
SERVER_WINS
LOCAL_EVENT_PRESERVED
```

tergantung data type.

---

## 57. Immutable event conflict

Completed event seperti Sale biasanya tidak “conflict” dengan Sale lain.

Keduanya valid business events dan di-append.

---

## 58. Master record conflict

Product/Supplier/Settings edit dapat memerlukan resolution karena merepresentasikan mutable shared state.

---

## 59. Auto-merge safe changes

Contoh:

Admin A mengubah:

```text
Product Description
```

Owner mengubah:

```text
Category
```

Jika field-level merge aman, system dapat auto-merge.

Tidak wajib di v2 awal jika terlalu kompleks.

---

## 60. Same-field conflict

Jika dua user mengubah field sama:

```text
Product Name
```

dengan nilai berbeda:

```text
USER_REVIEW_REQUIRED
```

lebih aman.

---

## 61. No silent conflict loss

Jika local change ditolak karena version conflict:

local value jangan hilang.

Simpan:

```text
local proposed value
server current value
```

untuk review.

---

## 62. Conflict resolution audit

Resolution harus mencatat:

```text
local version
server version
chosen value
resolved_by
resolved_at
```

---

## 63. Pricing conflict

Price activation governed Domain 04.

Server/cloud authoritative untuk published price set.

Offline POS tidak membuat pricing rule baru.

---

## 64. Price proposal offline

Admin boleh membuat Draft proposal offline.

Approval/activation dapat membutuhkan authoritative synchronization sebelum published globally.

Recommended:

```text
offline proposal = LOCAL_DRAFT / PENDING_SYNC
```

---

## 65. Owner direct price offline

Untuk mencegah split-brain pricing:

Recommended v2:

> Owner boleh menyiapkan direct price change offline sebagai draft, tetapi global activation harus tersinkron ke authoritative pricing service sebelum dianggap published ke seluruh devices.

---

## 66. Pricing publication authority

Global published price hanya authoritative setelah:

```text
server/cloud pricing state accepted
```

Kemudian devices mengonsumsi version tersebut.

---

## 67. Purchasing offline

Admin dapat:

```text
Create Purchase Draft
Record Receiving
```

offline jika local catalog tersedia.

---

## 68. Receiving offline

Accepted goods dapat menghasilkan local inventory movement.

Sync kemudian merekonsiliasi.

Karena physical goods memang benar-benar telah diterima, event tidak boleh hilang hanya karena offline.

---

## 69. Purchase posting offline

Recommended:

Purchase dengan complete local invoice/cost data dapat diposting offline jika implementation memastikan costing consistency.

Jika ada dependency online-sensitive:

```text
POST_PENDING_SYNC
```

dapat digunakan.

Business status tetap terpisah dari sync.

---

## 70. Supplier duplicate invoice offline limitation

Offline device mungkin tidak mengetahui invoice duplicate yang dibuat device lain.

Local check menggunakan cached known invoices.

Server menjalankan duplicate check lagi saat sync.

---

## 71. Duplicate invoice detected after sync

Jika server menemukan duplicate:

```text
PURCHASE_INTEGRITY_EXCEPTION
```

dibuat.

Jangan delete physical receiving event secara otomatis.

Owner/Admin review diperlukan.

---

## 72. Inventory sync uses movements

Sync:

```text
Stock Movement Events
```

bukan set absolute balance.

---

## 73. Multi-device stock example

Device A offline:

```text
SALE -5
```

Device B:

```text
SALE -3
```

Server eventually:

```text
-5
-3
```

Total:

```text
-8
```

bukan memilih satu balance terakhir.

---

## 74. Negative stock after merge

Dua device mungkin masing-masing melihat stock cukup, tetapi setelah merge global stock menjadi negatif.

System menghasilkan:

```text
INVENTORY_DISCREPANCY
```

tanpa membatalkan completed sales.

---

## 75. COGS reconciliation after sync

Merged inventory/cost events dapat memicu Domain 03 reconciliation.

Historical sale tetap dipertahankan.

---

## 76. Cash sync

Cash ledger event tersinkron per shift/device.

Tidak sync absolute expected cash sebagai truth.

---

## 77. Shift sync

Shift Open/Close adalah stable events/state transitions.

Sync retry tidak boleh membuka/menutup shift dua kali.

---

## 78. Offline close conflict

Jika shift ditutup offline tetapi server menerima late event:

buat:

```text
SHIFT_RECONCILIATION_EXCEPTION
```

Original closing snapshot tetap ada.

---

## 79. Return sync

Return completion sync mencakup linkage:

```text
return
inventory movement
refund
cash/payment effect
audit
```

dengan idempotency.

---

## 80. Customer data sync

Customer master bersifat shared mutable data.

Conflict dapat menggunakan optimistic concurrency.

Customer tidak menjadi blocking dependency untuk normal walk-in sale.

---

## 81. User permission sync

Permission state server authoritative.

Device cache harus diperbarui saat connected.

---

## 82. Permission revocation

Jika permission dicabut:

connected device harus menerapkan revocation secepat practical.

Offline device dapat tetap menggunakan cached state sampai sync/re-auth depending policy.

---

## 83. Sensitive operation stale-auth exception

Jika stale permission digunakan untuk sensitive action:

action tidak dihapus otomatis.

System dapat flag:

```text
AUTHORIZATION_STALE_EXCEPTION
```

---

## 84. Data deletion sync

Business records historical tidak hard delete.

Untuk master-data deactivation:

sync state:

```text
ACTIVE → INACTIVE
```

lebih aman daripada deletion.

---

## 85. Tombstone readiness

Jika technical deletion benar-benar diperlukan untuk non-business cache entity, architecture dapat menggunakan:

```text
tombstone
```

agar deleted state tersinkron.

Tidak digunakan untuk completed business records.

---

## 86. Sync dependency ordering

Beberapa events memiliki dependency.

Contoh:

```text
Transaction
before
Payment reference resolution
```

atau:

```text
Product
before
Purchase Item
```

Sync engine harus dapat mengatur dependency/order atau menerima bundle atomic command.

---

## 87. Aggregate sync command

Untuk complex business commit, preferable:

```text
Transaction Aggregate
```

disinkronkan sebagai one logical operation daripada random table writes.

---

## 88. Domain command sync

Recommended architecture:

```text
CompleteSaleCommand
PostPurchaseCommand
CompleteReturnCommand
CloseShiftCommand
```

atau event bundle equivalent.

Ini mengurangi partial sync inconsistency.

---

## 89. Partial server acceptance prohibited for atomic aggregate

Jika server menerima completed sale:

harus menerima business aggregate secara konsisten.

Jangan:

```text
Transaction accepted
Payment rejected
Inventory missing
```

tanpa compensation/error state yang jelas.

---

## 90. Server-side idempotency

Idempotency wajib di server/cloud juga.

Client protection saja tidak cukup.

---

## 91. Local database atomicity

Local business commit menggunakan DB transaction jika tersedia.

Contoh sale:

```text
transaction
items
payments
stock movements
cash event
sync queue
audit
```

harus commit bersama.

---

## 92. Crash recovery

Jika app crash setelah local commit:

event tetap ada dan sync queue dapat melanjutkan setelah restart.

---

## 93. Crash before commit

Jika commit belum selesai:

transaction tetap Draft/tidak selesai.

Jangan menghasilkan half-completed business event.

---

## 94. Sync diagnostics

System harus dapat menyimpan technical diagnostic:

```text
attempt_count
last_error_code
last_error_message
last_sync_at
```

tanpa mengekspos semuanya ke normal user.

---

## 95. User-facing sync errors

UI gunakan bahasa business-friendly:

```text
3 transaksi belum tersinkron.
Data tetap tersimpan di perangkat ini.
```

bukan stack trace.

---

## 96. Critical unsynced warning

Jika user mencoba logout/reset device dengan pending local business events:

System harus warning kuat.

Contoh:

```text
⚠ 12 transaksi belum tersinkron.
Jangan hapus data aplikasi sebelum sinkron selesai.
```

---

## 97. Device reset protection

App tidak boleh menawarkan destructive:

```text
Clear Local Data
```

secara casual bila pending events ada.

---

## 98. Backup/export recovery readiness

Architecture dapat menyediakan future recovery mechanism untuk pending local events jika device bermasalah.

Tidak wajib menjadi v2 user-facing feature.

---

## 99. Sync health

Owner/Admin dapat melihat aggregate:

```text
Devices Online
Pending Events
Failed Sync
Last Sync
```

tanpa technical overload.

---

## 100. Device sync health

Contoh:

```text
POS-01
Last Sync: 2 min ago
Pending: 0

POS-02
Offline: 3 hours
Pending: 24
```

---

## 101. Cashier sync visibility

Cashier hanya butuh indicator sederhana:

```text
Online
Offline
Syncing
Pending
Problem
```

---

## 102. Owner attention

Owner Attention dapat menampilkan:

```text
Device offline too long
High pending event count
Sync conflicts
Stale pricing exceptions
Stale authorization exceptions
Inventory reconciliation issues
```

---

## 103. Sync conflict is not user blame

UI tidak menggunakan bahasa:

```text
User caused error
```

tanpa evidence.

Gunakan:

```text
Data perlu direkonsiliasi
Perubahan bersamaan ditemukan
```

---

## 104. Data freshness metadata

Shared cached master data dapat mempunyai:

```text
last_synced_at
version
```

untuk diagnostics.

---

## 105. Freshness display is contextual

Tidak perlu menampilkan timestamp di semua screen.

Tampilkan ketika freshness materially matters:

- pricing,
- stock,
- permissions,
- sync problem.

---

## 106. Inventory freshness

POS stock display dapat menunjukkan:

```text
Local Stock
Last Synced
```

jika multi-device uncertainty relevant.

---

## 107. Published price freshness

POS harus mengetahui price version, bukan hanya last sync timestamp.

Version lebih authoritative daripada timestamp UI.

---

## 108. Local-first search

Product search/barcode lookup harus bekerja dari local cache untuk speed.

Jangan bergantung pada round-trip server setiap scan.

---

## 109. Background sync

Sync dapat berjalan:

```text
on app launch
on reconnect
periodically
after business commit
manual retry
```

sesuai platform capability.

---

## 110. Sync batching

Pending events dapat dikirim batch untuk efisiensi.

Idempotency tetap per business event/aggregate.

---

## 111. Large initial sync

Initial device setup dapat:

```text
download snapshot
+
change/version token
```

daripada replay seluruh history jika tidak diperlukan client.

---

## 112. Snapshot + event model

Recommended:

```text
Master Snapshot
+
Incremental Changes
+
Outbound Local Events
```

untuk practical PWA operation.

---

## 113. Sync cursor/version token

Server dapat memberikan:

```text
sync_cursor
change_token
```

untuk incremental sync.

---

## 114. Cursor is not business timestamp

Jangan menggunakan client clock timestamp saja sebagai sync cursor.

Gunakan server-generated monotonic/version token where practical.

---

## 115. Initial bootstrap

New POS device harus mendapatkan minimal:

```text
Business Settings
User/Auth Context
Product Catalog
Product Units
Barcodes
Published Pricing
Promotions
Relevant Stock Projection
Payment Methods
```

sebelum full offline-ready state.

---

## 116. Offline-ready indicator

Device dapat menunjukkan:

```text
Ready for Offline Use
```

setelah critical cache tersedia.

---

## 117. Incomplete bootstrap

Jika pricing/catalog critical belum lengkap:

POS jangan mengklaim offline-ready.

---

## 118. Back Office offline capability

Back Office tidak harus mempunyai offline parity 100%.

Prioritas offline tertinggi:

```text
POS Sales
Shift
Cash
Inventory effects
Receiving
```

Back Office advanced reporting dapat membutuhkan online data.

---

## 119. Reporting authority

Consolidated reporting sebaiknya menggunakan server/cloud synchronized data.

Local report dapat diberi label:

```text
This Device / Unsynced data included
```

jika relevant.

---

## 120. Unsynced transactions in owner report

Server report belum dapat melihat unsynced device events.

Sync health harus membuat keterbatasan tersebut visible.

---

## 121. No fake completeness

Jika device offline:

Owner dashboard tidak boleh menyatakan:

```text
Today's Sales = definitive
```

tanpa indication data may still be pending from offline devices.

---

## 122. Reconciliation states

Recommended cross-domain exceptions:

```text
SYNC_CONFLICT
STALE_PRICING
STALE_AUTHORIZATION
INVENTORY_DISCREPANCY
SHIFT_RECONCILIATION
PURCHASE_INTEGRITY
```

---

## 123. Exception queue

Owner/Admin dapat melihat:

```text
Requires Review
```

yang menggabungkan relevant reconciliation exceptions.

---

## 124. Conflict resolution permission

Recommended:

```text
sync.read
sync.retry
sync.resolve
sync.diagnostics.read
```

Normal Cashier tidak perlu `sync.resolve`.

---

## 125. Automatic conflict resolution preference

Jika safe:

```text
auto-resolve
```

lebih baik daripada meminta user memilih setiap conflict.

User review hanya untuk semantic conflict yang tidak dapat diketahui system.

---

## 126. Append-only domain merge

Domain append-only seperti Transaction/Stock Movement biasanya:

```text
merge by unique event ID
```

bukan manual conflict.

---

## 127. Mutable master merge

Master-data updates menggunakan version checks.

---

## 128. Settings conflict

Sensitive Settings concurrent edit:

recommended:

```text
SERVER REJECTS stale version
→ user reload/review
```

Jangan auto-merge critical policy settings.

---

## 129. Permission conflict

Permission/Role changes server authoritative.

Local stale edit tidak boleh override newer permission config silently.

---

## 130. Pricing publication conflict

Global published price server authoritative.

Only one valid active version per Product Unit + Tier at one time as Domain 04.

---

## 131. Purchase posting conflict

Jika same Purchase edited from two devices:

version conflict harus ditangani.

Posted state tidak boleh di-unpost oleh stale client.

---

## 132. Stock Opname conflict

Stock Opname session harus memiliki ownership/version controls.

Dua device tidak boleh mem-post session sama dua kali.

---

## 133. Shift conflict

Same shift:

```text
OPEN
→ CLOSED
```

state transition idempotent.

Stale client tidak boleh mengubah CLOSED kembali ke OPEN.

---

## 134. Return conflict

Remaining Returnable Qty harus diverifikasi server saat sync.

Jika dua devices melakukan return terhadap same original quantity:

server dapat menghasilkan:

```text
RETURN_QUANTITY_CONFLICT
```

dan require review/compensation.

---

## 135. Payment provider authority

Untuk integrated payment:

Provider/server confirmation dapat menjadi authority atas settlement state.

Local UI input bukan final authority jika provider mengatakan payment failed.

---

## 136. Cash payment authority

Cash payment physical event dapat difinalisasi locally.

---

## 137. QRIS manual confirmation

Jika non-integrated manual QRIS:

local user confirmation menjadi business record dengan marker:

```text
MANUAL_CONFIRMED
```

bukan `PROVIDER_VERIFIED`.

---

## 138. Sync security

Sync requests harus authenticated/authorized.

Device ID sendiri bukan credential.

---

## 139. Data encryption readiness

Sensitive tokens/credentials tidak disimpan plaintext.

Specific crypto architecture ditentukan System Architecture.

---

## 140. No secrets in sync logs

Sync diagnostics tidak boleh menyimpan:

```text
password
PIN
access token
payment secret
```

---

## 141. Payload versioning

Sync/API payload sebaiknya memiliki:

```text
schema_version
```

atau contract versioning.

Agar client lama dapat dideteksi/handled.

---

## 142. Client version compatibility

Server dapat menolak operation dari client terlalu lama jika business rules incompatible.

Response harus jelas:

```text
UPDATE_REQUIRED
```

bukan generic sync failure.

---

## 143. Migration-safe sync

Database migration local/cloud tidak boleh membuat pending events tidak dapat diproses.

Pending queue schema harus ikut migration strategy.

---

## 144. Sync audit

Audit minimal:

```text
Sync Started
Sync Completed
Sync Failed
Conflict Detected
Conflict Resolved
Device Registered
Device Revoked
Stale Pricing Exception
Stale Authorization Exception
```

Tidak perlu log setiap network request sebagai business audit.

---

## 145. Operational vs technical logs

Pisahkan:

```text
Business Audit
```

dan:

```text
Technical Sync Log
```

Business user tidak perlu membaca low-level logs.

---

## 146. Retry does not create new business audit

Retry technical bukan action bisnis baru.

Audit original business action tetap satu.

---

## 147. Sync latency metrics readiness

System dapat mengukur:

```text
pending duration
last successful sync
oldest unsynced event
```

untuk diagnostics.

---

## 148. Offline duration warning

Jika device offline terlalu lama:

```text
warning
```

dapat diberikan.

Threshold configurable.

---

## 149. Long-offline risk

Semakin lama offline:

- stock semakin stale,
- price semakin stale,
- permissions semakin stale,
- conflicts semakin mungkin.

System harus mengomunikasikan risiko tanpa menghentikan safe cash sales secara arbitrer.

---

## 150. Critical stale policy

Architecture dapat mempunyai configured maximum offline age untuk sensitive features.

Contoh:

```text
permission management disabled
pricing activation disabled
```

setelah prolonged offline.

Cash sale dapat tetap allowed.

---

## 151. Data authority summary

Recommended final authority model:

```text
Identity / Permissions
→ Cloud authoritative

Product Master
→ Cloud authoritative

Published Pricing
→ Cloud authoritative

Business Settings
→ Cloud authoritative

Completed Local Sales Events
→ Event authoritative once locally committed

Inventory
→ Shared event ledger authoritative

Cash
→ Shift/cash event ledger authoritative

Audit
→ Append-only shared events

Reporting
→ Consolidated synchronized cloud projection
```

---

## 152. Back Office/POS do not own duplicate truth

Walaupun dua apps terpisah secara teknis:

```text
Back Office
POS
```

tidak boleh masing-masing memiliki independent canonical Product/Price/Inventory truth.

Gunakan shared domain authority.

---

## 153. User does not care which app owns data

Product rule:

> User tidak boleh perlu memahami bahwa data berasal dari Back Office atau POS.

Data flow harus terasa satu ecosystem.

---

## 154. No manual export/import for normal sync

Normal operation tidak menggunakan:

```text
Export CSV from Back Office
Import CSV to POS
```

untuk sinkronisasi harian.

Integration terjadi otomatis melalui shared platform.

CSV tetap dapat digunakan untuk migration/import.

---

## 155. Sync recovery mode

Jika system mendeteksi severe local consistency issue:

dapat masuk:

```text
RECOVERY_REQUIRED
```

dan mencegah destructive action.

Normal safe data harus diekspor/synced/rebuilt terlebih dahulu.

---

## 156. Local projection rebuild

Caches seperti:

```text
Stock Balance
Product Search Index
Shift Summary
```

dapat dibangun ulang dari local authoritative data + cloud snapshot.

---

## 157. Cloud projection rebuild

Server projections juga harus theoretically rebuildable dari authoritative records/events.

---

## 158. No data repair by hidden overwrite

Jika reconciliation needed:

gunakan:

```text
correction event
reversal
conflict resolution
projection rebuild
```

bukan silent SQL-like overwrite dari UI.

---

## 159. Sync supportability

Setiap failed sync harus dapat dijelaskan minimal melalui:

```text
entity/event
status
attempt
error category
next action
```

untuk diagnostics.

---

## 160. Error categories

Recommended:

```text
NETWORK
AUTHENTICATION
AUTHORIZATION
VALIDATION
VERSION_CONFLICT
DUPLICATE
SERVER
CLIENT_VERSION
UNKNOWN
```

---

## 161. Business validation failure after offline sync

Contoh:

offline Purchase melanggar new server rule.

Jangan delete local record.

Mark:

```text
REQUIRES_REVIEW
```

dengan validation error.

---

## 162. Completed physical reality preservation

Event yang merepresentasikan physical reality:

```text
sale occurred
goods received
cash moved
customer returned goods
```

tidak boleh dihapus hanya karena validation/server state berbeda.

Gunakan exception/reconciliation.

---

## 163. Master-data invalid mutation

Sebaliknya, invalid local master-data edit boleh ditolak server.

Local proposed value tetap tersedia untuk review.

---

## 164. Soft lock readiness

For mutable shared records, architecture dapat menggunakan optional:

```text
editing indicator
```

tetapi tidak perlu distributed hard lock untuk v2.

Optimistic concurrency cukup.

---

## 165. Device removal with pending events

Device tidak boleh dianggap safe-to-remove jika:

```text
pending events > 0
```

tanpa explicit warning/recovery.

---

## 166. Logout with pending events

Logout boleh dilakukan jika data tetap persisten dan associated user attribution preserved.

UI harus memastikan pending events tidak hilang.

---

## 167. User switch with pending events

Pending events tetap attributed ke original actor/user.

Login user baru tidak mengubah actor historical.

---

## 168. Sync queue actor identity

Outbound event menyimpan:

```text
actor_user_id
device_id
session/reference
```

sesuai Domain 08.

---

## 169. Future multi-location sync readiness

Current v2 single-store.

Events tetap menyimpan:

```text
location_id
```

agar future multi-location sync tidak membutuhkan fundamental redesign.

---

## 170. Future lot sync readiness

Current no lot/expiry.

Event contracts jangan menghalangi future optional:

```text
lot_id
```

on inventory movements.

---

## 171. Non-goals Domain 10 v2

Belum termasuk:

```text
Peer-to-peer device sync
CRDT general-purpose engine
Real-time collaborative editing
Global active-active multi-region architecture
Full event-sourcing framework for every master record
Blockchain ledger
Complex distributed consensus
Multi-business offline federation
```

Kastur cukup menggunakan architecture yang robust dan understandable.

---

## 172. Core Invariants

Kita lock:

1. Kastur offline-first untuk operasi yang aman secara bisnis.
2. Business Status dan Sync Status selalu terpisah.
3. Completed offline business event tetap valid secara lokal.
4. Shared master/config cloud-authoritative.
5. Completed transactional events menggunakan stable global IDs.
6. Sync harus idempotent client dan server.
7. Retry tidak pernah menggandakan business event.
8. Inventory/cash sync menggunakan event ledger, bukan absolute balance overwrite.
9. No last-write-wins untuk financial/inventory ledgers.
10. Local commit terjadi sebelum sync untuk offline-safe operation.
11. Sync failure tidak mengubah completed transaction menjadi Draft.
12. Sync queue persistent/durable.
13. Device identity terpisah dari user identity.
14. Business timestamp dipisahkan dari server arrival timestamp.
15. POS menggunakan cached catalog/pricing untuk offline operation.
16. Stale price sale tetap historical truth.
17. Stale pricing dapat menghasilkan review exception, bukan retroactive repricing.
18. Master-data conflict menggunakan version/concurrency handling.
19. Same-field conflict tidak silently overwrite.
20. Local rejected change tidak hilang tanpa review.
21. Published Pricing cloud-authoritative.
22. Pricing Draft dapat offline; global publication membutuhkan authoritative sync.
23. Physical receiving event tidak dihapus karena sync discrepancy.
24. Duplicate invoice check dijalankan ulang server setelah sync.
25. Multi-device inventory events digabung sebagai movements.
26. Negative stock after merge menghasilkan discrepancy, bukan deleted sales.
27. Shift close snapshot tidak di-overwrite oleh late sync events.
28. Return/refund sync idempotent.
29. Permission cache versioned dan server-authoritative.
30. High-risk stale authorization dapat menghasilkan exception.
31. Human-readable sequence tidak boleh memblokir offline operation.
32. Atomic business aggregate dipertahankan local dan server.
33. Pending events dilindungi dari destructive local-data reset.
34. Sync normal otomatis; manual sync hanya recovery.
35. Consolidated reporting cloud-based dan harus menunjukkan jika data belum lengkap.
36. User tidak perlu memahami app mana yang “memiliki” data.
37. Back Office dan POS tidak memiliki duplicate canonical truth.
38. Historical business facts tidak dihapus karena conflict.
39. Corrections menggunakan reconciliation/reversal/new events.
40. Technical sync logs dan Business Audit adalah konsep terpisah.

---

## 173. Definition of Done

Domain Offline, Sync & Data Authority dianggap benar bila kasus berikut dapat ditangani.

### Offline Cash Sale

```text
Network unavailable
↓
Scan cached Product
↓
Use cached published Price
↓
Cash Payment
↓
Local Transaction COMPLETED
↓
Inventory local -qty
↓
Cash ledger +
↓
Sync PENDING
```

Saat online:

```text
same business aggregate synced once
```

### Sync Retry

```text
Upload times out
↓
Retry
↓
Server already has event ID
↓
No duplicate sale/payment/stock movement
```

### Multi-device Inventory

```text
Device A offline Sale -5
Device B Sale -3

After sync:
Total impact -8
```

### Negative Stock After Merge

```text
Both devices thought stock sufficient
↓
Merged balance negative
↓
Inventory discrepancy
↓
Completed sales preserved
```

### Stale Pricing

```text
Device uses Price V1 offline
Server already has V2

Transaction completed using V1
↓
Historical price remains V1
↓
STALE_PRICING_EXCEPTION possible
```

### Scheduled Price Already Cached

```text
V2 cached
effective 17 Aug 00:00

Offline across midnight
↓
Client can activate known V2
```

### Scheduled Price Not Cached

```text
Client never received V2
↓
Uses latest known published V1
↓
review after sync
```

### Product Conflict

```text
Admin offline changes Product Name A
Owner online changes Product Name B
↓
version conflict
↓
no silent overwrite
↓
review required
```

### Purchase Receiving Offline

```text
Goods physically received
↓
local receipt + stock movement
↓
sync later
```

Jika duplicate invoice discovered server-side:

```text
Purchase Integrity Exception
```

bukan deletion of receipt.

### Offline Shift

```text
Open shift offline
Sell
Close shift offline
↓
business state valid local
↓
sync pending
```

### Late Shift Event

```text
Closed offline
Late server event found
↓
original closing snapshot preserved
↓
SHIFT_RECONCILIATION_EXCEPTION
```

### Permission Revoked While Offline

```text
Cached Cashier permission still exists
↓
offline allowed action occurs
↓
sync
↓
AUTHORIZATION_STALE_EXCEPTION if sensitive
↓
future permission revoked after refresh
```

### Return Offline

```text
Cached original transaction
↓
Return + cash refund
↓
local complete
↓
sync once
```

### Failed Provider Refund

```text
Return accepted
Refund provider failed
↓
Return remains recorded
↓
Refund PENDING/FAILED
↓
outstanding refund queue
```

### Local Data Protection

```text
20 transactions pending
User attempts clear/reset
↓
strong warning / block destructive action
```

### Server Report Completeness

```text
POS-02 offline with 24 transactions pending
↓
Owner dashboard indicates incomplete sync state
```

### App Restart

```text
Pending sync queue exists
↓
browser/app restart
↓
queue still present
↓
retry continues
```

---

# Core invariant Domain 10

> **Kastur memisahkan fakta bisnis dari status sinkronisasinya. Transaksi, inventory movement, cash movement, receiving, dan return yang sah diselesaikan secara lokal ketika offline-safe, kemudian disinkronkan secara idempotent sebagai business events yang immutable. Cloud menjadi authority untuk shared master data, permissions, dan published pricing; konflik tidak diselesaikan dengan silent last-write-wins terhadap fakta bisnis.**

Flow utama:

```text
USER ACTION
    ↓
BUSINESS VALIDATION
    ↓
LOCAL ATOMIC COMMIT
    │
    ├── DOMAIN RECORD
    ├── LEDGER EVENT
    ├── AUDIT EVENT
    └── SYNC QUEUE
           ↓
     CONNECTION?
      ┌────┴────┐
      ↓         ↓
    YES        NO
      ↓         ↓
    SYNC     PENDING
      ↓         │
SERVER IDEMPOTENCY
      ↓         │
AUTHORITY / VERSION CHECK
      ↓         │
 ┌────┴─────┐   │
 ↓          ↓   │
ACCEPT   CONFLICT
 ↓          ↓   │
SYNCED   RECONCILE
            ↓
       OWNER/ADMIN REVIEW
            IF REQUIRED
```

---

# Domain Authority Summary

```text
IDENTITY / PERMISSIONS
→ Cloud Authoritative

PRODUCT MASTER
→ Cloud Authoritative

PUBLISHED PRICING
→ Cloud Authoritative

BUSINESS SETTINGS
→ Cloud Authoritative

TRANSACTION EVENTS
→ Locally authoritative once validly committed,
  then globally synchronized

INVENTORY
→ Shared append-only movement ledger

CASH
→ Shared shift/cash movement ledger

AUDIT
→ Append-only shared event history

REPORTING
→ Consolidated synchronized projection
```
