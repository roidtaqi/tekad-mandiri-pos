import type { OfflineAuthorizationGrant } from "@kastur/contracts";

import type { TrustedOfflineClock } from "./types.js";

export const CLOCK_ROLLBACK_TOLERANCE_MS = 120_000;

export type TrustedClockErrorCode =
  | "CLOCK_UNTRUSTED"
  | "OFFLINE_AUTHORIZATION_EXPIRED";

export class TrustedClockError extends Error {
  constructor(
    public readonly code: TrustedClockErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TrustedClockError";
  }
}

function milliseconds(value: string, field: string): number {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    throw new TrustedClockError("CLOCK_UNTRUSTED", `${field} tidak valid.`);
  }
  return parsed;
}

export function createTrustedOfflineClock(
  grant: OfflineAuthorizationGrant,
  localTime: string,
): TrustedOfflineClock {
  const issuedAt = milliseconds(grant.issued_at, "issued_at");
  const validUntil = milliseconds(grant.offline_valid_until, "offline_valid_until");
  milliseconds(localTime, "local_time_at_sync");
  if (issuedAt >= validUntil) {
    throw new TrustedClockError(
      "CLOCK_UNTRUSTED",
      "Rentang otorisasi offline tidak valid.",
    );
  }
  return {
    status: "TRUSTED",
    reference_server_time: new Date(issuedAt).toISOString(),
    reference_local_time: new Date(localTime).toISOString(),
    last_local_time: new Date(localTime).toISOString(),
    last_server_estimate: new Date(issuedAt).toISOString(),
  };
}

export function advanceTrustedOfflineClock(
  clock: TrustedOfflineClock,
  grant: OfflineAuthorizationGrant,
  localNow: Date,
): { readonly occurredAt: string; readonly clock: TrustedOfflineClock } {
  if (clock.status !== "TRUSTED") {
    throw new TrustedClockError(
      "CLOCK_UNTRUSTED",
      "Jam perangkat sudah ditandai tidak tepercaya. Sambungkan dan masuk kembali.",
    );
  }
  const localNowMs = localNow.getTime();
  const issuedAt = milliseconds(grant.issued_at, "issued_at");
  const validUntil = milliseconds(grant.offline_valid_until, "offline_valid_until");
  const referenceServer = milliseconds(
    clock.reference_server_time,
    "reference_server_time",
  );
  const referenceLocal = milliseconds(clock.reference_local_time, "reference_local_time");
  const lastLocal = milliseconds(clock.last_local_time, "last_local_time");
  const lastEstimate = milliseconds(
    clock.last_server_estimate,
    "last_server_estimate",
  );
  if (
    !Number.isFinite(localNowMs) ||
    referenceServer !== issuedAt ||
    localNowMs < referenceLocal - CLOCK_ROLLBACK_TOLERANCE_MS ||
    localNowMs < lastLocal - CLOCK_ROLLBACK_TOLERANCE_MS
  ) {
    throw new TrustedClockError(
      "CLOCK_UNTRUSTED",
      "Jam perangkat mundur secara material. Operasi offline dikunci sampai verifikasi online.",
    );
  }

  const offsetEstimate = referenceServer + (localNowMs - referenceLocal);
  const trustedEstimate = Math.max(issuedAt, lastEstimate, offsetEstimate);
  if (trustedEstimate > validUntil) {
    throw new TrustedClockError(
      "OFFLINE_AUTHORIZATION_EXPIRED",
      "Izin offline sudah kedaluwarsa. Sambungkan perangkat untuk masuk kembali.",
    );
  }
  const occurredAt = new Date(trustedEstimate).toISOString();
  return {
    occurredAt,
    clock: {
      ...clock,
      last_local_time: localNow.toISOString(),
      last_server_estimate: occurredAt,
    },
  };
}
