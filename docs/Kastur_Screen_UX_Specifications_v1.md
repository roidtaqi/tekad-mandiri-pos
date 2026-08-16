# Kastur Retail System — Screen / UX Specifications v1

**Status:** Approved Baseline / Ready for Legacy Audit & Implementation Planning  
**Depends on:** Business Foundation v1, User Journeys v1, Information Architecture v1, System Architecture v1, Database Schema v1, API & Sync Contract v1, Design System v1  
**Scope:** Kastur Back Office + Kastur POS  
**Purpose:** Menetapkan spesifikasi operasional setiap layar utama sebelum legacy code audit, implementation roadmap, dan Codex handoff.

---

# 1. Locked Interaction Baseline

The following interaction rules are now authoritative for v1.

## 1.1 Barcode Scan

```text
Exact barcode match
→ add Product Unit immediately

Repeated scan of same Product Unit
→ quantity +1

No confirmation modal after successful scan

Unknown barcode
→ lightweight notification
→ manual search remains available
→ scanner focus remains operational
```

---

## 1.2 POS Product Discovery

Primary:

```text
Barcode scanner
Search
Compact product list/grid
```

No dependency on product image.

Priority information:

```text
Product Name
Unit
Price
Stock Warning
```

Image:

```text
optional / future
```

---

## 1.3 POS Desktop Proportion

Conceptual:

```text
Product/Search Area ≈ 55–60%
Cart Area ≈ 40–45%
```

Cart remains persistently visible during normal selling.

Payment may replace product/search pane while Cart/Total remains visible.

---

## 1.4 Shift Closing

Use blind count:

```text
Cashier enters Actual Cash first
↓
Submit count
↓
System reveals Expected Cash
↓
Variance shown
↓
Reason required if policy threshold triggers
↓
Confirm Close
```

---

## 1.5 Payment Order

Default:

```text
Cash
QRIS
Transfer
Lainnya
```

Ordering may become configurable later.

---

## 1.6 Customer at Checkout

Customer remains optional.

UX:

```text
+ Tambah Customer
```

It is a secondary action, not a mandatory checkout field.

---

## 1.7 Receipt

Primary layout:

```text
Thermal 80 mm
```

Compatible target:

```text
58 mm
```

Printing never determines Transaction completion success.

---

## 1.8 POS Session Lock

POS supports:

```text
Quick Lock
```

Device remains signed in.

User must re-authenticate with own credential/PIN to continue.

Future:

```text
configurable auto-lock timeout
```

---

# 2. Screen Specification Format

Each screen includes:

```text
Purpose
Primary Actor
Entry Point
Layout
Primary Information
Actions
Permissions
Keyboard / Scanner Behavior
Responsive Behavior
Offline Behavior
States
Acceptance Criteria
```

---

# 3. Global Shell — Back Office

## Screen ID

```text
BO-SHELL-001
```

## Purpose

Provide consistent Back Office navigation and global operational context.

## Primary Actors

```text
Owner
Admin
```

## Desktop Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Sidebar │ Top Utility Bar                                   │
│         ├────────────────────────────────────────────────────┤
│         │ Main Content                                      │
│         │                                                    │
└─────────┴────────────────────────────────────────────────────┘
```

## Sidebar

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

## Utility Bar

Shows:

```text
Global Search
Sync Status
Current User
Optional Quick Create
```

## Actions

```text
Global Search
Quick Create
Open User Menu
Quick Lock / Logout where appropriate
Open Sync Diagnostics if permitted
```

## Responsive

Tablet:

```text
collapsible sidebar
```

Mobile:

```text
navigation drawer
single-column content
```

## Acceptance Criteria

- Current section obvious.
- Browser Back remains predictable.
- Deep links retain active navigation context.
- No forced redirect to Home on Back.
- Sidebar content respects permissions.

---

# 4. Global Shell — POS

## Screen ID

```text
POS-SHELL-001
```

## Purpose

Provide minimum persistent operational context without distracting cashier.

## Top Utility Area

Shows:

```text
Cashier
Shift
Terminal
Online / Offline
Pending Sync
Quick Lock
```

## Primary Navigation

```text
Kasir
Tertahan
Transaksi
Retur
Shift
```

## Keyboard

Quick Lock must be keyboard reachable.

Scanner input must not accidentally trigger navigation.

## Acceptance Criteria

- Cashier always knows whether Shift is active.
- Offline does not look like fatal app failure.
- Pending sync visible but unobtrusive.
- Lock action quickly accessible.

---

# 5. Back Office — Ringkasan

## Screen ID

```text
BO-OVERVIEW-001
```

## Purpose

Answer:

```text
What is happening?
What changed?
What needs attention?
```

## Actors

```text
Owner
Admin
```

## Layout

Sections:

```text
Business Health
Attention
Operational Tasks
Recent Activity
```

## Owner Emphasis

```text
Sales
Gross Margin
Inventory Value
Cash Variance
Purchase Integrity
Pricing Review
Critical Exceptions
```

## Admin Emphasis

```text
Purchases to Receive
Purchases Ready to Post
Low/Negative Stock
Draft Price Proposals
Pending Refunds
```

## Primary Actions

Role-dependent:

```text
Buka Perlu Ditinjau
Buat Pembelian
Tambah Produk
Mulai Opname
Buat Proposal Harga
```

## Offline

Cached summary may display with:

```text
Terakhir diperbarui ...
```

if stale enough to matter.

## Acceptance Criteria

- No more than a small set of decision-useful KPIs.
- Attention items visible above decorative reporting.
- Dashboard does not duplicate full Reports module.

---

# 6. Back Office — Perlu Ditinjau

## Screen ID

```text
BO-ATTENTION-001
```

## Purpose

Central cross-domain exception queue.

## Actor

```text
Owner primary
Admin secondary by permission
```

## Filters

```text
Semua
Pembelian
Harga
Stok
Shift & Kas
Retur & Refund
Sinkronisasi
```

Additional:

```text
Severity
Status
Date
Actor
```

## Row Anatomy

```text
Severity
What happened
Impact
Source
Age
Status
Recommended next action
```

## Actions

```text
Buka Record
Akui
Selesaikan
Abaikan
```

## Acceptance Criteria

- User can triage without opening every record.
- Source business record always reachable.
- Severity and lifecycle shown separately.
- No automatic fraud labeling.

---

# 7. Back Office — Product List

## Screen ID

```text
BO-PRODUCT-001
```

## Purpose

Find, filter, and manage catalog.

## Columns

```text
Produk
SKU
Kategori
Unit Jual Utama
Harga Aktif
Stok
Status
Attention Badge
```

## Search

```text
Nama
SKU
Barcode
```

## Filters

```text
Kategori
Brand
Aktif / Nonaktif
Track Inventory
Low Stock
Missing Price
```

## Primary Action

```text
Tambah Produk
```

## Secondary

```text
Import
Kelola Kategori
```

## Responsive

Mobile uses structured list with:

```text
Name
SKU
Price
Stock
Status
```

## Acceptance Criteria

- Search by barcode exact result.
- Return from Product Detail preserves filters/search.
- No hidden essential information in mobile layout.

---

# 8. Back Office — Add Product

## Screen ID

```text
BO-PRODUCT-002
```

## Purpose

Create Product with minimum required data.

## Fields

Required:

```text
Nama Produk
Kategori
Base Unit
Track Inventory
SKU
```

Optional:

```text
Brand
```

## Validation

```text
SKU unique
Name required
Base Unit valid
Possible duplicate warning
```

## Save Result

After Save:

```text
Product Detail
```

with guided next actions:

```text
Tambah Unit
Tambah Barcode
Tambah Harga
Tambah Opening Stock
```

## Acceptance Criteria

- Creation does not require full pricing/supplier setup.
- Duplicate SKU hard-blocked.
- Possible duplicate product only warns.

---

# 9. Back Office — Product Detail

## Screen ID

```text
BO-PRODUCT-003
```

## Header

```text
Product Name
SKU
Status
Category
Brand
Warnings
Primary Contextual Action
```

## Summary

```text
Current Stock
MWA
Latest Landed Cost
Pricing Reference Cost
Current Retail Price
Current Margin
Last Purchase
Last Sale
```

## Tabs

```text
Ringkasan
Unit & Barcode
Harga
Pembelian
Stok
Riwayat
```

## Actions

```text
Buat Proposal Harga
Ubah Harga if Owner
Penyesuaian Stok
Nonaktifkan Produk
```

## Permission Redaction

Cashier not normally exposed to Back Office.

Cost/margin sensitive actions permission-gated.

## Acceptance Criteria

- Acts as cross-domain contextual hub.
- Product history remains intelligible after master changes.
- No generic edit for immutable historical records.

---

# 10. Product Unit & Barcode

## Screen ID

```text
BO-PRODUCT-004
```

## Table

```text
Unit
Conversion
Can Sell
Can Purchase
Decimal Qty
Barcode(s)
Status
```

## Actions

```text
Tambah Unit
Tambah Barcode
Edit Unit
Nonaktifkan
```

## Critical Rule

After stock history:

```text
Base Unit change unavailable
```

## Acceptance Criteria

- Barcode duplicate hard-blocked.
- Conversion clearly shown as base-unit relationship.
- User never needs to create duplicate Product for Carton/Pack.

---

# 11. Product Pricing Context

## Screen ID

```text
BO-PRODUCT-005
```

## Shows

```text
Current Price
Retail Tier
Wholesale Tiers
Pricing Reference Cost
Target Margin
Floor
Current Margin
Scheduled Change
Active Promotion
Price History
```

## Actions

Admin:

```text
Buat Proposal
Kalkulator
```

Owner:

```text
Buat Proposal
Ubah Harga
```

## Acceptance Criteria

- Current, recommendation, and policy values clearly separated.
- Cost change never looks like automatic selling-price update.

---

# 12. Back Office — Purchase List

## Screen ID

```text
BO-PURCHASE-001
```

## Columns

```text
Nomor
Supplier
Tanggal
Status
Penerimaan
Integrity
Total
Payment Status
```

## Filters

```text
Draft
Ordered
Partially Received
Received
Ready to Post
Posted
Needs Review
```

## Action

```text
Buat Pembelian
```

## Acceptance Criteria

- Purchase operational state and Integrity state are visually separate.
- Receiving progress visible without opening detail.

---

# 13. Create Purchase

## Screen ID

```text
BO-PURCHASE-002
```

## Layout

Header:

```text
Supplier
Purchase Date
Notes
```

Item table:

```text
Product
Purchase Unit
Expected Qty
Agreed Unit Price
Discount
Free Qty
Subtotal
```

Footer:

```text
Agreed Total
Save Draft
Mark Ordered
```

## Keyboard

Tab order optimized for repetitive line entry.

Search/add product supports barcode/SKU/name.

## Offline

Draft can be created offline.

## Acceptance Criteria

- One Purchase represents one supplier transaction/nota.
- Bonus/free goods first-class field.
- Agreed snapshot clear when Mark Ordered.

---

# 14. Purchase Detail

## Screen ID

```text
BO-PURCHASE-003
```

## Header

```text
Purchase Number
Supplier
Purchase Status
Integrity Status
Payment Status
```

## Tabs

```text
Ringkasan
Penerimaan
Biaya
Integritas
Riwayat
```

## Actions

Contextual:

```text
Terima Barang
Ready to Post
Post Pembelian
Retur Supplier
Koreksi
```

## Acceptance Criteria

- No generic edit after POSTED.
- Agreed / Invoice / Received / Accepted distinguishable.

---

# 15. Receive Goods

## Screen ID

```text
BO-PURCHASE-004
```

## Row Layout

```text
Product
Expected
Previously Received
Receive Now
Accepted
Rejected
Free Qty
Remaining
```

## Actions

```text
Simpan Penerimaan
```

## Offline

Fully offline-capable.

## Exception Presentation

Inline:

```text
Short Delivery
Over Delivery
Bonus Missing
Wrong Qty
Damaged Goods
```

## Acceptance Criteria

- Accepted quantity clearly drives stock effect.
- Partial receipt supported.
- Stock updates immediately after local commit.
- No need to wait for final Purchase POSTED.

---

# 16. Purchase Cost / Invoice

## Screen ID

```text
BO-PURCHASE-005
```

## Shows

```text
Invoice Qty
Invoice Unit Price
Item Discount
Global Discount
Tax
Freight / Acquisition Charges
Allocation
Final Landed Cost
```

## Actions

```text
Simpan Invoice
Tambah Charge
Review Allocation
```

## Acceptance Criteria

- Commercial cost and physical receipt remain separate facts.
- Landed-cost context visible before Post.

---

# 17. Purchase Integrity

## Screen ID

```text
BO-PURCHASE-006
```

## Comparison Table

```text
Item
Agreed
Invoice
Received
Accepted
Variance
```

## Issues

```text
Price Variance
Short Delivery
Bonus Missing
Unexpected Charge
Duplicate Invoice Suspected
```

## Actions

```text
Accept Variance
Mark Disputed
Create Supplier Return
Resolve
```

## Acceptance Criteria

- Neutral terminology.
- No automatic fraud accusation.
- Financial impact visible when computable.

---

# 18. Supplier List

## Screen ID

```text
BO-SUPPLIER-001
```

## Columns

```text
Supplier
Recent Purchase
Open Claims
Preferred Products
Integrity Indicator
```

## Actions

```text
Tambah Supplier
```

## Acceptance Criteria

- Supplier lives under Purchasing context.
- Performance language remains neutral.

---

# 19. Supplier Detail

## Screen ID

```text
BO-SUPPLIER-002
```

## Tabs

```text
Ringkasan
Pembelian
Produk & Harga
Retur / Klaim
Kinerja
```

## Acceptance Criteria

- Historical price and variance traceable.
- No "Fraud Score".

---

# 20. Supplier Return List

## Screen ID

```text
BO-SUPPLIER-003
```

## Views

```text
Open
Pending Credit
Pending Replacement
Resolved
```

## Columns

```text
Supplier
Purchase
Product
Qty
Claim Value
Settlement
Age
```

---

# 21. Inventory Position

## Screen ID

```text
BO-STOCK-001
```

## Columns

```text
Product
Base Unit
Current Stock
Availability
Low Stock Threshold
MWA
Inventory Value
Last Movement
```

## Filters

```text
Negative
Out of Stock
Low Stock
Category
Brand
```

## Actions

```text
Adjust Stock
View Movement
Add to Opname
```

## Acceptance Criteria

- Negative value shown, not clamped to zero.
- Stock balance clearly labeled as current projection.

---

# 22. Stock Movements

## Screen ID

```text
BO-STOCK-002
```

## Columns

```text
Time
Product
Movement Type
Before
Delta
After
Source
Actor
```

## Actions

```text
Open Source Record
```

## Acceptance Criteria

- Every movement traceable to source.
- No inline edit/delete.

---

# 23. Stock Adjustment

## Screen ID

```text
BO-STOCK-003
```

## Shows

```text
Product
Current Stock
Direction
Qty
Reason
Resulting Stock
Estimated Value Impact
```

## Actions

```text
Konfirmasi Penyesuaian
```

## High-Risk

Threshold may trigger:

```text
Review Required
Reason mandatory
```

---

# 24. Stock Opname List

## Screen ID

```text
BO-OPNAME-001
```

## Columns

```text
Session
Date
Status
Scope
Progress
Variance Count
Created By
```

## Action

```text
Mulai Stock Opname
```

---

# 25. Stock Opname Detail

## Screen ID

```text
BO-OPNAME-002
```

## Counting Table

```text
Product
System Qty at Count
Physical Qty
Variance
Counted At
Movement During Count
Recount
```

## Keyboard

Fast numeric count entry.

Enter:

```text
confirm line / move next
```

## Concurrent Movement

If detected:

```text
RECOUNT_RECOMMENDED
```

## Final Action

```text
Post Opname
```

## Acceptance Criteria

- POS can continue selling.
- Receiving can continue.
- Variance based on count snapshot, not later current balance.

---

# 26. Pricing Overview

## Screen ID

```text
BO-PRICE-001
```

## Shows

```text
Below Target Margin
Below Floor
Pending Proposal
Scheduled Changes
Active Promotions
Recent Cost Changes
```

## Actions

```text
Buat Proposal
Kalkulator Harga
Lihat Perlu Review
```

---

# 27. Pricing Review

## Screen ID

```text
BO-PRICE-002
```

## Columns

```text
Product Unit
Current Price
Pricing Reference Cost
Current Margin
Target Margin
Cost Change
Reason
```

## Actions

```text
Reviewed / No Action
Open Calculator
Create Proposal
```

---

# 28. Price Proposal List

## Screen ID

```text
BO-PRICE-003
```

## Views

```text
Draft
Pending Approval
Approved / Scheduled
Rejected
```

## Columns

```text
Proposal
Created By
Items
Risk
Status
Created At
```

---

# 29. Price Proposal Detail

## Screen ID

```text
BO-PRICE-004
```

## Comparison

```text
Current Price
Cost
Recommendation
Admin Proposal
Final Decision
Target Margin
Floor
Resulting Margin
Warnings
```

## Admin Actions

```text
Edit Draft
Submit
```

## Owner Actions

```text
Approve
Edit & Approve
Reject
Set Effective Date
```

## Offline

Draft works offline.

Publish/Approve:

```text
online required
```

---

# 30. Pricing Calculator

## Screen ID

```text
BO-PRICE-005
```

## Modes

```text
Quick
Product
```

## Inputs

```text
Cost
Target Margin
Minimum Margin
Tax
Rounding
Current Price optional
```

## Results

```text
Recommended Price
Floor
Actual Margin
Profit
Difference vs Current
Warnings
```

## Actions

```text
Use as Proposal
Apply Price if Owner
```

---

# 31. Promotion List

## Screen ID

```text
BO-PROMO-001
```

## Views

```text
Active
Scheduled
Draft
Ended
```

## Columns

```text
Promotion
Product Unit
Type
Value
Period
Priority
Status
```

---

# 32. Promotion Detail/Edit

## Screen ID

```text
BO-PROMO-002
```

## Fields

```text
Product Unit
Type
Value
Min Qty
Start
End
Priority
```

## Preview

```text
Base Price
Promotion Result
Floor Check
```

## Acceptance Criteria

- One promotion maximum applied per line.
- Deterministic priority explained only where needed.

---

# 33. Price History

## Screen ID

```text
BO-PRICE-006
```

## Columns

```text
Product Unit
Old Price
New Price
Effective Date
Source
Approved By
Cost Context
Margin Context
```

Read-only.

---

# 34. Back Office Transaction List

## Screen ID

```text
BO-SALES-001
```

## Columns

```text
Transaction Number
Date
Cashier
Total
Payment
Status
Return State
```

## Filters

```text
Completed
Voided
Partially Refunded
Fully Refunded
Cashier
Payment Method
Date
```

---

# 35. Transaction Detail — Back Office

## Screen ID

```text
BO-SALES-002
```

## Sections

```text
Items
Pricing Breakdown
Payments
Returns / Refunds
Inventory Effect
Activity
```

## Owner/Admin Sensitive Context

```text
COGS
Gross Profit
Margin
```

## Actions

```text
Print/Reprint
Start Return
Void if eligible
Payment Correction if eligible
```

---

# 36. Return List — Back Office

## Screen ID

```text
BO-RETURN-001
```

## Views

```text
Completed
Refund Pending
High Risk
Rejected
```

## Columns

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

---

# 37. Refund Queue

## Screen ID

```text
BO-REFUND-001
```

## Views

```text
Pending
Failed
Requires Action
Completed
```

## Columns

```text
Refund
Return
Amount
Method
Provider Status
Age
```

## Actions

```text
Retry
Resolve
Open Return
```

---

# 38. Customer List

## Screen ID

```text
BO-CUSTOMER-001
```

## Columns

```text
Name
Phone
Last Transaction
Spend
Return Count
Status
```

---

# 39. Customer Detail

## Screen ID

```text
BO-CUSTOMER-002
```

## Tabs

```text
Ringkasan
Transaksi
Retur
```

No loyalty/credit sections.

---

# 40. Shift List — Back Office

## Screen ID

```text
BO-SHIFT-001
```

## Columns

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

---

# 41. Shift Detail — Back Office

## Screen ID

```text
BO-SHIFT-002
```

## Tabs

```text
Ringkasan
Payments
Cash Movements
Voids / Refunds
Exceptions
Activity
```

## Actions

```text
Review Variance
Force Close if eligible
```

No normal reopen action.

---

# 42. Reports Landing

## Screen ID

```text
BO-REPORT-001
```

## Sections

```text
Penjualan
Margin
Stok
Pembelian
Shift & Kas
Retur
```

Each report has:

```text
Date Range
Filters
Completeness Indicator
Metrics
Breakdown/Table
Optional chart
Export future-ready
```

---

# 43. Sales Report

## Screen ID

```text
BO-REPORT-002
```

Shows:

```text
Gross Sales
Net Sales
Transactions
Units
Product Performance
Payment Mix
```

---

# 44. Margin Report

## Screen ID

```text
BO-REPORT-003
```

Shows:

```text
COGS
Gross Profit
Gross Margin
Margin by Product
Margin vs Target
Cost Pending/Reconciled indicators
```

---

# 45. Inventory Report

## Screen ID

```text
BO-REPORT-004
```

Shows:

```text
Inventory Value
Negative Stock
Low Stock
Inventory Gain/Loss
Movement Summary
```

---

# 46. Purchasing Report

## Screen ID

```text
BO-REPORT-005
```

Shows:

```text
Purchase Value
Supplier Spend
Cost Trend
Price Trend
Integrity Variance
```

---

# 47. Shift & Cash Report

## Screen ID

```text
BO-REPORT-006
```

Shows:

```text
Cash Variance
Payment Mix
Cash Movements
Void Activity
Refund Activity
```

---

# 48. Return Report

## Screen ID

```text
BO-REPORT-007
```

Shows:

```text
Return Value
Return Rate
Reasons
Restocked vs Not Restocked
Refund Status
Return Loss
```

---

# 49. Settings — Business

## Screen ID

```text
BO-SETTINGS-001
```

## Fields

```text
Business Name
Currency
Timezone
Default Location
Tax Defaults
```

No normal multi-location switcher.

---

# 50. Settings — User & Access

## Screen ID

```text
BO-SETTINGS-002
```

## List

```text
User
Role
Status
Last Activity
```

## Actions

```text
Add User
Assign Role
Advanced Permissions
Deactivate
```

## Rules

- At least one active Owner.
- Shared account discouraged/prohibited.
- No user deletion with history.

---

# 51. Settings — Pricing Policy

## Screen ID

```text
BO-SETTINGS-003
```

## Fields

```text
Default Target Margin
Default Minimum Margin
Rounding Rule
Large Price Change Threshold
```

Category/Product Unit override is contextual elsewhere.

---

# 52. Settings — Inventory Policy

## Screen ID

```text
BO-SETTINGS-004
```

## Fields

```text
Negative Stock Allowed
Low Stock Defaults
High-Value Adjustment Threshold
Opname Settings
```

---

# 53. Settings — Payments

## Screen ID

```text
BO-SETTINGS-005
```

## Methods

```text
Cash
QRIS
Transfer
Other
```

Per method:

```text
Enabled
Offline Allowed
Requires Reference
```

---

# 54. Settings — POS & Terminal

## Screen ID

```text
BO-SETTINGS-006
```

## Fields

```text
Terminal Name
Device Assignment
Receipt Width default
Discount Limits
Quick Lock / Auto-lock future
```

---

# 55. Settings — Sync & Devices

## Screen ID

```text
BO-SETTINGS-007
```

## Shows

```text
Device
Last Sync
Pending Count
Client Version
Schema Version
Status
```

## Actions

```text
Retry
Open Conflict
Revoke Device
```

No secrets visible.

---

# 56. POS — Kasir Main

## Screen ID

```text
POS-SELL-001
```

## Purpose

Fast scan/search-to-cart operation.

## Desktop Layout

```text
┌───────────────────────────────┬──────────────────────┐
│ Scan/Search                   │ Cart                 │
│ Product Results              │                      │
│                               │                      │
│                               │                      │
│                               │                      │
├───────────────────────────────┤                      │
│ Search/shortcut context       │ Total / Checkout     │
└───────────────────────────────┴──────────────────────┘
```

Approximate ratio:

```text
60% Product/Search
40% Cart
```

## Product Result

Shows:

```text
Name
Unit
Price
Stock warning
```

No image dependency.

## Primary Inputs

```text
Barcode Scanner
Search Name
Search SKU
```

## Scanner Behavior

Exact match:

```text
add 1 immediately
```

Repeat:

```text
+1
```

Unknown:

```text
inline/light toast
manual search
focus restored
```

## Acceptance Criteria

- Scan does not require mouse.
- Scan does not open modal.
- Search/scan works offline from local cache.
- Cart update visible immediately.

---

# 57. POS Product Search

## Screen ID

```text
POS-SELL-002
```

## Search Result Style

Desktop:

```text
compact grid/list
```

Priority:

```text
Name
Unit
Price
Stock warning
```

## Keyboard

Arrow navigation optional.

Enter:

```text
add focused result
```

## Mobile

Full-width list.

---

# 58. POS Cart

## Screen ID

```text
POS-CART-001
```

## Line Anatomy

```text
Product
Unit
Qty
Effective Price
Pricing Label
Line Total
Stock Warning
```

## Actions

```text
Qty -
Qty +
Direct Qty
Remove
Allowed Discount
```

## Same Unit

Same Product Unit may merge.

Mixed units remain separate.

## Acceptance Criteria

- No cost/margin shown.
- Effective pricing reason understandable.
- Wholesale tier recalculates automatically.

---

# 59. POS Cart Footer

## Screen ID

```text
POS-CART-002
```

## Shows

```text
Subtotal
Promo
Discount
Tax if applicable
TOTAL
```

Actions:

```text
+ Tambah Customer
Tahan
Bayar
```

Customer is secondary.

`Bayar` is dominant.

---

# 60. POS Held Cart

## Screen ID

```text
POS-HELD-001
```

## List

```text
Held Time
Items
Customer optional
Subtotal
Cashier
```

## Actions

```text
Resume
Cancel
```

Held cart:

```text
not revenue
not stock reservation
```

---

# 61. POS Payment

## Screen ID

```text
POS-PAY-001
```

## Desktop Layout

Product/Search pane replaced with Payment pane.

Cart remains visible.

## Method Order

```text
Cash
QRIS
Transfer
Lainnya
```

## Shows

```text
Amount Due
Selected Payments
Remaining
```

---

# 62. POS Cash Payment

## Screen ID

```text
POS-PAY-002
```

## Inputs

```text
Cash Received
```

## Shows

```text
Due
Tendered
Change
```

## Quick Buttons

Optional:

```text
Uang Pas
Common denominations
```

## Keyboard

Numeric entry should be focus-first.

Enter may continue/complete after validation.

---

# 63. POS QRIS Payment

## Screen ID

```text
POS-PAY-003
```

## Manual Mode v1

Shows:

```text
Amount
Confirmation
Reference optional/required by config
```

Status:

```text
MANUAL_CONFIRMED
```

Provider verification future-ready.

---

# 64. POS Transfer Payment

## Screen ID

```text
POS-PAY-004
```

Shows:

```text
Amount
Reference
Confirm
```

Offline availability depends payment method policy.

---

# 65. POS Split Payment

## Screen ID

```text
POS-PAY-005
```

## Structure

```text
Total
Paid
Remaining
```

Payment rows:

```text
Cash
QRIS
Transfer
Other
```

## Actions

```text
Tambah Metode Pembayaran
Remove unpaid component
Complete
```

## Acceptance Criteria

- Completion disabled until settlement exact.
- Cash drawer receives only Cash component.

---

# 66. POS Transaction Complete Result

## Screen ID

```text
POS-COMPLETE-001
```

## Shows

```text
Transaksi Selesai
Transaction Number
Total
Change
Payment Summary
Sync Status
```

## Actions

```text
Cetak Struk
Transaksi Baru
```

Primary next action:

```text
Transaksi Baru
```

Printing failure:

```text
does not rollback transaction
```

---

# 67. Receipt Layout

## Screen ID

```text
POS-RECEIPT-001
```

## Primary

```text
80 mm
```

## Compatible

```text
58 mm
```

## Content

```text
Business
Location
Transaction Number
Date/Time
Cashier
Items
Qty × Price
Discount/Promo
Total
Payment
Change
Customer optional
Return policy optional
```

No cost/margin.

---

# 68. POS Recent Transactions

## Screen ID

```text
POS-TRX-001
```

## Default Scope

```text
Current Shift
Recent Own Transactions
```

by permission.

## Columns/List

```text
Time
Transaction Number
Total
Payment
Status
```

## Actions

```text
Open
Reprint
Start Return
Void if eligible
```

---

# 69. POS Transaction Detail

## Screen ID

```text
POS-TRX-002
```

## Shows

```text
Items
Total
Payments
Status
Return state
Receipt
```

No COGS/margin.

---

# 70. POS Return Search

## Screen ID

```text
POS-RETURN-001
```

## Search

```text
Transaction Number
Date
Product
Customer
Payment Reference
```

Barcode-assisted item lookup optional.

---

# 71. POS Return Builder

## Screen ID

```text
POS-RETURN-002
```

## Steps

```text
Select Item
Qty
Reason
Disposition
Refund
Review
```

## Disposition Labels

```text
Kembali ke Stok
Tidak Kembali ke Stok
```

## Acceptance Criteria

- Remaining returnable qty visible.
- Physical return and refund separated in UI meaning.

---

# 72. POS Return Refund

## Screen ID

```text
POS-RETURN-003
```

## Default

```text
Historical attributable amount
Original payment method
```

Override:

```text
permission + reason
```

---

# 73. POS Return Complete Result

## Screen ID

```text
POS-RETURN-004
```

Cases:

```text
Return Completed + Refund Completed
Return Completed + Refund Pending
```

Pending message:

```text
Barang sudah diterima
Pengembalian dana sedang diproses
```

---

# 74. POS No-Receipt Return

## Screen ID

```text
POS-RETURN-005
```

Hidden unless permitted.

Default:

```text
Exchange Only
Current Active Price basis
```

Owner monetary override explicit.

---

# 75. POS Shift — No Active Shift

## Screen ID

```text
POS-SHIFT-001
```

## Shows

```text
Belum ada shift aktif
```

## Action

```text
Buka Shift
```

---

# 76. POS Open Shift

## Screen ID

```text
POS-SHIFT-002
```

## Input

```text
Opening Cash
```

## Shows

```text
Cashier
Terminal
Date/Time
```

## Action

```text
Buka Shift
```

Offline-safe.

---

# 77. POS Active Shift

## Screen ID

```text
POS-SHIFT-003
```

## Shows

```text
Opened At
Transaction Count
Payment Mix
Cash Movements
Sync Status
```

## Actions

```text
Kas Masuk
Kas Keluar
Safe Drop
Tutup Shift
```

Expected Cash visibility during active shift may remain hidden to preserve blind-count philosophy.

---

# 78. POS Cash In / Out

## Screen ID

```text
POS-SHIFT-004
```

## Fields

```text
Type
Amount
Reason
Notes
```

## Acceptance Criteria

- No effect on Sales Revenue.
- Permission/threshold enforced.

---

# 79. POS Close Shift — Blind Count

## Screen ID

```text
POS-SHIFT-005
```

## Phase 1

Cashier sees:

```text
Count Physical Cash
Actual Cash Input
```

Expected Cash:

```text
NOT SHOWN
```

## Phase 2

After submission:

```text
Expected Cash
Actual Cash
Variance
Variance Type
```

If required:

```text
Reason
```

## Final Action

```text
Tutup Shift
```

## Acceptance Criteria

- Cashier cannot anchor count to system Expected Cash.
- Closing snapshot immutable after completion.
- Offline close supported.
- Later synced events create reconciliation, not rewrite.

---

# 80. POS Quick Lock

## Screen ID

```text
POS-LOCK-001
```

## Trigger

```text
Quick Lock button
future auto-lock timeout
```

## Locked State

Shows:

```text
Current signed-in user
Terminal
Shift active indicator
Unlock credential input
```

## Acceptance Criteria

- No sale interaction available while locked.
- Device session remains intact.
- Unlock attributable to same/authorized user.
- No shared generic PIN.

---

# 81. POS Offline State

## Screen ID

```text
POS-SYNC-001
```

Global indicator:

```text
Offline
```

Optional detail:

```text
3 transaksi belum tersinkron
```

## Behavior

Normal offline-safe workflows remain enabled.

Online-required actions display:

```text
Simpan sebagai Draft
```

or explicit disabled explanation.

---

# 82. POS Sync Recovery

## Screen ID

```text
POS-SYNC-002
```

Shows when intervention required:

```text
Pending
Retrying
Requires Review
```

Actions:

```text
Retry
Open Details
```

Cashier should not see low-level protocol logs.

---

# 83. Back Office Conflict Resolution

## Screen ID

```text
BO-SYNC-001
```

## Compare

```text
Perubahan Perangkat
Versi Server
```

Shows:

```text
Field
Local Value
Server Value
Actor
Time
Version
```

## Actions

```text
Use Server
Apply Local via owning domain command
Manual Resolution
```

Permission-gated.

---

# 84. Common Empty States

Examples:

```text
No products
No purchases
No pending attention
No held carts
No returns
No sync conflicts
```

Each should provide a relevant next action when appropriate.

---

# 85. Common Loading States

If local cache exists:

```text
show cache immediately
```

Then:

```text
background refresh
```

Full-page blocking loader only when no usable data exists.

---

# 86. Common Permission State

If route accessible but action not allowed:

```text
action hidden or disabled with explanation
```

If route itself not allowed:

```text
Permission Denied
```

No sensitive data should already be serialized to client.

---

# 87. Common Online-Required State

Pattern:

```text
Saat ini offline.
Perubahan dapat disiapkan sebagai draft, tetapi harus online untuk dipublikasikan.
```

Used for:

```text
Price Publish
Purchase Post
Permission changes
```

---

# 88. Common Destructive Confirmation

Must show:

```text
Object
Business effect
Inventory/cash effect if any
Reason
Explicit action label
```

Examples:

```text
Void Transaksi
Nonaktifkan Produk
Batalkan Proposal
Force Close Shift
```

---

# 89. Keyboard Baseline — Back Office

General:

```text
Tab / Shift+Tab
Enter
Esc
Ctrl/Cmd+K search
```

Data-entry-heavy forms should preserve logical tab order.

No critical workflow requires mouse-only drag behavior.

---

# 90. Keyboard Baseline — POS

Reserved conceptual keys:

```text
Search
Payment
Escape overlay
Confirm
```

Exact mapping deferred.

Scanner input remains higher priority than global shortcut interpretation.

---

# 91. Scanner Focus Contract

When POS Sell active and no text field intentionally focused:

```text
scanner capture ready
```

After successful scan:

```text
focus returns scanner-ready
```

After unknown barcode:

```text
focus remains scanner-ready
```

After modal/dialog close:

```text
focus returns operational context
```

---

# 92. Responsive Back Office Priorities

Desktop:

```text
full table/data density
```

Tablet:

```text
reduced columns
horizontal overflow where appropriate
```

Mobile:

```text
structured record lists
critical action preserved
secondary detail moved inward
```

No essential operation removed solely due viewport.

---

# 93. Responsive POS Priorities

Desktop:

```text
split pane
```

Tablet Landscape:

```text
split pane
```

Tablet Portrait:

```text
product + accessible cart drawer/panel
```

Mobile:

```text
single-column product flow
persistent cart summary
full-screen checkout
```

---

# 94. Acceptance Criteria — Global

Every v1 screen must satisfy:

```text
[ ] Purpose is obvious
[ ] Primary action identifiable
[ ] Permissions defined
[ ] Offline behavior defined
[ ] Loading state defined
[ ] Empty state defined
[ ] Error state defined
[ ] Responsive behavior defined
[ ] Keyboard interaction defined where operational
[ ] Scanner behavior defined where relevant
[ ] Sensitive data role-safe
[ ] Historical immutable data not casually editable
[ ] Cross-domain source links available where required
```

---

# 95. Acceptance Criteria — POS

```text
[ ] Normal cash sale works without network
[ ] Scanner exact match auto-adds
[ ] Repeated scan increments qty
[ ] Product image not required
[ ] Cart stays visible/reachable
[ ] Tier price updates automatically
[ ] Payment supports split
[ ] Customer optional
[ ] Receipt print failure does not fail sale
[ ] Quick Lock exists
[ ] Close Shift uses blind count
[ ] Offline state is non-blocking for safe workflows
```

---

# 96. Screen Inventory Summary

Back Office major screens:

```text
Global Shell
Overview
Attention
Products
Product Detail
Unit/Barcode
Product Pricing
Purchases
Purchase Detail
Receiving
Invoice/Cost
Integrity
Suppliers
Supplier Returns
Inventory
Stock Movements
Adjustment
Opname
Pricing
Pricing Review
Proposal
Calculator
Promotions
Price History
Transactions
Returns
Refunds
Customers
Shifts
Reports
Settings
Sync Conflict
```

POS major screens:

```text
Global Shell
Sell
Product Search
Cart
Held Carts
Payment
Cash
QRIS
Transfer
Split Payment
Complete Result
Receipt
Transactions
Transaction Detail
Return Search
Return Builder
Refund
Return Result
No-Receipt Return
Shift Open
Shift Active
Cash Movement
Shift Close
Quick Lock
Offline/Sync State
```

---

# 97. Screen Specification Decisions Locked in v1

```text
UX-001 Scanner exact match auto-add
UX-002 Repeated scanner input increments quantity
UX-003 No scan success modal
UX-004 Unknown barcode does not break scanner flow
UX-005 POS product discovery is search-first / compact
UX-006 Product images are non-essential
UX-007 Desktop POS ≈ 60/40 product/cart split
UX-008 Cart remains visible through normal sale
UX-009 Payment can replace product pane while cart remains visible
UX-010 Shift close uses blind cash count
UX-011 Default payment order Cash → QRIS → Transfer → Other
UX-012 Customer is optional secondary checkout action
UX-013 Receipt primary target 80 mm
UX-014 Receipt compatible with 58 mm
UX-015 Printing is not Transaction completion dependency
UX-016 POS Quick Lock required
UX-017 POS primary device keyboard/mouse/scanner
UX-018 POS remains tablet/mobile touch-safe
UX-019 Back Office desktop-first responsive
UX-020 Cached usable data renders before cloud refresh
```

---

# 98. Recommended Next Phase

The next phase should be:

```text
LEGACY CODE AUDIT
KEEP / ADAPT / REPLACE / REMOVE
```

Audit both existing repositories against:

```text
Business Rules
System Architecture
Database Schema
API/Sync Contract
Design System
Screen Specifications
```

Outputs:

```text
Reusable modules
Reusable tests
Data migration candidates
Technical debt
Architecture conflicts
UI patterns to discard
Sync code to replace
Migration dependencies
```

After that:

```text
IMPLEMENTATION ROADMAP
↓
AGENTS.md
↓
CODEX HANDOFF PACKAGE
```

---

# Final Screen Specification Principle

> **Every Kastur screen must optimize the real job being performed. Back Office prioritizes operational comparison, supervision, and traceability; POS prioritizes scan-to-payment speed, keyboard/scanner efficiency, and resilient offline operation. Screen behavior must make business state, authority, and consequences explicit without forcing users to understand database structures or synchronization internals.**
