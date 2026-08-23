# Runtime Reality Audit — 2026-08-23

Baseline: `05bab5ec7c214b9d4320184cf15c47e140c3bd1f`

This audit records the observed runtime at the fast-finish starting point. It is
evidence for recovery planning, not an authority for business semantics and not
proof that the recovered candidate has passed final verification.

| Area | Baseline reality | Recovery required |
|---|---|---|
| M2 POS core | Domain hooks, local managers, scanner, payment, and receipt helpers existed, but `apps/pos/src/App.tsx` rendered a placeholder. Local Sale completion did not yet persist every required cash/audit fact. | Complete the local atomic boundary and compose the production POS. |
| M3 Sync | PostgreSQL sync tables/contracts existed, but `packages/sync-client` had no transport/orchestrator and the API exposed no bootstrap/push/pull/ACK runtime. | Implement durable HTTP sync, Dexie cursor/outbox recovery, and multi-device exactly-once proof. |
| M4 Shift/Cash | Domain and schema pieces existed, but were not integrated into the production POS/API. | Wire offline opening/manual movements/blind close and server reconciliation. |
| M5–M9 operational domains | Schemas and isolated domain/test fragments existed. They were not complete authenticated API vertical slices; the Sales/Audit migration dependency was broken. | Repair the unreleased migration tail and add real command orchestration/integration proof. |
| M10–M11 Back Office | Navigation/catalog components existed, but production passed `authContext={null}` and `catalogGateway={null}`; other routes were placeholders. | Add a production composition root, authenticated gateways, and operational screens. |
| M12–M14 readiness | Migration/validation/security scaffolding existed, while status metadata claimed more completion than runtime evidence supported. | Reconcile tooling/runbooks/status only after integrated Gates A–I pass. |
| API | Health and compatibility responses existed; domain routes returned `404`. No real PostgreSQL request adapter was composed. | Add request-scoped PostgreSQL, opaque-session auth, permission checks, commands, reads, and sync routes. |
| Database CI | Exact baseline migration application failed because Costing referenced `sales.transaction_items` before any Sales schema existed. Reporting also assumed incorrect columns and treated pending cost as zero. | Resequence only the unreleased migration tail, introduce Sales/Audit first, and preserve null cost semantics. |

Baseline checks before recovery:

- `npm ci`: passed.
- typecheck, lint, and build: passed for the disconnected baseline.
- local tests: 320 passed; 197 PostgreSQL tests skipped without an isolated database.
- isolated PostgreSQL migration/integration run: failed at the former migration `000014` due to the missing Sales dependency.

Recovery decisions are recorded in ADR-0016 and later ADRs. Final milestone state
must be based on the integrated candidate and its test evidence, not this baseline.
