# Kastur Retail System — Legacy Code Audit v1

**Status:** Architecture-Grade Migration Audit  
**Repositories Audited:**
- `roidtaqi/inventory-pricing-app`
- `roidtaqi/integrated-pos-app`

**Classification:** `KEEP / ADAPT / REPLACE / REMOVE`  
**Target:** Kastur Retail System v2 monorepo  
**Depends on:** Business Foundation v1, System Architecture v1, Database & Domain Schema v1, API & Sync Contract v1, Design System v1, Screen / UX Specifications v1

---

# 1. Audit Objective

This audit answers:

```text
What should be reused?
What should be adapted?
What must be replaced?
What should be removed?
What data is worth migrating?
What architecture assumptions must not survive into v2?
```

Core rule:

> Legacy code is evidence and reusable implementation knowledge, not the architectural authority for Kastur v2.

---

# 2. Audit Scope

This is an architecture-grade targeted audit based on:

```text
repository manifests
source directory structure
page/module inventory
database schemas
core business services
pricing logic
transaction checkout logic
shift/cash logic
sync implementation
navigation structure
PWA/deployment configuration
```

It is sufficient for migration and implementation planning.

A later implementation PR may still discover file-level details that require reclassification.

---

# 3. Classification Definitions

## KEEP

```text
Concept and implementation are sufficiently aligned.
Move with limited cleanup/tests.
```

## ADAPT

```text
Useful implementation or domain logic exists,
but interfaces, precision, structure, or business rules
must change before v2 use.
```

## REPLACE

```text
Concept may remain,
but current implementation conflicts materially
with v2 architecture/business invariants.
```

## REMOVE

```text
Legacy feature/pattern should not migrate into v2.
```

---

# 4. Executive Assessment

Overall:

```text
inventory-pricing-app
→ strong source for pricing knowledge and calculator logic
→ moderate source for catalog/import concepts
→ weak source for final v2 persistence/auth/sync architecture

integrated-pos-app
→ strong source for offline local-operation patterns
→ useful source for POS transaction/shift workflow implementation
→ moderate source for barcode/product/receipt/PWA patterns
→ weak source for canonical sync/data authority/security model
```

The biggest migration mistake would be:

```text
merging the two repositories into one folder
and keeping their current data ownership/sync model
```

The correct strategy is:

```text
new v2 monorepo
+
selective porting of proven logic
+
new canonical domain contracts
```

---

# 5. Shared Technology Stack

Both repositories already use:

```text
React
TypeScript
Vite
Dexie / IndexedDB
React Router
Lucide
```

POS additionally uses PWA tooling.

## Classification

```text
KEEP / STANDARDIZE
```

## Target

```text
apps/backoffice
apps/pos
packages/domain
packages/contracts
packages/local-db
packages/ui
```

No framework rewrite is justified.

---

# 6. `inventory-pricing-app` — High-Level Assessment

Current major source areas:

```text
src/pages
src/components
src/db
src/services
src/utils
```

Important legacy modules include:

```text
PricingCalculatorService
RoundingService
TaxCalculatorService
MarginRuleResolver
InvoiceLineCalculatorService
UnitCostAllocationService
ApprovalService
PriceHistoryService
ProductUnitCostHistoryService
CsvImportService
RealtimeSyncService
AuthService
```

This repository is the strongest legacy source for:

```text
D01 Catalog concepts
D03 Costing fragments
D04 Pricing
Import
```

---

# 7. Pricing Formula — `PricingCalculatorService`

Legacy formula:

```text
Recommended Price
=
Final Cost / (1 - Margin)
```

It also derives:

```text
Rounded Price
Estimated Profit
Actual Margin
Bounds Warning
```

## Classification

```text
ADAPT — HIGH VALUE
```

## Reuse

Preserve:

```text
margin-from-selling-price formula
profit derivation
actual margin derivation
input validation philosophy
calculator test cases
```

## Required v2 Changes

Legacy currently uses:

```text
JavaScript number
percentage 0–100
single nearest-thousand rounding
min/max price bounds
legacy pricingMode
```

v2 requires:

```text
decimal-safe arithmetic
margin fraction representation
Target Margin
Minimum Margin / Floor Price
multiple rounding modes
Product Unit hierarchy
Price Tier
Promotion separation
tax snapshots
current price comparison
```

## Target

Move conceptual logic into:

```text
packages/domain/pricing/
```

Do not port the class unchanged.

---

# 8. Rounding — `RoundingService`

Legacy implements:

```text
NEAREST_1000
```

correctly for current legacy policy.

## Classification

```text
ADAPT
```

## Preserve

```text
tested pure-function approach
```

## Expand

v2:

```text
NONE
NEAREST_100
UP_TO_100
NEAREST_500
UP_TO_500
NEAREST_1000
UP_TO_1000
```

Use decimal-safe implementation.

---

# 9. Tax Calculation — `TaxCalculatorService`

Legacy already distinguishes:

```text
NO_PPN
PPN_INCLUDED
PPN_EXCLUDED
```

## Classification

```text
ADAPT — HIGH VALUE
```

## Preserve

```text
tax-mode conceptual separation
included/excluded formulas
explicit output structure
```

## Replace

Legacy:

```text
Math.round()
JavaScript number
```

v2:

```text
decimal-safe precision
historical rate snapshots
tax policy separated from UI formatting
```

---

# 10. Margin Rule Resolver

Legacy hierarchy:

```text
Product
Brand
Supplier
Category
Store Default
```

v2 locked hierarchy:

```text
Product Unit
Category
Business Default
```

## Classification

```text
ADAPT CONCEPT / REWRITE RULE SET
```

## Preserve

```text
pure resolver pattern
effective-date logic concept
deterministic precedence concept
```

## Remove from v2 resolver

```text
Brand margin scope
Supplier margin scope
Product-only scope
```

unless separately re-approved later.

Target:

```text
Business Default
→ Category
→ Product Unit override
```

---

# 11. Invoice / Cost Allocation Logic

Legacy contains:

```text
InvoiceLineCalculatorService
UnitCostAllocationService
ProductUnitCostHistoryService
```

## Classification

```text
ADAPT
```

These are valuable sources for:

```text
discount calculation
tax handling
unit cost allocation
cost-history UX/domain knowledge
```

But v2 cost model is materially stronger:

```text
Purchase
Receipt
Invoice
Accepted Qty
Landed Cost
MWA
Pricing Reference Cost
Cost Events
COGS Reconciliation
```

Do not retain legacy manual cost as normal source of truth.

---

# 12. Price Approval

Legacy has:

```text
ApprovalService
ApprovalPage
PriceCalculation lifecycle
```

## Classification

```text
ADAPT
```

Useful concepts:

```text
draft
approval
scheduled effective date
history
```

v2 lifecycle and governance must replace legacy specifics:

```text
Admin proposes
Owner approves
Owner direct change is versioned
Price Set
per-Product-Unit proposal items
Floor override
selective batch approval
```

---

# 13. Price History

Legacy:

```text
PriceHistoryService
PriceHistory records
```

## Classification

```text
ADAPT
```

Preserve principle:

```text
historical price changes are retained
```

Replace storage model with:

```text
pricing.price_versions
pricing.price_tier_versions
audit
```

Do not use a mutable Product Unit active price as historical authority.

---

# 14. Legacy Pricing Modes

Current Product:

```text
AUTO_MARGIN
MANUAL_PRICE
LOCKED_PRICE
```

## Classification

```text
REMOVE AS CORE PRODUCT MODEL
```

Reason:

v2 governance is expressed through:

```text
Margin Policy
Proposal
Approval
Direct Owner Decision
Price Version
Floor Override
```

A generic Product pricing mode would create conflicting governance branches.

If a future locked-price feature is required, it should be a separate explicit policy.

---

# 15. Inventory Product Schema

Legacy Inventory Product includes:

```text
SKU
Name
Category
Brand
Supplier
Barcode
Pricing Mode
```

and Product Unit includes:

```text
Conversion
Manual Cost
Active Selling Price
Min/Max Price
```

## Classification

```text
ADAPT DATA / REPLACE SCHEMA
```

Useful:

```text
Product + Product Unit separation
SKU
Category
Brand
Supplier relation concepts
unit conversion
```

Must change:

```text
Barcode belongs Product Unit
Supplier becomes many-to-many
Base Unit explicit
track_inventory
Price removed as mutable Product Unit truth
Cost removed as ordinary Product Unit field
versioning/business scope
```

---

# 16. Inventory Pricing Dexie Schema

## Classification

```text
REPLACE SCHEMA
KEEP DEXIE TECHNOLOGY/PRACTICE
```

Why:

Current IndexedDB schema reflects old domain ownership and legacy IDs.

v2 needs purpose-specific local projections/drafts/outbox.

Do not run direct migrations from old Dexie schema into new app schema as permanent architecture.

Use export/transform/import.

---

# 17. CSV Import

Legacy contains:

```text
CsvImportService
ImportCsvPage
CsvImportBatch
CsvImportRow
```

## Classification

```text
ADAPT — HIGH VALUE
```

Preserve:

```text
stage
validate
row result
import report
```

v2 should expand mapping to:

```text
Product
Product Unit
Barcode
Category
Brand
Supplier relations
Opening Stock
Opening Cost
Opening Price
```

Do not let CSV columns dictate database schema.

---

# 18. Camera Barcode Scanner

Legacy Inventory has:

```text
CameraBarcodeScanner
```

POS dependencies also include ZXing.

## Classification

```text
KEEP CONCEPT / ADAPT COMPONENT
```

Primary v2 POS input is hardware keyboard-wedge scanner.

Camera scanning remains:

```text
useful tablet/mobile fallback
```

It should not drive primary desktop interaction.

---

# 19. Inventory Authentication

Legacy inventory DB contains copied:

```text
authUsers
authRoles
authPermissions
```

with POS-like role model.

## Classification

```text
REPLACE
```

v2:

```text
one shared cloud identity
Business Membership
Role preset
Permission authority
authorization_version
Device
Session
```

No duplicate auth truth per app.

---

# 20. Inventory Realtime Sync

Legacy:

```text
RealtimeSyncService
cloud snapshots
WebSocket
periodic cloud pull/push
```

## Classification

```text
REPLACE
```

Retain only operational lessons:

```text
offline awareness
device-level sync metadata
retry
connection indicator
WebSocket invalidation experience
```

Replace protocol with:

```text
Local Outbox
HTTP Sync Push
Server Idempotency
Incremental Change Feed
Cursor
Bootstrap
WebSocket notification only
```

---

# 21. Inventory Pages

Legacy pages include:

```text
HomePage
ProductsPage
ProductFormPage
CalculatorPage
ApprovalPage
HistoryPage
MarginPage
MarginRuleFormPage
MasterDataPage
ImportCsvPage
SettingsPage
RealtimeSyncPage
MorePage
LoginPage
```

## Classification

Mostly:

```text
REPLACE UI
ADAPT domain-specific interaction knowledge
```

Reason:

v2 IA is fundamentally different:

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

Specific UX fragments can be referenced but page structure should not be ported wholesale.

---

# 22. Calculator Page

Legacy CalculatorPage is a large feature surface.

## Classification

```text
ADAPT FUNCTIONAL KNOWLEDGE
REPLACE SCREEN STRUCTURE
```

v2 Calculator has:

```text
Quick Mode
Product Mode
Target Margin
Floor
Recommendation
Current Price comparison
Retail/Wholesale tiers
Use as Proposal
Owner Apply Price
```

---

# 23. Inventory Alert / Notification Components

Legacy:

```text
AppAlertContext
AppAlertProvider
ApprovalNotificationWatcher
```

## Classification

```text
ADAPT
```

General alert plumbing may inspire shared UI infrastructure.

However v2 uses formal:

```text
Business Exception
Severity
Lifecycle
Attention Queue
```

Do not use ad-hoc notifications as business exception authority.

---

# 24. `integrated-pos-app` — High-Level Assessment

Major legacy pages:

```text
POS
Shift
Stock
Products
Reports
Customers
Employees
Sync
Settings
Dashboard
Login
Profile
```

Core services:

```text
transactionService
shiftService
stockService
productService
authService
reportService
syncService
realtimeSyncService
db
```

The strongest reusable knowledge exists in:

```text
offline Dexie transactions
checkout workflow
stock movement concept
shift calculations
barcode/product integration
receipt/PWA implementation
```

---

# 25. POS Local Atomic Checkout

Legacy `transactionService.processCheckout()` uses one Dexie transaction across:

```text
Products
Units
Transaction
Transaction Items
Payments
Stock Balance
Stock Movements
Sync Queue
Audit
```

## Classification

```text
ADAPT — VERY HIGH VALUE PATTERN
```

This directly aligns with the v2 principle:

```text
local business commit
+
outbox
+
audit
```

## Preserve

```text
single local transaction
local completion independent of cloud
transaction + items + payments
stock event
sync queue
audit
```

## Rewrite

Legacy currently:

```text
reads active_selling_price directly from Product Unit
uses JavaScript number
allows paid > total as generic payment sum
directly updates stock balance
uses simple transaction snapshots
does not capture full pricing/cost/tax snapshots
```

v2 needs:

```text
shared pricing resolver
decimal-safe values
published price versions
tier/promo/discount snapshots
cost status
source-linked stock movement
idempotent command_id
cash ledger
shift required
```

---

# 26. POS Transaction IDs

Legacy already creates local transaction IDs.

## Classification

```text
KEEP PRINCIPLE / ADAPT FORMAT
```

v2:

```text
globally unique technical UUID
+
separate human-readable transaction number
```

---

# 27. POS Stock Movement

Legacy checkout creates:

```text
SALE stock movement
```

and maintains:

```text
stock balance projection
```

## Classification

```text
ADAPT — STRONG CONCEPTUAL MATCH
```

Preserve:

```text
movement + balance projection
negative quantity can exist
```

Rewrite:

```text
source_type/source_id/source_line_id
conversion snapshot
location
movement idempotency
no LWW balance sync
ledger authority
```

---

# 28. Direct Stock Balance Updates

Legacy checkout directly updates:

```text
stock_balances.qty
```

inside same local transaction.

## Classification

```text
ADAPT LOCALLY
REPLACE AS CANONICAL MODEL
```

Local balance update is acceptable as a projection optimization if coupled atomically to Stock Movement.

It must never become:

```text
sync stock = X
```

cloud authority.

---

# 29. POS Payment Model

Legacy supports:

```text
cash
qris
transfer
edc
multiple payment rows
```

## Classification

```text
ADAPT
```

Good:

```text
multiple payments already structurally possible
```

v2 changes:

```text
payment methods configurable
status
confirmation type
reversal
external reference
cash effect separation
Other instead of fixed EDC core assumption
```

---

# 30. Transaction Discount

Legacy checkout already accepts:

```text
line discount
transaction_discount
```

## Classification

```text
ADAPT
```

v2 must add:

```text
permission limits
proportional allocation per line
Floor enforcement
historical allocation rows
promotion separation
```

---

# 31. Transaction Snapshot

Legacy Transaction Item snapshots:

```text
product_name
unit_name
qty
unit_price
discount
subtotal
```

## Classification

```text
ADAPT
```

This validates the snapshot approach.

v2 expands snapshot to:

```text
SKU
conversion
base quantity
base price
tier
promotion
manual discount
transaction allocation
tax
cost
cost status
```

---

# 32. POS Shift Service

Legacy Shift already implements:

```text
Open Shift
Cash In
Cash Out
Expected Cash
Actual Cash
Difference
Close Shift
```

## Classification

```text
ADAPT — HIGH VALUE
```

Preserve:

```text
ledger-derived expected cash concept
cash/non-cash distinction
local offline calculation
```

Rewrite:

```text
Terminal binding
Cash Refund
Safe Drop
Cash Reversal
closing snapshot immutable
blind-count UI
review status
force close
late-event reconciliation
```

---

# 33. Blind Count

Legacy `closeShift()` calculates expected cash before updating closure and returns it.

## Classification

```text
REPLACE UX / ADAPT CALCULATION
```

v2 UI must not reveal Expected Cash until Cashier submits physical count.

The calculation itself remains useful.

---

# 34. POS Cash Movement

Legacy supports:

```text
CASH_IN
CASH_OUT
```

## Classification

```text
ADAPT
```

v2 expands:

```text
OPENING_BALANCE
CASH_SALE
CASH_IN
CASH_OUT
CASH_REFUND
CASH_REVERSAL
SAFE_DROP
```

and uses explicit source references.

---

# 35. POS User Model

Legacy roles:

```text
Owner
Admin
Supervisor
Kasir
```

v2:

```text
Owner
Admin
Cashier
```

## Classification

```text
REPLACE ROLE MODEL
```

`Supervisor` must not migrate as a v2 role.

Supervisor-like capabilities are permissions.

---

# 36. Plaintext PIN in Local DB

Legacy `User` includes:

```text
pin: string
```

and indexes it locally.

## Classification

```text
REMOVE / SECURITY REPLACEMENT
```

v2 must not store plaintext credentials/PIN.

Use:

```text
secure server credential verification
+
device-bound offline unlock verifier/material
```

with explicit security review.

This is a release-blocking migration concern.

---

# 37. POS Customer Model

Legacy Customer includes:

```text
address
points
```

v2 lightweight customer:

```text
Name
Phone optional
Notes optional
Status
```

## Classification

```text
ADAPT
```

Remove from MVP:

```text
points
loyalty semantics
required address
```

Historical data may be preserved in migration archive if needed, but not core v2 fields.

---

# 38. POS Navigation

Legacy navigation exposes:

```text
Dashboard
Kasir
Produk
Stok
Shift
Laporan
Pelanggan
Sinkronisasi
Karyawan
Pengaturan
Profil
```

## Classification

```text
REPLACE IA
```

v2 POS primary navigation:

```text
Kasir
Tertahan
Transaksi
Retur
Shift
```

Back Office owns supervisory/product/settings navigation.

This separation is important for cashier cognitive load.

---

# 39. POS Dashboard

## Classification

```text
REMOVE FROM CASHIER PRIMARY POS
```

Any useful operational summary moves to:

```text
Back Office Ringkasan
or
POS Shift
```

depending job context.

---

# 40. POS Product Management Page

## Classification

```text
REMOVE FROM CASHIER POS WORKSPACE
```

Product master operations belong to Back Office.

POS retains local Product cache/search only.

---

# 41. POS Stock Management Page

## Classification

```text
REMOVE FROM CASHIER PRIMARY POS
```

Inventory management moves to Back Office.

Cashier only sees operational stock signals where useful.

---

# 42. POS Customers Page

## Classification

```text
REMOVE AS PRIMARY POS NAVIGATION
ADAPT CUSTOMER PICKER / LOOKUP
```

Customer interaction is contextual within Sale/Return.

---

# 43. POS Employees Page

## Classification

```text
REMOVE FROM POS
ADAPT IDEAS INTO BACK OFFICE USER & ACCESS
```

Role/permission management is cloud-authoritative and Owner-controlled.

---

# 44. POS Reports Page

## Classification

```text
REMOVE FROM CASHIER PRIMARY POS
ADAPT REPORT LOGIC CONCEPTS
```

Reporting belongs to Back Office.

---

# 45. POS Sync Page

Legacy exposes Sync as primary navigation.

## Classification

```text
REMOVE AS PRIMARY NAVIGATION
ADAPT DIAGNOSTICS
```

v2:

```text
global sync indicator
+
Back Office Settings → Sync & Devices
+
Attention exceptions
```

Cashier sees only simple recovery state.

---

# 46. POS Settings Page

## Classification

```text
REMOVE FROM NORMAL CASHIER IA
ADAPT TO BACK OFFICE SETTINGS
```

Terminal-specific local setup may exist with restricted access.

---

# 47. POS Profile Page

## Classification

```text
ADAPT
```

Useful functionality should move to:

```text
user menu
quick lock
session context
```

not primary navigation.

---

# 48. PWA Configuration

POS already uses:

```text
vite-plugin-pwa
service worker
installable app
HTTPS deployment experience
```

## Classification

```text
KEEP / ADAPT
```

This is a strong reuse candidate.

v2 service worker responsibilities remain:

```text
app shell
static assets
update lifecycle
```

not business truth.

---

# 49. Barcode Library

Both repos use:

```text
@zxing/browser
```

## Classification

```text
KEEP
```

Use for:

```text
camera fallback
```

Hardware keyboard-wedge scanner logic still needs dedicated v2 interaction code.

---

# 50. Receipt Printing

POS already depends on:

```text
react-to-print
```

## Classification

```text
ADAPT
```

Preserve printing infrastructure if stable.

v2 adds:

```text
80 mm primary
58 mm compatible
historical snapshot receipt
printing independent of transaction completion
```

---

# 51. POS Dexie Database

## Classification

```text
REPLACE SCHEMA
KEEP TECHNOLOGY/PATTERNS
```

Current DB proves local IndexedDB approach is viable.

New local schema must be driven by v2 contracts.

---

# 52. Legacy Sync Queue

Current POS already has:

```text
sync_queue
status
retry_count
last_error
payload
```

## Classification

```text
ADAPT — IMPORTANT
```

This is close to v2 outbox concept.

Rewrite semantics:

```text
stable command_id
command_type
schema_version
authorization_version
correlation_id
idempotency
retry classification
REQUIRES_REVIEW
```

Do not retain generic:

```text
entity + CREATE/UPDATE/DELETE
```

as business command protocol.

---

# 53. Full POS Snapshot Sync

Legacy `RealtimeSyncService` builds a complete snapshot including:

```text
users
roles
permissions
products
units
barcodes
stock balances
stock movements
transactions
items
payments
shifts
cash
customers
audit
settings
```

Remote snapshot import clears local tables then bulk-imports snapshot.

## Classification

```text
REPLACE — CRITICAL
```

This pattern conflicts with:

```text
immutable ledgers
pending local events
multi-device concurrent truth
incremental sync
domain authority
version conflicts
```

Do not port.

---

# 54. Snapshot Safety Guard

Legacy tries to avoid auto-restore when local pending sync exists.

## Classification

```text
KEEP LESSON / REMOVE MECHANISM
```

The insight is valid:

> never overwrite a device that has unsynced work.

v2 solves this structurally through:

```text
outbox preservation
bootstrap + cursor
incremental feed
```

rather than snapshot replacement.

---

# 55. WebSocket Realtime Layer

Legacy uses WebSocket for:

```text
sale events
catalog events
state notification
```

## Classification

```text
ADAPT ROLE / REPLACE PROTOCOL
```

v2 WebSocket:

```text
SYNC_AVAILABLE
PRICE_PUBLISHED
PERMISSION_CHANGED
DEVICE_REVOKED
```

Then client uses authenticated HTTP pull.

---

# 56. Build-Time Sync API Token

Legacy uses:

```text
VITE_SYNC_API_TOKEN
```

## Classification

```text
REMOVE — SECURITY
```

Frontend build variables are visible to clients.

v2 requires:

```text
user/session auth
device provenance
scoped authorization
```

No privileged shared token.

---

# 57. Cloud PostgreSQL Experience

Legacy sync server already has PostgreSQL/Neon deployment experience.

## Classification

```text
KEEP OPERATIONAL KNOWLEDGE
REPLACE DOMAIN SCHEMA/API
```

Useful:

```text
Cloudflare + Neon deployment familiarity
connection handling
environment setup
```

Do not retain old `pos_*` / `inventory_*` ownership split as canonical architecture.

---

# 58. Cloudflare Deployment

Legacy uses:

```text
Cloudflare Worker
WebSocket/Durable Object patterns
Neon
```

## Classification

```text
KEEP / ADAPT
```

This aligns with preferred System Architecture.

But final API becomes:

```text
modular monolith command/query/sync API
```

not legacy snapshot bridge.

---

# 59. Render / Railway Configuration

## Classification

```text
KEEP AS OPTIONAL DEV/PREVIEW REFERENCE
```

Do not treat multiple legacy service definitions as v2 production architecture.

v2 deployment topology:

```text
Back Office
POS
API
PostgreSQL
optional realtime notification
```

---

# 60. Navigation / Back Behavior

Legacy navigation is feature-oriented and tied closely to old app boundaries.

## Classification

```text
REPLACE
```

v2 requires:

```text
browser-history-respecting back behavior
breadcrumbs
state preservation
contextual hubs
```

Never implement:

```text
Back → forced Home/POS root
```

as a universal behavior.

---

# 61. Large Page Components

Examples:

```text
CalculatorPage ~43 KB
POS.tsx ~40 KB
ProductFormPage ~26 KB
Employees.tsx ~25 KB
```

## Classification

```text
REPLACE PAGE COMPOSITION
ADAPT INNER LOGIC
```

v2 should split:

```text
screen container
application hooks/services
domain logic
specialized components
shared UI primitives
```

Avoid monolithic screen files carrying business logic + persistence + UI together.

---

# 62. React Component Reuse Policy

Do not copy legacy components wholesale simply because visual output appears correct.

Component classification:

```text
Primitive UI
→ usually REPLACE with Design System v1

Feature interaction logic
→ ADAPT when useful

Hardware integration
→ KEEP/ADAPT

Legacy layout/navigation
→ REPLACE
```

---

# 63. CSS / Tailwind

Current repos use different Tailwind generations/configuration.

## Classification

```text
REPLACE CONFIG / STANDARDIZE
```

v2 monorepo should have:

```text
one semantic design-token strategy
one shared UI package
one styling convention
```

Do not preserve inconsistent legacy visual systems.

---

# 64. Lucide Icons

## Classification

```text
KEEP
```

Compatible with Design System v1.

---

# 65. Date Utilities

Current repos use:

```text
date-fns
```

## Classification

```text
KEEP
```

Subject to:

```text
business timezone discipline
server-authoritative effective times
TIMESTAMPTZ contract
```

---

# 66. JavaScript Number Usage

Both legacy codebases heavily use:

```text
number
Math.round
multiplication/division
```

for money/cost/qty.

## Classification

```text
REPLACE IN AUTHORITATIVE DOMAIN LOGIC
```

v2 must use:

```text
decimal-safe abstraction
JSON decimal strings
PostgreSQL NUMERIC
```

Display formatting may still convert carefully for presentation when safe.

---

# 67. Role Naming

Legacy uses Indonesian and English mixed role strings.

## Classification

```text
REPLACE
```

Internal codes:

```text
OWNER
ADMIN
CASHIER
```

UI labels:

```text
Owner
Admin
Kasir
```

---

# 68. Legacy `outlet_id`

POS already scopes stock/transactions by outlet.

## Classification

```text
ADAPT
```

Map to v2:

```text
location_id
```

Do not expose multi-location switching in current UX.

---

# 69. POS `active_selling_price`

Current Product Unit stores price directly.

## Classification

```text
REPLACE
```

v2 POS cache receives published:

```text
Price Version
Price Tier Versions
Promotions
```

and resolves current price.

No mutable canonical active-selling-price field.

---

# 70. POS `cost_price`

Current Product Unit includes cost.

## Classification

```text
REPLACE
```

Cashier-facing Product Unit cache should not expose unnecessary cost/margin.

Cost data lives in controlled domain state/snapshots.

---

# 71. Audit Logs

Both apps already have audit-log concepts.

## Classification

```text
ADAPT
```

Good foundation:

```text
actor
action
entity
metadata
time
```

v2 expands:

```text
business
location
device
session
role snapshot
reason
before/after
correlation
authorization version
```

Audit stays separate from domain ledgers.

---

# 72. Reporting Services

Legacy POS has `reportService`.

## Classification

```text
ADAPT BUSINESS QUESTIONS / REPLACE QUERY IMPLEMENTATION
```

v2 reporting should come from server read models, not full local history aggregation as canonical consolidated reporting.

---

# 73. Product Service

Legacy POS `productService` handles imported catalog/local Product use.

## Classification

```text
ADAPT
```

Potentially reusable:

```text
barcode lookup
local cache update
catalog import patterns
```

Rewrite authority:

```text
Back Office/shared cloud catalog
→ bootstrap/change feed
→ POS local cache
```

---

# 74. Stock Service

Legacy `stockService` likely contains stock adjustment/read helpers.

## Classification

```text
ADAPT CONCEPT
```

All writes must become:

```text
source-linked Stock Movement business commands
```

No standalone stock value mutation.

---

# 75. Auth Service

Both repos contain separate Auth services.

## Classification

```text
REPLACE
```

Reason:

v2 identity is one shared platform with:

```text
session
membership
role
permission
device
authorization version
offline unlock
```

---

# 76. Local Event Dispatch

Legacy code uses browser custom events such as:

```text
pos-data-changed
pos-sync-queue-created
```

## Classification

```text
ADAPT OR REPLACE WITH APP STATE/SYNC CLIENT INTERFACE
```

Useful for lightweight decoupling, but should not become an undocumented internal event bus.

Use typed internal interfaces if retained.

---

# 77. KEEP Matrix

Strong `KEEP` candidates:

| Legacy Asset | Repo | Decision |
|---|---|---|
| React + TypeScript + Vite stack | Both | KEEP |
| Dexie/IndexedDB technology | Both | KEEP |
| Lucide | Both | KEEP |
| date-fns | Both | KEEP |
| ZXing camera scanning capability | Both | KEEP |
| PWA concept/config experience | POS | KEEP/ADAPT |
| Offline local transaction principle | POS | KEEP principle |
| Product/Product Unit concept | Inventory | KEEP concept |
| Tax mode concepts | Inventory | KEEP concept |
| Pricing formula | Inventory | KEEP formula |
| Historical pricing principle | Inventory | KEEP principle |
| Cloudflare/Neon operational knowledge | Both | KEEP |

---

# 78. ADAPT Matrix

| Legacy Asset | Target |
|---|---|
| PricingCalculatorService | shared decimal-safe pricing engine |
| RoundingService | configurable rounding engine |
| TaxCalculatorService | decimal-safe tax calculation |
| MarginRuleResolver | Business → Category → Product Unit |
| ApprovalService | v2 Pricing Proposal/Owner approval |
| PriceHistoryService | Price Version model |
| ProductUnitCostHistory | Cost Events |
| CsvImportService | v2 staged import |
| CameraBarcodeScanner | tablet/mobile fallback |
| POS transactionService | CompleteSale local command |
| POS sync_queue | typed local outbox |
| POS stock movements | v2 Stock Movement ledger |
| POS shiftService | v2 Shift/Cash domain |
| Payment rows | configurable split payment |
| Customer lookup | lightweight Customer domain |
| Audit logs | shared append-only audit |
| Receipt printing | 80/58 mm renderer |
| productService barcode lookup | local catalog query |
| report concepts | server reporting read models |

---

# 79. REPLACE Matrix

| Legacy Asset | Reason |
|---|---|
| Separate canonical app ownership | one shared platform |
| Full snapshot cloud sync | unsafe for v2 concurrent ledgers |
| Snapshot `clear()` + restore | may overwrite independent facts |
| Legacy realtime protocol | replace with push/pull cursor |
| Build-time sync token | security |
| Legacy IndexedDB schemas | old domain model |
| Legacy cloud DB schema | new domain namespaces |
| Separate app auth stores | shared identity |
| Product Unit active price | price version authority |
| Product Unit manual cost | cost event authority |
| Direct stock-as-truth sync | movement ledger authority |
| POS primary nav | new IA |
| Inventory primary nav | new IA |
| Legacy role model | only Owner/Admin/Cashier |
| Float money arithmetic | decimal-safe |
| monolithic large pages | split by v2 architecture |

---

# 80. REMOVE Matrix

| Legacy Feature/Pattern | Decision |
|---|---|
| Supervisor as v2 role | REMOVE |
| POS Dashboard as Cashier primary page | REMOVE |
| Product management in Cashier POS | REMOVE |
| Stock management in Cashier POS | REMOVE |
| Reports as Cashier primary nav | REMOVE |
| Customers as primary POS nav | REMOVE |
| Employees as POS module | REMOVE |
| Sync as primary cashier nav | REMOVE |
| PricingMode AUTO/MANUAL/LOCKED as core Product model | REMOVE |
| Customer loyalty points in MVP | REMOVE |
| Shared plaintext/local PIN | REMOVE |
| generic sync CREATE/UPDATE/DELETE as business protocol | REMOVE |
| forced-home back-navigation behavior | REMOVE |
| full snapshot overwrite as recovery default | REMOVE |

---

# 81. Legacy Data Worth Migrating

From Inventory Pricing:

```text
Products
SKU
Categories
Brands
Suppliers
Product Units
Barcodes where reliable
Current active selling prices
Cost history where trustworthy
Price history where trustworthy
Margin configuration as migration input
```

From POS:

```text
Transactions
Transaction Items
Payments
Shifts
Cash Movements
Stock Movements
Customers
Audit history
```

But all must be transformed to v2 semantics.

---

# 82. Data That Must Not Be Blindly Imported

Do not direct-copy:

```text
plaintext PIN
legacy permission caches
sync tokens
sync queue state from retired system
sync logs as business truth
legacy stock balance as sole stock history truth
temporary cloud snapshot metadata
app-specific settings that no longer exist
```

---

# 83. Opening Data vs Historical Migration

Two possible migration classes:

## Master/Opening Migration

```text
Product
Unit
Barcode
Supplier
Opening Stock
Opening Cost
Opening Price
```

Uses explicit:

```text
INITIAL_STOCK
INITIAL_COST
OPENING_PRICE
```

## Historical Archive Migration

Optional:

```text
old Sales
old Price History
old Shifts
```

If migrated, preserve source identity and mark:

```text
LEGACY_IMPORTED
```

Do not fabricate full v2 business workflows for data that did not originally contain them.

---

# 84. Legacy ID Mapping

Use:

```text
core.legacy_id_map
```

for:

```text
inventory-pricing-app
integrated-pos-app
spreadsheet
```

This is essential because the same conceptual Product may exist in both legacy repos under different records/IDs.

---

# 85. Product Deduplication During Migration

Before import:

```text
Inventory Product
vs
POS Product
```

match using prioritized evidence:

```text
Barcode
SKU
Known source relationship
Name + Unit context
Manual review
```

Do not automatically merge ambiguous rows by fuzzy name alone.

---

# 86. Stock Cutover

Recommended migration strategy:

```text
Do not attempt to reconstruct perfect inventory history
if legacy history is incomplete/inconsistent.
```

At cutover:

```text
physical/verified stock position
→ INITIAL_STOCK in v2
```

Historical POS movements can be retained as archive/report data if useful but need not determine opening balance.

---

# 87. Cost Cutover

Recommended:

```text
verified current cost/MWA/reference
→ INITIAL_COST
```

Past cost histories may be imported for informational history, clearly source-tagged.

---

# 88. Price Cutover

For every sellable Product Unit:

```text
verified current active price
→ OPENING_PRICE_VERSION
```

Scheduled legacy prices require explicit review before import.

Do not blindly activate stale legacy schedules.

---

# 89. User Migration

Do not migrate credentials directly.

Recommended:

```text
create v2 users
assign Owner/Admin/Cashier role
force secure credential enrollment/reset
```

Legacy identity mapping may preserve historical attribution.

---

# 90. Architecture Debt Severity

## Critical — must not enter v2

```text
Full snapshot overwrite sync
Shared build-time privileged token
Plaintext PIN
Duplicated canonical auth
Float-based authoritative money
```

## High

```text
Mutable active price field
Direct canonical stock balance mutation
Old role model
Legacy navigation
App ownership split
```

## Medium

```text
Large page components
ad-hoc browser events
mixed naming conventions
legacy settings organization
```

## Low

```text
visual inconsistency
legacy component styling
route naming
```

---

# 91. Migration Reuse Priority

Highest-value reuse order:

```text
1. Pricing formula knowledge/tests
2. Tax/rounding calculation tests
3. POS local atomic transaction pattern
4. Barcode/scanner integration
5. PWA configuration knowledge
6. Shift/cash calculation logic
7. CSV staged import logic
8. Receipt printing
9. Product local search/cache patterns
10. Cloudflare/Neon deployment knowledge
```

---

# 92. Do-Not-Port List for Codex

Codex must be explicitly instructed:

```text
DO NOT port legacy snapshot sync.
DO NOT copy plaintext PIN/auth storage.
DO NOT copy current ProductUnit.active_selling_price as canonical design.
DO NOT preserve Supervisor role.
DO NOT preserve legacy POS navigation.
DO NOT preserve generic sync entity CREATE/UPDATE/DELETE protocol.
DO NOT preserve direct price/cost/stock mutable authority.
DO NOT use JavaScript number for authoritative money/cost/qty calculations.
DO NOT merge two old app schemas into one combined schema.
```

---

# 93. What Codex May Mine From Legacy

Codex may inspect legacy implementations for:

```text
formula tests
edge-case tests
barcode integration
print CSS
PWA manifest/service worker
Dexie transaction usage
input parsing
CSV parser
existing deployment files
historical data transformers
```

But all ports must target v2 contracts.

---

# 94. New Repository Cutover

Recommended:

```text
Create kastur-retail-system
↓
Build foundation packages/apps
↓
Port selected reusable modules
↓
Build v2 APIs/schema
↓
Build migration tools
↓
Import staging data
↓
Run reconciliation
↓
Pilot
↓
Cut over
↓
Legacy repos read-only/archive
```

---

# 95. No Long-Term Bidirectional Legacy Sync

Do not build:

```text
v2 ↔ inventory-pricing-app ↔ integrated-pos-app
```

as a permanent topology.

This creates three competing systems of record.

If bridge required during migration:

```text
short-lived
one-way
explicit
observable
```

---

# 96. Recommended Porting Work Packages

## WP-01 — Shared Pricing Engine

Sources:

```text
PricingCalculatorService
RoundingService
TaxCalculatorService
MarginRuleResolver
InvoiceLineCalculatorService
UnitCostAllocationService
```

Target:

```text
packages/domain/pricing
packages/domain/costing
```

---

## WP-02 — POS Local Transaction Kernel

Sources:

```text
transactionService
Dexie transaction patterns
sync_queue
audit log
stock movement
```

Target:

```text
apps/pos application layer
packages/local-db
packages/sync-client
```

---

## WP-03 — Barcode & Product Discovery

Sources:

```text
ZXing
CameraBarcodeScanner
productService
POS scan/search behavior
```

Target:

```text
POS ScannerCapture
local product/barcode indexes
```

---

## WP-04 — Shift & Cash

Sources:

```text
shiftService
cash movement
```

Target:

```text
shared cash domain rules
POS shift application service
```

---

## WP-05 — Import/Migration

Sources:

```text
CsvImportService
CsvImportBatch/Row
legacy backups
```

Target:

```text
v2 migration/import tooling
```

---

## WP-06 — PWA & Print

Sources:

```text
vite-plugin-pwa
react-to-print
legacy receipt styles
```

Target:

```text
apps/pos
```

---

# 97. Modules to Build Fresh

No sufficient legacy equivalent:

```text
Purchasing & Receiving v2
MWA / Cost Reconciliation engine
Supplier Integrity
Price Tier Versioning
Promotion Resolver
Attention Queue
Customer Return + Refund domain
Opname snapshot concurrency
Server command handlers
PostgreSQL modular schema
Incremental Sync Feed
Optimistic Concurrency
Server Idempotency
Device/Terminal Identity
Authorization Versioning
Quick Lock security
Blind Shift Close UX
Back Office IA shell
```

These should be built from v2 specs, not reverse-engineered from old UI.

---

# 98. Legacy Audit Decision Summary

```text
Technology foundation       KEEP
Pricing formulas            ADAPT
Tax/rounding                 ADAPT
Catalog concepts             ADAPT
CSV import                   ADAPT
Dexie local-first            KEEP
POS local atomic commit      ADAPT
Stock movement concept       ADAPT
Shift/cash calculation       ADAPT
Split payment structure      ADAPT
Barcode/camera scanning      KEEP/ADAPT
PWA                           KEEP/ADAPT
Receipt printing             ADAPT
Audit concept                ADAPT

Legacy IndexedDB schemas     REPLACE
Legacy cloud schema          REPLACE
Auth implementation          REPLACE
Sync protocol                REPLACE
Snapshot restore             REPLACE
Navigation                   REPLACE
Large page composition       REPLACE
Mutable price/cost authority REPLACE

Supervisor role              REMOVE
Cashier management modules   REMOVE
Plaintext PIN                REMOVE
PricingMode core model       REMOVE
Customer points MVP          REMOVE
Primary Sync navigation      REMOVE
```

---

# 99. Readiness for Implementation Roadmap

After this audit:

```text
Business rules                 READY
User journeys                  READY
Information architecture       READY
System architecture            READY
Database schema                READY
API / Sync contract            READY
Design system                  READY
Screen specifications          READY
Legacy reuse classification    READY
```

Next:

```text
IMPLEMENTATION ROADMAP v1
```

---

# 100. Implementation Roadmap Should Define

```text
Epics
Dependency order
Vertical slices
Milestones
Migration sequence
Testing gates
Definition of Done
Staging/pilot strategy
Cutover
Codex task boundaries
```

Recommended implementation philosophy:

```text
vertical working slices
```

instead of:

```text
build entire DB
then entire backend
then entire frontend
```

Example first slice:

```text
Identity
+ Business/Location
+ Product/Unit
+ Published Price
+ POS Bootstrap
+ Open Shift
+ Complete Cash Sale
+ Local Outbox
+ Server Sync
+ Stock Movement
+ Receipt
```

That provides a real end-to-end operational spine early.

---

# Final Legacy Audit Principle

> **Kastur v2 should inherit proven knowledge, not legacy constraints. The existing applications have valuable pricing, offline, barcode, PWA, checkout, shift, and import work that should reduce implementation risk. Their snapshot synchronization, duplicated authority, mutable price/cost assumptions, plaintext credential model, and feature-oriented navigation must not survive the migration.**
