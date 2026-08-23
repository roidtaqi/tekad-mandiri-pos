# ADR-0016: Pre-release migration tail resequencing for Sales/Audit dependencies

- **Status:** Accepted
- **Date:** 2026-08-23
- **Scope:** PostgreSQL migration-chain recovery before M3 runtime integration

## Context

The repository migration chain previously placed Costing at `000014`, although
`costing.cogs_reconciliations.transaction_item_id` references
`sales.transaction_items`. No earlier migration created the `sales` schema.
Returns at `000017` also referenced Sales tables that did not exist. A clean
PostgreSQL apply therefore stopped at `000014`; the tail could not form a valid,
reproducible release baseline.

The PostgreSQL entry in `docs/execution/SCHEMA_VERSION_REGISTRY.md` remained
`TBD`, and this recovery is being performed before a retained production or
pilot migration history has been declared. Versions `000001` through `000013`
already form a valid prefix and remain byte-for-byte unchanged.

ADR-0001 normally forbids renaming or editing an applied migration. It also
requires repository history to be a valid exact prefix. We need to record why
repairing this unreleased, non-applicable tail is different from rewriting a
retained applied history.

## Decision

1. Treat `000001` through `000013` as the immutable released prefix.
2. Treat the former `000014` through `000019` files as an unreleased migration
   tail because the repository-owned runner could not apply that tail to a
   clean database.
3. Insert `000014_create_sales_and_audit_schema.sql` before Costing and Returns.
   It creates the canonical Sales aggregate tables required by Costing/Returns
   and the append-only Audit/Exception tables required by completed commands.
4. Resequence the former tail by one version:

   ```text
   former 000014 Costing   -> 000015
   former 000015 Pricing   -> 000016
   former 000016 Inventory -> 000017
   former 000017 Returns   -> 000018
   former 000018 Reporting -> 000019
   former 000019 Legacy ID -> 000020
   ```

5. Repair the unreleased Reporting migration while resequencing it. Reporting
   reads the actual Costing and Pricing column names, joins the RETAIL tier
   instead of reading a nonexistent price column from `price_versions`, and
   preserves missing cost as `NULL` rather than presenting it as zero.
6. Preserve the missing-cost rule structurally in Sales: a transaction item
   with `cost_status = 'COST_PENDING'` must have `cost_unit_snapshot IS NULL`;
   `FINAL` and `PROVISIONAL` require an explicit non-negative cost snapshot.
7. Any environment that contains an applied history row at version `000014` or
   above with the former filenames/checksums is not eligible for in-place use
   of this repaired lineage. Stop on checksum/history divergence. Because this
   is a pre-release recovery, such an environment must be explicitly confirmed
   disposable and rebuilt from a clean database; business data must never be
   erased implicitly by the migration runner.

## Relationship to ADR-0001

ADR-0001 remains authoritative. This ADR does not permit editing an applied
migration in a retained environment, weakening checksum validation, inserting
a migration beneath an accepted prefix, or adding a down migration. It records
one pre-release baseline correction for a tail that could not be applied from
the repository's own valid prefix.

After this corrected chain is accepted, migrations `000014` through `000020`
are immutable and every further schema correction must use a new forward
migration.

## Consequences

- A clean PostgreSQL database can apply the complete ordered chain.
- Costing and Returns foreign keys resolve against canonical Sales tables.
- Completed Sale persistence can represent immutable item, payment, pricing,
  cost-status, authorization-version, and correlation snapshots.
- Audit events and business exceptions have an append-oriented server schema.
- Reporting does not convert unknown/COST_PENDING valuation into fake zero cost.
- Retained environments must prove their migration prefix before deployment;
  divergence remains a hard stop, not an automatic repair.

