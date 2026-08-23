# ADR-0018: Operational domain integrity at the PostgreSQL boundary

Status: Accepted  
Date: 2026-08-23

## Context

The initial M5–M9 tables captured most documented columns but left important
cross-record invariants entirely implicit. The integrated command runtime needs
database constraints that fail atomically under retries and concurrent devices,
without turning projections into business authorities.

## Decision

- Add a forward migration for documented Purchase, Pricing, Inventory, Return,
  and Refund lifecycle/value constraints.
- Make a Cost Event's business/location/product/source/event role unique so a
  retry cannot apply the same cost role twice.
- Protect published `SCHEDULED`/`ACTIVE` Price Version ranges with PostgreSQL's
  GiST exclusion constraint. The migration enables `btree_gist`; the command
  layer still validates and reports a stable business conflict.
- Make Stock Movement source-role uniqueness use `NULLS NOT DISTINCT`, so a
  missing `source_line_id` does not create an idempotency hole. Stock balance
  remains only a projection updated with the corresponding movement.
- Add the missing D09 Return/Refund facts while retaining compatibility columns
  until callers and reports complete their transition. Return and Refund remain
  independent records and lifecycle states.
- Keep supplier invoice/external provider reference detection as non-unique
  index aids where the authoritative rules call for review rather than a blanket
  hard block.

## Consequences

Operational command transactions fail closed if they attempt invalid lifecycle
values, duplicate authoritative event roles, overlapping live price versions, or
invalid quantities. PostgreSQL 15 or newer is required for `NULLS NOT DISTINCT`;
the supported integration and deployment baseline is PostgreSQL 16. Migration
credentials must be allowed to enable the supported `btree_gist` extension.

This ADR does not permit direct table mutation from clients and does not replace
domain validation, server permissions, idempotency records, audit events, or the
change feed.
