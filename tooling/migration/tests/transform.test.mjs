import assert from "node:assert/strict";
import test from "node:test";

import { runDryRun } from "../dry-run.mjs";
import { parseMigrationManifest } from "../manifest.mjs";
import { canonicalJson } from "../support.mjs";
import { buildMigrationPlan } from "../transform.mjs";

const manifestPath = new URL("./fixtures/manifest.json", import.meta.url).pathname;

test("dry-run is byte-for-byte deterministic and emits only allowed staging facts", async () => {
  const first = await runDryRun(manifestPath);
  const second = await runDryRun(manifestPath);

  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.match(first.plan_id, /^[a-f0-9]{64}$/u);
  assert.deepEqual(first.issues, []);
  assert.equal(first.records.products.length, 2);
  assert.equal(first.deduplication_report.canonical_groups.length, 2);
  assert.equal(first.deduplication_report.applied_matches.length, 2);
  assert.ok(first.deduplication_report.applied_matches.every((match) => match.reason === "BARCODE"));
  assert.equal(first.records.product_units.length, 2);
  assert.equal(first.records.stock_movements[0].movement_type, "INITIAL_STOCK");
  assert.equal(first.records.cost_events[0].event_type, "INITIAL_COST");
  assert.equal(first.records.price_sets[0].source_type, "OPENING_PRICE");
  assert.ok(first.records.legacy_id_map.some((row) => row.entity_type === "barcode"));
  assert.ok(first.records.legacy_id_map.some((row) => row.entity_type === "stock_movement" && row.legacy_id === "balance-1"));
  assert.equal(first.reconciliation_expected.opening_stock_base_quantity, "5.5");
  assert.equal(first.reconciliation_expected.opening_inventory_value, "67.870000055");
  assert.equal(first.reconciliation_expected.excluded_records[1].credential_records, 1);
  assert.equal("users" in first.records, false);
  assert.equal("roles" in first.records, false);
  assert.equal("sync_queue" in first.records, false);
});

function baseManifest() {
  return parseMigrationManifest({
    schema_version: 1,
    business_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    default_location_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    actor_user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    cutover_at: "2026-08-22T16:00:00.000Z",
    default_track_inventory: true,
    fallback_category_name: "Umum",
    unit_defaults: { can_sell: true, can_purchase: true, allow_decimal_qty: false },
    opening_price_tax: { mode: "NO_PPN", rate: "0" },
    sources: [
      { id: "left", type: "catalog-csv", path: "left.csv" },
      { id: "right", type: "catalog-csv", path: "right.csv" },
    ],
    opening_authority: { stock_source_id: null, cost_source_id: null, price_source_id: null },
    known_relations: [],
    location_map: [],
  });
}

function source(id, product) {
  return {
    source_system: "spreadsheet",
    source_id: id,
    products: [{
      source_system: "spreadsheet",
      source_id: id,
      legacy_product_id: `${id}-product`,
      sku: product.sku,
      name: product.name,
      category_name: "Umum",
      legacy_category_id: null,
      brand_name: null,
      legacy_brand_id: null,
      supplier: null,
      is_active: true,
      track_inventory: true,
      product_barcode: product.barcode,
      units: [{ legacy_unit_id: `${id}-unit`, unit_name: "pcs", conversion_to_base: "1", cost: null, price: null, effective_at: null, barcodes: [] }],
      stock: [],
      known_relations: [],
    }],
    issues: [],
    excluded: {},
  };
}

test("exact name/unit candidates are surfaced and never auto-merged", () => {
  const plan = buildMigrationPlan(baseManifest(), [
    source("left", { sku: "LEFT", name: "Nama Sama", barcode: "100" }),
    source("right", { sku: "RIGHT", name: "Nama Sama", barcode: "200" }),
  ]);

  assert.equal(plan.records.products.length, 2);
  assert.ok(plan.issues.some((issue) => issue.code === "NAME_UNIT_MATCH_REQUIRES_MANUAL_RELATION"));
});

test("SKU matching cannot override conflicting barcode evidence", () => {
  const plan = buildMigrationPlan(baseManifest(), [
    source("left", { sku: "SAME", name: "Satu", barcode: "100" }),
    source("right", { sku: "SAME", name: "Dua", barcode: "200" }),
  ]);

  assert.equal(plan.records.products.length, 2);
  assert.ok(plan.issues.some((issue) => issue.code === "STRONG_BARCODE_CONFLICT"));
  assert.ok(plan.issues.some((issue) => issue.code === "DUPLICATE_CANONICAL_SKU"));
});

test("an explicit known relation is traceable and merges records only after stronger keys", () => {
  const manifest = baseManifest();
  manifest.known_relations = [{
    left: { source_id: "left", legacy_product_id: "left-product" },
    right: { source_id: "right", legacy_product_id: "right-product" },
  }];
  const plan = buildMigrationPlan(manifest, [
    source("left", { sku: "LEGACY-A", name: "Nama A", barcode: null }),
    source("right", { sku: "LEGACY-B", name: "Nama B", barcode: null }),
  ]);

  assert.equal(plan.records.products.length, 1);
  assert.deepEqual(plan.deduplication_report.applied_matches.map((match) => match.reason), ["KNOWN_RELATION"]);
  assert.equal(plan.records.legacy_id_map.filter((row) => row.entity_type === "product").length, 2);
});

test("opening migration preserves negative stock instead of clamping ledger reality", () => {
  const manifest = baseManifest();
  manifest.sources = manifest.sources.filter((entry) => entry.id === "left");
  manifest.opening_authority = {
    stock_source_id: "left",
    cost_source_id: "left",
    price_source_id: "left",
  };
  const left = source("left", { sku: "NEGATIVE", name: "Stok Negatif", barcode: "999" });
  left.products[0].units[0].cost = "3";
  left.products[0].units[0].price = "5";
  left.products[0].stock = [{
    legacy_balance_id: "negative-balance",
    legacy_location_id: null,
    quantity: "-2.5",
    quantity_kind: "BASE",
  }];

  const plan = buildMigrationPlan(manifest, [left]);
  assert.equal(plan.records.stock_movements[0].base_quantity_delta, "-2.5");
  assert.equal(plan.records.stock_balances[0].base_quantity, "-2.5");
  assert.equal(plan.reconciliation_expected.opening_stock_base_quantity, "-2.5");
});
