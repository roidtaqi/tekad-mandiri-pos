# Kastur Retail System v2

Kastur Retail System v2 is a new, offline-first retail-system rebuild. This repository is the v2 monorepo; the legacy `inventory-pricing-app` and `integrated-pos-app` repositories are reference and migration sources only.

M0-005 adds the shared Dexie/IndexedDB lifecycle and migration-test foundation. It contains no business stores, repositories, outbox, or sync implementation. The existing M0-003 Worker/PostgreSQL infrastructure and M0-004 UI foundation remain unchanged.

## Repository layout

```text
apps/
  api/          Worker-class HTTP API
  backoffice/   Kastur Back Office React application
  pos/          Kastur POS React/PWA application
packages/
  auth-client/
  config/
  contracts/
  domain/
  local-db/
  observability/
  sync-client/
  testing/
  ui/
database/
  migrations/
  scripts/
  seeds/
docs/
```

Back Office and POS are separate build and deployment units. Shared capabilities belong in explicit packages.

The shared packages are private source workspaces. Each exposes only its explicit `src/index.ts` public entry point and is independently typechecked, while deployable consumers bundle the source. Import a package by its `@kastur/<package>` name; deep or relative cross-workspace source imports are forbidden. Emitted-library packaging is unnecessary while all consumers remain inside this private monorepo.

## Configuration boundaries

The TypeScript hierarchy keeps runtime assumptions explicit:

```text
tsconfig.base.json      strict, environment-neutral defaults
tsconfig.browser.json   browser/React APIs, without Node globals
tsconfig.worker.json    environment-neutral base for Worker applications
tsconfig.node.json      Node-only tooling
tsconfig.test.json      repository tests running in Node
```

Application production configs include source only. Their separate test configs add the types needed by the current Node-based unit-test harness, while root tooling is checked by the root `tsconfig.json`.

The API uses a Worker-class runtime with generated, compatibility-date-specific types. The checked-in Worker configuration uses compatibility date `2026-08-16`, selected as the M0-003 implementation date supported by the pinned Wrangler/workerd toolchain. The date is not advanced automatically: review a date change as an infrastructure update, regenerate the types in the same change, and rerun typecheck, tests, build, and the local Worker smoke. Node compatibility is disabled. Because Wrangler's generated declarations include some nominal Node-global placeholders even without that flag, repository boundary checks explicitly prohibit Node-global and Node-built-in usage in production API source.

Back Office and POS share only the minimal React Vite baseline under `tooling/vite`. They remain independent applications and outputs; POS owns all PWA-specific configuration. The API's existing Vite build remains a framework-independent bundle smoke, while `wrangler.jsonc` and the local Wrangler smoke are authoritative for the Worker runtime entry point. A future deployment workflow must align its release artifact with Wrangler; M0-003 deliberately adds no deployment command or production resource access.

Vitest uses named, runtime-explicit projects in `vitest.config.ts`. Current frontend tests use server rendering in Node, API tests use Node's Web Fetch implementation as a unit-test harness, and repository-boundary tests validate the production TypeScript runtime assumptions separately. Package tests are discovered across `packages/*` in a fast Node unit-test project. `@kastur/ui` behavior runs in its own lightweight browser-like project so DOM assumptions never leak into unrelated packages.

`@kastur/local-db` is the sole Dexie owner. It exposes explicit, non-opening factories for the separate `kastur-pos` and `kastur-backoffice` IndexedDB databases. Both currently use schema version 1 with no production object stores; future vertical slices must append versions without rewriting released declarations. Migration behavior is tested in a dedicated project against an isolated in-memory IndexedDB implementation. See [the local database package guide](./packages/local-db/README.md) for lifecycle and upgrade rules.

`@kastur/config` is reserved for concrete validated non-secret runtime configuration primitives. `@kastur/testing` is reserved for concrete reusable test helpers. Their local READMEs define the intentionally narrow boundaries; neither package exports speculative APIs in M0-002.

## Shared UI foundation

Both frontend apps consume design tokens and intentionally exported primitives through the root `@kastur/ui` entry point. The package uses layered, namespaced CSS custom properties so feature code depends on semantic roles rather than raw palette values. Light is the default; a scoped dark token set and a brand-override seam are present without adding theme settings or product branding.

See [the UI package guide](./packages/ui/README.md) for the component inventory, accessibility rules, theme contract, and contribution boundary. To inspect the development-only neutral showcase:

```bash
npm run dev:ui
```

Open `/__ui` if the development server does not open it automatically. The route is deliberately excluded from production Back Office output and is not a business screen.

## Prerequisites

- Node.js 22.12 or newer in the Node 22 line, or Node.js 24+
- npm 9+

Use the repository Node version with `nvm use` when nvm is available.

## Commands

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

The commands cover root tooling and every workspace. `npm run lint` uses the checked-in Oxlint policy, `npm test` runs all named Vitest projects once, and `npm run build` verifies that Back Office, POS/PWA, and API produce independent artifacts. To run only the repository policy checks:

```bash
npm run check:boundaries
```

For local frontend development:

```bash
npm run dev:backoffice
npm run dev:pos
npm run dev:ui
```

Run the browser-like UI behavior suite independently with `npm run test:ui`.

Run the IndexedDB lifecycle and migration suite independently with `npm run test:local-db`. It uses test-only neutral stores and does not read or modify a developer browser profile.

For local API runtime and type verification:

```bash
npm run dev:api
npm run api:types
npm run api:types:check
npm run api:smoke
```

`dev:api` runs the Worker locally. `api:types` regenerates the checked-in Worker environment types, `api:types:check` verifies they are current, and `api:smoke` starts an isolated local Worker and checks its health and not-found responses.

No production Worker database binding or Hyperdrive resource is configured in M0-003. A later API infrastructure slice may add the PostgreSQL/Neon runtime connection seam (and optionally Hyperdrive) without changing the Node-only migration boundary.

Database migrations are explicit Node-only operations:

```bash
npm run db:migrate:check
DATABASE_URL='postgresql://...' npm run db:migrate:status
DATABASE_URL='postgresql://...' npm run db:migrate
```

Migration conventions and safety behavior are documented in [ADR-0001](./docs/decisions/ADR-0001-forward-only-sql-migrations.md) and the [database workspace guide](./database/README.md). `DATABASE_URL` must be a direct, unpooled, server/tooling-only PostgreSQL secret. Builds, type checks, lint, unit tests, and static migration validation do not require it.

Frontend configuration must never contain privileged credentials; client-visible `VITE_*` or `PUBLIC_*` names may contain only non-secret values.

## Documentation

Start with [AGENTS.md](./AGENTS.md), then use the [documentation index](./docs/README.md). Architecture and business semantics in those sources are mandatory.
