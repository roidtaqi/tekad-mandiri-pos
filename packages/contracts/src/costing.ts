export interface CostEventDTO {
  readonly id: string;
  readonly business_id: string;
  readonly location_id: string;
  readonly product_id: string;
  readonly event_type: "INITIAL_COST" | "PURCHASE_COST" | "COST_RECONCILIATION" | "COGS_RECONCILIATION" | "MANUAL_COST_ADJUSTMENT" | "RETURN_COST_EFFECT" | "STOCK_VARIANCE_COST";
  readonly quantity_basis: string | null;
  readonly unit_cost_before: string | null;
  readonly unit_cost_after: string | null;
  readonly value_delta: string | null;
  readonly source_type: string;
  readonly source_id: string;
  readonly reason: string | null;
  readonly occurred_at: string;
  readonly actor_user_id: string | null;
  readonly correlation_id: string | null;
}

export interface ProductCostStateDTO {
  readonly business_id: string;
  readonly location_id: string;
  readonly product_id: string;
  readonly mwa_unit_cost: string | null;
  readonly last_valid_mwa_unit_cost: string | null;
  readonly latest_landed_unit_cost: string | null;
  readonly pricing_reference_unit_cost: string | null;
  readonly pricing_reference_source_type: string | null;
  readonly pricing_reference_source_id: string | null;
  readonly last_cost_event_id: string | null;
  readonly updated_at: string;
}

export interface CogsReconciliationDTO {
  readonly id: string;
  readonly business_id: string;
  readonly transaction_item_id: string;
  readonly original_cost_snapshot: string | null;
  readonly final_unit_cost: string;
  readonly quantity: string;
  readonly value_delta: string;
  readonly source_cost_event_id: string;
  readonly created_at: string;
}
