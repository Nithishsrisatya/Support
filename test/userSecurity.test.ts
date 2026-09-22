import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { pool } from "../src/db";
import { getAllUsers, getUserById, createUser, updateUser } from "../src/services/userService";
import { getAllClients } from "../src/services/clientService";
import { getAllTickets } from "../src/services/ticketService";
import { getAllTasks } from "../src/services/taskService";
import { getAllNotifications } from "../src/services/notificationService";
import { getAllAuditLogs } from "../src/services/auditLogService";
import userRoutes from "../src/routes/userRoutes";
import clientRoutes from "../src/routes/clientRoutes";
import { authenticateToken } from "../src/middleware/authMiddleware";
import { authorizeRoles } from "../src/middleware/roleMiddleware";
import { generateToken } from "../src/utils/jwt";
import { login } from "../src/services/authService";

describe("Password Hash Exposure Security Hardening", () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  const testUserId = `TU-${Date.now().toString().slice(-8)}`;
  const testClientId = `TC-${Date.now().toString().slice(-8)}`;

  before(async () => {
    // Generate valid admin token
    adminToken = generateToken({
      id: "U-1",
      role: "Administrator",
      email: "admin@complifysupport.com",
      userType: "User",
    });

    // Create a lightweight test Express app matching server.ts routing
    const app = express();
    app.use(express.json());

    app.use("/api/users", userRoutes);
    app.use("/api/clients", clientRoutes);

    // Mount /api/state exactly as in server.ts
    app.get("/api/state", authenticateToken, authorizeRoles(["Administrator"]), async (req, res) => {
      try {
        const [
          users,
          clients,
          tickets,
          tasks,
          notifications,
          auditLogs,
        ] = await Promise.all([
          getAllUsers(),
          getAllClients(),
          getAllTickets(),
          getAllTasks(),
          getAllNotifications(),
          getAllAuditLogs(),
        ]);

        res.json({
          users,
          clients,
          tickets,
          tasks,
          notifications,
          auditLogs,
        });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to load application state" });
      }
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
    // Clean up created test entities
    try {
      await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    } catch (_) {}
    try {
      await pool.query(`DELETE FROM clients WHERE id = $1`, [testClientId]);
    } catch (_) {}

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await pool.end();
  });

  it("POST /api/users does NOT return passwordHash or password_hash", async () => {
    const rawPassword = "SecurePass123!";
    const res = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: testUserId,
        fullName: "Test Security User",
        email: `testsec-${Date.now()}@example.com`,
        passwordHash: rawPassword,
        role: "Employee",
        department: "Support",
        managerId: null,
        status: "Active",
        firstLogin: true,
      }),
    });

    assert.equal(res.status, 201, `Failed with status ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.user, "Expected response to contain user object");

    // Must NEVER contain passwordHash or password_hash
    assert.equal("passwordHash" in data.user, false, "Response user contains passwordHash");
    assert.equal("password_hash" in data.user, false, "Response user contains password_hash");
    assert.equal(data.user.passwordHash, undefined);
    assert.equal(data.user.password_hash, undefined);

    // Verify safe fields are properly returned
    assert.equal(data.user.id, testUserId);
    assert.equal(data.user.fullName, "Test Security User");
    assert.equal(data.user.role, "Employee");
  });

  it("GET /api/users does NOT contain passwordHash or password_hash in any user record", async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 200);
    const users = await res.json();
    assert.ok(Array.isArray(users), "Expected users to be an array");
    assert.ok(users.length > 0, "Expected at least one user");

    for (const user of users) {
      assert.equal("passwordHash" in user, false, `User ${user.id} contains passwordHash`);
      assert.equal("password_hash" in user, false, `User ${user.id} contains password_hash`);
      assert.equal(user.passwordHash, undefined);
      assert.equal(user.password_hash, undefined);
    }
  });

  it("GET /api/users/:id does NOT return passwordHash or password_hash", async () => {
    const res = await fetch(`${baseUrl}/api/users/${testUserId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 200);
    const user = await res.json();
    assert.equal(user.id, testUserId);

    // Must NEVER contain passwordHash or password_hash
    assert.equal("passwordHash" in user, false, "User detail contains passwordHash");
    assert.equal("password_hash" in user, false, "User detail contains password_hash");
    assert.equal(user.passwordHash, undefined);
    assert.equal(user.password_hash, undefined);
  });

  it("PUT /api/users/:id does NOT return passwordHash or password_hash", async () => {
    const res = await fetch(`${baseUrl}/api/users/${testUserId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        fullName: "Updated Security User",
        department: "Operations",
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.user, "Expected response to contain user object");

    // Must NEVER contain passwordHash or password_hash
    assert.equal("passwordHash" in data.user, false, "Updated user contains passwordHash");
    assert.equal("password_hash" in data.user, false, "Updated user contains password_hash");
    assert.equal(data.user.passwordHash, undefined);
    assert.equal(data.user.password_hash, undefined);
    assert.equal(data.user.fullName, "Updated Security User");
    assert.equal(data.user.department, "Operations");
  });

  it("GET /api/state does NOT contain passwordHash or password_hash in users or clients", async () => {
    const res = await fetch(`${baseUrl}/api/state`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 200);
    const state = await res.json();

    assert.ok(Array.isArray(state.users), "State must have users array");
    for (const u of state.users) {
      assert.equal("passwordHash" in u, false, `State user ${u.id} contains passwordHash`);
      assert.equal("password_hash" in u, false, `State user ${u.id} contains password_hash`);
      assert.equal(u.passwordHash, undefined);
      assert.equal(u.password_hash, undefined);
    }

    assert.ok(Array.isArray(state.clients), "State must have clients array");
    for (const c of state.clients) {
      assert.equal("passwordHash" in c, false, `State client ${c.id} contains passwordHash`);
      assert.equal("password_hash" in c, false, `State client ${c.id} contains password_hash`);
      assert.equal(c.passwordHash, undefined);
      assert.equal(c.password_hash, undefined);
    }
  });

  it("POST & PUT /api/clients do NOT return passwordHash or password_hash", async () => {
    const email = `testcorp-${Date.now()}@testcorp.com`;
    // Create client
    const createRes = await fetch(`${baseUrl}/api/clients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: testClientId,
        companyName: "Test Corp",
        companyDomain: "testcorp.com",
        contactPerson: "Jane Corp",
        email,
        phoneNumber: "123-456-7890",
        city: "San Francisco",
        password: "ClientTemp123!",
      }),
    });

    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    assert.equal(createData.success, true);
    assert.ok(createData.client);
    assert.equal("passwordHash" in createData.client, false, "Client creation returns passwordHash");
    assert.equal("password_hash" in createData.client, false, "Client creation returns password_hash");

    // Update client
    const updateRes = await fetch(`${baseUrl}/api/clients/${testClientId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        companyName: "Test Corp Updated",
        companyDomain: "testcorp.com",
        contactPerson: "Jane Corp",
        email,
        phoneNumber: "987-654-3210",
        city: "New York",
        status: "Active",
      }),
    });

    assert.equal(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.equal(updateData.success, true);
    assert.ok(updateData.client);
    assert.equal("passwordHash" in updateData.client, false, "Client update returns passwordHash");
    assert.equal("password_hash" in updateData.client, false, "Client update returns password_hash");
  });

  it("Preserves password_hash in PostgreSQL and authentication still succeeds", async () => {
    // Check DB row directly
    const dbRes = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [testUserId]);
    assert.equal(dbRes.rows.length, 1);
    const storedHash = dbRes.rows[0].password_hash;
    assert.ok(storedHash && storedHash.startsWith("$2"), "password_hash must be a valid bcrypt hash in DB");

    // Verify auth login works with the plain password
    const userRow = await pool.query(`SELECT email FROM users WHERE id = $1`, [testUserId]);
    const loginUser = await login(userRow.rows[0].email, "SecurePass123!");
    assert.ok(loginUser, "Login with original password must succeed");
    assert.equal(loginUser.id, testUserId);
    assert.equal("passwordHash" in loginUser, false, "login() return must not contain passwordHash");
    assert.equal("password_hash" in loginUser, false, "login() return must not contain password_hash");
  });
});

