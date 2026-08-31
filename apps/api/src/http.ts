export const jsonHeaders = {
  "access-control-allow-headers":
    "content-type, authorization, idempotency-key, x-kastur-client, x-kastur-client-version, x-kastur-schema-version, x-kastur-device-id, x-kastur-setup-token, x-kastur-terminal-id, x-terminal-id, x-request-id",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "content-type": "application/json; charset=utf-8",
  "cross-origin-resource-policy": "cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export const MAX_JSON_REQUEST_BYTES = 1_048_576;

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly message: string;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function resolveCorsOrigin(
  request: Request,
  allowedOriginsConfig?: string,
): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  if (typeof allowedOriginsConfig === "string" && allowedOriginsConfig.trim() !== "") {
    const origins = allowedOriginsConfig
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    const normalizedOrigin = origin.toLowerCase();
    if (origins.includes(normalizedOrigin) || origins.includes("*")) {
      return origin;
    }
    if (
      /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/iu.test(origin)
    ) {
      return origin;
    }
    return null;
  }

  return origin;
}

export interface JsonResponseOptions {
  readonly allowedOrigins?: string | undefined;
  readonly request?: Request | undefined;
}

export function json(
  data: unknown,
  init: ResponseInit = {},
  options?: JsonResponseOptions,
): Response {
  const headers = new Headers(init.headers);

  for (const [name, value] of Object.entries(jsonHeaders)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }

  if (options?.request !== undefined) {
    const corsOrigin = resolveCorsOrigin(options.request, options.allowedOrigins);
    if (corsOrigin !== null) {
      headers.set("access-control-allow-origin", corsOrigin);
      headers.set("access-control-allow-credentials", "true");
      headers.set("vary", "Origin");
    } else {
      headers.delete("access-control-allow-origin");
      headers.delete("access-control-allow-credentials");
    }
  }

  return Response.json(data, { ...init, headers });
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (typeof error === "object" && error !== null && "code" in error) {
    const databaseError = error as {
      readonly code?: unknown;
      readonly constraint?: unknown;
    };
    const details =
      typeof databaseError.constraint === "string"
        ? { constraint: databaseError.constraint }
        : undefined;
    if (databaseError.code === "23505") {
      return new ApiError(
        409,
        "DOMAIN_UNIQUE_CONFLICT",
        "Data bisnis dengan identitas yang sama sudah ada.",
        details,
      );
    }
    if (databaseError.code === "23503") {
      return new ApiError(
        409,
        "DOMAIN_REFERENCE_CONFLICT",
        "Referensi data bisnis tidak valid atau sudah berubah.",
        details,
      );
    }
    if (databaseError.code === "23P01") {
      return new ApiError(
        409,
        "DOMAIN_OVERLAP_CONFLICT",
        "Periode authoritative bertumpang tindih dengan data yang sudah ada.",
        details,
      );
    }
    if (databaseError.code === "23502" || databaseError.code === "23514") {
      return new ApiError(
        409,
        "DOMAIN_CONSTRAINT_CONFLICT",
        "Invariant data bisnis tidak terpenuhi.",
        details,
      );
    }
    if (databaseError.code === "40001" || databaseError.code === "40P01") {
      return new ApiError(
        503,
        "DATABASE_RETRY_REQUIRED",
        "Transaksi bersamaan belum dapat diselesaikan; command aman untuk dicoba ulang.",
      );
    }
  }

  return new ApiError(500, "INTERNAL_ERROR", "Terjadi kesalahan internal.");
}

export function errorResponse(
  error: unknown,
  options?: JsonResponseOptions,
): Response {
  const normalized = normalizeApiError(error);
  const body: ApiErrorBody = {
    error: {
      code: normalized.code,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
      message: normalized.message,
    },
  };
  return json(body, { status: normalized.status }, options);
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "CONTENT_TYPE_REQUIRED", "Gunakan application/json.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && /^[0-9]+$/u.test(declaredLength)) {
    const length = Number.parseInt(declaredLength, 10);
    if (Number.isSafeInteger(length) && length > MAX_JSON_REQUEST_BYTES) {
      throw new ApiError(413, "REQUEST_TOO_LARGE", "Payload melebihi batas 1 MiB.");
    }
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_JSON_REQUEST_BYTES) {
    throw new ApiError(413, "REQUEST_TOO_LARGE", "Payload melebihi batas 1 MiB.");
  }

  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Payload JSON tidak valid.");
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_REQUEST", "Payload harus berupa objek JSON.");
  }

  return value as Record<string, unknown>;
}

export function requireString(
  value: unknown,
  field: string,
  options: { readonly nullable?: false } = {},
): string {
  void options;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} wajib diisi.`, {
      field,
    });
  }
  return value;
}

export function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (value === null || value.length === 0) {
    return fallback;
  }

  if (!/^[0-9]+$/u.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Nilai harus bilangan bulat positif.");
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Nilai harus berada antara 1 dan ${maximum}.`,
    );
  }

  return parsed;
}
