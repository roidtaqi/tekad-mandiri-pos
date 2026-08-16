# CODEX FIRST TASK — M0-001
## Bootstrap Kastur Retail System v2 Monorepo

**Milestone:** M0 — Repository & Engineering Foundation  
**Goal:** Create a clean v2 repository foundation that can support all later vertical slices without importing legacy architecture.

---

# 1. Read First

Mandatory:

```text
AGENTS.md
CODEX_HANDOFF_v1.md
docs/Kastur_Product_Foundation_v1.md
docs/Kastur_System_Architecture_v1.md
docs/Kastur_Implementation_Roadmap_v1.md
```

Do not edit legacy repositories.

---

# 2. Objective

Create the initial monorepo structure:

```text
apps/
  backoffice/
  pos/
  api/

packages/
  domain/
  contracts/
  local-db/
  sync-client/
  auth-client/
  ui/
  config/
  observability/
  testing/

database/
  migrations/
  seeds/
  scripts/

docs/
```

The repository should install, typecheck, test, and build cleanly from a fresh clone.

---

# 3. Technology Baseline

Use:

```text
npm workspaces
TypeScript
React 19
Vite
Dexie
```

POS should be PWA-ready, but do not implement business logic yet.

API should be structured for a Cloudflare Worker-class runtime, but do not prematurely implement all domains.

---

# 4. Required Work

## Root

Create:

```text
package.json
workspace configuration
shared tsconfig(s)
.gitignore
README.md
AGENTS.md
```

Add scripts similar to:

```text
npm run typecheck
npm run test
npm run build
npm run lint
```

Prefer root scripts that run all relevant workspaces.

## `apps/backoffice`

Create minimal React/Vite application.

Must render a neutral placeholder shell confirming:

```text
Kastur Back Office
```

No real feature navigation yet beyond minimal route bootstrap.

## `apps/pos`

Create minimal React/Vite app prepared for PWA support.

Must render:

```text
Kastur POS
```

Do not port legacy POS screen.

## `apps/api`

Create minimal TypeScript API runtime with:

```text
GET /api/v1/system/health
```

Response must be minimal and non-sensitive.

## Packages

Each package should have clear purpose and compile boundaries.

Do not fill packages with speculative abstractions.

## Database

Create migration directory and document the selected migration-tool placeholder/decision.

If a migration library is selected during this task, justify it briefly in an ADR.

Do not implement full schema yet.

---

# 5. Documentation

Copy authoritative handoff docs into repository `/docs`.

Create:

```text
docs/README.md
```

that indexes source-of-truth documents.

---

# 6. Architecture Constraints

Do not:

```text
copy legacy project folders wholesale
introduce microservices
introduce snapshot sync
introduce frontend sync token
introduce Product/Price/Stock schema prematurely
use a monolithic single frontend app
```

Back Office and POS must be separate deployable apps.

---

# 7. CI

Add CI workflow that runs at minimum:

```text
npm ci
typecheck
test
build
```

Lint if configured.

Do not require production secrets for CI build.

---

# 8. Smoke Tests

Add basic tests proving:

```text
shared packages can be imported
Back Office builds
POS builds
API health handler works
```

---

# 9. Acceptance Criteria

```text
[ ] Fresh clone + npm ci works
[ ] Root typecheck passes
[ ] Root tests pass
[ ] Back Office builds
[ ] POS builds
[ ] API builds
[ ] API health endpoint test passes
[ ] Back Office and POS remain separate apps
[ ] No legacy app copied wholesale
[ ] No secrets committed
[ ] Docs index exists
[ ] CI workflow passes
```

---

# 10. Completion Report

When complete, return:

```text
Repository structure
Files created
Architecture choices made
Commands run and results
Any ADR created
Any blocker/ambiguity
Recommended M0-002 task
```

Do not begin M1 automatically within the same task.
