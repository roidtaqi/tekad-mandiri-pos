# Kastur Retail System — System Architecture v1

**Status:** Draft for Architecture Review  
**Architecture Style:** Offline-first Modular Monolith  
**Repository Strategy:** Monorepo  
**Applies to:** Kastur Back Office + Kastur POS + Shared Cloud Platform  
**Depends on:** Business Foundation v1, Cross-Domain Matrix, Gap Resolution v1, User Journeys v1, Information Architecture v1  
**Purpose:** Menetapkan technical boundaries, canonical data authority, local/cloud persistence, command/event model, sync architecture, security boundaries, deployment topology, testing strategy, and migration direction before Database Schema and API/Sync Contract design.

---

# 1. Architecture Objective

Kastur v2 harus mampu memberikan:

```text
Fast POS interaction
Reliable offline operation
One canonical business platform
Deterministic business rules
Strong historical auditability
Safe multi-device synchronization
Clear module ownership
Predictable correction/reconciliation
Low operational complexity
Future multi-location readiness
```

Architecture harus menghindari dua ekstrem:

```text
Too simple:
two separate apps + duplicated truth + snapshot overwrite

Too complex:
microservices + distributed event sourcing + premature infrastructure
```

Target:

> **A modular monolith with offline-capable clients, explicit domain boundaries, append-oriented business ledgers, and a single authoritative PostgreSQL platform.**

---

# 2. Architecture Decision Summary

```text
ADR-SA-001  Monorepo
ADR-SA-002  Two frontend apps, one platform
ADR-SA-003  Modular monolith backend
ADR-SA-004  React + TypeScript + Vite retained
ADR-SA-005  Dexie / IndexedDB retained for local-first persistence
ADR-SA-006  PostgreSQL is canonical cloud database
ADR-SA-007  Cloudflare Worker-class API retained as preferred deployment model
ADR-SA-008  HTTP command/sync API is authoritative transport
ADR-SA-009  WebSocket is notification/invalidation, not canonical data transport
ADR-SA-010  Outbox + incremental change feed replaces snapshot-overwrite sync
ADR-SA-011  Stable global IDs + idempotency mandatory
ADR-SA-012  CQRS-lite command/query separation, not full event sourcing
ADR-SA-013  Domain ledgers immutable; mutable master data uses optimistic concurrency
ADR-SA-014  Server permissions authoritative; offline authorization cached/versioned
ADR-SA-015  POS PWA has highest offline guarantee
ADR-SA-016  Back Office has selective offline support
ADR-SA-017  One shared design/domain vocabulary package
ADR-SA-018  Legacy repos are migration sources, not v2 architecture authority
ADR-SA-019  No shared build-time sync token in v2
ADR-SA-020  Database Schema and API contracts follow this architecture
```

---

# 3. Legacy Technical Baseline

Current applications already share a useful frontend foundation:

```text
React
TypeScript
Vite
Dexie / IndexedDB
Barcode scanning
PWA patterns
```

The POS also contains:

```text
PWA service worker
Cloud sync server
PostgreSQL integration
WebSocket sync
```

The Inventory/Pricing application already contains:

```text
Pricing formulas
Price approval
Scheduled pricing
Cost history
Catalog/master concepts
```

These are useful implementation references.

However, v2 does not preserve legacy ownership assumptions such as:

```text
Inventory app owns one half of canonical data
POS app owns another half
cloud snapshots replace device snapshots
manual source-specific synchronization
```

v2 uses one shared platform authority.

---

# 4. Target Logical Topology

```text
                    ┌────────────────────────┐
                    │     Kastur Platform    │
                    │                        │
                    │ Identity / Business    │
                    │ Domain Services        │
                    │ Commands / Queries     │
                    │ Sync / Audit           │
                    └───────────┬────────────┘
                                │
                         PostgreSQL
                                │
               ┌────────────────┴────────────────┐
               │                                 │
        Kastur Back Office                  Kastur POS
        React / Vite                        React / Vite PWA
        Dexie local store                   Dexie local store
        selective offline                   strong offline
```

The two clients never communicate directly as canonical peers.

They communicate through:

```text
Shared Platform
```

---

# 5. Physical Deployment Topology

Recommended:

```text
Internet
│
├── Back Office Static App
│
├── POS Static/PWA App
│
└── Kastur API / Sync Edge
      │
      ├── Auth / Session
      ├── Command API
      ├── Query API
      ├── Sync Push/Pull
      ├── Bootstrap
      ├── Optional WebSocket Notification
      │
      └── PostgreSQL
```

Preferred existing ecosystem:

```text
Frontend:
Cloudflare edge/static hosting

API:
Cloudflare Workers-class runtime

Optional realtime notification:
Durable Object / WebSocket-class component

Canonical Database:
Neon PostgreSQL / managed PostgreSQL
```

The architecture is not logically coupled to one hosting vendor.

---

# 6. Repository Strategy

Create a new v2 repository:

```text
kastur-retail-system
```

Old repositories remain:

```text
inventory-pricing-app
integrated-pos-app
```

as migration/reference sources until v2 migration is complete.

Do not evolve the two old repositories independently into v2.

---

# 7. Monorepo Structure

Recommended:

```text
kastur-retail-system/
│
├── apps/
│   ├── backoffice/
│   ├── pos/
│   └── api/
│
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
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── scripts/
│
├── docs/
│   ├── product/
│   ├── business-rules/
│   ├── cross-domain/
│   ├── user-journeys/
│   ├── information-architecture/
│   ├── architecture/
│   └── decisions/
│
├── AGENTS.md
├── package.json
└── workspace configuration
```

---

# 8. Workspace Tooling

Recommended first implementation:

```text
npm workspaces
```

Rationale:

- existing repos already use npm,
- reduces migration friction,
- no immediate need for additional monorepo orchestration complexity,
- can add task caching/tooling later if build scale requires it.

Avoid adding Turborepo/Nx solely because a monorepo exists.

---

# 9. Frontend Technology

Retain:

```text
React 19
TypeScript
Vite
React Router
Dexie
```

Standardize styling/tooling during Design System phase.

Do not rewrite healthy React/TypeScript code into another frontend framework.

---

# 10. Frontend Apps Remain Separate Bundles

```text
apps/backoffice
apps/pos
```

are separate deployable frontend applications.

Reasons:

```text
Different offline guarantees
Different navigation
Different performance profile
Different service-worker behavior
Different user job context
Independent rollout possible
```

They share packages, not one giant app bundle.

---

# 11. Recommended URL Topology

Preferred product-facing topology:

```text
https://app.<domain>/backoffice/
https://app.<domain>/pos/
```

or equivalent same parent origin.

Benefits:

```text
Consistent identity/session experience
Predictable deep links
One product namespace
Simpler CORS/security policy
```

Separate subdomains remain possible if infrastructure requires them.

---

# 12. Local Databases Remain Separate

Even if both apps share an origin:

```text
Back Office IndexedDB
≠
POS IndexedDB
```

Recommended database names:

```text
kastur-backoffice
kastur-pos
```

Reason:

- different local data subsets,
- different schema migration cadence,
- avoids accidental cross-app coupling,
- cloud is the canonical integration point.

---

# 13. POS Offline Guarantee

POS has highest offline priority.

Must work offline for:

```text
Product lookup from cache
Barcode scanning
Cart
Quantity tiers from cached pricing
Cached promotions
Authorized manual discount
Cash payment
Offline-capable payment methods
Sale completion
Local stock movement
Shift
Cash movement
Receipt
Cached-transaction return where allowed
```

---

# 14. Back Office Offline Guarantee

Back Office supports selective offline use.

Offline-safe or local-capable:

```text
Catalog read
Purchase draft
Physical receiving
Inventory adjustment
Opname counting
Price proposal draft
Pricing calculator
```

Online-authoritative operations include:

```text
Price publication
Purchase final POSTED
Permission management
Sensitive supplier changes
Global settings publication
```

---

# 15. Backend Architecture Style

Use:

```text
MODULAR MONOLITH
```

not microservices.

One deployable API can contain multiple bounded domain modules.

Benefits:

```text
Single PostgreSQL transaction across related modules
Simple deployment
Strong consistency for retail operations
Lower operational complexity
Clear future extraction boundaries if needed
```

---

# 16. Backend Domain Modules

Recommended modules:

```text
catalog
purchasing
costing
pricing
inventory
sales
cash
identity
returns
sync
reporting
```

Mapping:

```text
catalog     → D01
purchasing  → D02
costing     → D03
pricing     → D04
inventory   → D05
sales       → D06
cash        → D07
identity    → D08
returns     → D09
sync        → D10
```

---

# 17. Shared Kernel

Keep the shared kernel intentionally small.

Recommended:

```text
Entity ID types
Business ID
Location ID
Money
Quantity / Decimal
Unit conversion primitives
Timestamp
Business timezone
Result / Domain Error
Pagination
Correlation ID
Idempotency key
```

Do not put Product/Pricing/Inventory business logic in `shared`.

---

# 18. Domain Module Internal Shape

Example:

```text
pricing/
├── domain/
│   ├── entities
│   ├── value-objects
│   ├── policies
│   └── events
│
├── application/
│   ├── commands
│   ├── queries
│   └── services
│
├── infrastructure/
│   ├── repositories
│   └── persistence
│
└── api/
    └── handlers
```

Exact folder shape may be simplified in implementation.

Boundary matters more than folder ceremony.

---

# 19. Domain Ownership Rule

Only the owning domain may directly mutate its authoritative records.

Examples:

```text
Sales
cannot directly UPDATE stock_balance

Inventory
cannot directly UPDATE selling_price

Pricing
cannot directly UPDATE product cost

Returns
cannot edit original Transaction Item
```

Cross-domain effects happen through:

```text
Application orchestration
Domain commands
Domain events
```

---

# 20. Cross-Domain Transaction Rule

Business commands may coordinate multiple modules within one PostgreSQL transaction.

Example:

```text
CompleteSale
```

coordinates:

```text
Sales
Costing
Inventory
Cash
Audit
Sync Outbox
```

without exposing arbitrary table writes between modules.

---

# 21. CQRS-Lite

Use pragmatic:

```text
Commands
Queries
```

without full distributed CQRS infrastructure.

Commands:

```text
CreateProduct
ReceiveGoods
PostPurchase
ApprovePrice
CompleteSale
CompleteReturn
CloseShift
```

Queries:

```text
GetProductDetail
ListPurchases
GetCurrentStock
GetActivePricing
GetTransactionDetail
GetAttentionQueue
```

---

# 22. No Full Event Sourcing

Kastur does **not** use full event sourcing for every entity.

Use normal relational current-state tables plus immutable event/ledger tables where business history requires them.

Examples of append-oriented records:

```text
stock_movements
cost_events
price_versions
payments / reversals
cash_movements
returns
refunds
audit_events
sync_change_feed
```

---

# 23. Why Not Full Event Sourcing

Full event sourcing would add unnecessary complexity:

```text
Aggregate replay
Projection orchestration
Event schema evolution complexity
Operational debugging cost
```

Kastur only needs immutable histories where business meaning demands them.

---

# 24. Canonical Cloud Database

Use:

```text
PostgreSQL
```

as the canonical cloud persistence layer.

Reasons:

```text
Strong transactions
Relational integrity
Decimal types
Version/concurrency fields
Reporting capability
Mature indexing
Clear migration tooling
```

---

# 25. Database Tenant Scope

Even in single-business initial deployment, core records should carry:

```text
business_id
```

where appropriate.

Location-aware records carry:

```text
location_id
```

Examples:

```text
stock_movements
transactions
shifts
receipts
returns
```

---

# 26. Multi-Tenant Readiness

Do not hardcode:

```text
one database = one business forever
```

Recommended hierarchy:

```text
User
↓
Business Membership
↓
Business
↓
Location
```

v2 UX remains one current business/default store.

---

# 27. Decimal Arithmetic

Never use uncontrolled JavaScript `number` for authoritative money/cost calculations.

Recommended architecture:

```text
PostgreSQL NUMERIC
+
shared decimal arithmetic abstraction
```

Money/quantity rules live in domain package.

Exact decimal library is an implementation decision.

---

# 28. IDs

Use globally unique technical IDs that can be created offline.

Recommended category:

```text
UUID / UUIDv7 / ULID-class identifier
```

Exact format may be selected during Database/API Contract phase.

Human-readable numbers remain separate.

---

# 29. Human-Readable Numbers

Examples:

```text
TRX-...
PUR-...
RET-...
SHF-...
```

are display/business references.

Never use them as canonical primary identity.

Offline generation must never depend on globally perfect sequence.

---

# 30. Mutable Master Concurrency

Use optimistic concurrency for mutable shared records.

Record includes:

```text
version
updated_at
```

Update command provides:

```text
expected_version
```

If mismatch:

```text
VERSION_CONFLICT
```

---

# 31. Immutable Ledger Concurrency

Append-oriented events use:

```text
stable event ID
unique source/reference constraints
```

not optimistic overwrite.

---

# 32. Local Persistence — Dexie

Retain Dexie / IndexedDB.

Each frontend has a local data-access layer.

Do not allow React screens to directly write arbitrary Dexie tables.

Flow:

```text
UI
↓
Local Application Service
↓
Domain Command
↓
Dexie Transaction
```

---

# 33. POS Local Store Categories

Recommended:

```text
master_cache
├── products
├── product_units
├── barcodes
├── published_prices
├── promotions
├── permissions
└── settings

operational
├── carts
├── transactions
├── transaction_items
├── payments
├── shifts
├── cash_movements
├── returns
└── stock_movements

sync
├── outbox
├── sync_cursor
├── sync_metadata
└── sync_failures
```

---

# 34. Back Office Local Store Categories

Recommended:

```text
master_cache
operational_drafts
receipts
opname_sessions
pricing_drafts
sync_outbox
sync_cursor
metadata
```

Back Office does not need to mirror every historical transaction locally.

---

# 35. Local Projection Rule

Local views may use projections such as:

```text
stock_balance
current_price
shift_summary
```

but authoritative local events remain recoverable.

Projection can be rebuilt.

---

# 36. Sync Architecture v2

Replace snapshot-based synchronization as the core model.

Use:

```text
Local Outbox
+
Push Commands/Events
+
Server Idempotency
+
Incremental Change Feed
+
Client Cursor
```

---

# 37. Sync Push Flow

```text
Local Business Commit
↓
Outbox Entry
↓
POST /sync/push
↓
Authenticate
↓
Idempotency Check
↓
Business Validation
↓
PostgreSQL Transaction
↓
Accept / Conflict / Requires Review
↓
Return Result
↓
Mark Local Outbox Accepted
```

---

# 38. Sync Pull Flow

```text
Client has cursor N
↓
GET /sync/pull?cursor=N
↓
Server reads change feed > N
↓
Returns ordered changes
↓
Client applies in Dexie transaction
↓
Client stores cursor M
```

---

# 39. Sync Change Feed

Server maintains monotonic change ordering.

Conceptual record:

```text
change_sequence
business_id
entity_type
entity_id
change_type
version
occurred_at
payload/reference
```

Exact persistence model defined later.

---

# 40. Bootstrap

New device should not replay all history.

Use:

```text
GET /sync/bootstrap
```

or equivalent.

Bootstrap includes required current snapshot:

```text
Business
Location
User Authorization
Products
Units
Barcodes
Published Prices
Promotions
Payment Methods
Relevant Stock Projection
Sync Cursor
```

Then incremental pull begins from returned cursor.

---

# 41. WebSocket Role

WebSocket is optional acceleration.

Use only for messages such as:

```text
SYNC_AVAILABLE
PRICE_PUBLISHED
PERMISSION_CHANGED
DEVICE_REVOKED
```

Client responds by using normal authenticated HTTP sync.

---

# 42. WebSocket Is Not Canonical Data Channel

Do not depend on:

```text
WebSocket message received
```

for durable business correctness.

If WebSocket disconnects:

```text
poll/pull still works
```

---

# 43. Sync Polling

Fallback:

```text
periodic incremental pull
```

Frequency can vary by app/activity.

POS can sync aggressively after a completed event and when connection returns.

---

# 44. Local Outbox

Each offline-created durable command/event stores:

```text
outbox_id
business_event_id
command_type
payload
created_at
attempt_count
status
last_error
```

Queue survives browser restart.

---

# 45. Server Idempotency Store

Server persists idempotency result/reference for commands that may be retried.

Key scope includes:

```text
business_id
idempotency_key
command_type
```

Repeated command returns prior result rather than reapplying.

---

# 46. Complete Sale Aggregate

`CompleteSale` should be one logical command.

Request references:

```text
transaction_id
idempotency_key
device_id
user_id
shift_id
pricing snapshots
items
payments
local occurred_at
```

Server performs one transaction.

---

# 47. Complete Sale Server Transaction

Within one PostgreSQL transaction:

```text
Validate identity/permission
Validate idempotency
Insert Transaction
Insert Transaction Items
Resolve/validate cost state
Insert Payments
Insert Stock Movements
Insert Cash Movements if applicable
Insert Audit Event
Insert Change Feed / Outbox
Commit
```

No partial acceptance.

---

# 48. Receive Goods Aggregate

`ReceiveGoods` transaction:

```text
Receipt
Receipt Items
Accepted Quantities
Inventory Movements
Cost linkage
Purchasing Integrity events
Audit
Change Feed
```

---

# 49. Post Purchase Aggregate

Online authoritative:

```text
Validate Purchase version
Finalize commercial facts
Calculate final landed cost
Create Cost Reconciliation
Update Pricing Reference Cost
Create Pricing Review signals
Audit
Change Feed
```

---

# 50. Complete Return Aggregate

```text
Return
Return Items
Inventory Effect
Cost Reversal/Loss
Refund record
Cash/Payment effect when completed
Audit
Change Feed
```

Provider refund may remain asynchronous.

---

# 51. Close Shift Aggregate

```text
Validate shift state
Calculate expected cash
Store actual cash
Calculate variance
Create closing snapshot
Create exception if required
Audit
Change Feed
```

---

# 52. Price Publication Aggregate

Online-required:

```text
Validate Owner authority
Validate proposal/direct change
Validate version conflicts
Validate Floor override
Resolve active/scheduled version boundaries
Write new Price Version
Audit
Change Feed
Notify clients
```

---

# 53. Shared Contracts Package

`packages/contracts` defines stable wire-level types:

```text
Command envelopes
Query DTOs
Sync envelopes
Error codes
Pagination
Version fields
Snapshot DTOs
```

Domain entities should not be blindly serialized as API DTOs.

---

# 54. Domain Package

`packages/domain` contains pure deterministic business logic shared where safe.

Examples:

```text
pricing formulas
rounding
margin calculation
floor calculation
unit conversion
cash reconciliation
returnable quantity
stock variance logic
promotion resolution
money allocation
```

Must be environment-independent:

```text
No React
No Dexie
No PostgreSQL
No fetch
```

---

# 55. Shared UI Package

`packages/ui` contains:

```text
Design tokens
Primitive components
Form primitives
Data display
Status semantics
Dialogs / drawers
Navigation primitives
```

It does not contain domain orchestration.

---

# 56. Sync Client Package

`packages/sync-client` owns:

```text
Outbox processing
Pull cursors
Retry/backoff
Connectivity state
WebSocket notifications
Sync status
Conflict envelopes
```

Apps configure which local repositories/handlers apply changes.

---

# 57. Auth Client Package

`packages/auth-client` owns:

```text
Session client
Permission evaluation helpers
Offline authorization snapshot
Device registration
Re-auth triggers
```

It must not contain role-specific hardcoded business logic.

---

# 58. Authorization Architecture

Server is authoritative.

Request:

```text
User Session
↓
Business Membership
↓
Effective Permissions
↓
Command Permission Check
```

Frontend permission check is for UX only.

---

# 59. Offline Authorization

Client caches a versioned authorization snapshot.

Example conceptual data:

```text
user_id
business_id
role
permissions
authorization_version
issued_at
offline_valid_until
```

Offline business actions store the authorization version used.

---

# 60. No Shared Static Sync Token

v2 must not depend on a build-time token shared by every browser/device.

Replace with:

```text
User authentication
+
Device identity
+
Session / scoped credentials
```

Secrets remain server-side.

---

# 61. Authentication Boundary

Exact authentication vendor/library is deferred to API/Auth Contract phase.

Architecture requirements:

```text
Unique user identity
Secure credential verification
Revocable sessions
Device awareness
Short-lived online authorization
Offline operational unlock support
No plaintext PIN/password storage
```

---

# 62. Offline POS Unlock

Offline POS may need local re-entry without network.

Architecture should support a device-bound offline unlock mechanism with:

```text
Expiration
User attribution
Authorization snapshot
Secure local credential verifier/material
```

Exact cryptographic implementation must be reviewed separately.

---

# 63. Sensitive Actions

Actions may declare:

```text
online_required
step_up_auth_required
```

Examples:

```text
Permission management
Owner transfer
Price publication
Sensitive supplier bank change
```

---

# 64. Audit Architecture

Audit is append-only.

Audit event:

```text
audit_event_id
business_id
actor_user_id
actor_role_snapshot
action
entity_type
entity_id
occurred_at
device_id
session_id
reason
before/after where relevant
correlation_id
```

---

# 65. Business Ledger vs Audit

Do not use Audit Log as the source for:

```text
stock
cash
COGS
price
```

Domain ledgers remain authoritative.

Audit answers:

```text
who did what and why
```

---

# 66. Correlation ID

One multi-domain operation should share:

```text
correlation_id
```

Example:

```text
CompleteSale
```

links:

```text
Transaction
Payment
Stock Movements
Cash Movement
Audit
Sync Change
```

---

# 67. Exception Architecture

Common exception object/read model:

```text
exception_id
business_id
domain
type
severity
status
source_entity_type
source_entity_id
summary
impact
created_at
acknowledged_by
resolved_by
resolution
```

Severity:

```text
INFO
WARNING
REVIEW_REQUIRED
CRITICAL
```

---

# 68. Attention Queue

`Perlu Ditinjau` is a cross-domain read model.

It consumes exceptions from:

```text
Purchasing
Pricing
Inventory
Cash
Returns
Sync
Identity
```

It should not own source-domain business state.

---

# 69. Reporting Architecture

Operational commands and reporting reads are separated.

Do not build heavy dashboards by joining dozens of transactional tables in the browser.

Server supplies query/read models.

---

# 70. Read Models

Recommended materialized/query models may include:

```text
product_commercial_summary
inventory_position
purchase_summary
pricing_health
transaction_summary
shift_summary
supplier_performance
attention_queue
```

Implementation can use:

```text
SQL views
materialized projections
denormalized tables
query-time joins
```

depending performance needs.

---

# 71. Reporting Consistency

Consolidated reports use synchronized cloud data.

If devices have pending events:

```text
report_completeness
```

metadata should indicate incomplete synchronization where relevant.

---

# 72. Product Search Architecture

POS must not call cloud on every scan.

Use local indexed data for:

```text
barcode
name
SKU
```

Back Office may use local or server search depending data size.

---

# 73. Barcode Scan

Barcode scanner produces string.

Lookup sequence:

```text
Local barcode index
↓
Product Unit
↓
Published Price
↓
Cart
```

No network dependency.

---

# 74. Pricing Resolution Architecture

Pure deterministic domain function.

Input:

```text
product_unit
quantity
active_price_set
promotions
discount
policy
time_context
```

Output:

```text
base_price
tier
promotion
discount
final_unit_price
warnings
```

Same implementation should be used in:

```text
Back Office Calculator/Preview
POS
Server validation
Tests
```

---

# 75. Costing Engine Architecture

Pure/domain services calculate:

```text
landed cost
MWA
cost reconciliation
negative-stock COGS reconciliation
return cost reversal
```

Server remains final authority for consolidated cost state.

POS stores cost snapshot based on locally valid state and allows server reconciliation.

---

# 76. Inventory Architecture

Authoritative inventory event:

```text
Stock Movement
```

Projection:

```text
Stock Balance
```

Server and local client both can maintain projections.

Projection is always rebuildable from movements within the relevant retained dataset/snapshot boundary.

---

# 77. Inventory Movement Identity

Each source line should have deterministic uniqueness.

Example:

```text
source_type = SALE
source_id = transaction_item_id
movement_role = SALE_OUT
```

Unique constraint prevents duplicate stock movement.

---

# 78. Cash Architecture

Authoritative:

```text
Cash Movement Ledger
```

Projection:

```text
Expected Drawer Cash
```

Payment records and cash movements are linked but distinct.

---

# 79. Pricing Architecture

Authoritative:

```text
Price Versions
Price Tier Versions
Promotion Versions
```

Current price is a time-based read model.

Never store only:

```text
product.current_price
```

as historical authority.

---

# 80. Master Data Soft Deactivation

Historical business records should favor:

```text
ACTIVE
INACTIVE
```

over deletion.

Applies to:

```text
Product
Product Unit
Supplier
Customer
User
Payment Method
```

as appropriate.

---

# 81. Database Foreign-Key Philosophy

Use relational foreign keys where they protect business integrity.

Historical snapshots remain alongside IDs when later master changes must not alter historical meaning.

---

# 82. Snapshot Philosophy

Store snapshots only for facts whose historical interpretation must remain stable.

Examples:

```text
Product name on transaction
Unit conversion
Price/tier/promotion
Tax
Cost
Cashier display context if needed
```

Do not duplicate every current master field unnecessarily.

---

# 83. Database Migration Discipline

All production schema changes use versioned migrations.

Never rely on application startup auto-creating/changing critical production tables as the primary migration strategy.

---

# 84. Seed Data

Seed scripts should distinguish:

```text
System defaults
Development/demo data
Business onboarding data
```

Never seed fake purchase history into production onboarding.

---

# 85. API Style

Recommended:

```text
JSON HTTP APIs
```

with explicit command/query endpoints.

Avoid requiring GraphQL unless a real need emerges.

---

# 86. Command API Examples

Conceptual:

```text
POST /commands/products/create
POST /commands/purchases/receive
POST /commands/purchases/post
POST /commands/pricing/approve
POST /commands/sales/complete
POST /commands/returns/complete
POST /commands/shifts/close
```

Exact route design belongs to API Contract phase.

---

# 87. Query API Examples

```text
GET /products
GET /products/:id
GET /purchases/:id
GET /inventory/positions
GET /pricing/review
GET /transactions/:id
GET /attention
```

---

# 88. Sync API

Conceptual:

```text
POST /sync/push
GET  /sync/pull
GET  /sync/bootstrap
POST /sync/ack
```

Exact envelopes deferred.

---

# 89. Error Contract

All apps use common stable error codes.

Examples:

```text
VALIDATION_ERROR
PERMISSION_DENIED
VERSION_CONFLICT
PRICE_BELOW_FLOOR
SHIFT_REQUIRED
SHIFT_CLOSED
PAYMENT_INSUFFICIENT
RETURN_QTY_EXCEEDED
DUPLICATE_COMMAND
CLOCK_UNTRUSTED
ONLINE_REQUIRED
```

User-facing copy is separate from error code.

---

# 90. Domain Validation Location

Critical business rule validation runs server-side.

Offline-safe paths also run the same shared deterministic rule locally where possible.

Server remains final validation on sync.

---

# 91. Client Trust Boundary

Never trust client-provided derived values blindly.

Server may validate/recompute:

```text
base quantities
pricing math
discount allocation
cash expected amount
landed cost
margin/floor warnings
```

Historical customer-facing final price is still preserved when a valid offline sale occurred.

---

# 92. Server Time

Server time is authoritative for:

```text
Price publication
Scheduled price boundaries
Promotion publication
permission/session expiry
```

Clients synchronize trusted-time metadata.

---

# 93. Clock Trust

Client tracks:

```text
last_server_time
local_time_at_sync
estimated_offset
clock_trust_status
```

If untrusted while offline:

```text
do not guess scheduled price activation
```

---

# 94. PWA Architecture

POS:

```text
Installable PWA
Offline app shell
IndexedDB operational data
Service worker asset caching
Background/foreground sync triggers where platform allows
```

Business correctness must not depend on Background Sync API availability.

---

# 95. Service Worker Responsibilities

Service worker handles:

```text
App shell/static asset caching
Update lifecycle
Optional network caching policy
```

It should not contain core business rules.

---

# 96. App Update Safety

New frontend version must not destroy pending local events.

Before local database migrations:

```text
Preserve outbox
Migration tests
Backward-compatible pending payload handling
```

---

# 97. Contract Versioning

Every sync/command envelope should support:

```text
schema_version
client_version
```

Server can return:

```text
UPDATE_REQUIRED
```

if old client cannot safely continue.

---

# 98. Deploy Environments

Minimum:

```text
development
staging
production
```

Do not test migrations/sync protocol changes first in production.

---

# 99. Database Environments

Each environment has separate PostgreSQL data.

Never point local development to production database by default.

---

# 100. Deployment Independence

Possible deployments:

```text
Back Office
POS
API
```

can deploy independently while sharing compatible contracts.

---

# 101. Compatibility Policy

Frontend deployment must be compatible with:

```text
Current API contract
Pending local outbox payloads
Current database schema
```

Breaking sync contract requires controlled migration/version strategy.

---

# 102. CI Pipeline

Minimum CI:

```text
Install
Typecheck
Lint
Unit Tests
Build Back Office
Build POS
Build API
Domain Contract Tests
```

Later:

```text
Integration Tests
E2E
Migration Tests
```

---

# 103. Domain Unit Tests

Highest-value deterministic tests:

```text
Margin formula
Floor price
Rounding
Price tier resolution
Promotion priority
Discount allocation
Unit conversion
Landed cost
MWA
Negative stock reconciliation
Returnable quantity
Return cost reversal
Expected cash
Cash variance
```

---

# 104. Server Integration Tests

Use real/test PostgreSQL for:

```text
Complete Sale atomicity
Idempotent retry
Purchase posting
Price version overlap protection
Return/refund consistency
Stock movement uniqueness
Shift close
Optimistic concurrency
```

---

# 105. Sync Tests

Must test:

```text
Offline sale → push once
Retry same event
App restart with pending outbox
Two-device stock merge
Stale price
Stale permission
Version conflict
Late shift event
Return quantity conflict
```

---

# 106. E2E Tests

Recommended browser E2E flows:

```text
Open Shift
Scan/Add Product
Cash Sale
Split Payment
Negative Stock Warning
Return
Close Shift
Admin Receive Goods
Owner Approve Price
Offline / reconnect
```

Exact test tooling selected during implementation.

---

# 107. Observability

API should produce structured logs with:

```text
request_id
correlation_id
user_id
business_id
device_id
command
duration
result
error_code
```

Never log secrets.

---

# 108. Sync Observability

Metrics:

```text
pending duration
push success/failure
pull latency
conflict count
oldest unsynced event
device last sync
```

---

# 109. Business Observability

Business audit and exception queue are distinct from technical logs.

Do not surface raw runtime logs to Owner.

---

# 110. Error Tracking

Architecture allows integration with an error-monitoring service later.

Do not couple domain code to a vendor SDK.

Use observability adapter.

---

# 111. Database Backup

Production requires managed backup/recovery strategy appropriate for PostgreSQL.

Architecture should support:

```text
scheduled backup
point-in-time/recovery where provider supports
migration rollback planning
```

Operational policy finalized before production launch.

---

# 112. Security — Secrets

Secrets exist only in server/deployment secret storage.

Never expose:

```text
database credentials
server API secrets
signing secrets
payment provider secrets
```

through Vite `VITE_*` variables.

---

# 113. Security — Client Configuration

Client may receive non-secret configuration:

```text
API base URL
business-visible feature flags
public app version
```

No shared privileged sync token.

---

# 114. Security — Database Access

Clients never connect directly to PostgreSQL.

All cloud writes go through authenticated API.

---

# 115. Security — Business Scope

Every server query/command scopes by authenticated:

```text
business membership
```

not by trusting arbitrary `business_id` from request body.

---

# 116. Security — Permission Check

Every sensitive command checks effective permission server-side.

Examples:

```text
pricing.approve
cost.adjust
inventory.adjust
transaction.void
shift.force_close
refund.override_amount
permission.manage
```

---

# 117. Security — Rate / Abuse Protection

API architecture should allow:

```text
rate limiting
login abuse protection
command size limits
sync batch limits
```

Exact limits deferred.

---

# 118. Security — Audit Integrity

Audit events are append-only through application commands.

Normal application users cannot delete them.

---

# 119. Data Privacy

Keep customer data minimal.

Current Customer:

```text
Name
Phone optional
Notes optional
```

No unnecessary sensitive personal data.

---

# 120. Terminal Architecture

Concepts remain separate:

```text
Device
Terminal
Cash Drawer
```

v2:

```text
1 Terminal
→ 1 Operational Cash Drawer
```

Device may map 1:1 initially.

---

# 121. Location Architecture

Every operational event carries default:

```text
location_id
```

Current UI never asks normal user to switch location.

Future transfer/multi-store can extend this.

---

# 122. Multi-Location Future

Architecture must not make these impossible:

```text
location-specific stock
store-specific pricing overrides
stock transfer
warehouse
user-location assignment
```

They remain out of current UI scope.

---

# 123. Lot / Expiry Future

Inventory movement architecture can later reference:

```text
lot_id
```

without changing current Product/Base Unit identity model.

Current valuation authority remains MWA.

---

# 124. Reporting Future

Operational relational database is sufficient initially.

Do not add data warehouse/event streaming platform yet.

Future analytical replication can be introduced if volume requires it.

---

# 125. Performance Targets — POS

Architectural intent:

```text
Barcode lookup:
local and effectively instant

Add to cart:
no network dependency

Price resolution:
local deterministic calculation

Complete cash sale:
local commit must not depend on network

App startup after bootstrap:
usable from local cache
```

Exact numeric SLOs can be defined later.

---

# 126. Performance Targets — Back Office

Lists should use:

```text
server pagination
indexed queries
local caching where beneficial
```

Do not download full transaction history for every screen.

---

# 127. Database Index Strategy

Schema phase should ensure indexes for high-frequency lookup:

```text
business_id + SKU
business_id + barcode
product_id + unit
location_id + product_id
transaction_number
purchase_number
effective price lookup
stock movement source
sync sequence
audit entity
```

Exact indexes deferred to schema.

---

# 128. Referential Integrity

Database should prevent impossible states where feasible:

```text
duplicate active barcode
duplicate source stock movement
overlapping authoritative price version
orphan transaction item
orphan payment
```

Some complex rules remain application-level.

---

# 129. Unique Constraints Are Part of Idempotency

Examples:

```text
stock movement unique source
payment unique business event
refund provider reference where applicable
idempotency key unique within business/command
```

---

# 130. Legacy Migration Philosophy

Classify code/data:

```text
KEEP
ADAPT
REPLACE
REMOVE
```

Do not classify whole repositories as one category.

---

# 131. Likely KEEP / ADAPT Candidates

From existing apps, likely candidates include:

```text
Pricing formula tests
Barcode scanning integration
Dexie experience/patterns
PWA configuration
Receipt printing
Product/unit UI fragments
Existing data import concepts
Existing cloud deployment knowledge
```

Final classification requires code-level audit later.

---

# 132. Likely REPLACE Candidates

Architecturally, likely replace:

```text
Snapshot-as-primary sync
Independent canonical ownership split between apps
Shared build-time sync token
Manual back behavior forcing root routes
Direct mutable stock/cost/price patterns if present
Feature-oriented legacy navigation
```

---

# 133. Legacy Data Migration

Create explicit import/migration pipeline.

Sources may include:

```text
Inventory Pricing cloud/local data
POS cloud/local data
Legacy JSON backups
Spreadsheet opening catalog
```

Do not make production v2 read legacy databases forever.

---

# 134. Migration Staging

Recommended:

```text
1. Export legacy canonical data
2. Transform to v2 import format
3. Validate
4. Dry-run import
5. Produce migration report
6. Import to staging
7. Reconcile counts/values
8. Production cutover
```

---

# 135. Transitional Dual-Run

Avoid long-term bidirectional synchronization between legacy apps and v2.

If transitional period is required:

```text
read-only migration bridge
```

is preferable to maintaining two canonical systems.

---

# 136. Cutover Principle

At launch:

```text
v2 becomes canonical
legacy becomes read-only/archive
```

after reconciliation.

---

# 137. Documentation Architecture

Repository should keep authoritative docs under:

```text
docs/
```

and not rely solely on chat history.

---

# 138. AGENTS.md

Before Codex implementation, create:

```text
AGENTS.md
```

containing:

```text
Product topology
Architecture invariants
Build/test commands
Domain ownership rules
Do-not-break constraints
Documentation locations
Migration policy
```

---

# 139. Architecture Decision Records

Future material changes should create ADRs.

Examples:

```text
ADR-001 Monorepo
ADR-002 Sync Protocol
ADR-003 ID Strategy
ADR-004 Authentication Provider
ADR-005 Decimal Library
```

Do not silently reverse architecture decisions inside implementation PRs.

---

# 140. Deferred Technology Decisions

The following are intentionally not locked yet:

```text
ORM / query builder
exact decimal library
exact UUID flavor
auth framework/provider
error monitoring vendor
E2E test library
component library details
exact Cloudflare static hosting mechanism
```

These do not block System Architecture v1.

---

# 141. Database Schema Phase Inputs

The next Database / Domain Schema phase must translate architecture into:

```text
Business
Location
Membership
User / Role / Permission

Product
Product Unit
Barcode
Supplier

Purchase
Receipt
Supplier Return

Cost Event
Inventory Movement
Stock Balance projection

Price Proposal
Price Version
Price Tier Version
Promotion

Transaction
Transaction Item
Payment
Shift
Cash Movement

Customer
Return
Return Item
Refund

Audit Event
Exception

Device
Terminal
Sync Outbox / Server Idempotency
Change Feed
```

---

# 142. API / Sync Contract Phase Inputs

After schema, define:

```text
Command envelopes
DTOs
Query shapes
Error codes
Idempotency contract
Sync push
Sync pull
Bootstrap
Conflict payloads
Versioning
Auth/session headers/cookies
```

---

# 143. Architecture Dependency Flow

```text
Business Rules
↓
User Journeys
↓
Information Architecture
↓
SYSTEM ARCHITECTURE
↓
Database Schema
↓
API / Sync Contract
↓
Design System
↓
Screen Specifications
↓
Migration Audit
↓
Implementation
```

---

# 144. Core Architecture Invariants

1. Two frontend apps, one canonical platform.
2. New v2 lives in one monorepo.
3. React/TypeScript/Vite are retained.
4. Dexie remains local-first persistence.
5. PostgreSQL is canonical cloud persistence.
6. Backend is a modular monolith.
7. Domain ownership prevents arbitrary cross-table mutations.
8. Complete business operations use transactional application commands.
9. No full event sourcing.
10. Immutable business ledgers exist where historical meaning requires them.
11. Sync uses local outbox + incremental pull feed.
12. Snapshot overwrite is not the canonical sync mechanism.
13. WebSocket is notification, not durable truth.
14. POS cash sale completion never depends on network.
15. Price publication is online-authoritative.
16. Purchase POSTED is online-authoritative; Receiving remains offline-capable.
17. Every offline durable event has globally unique identity.
18. Retry is idempotent on client and server.
19. Mutable master conflicts use optimistic concurrency.
20. Inventory and cash never use last-write-wins balance synchronization.
21. Business Status and Sync Status remain separate.
22. Server permissions are authoritative.
23. No shared static sync token is shipped to clients.
24. Audit is append-only and distinct from domain ledgers.
25. Local projections and cloud read models are rebuildable.
26. Current UX is single-location; schema is location-aware.
27. Historical snapshots preserve original transaction meaning.
28. Legacy code is selectively migrated, not blindly copied.
29. Legacy sync/data ownership does not dictate v2 architecture.
30. Architecture favors operational correctness over infrastructure novelty.

---

# 145. Architecture Review Checklist

Before proceeding to Database Schema:

```text
[✓] Product topology mapped
[✓] Repo strategy defined
[✓] Frontend boundaries defined
[✓] Backend style defined
[✓] Domain modules defined
[✓] Local persistence defined
[✓] Cloud persistence defined
[✓] Offline authority defined
[✓] Sync pattern defined
[✓] Idempotency defined
[✓] Concurrency strategy defined
[✓] Authentication boundary defined
[✓] Permission boundary defined
[✓] Audit boundary defined
[✓] Deployment topology defined
[✓] Migration direction defined
[✓] Testing strategy defined
[✓] Deferred decisions explicitly listed
```

---

# 146. Final System Architecture

```text
                         KASTUR RETAIL SYSTEM
                                  │
            ┌─────────────────────┴─────────────────────┐
            │                                           │
     KASTUR BACK OFFICE                           KASTUR POS
     React / TypeScript                           React / TypeScript
     Vite                                         Vite + PWA
     Dexie                                        Dexie
     Selective Offline                            Strong Offline
            │                                           │
            └─────────────────────┬─────────────────────┘
                                  │
                        AUTHENTICATED API
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
       COMMAND / QUERY API                      SYNC PLATFORM
              │                              Push / Pull / Bootstrap
              │                              Optional WS notification
              │                                       │
              └───────────────────┬───────────────────┘
                                  │
                         MODULAR MONOLITH
                                  │
      ┌────────┬────────┬────────┬────────┬────────┬────────┐
      │Catalog │Purchase│Costing │Pricing │Inventory│ Sales │
      ├────────┼────────┼────────┼────────┼────────┼────────┤
      │ Cash   │Identity│Returns │ Sync   │Reporting│ Audit │
      └────────┴────────┴────────┴────────┴────────┴────────┘
                                  │
                            POSTGRESQL
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       │                          │                          │
 Current State Tables       Immutable Ledgers        Read Projections
 Master / Workflow          Stock / Cost / Cash      Attention / Reports
 Transaction Records        Price / Audit / Sync
```

---

# 147. Recommended Next Phase

The next phase is:

```text
DATABASE / DOMAIN SCHEMA v1
```

It should define:

```text
Tables
Primary keys
Foreign keys
Unique constraints
Status enums
Decimal types
Version fields
Historical snapshots
Ledger records
Idempotency records
Change feed
Indexes
Deletion/deactivation rules
Cross-domain references
```

After schema:

```text
API + Sync Contract v1
```

---

# Final Architecture Principle

> **Kastur v2 should behave locally like a resilient retail application and globally like one coherent transactional system. The POS must continue operating when the network disappears, while the cloud remains authoritative for shared master data, permissions, and published pricing. Strong domain boundaries, relational transactions, immutable business ledgers, explicit idempotency, and incremental synchronization provide the consistency needed without introducing microservice or full-event-sourcing complexity.**
