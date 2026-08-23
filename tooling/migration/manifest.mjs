// @ts-check

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  isRecord,
  parseLosslessJson,
  requireIsoTimestamp,
  requireRecord,
  requireString,
  requireUuid,
} from "./support.mjs";
import { validateDecimalScale } from "./decimal.mjs";

const SOURCE_TYPES = new Set(["inventory-pricing-json", "integrated-pos-json", "catalog-csv"]);
const FORBIDDEN_MANIFEST_KEYS = /(?:^|_)(?:pin|password|credential|token|secret|sync_state|sync_queue)(?:$|_)/iu;

/** @param {unknown} value @param {string} path */
function rejectSensitiveFields(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSensitiveFields(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_MANIFEST_KEYS.test(key)) {
      throw new Error(`${path}.${key} is forbidden; migration manifests never carry credentials or legacy sync state.`);
    }
    rejectSensitiveFields(entry, `${path}.${key}`);
  }
}

/** @param {unknown} value @param {string} field */
function nullableSourceId(value, field) {
  if (value === null) return null;
  return requireString(value, field);
}

/** @param {unknown} input */
export function parseMigrationManifest(input) {
  const root = requireRecord(input, "manifest");
  rejectSensitiveFields(root, "manifest");
  if (String(root.schema_version) !== "1") throw new Error("manifest.schema_version must be 1.");
  if (typeof root.default_track_inventory !== "boolean") {
    throw new Error("manifest.default_track_inventory must be an explicit boolean.");
  }
  const rawSources = Array.isArray(root.sources) ? root.sources : null;
  if (rawSources === null || rawSources.length === 0) {
    throw new Error("manifest.sources must contain at least one configured export.");
  }
  const sources = rawSources.map((source, index) => {
    const row = requireRecord(source, `manifest.sources[${index}]`);
    const id = requireString(row.id, `manifest.sources[${index}].id`);
    const type = requireString(row.type, `manifest.sources[${index}].type`);
    if (!SOURCE_TYPES.has(type)) throw new Error(`manifest.sources[${index}].type is unsupported: ${type}.`);
    return { id, type, path: requireString(row.path, `manifest.sources[${index}].path`) };
  });
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new Error("manifest.sources ids must be unique.");
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  const opening = requireRecord(root.opening_authority, "manifest.opening_authority");
  for (const key of ["stock_source_id", "cost_source_id", "price_source_id"]) {
    if (!(key in opening)) throw new Error(`manifest.opening_authority.${key} must be present (string or null).`);
  }
  const openingAuthority = {
    stock_source_id: nullableSourceId(opening.stock_source_id, "manifest.opening_authority.stock_source_id"),
    cost_source_id: nullableSourceId(opening.cost_source_id, "manifest.opening_authority.cost_source_id"),
    price_source_id: nullableSourceId(opening.price_source_id, "manifest.opening_authority.price_source_id"),
  };
  for (const [key, value] of Object.entries(openingAuthority)) {
    if (value !== null && !sourceIds.has(value)) throw new Error(`manifest.opening_authority.${key} references unknown source ${value}.`);
  }

  const locationMap = (Array.isArray(root.location_map) ? root.location_map : []).map((entry, index) => {
    const row = requireRecord(entry, `manifest.location_map[${index}]`);
    const sourceId = requireString(row.source_id, `manifest.location_map[${index}].source_id`);
    if (!sourceIds.has(sourceId)) throw new Error(`manifest.location_map[${index}] references unknown source ${sourceId}.`);
    return {
      source_id: sourceId,
      legacy_location_id: requireString(row.legacy_location_id, `manifest.location_map[${index}].legacy_location_id`),
      location_id: requireUuid(row.location_id, `manifest.location_map[${index}].location_id`),
    };
  });
  const locationKeys = locationMap.map((entry) => `${entry.source_id}\u001f${entry.legacy_location_id}`);
  if (new Set(locationKeys).size !== locationKeys.length) throw new Error("manifest.location_map contains duplicate source/location mappings.");

  const knownRelations = (Array.isArray(root.known_relations) ? root.known_relations : []).map((entry, index) => {
    const row = requireRecord(entry, `manifest.known_relations[${index}]`);
    const left = requireRecord(row.left, `manifest.known_relations[${index}].left`);
    const right = requireRecord(row.right, `manifest.known_relations[${index}].right`);
    const result = {
      left: {
        source_id: requireString(left.source_id, `manifest.known_relations[${index}].left.source_id`),
        legacy_product_id: requireString(left.legacy_product_id, `manifest.known_relations[${index}].left.legacy_product_id`),
      },
      right: {
        source_id: requireString(right.source_id, `manifest.known_relations[${index}].right.source_id`),
        legacy_product_id: requireString(right.legacy_product_id, `manifest.known_relations[${index}].right.legacy_product_id`),
      },
    };
    if (!sourceIds.has(result.left.source_id) || !sourceIds.has(result.right.source_id)) {
      throw new Error(`manifest.known_relations[${index}] references an unknown source id.`);
    }
    if (result.left.source_id === result.right.source_id) {
      throw new Error(`manifest.known_relations[${index}] may not relate records inside the same source.`);
    }
    return result;
  });

  const unitDefaults = requireRecord(root.unit_defaults, "manifest.unit_defaults");
  for (const key of ["can_sell", "can_purchase", "allow_decimal_qty"]) {
    if (typeof unitDefaults[key] !== "boolean") {
      throw new Error(`manifest.unit_defaults.${key} must be an explicit boolean.`);
    }
  }
  const openingPriceTax = requireRecord(root.opening_price_tax, "manifest.opening_price_tax");
  const taxMode = requireString(openingPriceTax.mode, "manifest.opening_price_tax.mode");
  if (!new Set(["NO_PPN", "TAX_INCLUDED", "TAX_EXCLUDED"]).has(taxMode)) {
    throw new Error("manifest.opening_price_tax.mode must be NO_PPN, TAX_INCLUDED, or TAX_EXCLUDED.");
  }
  const taxRate = validateDecimalScale(
    requireString(openingPriceTax.rate, "manifest.opening_price_tax.rate"),
    8,
    "manifest.opening_price_tax.rate",
  );

  return {
    schema_version: 1,
    business_id: requireUuid(root.business_id, "manifest.business_id"),
    default_location_id: requireUuid(root.default_location_id, "manifest.default_location_id"),
    actor_user_id: requireUuid(root.actor_user_id, "manifest.actor_user_id"),
    cutover_at: requireIsoTimestamp(root.cutover_at, "manifest.cutover_at"),
    default_track_inventory: root.default_track_inventory,
    fallback_category_name:
      root.fallback_category_name === null || root.fallback_category_name === undefined
        ? null
        : requireString(root.fallback_category_name, "manifest.fallback_category_name"),
    sources,
    opening_authority: openingAuthority,
    location_map: locationMap,
    known_relations: knownRelations,
    unit_defaults: {
      can_sell: unitDefaults.can_sell,
      can_purchase: unitDefaults.can_purchase,
      allow_decimal_qty: unitDefaults.allow_decimal_qty,
    },
    opening_price_tax: { mode: taxMode, rate: taxRate },
  };
}

/** @param {string} path */
export async function loadMigrationManifest(path) {
  const absolutePath = resolve(path);
  const text = await readFile(absolutePath, "utf8");
  return {
    manifest: parseMigrationManifest(parseLosslessJson(text, absolutePath)),
    path: absolutePath,
    directory: dirname(absolutePath),
  };
}
