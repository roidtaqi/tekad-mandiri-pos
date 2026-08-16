# ADR-0004: Catalog Master Normalization and Tenant Integrity

## Status
Accepted

## Date
2026-08-16

## Scope
M1-004

## Context
Kastur Retail System requires robust multi-tenant data isolation and data integrity guarantees for its core catalog. The canonical domain specification (D01) outlines that Categories and Brands must be unique by name within a single business, and Products must be unique by SKU. We also need to guarantee that a Product never refers to a Category or Brand belonging to a different Business.

## Decisions

### 1. Normalized Name Uniqueness Without Physical Columns
The canonical schema references `UNIQUE (business_id, normalized_name)` for Categories and Brands. However, we have decided **not** to add a physical `normalized_name` column to the schema.
Instead, we enforce normalized name uniqueness using a PostgreSQL expression unique index on:
`business_id, lower(btrim(name))`

This strategy applies identically to both `catalog.categories` and `catalog.brands`.

### 2. Tenant-Safe Relational Integrity
To ensure that a Product cannot be linked to a Category or Brand outside of its own Business, we enforce same-business foreign keys.
To support this, we add narrow composite unique constraints to the masters:
- `catalog.categories`: `UNIQUE (business_id, id)`
- `catalog.brands`: `UNIQUE (business_id, id)`
This permits the Product schema to declare a composite foreign key such as `FOREIGN KEY (business_id, category_id) REFERENCES catalog.categories (business_id, id)` while retaining UUIDs as primary keys.

### 3. SKU Uniqueness and Lifecycle
Product SKU uniqueness follows `UNIQUE (business_id, sku)`. We enforce this strictly for the exact SKU string without automatic lower-case normalization at the database level.
Crucially, this constraint covers both ACTIVE and INACTIVE products. Deactivating a Product does not free its SKU for reuse.

### 4. Product Name is Not Unique
Product names remain `TEXT NOT NULL` without any unique constraints, aligning with D01 which explicitly states that Product Name is not a unique key. Two products in the same Business may share a name if their SKU differs.

### 5. Deferred Product Unit and Inventory Relational Checks
The canonical schema requires `base_unit_code TEXT NOT NULL` on `catalog.products`. We implement this as a scalar text field. Because `Product Unit` schemas belong to M1-005, we do not attempt to add temporary tables, foreign keys, or triggers to validate `base_unit_code` against product units in this milestone.

### 6. Exclusion of Pricing, Cost, and Stock Variables
We deliberately exclude mutable transactional facts from the canonical `catalog.products` table. No fields related to price, cost, stock, or suppliers exist on the Product master table. These semantics belong to later domains (Pricing, Costing, Inventory Ledger, Purchasing).
