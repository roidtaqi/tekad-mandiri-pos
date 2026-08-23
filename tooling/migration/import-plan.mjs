// @ts-check

import { canonicalJson, isRecord, sha256Hex, UUID_PATTERN } from "./support.mjs";

const TABLES = [
  { key: "categories", table: "catalog.categories", conflict: ["id"], columns: ["id", "business_id", "name", "status", "created_at", "updated_at", "version"] },
  { key: "brands", table: "catalog.brands", conflict: ["id"], columns: ["id", "business_id", "name", "status", "created_at", "updated_at", "version"] },
  { key: "suppliers", table: "catalog.suppliers", conflict: ["id"], columns: ["id", "business_id", "code", "name", "phone", "email", "address", "payment_details_json", "status", "created_at", "updated_at", "version"], json: ["payment_details_json"] },
  { key: "products", table: "catalog.products", conflict: ["id"], columns: ["id", "business_id", "sku", "name", "category_id", "brand_id", "base_unit_code", "track_inventory", "status", "created_at", "updated_at", "version"] },
  { key: "product_units", table: "catalog.product_units", conflict: ["id"], columns: ["id", "business_id", "product_id", "unit_code", "display_name", "conversion_factor", "can_sell", "can_purchase", "allow_decimal_qty", "status", "created_at", "updated_at", "version"] },
  { key: "barcodes", table: "catalog.barcodes", conflict: ["id"], columns: ["id", "business_id", "product_unit_id", "barcode", "is_internal", "status", "created_at", "deactivated_at"] },
  { key: "product_suppliers", table: "catalog.product_suppliers", conflict: ["product_id", "supplier_id"], columns: ["product_id", "supplier_id", "supplier_sku", "is_preferred", "status", "created_at"] },
  { key: "stock_movements", table: "inventory.stock_movements", conflict: ["id"], columns: ["id", "business_id", "location_id", "product_id", "movement_type", "base_quantity_delta", "source_unit_id", "source_quantity", "conversion_snapshot", "source_type", "source_id", "source_line_id", "reason_code", "occurred_at", "actor_user_id", "device_id", "correlation_id"] },
  { key: "stock_balances", table: "inventory.stock_balances", conflict: ["business_id", "location_id", "product_id"], columns: ["business_id", "location_id", "product_id", "base_quantity", "last_movement_id", "updated_at"] },
  { key: "cost_events", table: "costing.cost_events", conflict: ["id"], columns: ["id", "business_id", "location_id", "product_id", "event_type", "quantity_basis", "unit_cost_before", "unit_cost_after", "value_delta", "source_type", "source_id", "reason", "occurred_at", "actor_user_id", "correlation_id"] },
  { key: "product_cost_states", table: "costing.product_cost_states", conflict: ["business_id", "location_id", "product_id"], columns: ["business_id", "location_id", "product_id", "mwa_unit_cost", "last_valid_mwa_unit_cost", "latest_landed_unit_cost", "pricing_reference_unit_cost", "pricing_reference_source_type", "pricing_reference_source_id", "last_cost_event_id", "updated_at"] },
  { key: "price_sets", table: "pricing.price_sets", conflict: ["id"], columns: ["id", "business_id", "name", "source_type", "status", "proposed_by", "approved_by", "approved_at", "effective_from", "notes", "created_at", "updated_at", "version"] },
  { key: "price_versions", table: "pricing.price_versions", conflict: ["id"], columns: ["id", "business_id", "product_unit_id", "status", "effective_from", "effective_to", "created_at", "price_set_id", "pricing_reference_cost_snapshot", "tax_mode", "tax_rate_snapshot", "created_by", "approved_by"] },
  { key: "price_tiers", table: "pricing.price_tier_versions", conflict: ["id"], columns: ["id", "price_version_id", "tier_code", "min_qty", "unit_price", "sort_order"] },
  { key: "legacy_id_map", table: "core.legacy_id_map", conflict: ["id"], columns: ["id", "business_id", "source_system", "entity_type", "legacy_id", "new_entity_id", "migrated_at"] },
  { key: "audit_events", table: "audit.audit_events", conflict: ["id"], columns: ["id", "business_id", "location_id", "actor_type", "actor_user_id", "actor_role_snapshot", "action", "entity_type", "entity_id", "occurred_at", "recorded_at", "device_id", "session_id", "reason", "before_data", "after_data", "correlation_id", "authorization_version"], json: ["before_data", "after_data"] },
];

const ALLOWED_RECORD_KEYS = new Set(TABLES.map((entry) => entry.key));
const FORBIDDEN_PLAN_KEYS = /(?:^|_)(?:pin|password|credential|token|secret|sync_state|sync_queue|users|roles|sessions)(?:$|_)/iu;
const SAFE_EXCLUSION_COUNTER_KEYS = new Set([
  "credential_records",
  "user_records",
  "role_records",
  "sync_state_records",
  "operational_history_records",
]);

/** @param {unknown} value @param {string} path */
function assertNoSensitiveKeys(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_PLAN_KEYS.test(key) && !SAFE_EXCLUSION_COUNTER_KEYS.has(key)) {
      throw new Error(`${path}.${key} is forbidden in a staging migration plan.`);
    }
    assertNoSensitiveKeys(entry, `${path}.${key}`);
  }
}

/** @param {any} plan */
export function assertImportablePlan(plan) {
  if (!isRecord(plan) || String(plan.schema_version) !== "1" || plan.kind !== "KASTUR_STAGING_MIGRATION_PLAN") {
    throw new Error("Unsupported staging migration plan format.");
  }
  if (typeof plan.plan_id !== "string" || !/^[a-f0-9]{64}$/u.test(plan.plan_id)) throw new Error("Migration plan_id is invalid.");
  const { plan_id: ignoredPlanId, ...content } = plan;
  void ignoredPlanId;
  const expectedPlanId = sha256Hex(canonicalJson(content));
  if (expectedPlanId !== plan.plan_id) throw new Error("Migration plan checksum does not match its content.");
  if (typeof plan.business_id !== "string" || !UUID_PATTERN.test(plan.business_id)) throw new Error("Migration plan business_id is invalid.");
  if (typeof plan.default_location_id !== "string" || !UUID_PATTERN.test(plan.default_location_id)) throw new Error("Migration plan default_location_id is invalid.");
  if (typeof plan.actor_user_id !== "string" || !UUID_PATTERN.test(plan.actor_user_id)) throw new Error("Migration plan actor_user_id is invalid.");
  if (!Array.isArray(plan.issues)) throw new Error("Migration plan issues must be an array.");
  const blockers = plan.issues.filter((issue) => issue?.severity === "ERROR" || issue?.severity === "REVIEW");
  if (blockers.length > 0) {
    throw new Error(`Migration plan has ${blockers.length} unresolved ERROR/REVIEW issue(s); staging import is blocked.`);
  }
  if (!isRecord(plan.records)) throw new Error("Migration plan records must be an object.");
  const records = /** @type {Record<string, any[]>} */ (plan.records);
  for (const key of Object.keys(records)) {
    if (!ALLOWED_RECORD_KEYS.has(key)) throw new Error(`Migration plan contains unauthorized record collection: ${key}.`);
  }
  for (const table of TABLES) {
    if (!Array.isArray(records[table.key])) throw new Error(`Migration plan records.${table.key} must be an array.`);
  }
  assertNoSensitiveKeys(plan, "plan");
  for (const row of records.stock_movements) {
    if (row.movement_type !== "INITIAL_STOCK" || row.source_type !== "MIGRATION_OPENING") {
      throw new Error("Migration plans may import only INITIAL_STOCK opening movements.");
    }
  }
  for (const row of records.cost_events) {
    if (row.event_type !== "INITIAL_COST" || row.source_type !== "MIGRATION_OPENING") {
      throw new Error("Migration plans may import only INITIAL_COST opening events.");
    }
  }
  for (const row of records.price_sets) {
    if (row.source_type !== "OPENING_PRICE") throw new Error("Migration plans may import only OPENING_PRICE price sets.");
  }
  for (const table of TABLES) {
    for (const row of records[table.key]) {
      if ("business_id" in row && row.business_id !== plan.business_id) {
        throw new Error(`records.${table.key} contains a cross-business row.`);
      }
    }
  }
  return plan;
}

/** @param {any} executor @param {typeof TABLES[number]} definition @param {Record<string, unknown>} row */
async function insertStrict(executor, definition, row) {
  const values = definition.columns.map((column) => {
    const value = row[column] ?? null;
    return definition.json?.includes(column) && value !== null ? JSON.stringify(value) : value;
  });
  const placeholders = definition.columns.map((_column, index) => `$${index + 1}`).join(", ");
  const compareColumns = definition.columns.map((column) => `target.${column}`).join(", ");
  const parameterColumns = definition.columns.map((_column, index) => `$${index + 1}`).join(", ");
  const conflictTarget = definition.conflict.join(", ");
  const conflictPredicate = definition.conflict
    .map((column) => `target.${column} IS NOT DISTINCT FROM $${definition.columns.indexOf(column) + 1}`)
    .join(" AND ");
  const result = await executor.query(
    `WITH inserted AS (
       INSERT INTO ${definition.table} (${definition.columns.join(", ")})
       VALUES (${placeholders})
       ON CONFLICT (${conflictTarget}) DO NOTHING
       RETURNING 1 AS accepted
     )
     SELECT accepted FROM inserted
     UNION ALL
     SELECT 1 AS accepted FROM ${definition.table} AS target
     WHERE ${conflictPredicate}
       AND ROW(${compareColumns}) IS NOT DISTINCT FROM ROW(${parameterColumns})
     LIMIT 1`,
    values,
  );
  if (result.rowCount !== 1) {
    throw new Error(`Existing ${definition.table} row conflicts with the reviewed migration plan.`);
  }
}

/** @param {any} client @param {any} plan */
export async function importMigrationPlan(client, plan) {
  assertImportablePlan(plan);
  const locationIds = [...new Set([
    plan.default_location_id,
    ...plan.records.stock_movements.map((row) => row.location_id),
    ...plan.records.cost_events.map((row) => row.location_id),
  ])];
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`kastur:migration:${plan.business_id}`]);
    const authority = await client.query(
      `SELECT EXISTS (
         SELECT 1
         FROM core.businesses b
         JOIN identity.business_memberships m ON m.business_id = b.id AND m.user_id = $2 AND m.status = 'ACTIVE'
         JOIN identity.users u ON u.id = m.user_id AND u.status = 'ACTIVE'
         WHERE b.id = $1 AND b.status = 'ACTIVE'
       ) AS actor_authorized,
       (SELECT COUNT(*)::text FROM core.locations l WHERE l.business_id = $1 AND l.id = ANY($3::uuid[])) AS location_count`,
      [plan.business_id, plan.actor_user_id, locationIds],
    );
    const authorityRow = authority.rows[0];
    if (authorityRow?.actor_authorized !== true) throw new Error("Migration actor is not an active member of the active target business.");
    if (String(authorityRow.location_count) !== String(locationIds.length)) throw new Error("One or more migration locations do not belong to the target business.");

    const counts = {};
    for (const definition of TABLES) {
      for (const row of plan.records[definition.key]) await insertStrict(client, definition, row);
      counts[definition.key] = plan.records[definition.key].length;
    }
    await client.query("COMMIT");
    return { plan_id: plan.plan_id, imported_or_verified: counts };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original import error.
    }
    throw error;
  }
}

export const migrationImportTableOrder = TABLES.map((entry) => entry.key);
