# ADR-0002: Permission catalog and built-in system role presets

Status: Accepted
Date: 2026-08-16
Scope: M1-002B

Context:
- D08 defines permission-based authority.
- The exact permission matrix was intentionally not frozen in initial documents.
- `identity.permissions` requires a `risk_level` classification.
- M1-002A intentionally left permissions and role presets empty to establish the relational schema first.

Decision:
- Risk taxonomy is locked to `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`.
- The exact initial permission registry consists of 86 explicitly defined permissions.
- Permission IDs are fixed and deterministic based on their ordinal (e.g., `44444444-4444-4444-8444-000000000001`).
- `OWNER` system role is granted all 86 permissions.
- `ADMIN` system role is granted 65 permissions, excluding highly sensitive, financial, and governance capabilities.
- `CASHIER` system role is granted exactly 12 permissions for basic POS operation.
- Limited contextual behaviors (e.g., restricted transaction history viewing, limited discounts) will be handled via business policy and query scopes, not by inventing duplicate `_limited` permission codes.
- Risk classification is metadata; it does not intrinsically grant authority or substitute for `role_permissions` and `permission_overrides`.
- Future capability additions or role preset modifications must be done through forward migrations.

Consequences:
- Establishes an explicit, deterministic authorization foundation.
- Enforces least privilege, particularly for the `CASHIER` and `ADMIN` presets.
- Clear separation of role (preset/job context) and permission (authority primitive).
- Permission changes will require schema and seed evolution discipline.
- Future contextual policy implementation is still required to enforce contextual constraints.

Explicit non-decisions:
- Auth provider implementation.
- Session management.
- `online_required` logic.
- Step-up authentication workflows.
- Max discount/refund values and similar numeric limits.
- Permission evaluator service implementation.
- Location-scoped permission policy.
- Custom role UX and management interface.
