# Kastur Retail System — Codex Handoff v1

**Purpose:** Operating brief for Codex implementation of Kastur Retail System v2.

---

# 1. What You Are Building

Build **Kastur Retail System v2** in a new repository.

Do not modify either legacy repository into v2.

Target:

```text
kastur-retail-system
```

Architecture:

```text
Monorepo
├── Back Office React app
├── POS React/PWA app
├── Modular Monolith API
├── Shared domain/contracts/UI/local-db/sync packages
└── PostgreSQL
```

---

# 2. Legacy Repositories

Reference only:

```text
roidtaqi/inventory-pricing-app
roidtaqi/integrated-pos-app
```

Use them to mine specific KEEP/ADAPT assets.

Do not preserve their architecture by default.

Read:

```text
docs/Kastur_Legacy_Code_Audit_v1.md
```

before porting anything.

---

# 3. Mandatory First Read

Before coding:

```text
AGENTS.md
docs/Kastur_Product_Foundation_v1.md
docs/Kastur_System_Architecture_v1.md
docs/Kastur_Database_Domain_Schema_v1.md
docs/Kastur_API_Sync_Contract_v1.md
docs/Kastur_Implementation_Roadmap_v1.md
```

For a feature, also read the relevant Domain Rules and Screen Specification.

---

# 4. Current Project State

Planning is complete through:

```text
Business Foundation
Cross-Domain Rules
User Journeys
Information Architecture
System Architecture
Database Schema
API + Sync Contract
Design System
Screen Specifications
Legacy Audit
Implementation Roadmap
```

Do not redo product discovery unless an actual contradiction is found.

---

# 5. Implementation Philosophy

Use vertical slices.

A task should ideally make one real business capability work across:

```text
domain
database
API
client/local DB
sync
UI
tests
```

Do not create hundreds of unused abstractions before the first sale can complete.

---

# 6. Milestone Order

```text
M0 Repository Foundation
M1 Identity + Business + Catalog
M2 POS Core Offline Sale
M3 Sync Platform
M4 Shift + Cash
M5 Purchasing + Receiving
M6 Costing + Inventory Valuation
M7 Pricing Governance
M8 Inventory Operations + Opname
M9 Return + Refund
M10 Back Office Operational Shell
M11 Reports + Attention
M12 Migration
M13 Hardening
M14 Staging
M15 Pilot
M16 Cutover
```

---

# 7. First Codex Assignment

Start with:

```text
CODEX_FIRST_TASK_M0.md
```

Do not jump into POS business logic until M0 acceptance criteria pass.

---

# 8. Reuse Guidance

High-value legacy candidates:

```text
pricing formula tests
rounding/tax tests
Dexie atomic transaction patterns
barcode/camera integration
PWA setup
receipt printing
shift expected-cash calculations
CSV parser/staging ideas
```

Every copied block must be reviewed against v2 contracts.

---

# 9. Critical Do-Not-Port Rules

Never port:

```text
full POS snapshot synchronization
clear() + full restore synchronization
shared VITE sync token
plaintext PIN
Supervisor role
ProductUnit.active_selling_price as canonical truth
ProductUnit.cost_price/manualCost as canonical cost truth
legacy feature-oriented navigation
generic entity CREATE/UPDATE/DELETE sync
forced Home/POS-root back navigation
```

---

# 10. Required Engineering Quality

At all times:

```text
TypeScript strict
explicit business errors
stable DTOs
database migrations
tests for deterministic domain logic
idempotent business commands
no hidden destructive writes
permission checks server-side
audit for meaningful sensitive actions
```

---

# 11. Decision Escalation

If implementation reveals a product-level contradiction:

```text
Do not silently choose.
```

Create a short decision note containing:

```text
Issue
Affected docs/rules
Options
Recommended option
Migration/compatibility impact
```

and stop only the affected task.

Unrelated tasks may continue if safe.

---

# 12. Completion Evidence per Task

Every task report should state:

```text
Files changed
Migrations added
Tests added/run
Business rules satisfied
Offline/sync implications
Known limitations
Next dependency
```

Avoid reporting only "implemented successfully."

---

# 13. Initial Success Criterion

The project first becomes meaningfully alive when this works:

```text
Create Product
→ Publish Price
→ POS Bootstrap
→ Open Shift
→ Scan
→ Complete Offline Cash Sale
→ Receipt
→ Local Stock Movement
→ Outbox
→ Sync Exactly Once
→ PostgreSQL
→ Back Office sees transaction
```

That is the initial operational spine.
