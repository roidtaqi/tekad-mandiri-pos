import {
  isOfflineAuthorizationGrant,
  offlineAuthorizationSigningPayload,
  type OfflineAuthorizationGrant,
} from "@kastur/contracts";

import type { AuthenticatedRequestContext } from "./auth.js";
import type { ApiEnvironment } from "./database.js";

interface EcPrivateJwk {
  readonly kty: "EC";
  readonly crv: "P-256";
  readonly x: string;
  readonly y: string;
  readonly d: string;
  readonly ext?: boolean;
}

interface EcPublicJwk {
  readonly kty: "EC";
  readonly crv: "P-256";
  readonly x: string;
  readonly y: string;
  readonly ext: true;
}

function configuredKey(environment: ApiEnvironment): {
  readonly keyId: string;
  readonly privateJwk: EcPrivateJwk;
} | null {
  const encoded = environment.OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK?.trim();
  const keyId = environment.OFFLINE_AUTH_SIGNING_KEY_ID?.trim();
  if (encoded === undefined && keyId === undefined) return null;
  if (encoded === undefined || encoded === "" || keyId === undefined || keyId === "") {
    throw new Error(
      "OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK and OFFLINE_AUTH_SIGNING_KEY_ID must be configured together.",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    throw new Error("OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK must be valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK must contain a JWK object.");
  }
  const jwk = value as Readonly<Record<string, unknown>>;
  if (
    jwk.kty !== "EC" ||
    jwk.crv !== "P-256" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string" ||
    typeof jwk.d !== "string"
  ) {
    throw new Error("Offline authorization signing key must be an EC P-256 private JWK.");
  }
  return { keyId, privateJwk: jwk as unknown as EcPrivateJwk };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function publicJwk(privateJwk: EcPrivateJwk): EcPublicJwk {
  return {
    crv: privateJwk.crv,
    ext: true,
    kty: privateJwk.kty,
    x: privateJwk.x,
    y: privateJwk.y,
  };
}

export async function issueOfflineAuthorizationGrant(
  environment: ApiEnvironment,
  context: AuthenticatedRequestContext,
): Promise<OfflineAuthorizationGrant | undefined> {
  const configured = configuredKey(environment);
  if (
    configured === null ||
    context.device_id === null ||
    context.selected_terminal_id === null
  ) {
    return undefined;
  }

  const unsigned: Omit<OfflineAuthorizationGrant, "signature"> = {
    schema_version: 1,
    algorithm: "ECDSA_P256_SHA256",
    key_id: configured.keyId,
    session_id: context.session_id,
    device_id: context.device_id,
    terminal_id: context.selected_terminal_id,
    issued_at: context.authorization.server_time,
    offline_valid_until: context.authorization.offline_valid_until,
    authorization: {
      user_id: context.authorization.user.id,
      business_id: context.authorization.membership.business_id,
      primary_role: context.authorization.primary_role,
      permissions: [...context.authorization.permissions].sort(),
      authorization_version: context.authorization.authorization_version,
      default_location_id: context.authorization.default_location_id,
    },
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    configured.privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(offlineAuthorizationSigningPayload(unsigned)),
  );
  return { ...unsigned, signature: base64UrlEncode(new Uint8Array(signature)) };
}

export async function verifyOfflineAuthorizationGrant(
  environment: ApiEnvironment,
  value: unknown,
): Promise<boolean> {
  if (!isOfflineAuthorizationGrant(value)) return false;
  const configured = configuredKey(environment);
  if (configured === null || value.key_id !== configured.keyId) return false;
  const { signature, ...unsigned } = value;
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64UrlDecode(signature);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    publicJwk(configured.privateJwk),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signatureBytes,
    new TextEncoder().encode(offlineAuthorizationSigningPayload(unsigned)),
  );
}
