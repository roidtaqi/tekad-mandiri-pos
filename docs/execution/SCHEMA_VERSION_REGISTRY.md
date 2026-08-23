# Schema Version Registry

This registry records the canonical schema history present in the repository.
It does not claim that an external staging or production database has applied
that history.

## POS Dexie — current V8

The executable declaration is
[`packages/local-db/src/pos-database.ts`](../../packages/local-db/src/pos-database.ts)
and migration/restart proof is in
[`packages/local-db/tests/schema-migrations.test.ts`](../../packages/local-db/tests/schema-migrations.test.ts).

| Version | Append-only change |
|---|---|
| V1 | Empty initial schema. |
| V2 | `products`, `product_units`, `barcodes`, `catalog_bootstrap_state`. |
| V3 | `published_retail_prices`, `pricing_bootstrap_state`. |
| V4 | `shifts`. |
| V5 | `transactions`, `transaction_items`, `payments`, `stock_movements`, `outbox`; upgrades pending Shift facts into durable outbox records. |
| V6 | `cash_movements`, `shift_closing_snapshots`. |
| V7 | Adds transaction/cash/outbox indexes plus `audit_events`, `sync_state`, `sync_conflicts`, cached `promotions`, `payment_methods`, `stock_balances`, `authorization_cache`, and `sync_observed_events`. |
| V8 | Changes `published_retail_prices` from one row per Product Unit to immutable multi-version storage keyed by `price_version_id`, retaining the Business/Product Unit lookup index. |

Pending outbox/business facts are not cleared during version upgrades,
bootstrap, or rebootstrap. The recovery paths are covered by
[`packages/local-db/tests/sync-store.test.ts`](../../packages/local-db/tests/sync-store.test.ts).

## Back Office Dexie — current V1

[`packages/local-db/src/back-office-database.ts`](../../packages/local-db/src/back-office-database.ts)
declares an empty V1 lifecycle database. Back Office operational truth is read
from the authenticated API; this registry does not invent a local authority.

## PostgreSQL — canonical migration head 000026

There are 26 ordered SQL files. The runner records filename and SHA-256 in
`public.kastur_schema_migrations` and requires applied history to be the exact
checksummed prefix. See
[`database/migrations/README.md`](../../database/migrations/README.md) and
[`database/tests/migrations.integration.test.mjs`](../../database/tests/migrations.integration.test.mjs).

| Version(s) | Repository migration(s) | Scope |
|---|---|---|
| 000001–000004 | [`000001`](../../database/migrations/000001_create_core_businesses_locations.sql), [`000002`](../../database/migrations/000002_create_identity_core_schema.sql), [`000003`](../../database/migrations/000003_seed_permission_catalog_role_presets.sql), [`000004`](../../database/migrations/000004_create_identity_devices_sessions_authorization_versions.sql) | Business/location and Identity foundation, permission presets, Device/session/authorization version. |
| 000005–000007 | [`000005`](../../database/migrations/000005_create_catalog_products_categories_brands.sql), [`000006`](../../database/migrations/000006_create_product_units_barcodes.sql), [`000007`](../../database/migrations/000007_create_minimal_published_retail_pricing.sql) | Catalog, Product Unit/Barcode, minimal published retail price. |
| 000008–000009 | [`000008`](../../database/migrations/000008_create_sync_schema.sql), [`000009`](../../database/migrations/000009_create_terminals_and_cash_schema.sql) | Idempotency/change feed/device cursor/conflicts and Terminal/Shift/Cash ledgers. |
| 000010–000013 | [`000010`](../../database/migrations/000010_create_catalog_suppliers_and_product_suppliers.sql), [`000011`](../../database/migrations/000011_create_purchasing_schema.sql), [`000012`](../../database/migrations/000012_create_purchasing_fulfillment_schema.sql), [`000013`](../../database/migrations/000013_create_purchasing_returns_and_corrections_schema.sql) | Supplier and Purchasing/Receiving/Invoice/correction records. |
| 000014–000020 | [`000014`](../../database/migrations/000014_create_sales_and_audit_schema.sql), [`000015`](../../database/migrations/000015_create_costing_schema.sql), [`000016`](../../database/migrations/000016_create_pricing_schema.sql), [`000017`](../../database/migrations/000017_create_inventory_schema.sql), [`000018`](../../database/migrations/000018_create_returns_schema.sql), [`000019`](../../database/migrations/000019_create_reporting_views.sql), [`000020`](../../database/migrations/000020_create_legacy_id_map.sql) | Sales/Audit before dependent Costing, then Pricing, Inventory, Return/Refund, reporting views, and legacy traceability. The pre-release resequencing is recorded in [ADR-0016](../decisions/ADR-0016-pre-release-migration-tail-resequencing.md). |
| 000021 | [`000021`](../../database/migrations/000021_complete_return_permissions_and_session_integrity.sql) | Return permissions and hash-only active-session lookup integrity. |
| 000022 | [`000022`](../../database/migrations/000022_harden_operational_domain_integrity.sql) | Cross-domain Purchasing/Costing/Pricing/Inventory/Return/Refund integrity. |
| 000023 | [`000023`](../../database/migrations/000023_complete_gate_d_pricing_integrity.sql) | Gate D versioned pricing/publication and immutable Sale pricing snapshots. |
| 000024 | [`000024`](../../database/migrations/000024_harden_costing_and_opname_authority.sql) | Explicit provisional/final cost authority, unique reconciliation roles, and Opname movement watermark. |
| 000025 | [`000025`](../../database/migrations/000025_complete_gate_f_return_policy.sql) | Gate F Return policy/disposition override snapshots and Refund operational status. |
| 000026 | [`000026`](../../database/migrations/000026_harden_identity_device_and_append_only_authority.sql) | Tenant-safe role/device references and database-enforced append-only Stock, Cash, Audit, and closed Shift authority. |

Verification commands:

```bash
npm run db:migrate:check
npm run test:local-db
TEST_DATABASE_URL='postgresql://loopback/disposable_test_database' npm run test:database
```

The `TEST_DATABASE_URL` example is test harness configuration, not evidence that
any production schema was migrated.
