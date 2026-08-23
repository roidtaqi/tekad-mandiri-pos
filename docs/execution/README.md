# Kastur V2 Execution Registries

This directory tracks implementation and release evidence. It is not a
business-rule authority; use [`docs/README.md`](../README.md), the standalone
D01–D10 documents, Cross-Domain Gap Resolution, and accepted ADRs for semantics.

## Status semantics

- `COMPLETE`: repository implementation/integration and an automated proof
  source exist for the declared capability.
- `READY`: repository software/runbook is prepared, but the real action has not
  been performed.
- `BLOCKED_EXTERNAL`: legitimate infrastructure, data, people, credential, or
  authorization is unavailable. It must never hide missing software.
- A test file or command is traceability, not a fabricated run result. Exact-SHA
  CI, staging output, pilot sign-off, and production evidence must be recorded
  only after they actually exist.

## Registries

- [`MILESTONE_STATE.md`](./MILESTONE_STATE.md) — reconciled M0–M16 repository
  state, with M15/M16 repository readiness separated from external blockers.
- [`ACCEPTANCE_REGISTRY.md`](./ACCEPTANCE_REGISTRY.md) — Gate A–I capability,
  implementation, automated proof, and repository command mapping.
- [`SCHEMA_VERSION_REGISTRY.md`](./SCHEMA_VERSION_REGISTRY.md) — POS Dexie V8,
  Back Office Dexie V1, and canonical PostgreSQL migration head 000026.
- [`ERROR_CODE_REGISTRY.md`](./ERROR_CODE_REGISTRY.md) — stable API, local POS,
  shared-domain, sync-client, and warning code ownership.
- [`DOMAIN_OWNERSHIP.md`](./DOMAIN_OWNERSHIP.md) — domain ownership boundaries.
- [`EXTERNAL_GATES.md`](./EXTERNAL_GATES.md) — real infrastructure/IdP/backup,
  legacy export, physical pilot, and cutover dependencies.

## Supporting evidence

- [`RUNTIME_REALITY_AUDIT_2026-08-23.md`](./RUNTIME_REALITY_AUDIT_2026-08-23.md)
  is the fast-finish starting baseline, not final-candidate proof.
- [`RELIABILITY_EVIDENCE_2026-08-23.md`](./RELIABILITY_EVIDENCE_2026-08-23.md)
  records a disposable local restore drill and explicitly does not claim a
  production backup policy.
- [`docs/operations/TESTING_CI.md`](../operations/TESTING_CI.md) defines the
  consolidated repository campaign. `TEST_DATABASE_URL` is test configuration,
  not an external product gate.
- [`docs/operations/DEPLOYMENT_RELEASE.md`](../operations/DEPLOYMENT_RELEASE.md)
  defines the staging, pilot, and release evidence that repository tests cannot
  substitute.
