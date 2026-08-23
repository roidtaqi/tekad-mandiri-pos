import { decimalCompare, parseDecimal, type DecimalValue } from "@kastur/numeric";

import type { AuthenticatedRequestContext } from "./auth.js";
import { requirePermission } from "./auth.js";
import {
  appendAuditEvent,
  appendChange,
  executeIdempotent,
  type CommandIdentity,
} from "./command-support.js";
import type { RequestDatabase, SqlExecutor } from "./database.js";
import { ApiError } from "./http.js";
import {
  assertFreshAuthorization,
  decimalValue,
  nullableDecimalValue,
  requireCommandLocation,
  requireOwner,
} from "./operational-values.js";
import {
  arrayValue,
  enumValue,
  integerValue,
  nullableStringValue,
  objectValue,
  stringValue,
  timestampValue,
  uuidValue,
  validationError,
} from "./validation.js";

export interface PricingCommandInput {
  readonly command: CommandIdentity;
  readonly command_authorization_version: number;
  readonly device_id: string;
  readonly payload: unknown;
}

interface ProposalItem {
  readonly calculated_margin: DecimalValue | null;
  readonly current_price_snapshot: DecimalValue | null;
  readonly minimum_margin_snapshot: DecimalValue | null;
  readonly pricing_reference_cost_snapshot: DecimalValue | null;
  readonly product_unit_id: string;
  readonly proposal_item_id: string;
  readonly proposed_price: DecimalValue;
  readonly recommended_price: DecimalValue | null;
  readonly risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly target_margin_snapshot: DecimalValue | null;
}

interface CreatePayload {
  readonly items: readonly ProposalItem[];
  readonly name: string | null;
  readonly notes: string | null;
  readonly price_set_id: string;
  readonly source_type: string;
}

interface SubmitPayload {
  readonly expected_version: number;
  readonly price_set_id: string;
}

interface ApprovedTier {
  readonly min_qty: DecimalValue;
  readonly sort_order: number;
  readonly tier_code: string;
  readonly tier_id: string | null;
  readonly unit_price: DecimalValue;
}

interface ApprovedItem {
  readonly final_approved_price: DecimalValue;
  readonly price_version_id: string | null;
  readonly proposal_item_id: string;
  readonly tiers: readonly ApprovedTier[];
}

interface ApprovePayload {
  readonly effective_from: string;
  readonly expected_version: number;
  readonly items: readonly ApprovedItem[];
  readonly owner_reason: string | null;
  readonly price_set_id: string;
}

interface PriceSetRow {
  readonly status: string;
  readonly version: string;
}

interface ProposalRow {
  readonly product_unit_id: string;
  readonly pricing_reference_cost_snapshot: string | null;
}

interface PublishedRow {
  readonly effective_from: Date | string;
  readonly id: string;
  readonly status: "ACTIVE" | "SCHEDULED";
}

interface CreatedRow {
  readonly created_at: Date | string;
}

type PromotionType = "FIXED_DISCOUNT" | "FIXED_PRICE" | "PERCENT_DISCOUNT";

interface PublishPromotionPayload {
  readonly effective_from: string;
  readonly effective_to: string;
  readonly min_qty: DecimalValue;
  readonly name: string;
  readonly owner_reason: string | null;
  readonly priority: number;
  readonly product_unit_id: string;
  readonly promotion_id: string;
  readonly promotion_type: PromotionType;
  readonly value: DecimalValue;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function money(value: unknown, field: string): DecimalValue {
  return decimalValue(value, field, { allowZero: true, precision: 20, scale: 4 });
}

function optionalMoney(value: unknown, field: string): DecimalValue | null {
  return nullableDecimalValue(value, field, { allowZero: true, precision: 20, scale: 4 });
}

function optionalRatio(value: unknown, field: string): DecimalValue | null {
  return nullableDecimalValue(value, field, { allowZero: true, precision: 12, scale: 8 });
}

function readProposalItem(value: unknown, index: number): ProposalItem {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  return {
    calculated_margin: optionalRatio(row.calculated_margin, `${field}.calculated_margin`),
    current_price_snapshot: optionalMoney(row.current_price_snapshot, `${field}.current_price_snapshot`),
    minimum_margin_snapshot: optionalRatio(row.minimum_margin_snapshot, `${field}.minimum_margin_snapshot`),
    pricing_reference_cost_snapshot: nullableDecimalValue(
      row.pricing_reference_cost_snapshot,
      `${field}.pricing_reference_cost_snapshot`,
      { allowZero: true, precision: 24, scale: 8 },
    ),
    product_unit_id: uuidValue(row.product_unit_id, `${field}.product_unit_id`),
    proposal_item_id: uuidValue(row.proposal_item_id, `${field}.proposal_item_id`),
    proposed_price: money(row.proposed_price, `${field}.proposed_price`),
    recommended_price: optionalMoney(row.recommended_price, `${field}.recommended_price`),
    risk_level: enumValue(row.risk_level, `${field}.risk_level`, [
      "LOW",
      "MEDIUM",
      "HIGH",
      "CRITICAL",
    ] as const),
    target_margin_snapshot: optionalRatio(row.target_margin_snapshot, `${field}.target_margin_snapshot`),
  };
}

function readCreate(value: unknown): CreatePayload {
  const row = objectValue(value, "payload");
  const items = arrayValue(row.items, "payload.items").map(readProposalItem);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  if (new Set(items.map((item) => item.product_unit_id)).size !== items.length) {
    throw new ApiError(400, "PRICE_PROPOSAL_UNIT_DUPLICATE", "Product Unit duplikat dalam Price Set.");
  }
  return {
    items,
    name: nullableStringValue(row.name, "payload.name"),
    notes: nullableStringValue(row.notes, "payload.notes"),
    price_set_id: uuidValue(row.price_set_id, "payload.price_set_id"),
    source_type: stringValue(row.source_type, "payload.source_type"),
  };
}

export async function createPriceProposalCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: PricingCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "pricing.proposal.create");
  requireCommandLocation(context, input.command);
  const payload = readCreate(input.payload);
  const businessId = context.authorization.membership.business_id;
  const stale = input.command_authorization_version !== context.authorization.authorization_version;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    await executor.query(
      `INSERT INTO pricing.price_sets (
         id, business_id, name, source_type, status, proposed_by, notes,
         created_at, updated_at, version
       ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
      [
        payload.price_set_id,
        businessId,
        payload.name,
        payload.source_type,
        context.authorization.user.id,
        payload.notes,
      ],
    );
    for (const item of payload.items) {
      const unit = await executor.query(
        `SELECT 1 FROM catalog.product_units pu
         JOIN catalog.products p ON p.id = pu.product_id AND p.business_id = pu.business_id
         WHERE pu.id = $1 AND pu.business_id = $2 AND pu.status = 'ACTIVE' AND p.status = 'ACTIVE'`,
        [item.product_unit_id, businessId],
      );
      if (unit.rows[0] === undefined) {
        throw new ApiError(404, "PRICE_PRODUCT_UNIT_NOT_FOUND", "Product Unit tidak ditemukan.");
      }
      await executor.query(
        `INSERT INTO pricing.price_proposal_items (
           id, price_set_id, product_unit_id, pricing_reference_cost_snapshot,
           current_price_snapshot, recommended_price, proposed_price,
           target_margin_snapshot, minimum_margin_snapshot, calculated_margin,
           risk_level, item_status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'DRAFT')`,
        [
          item.proposal_item_id,
          payload.price_set_id,
          item.product_unit_id,
          item.pricing_reference_cost_snapshot,
          item.current_price_snapshot,
          item.recommended_price,
          item.proposed_price,
          item.target_margin_snapshot,
          item.minimum_margin_snapshot,
          item.calculated_margin,
          item.risk_level,
        ],
      );
    }
    const result = {
      item_count: payload.items.length,
      price_set_id: payload.price_set_id,
      status: "DRAFT",
      version: "1",
      warnings: stale ? ["AUTHORIZATION_STALE_EXCEPTION"] : [],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "PRICE_PROPOSAL_CREATED",
      after_data: result,
      entity_id: payload.price_set_id,
      entity_type: "price_set",
    });
    await appendChange(executor, context, input.command, {
      change_type: "UPSERT",
      entity_id: payload.price_set_id,
      entity_type: "price_set",
      entity_version: "1",
      payload: result,
    });
    return result;
  });
}

function readSubmit(value: unknown): SubmitPayload {
  const row = objectValue(value, "payload");
  return {
    expected_version: integerValue(row.expected_version, "payload.expected_version", 1),
    price_set_id: uuidValue(row.price_set_id, "payload.price_set_id"),
  };
}

export async function submitPriceProposalCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: PricingCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "pricing.proposal.review");
  assertFreshAuthorization(context, input.command_authorization_version);
  requireCommandLocation(context, input.command);
  const payload = readSubmit(input.payload);
  const businessId = context.authorization.membership.business_id;
  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const sets = await executor.query<PriceSetRow>(
      `SELECT status, version::text FROM pricing.price_sets
       WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [payload.price_set_id, businessId],
    );
    const set = sets.rows[0];
    if (set === undefined) throw new ApiError(404, "PRICE_SET_NOT_FOUND", "Price Set tidak ditemukan.");
    if (set.version !== payload.expected_version.toString()) {
      throw new ApiError(409, "PRICE_SET_VERSION_CONFLICT", "Versi Price Set sudah berubah.");
    }
    if (set.status !== "DRAFT" && set.status !== "IN_REVIEW") {
      throw new ApiError(409, "PRICE_SET_STATE_INVALID", "Price Set tidak dapat diajukan.");
    }
    const version = (BigInt(set.version) + 1n).toString();
    await executor.query(
      `UPDATE pricing.price_sets
       SET status = 'PENDING_APPROVAL', updated_at = CURRENT_TIMESTAMP, version = $3
       WHERE id = $1 AND business_id = $2`,
      [payload.price_set_id, businessId, version],
    );
    await executor.query(
      `UPDATE pricing.price_proposal_items SET item_status = 'PENDING_APPROVAL'
       WHERE price_set_id = $1`,
      [payload.price_set_id],
    );
    const result = { price_set_id: payload.price_set_id, status: "PENDING_APPROVAL", version } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "PRICE_PROPOSAL_SUBMITTED",
      after_data: result,
      entity_id: payload.price_set_id,
      entity_type: "price_set",
    });
    await appendChange(executor, context, input.command, {
      change_type: "UPSERT",
      entity_id: payload.price_set_id,
      entity_type: "price_set",
      entity_version: version,
      payload: result,
    });
    return result;
  });
}

function readTier(value: unknown, index: number, fieldRoot: string): ApprovedTier {
  const field = `${fieldRoot}.tiers[${index}]`;
  const row = objectValue(value, field);
  return {
    min_qty: decimalValue(row.min_qty, `${field}.min_qty`, { precision: 20, scale: 6 }),
    sort_order: integerValue(row.sort_order, `${field}.sort_order`),
    tier_code: stringValue(row.tier_code, `${field}.tier_code`),
    tier_id:
      row.tier_id === null || row.tier_id === undefined
        ? null
        : uuidValue(row.tier_id, `${field}.tier_id`),
    unit_price: money(row.unit_price, `${field}.unit_price`),
  };
}

function readApprovedItem(value: unknown, index: number): ApprovedItem {
  const field = `payload.items[${index}]`;
  const row = objectValue(value, field);
  const approved = money(row.final_approved_price, `${field}.final_approved_price`);
  const tiers = arrayValue(row.tiers ?? [], `${field}.tiers`).map((tier, tierIndex) =>
    readTier(tier, tierIndex, field),
  );
  if (!tiers.some((tier) => tier.tier_code === "RETAIL")) {
    tiers.unshift({
      min_qty: parseDecimal("1"),
      sort_order: 0,
      tier_code: "RETAIL",
      tier_id: null,
      unit_price: approved,
    });
  }
  if (
    new Set(tiers.map((tier) => tier.tier_code)).size !== tiers.length ||
    new Set(tiers.map((tier) => tier.min_qty)).size !== tiers.length
  ) {
    throw new ApiError(400, "PRICE_TIER_DUPLICATE", "Tier code/minimum quantity duplikat.");
  }
  const retail = tiers.find((tier) => tier.tier_code === "RETAIL");
  if (retail === undefined || decimalCompare(retail.min_qty, parseDecimal("1")) !== 0 || decimalCompare(retail.unit_price, approved) !== 0) {
    throw new ApiError(400, "RETAIL_TIER_MISMATCH", "Tier RETAIL harus min_qty 1 dan sama dengan approved price.");
  }
  return {
    final_approved_price: approved,
    price_version_id:
      row.price_version_id === null || row.price_version_id === undefined
        ? null
        : uuidValue(row.price_version_id, `${field}.price_version_id`),
    proposal_item_id: uuidValue(row.proposal_item_id, `${field}.proposal_item_id`),
    tiers,
  };
}

function readApprove(value: unknown): ApprovePayload {
  const row = objectValue(value, "payload");
  const items = arrayValue(row.items, "payload.items").map(readApprovedItem);
  if (items.length === 0) throw validationError("payload.items", "tidak boleh kosong");
  return {
    effective_from: timestampValue(row.effective_from, "payload.effective_from"),
    expected_version: integerValue(row.expected_version, "payload.expected_version", 1),
    items,
    owner_reason: nullableStringValue(row.owner_reason, "payload.owner_reason"),
    price_set_id: uuidValue(row.price_set_id, "payload.price_set_id"),
  };
}

async function lockPricingUnit(executor: SqlExecutor, productUnitId: string): Promise<void> {
  await executor.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [productUnitId]);
}

export async function approvePriceProposalCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: PricingCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "pricing.approve");
  requireOwner(context);
  assertFreshAuthorization(context, input.command_authorization_version);
  requireCommandLocation(context, input.command);
  const payload = readApprove(input.payload);
  const businessId = context.authorization.membership.business_id;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const sets = await executor.query<PriceSetRow>(
      `SELECT status, version::text FROM pricing.price_sets
       WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [payload.price_set_id, businessId],
    );
    const set = sets.rows[0];
    if (set === undefined) throw new ApiError(404, "PRICE_SET_NOT_FOUND", "Price Set tidak ditemukan.");
    if (set.version !== payload.expected_version.toString()) {
      throw new ApiError(409, "PRICE_SET_VERSION_CONFLICT", "Versi Price Set sudah berubah.");
    }
    if (set.status !== "PENDING_APPROVAL" && set.status !== "DRAFT" && set.status !== "IN_REVIEW") {
      throw new ApiError(409, "PRICE_SET_STATE_INVALID", "Price Set tidak dapat disetujui.");
    }
    const now = new Date();
    const effective = new Date(payload.effective_from);
    const newStatus = effective.getTime() <= now.getTime() ? "ACTIVE" : "SCHEDULED";
    const published: Array<Readonly<Record<string, unknown>>> = [];

    for (const approved of payload.items) {
      const proposals = await executor.query<ProposalRow>(
        `SELECT ppi.product_unit_id, ppi.pricing_reference_cost_snapshot::text
         FROM pricing.price_proposal_items ppi
         WHERE ppi.id = $1 AND ppi.price_set_id = $2
         FOR UPDATE`,
        [approved.proposal_item_id, payload.price_set_id],
      );
      const proposal = proposals.rows[0];
      if (proposal === undefined) {
        throw new ApiError(404, "PRICE_PROPOSAL_ITEM_NOT_FOUND", "Proposal Item tidak ditemukan.");
      }
      await lockPricingUnit(executor, proposal.product_unit_id);
      const versions = await executor.query<PublishedRow>(
        `SELECT id, status, effective_from
         FROM pricing.price_versions
         WHERE business_id = $1 AND product_unit_id = $2
           AND status IN ('ACTIVE', 'SCHEDULED')
         ORDER BY effective_from ASC
         FOR UPDATE`,
        [businessId, proposal.product_unit_id],
      );
      const futureConflict = versions.rows.find((version) => {
        const start = new Date(version.effective_from).getTime();
        return version.status === "SCHEDULED" || start >= effective.getTime();
      });
      if (futureConflict !== undefined) {
        throw new ApiError(
          409,
          "PRICE_VERSION_OVERLAP",
          "Sudah ada Price Version aktif/terjadwal yang bertumpang tindih.",
        );
      }
      const current = versions.rows.find((version) => version.status === "ACTIVE");
      if (current !== undefined) {
        await executor.query(
          `UPDATE pricing.price_versions
           SET effective_to = $2,
               status = CASE WHEN $2 <= CURRENT_TIMESTAMP THEN 'SUPERSEDED' ELSE status END
           WHERE id = $1`,
          [current.id, payload.effective_from],
        );
        const priorRows = await executor.query<{
          readonly created_at: Date | string;
          readonly effective_from: Date | string;
          readonly effective_to: Date | string | null;
          readonly id: string;
          readonly min_qty: string;
          readonly product_unit_id: string;
          readonly sort_order: number;
          readonly status: "ACTIVE" | "SUPERSEDED";
          readonly tier_code: string;
          readonly tier_id: string;
          readonly unit_price: string;
        }>(
          `SELECT pv.id, pv.product_unit_id, pv.status, pv.effective_from,
                  pv.effective_to, pv.created_at, pt.id AS tier_id,
                  pt.tier_code, pt.min_qty::text, pt.unit_price::text,
                  pt.sort_order
           FROM pricing.price_versions pv
           JOIN pricing.price_tier_versions pt ON pt.price_version_id = pv.id
           WHERE pv.id = $1
           ORDER BY pt.sort_order, pt.min_qty`,
          [current.id],
        );
        const prior = priorRows.rows[0];
        const retail = priorRows.rows.find((tier) => tier.tier_code === "RETAIL");
        if (prior === undefined || retail === undefined) {
          throw new Error("Published Price Version is missing its RETAIL tier.");
        }
        const priorProjection = {
          created_at: iso(prior.created_at),
          effective_from: iso(prior.effective_from),
          effective_to:
            prior.effective_to === null ? null : iso(prior.effective_to),
          price_version_id: prior.id,
          product_unit_id: prior.product_unit_id,
          status: prior.status,
          tiers: priorRows.rows.map((tier) => ({
            id: tier.tier_id,
            min_qty: tier.min_qty,
            price_version_id: tier.id,
            sort_order: tier.sort_order,
            tier_code: tier.tier_code,
            unit_price: tier.unit_price,
          })),
          unit_price: retail.unit_price,
        } as const;
        await appendChange(executor, context, input.command, {
          change_type: "UPSERT",
          entity_id: prior.id,
          entity_type: "published_retail_price",
          payload: priorProjection,
        });
      }
      const versionId = approved.price_version_id ?? crypto.randomUUID();
      const insertedVersion = await executor.query<CreatedRow>(
        `INSERT INTO pricing.price_versions (
           id, business_id, product_unit_id, price_set_id, status,
           effective_from, pricing_reference_cost_snapshot, tax_mode,
           tax_rate_snapshot, created_by, approved_by, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'TAX_INCLUDED', 0, $8, $8, CURRENT_TIMESTAMP)
         RETURNING created_at`,
        [
          versionId,
          businessId,
          proposal.product_unit_id,
          payload.price_set_id,
          newStatus,
          payload.effective_from,
          proposal.pricing_reference_cost_snapshot,
          context.authorization.user.id,
        ],
      );
      const publishedTiers = approved.tiers.map((tier) => ({
        id: tier.tier_id ?? crypto.randomUUID(),
        min_qty: tier.min_qty,
        price_version_id: versionId,
        sort_order: tier.sort_order,
        tier_code: tier.tier_code,
        unit_price: tier.unit_price,
      }));
      for (const tier of publishedTiers) {
        await executor.query(
          `INSERT INTO pricing.price_tier_versions (
             id, price_version_id, tier_code, min_qty, unit_price, sort_order
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tier.id,
            versionId,
            tier.tier_code,
            tier.min_qty,
            tier.unit_price,
            tier.sort_order,
          ],
        );
      }
      await executor.query(
        `UPDATE pricing.price_proposal_items
         SET final_approved_price = $2, item_status = 'APPROVED', owner_edit_reason = $3
         WHERE id = $1`,
        [approved.proposal_item_id, approved.final_approved_price, payload.owner_reason],
      );
      const projection = {
        created_at: iso(insertedVersion.rows[0]?.created_at ?? now),
        effective_from: payload.effective_from,
        effective_to: null,
        price_version_id: versionId,
        product_unit_id: proposal.product_unit_id,
        status: newStatus,
        tiers: publishedTiers.map((tier) => ({
          id: tier.id,
          min_qty: tier.min_qty,
          price_version_id: versionId,
          sort_order: tier.sort_order,
          tier_code: tier.tier_code,
          unit_price: tier.unit_price,
        })),
        unit_price: approved.final_approved_price,
      } as const;
      published.push(projection);
      await appendChange(executor, context, input.command, {
        change_type: "UPSERT",
        entity_id: versionId,
        entity_type: "published_retail_price",
        payload: projection,
      });
    }

    const version = (BigInt(set.version) + 1n).toString();
    const setStatus = newStatus === "ACTIVE" ? "ACTIVE" : "SCHEDULED";
    await executor.query(
      `UPDATE pricing.price_sets
       SET status = $3, approved_by = $4, approved_at = CURRENT_TIMESTAMP,
           effective_from = $5, updated_at = CURRENT_TIMESTAMP, version = $6
       WHERE id = $1 AND business_id = $2`,
      [
        payload.price_set_id,
        businessId,
        setStatus,
        context.authorization.user.id,
        payload.effective_from,
        version,
      ],
    );
    const result = {
      price_set_id: payload.price_set_id,
      published_versions: published,
      status: setStatus,
      version,
      warnings: [] as readonly string[],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "PRICE_PROPOSAL_APPROVED",
      after_data: result,
      entity_id: payload.price_set_id,
      entity_type: "price_set",
      ...(payload.owner_reason === null ? {} : { reason: payload.owner_reason }),
    });
    return result;
  });
}

function readPublishPromotion(value: unknown): PublishPromotionPayload {
  const row = objectValue(value, "payload");
  const promotionType = enumValue(row.promotion_type, "payload.promotion_type", [
    "FIXED_PRICE",
    "PERCENT_DISCOUNT",
    "FIXED_DISCOUNT",
  ] as const);
  const promotionValue = decimalValue(row.value, "payload.value", {
    allowZero: true,
    precision: 20,
    scale: 4,
  });
  if (
    promotionType === "PERCENT_DISCOUNT" &&
    decimalCompare(promotionValue, parseDecimal("100")) > 0
  ) {
    throw new ApiError(
      400,
      "PROMOTION_PERCENT_INVALID",
      "Persentase Promotion tidak boleh melebihi 100.",
    );
  }
  const effectiveFrom = timestampValue(row.effective_from, "payload.effective_from");
  const effectiveTo = timestampValue(row.effective_to, "payload.effective_to");
  if (new Date(effectiveTo).getTime() <= new Date(effectiveFrom).getTime()) {
    throw new ApiError(
      400,
      "PROMOTION_WINDOW_INVALID",
      "Waktu berakhir Promotion harus setelah waktu mulai.",
    );
  }
  return {
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    min_qty: decimalValue(row.min_qty, "payload.min_qty", { precision: 20, scale: 6 }),
    name: stringValue(row.name, "payload.name"),
    owner_reason: nullableStringValue(row.owner_reason, "payload.owner_reason"),
    priority: integerValue(row.priority, "payload.priority"),
    product_unit_id: uuidValue(row.product_unit_id, "payload.product_unit_id"),
    promotion_id: uuidValue(row.promotion_id, "payload.promotion_id"),
    promotion_type: promotionType,
    value: promotionValue,
  };
}

export async function publishPromotionCommand(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
  input: PricingCommandInput,
): Promise<{ readonly replayed: boolean; readonly result: Readonly<Record<string, unknown>> }> {
  requirePermission(context, "promotion.manage");
  requireOwner(context);
  assertFreshAuthorization(context, input.command_authorization_version);
  requireCommandLocation(context, input.command);
  const payload = readPublishPromotion(input.payload);
  const businessId = context.authorization.membership.business_id;

  return executeIdempotent(database, context, input.command, payload, async (executor) => {
    const unit = await executor.query(
      `SELECT 1
       FROM catalog.product_units pu
       JOIN catalog.products p
         ON p.business_id = pu.business_id AND p.id = pu.product_id
       WHERE pu.business_id = $1 AND pu.id = $2
         AND pu.status = 'ACTIVE' AND pu.can_sell = TRUE AND p.status = 'ACTIVE'`,
      [businessId, payload.product_unit_id],
    );
    if (unit.rows[0] === undefined) {
      throw new ApiError(
        404,
        "PROMOTION_PRODUCT_UNIT_NOT_FOUND",
        "Product Unit aktif untuk Promotion tidak ditemukan.",
      );
    }

    const now = new Date();
    if (new Date(payload.effective_to).getTime() <= now.getTime()) {
      throw new ApiError(
        409,
        "PROMOTION_WINDOW_EXPIRED",
        "Promotion tidak dapat dipublikasikan setelah waktu berakhir.",
      );
    }
    const status =
      new Date(payload.effective_from).getTime() <= now.getTime() ? "ACTIVE" : "SCHEDULED";
    const inserted = await executor.query<CreatedRow>(
      `INSERT INTO pricing.promotions (
         id, business_id, name, product_unit_id, promotion_type, value,
         min_qty, priority, effective_from, effective_to, status, created_by,
         created_at, updated_at, version
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
       )
       RETURNING created_at`,
      [
        payload.promotion_id,
        businessId,
        payload.name,
        payload.product_unit_id,
        payload.promotion_type,
        payload.value,
        payload.min_qty,
        payload.priority,
        payload.effective_from,
        payload.effective_to,
        status,
        context.authorization.user.id,
      ],
    );
    const createdAt = iso(inserted.rows[0]?.created_at ?? now);
    const result = {
      created_at: createdAt,
      effective_from: payload.effective_from,
      effective_to: payload.effective_to,
      min_qty: payload.min_qty,
      name: payload.name,
      id: payload.promotion_id,
      priority: payload.priority,
      product_unit_id: payload.product_unit_id,
      promotion_id: payload.promotion_id,
      promotion_type: payload.promotion_type,
      status,
      updated_at: createdAt,
      value: payload.value,
      version: "1",
      warnings: [] as readonly string[],
    } as const;
    await appendAuditEvent(executor, context, input.command, {
      action: "PROMOTION_PUBLISHED",
      after_data: result,
      entity_id: payload.promotion_id,
      entity_type: "promotion",
      ...(payload.owner_reason === null ? {} : { reason: payload.owner_reason }),
    });
    await appendChange(executor, context, input.command, {
      change_type: "UPSERT",
      entity_id: payload.promotion_id,
      entity_type: "promotion",
      entity_version: "1",
      payload: result,
    });
    return result;
  });
}
