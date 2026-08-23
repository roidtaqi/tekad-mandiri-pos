# Kastur Retail System v2

Kastur Retail System v2 is a new offline-first retail-system rebuild. This
repository is the v2 monorepo; `inventory-pricing-app` and
`integrated-pos-app` are read-only reference and migration sources.

The repository contains two independent React/Vite frontends, a Worker-class
modular-monolith API, PostgreSQL canonical persistence, and a Dexie-backed POS
runtime with durable command synchronization.

```text
apps/backoffice  authenticated operational Back Office
apps/pos         installable offline-first POS
apps/api         HTTP command/query/sync API
packages/*       intentional shared contracts, domain, UI, auth, sync, and local DB
database/*       forward-only PostgreSQL migrations and controlled tooling
docs/*           authoritative product, architecture, execution, and operations docs
```

Back Office and POS are separate build/deployment units. Shared capabilities
must be imported through an explicit `@kastur/<package>` public entry point;
deep cross-workspace source imports are forbidden.

## Local start

Prerequisites are Node.js 22.12+ (or Node.js 24+), npm 9+, and PostgreSQL 16.

```bash
npm ci
DATABASE_URL='postgresql://...' npm run db:migrate
```

Put the local API connection in the ignored `apps/api/.dev.vars` file:

```dotenv
DATABASE_URL=postgresql://...
```

Start the API and POS in separate terminals:

```bash
npm run dev:api
npm run dev:pos
```

The local Vite servers proxy `/api` to the Worker at `127.0.0.1:8787`. Open the
POS login page and copy its displayed Device UUID. For a new empty development
database, create the first operational context with the explicit bootstrap
command:

```bash
DATABASE_URL='postgresql://...' npm run db:business:bootstrap -- \
  --confirm-create \
  --business-name='Toko Contoh' \
  --owner-name='Pemilik' \
  --device-id='<device UUID shown by POS>'
```

The command prints a short-lived opaque `session_secret` and `terminal_id` once.
Use those values on the POS login screen. Start Back Office with
`npm run dev:backoffice` and use the same Owner session secret. PostgreSQL stores
only the secret hash; neither frontend bundles a privileged credential.

See [Local development](./docs/operations/LOCAL_DEVELOPMENT.md) for the complete
setup and [database scripts](./database/scripts/README.md) for guarded bootstrap
and session issuance.

## Runtime boundaries

- PostgreSQL is canonical shared persistence; migrations are never run on API
  startup.
- Dexie is the POS operational store. Offline-safe completion writes business
  records, stock/cash ledgers, audit, and outbox atomically.
- Sync uses business commands, stable command IDs, server idempotency, and an
  incremental monotonic cursor. It never replaces local business tables with a
  full database snapshot.
- The API accepts an opaque user session through a bearer header or same-origin
  cookie. POS sessions are bound to an active Device UUID.
- Local development may use the server-only `DATABASE_URL`; deployed Workers
  should use a Hyperdrive binding. Browser-visible configuration may contain
  only non-secret values such as `VITE_API_BASE_URL`.

## Verification commands

```bash
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

`TEST_DATABASE_URL` must identify a disposable loopback PostgreSQL admin
database whose name contains `test`; database tests create and drop isolated
child databases. Details are in [Testing and CI](./docs/operations/TESTING_CI.md).

## Documentation

Read [AGENTS.md](./AGENTS.md) first. The [authoritative documentation
index](./docs/README.md) identifies D01–D10 and the product/architecture sources.
Operational guides begin at [docs/operations](./docs/operations/README.md), and
current implementation evidence is tracked under
[docs/execution](./docs/execution/README.md).

Real staging, physical-device pilot evidence, production credentials, backup
policy approval, and cutover are external gates. They must not be inferred from
repository tests.
