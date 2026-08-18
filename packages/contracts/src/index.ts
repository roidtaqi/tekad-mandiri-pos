/** Public path for the M0 system health contract. */
export const SYSTEM_HEALTH_PATH = "/api/v1/system/health" as const;

/** Minimal, intentionally non-sensitive health response. */
export interface SystemHealthResponse {
  readonly status: "ok";
}

export * from "./auth.js";
export * from "./catalog.js";
export * from "./pos-catalog.js";
export * from "./pos-pricing.js";
export * from "./sync.js";
export * from "./cash.js";
export * from "./purchasing.js";
export * from "./costing.js";
