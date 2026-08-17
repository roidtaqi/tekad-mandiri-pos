# ADR 0009: Minimal Published Retail Price Boundary

**Status:** Accepted
**Date:** 2026-08-17
**Scope:** M2-002

## Context
M2-002 requires a minimal authoritative published retail-price path for the POS Core Offline Sale vertical slice. We need to define the boundaries of this implementation to avoid prematurely building the complex Pricing Governance (M7) domain while still ensuring the foundational schema is correct and future-proof.

## Decisions

A. `pricing.price_versions` is the canonical version envelope.
B. `pricing.price_tier_versions` carries the monetary unit price.
C. M2-002 resolves ONLY the RETAIL tier with `min_qty = 1`.
D. Quantity-tier resolution is NOT implemented.
E. Promotions are NOT implemented.
F. Manual discount is NOT implemented.
G. Price publication/mutation is NOT implemented.
H. POS consumes already-published pricing only.
I. POS published pricing projection uses `workspace.pos.access`.
J. `pricing.read` is NOT required for normal POS pricing consumption.
K. Role labels never grant pricing authority.
L. POS price cache contains no: cost, margin, supplier, recommendation, floor, approval, audit-sensitive fields.
M. `unit_price` is NUMERIC in PostgreSQL and string on transport/cache.
N. M2-001 `@kastur/numeric` is the arithmetic boundary.
O. Raw cached `unit_price` lexical representation may be preserved.
P. Calculation-time `MoneyValue` may be canonicalized.
Q. M2 minimal local resolver uses the last successfully cached published retail price.
R. M2 does NOT locally activate scheduled future prices.
S. Trusted-device-clock scheduling / stale-pricing policy belongs to later Pricing/Sync work, especially M7-008.
T. Price publication remains ONLINE authoritative.
U. M3 owns real bootstrap/sync cursor/change-feed integration.
V. No destructive snapshot replacement is allowed.

## Consequences
By explicitly deferring M7 complexities, we can prove the POS offline sale spine quickly and safely. The schema remains authoritative and will be naturally extended by M7.
