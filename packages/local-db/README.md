# `@kastur/local-db`

`@kastur/local-db` is the sole owner of Kastur browser-side Dexie/IndexedDB
persistence. It owns local schema history, atomic offline-safe operations, and
the persistence port used by sync orchestration. It does not own cloud
persistence, HTTP transport, React routing, or a generic CRUD repository.

## Database identities

| Application | Stable name | Current version |
|---|---|---:|
| POS | `kastur-pos` | 8 |
| Back Office | `kastur-backoffice` | 1 |

Database names do not embed Business, Location, or User IDs. Multiple scoped
Business projections can coexist in the POS database; every read/write service
must preserve Business isolation.

## Public lifecycle

```ts
import { createPosLocalDatabase } from "@kastur/local-db";

const database = createPosLocalDatabase();
await database.open();
// database.catalog, pricing, shifts, cash, sales, audit, sync, productLookup
database.close();
```

Construction does not open IndexedDB, Dexie auto-open is disabled, and
`versionchange` closes older connections. The public API exposes neither raw
Dexie nor production delete/reset operations. Import only from the package
root.

## POS schema history

- V1: lifecycle-only empty schema.
- V2: catalog products, units, barcodes, and bootstrap state.
- V3: published retail-price projections and pricing bootstrap state.
- V4: locally created Shift facts.
- V5: completed Sales, items, payments, stock movements, and durable outbox.
- V6: Cash Movement and Shift Closing Snapshot stores.
- V7: audit, sync state/conflicts, projection stores, observed events, compound
  sync indexes, and the canonical cash/outbox index upgrades.
- V8: non-unique Business/Product Unit pricing index so immutable current and
  scheduled Price Versions can coexist until their effective windows resolve.

Released declarations are append-only. Add the next integer version and a
transactional Dexie upgrade; never renumber, rewrite, or remove an earlier
version. A failed upgrade must roll back schema and data together.

## Atomic operational boundaries

Offline Open Shift and Complete Sale validate cached authorization and decimal
strings, then commit their business aggregate, ledger effects, audit event, and
durable outbox in one Dexie transaction. Cash In/Out/Safe Drop and blind Shift
close follow the same audit/outbox boundary. Completed Sales remain immutable,
stock/cash authority is movement-based, and a negative ledger-derived balance
is never clamped.

The sync store provides:

- stable command lookup and unresolved status summaries;
- atomic leases with expired-lease recovery;
- retry/review settlement without losing business facts;
- scoped bootstrap/rebootstrap that preserves pending work;
- incremental projection-page application with expected-cursor checks;
- explicit conflict and observed-event persistence.

Price bootstrap and pull retain immutable tier snapshots and promotions.
Successful sync samples server/local clock offset atomically with the cursor.
Trusted clocks may activate an already-published scheduled version; an
untrusted clock resolves at the last observed server time and records an
explicit warning instead of guessing a future/expired price.

`@kastur/sync-client` owns HTTP/retry/orchestration. This package never performs
network I/O. Recovery must not delete the database or run a full-table
`clear()+bulkPut()` replacement while unresolved work exists.

## Testing

Tests use isolated in-memory IndexedDB databases and cover every released
upgrade path, rollback, restart persistence, atomic operational failure,
idempotent command reuse, lease recovery, rebootstrap/outbox preservation,
cursor safety, and Business scoping.

```bash
npm run test:local-db
```

Test-only database deletion is confined to the internal test seam and is not a
production API.
