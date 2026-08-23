import { deriveQuickLockHash, generateQuickLockSalt } from "@kastur/auth-client";
import { isOfflineAuthorizationGrant } from "@kastur/contracts";

import {
  verifyOfflineOperationalContext,
  type OfflineAuthorizationVerification,
} from "./offline-authorization.js";
import type { CachedPosSession, PosOperationalContext } from "./types.js";

export const POS_SESSION_BEARER_KEY = "kastur.pos.session-bearer";
export const POS_DEVICE_ID_KEY = "kastur.pos.device-id";
export const POS_TERMINAL_ID_KEY = "kastur.pos.terminal-id";
export const POS_CACHED_SESSION_KEY = "kastur.pos.cached-session.v2";
const LEGACY_POS_CACHED_SESSION_KEY = "kastur.pos.cached-session.v1";

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

function isCachedSession(value: unknown): value is CachedPosSession {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const operational = record.operational;
  return (
    record.cache_version === 2 &&
    (record.access_state === "ACTIVE" || record.access_state === "RECOVERY_ONLY") &&
    typeof record.cached_at === "string" &&
    typeof record.credential_salt === "string" &&
    typeof record.credential_verifier === "string" &&
    typeof operational === "object" &&
    operational !== null &&
    !Array.isArray(operational) &&
    (() => {
      const auth = (operational as Record<string, unknown>).auth;
      return (
        typeof auth === "object" &&
        auth !== null &&
        !Array.isArray(auth) &&
        isOfflineAuthorizationGrant(
          (auth as Record<string, unknown>).offline_authorization,
        )
      );
    })()
  );
}

export function readCachedSession(): CachedPosSession | null {
  const raw = browserLocalStorage()?.getItem(POS_CACHED_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCachedSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
    cache_version: 2,
    access_state: "ACTIVE",
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
  const expiry = new Date(cached.operational.auth.offline_valid_until).getTime();
  if (!Number.isFinite(expiry) || expiry < now.getTime()) {
    throw new Error("Izin offline sudah kedaluwarsa. Sambungkan perangkat untuk masuk kembali.");
  }
  await verifyOfflineOperationalContext(
    cached.operational,
    deviceId,
    terminalId,
    verification,
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

export function markCachedSessionRecoveryOnly(cached: CachedPosSession): void {
  browserLocalStorage()?.setItem(
    POS_CACHED_SESSION_KEY,
    JSON.stringify({ ...cached, access_state: "RECOVERY_ONLY" }),
  );
}

export function clearCachedSession(): void {
  browserLocalStorage()?.removeItem(POS_CACHED_SESSION_KEY);
  browserLocalStorage()?.removeItem(LEGACY_POS_CACHED_SESSION_KEY);
}
