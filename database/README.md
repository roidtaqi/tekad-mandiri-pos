# Database workspace

PostgreSQL is Kastur's canonical shared cloud database. This directory is reserved for versioned migrations, controlled seed categories, and database-support scripts.

M0-003 establishes a repository-owned, Node-only, SQL-first migration harness. The decision and its safety guarantees are recorded in [ADR-0001](../docs/decisions/ADR-0001-forward-only-sql-migrations.md). The harness does not select an ORM or query builder and does not run as part of application startup.

- [`migrations/`](./migrations/) — immutable, ordered production schema changes
- [`seeds/`](./seeds/) — future system defaults, development/demo data, and onboarding data kept explicitly separate
- [`scripts/`](./scripts/) — Node-only migration and database-verification tooling

M0-003 contains migration infrastructure only. Domain tables and seed data begin in their roadmap tasks; M1-001 owns the first Business and Location migrations.

Database commands require a server/tooling-only `DATABASE_URL` that points to the intended environment through a direct, unpooled PostgreSQL endpoint. Never expose this secret through `VITE_*`, `PUBLIC_*`, frontend source, or a Worker bundle.
