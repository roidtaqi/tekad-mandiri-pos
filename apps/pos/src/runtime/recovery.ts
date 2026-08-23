import type { LocalOutboxSummary } from "@kastur/local-db";
import type { PushRunResult } from "@kastur/sync-client";

export interface RecoveryDrainResult extends PushRunResult {
  readonly summary: LocalOutboxSummary;
}

/**
 * Drains successive outbox claim windows before deciding whether the only
 * historical bearer/cache binding may be discarded. A leased or backoff row
 * intentionally keeps the credential in RECOVERY_ONLY state.
 */
export async function drainRecoveryOutbox(
  pushPending: () => Promise<PushRunResult>,
  getSummary: () => Promise<LocalOutboxSummary>,
  maxBatches = 100,
): Promise<RecoveryDrainResult> {
  const total = {
    claimed: 0,
    accepted: 0,
    accepted_with_review: 0,
    failed_retryable: 0,
    requires_review: 0,
  };
  let summary = await getSummary();
  for (let batch = 0; batch < maxBatches && summary.unresolved > 0; batch += 1) {
    const page = await pushPending();
    total.claimed += page.claimed;
    total.accepted += page.accepted;
    total.accepted_with_review += page.accepted_with_review;
    total.failed_retryable += page.failed_retryable;
    total.requires_review += page.requires_review;
    summary = await getSummary();
    if (
      page.claimed === 0 ||
      page.failed_retryable > 0 ||
      page.requires_review > 0
    ) {
      break;
    }
  }
  return { ...total, summary };
}

export function canDiscardHistoricalCredential(summary: LocalOutboxSummary): boolean {
  return summary.unresolved === 0;
}
