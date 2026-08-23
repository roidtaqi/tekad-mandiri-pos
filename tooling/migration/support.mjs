// @ts-check

import { createHash } from "node:crypto";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {string} field @returns {Record<string, unknown>} */
export function requireRecord(value, field) {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  return value;
}

/** @param {unknown} value @param {string} field */
export function requireString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

/** @param {unknown} value @param {string} field */
export function requireUuid(value, field) {
  const text = requireString(value, field);
  if (!UUID_PATTERN.test(text)) throw new Error(`${field} must be an explicit UUID.`);
  return text.toLowerCase();
}

/** @param {unknown} value @param {string} field */
export function requireIsoTimestamp(value, field) {
  const text = requireString(value, field);
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || !text.includes("T")) {
    throw new Error(`${field} must be an ISO timestamp with a time component.`);
  }
  return date.toISOString();
}

/** @param {unknown} value */
export function optionalText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** @param {unknown} value */
export function sourceBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "active", "aktif", "ya"].includes(normalized)) return true;
    if (["false", "0", "no", "inactive", "nonaktif", "tidak"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

/** @param {string} value */
export function normalizeEvidence(value) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

/** @param {string} value */
export function normalizeSku(value) {
  return value.trim().normalize("NFKC").toLocaleUpperCase("en-US");
}

/** @param {string} value */
export function normalizeUnitCode(value) {
  const code = value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleUpperCase("en-US")
    .replace(/[^A-Z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return code.length > 0 ? code : null;
}

/** @param {...string} parts */
export function deterministicUuid(...parts) {
  const bytes = createHash("sha256").update(parts.join("\u001f"), "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** @param {unknown} value */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/** @param {unknown} value */
export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

/** @param {string} value */
export function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Parse every JSON numeric literal as its original decimal string. This avoids
 * first rounding legacy money/quantity through JavaScript Number.
 * @param {string} text
 * @param {string} [label]
 */
export function parseLosslessJson(text, label = "JSON") {
  try {
    return JSON.parse(text, (_key, value, context) => {
      if (typeof value === "number") {
        if (typeof context?.source !== "string") {
          throw new Error("Runtime does not expose the original JSON numeric literal.");
        }
        return context.source;
      }
      return value;
    });
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** @param {unknown} value @param {string} key */
export function arrayAt(value, key) {
  if (!isRecord(value)) return [];
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate.filter(isRecord) : [];
}

/** @param {unknown} value */
export function stableSourceId(value) {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}
