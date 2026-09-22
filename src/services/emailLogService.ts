import { pool } from "../db";

export interface EmailLog {
  id: string;
  from_address: string;
  to_address: string;
  subject: string;
  body: string;
  status: string;
  created_date: string;
}

/**
 * Sanitizes an email body by redacting temporary passwords, credentials,
 * and one-time reset tokens before persistence in logs or console output.
 */
export function sanitizeEmailBody(body: string): string {
  if (!body || typeof body !== "string") return body;

  let sanitized = body;

  // 1. Employee welcome email: <td><b>Password</b></td><td>...</td>
  sanitized = sanitized.replace(
    /(<td>\s*<b>Password<\/b>\s*<\/td>\s*<td>)([^<]+)(<\/td>)/gi,
    "$1[REDACTED]$3"
  );

  // 2. Client welcome template: <strong>Temporary Password:</strong> <span ...>...</span>
  sanitized = sanitized.replace(
    /(<strong>\s*Temporary Password:\s*<\/strong>\s*<span[^>]*>)([^<]+)(<\/span>)/gi,
    "$1[REDACTED]$3"
  );

  // 3. Admin reset password template: YOUR TEMPORARY PASSWORD ... <span ...>...</span>
  sanitized = sanitized.replace(
    /(YOUR TEMPORARY PASSWORD\s*<\/p>\s*<p[^>]*>\s*<span[^>]*>)([^<]+)(<\/span>)/gi,
    "$1[REDACTED]$3"
  );

  // 4. One-time reset token URL parameter: reset-password?token=...
  sanitized = sanitized.replace(
    /(reset-password\?token=)[a-zA-Z0-9_-]+/gi,
    "$1[REDACTED]"
  );

  // 5. Generic inline temporary password statements
  sanitized = sanitized.replace(
    /((?:temporary\s+)?password\s*[:=]\s*)([^\s<"']+)/gi,
    "$1[REDACTED]"
  );

  return sanitized;
}

export async function logEmail(
  from: string,
  to: string,
  subject: string,
  body: string,
  status: string = "Sent"
): Promise<EmailLog | null> {
  try {
    const sanitizedBody = sanitizeEmailBody(body);
    const result = await pool.query(
      `INSERT INTO email_logs (id, from_address, to_address, subject, body, status, created_date)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [from, to, subject, sanitizedBody, status]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Failed to log email:", error);
    return null;
  }
}

export async function getAllEmailLogs(): Promise<EmailLog[]> {
  const result = await pool.query(
    `SELECT
      id,
      from_address AS "fromAddress",
      to_address AS "toAddress",
      subject,
      body,
      status,
      created_date AS "createdDate"
    FROM email_logs
    ORDER BY created_date DESC
    LIMIT 100`
  );
  return result.rows;
}

export async function getEmailLogsByRecipient(email: string): Promise<EmailLog[]> {
  const result = await pool.query(
    `SELECT
      id,
      from_address AS "fromAddress",
      to_address AS "toAddress",
      subject,
      body,
      status,
      created_date AS "createdDate"
    FROM email_logs
    WHERE to_address = $1
    ORDER BY created_date DESC`,
    [email]
  );
  return result.rows;
}

export async function getEmailLogsByStatus(status: string): Promise<EmailLog[]> {
  const result = await pool.query(
    `SELECT
      id,
      from_address AS "fromAddress",
      to_address AS "toAddress",
      subject,
      body,
      status,
      created_date AS "createdDate"
    FROM email_logs
    WHERE status = $1
    ORDER BY created_date DESC`,
    [status]
  );
  return result.rows;
}

