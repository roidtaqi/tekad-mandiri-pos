# Kastur Retail System — Implementation Roadmap v1

**Status:** Approved Planning Baseline  
**Target:** New repository `kastur-retail-system`  
**Build Strategy:** Vertical Slices + Incremental Production Readiness  
**Depends on:** Business Foundation v1, User Journeys v1, Information Architecture v1, System Architecture v1, Database Schema v1, API & Sync Contract v1, Design System v1, Screen / UX Specifications v1, Legacy Code Audit v1  
**Purpose:** Memecah Kastur V2 menjadi urutan implementasi yang aman, dapat diuji, dan dapat diserahkan ke Codex tanpa membawa arsitektur legacy yang salah.

---

# 1. Core Implementation Principle

Kastur V2 is:

```text
NEW REPOSITORY
+
NEW ARCHITECTURE
+
SELECTIVE LEGACY PORTING
```

Not:

```text
incrementally patch both old repositories until they become V2
```

Target repository:

```text
kastur-retail-system/
├── apps/
│   ├── backoffice/
│   ├── pos/
│   └── api/
├── packages/
│   ├── domain/
│   ├── contracts/
│   ├── local-db/
│   ├── sync-client/
│   ├── auth-client/
│   ├── ui/
│   ├── config/
│   ├── observability/
│   └── testing/
├── database/
├── docs/
└── AGENTS.md
```

---

# 2. Delivery Strategy

Use:

```text
VERTICAL SLICES
```

Each slice should ideally include:

```text
Domain rule
Database
API/Command
Local persistence
Sync
UI
Tests
Audit
Permissions
```

Avoid:

```text
build all database tables first
then all API
then all frontend
```

because that delays real end-to-end validation.

---

# 3. Milestone Overview

```text
M0  Repository & Engineering Foundation
M1  Identity + Business + Catalog Spine
M2  POS Core Offline Sale
M3  Sync Platform v1
M4  Shift + Cash Control
M5  Purchasing + Receiving
M6  Costing + Inventory Valuation
M7  Pricing Governance
M8  Inventory Operations + Opname
M9  Return + Refund
M10 Back Office Operational Shell
M11 Reports + Attention + Operational Controls
M12 Migration Tooling
M13 Security / Reliability Hardening
M14 Staging Reconciliation
M15 Pilot
M16 Production Cutover
```

---

# 4. M0 — Repository & Engineering Foundation

## Goal

Create the V2 foundation without business feature scope creep.

## Deliverables

```text
New GitHub repository
npm workspaces
apps/backoffice
apps/pos
apps/api

packages/domain
packages/contracts
packages/local-db
packages/sync-client
packages/ui
packages/config
packages/testing

database/migrations
docs/
AGENTS.md placeholder
```

## Tooling

```text
React 19
TypeScript
Vite
Dexie
PostgreSQL
Cloudflare Worker-class API
npm workspaces
```

## CI

Minimum:

```text
install
typecheck
lint
unit tests
build backoffice
build pos
build api
```

## Definition of Done

```text
[ ] Clean clone builds all workspaces
[ ] CI runs on PR
[ ] Shared TypeScript config established
[ ] Environment configuration documented
[ ] No production secrets in frontend
[ ] Architecture docs committed
```

---

# 5. M1 — Identity + Business + Catalog Spine

## Goal

Establish shared canonical business context.

## Domains

```text
D01
D08
D10 partial
```

## Backend

Implement:

```text
core.businesses
core.locations
core.terminals

identity.users
identity.business_memberships
identity.roles
identity.permissions
identity.role_permissions
identity.membership_roles
identity.permission_overrides
identity.devices
identity.sessions

catalog.categories
catalog.brands
catalog.products
catalog.product_units
catalog.barcodes
catalog.suppliers
catalog.product_suppliers
```

## Required Commands

```text
catalog.product.create
catalog.product.update
catalog.product_unit.create
catalog.barcode.create
identity user/role management basics
```

## Required Queries

```text
Auth Context
Product List
Product Detail
Barcode Lookup
```

## Back Office

Screens:

```text
Global Shell
Product List
Add Product
Product Detail
Unit & Barcode
User & Access minimal
```

## POS

Local cache:

```text
products
units
barcodes
authorization snapshot
business settings
terminal context
```

## Legacy Port

ADAPT:

```text
Product/Product Unit concepts
barcode lookup
camera scanner fallback
```

REPLACE:

```text
legacy ProductUnit price/cost authority
legacy auth stores
```

## Definition of Done

```text
[ ] Owner/Admin can create Product
[ ] Units and barcodes work
[ ] Duplicate SKU/barcode protected
[ ] Cashier can bootstrap/read Product cache
[ ] Role/Permission boundary enforced server-side
```

---

# 6. M2 — POS Core Offline Sale

## Goal

Create first true operational vertical slice.

## Scope

```text
Open Shift
Scan/Search Product
Cart
Cash Payment
Complete Sale
Receipt
Local Stock Movement
Local Outbox
```

## Shared Domain Logic

Implement:

```text
Money/Decimal abstraction
Unit conversion
Basic published-price resolver
Transaction totals
Cash settlement
```

## Local POS

Dexie:

```text
transactions
transactionItems
payments
stockMovements
localStockBalances
shifts
cashMovements
outbox
```

## POS UI

Screens:

```text
POS Shell
Sell
Product Search
Cart
Cash Payment
Complete Result
Receipt
```

## Critical Behavior

```text
barcode exact → auto-add
repeat scan → +1
no success modal
offline cash sale works
receipt failure does not rollback sale
```

## Legacy Port

ADAPT:

```text
transactionService Dexie atomic transaction pattern
receipt printing
PWA basics
```

## Definition of Done

```text
[ ] Cash sale completes with network disconnected
[ ] Transaction + items + payment + stock + outbox commit atomically
[ ] Browser restart does not lose completed sale
[ ] Scanner flow meets UX spec
[ ] Receipt generated from transaction snapshot
```

---

# 7. M3 — Sync Platform v1

## Goal

Replace legacy snapshot synchronization with safe incremental sync.

## Backend

Implement:

```text
sync.idempotency_records
sync.change_feed
sync.device_sync_states
sync.conflicts
```

Endpoints:

```text
GET  /sync/bootstrap
POST /sync/push
GET  /sync/pull
POST /sync/ack
```

## Client

Implement:

```text
persistent outbox
retry/backoff
cursor
bootstrap
incremental apply
connectivity status
```

## Critical Tests

```text
same sale pushed twice → one sale
timeout after server commit → retry safe
device restart with pending outbox
pull pagination
cursor atomic apply
rebootstrap preserves outbox
```

## WebSocket

Optional after HTTP correctness:

```text
SYNC_AVAILABLE
PRICE_PUBLISHED
PERMISSION_CHANGED
DEVICE_REVOKED
```

## Explicitly Forbidden

```text
full table snapshot overwrite
clear() + bulk restore
generic CREATE/UPDATE/DELETE protocol
VITE_SYNC_API_TOKEN
```

## Definition of Done

```text
[ ] Offline sale syncs exactly once
[ ] Incremental changes reach another device
[ ] No snapshot overwrite path exists
[ ] Sync status separated from business status
```

---

# 8. M4 — Shift + Cash Control

## Goal

Complete cashier accountability boundary.

## Implement

```text
cash.shifts
cash.cash_movements
cash.shift_closing_snapshots
cash.shift_reconciliations
```

## POS

```text
Open Shift
Active Shift
Cash In
Cash Out
Safe Drop
Blind Close Shift
Quick Lock
```

## Rules

```text
Expected Cash derived from ledger
Actual Cash entered blind
Variance shown after count submission
Closed snapshot immutable
late event → reconciliation exception
```

## Legacy Port

ADAPT:

```text
shiftService calculation concepts
cash/noncash aggregation
```

## Definition of Done

```text
[ ] Cashier cannot complete normal sale without active shift
[ ] Blind count works
[ ] Cash variance produces explicit result
[ ] Closed shift not rewritten
[ ] Quick Lock does not destroy session/shift
```

---

# 9. M5 — Purchasing + Receiving

## Goal

Create Back Office operational purchasing spine.

## Implement

```text
purchases
purchase_items
agreement snapshots
receipts
receipt_items
purchase_invoices
invoice_items
purchase_charges
purchase_payments
supplier_returns
supplier_return_items
```

## Back Office Screens

```text
Purchase List
Create Purchase
Purchase Detail
Receive Goods
Invoice/Cost
Integrity
Supplier List/Detail
Supplier Return
```

## Offline

Support:

```text
Purchase Draft
Receiving
Invoice capture
```

Final:

```text
POSTED
→ online authoritative
```

## Critical Controls

```text
Agreed vs Invoice vs Received vs Accepted
Bonus/free goods
partial receiving
duplicate invoice warning
integrity status
```

## Definition of Done

```text
[ ] Partial receipt works
[ ] Accepted qty creates inventory movement
[ ] Receiving works offline
[ ] Purchase Post requires authoritative validation
[ ] Original Posted purchase is immutable
```

---

# 10. M6 — Costing + Inventory Valuation

## Goal

Make purchasing economically correct.

## Implement

```text
costing.cost_events
costing.product_cost_states
costing.cogs_reconciliations
```

## Engines

```text
Landed Cost
MWA
Pricing Reference Cost
Negative Stock COGS fallback
COGS Reconciliation
Customer Return Cost Reversal
Supplier Return Cost
```

## Legacy Port

ADAPT:

```text
TaxCalculatorService
InvoiceLineCalculatorService
UnitCostAllocationService
Cost History ideas
```

## Replace

```text
manual cost as normal authority
JavaScript number calculations
```

## Definition of Done

```text
[ ] Purchase receipt/post affects MWA correctly
[ ] Pricing reference cost source explicit
[ ] Cost history append-only
[ ] Missing cost does not become zero
[ ] COGS reconciliation works
```

---

# 11. M7 — Pricing Governance

## Goal

Implement full Pricing Decision Tool and governance.

## Implement

```text
margin_rules
price_sets
price_proposal_items
price_versions
price_tier_versions
promotions
pricing_review_items
```

## Shared Engine

Port/adapt:

```text
PricingCalculatorService
RoundingService
TaxCalculatorService
MarginRuleResolver concept
```

v2 rules:

```text
Business → Category → Product Unit margin hierarchy
Floor Price
Target Margin
Retail/Wholesale tiers
Promotion resolver
Owner override
effective dates
```

## Back Office Screens

```text
Pricing Overview
Pricing Review
Proposal List/Detail
Calculator
Promotion
Price History
Product Pricing Context
```

## Online Authority

```text
Publish / Activate Price
→ online required
```

## POS

Bootstrap/pull published:

```text
Price Versions
Tiers
Promotions
```

## Definition of Done

```text
[ ] Admin proposes
[ ] Owner approves
[ ] Owner direct change audited
[ ] Below-floor override explicit
[ ] Scheduled price works
[ ] POS price resolution deterministic offline
```

---

# 12. M8 — Inventory Operations + Opname

## Goal

Complete inventory control outside normal sale/purchase.

## Implement

```text
stock adjustments
opname sessions
opname items
attention signals
```

## Back Office

```text
Inventory Position
Stock Movements
Stock Adjustment
Opname List
Opname Detail
```

## Critical Rules

```text
stock is movement-ledger derived
negative stock preserved
manual adjustment requires reason
POS remains open during opname
receiving remains open during opname
count snapshot protects variance
```

## Definition of Done

```text
[ ] No direct arbitrary stock edit
[ ] Movement source traceability complete
[ ] Opname can overlap Sales/Receiving
[ ] Recount warning works
```

---

# 13. M9 — Return + Refund

## Goal

Implement post-sale correction/customer lifecycle.

## Implement

```text
customer_returns
return_items
refunds
return loss classification
```

## POS

```text
Return Search
Return Builder
Refund
Return Result
No-Receipt Return controlled
```

## Back Office

```text
Return List
Refund Queue
Transaction Return context
```

## Rules

```text
Return ≠ Void
partial/full
RESTOCK vs NOT_RESTOCKED
original cost snapshot
historical paid amount
refund status independent
no-receipt default exchange only
```

## Definition of Done

```text
[ ] Over-return blocked
[ ] Restock stock effect correct
[ ] Non-restocked return loss recorded
[ ] Pending refund remains visible
[ ] Original sale unchanged
```

---

# 14. M10 — Back Office Operational Shell

## Goal

Complete task-first IA around already-working domains.

## Build

```text
Ringkasan
Perlu Ditinjau
Products
Purchasing
Inventory
Pricing
Sales
Reports
Settings
```

## Design System

Implement:

```text
tokens
Button
Input
Table
Badge
Alert
Dialog
Drawer
RecordHeader
FilterBar
Sidebar
Breadcrumb
Responsive patterns
```

## Note

Basic shell/components should exist earlier as needed, but M10 is where system-wide consistency is completed.

## Definition of Done

```text
[ ] All P0 user journeys have final navigation home
[ ] Browser Back predictable
[ ] Search/filter state preserved
[ ] Responsive tablet/mobile behavior matches specs
```

---

# 15. M11 — Reports + Attention + Operational Controls

## Goal

Provide Owner supervisory workflow.

## Implement Read Models

```text
inventory position
product commercial summary
purchase summary
pricing health
transaction summary
shift summary
supplier performance
attention queue
```

## Reports

```text
Sales
Margin
Inventory
Purchasing
Shift & Cash
Returns
```

## Attention

Sources:

```text
Purchase Integrity
Cost/Pricing
Negative Stock
Large Adjustment
Cash Variance
Return/Refund
Sync
Authorization
```

## Definition of Done

```text
[ ] Owner can supervise by exception
[ ] No need to approve routine Purchase
[ ] Report completeness indicates offline-device risk
```

---

# 16. M12 — Migration Tooling

## Goal

Safely migrate existing real data.

## Sources

```text
inventory-pricing-app
integrated-pos-app
CSV/XLSX opening catalog
legacy cloud data
legacy local exports/backups
```

## Build

```text
legacy export readers
transformers
legacy_id_map
deduplication report
validation report
dry-run importer
staging importer
reconciliation report
```

## Product Matching Priority

```text
Barcode
SKU
Known source relation
Name + unit context
Manual review
```

## Opening Data

Use:

```text
INITIAL_STOCK
INITIAL_COST
OPENING_PRICE
```

not fake Purchases.

## Credentials

Do not migrate plaintext PIN.

Users enroll/reset secure credentials.

## Definition of Done

```text
[ ] Import is repeatable in dry-run
[ ] Ambiguous Product merges surfaced
[ ] Opening stock/value reconciled
[ ] Legacy IDs traceable
[ ] No credential secret imported
```

---

# 17. M13 — Security / Reliability Hardening

## Goal

Make system production-safe.

## Security

```text
session lifecycle
device revoke
permission redaction
rate limiting
secret management
offline unlock security
audit integrity
CSP/security headers
```

## Reliability

```text
database backups
migration testing
outbox crash recovery
schema compatibility
rebootstrap
clock trust
client update enforcement
```

## Performance

```text
barcode lookup
POS startup
large Product list
Transaction history pagination
Stock movement indexes
Pricing lookup
```

## Definition of Done

```text
[ ] Threat-model review complete
[ ] No plaintext credentials
[ ] No privileged frontend token
[ ] Backup/recovery tested
[ ] Critical offline flows tested
[ ] Failed sync recovery tested
```

---

# 18. M14 — Staging Reconciliation

## Goal

Prove real business data and workflows before pilot.

## Activities

```text
import representative real catalog
import opening stock/cost/price
run purchasing scenario
run sale scenario
run shift
run refund
run pricing change
run stock opname
offline/reconnect test
```

## Reconcile

```text
Product count
Barcode uniqueness
Stock quantity
Inventory value
Active prices
User roles
Opening cash
Sales math
COGS
Margin
```

## Exit Gate

No unresolved:

```text
Critical data mismatch
Security blocker
Duplicate sync effect
Loss of offline transaction
Pricing mismatch
```

---

# 19. M15 — Pilot

## Goal

Run V2 in a controlled real operational environment.

Recommended:

```text
one primary POS terminal/device
small number of trained users
real catalog
real transactions
real shifts
```

## Pilot Monitoring

```text
scanner speed
checkout friction
sync delays
stock anomalies
cash variance workflow
receipt printing
user confusion
error frequency
offline recovery
```

## Legacy During Pilot

Preferred:

```text
legacy remains available as reference
but avoid dual entry where possible
```

If true parallel run is needed:

```text
define one canonical system for each business event
```

Never let both independently mutate the same canonical truth.

---

# 20. M16 — Production Cutover

## Pre-Cutover

```text
freeze legacy mutable operations
export final data
perform final transform
import opening/current state
reconcile
verify users
verify devices
verify prices
verify stock
```

## Cutover

```text
V2 becomes canonical
legacy apps become read-only/archive
```

## After Cutover

Monitor:

```text
sync
stock
cash
returns
pricing
database
errors
```

Keep rollback/runbook for infrastructure failure, but do not casually restore legacy as simultaneous canonical writer.

---

# 21. Suggested Epic Structure

```text
EPIC-00 Foundation
EPIC-01 Identity
EPIC-02 Catalog
EPIC-03 POS Core
EPIC-04 Sync
EPIC-05 Shift/Cash
EPIC-06 Purchasing
EPIC-07 Costing
EPIC-08 Pricing
EPIC-09 Inventory
EPIC-10 Return/Refund
EPIC-11 Back Office UX
EPIC-12 Reports/Attention
EPIC-13 Migration
EPIC-14 Security/Hardening
EPIC-15 Pilot/Cutover
```

---

# 22. Recommended First Vertical Slice

First end-to-end proof:

```text
Business
↓
Owner/Cashier
↓
Product + Product Unit + Barcode
↓
Published Retail Price
↓
POS Bootstrap
↓
Open Shift
↓
Scan Product
↓
Cash Payment
↓
Complete Sale Offline
↓
Local Stock Movement
↓
Receipt
↓
Outbox
↓
Sync Push
↓
PostgreSQL Transaction
↓
Sync Pull
↓
Back Office Transaction Visibility
```

This is the operational spine.

Do not start with Dashboard or Reports.

---

# 23. Definition of Done — Feature

Every feature is done only if relevant items pass:

```text
[ ] Business rule implemented
[ ] Permission checked client UX + server
[ ] Database migration exists
[ ] API contract respected
[ ] Local offline behavior implemented if required
[ ] Sync/idempotency tested
[ ] Audit created
[ ] Exception behavior implemented
[ ] Loading/empty/error states implemented
[ ] Responsive behavior implemented
[ ] Unit tests
[ ] Integration tests
[ ] E2E where critical
[ ] Documentation updated
```

---

# 24. Pull Request Scope Rule

Preferred PR:

```text
one coherent vertical change
```

Avoid:

```text
huge cross-system PR with unrelated domains
```

Examples:

Good:

```text
Implement Product Unit creation end-to-end
Implement Open Shift local + API + tests
Implement Sync idempotent CompleteSale
```

Bad:

```text
Implement entire POS
Implement all database models
Refactor every component
```

---

# 25. Codex Task Size

Codex tasks should be narrow enough to verify.

Recommended task unit:

```text
one command
one read model
one screen/subflow
one migration group
one test package
```

Each task must reference authoritative docs.

---

# 26. Implementation Dependency Graph

```text
M0 Foundation
↓
M1 Identity/Catalog
↓
M2 POS Core
↓
M3 Sync
↓
M4 Shift/Cash
├───────────────┐
↓               ↓
M5 Purchasing   M10 UI Shell incremental
↓
M6 Costing
↓
M7 Pricing
↓
M8 Inventory
↓
M9 Returns
↓
M11 Reports/Attention
↓
M12 Migration
↓
M13 Hardening
↓
M14 Staging
↓
M15 Pilot
↓
M16 Cutover
```

Some UI work happens continuously, but business dependencies remain.

---

# 27. Testing Gates

## Gate A — Foundation

```text
CI green
type safety
migration baseline
```

## Gate B — POS Spine

```text
offline cash sale
scanner
local crash recovery
```

## Gate C — Sync Safety

```text
idempotency
duplicate retry
cursor
multi-device
```

## Gate D — Financial Correctness

```text
MWA
landed cost
pricing
cash
return COGS
```

## Gate E — Migration

```text
counts
stock
cost
price
identity mapping
```

## Gate F — Production

```text
security
backup
observability
pilot acceptance
```

---

# 28. Critical Test Matrix

Must never regress:

```text
Offline sale survives refresh
Same command never applies twice
Negative stock not clamped
Cash expected derived correctly
Blind shift count
Price tier deterministic
Promotion deterministic
Floor enforcement
Purchase partial receiving
MWA correctness
Missing cost → COST_PENDING, not zero
Return qty cannot exceed sold qty
Return disposition drives stock
Refund may remain pending
Closed shift never rewritten
Permission revoked behavior
Rebootstrap preserves outbox
```

---

# 29. Migration Freeze Rule

Once final production migration begins:

```text
legacy business data mutation must be controlled/frozen
```

Otherwise:

```text
data export
→ migration
→ real-world changes in old app
→ mismatch
```

A final delta strategy may be used if required, but must be explicit.

---

# 30. Feature Flags

Use sparingly for:

```text
pilot-only capabilities
provider payment integration
new domain rollout
```

Do not use feature flags to maintain two conflicting business models indefinitely.

---

# 31. Observability Before Pilot

Required:

```text
request logs
error tracking adapter
sync health
device last sync
oldest pending event
exception queue
database health
```

Operational support without observability is not acceptable.

---

# 32. Training Assets Before Pilot

Prepare concise operational guides for:

```text
Cashier:
Open Shift
Sale
Split Payment
Return
Close Shift
Offline indicator

Admin:
Product
Purchase
Receiving
Stock
Pricing Proposal

Owner:
Attention
Pricing Approval
Cash Variance
Reports
User Access
```

---

# 33. Rollback Philosophy

Infrastructure rollback:

```text
supported
```

Business-data rollback by deleting completed events:

```text
not supported
```

If a business event is wrong:

```text
correction / reversal
```

not database rollback.

---

# 34. Deferred Decisions Before Pilot/Cutover

These require user decisions later:

## CUT-001 — Cutover Mode

Options:

```text
A. Big-bang
B. Staged
```

Recommended default:

```text
staged pilot
→ controlled final cutover
```

## CUT-002 — Pilot Device

Need to select:

```text
actual primary cashier PC/terminal
```

and fallback tablet/phone test device.

## CUT-003 — Production Hosting / Domain

Need final lock for:

```text
application domain
Cloudflare project/account
production PostgreSQL project
backup policy
```

These decisions do not block implementation now.

---

# 35. Recommended Next Documentation Step

After Implementation Roadmap:

```text
AGENTS.md
+
CODEX HANDOFF PACKAGE
```

Before Codex executes implementation, AGENTS.md should encode:

```text
Architecture invariants
Repository structure
Business boundaries
Commands/tests
KEEP/ADAPT/REPLACE rules
Do-not-port legacy rules
Documentation hierarchy
Definition of Done
```

Codex should then implement milestone-by-milestone, not receive one uncontrolled “build everything” prompt.

---

# 36. Roadmap Status

```text
Product Foundation          LOCKED
Business Rules              LOCKED
Cross-Domain Rules          LOCKED
User Journeys               LOCKED
Information Architecture    LOCKED
System Architecture         LOCKED
Database Schema             LOCKED
API / Sync Contract         LOCKED
Design System               LOCKED
Screen Specifications       LOCKED
Legacy Audit                COMPLETE
Implementation Roadmap      COMPLETE
```

Remaining pre-implementation package:

```text
AGENTS.md
Codex Handoff
```

Then implementation can begin.

---

# Final Roadmap Principle

> **Build Kastur V2 as a sequence of working operational slices, not as a collection of disconnected technical layers. The earliest milestone must prove the complete path from Product → POS → Offline Sale → Stock/Cash → Sync → Cloud. Every later domain extends that operational spine while preserving the business, audit, security, and synchronization invariants already locked in the V2 foundation.**
