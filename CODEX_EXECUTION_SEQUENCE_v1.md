# Kastur v2 — Codex Execution Sequence v1

Use this file as the task-planning map. Do not treat each line as permission to implement everything in one run.

---

## M0 — Foundation

```text
M0-001 Bootstrap monorepo
M0-002 Shared config/testing/build conventions
M0-003 API runtime + database migration harness
M0-004 Design-token/UI primitive foundation
M0-005 Dexie local-db package skeleton + migration tests
```

Gate:

```text
clean clone builds/tests all workspaces
```

---

## M1 — Identity / Business / Catalog

```text
M1-001 core Business/Location migrations
M1-002 Identity schema + built-in roles/permissions
M1-003 Auth/session contract foundation
M1-004 Catalog Product/Category/Brand schema
M1-005 Product Unit + Barcode
M1-006 Back Office Product list/create/detail
M1-007 POS catalog bootstrap/local cache
M1-008 Permission-aware query redaction
```

Gate:

```text
Owner/Admin can create product/unit/barcode
Cashier receives safe POS cache
```

---

## M2 — POS Core Offline Sale

```text
M2-001 Shared decimal/money/quantity primitives
M2-002 Published retail price minimal resolver
M2-003 POS local Shift opening
M2-004 ScannerCapture + barcode local lookup
M2-005 Cart + totals
M2-006 Cash payment
M2-007 CompleteSale local atomic transaction + outbox
M2-008 Receipt 80/58 renderer
M2-009 Offline/restart E2E
```

Gate:

```text
offline cash sale survives restart
```

---

## M3 — Sync

```text
M3-001 Server idempotency records
M3-002 Change feed
M3-003 Bootstrap
M3-004 Sync push
M3-005 Sync pull/cursor
M3-006 Client retry/recovery
M3-007 Rebootstrap with pending outbox
M3-008 Multi-device/idempotency integration tests
M3-009 Optional WebSocket invalidation
```

Gate:

```text
same offline sale reaches PostgreSQL exactly once
```

---

## M4 — Shift / Cash

```text
M4-001 Cash ledger
M4-002 Cash In/Out/Safe Drop
M4-003 Shift summary
M4-004 Blind closing snapshot
M4-005 Cash variance exception
M4-006 Quick Lock
M4-007 Late-event reconciliation
```

---

## M5 — Purchasing / Receiving

```text
M5-001 Supplier + ProductSupplier
M5-002 Purchase draft/order/agreed snapshot
M5-003 Receive Goods offline
M5-004 Purchase invoice/charges
M5-005 Purchase Post server authority
M5-006 Integrity comparison/exceptions
M5-007 Supplier Return
```

---

## M6 — Costing

```text
M6-001 Landed-cost engine
M6-002 MWA engine
M6-003 Cost events/projection
M6-004 Pricing reference cost
M6-005 Negative-stock cost fallback
M6-006 COGS reconciliation
```

---

## M7 — Pricing

```text
M7-001 Margin policy hierarchy
M7-002 Rounding/tax/calculator port
M7-003 Price proposal
M7-004 Owner approval/direct change
M7-005 Price version/effective scheduling
M7-006 Quantity tiers
M7-007 Promotions
M7-008 POS offline price resolver
```

---

## M8 — Inventory

```text
M8-001 Inventory position/movement read models
M8-002 Manual adjustment
M8-003 Opname session/count snapshot
M8-004 Concurrent sale/receiving behavior
M8-005 Recount/review/post
```

---

## M9 — Return / Refund

```text
M9-001 Return search/eligibility
M9-002 Linked partial/full return
M9-003 RESTOCK / NOT_RESTOCKED
M9-004 Refund
M9-005 Pending/failed refund queue
M9-006 Exchange
M9-007 No-receipt controlled flow
```

---

## M10–M11 — Back Office / Reports

Implement final IA shell, contextual hubs, attention queue, reports, settings, and sync diagnostics only after operational domain paths exist.

---

## M12–M16

Migration, hardening, staging, pilot, and cutover follow the Implementation Roadmap and require explicit production decisions before final execution.
