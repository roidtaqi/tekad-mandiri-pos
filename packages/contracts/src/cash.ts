export type ShiftStatus = "OPEN" | "CLOSING" | "CLOSED" | "FORCED_CLOSED";
export type ShiftReviewStatus = "UNREVIEWED" | "REVIEWED" | "REQUIRES_FOLLOW_UP";
export type CashMovementType = "OPENING_BALANCE" | "CASH_SALE" | "CASH_IN" | "CASH_OUT" | "CASH_REFUND" | "CASH_REVERSAL" | "SAFE_DROP";
export type CashMovementDirection = "IN" | "OUT";
export type CashVarianceType = "MATCHED" | "SHORT" | "OVER";

export interface ShiftContext {
  readonly shift_id: string;
  readonly terminal_id: string;
  readonly cashier_user_id: string;
  readonly business_id: string;
  readonly location_id: string;
}

export interface CashMovementDTO {
  readonly id: string;
  readonly shift_id: string;
  readonly movement_type: CashMovementType;
  readonly amount: string; // money value string
  readonly direction: CashMovementDirection;
  readonly source_type: string;
  readonly source_id: string;
  readonly reason_code: string | null;
  readonly notes: string | null;
  readonly occurred_at: string;
  readonly actor_user_id: string;
  readonly correlation_id: string | null;
}

export interface ShiftDTO {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly terminal_id: string;
  readonly cashier_user_id: string;
  readonly shift_number: string;
  readonly status: ShiftStatus;
  readonly opening_cash: string;
  readonly opened_at: string;
  readonly closing_started_at: string | null;
  readonly closed_at: string | null;
  readonly review_status: ShiftReviewStatus;
}

export interface ShiftClosingSnapshotDTO {
  readonly id: string;
  readonly shift_id: string;
  readonly opening_cash: string;
  readonly cash_sales: string;
  readonly cash_in: string;
  readonly cash_out: string;
  readonly cash_refunds: string;
  readonly expected_cash: string;
  readonly actual_cash: string | null;
  readonly actual_cash_verified: boolean;
  readonly variance: string | null;
  readonly variance_type: CashVarianceType | null;
  readonly reason: string | null;
  readonly transaction_count: number;
  readonly void_count: number;
  readonly refund_count: number;
  readonly created_at: string;
  readonly created_by: string;
}

export interface OpenShiftCommand {
  readonly terminal_id: string;
  readonly opening_cash: string;
}

export interface RecordCashMovementCommand {
  readonly shift_id: string;
  readonly movement_type: "CASH_IN" | "CASH_OUT" | "SAFE_DROP";
  readonly amount: string;
  readonly reason_code: string;
  readonly notes: string | null;
}

export interface BeginShiftClosingCommand {
  readonly shift_id: string;
}

export interface CompleteShiftClosingCommand {
  readonly shift_id: string;
  readonly actual_cash: string;
  readonly variance_reason: string | null;
}

export interface CashReconciliationDTO {
  readonly id: string;
  readonly shift_id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly late_movement_id: string;
  readonly late_movement_type: CashMovementType;
  readonly late_amount: string;
  readonly new_expected_cash: string;
  readonly adjusted_variance: string;
  readonly adjusted_variance_type: CashVarianceType;
  readonly reconciliation_notes: string | null;
  readonly created_at: string;
}
