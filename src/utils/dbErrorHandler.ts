import type { Response } from "express";

/**
 * Handles database and operational errors safely without exposing
 * internal database schemas, SQL statements, or stack traces to clients.
 */
export function handleDatabaseError(
  err: any,
  res: Response,
  fallbackMessage: string = "An unexpected error occurred."
) {
  // Always log full error server-side for operational diagnostics
  console.error("[Database Error]:", err?.code, err?.message || err);

  // PostgreSQL Error Code 23505: unique_violation
  if (err?.code === "23505") {
    const isEmail = typeof err?.detail === "string" && err.detail.toLowerCase().includes("email");
    return res.status(409).json({
      success: false,
      message: isEmail
        ? "An account with this email address already exists."
        : "A record with this identifier or unique value already exists.",
    });
  }

  // PostgreSQL Error Code 23503: foreign_key_violation
  if (err?.code === "23503") {
    return res.status(400).json({
      success: false,
      message: "Referenced entity does not exist or cannot be linked.",
    });
  }

  // PostgreSQL Error Code 22001: string_data_right_truncation
  if (err?.code === "22001") {
    return res.status(400).json({
      success: false,
      message: "One or more values exceed the maximum allowed length.",
    });
  }

  // PostgreSQL Error Code 22P02: invalid_text_representation (e.g. malformed UUID, invalid enum syntax)
  if (err?.code === "22P02") {
    return res.status(400).json({
      success: false,
      message: "Invalid data format or malformed identifier.",
    });
  }

  // PostgreSQL Error Code 22007: invalid_datetime_format
  if (err?.code === "22007") {
    return res.status(400).json({
      success: false,
      message: "Invalid date or time value provided.",
    });
  }

  // If the error message is a known client-safe domain error thrown intentionally in service layers
  const knownClientErrors = [
    "ticket not found",
    "task not found",
    "user not found",
    "client not found",
    "cannot delete client",
    "cannot delete employee",
    "completed tasks cannot be assigned",
    "company email must belong to the registered company domain",
  ];
  const lowerMsg = String(err?.message || "").toLowerCase();
  for (const clientErr of knownClientErrors) {
    if (lowerMsg.includes(clientErr)) {
      const statusCode = lowerMsg.includes("not found") ? 404 : 400;
      return res.status(statusCode).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Default to safe generic 500 error, never leaking SQL strings or database details
  const isProd = process.env.NODE_ENV === "production";
  return res.status(500).json({
    success: false,
    message: isProd ? fallbackMessage : (err?.message || fallbackMessage),
  });
}
