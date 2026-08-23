# Architecture Decision Records

Material architecture changes belong here as focused ADRs. An ADR should state the context, decision, consequences, and superseded decisions when applicable.

## Accepted decisions

- [ADR-0001: Forward-only SQL migrations with a repository-owned runner](./ADR-0001-forward-only-sql-migrations.md) — Node-only SQL migration execution, immutable checksummed history, locking, and failure semantics for M0-003.
- [ADR-0002: Permission catalog and built-in system role presets](./ADR-0002-permission-catalog-and-system-role-presets.md) — M1-002B Identity permission registry and built-in role presets.
- [ADR-0003: Auth and Session Contract Foundation](./ADR-0003-auth-session-contract-foundation.md) — M1-003 Auth and Session Contract Foundation.
- [ADR-0004: Catalog Master Normalization and Tenant Integrity](./ADR-0004-catalog-master-normalization-and-tenant-integrity.md) — M1-004 Catalog Master Normalization and Tenant Integrity.
- [ADR-0005: Product Unit and Barcode Relational Boundary](./ADR-0005-product-unit-barcode-relational-boundary.md) — M1-005 Product Unit and Barcode Relational Boundary.
- [ADR-0006: POS Catalog Bootstrap and Local Cache Boundary](./ADR-0006-pos-catalog-bootstrap-local-cache-boundary.md) — M1-007 POS Catalog Bootstrap and Local Cache Boundary.
- [ADR-0007: Permission-Aware Query Redaction](./ADR-0007-permission-aware-query-redaction.md) — M1-008 Permission-Aware Query Redaction.
- [ADR-0008: Shared Decimal / Money / Quantity Primitives](./ADR-0008-shared-decimal-money-quantity-primitives.md) — M2-001 Shared Decimal / Money / Quantity Primitives.
- [ADR-0009: Minimal Published Retail Price Boundary](./ADR-0009-minimal-published-retail-price-boundary.md) — M2-002 Minimal Published Retail Price Boundary.
- [ADR-0010: POS Local Shift Opening Boundary](./ADR-0010-pos-local-shift-opening-boundary.md) — M2-003 POS Local Shift Opening Boundary.
- [ADR-0011: POS Cart and Basic Totals Boundary](./ADR-0011-pos-cart-and-basic-totals-boundary.md) — M2-005 POS Cart and Basic Totals Boundary.
- [ADR-0012: POS Cash Settlement Boundary](./ADR-0012-pos-cash-settlement-boundary.md) — M2-006 POS Cash Settlement Boundary.
- [ADR-0013: Complete Sale Local Atomic Boundary](./ADR-0013-complete-sale-local-atomic-boundary.md) — M2-007 Complete Sale Local Atomic Boundary.
- [ADR-0014: Receipt 80/58 renderer boundary](./ADR-0014-receipt-80-58-renderer-boundary.md) — Immutable completed-sale receipt mapping and supported print widths.
- [ADR-0015: POS Offline Restart E2E Boundary](./ADR-0015-pos-offline-restart-e2e-boundary.md) — M2-009 POS Offline Restart E2E Boundary.
- [ADR-0016: Pre-release migration tail resequencing for Sales/Audit dependencies](./ADR-0016-pre-release-migration-tail-resequencing.md) — Repairs the unreleased PostgreSQL migration tail while preserving ADR-0001 for every retained applied history.
- [ADR-0017: Worker PostgreSQL runtime through request-scoped Hyperdrive connections](./ADR-0017-worker-postgresql-runtime.md) — Request-scoped Hyperdrive/`pg` adapter and reviewed Worker compatibility boundary.
- [ADR-0018: Operational domain integrity at the PostgreSQL boundary](./ADR-0018-operational-domain-database-integrity.md) — Database enforcement for M5–M9 lifecycle, event idempotency, price overlap, and Return/Refund separation.
- [ADR-0019: Offline pricing clock trust and stable promotion tie-break](./ADR-0019-offline-pricing-clock-and-stable-promotion-tie-break.md) — Deterministic final promotion ordering and fail-safe scheduled-price activation on POS.
