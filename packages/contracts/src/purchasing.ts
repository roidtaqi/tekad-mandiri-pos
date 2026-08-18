export interface PurchaseDTO {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly supplier_id: string;
  readonly purchase_number: string;
  readonly supplier_invoice_number: string | null;
  readonly status: "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "READY_TO_POST" | "POSTED" | "CANCELLED";
  readonly integrity_status: "CLEAR" | "WARNING" | "REVIEW_REQUIRED" | "DISPUTED" | "RESOLVED";
  readonly payment_status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  readonly purchase_date: string;
  readonly ordered_at: string | null;
  readonly received_at: string | null;
  readonly posted_at: string | null;
  readonly ready_to_post_at: string | null;
  readonly notes: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: string;
}

export interface PurchaseItemDTO {
  readonly id: string;
  readonly purchase_id: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly product_name_snapshot: string;
  readonly unit_name_snapshot: string;
  readonly conversion_snapshot: string;
  readonly expected_qty: string;
  readonly agreed_unit_price: string | null;
  readonly agreed_discount_amount: string;
  readonly agreed_free_qty: string;
  readonly invoice_unit_price: string | null;
  readonly invoice_discount_amount: string;
  readonly invoice_free_qty: string;
  readonly final_landed_cost_per_base_unit: string | null;
  readonly created_at: string;
}

export interface PurchaseReceiptDTO {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly purchase_id: string;
  readonly receipt_number: string;
  readonly received_at: string;
  readonly received_by: string;
  readonly notes: string | null;
  readonly created_at: string;
}

export interface PurchaseReceiptItemDTO {
  readonly id: string;
  readonly receipt_id: string;
  readonly purchase_item_id: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly conversion_snapshot: string;
  readonly received_qty: string;
  readonly accepted_qty: string;
  readonly rejected_qty: string;
  readonly free_qty_received: string;
  readonly base_qty_accepted: string;
  readonly rejection_reason: string | null;
  readonly created_at: string;
}

export interface PurchaseInvoiceDTO {
  readonly id: string;
  readonly purchase_id: string;
  readonly supplier_invoice_number: string | null;
  readonly invoice_date: string | null;
  readonly subtotal: string;
  readonly item_discount_total: string;
  readonly global_discount_total: string;
  readonly tax_total: string;
  readonly acquisition_charge_total: string;
  readonly grand_total: string;
  readonly captured_at: string;
  readonly captured_by: string;
  readonly version: string;
}

export interface PurchaseInvoiceItemDTO {
  readonly id: string;
  readonly invoice_id: string;
  readonly purchase_item_id: string;
  readonly invoiced_qty: string;
  readonly unit_price: string;
  readonly item_discount_amount: string;
  readonly tax_amount: string;
  readonly free_qty: string;
}

export interface PurchaseChargeDTO {
  readonly id: string;
  readonly purchase_id: string;
  readonly type: "FREIGHT" | "HANDLING" | "NON_RECOVERABLE_TAX" | "OTHER_DIRECT_ACQUISITION";
  readonly description: string | null;
  readonly amount: string;
  readonly allocation_method: "BY_ITEM_VALUE" | "BY_QUANTITY" | "BY_WEIGHT" | "MANUAL";
  readonly created_at: string;
}

export interface PurchasePaymentDTO {
  readonly id: string;
  readonly purchase_id: string;
  readonly amount: string;
  readonly method: string;
  readonly reference: string | null;
  readonly paid_at: string;
  readonly recorded_by: string;
  readonly created_at: string;
}

export interface PurchaseCorrectionDTO {
  readonly id: string;
  readonly purchase_id: string;
  readonly reason: string;
  readonly correction_type: string;
  readonly before_snapshot: Record<string, unknown>;
  readonly after_snapshot: Record<string, unknown>;
  readonly created_by: string;
  readonly created_at: string;
  readonly correlation_id: string;
}

export interface SupplierReturnDTO {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly supplier_id: string;
  readonly purchase_id: string;
  readonly return_number: string;
  readonly status: string;
  readonly settlement_status: "PENDING_CREDIT" | "CREDIT_RECEIVED" | "REPLACED" | "REFUNDED" | "WRITTEN_OFF";
  readonly reason: string;
  readonly created_by: string;
  readonly created_at: string;
  readonly resolved_at: string | null;
}

export interface SupplierReturnItemDTO {
  readonly id: string;
  readonly supplier_return_id: string;
  readonly purchase_item_id: string;
  readonly receipt_item_id: string | null;
  readonly product_id: string;
  readonly qty: string;
  readonly base_qty: string;
  readonly original_landed_cost_per_base_unit: string;
  readonly reason: string;
}
