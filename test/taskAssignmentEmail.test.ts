import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import { Server } from "http";
import taskRoutes from "../src/routes/taskRoutes";
import { pool } from "../src/db";
import { setEmailSenderForTesting, SendEmailResult } from "../src/services/emailService";
import { taskAssignedTemplate } from "../src/templates/operationalEmails";
import { escapeHtml } from "../src/utils/htmlSanitizer";

describe("Task Assignment Email Flow Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const jwtSecret = process.env.JWT_SECRET || "test-jwt-secret-key-12345";
  const suffix = Date.now().toString().slice(-6);

  const adminId = `U-TAE-ADM-${suffix}`;
  const managerId = `U-TAE-MGR-${suffix}`;
  const empAId = `U-TAE-EMA-${suffix}`;
  const empBId = `U-TAE-EMB-${suffix}`;

  const adminEmail = `admin-${suffix}@taskemail.com`;
  const managerEmail = `manager-${suffix}@taskemail.com`;
  const empAEmail = `empa-${suffix}@taskemail.com`;
  const empBEmail = `empb-${suffix}@taskemail.com`;

  let adminToken: string;
  let managerToken: string;

  interface SentEmailRecord {
    to: string;
    rawSubject: string;
    html: string;
  }

  const dispatchedEmails: SentEmailRecord[] = [];
  let shouldSimulateFailure = false;

  before(async () => {
    // 1. Seed users: Admin, Manager, Employee A, Employee B
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, status)
       VALUES
        ($1, 'Task Admin', $2, 'hash123', 'Administrator', 'Active'),
        ($3, 'Task Manager', $4, 'hash123', 'Manager', 'Active'),
        ($5, 'Employee Alpha', $6, 'hash123', 'Employee', 'Active'),
        ($7, 'Employee Beta', $8, 'hash123', 'Employee', 'Active')`,
      [adminId, adminEmail, managerId, managerEmail, empAId, empAEmail, empBId, empBEmail]
    );

    // Set Manager supervisor relationship
    await pool.query(`UPDATE users SET manager_id = $1 WHERE id IN ($2, $3)`, [managerId, empAId, empBId]);

    // 2. Generate tokens
    adminToken = jwt.sign(
      { id: adminId, email: adminEmail, role: "Administrator", fullName: "Task Admin" },
      jwtSecret,
      { expiresIn: "1h" }
    );

    managerToken = jwt.sign(
      { id: managerId, email: managerEmail, role: "Manager", fullName: "Task Manager" },
      jwtSecret,
      { expiresIn: "1h" }
    );

    // 3. Register custom email sender mock
    setEmailSenderForTesting(async (to, rawSubject, html): Promise<SendEmailResult> => {
      if (shouldSimulateFailure) {
        throw new Error("Simulated email service connectivity failure.");
      }
      dispatchedEmails.push({ to, rawSubject, html });
      return { success: true, transport: "preview" };
    });

    // 4. Spin up Express app
    const app = express();
    app.use(express.json());
    app.use("/api/tasks", taskRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    setEmailSenderForTesting(null);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      await pool.query(`DELETE FROM tasks WHERE assigned_by IN ($1, $2)`, [adminId, managerId]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [adminId, managerId, empAId, empBId]);
    } catch {}
  });

  beforeEach(() => {
    dispatchedEmails.length = 0;
    shouldSimulateFailure = false;
  });

  // ──────────────────────────────────────────────
  // 1. Create task with employee -> assignment email sent
  // ──────────────────────────────────────────────
  it("1. POST /api/tasks with assigned employee sends assignment email", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Deploy SSL Certificate",
        description: "Install wildcard certificate on primary load balancer",
        taskCategory: "Operational",
        priority: "High",
        dueDate: "2026-10-15T00:00:00.000Z",
        assignedTo: empAId,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.task.id);

    // Wait a tick for asynchronous email query to complete
    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(dispatchedEmails.length, 1);
    const email = dispatchedEmails[0];
    assert.strictEqual(email.to, empAEmail);
    assert.ok(email.rawSubject.includes("New Task Assigned: Deploy SSL Certificate"));
    assert.ok(email.html.includes("Employee Alpha"));
    assert.ok(email.html.includes(data.task.id));
    assert.ok(email.html.includes("Install wildcard certificate"));
    assert.ok(email.html.includes("High"));
  });

  // ──────────────────────────────────────────────
  // 2. Create task without employee -> no assignment email
  // ──────────────────────────────────────────────
  it("2. POST /api/tasks without assignee does NOT send an assignment email", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Draft Architecture RFC",
        description: "General RFC for review",
        taskCategory: "Documentation",
        priority: "Medium",
        dueDate: "2026-10-20T00:00:00.000Z",
      }),
    });

    assert.strictEqual(res.status, 201);
    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(dispatchedEmails.length, 0);
  });

  // ──────────────────────────────────────────────
  // 3. Assign existing unassigned task -> email sent
  // ──────────────────────────────────────────────
  it("3. PUT /api/tasks/:id assigning an unassigned task sends assignment email", async () => {
    // First create unassigned task
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Setup Prometheus Exporter",
        description: "Configure host node metrics",
        taskCategory: "Operational",
        priority: "Critical",
        dueDate: "2026-10-18T00:00:00.000Z",
      }),
    });

    const createData = await createRes.json();
    const taskId = createData.task.id;
    dispatchedEmails.length = 0;

    // Now assign it to Employee A
    const assignRes = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assignedTo: empAId,
      }),
    });

    assert.strictEqual(assignRes.status, 200);
    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(dispatchedEmails.length, 1);
    assert.strictEqual(dispatchedEmails[0].to, empAEmail);
    assert.ok(dispatchedEmails[0].html.includes("Employee Alpha"));
    assert.ok(dispatchedEmails[0].html.includes("Setup Prometheus Exporter"));
  });

  // ──────────────────────────────────────────────
  // 4. Reassign employee A -> employee B -> only B receives email
  // ──────────────────────────────────────────────
  it("4. PUT /api/tasks/:id reassigning A -> B sends assignment email ONLY to B", async () => {
    // Create task assigned to A
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Database Backup Verification",
        description: "Test daily restoration drills",
        taskCategory: "Compliance",
        priority: "High",
        assignedTo: empAId,
        dueDate: "2026-10-25T00:00:00.000Z",
      }),
    });

    const createData = await createRes.json();
    const taskId = createData.task.id;
    await new Promise((r) => setTimeout(r, 100));
    dispatchedEmails.length = 0;

    // Reassign to Employee B
    const reassignRes = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assignedTo: empBId,
      }),
    });

    assert.strictEqual(reassignRes.status, 200);
    await new Promise((r) => setTimeout(r, 100));

    // Only Employee B should receive the assignment email
    assert.strictEqual(dispatchedEmails.length, 1);
    assert.strictEqual(dispatchedEmails[0].to, empBEmail);
    assert.ok(dispatchedEmails[0].html.includes("Employee Beta"));
    assert.strictEqual(dispatchedEmails.some((e) => e.to === empAEmail), false);
  });

  // ──────────────────────────────────────────────
  // 5. Update task without changing assignee -> no duplicate email
  // ──────────────────────────────────────────────
  it("5. PUT /api/tasks/:id updating details without changing assignee does NOT send duplicate assignment email", async () => {
    // Create task assigned to A
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Log Ingestion Pipeline Tuning",
        description: "Tuning elasticsearch index buffers",
        taskCategory: "Operational",
        priority: "Medium",
        assignedTo: empAId,
        dueDate: "2026-10-28T00:00:00.000Z",
      }),
    });

    const createData = await createRes.json();
    const taskId = createData.task.id;
    await new Promise((r) => setTimeout(r, 100));
    dispatchedEmails.length = 0;

    // Update title and priority while keeping assignedTo as empAId (or omitting assignedTo)
    const updateRes = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Log Ingestion Pipeline Tuning - Urgent",
        priority: "Critical",
        assignedTo: empAId,
      }),
    });

    assert.strictEqual(updateRes.status, 200);
    await new Promise((r) => setTimeout(r, 100));

    // No "New Task Assigned" email should be dispatched
    const assignedEmails = dispatchedEmails.filter((e) =>
      e.rawSubject.includes("New Task Assigned")
    );
    assert.strictEqual(assignedEmails.length, 0);
  });

  // ──────────────────────────────────────────────
  // 6. Unassign employee -> no assignment email
  // ──────────────────────────────────────────────
  it("6. PUT /api/tasks/:id unassigning an employee does NOT send an assignment email", async () => {
    // Create task assigned to A
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Decommissioning Node 04",
        description: "Drain traffic and delete instance",
        taskCategory: "Operational",
        priority: "Low",
        assignedTo: empAId,
        dueDate: "2026-11-01T00:00:00.000Z",
      }),
    });

    const createData = await createRes.json();
    const taskId = createData.task.id;
    await new Promise((r) => setTimeout(r, 100));
    dispatchedEmails.length = 0;

    // Unassign task (assignedTo: null)
    const unassignRes = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assignedTo: null,
      }),
    });

    assert.strictEqual(unassignRes.status, 200);
    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(dispatchedEmails.length, 0);
  });

  // ──────────────────────────────────────────────
  // 7. Email template content validation
  // ──────────────────────────────────────────────
  it("7. taskAssignedTemplate includes title, ID, description, priority, and due date safely escaped", () => {
    const html = taskAssignedTemplate(
      "John Doe <script>alert('name')</script>",
      "TSK-9999",
      "Payment Gateway Migration <img src=x onerror=alert(1)>",
      "2026-12-31T23:59:59.000Z",
      "Execute SQL scripts & verify checksums <iframe src='evil.com'></iframe>",
      "Critical"
    );

    // Verify presence of required fields
    assert.ok(html.includes("TSK-9999"));
    assert.ok(html.includes("Payment Gateway Migration"));
    assert.ok(html.includes("Priority:"));
    assert.ok(html.includes("Critical"));
    assert.ok(html.includes("Description:"));
    assert.ok(html.includes("Execute SQL scripts &amp; verify checksums"));
    assert.ok(html.includes("Deadline:"));
    assert.ok(html.includes("Employee Dashboard"));

    // Verify all XSS injection payloads are safely sanitized
    assert.strictEqual(html.includes("<script>"), false);
    assert.strictEqual(html.includes("<img"), false);
    assert.strictEqual(html.includes("<iframe"), false);
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&lt;iframe"));
  });

  // ──────────────────────────────────────────────
  // 8. Email failure does not break the task assignment transaction
  // ──────────────────────────────────────────────
  it("8. Email service rejection does NOT break or roll back the task assignment transaction", async () => {
    // Create an unassigned task
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Disaster Recovery Testing",
        description: "Simulate regional datacenter failover",
        taskCategory: "Compliance",
        priority: "Critical",
        dueDate: "2026-11-15T00:00:00.000Z",
      }),
    });

    const createData = await createRes.json();
    const taskId = createData.task.id;

    // Force mock email sender to throw an error
    shouldSimulateFailure = true;

    // Assign to Employee B
    const assignRes = await fetch(`${baseUrl}/api/tasks/${taskId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assignedTo: empBId,
      }),
    });

    // Request must still succeed with HTTP 200
    assert.strictEqual(assignRes.status, 200);
    const assignData = await assignRes.json();
    assert.strictEqual(assignData.success, true);
    assert.strictEqual(assignData.task.assignedTo || assignData.task.assigned_to, empBId);

    // Verify task in database was indeed committed with the new assignee
    const dbCheck = await pool.query("SELECT assigned_to FROM tasks WHERE id = $1", [taskId]);
    assert.strictEqual(dbCheck.rows[0].assigned_to, empBId);

    // Wait for background error catch handler to finish
    await new Promise((r) => setTimeout(r, 100));
  });
});
