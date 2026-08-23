import { ActorContext, SqlExecutor } from "../core/context.js";

export class CostingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "CostingError";
  }
}

export interface RecordInitialCostRequest {
  readonly cost_event_id: string;
  readonly location_id: string;
  readonly product_id: string;
  readonly unit_cost: string;
}

export interface RecordInitialCostResult {
  readonly cost_event_id: string;
}

export async function recordInitialCost(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: RecordInitialCostRequest
): Promise<RecordInitialCostResult> {
  if (!ctx.permissions.has("costing.adjust")) {
    throw new CostingError("PERMISSION_DENIED", "Requires costing.adjust permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO costing.cost_events (
        id, business_id, location_id, product_id, event_type, quantity_basis, unit_cost_before, unit_cost_after, value_delta, source_type, source_id, occurred_at, actor_user_id
      )
      VALUES (
        $1, $2, $3, $4, 'INITIAL_COST', 1, 0, $5, $5, 'MANUAL', $1, NOW(), $6
      )
      RETURNING id`,
      [req.cost_event_id, ctx.business_id, req.location_id, req.product_id, req.unit_cost, ctx.user_id]
    );
    
    await executor.query(
      `INSERT INTO costing.product_cost_states (
        business_id, location_id, product_id, mwa_unit_cost, last_valid_mwa_unit_cost,
        latest_landed_unit_cost, pricing_reference_unit_cost,
        pricing_reference_source_type, pricing_reference_source_id,
        cost_status, cost_source_type, cost_source_id,
        last_cost_event_id, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $4, $4, $4, 'INITIAL_COST', $5,
        'FINAL', 'INITIAL_COST', $5, $5, NOW()
      )
      ON CONFLICT (business_id, location_id, product_id) DO UPDATE SET
        mwa_unit_cost = EXCLUDED.mwa_unit_cost,
        last_valid_mwa_unit_cost = EXCLUDED.last_valid_mwa_unit_cost,
        latest_landed_unit_cost = EXCLUDED.latest_landed_unit_cost,
        pricing_reference_unit_cost = EXCLUDED.pricing_reference_unit_cost,
        pricing_reference_source_type = EXCLUDED.pricing_reference_source_type,
        pricing_reference_source_id = EXCLUDED.pricing_reference_source_id,
        cost_status = EXCLUDED.cost_status,
        cost_source_type = EXCLUDED.cost_source_type,
        cost_source_id = EXCLUDED.cost_source_id,
        last_cost_event_id = EXCLUDED.last_cost_event_id,
        updated_at = EXCLUDED.updated_at
      `,
      [ctx.business_id, req.location_id, req.product_id, req.unit_cost, req.cost_event_id]
    );

    return {
      cost_event_id: res.rows[0].id
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "cost_events_pkey") {
      throw new CostingError("VALIDATION_ERROR", "Cost event already exists", "cost_event_id");
    }
    throw err;
  }
}

export interface ReconcileCogsRequest {
  readonly reconciliation_id: string;
  readonly transaction_item_id: string;
  readonly final_unit_cost: string;
  readonly quantity: string;
  readonly value_delta: string;
  readonly source_cost_event_id: string;
}

export interface ReconcileCogsResult {
  readonly reconciliation_id: string;
}

export async function reconcileCogs(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: ReconcileCogsRequest
): Promise<ReconcileCogsResult> {
  if (!ctx.permissions.has("costing.reconcile")) {
    throw new CostingError("PERMISSION_DENIED", "Requires costing.reconcile permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO costing.cogs_reconciliations (
        id, business_id, transaction_item_id, original_cost_snapshot, final_unit_cost, quantity, value_delta, source_cost_event_id, created_at
      )
      VALUES (
        $1, $2, $3, null, $4, $5, $6, $7, NOW()
      )
      RETURNING id`,
      [req.reconciliation_id, ctx.business_id, req.transaction_item_id, req.final_unit_cost, req.quantity, req.value_delta, req.source_cost_event_id]
    );

    return {
      reconciliation_id: res.rows[0].id
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "cogs_reconciliations_pkey") {
      throw new CostingError("VALIDATION_ERROR", "Reconciliation already exists", "reconciliation_id");
    }
    throw err;
  }
}
