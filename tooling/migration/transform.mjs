// @ts-check

import {
  decimalCompare,
  decimalEquals,
  decimalIsZero,
  decimalMultiply,
  decimalSum,
  validateDecimalScale,
} from "./decimal.mjs";
import {
  canonicalJson,
  deterministicUuid,
  normalizeEvidence,
  normalizeSku,
  normalizeUnitCode,
  sha256Hex,
} from "./support.mjs";

const SOURCE_PRIORITY = new Map([
  ["inventory-pricing-app", 0],
  ["integrated-pos-app", 1],
  ["spreadsheet", 2],
]);

class UnionFind {
  /** @param {readonly string[]} keys */
  constructor(keys) {
    this.parent = new Map(keys.map((key) => [key, key]));
  }

  /** @param {string} key */
  find(key) {
    const parent = this.parent.get(key);
    if (parent === undefined) throw new Error(`Unknown union key: ${key}`);
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  /** @param {string} left @param {string} right */
  union(left, right) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return leftRoot;
    const [first, second] = [leftRoot, rightRoot].sort();
    this.parent.set(second, first);
    return first;
  }
}

/** @param {string} value */
function normalizeBarcode(value) {
  return value.trim().normalize("NFKC");
}

/** @param {any[]} issues @param {string} severity @param {string} code @param {string} message @param {Record<string, unknown>} [context] */
function addIssue(issues, severity, code, message, context = {}) {
  issues.push({ severity, code, message, ...context });
}

/** @param {{source_system:string, source_id:string}} node */
function sourceOrder(node) {
  return `${String(SOURCE_PRIORITY.get(node.source_system) ?? 99).padStart(2, "0")}:${node.source_id}`;
}

/** @param {any[]} values @param {(value:any)=>unknown} selector */
function firstPresent(values, selector) {
  for (const value of [...values].sort((left, right) => sourceOrder(left).localeCompare(sourceOrder(right), "en"))) {
    const selected = selector(value);
    if (selected !== null && selected !== undefined && selected !== "") return selected;
  }
  return null;
}

/** @param {any[]} nodes */
function allProductBarcodes(nodes) {
  const values = nodes.flatMap((node) => [
    node.product_barcode,
    ...(node.additional_product_barcodes ?? []),
    ...node.units.flatMap((unit) => unit.barcodes ?? []),
  ]);
  return new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0).map(normalizeBarcode));
}

/** @param {UnionFind} union @param {Map<string, any>} nodes */
function currentGroups(union, nodes) {
  const groups = new Map();
  for (const key of nodes.keys()) {
    const root = union.find(key);
    const existing = groups.get(root);
    if (existing === undefined) groups.set(root, [key]);
    else existing.push(key);
  }
  return groups;
}

/** @param {UnionFind} union @param {Map<string, any>} nodes @param {string} left @param {string} right @param {"BARCODE"|"SKU"|"KNOWN_RELATION"} reason @param {any[]} issues @param {any[]} appliedMatches */
function mergeProducts(union, nodes, left, right, reason, issues, appliedMatches) {
  const groups = currentGroups(union, nodes);
  const leftRoot = union.find(left);
  const rightRoot = union.find(right);
  if (leftRoot === rightRoot) return true;
  const leftNodes = (groups.get(leftRoot) ?? []).map((key) => nodes.get(key));
  const rightNodes = (groups.get(rightRoot) ?? []).map((key) => nodes.get(key));
  const leftSources = new Set(leftNodes.map((node) => node.source_id));
  const duplicateSource = rightNodes.find((node) => leftSources.has(node.source_id));
  if (duplicateSource !== undefined) {
    addIssue(issues, "ERROR", "AMBIGUOUS_MATCH_WITHIN_SOURCE", `${reason} evidence would merge two products from source ${duplicateSource.source_id}.`, {
      left_product: left,
      right_product: right,
    });
    return false;
  }
  if (reason !== "BARCODE") {
    const leftBarcodes = allProductBarcodes(leftNodes);
    const rightBarcodes = allProductBarcodes(rightNodes);
    if (
      leftBarcodes.size > 0 &&
      rightBarcodes.size > 0 &&
      ![...leftBarcodes].some((barcode) => rightBarcodes.has(barcode))
    ) {
      addIssue(issues, "ERROR", "STRONG_BARCODE_CONFLICT", `${reason} evidence conflicts with disjoint barcode evidence; records were not auto-merged.`, {
        left_product: left,
        right_product: right,
      });
      return false;
    }
  }
  union.union(left, right);
  appliedMatches.push({
    reason,
    left_product: left,
    right_product: right,
  });
  return true;
}

/** @param {unknown} value @param {number} scale @param {string} field @param {any[]} issues @param {Record<string, unknown>} context */
function checkedDecimal(value, scale, field, issues, context) {
  if (typeof value !== "string") return null;
  try {
    return validateDecimalScale(value, scale, field);
  } catch (error) {
    addIssue(issues, "ERROR", "DECIMAL_SCALE_INVALID", error instanceof Error ? error.message : String(error), context);
    return null;
  }
}

/** @param {any[]} issues */
function sortedIssues(issues) {
  const rank = { ERROR: "0", REVIEW: "1", WARNING: "2", INFO: "3" };
  return [...issues].sort((left, right) => {
    const leftKey = `${rank[left.severity] ?? "9"}:${left.code}:${left.source_id ?? ""}:${left.legacy_id ?? ""}:${left.message}`;
    const rightKey = `${rank[right.severity] ?? "9"}:${right.code}:${right.source_id ?? ""}:${right.legacy_id ?? ""}:${right.message}`;
    return leftKey.localeCompare(rightKey, "en");
  });
}

/** @param {string} sourceSystem @param {string} configuredSourceId */
function mappingSource(sourceSystem, configuredSourceId) {
  return `${sourceSystem}:${configuredSourceId}`;
}

/** @param {any} manifest @param {any[]} normalizedSources */
export function buildMigrationPlan(manifest, normalizedSources) {
  const issues = normalizedSources.flatMap((source) => source.issues ?? []);
  const sourceById = new Map(normalizedSources.map((source) => [source.source_id, source]));
  for (const configured of manifest.sources) {
    const source = sourceById.get(configured.id);
    if (source === undefined) {
      addIssue(issues, "ERROR", "SOURCE_NOT_READ", `Configured source ${configured.id} was not read.`, { source_id: configured.id });
    }
  }
  const allNodes = normalizedSources.flatMap((source) => source.products ?? []);
  const nodes = new Map();
  for (const node of allNodes) {
    const key = `${node.source_id}\u001f${node.legacy_product_id}`;
    if (nodes.has(key)) {
      addIssue(issues, "ERROR", "DUPLICATE_LEGACY_ID", "A source contains a duplicate product legacy id.", {
        source_id: node.source_id,
        legacy_id: node.legacy_product_id,
      });
    } else {
      node.__key = key;
      nodes.set(key, node);
    }
  }
  const union = new UnionFind([...nodes.keys()]);
  const appliedMatches = [];

  const barcodeIndex = new Map();
  for (const [key, node] of nodes) {
    for (const barcode of allProductBarcodes([node])) {
      const matches = barcodeIndex.get(barcode);
      if (matches === undefined) barcodeIndex.set(barcode, [key]);
      else matches.push(key);
    }
  }
  for (const [barcode, matches] of barcodeIndex) {
    const distinct = [...new Set(matches)];
    const sourceIds = distinct.map((key) => nodes.get(key).source_id);
    if (new Set(sourceIds).size !== sourceIds.length) {
      addIssue(issues, "ERROR", "DUPLICATE_BARCODE_IN_SOURCE", `Barcode ${barcode} belongs to multiple products in one source; no barcode merge was performed.`, {
        barcode,
      });
      continue;
    }
    for (const other of distinct.slice(1)) mergeProducts(union, nodes, distinct[0], other, "BARCODE", issues, appliedMatches);
  }

  const skuIndex = new Map();
  for (const [key, node] of nodes) {
    if (typeof node.sku !== "string" || node.sku.trim().length === 0) continue;
    const sku = normalizeSku(node.sku);
    const matches = skuIndex.get(sku);
    if (matches === undefined) skuIndex.set(sku, [key]);
    else matches.push(key);
  }
  for (const [sku, matches] of skuIndex) {
    const roots = [...new Set(matches.map((key) => union.find(key)))];
    for (const otherRoot of roots.slice(1)) {
      const firstRoot = union.find(roots[0]);
      if (!mergeProducts(union, nodes, firstRoot, otherRoot, "SKU", issues, appliedMatches)) {
        addIssue(issues, "ERROR", "AMBIGUOUS_SKU", `SKU ${sku} remains assigned to multiple products.`, { sku });
      }
    }
  }

  for (const relation of manifest.known_relations) {
    const left = `${relation.left.source_id}\u001f${relation.left.legacy_product_id}`;
    const right = `${relation.right.source_id}\u001f${relation.right.legacy_product_id}`;
    if (!nodes.has(left) || !nodes.has(right)) {
      addIssue(issues, "ERROR", "KNOWN_RELATION_TARGET_MISSING", "An explicit known relation references a missing product.", {
        left_product: left,
        right_product: right,
      });
      continue;
    }
    mergeProducts(union, nodes, left, right, "KNOWN_RELATION", issues, appliedMatches);
  }
  for (const [key, node] of nodes) {
    for (const relation of node.known_relations ?? []) {
      const candidates = [...nodes.entries()].filter(
        ([, candidate]) =>
          candidate.source_system === relation.source_system &&
          candidate.legacy_product_id === relation.legacy_product_id &&
          candidate.source_id !== node.source_id,
      );
      if (candidates.length !== 1) {
        addIssue(issues, candidates.length === 0 ? "WARNING" : "REVIEW", "IMPLICIT_KNOWN_RELATION_AMBIGUOUS", "A legacy relation marker did not resolve to exactly one configured source record.", {
          source_id: node.source_id,
          legacy_id: node.legacy_product_id,
        });
        continue;
      }
      mergeProducts(union, nodes, key, candidates[0][0], "KNOWN_RELATION", issues, appliedMatches);
    }
  }

  const productGroups = [...currentGroups(union, nodes).values()]
    .map((keys) => keys.sort().map((key) => nodes.get(key)))
    .sort((left, right) => left.map((node) => node.__key).join("|").localeCompare(right.map((node) => node.__key).join("|"), "en"));

  const nameUnitCandidates = new Map();
  for (const group of productGroups) {
    const name = firstPresent(group, (node) => node.name);
    const units = [...new Set(group.flatMap((node) => node.units.map((unit) => unit.unit_name).filter(Boolean)).map(normalizeEvidence))].sort();
    if (typeof name !== "string" || units.length === 0) continue;
    const nameKey = normalizeEvidence(name);
    const existing = nameUnitCandidates.get(nameKey);
    const candidate = { group, units: new Set(units) };
    if (existing === undefined) nameUnitCandidates.set(nameKey, [candidate]);
    else existing.push(candidate);
  }
  for (const candidates of nameUnitCandidates.values()) {
    const overlapping = candidates.filter((candidate, index) =>
      candidates.some((other, otherIndex) => index !== otherIndex && [...candidate.units].some((unit) => other.units.has(unit))),
    );
    if (overlapping.length > 1) {
      addIssue(issues, "REVIEW", "NAME_UNIT_MATCH_REQUIRES_MANUAL_RELATION", "Exact name/unit evidence matches multiple unmerged products; no fuzzy or name-based merge was performed.", {
        candidate_products: overlapping.map((candidate) => candidate.group.map((node) => node.__key)),
      });
    }
  }

  const categoriesByName = new Map();
  const brandsByName = new Map();
  const suppliersByName = new Map();
  const products = [];
  const productUnits = [];
  const barcodes = [];
  const productSuppliers = [];
  const legacyIdMap = [];
  const groupDetails = [];

  const makeLegacyMap = (sourceSystem, configuredSourceId, entityType, legacyId, newEntityId) => ({
    id: deterministicUuid(manifest.business_id, "legacy_id_map", mappingSource(sourceSystem, configuredSourceId), entityType, legacyId),
    business_id: manifest.business_id,
    source_system: mappingSource(sourceSystem, configuredSourceId),
    entity_type: entityType,
    legacy_id: legacyId,
    new_entity_id: newEntityId,
    migrated_at: manifest.cutover_at,
  });

  for (const group of productGroups) {
    const memberKey = group.map((node) => node.__key).sort().join("|");
    const productId = deterministicUuid(manifest.business_id, "product", memberKey);
    const skuRaw = firstPresent(group, (node) => node.sku);
    const sku = typeof skuRaw === "string" && skuRaw.trim().length > 0 ? normalizeSku(skuRaw) : null;
    const name = firstPresent(group, (node) => node.name);
    const categoryNameRaw = firstPresent(group, (node) => node.category_name) ?? manifest.fallback_category_name;
    const categoryName = typeof categoryNameRaw === "string" ? categoryNameRaw.trim() : null;
    const brandNameRaw = firstPresent(group, (node) => node.brand_name);
    const brandName = typeof brandNameRaw === "string" && brandNameRaw.trim().length > 0 && brandNameRaw.trim() !== "-" ? brandNameRaw.trim() : null;
    /** @type {Array<[string, (node: any) => any, (value: string) => string, string]>} */
    const conflictFields = [
      ["sku", (node) => node.sku, normalizeSku, "REVIEW"],
      ["name", (node) => node.name, normalizeEvidence, "REVIEW"],
      ["category_name", (node) => node.category_name, normalizeEvidence, "REVIEW"],
      ["brand_name", (node) => node.brand_name, normalizeEvidence, "WARNING"],
    ];
    for (const [field, selector, normalizer, severity] of conflictFields) {
      const values = [...new Set(group.map(selector).filter((value) => typeof value === "string" && value.trim().length > 0).map(normalizer))];
      if (values.length > 1) {
        addIssue(issues, severity, "SOURCE_FIELD_CONFLICT", `Merged source records disagree on ${field}; canonical source priority selected one value.`, {
          field,
          members: group.map((node) => node.__key),
        });
      }
    }
    const trackInventoryValues = [...new Set(group.map((node) => node.track_inventory).filter((value) => typeof value === "boolean"))];
    if (trackInventoryValues.length > 1) {
      addIssue(issues, "REVIEW", "SOURCE_FIELD_CONFLICT", "Merged source records disagree on track_inventory.", {
        field: "track_inventory",
        members: group.map((node) => node.__key),
      });
    }
    if (sku === null) addIssue(issues, "ERROR", "PRODUCT_SKU_MISSING", "Product has no SKU and cannot be staged.", { members: group.map((node) => node.__key) });
    if (typeof name !== "string" || name.trim().length === 0) addIssue(issues, "ERROR", "PRODUCT_NAME_MISSING", "Product has no name and cannot be staged.", { members: group.map((node) => node.__key) });
    if (categoryName === null) addIssue(issues, "ERROR", "PRODUCT_CATEGORY_MISSING", "Product has no category and no explicit manifest fallback.", { sku });

    let categoryId = null;
    if (categoryName !== null) {
      const categoryKey = normalizeEvidence(categoryName);
      const existing = categoriesByName.get(categoryKey);
      categoryId = existing?.id ?? deterministicUuid(manifest.business_id, "category", categoryKey);
      if (existing === undefined) categoriesByName.set(categoryKey, {
        id: categoryId,
        business_id: manifest.business_id,
        name: categoryName,
        status: "ACTIVE",
        created_at: manifest.cutover_at,
        updated_at: manifest.cutover_at,
        version: "1",
      });
    }
    let brandId = null;
    if (brandName !== null) {
      const brandKey = normalizeEvidence(brandName);
      const existing = brandsByName.get(brandKey);
      brandId = existing?.id ?? deterministicUuid(manifest.business_id, "brand", brandKey);
      if (existing === undefined) brandsByName.set(brandKey, {
        id: brandId,
        business_id: manifest.business_id,
        name: brandName,
        status: "ACTIVE",
        created_at: manifest.cutover_at,
        updated_at: manifest.cutover_at,
        version: "1",
      });
    }

    for (const node of group) {
      legacyIdMap.push(makeLegacyMap(node.source_system, node.source_id, "product", node.legacy_product_id, productId));
      if (categoryId !== null && node.legacy_category_id !== null && node.legacy_category_id !== undefined) {
        legacyIdMap.push(makeLegacyMap(node.source_system, node.source_id, "category", String(node.legacy_category_id), categoryId));
      }
      if (brandId !== null && node.legacy_brand_id !== null && node.legacy_brand_id !== undefined) {
        legacyIdMap.push(makeLegacyMap(node.source_system, node.source_id, "brand", String(node.legacy_brand_id), brandId));
      }
    }

    const unitNodes = [];
    for (const node of group) {
      for (const unit of node.units) {
        if (typeof unit.legacy_unit_id !== "string" || unit.legacy_unit_id.length === 0) {
          addIssue(issues, "ERROR", "PRODUCT_UNIT_LEGACY_ID_MISSING", "A product unit lacks a stable legacy id.", { source_id: node.source_id, sku });
          continue;
        }
        unitNodes.push({ ...unit, source_system: node.source_system, source_id: node.source_id, __node: node, __key: `${node.source_id}\u001f${unit.legacy_unit_id}` });
      }
    }
    const unitUnion = new UnionFind(unitNodes.map((unit) => unit.__key));
    const unitByKey = new Map(unitNodes.map((unit) => [unit.__key, unit]));
    const unitBarcodeIndex = new Map();
    for (const unit of unitNodes) {
      for (const rawBarcode of unit.barcodes ?? []) {
        const barcode = normalizeBarcode(rawBarcode);
        const matches = unitBarcodeIndex.get(barcode);
        if (matches === undefined) unitBarcodeIndex.set(barcode, [unit.__key]);
        else matches.push(unit.__key);
      }
    }
    for (const [barcode, matches] of unitBarcodeIndex) {
      const sourceIds = matches.map((key) => unitByKey.get(key).source_id);
      if (new Set(sourceIds).size !== sourceIds.length) {
        addIssue(issues, "ERROR", "DUPLICATE_UNIT_BARCODE_IN_SOURCE", `Barcode ${barcode} belongs to multiple units in one source.`, { sku, barcode });
        continue;
      }
      for (const other of matches.slice(1)) unitUnion.union(matches[0], other);
    }
    const unitSignatureIndex = new Map();
    for (const unit of unitNodes) {
      const unitCode = typeof unit.unit_name === "string" ? normalizeUnitCode(unit.unit_name) : null;
      const conversion = checkedDecimal(unit.conversion_to_base, 8, "conversion_to_base", issues, { source_id: unit.source_id, legacy_id: unit.legacy_unit_id, sku });
      unit.__conversion = conversion;
      if (unitCode === null || conversion === null) continue;
      if (decimalCompare(conversion, "0") <= 0) {
        addIssue(issues, "ERROR", "UNIT_CONVERSION_NOT_POSITIVE", "Unit conversion must be positive.", { source_id: unit.source_id, legacy_id: unit.legacy_unit_id, sku });
        continue;
      }
      const signature = `${unitCode}\u001f${conversion}`;
      const matches = unitSignatureIndex.get(signature);
      if (matches === undefined) unitSignatureIndex.set(signature, [unit.__key]);
      else matches.push(unit.__key);
    }
    for (const [signature, matches] of unitSignatureIndex) {
      const roots = [...new Set(matches.map((key) => unitUnion.find(key)))];
      const sourceIds = roots.flatMap((root) => currentGroups(unitUnion, unitByKey).get(root) ?? []).map((key) => unitByKey.get(key).source_id);
      if (new Set(sourceIds).size !== sourceIds.length) {
        addIssue(issues, "ERROR", "AMBIGUOUS_UNIT_IN_SOURCE", `Unit signature ${signature} occurs more than once in a source.`, { sku });
        continue;
      }
      for (const other of roots.slice(1)) unitUnion.union(roots[0], other);
    }
    const unitGroups = [...currentGroups(unitUnion, unitByKey).values()].map((keys) => keys.map((key) => unitByKey.get(key)));
    const canonicalUnits = [];
    for (const unitGroup of unitGroups) {
      const displayName = firstPresent(unitGroup, (unit) => unit.unit_name);
      const unitCode = typeof displayName === "string" ? normalizeUnitCode(displayName) : null;
      const conversion = firstPresent(unitGroup, (unit) => unit.__conversion);
      const conversionValues = [...new Set(unitGroup.map((unit) => unit.__conversion).filter((value) => typeof value === "string"))];
      if (conversionValues.length > 1) {
        addIssue(issues, "ERROR", "UNIT_CONVERSION_CONFLICT", "Barcode-matched unit records disagree on conversion factor.", { sku });
      }
      const unitCodeValues = [...new Set(unitGroup.map((unit) => typeof unit.unit_name === "string" ? normalizeUnitCode(unit.unit_name) : null).filter(Boolean))];
      if (unitCodeValues.length > 1) {
        addIssue(issues, "REVIEW", "UNIT_NAME_CONFLICT", "Barcode-matched unit records disagree on unit name/code.", { sku });
      }
      if (unitCode === null) addIssue(issues, "ERROR", "UNIT_NAME_MISSING", "Product unit has no usable unit name.", { sku });
      if (typeof conversion !== "string") addIssue(issues, "ERROR", "UNIT_CONVERSION_MISSING", "Product unit has no valid conversion.", { sku, unit_code: unitCode });
      const unitId = deterministicUuid(manifest.business_id, "product_unit", productId, unitGroup.map((unit) => unit.__key).sort().join("|"));
      const row = {
        id: unitId,
        business_id: manifest.business_id,
        product_id: productId,
        unit_code: unitCode,
        display_name: typeof displayName === "string" ? displayName : null,
        conversion_factor: typeof conversion === "string" ? conversion : null,
        can_sell: manifest.unit_defaults.can_sell,
        can_purchase: manifest.unit_defaults.can_purchase,
        allow_decimal_qty: manifest.unit_defaults.allow_decimal_qty,
        status: group.some((node) => node.is_active !== false) ? "ACTIVE" : "INACTIVE",
        created_at: manifest.cutover_at,
        updated_at: manifest.cutover_at,
        version: "1",
      };
      productUnits.push(row);
      canonicalUnits.push({ row, members: unitGroup });
      for (const unit of unitGroup) {
        legacyIdMap.push(makeLegacyMap(unit.source_system, unit.source_id, "product_unit", unit.legacy_unit_id, unitId));
      }
    }
    const canonicalUnitCodeCounts = new Map();
    for (const unit of canonicalUnits) {
      if (unit.row.unit_code === null) continue;
      canonicalUnitCodeCounts.set(unit.row.unit_code, (canonicalUnitCodeCounts.get(unit.row.unit_code) ?? 0) + 1);
    }
    for (const [unitCode, count] of canonicalUnitCodeCounts) {
      if (count > 1) {
        addIssue(issues, "ERROR", "DUPLICATE_CANONICAL_UNIT_CODE", "Multiple unresolved units would use the same unit code for one product.", { sku, unit_code: unitCode });
      }
    }
    const baseUnits = canonicalUnits.filter((unit) => typeof unit.row.conversion_factor === "string" && decimalEquals(unit.row.conversion_factor, "1"));
    if (baseUnits.length !== 1) {
      addIssue(issues, "ERROR", "BASE_UNIT_AMBIGUOUS", `Product must have exactly one unit with conversion 1; found ${baseUnits.length}.`, { sku });
    }
    const baseUnit = baseUnits[0] ?? null;
    products.push({
      id: productId,
      business_id: manifest.business_id,
      sku,
      name: typeof name === "string" ? name : null,
      category_id: categoryId,
      brand_id: brandId,
      base_unit_code: baseUnit?.row.unit_code ?? null,
      track_inventory: firstPresent(group, (node) => node.track_inventory) ?? manifest.default_track_inventory,
      status: group.some((node) => node.is_active !== false) ? "ACTIVE" : "INACTIVE",
      created_at: manifest.cutover_at,
      updated_at: manifest.cutover_at,
      version: "1",
    });

    const canonicalBarcodeOwners = new Map();
    for (const unit of canonicalUnits) {
      for (const rawBarcode of unit.members.flatMap((member) => member.barcodes ?? [])) {
        canonicalBarcodeOwners.set(normalizeBarcode(rawBarcode), unit.row.id);
      }
    }
    if (baseUnit !== null) {
      for (const rawBarcode of group.flatMap((node) => [node.product_barcode, ...(node.additional_product_barcodes ?? [])]).filter(Boolean)) {
        const barcode = normalizeBarcode(rawBarcode);
        const existingOwner = canonicalBarcodeOwners.get(barcode);
        if (existingOwner !== undefined && existingOwner !== baseUnit.row.id) {
          addIssue(issues, "ERROR", "PRODUCT_BARCODE_UNIT_CONFLICT", `Product barcode ${barcode} conflicts with a non-base unit barcode.`, { sku, barcode });
        } else canonicalBarcodeOwners.set(barcode, baseUnit.row.id);
      }
    }
    for (const [barcode, productUnitId] of canonicalBarcodeOwners) {
      const barcodeId = deterministicUuid(manifest.business_id, "barcode", barcode);
      barcodes.push({
        id: barcodeId,
        business_id: manifest.business_id,
        product_unit_id: productUnitId,
        barcode,
        is_internal: false,
        status: "ACTIVE",
        created_at: manifest.cutover_at,
        deactivated_at: null,
      });
      for (const node of group) {
        if (allProductBarcodes([node]).has(barcode)) {
          legacyIdMap.push(makeLegacyMap(node.source_system, node.source_id, "barcode", barcode, barcodeId));
        }
      }
    }

    const supplierNames = new Set();
    for (const node of group) {
      if (node.supplier === null || typeof node.supplier?.name !== "string" || node.supplier.name.trim().length === 0) continue;
      const supplierKey = normalizeEvidence(node.supplier.name);
      let supplier = suppliersByName.get(supplierKey);
      if (supplier === undefined) {
        const supplierId = deterministicUuid(manifest.business_id, "supplier", supplierKey);
        supplier = {
          id: supplierId,
          business_id: manifest.business_id,
          code: null,
          name: node.supplier.name.trim(),
          phone: node.supplier.phone ?? null,
          email: null,
          address: node.supplier.address ?? null,
          payment_details_json: null,
          status: "ACTIVE",
          created_at: manifest.cutover_at,
          updated_at: manifest.cutover_at,
          version: "1",
        };
        suppliersByName.set(supplierKey, supplier);
      }
      supplierNames.add(supplier.id);
      if (node.supplier.id !== null && node.supplier.id !== undefined) {
        legacyIdMap.push(makeLegacyMap(node.source_system, node.source_id, "supplier", String(node.supplier.id), supplier.id));
      }
    }
    [...supplierNames].sort().forEach((supplierId, index) => productSuppliers.push({
      product_id: productId,
      supplier_id: supplierId,
      supplier_sku: null,
      is_preferred: index === 0,
      status: "ACTIVE",
      created_at: manifest.cutover_at,
    }));
    groupDetails.push({ product_id: productId, sku, members: group, units: canonicalUnits, base_unit: baseUnit });
  }

  const barcodeGroups = new Map();
  for (const barcode of barcodes) {
    const existing = barcodeGroups.get(barcode.barcode);
    if (existing === undefined) barcodeGroups.set(barcode.barcode, [barcode]);
    else existing.push(barcode);
  }
  for (const [barcode, rows] of barcodeGroups) {
    if (new Set(rows.map((row) => row.product_unit_id)).size > 1) {
      addIssue(issues, "ERROR", "DUPLICATE_CANONICAL_BARCODE", `Barcode ${barcode} would be active on multiple canonical units.`, { barcode });
    }
  }
  const skuGroups = new Map();
  for (const product of products) {
    if (product.sku === null) continue;
    const existing = skuGroups.get(product.sku);
    if (existing === undefined) skuGroups.set(product.sku, [product.id]);
    else existing.push(product.id);
  }
  for (const [sku, ids] of skuGroups) {
    if (ids.length > 1) addIssue(issues, "ERROR", "DUPLICATE_CANONICAL_SKU", `SKU ${sku} would be assigned to multiple products.`, { sku });
  }

  const locationMap = new Map(manifest.location_map.map((entry) => [`${entry.source_id}\u001f${entry.legacy_location_id}`, entry.location_id]));
  const stockMovements = [];
  const stockBalances = [];
  const stockByProductLocation = new Map();
  const stockContributors = new Map();
  const stockSourceId = manifest.opening_authority.stock_source_id;
  if (stockSourceId !== null) {
    for (const detail of groupDetails) {
      const sourceNode = detail.members.find((node) => node.source_id === stockSourceId);
      if (sourceNode === undefined) continue;
      for (const stock of sourceNode.stock ?? []) {
        if (typeof stock.quantity !== "string") continue;
        let quantity = checkedDecimal(stock.quantity, 6, "opening_stock.quantity", issues, { source_id: stockSourceId, sku: detail.sku });
        if (quantity === null) continue;
        if (stock.quantity_kind === "SOURCE_UNIT") {
          const memberUnit = detail.units.find((unit) => unit.members.some(
            (member) => member.source_id === stockSourceId && member.legacy_unit_id === stock.legacy_unit_id,
          ));
          if (memberUnit === undefined || typeof memberUnit.row.conversion_factor !== "string") {
            addIssue(issues, "ERROR", "OPENING_STOCK_UNIT_UNRESOLVED", "CSV opening stock could not be converted because its source unit was unresolved.", { source_id: stockSourceId, sku: detail.sku });
            continue;
          }
          quantity = checkedDecimal(decimalMultiply(quantity, memberUnit.row.conversion_factor), 6, "opening_stock.base_quantity", issues, { source_id: stockSourceId, sku: detail.sku });
          if (quantity === null) continue;
        }
        let locationId = manifest.default_location_id;
        if (stock.legacy_location_id !== null && stock.legacy_location_id !== undefined) {
          locationId = locationMap.get(`${stockSourceId}\u001f${stock.legacy_location_id}`);
          if (locationId === undefined) {
            addIssue(issues, "ERROR", "OPENING_STOCK_LOCATION_UNMAPPED", "Opening stock references a legacy location that has no explicit location_map entry.", {
              source_id: stockSourceId,
              legacy_location_id: stock.legacy_location_id,
              sku: detail.sku,
            });
            continue;
          }
        }
        const key = `${detail.product_id}\u001f${locationId}`;
        stockByProductLocation.set(key, decimalSum([stockByProductLocation.get(key) ?? "0", quantity]));
        if (typeof stock.legacy_balance_id === "string" && stock.legacy_balance_id.length > 0) {
          const existing = stockContributors.get(key);
          const contributor = {
            source_system: sourceNode.source_system,
            source_id: sourceNode.source_id,
            legacy_id: stock.legacy_balance_id,
          };
          if (existing === undefined) stockContributors.set(key, [contributor]);
          else existing.push(contributor);
        }
      }
    }
  }
  for (const [key, quantity] of [...stockByProductLocation.entries()].sort()) {
    if (decimalIsZero(quantity)) continue;
    const [productId, locationId] = key.split("\u001f");
    const sourceId = deterministicUuid(manifest.business_id, "opening_stock_source", productId, locationId);
    const movementId = deterministicUuid(manifest.business_id, "stock_movement", sourceId);
    stockMovements.push({
      id: movementId,
      business_id: manifest.business_id,
      location_id: locationId,
      product_id: productId,
      movement_type: "INITIAL_STOCK",
      base_quantity_delta: quantity,
      source_unit_id: null,
      source_quantity: null,
      conversion_snapshot: null,
      source_type: "MIGRATION_OPENING",
      source_id: sourceId,
      source_line_id: null,
      reason_code: "LEGACY_OPENING",
      occurred_at: manifest.cutover_at,
      actor_user_id: manifest.actor_user_id,
      device_id: null,
      correlation_id: sourceId,
    });
    stockBalances.push({
      business_id: manifest.business_id,
      location_id: locationId,
      product_id: productId,
      base_quantity: quantity,
      last_movement_id: movementId,
      updated_at: manifest.cutover_at,
    });
    for (const contributor of stockContributors.get(key) ?? []) {
      legacyIdMap.push(makeLegacyMap(contributor.source_system, contributor.source_id, "stock_movement", contributor.legacy_id, movementId));
    }
  }

  const costEvents = [];
  const productCostStates = [];
  const costByProductLocation = new Map();
  const costSourceId = manifest.opening_authority.cost_source_id;
  if (costSourceId === null && stockByProductLocation.size > 0) {
    addIssue(issues, "ERROR", "OPENING_COST_AUTHORITY_MISSING_FOR_STOCK", "Non-zero opening stock exists but no opening cost authority was selected.");
  }
  if (costSourceId !== null) {
    for (const detail of groupDetails) {
      const baseMember = detail.base_unit?.members.find((member) => member.source_id === costSourceId);
      if (baseMember === undefined || typeof baseMember.cost !== "string") {
        if ([...stockByProductLocation.keys()].some((key) => key.startsWith(`${detail.product_id}\u001f`))) {
          addIssue(issues, "ERROR", "OPENING_COST_MISSING_FOR_STOCK", "Stocked product has no explicit base-unit opening cost in the selected cost authority.", { source_id: costSourceId, sku: detail.sku });
        }
        continue;
      }
      const unitCost = checkedDecimal(baseMember.cost, 8, "opening_cost.unit_cost", issues, { source_id: costSourceId, sku: detail.sku });
      if (unitCost === null) continue;
      if (decimalCompare(unitCost, "0") < 0) {
        addIssue(issues, "ERROR", "OPENING_COST_NEGATIVE", "Opening cost must not be negative.", { source_id: costSourceId, sku: detail.sku });
        continue;
      }
      const productStocks = [...stockByProductLocation.entries()].filter(([key]) => key.startsWith(`${detail.product_id}\u001f`));
      const locations = productStocks.length > 0
        ? productStocks.map(([key, quantity]) => ({ locationId: key.split("\u001f")[1], quantity }))
        : [{ locationId: manifest.default_location_id, quantity: null }];
      for (const { locationId, quantity } of locations) {
        const sourceId = deterministicUuid(manifest.business_id, "opening_cost_source", detail.product_id, locationId);
        const eventId = deterministicUuid(manifest.business_id, "cost_event", sourceId);
        const quantityBasis = quantity !== null && decimalCompare(quantity, "0") >= 0 ? quantity : null;
        if (quantity !== null && quantityBasis === null) {
          addIssue(issues, "WARNING", "NEGATIVE_STOCK_COST_BASIS_OMITTED", "Negative stock was preserved in the stock ledger; optional INITIAL_COST quantity_basis was omitted to satisfy the canonical nonnegative cost-event constraint.", { sku: detail.sku, location_id: locationId });
        }
        costEvents.push({
          id: eventId,
          business_id: manifest.business_id,
          location_id: locationId,
          product_id: detail.product_id,
          event_type: "INITIAL_COST",
          quantity_basis: quantityBasis,
          unit_cost_before: null,
          unit_cost_after: unitCost,
          // Optional in the canonical schema. Do not manufacture a rounded
          // NUMERIC(24,8) value when quantity × cost has greater precision.
          value_delta: null,
          source_type: "MIGRATION_OPENING",
          source_id: sourceId,
          reason: "Legacy opening cost",
          occurred_at: manifest.cutover_at,
          actor_user_id: manifest.actor_user_id,
          correlation_id: sourceId,
        });
        productCostStates.push({
          business_id: manifest.business_id,
          location_id: locationId,
          product_id: detail.product_id,
          mwa_unit_cost: unitCost,
          last_valid_mwa_unit_cost: unitCost,
          latest_landed_unit_cost: null,
          pricing_reference_unit_cost: unitCost,
          pricing_reference_source_type: "INITIAL_COST",
          pricing_reference_source_id: eventId,
          last_cost_event_id: eventId,
          updated_at: manifest.cutover_at,
        });
        costByProductLocation.set(`${detail.product_id}\u001f${locationId}`, unitCost);
      }
    }
  }

  const priceSets = [];
  const priceVersions = [];
  const priceTiers = [];
  const priceSourceId = manifest.opening_authority.price_source_id;
  if (priceSourceId === null && productUnits.some((unit) => unit.can_sell && unit.status === "ACTIVE")) {
    addIssue(issues, "ERROR", "OPENING_PRICE_AUTHORITY_MISSING", "Active sellable units exist but no opening price authority was selected.");
  }
  if (priceSourceId !== null) {
    const priceSetId = deterministicUuid(manifest.business_id, "price_set", "OPENING_PRICE", manifest.cutover_at);
    for (const detail of groupDetails) {
      const sourceUnits = detail.units.flatMap((canonicalUnit) => canonicalUnit.members
        .filter((member) => member.source_id === priceSourceId)
        .map((member) => ({ canonicalUnit, member })));
      for (const { canonicalUnit, member } of sourceUnits) {
        if (typeof member.price !== "string") continue;
        const price = checkedDecimal(member.price, 4, "opening_price.unit_price", issues, { source_id: priceSourceId, sku: detail.sku, unit_code: canonicalUnit.row.unit_code });
        if (price === null) continue;
        if (decimalCompare(price, "0") < 0) {
          addIssue(issues, "ERROR", "OPENING_PRICE_NEGATIVE", "Opening price must not be negative.", { source_id: priceSourceId, sku: detail.sku });
          continue;
        }
        const priceVersionId = deterministicUuid(manifest.business_id, "price_version", canonicalUnit.row.id, manifest.cutover_at);
        priceVersions.push({
          id: priceVersionId,
          business_id: manifest.business_id,
          product_unit_id: canonicalUnit.row.id,
          status: "ACTIVE",
          effective_from: manifest.cutover_at,
          effective_to: null,
          created_at: manifest.cutover_at,
          price_set_id: priceSetId,
          pricing_reference_cost_snapshot: null,
          tax_mode: manifest.opening_price_tax.mode,
          tax_rate_snapshot: manifest.opening_price_tax.rate,
          created_by: manifest.actor_user_id,
          approved_by: manifest.actor_user_id,
        });
        priceTiers.push({
          id: deterministicUuid(manifest.business_id, "price_tier", priceVersionId, "RETAIL"),
          price_version_id: priceVersionId,
          tier_code: "RETAIL",
          min_qty: "1",
          unit_price: price,
          sort_order: "1",
        });
      }
      const sellableUnits = detail.units.filter((unit) => unit.row.can_sell && unit.row.status === "ACTIVE");
      const pricedUnitIds = new Set(priceVersions.map((row) => row.product_unit_id));
      for (const unit of sellableUnits) {
        if (!pricedUnitIds.has(unit.row.id)) {
          addIssue(issues, "ERROR", "OPENING_PRICE_MISSING", "An active sellable unit has no price in the selected price authority.", { source_id: priceSourceId, sku: detail.sku, unit_code: unit.row.unit_code });
        }
      }
    }
    if (priceVersions.length > 0) {
      priceSets.push({
        id: priceSetId,
        business_id: manifest.business_id,
        name: "Legacy opening prices",
        source_type: "OPENING_PRICE",
        status: "ACTIVE",
        proposed_by: manifest.actor_user_id,
        approved_by: manifest.actor_user_id,
        approved_at: manifest.cutover_at,
        effective_from: manifest.cutover_at,
        notes: "Deterministic staging migration opening price set",
        created_at: manifest.cutover_at,
        updated_at: manifest.cutover_at,
        version: "1",
      });
    }
  }

  const inventoryValueTerms = [];
  let missingInventoryValueEvidence = 0;
  for (const [key, quantity] of stockByProductLocation) {
    const cost = costByProductLocation.get(key);
    if (cost === undefined) {
      if (!decimalIsZero(quantity)) missingInventoryValueEvidence += 1;
    } else inventoryValueTerms.push(decimalMultiply(quantity, cost));
  }
  const auditEventId = deterministicUuid(manifest.business_id, "audit", "MIGRATION_STAGING_IMPORT", manifest.cutover_at);
  const deduplicatedLegacyMap = new Map();
  for (const row of legacyIdMap) {
    const key = `${row.source_system}\u001f${row.entity_type}\u001f${row.legacy_id}`;
    const existing = deduplicatedLegacyMap.get(key);
    if (existing !== undefined && existing.new_entity_id !== row.new_entity_id) {
      addIssue(issues, "ERROR", "LEGACY_ID_MAP_CONFLICT", "One legacy identifier resolves to multiple canonical records.", {
        source_system: row.source_system,
        entity_type: row.entity_type,
        legacy_id: row.legacy_id,
      });
    } else deduplicatedLegacyMap.set(key, row);
  }
  const records = {
    categories: [...categoriesByName.values()].sort((left, right) => left.id.localeCompare(right.id, "en")),
    brands: [...brandsByName.values()].sort((left, right) => left.id.localeCompare(right.id, "en")),
    suppliers: [...suppliersByName.values()].sort((left, right) => left.id.localeCompare(right.id, "en")),
    products: products.sort((left, right) => left.id.localeCompare(right.id, "en")),
    product_units: productUnits.sort((left, right) => left.id.localeCompare(right.id, "en")),
    barcodes: barcodes.sort((left, right) => left.barcode.localeCompare(right.barcode, "en")),
    product_suppliers: productSuppliers.sort((left, right) => `${left.product_id}:${left.supplier_id}`.localeCompare(`${right.product_id}:${right.supplier_id}`, "en")),
    stock_movements: stockMovements.sort((left, right) => left.id.localeCompare(right.id, "en")),
    stock_balances: stockBalances.sort((left, right) => `${left.product_id}:${left.location_id}`.localeCompare(`${right.product_id}:${right.location_id}`, "en")),
    cost_events: costEvents.sort((left, right) => left.id.localeCompare(right.id, "en")),
    product_cost_states: productCostStates.sort((left, right) => `${left.product_id}:${left.location_id}`.localeCompare(`${right.product_id}:${right.location_id}`, "en")),
    price_sets: priceSets,
    price_versions: priceVersions.sort((left, right) => left.id.localeCompare(right.id, "en")),
    price_tiers: priceTiers.sort((left, right) => left.id.localeCompare(right.id, "en")),
    legacy_id_map: [...deduplicatedLegacyMap.values()].sort((left, right) => `${left.source_system}:${left.entity_type}:${left.legacy_id}`.localeCompare(`${right.source_system}:${right.entity_type}:${right.legacy_id}`, "en")),
    audit_events: [{
      id: auditEventId,
      business_id: manifest.business_id,
      location_id: manifest.default_location_id,
      actor_type: "USER",
      actor_user_id: manifest.actor_user_id,
      actor_role_snapshot: null,
      action: "MIGRATION_STAGING_IMPORT",
      entity_type: "MIGRATION_BATCH",
      entity_id: auditEventId,
      occurred_at: manifest.cutover_at,
      recorded_at: manifest.cutover_at,
      device_id: null,
      session_id: null,
      reason: "Legacy catalog and opening facts staged through reviewed migration plan",
      before_data: null,
      after_data: { source_ids: manifest.sources.map((source) => source.id).sort() },
      correlation_id: auditEventId,
      authorization_version: null,
    }],
  };

  const exclusions = normalizedSources.map((source) => ({ source_id: source.source_id, ...source.excluded }));
  const finalIssues = sortedIssues(issues);
  const summary = {
    source_product_records: allNodes.length,
    canonical_products: records.products.length,
    canonical_product_units: records.product_units.length,
    canonical_barcodes: records.barcodes.length,
    opening_stock_movements: records.stock_movements.length,
    opening_stock_base_quantity: decimalSum(records.stock_balances.map((row) => row.base_quantity)),
    opening_inventory_value: missingInventoryValueEvidence === 0 ? decimalSum(inventoryValueTerms) : null,
    inventory_value_missing_cost_rows: missingInventoryValueEvidence,
    opening_cost_events: records.cost_events.length,
    active_opening_prices: records.price_versions.length,
    excluded_records: exclusions,
    issue_counts: {
      error: finalIssues.filter((issue) => issue.severity === "ERROR").length,
      review: finalIssues.filter((issue) => issue.severity === "REVIEW").length,
      warning: finalIssues.filter((issue) => issue.severity === "WARNING").length,
      info: finalIssues.filter((issue) => issue.severity === "INFO").length,
    },
  };
  const planWithoutId = {
    schema_version: 1,
    kind: "KASTUR_STAGING_MIGRATION_PLAN",
    business_id: manifest.business_id,
    default_location_id: manifest.default_location_id,
    actor_user_id: manifest.actor_user_id,
    cutover_at: manifest.cutover_at,
    source_fingerprints: normalizedSources
      .map((source) => ({ source_id: source.source_id, source_system: source.source_system, sha256: sha256Hex(canonicalJson(source)) }))
      .sort((left, right) => left.source_id.localeCompare(right.source_id, "en")),
    deduplication_report: {
      applied_matches: appliedMatches.sort((left, right) => `${left.reason}:${left.left_product}:${left.right_product}`.localeCompare(`${right.reason}:${right.left_product}:${right.right_product}`, "en")),
      canonical_groups: groupDetails
        .map((detail) => ({
          product_id: detail.product_id,
          sku: detail.sku,
          source_records: detail.members.map((node) => ({
            source_id: node.source_id,
            source_system: node.source_system,
            legacy_product_id: node.legacy_product_id,
          })).sort((left, right) => `${left.source_id}:${left.legacy_product_id}`.localeCompare(`${right.source_id}:${right.legacy_product_id}`, "en")),
        }))
        .sort((left, right) => left.product_id.localeCompare(right.product_id, "en")),
    },
    opening_authority: manifest.opening_authority,
    records,
    reconciliation_expected: summary,
    issues: finalIssues,
  };
  return { ...planWithoutId, plan_id: sha256Hex(canonicalJson(planWithoutId)) };
}
