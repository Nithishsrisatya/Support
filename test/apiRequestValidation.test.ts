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
import auditLogRoutes from "../src/routes/auditLogRoutes";

describe("Phase 9: API Request Validation & Input Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const testSuffix = Date.now().toString().slice(-6);
  const adminId = `U-VAL-A-${testSuffix}`;
  const managerId = `U-VAL-M-${testSuffix}`;
  const empId = `U-VAL-E-${testSuffix}`;
  const clientId = `C-VAL-${testSuffix}`;

  const adminEmail = `val-admin-${testSuffix}@testval.com`;
  const managerEmail = `val-mgr-${testSuffix}@testval.com`;
  const empEmail = `val-emp-${testSuffix}@testval.com`;
  const clientEmail = `val-client-${testSuffix}@testval.com`;

  let adminToken: string;
  let managerToken: string;
  let empToken: string;
  let clientToken: string;

  let testTicketId: string;
  let testTaskId: string;

  before(async () => {
    const hashed = await bcrypt.hash("ValPassword123!", 10);

    // Seed test users
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES 
       ($1, 'Validation Admin', $2, $3, 'Administrator', 'IT', 'Active', false, NOW(), NOW()),
       ($4, 'Validation Manager', $5, $3, 'Manager', 'Support', 'Active', false, NOW(), NOW()),
       ($6, 'Validation Employee', $7, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [adminId, adminEmail, hashed, managerId, managerEmail, empId, empEmail]
    );

    // Seed test client
    await pool.query(
      `INSERT INTO clients (id, company_name, company_domain, contact_person, email, "passwordHash", status, created_date, updated_date)
       VALUES ($1, 'Validation Corp', 'testval.com', 'Validation Contact', $2, $3, 'Active', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [clientId, clientEmail, hashed]
    );

    // Seed test ticket for testing updates and reminders
    testTicketId = `TKT-VAL-${testSuffix}`;
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, created_date, updated_date)
       VALUES ($1, 'Validation Ticket', 'Test Description', 'Technical Issue', 'Medium', 'Assigned', $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [testTicketId, empId, clientId]
    );

    // Seed test task
    testTaskId = `TSK-VAL-${testSuffix}`;
    await pool.query(
      `INSERT INTO tasks (id, title, description, task_category, priority, status, escalation_status, assigned_by, assigned_to, due_date, created_date, updated_date)
       VALUES ($1, 'Validation Task', 'Test Description', 'Operational', 'Medium', 'Assigned', 'No', $2, $3, NOW() + interval '7 days', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [testTaskId, adminId, empId]
    );

    // Generate JWT tokens
    adminToken = generateToken({ id: adminId, email: adminEmail, role: "Administrator", userType: "User" });
    managerToken = generateToken({ id: managerId, email: managerEmail, role: "Manager", userType: "User" });
    empToken = generateToken({ id: empId, email: empEmail, role: "Employee", userType: "User" });
    clientToken = generateToken({ id: clientId, email: clientEmail, role: "Client", userType: "Client" });

    // Launch Express server
    const app = express();
    app.use(express.json());

    app.use("/api/auth", authRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/clients", clientRoutes);
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/tasks", taskRoutes);
    app.use("/api/notifications", notificationRoutes);
    app.use("/api/audit-logs", auditLogRoutes);

    // Global error handler (matching server.ts)
    app.use((err: any, _req: any, res: any, _next: any) => {
      const statusCode = err.status || err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: err.message || "An error occurred.",
      });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Cleanup seeded records
    await pool.query(`DELETE FROM tasks WHERE id = $1`, [testTaskId]);
    await pool.query(`DELETE FROM tickets WHERE id = $1`, [testTicketId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [adminId, managerId, empId]);
    await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  });

  // ============================================================
  // 1. AUTH ROUTES VALIDATION
  // ============================================================
  describe("Auth Routes Validation", () => {
    it("POST /api/auth/login rejects non-object payload with 400", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["not", "an", "object"]),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Invalid request body/i);
    });

    it("POST /api/auth/login rejects missing or whitespace credentials with 400", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "   ", password: "" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Email and password are required/i);
    });

    it("POST /api/auth/forgot-password rejects invalid email format with 400", async () => {
      const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email-no-at-sign" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /valid email address/i);
    });

    it("POST /api/auth/verify-reset-token rejects malformed token with 400", async () => {
      const res = await fetch(`${baseUrl}/api/auth/verify-reset-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "too-short-or-invalid-characters" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Invalid or expired password reset link/i);
    });

    it("POST /api/auth/reset-password rejects short newPassword (< 8 chars) with 400", async () => {
      const dummyHex64 = "a".repeat(64);
      const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: dummyHex64, newPassword: "short" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /at least 8 characters long/i);
    });
  });

  // ============================================================
  // 2. USER ROUTES VALIDATION
  // ============================================================
  describe("User Routes Validation", () => {
    it("POST /api/users rejects non-object payload with 400", async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(["not", "an", "object"]),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    it("POST /api/users rejects invalid email format with 400", async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          fullName: "New User",
          email: "bad-email-format",
          role: "Employee",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /valid email address/i);
    });

    it("POST /api/users rejects invalid role enum with 400", async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          fullName: "New User",
          email: `valid-${Date.now()}@test.com`,
          role: "SuperHeroRole",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Valid role is required/i);
    });

    it("POST /api/users rejects invalid status enum with 400", async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          fullName: "New User",
          email: `valid-${Date.now()}@test.com`,
          role: "Employee",
          status: "NonExistentStatus",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Invalid user status/i);
    });

    it("PUT /api/users/change-password rejects newPassword shorter than 8 chars with 400", async () => {
      const res = await fetch(`${baseUrl}/api/users/change-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ currentPassword: "ValPassword123!", newPassword: "123" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /at least 8 characters long/i);
    });

    it("PUT /api/users/:id rejects invalid email in update with 400", async () => {
      const res = await fetch(`${baseUrl}/api/users/${empId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ email: "not-an-email" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /valid email address/i);
    });
  });

  // ============================================================
  // 3. CLIENT ROUTES VALIDATION
  // ============================================================
  describe("Client Routes Validation", () => {
    it("POST /api/clients rejects non-object payload with 400", async () => {
      const res = await fetch(`${baseUrl}/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(["not", "an", "object"]),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    it("POST /api/clients rejects missing contactPerson with 400", async () => {
      const res = await fetch(`${baseUrl}/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          companyName: "Acme Corp",
          email: "acme@example.com",
          phoneNumber: "123-456-7890",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Contact person is required/i);
    });

    it("POST /api/clients rejects invalid client status enum with 400", async () => {
      const res = await fetch(`${baseUrl}/api/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          companyName: "Acme Corp",
          contactPerson: "John Doe",
          email: "acme@example.com",
          phoneNumber: "123-456-7890",
          status: "BogusStatus",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Invalid client status/i);
    });

    it("PUT /api/clients/me rejects invalid email format with 400", async () => {
      const res = await fetch(`${baseUrl}/api/clients/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clientToken}` },
        body: JSON.stringify({ email: "not_a_valid_email" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /valid email address/i);
    });
  });

  // ============================================================
  // 4. TICKET ROUTES VALIDATION
  // ============================================================
  describe("Ticket Routes Validation", () => {
    it("POST /api/tickets rejects non-object payload with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(["invalid"]),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    it("POST /api/tickets rejects invalid category enum with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          subject: "Valid Subject",
          description: "Valid Description",
          category: "NonExistentCategory",
          priority: "High",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Valid category is required/i);
    });

    it("POST /api/tickets rejects invalid dueDate format with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          subject: "Valid Subject",
          description: "Valid Description",
          category: "Technical Issue",
          priority: "High",
          dueDate: "not-a-valid-date-string",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Invalid due date format/i);
    });

    it("PUT /api/tickets/:id rejects non-integer satisfactionRating with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets/${testTicketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ satisfactionRating: 3.7 }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Satisfaction rating must be an integer/i);
    });

    it("PUT /api/tickets/:id rejects out-of-range satisfactionRating with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets/${testTicketId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ satisfactionRating: 10 }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Satisfaction rating must be an integer between 1 and 5/i);
    });

    it("POST /api/tickets/:id/comments rejects whitespace or empty comment with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets/${testTicketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ content: "   " }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Comment content is required/i);
    });

    it("POST /api/tickets/:id/remind-overdue rejects negative daysOverdue with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets/${testTicketId}/remind-overdue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ daysOverdue: -5 }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /non-negative number/i);
    });

    it("POST /api/tickets/:id/remind-sla rejects invalid SLA deadline date with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets/${testTicketId}/remind-sla`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ slaDeadline: "not-a-date" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Invalid SLA deadline format/i);
    });

    it("POST /api/tickets/bulk rejects empty IDs array with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tickets/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ action: "close", ids: [] }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /non-empty array/i);
    });
  });

  // ============================================================
  // 5. TASK ROUTES VALIDATION
  // ============================================================
  describe("Task Routes Validation", () => {
    it("POST /api/tasks rejects non-object payload with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(["not", "an", "object"]),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    it("POST /api/tasks rejects invalid taskCategory enum with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          title: "Task Title",
          description: "Task Description",
          taskCategory: "BogusTaskCategory",
          priority: "Medium",
          dueDate: "2026-12-31T00:00:00.000Z",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Valid task category is required/i);
    });

    it("POST /api/tasks/:id/progress rejects out-of-range progressPercentage with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tasks/${testTaskId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ progressPercentage: 150 }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /between 0 and 100/i);
    });

    it("PUT /api/tasks/:id/review rejects invalid reviewStatus enum with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tasks/${testTaskId}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ reviewStatus: "TotallyApproved" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Invalid review status/i);
    });

    it("POST /api/tasks/bulk rejects empty IDs array with 400", async () => {
      const res = await fetch(`${baseUrl}/api/tasks/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ action: "complete", ids: [] }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /non-empty array/i);
    });
  });

  // ============================================================
  // 6. NOTIFICATION & AUDIT LOG ROUTES VALIDATION
  // ============================================================
  describe("Notification & Audit Log Routes Validation", () => {
    it("POST /api/notifications rejects non-object payload with 400", async () => {
      const res = await fetch(`${baseUrl}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(["not", "an", "object"]),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    it("POST /api/notifications rejects invalid notificationType enum with 400", async () => {
      const res = await fetch(`${baseUrl}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          userId: adminId,
          title: "Alert",
          message: "Sample message",
          notificationType: "RandomAlert",
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /Valid notificationType is required/i);
    });

    it("POST /api/audit-logs rejects non-object payload with 400", async () => {
      const res = await fetch(`${baseUrl}/api/audit-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(["an", "array"]),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
    });

    it("POST /api/audit-logs rejects missing action, entityType, or entityId with 400", async () => {
      const res = await fetch(`${baseUrl}/api/audit-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ action: "Login", entityType: "" }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /required/i);
    });
  });
});

