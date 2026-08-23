import { ApiError } from "./http.js";

export function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationError(field, "harus berupa objek");
  }
  return value as Record<string, unknown>;
}

export function arrayValue(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw validationError(field, "harus berupa array");
  }
  return value;
}

export function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw validationError(field, "wajib berupa teks");
  }
  return value;
}

export function nullableStringValue(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return stringValue(value, field);
}

export function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw validationError(field, "wajib berupa boolean");
  }
  return value;
}

export function integerValue(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value < minimum) {
    throw validationError(field, `wajib bilangan bulat minimal ${minimum}`);
  }
  return value;
}

export function uuidValue(value: unknown, field: string): string {
  const text = stringValue(value, field);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      text,
    )
  ) {
    throw validationError(field, "harus berupa UUID");
  }
  return text;
}

export function timestampValue(value: unknown, field: string): string {
  const text = stringValue(value, field);
  const timestamp = new Date(text);
  if (Number.isNaN(timestamp.getTime())) {
    throw validationError(field, "harus berupa timestamp ISO yang valid");
  }
  return timestamp.toISOString();
}

export function enumValue<const T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw validationError(field, `harus salah satu dari ${allowed.join(", ")}`);
  }
  return value as T;
}

export function validationError(field: string, message: string): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", `${field} ${message}.`, { field });
}
