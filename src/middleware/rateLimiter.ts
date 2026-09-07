import rateLimit from "express-rate-limit";

const isProd = process.env.NODE_ENV === "production";

/**
 * Authentication Rate Limiter
 * Limits rapid authentication attempts (login, forgot-password, reset-password)
 * In production: 15 requests per 15 minutes per IP.
 * In development/test: 100 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.AUTH_RATE_LIMIT_MAX
    ? Number(process.env.AUTH_RATE_LIMIT_MAX)
    : isProd
    ? 15
    : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes.",
  },
  skip: () => process.env.NODE_ENV === "test" || process.env.DISABLE_RATE_LIMIT === "true",
});

/**
 * Attachment Upload Rate Limiter
 * Protects against disk exhaustion and DoS via rapid file uploads.
 * 50 uploads per 15 minutes per IP (200 in dev/test).
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.UPLOAD_RATE_LIMIT_MAX
    ? Number(process.env.UPLOAD_RATE_LIMIT_MAX)
    : isProd
    ? 50
    : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Upload rate limit exceeded. Please try again later.",
  },
  skip: () => process.env.NODE_ENV === "test" || process.env.DISABLE_RATE_LIMIT === "true",
});

/**
 * General API Rate Limiter
 * 500 requests per 15 minutes per IP across standard API routes (2000 in dev/test).
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.API_RATE_LIMIT_MAX
    ? Number(process.env.API_RATE_LIMIT_MAX)
    : isProd
    ? 500
    : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP. Please try again later.",
  },
  skip: () => process.env.NODE_ENV === "test" || process.env.DISABLE_RATE_LIMIT === "true",
});
