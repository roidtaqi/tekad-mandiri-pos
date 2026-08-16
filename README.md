# Kastur Retail System v2

Kastur Retail System v2 is a new, offline-first retail-system rebuild. This repository is the v2 monorepo; the legacy `inventory-pricing-app` and `integrated-pos-app` repositories are reference and migration sources only.

M0-002 establishes shared configuration, testing, and build conventions only. It contains no catalog, pricing, stock, sales, cash, identity, return, or synchronization behavior.

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
tsconfig.worker.json    Worker/Web Fetch APIs, without DOM or Node globals
tsconfig.node.json      Node-only tooling
tsconfig.test.json      repository tests running in Node
```

Application production configs include source only. Their separate test configs add the types needed by the current Node-based unit-test harness, while root tooling is checked by the root `tsconfig.json`.

The Worker preset uses type-only Cloudflare Worker-class definitions without adding Wrangler, bindings, deployment configuration, or runtime integration. Compatibility-date-specific generated types remain part of M0-003, when the API runtime is configured explicitly.

Back Office and POS share only the minimal React Vite baseline under `tooling/vite`. They remain independent applications and outputs; POS owns all PWA-specific configuration. API build configuration remains Worker-specific.

Vitest uses named, runtime-explicit projects in `vitest.config.ts`. Current frontend tests use server rendering in Node, API tests use Node's Web Fetch implementation as a unit-test harness, and repository-boundary tests validate the production TypeScript runtime assumptions separately. Package tests are discovered across `packages/*` in a fast Node unit-test project; a future package test that needs browser APIs must receive an explicit browser-aware project instead of relying on accidental globals.

`@kastur/config` is reserved for concrete validated non-secret runtime configuration primitives. `@kastur/testing` is reserved for concrete reusable test helpers. Their local READMEs define the intentionally narrow boundaries; neither package exports speculative APIs in M0-002.

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
```

No environment variables or production secrets are required for M0-002 builds or tests. Frontend configuration must never contain privileged credentials; client-visible `VITE_*` or `PUBLIC_*` names may contain only non-secret values.

## Documentation

Start with [AGENTS.md](./AGENTS.md), then use the [documentation index](./docs/README.md). Architecture and business semantics in those sources are mandatory.
