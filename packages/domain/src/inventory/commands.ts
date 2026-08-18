import { ActorContext, SqlExecutor } from "../core/context.js";

export class InventoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

export interface PostStockAdjustmentRequest {
  readonly adjustment_id: string;
  readonly location_id: string;
  readonly adjustment_number: string;
  readonly direction: "IN" | "OUT";
  readonly reason_code: string;
  readonly notes?: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly product_id: string;
    readonly source_unit_id: string;
    readonly qty: string;
    readonly conversion_snapshot: string;
    readonly base_qty: string;
    readonly cost_snapshot?: string;
  }>;
}

export interface PostStockAdjustmentResult {
  readonly adjustment_id: string;
}

export async function postStockAdjustment(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: PostStockAdjustmentRequest
): Promise<PostStockAdjustmentResult> {
  if (!ctx.permissions.has("inventory.adjust")) {
    throw new InventoryError("PERMISSION_DENIED", "Requires inventory.adjust permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO inventory.stock_adjustments (
        id, business_id, location_id, adjustment_number, direction, reason_code, notes, created_by, created_at, posted_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
      )
      RETURNING id`,
      [req.adjustment_id, ctx.business_id, req.location_id, req.adjustment_number, req.direction, req.reason_code, req.notes || null, ctx.user_id]
    );

    for (const item of req.items) {
      await executor.query(
        `INSERT INTO inventory.stock_adjustment_items (
          id, adjustment_id, product_id, source_unit_id, qty, conversion_snapshot, base_qty, cost_snapshot
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )`,
        [item.id, req.adjustment_id, item.product_id, item.source_unit_id, item.qty, item.conversion_snapshot, item.base_qty, item.cost_snapshot || null]
      );
    }

    return {
      adjustment_id: res.rows[0].id
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "stock_adjustments_pkey") {
      throw new InventoryError("VALIDATION_ERROR", "Adjustment already exists", "adjustment_id");
    }
    throw err;
  }
}

export interface CreateOpnameSessionRequest {
  readonly session_id: string;
  readonly location_id: string;
  readonly opname_number: string;
  readonly scope_type: string;
}

export interface CreateOpnameSessionResult {
  readonly session_id: string;
}

export async function createOpnameSession(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CreateOpnameSessionRequest
): Promise<CreateOpnameSessionResult> {
  if (!ctx.permissions.has("inventory.opname")) {
    throw new InventoryError("PERMISSION_DENIED", "Requires inventory.opname permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO inventory.opname_sessions (
        id, business_id, location_id, opname_number, status, scope_type, created_by, created_at, version
      )
      VALUES (
        $1, $2, $3, $4, 'DRAFT', $5, $6, NOW(), 1
      )
      RETURNING id`,
      [req.session_id, ctx.business_id, req.location_id, req.opname_number, req.scope_type, ctx.user_id]
    );

    return {
      session_id: res.rows[0].id
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "opname_sessions_pkey") {
      throw new InventoryError("VALIDATION_ERROR", "Opname session already exists", "session_id");
    }
    throw err;
  }
}
