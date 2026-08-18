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
