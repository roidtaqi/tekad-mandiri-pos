import { ActorContext, SqlExecutor } from "../core/context.js";

export class ReturnsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "ReturnsError";
  }
}

export interface CreateCustomerReturnRequest {
  readonly return_id: string;
  readonly location_id: string;
  readonly return_number: string;
  readonly original_transaction_id: string;
  readonly customer_id?: string;
  readonly reason_code: string;
  readonly return_total: string;
  readonly notes?: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly original_transaction_item_id: string;
    readonly product_id: string;
    readonly product_unit_id: string;
    readonly return_qty: string;
    readonly base_return_qty: string;
    readonly refund_unit_price: string;
    readonly refund_total: string;
    readonly disposition: "RESTOCK" | "NOT_RESTOCKED";
    readonly reason_code: string;
    readonly condition_notes?: string;
  }>;
}

export interface CreateCustomerReturnResult {
  readonly return_id: string;
}

export async function createCustomerReturn(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CreateCustomerReturnRequest
): Promise<CreateCustomerReturnResult> {
  if (!ctx.permissions.has("transaction.return")) {
    throw new ReturnsError("PERMISSION_DENIED", "Requires transaction.return permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO returns.customer_returns (
        id, business_id, location_id, return_number, original_transaction_id, customer_id, status, refund_status, return_total, refunded_total, reason_code, notes, created_by, created_at, version
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, 'DRAFT', 'PENDING', $7, 0, $8, $9, $10, NOW(), 1
      )
      RETURNING id`,
      [req.return_id, ctx.business_id, req.location_id, req.return_number, req.original_transaction_id, req.customer_id || null, req.return_total, req.reason_code, req.notes || null, ctx.user_id]
    );

    for (const item of req.items) {
      await executor.query(
        `INSERT INTO returns.return_items (
          id, customer_return_id, original_transaction_item_id, product_id, product_unit_id, return_qty, base_return_qty, refund_unit_price, refund_total, disposition, reason_code, condition_notes
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )`,
        [item.id, req.return_id, item.original_transaction_item_id, item.product_id, item.product_unit_id, item.return_qty, item.base_return_qty, item.refund_unit_price, item.refund_total, item.disposition, item.reason_code, item.condition_notes || null]
      );
    }

    return {
      return_id: res.rows[0].id
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "customer_returns_pkey") {
      throw new ReturnsError("VALIDATION_ERROR", "Return already exists", "return_id");
    }
    throw err;
  }
}

export interface CompleteCustomerReturnRequest {
  readonly return_id: string;
}

export interface CompleteCustomerReturnResult {
  readonly return_id: string;
}

export async function completeCustomerReturn(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CompleteCustomerReturnRequest
): Promise<CompleteCustomerReturnResult> {
  if (!ctx.permissions.has("transaction.return")) {
    throw new ReturnsError("PERMISSION_DENIED", "Requires transaction.return permission");
  }

  const res = await executor.query(
    `UPDATE returns.customer_returns 
     SET status = 'COMPLETED', completed_at = NOW(), version = version + 1
     WHERE id = $1 AND business_id = $2 AND status = 'DRAFT'
     RETURNING id`,
    [req.return_id, ctx.business_id]
  );

  if (res.rowCount === 0) {
    throw new ReturnsError("VALIDATION_ERROR", "Return cannot be completed or not found");
  }

  return {
    return_id: req.return_id
  };
}
