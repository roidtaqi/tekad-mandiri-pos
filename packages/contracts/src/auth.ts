export interface OfflineAuthorizationGrant {
  readonly schema_version: 1;
  readonly algorithm: "ECDSA_P256_SHA256";
  readonly key_id: string;
  readonly session_id: string;
  readonly device_id: string;
  readonly terminal_id: string;
  readonly issued_at: string;
  readonly offline_valid_until: string;
  readonly authorization: {
    readonly user_id: string;
    readonly business_id: string;
    readonly primary_role: string;
    readonly permissions: readonly string[];
    readonly authorization_version: number;
    readonly default_location_id: string;
  };
  /** Base64url-encoded IEEE P1363 ECDSA signature. */
  readonly signature: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  readonly client?: "pos" | "backoffice" | undefined;
}

export interface LoginResponseData {
  readonly business_id: string;
  readonly default_location_id: string | null;
  readonly primary_role: string;
  readonly session_secret: string;
  readonly user: {
    readonly display_name: string;
    readonly email: string | null;
    readonly id: string;
  };
}

export interface AuthContextResponse {
  user: {
    id: string;
    display_name: string;
    email?: string | null | undefined;
  };
  membership: {
    business_id: string;
    status: "ACTIVE";
  };
  primary_role: string;
  permissions: readonly string[];
  authorization_version: number;
  offline_valid_until: string;
  default_location_id: string;
  server_time: string;
  /**
   * Server-signed, device/terminal-bound authority used only for explicitly
   * offline-safe facts. It is public evidence, never a privileged client secret.
   */
  offline_authorization?: OfflineAuthorizationGrant;
}

/** Stable, field-ordered representation covered by the server signature. */
export function offlineAuthorizationSigningPayload(
  grant: Omit<OfflineAuthorizationGrant, "signature">,
): string {
  return JSON.stringify({
    schema_version: grant.schema_version,
    algorithm: grant.algorithm,
    key_id: grant.key_id,
    session_id: grant.session_id,
    device_id: grant.device_id,
    terminal_id: grant.terminal_id,
    issued_at: grant.issued_at,
    offline_valid_until: grant.offline_valid_until,
    authorization: {
      user_id: grant.authorization.user_id,
      business_id: grant.authorization.business_id,
      primary_role: grant.authorization.primary_role,
      permissions: [...grant.authorization.permissions].sort(),
      authorization_version: grant.authorization.authorization_version,
      default_location_id: grant.authorization.default_location_id,
    },
  });
}

export function isOfflineAuthorizationGrant(
  value: unknown,
): value is OfflineAuthorizationGrant {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const grant = value as Record<string, unknown>;
  const authorization = grant.authorization;
  if (
    typeof authorization !== "object" ||
    authorization === null ||
    Array.isArray(authorization)
  ) {
    return false;
  }
  const auth = authorization as Record<string, unknown>;
  return (
    grant.schema_version === 1 &&
    grant.algorithm === "ECDSA_P256_SHA256" &&
    typeof grant.key_id === "string" &&
    grant.key_id.length > 0 &&
    typeof grant.session_id === "string" &&
    typeof grant.device_id === "string" &&
    typeof grant.terminal_id === "string" &&
    typeof grant.issued_at === "string" &&
    typeof grant.offline_valid_until === "string" &&
    typeof grant.signature === "string" &&
    /^[A-Za-z0-9_-]+$/u.test(grant.signature) &&
    typeof auth.user_id === "string" &&
    typeof auth.business_id === "string" &&
    typeof auth.primary_role === "string" &&
    Array.isArray(auth.permissions) &&
    auth.permissions.every((permission) => typeof permission === "string") &&
    typeof auth.authorization_version === "number" &&
    Number.isSafeInteger(auth.authorization_version) &&
    auth.authorization_version >= 1 &&
    typeof auth.default_location_id === "string"
  );
}
