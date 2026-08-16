# Kastur Retail System v2

Kastur Retail System v2 is a new, offline-first retail-system rebuild. This repository is the v2 monorepo; the legacy `inventory-pricing-app` and `integrated-pos-app` repositories are reference and migration sources only.

M0-001 establishes engineering boundaries only. It contains no catalog, pricing, stock, sales, cash, identity, return, or synchronization behavior.

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

The shared packages are private source workspaces in M0-001: each exposes only its `src/index.ts` entry point and is independently typechecked, while deployable consumers bundle the source. Packaging and emitted-library conventions are intentionally left for M0-002.

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

For local frontend development:

```bash
npm run dev:backoffice
npm run dev:pos
```

No environment variables or production secrets are required for M0-001 builds or tests. Frontend configuration must never contain privileged credentials.

## Documentation

Start with [AGENTS.md](./AGENTS.md), then use the [documentation index](./docs/README.md). Architecture and business semantics in those sources are mandatory.
