import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { pool } from "../src/db";
import ticketRoutes from "../src/routes/ticketRoutes";
import { generateToken } from "../src/utils/jwt";

describe("Ticket Update Authorization & IDOR Security Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const suffix = Date.now().toString().slice(-6);
  const managerId = `TM-${suffix}`;
  const emp1Id = `TE1-${suffix}`;
  const emp2Id = `TE2-${suffix}`;
  const client1Id = `TC1-${suffix}`;
  const client2Id = `TC2-${suffix}`;

  const ticket1Id = `TKT1-${suffix}`;
  const ticket2Id = `TKT2-${suffix}`;
  const ticket3Id = `TKT3-${suffix}`;
  const ticket4Id = `TKT4-${suffix}`;

  let adminToken: string;
  let managerToken: string;
  let emp1Token: string;
  let emp2Token: string;
  let client1Token: string;
  let client2Token: string;

  before(async () => {
    // 1. Generate auth tokens
    adminToken = generateToken({ id: "U-1", role: "Administrator", email: "admin@test.com", userType: "User" });
    managerToken = generateToken({ id: managerId, role: "Manager", email: `mgr-${suffix}@test.com`, userType: "User" });
    emp1Token = generateToken({ id: emp1Id, role: "Employee", email: `emp1-${suffix}@test.com`, userType: "User" });
    emp2Token = generateToken({ id: emp2Id, role: "Employee", email: `emp2-${suffix}@test.com`, userType: "User" });
    client1Token = generateToken({ id: client1Id, role: "Client", email: `c1-${suffix}@test.com`, userType: "Client" });
    client2Token = generateToken({ id: client2Id, role: "Client", email: `c2-${suffix}@test.com`, userType: "Client" });

    // 2. Insert test users & clients
    // Manager
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status)
       VALUES ($1, $2, $3, 'hash', 'Manager', 'Support', 'Active') ON CONFLICT (id) DO NOTHING`,
      [managerId, "Test Manager", `mgr-${suffix}@test.com`]
    );
    // Employee 1 (supervised by manager)
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, manager_id, status)
       VALUES ($1, $2, $3, 'hash', 'Employee', 'Support', $4, 'Active') ON CONFLICT (id) DO NOTHING`,
      [emp1Id, "Test Employee 1", `emp1-${suffix}@test.com`, managerId]
    );
    // Employee 2 (not supervised by manager)
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status)
       VALUES ($1, $2, $3, 'hash', 'Employee', 'Support', 'Active') ON CONFLICT (id) DO NOTHING`,
      [emp2Id, "Test Employee 2", `emp2-${suffix}@test.com`]
    );
    // Client 1
    await pool.query(
      `INSERT INTO clients (id, company_name, contact_person, email, status)
       VALUES ($1, $2, $3, $4, 'Active') ON CONFLICT (id) DO NOTHING`,
      [client1Id, "Client One Corp", "Contact 1", `c1-${suffix}@test.com`]
    );
    // Client 2
    await pool.query(
      `INSERT INTO clients (id, company_name, contact_person, email, status)
       VALUES ($1, $2, $3, $4, 'Active') ON CONFLICT (id) DO NOTHING`,
      [client2Id, "Client Two Corp", "Contact 2", `c2-${suffix}@test.com`]
    );

    // 3. Insert test tickets
    // Ticket 1: Owned by Client 1, assigned to Employee 1, status "Assigned"
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, client_id, assigned_to, created_date, updated_date)
       VALUES ($1, 'Ticket One', 'Description 1', 'Technical Issue', 'Medium', 'Assigned', $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticket1Id, client1Id, emp1Id]
    );
    // Ticket 2: Owned by Client 2, assigned to Employee 2, status "Assigned"
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, client_id, assigned_to, created_date, updated_date)
       VALUES ($1, 'Ticket Two', 'Description 2', 'Technical Issue', 'Medium', 'Assigned', $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticket2Id, client2Id, emp2Id]
    );
    // Ticket 3: Owned by Client 1, assigned to Employee 1, status "Resolved"
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, client_id, assigned_to, resolution_summary, created_date, updated_date)
       VALUES ($1, 'Ticket Three', 'Description 3', 'Technical Issue', 'Medium', 'Resolved', $2, $3, 'Resolved by team', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticket3Id, client1Id, emp1Id]
    );
    // Ticket 4: Owned by Client 1, unassigned, status "New"
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, client_id, assigned_to, created_date, updated_date)
       VALUES ($1, 'Ticket Four', 'Description 4', 'General Inquiry', 'Low', 'New', $2, NULL, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticket4Id, client1Id]
    );

    // 4. Start Express test app
    const app = express();
    app.use(express.json());
    app.use("/api/tickets", ticketRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Clean up test data
    try {
      await pool.query(`DELETE FROM tickets WHERE id IN ($1, $2, $3, $4)`, [ticket1Id, ticket2Id, ticket3Id, ticket4Id]);
    } catch (_) {}
    try {
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [managerId, emp1Id, emp2Id]);
    } catch (_) {}
    try {
      await pool.query(`DELETE FROM clients WHERE id IN ($1, $2)`, [client1Id, client2Id]);
    } catch (_) {}

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ============================================================
  // IDOR & ACCESS AUTHORIZATION TESTS
  // ============================================================

  it("IDOR: Mismatch between URL ticket ID and body ticket ID is rejected with 400", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: ticket2Id, priority: "High" }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /does not match/i);
  });

  it("Client cannot update another client's ticket (403)", async () => {
    // Client 1 tries to update Ticket 2 (owned by Client 2)
    const res = await fetch(`${baseUrl}/api/tickets/${ticket2Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ status: "Closed" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  it("Employee cannot update a ticket they are not authorized to work on (403)", async () => {
    // Employee 1 tries to update Ticket 2 (assigned to Employee 2)
    const res = await fetch(`${baseUrl}/api/tickets/${ticket2Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({ status: "In Progress" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  // ============================================================
  // CLIENT RESTRICTIONS
  // ============================================================

  it("Client cannot change client_id (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ clientId: client2Id }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /not authorized to change ticket ownership/i);
  });

  it("Client cannot change assigned_to (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ assignedTo: emp2Id }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /not authorized to assign/i);
  });

  it("Client cannot modify priority (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ priority: "Critical" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /priority/i);
  });

  it("Client cannot modify due_date (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ dueDate: "2026-12-31T00:00:00.000Z" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /due date/i);
  });

  it("Client cannot modify employee_notes (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ employeeNotes: "Hacked notes" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /employee notes/i);
  });

  it("Client cannot modify resolution_summary (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ resolutionSummary: "Hacked resolution" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /resolution summary/i);
  });

  it("Client cannot close an active (non-resolved) ticket (403)", async () => {
    // Ticket 1 is in "Assigned" status
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({ status: "Closed" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Resolved status/i);
  });

  it("Authorized Client update of permitted fields (confirm resolution & close) succeeds (200)", async () => {
    // Ticket 3 is in "Resolved" status
    const res = await fetch(`${baseUrl}/api/tickets/${ticket3Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${client1Token}` },
      body: JSON.stringify({
        status: "Closed",
        satisfactionRating: 5,
        satisfactionNotes: "Resolution verified and working well!",
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.ticket.status, "Closed");
  });

  // ============================================================
  // EMPLOYEE RESTRICTIONS
  // ============================================================

  it("Employee cannot change client_id (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({ clientId: client2Id }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /not authorized to change ticket ownership/i);
  });

  it("Employee cannot arbitrarily change assigned_to (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({ assignedTo: emp2Id }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /not authorized to assign/i);
  });

  it("Employee cannot modify priority (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({ priority: "Critical" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /priority/i);
  });

  it("Employee cannot modify due_date (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({ dueDate: "2026-12-31T00:00:00.000Z" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /due date/i);
  });

  it("Employee cannot modify satisfaction_rating (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({ satisfactionRating: 5 }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /satisfaction rating/i);
  });

  it("Employee cannot close ticket directly (403)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({ status: "Closed" }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /cannot close tickets/i);
  });

  it("Authorized Employee update of permitted fields succeeds (200)", async () => {
    // 1. Transition Assigned -> In Progress
    const res1 = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({
        status: "In Progress",
        employeeNotes: "Started working on client issue",
      }),
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.equal(data1.ticket.status, "In Progress");

    // 2. Transition In Progress -> Resolved
    const res2 = await fetch(`${baseUrl}/api/tickets/${ticket1Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${emp1Token}` },
      body: JSON.stringify({
        status: "Resolved",
        resolutionSummary: "Issue was resolved by updating configuration.",
        employeeNotes: "Applied config patch.",
      }),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.success, true);
    assert.equal(data2.ticket.status, "Resolved");
  });

  // ============================================================
  // MANAGER & ADMINISTRATOR PERMISSIONS
  // ============================================================

  it("Manager cannot reassign ticket to employee outside supervised team (403)", async () => {
    // Ticket 4 is unassigned. Manager tries to assign to Employee 2 (not supervised by Manager)
    const res = await fetch(`${baseUrl}/api/tickets/${ticket4Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ assignedTo: emp2Id }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /supervised team members/i);
  });

  it("Manager legitimate update within team succeeds (200)", async () => {
    // Ticket 4 is unassigned. Manager assigns to Employee 1 (supervised) with priority High
    const res = await fetch(`${baseUrl}/api/tickets/${ticket4Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ assignedTo: emp1Id, priority: "High" }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.ticket.assigned_to ?? data.ticket.assignedTo, emp1Id);
    assert.equal(data.ticket.priority, "High");
  });

  it("Administrator legitimate update still succeeds (200)", async () => {
    const res = await fetch(`${baseUrl}/api/tickets/${ticket4Id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        priority: "Critical",
        dueDate: "2026-11-20T12:00:00.000Z",
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.ticket.priority, "Critical");
  });
});

