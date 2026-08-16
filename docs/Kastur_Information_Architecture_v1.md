# Kastur Retail System — Information Architecture v1

**Status:** Draft for IA Review  
**Depends on:** Business Rules Domain 01–10, Cross-Domain Matrix, Cross-Domain Gap Resolution v1, User Journeys & Operational Flows v1  
**Scope:** Kastur Back Office + Kastur POS  
**Purpose:** Menentukan struktur workspace, navigasi, hierarchy halaman, contextual actions, dan hubungan antar-task sebelum System Architecture dan visual UI design.

---

# 1. IA Objective

Information Architecture Kastur harus memastikan bahwa user dapat menjawab dengan cepat:

```text
Di mana aku harus memulai pekerjaan ini?
Apa yang perlu aku tinjau sekarang?
Record mana yang terkait?
Action apa yang tersedia dari konteks ini?
Bagaimana kembali ke konteks kerja sebelumnya tanpa tersesat?
```

IA tidak boleh dibangun berdasarkan jumlah database entity.

Kastur menggunakan prinsip:

> **Task-first navigation, contextual detail, and exception-driven supervision.**

---

# 2. Product Topology

Kastur tetap terdiri dari dua workspace teknis:

```text
KASTUR
├── Back Office
└── POS
```

Tetapi user melihatnya sebagai satu ecosystem.

Shared:

```text
Identity
Business
Location
Product
Pricing
Inventory
Transactions
Permissions
Audit
Sync State
```

Rule:

> User tidak perlu memahami aplikasi teknis mana yang “memiliki” data.

---

# 3. Workspace Landing

## Owner

```text
Login
↓
Back Office
↓
Ringkasan
```

## Admin

```text
Login
↓
Back Office
↓
Ringkasan / last operational context
```

## Cashier

```text
Login
↓
POS
↓
Kasir
```

Cashier tidak diarahkan ke Back Office dashboard.

---

# 4. Primary IA — Back Office

Primary navigation v1:

```text
Ringkasan
Perlu Ditinjau
Produk
Pembelian
Stok
Harga
Penjualan
Laporan
Pengaturan
```

Tujuan utama adalah menjaga jumlah primary destinations tetap kecil.

Entity seperti:

```text
Supplier
Customer
Promotion
Stock Opname
User
Device
```

tidak semuanya menjadi primary navigation.

Mereka ditempatkan di task-domain yang paling relevan.

---

# 5. Primary IA — POS

Primary navigation v1:

```text
Kasir
Tertahan
Transaksi
Retur
Shift
```

Global operational indicators:

```text
Online / Offline
Pending Sync
Current Cashier
Current Shift
Terminal
```

Sync bukan primary daily navigation.

---

# 6. Back Office Sitemap

```text
BACK OFFICE
│
├── Ringkasan
│
├── Perlu Ditinjau
│
├── Produk
│   ├── Daftar Produk
│   ├── Tambah Produk
│   ├── Import Produk
│   ├── Kategori
│   └── Product Detail
│       ├── Ringkasan
│       ├── Unit & Barcode
│       ├── Harga
│       ├── Pembelian
│       ├── Stok
│       └── Riwayat
│
├── Pembelian
│   ├── Daftar Pembelian
│   ├── Buat Pembelian
│   ├── Supplier
│   ├── Retur Supplier
│   └── Purchase Detail
│       ├── Ringkasan
│       ├── Penerimaan
│       ├── Biaya
│       ├── Integritas
│       └── Riwayat
│
├── Stok
│   ├── Posisi Stok
│   ├── Pergerakan Stok
│   ├── Penyesuaian
│   ├── Stock Opname
│   └── Opname Detail
│
├── Harga
│   ├── Ringkasan Harga
│   ├── Perlu Review
│   ├── Proposal Harga
│   ├── Kalkulator Harga
│   ├── Promosi
│   └── Riwayat Harga
│
├── Penjualan
│   ├── Transaksi
│   ├── Retur
│   ├── Refund
│   ├── Customer
│   ├── Shift
│   └── Transaction Detail
│
├── Laporan
│   ├── Penjualan
│   ├── Margin
│   ├── Stok
│   ├── Pembelian
│   ├── Shift & Kas
│   └── Retur
│
└── Pengaturan
    ├── Bisnis
    ├── User & Akses
    ├── Kebijakan Harga
    ├── Kebijakan Stok
    ├── Pembayaran
    ├── POS & Terminal
    └── Sinkronisasi & Perangkat
```

---

# 7. POS Sitemap

```text
POS
│
├── Kasir
│   ├── Product Search / Scan
│   ├── Cart
│   ├── Payment
│   └── Receipt
│
├── Tertahan
│   ├── Held Cart List
│   └── Resume Cart
│
├── Transaksi
│   ├── Riwayat Transaksi
│   └── Transaction Detail
│
├── Retur
│   ├── Cari Transaksi
│   ├── Return Builder
│   ├── Refund
│   └── Return Result
│
└── Shift
    ├── Shift Aktif
    ├── Cash In
    ├── Cash Out
    ├── Safe Drop
    ├── Ringkasan
    └── Tutup Shift
```

---

# 8. Ringkasan — Back Office

**Primary Actor:** Owner, Admin

Ringkasan bukan tempat menampilkan semua data.

Tujuannya:

```text
What is happening?
What changed?
What needs attention?
Where should I go next?
```

## Core Content

```text
Today / Current Period Sales
Gross Margin Snapshot
Inventory Value
Low / Negative Stock Count
Purchasing Activity
Cash / Shift Status
Pending Pricing Review
Open Exceptions
Sync Health Summary
```

## Owner Emphasis

Owner melihat:

```text
Business Health
Exceptions
Margin
Cash Variance
Supplier Integrity
Inventory Variance
```

## Admin Emphasis

Admin melihat:

```text
Operational Tasks
Receiving
Purchases Ready to Post
Stock Attention
Price Proposals
Pending Returns / Refunds
```

Role boleh memengaruhi module prominence tanpa membuat dashboard terpisah secara teknis.

---

# 9. Perlu Ditinjau

**Primary Actor:** Owner  
**Secondary Actor:** Admin according to permissions

Ini adalah central exception queue.

Top-level navigation dipertahankan karena exception-based supervision merupakan core product behavior.

## Structure

```text
Perlu Ditinjau
├── Semua
├── Pembelian
├── Harga
├── Stok
├── Shift & Kas
├── Retur & Refund
└── Sinkronisasi
```

Filtering berdasarkan:

```text
Severity
Status
Domain
Date
Actor
Location future-ready
```

Severity:

```text
INFO
WARNING
REVIEW_REQUIRED
CRITICAL
```

Lifecycle:

```text
OPEN
ACKNOWLEDGED
RESOLVED
DISMISSED
```

## Item Anatomy

Setiap item harus menunjukkan:

```text
What happened
Why it matters
Severity
Financial / Quantity impact if applicable
Source record
Recommended next action
```

Action:

```text
Buka Record
Akui
Selesaikan
Abaikan with permission/reason where relevant
```

---

# 10. Produk

Produk adalah catalog workspace, bukan sekadar product table.

Primary tasks:

```text
Find Product
Create Product
Configure Units / Barcode
Inspect Commercial Context
Import Catalog
```

## Product List

Content:

```text
Product
SKU
Category
Primary Sell Unit
Current Selling Price
Stock indication
Status
```

Optional operational badges:

```text
Low Stock
No Price
No Barcode
Inactive
Needs Pricing Review
```

Search:

```text
Name
SKU
Barcode
```

Filters:

```text
Category
Brand
Active / Inactive
Track Inventory
Low Stock
Missing Price
```

Primary action:

```text
Tambah Produk
```

Secondary actions:

```text
Import
Kategori
```

---

# 11. Product Detail as Contextual Hub

Product Detail menjadi salah satu contextual hub utama.

Header:

```text
Product Name
SKU
Status
Category
Brand
Primary sell information
```

Context summary:

```text
Current Stock
MWA
Latest Landed Cost
Pricing Reference Cost
Current Retail Price
Current Margin
```

Tabs / sections:

```text
Ringkasan
Unit & Barcode
Harga
Pembelian
Stok
Riwayat
```

## Ringkasan

Purpose:

```text
Understand the Product immediately.
```

Includes:

```text
Key identifiers
Current stock
Current cost
Current selling price
Margin
Last Purchase
Last Sale
Active alerts
```

## Unit & Barcode

Tasks:

```text
Add Product Unit
Manage Conversion
Set Can Sell / Can Purchase
Manage Barcode
```

## Harga

Contextual pricing:

```text
Active Price
Tiers
Target Margin
Floor
Promotion
Price Review
Price History
```

Primary contextual actions:

```text
Buat Proposal
Kalkulator
Ubah Harga if Owner
```

## Pembelian

Shows:

```text
Suppliers
Last Purchase
Last Landed Costs
Supplier Price History
```

## Stok

Shows:

```text
Current Stock
Low Stock Threshold
Recent Movements
Last Opname
```

Actions:

```text
Penyesuaian Stok
Lihat Movement
```

## Riwayat

Cross-domain history for meaningful product events.

Not raw technical audit dump.

---

# 12. Pembelian

Pembelian is built around:

```text
Purchase
Receiving
Supplier
Supplier Return
Integrity
```

## Purchase List

Default view:

```text
Purchase Number
Supplier
Date
Status
Receiving Progress
Integrity Status
Total
Payment Status
```

Quick filters:

```text
Draft
Ordered
Partially Received
Received
Ready to Post
Posted
Needs Review
```

Primary action:

```text
Buat Pembelian
```

---

# 13. Purchase Detail as Contextual Hub

Header:

```text
Purchase Number
Supplier
Purchase Status
Integrity Status
Payment Status
```

Tabs:

```text
Ringkasan
Penerimaan
Biaya
Integritas
Riwayat
```

## Ringkasan

```text
Agreed Total
Invoice Total
Received Progress
Accepted Qty
Discount
Bonus
Charges
Current Landed Cost Status
```

## Penerimaan

Task-first receiving UI:

```text
Expected
Previously Received
Receive Now
Accepted
Rejected
Remaining
```

Primary action:

```text
Terima Barang
```

## Biaya

Shows:

```text
Invoice Costs
Discount Allocation
Acquisition Costs
Landed Cost
Provisional vs Final
```

## Integritas

Compare:

```text
Agreed
Invoice
Received
Accepted
```

Highlights:

```text
Price Variance
Bonus Missing
Unexpected Charge
Short Delivery
Duplicate Invoice Warning
```

## Riwayat

```text
Created
Ordered
Receipt Events
Invoice Updates
Posted
Corrections
Supplier Return
```

---

# 14. Supplier within Pembelian

Supplier is secondary navigation under Pembelian.

Supplier List:

```text
Supplier Name
Preferred Products count
Recent Purchase
Open Claims
Integrity indication
```

Supplier Detail:

```text
Ringkasan
Pembelian
Produk & Harga
Retur / Klaim
Kinerja
```

Kinerja uses neutral terminology:

```text
Delivery Variance
Price Variance
Claim History
Return History
```

Not "Fraud Score".

---

# 15. Retur Supplier

Dedicated operational list because it can remain unresolved across time.

Views:

```text
Open Returns
Pending Credit
Pending Replacement
Resolved
```

Item shows:

```text
Supplier
Purchase Reference
Product
Qty
Claim Value
Settlement Status
Age
```

---

# 16. Stok

Stok workspace serves:

```text
Observe
Investigate
Correct
Count
```

Secondary destinations:

```text
Posisi Stok
Pergerakan Stok
Penyesuaian
Stock Opname
```

---

# 17. Posisi Stok

Default operational inventory list:

```text
Product
Base Unit
Current Stock
Availability
Low Stock Threshold
Inventory Value
Last Movement
```

Filters:

```text
Negative
Out of Stock
Low Stock
Category
Brand
Active / Inactive
```

Search:

```text
Name
SKU
Barcode
```

Context actions:

```text
Open Product
Adjust Stock
View Movements
Start / Add to Opname
```

---

# 18. Pergerakan Stok

Purpose:

> Explain why stock changed.

Columns/context:

```text
Time
Product
Movement Type
Before
Movement
After
Source
Actor
```

Filters:

```text
Purchase Receipt
Sale
Customer Return
Supplier Return
Adjustment
Opname
Opening
```

Source record must be deep-linkable.

---

# 19. Penyesuaian Stok

Not a generic editable stock screen.

Flow:

```text
Select Product
↓
Current Stock Context
↓
Stock In / Out
↓
Qty
↓
Reason
↓
Estimated Value Impact
↓
Confirm
```

Historical adjustments have their own list/history.

---

# 20. Stock Opname

## Opname List

```text
Session
Date
Status
Scope
Progress
Variance Count
Created By
```

Primary action:

```text
Mulai Stock Opname
```

## Opname Detail

Sections:

```text
Progress
Counting
Variances
Review
History
```

Each count item shows:

```text
Product
system_qty_at_count
physical_qty
variance
counted_at
movement-during-count indicator
```

If movement occurs before confirmation:

```text
RECOUNT_RECOMMENDED
```

Primary final action:

```text
Post Opname
```

---

# 21. Harga

Harga is decision workspace, not editable product-price spreadsheet.

Secondary destinations:

```text
Ringkasan Harga
Perlu Review
Proposal Harga
Kalkulator Harga
Promosi
Riwayat Harga
```

---

# 22. Ringkasan Harga

Purpose:

```text
Understand current commercial pricing health.
```

Shows:

```text
Products Below Target Margin
Products Below Floor
Pending Proposals
Scheduled Price Changes
Active Promotions
Recent Cost Changes
```

Quick actions:

```text
Buat Proposal
Kalkulator
Lihat Perlu Review
```

---

# 23. Perlu Review — Pricing

This is domain-specific pricing review, while global `Perlu Ditinjau` is cross-domain.

List:

```text
Product
Current Price
Pricing Reference Cost
Current Margin
Target Margin
Cost Change
Reason for Review
```

Actions:

```text
No Action / Mark Reviewed
Open Calculator
Create Proposal
```

---

# 24. Proposal Harga

List:

```text
Proposal / Batch
Created By
Products
Risk
Status
Created At
```

Views:

```text
Draft
Pending Approval
Approved / Scheduled
Rejected
```

## Proposal Detail

Owner sees comparison:

```text
Current
Cost
Recommendation
Admin Proposal
Final Decision
Margin
Floor
Warnings
```

Actions by permission:

```text
Admin:
Edit Draft
Submit

Owner:
Approve
Edit & Approve
Reject
Set Effective Date
```

---

# 25. Kalkulator Harga

Two modes:

```text
Quick Calculator
Product Pricing
```

Quick Calculator:

```text
Cost
Target Margin
Minimum Margin
Tax
Rounding
→ Recommendation
```

Product Pricing:

```text
Product Unit
Pricing Reference Cost
Current Price
Margin
Tiers
History
→ Recommendation
```

Actions:

```text
Use as Proposal
Apply Price if Owner
```

No direct automatic activation.

---

# 26. Promosi

Promotion List:

```text
Promotion
Product Unit
Type
Value
Period
Priority
Status
```

Views:

```text
Active
Scheduled
Ended
Draft
```

Promotion Detail:

```text
Eligibility
Base Price Context
Resulting Price
Floor Check
Period
Priority
Performance later
```

---

# 27. Riwayat Harga

Purpose:

```text
Explain how and why a selling price changed.
```

Shows:

```text
Product
Unit
Old Price
New Price
Effective Date
Source
Changed / Approved By
Cost Context
Margin Context
```

No edit actions.

---

# 28. Penjualan — Back Office

Penjualan is the business-history workspace.

Secondary destinations:

```text
Transaksi
Retur
Refund
Customer
Shift
```

POS execution remains in POS workspace.

---

# 29. Transaksi — Back Office

List:

```text
Transaction Number
Date
Cashier
Total
Payment
Status
Return State
Sync State if relevant
```

Filters:

```text
Completed
Voided
Partially Refunded
Fully Refunded
Cashier
Payment Method
Date
```

Search:

```text
Transaction Number
Product
Customer
```

---

# 30. Transaction Detail

Header:

```text
Transaction Number
Status
Date / Time
Cashier
Shift
Terminal
```

Sections:

```text
Items
Pricing Breakdown
Payments
Returns / Refunds
Inventory Effect
Audit / Activity
```

Owner/Admin cost visibility:

```text
COGS
Gross Profit
Margin
```

Cashier-level view excludes sensitive economics.

Context actions:

```text
Print Receipt
Start Return
Void if eligible + permission
Payment Correction if eligible
```

---

# 31. Retur — Back Office

List:

```text
Return Number
Original Transaction
Date
Items
Disposition
Refund Status
Risk
Processed By
```

Views:

```text
Completed
Refund Pending
High Risk
Rejected
```

---

# 32. Refund

Dedicated list because return and monetary settlement can diverge.

Views:

```text
Pending
Failed
Requires Action
Completed
```

Item:

```text
Refund Reference
Return
Customer optional
Amount
Method
Provider Status
Age
```

Primary operational goal:

> Outstanding refunds must never disappear inside transaction history.

---

# 33. Customer

Customer remains secondary within Penjualan.

Customer List:

```text
Name
Phone
Last Transaction
Spend
Return Count
Status
```

Customer Detail:

```text
Ringkasan
Transaksi
Retur
```

No loyalty/credit IA in v2.

---

# 34. Shift — Back Office

List:

```text
Shift
Cashier
Terminal
Opened
Closed
Sales
Expected Cash
Actual Cash
Variance
Review Status
```

Shift Detail:

```text
Ringkasan
Payments
Cash Movements
Voids / Refunds
Exceptions
Activity
```

Owner/Admin can review without reopening shift.

---

# 35. Laporan

Reports should answer business questions, not mirror every table.

Primary report categories:

```text
Penjualan
Margin
Stok
Pembelian
Shift & Kas
Retur
```

## Penjualan

```text
Sales
Net Sales
Transactions
Units
Product Performance
Payment Mix
```

## Margin

```text
COGS
Gross Profit
Gross Margin
Margin by Product
Margin vs Target
```

## Stok

```text
Current Stock
Inventory Value
Negative / Low Stock
Inventory Gain / Loss
Movement Summary
```

## Pembelian

```text
Purchase Value
Supplier Spend
Cost Trend
Supplier Price Trend
Integrity Variance
```

## Shift & Kas

```text
Cash Variance
Payment Mix
Cash Movements
Void / Refund Activity
```

## Retur

```text
Return Value
Return Rate
Reasons
Restocked vs Not Restocked
Refund Status
```

---

# 36. Pengaturan

Settings must be grouped by business concept, not internal implementation.

```text
Bisnis
User & Akses
Kebijakan Harga
Kebijakan Stok
Pembayaran
POS & Terminal
Sinkronisasi & Perangkat
```

---

# 37. Bisnis

Includes:

```text
Business Identity
Default Location
Business Timezone
Currency
Tax Defaults
```

No multi-store switcher in v2.

---

# 38. User & Akses

Sections:

```text
Users
Role Assignment
Advanced Permission Overrides
Sessions / Devices if relevant
```

Built-in roles:

```text
Owner
Admin
Cashier
```

UX:

```text
Select Role
→ optional Advanced Permissions
```

Do not expose enterprise-IAM complexity unnecessarily.

---

# 39. Kebijakan Harga

Includes:

```text
Default Target Margin
Default Minimum Margin
Category Overrides
Rounding Rule
Large Price Change Threshold
Return-linked commercial settings where relevant
```

Product Unit override remains contextual in Product/Pricing rather than giant global settings table.

---

# 40. Kebijakan Stok

Includes:

```text
Negative Stock Allowed
Default Low Stock behavior
High-Value Adjustment Threshold
Opname settings
```

No lot/expiry configuration in v2 UI unless feature becomes active.

---

# 41. Pembayaran

Includes:

```text
Enabled Payment Methods
Cash
QRIS
Bank Transfer
Other

Offline Allowed capability
Manual Confirmation behavior
```

Provider integrations appear here later.

---

# 42. POS & Terminal

Includes:

```text
Terminal
Device Mapping
Receipt Settings
Default POS Behavior
Discount Limit Presets if appropriate
```

Current v2:

```text
1 Terminal → 1 Operational Cash Drawer
```

---

# 43. Sinkronisasi & Perangkat

This is operational diagnostics, not primary daily workflow.

Shows:

```text
Registered Devices
Last Sync
Pending Events
Failed Sync
Device Status
Conflict Count
```

Actions with permission:

```text
Retry
Open Conflict
Revoke Device
Diagnostics
```

---

# 44. POS — Kasir Workspace

Kasir page is a single high-frequency operational surface.

Logical regions:

```text
Product Discovery
Cart
Pricing Feedback
Payment Entry
Transaction Completion
```

No navigation to Back Office required for normal sale.

---

# 45. Product Discovery in POS

Methods:

```text
Barcode Scan
Search Name
Search SKU
```

Result item:

```text
Product
Unit
Price
Stock indication if enabled
```

No cost/margin.

Unknown barcode:

```text
Not Found
→ Search Manually
```

Cashier cannot create Product from POS.

---

# 46. Cart

Line displays:

```text
Product
Unit
Qty
Base / Effective Price
Promotion / Discount indication
Line Total
Stock warning if applicable
```

Cashier actions:

```text
Change Qty
Remove
Apply allowed discount
Hold Cart
Checkout
```

Same Product Unit merges where pricing context allows.

---

# 47. Pricing Feedback in POS

Pricing explanation must remain understandable:

```text
Harga Normal
Harga Grosir / Tier
Promo
Diskon
Harga Akhir
```

Do not expose:

```text
Target Margin
Cost
Floor Value
```

Cashier only receives:

```text
Allowed
Warning
Supervisor Required
```

---

# 48. Payment Surface

Supports:

```text
Cash
QRIS
Transfer
Other enabled methods
Split Payment
```

Cash:

```text
Amount Tendered
Change
```

Split:

```text
Remaining Amount
Payment Components
```

Final action:

```text
Bayar / Selesaikan
```

Double-submit protection required.

---

# 49. POS — Tertahan

List:

```text
Held Time
Items
Customer optional
Subtotal
Cashier
```

Actions:

```text
Resume
Cancel
```

Held carts must not appear as revenue or stock reservation.

---

# 50. POS — Transaksi

Cashier transaction history should prioritize operational recovery.

Default scope:

```text
Current Shift
Recent Own Transactions
```

according to permission.

List:

```text
Transaction Number
Time
Total
Payment
Status
```

Transaction Detail actions:

```text
Reprint Receipt
Start Return
Request / Perform Void if permission
```

---

# 51. POS — Retur

Primary flow starts from transaction lookup.

```text
Cari Transaksi
↓
Pilih Item
↓
Qty
↓
Reason
↓
Disposition
↓
Refund
↓
Complete
```

Cashier sees only permitted flows.

No-receipt path hidden unless permission exists.

---

# 52. POS — Shift

When no shift active:

```text
Open Shift
```

When active:

```text
Shift Summary
Cash In
Cash Out
Safe Drop
Close Shift
```

Current shift summary:

```text
Opened At
Opening Cash
Transaction Count
Payment Mix
Cash Movements
```

Sensitive expected-cash visibility during active shift can be determined during UX design.

---

# 53. Global Search — Back Office

A global search is useful because operational users often know the identifier, not the menu.

Searchable objects:

```text
Product Name / SKU / Barcode
Purchase Number
Supplier
Transaction Number
Customer
```

Results grouped by type.

This does not replace domain filters.

---

# 54. Global Quick Actions — Back Office

Potential global create menu:

```text
Tambah Produk
Buat Pembelian
Penyesuaian Stok
Mulai Opname
Buat Proposal Harga
```

Only show actions user has permission to execute.

Do not overload primary navigation with separate create pages.

---

# 55. Contextual Action Principle

Actions should live where the user has context.

Examples:

```text
Product Detail
→ Adjust Stock
→ Create Price Proposal

Purchase Detail
→ Receive Goods
→ Post Purchase
→ Supplier Return

Transaction Detail
→ Return
→ Reprint
→ Void if eligible

Shift Detail
→ Review Variance
```

Avoid forcing user to navigate to unrelated modules to perform a contextual action.

---

# 56. Deep-Link Relationships

Important cross-domain links:

```text
Attention Item
→ Source Business Record

Product
→ Purchase History
→ Specific Purchase

Product
→ Stock Movement
→ Source Transaction

Purchase Receipt
→ Product Stock Movement

Pricing Review
→ Product Pricing

Transaction
→ Return
→ Refund

Shift
→ Transaction

Cash Variance
→ Shift Detail

Supplier Integrity
→ Purchase Detail

Sync Conflict
→ Source Master Record
```

---

# 57. Back Navigation Principle

Back behavior must follow browsing context.

Never force:

```text
Back
→ Home
```

or:

```text
Back
→ POS root
```

unless it is genuinely the prior route.

Expected behavior:

```text
Product List
→ Product Detail
→ Price History
→ Back
→ Product Detail
→ Back
→ Product List
```

Context breadcrumbs may complement browser history on Back Office.

POS high-frequency flows can use explicit close/back actions without destroying history.

---

# 58. Breadcrumb Principle — Back Office

Use breadcrumbs for deep contextual pages:

```text
Produk
> Indomie Goreng
> Harga
```

```text
Pembelian
> PUR-00129
> Penerimaan
```

Breadcrumbs are not needed on top-level pages.

---

# 59. State Preservation

When user opens detail then returns to a list, preserve where practical:

```text
Search Query
Filters
Sort
Pagination / Scroll position
Selected Date Range
```

This is especially important for:

```text
Products
Purchases
Inventory
Transactions
Attention Queue
```

---

# 60. Record Header Pattern

All major detail records should share an IA-level header pattern:

```text
Primary Identity
Status
Key Secondary Metadata
Critical Warnings
Primary Contextual Action
Overflow Actions
```

Examples:

Purchase:

```text
PUR-00129
Supplier ABC
POSTED
Integrity: REVIEW_REQUIRED

[Supplier Return]
[•••]
```

Product:

```text
Indomie Goreng
SKU ...
ACTIVE
Stock Low

[Buat Proposal Harga]
[•••]
```

---

# 61. Collection Page Pattern

All major lists use:

```text
Page Title
Short Context / KPI if valuable
Primary Action
Search
Quick Filters
Advanced Filters
Table / List
Bulk Actions only where justified
```

Avoid dashboard widgets on every list page.

---

# 62. Form IA Pattern

Forms use progressive disclosure.

## Basic

```text
Required operational fields
```

## Advanced

```text
Optional policy / metadata
```

## Review

For high-impact operations:

```text
Before
After
Warnings
Financial / Stock Impact
Confirm
```

Examples:

```text
Price Change
Stock Adjustment
Purchase Posting
Return
Shift Close
```

---

# 63. Status Presentation Principle

Do not expose excessive technical states when simpler business language exists.

Example technical:

```text
DRAFT
IN_REVIEW
PENDING_APPROVAL
APPROVED
SCHEDULED
ACTIVE
SUPERSEDED
```

User-facing may group:

```text
Draft
Menunggu Persetujuan
Terjadwal
Aktif
Riwayat
```

Technical state remains available for correctness.

---

# 64. Exception Presentation Principle

Normal flow remains primary.

Exceptions are surfaced through:

```text
Inline Warning
Record Status
Perlu Ditinjau
Owner Attention
```

Do not interrupt every operation with modal approval.

---

# 65. Role-Based IA Differences

## Owner

Primary emphasis:

```text
Ringkasan
Perlu Ditinjau
Harga
Laporan
Pengaturan
```

Full access according to permissions.

## Admin

Primary emphasis:

```text
Produk
Pembelian
Stok
Harga Proposal
Penjualan operational history
```

No pricing approval by default.

## Cashier

Only POS-oriented IA by default.

---

# 66. Permission-Based Navigation

Navigation entry appears only if user has meaningful access.

But access control must also be enforced after route entry.

Example:

```text
Admin opens direct URL /pricing/approval/...
```

Without `pricing.approve`:

```text
DENIED
```

Hidden menu is not security.

---

# 67. Location IA

Current v2 is single-store.

Therefore:

```text
No location selector in normal navigation
No outlet switcher
No warehouse switcher
```

Default Location applied automatically.

Location metadata can appear in settings/record details for future readiness.

---

# 68. Supplier IA Principle

Supplier is not a primary navigation item because Supplier activity is primarily purchasing-context work.

Path:

```text
Pembelian
→ Supplier
```

Deep links remain available from Product/Purchase.

---

# 69. Customer IA Principle

Customer is not a primary navigation item because Customer is optional/lightweight in v2.

Path:

```text
Penjualan
→ Customer
```

---

# 70. Promotion IA Principle

Promotion belongs under:

```text
Harga
```

because it is a pricing layer, not a Product master property and not a POS configuration.

---

# 71. Stock Opname IA Principle

Stock Opname belongs under:

```text
Stok
```

not Settings or Reports.

It is an operational inventory process.

---

# 72. Shift IA Principle

Shift appears:

```text
POS → Shift
```

for Cashier operations,

and:

```text
Back Office → Penjualan → Shift
```

for supervisory history/review.

Same business records, different task contexts.

---

# 73. Audit IA Principle

Do not create a large primary `Audit` menu for normal operators.

Audit appears contextually inside:

```text
Product History
Purchase History
Transaction Activity
Shift Activity
User/Permission Changes
```

Owner-level global audit access can be placed under:

```text
Pengaturan / Security & Audit
```

if needed later.

---

# 74. Sync IA Principle

Sync is:

```text
Global status indicator
+
Settings diagnostics
+
Attention exceptions
```

not a normal daily primary module.

---

# 75. IA-to-Journey Coverage Matrix

| Journey Group | Primary IA Destination |
|---|---|
| UJ-01–03 Product setup/import | Produk |
| UJ-04–08 Purchasing/Supplier | Pembelian |
| UJ-09–13 Cost/Pricing/Promotion | Harga + Product Detail |
| UJ-14–15 Inventory/Opname | Stok |
| UJ-16–22 Cashier Sales | POS |
| UJ-23–27 Returns/Refunds | POS Retur + Back Office Penjualan |
| UJ-28–31 Shift/Cash | POS Shift + Back Office Penjualan/Shift |
| UJ-32–33 Identity/Permission | Pengaturan → User & Akses |
| UJ-34 Sync Conflict | Perlu Ditinjau + Pengaturan → Sinkronisasi |
| UJ-35 Owner Exception Review | Perlu Ditinjau |

All UJ-01 through UJ-35 have a primary IA home.

---

# 76. Recommended Route Skeleton

Internal routes are implementation guidance only; labels can remain localized.

```text
/backoffice/overview
/backoffice/attention

/backoffice/products
/backoffice/products/new
/backoffice/products/import
/backoffice/products/:productId
/backoffice/products/:productId/units
/backoffice/products/:productId/pricing
/backoffice/products/:productId/purchasing
/backoffice/products/:productId/inventory
/backoffice/products/:productId/history

/backoffice/purchases
/backoffice/purchases/new
/backoffice/purchases/:purchaseId
/backoffice/purchases/:purchaseId/receiving
/backoffice/purchases/:purchaseId/costing
/backoffice/purchases/:purchaseId/integrity
/backoffice/purchases/:purchaseId/history

/backoffice/suppliers
/backoffice/suppliers/:supplierId
/backoffice/supplier-returns

/backoffice/inventory
/backoffice/inventory/movements
/backoffice/inventory/adjustments
/backoffice/inventory/opname
/backoffice/inventory/opname/:opnameId

/backoffice/pricing
/backoffice/pricing/review
/backoffice/pricing/proposals
/backoffice/pricing/proposals/:proposalId
/backoffice/pricing/calculator
/backoffice/pricing/promotions
/backoffice/pricing/history

/backoffice/sales/transactions
/backoffice/sales/transactions/:transactionId
/backoffice/sales/returns
/backoffice/sales/refunds
/backoffice/sales/customers
/backoffice/sales/customers/:customerId
/backoffice/sales/shifts
/backoffice/sales/shifts/:shiftId

/backoffice/reports
/backoffice/reports/sales
/backoffice/reports/margin
/backoffice/reports/inventory
/backoffice/reports/purchasing
/backoffice/reports/shift-cash
/backoffice/reports/returns

/backoffice/settings/business
/backoffice/settings/users
/backoffice/settings/pricing
/backoffice/settings/inventory
/backoffice/settings/payments
/backoffice/settings/terminals
/backoffice/settings/sync

/pos/sell
/pos/held
/pos/transactions
/pos/transactions/:transactionId
/pos/returns
/pos/returns/new
/pos/shift
/pos/shift/open
/pos/shift/close
```

---

# 77. Routes Do Not Define Domain Ownership

Route:

```text
/backoffice/sales/transactions/:id
```

does not mean Back Office owns transactions.

Likewise:

```text
/pos/transactions/:id
```

is merely another presentation/context for the same transaction domain.

---

# 78. Navigation Density Rules

Primary Back Office nav should remain approximately:

```text
8–9 items
```

Primary POS nav:

```text
5 items
```

Avoid adding primary items for every new feature.

New features should first be evaluated as:

```text
Contextual Action?
Secondary Page?
Tab?
Filter?
Attention Type?
Setting?
```

before becoming new navigation.

---

# 79. IA Non-Goals

This stage does not decide:

```text
Colors
Typography
Card styles
Exact spacing
Desktop grid
Mobile bottom navigation visual
Button visual hierarchy
Modal vs drawer final interaction
Component library
Animation
```

Those belong to Design System / Screen Specifications.

---

# 80. IA Validation Criteria

Information Architecture v1 is valid when:

```text
[✓] Every P0 user journey has a clear entry point
[✓] Owner exception supervision has a dedicated home
[✓] Cashier can operate entirely inside POS
[✓] Admin can perform purchasing without Owner navigation
[✓] Product Detail acts as cross-domain context hub
[✓] Purchase Detail acts as purchasing context hub
[✓] Returns and Refunds remain independently visible
[✓] Stock Opname remains an operational workflow
[✓] Sync diagnostics do not dominate normal UX
[✓] Roles do not create duplicate data structures
[✓] Deep links preserve cross-domain traceability
[✓] Browser/back navigation can remain predictable
[✓] IA does not mirror database entities blindly
```

---

# 81. Final IA Structure

```text
KASTUR
│
├── BACK OFFICE
│   ├── Ringkasan
│   ├── Perlu Ditinjau
│   ├── Produk
│   ├── Pembelian
│   ├── Stok
│   ├── Harga
│   ├── Penjualan
│   ├── Laporan
│   └── Pengaturan
│
└── POS
    ├── Kasir
    ├── Tertahan
    ├── Transaksi
    ├── Retur
    └── Shift
```

---

# 82. Recommended Next Phase

After IA approval:

```text
Business Foundation v1
        ↓
User Journeys v1
        ↓
Information Architecture v1
        ↓
SYSTEM ARCHITECTURE
        ↓
Database / Domain Schema
        ↓
API + Sync Contract
        ↓
Design System
        ↓
Screen Specifications
        ↓
Legacy Code KEEP / ADAPT / REPLACE / REMOVE
        ↓
Implementation Roadmap
```

---

# Final Information Architecture Principle

> **Kastur harus terasa seperti satu sistem operasional retail yang memiliki dua workspace, bukan dua aplikasi yang saling ditempelkan. Back Office diorganisasikan berdasarkan keputusan dan pekerjaan bisnis; POS diorganisasikan berdasarkan kecepatan transaksi. Detail page menjadi contextual hub, exception dikumpulkan melalui “Perlu Ditinjau”, dan navigasi tidak boleh memaksa user memahami struktur database atau batas teknis antar-domain.**
