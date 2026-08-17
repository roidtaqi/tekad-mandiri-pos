# Acceptance Registry

Tracks functionalities and their proofs.

| ID | Requirement | Implementation | Proof | Severity | Status |
|---|---|---|---|---|---|
| FUNC-01 | Offline Sale | `packages/local-db/src/sales-manager.ts` | `packages/local-db/tests/sales-manager.test.ts` | CRITICAL | PASS |
| AUTH-07 | Role authorization | `packages/local-db/src/sales-manager.ts` | `packages/local-db/tests/sales-manager.test.ts` | HIGH | PASS |
| NUM-01 | Precision boundary | `packages/local-db/src/sales-manager.ts` | `packages/local-db/tests/sales-manager.test.ts` | CRITICAL | PASS |
| ATOM-01 | Failed transaction rolls back | `packages/local-db/src/sales-manager.ts` | `packages/local-db/tests/sales-manager.test.ts` | CRITICAL | PASS |
| M2-008 | Finalized Receipt Rendering | `packages/local-db/src/receipts.ts` | `packages/local-db/tests/receipts.test.ts` | HIGH | APPROVED |
