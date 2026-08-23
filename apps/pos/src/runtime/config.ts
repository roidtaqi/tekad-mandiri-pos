export interface PosRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly clientVersion: string;
  readonly offlineAuthorizationVerification: {
    readonly keyId: string;
    readonly publicKeyJwk: string;
  } | null;
}

function absoluteBaseUrl(value: string): string {
  if (/^https?:\/\//u.test(value)) return value;
  if (typeof window === "undefined") return new URL(value, "http://localhost").toString();
  return new URL(value, window.location.origin).toString();
}

export function readPosRuntimeConfig(
  environment: Readonly<Record<string, unknown>> = import.meta.env,
): PosRuntimeConfig {
  const configuredBaseUrl = environment.VITE_API_BASE_URL;
  const configuredKeyId = environment.VITE_OFFLINE_AUTH_KEY_ID;
  const configuredPublicKey = environment.VITE_OFFLINE_AUTH_PUBLIC_KEY_JWK;
  const keyId = typeof configuredKeyId === "string" ? configuredKeyId.trim() : "";
  const publicKeyJwk =
    typeof configuredPublicKey === "string" ? configuredPublicKey.trim() : "";
  if ((keyId === "") !== (publicKeyJwk === "")) {
    throw new Error(
      "VITE_OFFLINE_AUTH_KEY_ID and VITE_OFFLINE_AUTH_PUBLIC_KEY_JWK must be configured together.",
    );
  }
  return {
    apiBaseUrl: absoluteBaseUrl(
      typeof configuredBaseUrl === "string" && configuredBaseUrl.trim() !== ""
        ? configuredBaseUrl
        : "/",
    ),
    clientVersion: "0.0.0",
    offlineAuthorizationVerification:
      keyId === "" ? null : { keyId, publicKeyJwk },
  };
}
