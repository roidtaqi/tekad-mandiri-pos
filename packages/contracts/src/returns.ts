export interface CustomerReturnDTO {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly return_number: string;
  readonly original_transaction_id: string;
  readonly customer_id: string | null;
  readonly status: "DRAFT" | "COMPLETED" | "CANCELLED";
  readonly refund_status: "NONE" | "PENDING" | "PARTIAL" | "COMPLETED";
  readonly return_total: string;
  readonly refunded_total: string;
  readonly reason_code: string;
  readonly notes: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly completed_at: string | null;
  readonly version: number;
}

export interface ReturnItemDTO {
  readonly id: string;
  readonly customer_return_id: string;
  readonly original_transaction_item_id: string;
  readonly product_id: string;
  readonly product_unit_id: string;
  readonly return_qty: string;
  readonly base_return_qty: string;
  readonly refund_unit_price: string;
  readonly refund_total: string;
  readonly disposition: "RESTOCK" | "NOT_RESTOCKED";
  readonly posted_movement_id: string | null;
  readonly reason_code: string;
  readonly condition_notes: string | null;
}

export interface RefundDTO {
  readonly id: string;
  readonly customer_return_id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly amount: string;
  readonly payment_method_id: string;
  readonly status: "PENDING" | "PROCESSED" | "FAILED" | "CANCELLED";
  readonly processor_reference: string | null;
  readonly processed_at: string | null;
  readonly processed_by: string | null;
  readonly created_at: string;
  readonly version: number;
}
