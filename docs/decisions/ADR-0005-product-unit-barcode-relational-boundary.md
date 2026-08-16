# ADR-0005: Product Unit and Barcode Relational Boundary

**Status:** Accepted
**Date:** 2026-08-17
**Scope:** M1-005

## Context

Kastur v2 separates the commercial identity of an item (`Product`) from its physical or purchasing manifestations (`Product Unit`). A `Barcode` is simply an identifier for a specific `Product Unit`. We need to define the schema and relational boundaries for these entities within a multi-tenant architecture while adhering strictly to D01 invariant requirements. 

## Decisions

### A. Tenant Scope
Both `ProductUnit` and `Barcode` remain tenant-scoped by `business_id`.

### B. ProductUnit to Product Tenant Integrity
`ProductUnit` → `Product` must be protected by same-Business relational integrity. This is enforced using a composite foreign key on `(business_id, product_id)`. To support this, `catalog.products` receives a new constraint: `UNIQUE (business_id, id)`.

### C. Barcode to ProductUnit Tenant Integrity
`Barcode` → `ProductUnit` must be protected by same-Business relational integrity. This is enforced using a composite foreign key on `(business_id, product_unit_id)`. To support this, `catalog.product_units` receives a new constraint: `UNIQUE (business_id, id)`.

### D. Exact TEXT Identity for Unit Code
`ProductUnit.unit_code` uses exact `TEXT` identity within a Product.
No `lower()`, `trim()`, `CITEXT`, or implicit normalization is introduced in this milestone. A constraint `UNIQUE (product_id, unit_code)` ensures uniqueness within the product. It is a full uniqueness constraint, meaning deactivating a unit does not free its code for a new row.

### E. Exact TEXT Identity for Barcode
`Barcode` is stored and compared as exact `TEXT`.
We do NOT:
- parse Barcode as a number;
- strip leading zeros;
- lower-case it;
- trim it automatically at the database level.
Example: `"0012345"` remains distinguishable from `"12345"` unless future application validation explicitly dictates otherwise.

### F. Active Barcode Uniqueness
Only ACTIVE Barcode uniqueness is enforced at the database level.
This is implemented as a partial unique index on `(business_id, barcode) WHERE status = 'ACTIVE'`. An INACTIVE historical Barcode does not participate in the uniqueness constraint.

### G. Status Lifecycles
- `ProductUnit` statuses for v2 are: `ACTIVE`, `INACTIVE`.
- `Barcode` statuses for v2 are: `ACTIVE`, `INACTIVE`.

### H. Barcode Deactivation Timestamp
`deactivated_at` (TIMESTAMPTZ NULL) exists on `Barcode`, but M1-005 does NOT introduce a database rule forcing a particular status/deactivated_at pairing. The application mutation policy will own that lifecycle transition.

### I. Base Unit Relation and Invariants
`Product.base_unit_code` remains the Product's declared Base Unit code.
M1-005 does NOT introduce a circular `Product` → `ProductUnit` FK or cross-table trigger.
Reason:
- M1-004 validly allows Product to exist before Units.
- The canonical schema does not define a circular FK mechanism.
- Enforcing "matching base unit has conversion_factor = 1" requires command-level cross-row validation or noncanonical trigger/schema machinery.

Future authoritative catalog mutation flows must guarantee that `Product.base_unit_code` equals exactly one `ProductUnit.unit_code` and that `conversion_factor = 1` for that Base Unit.

### J. Base Unit Lock
The rule stating that a Base Unit locks after the first Stock Movement is NOT implemented here because Inventory Movement does not exist yet.

### K. Conversion Factor Precision
Conversion values remain PostgreSQL `NUMERIC(20,8)`.
Future APIs must preserve decimal precision and must not use JS floating-point numbers as authoritative persisted quantity semantics.
