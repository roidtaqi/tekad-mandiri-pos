# ADR-0006: POS Catalog Bootstrap and Local Cache Boundary

**Status:** Accepted  
**Date:** 2026-08-17  
**Scope:** M1-007

## Context

The POS application requires local, offline-capable access to Catalog data (Products, Product Units, and Barcodes) to support uninterrupted sales operations as described in D10 (Offline / Sync / Data Authority). The Catalog data itself is inherently cloud-authoritative. The initial bootstrap process for this cache needs a precise architectural boundary to avoid corrupting master records while still proving our local storage implementation.

## Decisions

1. **POS Catalog cache is cloud-authoritative master projection.** Local POS rows are NOT editable business masters. The only write path is an atomic application of a server snapshot.
2. **POS local DB advances from schema V1 to V2.** V1 remains immutable.
3. **M1-007 initial bootstrap is not M3 full Sync Bootstrap.** M1-007 delivers the Catalog projection. Full Sync Bootstrap (including sync cursor and other domains) is deferred to M3.
4. **No sync_cursor is persisted by M1-007.** No outbox, change feed, pull, push, retry, or rebootstrap flows are implemented here.
5. **Initial bootstrap uses add-only transactional population.** It does NOT clear existing stores. Destructive refresh patterns are prohibited.
6. **Repeated initial bootstrap for the same Business is rejected.** M3 owns safe rebootstrap/recovery.
7. **Multiple Business caches may coexist physically.** The DB name remains `kastur-pos`. All public read operations are scoped by `business_id`.
8. **Raw Dexie is not exposed publicly.**
9. **Barcode remains exact TEXT.** Leading zeros must be preserved and strictly compared as strings.
10. **`conversion_factor` remains exact decimal STRING.** No local conversion math using JS `number`.
11. **POS cache intentionally omits sensitive or operational fields.** Cost, MWA, margin, supplier, active selling price, stock balance, and permission metadata are not part of this cache.
12. **POS bootstrap projection requires explicit permission: `workspace.pos.access`.** It does NOT infer authority from OWNER, ADMIN, or CASHIER role names, and does NOT require `product.read`—enabling the CASHIER preset to receive the safe POS cache without Back Office Product query authority.
13. **M2-004 owns scanner capture + sellable Barcode lookup behavior.**
14. **M2-002 owns minimal published retail price resolution.**
15. **M3 owns incremental synchronization.**

## Consequences

- The POS application is strictly bound to server-authoritative Catalog state for product master data.
- The `kastur-pos` local database provides secure multi-tenant isolation, ensuring data leakage does not occur across businesses on the same device.
- Initial POS bootstrap cannot be repeatedly invoked; robust synchronization mechanisms must be awaited in M3.
- Barcode semantics are purely exact-match textual strings.
- Only the precise data required for POS sales operations is locally persisted.
