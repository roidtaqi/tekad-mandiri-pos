import type { LocalOutboxSummary } from "@kastur/local-db";
import { describe, expect, it, vi } from "vitest";

import {
  canDiscardHistoricalCredential,
  drainRecoveryOutbox,
} from "./recovery.js";

function summary(overrides: Partial<LocalOutboxSummary>): LocalOutboxSummary {
  return {
    pending: 0,
    sending: 0,
    failed_retryable: 0,
    requires_review: 0,
    unresolved: 0,
    ...overrides,
  };
}

describe("controlled outbox recovery", () => {
  it("drains more than one default 25-command claim before releasing credentials", async () => {
    let unresolved = 30;
    const pushPending = vi.fn(async () => {
      const claimed = Math.min(25, unresolved);
      unresolved -= claimed;
      return {
        claimed,
        accepted: claimed,
        accepted_with_review: 0,
        failed_retryable: 0,
        requires_review: 0,
      };
    });

    const result = await drainRecoveryOutbox(
      pushPending,
      async () => summary({ pending: unresolved, unresolved }),
    );

    expect(pushPending).toHaveBeenCalledTimes(2);
    expect(result.accepted).toBe(30);
    expect(canDiscardHistoricalCredential(result.summary)).toBe(true);
  });

  it("retains recovery-only credentials while a crash lease is still SENDING", async () => {
    const pushPending = vi.fn(async () => ({
      claimed: 0,
      accepted: 0,
      accepted_with_review: 0,
      failed_retryable: 0,
      requires_review: 0,
    }));
    const result = await drainRecoveryOutbox(
      pushPending,
      async () => summary({ sending: 1, unresolved: 1 }),
    );

    expect(pushPending).toHaveBeenCalledTimes(1);
    expect(canDiscardHistoricalCredential(result.summary)).toBe(false);
  });

  it("blocks manual credential disposal whenever any outbox fact is unresolved", () => {
    expect(canDiscardHistoricalCredential(summary({ pending: 1, unresolved: 1 }))).toBe(false);
    expect(canDiscardHistoricalCredential(summary({ unresolved: 0 }))).toBe(true);
  });
});
