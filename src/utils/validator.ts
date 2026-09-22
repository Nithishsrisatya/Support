import type { Response } from "express";

/**
 * Validates whether a value is a non-null, non-array plain object.
 */
export function isPlainObject(val: unknown): val is Record<string, any> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Validates whether a value is a string with optional length limits.
 */
export function isString(val: unknown, maxLength?: number): val is string {
  if (typeof val !== "string") return false;
  if (maxLength !== undefined && val.length > maxLength) return false;
  return true;
}

/**
 * Validates whether a value is a non-empty, non-whitespace string with optional max length.
 */
export function isNonEmptyString(val: unknown, maxLength?: number): val is string {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (trimmed.length === 0) return false;
  if (maxLength !== undefined && trimmed.length > maxLength) return false;
  return true;
}

/**
 * Validates email format and length.
 */
export function isEmail(val: unknown): val is string {
  if (!isNonEmptyString(val, 255)) return false;
  // Standard RFC-like email regex check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}

/**
 * Validates whether a value is included in a set of allowed enum strings.
 */
export function isEnum<T extends string>(val: unknown, allowed: readonly T[]): val is T {
  return typeof val === "string" && allowed.includes(val as T);
}

/**
 * Validates numeric values with optional range and integer checks.
 */
export function isNumber(
  val: unknown,
  options?: { min?: number; max?: number; integer?: boolean }
): val is number {
  if (typeof val !== "number" || isNaN(val) || !isFinite(val)) return false;
  if (options?.integer && !Number.isInteger(val)) return false;
  if (options?.min !== undefined && val < options.min) return false;
  if (options?.max !== undefined && val > options.max) return false;
  return true;
}

/**
 * Validates boolean values.
 */
export function isBoolean(val: unknown): val is boolean {
  return typeof val === "boolean";
}

/**
 * Validates date string parseability.
 */
export function isValidDateString(val: unknown): boolean {
  if (typeof val !== "string" || !val.trim()) return false;
  const parsed = new Date(val);
  return !isNaN(parsed.getTime());
}

/**
 * Validates an array of non-empty strings.
 */
export function isStringArray(
  val: unknown,
  options?: { minItems?: number; maxItems?: number }
): val is string[] {
  if (!Array.isArray(val)) return false;
  if (options?.minItems !== undefined && val.length < options.minItems) return false;
  if (options?.maxItems !== undefined && val.length > options.maxItems) return false;
  return val.every((item) => typeof item === "string" && item.trim().length > 0);
}

/**
 * Helper to return a standardized 400 Bad Request JSON response.
 */
export function sendValidationError(res: Response, message: string) {
  return res.status(400).json({
    success: false,
    message,
  });
}

/**
 * Validates whether a value is a valid identifier used in the application.
 * Accepts standard UUIDs and custom IDs matching alphanumeric/hyphen/underscore patterns
 * (e.g. U-1234, C-5678, TKT-9999, TSK-4321, LOG-123, NOTIF-456).
 * Strictly rejects path traversal, null bytes, SQL control characters, and whitespace.
 */
export function isValidId(val: unknown, maxLength: number = 100): val is string {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return false;
  if (trimmed !== val) return false; // Reject leading/trailing whitespace
  if (/[\0\r\n'";<>\\]/.test(val) || val.includes("..")) return false;
  // Accepts standard UUID format or custom system ID format
  return /^[A-Za-z0-9_.-]{1,100}$/.test(val);
}

/**
 * Validates standard RFC 4122 UUID format.
 */
export function isValidUuid(val: unknown): val is string {
  if (typeof val !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

/**
 * Sanitizes pagination parameters, ensuring non-negative offsets and bounded result sets.
 */
export function sanitizePagination(
  pageRaw: unknown,
  limitRaw: unknown,
  defaultLimit: number = 50,
  maxLimit: number = 100
): { page: number; limit: number; offset: number } {
  let page = typeof pageRaw === "number" ? pageRaw : parseInt(String(pageRaw || 1), 10);
  if (isNaN(page) || page < 1) {
    page = 1;
  }

  let limit = typeof limitRaw === "number" ? limitRaw : parseInt(String(limitRaw || defaultLimit), 10);
  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  } else if (limit > maxLimit) {
    limit = maxLimit;
  }

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Validates a date range, ensuring valid date formats and start <= end.
 */
export function isValidDateRange(
  startDateRaw: unknown,
  endDateRaw: unknown,
  maxDays?: number
): { valid: boolean; error?: string } {
  if (!isValidDateString(startDateRaw)) {
    return { valid: false, error: "Invalid start date format." };
  }
  if (!isValidDateString(endDateRaw)) {
    return { valid: false, error: "Invalid end date format." };
  }

  const start = new Date(String(startDateRaw));
  const end = new Date(String(endDateRaw));

  if (start.getTime() > end.getTime()) {
    return { valid: false, error: "Start date must be earlier than or equal to end date." };
  }

  if (maxDays !== undefined && maxDays > 0) {
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > maxDays) {
      return { valid: false, error: `Date range cannot exceed ${maxDays} days.` };
    }
  }

  return { valid: true };
}

/**
 * Sanitizes search query string. Handles unexpected arrays/objects and caps length.
 */
export function sanitizeSearchQuery(q: unknown, maxLength: number = 200): string {
  if (typeof q !== "string") {
    if (Array.isArray(q) && q.length > 0 && typeof q[0] === "string") {
      return q[0].trim().slice(0, maxLength);
    }
    return "";
  }
  return q.trim().slice(0, maxLength);
}

/**
 * Extracts only explicit allowed keys from an input object, ignoring everything else.
 */
export function filterAllowedFields<T extends Record<string, any>>(
  body: unknown,
  allowedKeys: readonly string[]
): Partial<T> {
  if (!isPlainObject(body)) return {};
  const filtered: Record<string, any> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      filtered[key] = body[key];
    }
  }
  return filtered as Partial<T>;
}
