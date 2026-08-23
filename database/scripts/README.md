# Database scripts

This directory contains Node-only database operations and verification tooling. It is not application runtime code and must not be imported into `apps/api`, either frontend, or shared runtime packages.

## Migration operations

From the repository root:

```bash
npm run db:migrate:check
DATABASE_URL='postgresql://...' npm run db:migrate:status
DATABASE_URL='postgresql://...' npm run db:migrate
```

- `db:migrate:check` validates migration filenames, versions, ordering, uniqueness, UTF-8 SQL content, and the runner-owned transaction boundary without a database connection.
- `db:migrate:status` compares repository files with `public.kastur_schema_migrations` and reports applied, pending, or divergent state without applying pending migrations.
- `db:migrate` acquires the migration advisory lock, validates the exact applied prefix, and applies pending files in order.

`DATABASE_URL` is a privileged server/tooling secret and must use a direct, unpooled PostgreSQL endpoint for the intended environment. The runner rejects known Neon pooler hostnames and URL query parameters that override the validated connection target or credentials. Do not commit it, prefix it with `VITE_` or `PUBLIC_`, expose it to browser code, or rely on a production database as a local default.

The runner stops on history divergence or the first migration failure. Each migration and its history insert share one transaction, so a failed migration is rolled back and is safe to retry after the cause is fixed. The initial runner supports neither down migrations nor nontransactional SQL.

## Local integration tests

Migration integration tests require an explicitly configured, disposable local PostgreSQL admin database. They never use `DATABASE_URL`; provide the separate `TEST_DATABASE_URL` only for the test command:

```bash
TEST_DATABASE_URL='postgresql://kastur_test_runner@127.0.0.1:5432/kastur_local_test_admin' \
  npm run test:database
```

The local test setup must satisfy all of these guards:

- the host is loopback-only: `127.0.0.1`, `::1`, or `localhost`;
- the admin database name is explicitly test-named, matching `kastur_*test*` (for example, `kastur_local_test_admin`);
- the configured PostgreSQL role owns or can connect to that admin database and has `CREATEDB` permission; and
- the database and role are disposable and are never shared with development, staging, or production data.

Each integration test creates a uniquely named child database such as `kastur_migration_test_<32 lowercase hex characters>`. The test owns that child database and drops it with forced connection cleanup after the test, while leaving the configured admin database in place. A hard process or machine interruption can prevent normal cleanup; before retrying, inspect the local server and remove only confirmed orphaned `kastur_migration_test_*` databases. Remove the disposable admin database and role separately when the local test environment is no longer needed.

## First operational Business

After applying every migration to an empty development database, open the POS
login screen and copy its displayed local Device UUID. Create the first
Business, default Store, Owner membership, active Device/Terminal, CASH payment
method, default category, and short-lived opaque session in one transaction:

```bash
DATABASE_URL='postgresql://...' npm run db:business:bootstrap -- \
  --confirm-create \
  --business-name='Toko Contoh' \
  --owner-name='Pemilik' \
  --owner-email='owner@example.test' \
  --device-id='00000000-0000-4000-8000-000000000001'
```

The command prints the generated IDs and session secret once. Paste the
`session_secret` and `terminal_id` into the POS login screen; the same session
may be used for Back Office development. The session is bound to the supplied
POS Device UUID and expires after 12 hours by default. Use `--ttl-hours` only
for an intentional development interval (maximum 720 hours). The explicit
`--confirm-create` guard is mandatory, the operation rolls back atomically on
failure, and the secret is stored only as SHA-256 in PostgreSQL.

For an existing active Business/User/Device, issue another opaque session with
`npm run db:session:issue`; do not run the bootstrap command again.
