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

## Consequences
- The local persistence layer operates with higher isolation, increasing safety and testability for fault seams.
- Future M3 sync layer can trust the exact structure and schema (V5) represented within the outbox.
