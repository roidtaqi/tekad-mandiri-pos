import { ActorContext, SqlExecutor } from "../core/context.js";

import { PricingError } from "@kastur/contracts";

export interface ProposePriceSetRequest {
  readonly price_set_id: string;
  readonly name: string;
  readonly notes?: string;
}

export interface ProposePriceSetResult {
  readonly price_set_id: string;
}

export async function proposePriceSet(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: ProposePriceSetRequest
): Promise<ProposePriceSetResult> {
  if (!ctx.permissions.has("pricing.propose")) {
    throw new PricingError("PERMISSION_DENIED", "Requires pricing.propose permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO pricing.price_sets (
        id, business_id, name, source_type, status, proposed_by, notes, created_at, updated_at, version
      )
      VALUES (
        $1, $2, $3, 'MANUAL', 'DRAFT', $4, $5, NOW(), NOW(), 1
      )
      RETURNING id`,
      [req.price_set_id, ctx.business_id, req.name, ctx.user_id, req.notes || null]
    );

    return {
      price_set_id: res.rows[0].id
    };
  } catch (err: any) {
    if (err.code === "23505") {
      throw new PricingError("VALIDATION_ERROR", "Price set already exists", "price_set_id");
    }
    throw err;
  }
}

export interface ApprovePriceSetRequest {
  readonly price_set_id: string;
}

export interface ApprovePriceSetResult {
  readonly price_set_id: string;
}

export async function approvePriceSet(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: ApprovePriceSetRequest
): Promise<ApprovePriceSetResult> {
  if (!ctx.permissions.has("pricing.approve")) {
    throw new PricingError("PERMISSION_DENIED", "Requires pricing.approve permission");
  }

  const res = await executor.query(
    `UPDATE pricing.price_sets 
     SET status = 'APPROVED', approved_by = $2, approved_at = NOW(), updated_at = NOW(), version = version + 1
     WHERE id = $1 AND business_id = $3 AND status IN ('DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL')
     RETURNING id`,
    [req.price_set_id, ctx.user_id, ctx.business_id]
  );

  if (res.rowCount === 0) {
    throw new PricingError("VALIDATION_ERROR", "Price set cannot be approved or not found");
  }

  return {
    price_set_id: req.price_set_id
  };
}
