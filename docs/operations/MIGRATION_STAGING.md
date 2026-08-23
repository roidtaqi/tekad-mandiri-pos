# Legacy migration and staging reconciliation

This runbook covers the M12 legacy-data tooling and the automated part of the M14 staging gate. It does not authorize a production import or cutover. Real legacy exports, a migrated staging PostgreSQL database, secure user enrollment, and cited operational/offline evidence remain external operator inputs.

## Safety boundaries

- The tooling reads legacy files; it does not connect to or modify either legacy repository.
- Only catalog rows, `INITIAL_STOCK`, `INITIAL_COST`, `OPENING_PRICE`, `core.legacy_id_map`, their projections, and one append-only audit event can appear in an import plan.
- Legacy users, PIN/password fields, role caches, sessions, tokens, sync queues/logs/state, and historical POS facts are counted as exclusions and discarded. Users must enroll secure v2 credentials separately.
- Product matching is deterministic: exact Barcode, then exact normalized SKU, then an explicit known relation. Exact name plus unit is a review candidate only and is never an automatic or fuzzy merge. Conflicting stronger barcode evidence blocks a weaker match.
- JSON numeric literals are read losslessly as strings. Validation and report arithmetic use decimal strings/`BigInt`; staging reconciliation arithmetic remains PostgreSQL `NUMERIC`. The tool never routes authoritative values through JavaScript `number`.
- A source must be selected explicitly for each opening authority. Competing snapshots are never silently summed or preferred.

## Supported inputs

`inventory-pricing-json` reads the inventory-pricing-app Settings backup shape. `integrated-pos-json` reads the integrated-pos-app Dexie/snapshot shape. `catalog-csv` accepts UTF-8 comma-separated rows with RFC-style quoted fields and both legacy catalog column dialects. Export an XLSX workbook to a reviewed CSV first; this tool does not interpret workbook formulas.

Every configured source has a unique manifest `id`. Traceability writes `core.legacy_id_map.source_system` as `<legacy-system>:<manifest-source-id>`, preventing two exports from collapsing the same legacy identifier namespace.

## Manifest

Use a version-controlled template containing no secrets, then keep the real manifest and exports in an access-controlled working directory outside Git:

```json
{
  "schema_version": 1,
  "business_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "default_location_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "actor_user_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "cutover_at": "2026-08-22T16:00:00.000Z",
  "default_track_inventory": true,
  "fallback_category_name": "Belum Diklasifikasi",
  "unit_defaults": {
    "can_sell": true,
    "can_purchase": true,
    "allow_decimal_qty": false
  },
  "opening_price_tax": {
    "mode": "NO_PPN",
    "rate": "0"
  },
  "sources": [
    {
      "id": "inventory-main",
      "type": "inventory-pricing-json",
      "path": "inventory-pricing.json"
    },
    {
      "id": "pos-main",
      "type": "integrated-pos-json",
      "path": "integrated-pos.json"
    },
    {
      "id": "catalog-sheet",
      "type": "catalog-csv",
      "path": "catalog.csv"
    }
  ],
  "opening_authority": {
    "stock_source_id": "pos-main",
    "cost_source_id": "inventory-main",
    "price_source_id": "inventory-main"
  },
  "location_map": [
    {
      "source_id": "pos-main",
      "legacy_location_id": "legacy-outlet-id",
      "location_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }
  ],
  "known_relations": [
    {
      "left": {
        "source_id": "inventory-main",
        "legacy_product_id": "inventory-product-id"
      },
      "right": {
        "source_id": "catalog-sheet",
        "legacy_product_id": "spreadsheet-product-id"
      }
    }
  ]
}
```

`default_track_inventory`, unit behavior, price tax treatment, fallback category, cutover time, and opening authorities are explicit because guessing them would alter business semantics. A non-empty legacy location must have an explicit `location_map`; the tool does not collapse unknown outlets into the default location.

## Dry-run and review

```bash
npm run migration:dry-run -- \
  --manifest /secure/migration/manifest.json \
  --output /secure/migration/reviewed-plan.json
```

Run the same command twice against unchanged inputs and compare the files or `plan_id`; output is byte-for-byte deterministic. The plan contains source fingerprints, validation/dedup issues, excluded-record counts, generated IDs, complete proposed rows, and expected reconciliation totals.

Exit code `2` means the plan was produced but has an unresolved `ERROR` or `REVIEW`. Resolve source data or add a reviewed `known_relations` entry, then generate a new plan. Never edit the generated plan: its SHA-256 `plan_id` protects every field. A name/unit review is deliberately not an instruction to merge.

Review at least:

- product, unit, barcode, category, brand, and supplier counts;
- every duplicate/mismatch and every excluded credential/sync/history count;
- source selected for stock, base-unit cost, and per-unit price;
- opening base quantity and inventory value, including any missing-cost evidence;
- negative stock as-is—it is reported and never clamped; and
- `legacy_id_map` coverage for products, units, and available category/brand/supplier IDs.

`INITIAL_COST.value_delta` remains `NULL` when the optional database column would require an undocumented precision reduction. Unit cost, cost state, and the exact reconciliation value remain available without inventing a rounding rule. For preserved negative opening stock, the optional cost-event `quantity_basis` is also `NULL` because its canonical constraint is nonnegative; the negative quantity remains unchanged in the authoritative stock movement and balance.

## Staging import

First apply database migrations and bootstrap the target Business, locations, and securely enrolled migration actor. The actor must be an active member of the active Business. Then import only the reviewed artifact:

```bash
KASTUR_TARGET_ENVIRONMENT=staging \
DATABASE_URL='postgresql://staging-direct-endpoint/...' \
npm run migration:staging-import -- \
  --plan /secure/migration/reviewed-plan.json \
  --environment staging \
  --confirm-plan-id '<64-character plan_id>'
```

Both staging guards are mandatory. The importer takes a business-scoped PostgreSQL advisory lock and uses one serializable transaction. A first run inserts the plan; a repeat run verifies identical rows. A same-ID row with different data, another uniqueness conflict, missing authority record, unauthorized collection, checksum change, or unresolved review causes a full rollback.

The importer never imports users or credentials and never synthesizes Purchases. Do not use it against production.

## Staging readiness

The read-only readiness command queries observed PostgreSQL facts for catalog counts, barcode/SKU uniqueness, opening and current stock, ledger/projection integrity, inventory value, active price coverage, user/role assignments, cash ledgers, sales math, COGS, margin, required workflow facts, critical exceptions, sync conflicts, and stale idempotency records:

```bash
KASTUR_TARGET_ENVIRONMENT=staging \
DATABASE_URL='postgresql://staging-direct-endpoint/...' \
npm run staging:readiness -- \
  --business-id 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' \
  --environment staging \
  --expected-plan /secure/migration/reviewed-plan.json \
  --evidence /secure/migration/staging-evidence.json \
  --output /secure/migration/readiness-report.json
```

The command runs in a read-only transaction. Without the reviewed plan it reports `INSUFFICIENT_EVIDENCE` rather than inventing baseline counts. Persisted workflow facts must prove at least one posted Purchase, completed Sale, closed Shift, completed Refund, operational price change, and posted Opname.

Browser restart, reconnect, unknown-result retry, multi-device convergence, user/role expectations, opening-cash expectations, and the security review cannot be inferred safely from aggregate database queries. Supply cited evidence explicitly:

```json
{
  "schema_version": 1,
  "checks": [
    {
      "code": "OFFLINE_SALE_SURVIVES_RESTART",
      "status": "PASS",
      "observed_at": "2026-08-23T03:00:00.000Z",
      "reference": "test-run://staging-run-123"
    }
  ]
}
```

The complete required code list is exported as `REQUIRED_EXTERNAL_EVIDENCE` in `tooling/migration/readiness.mjs`; the command rejects unknown, duplicate, uncited, or malformed entries. A `FAIL` is a blocker. A missing entry is an evidence gap.

Status meanings:

- `NOT_READY`: at least one observed mismatch or failed evidence item is a blocker.
- `INSUFFICIENT_EVIDENCE`: no observed blocker, but required plan/scenario/external evidence is absent.
- `READY_FOR_PILOT_REVIEW`: automated checks and supplied evidence pass. This still requires human approval and is not authorization for M15, production, or cutover.

The command exits `2` for both non-ready states so CI or an operator checklist cannot mistake a generated report for a passing gate.

## Tool tests

```bash
npm run migration:test
```

Focused tests cover lossless readers, CSV quoting, secret exclusion, deterministic matching, ambiguous-name review, barcode/SKU conflict handling, exact opening arithmetic, plan tamper detection, strict import/rollback, and readiness evidence/mismatch classification. These fixture tests do not claim that a real legacy export or staging database was exercised.
