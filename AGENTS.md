# AGENTS.md — Kastur Retail System v2

This file defines mandatory instructions for all coding agents working in this repository.

## 1. Project Identity

Kastur Retail System v2 is a **new rebuild in a new monorepo**.

Legacy repositories:

- `roidtaqi/inventory-pricing-app`
- `roidtaqi/integrated-pos-app`

are **reference, code-mining, and migration sources only**.

Do not turn either legacy repository into v2.

---

## 2. Product Topology

Kastur is one product ecosystem with two deployable frontend apps:

```text
apps/backoffice
apps/pos
```

and one shared cloud platform/API:

```text
apps/api
```

Shared code belongs in intentional packages, not copied between apps.

---

## 3. Required Repository Shape

Target:

```text
apps/
  backoffice/
  pos/
  api/

packages/
  domain/
  contracts/
  local-db/
  sync-client/
  auth-client/
  ui/
  config/
  observability/
  testing/

database/
  migrations/
  seeds/
  scripts/

docs/
```

Do not introduce another app/package without a clear reason.

---

## 4. Source-of-Truth Hierarchy

Before changing domain behavior, read the relevant docs.

Primary implementation inputs:

1. `docs/Kastur_Product_Foundation_v1.md`
2. `docs/README.md` — authoritative index for the standalone D01–D10 Business Rules; all D01–D10 documents listed there are mandatory authorities
3. `docs/Kastur_Business_Rules_Cross_Domain_Matrix_D01-D10.md`
4. `docs/Kastur_Cross_Domain_Gap_Resolution_v1.md`
5. `docs/Kastur_User_Journeys_Operational_Flows_v1.md`
6. `docs/Kastur_Information_Architecture_v1.md`
7. `docs/Kastur_System_Architecture_v1.md`
8. `docs/Kastur_Database_Domain_Schema_v1.md`
9. `docs/Kastur_API_Sync_Contract_v1.md`
10. `docs/Kastur_Design_System_v1.md`
11. `docs/Kastur_Screen_UX_Specifications_v1.md`
12. `docs/Kastur_Legacy_Code_Audit_v1.md`
13. `docs/Kastur_Implementation_Roadmap_v1.md`

If two docs conflict:

- a later explicit Gap Resolution or ADR supersedes an older rule;
- otherwise stop and surface the conflict instead of inventing a new rule.

Never silently change business semantics to make implementation easier.

---

## 5. Non-Negotiable Architecture Invariants

1. V2 is a new monorepo.
2. Back Office and POS are separate frontend bundles.
3. React + TypeScript + Vite are retained.
4. Dexie/IndexedDB is retained for local operational persistence.
5. PostgreSQL is canonical shared cloud persistence.
6. Backend is a modular monolith, not microservices.
7. Clients issue business commands, not generic database mutations.
8. Durable commands are idempotent.
9. Mutable shared master data uses optimistic concurrency.
10. Completed business events are never silently overwritten.
11. Stock authority is Stock Movement Ledger; balance is a projection.
12. Cash authority is Cash Movement Ledger; expected drawer cash is derived.
13. Price authority is versioned effective-date pricing, not `ProductUnit.currentPrice`.
14. Cost history is event-based; inventory valuation uses MWA.
15. Business Status and Sync Status are separate.
16. POS cash sale must complete without network.
17. Price publication is online-authoritative.
18. Purchase `POSTED` is online-authoritative; receiving may be offline.
19. Return and Refund are separate records/states.
20. Audit is append-only and is not a substitute for domain ledgers.
21. Server permissions are authoritative.
22. WebSocket may notify; it is not canonical durable data transport.
23. Sync uses local outbox + idempotent push + incremental cursor pull.
24. Full snapshot overwrite is forbidden as canonical sync.
25. No privileged static token may be shipped in frontend code.

---

## 6. Domain Boundaries

Backend modules:

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

Only the owning domain may directly mutate its authoritative records.

Examples:

- Sales must not directly mutate `stock_balance`.
- Inventory must not mutate selling price.
- Pricing must not mutate cost history.
- Returns must not edit the original completed Transaction Item.
- Audit must not be used to reconstruct authoritative stock/cash/price.

Cross-domain business operations must go through application commands/orchestration.

---

## 7. Technical Data Rules

Use:

```text
UUID technical IDs
TIMESTAMPTZ timestamps
PostgreSQL NUMERIC for money/cost/quantity
```

API authoritative decimals are serialized as strings.

Do not use JavaScript `number` for authoritative money, cost, margin, tax, quantity, or allocation math.

Select and centralize one decimal-safe implementation before domain calculations are written.

---

## 8. Offline Rules

A locally completed offline-safe business event is not reverted merely because synchronization fails.

Local flow:

```text
domain validation
→ local Dexie transaction
→ business records
→ local ledger effects
→ audit
→ durable outbox
```

Then:

```text
sync push
→ server idempotency
→ authoritative PostgreSQL transaction
→ change feed
→ pull
```

Pending outbox entries must survive:

```text
page refresh
browser restart
PWA update
rebootstrap
```

Never implement recovery by clearing local business tables with unsynced work present.

---

## 9. Sync Rules

Forbidden:

```text
full DB snapshot replacement
clear() + bulkPut() as synchronization
last-write-wins stock balance
last-write-wins cash
generic entity CREATE/UPDATE/DELETE protocol for business events
VITE_SYNC_API_TOKEN or equivalent privileged shared client secret
```

Required:

```text
command_id
command_type
Idempotency-Key
authorization_version where applicable
correlation_id
server monotonic change cursor
explicit conflict result
```

Same command retried after an unknown network outcome must produce the same business result exactly once.

---

## 10. Pricing Rules

Pricing engine is a pure deterministic domain package.

Hierarchy:

```text
Business Default
→ Category
→ Product Unit
```

Pricing layers:

```text
Base Price
→ Quantity Tier
→ Promotion
→ Line Manual Discount
→ Transaction Discount Allocation
→ Final Price
```

Cross-unit quantities do not combine for tiers.

Maximum one Promotion applies per transaction line.

Admin proposes. Owner approves.

Do not auto-change selling price when cost changes.

---

## 11. Inventory Rules

Every stock-changing business operation creates a Stock Movement.

Never implement normal business logic as:

```text
UPDATE product SET stock = ...
```

Stock balance may be updated atomically as a projection only when the corresponding movement is written in the same local/server transaction.

Negative stock may be valid according to policy; never clamp it to zero.

---

## 12. Sales Rules

A Draft Cart is not a Sale.

A Completed Transaction is immutable.

Normal finalization must atomically bind:

```text
Transaction
Items
Pricing snapshots
Cost status/snapshot
Payments
Stock movements
Cash effects where applicable
Audit
Outbox/change feed
```

Cashier cannot arbitrarily edit price.

Do not expose cost/margin to Cashier DTOs.

---

## 13. Shift / Cash Rules

Normal sale requires active Shift.

Shift closing uses blind physical cash count:

```text
Actual first
→ Expected revealed
→ Variance
```

Closed Shift snapshot is immutable.

Late events create reconciliation records/exceptions; do not rewrite historical close.

---

## 14. Return Rules

`VOID`, `RETURN`, and `REFUND` are different concepts.

- Void = full operational cancellation while original Shift is OPEN.
- Return = merchandise event, partial/full.
- Refund = monetary settlement.

Disposition:

```text
RESTOCK
NOT_RESTOCKED
```

A Return may be Completed while Refund remains Pending.

---

## 15. Identity / Permission Rules

Built-in v2 roles:

```text
OWNER
ADMIN
CASHIER
```

There is no `SUPERVISOR` role in v2.

Role is a permission preset/job context, not the security boundary.

No shared user accounts.

Do not store plaintext passwords or PINs locally or in cloud tables.

Quick Lock must preserve user attribution and use a secure offline-unlock design.

---

## 16. UI Rules

Design direction:

```text
Modern Operational Retail
Light-first
Dark-ready
Brand-neutral
Bahasa Indonesia UI
English internal code
i18n-ready
```

Back Office:

```text
desktop-first responsive
data dense but readable
```

POS:

```text
keyboard/mouse/hardware scanner first
touch-safe
```

Never copy legacy navigation.

Primary POS nav:

```text
Kasir
Tertahan
Transaksi
Retur
Shift
```

---

## 17. Scanner Rules

On POS Sell:

```text
exact barcode → auto-add 1
repeat scan → +1
unknown barcode → lightweight feedback
successful scan → no modal
scanner-ready focus restored
```

Product images are non-essential.

---

## 18. Testing Requirements

At minimum, test every business command for:

```text
happy path
validation failure
permission failure
idempotent retry
atomic rollback
stable error code
```

Test version conflict for mutable master commands.

Critical regression tests include:

```text
offline sale survives restart
same sale never applies twice
negative stock remains negative
MWA correctness
cost pending is not zero
tier/promotion deterministic
return qty cannot exceed sold qty
blind shift close
closed shift not rewritten
rebootstrap preserves outbox
```

---

## 19. Pull Request Discipline

Prefer one coherent vertical change per PR.

Good examples:

```text
Product Unit creation end-to-end
Open Shift local + API + tests
CompleteSale idempotent sync
```

Bad examples:

```text
Implement whole POS
Implement all tables
Refactor entire repository
```

Do not mix unrelated cleanup with business feature implementation.

---

## 20. Legacy Reuse Rules

Allowed to mine/port after adaptation:

```text
pricing formulas/tests
tax/rounding ideas
Dexie transaction patterns
barcode integration
PWA setup
receipt print CSS
shift calculation ideas
CSV staging/import parsing
Cloudflare/Neon deployment knowledge
```

Must not port:

```text
snapshot sync
plaintext PIN model
Supervisor role
legacy POS navigation
legacy mutable active price/cost model
generic sync CREATE/UPDATE/DELETE
forced-root Back behavior
authoritative JS number money math
```

Read `docs/Kastur_Legacy_Code_Audit_v1.md` before copying legacy code.

---

## 21. Definition of Done

A feature is not done until relevant items pass:

```text
business rule
permission
database migration
API/contract
local/offline behavior
sync/idempotency
audit
exception behavior
responsive UI
loading/empty/error states
unit tests
integration tests
E2E for critical path
documentation update
```

---

## 22. Implementation Order

Follow the roadmap unless an explicit dependency-safe decision changes it:

```text
M0 Foundation
M1 Identity/Catalog
M2 POS Core Offline Sale
M3 Sync
M4 Shift/Cash
M5 Purchasing/Receiving
M6 Costing
M7 Pricing
M8 Inventory/Opname
M9 Return/Refund
M10 Back Office Shell
M11 Reports/Attention
M12 Migration
M13 Hardening
M14 Staging
M15 Pilot
M16 Cutover
```

Do not begin with dashboards/reports before the operational spine works.

---

## 23. When You Encounter Ambiguity

Do not guess a new business rule.

Instead:

1. search authoritative docs;
2. identify the exact conflict/missing rule;
3. propose the smallest explicit decision/ADR;
4. continue only after the decision is resolved when it materially affects correctness.

Implementation detail ambiguity that does **not** alter product/business semantics may be resolved pragmatically and documented.

---

## 24. First Operational Spine

The first meaningful end-to-end target is:

```text
Business
→ User
→ Product / Product Unit / Barcode
→ Published Retail Price
→ POS Bootstrap
→ Open Shift
→ Scan
→ Cash Payment
→ Complete Sale Offline
→ Local Stock Movement
→ Receipt
→ Outbox
→ Sync Push
→ PostgreSQL
→ Sync Pull
→ Back Office visibility
```

Optimize implementation sequencing around proving this spine early.
