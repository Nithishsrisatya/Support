import { Router } from "express";
import { login } from "../services/authService";
import { generateToken } from "../utils/jwt";
import { sendEmail } from "../services/emailService";
import {
  forgotPasswordTemplate,
  resetPasswordConfirmationTemplate,
  adminResetPasswordTemplate,
} from "../templates/operationalEmails";
import { pool } from "../db";
import bcrypt from "bcrypt";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import { logAuditEvent } from "../services/auditLogService";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const user = await login(email, password);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }
    const token = generateToken(user);

    // Audit log: Login
    try {
      await logAuditEvent(
        user.id,
        user.fullName,
        "Login",
        user.userType === "Client" ? "Client" : "User",
        user.id,
        `User ${user.fullName} logged in successfully.`
      );
    } catch (logErr) {
      console.error("Failed to log audit event:", logErr);
    }

    res.json({
      success: true,
      message: "Login successful.",
      token,
      user,
    });
  } catch (error) {
    console.error("Login Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error.",
    });
  }
});

import crypto from "crypto";

const RESET_TOKEN_EXPIRY_MINUTES = 30; // Tokens expire in 30 minutes

// POST /api/auth/forgot-password
// Sends a cryptographically secure single-use password reset link email
router.post("/forgot-password", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }

    // 1. Check users table
    let userType: "User" | "Client" = "User";
    let userId: string | null = null;
    let userName: string | null = null;

    const userResult = await pool.query(
      `SELECT id, full_name AS "fullName", email FROM users WHERE LOWER(email) = $1 AND status = 'Active'`,
      [email]
    );

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      userName = userResult.rows[0].fullName;
      userType = "User";
    } else {
      // 2. Check clients table
      const clientResult = await pool.query(
        `SELECT id, contact_person AS "fullName", email FROM clients WHERE LOWER(email) = $1 AND status = 'Active'`,
        [email]
      );
      if (clientResult.rows.length > 0) {
        userId = clientResult.rows[0].id;
        userName = clientResult.rows[0].fullName;
        userType = "Client";
      }
    }

    // If an account is found, generate secure token and send email
    if (userId && userName) {
      // Generate 256 bits (32 bytes) cryptographically random hex token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

      // Invalidate any previous unused tokens for this user/email
      await pool.query(
        `UPDATE password_reset_tokens SET used_at = NOW() WHERE email = $1 AND used_at IS NULL`,
        [email]
      );

      // Save hashed token (never save raw token)
      await pool.query(
        `INSERT INTO password_reset_tokens (id, user_id, user_type, email, token_hash, expires_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
        [userId, userType, email, tokenHash, expiresAt]
      );

      const resetLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${rawToken}`;
      const html = forgotPasswordTemplate(userName, resetLink);
      await sendEmail(email, "Password Reset Request - Complify Support", html);
    }

    // User enumeration protection: Always return the identical response
    res.json({
      success: true,
      message: "If an account with this email exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ success: false, message: "Failed to process password reset request." });
  }
});

// POST /api/auth/verify-reset-token
// Validates whether a reset token is valid and unexpired before rendering the form
router.post("/verify-reset-token", async (req, res) => {
  try {
    const token = (req.body?.token || req.query?.token || "").toString().trim();
    if (!token || token.length !== 64) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      `SELECT id, email, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
    }

    const tokenRecord = result.rows[0];
    if (tokenRecord.used_at !== null || new Date(tokenRecord.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
    }

    res.json({ success: true, message: "Reset token is valid." });
  } catch (error) {
    console.error("Verify Reset Token Error:", error);
    res.status(500).json({ success: false, message: "Failed to verify reset token." });
  }
});

// POST /api/auth/reset-password
// Resets password using a verified single-use cryptographic token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== "string" || token.trim().length !== 64) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    }

    const rawToken = token.trim();
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Query matching token from DB
    const tokenResult = await pool.query(
      `SELECT id, user_id, user_type, email, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
    }

    const tokenRecord = tokenResult.rows[0];

    // Check if already used
    if (tokenRecord.used_at !== null) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
    }

    // Check if expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    let userName = "";
    let userEmail = tokenRecord.email;

    if (tokenRecord.user_type === "User") {
      const updateRes = await pool.query(
        `UPDATE users SET password_hash = $1, first_login = FALSE, updated_date = NOW()
         WHERE id = $2 AND status = 'Active' RETURNING full_name, email`,
        [hashedPassword, tokenRecord.user_id]
      );
      if (updateRes.rows.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
      }
      userName = updateRes.rows[0].full_name;
      userEmail = updateRes.rows[0].email;
    } else {
      const updateRes = await pool.query(
        `UPDATE clients SET "passwordHash" = $1, first_login = FALSE, updated_date = NOW()
         WHERE id = $2 AND status = 'Active' RETURNING contact_person, email`,
        [hashedPassword, tokenRecord.user_id]
      );
      if (updateRes.rows.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid or expired password reset link." });
      }
      userName = updateRes.rows[0].contact_person;
      userEmail = updateRes.rows[0].email;
    }

    // Mark token and any other unused tokens for this user as used
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE (id = $1 OR user_id = $2) AND used_at IS NULL`,
      [tokenRecord.id, tokenRecord.user_id]
    );

    // Send confirmation email
    try {
      const html = resetPasswordConfirmationTemplate(userName);
      await sendEmail(userEmail, "Password Changed Successfully - Complify Support", html);
    } catch (emailErr) {
      console.error("Failed to send password changed confirmation email:", emailErr);
    }

    // Audit log
    try {
      await logAuditEvent(
        tokenRecord.user_id,
        userName,
        "Password Reset",
        tokenRecord.user_type === "Client" ? "Client" : "User",
        tokenRecord.user_id,
        `Password reset completed successfully via secure token for ${userName} (${userEmail}).`
      );
    } catch (logErr) {
      console.error("Failed to log audit event:", logErr);
    }

    res.json({
      success: true,
      message: "Password has been reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ success: false, message: "Failed to reset password." });
  }
});

// POST /api/auth/admin-reset-password/:userId
// Admin forcibly resets another user's password
router.post(
  "/admin-reset-password/:userId",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      const targetUserId = req.params.userId;
      const adminName = (req as any).user?.fullName || "Administrator";
      const tempPassword = "Temp" + Math.random().toString(36).slice(2, 8) + "123!";

      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Try users table first
      let result = await pool.query(
        `UPDATE users SET password_hash = $1, first_login = TRUE, updated_date = NOW() WHERE id = $2 AND status = 'Active' RETURNING full_name, email`,
        [hashedPassword, targetUserId]
      );

      let userEmail = "";
      let userName = "";

      if (result.rows.length > 0) {
        userEmail = result.rows[0].email;
        userName = result.rows[0].full_name;
      } else {
        // Try clients table
        result = await pool.query(
          `UPDATE clients SET "passwordHash" = $1, first_login = TRUE, updated_date = NOW() WHERE id = $2 AND status = 'Active' RETURNING contact_person, email`,
          [hashedPassword, targetUserId]
        );
        if (result.rows.length > 0) {
          userEmail = result.rows[0].email;
          userName = result.rows[0].contact_person;
        }
      }

      if (!userEmail) {
        return res.status(404).json({ success: false, message: "User not found or inactive." });
      }

      // Send admin reset email
      const html = adminResetPasswordTemplate(userName, tempPassword, adminName);
      await sendEmail(userEmail, "Your Password Has Been Reset by an Administrator", html);

      // Audit log: Admin Password Reset
      try {
        await logAuditEvent(
          (req as any).user?.id || "ADMIN",
          adminName,
          "Password Reset",
          "User",
          targetUserId,
          `Administrator ${adminName} forcibly reset password for ${userName} (${userEmail}).`
        );
      } catch (logErr) {
        console.error("Failed to log audit event:", logErr);
      }

      res.json({
        success: true,
        message: `Password for ${userName} has been reset. A notification email has been sent.`,
        temporaryPassword: tempPassword,
      });
    } catch (error) {
      console.error("Admin Reset Password Error:", error);
      res.status(500).json({ success: false, message: "Failed to reset password." });
    }
  }
);

export default router;
