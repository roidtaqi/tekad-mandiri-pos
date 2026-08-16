# Kastur Retail System — Database & Domain Schema v1

**Status:** Draft for Schema Review  
**Database:** PostgreSQL  
**Architecture:** Offline-first Modular Monolith  
**Depends on:** System Architecture v1 + Business Foundation v1  
**Purpose:** Menerjemahkan Domain 01–10 dan System Architecture menjadi canonical relational model yang siap diturunkan menjadi migration files dan API/Sync contracts.

---

# 1. Schema Design Principles

1. PostgreSQL adalah canonical cloud database.
2. Domain ownership terlihat dari PostgreSQL schema namespace.
3. Semua offline-creatable business records memakai globally unique technical ID.
4. Historical business facts tidak di-overwrite.
5. Mutable master records memakai optimistic concurrency.
6. Stock, Cost, Cash, Price History, Refund, Audit, dan Sync menggunakan append-oriented records.
7. `Business Status` dan `Sync Status` tidak dicampur.
8. Product Unit conversion historical disnapshot pada business documents.
9. Transaction/Return/Purchase history tidak bergantung pada current master values.
10. Money, Cost, Quantity, Ratio tidak menggunakan binary floating-point.
11. Semua operational facts yang location-aware menyimpan `location_id`.
12. Hard delete hanya untuk ephemeral/non-business technical data yang memang aman.
13. Business rows selalu scoped by `business_id`.
14. Referential integrity dipaksakan oleh FK/unique/check constraints sejauh practical.
15. Database tidak menggunakan generic EAV sebagai model inti.

---

# 2. PostgreSQL Namespaces

```text
core
identity
catalog
purchasing
costing
inventory
pricing
sales
cash
returns
audit
sync
reporting
```

Ownership:

```text
core        → Business / Location / Terminal / Shared Configuration
identity    → User / Membership / Role / Permission / Session / Device
catalog     → Product / Unit / Barcode / Supplier / Import
purchasing  → Purchase / Receipt / Invoice / Supplier Return
costing     → Cost Events / Cost State / COGS Reconciliation
inventory   → Stock Movement / Balance / Adjustment / Opname
pricing     → Margin / Proposal / Price Version / Promotion
sales       → Transaction / Item / Payment / Customer
cash        → Shift / Cash Movement / Closing Snapshot
returns     → Customer Return / Return Item / Refund
audit       → Audit Events / Business Exceptions
sync        → Idempotency / Change Feed / Device Sync State / Conflict
reporting   → Views / Materialized Read Models
```

---

# 3. Canonical Technical Types

These are logical conventions, not PostgreSQL custom domains required on day one.

## IDs

```text
Technical ID:
UUID
```

Generation:

```text
Offline clients:
UUIDv7/ULID-class generation mapped to UUID-compatible storage

Server:
same globally unique strategy
```

Exact generator library is an implementation detail.

## Time

```text
TIMESTAMPTZ
```

for:

```text
created_at
updated_at
occurred_at
effective_from
effective_to
received_at
completed_at
```

Business timezone stored separately in `core.businesses`.

## Money

Transactional monetary amount:

```text
NUMERIC(20,4)
```

Examples:

```text
selling price
discount amount
payment amount
invoice total
refund amount
cash amount
```

UI for IDR may display zero decimal places, but database retains internal precision.

## Unit Cost

```text
NUMERIC(24,8)
```

Used for:

```text
MWA
landed cost per base unit
pricing reference cost
COGS unit cost
cost reconciliation
```

## Quantity

```text
NUMERIC(20,6)
```

Supports:

```text
PCS
KG
L
fractional purchase/sale quantity
```

## Conversion Factor

```text
NUMERIC(20,8)
```

Meaning:

```text
1 Product Unit
=
conversion_factor × Base Unit
```

## Percent / Ratio

```text
NUMERIC(12,8)
```

Stored as fraction:

```text
20% = 0.20
```

---

# 4. Common Mutable Master Columns

Mutable master records should usually contain:

```text
id              UUID PK
business_id     UUID
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
version         BIGINT NOT NULL DEFAULT 1
```

`version` increments on accepted mutation.

Client mutation provides:

```text
expected_version
```

Mismatch:

```text
VERSION_CONFLICT
```

---

# 5. Common Immutable Event Columns

Append-oriented records usually contain:

```text
id              UUID PK
business_id     UUID NOT NULL
location_id     UUID NULL/NOT NULL depending domain
occurred_at     TIMESTAMPTZ NOT NULL
recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
actor_user_id   UUID NULL
device_id       UUID NULL
correlation_id  UUID NULL
source_type     TEXT NULL
source_id       UUID NULL
```

No normal mutable `updated_at` is required.

---

# 6. Status Storage Strategy

Prefer:

```text
TEXT
+
CHECK constraint
```

rather than PostgreSQL enum types.

Reason:

- easier lifecycle evolution,
- migration-friendly,
- easier backward-compatible clients.

Example:

```sql
status TEXT NOT NULL
CHECK (status IN ('ACTIVE', 'INACTIVE'))
```

---

# 7. CORE DOMAIN

---

## 7.1 `core.businesses`

One business/legal operating context.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | UUID | No | PK |
| name | TEXT | No | Display/business name |
| currency_code | CHAR(3) | No | Default `IDR` |
| timezone | TEXT | No | e.g. `Asia/Makassar` |
| status | TEXT | No | ACTIVE / INACTIVE |
| created_at | TIMESTAMPTZ | No | |
| updated_at | TIMESTAMPTZ | No | |
| version | BIGINT | No | optimistic concurrency |

Constraints:

```text
currency_code valid ISO-style code at application layer
status ∈ ACTIVE, INACTIVE
```

---

## 7.2 `core.locations`

Current v2 creates one default STORE, future-ready for more.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | UUID | No | PK |
| business_id | UUID | No | FK businesses |
| code | TEXT | No | unique within business |
| name | TEXT | No | |
| type | TEXT | No | STORE / WAREHOUSE |
| is_default | BOOLEAN | No | |
| status | TEXT | No | ACTIVE / INACTIVE |
| created_at | TIMESTAMPTZ | No | |
| updated_at | TIMESTAMPTZ | No | |
| version | BIGINT | No | |

Constraints:

```text
UNIQUE (business_id, code)
partial unique: one is_default = true per business
```

---

## 7.3 `core.business_settings`

One current settings row per business.

| Column | Type | Null | Notes |
|---|---|---:|---|
| business_id | UUID | No | PK/FK |
| default_location_id | UUID | No | |
| negative_stock_allowed | BOOLEAN | No | |
| return_window_days | INTEGER | No | default 7 |
| allow_no_receipt_return | BOOLEAN | No | |
| high_value_return_threshold | NUMERIC(20,4) | Yes | |
| high_value_adjustment_threshold | NUMERIC(20,4) | Yes | |
| trusted_clock_max_drift_seconds | INTEGER | No | |
| settings_json | JSONB | No | non-critical extensible settings |
| updated_at | TIMESTAMPTZ | No | |
| version | BIGINT | No | |

Critical business rules should become real columns when used in constraints/queries.

Do not move all business configuration into JSON.

---

## 7.4 `core.terminals`

Operational checkout context.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| code | TEXT | No |
| name | TEXT | No |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Constraint:

```text
UNIQUE (business_id, code)
```

Current rule:

```text
1 Terminal → 1 Operational Cash Drawer concept
```

No separate physical drawer table required in v2.

---

# 8. IDENTITY DOMAIN

---

## 8.1 `identity.users`

Global person/login identity.

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | UUID | No | PK |
| display_name | TEXT | No | |
| email | TEXT | Yes | normalized login identifier if used |
| phone | TEXT | Yes | |
| status | TEXT | No | ACTIVE / SUSPENDED / INACTIVE |
| created_at | TIMESTAMPTZ | No | |
| updated_at | TIMESTAMPTZ | No | |
| version | BIGINT | No | |

Credential secret is not stored here in plaintext.

Unique constraints depend on auth implementation:

```text
normalized email unique when present
```

---

## 8.2 `identity.business_memberships`

User membership in one business.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| user_id | UUID | No |
| status | TEXT | No |
| joined_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Constraint:

```text
UNIQUE (business_id, user_id)
```

Status:

```text
INVITED
ACTIVE
SUSPENDED
INACTIVE
```

---

## 8.3 `identity.roles`

Built-in and future custom role definitions.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | Yes |
| code | TEXT | No |
| name | TEXT | No |
| is_system | BOOLEAN | No |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

System role codes:

```text
OWNER
ADMIN
CASHIER
```

`business_id NULL` can represent global system presets.

Business custom roles are future-ready.

---

## 8.4 `identity.permissions`

Stable permission registry.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| code | TEXT | No |
| description | TEXT | Yes |
| risk_level | TEXT | No |
| created_at | TIMESTAMPTZ | No |

Constraint:

```text
UNIQUE (code)
```

Examples:

```text
product.create
purchase.receive
pricing.approve
inventory.adjust
transaction.void
permission.manage
```

---

## 8.5 `identity.role_permissions`

| Column | Type | Null |
|---|---|---:|
| role_id | UUID | No |
| permission_id | UUID | No |
| granted_at | TIMESTAMPTZ | No |

PK:

```text
(role_id, permission_id)
```

---

## 8.6 `identity.membership_roles`

Future-ready multi-role assignment.

| Column | Type | Null |
|---|---|---:|
| membership_id | UUID | No |
| role_id | UUID | No |
| is_primary | BOOLEAN | No |
| assigned_at | TIMESTAMPTZ | No |
| assigned_by | UUID | Yes |

PK:

```text
(membership_id, role_id)
```

Partial unique:

```text
one is_primary = true per membership
```

v2 UI assigns one primary role.

---

## 8.7 `identity.permission_overrides`

Per-membership explicit override.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| membership_id | UUID | No |
| permission_id | UUID | No |
| effect | TEXT | No |
| reason | TEXT | Yes |
| created_by | UUID | No |
| created_at | TIMESTAMPTZ | No |

Effect:

```text
GRANT
REVOKE
```

Constraint:

```text
UNIQUE (membership_id, permission_id)
```

---

## 8.8 `identity.devices`

Stable technical device identity.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| device_key | TEXT | No |
| name | TEXT | Yes |
| platform | TEXT | Yes |
| status | TEXT | No |
| first_seen_at | TIMESTAMPTZ | No |
| last_seen_at | TIMESTAMPTZ | Yes |
| revoked_at | TIMESTAMPTZ | Yes |
| created_at | TIMESTAMPTZ | No |

Constraint:

```text
UNIQUE (business_id, device_key)
```

Status:

```text
ACTIVE
INACTIVE
REVOKED
```

---

## 8.9 `identity.terminal_device_assignments`

Keeps Device and Terminal conceptually distinct.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| terminal_id | UUID | No |
| device_id | UUID | No |
| assigned_at | TIMESTAMPTZ | No |
| ended_at | TIMESTAMPTZ | Yes |
| assigned_by | UUID | Yes |

Partial uniqueness:

```text
one active terminal per device
one active device per terminal for v2
```

---

## 8.10 `identity.sessions`

Server session state.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| user_id | UUID | No |
| business_id | UUID | No |
| device_id | UUID | Yes |
| session_secret_hash | TEXT | No |
| issued_at | TIMESTAMPTZ | No |
| expires_at | TIMESTAMPTZ | No |
| revoked_at | TIMESTAMPTZ | Yes |
| last_seen_at | TIMESTAMPTZ | Yes |

No plaintext token/PIN/password.

---

## 8.11 `identity.authorization_versions`

Optional explicit change token per membership.

| Column | Type | Null |
|---|---|---:|
| membership_id | UUID | No |
| version | BIGINT | No |
| changed_at | TIMESTAMPTZ | No |

Can alternatively be derived from membership version.

Explicit table is useful for offline authorization invalidation.

---

# 9. CATALOG DOMAIN

---

## 9.1 `catalog.categories`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| name | TEXT | No |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Constraint:

```text
UNIQUE (business_id, normalized_name)
```

---

## 9.2 `catalog.brands`

Same mutable-master pattern.

Brand is optional on Product.

---

## 9.3 `catalog.products`

| Column | Type | Null | Notes |
|---|---|---:|---|
| id | UUID | No | PK |
| business_id | UUID | No | |
| sku | TEXT | No | unique within business |
| name | TEXT | No | |
| category_id | UUID | No | |
| brand_id | UUID | Yes | |
| base_unit_code | TEXT | No | immutable after first stock movement |
| track_inventory | BOOLEAN | No | |
| status | TEXT | No | ACTIVE / INACTIVE |
| created_at | TIMESTAMPTZ | No | |
| updated_at | TIMESTAMPTZ | No | |
| version | BIGINT | No | |

Constraint:

```text
UNIQUE (business_id, sku)
```

Do not reuse old SKU after Product deactivation by default.

---

## 9.4 `catalog.product_units`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| product_id | UUID | No |
| unit_code | TEXT | No |
| display_name | TEXT | No |
| conversion_factor | NUMERIC(20,8) | No |
| can_sell | BOOLEAN | No |
| can_purchase | BOOLEAN | No |
| allow_decimal_qty | BOOLEAN | No |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Constraints:

```text
conversion_factor > 0
UNIQUE (product_id, unit_code)
```

Base Product Unit:

```text
conversion_factor = 1
unit_code corresponds to Product.base_unit_code
```

---

## 9.5 `catalog.barcodes`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| product_unit_id | UUID | No |
| barcode | TEXT | No |
| is_internal | BOOLEAN | No |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| deactivated_at | TIMESTAMPTZ | Yes |

Partial unique index:

```text
UNIQUE (business_id, barcode)
WHERE status = 'ACTIVE'
```

---

## 9.6 `catalog.suppliers`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| code | TEXT | Yes |
| name | TEXT | No |
| phone | TEXT | Yes |
| email | TEXT | Yes |
| address | TEXT | Yes |
| payment_details_json | JSONB | Yes |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Sensitive payment destination updates require high-risk permission/audit.

---

## 9.7 `catalog.product_suppliers`

Many-to-many relation.

| Column | Type | Null |
|---|---|---:|
| product_id | UUID | No |
| supplier_id | UUID | No |
| supplier_sku | TEXT | Yes |
| is_preferred | BOOLEAN | No |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |

PK:

```text
(product_id, supplier_id)
```

---

## 9.8 `catalog.import_batches`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| file_name | TEXT | Yes |
| import_type | TEXT | No |
| status | TEXT | No |
| total_rows | INTEGER | No |
| success_rows | INTEGER | No |
| warning_rows | INTEGER | No |
| error_rows | INTEGER | No |
| created_by | UUID | No |
| created_at | TIMESTAMPTZ | No |
| completed_at | TIMESTAMPTZ | Yes |

---

## 9.9 `catalog.import_row_results`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| batch_id | UUID | No |
| row_number | INTEGER | No |
| status | TEXT | No |
| raw_data | JSONB | No |
| mapped_data | JSONB | Yes |
| errors | JSONB | Yes |
| warnings | JSONB | Yes |
| created_entity_id | UUID | Yes |

Constraint:

```text
UNIQUE (batch_id, row_number)
```

---

# 10. PURCHASING DOMAIN

---

## 10.1 `purchasing.purchases`

One Purchase = one supplier transaction/nota.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| supplier_id | UUID | No |
| purchase_number | TEXT | No |
| supplier_invoice_number | TEXT | Yes |
| status | TEXT | No |
| integrity_status | TEXT | No |
| payment_status | TEXT | No |
| purchase_date | DATE | No |
| ordered_at | TIMESTAMPTZ | Yes |
| received_at | TIMESTAMPTZ | Yes |
| posted_at | TIMESTAMPTZ | Yes |
| ready_to_post_at | TIMESTAMPTZ | Yes |
| notes | TEXT | Yes |
| created_by | UUID | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Status:

```text
DRAFT
ORDERED
PARTIALLY_RECEIVED
RECEIVED
READY_TO_POST
POSTED
CANCELLED
```

Integrity:

```text
CLEAR
WARNING
REVIEW_REQUIRED
DISPUTED
RESOLVED
```

Payment:

```text
UNPAID
PARTIALLY_PAID
PAID
```

Constraints:

```text
UNIQUE (business_id, purchase_number)
```

Supplier invoice number is not globally unique enough to hard-block in all cases.

Use duplicate-detection rules/index aids.

---

## 10.2 `purchasing.purchase_items`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| purchase_id | UUID | No |
| product_id | UUID | No |
| product_unit_id | UUID | No |
| product_name_snapshot | TEXT | No |
| unit_name_snapshot | TEXT | No |
| conversion_snapshot | NUMERIC(20,8) | No |
| expected_qty | NUMERIC(20,6) | No |
| agreed_unit_price | NUMERIC(20,4) | Yes |
| agreed_discount_amount | NUMERIC(20,4) | No |
| agreed_free_qty | NUMERIC(20,6) | No |
| invoice_unit_price | NUMERIC(20,4) | Yes |
| invoice_discount_amount | NUMERIC(20,4) | No |
| invoice_free_qty | NUMERIC(20,6) | No |
| final_landed_cost_per_base_unit | NUMERIC(24,8) | Yes |
| created_at | TIMESTAMPTZ | No |

Agreed values become immutable after Purchase `ORDERED`.

Later corrections are separate events.

---

## 10.3 `purchasing.purchase_agreement_snapshots`

Explicit audit-friendly snapshot.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| purchase_id | UUID | No |
| snapshot_version | INTEGER | No |
| snapshot_json | JSONB | No |
| locked_at | TIMESTAMPTZ | No |
| locked_by | UUID | No |

Constraint:

```text
UNIQUE (purchase_id, snapshot_version)
```

First ORDERED snapshot is preserved permanently.

---

## 10.4 `purchasing.receipts`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| purchase_id | UUID | No |
| receipt_number | TEXT | No |
| received_at | TIMESTAMPTZ | No |
| received_by | UUID | No |
| notes | TEXT | Yes |
| created_at | TIMESTAMPTZ | No |

Constraint:

```text
UNIQUE (business_id, receipt_number)
```

Immutable business event.

---

## 10.5 `purchasing.receipt_items`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| receipt_id | UUID | No |
| purchase_item_id | UUID | No |
| product_id | UUID | No |
| product_unit_id | UUID | No |
| conversion_snapshot | NUMERIC(20,8) | No |
| received_qty | NUMERIC(20,6) | No |
| accepted_qty | NUMERIC(20,6) | No |
| rejected_qty | NUMERIC(20,6) | No |
| free_qty_received | NUMERIC(20,6) | No |
| base_qty_accepted | NUMERIC(20,6) | No |
| rejection_reason | TEXT | Yes |
| created_at | TIMESTAMPTZ | No |

Checks:

```text
received_qty >= 0
accepted_qty >= 0
rejected_qty >= 0
accepted_qty + rejected_qty <= received_qty
base_qty_accepted = accepted_qty × conversion_snapshot
```

Server recomputes base quantity; client value is not trusted.

---

## 10.6 `purchasing.purchase_invoices`

One primary commercial invoice per Purchase in v2.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| purchase_id | UUID | No |
| supplier_invoice_number | TEXT | Yes |
| invoice_date | DATE | Yes |
| subtotal | NUMERIC(20,4) | No |
| item_discount_total | NUMERIC(20,4) | No |
| global_discount_total | NUMERIC(20,4) | No |
| tax_total | NUMERIC(20,4) | No |
| acquisition_charge_total | NUMERIC(20,4) | No |
| grand_total | NUMERIC(20,4) | No |
| captured_at | TIMESTAMPTZ | No |
| captured_by | UUID | No |
| version | BIGINT | No |

Constraint:

```text
UNIQUE (purchase_id)
```

---

## 10.7 `purchasing.purchase_invoice_items`

Maps invoice facts to purchase items.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| invoice_id | UUID | No |
| purchase_item_id | UUID | No |
| invoiced_qty | NUMERIC(20,6) | No |
| unit_price | NUMERIC(20,4) | No |
| item_discount_amount | NUMERIC(20,4) | No |
| tax_amount | NUMERIC(20,4) | No |
| free_qty | NUMERIC(20,6) | No |

Constraint:

```text
UNIQUE (invoice_id, purchase_item_id)
```

---

## 10.8 `purchasing.purchase_charges`

Additional acquisition costs.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| purchase_id | UUID | No |
| type | TEXT | No |
| description | TEXT | Yes |
| amount | NUMERIC(20,4) | No |
| allocation_method | TEXT | No |
| created_at | TIMESTAMPTZ | No |

Types:

```text
FREIGHT
HANDLING
NON_RECOVERABLE_TAX
OTHER_DIRECT_ACQUISITION
```

Allocation:

```text
BY_ITEM_VALUE
BY_QUANTITY
BY_WEIGHT future
MANUAL
```

Default:

```text
BY_ITEM_VALUE
```

---

## 10.9 `purchasing.purchase_payments`

Simple purchasing payment tracking, not full AP.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| purchase_id | UUID | No |
| amount | NUMERIC(20,4) | No |
| method | TEXT | No |
| reference | TEXT | Yes |
| paid_at | TIMESTAMPTZ | No |
| recorded_by | UUID | No |
| created_at | TIMESTAMPTZ | No |

Purchase payment status is derived/projection.

---

## 10.10 `purchasing.purchase_corrections`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| purchase_id | UUID | No |
| reason | TEXT | No |
| correction_type | TEXT | No |
| before_snapshot | JSONB | No |
| after_snapshot | JSONB | No |
| created_by | UUID | No |
| created_at | TIMESTAMPTZ | No |
| correlation_id | UUID | No |

Original POSTED purchase remains unchanged.

---

## 10.11 `purchasing.supplier_returns`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| supplier_id | UUID | No |
| purchase_id | UUID | No |
| return_number | TEXT | No |
| status | TEXT | No |
| settlement_status | TEXT | No |
| reason | TEXT | No |
| created_by | UUID | No |
| created_at | TIMESTAMPTZ | No |
| resolved_at | TIMESTAMPTZ | Yes |

Settlement:

```text
PENDING_CREDIT
CREDIT_RECEIVED
REPLACED
REFUNDED
WRITTEN_OFF
```

---

## 10.12 `purchasing.supplier_return_items`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| supplier_return_id | UUID | No |
| purchase_item_id | UUID | No |
| receipt_item_id | UUID | Yes |
| product_id | UUID | No |
| qty | NUMERIC(20,6) | No |
| base_qty | NUMERIC(20,6) | No |
| original_landed_cost_per_base_unit | NUMERIC(24,8) | No |
| reason | TEXT | No |

Returnable supplier qty is validated against prior supplier returns.

---

# 11. COSTING DOMAIN

---

## 11.1 `costing.cost_events`

Authoritative cost history.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| product_id | UUID | No |
| event_type | TEXT | No |
| quantity_basis | NUMERIC(20,6) | Yes |
| unit_cost_before | NUMERIC(24,8) | Yes |
| unit_cost_after | NUMERIC(24,8) | Yes |
| value_delta | NUMERIC(24,8) | Yes |
| source_type | TEXT | No |
| source_id | UUID | No |
| reason | TEXT | Yes |
| occurred_at | TIMESTAMPTZ | No |
| actor_user_id | UUID | Yes |
| correlation_id | UUID | Yes |

Event types:

```text
INITIAL_COST
PURCHASE_COST
COST_RECONCILIATION
COGS_RECONCILIATION
MANUAL_COST_ADJUSTMENT
RETURN_COST_EFFECT
STOCK_VARIANCE_COST
```

Immutable.

---

## 11.2 `costing.product_cost_states`

Rebuildable current projection.

| Column | Type | Null |
|---|---|---:|
| business_id | UUID | No |
| location_id | UUID | No |
| product_id | UUID | No |
| mwa_unit_cost | NUMERIC(24,8) | Yes |
| last_valid_mwa_unit_cost | NUMERIC(24,8) | Yes |
| latest_landed_unit_cost | NUMERIC(24,8) | Yes |
| pricing_reference_unit_cost | NUMERIC(24,8) | Yes |
| pricing_reference_source_type | TEXT | Yes |
| pricing_reference_source_id | UUID | Yes |
| last_cost_event_id | UUID | Yes |
| updated_at | TIMESTAMPTZ | No |

PK:

```text
(business_id, location_id, product_id)
```

This is a projection/cache, not immutable authority.

---

## 11.3 `costing.cogs_reconciliations`

Explicit reconciliation of provisional COGS.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| transaction_item_id | UUID | No |
| original_cost_snapshot | NUMERIC(24,8) | Yes |
| final_unit_cost | NUMERIC(24,8) | No |
| quantity | NUMERIC(20,6) | No |
| value_delta | NUMERIC(24,8) | No |
| source_cost_event_id | UUID | No |
| created_at | TIMESTAMPTZ | No |

Multiple reconciliations may be permitted if source corrections occur; use event ordering.

---

# 12. INVENTORY DOMAIN

---

## 12.1 `inventory.stock_movements`

Authoritative stock ledger.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| product_id | UUID | No |
| movement_type | TEXT | No |
| base_quantity_delta | NUMERIC(20,6) | No |
| source_unit_id | UUID | Yes |
| source_quantity | NUMERIC(20,6) | Yes |
| conversion_snapshot | NUMERIC(20,8) | Yes |
| source_type | TEXT | No |
| source_id | UUID | No |
| source_line_id | UUID | Yes |
| reason_code | TEXT | Yes |
| occurred_at | TIMESTAMPTZ | No |
| actor_user_id | UUID | Yes |
| device_id | UUID | Yes |
| correlation_id | UUID | Yes |

Movement types:

```text
INITIAL_STOCK
PURCHASE_RECEIPT
SUPPLIER_REPLACEMENT
SALE
CUSTOMER_RETURN
SUPPLIER_RETURN
STOCK_ADJUSTMENT_IN
STOCK_ADJUSTMENT_OUT
OPNAME_ADJUSTMENT_IN
OPNAME_ADJUSTMENT_OUT
REVERSAL
```

Important unique constraint:

```text
UNIQUE (
  business_id,
  source_type,
  source_id,
  source_line_id,
  movement_type
)
```

where business semantics guarantee one movement role.

No direct `UPDATE quantity`.

---

## 12.2 `inventory.stock_balances`

Rebuildable projection.

| Column | Type | Null |
|---|---|---:|
| business_id | UUID | No |
| location_id | UUID | No |
| product_id | UUID | No |
| base_quantity | NUMERIC(20,6) | No |
| last_movement_id | UUID | Yes |
| updated_at | TIMESTAMPTZ | No |

PK:

```text
(business_id, location_id, product_id)
```

Negative value is valid when policy allows.

---

## 12.3 `inventory.stock_adjustments`

Header for manual adjustment workflow.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| adjustment_number | TEXT | No |
| direction | TEXT | No |
| reason_code | TEXT | No |
| notes | TEXT | Yes |
| created_by | UUID | No |
| created_at | TIMESTAMPTZ | No |
| posted_at | TIMESTAMPTZ | No |

Direction:

```text
IN
OUT
```

Reason:

```text
DAMAGED
LOST
FOUND
DATA_CORRECTION
EXPIRED
OTHER
```

---

## 12.4 `inventory.stock_adjustment_items`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| adjustment_id | UUID | No |
| product_id | UUID | No |
| source_unit_id | UUID | No |
| qty | NUMERIC(20,6) | No |
| conversion_snapshot | NUMERIC(20,8) | No |
| base_qty | NUMERIC(20,6) | No |
| cost_snapshot | NUMERIC(24,8) | Yes |

Each item links to one resulting `stock_movement`.

---

## 12.5 `inventory.opname_sessions`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| opname_number | TEXT | No |
| status | TEXT | No |
| scope_type | TEXT | No |
| created_by | UUID | No |
| started_at | TIMESTAMPTZ | Yes |
| posted_at | TIMESTAMPTZ | Yes |
| cancelled_at | TIMESTAMPTZ | Yes |
| created_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Status:

```text
DRAFT
COUNTING
REVIEW
POSTED
CANCELLED
```

---

## 12.6 `inventory.opname_items`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| opname_session_id | UUID | No |
| product_id | UUID | No |
| system_qty_at_count | NUMERIC(20,6) | Yes |
| physical_qty | NUMERIC(20,6) | Yes |
| variance_qty | NUMERIC(20,6) | Yes |
| counted_at | TIMESTAMPTZ | Yes |
| counted_by | UUID | Yes |
| count_revision | INTEGER | No |
| recount_recommended | BOOLEAN | No |
| posted_movement_id | UUID | Yes |

Constraint:

```text
UNIQUE (opname_session_id, product_id)
```

Variance is relative to snapshot at count confirmation.

---

# 13. PRICING DOMAIN

---

## 13.1 `pricing.margin_rules`

Hierarchy:

```text
BUSINESS
CATEGORY
PRODUCT_UNIT
```

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| scope_type | TEXT | No |
| category_id | UUID | Yes |
| product_unit_id | UUID | Yes |
| target_margin | NUMERIC(12,8) | No |
| minimum_margin | NUMERIC(12,8) | No |
| rounding_rule | TEXT | No |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Check ensures correct nullable scope column.

Rounding:

```text
NONE
NEAREST_100
UP_TO_100
NEAREST_500
UP_TO_500
NEAREST_1000
UP_TO_1000
```

---

## 13.2 `pricing.price_sets`

Approval/publication grouping.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| name | TEXT | Yes |
| source_type | TEXT | No |
| status | TEXT | No |
| proposed_by | UUID | Yes |
| approved_by | UUID | Yes |
| approved_at | TIMESTAMPTZ | Yes |
| effective_from | TIMESTAMPTZ | Yes |
| notes | TEXT | Yes |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Status:

```text
DRAFT
IN_REVIEW
PENDING_APPROVAL
APPROVED
SCHEDULED
ACTIVE
SUPERSEDED
REJECTED
CANCELLED
```

---

## 13.3 `pricing.price_proposal_items`

One proposal decision per Product Unit.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| price_set_id | UUID | No |
| product_unit_id | UUID | No |
| pricing_reference_cost_snapshot | NUMERIC(24,8) | Yes |
| current_price_snapshot | NUMERIC(20,4) | Yes |
| recommended_price | NUMERIC(20,4) | Yes |
| proposed_price | NUMERIC(20,4) | No |
| final_approved_price | NUMERIC(20,4) | Yes |
| target_margin_snapshot | NUMERIC(12,8) | Yes |
| minimum_margin_snapshot | NUMERIC(12,8) | Yes |
| calculated_margin | NUMERIC(12,8) | Yes |
| risk_level | TEXT | No |
| item_status | TEXT | No |
| owner_edit_reason | TEXT | Yes |

Batch approval remains item-addressable.

---

## 13.4 `pricing.price_versions`

One published version envelope per Product Unit.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| product_unit_id | UUID | No |
| price_set_id | UUID | Yes |
| status | TEXT | No |
| effective_from | TIMESTAMPTZ | No |
| effective_to | TIMESTAMPTZ | Yes |
| pricing_reference_cost_snapshot | NUMERIC(24,8) | Yes |
| tax_mode | TEXT | No |
| tax_rate_snapshot | NUMERIC(12,8) | No |
| created_by | UUID | No |
| approved_by | UUID | Yes |
| created_at | TIMESTAMPTZ | No |

Status:

```text
SCHEDULED
ACTIVE
SUPERSEDED
CANCELLED
```

No price is stored as a mutable `current_price` authority.

---

## 13.5 `pricing.price_tier_versions`

Child rows define retail/wholesale tiers for one Price Version.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| price_version_id | UUID | No |
| tier_code | TEXT | No |
| min_qty | NUMERIC(20,6) | No |
| unit_price | NUMERIC(20,4) | No |
| sort_order | INTEGER | No |

Examples:

```text
RETAIL min_qty = 1
WHOLESALE_10 min_qty = 10
WHOLESALE_24 min_qty = 24
```

Constraints:

```text
UNIQUE (price_version_id, tier_code)
UNIQUE (price_version_id, min_qty)
min_qty > 0
unit_price >= 0
```

Cross-unit tier aggregation is prohibited by application rule.

---

## 13.6 Price overlap protection

Preferred database protection:

```text
No overlapping SCHEDULED/ACTIVE Price Versions
for same Product Unit validity range.
```

Implementation options:

1. PostgreSQL exclusion constraint using `tstzrange` + `btree_gist`, or
2. transactional application lock + unique current/scheduled rules.

Schema design should favor the exclusion constraint if operationally acceptable.

---

## 13.7 `pricing.promotions`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| name | TEXT | No |
| product_unit_id | UUID | No |
| promotion_type | TEXT | No |
| value | NUMERIC(20,4) | No |
| min_qty | NUMERIC(20,6) | No |
| priority | INTEGER | No |
| effective_from | TIMESTAMPTZ | No |
| effective_to | TIMESTAMPTZ | No |
| status | TEXT | No |
| created_by | UUID | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Types:

```text
FIXED_PRICE
PERCENT_DISCOUNT
FIXED_DISCOUNT
```

Maximum one promotion applies per transaction line through deterministic resolver.

---

## 13.8 `pricing.pricing_review_items`

Read/attention source when cost/margin changes.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| product_unit_id | UUID | No |
| reason_type | TEXT | No |
| cost_before | NUMERIC(24,8) | Yes |
| cost_after | NUMERIC(24,8) | Yes |
| current_price | NUMERIC(20,4) | Yes |
| current_margin | NUMERIC(12,8) | Yes |
| status | TEXT | No |
| source_cost_event_id | UUID | Yes |
| created_at | TIMESTAMPTZ | No |
| reviewed_at | TIMESTAMPTZ | Yes |
| reviewed_by | UUID | Yes |

---

# 14. SALES DOMAIN

---

## 14.1 `sales.customers`

Lightweight optional customer identity.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| name | TEXT | No |
| phone | TEXT | Yes |
| notes | TEXT | Yes |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Indexes:

```text
business_id + normalized_name
business_id + normalized_phone
```

No loyalty/credit model in v1.

---

## 14.2 `sales.transactions`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| terminal_id | UUID | No |
| device_id | UUID | No |
| shift_id | UUID | No |
| transaction_number | TEXT | No |
| status | TEXT | No |
| customer_id | UUID | Yes |
| subtotal | NUMERIC(20,4) | No |
| promotion_discount_total | NUMERIC(20,4) | No |
| line_discount_total | NUMERIC(20,4) | No |
| transaction_discount_total | NUMERIC(20,4) | No |
| tax_total | NUMERIC(20,4) | No |
| grand_total | NUMERIC(20,4) | No |
| total_paid | NUMERIC(20,4) | No |
| change_amount | NUMERIC(20,4) | No |
| cost_status | TEXT | No |
| created_by | UUID | No |
| occurred_at | TIMESTAMPTZ | No |
| completed_at | TIMESTAMPTZ | Yes |
| voided_at | TIMESTAMPTZ | Yes |
| void_reason | TEXT | Yes |
| correlation_id | UUID | No |
| created_at | TIMESTAMPTZ | No |

Status:

```text
DRAFT
PAYMENT_PENDING
COMPLETED
CANCELLED
VOIDED
```

Derived UI state may include:

```text
REFUNDED_PARTIAL
REFUNDED_FULL
```

but Return/Refund remains separate data.

Constraint:

```text
UNIQUE (business_id, transaction_number)
```

Technical IDs remain canonical for offline.

---

## 14.3 `sales.transaction_items`

Critical immutable snapshots.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| transaction_id | UUID | No |
| product_id | UUID | No |
| product_unit_id | UUID | No |
| product_name_snapshot | TEXT | No |
| sku_snapshot | TEXT | No |
| unit_name_snapshot | TEXT | No |
| conversion_snapshot | NUMERIC(20,8) | No |
| quantity | NUMERIC(20,6) | No |
| base_quantity | NUMERIC(20,6) | No |
| base_unit_price_snapshot | NUMERIC(20,4) | No |
| tier_code_snapshot | TEXT | Yes |
| tier_unit_price_snapshot | NUMERIC(20,4) | Yes |
| promotion_id | UUID | Yes |
| promotion_discount_snapshot | NUMERIC(20,4) | No |
| manual_line_discount_snapshot | NUMERIC(20,4) | No |
| transaction_discount_allocation | NUMERIC(20,4) | No |
| final_unit_price_snapshot | NUMERIC(20,4) | No |
| line_total | NUMERIC(20,4) | No |
| tax_mode_snapshot | TEXT | No |
| tax_rate_snapshot | NUMERIC(12,8) | No |
| tax_amount_snapshot | NUMERIC(20,4) | No |
| cost_unit_snapshot | NUMERIC(24,8) | Yes |
| cost_status | TEXT | No |
| created_at | TIMESTAMPTZ | No |

Cost status:

```text
FINAL
PROVISIONAL
COST_PENDING
```

For `track_inventory = false`, inventory movement is absent.

---

## 14.4 `sales.transaction_discounts`

Explicit transaction-level discount record.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| transaction_id | UUID | No |
| discount_type | TEXT | No |
| requested_value | NUMERIC(20,4) | No |
| calculated_amount | NUMERIC(20,4) | No |
| reason | TEXT | Yes |
| applied_by | UUID | No |
| created_at | TIMESTAMPTZ | No |

Types:

```text
PERCENT
FIXED_AMOUNT
```

---

## 14.5 `sales.transaction_discount_allocations`

| Column | Type | Null |
|---|---|---:|
| transaction_discount_id | UUID | No |
| transaction_item_id | UUID | No |
| allocated_amount | NUMERIC(20,4) | No |

PK:

```text
(transaction_discount_id, transaction_item_id)
```

Allocation method:

```text
PROPORTIONAL_BY_ELIGIBLE_LINE_VALUE
```

---

## 14.6 `sales.payment_methods`

Business-configurable tender methods.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| code | TEXT | No |
| name | TEXT | No |
| is_cash | BOOLEAN | No |
| offline_allowed | BOOLEAN | No |
| requires_reference | BOOLEAN | No |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| updated_at | TIMESTAMPTZ | No |
| version | BIGINT | No |

Codes initially:

```text
CASH
QRIS
BANK_TRANSFER
OTHER
```

Constraint:

```text
UNIQUE (business_id, code)
```

---

## 14.7 `sales.payments`

Authoritative tender records.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| transaction_id | UUID | Yes |
| return_id | UUID | Yes |
| payment_method_id | UUID | No |
| amount | NUMERIC(20,4) | No |
| status | TEXT | No |
| confirmation_type | TEXT | No |
| external_reference | TEXT | Yes |
| original_payment_id | UUID | Yes |
| reversal_reason | TEXT | Yes |
| received_at | TIMESTAMPTZ | No |
| completed_at | TIMESTAMPTZ | Yes |
| reversed_at | TIMESTAMPTZ | Yes |
| recorded_by | UUID | No |
| device_id | UUID | Yes |
| correlation_id | UUID | Yes |

Status:

```text
PENDING
COMPLETED
FAILED
REVERSED
```

Confirmation:

```text
CASH_CONFIRMED
MANUAL_CONFIRMED
PROVIDER_VERIFIED
```

At least one business source must exist.

Payment correction:

```text
original → REVERSED
new payment row → COMPLETED
```

---

# 15. CASH DOMAIN

---

## 15.1 `cash.shifts`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| terminal_id | UUID | No |
| cashier_user_id | UUID | No |
| shift_number | TEXT | No |
| status | TEXT | No |
| opening_cash | NUMERIC(20,4) | No |
| opened_at | TIMESTAMPTZ | No |
| closing_started_at | TIMESTAMPTZ | Yes |
| closed_at | TIMESTAMPTZ | Yes |
| forced_closed_by | UUID | Yes |
| force_close_reason | TEXT | Yes |
| review_status | TEXT | No |
| created_at | TIMESTAMPTZ | No |

Status:

```text
OPEN
CLOSING
CLOSED
FORCED_CLOSED
```

Review:

```text
UNREVIEWED
REVIEWED
REQUIRES_FOLLOW_UP
```

Operational unique:

```text
one OPEN/CLOSING shift per terminal
```

enforced transactionally/partial index.

---

## 15.2 `cash.cash_movements`

Physical drawer ledger.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| terminal_id | UUID | No |
| shift_id | UUID | No |
| movement_type | TEXT | No |
| amount | NUMERIC(20,4) | No |
| direction | TEXT | No |
| source_type | TEXT | No |
| source_id | UUID | No |
| reason_code | TEXT | Yes |
| notes | TEXT | Yes |
| occurred_at | TIMESTAMPTZ | No |
| actor_user_id | UUID | No |
| device_id | UUID | Yes |
| correlation_id | UUID | Yes |

Types:

```text
OPENING_BALANCE
CASH_SALE
CASH_IN
CASH_OUT
CASH_REFUND
CASH_REVERSAL
SAFE_DROP
```

`amount >= 0`, direction controls sign.

Unique source constraints prevent duplicate cash effect.

---

## 15.3 `cash.shift_closing_snapshots`

Immutable closing result.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| shift_id | UUID | No |
| opening_cash | NUMERIC(20,4) | No |
| cash_sales | NUMERIC(20,4) | No |
| cash_in | NUMERIC(20,4) | No |
| cash_out | NUMERIC(20,4) | No |
| cash_refunds | NUMERIC(20,4) | No |
| expected_cash | NUMERIC(20,4) | No |
| actual_cash | NUMERIC(20,4) | Yes |
| actual_cash_verified | BOOLEAN | No |
| variance | NUMERIC(20,4) | Yes |
| variance_type | TEXT | Yes |
| reason | TEXT | Yes |
| transaction_count | INTEGER | No |
| void_count | INTEGER | No |
| refund_count | INTEGER | No |
| created_at | TIMESTAMPTZ | No |
| created_by | UUID | No |

Constraint:

```text
UNIQUE (shift_id)
```

Do not rewrite after late sync events.

Later reconciliation is separate.

---

## 15.4 `cash.shift_reconciliations`

For late events/post-close corrections.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| shift_id | UUID | No |
| reason_type | TEXT | No |
| expected_cash_delta | NUMERIC(20,4) | No |
| notes | TEXT | Yes |
| source_type | TEXT | No |
| source_id | UUID | No |
| created_at | TIMESTAMPTZ | No |
| created_by | UUID | Yes |

Original closing snapshot remains immutable.

---

# 16. RETURNS DOMAIN

---

## 16.1 `returns.customer_returns`

One Return references one original Transaction.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | No |
| original_transaction_id | UUID | Yes |
| return_number | TEXT | No |
| return_type | TEXT | No |
| status | TEXT | No |
| receipt_mode | TEXT | No |
| customer_id | UUID | Yes |
| risk_level | TEXT | No |
| reason_summary | TEXT | Yes |
| processed_by | UUID | No |
| shift_id | UUID | Yes |
| terminal_id | UUID | Yes |
| device_id | UUID | Yes |
| occurred_at | TIMESTAMPTZ | No |
| completed_at | TIMESTAMPTZ | Yes |
| created_at | TIMESTAMPTZ | No |
| correlation_id | UUID | No |

Return type:

```text
PARTIAL
FULL
NO_RECEIPT
```

Status:

```text
DRAFT
PENDING_CONFIRMATION
COMPLETED
REJECTED
CANCELLED
```

Receipt mode:

```text
TRANSACTION_LINKED
NO_RECEIPT
```

Constraint:

```text
UNIQUE (business_id, return_number)
```

---

## 16.2 `returns.return_items`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| return_id | UUID | No |
| original_transaction_item_id | UUID | Yes |
| product_id | UUID | No |
| product_unit_id | UUID | No |
| product_name_snapshot | TEXT | No |
| unit_name_snapshot | TEXT | No |
| conversion_snapshot | NUMERIC(20,8) | No |
| return_qty | NUMERIC(20,6) | No |
| base_return_qty | NUMERIC(20,6) | No |
| original_effective_unit_price | NUMERIC(20,4) | Yes |
| original_cost_unit_snapshot | NUMERIC(24,8) | Yes |
| reason_code | TEXT | No |
| disposition | TEXT | No |
| return_loss_category | TEXT | Yes |
| refundable_amount | NUMERIC(20,4) | No |
| created_at | TIMESTAMPTZ | No |

Disposition:

```text
RESTOCK
NOT_RESTOCKED
```

Loss categories:

```text
DAMAGED_RETURN
EXPIRED_RETURN
QUALITY_RETURN
GOODWILL_REFUND
CUSTOMER_DAMAGE
OTHER_RETURN_LOSS
```

Normal linked return validates:

```text
SUM completed return_qty
<= original sold qty
```

with transaction lock/server validation.

---

## 16.3 `returns.refunds`

Monetary settlement independent of physical Return.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| return_id | UUID | No |
| original_payment_id | UUID | Yes |
| refund_number | TEXT | No |
| payment_method_id | UUID | No |
| amount | NUMERIC(20,4) | No |
| status | TEXT | No |
| override_method | BOOLEAN | No |
| override_amount | BOOLEAN | No |
| override_reason | TEXT | Yes |
| external_reference | TEXT | Yes |
| requested_at | TIMESTAMPTZ | No |
| completed_at | TIMESTAMPTZ | Yes |
| failed_at | TIMESTAMPTZ | Yes |
| processed_by | UUID | No |
| correlation_id | UUID | No |

Status:

```text
PENDING
COMPLETED
FAILED
REVERSED
REQUIRES_ACTION
```

Constraint:

```text
UNIQUE (business_id, refund_number)
```

Provider external reference should have duplicate-suspect index.

---

# 17. AUDIT & EXCEPTION DOMAIN

---

## 17.1 `audit.audit_events`

Append-only.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | Yes |
| actor_type | TEXT | No |
| actor_user_id | UUID | Yes |
| actor_role_snapshot | TEXT | Yes |
| action | TEXT | No |
| entity_type | TEXT | No |
| entity_id | UUID | No |
| occurred_at | TIMESTAMPTZ | No |
| recorded_at | TIMESTAMPTZ | No |
| device_id | UUID | Yes |
| session_id | UUID | Yes |
| reason | TEXT | Yes |
| before_data | JSONB | Yes |
| after_data | JSONB | Yes |
| correlation_id | UUID | Yes |
| authorization_version | BIGINT | Yes |

Actor:

```text
USER
SYSTEM
SYNC
AUTOMATION
```

No credentials/secrets in JSON.

---

## 17.2 `audit.business_exceptions`

Cross-domain Owner Attention source.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| location_id | UUID | Yes |
| domain | TEXT | No |
| exception_type | TEXT | No |
| severity | TEXT | No |
| status | TEXT | No |
| source_entity_type | TEXT | No |
| source_entity_id | UUID | No |
| summary | TEXT | No |
| impact_amount | NUMERIC(20,4) | Yes |
| impact_quantity | NUMERIC(20,6) | Yes |
| metadata | JSONB | Yes |
| created_at | TIMESTAMPTZ | No |
| acknowledged_at | TIMESTAMPTZ | Yes |
| acknowledged_by | UUID | Yes |
| resolved_at | TIMESTAMPTZ | Yes |
| resolved_by | UUID | Yes |
| resolution | TEXT | Yes |

Severity:

```text
INFO
WARNING
REVIEW_REQUIRED
CRITICAL
```

Status:

```text
OPEN
ACKNOWLEDGED
RESOLVED
DISMISSED
```

---

# 18. SYNC DOMAIN

---

## 18.1 `sync.idempotency_records`

Server-side command deduplication.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| idempotency_key | TEXT | No |
| command_type | TEXT | No |
| request_hash | TEXT | No |
| status | TEXT | No |
| result_code | TEXT | Yes |
| result_entity_type | TEXT | Yes |
| result_entity_id | UUID | Yes |
| response_payload | JSONB | Yes |
| created_at | TIMESTAMPTZ | No |
| completed_at | TIMESTAMPTZ | Yes |
| expires_at | TIMESTAMPTZ | Yes |

Constraint:

```text
UNIQUE (business_id, command_type, idempotency_key)
```

Same key + different request hash:

```text
IDEMPOTENCY_KEY_REUSE_ERROR
```

---

## 18.2 `sync.change_feed`

Monotonic incremental client feed.

| Column | Type | Null |
|---|---|---:|
| sequence | BIGSERIAL | No |
| business_id | UUID | No |
| location_id | UUID | Yes |
| entity_type | TEXT | No |
| entity_id | UUID | No |
| change_type | TEXT | No |
| entity_version | BIGINT | Yes |
| payload | JSONB | Yes |
| occurred_at | TIMESTAMPTZ | No |
| recorded_at | TIMESTAMPTZ | No |
| correlation_id | UUID | Yes |

PK:

```text
sequence
```

Important index:

```text
(business_id, sequence)
```

Change types:

```text
UPSERT
DEACTIVATE
EVENT
INVALIDATE
```

Client cursor is this ordered sequence scoped by business.

---

## 18.3 `sync.device_sync_states`

Diagnostics/ack state.

| Column | Type | Null |
|---|---|---:|
| business_id | UUID | No |
| device_id | UUID | No |
| last_ack_sequence | BIGINT | No |
| last_push_at | TIMESTAMPTZ | Yes |
| last_pull_at | TIMESTAMPTZ | Yes |
| last_success_at | TIMESTAMPTZ | Yes |
| pending_reported | INTEGER | Yes |
| client_version | TEXT | Yes |
| schema_version | INTEGER | Yes |
| updated_at | TIMESTAMPTZ | No |

PK:

```text
(business_id, device_id)
```

Client outbox itself remains local Dexie.

---

## 18.4 `sync.conflicts`

Mutable master/special reconciliation conflict queue.

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| device_id | UUID | Yes |
| conflict_type | TEXT | No |
| entity_type | TEXT | No |
| entity_id | UUID | No |
| local_version | BIGINT | Yes |
| server_version | BIGINT | Yes |
| local_value | JSONB | Yes |
| server_value | JSONB | Yes |
| status | TEXT | No |
| created_at | TIMESTAMPTZ | No |
| resolved_at | TIMESTAMPTZ | Yes |
| resolved_by | UUID | Yes |
| resolution | JSONB | Yes |

Status:

```text
OPEN
RESOLVED
DISMISSED
```

Not every immutable event merge creates a conflict row.

---

# 19. LOCAL DEXIE SCHEMA — POS

Cloud table names do not need to be copied one-for-one.

Recommended local stores:

```text
products
productUnits
barcodes
publishedPriceVersions
publishedPriceTiers
promotions
paymentMethods

localStockBalances
stockMovements

transactions
transactionItems
transactionDiscounts
payments

shifts
cashMovements
shiftClosingSnapshots

returns
returnItems
refunds

authorizationSnapshot
businessSettings
terminalContext

heldCarts
heldCartItems

outbox
syncCursor
syncMetadata
syncFailures
```

Important:

```text
outbox survives app restart
business records and outbox commit atomically
```

---

# 20. LOCAL DEXIE SCHEMA — BACK OFFICE

Recommended local stores:

```text
products
productUnits
barcodes
categories
brands
suppliers

purchaseDrafts
purchaseDraftItems
receipts
receiptItems

opnameSessions
opnameItems

priceProposalDrafts
priceProposalItems
pricingCalculatorState

authorizationSnapshot
businessSettings

outbox
syncCursor
syncMetadata
syncFailures
```

Back Office does not need to cache entire cloud transaction history.

---

# 21. Derived States — Do Not Store as Independent Truth

Prefer derived/projected values:

```text
Current Stock
Current Active Price
Current Margin
Remaining Returnable Qty
Purchase Payment Status
Purchase Receiving Progress
Shift Expected Cash
Transaction Refunded Partial/Full
Supplier Reliability summary
Dashboard KPI
```

They may be cached/read models, but canonical source remains underlying records.

---

# 22. Key Cross-Domain Foreign Keys

```text
catalog.product_units.product_id
→ catalog.products.id

catalog.barcodes.product_unit_id
→ catalog.product_units.id

purchasing.purchase_items.product_id
→ catalog.products.id

purchasing.purchase_items.product_unit_id
→ catalog.product_units.id

purchasing.receipts.purchase_id
→ purchasing.purchases.id

inventory.stock_movements.product_id
→ catalog.products.id

costing.cost_events.product_id
→ catalog.products.id

pricing.price_versions.product_unit_id
→ catalog.product_units.id

sales.transaction_items.product_id
→ catalog.products.id

sales.transaction_items.product_unit_id
→ catalog.product_units.id

sales.transactions.shift_id
→ cash.shifts.id

returns.customer_returns.original_transaction_id
→ sales.transactions.id

returns.return_items.original_transaction_item_id
→ sales.transaction_items.id

returns.refunds.return_id
→ returns.customer_returns.id
```

Historical snapshot fields remain even when FK target later becomes INACTIVE.

---

# 23. Core Index Strategy

## Catalog

```text
catalog.products (business_id, sku)
catalog.products (business_id, status, category_id)
catalog.products searchable normalized_name
catalog.barcodes (business_id, barcode) WHERE ACTIVE
catalog.product_units (product_id, status)
```

## Purchasing

```text
purchasing.purchases (business_id, status, purchase_date DESC)
purchasing.purchases (business_id, supplier_id, purchase_date DESC)
purchasing.purchases (supplier_id, supplier_invoice_number)
purchasing.receipts (purchase_id, received_at)
```

## Inventory

```text
inventory.stock_movements
(business_id, location_id, product_id, occurred_at DESC)

inventory.stock_movements
(source_type, source_id)

inventory.stock_balances
(business_id, location_id, product_id)
```

## Costing

```text
costing.cost_events
(business_id, location_id, product_id, occurred_at DESC)
```

## Pricing

```text
pricing.price_versions
(business_id, product_unit_id, effective_from DESC)

pricing.promotions
(business_id, product_unit_id, effective_from, effective_to)

pricing.pricing_review_items
(business_id, status, created_at DESC)
```

## Sales

```text
sales.transactions
(business_id, occurred_at DESC)

sales.transactions
(business_id, transaction_number)

sales.transactions
(business_id, shift_id)

sales.transaction_items
(transaction_id)

sales.transaction_items
(product_id, created_at DESC)
```

## Cash

```text
cash.shifts
(business_id, location_id, opened_at DESC)

cash.cash_movements
(shift_id, occurred_at)
```

## Returns

```text
returns.customer_returns
(business_id, occurred_at DESC)

returns.customer_returns
(original_transaction_id)

returns.refunds
(status, requested_at)
```

## Audit/Attention

```text
audit.audit_events
(business_id, entity_type, entity_id, occurred_at DESC)

audit.audit_events
(business_id, actor_user_id, occurred_at DESC)

audit.business_exceptions
(business_id, status, severity, created_at DESC)
```

## Sync

```text
sync.change_feed
(business_id, sequence)

sync.idempotency_records
(business_id, command_type, idempotency_key)
```

---

# 24. Unique Business Constraints

Mandatory or strongly recommended:

```text
UNIQUE business SKU
UNIQUE active business barcode
UNIQUE business Product Unit code per Product
UNIQUE Purchase Number per Business
UNIQUE Receipt Number per Business
UNIQUE Transaction Number per Business
UNIQUE Return Number per Business
UNIQUE Refund Number per Business
UNIQUE Payment Method Code per Business
UNIQUE source Stock Movement role
UNIQUE Idempotency Key within Business + Command
UNIQUE Opname Product per Session
UNIQUE Shift Closing Snapshot per Shift
```

---

# 25. No Hard Delete Rules

Normal application must not hard-delete:

```text
Product with history
Product Unit with history
Supplier with history
Posted Purchase
Receipt
Cost Event
Stock Movement
Price Version
Completed Transaction
Payment
Closed Shift
Customer Return
Refund
Audit Event
Business Exception history after resolution
```

Use:

```text
INACTIVE
CANCELLED
SUPERSEDED
REVERSAL
CORRECTION
```

as appropriate.

---

# 26. Product Base Unit Lock Rule

Database/application invariant:

Before first:

```text
inventory.stock_movements
```

for Product:

```text
base_unit_code can change with audit
```

After first movement:

```text
base_unit_code immutable
```

Recommended enforcement:

```text
application command guard
+
database trigger or restricted repository method
```

if additional safety desired.

---

# 27. Return Quantity Integrity

For linked returns, server must lock/reference original transaction item during Return completion and ensure:

```text
SUM(return_items.return_qty
    for COMPLETED linked returns)
+
new_return_qty
<=
sales.transaction_items.quantity
```

This is transactional application validation.

A simple CHECK constraint cannot enforce this cross-row aggregate safely.

---

# 28. Supplier Return Quantity Integrity

Similarly:

```text
total supplier returned qty
<=
referenceable accepted receipt qty
```

must be validated transactionally.

---

# 29. Split Payment Integrity

At sale completion:

```text
SUM(COMPLETED payment amounts)
=
transaction.grand_total
```

subject to cash tender/change representation.

Recommended:

```text
cash Payment.amount = portion settling the transaction
tendered amount and change are transaction/payment metadata, not inflated payment settlement
```

---

# 30. Cash Expected Formula

Derived from immutable events:

```text
Expected Cash
=
Opening Cash
+ Cash Sale Effects
+ Cash In
- Cash Out
- Cash Refunds
+/- Valid Reversal Effects
```

`expected_cash` stored in closing snapshot is historical snapshot, not mutable live truth.

---

# 31. MWA Projection

`costing.product_cost_states.mwa_unit_cost` is projection.

Authoritative inputs:

```text
Stock movements with economic value
Cost events
Purchase landed costs
Cost reconciliation
```

No direct user edit.

---

# 32. Pricing Reference Cost

Stored projection:

```text
costing.product_cost_states.pricing_reference_unit_cost
```

Source pointer required:

```text
pricing_reference_source_type
pricing_reference_source_id
```

This prevents unexplained pricing cost changes.

---

# 33. Active Price Resolution

Current active price is resolved from:

```text
pricing.price_versions
+
pricing.price_tier_versions
+
effective time
+
status
```

Do not create authoritative:

```text
products.current_price
```

A cache/read model is allowed.

---

# 34. Promotion Resolution

Applicable Promotion query:

```text
business_id
product_unit_id
status ACTIVE
effective range contains trusted time
min_qty satisfied
```

Then deterministic sort:

```text
priority DESC
customer benefit DESC
created_at ASC
id ASC
```

Only one promotion selected.

---

# 35. Transaction Snapshot Requirement

A completed transaction must remain intelligible without querying current:

```text
Product Name
Product Unit Name
Conversion
Price
Tier
Promotion
Discount
Tax
Cost
```

Therefore these values are intentionally duplicated in transaction item snapshots.

---

# 36. Purchase Snapshot Requirement

A Posted Purchase must preserve:

```text
Agreed values
Invoice values
Receipt values
Accepted quantities
Conversion
Discount
Tax
Acquisition charges
Landed cost
```

Current Supplier/Product changes do not rewrite purchase history.

---

# 37. Audit JSON Rules

`before_data` / `after_data`:

Allowed:

```text
business-relevant changed fields
status
reason
amount/quantity
permission assignment
```

Forbidden:

```text
password
PIN plaintext
session token
refresh token
payment provider secret
database secret
```

---

# 38. Sync Feed Payload Policy

`sync.change_feed.payload` should carry client-needed projection/change data, not an unrestricted database row dump.

Examples:

```text
Product Cache DTO
Published Price DTO
Permission Snapshot Invalidation
Stock Projection Update
Transaction Sync Acknowledgment
```

This contract is finalized in API/Sync Contract v1.

---

# 39. Data Retention & Purging

v1 policy:

```text
No automatic purge of business ledgers/history.
```

Potential future archival:

```text
old technical sync records
expired sessions
old idempotency response payloads
technical logs
```

must not delete source business facts.

---

# 40. PostgreSQL Transaction Boundaries

## Complete Sale

One DB transaction:

```text
Idempotency Lock
Transaction
Transaction Items
Discount Allocation
Payments
Stock Movements
Cost Snapshot/Event as needed
Cash Movement
Audit
Change Feed
Idempotency Result
```

## Receive Goods

```text
Receipt
Receipt Items
Stock Movements
Cost/Provisional Cost Effect
Integrity Exceptions
Audit
Change Feed
```

## Post Purchase

```text
Purchase state
Invoice/final commercial validation
Landed Cost
Cost Events/Reconciliation
Pricing Review
Audit
Change Feed
```

## Complete Return

```text
Return
Return Items
Stock Effects
Cost Effects
Refund
Cash/Payment effect when completed
Audit
Change Feed
```

## Close Shift

```text
Shift state
Closing Snapshot
Variance Exception
Audit
Change Feed
```

## Publish Price

```text
Version guard
Price Version
Price Tiers
Old Version Supersession
Audit
Change Feed
```

---

# 41. Database Access Boundary

Frontend:

```text
NEVER
→ PostgreSQL direct connection
```

Only:

```text
Frontend
→ Authenticated API
→ Application Service
→ Repository
→ PostgreSQL
```

---

# 42. Repository Ownership Boundary

Examples:

```text
InventoryRepository
owns inventory.stock_movements / stock_balances

PricingRepository
owns pricing.price_versions / promotions

SalesRepository
owns sales.transactions / transaction_items / payments

CashRepository
owns cash.shifts / cash_movements
```

A service in another domain does not directly issue arbitrary UPDATE against these tables.

---

# 43. Recommended Referential Delete Actions

Default:

```text
ON DELETE RESTRICT
```

for business relations.

Use:

```text
ON DELETE CASCADE
```

only for true child records whose parent itself is deletable before finalization, e.g.:

```text
unfinalized import row under disposable import batch
```

Final business records are not deleted.

---

# 44. Database Triggers — Use Sparingly

Prefer application transactions for business logic.

Database triggers are acceptable for narrow integrity protections such as:

```text
updated_at maintenance
base unit lock safety
append-only table mutation prevention
```

Do not hide pricing/costing business engines inside triggers.

---

# 45. Append-Only Table Protection

Production DB role used by application should not normally UPDATE/DELETE rows in:

```text
inventory.stock_movements
costing.cost_events
audit.audit_events
cash.cash_movements
```

Corrections append new rows.

---

# 46. Reporting Views

Initial server-side SQL views/read models may include:

```text
reporting.v_inventory_position
reporting.v_product_commercial_summary
reporting.v_purchase_summary
reporting.v_pricing_health
reporting.v_transaction_summary
reporting.v_shift_summary
reporting.v_supplier_performance
reporting.v_attention_queue
```

They are not canonical truth.

---

# 47. `reporting.v_inventory_position`

Conceptual output:

```text
business_id
location_id
product_id
product_name
base_unit
stock_qty
availability
mwa_cost
inventory_value
low_stock_threshold
last_movement_at
```

---

# 48. `reporting.v_product_commercial_summary`

Conceptual output:

```text
product
stock
MWA
latest landed
pricing reference
active retail price
current margin
target margin
pricing review state
last purchase
last sale
```

Supports Product Detail contextual hub.

---

# 49. `reporting.v_attention_queue`

Joins/normalizes `audit.business_exceptions` with source metadata.

No source business state is stored exclusively in this view.

---

# 50. Migration Order

Recommended migration dependency sequence:

```text
001 core
002 identity
003 catalog
004 purchasing
005 inventory
006 costing
007 pricing
008 cash
009 sales
010 returns
011 audit
012 sync
013 reporting views
014 indexes / exclusion constraints
015 seed system roles & permissions
```

Exact split may differ.

---

# 51. System Seed Data

Safe system seeds:

```text
Roles:
OWNER
ADMIN
CASHIER

Permission registry

Default payment method templates:
CASH
QRIS
BANK_TRANSFER
OTHER

Default business policy values
```

Business onboarding creates actual business-scoped rows.

---

# 52. Opening Migration Data

Legacy import should create explicit:

```text
INITIAL_STOCK
INITIAL_COST
OPENING/INITIAL PRICE VERSION
```

not synthetic historical Purchases/Sales.

---

# 53. Legacy ID Mapping

Migration utility should maintain:

```text
legacy_source
legacy_entity_type
legacy_id
→
new_uuid
```

in a temporary/permanent migration mapping table.

Recommended:

```text
core.legacy_id_map
```

during cutover.

---

## 53.1 `core.legacy_id_map`

| Column | Type | Null |
|---|---|---:|
| id | UUID | No |
| business_id | UUID | No |
| source_system | TEXT | No |
| entity_type | TEXT | No |
| legacy_id | TEXT | No |
| new_entity_id | UUID | No |
| migrated_at | TIMESTAMPTZ | No |

Constraint:

```text
UNIQUE (business_id, source_system, entity_type, legacy_id)
```

---

# 54. Schema Decisions Locked in v1

```text
DB-001 PostgreSQL namespaces by domain
DB-002 UUID technical IDs
DB-003 TIMESTAMPTZ for event/effective timestamps
DB-004 NUMERIC high-precision money/cost/qty
DB-005 TEXT + CHECK lifecycle status
DB-006 business_id on business-scoped data
DB-007 location_id on operational inventory/sales/cash facts
DB-008 optimistic concurrency for mutable master
DB-009 append-oriented ledger records
DB-010 stock balance is projection
DB-011 cost state is projection
DB-012 active price is derived from price versions
DB-013 transaction historical snapshots explicit
DB-014 purchase agreed/invoice/receipt facts separate
DB-015 Return and Refund separate
DB-016 Payment and Cash Movement separate
DB-017 Shift close snapshot immutable
DB-018 cross-domain attention is exception read model
DB-019 idempotency is server-persisted
DB-020 sync uses monotonic change sequence
DB-021 local outbox stays client-side
DB-022 no direct frontend PostgreSQL access
DB-023 default ON DELETE RESTRICT
DB-024 no hard delete of finalized business facts
DB-025 initial migration uses opening events, not fake history
```

---

# 55. Intentionally Deferred to API / Implementation Phase

Not yet locked:

```text
Exact ORM / query builder
Exact migration library
Exact UUIDv7 library
Exact decimal JS library
Exact normalized-search implementation
Exact full-text search strategy
Exact attachment/blob storage
Exact provider payment tables
Exact auth provider credential tables
Exact reporting materialization mechanism
```

These do not change the logical schema authority.

---

# 56. Schema Review Checklist

Before API/Sync Contract:

```text
[✓] Business scope defined
[✓] Location scope defined
[✓] Identity model defined
[✓] Role/permission model defined
[✓] Catalog model defined
[✓] Multi-unit model defined
[✓] Supplier model defined
[✓] Purchasing facts separated
[✓] Receiving model defined
[✓] Cost ledger defined
[✓] MWA projection defined
[✓] Inventory ledger defined
[✓] Opname snapshot model defined
[✓] Pricing version model defined
[✓] Promotion model defined
[✓] Transaction snapshot defined
[✓] Split payment model defined
[✓] Shift/cash ledger defined
[✓] Return/refund model defined
[✓] Audit/exception model defined
[✓] Idempotency defined
[✓] Incremental change feed defined
[✓] Optimistic concurrency defined
[✓] Core unique/index strategy defined
[✓] Hard-delete rules defined
```

---

# 57. Domain Relationship Overview

```text
core.businesses
│
├── core.locations
├── identity.business_memberships
├── catalog.products
│    ├── catalog.product_units
│    │    ├── catalog.barcodes
│    │    ├── pricing.price_versions
│    │    │    └── pricing.price_tier_versions
│    │    └── pricing.promotions
│    ├── catalog.product_suppliers
│    ├── inventory.stock_movements
│    └── costing.cost_events
│
├── catalog.suppliers
│    └── purchasing.purchases
│         ├── purchasing.purchase_items
│         ├── purchasing.receipts
│         │    └── purchasing.receipt_items
│         ├── purchasing.purchase_invoices
│         ├── purchasing.purchase_payments
│         └── purchasing.supplier_returns
│
├── cash.shifts
│    ├── cash.cash_movements
│    └── sales.transactions
│         ├── sales.transaction_items
│         ├── sales.payments
│         └── returns.customer_returns
│              ├── returns.return_items
│              └── returns.refunds
│
├── audit.audit_events
├── audit.business_exceptions
└── sync.change_feed
```

---

# 58. Final Database Principle

> **The Kastur database must preserve business history instead of merely storing the latest values. Mutable master data is version-controlled, operational quantities and cash are reconstructed from ledgers, selling prices are versioned by effective time, and completed sales/purchases/returns retain explicit snapshots of the facts used at the time. The schema must make duplicate application of offline events difficult by construction through globally unique IDs, unique source constraints, and server-side idempotency.**

---

# 59. Recommended Next Phase

After this schema is approved:

```text
API + SYNC CONTRACT v1
```

That phase will define:

```text
Authentication context
Command envelopes
Command request/response DTOs
Query DTOs
Idempotency headers/fields
expected_version semantics
CompleteSale contract
ReceiveGoods contract
PostPurchase contract
Price publication contract
Return/refund contract
Shift contract
Sync push
Sync pull
Bootstrap
Conflict response
Stable error codes
Client/server schema versioning
```

Then:

```text
Design System
Screen Specifications
Legacy Code Audit
Implementation Roadmap
Codex Handoff
```
