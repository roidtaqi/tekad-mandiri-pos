# ADR-0007: Permission-Aware Query Redaction

**Status**: Accepted
**Date**: 2026-08-17
**Scope**: M1-008

## Context
As we expose rich DTOs from the database to API clients (Back Office or POS), various domains such as Costing, Pricing, Inventory, and Suppliers will attach highly sensitive information to common entities like Products. We need a fundamental security mechanism in the application layer to enforce field-level redaction based on the actor's permissions, ensuring sensitive data is never accidentally leaked to unauthorized users. UI hiding is insufficient; the server/application boundary must perform redaction natively.

## Decision
1. **Server/Application Authorization Boundary:** The server/application query serializer acts as the strict authorization boundary. UI hiding is not sufficient security.
2. **Separation of Authorization and Redaction:** Query authorization (e.g. `product.read` gating the whole query) and field redaction (e.g. removing `cost_snapshot` if `cost.read` is missing) are strictly separate concerns.
3. **Role Labels Are Not Authority:** Role labels like `primary_role === "OWNER"` or `"ADMIN"` provide zero authority. Only explicit permissions (e.g. `cost.read`) provide authority.
4. **Denial is Omission:** Fields that are denied are omitted entirely (absent keys). They are not replaced with `null`, `0`, or `undefined`.
5. **Contract Maximums:** Query DTO contracts define the maximum response shape. Permissions may narrow this shape by redacting fields, but permissions must never widen the contract beyond its explicit shape.
6. **Explicit Allowlist Serialization:** We require explicit allowlist serialization. Blacklist-based redaction (e.g., `{ ...row }` then `delete cost`) is strictly forbidden as it fails open. Raw SQL rows or internal domain objects must never be returned directly as API/wire DTOs. Unknown properties must be dropped.
7. **ALL-OF Semantic Primitive:** Protected field permission requirements use ALL-OF semantics in the foundational primitive. An actor must possess *all* listed permissions for a given field to be included.
8. **POS Bootstrap Invariant:** The POS Catalog bootstrap remains a dedicated, intrinsically-safe projection. It must not be widened with Back Office sensitive fields prior to redaction, maintaining its specific contract.
9. **Current Contract Scope:** The current Product contracts intentionally contain no Cost, Pricing, Inventory, Supplier, Cash, or Audit-sensitive fields. Future domains will own their exact per-domain sensitive field mappings in subsequent milestones.

## Consequences
- Queries will consistently employ internal mapping serializers (e.g., `ProductListItem` mapper) that explicitly declare which properties are transferred.
- A new core utility function (e.g., `selectPermissionBoundFields`) will manage the inclusion logic of protected properties.
- Accidental leakage via `SELECT *` expanding over time is prevented since the serializers drop unknown source keys.
