import { ActorContext, SqlExecutor } from "../core/context.js";

// Define local errors since there's no PurchasingError in contracts yet
export class PurchasingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "PurchasingError";
  }
}

export interface CreatePurchaseRequest {
  readonly purchase_id: string;
  readonly location_id: string;
  readonly supplier_id: string;
  readonly purchase_number: string;
  readonly notes: string | null;
}

export interface CreatePurchaseResult {
  readonly purchase_id: string;
  readonly version: string;
}

export async function createPurchaseDraft(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CreatePurchaseRequest
): Promise<CreatePurchaseResult> {
  if (!ctx.permissions.has("purchase.create")) {
    throw new PurchasingError("PERMISSION_DENIED", "Requires purchase.create permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO purchasing.purchases (
        id, business_id, location_id, supplier_id, purchase_number, status, integrity_status, payment_status, purchase_date, created_by, created_at, updated_at, version
      )
      VALUES (
        $1, $2, $3, $4, $5, 'DRAFT', 'CLEAR', 'UNPAID', CURRENT_DATE, $6, NOW(), NOW(), 1
      )
      RETURNING version`,
      [req.purchase_id, ctx.business_id, req.location_id, req.supplier_id, req.purchase_number, ctx.user_id]
    );

    return {
      purchase_id: req.purchase_id,
      version: res.rows[0].version
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "purchases_number_unique") {
      throw new PurchasingError("VALIDATION_ERROR", "Purchase number must be unique", "purchase_number");
    }
    if (err.code === "23503" && err.constraint === "purchases_supplier_id_fkey") {
      throw new PurchasingError("ENTITY_NOT_FOUND", "Supplier not found", "supplier_id");
    }
    throw err;
  }
}
