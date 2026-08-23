# Testing and CI

Run the final candidate from a clean dependency install:

```bash
npm ci
npm run api:types:check
npm run db:migrate:check
npm run typecheck
npm run lint
npm test
npm run check:boundaries
npm run test:ui
npm run test:local-db
npm run build
npm run api:smoke
TEST_DATABASE_URL='postgresql://...' npm run test:database
git diff --check
```

`TEST_DATABASE_URL` is separate from `DATABASE_URL`. It must use a loopback host
and a disposable PostgreSQL admin database whose name includes `test`. The test
role needs `CREATEDB`; each integration file owns and drops a uniquely named
child database. Inspect and remove only confirmed orphaned
`kastur_migration_test_*` databases after an abnormal process interruption.

The GitHub workflow has two required jobs:

- `verify`: install, generated API types, migration syntax/history, typecheck,
  lint, all non-database tests, builds, and Worker smoke;
- `database-integration`: PostgreSQL 16 service plus the complete real database
  suite.

Repository success is not pilot evidence. Gates A–I require focused proof for
offline restart, exactly-once sync, operational domains, real API-backed Back
Office, and security isolation. Update `docs/execution/ACCEPTANCE_REGISTRY.md`
with the exact test file/command rather than a status label alone.
