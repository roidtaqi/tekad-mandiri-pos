import { deriveQuickLockHash, generateQuickLockSalt } from "@kastur/auth-client";
import { isOfflineAuthorizationGrant } from "@kastur/contracts";

import {
  verifyOfflineOperationalContext,
  type OfflineAuthorizationVerification,
} from "./offline-authorization.js";
import {
  advanceTrustedOfflineClock,
  createTrustedOfflineClock,
  TrustedClockError,
} from "./trusted-clock.js";
import type { CachedPosSession, PosOperationalContext } from "./types.js";

export const POS_SESSION_BEARER_KEY = "kastur.pos.session-bearer";
export const POS_DEVICE_ID_KEY = "kastur.pos.device-id";
export const POS_TERMINAL_ID_KEY = "kastur.pos.terminal-id";
export const POS_CACHED_SESSION_KEY = "kastur.pos.cached-session.v3";
const LEGACY_POS_CACHED_SESSION_V2_KEY = "kastur.pos.cached-session.v2";
const LEGACY_POS_CACHED_SESSION_V1_KEY = "kastur.pos.cached-session.v1";

function browserLocalStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function browserSessionStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function getOrCreateDeviceId(): string {
  const storage = browserLocalStorage();
  const existing = storage?.getItem(POS_DEVICE_ID_KEY)?.trim();
  if (existing) return existing;
  const created = crypto.randomUUID();
  storage?.setItem(POS_DEVICE_ID_KEY, created);
  return created;
}

export function readTerminalId(): string {
  return browserLocalStorage()?.getItem(POS_TERMINAL_ID_KEY)?.trim() ?? "";
}

export function writeTerminalId(terminalId: string): void {
  browserLocalStorage()?.setItem(POS_TERMINAL_ID_KEY, terminalId.trim());
}

export function readSessionBearer(): string | null {
  return browserSessionStorage()?.getItem(POS_SESSION_BEARER_KEY) ?? null;
}

export function writeSessionBearer(value: string): void {
  browserSessionStorage()?.setItem(POS_SESSION_BEARER_KEY, value);
}

export function clearSessionBearer(): void {
  browserSessionStorage()?.removeItem(POS_SESSION_BEARER_KEY);
}

function hasCachedOperationalContext(record: Record<string, unknown>): boolean {
  const operational = record.operational;
  if (
    typeof operational !== "object" ||
    operational === null ||
    Array.isArray(operational)
  ) {
    return false;
  }
  const auth = (operational as Record<string, unknown>).auth;
  return (
    typeof auth === "object" &&
    auth !== null &&
    !Array.isArray(auth) &&
    isOfflineAuthorizationGrant(
      (auth as Record<string, unknown>).offline_authorization,
    )
  );
}

function hasCacheEnvelope(record: Record<string, unknown>): boolean {
  return (
    (record.access_state === "ACTIVE" || record.access_state === "RECOVERY_ONLY") &&
    new Set(["NONE", "AUTHORITY_REVOKED", "CLOCK_UNTRUSTED", "LEGACY_CACHE"]).has(
      String(record.recovery_cause),
    ) &&
    typeof record.cached_at === "string" &&
    typeof record.credential_salt === "string" &&
    typeof record.credential_verifier === "string" &&
    hasCachedOperationalContext(record)
  );
}

function isCachedSession(value: unknown): value is CachedPosSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const trustedClock = record.trusted_clock;
  return (
    record.cache_version === 3 &&
    hasCacheEnvelope(record) &&
    typeof trustedClock === "object" &&
    trustedClock !== null &&
    !Array.isArray(trustedClock) &&
    (() => {
      const clock = trustedClock as Record<string, unknown>;
      return (
        (clock.status === "TRUSTED" || clock.status === "UNTRUSTED") &&
        typeof clock.reference_server_time === "string" &&
        typeof clock.reference_local_time === "string" &&
        typeof clock.last_local_time === "string" &&
        typeof clock.last_server_estimate === "string"
      );
    })()
  );
}

function migrateLegacyV2(value: unknown): CachedPosSession | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.cache_version !== 2 || !hasCacheEnvelope(record)) return null;
  const operational = record.operational as CachedPosSession["operational"];
  const grant = operational.auth.offline_authorization;
  if (!isOfflineAuthorizationGrant(grant)) return null;
  return {
    cache_version: 3,
    access_state: "RECOVERY_ONLY",
    recovery_cause: "LEGACY_CACHE",
    cached_at: record.cached_at as string,
    credential_salt: record.credential_salt as string,
    credential_verifier: record.credential_verifier as string,
    operational,
    trusted_clock: createTrustedOfflineClock(grant, record.cached_at as string),
  };
}

export function readCachedSession(): CachedPosSession | null {
  const storage = browserLocalStorage();
  const raw = storage?.getItem(POS_CACHED_SESSION_KEY);
  if (!raw) return migrateLegacyCachedSession();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCachedSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function migrateLegacyCachedSession(): CachedPosSession | null {
  const storage = browserLocalStorage();
  const raw = storage?.getItem(LEGACY_POS_CACHED_SESSION_V2_KEY);
  if (!raw) return null;
  try {
    const migrated = migrateLegacyV2(JSON.parse(raw) as unknown);
    if (migrated === null) return null;
    storage?.setItem(POS_CACHED_SESSION_KEY, JSON.stringify(migrated));
    storage?.removeItem(LEGACY_POS_CACHED_SESSION_V2_KEY);
    return migrated;
  } catch {
    return null;
  }
}

export function readOrMigrateCachedSession(): CachedPosSession | null {
  return readCachedSession();
}

export async function cacheOperationalSession(
  bearer: string,
  operational: PosOperationalContext,
  deviceId: string,
  verification: OfflineAuthorizationVerification,
  cachedAt = new Date().toISOString(),
): Promise<CachedPosSession> {
  const grant = await verifyOfflineOperationalContext(
    operational,
    deviceId,
    operational.terminal.id,
    verification,
  );
  const credentialSalt = generateQuickLockSalt();
  const cached: CachedPosSession = {
    cache_version: 3,
    access_state: "ACTIVE",
    recovery_cause: "NONE",
    cached_at: cachedAt,
    credential_salt: credentialSalt,
    credential_verifier: await deriveQuickLockHash(
      JSON.stringify([bearer, grant.signature]),
      credentialSalt,
    ),
    operational: {
      auth: operational.auth,
      business: operational.business,
      location: operational.location,
      settings: operational.settings,
      terminal: operational.terminal,
      ...(operational.payment_methods === undefined
        ? {}
        : { payment_methods: operational.payment_methods }),
    },
    trusted_clock: createTrustedOfflineClock(grant, cachedAt),
  };
  browserLocalStorage()?.setItem(POS_CACHED_SESSION_KEY, JSON.stringify(cached));
  return cached;
}

export async function validateCachedSession(
  terminalId: string,
  deviceId: string,
  cached: CachedPosSession,
  verification: OfflineAuthorizationVerification,
  now = new Date(),
): Promise<PosOperationalContext> {
  if (cached.access_state !== "ACTIVE") {
    throw new Error(
      "Akses offline perangkat sudah dicabut; cache hanya boleh dipakai untuk pemulihan outbox.",
    );
  }
  if (cached.operational.terminal.id !== terminalId) {
    throw new Error("Terminal berbeda memerlukan verifikasi online.");
  }
  const grant = await verifyOfflineOperationalContext(
    cached.operational,
    deviceId,
    terminalId,
    verification,
  );
  const advanced = advanceTrustedOfflineClock(cached.trusted_clock, grant, now);
  browserLocalStorage()?.setItem(
    POS_CACHED_SESSION_KEY,
    JSON.stringify({ ...cached, trusted_clock: advanced.clock }),
  );
  if (!cached.operational.auth.permissions.includes("workspace.pos.access")) {
    throw new Error("Pengguna tidak memiliki akses POS pada cache izin ini.");
  }
  return { ...cached.operational, source: "OFFLINE_CACHE" };
}

export async function validateCachedRecoverySession(
  terminalId: string,
  deviceId: string,
  cached: CachedPosSession,
  verification: OfflineAuthorizationVerification,
): Promise<PosOperationalContext> {
  if (cached.operational.terminal.id !== terminalId) {
    throw new Error("Terminal berbeda tidak dapat memakai bukti pemulihan perangkat ini.");
  }
  await verifyOfflineOperationalContext(
    cached.operational,
    deviceId,
    terminalId,
    verification,
  );
  return { ...cached.operational, source: "OFFLINE_CACHE" };
}

async function assertCachedCredential(
  bearer: string,
  cached: CachedPosSession,
): Promise<void> {
  const signature = cached.operational.auth.offline_authorization?.signature;
  if (signature === undefined) {
    throw new Error("Bukti otorisasi offline tidak tersedia.");
  }
  const verifier = await deriveQuickLockHash(
    JSON.stringify([bearer, signature]),
    cached.credential_salt,
  );
  if (verifier !== cached.credential_verifier) {
    throw new Error("Sesi pengguna tidak cocok dengan cache offline perangkat ini.");
  }
}

export async function unlockCachedSession(
  bearer: string,
  terminalId: string,
  deviceId: string,
  cached: CachedPosSession,
  verification: OfflineAuthorizationVerification,
  now = new Date(),
): Promise<PosOperationalContext> {
  const context = await validateCachedSession(
    terminalId,
    deviceId,
    cached,
    verification,
    now,
  );
  await assertCachedCredential(bearer, cached);
  return context;
}

export async function unlockCachedSessionForRecovery(
  bearer: string,
  terminalId: string,
  deviceId: string,
  cached: CachedPosSession,
  verification: OfflineAuthorizationVerification,
): Promise<PosOperationalContext> {
  const context = await validateCachedRecoverySession(
    terminalId,
    deviceId,
    cached,
    verification,
  );
  await assertCachedCredential(bearer, cached);
  return context;
}

export function markCachedSessionRecoveryOnly(
  cached: CachedPosSession,
  cause: Exclude<CachedPosSession["recovery_cause"], "NONE"> = "AUTHORITY_REVOKED",
): void {
  browserLocalStorage()?.setItem(
    POS_CACHED_SESSION_KEY,
    JSON.stringify({ ...cached, access_state: "RECOVERY_ONLY", recovery_cause: cause }),
  );
}

export function trustedOperationTimestamp(now = new Date()): string {
  const cached = readOrMigrateCachedSession();
  if (cached === null || cached.access_state !== "ACTIVE") {
    throw new TrustedClockError(
      "CLOCK_UNTRUSTED",
      "Konteks offline aktif tidak tersedia. Masuk kembali sebelum membuat fakta baru.",
    );
  }
  const grant = cached.operational.auth.offline_authorization;
  if (!isOfflineAuthorizationGrant(grant)) {
    throw new TrustedClockError(
      "CLOCK_UNTRUSTED",
      "Bukti otorisasi offline tidak tersedia.",
    );
  }
  try {
    const advanced = advanceTrustedOfflineClock(cached.trusted_clock, grant, now);
    browserLocalStorage()?.setItem(
      POS_CACHED_SESSION_KEY,
      JSON.stringify({ ...cached, trusted_clock: advanced.clock }),
    );
    return advanced.occurredAt;
  } catch (error: unknown) {
    if (error instanceof TrustedClockError) {
      browserLocalStorage()?.setItem(
        POS_CACHED_SESSION_KEY,
        JSON.stringify({
          ...cached,
          access_state: "RECOVERY_ONLY",
          recovery_cause: "CLOCK_UNTRUSTED",
          trusted_clock: { ...cached.trusted_clock, status: "UNTRUSTED" },
        }),
      );
    }
    throw error;
  }
}

export function clearCachedSession(): void {
  browserLocalStorage()?.removeItem(POS_CACHED_SESSION_KEY);
  browserLocalStorage()?.removeItem(LEGACY_POS_CACHED_SESSION_V2_KEY);
  browserLocalStorage()?.removeItem(LEGACY_POS_CACHED_SESSION_V1_KEY);
}
