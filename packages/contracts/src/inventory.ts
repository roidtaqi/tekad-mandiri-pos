export interface StockAdjustmentDTO {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly adjustment_number: string;
  readonly direction: "IN" | "OUT";
  readonly reason_code: string;
  readonly notes: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly posted_at: string;
}

export interface StockAdjustmentItemDTO {
  readonly id: string;
  readonly adjustment_id: string;
  readonly product_id: string;
  readonly source_unit_id: string;
  readonly qty: string;
  readonly conversion_snapshot: string;
  readonly base_qty: string;
  readonly cost_snapshot: string | null;
}

export interface OpnameSessionDTO {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly opname_number: string;
  readonly status: "DRAFT" | "COUNTING" | "REVIEW" | "POSTED" | "CANCELLED";
  readonly scope_type: string;
  readonly created_by: string;
  readonly started_at: string | null;
  readonly posted_at: string | null;
  readonly cancelled_at: string | null;
  readonly created_at: string;
  readonly version: number;
}

export interface OpnameItemDTO {
  readonly id: string;
  readonly opname_session_id: string;
  readonly product_id: string;
  readonly system_qty_at_count: string | null;
  readonly physical_qty: string | null;
  readonly variance_qty: string | null;
  readonly counted_at: string | null;
  readonly counted_by: string | null;
  readonly count_revision: number;
  readonly recount_recommended: boolean;
  readonly posted_movement_id: string | null;
}
