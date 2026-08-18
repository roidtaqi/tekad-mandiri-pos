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

export interface ReceivePurchaseRequest {
  readonly receipt_id: string;
  readonly purchase_id: string;
  readonly location_id: string;
  readonly receipt_number: string;
  readonly notes: string | null;
}

export interface ReceivePurchaseResult {
  readonly receipt_id: string;
}

export async function receivePurchase(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: ReceivePurchaseRequest
): Promise<ReceivePurchaseResult> {
  if (!ctx.permissions.has("purchase.receive")) {
    throw new PurchasingError("PERMISSION_DENIED", "Requires purchase.receive permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO purchasing.receipts (
        id, business_id, location_id, purchase_id, receipt_number, received_at, received_by, notes, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, NOW(), $6, $7, NOW()
      )
      RETURNING id`,
      [req.receipt_id, ctx.business_id, req.location_id, req.purchase_id, req.receipt_number, ctx.user_id, req.notes]
    );

    return {
      receipt_id: res.rows[0].id
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "receipts_number_unique") {
      throw new PurchasingError("VALIDATION_ERROR", "Receipt number must be unique", "receipt_number");
    }
    throw err;
  }
}

export interface CapturePurchaseInvoiceRequest {
  readonly invoice_id: string;
  readonly purchase_id: string;
  readonly supplier_invoice_number: string | null;
  readonly invoice_date: string | null;
  readonly subtotal: string;
  readonly item_discount_total: string;
  readonly global_discount_total: string;
  readonly tax_total: string;
  readonly acquisition_charge_total: string;
  readonly grand_total: string;
}

export interface CapturePurchaseInvoiceResult {
  readonly invoice_id: string;
  readonly version: string;
}

export async function capturePurchaseInvoice(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CapturePurchaseInvoiceRequest
): Promise<CapturePurchaseInvoiceResult> {
  if (!ctx.permissions.has("purchase.invoice")) {
    throw new PurchasingError("PERMISSION_DENIED", "Requires purchase.invoice permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO purchasing.purchase_invoices (
        id, purchase_id, supplier_invoice_number, invoice_date, subtotal, item_discount_total, global_discount_total, tax_total, acquisition_charge_total, grand_total, captured_at, captured_by, version
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, 1
      )
      RETURNING version`,
      [
        req.invoice_id,
        req.purchase_id,
        req.supplier_invoice_number,
        req.invoice_date,
        req.subtotal,
        req.item_discount_total,
        req.global_discount_total,
        req.tax_total,
        req.acquisition_charge_total,
        req.grand_total,
        ctx.user_id
      ]
    );

    return {
      invoice_id: req.invoice_id,
      version: res.rows[0].version
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "purchase_invoices_purchase_unique") {
      throw new PurchasingError("VALIDATION_ERROR", "Purchase already has an invoice");
    }
    throw err;
  }
}

export interface CreateSupplierReturnRequest {
  readonly return_id: string;
  readonly purchase_id: string;
  readonly location_id: string;
  readonly supplier_id: string;
  readonly return_number: string;
  readonly reason: string;
}

export interface CreateSupplierReturnResult {
  readonly return_id: string;
}

export async function createSupplierReturn(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: CreateSupplierReturnRequest
): Promise<CreateSupplierReturnResult> {
  if (!ctx.permissions.has("purchase.return")) {
    throw new PurchasingError("PERMISSION_DENIED", "Requires purchase.return permission");
  }

  try {
    const res = await executor.query(
      `INSERT INTO purchasing.supplier_returns (
        id, business_id, location_id, supplier_id, purchase_id, return_number, status, settlement_status, reason, created_by, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, 'DRAFT', 'PENDING_CREDIT', $7, $8, NOW()
      )
      RETURNING id`,
      [req.return_id, ctx.business_id, req.location_id, req.supplier_id, req.purchase_id, req.return_number, req.reason, ctx.user_id]
    );

    return {
      return_id: res.rows[0].id
    };
  } catch (err: any) {
    if (err.code === "23505" && err.constraint === "supplier_returns_number_unique") {
      throw new PurchasingError("VALIDATION_ERROR", "Return number must be unique", "return_number");
    }
    throw err;
  }
}

export interface PostPurchaseRequest {
  readonly purchase_id: string;
}

export interface PostPurchaseResult {
  readonly purchase_id: string;
  readonly version: string;
}

export async function postPurchase(
  ctx: ActorContext,
  executor: SqlExecutor,
  req: PostPurchaseRequest
): Promise<PostPurchaseResult> {
  if (!ctx.permissions.has("purchase.post")) {
    throw new PurchasingError("PERMISSION_DENIED", "Requires purchase.post permission");
  }

  // A complete post requires domain verification, status transitions, stock movements.
  // For now, we update the status in the DB directly.
  const res = await executor.query(
    `UPDATE purchasing.purchases 
     SET status = 'POSTED', posted_at = NOW(), version = version + 1
     WHERE id = $1 AND status IN ('READY_TO_POST', 'RECEIVED')
     RETURNING version`,
    [req.purchase_id]
  );

  if (res.rowCount === 0) {
     throw new PurchasingError("VALIDATION_ERROR", "Purchase cannot be posted or not found");
  }

  return {
    purchase_id: req.purchase_id,
    version: res.rows[0].version
  };
}
