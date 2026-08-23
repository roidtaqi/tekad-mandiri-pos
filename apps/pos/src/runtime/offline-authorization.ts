import {
  isOfflineAuthorizationGrant,
  offlineAuthorizationSigningPayload,
  type OfflineAuthorizationGrant,
} from "@kastur/contracts";

import type { PosOperationalContext } from "./types.js";
import type { PosRuntimeConfig } from "./config.js";

export type OfflineAuthorizationVerification = NonNullable<
  PosRuntimeConfig["offlineAuthorizationVerification"]
>;

interface EcPublicJwk {
  readonly kty: "EC";
  readonly crv: "P-256";
  readonly x: string;
  readonly y: string;
  readonly ext?: boolean;
}

function parsePublicKey(encoded: string): EcPublicJwk {
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    throw new Error("Kunci verifikasi otorisasi offline bukan JSON yang valid.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Kunci verifikasi otorisasi offline tidak valid.");
  }
  const key = value as Readonly<Record<string, unknown>>;
  if (
    key.kty !== "EC" ||
    key.crv !== "P-256" ||
    typeof key.x !== "string" ||
    typeof key.y !== "string" ||
    "d" in key
  ) {
    throw new Error("Kunci verifikasi harus berupa public EC P-256 JWK.");
  }
  return key as unknown as EcPublicJwk;
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export async function verifyOfflineOperationalContext(
  operational: Omit<PosOperationalContext, "source">,
  deviceId: string,
  terminalId: string,
  verification: OfflineAuthorizationVerification,
): Promise<OfflineAuthorizationGrant> {
  const grant = operational.auth.offline_authorization;
  if (!isOfflineAuthorizationGrant(grant)) {
    throw new Error("Server tidak memberikan bukti otorisasi offline yang valid.");
  }
  if (grant.key_id !== verification.keyId) {
    throw new Error("Bukti otorisasi offline ditandatangani oleh kunci yang tidak dikenal.");
  }
  if (
    grant.device_id !== deviceId ||
    grant.terminal_id !== terminalId ||
    grant.authorization.user_id !== operational.auth.user.id ||
    grant.authorization.business_id !== operational.auth.membership.business_id ||
    grant.authorization.business_id !== operational.business.id ||
    grant.authorization.primary_role !== operational.auth.primary_role ||
    !equalStrings(grant.authorization.permissions, operational.auth.permissions) ||
    grant.authorization.authorization_version !== operational.auth.authorization_version ||
    grant.authorization.default_location_id !== operational.auth.default_location_id ||
    grant.authorization.default_location_id !== operational.location.id ||
    grant.offline_valid_until !== operational.auth.offline_valid_until
  ) {
    throw new Error("Konteks operasional tidak cocok dengan bukti otorisasi offline.");
  }
  const issuedAt = new Date(grant.issued_at).getTime();
  const validUntil = new Date(grant.offline_valid_until).getTime();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(validUntil) || issuedAt >= validUntil) {
    throw new Error("Rentang waktu bukti otorisasi offline tidak valid.");
  }

  const { signature, ...unsigned } = grant;
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64UrlDecode(signature);
  } catch {
    throw new Error("Tanda tangan otorisasi offline tidak valid.");
  }
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    parsePublicKey(verification.publicKeyJwk),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signatureBytes.buffer as ArrayBuffer,
    new TextEncoder().encode(offlineAuthorizationSigningPayload(unsigned)),
  );
  if (!valid) throw new Error("Integritas cache otorisasi offline gagal diverifikasi.");
  return grant;
}
