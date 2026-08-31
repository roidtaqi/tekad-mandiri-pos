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
    method: "POST",
    keepalive: true,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
      "X-Kastur-Client": "pos",
      "X-Kastur-Device-Id": deviceId,
      "X-Terminal-Id": terminalId,
    },
  });
  if (!response.ok && response.status !== 401) {
    throw new PosAuthApiError(
      "Sesi server belum dapat dicabut.",
      response.status,
      "SESSION_REVOKE_FAILED",
    );
  }
}
