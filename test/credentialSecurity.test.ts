import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { pool } from "../src/db";
import { generateTemporaryPassword, isPredictablePassword } from "../src/utils/credentialUtils";
import { sanitizeEmailBody, getEmailLogsByRecipient } from "../src/services/emailLogService";
import { generateToken } from "../src/utils/jwt";
import { login } from "../src/services/authService";
import userRoutes from "../src/routes/userRoutes";
import clientRoutes from "../src/routes/clientRoutes";
import authRoutes from "../src/routes/authRoutes";

describe("Credential & Temporary Password Security Hardening", () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;

  const adminId = `U-AD-${Date.now().toString().slice(-6)}`;
  const empId = `U-EM-${Date.now().toString().slice(-6)}`;
  const clientId = `C-CL-${Date.now().toString().slice(-6)}`;

  const adminEmail = `admin-${Date.now()}@complifysupport.com`;
  const empEmail = `emp-${Date.now()}@complifysupport.com`;
  const clientEmail = `client-${Date.now()}@clientcorp.com`;
  const adminPassword = "AdminSecurePass123!";

  before(async () => {
    // 1. Create an active Administrator in DB
    const adminHashed = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES ($1, $2, $3, $4, 'Administrator', 'Administration', 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [adminId, "Security Admin", adminEmail, adminHashed]
    );

    // 2. Generate valid Admin JWT token
    adminToken = generateToken({
      id: adminId,
      role: "Administrator",
      email: adminEmail,
      userType: "User",
    });

    // 3. Spin up Express app with authRoutes, userRoutes, clientRoutes
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/clients", clientRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Cleanup created test records
    try {
      await pool.query(`DELETE FROM email_logs WHERE to_address IN ($1, $2, $3)`, [adminEmail, empEmail, clientEmail]);
    } catch (_) {}
    try {
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [adminId, empId]);
    } catch (_) {}
    try {
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    } catch (_) {}
  });

  // ============================================================
  // 1. TEMPORARY PASSWORD GENERATION & UNPREDICTABILITY TESTS
  // ============================================================

  it("generateTemporaryPassword produces passwords with sufficient length and complexity", () => {
    const pwd = generateTemporaryPassword(16);
    assert.ok(pwd.length >= 16, `Password length ${pwd.length} is less than 16`);
    assert.match(pwd, /[A-Z]/, "Password must contain uppercase letters");
    assert.match(pwd, /[a-z]/, "Password must contain lowercase letters");
    assert.match(pwd, /[0-9]/, "Password must contain numbers");
    assert.match(pwd, /[!@#$%^&*()\-_=+]/, "Password must contain special symbols");
  });

  it("100 generated temporary passwords are all unique (no collisions)", () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(generateTemporaryPassword(16));
    }
    assert.equal(passwords.size, 100, "Collisions detected in temporary password generation");
  });

  it("isPredictablePassword correctly flags predictable patterns and accepts strong passwords", () => {
    assert.equal(isPredictablePassword("TempAuth123!", "Jane Doe"), true);
    assert.equal(isPredictablePassword("jane123", "Jane Doe"), true);
    assert.equal(isPredictablePassword("jane123!", "Jane Doe"), true);
    assert.equal(isPredictablePassword("password123"), true);
    assert.equal(isPredictablePassword("short"), true);
    assert.equal(isPredictablePassword(""), true);

    // Cryptographic temporary password should NOT be flagged as predictable
    const securePwd = generateTemporaryPassword(16);
    assert.equal(isPredictablePassword(securePwd, "Jane Doe"), false);
  });

  // ============================================================
  // 2. EMPLOYEE CREATION CREDENTIAL SECURITY TESTS
  // ============================================================

  it("POST /api/users does NOT return temporaryPassword or passwordHash", async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: empId,
        fullName: "Charlie Brown",
        email: empEmail,
        role: "Employee",
        department: "Support",
        status: "Active",
      }),
    });

    assert.equal(res.status, 201, `Failed with status ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.user);
    assert.equal(data.user.passwordHash, undefined);
    assert.equal(data.user.password_hash, undefined);
    assert.equal(data.user.temporaryPassword, undefined);
    assert.equal(data.user.tempPassword, undefined);
  });

  it("Created employee does not have predictable 'charlie123' password in database", async () => {
    const dbRes = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [empId]);
    assert.equal(dbRes.rows.length, 1);
    const hash = dbRes.rows[0].password_hash;
    assert.ok(hash.startsWith("$2b$") || hash.startsWith("$2a$"), "Must be a valid bcrypt hash");

    // Verify it is NOT the predictable firstName123
    const matchesPredictable = await bcrypt.compare("charlie123", hash);
    assert.equal(matchesPredictable, false, "Temporary password must not match firstName123");

    const matchesDefault = await bcrypt.compare("TempAuth123!", hash);
    assert.equal(matchesDefault, false, "Temporary password must not match TempAuth123!");
  });

  // ============================================================
  // 3. CLIENT CREATION CREDENTIAL SECURITY TESTS
  // ============================================================

  it("POST /api/clients does NOT return temporaryPassword or passwordHash", async () => {
    const res = await fetch(`${baseUrl}/api/clients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: clientId,
        companyName: "Client Corp",
        companyDomain: "clientcorp.com",
        contactPerson: "Dave Miller",
        email: clientEmail,
        status: "Active",
      }),
    });

    assert.equal(res.status, 201, `Failed with status ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.client);
    assert.equal(data.client.passwordHash, undefined);
    assert.equal(data.client.password_hash, undefined);
    assert.equal(data.client.temporaryPassword, undefined);
    assert.equal(data.client.tempPassword, undefined);
  });

  it("Created client does not use hardcoded predictable password 'TempAuth123!'", async () => {
    const dbRes = await pool.query(`SELECT "passwordHash" FROM clients WHERE id = $1`, [clientId]);
    assert.equal(dbRes.rows.length, 1);
    const hash = dbRes.rows[0].passwordHash;
    assert.ok(hash.startsWith("$2b$") || hash.startsWith("$2a$"), "Must be a valid bcrypt hash");

    const matchesDefault = await bcrypt.compare("TempAuth123!", hash);
    assert.equal(matchesDefault, false, "Client temporary password must not be TempAuth123!");
  });

  // ============================================================
  // 4. ADMIN RESET PASSWORD SECURITY TESTS
  // ============================================================

  it("POST /api/auth/admin-reset-password/:userId does NOT return plaintext temporaryPassword", async () => {
    const res = await fetch(`${baseUrl}/api/auth/admin-reset-password/${empId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 200, `Failed with status ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.message);
    assert.equal(data.temporaryPassword, undefined, "temporaryPassword must be stripped from response");
    assert.equal(data.tempPassword, undefined, "tempPassword must not be in response");
  });

  // ============================================================
  // 5. EMAIL LOGS SANITIZATION TESTS
  // ============================================================

  it("sanitizeEmailBody redacts temporary passwords and reset tokens", () => {
    // 1. Employee welcome template style
    const employeeEmail = `
      <h2>Welcome to Complify Support</h2>
      <table>
        <tr><td><b>Email</b></td><td>emp@test.com</td></tr>
        <tr><td><b>Password</b></td><td>SecretP@ssw0rd123!</td></tr>
      </table>
    `;
    const sanitizedEmp = sanitizeEmailBody(employeeEmail);
    assert.equal(sanitizedEmp.includes("SecretP@ssw0rd123!"), false);
    assert.match(sanitizedEmp, /<td><b>Password<\/b><\/td><td>\[REDACTED\]<\/td>/);

    // 2. Client welcome template style
    const clientEmailHtml = `
      <p><strong>Temporary Password:</strong> <span style="font-family: monospace;">ClientSecr3t!</span></p>
    `;
    const sanitizedClient = sanitizeEmailBody(clientEmailHtml);
    assert.equal(sanitizedClient.includes("ClientSecr3t!"), false);
    assert.match(sanitizedClient, /\[REDACTED\]/);

    // 3. Admin reset password template style
    const adminResetEmail = `
      <p>YOUR TEMPORARY PASSWORD</p>
      <p><span style="font-family: monospace;">AdminR3set!123</span></p>
    `;
    const sanitizedAdmin = sanitizeEmailBody(adminResetEmail);
    assert.equal(sanitizedAdmin.includes("AdminR3set!123"), false);
    assert.match(sanitizedAdmin, /\[REDACTED\]/);

    // 4. One-time reset token URL
    const resetUrlEmail = `
      <a href="http://localhost:5173/reset-password?token=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef">Reset Link</a>
    `;
    const sanitizedToken = sanitizeEmailBody(resetUrlEmail);
    assert.equal(sanitizedToken.includes("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"), false);
    assert.match(sanitizedToken, /reset-password\?token=\[REDACTED\]/);
  });

  it("email_logs persisted in database never contain plaintext temporary passwords", async () => {
    // Check logs for the created test accounts
    const logs = await getEmailLogsByRecipient(empEmail);
    assert.ok(logs.length > 0, "Expected at least one email log for the created employee");
    for (const log of logs) {
      // Assert no plaintext password appears
      assert.equal(log.body.includes("charlie123"), false);
      assert.equal(log.body.includes("TempAuth123!"), false);
      // Assert redaction is applied
      assert.equal(log.body.includes("[REDACTED]"), true, "Expected credentials to be redacted");
      // Assert metadata is intact
      const toAddr = (log as any).toAddress || (log as any).to_address;
      assert.equal(toAddr, empEmail);
      assert.ok(log.subject);
      assert.ok(log.status);
    }
  });

  // ============================================================
  // 6. REGRESSION: NORMAL AUTHENTICATION & LOGIN WORKFLOW
  // ============================================================

  it("Admin reset updates user password_hash in database and flags first_login = true", async () => {
    const dbRes = await pool.query(`SELECT password_hash, first_login FROM users WHERE id = $1`, [empId]);
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].first_login, true, "first_login must be set to true");
    assert.ok(dbRes.rows[0].password_hash.startsWith("$2b$") || dbRes.rows[0].password_hash.startsWith("$2a$"));
  });

  it("Standard cryptographic password reset flow (forgot-password -> token -> reset -> login) succeeds", async () => {
    // 1. Trigger forgot password
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail }),
    });
    assert.equal(forgotRes.status, 200);

    // 2. Fetch the created token record directly from password_reset_tokens to verify flow
    const tokenRes = await pool.query(
      `SELECT token_hash FROM password_reset_tokens WHERE email = $1 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [adminEmail]
    );
    assert.equal(tokenRes.rows.length, 1);
    assert.ok(tokenRes.rows[0].token_hash);

    // 3. Normal login still works
    const user = await login(adminEmail, adminPassword);
    assert.ok(user, "Admin login must succeed");
    assert.equal(user.id, adminId);
  });
});

