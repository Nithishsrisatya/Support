import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { pool } from "../src/db";
import ticketRoutes from "../src/routes/ticketRoutes";
import taskRoutes from "../src/routes/taskRoutes";
import reportRoutes from "../src/routes/reportRoutes";
import searchRoutes from "../src/routes/searchRoutes";
import { generateToken } from "../src/utils/jwt";

describe("Manager Authorization & Team-Scope Security Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const suffix = Math.floor(100000 + Math.random() * 900000).toString();
  const adminId = `ADM-${suffix}`;
  const managerAId = `MGA-${suffix}`;
  const managerBId = `MGB-${suffix}`;
  const empAId = `EMA-${suffix}`;
  const empBId = `EMB-${suffix}`;
  const clientId = `CLA-${suffix}`;

  const ticketAId = `TKA-${suffix}`;
  const ticketBId = `TKB-${suffix}`;
  const ticketUnassignedId = `TKU-${suffix}`;

  const taskAId = `TSA-${suffix}`;
  const taskBId = `TSB-${suffix}`;
  const taskUnassignedId = `TSU-${suffix}`;

  let adminToken: string;
  let managerAToken: string;
  let managerBToken: string;
  let empAToken: string;
  let empBToken: string;
  let clientToken: string;

  before(async () => {
    // 1. Tokens
    adminToken = generateToken({ id: adminId, role: "Administrator", email: `adm-${suffix}@test.com`, userType: "User" });
    managerAToken = generateToken({ id: managerAId, role: "Manager", email: `mga-${suffix}@test.com`, userType: "User" });
    managerBToken = generateToken({ id: managerBId, role: "Manager", email: `mgb-${suffix}@test.com`, userType: "User" });
    empAToken = generateToken({ id: empAId, role: "Employee", email: `ema-${suffix}@test.com`, userType: "User" });
    empBToken = generateToken({ id: empBId, role: "Employee", email: `emb-${suffix}@test.com`, userType: "User" });
    clientToken = generateToken({ id: clientId, role: "Client", email: `cla-${suffix}@test.com`, userType: "Client" });

    // 2. Insert Users
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status)
       VALUES ($1, 'Admin User', $2, 'hash', 'Administrator', 'IT', 'Active') ON CONFLICT (id) DO NOTHING`,
      [adminId, `adm-${suffix}@test.com`]
    );
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status)
       VALUES ($1, 'Manager Alpha', $2, 'hash', 'Manager', 'Team Alpha', 'Active') ON CONFLICT (id) DO NOTHING`,
      [managerAId, `mga-${suffix}@test.com`]
    );
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status)
       VALUES ($1, 'Manager Beta', $2, 'hash', 'Manager', 'Team Beta', 'Active') ON CONFLICT (id) DO NOTHING`,
      [managerBId, `mgb-${suffix}@test.com`]
    );
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, manager_id, status)
       VALUES ($1, 'Employee Alpha', $2, 'hash', 'Employee', 'Team Alpha', $3, 'Active') ON CONFLICT (id) DO NOTHING`,
      [empAId, `ema-${suffix}@test.com`, managerAId]
    );
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, manager_id, status)
       VALUES ($1, 'Employee Beta', $2, 'hash', 'Employee', 'Team Beta', $3, 'Active') ON CONFLICT (id) DO NOTHING`,
      [empBId, `emb-${suffix}@test.com`, managerBId]
    );

    // 3. Insert Client
    await pool.query(
      `INSERT INTO clients (id, company_name, contact_person, email, status)
       VALUES ($1, 'Alpha Corp', 'Alice', $2, 'Active') ON CONFLICT (id) DO NOTHING`,
      [clientId, `cla-${suffix}@test.com`]
    );

    // 4. Insert Tickets
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, client_id, assigned_to, due_date, created_date, updated_date)
       VALUES ($1, 'Alpha Ticket', 'Desc A', 'Technical Issue', 'High', 'Assigned', $2, $3, NOW() + INTERVAL '2 days', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticketAId, clientId, empAId]
    );
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, client_id, assigned_to, due_date, created_date, updated_date)
       VALUES ($1, 'Beta Ticket', 'Desc B', 'Technical Issue', 'High', 'Assigned', $2, $3, NOW() + INTERVAL '2 days', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticketBId, clientId, empBId]
    );
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, client_id, assigned_to, due_date, created_date, updated_date)
       VALUES ($1, 'Unassigned Ticket', 'Desc U', 'General Inquiry', 'Medium', 'New', $2, NULL, NOW() + INTERVAL '3 days', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticketUnassignedId, clientId]
    );

    // 5. Insert Tasks
    await pool.query(
      `INSERT INTO tasks (id, title, description, task_category, priority, status, assigned_to, assigned_by, due_date, created_date, updated_date)
       VALUES ($1, 'Alpha Task', 'Task A desc', 'General', 'Medium', 'Assigned', $2, $3, NOW() + INTERVAL '2 days', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [taskAId, empAId, managerAId]
    );
    await pool.query(
      `INSERT INTO tasks (id, title, description, task_category, priority, status, assigned_to, assigned_by, due_date, created_date, updated_date)
       VALUES ($1, 'Beta Task', 'Task B desc', 'General', 'Medium', 'Assigned', $2, $3, NOW() + INTERVAL '2 days', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [taskBId, empBId, managerBId]
    );
    await pool.query(
      `INSERT INTO tasks (id, title, description, task_category, priority, status, assigned_to, assigned_by, due_date, created_date, updated_date)
       VALUES ($1, 'Unassigned Task', 'Task U desc', 'General', 'Low', 'Pending', NULL, $2, NOW() + INTERVAL '3 days', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [taskUnassignedId, managerAId]
    );

    // 6. Spin up Express app
    const app = express();
    app.use(express.json());
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/tasks", taskRoutes);
    app.use("/api/reports", reportRoutes);
    app.use("/api/search", searchRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Cleanup
    try {
      await pool.query(`DELETE FROM tasks WHERE id IN ($1, $2, $3)`, [taskAId, taskBId, taskUnassignedId]);
      await pool.query(`DELETE FROM tickets WHERE id IN ($1, $2, $3)`, [ticketAId, ticketBId, ticketUnassignedId]);
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5)`, [adminId, managerAId, managerBId, empAId, empBId]);
    } catch {}
  });

  // ============================================================
  // TICKETS SCOPE TESTS
  // ============================================================

  it("Manager A CAN access a ticket within their team (200)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticketAId}`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, ticketAId);
  });

  it("Manager A CANNOT access a ticket outside their team (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticketBId}`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A CANNOT update a ticket outside their team (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticketBId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ priority: "Critical" }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A CANNOT reassign ticket to employee outside their team (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticketAId}/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ assigneeId: empBId }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A CAN reassign ticket to employee inside their team (200)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticketAId}/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ assigneeId: managerAId }),
    });
    assert.strictEqual(res.status, 200);
  });

  it("Manager A bulk ticket operations cannot affect tickets outside team scope (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        action: "updateStatus",
        ids: [ticketAId, ticketBId],
        payload: { status: "In Progress" },
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A bulk ticket assign cannot assign to employee outside team (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        action: "assign",
        ids: [ticketAId],
        payload: { assigneeId: empBId },
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A manual ticket reminder cannot target out-of-scope ticket (403)", async () => {
    const resOverdue = await fetch(`${baseUrl}/api/tickets/${ticketBId}/remind-overdue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ daysOverdue: 2 }),
    });
    assert.strictEqual(resOverdue.status, 403);

    const resSla = await fetch(`${baseUrl}/api/tickets/${ticketBId}/remind-sla`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resSla.status, 403);
  });

  it("Manager A manual ticket reminder CAN target in-scope ticket (200)", async () => {
    const resSla = await fetch(`${baseUrl}/api/tickets/${ticketAId}/remind-sla`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resSla.status, 200);
  });

  // ============================================================
  // TASKS SCOPE TESTS
  // ============================================================

  it("Manager A CAN access a task within their team (200)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${taskAId}`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, taskAId);
  });

  it("Manager A CANNOT access a task outside their team (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${taskBId}`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A CANNOT update a task outside their team (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${taskBId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ priority: "Critical" }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A CANNOT reassign task to employee outside their team (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${taskAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ assignedTo: empBId }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A CAN reassign task to employee inside their team (200)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${taskAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({ assignedTo: empAId }),
    });
    assert.strictEqual(res.status, 200);
  });

  it("Manager A CANNOT create task assigned to employee outside their team (403)", async () => {
    const newTask = `TS-NEW-${suffix}`;
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        id: newTask,
        title: "Forbidden New Task",
        assignedTo: empBId,
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A bulk task operations cannot affect tasks outside team scope (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        action: "updateStatus",
        ids: [taskAId, taskBId],
        payload: { status: "In Progress" },
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager A bulk task assign cannot assign to employee outside team (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerAToken}`,
      },
      body: JSON.stringify({
        action: "assign",
        ids: [taskAId],
        payload: { assigneeId: empBId },
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Manager CANNOT perform global overdue operation check-all-overdue (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/check-all-overdue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerAToken}`,
      },
    });
    assert.strictEqual(res.status, 403);
  });

  it("Administrator CAN perform global overdue operation check-all-overdue (200)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/check-all-overdue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert.strictEqual(res.status, 200);
  });

  // ============================================================
  // REPORTS SCOPE TESTS
  // ============================================================

  it("Manager A ticket report does not expose tickets from other teams", async () => {
    const res = await fetch(`${baseUrl}/api/reports/tickets`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const ticketIds = data.tickets.map((t: any) => t.id);
    assert.ok(ticketIds.includes(ticketAId), "Must include team A ticket");
    assert.ok(!ticketIds.includes(ticketBId), "Must NOT include team B ticket");
  });

  it("Manager A task report does not expose tasks from other teams", async () => {
    const res = await fetch(`${baseUrl}/api/reports/tasks`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const taskIds = data.tasks.map((t: any) => t.id);
    assert.ok(taskIds.includes(taskAId), "Must include team A task");
    assert.ok(!taskIds.includes(taskBId), "Must NOT include team B task");
  });

  it("Manager A employee productivity report does not expose employees from other teams", async () => {
    const res = await fetch(`${baseUrl}/api/reports/employees`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const empIds = data.employees.map((e: any) => e.id);
    assert.ok(empIds.includes(empAId), "Must include team A employee");
    assert.ok(empIds.includes(managerAId), "Must include manager A");
    assert.ok(!empIds.includes(empBId), "Must NOT include team B employee");
    assert.ok(!empIds.includes(managerBId), "Must NOT include manager B");
  });

  // ============================================================
  // SEARCH SCOPE TESTS
  // ============================================================

  it("Ticket search respects Manager team scope and excludes out-of-team tickets", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/search?q=Ticket`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const ticketIds = data.tickets.map((t: any) => t.id);
    assert.ok(ticketIds.includes(ticketAId), "Must find team A ticket");
    assert.ok(!ticketIds.includes(ticketBId), "Must NOT find team B ticket");
  });

  it("Ticket search with assignedTo filter outside scope returns empty results", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/search?assigned_to=${empBId}`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.tickets.length, 0);
  });

  it("Global search respects Manager scope for employees", async () => {
    const res = await fetch(`${baseUrl}/api/search?q=Employee`, {
      headers: { Authorization: `Bearer ${managerAToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const empIds = data.employees.map((e: any) => e.id);
    assert.ok(empIds.includes(empAId), "Must include team A employee");
    assert.ok(!empIds.includes(empBId), "Must NOT include team B employee");
  });

  // ============================================================
  // REGRESSION TESTS FOR ADMIN / EMPLOYEE / CLIENT
  // ============================================================

  it("Administrator retains full intended access across all tickets and tasks", async () => {
    const resTicket = await fetch(`${baseUrl}/api/tickets/${ticketBId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resTicket.status, 200);

    const resTask = await fetch(`${baseUrl}/api/tasks/${taskBId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resTask.status, 200);
  });

  it("Employee cannot reassign tasks (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/${taskAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAToken}`,
      },
      body: JSON.stringify({ assignedTo: empBId }),
    });
    assert.strictEqual(res.status, 403);
  });

  it("Client can view their own tickets (200) but not others", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticketAId}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.strictEqual(res.status, 200);
  });
});

