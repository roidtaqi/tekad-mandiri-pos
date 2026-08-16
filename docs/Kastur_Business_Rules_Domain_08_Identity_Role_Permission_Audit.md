# Kastur Retail System — Business Rules v1
## Domain 08: Identity, Role, Permission & Audit

**Status:** Draft for Approval  
**Depends on:** Domain 01–07  
**Applies to:** Kastur Back Office + Kastur POS  
**Primary Roles:** Owner, Admin, Cashier  
**Shared Domain:** Identity & Audit

---

## 1. Tujuan domain

Identity, Role, Permission & Audit harus mampu menjawab:

```text
Siapa user ini?
Role apa yang dimiliki?
Apa yang boleh dilakukan?
Apa yang tidak boleh dilakukan?
Di workspace mana user bekerja?
Device/session mana yang digunakan?
Siapa melakukan perubahan bisnis?
Kapan perubahan terjadi?
Apa nilai sebelum dan sesudah?
Apakah tindakan membutuhkan authority khusus?
```

Domain ini menjadi fondasi kontrol akses di seluruh Kastur.

---

## 2. Identity adalah shared domain

Back Office dan POS tidak memiliki user database terpisah.

Gunakan satu sumber identitas:

```text
KASTUR IDENTITY
├── User
├── Role
├── Permission
├── Session
├── Device Context
└── Authentication State
```

User yang sama dapat berpindah workspace sesuai permission.

---

## 3. One user, one identity

Satu manusia/operator harus memiliki satu `user_id` yang konsisten di seluruh ecosystem.

Jangan membuat:

```text
Admin Back Office
```

dan:

```text
Admin POS
```

sebagai dua identity berbeda untuk orang yang sama.

---

## 4. User internal ID

Gunakan immutable:

```text
user_id
```

yang tidak bergantung pada:

- email,
- username,
- phone number,
- display name,
- role.

Perubahan atribut user tidak mengubah identity.

---

## 5. Current v2 roles

Role awal Kastur:

```text
OWNER
ADMIN
CASHIER
```

Tidak ada:

```text
PURCHASING
WAREHOUSE
SUPERVISOR
STORE_MANAGER
```

sebagai role aktif v2 awal.

Architecture harus siap jika role tersebut ditambahkan nanti.

---

## 6. Role adalah permission preset

Rule utama:

> **Role bukan sumber authority final. Role adalah bundle/preset dari permissions.**

Concept:

```text
USER
↓
ROLE
↓
PERMISSIONS
```

Authorization harus mengecek permission yang relevan.

Jangan bergantung hanya pada:

```text
if role == OWNER
```

---

## 7. Permission adalah atomic capability

Permission merepresentasikan capability bisnis tertentu.

Contoh:

```text
product.read
product.write
pricing.approve
inventory.adjust
transaction.void
shift.force_close
```

Permission harus cukup granular untuk menjaga separation of duties.

---

## 8. Role preset v2

Default mapping dapat mengikuti:

```text
OWNER
→ broad business control

ADMIN
→ back-office operational control

CASHIER
→ sales execution
```

Exact permission matrix harus explicit, bukan implicit di UI.

---

## 9. Owner responsibility

Owner adalah:

```text
Business Controller
```

Primary authority:

- pricing approval,
- direct price change,
- pricing override,
- user/permission management,
- sensitive supplier changes,
- business settings,
- high-risk correction,
- exception review,
- audit visibility,
- shift/cash supervision.

---

## 10. Admin responsibility

Admin adalah:

```text
Back Office Operator
+
Purchasing Operator
```

Primary capabilities:

- Product Master,
- Supplier,
- Purchasing,
- Receiving,
- Inventory operation,
- Cost operation,
- Price Proposal,
- Pricing Calculator,
- Reporting operasional.

Admin tidak mengaktifkan harga proposal sendiri.

---

## 11. Cashier responsibility

Cashier adalah:

```text
Sales Operator
```

Primary capabilities:

- POS,
- transaction creation,
- payment,
- receipt,
- shift operations,
- limited transaction history,
- permitted manual discount.

Cashier tidak melihat cost/margin/supplier-sensitive data.

---

## 12. Default workspace landing

Default:

```text
Owner
→ Back Office

Admin
→ Back Office

Cashier
→ POS
```

Cashier tidak dipaksa membuka generic dashboard.

---

## 13. Workspace access

User dapat memiliki permission untuk:

```text
workspace.backoffice.access
workspace.pos.access
```

Role preset menentukan default.

Owner/Admin dapat menggunakan POS bila operationally needed.

---

## 14. Permission evaluation

Authorization wajib dilakukan pada:

```text
business action boundary
```

bukan hanya menyembunyikan tombol.

Contoh:

```text
button hidden
```

tidak cukup.

Service/command handler tetap harus mengecek authority.

---

## 15. UI visibility follows permission

UI menggunakan permission untuk:

- menampilkan menu,
- tombol,
- action,
- sensitive fields.

Tetapi UI bukan security boundary tunggal.

---

## 16. Server/cloud validation

Untuk actions yang disinkronkan ke cloud/server:

authorization harus diverifikasi lagi oleh authoritative backend sesuai architecture.

Jangan percaya client-only permission state untuk sensitive action.

---

## 17. Offline authorization

Karena Kastur offline-first, client dapat menggunakan cached authorization context untuk operasi offline yang memang diizinkan.

Cached context harus memiliki:

```text
user_id
role
permissions
issued_at
version
```

atau equivalent.

---

## 18. Offline permission staleness

Jika permission berubah di server saat device offline:

transaksi yang secara sah dilakukan berdasarkan last-known authorized context tidak boleh dihapus diam-diam saat sync.

System dapat menghasilkan:

```text
AUTHORIZATION_STALE_EXCEPTION
```

untuk review bila diperlukan.

---

## 19. High-risk actions online requirement readiness

Architecture dapat menandai permission/action tertentu:

```text
online_required = true
```

jika kelak dianggap terlalu sensitif untuk offline finalization.

V2 tidak harus menerapkan ini secara luas.

---

## 20. Permission naming convention

Recommended:

```text
domain.resource.action
```

atau konsisten dengan simpler format:

```text
product.read
pricing.approve
inventory.adjust
```

Yang penting:

- deterministic,
- human-readable,
- stable,
- tidak tergantung nama UI.

---

## 21. Product permissions

Recommended:

```text
product.read
product.create
product.update
product.deactivate

product.unit.manage
product.barcode.manage
product.supplier.manage
```

---

## 22. Purchasing permissions

Recommended:

```text
purchase.read
purchase.create
purchase.update_draft
purchase.receive
purchase.post
purchase.correct

supplier.read
supplier.create
supplier.update
supplier.return.create
supplier.claim.resolve
```

---

## 23. Cost permissions

Recommended:

```text
cost.read
cost.adjust
cost.history.read
cost.reconciliation.read
```

`cost.adjust` harus sensitif.

---

## 24. Pricing permissions

Recommended:

```text
pricing.read
pricing.calculate
pricing.proposal.create
pricing.proposal.review
pricing.approve
pricing.direct_change
pricing.override_floor
pricing.rule.manage
pricing.history.read
promotion.manage
```

---

## 25. Inventory permissions

Recommended:

```text
inventory.read
inventory.adjust
inventory.opname.create
inventory.opname.post
inventory.history.read
inventory.integrity.read
inventory.initial_stock.manage
```

---

## 26. POS permissions

Recommended:

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

---

## 27. Shift & Cash permissions

Recommended:

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
```

---

## 28. Payment permissions

Recommended:

```text
payment.read
payment.record
payment.reverse
payment.manual_confirm

refund.process
refund.override_method
```

---

## 29. User management permissions

Recommended:

```text
user.read
user.create
user.update
user.deactivate

role.read
role.assign
role.manage

permission.read
permission.manage
```

Untuk v2:

```text
role.manage
permission.manage
```

default Owner-only.

---

## 30. Settings permissions

Recommended:

```text
settings.read
settings.update

settings.pricing
settings.inventory
settings.payment
settings.security
settings.business
```

High-risk settings sebaiknya Owner-only.

---

## 31. Audit permissions

Recommended:

```text
audit.read
audit.export
audit.sensitive.read
```

Cashier biasanya tidak membutuhkan broad audit access.

---

## 32. Owner default permission philosophy

Owner default mempunyai seluruh permission bisnis yang relevan.

Tetapi system tetap mencatat:

```text
Owner override
Owner direct action
Owner sensitive change
```

Tidak ada konsep “Owner tidak perlu diaudit”.

---

## 33. Admin default permission philosophy

Admin memiliki broad operational permissions, tetapi tidak:

```text
pricing.approve
pricing.direct_change
pricing.override_floor
permission.manage
role.manage
shift.force_close
```

secara default, kecuali Owner explicitly memberi.

---

## 34. Cashier default permission philosophy

Cashier menggunakan minimal required access.

Contoh default:

```text
workspace.pos.access
pos.use
transaction.create
transaction.complete
transaction.history.read_limited
payment.record
shift.open
shift.close
receipt.reprint
discount.apply_limited
```

---

## 35. Separation of Duties

Kastur harus menjaga beberapa separation utama.

Contoh:

```text
Admin creates price proposal
Owner approves
```

bukan:

```text
Admin creates + approves own proposal
```

---

## 36. Pricing separation

Rules:

```text
Admin
→ Create Proposal
→ Review

Owner
→ Approve / Reject / Edit & Approve
```

Owner direct change tidak membutuhkan self-approval.

---

## 37. Purchase supervision separation

Admin dapat:

```text
Create
Receive
Post
```

Purchase normal tanpa Owner approval.

Owner mengawasi:

```text
Exceptions
Anomalies
Supplier Claims
```

Separation dilakukan melalui review/visibility, bukan unnecessary approval.

---

## 38. Sensitive supplier change

Perubahan data supplier sensitif seperti:

```text
bank account
payment destination
```

membutuhkan:

```text
Owner verification
```

jika fitur tersebut digunakan.

---

## 39. Manual cost adjustment

`cost.adjust` bukan generic edit.

Action wajib:

```text
reason
actor
timestamp
before
after
```

dan audit.

---

## 40. Inventory adjustment authority

Cashier tidak mempunyai `inventory.adjust` default.

Admin dapat.

Owner dapat.

High-value adjustment dapat masuk Owner Attention.

---

## 41. Void authority

Cashier normal dapat dibatasi untuk post-completion Void.

Recommended:

- Cancel draft: allowed,
- Void completed: supervisor permission,
- high-value void: Owner/Admin review.

---

## 42. Discount authority

Cashier dapat memiliki:

```text
discount.apply
```

dengan limit.

Owner dapat memiliki:

```text
discount.override
```

atau equivalent override capability.

---

## 43. Floor override authority

Default:

```text
pricing.override_floor
→ Owner
```

Cashier/Admin tidak mendapatkannya secara default.

---

## 44. Shift forced close

Default:

```text
shift.force_close
→ Owner/Admin appropriate supervisor
```

Cashier tidak force-close shift sendiri setelah exception condition.

---

## 45. Refund authority

Refund dapat dikontrol berdasarkan:

```text
amount
age of transaction
payment method
reason
```

Permission dasar:

```text
refund.process
```

High-risk override terpisah bila diperlukan.

---

## 46. Role assignment

User dapat memiliki satu primary role pada v2.

Architecture harus tidak menutup kemungkinan multi-role assignment kelak.

Untuk simplicity:

```text
one primary role
+
permission overrides optional
```

cukup untuk v2.

---

## 47. Permission overrides

Architecture dapat mendukung:

```text
grant override
revoke override
```

pada user tertentu.

Contoh:

```text
Admin A
+ inventory.adjust

Admin B
- inventory.adjust
```

---

## 48. Avoid uncontrolled permission complexity

V2 UI tidak perlu menjadi enterprise IAM console.

Recommended UX:

```text
Select Role
↓
Optional Advanced Permissions
```

Owner tidak dipaksa mengatur ratusan permission saat membuat user.

---

## 49. Built-in roles

OWNER, ADMIN, CASHIER dapat menjadi:

```text
SYSTEM_ROLE
```

yang preset-nya dikelola Kastur.

Owner dapat mengubah user assignment dan limited overrides.

Future custom roles dapat ditambahkan kemudian.

---

## 50. Owner role protection

Business harus selalu memiliki minimal satu active Owner.

System tidak boleh mengizinkan aksi yang menyebabkan:

```text
0 active owners
```

---

## 51. Owner self-deactivation protection

Owner terakhir tidak dapat:

```text
deactivate self
remove own Owner authority
```

tanpa transfer ownership/another Owner.

---

## 52. User lifecycle

Recommended states:

```text
INVITED
ACTIVE
SUSPENDED
INACTIVE
```

Jika invitation flow tidak digunakan:

```text
ACTIVE
SUSPENDED
INACTIVE
```

cukup.

---

## 53. Inactive user history

Deactivating user tidak menghapus historical references.

Transaction tetap menunjukkan:

```text
cashier_user_id
```

Purchase tetap menunjukkan creator/receiver.

Audit tetap utuh.

---

## 54. User deletion

User dengan historical business activity tidak hard-delete melalui normal UI.

Gunakan:

```text
INACTIVE
```

---

## 55. Display name changes

Jika user mengganti nama:

historical references tetap menunjuk user identity yang sama.

Snapshot display name dapat disimpan pada transaction/receipt bila diperlukan.

---

## 56. Authentication credential independence

Credential seperti:

- password,
- PIN,
- email,
- phone,

bukan business identity.

Mengubah credential tidak mengubah `user_id`.

---

## 57. Cashier quick authentication

POS dapat mendukung operational PIN/login yang cepat.

Tetapi PIN harus tetap terkait identity yang unik.

Jangan menggunakan shared cashier account.

---

## 58. Shared account prohibited

Rule:

> Setiap operator harus menggunakan identity sendiri.

Jangan gunakan:

```text
kasir@toko
```

dipakai lima orang.

Shared account merusak auditability.

---

## 59. Session

Session merepresentasikan authenticated usage period.

Minimal context:

```text
session_id
user_id
issued_at
expires_at
device_id
```

---

## 60. Session expiration

Session harus mempunyai expiration/revalidation policy.

POS operational UX boleh menjaga session practical, tetapi sensitive action dapat meminta re-authentication jika diperlukan.

---

## 61. Sensitive action re-authentication readiness

Architecture dapat mendukung:

```text
step-up authentication
```

untuk:

- Owner pricing override,
- sensitive supplier bank change,
- permission management,
- high-value correction.

Tidak harus digunakan pada setiap action v2 awal.

---

## 62. Device Identity

Kastur offline-first membutuhkan:

```text
device_id
```

yang stabil per installed client/device.

Digunakan untuk:

- offline event identity,
- sync,
- audit,
- transaction numbering strategy,
- conflict diagnostics.

---

## 63. Device identity is not user identity

Satu device dapat digunakan beberapa user.

Satu user dapat menggunakan beberapa device.

Relasi:

```text
User
↔ Sessions
↔ Device
```

---

## 64. Device registration

Architecture dapat memiliki device registration metadata:

```text
device_id
device_name
first_seen_at
last_seen_at
status
```

---

## 65. Lost/retired device

Device dapat ditandai:

```text
REVOKED
INACTIVE
```

tanpa menghapus historical events yang berasal dari device tersebut.

---

## 66. Audit adalah shared domain

Audit tidak dibuat terpisah per Back Office/POS.

Gunakan satu cross-domain audit history.

Concept:

```text
AUDIT LOG
├── Identity
├── Product
├── Purchasing
├── Costing
├── Pricing
├── Inventory
├── POS
├── Shift
├── Cash
└── Settings
```

---

## 67. Audit event minimum fields

Minimal:

```text
audit_event_id
actor_user_id
action
entity_type
entity_id
timestamp
workspace
device_id
```

Jika relevan:

```text
before
after
reason
reference
session_id
location_id
```

---

## 68. Audit business action focus

Audit harus fokus pada meaningful business action.

Contoh audit-worthy:

```text
Price Approved
Stock Adjusted
Purchase Posted
Transaction Voided
Shift Force Closed
Permission Changed
```

Bukan setiap mouse click.

---

## 69. Audit immutability

Audit event yang sudah ditulis tidak boleh diedit atau dihapus melalui normal application flow.

---

## 70. Audit reason

Action tertentu wajib mempunyai reason:

```text
Floor Override
Manual Cost Adjustment
Inventory Adjustment
Post-completion Void
Forced Shift Close
Sensitive Permission Change
```

---

## 71. Before/after snapshots

Untuk update sensitive:

```text
before
after
```

harus tersedia jika practical.

Contoh:

```text
Target Margin
20% → 15%
```

---

## 72. Audit references

Audit dapat mereferensikan business source:

```text
purchase_id
transaction_id
price_proposal_id
shift_id
```

agar investigation mudah.

---

## 73. Audit cross-navigation

UX ideal memungkinkan Owner dari audit event menuju business record terkait.

Contoh:

```text
Audit:
Price Approved
→ Open Price Version
```

---

## 74. Audit actor type

Normal:

```text
USER
```

Architecture juga harus mendukung:

```text
SYSTEM
SYNC
AUTOMATION
```

sebagai actor/source type jika system menghasilkan event.

---

## 75. System-generated events

Contoh:

```text
Scheduled Price Activated
Cost Reconciliation Created
Sync Conflict Detected
```

Actor dapat:

```text
SYSTEM
```

tetapi initiating user/reference tetap disimpan jika relevan.

---

## 76. Offline audit

Business action offline tetap membuat audit event lokal.

Sync kemudian mengirim event dengan original business timestamp.

---

## 77. Audit timestamp separation

Jika offline, dapat disimpan:

```text
occurred_at
synced_at
```

agar audit tidak menganggap server arrival time sebagai business action time.

---

## 78. Audit ordering

Stable event ID + occurred timestamp digunakan.

Jika sync arrival tidak berurutan, UI dapat tetap menunjukkan chronology berdasarkan business time dengan indicator bila diperlukan.

---

## 79. Audit of permission changes

Setiap perubahan:

```text
role assignment
permission grant
permission revoke
user deactivate
```

harus diaudit.

---

## 80. Permission change actor

User tidak boleh mengubah permission sendiri kecuali explicit Owner-level workflow memang mengizinkan.

Default:

```text
permission management
→ Owner
```

---

## 81. Owner actions are auditable

Tidak ada exemption:

```text
actor == OWNER
→ skip audit
```

Owner authority tinggi justru memerlukan audit yang kuat.

---

## 82. Audit visibility by role

Default:

```text
Owner
→ broad audit

Admin
→ operational audit according to permission

Cashier
→ own operational history / limited event visibility
```

---

## 83. Sensitive audit data

Audit dapat mengandung:

- cost,
- supplier detail,
- permission changes,
- cash variance.

Gunakan:

```text
audit.sensitive.read
```

atau equivalent.

---

## 84. Audit export

Owner dapat memiliki:

```text
audit.export
```

untuk kebutuhan review/investigation.

Format final ditentukan implementation.

---

## 85. No secret user actions

Semua high-risk action harus meninggalkan trace.

Contoh:

```text
Price Override
Inventory Adjustment
Payment Reversal
Cash Out
Permission Change
```

---

## 86. Security event readiness

Architecture dapat membedakan:

```text
Business Audit
Security Audit
```

Security event examples:

```text
Login Failed
Session Revoked
Device Revoked
Credential Changed
```

Boleh satu storage/event system dengan category berbeda.

---

## 87. Login audit

Recommended log:

```text
LOGIN_SUCCESS
LOGIN_FAILED
LOGOUT
SESSION_EXPIRED
```

tanpa menyimpan credential secret.

---

## 88. Credential secrecy

Audit/log tidak boleh menyimpan:

```text
password
PIN plaintext
token secret
```

---

## 89. Least privilege

Default permission mengikuti prinsip:

> Berikan hanya capability yang dibutuhkan role untuk pekerjaan normalnya.

Jangan memberi broad Owner-like access kepada Admin/Cashier karena convenient.

---

## 90. Deny by default

Untuk capability yang tidak explicitly granted:

```text
DENY
```

lebih aman daripada implicit allow.

---

## 91. Permission source visibility

Untuk debugging/admin UX, system sebaiknya dapat menjelaskan:

```text
Permission granted by Role
```

atau:

```text
User Override
```

---

## 92. Authorization failure

Jika user mencoba action tanpa permission:

UI menunjukkan:

```text
Kamu tidak memiliki akses untuk tindakan ini.
```

Jangan expose internal security detail yang tidak perlu.

Audit security event dapat dibuat untuk repeated/sensitive unauthorized attempts.

---

## 93. Feature visibility vs capability

Menu yang tidak relevan dapat disembunyikan.

Tetapi jika user membuka deep link langsung:

authorization tetap berlaku.

---

## 94. Deep-link authorization

Contoh:

Cashier membuka URL:

```text
/backoffice/pricing
```

harus ditolak jika tidak memiliki permission meskipun URL valid.

---

## 95. Cross-workspace identity continuity

Owner dari Back Office dapat membuka POS tanpa identity baru.

Session/workspace switch mempertahankan user identity.

---

## 96. Workspace-specific navigation

Menu dibentuk dari:

```text
workspace
+
permissions
+
role job context
```

bukan seluruh feature list.

---

## 97. Future role readiness

Kelak role seperti:

```text
WAREHOUSE
PURCHASING
SUPERVISOR
STORE_MANAGER
```

dibuat dengan permission bundle baru.

Tidak perlu refactor business domain karena authorization sudah permission-based.

---

## 98. Future multi-location assignment readiness

Walaupun v2 single-store, schema jangan menutup kemungkinan:

```text
user_location_assignment
```

di masa depan.

Current users automatically scoped ke default location.

---

## 99. Current location scope

V2:

```text
User
→ default business
→ default store
```

tanpa location selector normal.

---

## 100. Company/business membership readiness

Jika Kastur kelak multi-tenant/business:

User identity dan business membership sebaiknya dapat dipisahkan.

Concept future:

```text
User
↓
Business Membership
↓
Role / Permissions
```

Current v2 dapat disederhanakan tetapi schema jangan mengikat identity selamanya ke satu business jika architecture memungkinkan.

---

## 101. Business ownership

Minimal satu membership/User menjadi:

```text
OWNER
```

untuk business tersebut.

---

## 102. Invitation flow optional

Jika user creation menggunakan invitation:

```text
Owner/Admin authorized
→ Invite
→ User activates
```

Jika tidak, Owner dapat create credential directly sesuai implementation.

Business rules tidak bergantung pada metode invitation.

---

## 103. User onboarding

Saat membuat user:

```text
Name
Login Identifier
Role
Optional Permission Override
```

cukup.

Jangan membuat form IAM kompleks.

---

## 104. Cashier onboarding

Cashier creation UX dapat sangat sederhana:

```text
Name
PIN / login credential
Role = Cashier
```

plus optional terminal/location context future.

---

## 105. Admin onboarding

Admin:

```text
Name
Credential
Role = Admin
```

Advanced permissions optional.

---

## 106. Owner onboarding

Business initial setup membuat Owner pertama.

Owner berikutnya memerlukan Owner authority.

---

## 107. Permission version

Karena offline-first, architecture sebaiknya mempunyai:

```text
authorization_version
```

atau equivalent change token.

Client dapat mengetahui bahwa cached permissions perlu refresh.

---

## 108. Role versioning

Jika built-in role preset berubah:

perubahan tidak boleh menghasilkan ambiguous offline authority tanpa version/change tracking.

---

## 109. Audit idempotency

Sync retry tidak boleh membuat duplicate audit event untuk action yang sama.

Gunakan stable event identity/idempotency behavior.

---

## 110. Audit correlation ID

Complex business operation dapat menggunakan:

```text
correlation_id
```

untuk menghubungkan beberapa audit events.

Contoh:

```text
Transaction Complete
Payment Record
Inventory Movement
Cash Movement
```

dalam satu operation.

---

## 111. Audit and business ledger distinction

Audit Log bukan pengganti:

```text
Stock Ledger
Cash Ledger
Cost Events
Price History
```

Audit menjawab:

```text
siapa melakukan apa?
```

Business ledgers menjawab:

```text
apa efek domainnya?
```

Keduanya harus dipertahankan.

---

## 112. Audit should not drive business totals

Jangan menghitung stock/cash/revenue dari Audit Log.

Gunakan domain ledgers.

---

## 113. Reason catalogs

Untuk action tertentu, system dapat menawarkan:

```text
Reason Code
+
Free-text Note
```

agar reporting lebih konsisten.

---

## 114. High-risk action confirmation

Sensitive action harus mempunyai explicit confirmation.

Contoh:

```text
Deactivate Product with stock
Floor Price Override
Void Completed Transaction
Force Close Shift
Permission Change
```

---

## 115. Bulk permission safety

Jika future bulk user/permission update dibuat:

harus preview + confirmation + audit.

Tidak menjadi priority v2.

---

## 116. Audit retention

Business audit harus dipertahankan jangka panjang sesuai product/storage policy.

Normal user tidak memiliki action:

```text
Delete Audit History
```

---

## 117. Privacy principle

Audit menyimpan data operasional yang diperlukan.

Jangan mengumpulkan data pribadi yang tidak relevan dengan business operation.

---

## 118. Account suspension

`SUSPENDED` user:

- tidak dapat login/new session,
- historical business activity tetap valid,
- active sessions sebaiknya direvoke saat sync/online authoritative validation.

---

## 119. Offline suspended-user edge case

Jika user disuspend server saat device offline:

cached session mungkin masih beroperasi sampai authorization refresh.

System harus:

- sync action sebagai historical event,
- flag stale authorization jika relevant,
- revoke access setelah authoritative state diterima.

Architecture dapat memperketat policy untuk sensitive workflows.

---

## 120. Session revocation

Owner dapat revoke active session/device access sesuai security capability.

Historical events tidak terhapus.

---

## 121. Cashier handoff

Cashier tidak boleh menyerahkan active session ke operator lain.

Operator berikutnya login dengan identity sendiri.

---

## 122. Shift identity consistency

Shift opened by Cashier A harus terkait Cashier A.

Jika supervisor takeover diperlukan, gunakan explicit supervisor action, bukan ganti `user_id` historical.

---

## 123. User-role snapshot readiness

Historical critical event dapat menyimpan:

```text
actor_user_id
actor_role_snapshot
```

jika diperlukan untuk reporting/audit.

Current role change tidak mengubah historical context.

---

## 124. Permission snapshot for sensitive event

Untuk high-risk offline action, architecture dapat menyimpan:

```text
authorization_snapshot/reference
```

agar diketahui permission apa yang berlaku saat event terjadi.

---

## 125. Audit integrity diagnostics

System harus dapat mendeteksi bila business event high-risk tidak memiliki expected audit record.

Ini merupakan internal integrity diagnostic, bukan normal user flow.

---

## 126. Recommended Owner dashboard security attention

Owner dapat melihat:

```text
Permission Changes
Forced Shift Close
Large Cash Variance
High-value Inventory Adjustment
Floor Overrides
Sensitive Supplier Changes
```

sebagai exception attention.

---

## 127. Admin audit attention

Admin dapat melihat operational audit yang relevan:

```text
Purchase corrections
Inventory adjustments
Receiving anomalies
```

sesuai permission.

---

## 128. Cashier own activity

Cashier dapat melihat activity sendiri yang membantu pekerjaan:

```text
Own transactions
Own shift
Own void/refund requests
```

tanpa broad audit system.

---

## 129. No authorization by hidden UI labels

Permission logic tidak boleh bergantung pada label menu seperti:

```text
"Owner Menu"
```

Gunakan capability-based authorization.

---

## 130. No hardcoded role branching in domain rules

Hindari:

```text
if role === "ADMIN"
```

untuk business service.

Gunakan:

```text
hasPermission("purchase.receive")
```

Role-based UX boleh menggunakan role context untuk landing/presentation.

---

## 131. Role can influence UX, Permission controls authority

Ini rule final:

```text
Role
→ UX preset / job context

Permission
→ authority
```

---

## 132. Non-goals Domain 08 v2

Belum termasuk:

```text
Enterprise SSO
SAML
SCIM
Complex ABAC policy engine
Multi-business organization hierarchy
Custom role builder kompleks
Hardware security keys mandatory
Biometric identity management
Employee HR system
Payroll access control
Full SIEM/security operations platform
```

Architecture jangan menutup kemungkinan integrasi kelak.

---

## 133. Core Invariants

Kita lock:

1. Back Office dan POS menggunakan satu identity source.
2. Satu operator menggunakan satu unique user identity.
3. Shared accounts dilarang.
4. Role adalah preset/bundle, bukan authority final.
5. Permission adalah authority utama.
6. Authorization wajib dicek pada business action boundary, bukan UI saja.
7. Owner/Admin/Cashier adalah role v2 awal.
8. Owner adalah business controller.
9. Admin adalah back-office/purchasing operator.
10. Cashier adalah sales operator.
11. Admin tidak dapat approve price proposal sendiri.
12. Owner direct price change tidak memerlukan self-approval tetapi tetap diaudit.
13. Cashier tidak mempunyai cost/margin/supplier-sensitive access.
14. Sensitive actions menggunakan explicit permissions.
15. Default policy adalah least privilege + deny by default.
16. Last active Owner tidak dapat dihilangkan secara tidak sengaja.
17. User dengan historical activity tidak hard-delete.
18. User deactivation tidak mengubah historical records.
19. Device identity terpisah dari user identity.
20. Offline authorization menggunakan cached context yang versioned.
21. Business status/action history tidak dihapus karena permission berubah kemudian.
22. Audit adalah shared cross-workspace domain.
23. High-risk business actions harus meninggalkan audit trail.
24. Owner actions tetap diaudit.
25. Audit event tidak diedit/hard-delete melalui normal UI.
26. Audit bukan pengganti domain ledger.
27. Sensitive before/after/reason disimpan jika relevan.
28. Permission changes sendiri harus diaudit.
29. Sync retry tidak boleh menggandakan audit event.
30. Future roles dapat ditambahkan tanpa refactor domain authority model.

---

## 134. Definition of Done

Domain Identity, Role, Permission & Audit dianggap benar bila kasus berikut dapat ditangani.

### Cashier Login

```text
Cashier A
→ Login
→ POS workspace
→ only POS operational access
```

### Admin Login

```text
Admin A
→ Login
→ Back Office
→ Product/Purchase/Inventory access
→ no pricing approval
```

### Owner Login

```text
Owner
→ Back Office
→ pricing approval
→ business control
→ audit visibility
```

### Unauthorized Pricing Approval

```text
Admin
→ attempts pricing approval
→ DENIED
```

meskipun membuka deep link langsung.

### Owner Direct Pricing

```text
Owner
→ direct price change
→ allowed
→ audit created
```

### Inventory Adjustment

```text
Cashier
→ inventory.adjust
→ DENIED

Admin with permission
→ allowed
→ reason + audit
```

### Floor Override

```text
Cashier
→ below floor
→ DENIED

Owner
→ override
→ reason required
→ audit
```

### User Deactivation

```text
Admin/Cashier deactivated
→ cannot create new session
→ historical transactions preserved
```

### Last Owner Protection

```text
Only one Owner
→ attempt deactivate/remove ownership
→ BLOCKED
```

### Shared Account Prevention

```text
Operator A and B
→ must have separate users
→ audit remains attributable
```

### Permission Override

```text
Admin A
Role = ADMIN
+ inventory.adjust

Admin B
Role = ADMIN
- inventory.adjust
```

behavior follows effective permission.

### Offline Authorization

```text
Cashier offline
→ cached valid permission
→ completes allowed cash sale
→ event syncs later
```

### Permission Changed While Offline

```text
Server revokes permission
Device offline performs action under stale context
→ event retained
→ stale-auth exception possible
→ future access revoked after refresh
```

### Audit Trail

```text
Owner changes price
→ who
→ when
→ before
→ after
→ reason if override
```

all visible.

### Device Revocation

```text
Old device revoked
→ future access denied after authoritative state received
→ historical transactions preserved
```

### Permission Change Audit

```text
Owner grants pricing permission
→ role/user
→ before
→ after
→ actor
→ timestamp
```

recorded.

---

# Core invariant Domain 08

> **Kastur menggunakan satu identity system untuk seluruh ecosystem. Role menentukan job context dan UX preset, sedangkan Permission menentukan authority sebenarnya. Semua tindakan bisnis sensitif harus dapat diatribusikan ke user yang unik, device/session yang relevan, dan audit event yang immutable. Tidak ada user—termasuk Owner—yang berada di luar audit trail.**

Flow utama:

```text
USER
  ↓
AUTHENTICATION
  ↓
SESSION + DEVICE
  ↓
ROLE
  ↓
EFFECTIVE PERMISSIONS
  ↓
WORKSPACE / BUSINESS ACTION
  │
  ├── ALLOWED
  │      ↓
  │   DOMAIN EVENT
  │      ↓
  │   AUDIT EVENT
  │
  └── DENIED
         ↓
    AUTHORIZATION RESPONSE
```
