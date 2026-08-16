# Kastur Retail System — Cross-Domain Gap Resolution v1

**Status:** RESOLVED / Approved for Business Foundation Freeze  
**Scope:** GAP-001 through GAP-020  
**Depends on:** Business Rules Domain 01–10 + Cross-Domain Matrix  
**Purpose:** Menutup seluruh gap lintas-domain material sebelum masuk User Journeys, Information Architecture, System Architecture, Database Schema, API/Sync Contract, dan implementation planning.

---

# 1. Resolution Summary

```text
GAP-001  RESOLVED
GAP-002  RESOLVED
GAP-003  RESOLVED
GAP-004  RESOLVED
GAP-005  RESOLVED
GAP-006  RESOLVED
GAP-007  RESOLVED
GAP-008  RESOLVED
GAP-009  RESOLVED
GAP-010  RESOLVED
GAP-011  RESOLVED
GAP-012  RESOLVED
GAP-013  RESOLVED
GAP-014  RESOLVED
GAP-015  RESOLVED
GAP-016  RESOLVED
GAP-017  RESOLVED
GAP-018  RESOLVED
GAP-019  RESOLVED
GAP-020  RESOLVED
```

---

# GAP-001 — Post-Completion Void vs Customer Return Boundary

## Status

```text
RESOLVED
```

## Final Rule

```text
VOID
= pembatalan seluruh Completed Transaction
  karena kesalahan operasional transaksi

RETURN
= barang dikembalikan customer setelah sale terjadi
```

### VOID

- Full transaction only.
- Hanya dapat dilakukan selama original shift masih `OPEN`.
- Tidak boleh digunakan jika transaction sudah mempunyai Customer Return.
- Membutuhkan supervisor permission + reason.
- Original completed transaction tetap dipertahankan.
- Menghasilkan compensating/reversal events untuk:
  - inventory,
  - COGS,
  - payment,
  - cash bila applicable.

### RETURN

- Dapat partial atau full per item.
- Dapat dilakukan setelah original shift `CLOSED`.
- Digunakan untuk customer-driven return atau post-sale merchandise issue.
- Original transaction tidak diubah.

## Invariant

> Setelah shift original ditutup, koreksi barang menggunakan Return, bukan memodifikasi atau Void historical shift.

---

# GAP-002 — Payment Correction Authority

## Status

```text
RESOLVED
```

## Final Rule

Cashier tidak dapat mengubah metode pembayaran pada Completed Transaction.

### Same Open Shift

```text
Admin / Owner
→ Payment Correction
```

### After Shift Closed

```text
Owner
→ Post-close Payment Correction
→ Reconciliation Event
```

Correction selalu menggunakan:

```text
Original Payment
→ REVERSED

Correct Payment
→ New Payment Record
```

Contoh:

```text
Original:
CASH Rp100.000

Correct:
QRIS Rp100.000
```

Cash Ledger juga harus direkonsiliasi.

## Prohibited

```text
payment.method = new_method
```

pada historical completed payment.

---

# GAP-003 — Transaction-Level Discount Scope

## Status

```text
RESOLVED
```

## Final Rule

Kastur v2 mendukung:

```text
Line Discount
Transaction Discount
```

Price resolution final:

```text
Base Price
↓
Quantity Tier
↓
Promotion
↓
Line Manual Discount
↓
Transaction Discount Allocation
↓
Final Price
```

Transaction-level discount dialokasikan:

```text
PROPORTIONAL_BY_ELIGIBLE_LINE_VALUE
```

Floor Price dievaluasi per line setelah allocation.

## Invariant

> Transaction discount tidak boleh membuat line secara diam-diam melewati Floor Price.

---

# GAP-004 — Promotion Conflict Priority

## Status

```text
RESOLVED
```

## Final Rule

Maximum:

```text
1 Promotion per Transaction Line
```

Tidak ada automatic promotion stacking pada v2.

Jika beberapa Promotion applicable:

```text
1. Highest Explicit Priority
2. If equal → Greatest Customer Benefit
3. If equal → Earliest Created Promotion
4. If equal → Stable Promotion ID
```

## Invariant

> Promotion resolution harus deterministic untuk input yang sama.

---

# GAP-005 — No-Receipt Return Refund Basis

## Status

```text
RESOLVED
```

## Final Rule

Default:

```text
NO-RECEIPT RETURN
→ EXCHANGE ONLY
```

Default exchange valuation:

```text
Current Active Selling Price
```

Cash/monetary refund tidak otomatis tersedia.

Owner dapat melakukan exceptional override:

```text
Manual Monetary Refund
```

dengan:

```text
refund.override_amount
+
explicit reason
+
audit
```

Normal exceptional amount tidak melebihi current active price kecuali Owner melakukan explicit higher-value override.

## Risk Classification

```text
HIGH_RISK_RETURN
```

---

# GAP-006 — Default Return Window

## Status

```text
RESOLVED
```

## Final Rule

Default Kastur:

```text
7 calendar days
```

Configuration:

```text
return_window_days
```

Owner dapat melakukan outside-window override dengan reason + audit.

## Invariant

> 7 hari adalah default product configuration, bukan hardcoded business logic.

---

# GAP-007 — Owner Direct Price Change Offline

## Status

```text
RESOLVED
```

## Final Rule

Offline Owner boleh:

```text
Create Price Draft
Edit Price Draft
Run Pricing Calculator
```

Tetapi:

```text
Activate / Publish Price
→ ONLINE REQUIRED
```

## Rationale

Published pricing merupakan shared global authority dan tidak boleh split-brain antar device.

## Invariant

> Global Active Price hanya menjadi authoritative setelah accepted oleh authoritative pricing service/cloud.

---

# GAP-008 — Purchase Posting Offline

## Status

```text
RESOLVED
```

## Final Rule

Offline diperbolehkan:

```text
Create Purchase
Edit Purchase
Receive Goods
Record Invoice
Calculate Preliminary Cost
```

Final posting:

```text
READY_TO_POST
↓
SYNC
↓
Server Validation
↓
POSTED
```

Receiving tetap menghasilkan physical stock effect secara lokal karena barang benar-benar diterima.

## Invariant

> Physical receiving tidak menunggu internet; commercial finalization POSTED membutuhkan authoritative validation.

---

# GAP-009 — Split Payment MVP

## Status

```text
RESOLVED
```

## Final Rule

Split Payment masuk UI v2.

Minimum combinations:

```text
CASH + QRIS
CASH + TRANSFER
QRIS + TRANSFER
```

Example:

```text
Grand Total  Rp100.000
Cash          Rp40.000
QRIS          Rp60.000
```

## Invariant

> Transaction dapat memiliki multiple Payment Records; Cash Ledger hanya menerima bagian cash.

---

# GAP-010 — Device vs Terminal vs Cash Drawer

## Status

```text
RESOLVED
```

## Final Model

```text
Device
→ technical / sync identity

Terminal
→ checkout operational context

Cash Drawer
→ physical drawer concept attached to Terminal
```

Current v2 simplification:

```text
1 Terminal
→ 1 Operational Cash Drawer
```

Single-device store menggunakan:

```text
Default Terminal
```

tanpa user memilih terminal setiap transaksi.

## Invariant

> Device dan Terminal tidak disatukan secara konseptual walaupun implementasi awal dapat memakai mapping 1:1.

---

# GAP-011 — Customer Domain Depth

## Status

```text
RESOLVED
```

## Final MVP Scope

Customer tetap lightweight dan optional.

Minimum fields:

```text
Customer ID
Name
Phone optional
Notes optional
Status
```

Minimum UX:

```text
Search by Name
Search by Phone
Transaction History
Return History
Basic Spend History
```

Out of scope:

```text
Loyalty Points
Membership Tier
Customer Credit
Accounts Receivable
Marketing Automation
Advanced Segmentation
```

## Invariant

> Normal walk-in sale tidak membutuhkan Customer record.

---

# GAP-012 — Product Base Unit Change Migration

## Status

```text
RESOLVED
```

## Final Rule

Before any inventory history:

```text
Base Unit
→ Editable with Audit
```

After first Stock Movement:

```text
Base Unit
→ LOCKED
```

No normal Back Office UI may change it.

If fundamentally wrong:

```text
Controlled Migration Utility
```

required.

Historical:

```text
base_quantity
conversion_snapshot
```

never recalculated retroactively.

## Implementation Note

Migration utility may be support/admin-only in v2.

---

# GAP-013 — Product Deactivation with Scheduled Price/Promotion

## Status

```text
RESOLVED
```

## Final Rule

If Product has:

```text
Active Promotion
Scheduled Promotion
Scheduled Price
```

deactivation requires explicit impact review.

Atomic action:

```text
Scheduled Price     → CANCELLED
Scheduled Promotion → CANCELLED
Active Promotion    → ENDED
Product             → INACTIVE
```

Historical Price Versions remain preserved.

All transitions audited.

## Invariant

> Inactive Product cannot retain future commercial schedules that may accidentally reactivate selling behavior.

---

# GAP-014 — Non-Restocked Return Cost Classification

## Status

```text
RESOLVED
```

## Final Classification

Parent:

```text
RETURN_LOSS
```

Subcategories:

```text
DAMAGED_RETURN
EXPIRED_RETURN
QUALITY_RETURN
GOODWILL_REFUND
CUSTOMER_DAMAGE
OTHER_RETURN_LOSS
```

Example:

```text
Refund Rp20.000
Item damaged
Disposition NOT_RESTOCKED

→ RETURN_LOSS / DAMAGED_RETURN
```

If supplier later compensates/replaces:

```text
Supplier Recovery
```

is a separate event.

## Invariant

> Supplier recovery never deletes the original Return Loss event.

---

# GAP-015 — Stock Opname While POS Continues Selling

## Status

```text
RESOLVED
```

## Final Rule

POS tetap boleh menjual selama Stock Opname.

Tidak ada global inventory freeze.

Use:

```text
Per-Item Count Snapshot
```

For each counted item:

```text
physical_qty
system_qty_at_count
counted_at
```

Variance:

```text
variance_qty
=
physical_qty
-
system_qty_at_count
```

Subsequent movements continue normally.

Example:

```text
10:00
System Qty = 100
Physical Qty = 95
Variance = -5

10:05
Sale = -10

Current System Qty = 90

Post Opname Variance -5
→ Final Qty = 85
```

This represents:

```text
95 physical at count time
-10 later sale
=85
```

## Invariant

> Opname variance is relative to the item count snapshot, not an arbitrary later current balance.

---

# GAP-016 — Receiving While Opname Open

## Status

```text
RESOLVED
```

## Final Rule

Receiving tetap diperbolehkan selama Stock Opname.

A `PURCHASE_RECEIPT` after confirmed count snapshot does not alter that snapshot’s variance.

If movement occurs while Product is currently being counted but count not yet confirmed:

```text
RECOUNT_RECOMMENDED
```

is generated for that Product line.

## Invariant

> Retail operations do not stop for receiving, but count integrity must remain explicit.

---

# GAP-017 — Global Price Effective Time & Device Clock

## Status

```text
RESOLVED
```

## Final Authority

```text
Cloud / Server Time
```

Business configuration stores:

```text
Business Timezone
```

Internal timestamps should be stored consistently, preferably UTC.

Offline device keeps trusted-time metadata such as:

```text
last_server_time
clock_offset
clock_trust_status
```

If scheduled price is cached and clock is trusted:

```text
activate locally at effective time
```

If device clock is materially unreliable:

```text
CLOCK_UNTRUSTED
```

Client must not guess scheduled activation.

Fallback:

```text
Use Last-Known Active Price
+
Create Review Warning
```

## Invariant

> Wrong device clock must never silently publish a future or expired price.

---

# GAP-018 — Sale Completion with Missing Cost

## Status

```text
RESOLVED
```

## Final Rule

Sale is **not blocked** only because cost is missing.

But:

```text
cost = 0
```

must never be silently assigned to an economic inventory item.

Fallback order:

```text
1. Current Valid MWA
2. Last Valid MWA
3. Latest Valid Landed / Replacement Cost
4. Initial / Manual Valid Cost
```

If none exists:

```text
cost_snapshot = NULL
cost_status   = COST_PENDING
```

and create:

```text
COST_MISSING_EXCEPTION
```

When valid cost becomes available:

```text
COGS_RECONCILIATION
```

is created.

## Invariant

> POS availability takes precedence over perfect costing completeness, but financial uncertainty must remain visible and reconcilable.

---

# GAP-019 — Refund Pending but Return Physically Completed

## Status

```text
RESOLVED
```

## Final State Separation

```text
Return Status:
COMPLETED

Refund Status:
PENDING
```

User-facing composite state may display:

```text
BARANG SUDAH DITERIMA
PENGEMBALIAN DANA SEDANG DIPROSES
```

Optional derived presentation:

```text
RETURNED_REFUND_PENDING
```

But no single database status may replace the independent Return and Refund states.

Back Office must expose:

```text
Outstanding Refund Queue
```

with:

```text
PENDING
FAILED
REQUIRES_ACTION
```

## Invariant

> Physical return completion and monetary settlement are independent facts.

---

# GAP-020 — High-Risk Exception Escalation

## Status

```text
RESOLVED
```

## Final Severity Model

```text
INFO
WARNING
REVIEW_REQUIRED
CRITICAL
```

Meaning:

### INFO

```text
Informational only.
No action required.
```

### WARNING

```text
Condition is not ideal.
Human review recommended.
```

### REVIEW_REQUIRED

```text
Business event remains valid,
but explicit human review is required.
```

### CRITICAL

```text
High integrity/security/operational risk.
Immediate action required and sensitive workflows
may be blocked depending on rule.
```

Exception lifecycle is separate:

```text
OPEN
ACKNOWLEDGED
RESOLVED
DISMISSED
```

Examples:

```text
Negative Stock
→ WARNING

Large Cash Variance
→ REVIEW_REQUIRED

Duplicate Invoice Suspected
→ REVIEW_REQUIRED

Permission / Integrity Failure
→ CRITICAL
```

## Invariant

> Severity answers “how serious is this?” while lifecycle answers “what has happened to the review process?”

---

# 2. Cross-Domain Resolved Policy Matrix

| Gap | Final Decision |
|---|---|
| GAP-001 | Void = full operational cancellation during original open shift; Return = post-sale item return |
| GAP-002 | Payment correction by Admin/Owner; post-close correction Owner + reconciliation |
| GAP-003 | Line + Transaction discount both supported |
| GAP-004 | Single best Promotion per line with deterministic priority |
| GAP-005 | No-receipt default = Exchange Only |
| GAP-006 | Default return window = 7 calendar days, configurable |
| GAP-007 | Price Draft offline allowed; Activate/Publish online-required |
| GAP-008 | Receiving offline allowed; final Purchase POSTED requires authoritative sync |
| GAP-009 | Split Payment is part of v2 UI |
| GAP-010 | Device, Terminal, Cash Drawer are distinct concepts |
| GAP-011 | Customer domain is lightweight and optional |
| GAP-012 | Base Unit locks after first Stock Movement |
| GAP-013 | Product deactivation cancels future pricing/promotion schedules |
| GAP-014 | Non-restocked return = RETURN_LOSS with subcategory |
| GAP-015 | POS continues during Opname using per-item count snapshot |
| GAP-016 | Receiving continues during Opname; recount warning if count in progress |
| GAP-017 | Server time authoritative; untrusted device clock cannot activate scheduled price |
| GAP-018 | Missing cost does not block Sale; use COST_PENDING + reconciliation |
| GAP-019 | Return and Refund statuses remain independent |
| GAP-020 | Exception severity = INFO / WARNING / REVIEW_REQUIRED / CRITICAL |

---

# 3. Business Foundation Freeze Criteria

With GAP-001 through GAP-020 resolved, the Business Rules Foundation is considered sufficiently closed for architecture work if:

```text
[✓] Domain 01–10 rules defined
[✓] Cross-Domain authority mapped
[✓] Business event effects mapped
[✓] Reversal/correction patterns defined
[✓] Offline authority defined
[✓] Sync/idempotency principles defined
[✓] High-risk permissions defined
[✓] Return/Void/Refund boundaries defined
[✓] Opname concurrency defined
[✓] Pricing publication authority defined
[✓] Missing-cost behavior defined
[✓] Exception severity defined
```

---

# 4. Frozen Cross-Domain Invariants

1. Completed business facts are never rewritten to hide history.
2. Physical reality events remain preserved even if later reconciliation is required.
3. Shared global pricing is only authoritative after publication through the authoritative pricing service.
4. Inventory operations remain available during normal retail activity; correctness is maintained through event timing/snapshots, not store-wide freezes.
5. POS may continue selling when cost is incomplete, but cost uncertainty must never masquerade as zero cost.
6. Returns, refunds, payment corrections, and voids are separate business events with separate authority and audit.
7. Offline capability must never create duplicate canonical truth.
8. Exception severity and exception lifecycle are separate concepts.
9. Owner overrides remain explicit and auditable.
10. Historical transaction, inventory, cost, pricing, cash, return, and audit records retain their original meaning after future policy/master changes.

---

# 5. Recommended Next Phase

The Business Rules Foundation can now be treated as:

```text
BUSINESS FOUNDATION v1
→ FROZEN FOR PRODUCT / ARCHITECTURE DESIGN
```

Next sequence:

```text
Business Rules Domain 01–10
        ↓
Cross-Domain Matrix
        ↓
Cross-Domain Gap Resolution v1
        ↓
USER JOURNEYS / OPERATIONAL FLOWS
        ↓
Information Architecture
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
Legacy Code KEEP / ADAPT / REPLACE / REMOVE
        ↓
Implementation Roadmap
```

---

# Final Resolution Statement

> **All known material cross-domain gaps identified after Domain 01–10 have been resolved for Business Foundation v1. These decisions are authoritative for subsequent User Journey, Information Architecture, System Architecture, Database, API/Sync, and implementation planning unless a later explicit Architecture Decision Record supersedes a rule through an approved product decision.**
