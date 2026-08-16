# ADR-0001: Forward-only SQL migrations with a repository-owned runner

- **Status:** Accepted
- **Date:** 2026-08-16
- **Scope:** M0-003 database migration infrastructure

## Context

Kastur uses PostgreSQL as its canonical shared cloud database. The approved architecture requires ordered, version-controlled production schema changes and forbids application startup from being the primary schema-management mechanism.

The repository uses Node.js 22 and npm workspaces, while `apps/api` targets a Worker-class runtime. Migration tooling therefore needs to remain an explicit Node-only operational boundary and must not become part of the API Worker bundle. The target Neon database also requires migration connections to use a direct, unpooled endpoint.

M0-003 needs a small SQL-first harness before any domain schema is introduced. The harness must make applied history, source drift, retry behavior, concurrent execution, and failure behavior explicit.

## Decision

### Migration source format

Production schema changes are immutable, forward-only SQL files in `database/migrations/`.

Each filename must match this convention:

```text
000001_lowercase_snake_case.sql
```

The version is exactly six decimal digits. Versions must be unique and strictly increasing, and pending migrations may only extend the already-applied sequence. The description is lowercase snake case. An applied file must never be renamed, removed, or edited; a correction is a new migration.

M0-003 introduces the harness only. It does not add domain migrations, domain tables, or seed data.

### Runner boundary

The repository owns a narrow Node-only runner built on `pg`. It executes only through explicit database commands and is not imported by `apps/api`, frontend workspaces, or shared runtime packages.

The runner exposes three operations:

- **apply** — validate history and apply pending migrations in order;
- **status** — compare database history with the migration files and report applied, pending, or divergent state;
- **static check** — validate filenames, versions, ordering, uniqueness, SQL text, and the runner-owned transaction boundary without connecting to PostgreSQL.

Migrations are never applied automatically during API or frontend startup.

### Connection and secret boundary

Database operations read `DATABASE_URL` from the server/tooling process environment. It must identify the intended environment explicitly and use a direct, unpooled PostgreSQL endpoint.

`DATABASE_URL` is a privileged secret. It must not use a `VITE_*` or `PUBLIC_*` name, be committed to the repository, be exposed to browser code, or be bundled into the Worker. Local, CI, staging, and production databases use separate credentials and databases.

### History and drift detection

The runner owns one infrastructure metadata table:

```text
public.kastur_schema_migrations
```

It records:

- `version` — the six-digit migration version and primary key;
- `filename` — the exact applied filename;
- `checksum_sha256` — the SHA-256 digest of the exact applied file bytes;
- `applied_at` — a `TIMESTAMPTZ` recording successful application.

The runner validates that recorded rows are an exact prefix of the sorted repository files. A missing, renamed, reordered, or checksum-mismatched applied file is divergence and stops both status validation and apply. New files inserted before an applied version are also rejected.

The repository forces LF checkout line endings for `database/migrations/*.sql`, keeping exact-byte checksums stable across supported developer and CI platforms.

The history table is migration infrastructure, not a business or audit authority.

### Locking, transactions, and retry behavior

Apply uses one direct PostgreSQL session and holds a stable session-level advisory lock for the complete apply operation. This prevents two runners from applying the same sequence concurrently.

Each pending file is applied in its own transaction:

```text
BEGIN
→ execute migration SQL
→ insert its history row
→ COMMIT
```

If either the SQL or history insert fails, the runner rolls back that migration, records no successful history row, stops immediately, and exits unsuccessfully. Previously committed migrations remain applied. A retry revalidates their filenames and checksums, skips them, and resumes with the first pending migration. This makes a successful migration idempotent across retries, including retries after an uncertain client-side outcome.

Migration files must not issue transaction-control statements themselves. Static validation rejects PostgreSQL transaction-control forms outside quoted strings, comments, and dollar-quoted procedural bodies. The runner owns `BEGIN`, `COMMIT`, and `ROLLBACK` so the history insert and migration SQL retain one atomic boundary.

### Rollback philosophy

Production recovery is forward-only. A schema defect is corrected with a new migration; an environment-level failure may require restoring the managed PostgreSQL backup according to the deployment runbook. The runner deliberately provides no automatic down command that could erase completed business data.

### PostgreSQL and Neon compatibility

The runner uses PostgreSQL SQL, transactions, and session advisory locks through the standard `pg` driver. For Neon, migration operations use a direct, unpooled connection string so the advisory lock remains attached to one database session. Known Neon pooler hostnames and query-string connection-target overrides are rejected. This decision does not select the future Worker query transport, provision Hyperdrive, or add any Cloudflare resource identifier.

### Deliberate exclusions

The initial harness does not support:

- down or rollback migration files;
- nontransactional migrations;
- ORM- or query-builder-generated migrations;
- automatic application-startup migration;
- domain tables or data seeds.

A schema correction is made through a new forward migration. A future need for PostgreSQL operations that cannot run in a transaction requires a separate explicit decision because it changes failure and recovery guarantees.

## Consequences

### Positive

- SQL remains directly reviewable and portable.
- The runtime dependency surface is small and cannot leak into the Worker bundle.
- Checksums detect changes to already-applied files.
- Exact-prefix validation makes repository/database divergence explicit.
- The advisory lock prevents concurrent apply races.
- Per-file atomicity keeps schema changes and successful history in agreement.
- Explicit status and static checks are suitable for local and CI deployment gates.

### Negative

- The project owns a small piece of production-critical infrastructure.
- The runner requires focused unit and real-PostgreSQL integration tests.
- Forward-only recovery may require a corrective migration or environment restore rather than an automatic down command.
- Nontransactional PostgreSQL operations are unavailable until their recovery semantics are designed explicitly.

## Alternatives considered

### `node-pg-migrate`

`node-pg-migrate` is active, Node-native, supports SQL files, advisory locking, ordered execution, and transactional history updates. It was not selected because its standard history records migration identity and application time without a content checksum, and it does not provide the exact status/drift contract required here without repository-owned wrapping.

### `dbmate`

`dbmate` offers plain SQL and useful status/strict CLI behavior. It was not selected because its standard history is version-only, it does not provide the required checksum and locking guarantees as one explicit contract, and its npm distribution introduces a platform-specific binary into this Node workspace.

### Graphile Migrate

Graphile Migrate provides strong SQL-first workflows, hashes, and transactional behavior. It was not selected because its shadow-database and development workflow are broader and more opinionated than the small M0-003 infrastructure boundary requires.

## Follow-up constraints

- Integration tests must cover first apply, no-op retry, failed-SQL rollback, atomic history, checksum drift, missing or out-of-order files, and concurrent apply attempts.
- CI and deployment workflows must use an environment-scoped direct `DATABASE_URL` and run migrations explicitly before deploying code that depends on them.
- M1-001, not M0-003, owns the first Business and Location domain migrations.
