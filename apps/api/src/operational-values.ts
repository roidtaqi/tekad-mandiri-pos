import {
  decimalCompare,
  fitsPrecisionScale,
  parseDecimal,
  type DecimalValue,
} from "@kastur/numeric";

import type { AuthenticatedRequestContext } from "./auth.js";
import type { CommandIdentity } from "./command-support.js";
import { ApiError } from "./http.js";
import { stringValue, validationError } from "./validation.js";

const ZERO = parseDecimal("0");

export function decimalValue(
  value: unknown,
  field: string,
  options: {
    readonly allowZero?: boolean;
    readonly precision: number;
    readonly scale: number;
  },
): DecimalValue {
  const text = stringValue(value, field);
  try {
    const parsed = parseDecimal(text);
    const comparison = decimalCompare(parsed, ZERO);
    if (
      !fitsPrecisionScale(parsed, options.precision, options.scale) ||
      comparison < 0 ||
      (comparison === 0 && options.allowZero !== true)
    ) {
      throw validationError(
        field,
        `${options.allowZero === true ? "harus non-negatif" : "harus positif"} dan sesuai NUMERIC(${options.precision},${options.scale})`,
      );
    }
    return parsed;
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    throw validationError(field, "bukan string desimal yang valid");
  }
}

export function nullableDecimalValue(
  value: unknown,
  field: string,
  options: {
    readonly allowZero?: boolean;
    readonly precision: number;
    readonly scale: number;
  },
): DecimalValue | null {
  return value === null || value === undefined
    ? null
    : decimalValue(value, field, options);
}

export function assertFreshAuthorization(
  context: AuthenticatedRequestContext,
  authorizationVersion: number,
): void {
  if (authorizationVersion !== context.authorization.authorization_version) {
    throw new ApiError(
      409,
      "AUTHORIZATION_STALE",
      "Otorisasi command sudah berubah; muat ulang konteks pengguna.",
    );
  }
}

export function requireCommandLocation(
  context: AuthenticatedRequestContext,
  command: CommandIdentity,
): string {
  const locationId = command.location_id;
  if (
    locationId === null ||
    locationId !== context.authorization.default_location_id
  ) {
    throw new ApiError(
      403,
      "LOCATION_CONTEXT_MISMATCH",
      "Lokasi command tidak cocok dengan konteks sesi.",
    );
  }
  return locationId;
}

export function requireOwner(context: AuthenticatedRequestContext): void {
  if (context.authorization.primary_role !== "OWNER") {
    throw new ApiError(
      403,
      "OWNER_APPROVAL_REQUIRED",
      "Publikasi ini memerlukan persetujuan OWNER.",
    );
  }
}
