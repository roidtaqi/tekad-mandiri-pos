import type { AuthContextResponse } from "@kastur/contracts";

import { AuthenticatedHttpClient, HttpError } from "./http";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(
      502,
      "INVALID_AUTH_CONTEXT",
      "Server mengembalikan konteks pengguna yang tidak dapat dibaca.",
    );
  }
  return value;
}

export function parseAuthContext(value: unknown): AuthContextResponse {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.membership)) {
    throw new HttpError(
      502,
      "INVALID_AUTH_CONTEXT",
      "Server mengembalikan konteks pengguna yang tidak dapat dibaca.",
    );
  }

  const permissions = value.permissions;
  const authorizationVersion = value.authorization_version;
  if (
    !Array.isArray(permissions) ||
    !permissions.every((permission) => typeof permission === "string") ||
    typeof authorizationVersion !== "number" ||
    !Number.isSafeInteger(authorizationVersion) ||
    authorizationVersion < 1 ||
    value.membership.status !== "ACTIVE"
  ) {
    throw new HttpError(
      502,
      "INVALID_AUTH_CONTEXT",
      "Server mengembalikan konteks pengguna yang tidak dapat dibaca.",
    );
  }

  return {
    authorization_version: authorizationVersion,
    default_location_id: requireString(value, "default_location_id"),
    membership: {
      business_id: requireString(value.membership, "business_id"),
      status: "ACTIVE",
    },
    offline_valid_until: requireString(value, "offline_valid_until"),
    permissions: [...permissions],
    primary_role: requireString(value, "primary_role"),
    server_time: requireString(value, "server_time"),
    user: {
      display_name: requireString(value.user, "display_name"),
      id: requireString(value.user, "id"),
    },
  };
}

export async function fetchAuthContext(
  client: AuthenticatedHttpClient,
): Promise<AuthContextResponse> {
  return parseAuthContext(await client.get<unknown>("/api/v1/auth/context"));
}
