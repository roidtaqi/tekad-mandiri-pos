# Migrations

All production database changes must use ordered, version-controlled migrations. Application startup must not be the primary mechanism for creating or changing critical production tables.

The M0-003 harness is governed by [ADR-0001](../../docs/decisions/ADR-0001-forward-only-sql-migrations.md). It uses immutable, forward-only SQL files and a repository-owned Node runner.

## File convention

Migration files must use exactly six version digits followed by a lowercase snake-case description:

```text
000001_create_business.sql
000002_add_business_status.sql
```

The examples illustrate naming only; M0-003 adds no domain migration files.

Versions must be unique and strictly increasing. Pending files may only extend the applied sequence. Once applied, a migration file must not be edited, renamed, reordered, or removed. Add a new forward migration to correct a schema.

The initial harness intentionally has no down-migration or nontransactional-migration format. Migration SQL must not issue transaction-control commands such as `BEGIN`, `COMMIT`, or `ROLLBACK`; static validation rejects those commands because the runner owns the transaction boundary.

## Verification model

Successful applications are recorded in `public.kastur_schema_migrations` with the version, exact filename, SHA-256 checksum, and `TIMESTAMPTZ` application time. The database history must be an exact prefix of the sorted files in this directory. Any missing file, filename mismatch, checksum mismatch, duplicate version, or migration inserted below an applied version is a hard failure.

Apply holds a session-level advisory lock and executes each pending SQL file together with its history insert in one transaction. A failed file is rolled back, no success row is written for it, and execution stops. Retrying validates and skips already committed files before resuming.

See [`database/scripts/README.md`](../scripts/README.md) for the explicit apply, status, and static-check commands.
