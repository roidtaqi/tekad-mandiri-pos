import {
  isOfflineAuthorizationGrant,
  type AuthContextResponse,
} from "@kastur/contracts";

export class PosAuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PosAuthApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeAuthContext(value: unknown): AuthContextResponse {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.membership)) {
    throw new Error("Respons konteks autentikasi tidak valid.");
  }
  if (
    typeof value.user.id !== "string" ||
    typeof value.user.display_name !== "string" ||
    typeof value.membership.business_id !== "string" ||
    value.membership.status !== "ACTIVE" ||
    typeof value.primary_role !== "string" ||
    !Array.isArray(value.permissions) ||
    !value.permissions.every((permission) => typeof permission === "string") ||
    typeof value.authorization_version !== "number" ||
    typeof value.offline_valid_until !== "string" ||
    typeof value.default_location_id !== "string" ||
    typeof value.server_time !== "string" ||
    (value.offline_authorization !== undefined &&
      !isOfflineAuthorizationGrant(value.offline_authorization))
  ) {
    throw new Error("Respons konteks autentikasi tidak lengkap.");
  }
  return value as unknown as AuthContextResponse;
}

export interface PosLoginResult {
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

export async function loginPosApi(
  apiBaseUrl: string,
  email: string,
  password: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<PosLoginResult> {
  const response = await fetchImplementation(new URL("/api/v1/auth/login", apiBaseUrl), {
    body: JSON.stringify({
      client: "pos",
      email: email.trim(),
      password,
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    throw new PosAuthApiError(
      error !== null && typeof error.message === "string"
        ? error.message
        : "Email atau password tidak sesuai.",
      response.status,
      error !== null && typeof error.code === "string" ? error.code : `HTTP_${response.status}`,
    );
  }

  if (!isRecord(body) || !isRecord(body.data) || typeof body.data.session_secret !== "string") {
    throw new PosAuthApiError(
      "Respons login tidak valid.",
      500,
      "INVALID_LOGIN_RESPONSE",
    );
  }

  return body.data as unknown as PosLoginResult;
}

export async function fetchAuthContext(
  apiBaseUrl: string,
  bearer: string,
  deviceId: string,
  terminalId?: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<AuthContextResponse> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${bearer}`,
    "X-Kastur-Client": "pos",
    "X-Kastur-Device-Id": deviceId,
  };
  if (terminalId !== undefined && terminalId.trim() !== "") {
    headers["X-Terminal-Id"] = terminalId.trim();
  }
  const response = await fetchImplementation(new URL("/api/v1/auth/context", apiBaseUrl), {
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    throw new PosAuthApiError(
      error !== null && typeof error.message === "string"
        ? error.message
        : "Sesi tidak dapat diverifikasi.",
      response.status,
      error !== null && typeof error.code === "string" ? error.code : `HTTP_${response.status}`,
    );
  }
  if (!isRecord(body) || !("data" in body)) {
    throw new Error("Respons autentikasi tidak memiliki data.");
  }
  return decodeAuthContext(body.data);
}

export async function revokePosSession(
  apiBaseUrl: string,
  bearer: string,
  deviceId: string,
  terminalId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImplementation(new URL("/api/v1/auth/logout", apiBaseUrl), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
      "X-Kastur-Client": "pos",
      "X-Kastur-Device-Id": deviceId,
      "X-Terminal-Id": terminalId,
    },
    keepalive: true,
    method: "POST",
  });
  if (!response.ok && response.status !== 401) {
    throw new PosAuthApiError(
      "Sesi server belum dapat dicabut.",
      response.status,
      "SESSION_REVOKE_FAILED",
    );
  }
}

export interface AvailableTerminal {
  readonly code: string;
  readonly id: string;
  readonly location_id: string;
  readonly location_name: string;
  readonly name: string;
}

export async function fetchAvailableTerminals(
  apiBaseUrl: string,
  bearer: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<readonly AvailableTerminal[]> {
  const response = await fetchImplementation(new URL("/api/v1/auth/terminals", apiBaseUrl), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
      "X-Kastur-Client": "pos",
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(body) || !Array.isArray(body.data)) {
    return [];
  }
  return body.data as unknown as AvailableTerminal[];
}

export async function enrollDeviceApi(
  apiBaseUrl: string,
  bearer: string,
  deviceId: string,
  deviceName?: string,
  code?: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImplementation(new URL("/api/v1/auth/enroll-device", apiBaseUrl), {
    body: JSON.stringify({
      code,
      device_id: deviceId,
      device_name: deviceName,
    }),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      "X-Kastur-Client": "pos",
    },
    method: "POST",
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    throw new PosAuthApiError(
      error !== null && typeof error.message === "string"
        ? error.message
        : "Gagal mendaftarkan perangkat.",
      response.status,
      error !== null && typeof error.code === "string" ? error.code : `HTTP_${response.status}`,
    );
  }
}
