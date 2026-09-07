import dotenv from "dotenv";

dotenv.config();

const INSECURE_DEFAULT_SECRETS = ["ComplifySupportSecret", "secret", "password", "123456", "defaultsecret"];

/**
 * Returns the JWT secret for token signing and verification.
 * In production mode, strictly refuses default or missing secrets.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!secret || INSECURE_DEFAULT_SECRETS.includes(secret) || secret.length < 16) {
      throw new Error(
        "[FATAL CONFIG ERROR] Insecure or missing JWT_SECRET in production. " +
        "You must configure a strong, high-entropy JWT_SECRET (min 16 chars) in your production environment."
      );
    }
    return secret;
  }

  // Development fallback
  return secret || "ComplifySupportSecret";
}

/**
 * Resolves allowed CORS origins.
 * In production, strictly reads from CORS_ORIGIN or FRONTEND_URL.
 * In development, allows localhost origins.
 */
export function getCorsOrigins(): string[] | string | boolean {
  const isProd = process.env.NODE_ENV === "production";
  const configuredOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL;

  if (isProd) {
    if (!configuredOrigin || configuredOrigin.trim() === "*") {
      throw new Error(
        "[FATAL CONFIG ERROR] Wildcard or missing CORS_ORIGIN / FRONTEND_URL in production. " +
        "Please specify explicit allowed origin(s) in CORS_ORIGIN or FRONTEND_URL."
      );
    }

    // Support comma-separated list of origins if provided
    const origins = configuredOrigin
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    return origins.length === 1 ? origins[0] : origins;
  }

  // Development defaults: allow localhost dev ports and same-origin
  const devOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  if (configuredOrigin && configuredOrigin !== "*") {
    devOrigins.push(...configuredOrigin.split(",").map((o) => o.trim()).filter(Boolean));
  }

  return devOrigins;
}

/**
 * Validates production environment configuration on server boot.
 */
export function validateProductionEnv(): void {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    return; // Development mode is safe to continue with defaults
  }

  // Database validation: Support either DATABASE_URL or granular DB_* parameters
  const hasDatabaseUrl = !!process.env.DATABASE_URL?.trim();
  if (!hasDatabaseUrl) {
    const requiredDbVars = [
      "DB_HOST",
      "DB_PORT",
      "DB_USER",
      "DB_PASSWORD",
      "DB_NAME",
    ];

    const missingDb: string[] = [];
    for (const v of requiredDbVars) {
      if (!process.env[v] || process.env[v]?.trim() === "") {
        missingDb.push(v);
      }
    }

    if (missingDb.length > 0) {
      throw new Error(
        `[FATAL CONFIG ERROR] Missing database configuration. Provide DATABASE_URL or set: ${missingDb.join(", ")}`
      );
    }
  }

  // Validate Frontend URL in production
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!frontendUrl || frontendUrl === "*" || frontendUrl.startsWith("http://localhost")) {
    throw new Error(
      "[FATAL CONFIG ERROR] Insecure or missing FRONTEND_URL in production. " +
      "Please set FRONTEND_URL to your public domain (e.g. https://support.yourcompany.com)."
    );
  }

  // Validate JWT Secret
  getJwtSecret();

  // Validate CORS / Frontend URL
  getCorsOrigins();

  // Validate SMTP configuration
  const smtpVars = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
  const missingSmtp = smtpVars.filter((v) => !process.env[v] || process.env[v]?.trim() === "");
  if (missingSmtp.length > 0) {
    console.warn(
      `⚠️ [CONFIG WARNING] SMTP environment variables not fully configured: ${missingSmtp.join(", ")}. Email sending will run in preview/fallback mode.`
    );
  }
}

