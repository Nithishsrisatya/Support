/**
 * HTML and Email Input Sanitization Utilities
 *
 * Provides functions to safely escape user-controlled or database-controlled
 * dynamic values before interpolating them into HTML emails and email headers,
 * preventing HTML injection, Cross-Site Scripting (XSS), and CRLF/header injection.
 */

/**
 * Safely escapes HTML special characters in dynamic values.
 * Maps:
 *   & -> &amp;
 *   < -> &lt;
 *   > -> &gt;
 *   " -> &quot;
 *   ' -> &#39;
 *
 * Handles null, undefined, numbers, and strings gracefully.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Sanitizes an email subject line to prevent SMTP/CRLF header injection.
 * Strips carriage returns (\r), newlines (\n), and unicode line breaks,
 * collapsing multiple whitespace characters into a single space and trimming.
 */
export function sanitizeSubject(subject: unknown): string {
  if (subject === null || subject === undefined) {
    return "";
  }
  return String(subject)
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sanitizes a URL for safe use in HTML href attributes.
 * Disallows dangerous URI schemes such as javascript:, data:, and vbscript:.
 * Strips control characters and returns an HTML-escaped URL or the safe fallback.
 */
export function sanitizeUrl(url: unknown, fallback: string = "#"): string {
  if (url === null || url === undefined) {
    return fallback;
  }
  const str = String(url).trim();
  if (!str) {
    return fallback;
  }

  // Disallow control characters
  const cleaned = str.replace(/[\x00-\x1F\x7F]/g, "");

  // Check for dangerous schemes
  if (/^\s*(javascript|data|vbscript)\s*:/i.test(cleaned)) {
    return fallback;
  }

  return escapeHtml(cleaned);
}

