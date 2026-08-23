import assert from "node:assert/strict";
import test from "node:test";

import { runDryRun } from "../dry-run.mjs";
import {
  assessReadiness,
  collectStagingReadiness,
  parseStagingEvidence,
  REQUIRED_EXTERNAL_EVIDENCE,
  stagingReadinessQueryNames,
} from "../readiness.mjs";

const manifestPath = new URL("./fixtures/manifest.json", import.meta.url).pathname;

function cleanObserved(plan) {
  return {
    context: { observed_at: "2026-08-23 00:00:00+00", business_exists: true },
    catalog: {
      product_count: String(plan.reconciliation_expected.canonical_products),
      active_product_count: String(plan.reconciliation_expected.canonical_products),
      product_unit_count: String(plan.reconciliation_expected.canonical_product_units),
      active_barcode_count: String(plan.reconciliation_expected.canonical_barcodes),
      duplicate_sku_count: "0",
      duplicate_active_barcode_count: "0",
    },
    inventory: {
      opening_movement_count: String(plan.reconciliation_expected.opening_stock_movements),
      opening_base_quantity: plan.reconciliation_expected.opening_stock_base_quantity,
      balance_row_count: "2",
      current_base_quantity: "4.5",
      negative_balance_count: "1",
      ledger_balance_mismatch_count: "0",
      inventory_value_missing_cost_count: "0",
      known_inventory_value: "50",
    },
    pricing_costing: {
      opening_cost_event_count: String(plan.reconciliation_expected.opening_cost_events),
      opening_price_version_count: String(plan.reconciliation_expected.active_opening_prices),
      current_active_price_count: "2",
      sellable_unit_missing_active_price_count: "0",
      operational_price_change_count: "1",
    },
    identity: {
      active_user_count: "3",
      active_membership_without_role_count: "0",
      owner_assignment_count: "1",
      admin_assignment_count: "1",
      cashier_assignment_count: "1",
      forbidden_supervisor_assignment_count: "0",
    },
    cash: {
      shift_count: "1",
      open_shift_count: "0",
      closed_shift_count: "1",
      recorded_opening_cash: "100000",
      ledger_opening_cash: "100000",
      opening_cash_mismatch_count: "0",
      closed_expected_cash_mismatch_count: "0",
      cash_sale_ledger_mismatch_count: "0",
    },
    sales: {
      completed_transaction_count: "1",
      sales_total: "20000",
      cogs_total: "12000",
      gross_margin_amount: "8000",
      gross_margin_ratio: "0.4",
      transaction_math_mismatch_count: "0",
      line_math_mismatch_count: "0",
      quantity_conversion_mismatch_count: "0",
      cogs_pending_line_count: "0",
    },
    workflows: {
      posted_purchase_count: "1",
      posted_opname_count: "1",
      completed_return_count: "1",
      completed_refund_count: "1",
    },
    exceptions: {
      open_critical_exception_count: "0",
      open_sync_conflict_count: "0",
      stale_idempotency_record_count: "0",
    },
  };
}

function passingEvidence() {
  return parseStagingEvidence({
    schema_version: 1,
    checks: REQUIRED_EXTERNAL_EVIDENCE.map((code) => ({
      code,
      status: "PASS",
      observed_at: "2026-08-23T00:00:00.000Z",
      reference: `runbook://${code.toLocaleLowerCase("en-US")}`,
    })),
  });
}

test("readiness never claims readiness without expected and external evidence", async () => {
  const plan = await runDryRun(manifestPath);
  const assessment = assessReadiness(cleanObserved(plan));

  assert.equal(assessment.status, "INSUFFICIENT_EVIDENCE");
  assert.ok(assessment.evidence_gaps.some((gap) => gap.code === "EXPECTED_MIGRATION_PLAN_NOT_PROVIDED"));
  assert.ok(assessment.evidence_gaps.some((gap) => gap.code === "OFFLINE_RECONNECT_SYNC"));
});

test("readiness reports exact critical mismatches", async () => {
  const plan = await runDryRun(manifestPath);
  const observed = cleanObserved(plan);
  observed.inventory.ledger_balance_mismatch_count = "1";
  observed.sales.cogs_pending_line_count = "2";

  const assessment = assessReadiness(observed, plan, passingEvidence());
  assert.equal(assessment.status, "NOT_READY");
  assert.deepEqual(assessment.blockers.map((entry) => entry.code), ["STOCK_LEDGER_PROJECTION_MISMATCH", "COGS_PENDING"]);
});

test("clean database observations plus complete cited evidence reach pilot review gate", async () => {
  const plan = await runDryRun(manifestPath);
  const assessment = assessReadiness(cleanObserved(plan), plan, passingEvidence());

  assert.equal(assessment.status, "READY_FOR_PILOT_REVIEW");
  assert.deepEqual(assessment.blockers, []);
  assert.deepEqual(assessment.evidence_gaps, []);
});

test("readiness collector executes every named read-only observation", async () => {
  const plan = await runDryRun(manifestPath);
  const observed = cleanObserved(plan);
  const seen = [];
  const client = {
    async query(sql) {
      const name = /staging-readiness:([a-z_]+)/u.exec(sql)?.[1];
      assert.ok(name);
      seen.push(name);
      return { rows: [observed[name]], rowCount: 1 };
    },
  };

  const report = await collectStagingReadiness(client, plan.business_id, plan, passingEvidence());
  assert.deepEqual(seen, stagingReadinessQueryNames);
  assert.equal(report.assessment.status, "READY_FOR_PILOT_REVIEW");
  assert.equal(report.expected_plan_id, plan.plan_id);
});
