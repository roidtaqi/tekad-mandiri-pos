# Kastur Retail System — Product Foundation v1

**Status:** FROZEN  
**Purpose:** Ringkasan product-level source of truth untuk Kastur Retail System v2 sebelum implementation.

---

# 1. Product Definition

Kastur adalah satu retail operating system dengan dua workspace teknis:

```text
Kastur Back Office
Kastur POS
```

Keduanya berbagi:

```text
Identity
Business Context
Permissions
Catalog
Pricing
Inventory
Audit
Cloud Platform
Sync
```

User tidak perlu memahami aplikasi mana yang secara teknis menyimpan/menampilkan data.

---

# 2. Primary Roles

v2 hanya memiliki role preset:

```text
OWNER
ADMIN
CASHIER
```

Meaning:

```text
Owner   = Controller
Admin   = Back Office Operator + Purchasing
Cashier = Sales Operator
```

Role adalah preset/job context. Permission adalah authority sebenarnya.

---

# 3. Business Target

```text
Retail-first
Wholesale-capable
Single-store UX today
Multi-location-ready core
Offline-first POS
```

One Product may have multiple sell/purchase units and quantity-based pricing tiers.

---

# 4. Canonical Domain Ownership

Back Office/shared platform owns canonical:

```text
Catalog
Purchasing
Cost
Pricing Governance
```

POS owns operational execution records:

```text
Sale
Payment
Shift
Cash
Receipt interaction
```

Shared domains:

```text
Inventory movement ledger
Identity/Permissions
Audit
Sync
```

Cloud PostgreSQL adalah canonical shared persistence platform; local clients remain operationally authoritative only for valid locally completed offline-safe events until synchronized.

---

# 5. Economic Model

Inventory valuation:

```text
Moving Weighted Average (MWA)
```

Pricing reference:

```text
Latest Valid Landed / Replacement Cost
```

Cost change:

```text
never automatically changes active selling price
```

It produces:

```text
pricing review / recommendation
```

---

# 6. Pricing Governance

```text
Admin proposes
Owner approves
Owner chooses effective time
```

Owner direct change:

```text
allowed
versioned
validated
audited
```

Price is never a silently overwritten current scalar.

It is effective-date/version based.

---

# 7. Inventory

Authoritative truth:

```text
Stock Movement Ledger
```

Projection:

```text
Stock Balance
```

Negative stock may be allowed with warnings/audit; do not clamp to zero.

---

# 8. Sales

Completed sale:

```text
immutable historical business event
```

Correction:

```text
Void / Return / Payment Correction
```

not generic edit.

Offline cash sale must work without network.

---

# 9. Shift & Cash

Shift is accountability boundary.

Expected Cash is derived from cash ledger events.

Closing uses:

```text
Blind Physical Count
→ reveal Expected
→ show Variance
```

Closed shift snapshot is immutable.

---

# 10. Returns

```text
Return ≠ Void
Return ≠ Refund
```

Return handles merchandise.

Refund handles monetary settlement.

Physical disposition:

```text
RESTOCK
NOT_RESTOCKED
```

Refund may remain Pending after Return is Completed.

---

# 11. Offline / Sync

v2 uses:

```text
Local Atomic Commit
→ Durable Outbox
→ Idempotent Push
→ PostgreSQL Transaction
→ Incremental Change Feed
→ Cursor Pull
```

Do not use whole-database snapshot overwrite as canonical sync.

---

# 12. Product Experience

Back Office:

```text
Desktop-first responsive
Task-first
Operational/data-dense
```

POS:

```text
PC + mouse/keyboard + hardware barcode scanner first
Tablet/mobile touch-safe
```

Visual:

```text
Modern Operational Retail
Light-first
Dark-ready
Brand-neutral
```

Language:

```text
Bahasa Indonesia UI
English internal code
i18n-ready
```

---

# 13. POS Interaction Baseline

```text
Exact barcode → auto-add
Repeated scan → +1
Unknown barcode → lightweight feedback
Product discovery → search-first compact
Desktop split → approx 60% product / 40% cart
Customer → optional
Payment order → Cash, QRIS, Transfer, Other
Receipt → 80 mm primary, 58 mm compatible
Quick Lock → required
```

---

# 14. Technical Architecture

```text
New monorepo
React + TypeScript + Vite
Dexie local-first
PostgreSQL cloud
Modular monolith API
Cloudflare Worker-class preferred deployment
```

Two frontend apps:

```text
apps/backoffice
apps/pos
```

One shared platform/API.

---

# 15. Legacy Strategy

V2 is a rebuild in a new repository.

Legacy repositories are:

```text
reference
code mining source
migration source
```

Not the v2 repository.

Port only assets classified `KEEP` or `ADAPT`.

---

# 16. Implementation Strategy

Use vertical slices.

First operational proof:

```text
Business
→ Identity
→ Product/Unit/Barcode
→ Published Price
→ POS Bootstrap
→ Open Shift
→ Scan
→ Cash Sale Offline
→ Stock
→ Receipt
→ Outbox
→ Sync
→ PostgreSQL
→ Back Office visibility
```

---

# 17. Frozen State

The following are considered implementation inputs:

```text
Business Rules D01–D10
Cross-Domain Matrix
Gap Resolution v1
User Journeys v1
Information Architecture v1
System Architecture v1
Database Schema v1
API & Sync Contract v1
Design System v1
Screen / UX Specifications v1
Legacy Code Audit v1
Implementation Roadmap v1
```

If implementation reveals a genuine contradiction, do not silently change business semantics. Create an ADR/decision proposal and update authoritative docs.
