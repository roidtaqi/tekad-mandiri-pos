// @ts-check

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalDecimal } from "./decimal.mjs";
import {
  arrayAt,
  isRecord,
  normalizeEvidence,
  optionalText,
  parseLosslessJson,
  sourceBoolean,
  stableSourceId,
} from "./support.mjs";

const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

/** @param {Record<string, unknown>} record @param {readonly string[]} keys */
function first(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return null;
}

/** @param {unknown} value */
function sourceText(value) {
  if (typeof value === "string") return optionalText(value);
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

/** @param {unknown} value */
function sourceId(value) {
  return sourceText(value);
}

/** @param {unknown} value @param {string} field @param {any[]} issues @param {Record<string, unknown>} context */
function decimalOrNull(value, field, issues, context) {
  const text = sourceText(value);
  if (text === null) return null;
  try {
    return canonicalDecimal(text, field);
  } catch (error) {
    issues.push({
      severity: "ERROR",
      code: "INVALID_DECIMAL",
      field,
      message: error instanceof Error ? error.message : String(error),
      ...context,
    });
    return null;
  }
}

/** @param {unknown} value */
function sourceRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** @param {Record<string, unknown>} root @param {readonly string[]} keys */
function recordsAt(root, keys) {
  for (const key of keys) {
    const rows = sourceRecords(root[key]);
    if (rows.length > 0 || Array.isArray(root[key])) return rows;
  }
  return [];
}

/** @param {Record<string, unknown>} root @param {readonly string[]} keys */
function countArrays(root, keys) {
  return keys.reduce((count, key) => count + (Array.isArray(root[key]) ? root[key].length : 0), 0);
}

/** @param {unknown} value */
function sortableSourceValue(value) {
  const text = sourceText(value);
  return text === null ? "" : text;
}

/** @param {Record<string, unknown>[]} rows */
function latestLegacyRecord(rows) {
  return [...rows].sort((left, right) => {
    const leftKey = [
      sortableSourceValue(first(left, ["effectiveDate", "effective_date"])),
      sortableSourceValue(first(left, ["updatedAt", "updated_at", "createdAt", "created_at"])),
      sortableSourceValue(first(left, ["id"])),
    ].join("\u001f");
    const rightKey = [
      sortableSourceValue(first(right, ["effectiveDate", "effective_date"])),
      sortableSourceValue(first(right, ["updatedAt", "updated_at", "createdAt", "created_at"])),
      sortableSourceValue(first(right, ["id"])),
    ].join("\u001f");
    return rightKey.localeCompare(leftKey, "en");
  })[0] ?? null;
}

/**
 * Read the inventory-pricing-app settings backup shape without retaining
 * credentials, sync state, or operational history in the normalized result.
 * @param {unknown} input
 * @param {string} configuredSourceId
 */
export function readInventoryPricingJson(input, configuredSourceId) {
  if (!isRecord(input)) throw new Error("inventory-pricing-json root must be an object.");
  const issues = [];
  const categories = new Map(
    arrayAt(input, "categories").flatMap((row) => {
      const id = sourceId(row.id);
      const name = sourceText(row.name);
      return id !== null && name !== null ? [[id, name]] : [];
    }),
  );
  const brands = new Map(
    arrayAt(input, "brands").flatMap((row) => {
      const id = sourceId(row.id);
      const name = sourceText(row.name);
      return id !== null && name !== null ? [[id, name]] : [];
    }),
  );
  const suppliers = new Map(
    arrayAt(input, "suppliers").flatMap((row) => {
      const id = sourceId(row.id);
      const name = sourceText(row.name);
      return id !== null && name !== null ? [[id, { id, name, phone: sourceText(row.phone), address: sourceText(row.address) }]] : [];
    }),
  );
  const allUnits = arrayAt(input, "productUnits");
  const costHistories = recordsAt(input, ["productUnitCostHistories", "product_unit_cost_histories"]);
  const priceCalculations = recordsAt(input, ["priceCalculations", "price_calculations"]);
  const priceHistories = recordsAt(input, ["priceHistories", "price_histories"]);

  const products = [];
  for (const rawProduct of arrayAt(input, "products")) {
    const legacyProductId = sourceId(rawProduct.id);
    if (legacyProductId === null) {
      issues.push({
        severity: "ERROR",
        code: "MISSING_LEGACY_ID",
        source_id: configuredSourceId,
        entity_type: "product",
        message: "Inventory product has no stable legacy id.",
      });
      continue;
    }

    const rawUnits = sourceRecords(rawProduct.units).length > 0
      ? sourceRecords(rawProduct.units)
      : allUnits.filter((row) => sourceId(first(row, ["productId", "product_id"])) === legacyProductId);
    const units = [];
    for (const rawUnit of rawUnits) {
      const legacyUnitId = sourceId(first(rawUnit, ["id", "unit_id"]));
      if (legacyUnitId === null) {
        issues.push({
          severity: "ERROR",
          code: "MISSING_LEGACY_ID",
          source_id: configuredSourceId,
          entity_type: "product_unit",
          legacy_product_id: legacyProductId,
          message: "Inventory product unit has no stable legacy id.",
        });
        continue;
      }
      const activePrices = priceCalculations.filter(
        (row) =>
          sourceId(first(row, ["productUnitId", "product_unit_id"])) === legacyUnitId &&
          sourceText(row.status)?.toUpperCase() === "ACTIVE",
      );
      if (activePrices.length > 1) {
        issues.push({
          severity: "REVIEW",
          code: "MULTIPLE_ACTIVE_LEGACY_PRICES",
          source_id: configuredSourceId,
          entity_type: "product_unit",
          legacy_id: legacyUnitId,
          message: "Multiple ACTIVE legacy price calculations exist; the latest deterministic record was selected.",
        });
      }
      const activePrice = latestLegacyRecord(activePrices);
      const latestPriceHistory = latestLegacyRecord(
        priceHistories.filter((row) => sourceId(first(row, ["productUnitId", "product_unit_id"])) === legacyUnitId),
      );
      const latestCost = latestLegacyRecord(
        costHistories.filter((row) => sourceId(first(row, ["productUnitId", "product_unit_id"])) === legacyUnitId),
      );
      const context = {
        source_id: configuredSourceId,
        entity_type: "product_unit",
        legacy_id: legacyUnitId,
      };
      units.push({
        legacy_unit_id: legacyUnitId,
        unit_name: sourceText(first(rawUnit, ["unitName", "unit_name"])),
        conversion_to_base: decimalOrNull(
          first(rawUnit, ["conversionToBase", "conversion_to_base"]),
          "conversion_to_base",
          issues,
          context,
        ),
        cost: decimalOrNull(
          first(latestCost ?? {}, ["finalCost", "final_cost", "inputCost", "input_cost"]) ??
            first(rawUnit, ["manualCost", "manual_cost", "cost_price"]),
          "cost",
          issues,
          context,
        ),
        price: decimalOrNull(
          first(rawUnit, ["activeSellingPrice", "active_selling_price"]) ??
            first(activePrice ?? {}, ["roundedPrice", "activeSellingPrice", "recommendedPrice"]) ??
            first(latestPriceHistory ?? {}, ["newPrice", "new_price"]),
          "price",
          issues,
          context,
        ),
        effective_at: sourceText(
          first(activePrice ?? {}, ["effectiveDate", "effective_date"]) ??
            first(latestPriceHistory ?? {}, ["effectiveDate", "effective_date"]),
        ),
        barcodes: sourceText(first(rawUnit, ["barcode"])) === null
          ? []
          : [sourceText(first(rawUnit, ["barcode"]))],
      });
    }

    const categoryId = sourceId(first(rawProduct, ["categoryId", "category_id"]));
    const brandId = sourceId(first(rawProduct, ["brandId", "brand_id"]));
    const supplierId = sourceId(first(rawProduct, ["supplierId", "supplier_id"]));
    const supplier = supplierId === null ? null : suppliers.get(supplierId) ?? null;
    products.push({
      source_system: "inventory-pricing-app",
      source_id: configuredSourceId,
      legacy_product_id: legacyProductId,
      sku: sourceText(rawProduct.sku),
      name: sourceText(rawProduct.name),
      category_name: sourceText(first(rawProduct, ["category"])) ?? (categoryId === null ? null : categories.get(categoryId) ?? null),
      legacy_category_id: categoryId,
      brand_name: sourceText(first(rawProduct, ["brand"])) ?? (brandId === null ? null : brands.get(brandId) ?? null),
      legacy_brand_id: brandId,
      supplier,
      is_active: sourceBoolean(first(rawProduct, ["isActive", "is_active"])),
      track_inventory: null,
      product_barcode: sourceText(rawProduct.barcode),
      units,
      stock: [],
      known_relations: [],
    });
  }

  return {
    source_system: "inventory-pricing-app",
    source_id: configuredSourceId,
    products,
    issues,
    excluded: {
      credential_records: countArrays(input, ["users", "credentials"]),
      user_records: countArrays(input, ["users"]),
      role_records: countArrays(input, ["roles", "permissions"]),
      sync_state_records: countArrays(input, ["syncQueue", "syncLogs", "realtimeSyncLogs", "sync_queue", "sync_logs"]),
      operational_history_records: countArrays(input, ["posSales", "transactions", "priceHistories", "price_histories"]),
    },
  };
}

/**
 * Read an integrated-pos-app Dexie/snapshot export. Users, PINs, role caches,
 * transaction history, and sync state are counted for evidence but discarded.
 * @param {unknown} input
 * @param {string} configuredSourceId
 */
export function readIntegratedPosJson(input, configuredSourceId) {
  if (!isRecord(input)) throw new Error("integrated-pos-json root must be an object.");
  const issues = [];
  const allUnits = recordsAt(input, ["productUnits", "product_units"]);
  const allBarcodes = recordsAt(input, ["productBarcodes", "product_barcodes", "barcodes"]);
  const allBalances = recordsAt(input, ["stockBalances", "stock_balances"]);
  const products = [];

  for (const rawProduct of arrayAt({ products: recordsAt(input, ["products"]) }, "products")) {
    const legacyProductId = sourceId(rawProduct.id);
    if (legacyProductId === null) {
      issues.push({
        severity: "ERROR",
        code: "MISSING_LEGACY_ID",
        source_id: configuredSourceId,
        entity_type: "product",
        message: "Integrated POS product has no stable legacy id.",
      });
      continue;
    }
    const rawUnits = sourceRecords(rawProduct.units).length > 0
      ? sourceRecords(rawProduct.units)
      : allUnits.filter((row) => sourceId(first(row, ["product_id", "productId"])) === legacyProductId);
    const units = rawUnits.map((rawUnit) => {
      const legacyUnitId = sourceId(first(rawUnit, ["id", "unit_id"]));
      const context = {
        source_id: configuredSourceId,
        entity_type: "product_unit",
        legacy_id: legacyUnitId,
        legacy_product_id: legacyProductId,
      };
      const unitBarcodes = allBarcodes
        .filter((row) => sourceId(first(row, ["unit_id", "unitId"])) === legacyUnitId)
        .map((row) => sourceText(row.barcode))
        .filter((value) => value !== null);
      const inlineBarcode = sourceText(rawUnit.barcode);
      return {
        legacy_unit_id: legacyUnitId,
        unit_name: sourceText(first(rawUnit, ["unit_name", "unitName"])),
        conversion_to_base: decimalOrNull(first(rawUnit, ["conversion_to_base", "conversionToBase"]), "conversion_to_base", issues, context),
        cost: decimalOrNull(first(rawUnit, ["cost_price", "manualCost", "cost"]), "cost", issues, context),
        price: decimalOrNull(first(rawUnit, ["active_selling_price", "activeSellingPrice", "price"]), "price", issues, context),
        effective_at: sourceText(first(rawUnit, ["effective_date", "effectiveDate"])),
        barcodes: [...new Set([...unitBarcodes, ...(inlineBarcode === null ? [] : [inlineBarcode])])],
      };
    });
    const unassignedBarcodes = allBarcodes
      .filter(
        (row) =>
          sourceId(first(row, ["product_id", "productId"])) === legacyProductId &&
          sourceId(first(row, ["unit_id", "unitId"])) === null,
      )
      .map((row) => sourceText(row.barcode))
      .filter((value) => value !== null);
    const sourceMarker = sourceText(rawProduct.source)?.toUpperCase();
    products.push({
      source_system: "integrated-pos-app",
      source_id: configuredSourceId,
      legacy_product_id: legacyProductId,
      sku: sourceText(rawProduct.sku),
      name: sourceText(rawProduct.name),
      category_name: sourceText(first(rawProduct, ["category", "category_name"])),
      legacy_category_id: null,
      brand_name: sourceText(first(rawProduct, ["brand", "brand_name"])),
      legacy_brand_id: null,
      supplier: null,
      is_active: sourceBoolean(first(rawProduct, ["is_active", "isActive"])),
      track_inventory: null,
      product_barcode: sourceText(rawProduct.barcode) ?? unassignedBarcodes[0] ?? null,
      additional_product_barcodes: unassignedBarcodes.slice(1),
      units,
      stock: allBalances
        .filter((row) => sourceId(first(row, ["product_id", "productId"])) === legacyProductId)
        .map((row) => ({
          legacy_balance_id: sourceId(row.id),
          legacy_location_id: sourceId(first(row, ["outlet_id", "location_id", "outletId", "locationId"])),
          quantity: decimalOrNull(first(row, ["qty", "quantity", "base_quantity"]), "stock.quantity", issues, {
            source_id: configuredSourceId,
            entity_type: "stock_balance",
            legacy_product_id: legacyProductId,
          }),
          quantity_kind: "BASE",
        })),
      known_relations: sourceMarker === "INVENTORY_PRICING_APP"
        ? [{ source_system: "inventory-pricing-app", legacy_product_id: legacyProductId }]
        : [],
    });
  }

  const users = recordsAt(input, ["users"]);
  return {
    source_system: "integrated-pos-app",
    source_id: configuredSourceId,
    products,
    issues,
    excluded: {
      credential_records: users.filter((row) => first(row, ["pin", "password", "password_hash"]) !== null).length,
      user_records: users.length,
      role_records: countArrays(input, ["roles", "permissions", "rolePermissions", "role_permissions"]),
      sync_state_records: countArrays(input, ["syncQueue", "sync_queue", "syncLogs", "sync_logs", "changeLogs", "change_logs"]),
      operational_history_records: countArrays(input, [
        "transactions",
        "transactionItems",
        "transaction_items",
        "payments",
        "shifts",
        "cashMovements",
        "cash_movements",
        "stockMovements",
        "stock_movements",
      ]),
    },
  };
}

/** @param {string} text */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      if (cell.length > 0) throw new Error("CSV quote must begin at the start of a field.");
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/u, ""));
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) =>
    header.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/gu, "_").replace(/^\ufeff/u, ""),
  );
  const duplicates = headers.filter((header, index) => header.length === 0 || headers.indexOf(header) !== index);
  if (duplicates.length > 0) throw new Error(`CSV has blank or duplicate headers: ${[...new Set(duplicates)].join(", ")}.`);
  return rows
    .slice(1)
    .filter((cells) => cells.some((value) => value.trim().length > 0))
    .map((cells, index) => ({
      row_number: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, cells[column]?.trim() ?? ""])),
    }));
}

/**
 * Read either supported legacy catalog CSV dialect. A spreadsheet is always a
 * separate source system so mappings stay unambiguous and traceable.
 * @param {string} text
 * @param {string} configuredSourceId
 */
export function readCatalogCsv(text, configuredSourceId) {
  const rows = parseCsv(text);
  const issues = [];
  const grouped = new Map();
  for (const row of rows) {
    const values = row.values;
    const explicitId = sourceId(first(values, ["product_id", "id"]));
    const sku = sourceText(values.sku);
    const groupKey = explicitId ?? (sku === null ? `row:${row.row_number}` : `sku:${normalizeEvidence(sku)}`);
    const existing = grouped.get(groupKey);
    if (existing === undefined) grouped.set(groupKey, { legacyProductId: groupKey, rows: [row] });
    else existing.rows.push(row);
  }

  const products = [];
  for (const group of grouped.values()) {
    const firstRow = group.rows[0].values;
    const legacyProductId = sourceId(first(firstRow, ["product_id", "id"])) ?? group.legacyProductId;
    const names = [...new Set(group.rows.map((row) => sourceText(row.values.name)).filter((value) => value !== null))];
    if (names.length > 1) {
      issues.push({
        severity: "REVIEW",
        code: "CSV_PRODUCT_FIELD_CONFLICT",
        source_id: configuredSourceId,
        entity_type: "product",
        legacy_id: legacyProductId,
        field: "name",
        message: "Rows grouped into one CSV product contain conflicting names.",
      });
    }
    const units = group.rows.map((row) => {
      const values = row.values;
      const legacyUnitId = sourceId(first(values, ["unit_id"])) ?? `${legacyProductId}:row:${row.row_number}`;
      const context = { source_id: configuredSourceId, entity_type: "product_unit", legacy_id: legacyUnitId };
      const barcode = sourceText(values.barcode);
      return {
        legacy_unit_id: legacyUnitId,
        unit_name: sourceText(first(values, ["unit_name", "unit"])),
        conversion_to_base: decimalOrNull(first(values, ["conversion_to_base", "conversion_factor"]), "conversion_to_base", issues, context),
        cost: decimalOrNull(first(values, ["manual_cost", "cost_price", "cost"]), "cost", issues, context),
        price: decimalOrNull(first(values, ["active_selling_price", "selling_price", "price"]), "price", issues, context),
        effective_at: sourceText(first(values, ["effective_date", "effective_at"])),
        barcodes: barcode === null ? [] : [barcode],
        row_number: row.row_number,
      };
    });
    const relationSystem = sourceText(first(firstRow, ["known_relation_source_system", "relation_source_system"]));
    const relationId = sourceText(first(firstRow, ["known_relation_legacy_product_id", "relation_legacy_product_id"]));
    const supplierName = sourceText(firstRow.supplier);
    products.push({
      source_system: "spreadsheet",
      source_id: configuredSourceId,
      legacy_product_id: legacyProductId,
      sku: sourceText(firstRow.sku),
      name: sourceText(firstRow.name),
      category_name: sourceText(first(firstRow, ["category", "category_name"])),
      legacy_category_id: null,
      brand_name: sourceText(first(firstRow, ["brand", "brand_name"])),
      legacy_brand_id: null,
      supplier: supplierName === null ? null : { id: supplierName, name: supplierName, phone: null, address: null },
      is_active: sourceBoolean(first(firstRow, ["is_active", "active"])),
      track_inventory: sourceBoolean(first(firstRow, ["track_inventory"])),
      product_barcode: null,
      units,
      stock: group.rows.flatMap((row) => {
        const quantity = decimalOrNull(first(row.values, ["opening_quantity", "stock_qty", "quantity", "qty"]), "stock.quantity", issues, {
          source_id: configuredSourceId,
          entity_type: "stock_balance",
          legacy_product_id: legacyProductId,
          row_number: row.row_number,
        });
        return quantity === null
          ? []
          : [{
              legacy_balance_id: `${legacyProductId}:row:${row.row_number}`,
              legacy_location_id: sourceId(first(row.values, ["location_id", "outlet_id"])),
              quantity,
              quantity_kind: "SOURCE_UNIT",
              legacy_unit_id:
                sourceId(first(row.values, ["unit_id"])) ?? `${legacyProductId}:row:${row.row_number}`,
            }];
      }),
      known_relations: relationSystem !== null && relationId !== null
        ? [{ source_system: relationSystem, legacy_product_id: relationId }]
        : [],
    });
  }

  return {
    source_system: "spreadsheet",
    source_id: configuredSourceId,
    products,
    issues,
    excluded: {
      credential_records: 0,
      user_records: 0,
      role_records: 0,
      sync_state_records: 0,
      operational_history_records: 0,
    },
  };
}

/** @param {string} path */
async function readBoundedText(path) {
  const details = await stat(path);
  if (!details.isFile()) throw new Error(`Migration source is not a file: ${path}`);
  if (details.size > MAX_SOURCE_BYTES) {
    throw new Error(`Migration source exceeds ${MAX_SOURCE_BYTES} bytes: ${path}`);
  }
  return readFile(path, "utf8");
}

/**
 * @param {Record<string, unknown>} configuration
 * @param {string} manifestDirectory
 */
export async function readConfiguredSource(configuration, manifestDirectory) {
  const id = stableSourceId(configuration.id);
  const type = stableSourceId(configuration.type);
  const relativePath = stableSourceId(configuration.path);
  if (id === null || type === null || relativePath === null) {
    throw new Error("Each manifest source requires non-empty id, type, and path fields.");
  }
  const path = resolve(manifestDirectory, relativePath);
  const text = await readBoundedText(path);
  if (type === "inventory-pricing-json") {
    return readInventoryPricingJson(parseLosslessJson(text, path), id);
  }
  if (type === "integrated-pos-json") {
    return readIntegratedPosJson(parseLosslessJson(text, path), id);
  }
  if (type === "catalog-csv") return readCatalogCsv(text, id);
  throw new Error(`Unsupported migration source type: ${type}`);
}
