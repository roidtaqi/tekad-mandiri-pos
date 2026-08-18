import type { AuthContextResponse } from "./auth.js";

export interface SyncPushRequest {
  batch_id: string;
  client_schema_version: number;
  commands: Array<{
    command_id: string;
    command_type: string;
    occurred_at: string;
    location_id?: string;
    device_id: string;
    authorization_version: number;
    correlation_id: string;
    payload: unknown;
  }>;
}

export interface SyncPushResponse {
  accepted_commands: string[];
  rejected_commands: Array<{
    command_id: string;
    error_code: string;
    message: string;
  }>;
}

export interface SyncPullRequest {
  device_id: string;
  cursor: string;
  limit?: number;
}

export interface SyncPullChange {
  sequence: string;
  entity_type: string;
  entity_id: string;
  change_type: "UPSERT" | "DEACTIVATE" | "EVENT" | "INVALIDATE";
  entity_version: number | null;
  occurred_at: string;
  payload: unknown;
}

export interface SyncPullResponse {
  changes: SyncPullChange[];
  next_cursor: string;
  has_more: boolean;
  server_time: string;
}

export interface SyncAckRequest {
  device_id: string;
  last_applied_sequence: string;
}

export interface SyncBootstrapResponse {
  bootstrap_version: number;
  server_time: string;
  business: unknown;
  location: unknown;
  terminal: unknown;
  authorization: AuthContextResponse;
  settings: unknown;
  products: unknown[];
  product_units: unknown[];
  barcodes: unknown[];
  published_price_versions: unknown[];
  published_price_tiers: unknown[];
  promotions: unknown[];
  payment_methods: unknown[];
  stock_balances: unknown[];
  sync_cursor: string;
}
