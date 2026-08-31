/** @vitest-environment happy-dom */
import { offlineAuthorizationSigningPayload } from "@kastur/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { OfflineAuthorizationVerification } from "./offline-authorization.js";
import type { PosOperationalContext } from "./types.js";
import {
  POS_CACHED_SESSION_KEY,
  POS_DEVICE_ID_KEY,
  POS_SESSION_BEARER_KEY,
  cacheOperationalSession,
  clearSessionBearer,
  getOrCreateDeviceId,
  markCachedSessionRecoveryOnly,
  readCachedSession,
  readSessionBearer,
  trustedOperationTimestamp,
  unlockCachedSession,
  unlockCachedSessionForRecovery,
  writeSessionBearer,
} from "./storage.js";

const bearer = "personal-session-secret-with-more-than-thirty-two-characters";
const deviceId = "device-1";
let signingKey: CryptoKey;
let verification: OfflineAuthorizationVerification;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function operational(
  expiry = "2099-01-01T00:00:00.000Z",
): Promise<PosOperationalContext> {
  const unsigned = {
    schema_version: 1 as const,
    algorithm: "ECDSA_P256_SHA256" as const,
    key_id: verification.keyId,
    session_id: "session-1",
    device_id: deviceId,
    terminal_id: "terminal-1",
    issued_at: "2026-08-23T00:00:00.000Z",
    offline_valid_until: expiry,
    authorization: {
      user_id: "user-1",
      business_id: "business-1",
      primary_role: "CASHIER",
      permissions: ["workspace.pos.access", "pos.use"],
      authorization_version: 3,
      default_location_id: "location-1",
    },
  };
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    new TextEncoder().encode(offlineAuthorizationSigningPayload(unsigned)),
  );
  return {
    auth: {
      user: { id: "user-1", display_name: "Kasir Satu" },
      membership: { business_id: "business-1", status: "ACTIVE" },
      primary_role: "CASHIER",
      permissions: ["workspace.pos.access", "pos.use"],
      authorization_version: 3,
      offline_valid_until: expiry,
      default_location_id: "location-1",
      server_time: "2026-08-23T00:00:00.000Z",
      offline_authorization: {
        ...unsigned,
        signature: base64UrlEncode(new Uint8Array(signature)),
      },
    },
    business: { id: "business-1", name: "Toko", currency_code: "IDR", timezone: "Asia/Makassar" },
    location: { id: "location-1", code: "UTM", name: "Utama" },
    terminal: { id: "terminal-1", code: "POS-1", name: "Kasir 1" },
    settings: { language: "id-ID", receipt_width: "80mm" },
    payment_methods: [],
    source: "ONLINE",
  };
}

async function cacheOperational(
  expiry = "2099-01-01T00:00:00.000Z",
) {
  return cacheOperationalSession(
    bearer,
    await operational(expiry),
    deviceId,
    verification,
    "2026-08-23T00:00:00.000Z",
  );
}

describe("POS credential storage", () => {
  beforeAll(async () => {
    const keys = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    signingKey = keys.privateKey;
    const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
    verification = {
      keyId: "test-key-1",
      publicKeyJwk: JSON.stringify(publicKey),
    };
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps bearer only in sessionStorage and caches only a verifier", async () => {
    writeSessionBearer(bearer);
    await cacheOperational();

    expect(readSessionBearer()).toBe(bearer);
    expect(window.sessionStorage.getItem(POS_SESSION_BEARER_KEY)).toBe(bearer);
    expect(window.localStorage.getItem(POS_CACHED_SESSION_KEY)).not.toContain(bearer);

    clearSessionBearer();
    expect(readSessionBearer()).toBeNull();
    expect(readCachedSession()?.operational.auth.user.id).toBe("user-1");
  });

  it("unlocks an unexpired cache only with the same personal bearer and terminal", async () => {
    const cached = await cacheOperational();
    const unlocked = await unlockCachedSession(
      bearer,
      "terminal-1",
      deviceId,
      cached,
      verification,
      new Date("2026-08-23T00:00:00.000Z"),
    );

    expect(unlocked.source).toBe("OFFLINE_CACHE");
    await expect(
      unlockCachedSession(
        "another-personal-session-secret-which-is-long-enough",
        "terminal-1",
        deviceId,
        cached,
        verification,
      ),
    ).rejects.toThrow("tidak cocok");
    await expect(
      unlockCachedSession(bearer, "terminal-2", deviceId, cached, verification),
    ).rejects.toThrow("Terminal berbeda");
  });

  it("rejects expired offline authorization", async () => {
    const cached = await cacheOperational("2026-08-24T00:00:00.000Z");
    await expect(
      unlockCachedSession(
        bearer,
        "terminal-1",
        deviceId,
        cached,
        verification,
        new Date("2026-08-25T00:00:00.000Z"),
      ),
    ).rejects.toThrow("kedaluwarsa");
  });

  it("rejects a locally elevated permission even when the bearer verifier is unchanged", async () => {
    const cached = await cacheOperational();
    const tampered = {
      ...cached,
      operational: {
        ...cached.operational,
        auth: {
          ...cached.operational.auth,
          permissions: [...cached.operational.auth.permissions, "pricing.approve"],
        },
      },
    };
    await expect(
      unlockCachedSession(
        bearer,
        "terminal-1",
        deviceId,
        tampered,
        verification,
      ),
    ).rejects.toThrow("tidak cocok dengan bukti");
  });

  it("blocks new offline access after revocation while retaining a credential-bound recovery path", async () => {
    const cached = await cacheOperational("2026-08-24T00:00:00.000Z");
    markCachedSessionRecoveryOnly(cached);
    const recoveryOnly = readCachedSession()!;

    await expect(
      unlockCachedSession(
        bearer,
        "terminal-1",
        deviceId,
        recoveryOnly,
        verification,
        new Date("2026-08-23T12:00:00.000Z"),
      ),
    ).rejects.toThrow("hanya boleh dipakai untuk pemulihan");
    await expect(
      unlockCachedSessionForRecovery(
        bearer,
        "terminal-1",
        deviceId,
        recoveryOnly,
        verification,
      ),
    ).resolves.toMatchObject({ source: "OFFLINE_CACHE" });
  });

  it("persists one durable device identifier", () => {
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();
    expect(second).toBe(first);
    expect(window.localStorage.getItem(POS_DEVICE_ID_KEY)).toBe(first);
  });

  it("uses a monotonic server-time estimate and locks after material wall-clock rollback", async () => {
    await cacheOperational("2026-08-24T00:00:00.000Z");

    expect(
      trustedOperationTimestamp(new Date("2026-08-23T00:10:00.000Z")),
    ).toBe("2026-08-23T00:10:00.000Z");
    expect(
      trustedOperationTimestamp(new Date("2026-08-23T00:20:00.000Z")),
    ).toBe("2026-08-23T00:20:00.000Z");
    expect(() =>
      trustedOperationTimestamp(new Date("2026-08-23T00:00:00.000Z")),
    ).toThrow("Jam perangkat mundur");
    expect(readCachedSession()).toMatchObject({
      access_state: "RECOVERY_ONLY",
      recovery_cause: "CLOCK_UNTRUSTED",
      trusted_clock: { status: "UNTRUSTED" },
    });
  });
});
