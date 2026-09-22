import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { pool } from "../src/db";
import { generateToken } from "../src/utils/jwt";
import authRoutes from "../src/routes/authRoutes";
import userRoutes from "../src/routes/userRoutes";
import clientRoutes from "../src/routes/clientRoutes";
import ticketRoutes from "../src/routes/ticketRoutes";
import taskRoutes from "../src/routes/taskRoutes";
import notificationRoutes from "../src/routes/notificationRoutes";
import reportRoutes from "../src/routes/reportRoutes";
import searchRoutes from "../src/routes/searchRoutes";
import calendarRoutes from "../src/routes/calendarRoutes";
import auditLogRoutes from "../src/routes/auditLogRoutes";

describe("Phase 13 — API Input Validation & Error Handling Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const ts = Date.now().toString().slice(-6);

  // Test identities
  const adminId = `U-VAL-ADM-${ts}`;
  const mgrId = `U-VAL-MGR-${ts}`;
  const empId = `U-VAL-EMP-${ts}`;
  const otherEmpId = `U-VAL-OTH-${ts}`;
  const clientId = `C-VAL-CL1-${ts}`;

  const adminEmail = `val-admin-${ts}@test.com`;
  const mgrEmail = `val-mgr-${ts}@test.com`;
  const empEmail = `val-emp-${ts}@test.com`;
  const otherEmpEmail = `val-other-${ts}@test.com`;
  const clientEmail = `val-client-${ts}@test.com`;

  let adminToken: string;
  let mgrToken: string;
  let empToken: string;
  let clientToken: string;

  // Test ticket & task
  const ticketId = `TKT-VAL-1-${ts}`;
  const taskId = `TSK-VAL-1-${ts}`;

  before(async () => {
    const hashed = await bcrypt.hash("ValPass123!", 10);

    // 1. Insert users
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES
       ($1, 'Validation Admin', $2, $3, 'Administrator', 'IT', 'Active', false, NOW(), NOW()),
       ($4, 'Validation Manager', $5, $3, 'Manager', 'Support', 'Active', false, NOW(), NOW()),
       ($6, 'Validation Employee', $7, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW()),
       ($8, 'Validation Other', $9, $3, 'Employee', 'Sales', 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [
        adminId, adminEmail, hashed,
        mgrId, mgrEmail,
        empId, empEmail,
        otherEmpId, otherEmpEmail,
      ]
    );

    await pool.query(`UPDATE users SET manager_id = $1 WHERE id = $2`, [mgrId, empId]);

    // 2. Insert client
    await pool.query(
      `INSERT INTO clients (id, company_name, contact_person, email, status, created_date, updated_date)
       VALUES ($1, 'Validation Client Corp', 'Val Contact', $2, 'Active', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [clientId, clientEmail]
    );

    // 3. Generate tokens
    adminToken = generateToken({ id: adminId, role: "Administrator", email: adminEmail, userType: "User" });
    mgrToken = generateToken({ id: mgrId, role: "Manager", email: mgrEmail, userType: "User" });
    empToken = generateToken({ id: empId, role: "Employee", email: empEmail, userType: "User" });
    clientToken = generateToken({ id: clientId, role: "Client", email: clientEmail, userType: "Client" });

    // 4. Insert ticket
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, created_date, updated_date)
       VALUES ($1, 'Test Validation Ticket', 'Ticket description for validation', 'Technical Issue', 'Medium', 'In Progress', $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticketId, empId, clientId]
    );

    // 5. Insert task
    await pool.query(
      `INSERT INTO tasks (id, title, description, task_category, priority, status, assigned_to, assigned_by, created_date, updated_date)
       VALUES ($1, 'Test Validation Task', 'Task description for validation', 'Support', 'Medium', 'In Progress', $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [taskId, empId, mgrId]
    );

    // 6. Mount Express test server
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true, limit: "1mb" }));

    app.use("/api/auth", authRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/clients", clientRoutes);
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/tasks", taskRoutes);
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/reports", reportRoutes);
    app.use("/api/search", searchRoutes);
    app.use("/api/calendar", calendarRoutes);
    app.use("/api/audit-logs", auditLogRoutes);

    // Global error handler
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err?.type === "entity.too.large" || err?.status === 413) {
        return res.status(413).json({ success: false, message: "Payload too large. Maximum body size is 1MB." });
      }
      if (err instanceof SyntaxError && "body" in err) {
        return res.status(400).json({ success: false, message: "Malformed JSON in request body." });
      }
      res.status(500).json({ success: false, message: "Internal server error." });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // Clean up test data
    try {
      await pool.query(`DELETE FROM notifications WHERE user_id IN ($1, $2, $3, $4, $5)`, [adminId, mgrId, empId, otherEmpId, clientId]);
      await pool.query(`DELETE FROM tickets WHERE id = $1`, [ticketId]);
      await pool.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [adminId, mgrId, empId, otherEmpId]);
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    } catch (e) {
      // ignore cleanup errors
    }
  });

  // Test 1: Missing required fields (400)
  it("Test 1: Rejects creation when required fields are missing with HTTP 400", async () => {
    // Missing subject and description
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        category: "Technical Issue",
        priority: "High",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // Test 2: Wrong body types (400)
  it("Test 2: Rejects non-object request body with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(["not", "an", "object"]),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // Test 3: Empty strings for required fields (400)
  it("Test 3: Rejects empty strings for required fields with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "",
        description: "Valid description",
        taskCategory: "Support",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // Test 4: Whitespace-only strings (400)
  it("Test 4: Rejects whitespace-only strings for required fields with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subject: "   ",
        description: "Valid description",
        category: "Technical Issue",
        priority: "Medium",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // Test 5: Invalid ticket status (400)
  it("Test 5: Rejects invalid ticket status enum with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticketId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: "ArchivedPermanently",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /Invalid ticket status/);
  });

  // Test 6: Invalid ticket priority (400)
  it("Test 6: Rejects invalid ticket priority enum with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subject: "Priority Test",
        description: "Valid description",
        category: "Technical Issue",
        priority: "SuperUrgent",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /priority/i);
  });

  // Test 7: Invalid task status (400)
  it("Test 7: Rejects invalid task status enum with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: "FinishedAndDone",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /Invalid task status/);
  });

  // Test 8: Invalid user role and status (400)
  it("Test 8: Rejects invalid user role and status enum with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        fullName: "Test User Invalid",
        email: `invalid-role-${ts}@test.com`,
        role: "SuperAdmin",
        password: "ValidPass123!",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /role/i);
  });

  // Test 9: Invalid notification type (400)
  it("Test 9: Rejects invalid notification type enum with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: empId,
        title: "Test Notif",
        message: "Test message",
        notificationType: "UnknownCategory",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /notificationType/i);
  });

  // Test 10: Invalid dates and inverted date ranges (400)
  it("Test 10: Rejects inverted date ranges (startDate > dueDate) with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        title: "Inverted Date Task",
        description: "Valid description",
        taskCategory: "Support",
        startDate: "2026-10-15",
        dueDate: "2026-10-01",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /Start date must be earlier than or equal to due date/);
  });

  // Test 11: Invalid ID formats (traversal, SQL chars, whitespace) (400)
  it("Test 11: Rejects path traversal and SQL characters in ID parameters with HTTP 400", async () => {
    // 11a: Directory traversal
    const res1 = await fetch(`${baseUrl}/api/tickets/..%2F..%2Fetc%2Fpasswd`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res1.status, 400);

    // 11b: SQL characters in ID
    const res2 = await fetch(`${baseUrl}/api/tasks/TSK-1'OR'1'='1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res2.status, 400);

    // 11c: Whitespace in ID
    const res3 = await fetch(`${baseUrl}/api/users/ADM%20123`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res3.status, 400);
  });

  // Test 12: Excessively long strings (400)
  it("Test 12: Rejects excessively long strings with HTTP 400", async () => {
    // 12a: Overly long email in login
    const hugeEmail = `${"a".repeat(250)}@example.com`; // > 255 chars
    const res1 = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: hugeEmail, password: "Short" }),
    });
    assert.strictEqual(res1.status, 400);

    // 12b: Overly long password in login (> 128 chars)
    const hugePassword = "a".repeat(200);
    const res2 = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: hugePassword }),
    });
    assert.strictEqual(res2.status, 400);

    // 12c: Overly long subject on ticket creation (> 255 chars)
    const hugeSubject = "x".repeat(300);
    const res3 = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subject: hugeSubject,
        description: "Valid description",
        category: "Technical Issue",
        priority: "Low",
      }),
    });
    assert.strictEqual(res3.status, 400);
  });

  // Test 13: Negative pagination handling (safe sanitization, non-negative offset)
  it("Test 13: Sanitizes negative pagination parameters and does not crash", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/search?page=-5&limit=-20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.page, 1);
    assert.ok(body.limit >= 1);
  });

  // Test 14: Excessively large pagination limit clamped
  it("Test 14: Clamps excessively large pagination limit to max allowed limit (100)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/search?limit=99999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.limit, 100);
  });

  // Test 15: Malformed search filters handled safely
  it("Test 15: Handles array/malformed search queries safely without crashing", async () => {
    const res = await fetch(`${baseUrl}/api/search?q[]=foo&q[]=bar`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.tickets));
    assert.ok(Array.isArray(body.tasks));
  });

  // Test 16: SQL-looking search input handled safely via parameterization
  it("Test 16: Safely handles SQL-looking search queries without SQL injection or syntax crash", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/search?q=' UNION SELECT * FROM users --`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.tickets));
  });

  // Test 17: Duplicate email returns HTTP 409 Conflict
  it("Test 17: Returns HTTP 409 Conflict when attempting to register duplicate email", async () => {
    const res = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        fullName: "Duplicate Email User",
        email: adminEmail, // already exists
        role: "Employee",
        password: "ValidPassword123!",
      }),
    });
    assert.strictEqual(res.status, 409);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /already exists/i);
  });

  // Test 18: Foreign-key failure returns safe HTTP 400
  it("Test 18: Returns safe HTTP 400 on foreign key violation instead of 500", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subject: "Nonexistent Client Ticket",
        description: "Valid description",
        category: "Technical Issue",
        priority: "Low",
        clientId: "C-NONEXISTENT-999",
      }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /referenced entity does not exist/i);
  });

  // Test 19: Database errors do not expose raw SQL
  it("Test 19: Database errors do not expose SQL syntax or query internals in response", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subject: "SQL Leak Test",
        description: "Valid description",
        category: "Technical Issue",
        priority: "Low",
        clientId: "C-NONEXISTENT-999",
      }),
    });
    const text = await res.text();
    assert.doesNotMatch(text, /SELECT /i);
    assert.doesNotMatch(text, /INSERT INTO /i);
    assert.doesNotMatch(text, /pg_catalog/i);
  });

  // Test 20: Errors do not expose stack traces
  it("Test 20: API error responses do not leak stack traces", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/nonexistent-ticket-id`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const text = await res.text();
    assert.doesNotMatch(text, /\bat Object\.<anonymous>/);
    assert.doesNotMatch(text, /node_modules/);
  });

  // Test 21: Password reset input validation (length limits 8..128)
  it("Test 21: Password reset enforces minimum 8 and maximum 128 characters", async () => {
    const validHexToken = "a".repeat(64);
    // Too short password
    const res1 = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: validHexToken, newPassword: "short" }),
    });
    assert.strictEqual(res1.status, 400);
    const body1 = await res1.json();
    assert.match(body1.message, /at least 8 characters/);

    // Too long password (> 128 chars)
    const res2 = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: validHexToken, newPassword: "a".repeat(150) }),
    });
    assert.strictEqual(res2.status, 400);
    const body2 = await res2.json();
    assert.match(body2.message, /max 128 characters/);
  });

  // Test 22: Reset token validation (must be 64 hex characters)
  it("Test 22: Rejects invalid format password reset tokens with HTTP 400", async () => {
    // Non-hex token
    const res1 = await fetch(`${baseUrl}/api/auth/verify-reset-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-valid-hex-token-at-all" }),
    });
    assert.strictEqual(res1.status, 400);

    // Token of wrong length (32 hex instead of 64)
    const res2 = await fetch(`${baseUrl}/api/auth/verify-reset-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(32) }),
    });
    assert.strictEqual(res2.status, 400);
  });

  // Test 23: Unexpected fields cannot bypass allowlists
  it("Test 23: Strips unexpected fields not in the mutation allowlist", async () => {
    const testUserId = `U-VAL-ALW-${ts}`;
    const res = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: testUserId,
        fullName: "Allowlist Test User",
        email: `allowlist-${ts}@test.com`,
        role: "Employee",
        department: "Support",
        password: "ValidPassword123!",
        isSuperUser: true, // Unexpected field
        injectedRole: "Admin", // Unexpected field
      }),
    });
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.user.role, "Employee");
    assert.strictEqual((body.user as any).isSuperUser, undefined);
    assert.strictEqual((body.user as any).injectedRole, undefined);

    // Clean up created test user
    await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
  });

  // Test 24: Notification user ownership remains protected (non-admin cannot target other users)
  it("Test 24: Non-admin employee cannot create a notification for another user", async () => {
    const res = await fetch(`${baseUrl}/api/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        userId: otherEmpId, // employee targeting another user
        title: "Unauthorized Notification",
        message: "You should not be able to create this",
        type: "Task",
      }),
    });
    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /Forbidden/);
  });

  // Test 25: Manager report filters remain scope-restricted
  it("Test 25: Manager report filters remain scope-restricted", async () => {
    const outTicketId = `TKT-VAL-OTH-${ts}`;
    const inTicketId = `TKT-VAL-IN-${ts}`;

    // Seed out-of-scope ticket (assigned to otherEmpId, not in manager's team)
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, created_date, updated_date)
       VALUES ($1, 'Out of scope ticket', 'Desc', 'Technical Issue', 'Low', 'Assigned', $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [outTicketId, otherEmpId, clientId]
    );

    // Seed in-scope ticket (assigned to empId, supervised by manager)
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, created_date, updated_date)
       VALUES ($1, 'In scope ticket', 'Desc', 'Technical Issue', 'Low', 'Assigned', $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [inTicketId, empId, clientId]
    );

    // 25a: Manager queries for tickets assigned to out-of-scope employee: should return 0 results
    const resScoped = await fetch(`${baseUrl}/api/reports/tickets?assignedTo=${otherEmpId}`, {
      headers: { Authorization: `Bearer ${mgrToken}` },
    });
    assert.strictEqual(resScoped.status, 200);
    const bodyScoped = await resScoped.json();
    assert.ok(Array.isArray(bodyScoped.tickets));
    const foundOutOfScope = bodyScoped.tickets.find((t: any) => t.id === outTicketId);
    assert.strictEqual(foundOutOfScope, undefined);

    // 25b: General manager report should include in-scope ticket but exclude out-of-scope ticket
    const resGeneral = await fetch(`${baseUrl}/api/reports/tickets`, {
      headers: { Authorization: `Bearer ${mgrToken}` },
    });
    assert.strictEqual(resGeneral.status, 200);
    const bodyGeneral = await resGeneral.json();
    assert.ok(Array.isArray(bodyGeneral.tickets));
    const foundInScope = bodyGeneral.tickets.find((t: any) => t.id === inTicketId);
    const foundOutInGeneral = bodyGeneral.tickets.find((t: any) => t.id === outTicketId);
    assert.ok(foundInScope !== undefined, "In-scope ticket should be present in manager report");
    assert.strictEqual(foundOutInGeneral, undefined, "Out-of-scope ticket must NOT be present in manager report");

    // Clean up
    await pool.query(`DELETE FROM tickets WHERE id IN ($1, $2)`, [outTicketId, inTicketId]);
  });

  // Test 26: JSON body > 1MB returns 413 Payload Too Large
  it("Test 26: Rejects JSON body exceeding 1MB with HTTP 413 Payload Too Large", async () => {
    // Generate ~1.2 MB JSON string
    const bigString = "x".repeat(1.2 * 1024 * 1024);
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subject: "Big Payload",
        description: bigString,
        category: "Technical Issue",
        priority: "Low",
      }),
    });
    assert.strictEqual(res.status, 413);
  });

  // Test 27: Malformed JSON syntax returns HTTP 400 Bad Request
  it("Test 27: Rejects malformed JSON syntax with HTTP 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: '{"subject": "Broken JSON", invalid_syntax}',
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /Malformed JSON/);
  });
});
