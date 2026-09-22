import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../src/db";
import { authenticateToken } from "../src/middleware/authMiddleware";
import { generateToken } from "../src/utils/jwt";
import { getJwtSecret } from "../src/config/env";
import { login } from "../src/services/authService";

describe("Account Status & Deactivated User Security Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const testUserId = `U-ACT-${Date.now().toString().slice(-6)}`;
  const testUserEmail = `testact-${Date.now()}@example.com`;
  const rawPassword = "TestPassword123!";

  const testClientId = `C-ACT-${Date.now().toString().slice(-6)}`;
  const testClientEmail = `testclient-${Date.now()}@testcompany.com`;

  let userToken: string;
  let clientToken: string;

  before(async () => {
    // 1. Create a password hash for the test users
    const hashed = await bcrypt.hash(rawPassword, 10);

    // 2. Insert test user with status = 'Active'
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [testUserId, "Active Test User", testUserEmail, hashed, "Employee", "Support", "Active", false]
    );

    // 3. Insert test client with status = 'Active'
    await pool.query(
      `INSERT INTO clients (id, company_name, company_domain, contact_person, email, "passwordHash", status, created_date, updated_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [testClientId, "Test Co", "testcompany.com", "Active Test Client", testClientEmail, hashed, "Active"]
    );

    // 4. Generate valid JWT tokens for user and client
    userToken = generateToken({
      id: testUserId,
      role: "Employee",
      email: testUserEmail,
      userType: "User",
    });

    clientToken = generateToken({
      id: testClientId,
      role: "Client",
      email: testClientEmail,
      userType: "Client",
    });

    // 5. Spin up Express app with a test endpoint using authenticateToken
    const app = express();
    app.use(express.json());

    app.get("/api/test-protected", authenticateToken, (req: any, res) => {
      res.json({
        success: true,
        user: req.user,
      });
    });

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
      await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    } catch (_) {}
    try {
      await pool.query(`DELETE FROM clients WHERE id = $1`, [testClientId]);
    } catch (_) {}
  });

  // ============================================================
  // ACTIVE USER ACCESS TESTS
  // ============================================================

  it("Active user can authenticate and access protected endpoints (200)", async () => {
    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.id, testUserId);
    assert.equal(data.user.role, "Employee");
    assert.equal(data.user.userType, "User");
  });

  // ============================================================
  // DEACTIVATED / INACTIVE USER REJECTION TESTS (401)
  // ============================================================

  it("Deactivated (Inactive) user cannot access protected endpoints with previously valid token (401)", async () => {
    // Deactivate user in the database
    await pool.query(`UPDATE users SET status = 'Inactive', updated_date = NOW() WHERE id = $1`, [testUserId]);

    // Use the existing, unexpired JWT token
    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for deactivated user, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /inactive or deactivated/i);
  });

  it("Suspended user cannot access protected endpoints with previously valid token (401)", async () => {
    // Set status to 'Suspended'
    await pool.query(`UPDATE users SET status = 'Suspended', updated_date = NOW() WHERE id = $1`, [testUserId]);

    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for suspended user, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /inactive or deactivated/i);
  });

  it("Disabled user cannot access protected endpoints with previously valid token (401)", async () => {
    // Set status to 'Disabled'
    await pool.query(`UPDATE users SET status = 'Disabled', updated_date = NOW() WHERE id = $1`, [testUserId]);

    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for disabled user, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /inactive or deactivated/i);
  });

  it("Reactivated user can immediately access protected endpoints again (200)", async () => {
    // Reactivate user in the database
    await pool.query(`UPDATE users SET status = 'Active', updated_date = NOW() WHERE id = $1`, [testUserId]);

    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(res.status, 200, `Expected 200 for reactivated user, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.id, testUserId);
  });

  // ============================================================
  // DELETED USER REJECTION TESTS (401)
  // ============================================================

  it("Deleted user cannot access protected endpoints with previously valid token (401)", async () => {
    // Delete the user from the database
    await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for deleted user, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /not found or has been deleted/i);
  });

  // ============================================================
  // CLIENT ACCOUNT STATUS TESTS
  // ============================================================

  it("Active client can authenticate and access protected endpoints (200)", async () => {
    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.id, testClientId);
    assert.equal(data.user.role, "Client");
    assert.equal(data.user.userType, "Client");
  });

  it("Deactivated client cannot access protected endpoints (401)", async () => {
    await pool.query(`UPDATE clients SET status = 'Inactive', updated_date = NOW() WHERE id = $1`, [testClientId]);

    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for deactivated client, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /inactive or deactivated/i);
  });

  it("Deleted client cannot access protected endpoints (401)", async () => {
    await pool.query(`DELETE FROM clients WHERE id = $1`, [testClientId]);

    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for deleted client, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /not found or has been deleted/i);
  });

  // ============================================================
  // STANDARD AUTHENTICATION REGRESSION & EDGE CASES
  // ============================================================

  it("Missing token returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/test-protected`);
    assert.equal(res.status, 401);
  });

  it("Invalid / tampered token returns 403", async () => {
    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: "Bearer invalid.token.payload" },
    });
    assert.equal(res.status, 403);
  });

  it("Expired token returns 401 with expiration message", async () => {
    const expiredToken = jwt.sign(
      { id: "U-1", role: "Employee", email: "test@example.com", userType: "User" },
      getJwtSecret(),
      { expiresIn: "-10s" }
    );
    const res = await fetch(`${baseUrl}/api/test-protected`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.message, /session has expired/i);
  });

  it("Normal login flow works for active user and rejects inactive user", async () => {
    // Re-create user as Active
    const hashed = await bcrypt.hash(rawPassword, 10);
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [testUserId, "Active Test User", testUserEmail, hashed, "Employee", "Support"]
    );

    // Login as active user -> should succeed
    const loginUser = await login(testUserEmail, rawPassword);
    assert.ok(loginUser);
    assert.equal(loginUser.id, testUserId);
    assert.equal(loginUser.status, "Active");

    // Deactivate user
    await pool.query(`UPDATE users SET status = 'Inactive' WHERE id = $1`, [testUserId]);

    // Login as deactivated user -> should fail (return null)
    const inactiveLogin = await login(testUserEmail, rawPassword);
    assert.equal(inactiveLogin, null);
  });
});

