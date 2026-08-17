# ADR-0013: Complete Sale Local Atomic Boundary

## Status
Accepted

## Context
Kastur POS transactions (sales) require deterministic offline operation and reliable persistence before syncing. The finalization step must bind the transaction, pricing snapshots, cost status, payments, stock movements, and outbox creation into a single atomic change.

We encountered issues with overlapping concerns, external domain logic leaking into the persistent storage boundary, and unstable or collision-prone technical IDs. Furthermore, the handling of offline business rules such as precision math, business isolation, and idempotency needed absolute strictness without floating point fuzziness.

## Decision

1. **Native Single Transaction:** The local Database (`@kastur/local-db`) handles CompleteSale using exactly one native Dexie `rw` transaction covering `shifts`, `transactions`, `transaction_items`, `payments`, `stock_movements`, and `outbox`.
2. **Numeric Enforcements:** All money, quantity, and conversion boundaries are strictly parsed and compared using `@kastur/numeric` primitives. No generic `parseFloat` or `Number` math is permitted during the authoritative write sequence.
3. **Internalized Logic:** The `PosSalesManager.completeSale` method encapsulates full revalidation of the `Cart` input locally, rather than trusting upstream application logic or introducing cross-package domain leakage. It strictly validates `auth`, `permissions`, and `business_id` isolation.
4. **Collision Resistance:** `transaction_number` is derived directly from the canonical `transaction_id` (a UUID), avoiding time-based collision risks like `TX-${Date.now()}`.
5. **Idempotency Fingerprinting:** Requests are fingerprinted based on an exact snapshot of the inputs (`cart.lines`, `occurred_at`, `device_id`, etc.). The transaction trap handles `ConstraintError` from Dexie to correctly route duplicate commands or surface `IDEMPOTENCY_KEY_REUSE_ERROR`.
6. **Immutable Reads:** The module exposes a strictly typed `getCompletedSale(transactionId)` interface for downstream verification without exposing the raw storage primitives.
7. **CompleteSale local atomic command:** CompleteSale is exactly one local atomic command using exactly five V5 stores.
8. **POS V5 locked:** V1–V4 are immutable. POS is now V5.
9. **Status strictness:** COMPLETED business status + PENDING sync status.
10. **Math strictness:** Exact numeric boundaries/no implicit rounding, semantic CASH, no synthetic payment_method_id, payment amount != tendered/change.
11. **Cart revalidation:** Captured conversion/tracking, immutable historical price snapshot, RETAIL/no promo/no discount/NO_PPN M2 snapshot, COST_PENDING/null, never fake cost zero.
12. **Shift safety:** Terminal from active Shift only. Shift PENDING may complete Sale. Future Shift Open + outbox is atomic. V4 PENDING Shift V5 backfill is in place.
13. **Stock Safety:** SALE Stock Movement Ledger handles inventory. `track_inventory=false` creates no movement. No stock balance overwrite.
14. **Idempotency constraints:** command_id/request fingerprint idempotency with concurrent/restart retry semantics.
15. **Deferred to future milestones:** No Cash Ledger, no PostgreSQL Sales schema, no sync engine. M3 owns sync/payment-method wire mapping. M4 owns Cash Ledger/full Shift-Cash. M6 owns costing. M7 owns richer pricing/tax/rounding. M2-008 owns Receipt.

## Consequences
- The local persistence layer operates with higher isolation, increasing safety and testability for fault seams.
- Future M3 sync layer can trust the exact structure and schema (V5) represented within the outbox.
