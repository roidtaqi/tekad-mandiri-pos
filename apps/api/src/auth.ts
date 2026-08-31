import {
  isOfflineAuthorizationGrant,
  type AuthContextResponse,
  type OfflineAuthorizationGrant,
} from "@kastur/contracts";

import type { ApiEnvironment, RequestDatabase, SqlExecutor } from "./database.js";
import { ApiError } from "./http.js";
import {
  issueOfflineAuthorizationGrant,
  verifyOfflineAuthorizationGrant,
} from "./offline-authorization.js";
import { uuidValue } from "./validation.js";

const SESSION_COOKIE = "kastur_session";

interface SessionRow {
  readonly authorization_version: string;
  readonly business_id: string;
  readonly default_location_id: string | null;
  readonly device_status: string | null;
  readonly display_name: string;
  readonly expires_at: Date | string;
  readonly membership_id: string;
  readonly membership_status: string;
  readonly primary_role: string | null;
  readonly session_device_id: string | null;
  readonly session_id: string;
  readonly user_id: string;
  readonly user_status: string;
}

interface PermissionRow {
  readonly code: string;
  readonly effect: "GRANT" | "REVOKE" | null;
}

interface HistoricalSessionRow {
  readonly business_id: string;
  readonly device_id: string | null;
  readonly display_name: string;
  readonly expires_at: Date | string;
  readonly issued_at: Date | string;
  readonly membership_id: string;
  readonly session_id: string;
  readonly user_id: string;
}

export interface AuthenticatedRequestContext {
  readonly authorization: AuthContextResponse;
  readonly device_id: string | null;
  readonly membership_id: string;
  readonly selected_terminal_id: string | null;
  readonly session_id: string;
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader === null) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return null;
}

function getSessionSecret(request: Request): string {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/u)?.[1];
  const secret = bearer ?? getCookie(request, SESSION_COOKIE);

  if (secret === null || secret === undefined || secret.length < 32) {
    throw new ApiError(401, "AUTH_REQUIRED", "Sesi autentikasi diperlukan.");
  }

  return secret;
}

function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Database returned an invalid session timestamp.");
  }
  return date.toISOString();
}

function sameInstant(left: Date | string, right: string): boolean {
  return new Date(left).getTime() === new Date(right).getTime();
}

async function requireActiveTerminal(
  executor: SqlExecutor,
  businessId: string,
  locationId: string,
  terminalId: string | null,
): Promise<void> {
  if (terminalId === null) {
    throw new ApiError(
      403,
      "TERMINAL_CONTEXT_REQUIRED",
      "Sesi POS wajib memilih terminal aktif.",
    );
  }
  const terminal = await executor.query<{ readonly id: string }>(
    `SELECT id
     FROM core.terminals
     WHERE id = $1 AND business_id = $2 AND location_id = $3 AND status = 'ACTIVE'
     LIMIT 1`,
    [terminalId, businessId, locationId],
  );
  if (terminal.rows[0] === undefined) {
    throw new ApiError(
      403,
      "TERMINAL_CONTEXT_INVALID",
      "Terminal POS tidak aktif atau berada di konteks Business/Lokasi yang berbeda.",
    );
  }
}

function authorizationFromGrant(
  grant: OfflineAuthorizationGrant,
  displayName: string,
): AuthContextResponse {
  return {
    authorization_version: grant.authorization.authorization_version,
    default_location_id: grant.authorization.default_location_id,
    membership: {
      business_id: grant.authorization.business_id,
      status: "ACTIVE",
    },
    offline_valid_until: grant.offline_valid_until,
    permissions: [...grant.authorization.permissions].sort(),
    primary_role: grant.authorization.primary_role,
    server_time: new Date().toISOString(),
    user: {
      display_name: displayName,
      id: grant.authorization.user_id,
    },
    offline_authorization: grant,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticateRequest(
  request: Request,
  executor: SqlExecutor,
  environment: ApiEnvironment = {},
): Promise<AuthenticatedRequestContext> {
  const selectedTerminalHeader = request.headers.get("x-terminal-id");
  const selectedTerminalId =
    selectedTerminalHeader === null
      ? null
      : uuidValue(selectedTerminalHeader, "header X-Terminal-Id");
  const sessionSecretHash = await sha256Hex(getSessionSecret(request));
  const sessionResult = await executor.query<SessionRow>(
    `SELECT
       s.id AS session_id,
       s.business_id,
       s.device_id AS session_device_id,
       s.expires_at,
       u.id AS user_id,
       u.display_name,
       u.status AS user_status,
       m.id AS membership_id,
       m.status AS membership_status,
       COALESCE(av.version, 1)::text AS authorization_version,
       primary_role.code AS primary_role,
       default_location.id AS default_location_id,
       d.status AS device_status
     FROM identity.sessions s
     JOIN identity.users u ON u.id = s.user_id
     JOIN identity.business_memberships m
       ON m.business_id = s.business_id AND m.user_id = s.user_id
     LEFT JOIN identity.authorization_versions av ON av.membership_id = m.id
     LEFT JOIN LATERAL (
       SELECT r.code
       FROM identity.membership_roles mr
       JOIN identity.roles r ON r.id = mr.role_id
       WHERE mr.membership_id = m.id
         AND mr.is_primary = TRUE
         AND r.status = 'ACTIVE'
         AND (r.business_id IS NULL OR r.business_id = m.business_id)
       LIMIT 1
     ) primary_role ON TRUE
     LEFT JOIN LATERAL (
       SELECT l.id
       FROM core.locations l
       WHERE l.business_id = s.business_id
         AND l.status = 'ACTIVE'
       ORDER BY l.is_default DESC, l.created_at ASC
       LIMIT 1
     ) default_location ON TRUE
     LEFT JOIN identity.devices d ON d.id = s.device_id
     WHERE s.session_secret_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND (s.device_id IS NULL OR d.business_id = s.business_id)
     LIMIT 1`,
    [sessionSecretHash],
  );
  const session = sessionResult.rows[0];

  if (session === undefined) {
    throw new ApiError(401, "SESSION_INVALID", "Sesi tidak valid atau sudah berakhir.");
  }
  if (session.user_status !== "ACTIVE" || session.membership_status !== "ACTIVE") {
    throw new ApiError(403, "MEMBERSHIP_INACTIVE", "Akses pengguna tidak aktif.");
  }
  if (session.session_device_id !== null && session.device_status !== "ACTIVE") {
    throw new ApiError(403, "DEVICE_REVOKED", "Perangkat tidak lagi diizinkan.");
  }
  const requestClient = request.headers.get("x-kastur-client")?.toLowerCase();
  const requestDeviceId = request.headers.get("x-kastur-device-id");
  if (requestClient === "pos") {
    if (session.session_device_id === null) {
      throw new ApiError(
        403,
        "DEVICE_BINDING_REQUIRED",
        "Sesi POS wajib terikat ke perangkat aktif.",
      );
    }
    if (requestDeviceId !== session.session_device_id) {
      throw new ApiError(
        403,
        "DEVICE_CONTEXT_MISMATCH",
        "Sesi POS terikat ke perangkat yang berbeda.",
      );
    }
  }
  if (session.default_location_id === null || session.primary_role === null) {
    throw new ApiError(
      403,
      "OPERATIONAL_CONTEXT_INCOMPLETE",
      "Lokasi atau peran utama belum dikonfigurasi.",
    );
  }
  if (requestClient === "pos") {
    await requireActiveTerminal(
      executor,
      session.business_id,
      session.default_location_id,
      selectedTerminalId,
    );
  }

  const permissionResult = await executor.query<PermissionRow>(
    `WITH role_grants AS (
       SELECT DISTINCT p.code
       FROM identity.membership_roles mr
       JOIN identity.business_memberships membership ON membership.id = mr.membership_id
       JOIN identity.roles r ON r.id = mr.role_id
       JOIN identity.role_permissions rp ON rp.role_id = mr.role_id
       JOIN identity.permissions p ON p.id = rp.permission_id
       WHERE mr.membership_id = $1
         AND r.status = 'ACTIVE'
         AND (r.business_id IS NULL OR r.business_id = membership.business_id)
     ), overrides AS (
       SELECT p.code, po.effect
       FROM identity.permission_overrides po
       JOIN identity.permissions p ON p.id = po.permission_id
       WHERE po.membership_id = $1
     )
     SELECT code, NULL::text AS effect FROM role_grants
     UNION ALL
     SELECT code, effect FROM overrides`,
    [session.membership_id],
  );
  const permissions = new Set<string>();
  const overrides = new Map<string, "GRANT" | "REVOKE">();

  for (const row of permissionResult.rows) {
    if (row.effect === null) {
      permissions.add(row.code);
    } else {
      overrides.set(row.code, row.effect);
    }
  }
  for (const [code, effect] of overrides) {
    if (effect === "GRANT") {
      permissions.add(code);
    } else {
      permissions.delete(code);
    }
  }

  const authorizationVersion = Number.parseInt(session.authorization_version, 10);
  if (!Number.isSafeInteger(authorizationVersion) || authorizationVersion < 1) {
    throw new Error("Database returned an invalid authorization version.");
  }

  await executor.query(
    `UPDATE identity.sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [session.session_id],
  );
  if (session.session_device_id !== null) {
    await executor.query(
      `UPDATE identity.devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [session.session_device_id],
    );
  }

  const context: AuthenticatedRequestContext = {
    authorization: {
      authorization_version: authorizationVersion,
      default_location_id: session.default_location_id,
      membership: {
        business_id: session.business_id,
        status: "ACTIVE",
      },
      offline_valid_until: toIsoString(session.expires_at),
      permissions: [...permissions].sort(),
      primary_role: session.primary_role,
      server_time: new Date().toISOString(),
      user: {
        display_name: session.display_name,
        id: session.user_id,
      },
    },
    device_id: session.session_device_id,
    membership_id: session.membership_id,
    selected_terminal_id: selectedTerminalId,
    session_id: session.session_id,
  };
  const offlineAuthorization = await issueOfflineAuthorizationGrant(environment, context);
  return offlineAuthorization === undefined
    ? context
    : {
        ...context,
        authorization: {
          ...context.authorization,
          offline_authorization: offlineAuthorization,
        },
      };
}

/**
 * Reconstructs the exact signed authorization snapshot for an offline-safe
 * command while a normal current session is still valid. Current server state
 * remains authoritative for all online-only commands.
 */
export async function contextForOfflineGrant(
  environment: ApiEnvironment,
  current: AuthenticatedRequestContext,
  value: unknown,
): Promise<AuthenticatedRequestContext> {
  if (
    !isOfflineAuthorizationGrant(value) ||
    !(await verifyOfflineAuthorizationGrant(environment, value))
  ) {
    throw new ApiError(
      403,
      "OFFLINE_AUTHORIZATION_INVALID",
      "Bukti otorisasi offline tidak valid.",
    );
  }
  if (
    value.session_id !== current.session_id ||
    value.device_id !== current.device_id ||
    value.terminal_id !== current.selected_terminal_id ||
    value.authorization.user_id !== current.authorization.user.id ||
    value.authorization.business_id !== current.authorization.membership.business_id ||
    value.offline_valid_until !== current.authorization.offline_valid_until
  ) {
    throw new ApiError(
      403,
      "OFFLINE_AUTHORIZATION_CONTEXT_MISMATCH",
      "Bukti otorisasi offline tidak cocok dengan sesi/perangkat.",
    );
  }
  return {
    ...current,
    authorization: authorizationFromGrant(
      value,
      current.authorization.user.display_name,
    ),
  };
}

/**
 * Reconstructs the historical actor for an explicitly approved recovery
 * import. A current, independent approver authorizes transport; the signed
 * grant preserves the original actor/device/terminal attribution.
 */
export async function authenticateRecoveryRequest(
  executor: SqlExecutor,
  environment: ApiEnvironment,
  approver: AuthenticatedRequestContext,
  value: unknown,
): Promise<AuthenticatedRequestContext> {
  requirePermission(approver, "sync.recovery.import");
  if (
    !isOfflineAuthorizationGrant(value) ||
    !(await verifyOfflineAuthorizationGrant(environment, value))
  ) {
    throw new ApiError(
      401,
      "OFFLINE_AUTHORIZATION_INVALID",
      "Bukti otorisasi offline tidak valid.",
    );
  }
  if (
    approver.authorization.membership.business_id !== value.authorization.business_id
  ) {
    throw new ApiError(
      403,
      "CROSS_BUSINESS_ACCESS_DENIED",
      "Persetujuan recovery dan fakta historis harus berasal dari Business yang sama.",
    );
  }

  const result = await executor.query<HistoricalSessionRow>(
    `SELECT s.id AS session_id, s.business_id, s.device_id,
            s.issued_at, s.expires_at, s.user_id, u.display_name,
            m.id AS membership_id
     FROM identity.sessions s
     JOIN identity.users u ON u.id = s.user_id
     JOIN identity.business_memberships m
       ON m.business_id = s.business_id AND m.user_id = s.user_id
     JOIN core.terminals t
       ON t.id = $5 AND t.business_id = s.business_id
      AND t.location_id = $6
     WHERE s.id = $1
       AND s.business_id = $2
       AND s.user_id = $3
       AND s.device_id = $4
     LIMIT 1`,
    [
      value.session_id,
      value.authorization.business_id,
      value.authorization.user_id,
      value.device_id,
      value.terminal_id,
      value.authorization.default_location_id,
    ],
  );
  const session = result.rows[0];
  const issuedAt = new Date(value.issued_at).getTime();
  const validUntil = new Date(value.offline_valid_until).getTime();
  if (
    session === undefined ||
    session.device_id !== value.device_id ||
    !sameInstant(session.expires_at, value.offline_valid_until) ||
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(validUntil) ||
    issuedAt < new Date(session.issued_at).getTime() ||
    issuedAt >= validUntil
  ) {
    throw new ApiError(
      401,
      "OFFLINE_AUTHORIZATION_CONTEXT_MISMATCH",
      "Bukti offline tidak cocok dengan sesi historis.",
    );
  }
  return {
    authorization: authorizationFromGrant(value, session.display_name),
    device_id: value.device_id,
    membership_id: session.membership_id,
    selected_terminal_id: value.terminal_id,
    session_id: value.session_id,
  };
}

export function requirePermission(
  context: AuthenticatedRequestContext,
  permission: string,
): void {
  if (!context.authorization.permissions.includes(permission)) {
    throw new ApiError(
      403,
      "PERMISSION_DENIED",
      `Izin ${permission} diperlukan.`,
    );
  }
}

export async function requireActiveBusinessDevice(
  executor: SqlExecutor,
  context: AuthenticatedRequestContext,
  deviceId: string,
): Promise<void> {
  if (context.device_id !== null && context.device_id !== deviceId) {
    throw new ApiError(
      403,
      "DEVICE_CONTEXT_MISMATCH",
      "Perangkat command tidak cocok dengan sesi.",
    );
  }
  const device = await executor.query<{ readonly id: string }>(
    `SELECT id
     FROM identity.devices
     WHERE id = $1 AND business_id = $2 AND status = 'ACTIVE'
       AND revoked_at IS NULL
     LIMIT 1`,
    [deviceId, context.authorization.membership.business_id],
  );
  if (device.rows[0] === undefined) {
    throw new ApiError(
      403,
      "DEVICE_REVOKED",
      "Perangkat tidak aktif untuk Business ini.",
    );
  }
}

export async function revokeCurrentSession(
  database: RequestDatabase,
  context: AuthenticatedRequestContext,
): Promise<void> {
  await database.transaction(async (executor) => {
    await executor.query(
      `UPDATE identity.sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
       WHERE id = $1`,
      [context.session_id],
    );
    await executor.query(
      `INSERT INTO audit.audit_events (
         id, business_id, location_id, actor_type, actor_user_id,
         actor_role_snapshot, action, entity_type, entity_id, occurred_at,
         recorded_at, device_id, session_id, correlation_id,
         authorization_version, after_data
       ) VALUES (
         $1, $2, $3, 'USER', $4, $5, 'SESSION_REVOKED', 'session', $6,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $7, $6, $8, $9,
         '{"status":"REVOKED"}'::jsonb
       )`,
      [
        crypto.randomUUID(),
        context.authorization.membership.business_id,
        context.authorization.default_location_id,
        context.authorization.user.id,
        context.authorization.primary_role,
        context.session_id,
        context.device_id,
        crypto.randomUUID(),
        context.authorization.authorization_version,
      ],
    );
  });
}
