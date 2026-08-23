// @ts-check

import { decimalEquals } from "./decimal.mjs";
import { isRecord, requireIsoTimestamp, requireString } from "./support.mjs";

export const REQUIRED_EXTERNAL_EVIDENCE = [
  "USER_ROLE_RECONCILIATION",
  "OPENING_CASH_RECONCILIATION",
  "OFFLINE_SALE_SURVIVES_RESTART",
  "OFFLINE_RECONNECT_SYNC",
  "UNKNOWN_RESULT_IDEMPOTENT_RETRY",
  "MULTI_DEVICE_CONVERGENCE",
  "SECURITY_REVIEW",
];

/** @param {unknown} input */
export function parseStagingEvidence(input) {
  if (!isRecord(input) || String(input.schema_version) !== "1" || !Array.isArray(input.checks)) {
    throw new Error("Staging evidence must have schema_version 1 and a checks array.");
  }
  const checks = input.checks.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`evidence.checks[${index}] must be an object.`);
    const code = requireString(entry.code, `evidence.checks[${index}].code`);
    if (!REQUIRED_EXTERNAL_EVIDENCE.includes(code)) throw new Error(`Unsupported staging evidence code: ${code}.`);
    const status = requireString(entry.status, `evidence.checks[${index}].status`);
    if (status !== "PASS" && status !== "FAIL") throw new Error(`evidence.checks[${index}].status must be PASS or FAIL.`);
    return {
      code,
      status,
      observed_at: requireIsoTimestamp(entry.observed_at, `evidence.checks[${index}].observed_at`),
      reference: requireString(entry.reference, `evidence.checks[${index}].reference`),
    };
  });
  if (new Set(checks.map((entry) => entry.code)).size !== checks.length) throw new Error("Staging evidence contains duplicate check codes.");
  return checks.sort((left, right) => left.code.localeCompare(right.code, "en"));
}

const QUERIES = {
  context: `
    SELECT CURRENT_TIMESTAMP::text AS observed_at,
           EXISTS (SELECT 1 FROM core.businesses WHERE id = $1) AS business_exists`,
  catalog: `
    SELECT
      (SELECT COUNT(*)::text FROM catalog.products WHERE business_id = $1) AS product_count,
      (SELECT COUNT(*)::text FROM catalog.products WHERE business_id = $1 AND status = 'ACTIVE') AS active_product_count,
      (SELECT COUNT(*)::text FROM catalog.product_units WHERE business_id = $1) AS product_unit_count,
      (SELECT COUNT(*)::text FROM catalog.barcodes WHERE business_id = $1 AND status = 'ACTIVE') AS active_barcode_count,
      (SELECT COUNT(*)::text FROM (
         SELECT sku FROM catalog.products WHERE business_id = $1 GROUP BY sku HAVING COUNT(*) > 1
       ) duplicate_sku) AS duplicate_sku_count,
      (SELECT COUNT(*)::text FROM (
         SELECT barcode FROM catalog.barcodes WHERE business_id = $1 AND status = 'ACTIVE' GROUP BY barcode HAVING COUNT(*) > 1
       ) duplicate_barcode) AS duplicate_active_barcode_count`,
  inventory: `
    WITH ledger AS (
      SELECT location_id, product_id, SUM(base_quantity_delta) AS quantity
      FROM inventory.stock_movements WHERE business_id = $1 GROUP BY location_id, product_id
    ), balance AS (
      SELECT location_id, product_id, base_quantity FROM inventory.stock_balances WHERE business_id = $1
    )
    SELECT
      (SELECT COUNT(*)::text FROM inventory.stock_movements WHERE business_id = $1 AND movement_type = 'INITIAL_STOCK' AND source_type = 'MIGRATION_OPENING') AS opening_movement_count,
      (SELECT COALESCE(SUM(base_quantity_delta), 0)::text FROM inventory.stock_movements WHERE business_id = $1 AND movement_type = 'INITIAL_STOCK' AND source_type = 'MIGRATION_OPENING') AS opening_base_quantity,
      (SELECT COUNT(*)::text FROM inventory.stock_balances WHERE business_id = $1) AS balance_row_count,
      (SELECT COALESCE(SUM(base_quantity), 0)::text FROM inventory.stock_balances WHERE business_id = $1) AS current_base_quantity,
      (SELECT COUNT(*)::text FROM inventory.stock_balances WHERE business_id = $1 AND base_quantity < 0) AS negative_balance_count,
      (SELECT COUNT(*)::text FROM ledger FULL JOIN balance USING (location_id, product_id) WHERE COALESCE(ledger.quantity, 0) <> COALESCE(balance.base_quantity, 0)) AS ledger_balance_mismatch_count,
      (SELECT COUNT(*)::text FROM inventory.stock_balances b LEFT JOIN costing.product_cost_states c USING (business_id, location_id, product_id) WHERE b.business_id = $1 AND b.base_quantity <> 0 AND c.mwa_unit_cost IS NULL) AS inventory_value_missing_cost_count,
      (SELECT COALESCE(SUM(b.base_quantity * c.mwa_unit_cost), 0)::text FROM inventory.stock_balances b JOIN costing.product_cost_states c USING (business_id, location_id, product_id) WHERE b.business_id = $1) AS known_inventory_value`,
  pricing_costing: `
    SELECT
      (SELECT COUNT(*)::text FROM costing.cost_events WHERE business_id = $1 AND event_type = 'INITIAL_COST' AND source_type = 'MIGRATION_OPENING') AS opening_cost_event_count,
      (SELECT COUNT(*)::text FROM pricing.price_versions pv JOIN pricing.price_sets ps ON ps.id = pv.price_set_id WHERE pv.business_id = $1 AND ps.source_type = 'OPENING_PRICE') AS opening_price_version_count,
      (SELECT COUNT(*)::text FROM pricing.price_versions pv WHERE pv.business_id = $1 AND pv.status = 'ACTIVE' AND pv.effective_from <= CURRENT_TIMESTAMP AND (pv.effective_to IS NULL OR pv.effective_to > CURRENT_TIMESTAMP)) AS current_active_price_count,
      (SELECT COUNT(*)::text FROM catalog.product_units pu WHERE pu.business_id = $1 AND pu.status = 'ACTIVE' AND pu.can_sell AND NOT EXISTS (
         SELECT 1 FROM pricing.price_versions pv WHERE pv.business_id = pu.business_id AND pv.product_unit_id = pu.id AND pv.status = 'ACTIVE' AND pv.effective_from <= CURRENT_TIMESTAMP AND (pv.effective_to IS NULL OR pv.effective_to > CURRENT_TIMESTAMP)
       )) AS sellable_unit_missing_active_price_count,
      (SELECT COUNT(*)::text FROM pricing.price_sets WHERE business_id = $1 AND source_type <> 'OPENING_PRICE' AND status IN ('ACTIVE', 'SCHEDULED', 'SUPERSEDED')) AS operational_price_change_count`,
  identity: `
    SELECT
      COUNT(DISTINCT m.user_id) FILTER (WHERE m.status = 'ACTIVE' AND u.status = 'ACTIVE')::text AS active_user_count,
      COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM identity.membership_roles mr0 WHERE mr0.membership_id = m.id))::text AS active_membership_without_role_count,
      COUNT(*) FILTER (WHERE m.status = 'ACTIVE' AND r.code = 'OWNER')::text AS owner_assignment_count,
      COUNT(*) FILTER (WHERE m.status = 'ACTIVE' AND r.code = 'ADMIN')::text AS admin_assignment_count,
      COUNT(*) FILTER (WHERE m.status = 'ACTIVE' AND r.code = 'CASHIER')::text AS cashier_assignment_count,
      COUNT(*) FILTER (WHERE m.status = 'ACTIVE' AND upper(r.code) = 'SUPERVISOR')::text AS forbidden_supervisor_assignment_count
    FROM identity.business_memberships m
    JOIN identity.users u ON u.id = m.user_id
    LEFT JOIN identity.membership_roles mr ON mr.membership_id = m.id
    LEFT JOIN identity.roles r ON r.id = mr.role_id
    WHERE m.business_id = $1`,
  cash: `
    WITH movement_totals AS (
      SELECT shift_id,
             COALESCE(SUM(amount) FILTER (WHERE direction = 'IN'), 0) - COALESCE(SUM(amount) FILTER (WHERE direction = 'OUT'), 0) AS expected,
             COALESCE(SUM(amount) FILTER (WHERE movement_type = 'OPENING_BALANCE'), 0) AS opening_amount
      FROM cash.cash_movements WHERE business_id = $1 GROUP BY shift_id
    ), reconciliation_totals AS (
      SELECT sr.shift_id, COALESCE(SUM(sr.expected_cash_delta), 0) AS expected_delta
      FROM cash.shift_reconciliations sr
      JOIN cash.shifts rs ON rs.id = sr.shift_id
      WHERE rs.business_id = $1
      GROUP BY sr.shift_id
    )
    SELECT
      (SELECT COUNT(*)::text FROM cash.shifts WHERE business_id = $1) AS shift_count,
      (SELECT COUNT(*)::text FROM cash.shifts WHERE business_id = $1 AND status IN ('OPEN', 'CLOSING')) AS open_shift_count,
      (SELECT COUNT(*)::text FROM cash.shifts WHERE business_id = $1 AND status IN ('CLOSED', 'FORCED_CLOSED')) AS closed_shift_count,
      (SELECT COALESCE(SUM(opening_cash), 0)::text FROM cash.shifts WHERE business_id = $1) AS recorded_opening_cash,
      (SELECT COALESCE(SUM(amount), 0)::text FROM cash.cash_movements WHERE business_id = $1 AND movement_type = 'OPENING_BALANCE') AS ledger_opening_cash,
      (SELECT COUNT(*)::text FROM cash.shifts s LEFT JOIN movement_totals mt ON mt.shift_id = s.id WHERE s.business_id = $1 AND s.opening_cash <> COALESCE(mt.opening_amount, 0)) AS opening_cash_mismatch_count,
      (SELECT COUNT(*)::text FROM cash.shift_closing_snapshots cs JOIN cash.shifts s ON s.id = cs.shift_id LEFT JOIN movement_totals mt ON mt.shift_id = s.id LEFT JOIN reconciliation_totals rt ON rt.shift_id = s.id WHERE s.business_id = $1 AND cs.expected_cash + COALESCE(rt.expected_delta, 0) <> COALESCE(mt.expected, 0)) AS closed_expected_cash_mismatch_count,
      (SELECT COUNT(*)::text FROM sales.transactions t LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(p.amount), 0) AS amount FROM sales.payments p WHERE p.transaction_id = t.id AND p.status = 'COMPLETED' AND p.method_code_snapshot = 'CASH'
       ) pay ON TRUE LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(cm.amount), 0) AS amount FROM cash.cash_movements cm WHERE cm.business_id = t.business_id AND cm.source_type = 'SALE_TRANSACTION' AND cm.source_id = t.id AND cm.movement_type = 'CASH_SALE'
       ) cash_sale ON TRUE WHERE t.business_id = $1 AND t.status = 'COMPLETED' AND pay.amount <> cash_sale.amount) AS cash_sale_ledger_mismatch_count`,
  sales: `
    WITH item_totals AS (
      SELECT transaction_id, COALESCE(SUM(line_total), 0) AS subtotal,
             COUNT(*) FILTER (WHERE line_total <> final_unit_price_snapshot * quantity) AS line_math_errors,
             COUNT(*) FILTER (WHERE base_quantity <> quantity * conversion_snapshot) AS quantity_conversion_errors,
             COUNT(*) FILTER (WHERE cost_status = 'COST_PENDING' OR cost_unit_snapshot IS NULL) AS pending_cost_lines,
             COALESCE(SUM(cost_unit_snapshot * base_quantity) FILTER (WHERE cost_unit_snapshot IS NOT NULL), 0) AS cogs
      FROM sales.transaction_items GROUP BY transaction_id
    ), payment_totals AS (
      SELECT transaction_id, COALESCE(SUM(amount) FILTER (WHERE status = 'COMPLETED'), 0) AS paid FROM sales.payments GROUP BY transaction_id
    )
    SELECT
      COUNT(*) FILTER (WHERE t.status = 'COMPLETED')::text AS completed_transaction_count,
      COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'COMPLETED'), 0)::text AS sales_total,
      COALESCE(SUM(i.cogs) FILTER (WHERE t.status = 'COMPLETED'), 0)::text AS cogs_total,
      (COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'COMPLETED'), 0) - COALESCE(SUM(i.cogs) FILTER (WHERE t.status = 'COMPLETED'), 0))::text AS gross_margin_amount,
      CASE WHEN COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'COMPLETED'), 0) = 0 THEN NULL ELSE
        ((COALESCE(SUM(t.grand_total) FILTER (WHERE t.status = 'COMPLETED'), 0) - COALESCE(SUM(i.cogs) FILTER (WHERE t.status = 'COMPLETED'), 0)) / (SUM(t.grand_total) FILTER (WHERE t.status = 'COMPLETED')))::text END AS gross_margin_ratio,
      COUNT(*) FILTER (WHERE t.status = 'COMPLETED' AND (
        t.subtotal <> COALESCE(i.subtotal, 0)
        OR t.grand_total <> t.subtotal - t.promotion_discount_total - t.line_discount_total - t.transaction_discount_total + t.tax_total
        OR t.total_paid <> t.grand_total
        OR COALESCE(p.paid, 0) <> t.total_paid
      ))::text AS transaction_math_mismatch_count,
      COALESCE(SUM(i.line_math_errors) FILTER (WHERE t.status = 'COMPLETED'), 0)::text AS line_math_mismatch_count,
      COALESCE(SUM(i.quantity_conversion_errors) FILTER (WHERE t.status = 'COMPLETED'), 0)::text AS quantity_conversion_mismatch_count,
      COALESCE(SUM(i.pending_cost_lines) FILTER (WHERE t.status = 'COMPLETED'), 0)::text AS cogs_pending_line_count
    FROM sales.transactions t
    LEFT JOIN item_totals i ON i.transaction_id = t.id
    LEFT JOIN payment_totals p ON p.transaction_id = t.id
    WHERE t.business_id = $1`,
  workflows: `
    SELECT
      (SELECT COUNT(*)::text FROM purchasing.purchases WHERE business_id = $1 AND status = 'POSTED') AS posted_purchase_count,
      (SELECT COUNT(*)::text FROM inventory.opname_sessions WHERE business_id = $1 AND status = 'POSTED') AS posted_opname_count,
      (SELECT COUNT(*)::text FROM returns.customer_returns WHERE business_id = $1 AND status = 'COMPLETED') AS completed_return_count,
      (SELECT COUNT(*)::text FROM returns.refunds WHERE business_id = $1 AND status = 'COMPLETED') AS completed_refund_count`,
  exceptions: `
    SELECT
      (SELECT COUNT(*)::text FROM audit.business_exceptions WHERE business_id = $1 AND severity = 'CRITICAL' AND status IN ('OPEN', 'ACKNOWLEDGED')) AS open_critical_exception_count,
      (SELECT COUNT(*)::text FROM sync.conflicts WHERE business_id = $1 AND status NOT IN ('RESOLVED', 'DISMISSED')) AS open_sync_conflict_count,
      (SELECT COUNT(*)::text FROM sync.idempotency_records WHERE business_id = $1 AND status NOT IN ('COMPLETED', 'REJECTED') AND created_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes') AS stale_idempotency_record_count`,
};

/** @param {any} client @param {string} businessId */
async function collectObserved(client, businessId) {
  const observed = {};
  for (const [name, sql] of Object.entries(QUERIES)) {
    const result = await client.query(`/* staging-readiness:${name} */${sql}`, [businessId]);
    if (result.rows.length !== 1) throw new Error(`Readiness query ${name} did not return exactly one row.`);
    observed[name] = result.rows[0];
  }
  return observed;
}

/** @param {unknown} value */
function isNonzero(value) {
  return typeof value === "string" ? value !== "0" : Number(value) !== 0;
}

/** @param {unknown[]} blockers @param {string} code @param {string} message @param {unknown} observed */
function blockWhenNonzero(blockers, code, message, observed) {
  if (isNonzero(observed)) blockers.push({ code, message, observed });
}

/** @param {any} observed @param {any|null} expectedPlan @param {any[]|null} evidence */
export function assessReadiness(observed, expectedPlan = null, evidence = null) {
  const blockers = [];
  const evidenceGaps = [];
  if (observed.context.business_exists !== true) blockers.push({ code: "BUSINESS_NOT_FOUND", message: "Target business does not exist.", observed: false });

  blockWhenNonzero(blockers, "DUPLICATE_SKU", "Canonical product SKUs are not unique.", observed.catalog.duplicate_sku_count);
  blockWhenNonzero(blockers, "DUPLICATE_BARCODE", "Active barcodes are not unique.", observed.catalog.duplicate_active_barcode_count);
  blockWhenNonzero(blockers, "STOCK_LEDGER_PROJECTION_MISMATCH", "Stock balance disagrees with the stock movement ledger.", observed.inventory.ledger_balance_mismatch_count);
  blockWhenNonzero(blockers, "INVENTORY_VALUE_COST_MISSING", "Non-zero stock has no MWA cost evidence.", observed.inventory.inventory_value_missing_cost_count);
  blockWhenNonzero(blockers, "ACTIVE_PRICE_MISSING", "An active sellable unit has no effective active price.", observed.pricing_costing.sellable_unit_missing_active_price_count);
  blockWhenNonzero(blockers, "MEMBERSHIP_ROLE_MISSING", "An active membership has no role assignment.", observed.identity.active_membership_without_role_count);
  blockWhenNonzero(blockers, "FORBIDDEN_SUPERVISOR_ROLE", "A legacy SUPERVISOR role remains assigned.", observed.identity.forbidden_supervisor_assignment_count);
  blockWhenNonzero(blockers, "OPENING_CASH_LEDGER_MISMATCH", "Shift opening cash disagrees with OPENING_BALANCE movements.", observed.cash.opening_cash_mismatch_count);
  blockWhenNonzero(blockers, "CLOSED_CASH_LEDGER_MISMATCH", "A closed shift expected-cash snapshot disagrees with its ledger.", observed.cash.closed_expected_cash_mismatch_count);
  blockWhenNonzero(blockers, "CASH_SALE_LEDGER_MISMATCH", "Completed cash payments disagree with CASH_SALE movements.", observed.cash.cash_sale_ledger_mismatch_count);
  blockWhenNonzero(blockers, "TRANSACTION_MATH_MISMATCH", "Completed transaction aggregate math does not reconcile.", observed.sales.transaction_math_mismatch_count);
  blockWhenNonzero(blockers, "LINE_MATH_MISMATCH", "Completed transaction line math does not reconcile.", observed.sales.line_math_mismatch_count);
  blockWhenNonzero(blockers, "QUANTITY_CONVERSION_MISMATCH", "Completed transaction quantity conversion does not reconcile.", observed.sales.quantity_conversion_mismatch_count);
  blockWhenNonzero(blockers, "COGS_PENDING", "Completed sales still have missing/pending COGS.", observed.sales.cogs_pending_line_count);
  blockWhenNonzero(blockers, "OPEN_CRITICAL_EXCEPTION", "Critical business exceptions remain open.", observed.exceptions.open_critical_exception_count);
  blockWhenNonzero(blockers, "OPEN_SYNC_CONFLICT", "Sync conflicts remain unresolved.", observed.exceptions.open_sync_conflict_count);
  blockWhenNonzero(blockers, "STALE_IDEMPOTENCY", "Server idempotency records remain in an unresolved state.", observed.exceptions.stale_idempotency_record_count);

  if (expectedPlan === null) {
    evidenceGaps.push({ code: "EXPECTED_MIGRATION_PLAN_NOT_PROVIDED", message: "Catalog/opening counts cannot be reconciled without the reviewed migration plan." });
  } else {
    const expected = expectedPlan.reconciliation_expected;
    const comparisons = [
      ["PRODUCT_COUNT", String(expected.canonical_products), observed.catalog.product_count, false],
      ["BARCODE_COUNT", String(expected.canonical_barcodes), observed.catalog.active_barcode_count, false],
      ["OPENING_STOCK_MOVEMENT_COUNT", String(expected.opening_stock_movements), observed.inventory.opening_movement_count, false],
      ["OPENING_STOCK_QUANTITY", expected.opening_stock_base_quantity, observed.inventory.opening_base_quantity, true],
      ["OPENING_COST_EVENT_COUNT", String(expected.opening_cost_events), observed.pricing_costing.opening_cost_event_count, false],
      ["OPENING_PRICE_VERSION_COUNT", String(expected.active_opening_prices), observed.pricing_costing.opening_price_version_count, false],
    ];
    for (const [code, expectedValue, observedValue, decimal] of comparisons) {
      const matches = decimal
        ? decimalEquals(String(expectedValue), String(observedValue))
        : String(expectedValue) === String(observedValue);
      if (!matches) blockers.push({ code: `MIGRATION_${code}_MISMATCH`, message: "Observed staging value differs from the reviewed migration plan.", expected: expectedValue, observed: observedValue });
    }
  }

  const requiredScenarios = [
    ["PURCHASE_SCENARIO", observed.workflows.posted_purchase_count],
    ["SALE_SCENARIO", observed.sales.completed_transaction_count],
    ["SHIFT_SCENARIO", observed.cash.closed_shift_count],
    ["REFUND_SCENARIO", observed.workflows.completed_refund_count],
    ["PRICING_CHANGE_SCENARIO", observed.pricing_costing.operational_price_change_count],
    ["OPNAME_SCENARIO", observed.workflows.posted_opname_count],
  ];
  for (const [code, count] of requiredScenarios) {
    if (!isNonzero(count)) evidenceGaps.push({ code, message: "No persisted staging fact proves this required M14 scenario.", observed: count });
  }

  const evidenceByCode = new Map((evidence ?? []).map((entry) => [entry.code, entry]));
  for (const code of REQUIRED_EXTERNAL_EVIDENCE) {
    const entry = evidenceByCode.get(code);
    if (entry === undefined) evidenceGaps.push({ code, message: "Required external evidence was not provided." });
    else if (entry.status !== "PASS") blockers.push({ code: `${code}_FAILED`, message: "External staging evidence records a failure.", reference: entry.reference });
  }

  return {
    status: blockers.length > 0 ? "NOT_READY" : evidenceGaps.length > 0 ? "INSUFFICIENT_EVIDENCE" : "READY_FOR_PILOT_REVIEW",
    blockers,
    evidence_gaps: evidenceGaps,
  };
}

/** @param {any} client @param {string} businessId @param {any|null} expectedPlan @param {any[]|null} evidence */
export async function collectStagingReadiness(client, businessId, expectedPlan = null, evidence = null) {
  const observed = await collectObserved(client, businessId);
  return {
    schema_version: 1,
    kind: "KASTUR_STAGING_READINESS_REPORT",
    business_id: businessId,
    observed_at: observed.context.observed_at,
    expected_plan_id: expectedPlan?.plan_id ?? null,
    automated_observations: observed,
    supplied_external_evidence: evidence ?? [],
    assessment: assessReadiness(observed, expectedPlan, evidence),
    limitation: "READY_FOR_PILOT_REVIEW is an evidence gate, not proof of production readiness or authorization to cut over.",
  };
}

export const stagingReadinessQueryNames = Object.keys(QUERIES);
