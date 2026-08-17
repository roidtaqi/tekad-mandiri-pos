# `@kastur/local-db`

`@kastur/local-db` owns Kastur's browser-side Dexie/IndexedDB infrastructure.
It provides explicit database factories and lifecycle control; it does not own
business rules, application routing, cloud persistence, or synchronization.

## Separate database identities

POS and Back Office always use separate physical databases, even when both
applications share an origin:

| Application | Stable IndexedDB name | Current schema version |
| --- | --- | ---: |
| POS | `kastur-pos` | 3 |
| Back Office | `kastur-backoffice` | 1 |

Database names do not contain Business, Location, User, or other domain IDs.
The two schema histories may advance independently.

## Public API and lifecycle

Import only from the package root:

```ts
import {
  createBackOfficeLocalDatabase,
  createPosLocalDatabase,
} from "@kastur/local-db";

const database = createPosLocalDatabase();
await database.open();

// Use future explicit local application services here.

database.close();
```

Each call constructs a closed instance. Importing the package and constructing
an instance do not open IndexedDB. There is no global singleton and no public
delete/reset operation. `open()` is explicit, `close()` is safe to call during
normal teardown, and `isOpen()` reports the connection state.

Dexie auto-open is disabled. On `versionchange`, an older connection closes so
a newer application version is not blocked indefinitely; it cannot silently
reopen through a table operation.

The public factories do not expose raw Dexie instances or internal schema
registration helpers. Application code must not deep-import package internals.

## Versioning rules

The logical schema convention is:

```text
positive integer versions
strictly increasing source order
unique declarations
append-only released history
```

Version 1 is an intentional, valid empty schema for both applications. It
establishes the lifecycle without introducing a technical placeholder store.
IndexedDB does not require an object store, so no production store is needed in
M0-005.

To add a future schema version:

1. change only the application whose local schema evolves;
2. append the next integer declaration after every released declaration;
3. update that application's explicit current-version constant;
4. declare schema changes with Dexie `stores()` and data transformations with
   that version's transactional `upgrade()` callback;
5. add migration tests from the previously released schema and verify direct
   multi-version progression where supported;
6. never renumber, delete, reorder, or rewrite a released declaration.

The registration layer rejects missing, fractional, duplicate, decreasing, and
non-positive versions before IndexedDB opens. Dexie internally represents its
logical versions differently from the native `IDBDatabase.version`; application
code should use the exported Kastur schema-version metadata. This local schema
version is independent from API/sync payload contract versions.

## Upgrade safety

Schema changes must use IndexedDB's transactional version upgrade through
Dexie. If an upgrade callback fails, its schema and data changes must roll back
together. A migration must preserve previously valid local facts unless an
explicit, reviewed transformation says otherwise.

Normal recovery must never use either of these destructive patterns:

```text
deleteDatabase() -> recreate
clear() -> bulkPut(full snapshot)
```

Database deletion is test cleanup only. It is deliberately absent from the
production public API. Future rebootstrap behavior must preserve pending durable
local work and belongs to a later sync milestone.

## Migration tests

Migration tests use an isolated in-memory IndexedDB implementation and unique
test-only database names. Neutral fixture stores such as `records` may exist
inside tests to prove data transformation and rollback, but they must never be
exported or registered by a production factory.

The migration suite must cover creation, close/reopen, POS/Back Office
isolation, ordered multi-version upgrades, no repeated upgrade at the latest
version, preservation of existing fixture data, failed-upgrade rollback,
versionchange connection release, and reliable cleanup.

Run it from the repository root with `npm run test:local-db`.

## Cache Strategy

Both Catalog (V2) and Pricing (V3) caches are server/cloud authoritative master projections.
The following constraints apply:
- **PostgreSQL authoritative**: Local caches are read-only projections.
- **Focused initial bootstrap only**: Currently only initial add-only bootstrap exists.
- **Exact raw unit_price string retained**: To prevent IEEE 754 precision loss.
- **Repeat same-Business bootstrap is rejected**.
- **Multiple Business caches coexist**.
- **No destructive clear+bulkPut / snapshot overwrite**.
- **No sync cursor, change feed, or outbox**.
- **No scheduled local activation**.
- **No raw Dexie public access is exposed**.

M3 owns real Sync (cursors, change feeds, outboxes). M7 owns full Pricing governance, scheduling, and offline resolvers.

## POS Schema History

- **POS V1**: Empty schema establishing lifecycle.
- **POS V2**: Defines `products`, `product_units`, `barcodes`, and `catalog_bootstrap_state`.
- **POS V3**: Defines `published_retail_prices` and `pricing_bootstrap_state`.

Business, identity, inventory, purchasing, sales, shift/cash, returns, customer, outbox, cursor, failure-queue, and change-feed stores are deferred to their authorized vertical slices. This package also contains no generic repository, CRUD engine, or synchronization workflow.
