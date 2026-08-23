# Database workspace

PostgreSQL is Kastur's canonical shared cloud database. This directory is reserved for versioned migrations, controlled seed categories, and database-support scripts.

The repository owns a Node-only, SQL-first migration harness. Its safety
guarantees are recorded in [ADR-0001](../docs/decisions/ADR-0001-forward-only-sql-migrations.md).
The harness does not run as part of application startup.

- [`migrations/`](./migrations/) — immutable, ordered production schema changes
- [`seeds/`](./seeds/) — controlled system, development, or migration seed material kept explicitly separate
- [`scripts/`](./scripts/) — Node-only migration and database-verification tooling

Database commands require a server/tooling-only `DATABASE_URL` that points to the intended environment through a direct, unpooled PostgreSQL endpoint. Never expose this secret through `VITE_*`, `PUBLIC_*`, frontend source, or a Worker bundle.

The current schema is the exact ordered prefix in [`migrations/`](./migrations/).
Append a new migration; never edit an already released migration. The guarded
first-Business/session tooling and disposable integration-test requirements are
documented in [`scripts/README.md`](./scripts/README.md).
