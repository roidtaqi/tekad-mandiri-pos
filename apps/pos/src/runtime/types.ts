import type { AuthContextResponse } from "@kastur/contracts";

export interface PosBusinessContext {
  readonly id: string;
  readonly name: string;
  readonly currency_code: string;
  readonly timezone: string;
}

export interface PosLocationContext {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface PosTerminalContext {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface PosSettingsContext {
  readonly language: string;
  readonly receipt_width: "58mm" | "80mm";
}

export interface PosPaymentMethodContext {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly is_cash: boolean;
  readonly offline_allowed: boolean;
}

export interface PosOperationalContext {
  readonly auth: AuthContextResponse;
  readonly business: PosBusinessContext;
  readonly location: PosLocationContext;
  readonly terminal: PosTerminalContext;
  readonly settings: PosSettingsContext;
  readonly payment_methods?: readonly PosPaymentMethodContext[];
  readonly source: "ONLINE" | "OFFLINE_CACHE";
}

export interface CachedPosSession {
  readonly cache_version: 3;
  readonly access_state: "ACTIVE" | "RECOVERY_ONLY";
  readonly recovery_cause:
    | "NONE"
    | "AUTHORITY_REVOKED"
    | "CLOCK_UNTRUSTED"
    | "LEGACY_CACHE";
  readonly cached_at: string;
  readonly credential_salt: string;
  readonly credential_verifier: string;
  readonly operational: Omit<PosOperationalContext, "source">;
  readonly trusted_clock: TrustedOfflineClock;
}

export interface TrustedOfflineClock {
  readonly status: "TRUSTED" | "UNTRUSTED";
  readonly reference_server_time: string;
  readonly reference_local_time: string;
  readonly last_local_time: string;
  readonly last_server_estimate: string;
}

export type RuntimeStatus =
  | "INITIALIZING"
  | "SIGNED_OUT"
  | "CONNECTING"
  | "READY"
  | "LOCKED"
  | "ERROR";

export type SyncStatus = "IDLE" | "SYNCING" | "OFFLINE" | "ERROR";

export interface RuntimeSyncState {
  readonly status: SyncStatus;
  readonly pendingCount: number;
  readonly retryableCount: number;
  readonly requiresReviewCount: number;
  readonly message: string;
  readonly lastSuccessAt: string | null;
}
