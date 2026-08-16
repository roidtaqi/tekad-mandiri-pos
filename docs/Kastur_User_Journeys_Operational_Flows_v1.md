# Kastur Retail System — User Journeys & Operational Flows v1

**Status:** Draft for Product Flow Review  
**Depends on:** Business Rules Domain 01–10, Cross-Domain Matrix, Cross-Domain Gap Resolution v1  
**Purpose:** Menerjemahkan Business Foundation v1 menjadi pekerjaan nyata Owner, Admin, dan Cashier sebelum Information Architecture dan Screen Design.

---

# 1. Prinsip User Journey

User Journey Kastur harus mengikuti prinsip berikut:

1. **Task-first, bukan entity-first.**
2. **Role menentukan konteks kerja; Permission menentukan authority.**
3. **Normal flow harus sesingkat mungkin.**
4. **Exception tidak boleh mengganggu normal flow kecuali memang high-risk.**
5. **Historical business facts tidak di-overwrite.**
6. **Offline-safe operation harus tetap dapat selesai secara lokal.**
7. **User tidak perlu memahami batas teknis Back Office vs POS.**
8. **Owner bekerja melalui review dan exception, bukan approval setiap operasi normal.**
9. **Admin adalah operator Back Office + Purchasing.**
10. **Cashier adalah Sales Operator dan diarahkan langsung ke POS.**

---

# 2. Actor Map

## Owner

Primary jobs:

```text
Control Business
Review Exceptions
Approve Pricing
Override High-Risk Decisions
Review Cash/Inventory/Purchasing Integrity
Manage Users & Settings
```

## Admin

Primary jobs:

```text
Manage Catalog
Manage Suppliers
Create Purchase
Receive Goods
Post Purchase
Manage Inventory
Perform Stock Opname
Prepare Price Proposal
Handle Operational Returns
```

## Cashier

Primary jobs:

```text
Open Shift
Sell Products
Accept Payment
Issue Receipt
Handle Allowed Returns
Close Shift
```

---

# 3. Journey Priority

```text
P0 = must-have core retail operation
P1 = important operational control
P2 = useful but can be staged after core
```

---

# 4. Journey Catalog

| ID | Journey | Actor | Priority |
|---|---|---|---|
| UJ-01 | Create Product | Admin / Owner | P0 |
| UJ-02 | Configure Product Unit & Barcode | Admin / Owner | P0 |
| UJ-03 | Import Opening Catalog / Stock / Cost / Price | Admin / Owner | P0 |
| UJ-04 | Create Purchase | Admin | P0 |
| UJ-05 | Receive Goods — Partial / Full | Admin | P0 |
| UJ-06 | Finalize & Post Purchase | Admin | P0 |
| UJ-07 | Review Purchasing Integrity Exception | Owner / Admin | P1 |
| UJ-08 | Supplier Return & Replacement | Admin / Owner | P1 |
| UJ-09 | Review Cost Change | Owner / Admin | P0 |
| UJ-10 | Create Price Proposal | Admin | P0 |
| UJ-11 | Approve / Schedule Price | Owner | P0 |
| UJ-12 | Owner Direct Price Change | Owner | P1 |
| UJ-13 | Create Promotion | Admin / Owner | P1 |
| UJ-14 | Manual Stock Adjustment | Admin / Owner | P0 |
| UJ-15 | Perform Stock Opname While Store Operates | Admin / Owner | P0 |
| UJ-16 | Open Cashier Shift | Cashier | P0 |
| UJ-17 | Standard POS Sale | Cashier | P0 |
| UJ-18 | Quantity-Tier / Wholesale Sale | Cashier | P0 |
| UJ-19 | Split Payment Sale | Cashier | P0 |
| UJ-20 | Sale with Low / Negative Stock | Cashier | P0 |
| UJ-21 | Offline Sale & Reconnect | Cashier | P0 |
| UJ-22 | Hold & Resume Cart | Cashier | P1 |
| UJ-23 | Normal Partial Customer Return | Cashier / Admin | P0 |
| UJ-24 | Damaged / Non-Restocked Return | Cashier / Admin | P0 |
| UJ-25 | Customer Exchange | Cashier / Admin | P1 |
| UJ-26 | No-Receipt Return | Admin / Owner | P1 |
| UJ-27 | Resolve Pending / Failed Refund | Admin / Owner | P1 |
| UJ-28 | Cash In / Cash Out / Safe Drop | Cashier / Admin | P0 |
| UJ-29 | Close Shift — Matched | Cashier | P0 |
| UJ-30 | Close Shift — Cash Variance | Cashier / Owner / Admin | P0 |
| UJ-31 | Force Close Abandoned Shift | Owner / Admin | P1 |
| UJ-32 | Create / Deactivate User | Owner | P1 |
| UJ-33 | Assign Role / Permission Override | Owner | P1 |
| UJ-34 | Resolve Sync / Master Data Conflict | Admin / Owner | P1 |
| UJ-35 | Owner Reviews Attention / Exception Queue | Owner | P0 |

---

# 5. UJ-01 — Create Product

**Actor:** Admin / Owner  
**Priority:** P0  
**Goal:** Membuat Product baru secepat mungkin tanpa memaksa seluruh data komersial diisi sekaligus.

## Preconditions

```text
product.create
```

## Happy Path

```text
Start Add Product
↓
Enter Product Name
↓
Select / Create Category
↓
Optional Brand
↓
Set Base Unit
↓
Set track_inventory
↓
Generate / Enter SKU
↓
Save Product
↓
Product Created
```

## Progressive Setup

Setelah Product tersimpan, user dapat lanjut:

```text
Add Product Units
Add Barcodes
Add Supplier Relation
Add Opening Stock
Configure Pricing
```

tetapi tidak semuanya wajib saat creation.

## System Validation

- SKU unique.
- Base Unit valid.
- Product Name required.
- Duplicate Product warning berdasarkan similar name/brand/size.

## Exceptions

```text
Duplicate SKU
Possible Duplicate Product
Invalid Base Unit
```

## Output

```text
Product
Base Product Unit
Audit Event
Sync Event
```

## Domains

```text
D01 D08 D10
```

---

# 6. UJ-02 — Configure Product Unit & Barcode

**Actor:** Admin / Owner  
**Priority:** P0

## Goal

Mendefinisikan bagaimana satu Product dibeli/dijual tanpa membuat Product duplicate.

## Happy Path

```text
Open Product
↓
Add Product Unit
↓
Choose Unit Code
↓
Enter Conversion to Base Unit
↓
Set Can Sell / Can Purchase
↓
Add Barcode
↓
Save
```

Example:

```text
Base Unit = PCS

PACK
1 PACK = 6 PCS

CARTON
1 CARTON = 48 PCS
```

## Rules

- Barcode belongs to Product Unit.
- Multiple barcodes allowed.
- Active barcode unique.
- Conversion historical snapshots remain immutable.

## Exception

If Product already has stock history:

```text
Base Unit change
→ BLOCKED
```

## Domains

```text
D01 D05 D08 D10
```

---

# 7. UJ-03 — Import Opening Catalog / Stock / Cost / Price

**Actor:** Admin / Owner  
**Priority:** P0

## Goal

Migrate existing store data without inventing historical purchases.

## Flow

```text
Upload Import File
↓
Map Columns
↓
Validate Rows
↓
Preview Errors / Warnings
↓
Confirm Import
↓
Create Products / Units / Barcodes
↓
Create INITIAL_STOCK
↓
Create INITIAL_COST
↓
Create OPENING_PRICE
↓
Import Summary
```

## Errors

```text
Duplicate SKU
Duplicate Barcode
Invalid Unit
Invalid Quantity
Missing Required Cost
Unknown Category
```

## Rule

Legacy data is a migration source, not the schema authority.

## Domains

```text
D01 D03 D04 D05 D08 D10
```

---

# 8. UJ-04 — Create Purchase

**Actor:** Admin  
**Priority:** P0

## Goal

Mencatat satu transaksi pembelian / nota dari Supplier.

## Flow

```text
Start Purchase
↓
Select Supplier
↓
Add Products
↓
Choose Purchase Unit
↓
Enter Expected Qty
↓
Enter Agreed Price
↓
Enter Bonus Qty if any
↓
Enter Agreed Discount / Charges if known
↓
Save Draft
↓
Optional: Mark Ordered
```

## When Ordered

System locks:

```text
Agreed Purchase Snapshot
```

## Output

```text
Purchase DRAFT / ORDERED
Purchase Items
Agreed Snapshot
```

## Domains

```text
D01 D02 D08 D10
```

---

# 9. UJ-05 — Receive Goods — Partial / Full

**Actor:** Admin  
**Priority:** P0

## Goal

Mencatat barang yang benar-benar diterima tanpa menunggu seluruh Purchase selesai.

## Flow

```text
Open Purchase
↓
Receive Goods
↓
For Each Item:
  Input Received Qty
  Input Accepted Qty
  Input Rejected/Damaged Qty
  Confirm Bonus Qty
↓
Review Variances
↓
Confirm Receipt
↓
Inventory Updated Immediately
```

## Effects

```text
Receipt Created
PURCHASE_RECEIPT Stock Movement
Provisional / Final Cost Linkage
Integrity Comparison
Audit
Sync
```

## Partial Receiving

```text
Ordered 10 CTN
Received 6 CTN

Purchase
→ PARTIALLY_RECEIVED
```

Later:

```text
Receive 4 CTN
→ RECEIVED
```

## Offline

Receiving is allowed offline.

## Exceptions

```text
Short Delivery
Over Delivery
Wrong Item
Damaged Goods
Bonus Missing
Unexpected Unit
Price Variance
```

## Domains

```text
D02 D03 D05 D08 D10
```

---

# 10. UJ-06 — Finalize & Post Purchase

**Actor:** Admin  
**Priority:** P0

## Goal

Mengubah Purchase dari operational record menjadi commercial final record.

## Preconditions

```text
Invoice captured
Receiving sufficiently complete
Commercial data reviewed
Online authoritative connection
```

## Flow

```text
Open Purchase
↓
Review:
Agreed
Invoice
Received
Accepted
Discount
Bonus
Acquisition Costs
↓
Resolve / Accept Integrity Warnings
↓
Ready to Post
↓
Sync / Server Validation
↓
POSTED
```

## Effects

```text
Final Landed Cost
Cost Reconciliation if required
Pricing Reference update
PRICE_REVIEW_RECOMMENDED if needed
Audit
```

## Offline

Offline state:

```text
READY_TO_POST
```

Actual:

```text
POSTED
```

requires authoritative sync.

## Domains

```text
D02 D03 D04 D08 D10
```

---

# 11. UJ-07 — Review Purchasing Integrity Exception

**Actor:** Owner / Admin  
**Priority:** P1

## Goal

Memeriksa perbedaan supplier tanpa menuduh fraud secara otomatis.

## Entry Points

```text
Owner Attention
Purchase Detail
Supplier History
```

## Flow

```text
Open Exception
↓
Compare:
Agreed
Invoice
Received
Accepted
Discount
Bonus
Charges
↓
Review Estimated Financial Exposure
↓
Choose Resolution
```

Possible resolution:

```text
Accept Variance
Contact Supplier
Create Supplier Return
Create Purchase Correction
Mark Disputed
Resolve
```

## Exception Lifecycle

```text
OPEN
ACKNOWLEDGED
RESOLVED
DISMISSED
```

## Domains

```text
D02 D03 D08 D10
```

---

# 12. UJ-08 — Supplier Return & Replacement

**Actor:** Admin / Owner  
**Priority:** P1

## Flow

```text
Open Purchase / Receipt
↓
Select Returnable Item
↓
Enter Qty
↓
Reason
↓
Create Supplier Return
↓
Inventory - Qty
↓
Supplier Claim Open
```

Settlement:

```text
CREDIT_RECEIVED
or
REFUNDED
or
REPLACED
or
WRITTEN_OFF
```

If replacement:

```text
Receive Replacement
↓
SUPPLIER_REPLACEMENT Stock +
```

## Domains

```text
D02 D03 D05 D08 D10
```

---

# 13. UJ-09 — Review Cost Change

**Actor:** Owner / Admin  
**Priority:** P0

## Goal

Memahami dampak cost baru terhadap margin dan harga jual.

## Flow

```text
PRICE_REVIEW_RECOMMENDED
↓
Open Product Pricing Context
↓
Review:
Current MWA
Latest Landed Cost
Pricing Reference Cost
Current Price
Current Margin
Target Margin
Minimum Margin
Cost Change %
↓
Choose:
No Action
Create Proposal
Run Calculator
```

## Rule

Cost change never changes selling price automatically.

## Domains

```text
D03 D04 D08
```

---

# 14. UJ-10 — Create Price Proposal

**Actor:** Admin  
**Priority:** P0

## Flow

```text
Open Product Pricing
↓
Run Recommendation
↓
Review Current Price
↓
Review Cost / Margin
↓
Set Proposed Base Price
↓
Set Quantity Tiers if relevant
↓
Reason / Notes
↓
Submit for Approval
```

Possible warning:

```text
Below Target Margin
Below Floor
Large Price Change
Tier Inconsistency
```

Admin may submit below Floor, but cannot approve.

## Domains

```text
D03 D04 D08 D10
```

---

# 15. UJ-11 — Approve / Schedule Price

**Actor:** Owner  
**Priority:** P0

## Flow

```text
Open Pending Proposal
↓
Compare:
Current Price
Cost
Margin
Recommendation
Admin Proposal
Warnings
↓
Choose:
Approve
Edit & Approve
Reject
↓
Choose Effective Time:
Now
Scheduled
↓
Publish
```

## Rules

```text
Publish / Activate
→ Online Required
```

Historical Price Version remains.

## Domains

```text
D04 D08 D10
```

---

# 16. UJ-12 — Owner Direct Price Change

**Actor:** Owner  
**Priority:** P1

## Flow

```text
Open Product Pricing
↓
Edit Price / Tier
↓
Pricing Validation
↓
Review Margin / Floor
↓
If below Floor:
  Explicit Override
  Reason
↓
Choose Effective Date
↓
Publish
```

No self-approval required.

Still fully audited.

## Domains

```text
D03 D04 D08 D10
```

---

# 17. UJ-13 — Create Promotion

**Actor:** Admin / Owner  
**Priority:** P1

## Flow

```text
Select Product Unit
↓
Choose Promotion Type:
Fixed Price
Percent Discount
↓
Set Start
↓
Set End
↓
Set Priority
↓
Validate Floor
↓
Save / Publish
```

Resolution if multiple promotions:

```text
Highest Priority
→ Greatest Customer Benefit
→ Earliest Created
→ Stable Promotion ID
```

Maximum one promotion per line.

## Domains

```text
D04 D06 D08 D10
```

---

# 18. UJ-14 — Manual Stock Adjustment

**Actor:** Admin / Owner  
**Priority:** P0

## Goal

Correct stock because of operational reality, not by editing balance directly.

## Flow

```text
Find Product
↓
Select Adjustment:
Stock In
Stock Out
↓
Enter Qty
↓
Select Reason:
Damaged
Lost
Found
Data Correction
Expired
Other
↓
Review Value Impact
↓
Confirm
```

## Effects

```text
Stock Movement
Inventory Gain/Loss
Audit
Sync
```

## Domains

```text
D03 D05 D08 D10
```

---

# 19. UJ-15 — Perform Stock Opname While Store Operates

**Actor:** Admin / Owner  
**Priority:** P0

## Flow

```text
Create Opname Session
↓
Select Scope
↓
COUNTING
↓
For Each Product:
  Read system_qty_at_count
  Count Physical Qty
  Confirm Count Snapshot
↓
Variance Calculated
↓
Review Variances
↓
Recount if needed
↓
Post Opname
```

## Concurrent Sale

POS remains operational.

Example:

```text
10:00
System = 100
Physical = 95
Variance = -5

10:05
Sale -10

Post variance -5
Final = 85
```

## Concurrent Receiving

Allowed.

If movement occurs before count confirmation:

```text
RECOUNT_RECOMMENDED
```

## Effects

```text
OPNAME_ADJUSTMENT_IN / OUT
Inventory Gain / Loss
Audit
```

## Domains

```text
D03 D05 D06 D08 D10
```

---

# 20. UJ-16 — Open Cashier Shift

**Actor:** Cashier  
**Priority:** P0

## Flow

```text
Login
↓
POS Landing
↓
No Active Shift
↓
Open Shift
↓
Enter Opening Cash
↓
Confirm
↓
Shift OPEN
↓
Ready for POS
```

## Rules

- Opening Cash >= 0.
- Opening Cash is not revenue.
- One active shift per cashier/terminal context under normal operation.

## Offline

Allowed.

## Domains

```text
D07 D08 D10
```

---

# 21. UJ-17 — Standard POS Sale

**Actor:** Cashier  
**Priority:** P0

## Flow

```text
Scan Barcode
or
Search Product
↓
Product Unit Added
↓
Set Qty
↓
System Resolves:
Base Price
Tier
Promotion
↓
Optional Authorized Discount
↓
Review Cart
↓
Payment
↓
Confirm
↓
Transaction COMPLETED
↓
Receipt
```

## Atomic Effects

```text
Transaction
Transaction Items
Pricing Snapshot
Cost Snapshot
Payment
SALE Stock Movement
Cash Effect if CASH
Audit
Sync Queue
```

## Domains

```text
D01 D03 D04 D05 D06 D07 D08 D10
```

---

# 22. UJ-18 — Quantity-Tier / Wholesale Sale

**Actor:** Cashier  
**Priority:** P0

## Flow

```text
Scan / Add Product Unit
↓
Increase Qty
↓
System aggregates same Product Unit quantity
↓
Applicable Tier changes automatically
↓
Cashier reviews new unit price
↓
Complete Sale
```

Example:

```text
PCS:
1+  Rp3.500
10+ Rp3.300

5 PCS + 7 PCS
→ 12 PCS
→ Rp3.300
```

Cross-unit quantity never mixes.

## Domains

```text
D04 D06 D05
```

---

# 23. UJ-19 — Split Payment Sale

**Actor:** Cashier  
**Priority:** P0

## Flow

```text
Cart Total Rp100.000
↓
Choose Split Payment
↓
Cash Rp40.000
↓
QRIS Rp60.000
↓
Validate Total Settlement
↓
Complete
```

## Cash Effect

```text
Drawer + Rp40.000
```

QRIS:

```text
No physical drawer effect
```

## Domains

```text
D06 D07 D10
```

---

# 24. UJ-20 — Sale with Low / Negative Stock

**Actor:** Cashier  
**Priority:** P0

## Flow

```text
Add Product
↓
Requested Qty > Local Stock
↓
Warning
↓
If Business Policy Allows:
Continue
↓
Confirm at Finalization
↓
Sale COMPLETED
```

## Effects

If balance becomes negative:

```text
INVENTORY_NEGATIVE
Provisional COGS if required
Owner/Admin Attention
```

Sale is not automatically cancelled.

## Domains

```text
D03 D05 D06 D08 D10
```

---

# 25. UJ-21 — Offline Sale & Reconnect

**Actor:** Cashier  
**Priority:** P0

## Offline Flow

```text
Network unavailable
↓
Use Cached Catalog
↓
Use Cached Published Pricing
↓
Create Cart
↓
Cash / Offline-capable Payment
↓
Complete Sale Locally
↓
Local Inventory Updated
↓
Local Cash Updated
↓
Sync PENDING
```

## Reconnect

```text
Connection Restored
↓
Automatic Sync
↓
Server Idempotency
↓
Version / Integrity Checks
↓
SYNCED
```

Possible exception:

```text
STALE_PRICING
INVENTORY_NEGATIVE_AFTER_MERGE
AUTHORIZATION_STALE
```

Historical Sale remains unchanged.

## Domains

```text
D01 D04 D05 D06 D07 D08 D10
```

---

# 26. UJ-22 — Hold & Resume Cart

**Actor:** Cashier  
**Priority:** P1

## Flow

```text
Cart in progress
↓
Hold Cart
↓
Serve Another Customer
↓
Open Held Carts
↓
Resume
↓
Continue Sale
```

## Rules

```text
Held Cart
≠ Sale
≠ Stock Reservation
```

Held carts must be resolved before shift close under current v2 policy.

## Domains

```text
D06 D07 D10
```

---

# 27. UJ-23 — Normal Partial Customer Return

**Actor:** Cashier / Admin  
**Priority:** P0

## Preconditions

```text
Original transaction found
Within return window
Remaining returnable qty > 0
```

## Flow

```text
Find Transaction
↓
Select Item
↓
Select Return Qty
↓
Reason
↓
Disposition = RESTOCK
↓
Review Refund
↓
Confirm
```

## Effects

```text
Return COMPLETED
CUSTOMER_RETURN Stock +
Cost Reversal using Original Cost Snapshot
Refund
Current Shift Cash/Payment Effect
Audit
Sync
```

Original sale remains unchanged.

## Domains

```text
D03 D05 D06 D07 D08 D09 D10
```

---

# 28. UJ-24 — Damaged / Non-Restocked Return

**Actor:** Cashier / Admin  
**Priority:** P0

## Flow

```text
Find Original Transaction
↓
Select Item / Qty
↓
Reason = DAMAGED / QUALITY / EXPIRED / ...
↓
Disposition = NOT_RESTOCKED
↓
Refund
↓
Complete
```

## Effects

```text
No Sellable Stock Increase
RETURN_LOSS
Refund
Audit
```

Possible categories:

```text
DAMAGED_RETURN
EXPIRED_RETURN
QUALITY_RETURN
GOODWILL_REFUND
CUSTOMER_DAMAGE
OTHER_RETURN_LOSS
```

## Domains

```text
D03 D07 D08 D09 D10
```

---

# 29. UJ-25 — Customer Exchange

**Actor:** Cashier / Admin  
**Priority:** P1

## Flow

```text
Original Transaction
↓
Complete Return
↓
Create New Sale
↓
Compare Values
```

Example:

```text
Returned Value Rp20.000
New Product Rp25.000
Customer Pays Rp5.000
```

Exchange never edits original sale.

## Domains

```text
D03 D05 D06 D07 D08 D09 D10
```

---

# 30. UJ-26 — No-Receipt Return

**Actor:** Admin / Owner  
**Priority:** P1

## Default Policy

```text
NO-RECEIPT RETURN
→ EXCHANGE ONLY
```

## Flow

```text
Transaction Cannot Be Found
↓
Choose No-Receipt Return
↓
Permission Check
↓
Select Product / Qty
↓
Reason
↓
Value = Current Active Selling Price
↓
Exchange Only
↓
Confirm
```

Owner exceptional monetary refund:

```text
Explicit Override
↓
Manual Refund Amount
↓
Reason
↓
Audit
```

## Risk

```text
HIGH_RISK_RETURN
```

## Domains

```text
D04 D05 D07 D08 D09 D10
```

---

# 31. UJ-27 — Resolve Pending / Failed Refund

**Actor:** Admin / Owner  
**Priority:** P1

## Flow

```text
Outstanding Refund Queue
↓
Open Refund
↓
Review:
Return Completed
Refund Method
Provider Status
Amount
Failure Reason
↓
Retry / Correct / Escalate
↓
Refund COMPLETED
```

## Rule

```text
Return = COMPLETED
Refund = PENDING / FAILED
```

are independent valid states.

## Domains

```text
D07 D08 D09 D10
```

---

# 32. UJ-28 — Cash In / Cash Out / Safe Drop

**Actor:** Cashier / Admin  
**Priority:** P0

## Cash In

```text
Open Current Shift
↓
Cash In
↓
Amount
↓
Reason
↓
Confirm
```

## Cash Out

```text
Cash Out
↓
Amount
↓
Reason
↓
Permission / Threshold Check
↓
Confirm
```

## Safe Drop

```text
Cash Out
Reason = SAFE_DROP
```

## Rule

Cash movement never changes Sales Revenue.

## Domains

```text
D07 D08 D10
```

---

# 33. UJ-29 — Close Shift — Matched

**Actor:** Cashier  
**Priority:** P0

## Flow

```text
Close Shift
↓
Resolve Held / Pending Cart
↓
Review Payment Summary
↓
Count Physical Cash
↓
Enter Actual Cash
↓
System Calculates Expected Cash
↓
Variance = 0
↓
Confirm Close
↓
Shift CLOSED
```

## Domains

```text
D06 D07 D08 D10
```

---

# 34. UJ-30 — Close Shift — Cash Variance

**Actor:** Cashier / Owner / Admin  
**Priority:** P0

## Flow

```text
Expected Cash
≠
Actual Cash
↓
Variance calculated
↓
Select / Enter Reason
↓
Close Shift
↓
Exception severity assigned
↓
Owner/Admin Review if required
```

Example:

```text
Expected Rp2.500.000
Actual   Rp2.480.000

Variance -Rp20.000
→ SHORT
```

Sales Revenue is unchanged.

## Domains

```text
D07 D08 D10
```

---

# 35. UJ-31 — Force Close Abandoned Shift

**Actor:** Owner / Admin  
**Priority:** P1

## Flow

```text
Open Shift remains abandoned
↓
Supervisor opens Shift Detail
↓
Force Close
↓
Reason
↓
If cash cannot be physically verified:
ACTUAL_CASH_UNVERIFIED
↓
Confirm
```

Original event remains auditable.

## Domains

```text
D07 D08 D10
```

---

# 36. UJ-32 — Create / Deactivate User

**Actor:** Owner  
**Priority:** P1

## Create

```text
Users
↓
Add User
↓
Name
↓
Credential / Login Identifier
↓
Role
↓
Optional Advanced Permission Overrides
↓
Save
```

## Deactivate

```text
Open User
↓
Deactivate
↓
Confirm
↓
Sessions revoked when authoritative state received
```

Historical actions remain.

## Rules

- Shared accounts prohibited.
- At least one active Owner must remain.

## Domains

```text
D08 D10
```

---

# 37. UJ-33 — Assign Role / Permission Override

**Actor:** Owner  
**Priority:** P1

## Flow

```text
Open User
↓
Choose Role Preset
↓
Optional Advanced Permissions
↓
Preview Effective Permissions
↓
Save
↓
Authorization Version Changes
```

Example:

```text
Admin A
+ inventory.adjust

Admin B
- inventory.adjust
```

## Domains

```text
D08 D10
```

---

# 38. UJ-34 — Resolve Sync / Master Data Conflict

**Actor:** Admin / Owner  
**Priority:** P1

## Flow

```text
Requires Review
↓
Open Conflict
↓
Compare:
Local Proposed Value
Server Current Value
Source / Actor / Time
↓
Choose Resolution
↓
Confirm
↓
Audit Resolution
```

Applies primarily to mutable shared master data.

Immutable completed events are generally appended/reconciled, not chosen via last-write-wins.

## Domains

```text
D08 D10
```

---

# 39. UJ-35 — Owner Reviews Attention / Exception Queue

**Actor:** Owner  
**Priority:** P0

## Goal

Memberikan Owner satu tempat untuk mengawasi bisnis tanpa approve semua transaksi normal.

## Potential Items

```text
Purchase Integrity
Large Cost Change
Pricing Review
Below-Floor Price
Negative Stock
Large Stock Adjustment
Cash Variance
High Void Activity
High Return Activity
No-Receipt Return
Pending Refund
Stale Pricing
Stale Authorization
Sync Conflict
Offline Device Too Long
```

## Flow

```text
Owner Opens Attention
↓
Items Prioritized by Severity
↓
Filter / Group by Domain
↓
Open Exception
↓
Review Supporting Business Record
↓
Take Action
↓
Resolve / Acknowledge / Dismiss
```

## Severity

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

## Domains

```text
D02 D03 D04 D05 D06 D07 D08 D09 D10
```

---

# 40. End-to-End Operational Journey — Purchase to Sale

```text
Admin Creates Product
↓
Admin Configures Units / Barcode
↓
Admin Creates Purchase
↓
Supplier Delivers Goods
↓
Admin Receives Goods
↓
Inventory Immediately Increases
↓
Admin Finalizes Commercial Purchase
↓
Purchase POSTED
↓
Landed Cost Finalized
↓
Pricing Reference Cost Updated
↓
Price Review Recommended
↓
Admin Creates Price Proposal
↓
Owner Approves Price
↓
Published Price Syncs to POS
↓
Cashier Opens Shift
↓
Cashier Scans Product
↓
POS Resolves Price
↓
Customer Pays
↓
Sale Completed
↓
Inventory Decreases
↓
COGS Captured
↓
Payment / Cash Recorded
↓
Owner Reporting Updated
```

---

# 41. End-to-End Operational Journey — Customer Return

```text
Customer Presents Product
↓
Cashier Finds Original Transaction
↓
Select Return Item / Qty
↓
Choose Reason
↓
Choose Disposition
├── RESTOCK
│    ↓
│ Inventory +
│ COGS Reversal
│
└── NOT_RESTOCKED
     ↓
   Return Loss

↓
Refund
↓
Cash / Provider Effect
↓
Return Completed
↓
Audit
↓
Owner Exception if High Risk
```

---

# 42. End-to-End Operational Journey — Daily Cashier

```text
Cashier Login
↓
Open Shift
↓
Opening Cash
↓
Serve Customers
├── Normal Sale
├── Tier Sale
├── Split Payment
├── Offline Sale
├── Allowed Return
└── Cash In / Out
↓
Resolve Held Carts
↓
Close Shift
↓
Count Cash
↓
Expected vs Actual
↓
Variance
↓
Shift CLOSED
↓
Owner/Admin Review if required
```

---

# 43. Information Architecture Inputs Derived from Journeys

The journeys imply the following **tasks**, but not yet final navigation:

## Back Office task clusters

```text
Business Overview / Attention
Products
Purchasing
Suppliers
Inventory
Stock Opname
Pricing
Promotions
Customers
Transactions / Returns
Reports
Users & Permissions
Settings
Sync / Device Health
```

## POS task clusters

```text
Sell
Held Carts
Transactions
Returns
Current Shift
Cash Movement
Close Shift
Sync Status
```

These are inputs for the next phase, **Information Architecture**, not final screen decisions yet.

---

# 44. Journey Validation Checklist

Before a journey is considered implementation-ready:

```text
[ ] Actor clearly defined
[ ] Goal clearly defined
[ ] Entry point known
[ ] Preconditions known
[ ] Happy path known
[ ] Permission known
[ ] Business effects known
[ ] Offline behavior known where relevant
[ ] Exception behavior known
[ ] Reversal/correction path known
[ ] Historical snapshot impact known
[ ] Audit impact known
[ ] Exit state known
```

---

# 45. User Journey Foundation Status

With UJ-01 through UJ-35 defined:

```text
Product & Catalog        COVERED
Purchasing               COVERED
Receiving                COVERED
Cost Review              COVERED
Pricing                  COVERED
Inventory                COVERED
Stock Opname             COVERED
POS Sales                COVERED
Split Payment            COVERED
Offline Sale             COVERED
Customer Return          COVERED
Refund                   COVERED
Shift / Cash             COVERED
Identity / Permission    COVERED
Sync / Conflict          COVERED
Owner Exception Review   COVERED
```

---

# 46. Recommended Next Phase

```text
Business Foundation v1
        ↓
Cross-Domain Matrix
        ↓
Gap Resolution v1
        ↓
User Journeys v1
        ↓
INFORMATION ARCHITECTURE
        ↓
System Architecture
        ↓
Database / Domain Schema
        ↓
API + Sync Contract
        ↓
Design System
        ↓
Screen Specifications
        ↓
Legacy Code Assessment
        ↓
Implementation Roadmap
```

---

# Final User Journey Principle

> **Kastur harus dibangun berdasarkan pekerjaan nyata user, bukan berdasarkan tabel database atau daftar fitur lama. Owner mengendalikan bisnis melalui visibility dan exceptions, Admin menjalankan operasi Back Office dan Purchasing, sementara Cashier harus dapat menyelesaikan penjualan, pembayaran, return yang diizinkan, dan shift dengan friction minimum—even when the network is unavailable.**
