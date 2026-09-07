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

export async function logEmail(
  from: string,
  to: string,
  subject: string,
  body: string,
  status: string = "Sent"
): Promise<EmailLog | null> {
  try {
    const result = await pool.query(
      `INSERT INTO email_logs (id, from_address, to_address, subject, body, status, created_date)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [from, to, subject, body, status]
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

