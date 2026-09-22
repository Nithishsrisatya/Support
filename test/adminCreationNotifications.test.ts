import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { AddressInfo } from "net";
import { Server } from "http";
import ticketRoutes from "../src/routes/ticketRoutes";
import taskRoutes from "../src/routes/taskRoutes";
import { pool } from "../src/db";
import { setEmailSenderForTesting, SendEmailResult } from "../src/services/emailService";
import { adminNewTicketTemplate, adminNewTaskTemplate } from "../src/templates/operationalEmails";

describe("Administrator Creation Notifications (Tickets & Tasks)", () => {
  let server: Server;
  let baseUrl: string;

  const jwtSecret = process.env.JWT_SECRET || "test-jwt-secret-key-12345";
  const suffix = Date.now().toString().slice(-6);

  const admin1Id = `U-ACN-AD1-${suffix}`;
  const admin2Id = `U-ACN-AD2-${suffix}`;
  const inactiveAdminId = `U-ACN-INA-${suffix}`;
  const empId = `U-ACN-EMP-${suffix}`;
  const clientId = `C-ACN-CLI-${suffix}`;

  const admin1Email = `admin1-${suffix}@adminnotif.com`;
  const admin2Email = `admin2-${suffix}@adminnotif.com`;
  const inactiveAdminEmail = `inactive-${suffix}@adminnotif.com`;
  const empEmail = `employee-${suffix}@adminnotif.com`;
  const clientEmail = `client-${suffix}@adminnotif.com`;

  let admin1Token: string;
  let empToken: string;
  let clientToken: string;

  interface SentEmailRecord {
    to: string;
    rawSubject: string;
    html: string;
  }

  const dispatchedEmails: SentEmailRecord[] = [];
  let shouldSimulateFailure = false;

  before(async () => {
    // 1. Seed users: Admin 1 (Active), Admin 2 (Active), Inactive Admin, Employee (Active)
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, status)
       VALUES
        ($1, 'Super Admin Alpha', $2, 'hash123', 'Administrator', 'Active'),
        ($3, 'Super Admin Beta', $4, 'hash123', 'Administrator', 'Active'),
        ($5, 'Inactive Admin', $6, 'hash123', 'Administrator', 'Inactive'),
        ($7, 'Worker Employee', $8, 'hash123', 'Employee', 'Active')`,
      [
        admin1Id,
        admin1Email,
        admin2Id,
        admin2Email,
        inactiveAdminId,
        inactiveAdminEmail,
        empId,
        empEmail,
      ]
    );

    // 2. Seed Client in clients table
    await pool.query(
      `INSERT INTO clients (id, company_name, contact_person, email, phone_number, status)
       VALUES ($1, 'Acme Enterprise', 'Alice Customer', $2, '555-0199', 'Active')`,
      [clientId, clientEmail]
    );

    // 3. Generate tokens
    admin1Token = jwt.sign(
      { id: admin1Id, email: admin1Email, role: "Administrator", fullName: "Super Admin Alpha" },
      jwtSecret,
      { expiresIn: "1h" }
    );

    empToken = jwt.sign(
      { id: empId, email: empEmail, role: "Employee", fullName: "Worker Employee" },
      jwtSecret,
      { expiresIn: "1h" }
    );

    clientToken = jwt.sign(
      { id: clientId, email: clientEmail, role: "Client", fullName: "Alice Customer" },
      jwtSecret,
      { expiresIn: "1h" }
    );

    // 4. Register mock email sender
    setEmailSenderForTesting(async (to, rawSubject, html): Promise<SendEmailResult> => {
      if (shouldSimulateFailure) {
        throw new Error("Simulated Brevo mail server network disconnect.");
      }
      dispatchedEmails.push({ to, rawSubject, html });
      return { success: true, transport: "preview" };
    });

    // 5. Spin up Express test app
    const app = express();
    app.use(express.json());
    app.use("/api/tickets", ticketRoutes);
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
      await pool.query(`DELETE FROM notifications WHERE user_id IN ($1, $2, $3, $4)`, [
        admin1Id,
        admin2Id,
        inactiveAdminId,
        empId,
      ]);
      await pool.query(`DELETE FROM tickets WHERE client_id = $1`, [clientId]);
      await pool.query(`DELETE FROM tasks WHERE assigned_to = $1`, [empId]);
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [
        admin1Id,
        admin2Id,
        inactiveAdminId,
        empId,
      ]);
    } catch {}
  });

  beforeEach(() => {
    dispatchedEmails.length = 0;
    shouldSimulateFailure = false;
  });

  // ──────────────────────────────────────────────
  // TICKET TESTS (1 - 7)
  // ──────────────────────────────────────────────

  it("1. New ticket -> all active Administrators receive an in-app notification", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "PostgreSQL Replica Replication Lag",
        description: "Standby database replica is 120 seconds behind primary WAL.",
        category: "Technical Issue",
        priority: "Critical",
        clientId: clientId,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    const ticketId = data.ticket.id;

    // Allow background notification queries to settle
    await new Promise((r) => setTimeout(r, 200));

    // Check notifications table for Admin 1 & Admin 2
    const notifs = await pool.query(
      `SELECT user_id, title, message, notification_type FROM notifications WHERE title LIKE $1 AND user_id IN ($2, $3)`,
      [`%${ticketId}%`, admin1Id, admin2Id]
    );

    assert.strictEqual(notifs.rows.length, 2);
    const userIds = notifs.rows.map((r) => r.user_id);
    assert.ok(userIds.includes(admin1Id), "Admin 1 must receive in-app notification");
    assert.ok(userIds.includes(admin2Id), "Admin 2 must receive in-app notification");

    const sample = notifs.rows[0];
    assert.strictEqual(sample.notification_type, "Ticket Update");
    assert.ok(sample.message.includes("PostgreSQL Replica Replication Lag"));
    assert.ok(sample.message.includes("Critical"));
    assert.ok(sample.message.includes("Acme Enterprise"));
  });

  it("2. New ticket -> all active Administrators receive an email notification", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "DNS Propagation Delay",
        description: "Custom domain records not resolving globally.",
        category: "General Inquiry",
        priority: "Medium",
        clientId: clientId,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const ticketId = data.ticket.id;

    await new Promise((r) => setTimeout(r, 200));

    // Verify emails sent to Admin 1 and Admin 2
    const admin1EmailRecord = dispatchedEmails.find((e) => e.to === admin1Email);
    const admin2EmailRecord = dispatchedEmails.find((e) => e.to === admin2Email);

    assert.ok(admin1EmailRecord, "Admin 1 must receive email");
    assert.ok(admin2EmailRecord, "Admin 2 must receive email");

    assert.ok(admin1EmailRecord.rawSubject.includes("New Support Ticket Created: DNS Propagation Delay"));
    assert.ok(admin1EmailRecord.html.includes("Super Admin Alpha"));
    assert.ok(admin1EmailRecord.html.includes(ticketId));
    assert.ok(admin1EmailRecord.html.includes("Acme Enterprise"));
    assert.ok(admin1EmailRecord.html.includes("Custom domain records not resolving"));

    assert.ok(admin2EmailRecord.html.includes("Super Admin Beta"));
  });

  it("3. Inactive Administrator receives neither in-app notification nor email", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Billing Invoice Audit Request",
        description: "Client requested breakdown of Q3 usage metrics.",
        category: "Billing Issue",
        priority: "Low",
        clientId: clientId,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const ticketId = data.ticket.id;

    await new Promise((r) => setTimeout(r, 200));

    // Check notifications for inactive admin
    const inactiveNotif = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 AND title LIKE $2`,
      [inactiveAdminId, `%${ticketId}%`]
    );
    assert.strictEqual(inactiveNotif.rows.length, 0, "Inactive admin must not receive in-app notification");

    // Check emails for inactive admin
    const inactiveEmail = dispatchedEmails.find((e) => e.to === inactiveAdminEmail);
    assert.strictEqual(inactiveEmail, undefined, "Inactive admin must not receive email");
  });

  it("4. Multiple active Administrators each receive their own personalized notification/email", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "API Gateway Rate Limit Exceeded",
        description: "Gateway returning 429 to production webhooks.",
        category: "Technical Issue",
        priority: "Critical",
        clientId: clientId,
      }),
    });

    assert.strictEqual(res.status, 201);
    await new Promise((r) => setTimeout(r, 200));

    const e1 = dispatchedEmails.find((e) => e.to === admin1Email);
    const e2 = dispatchedEmails.find((e) => e.to === admin2Email);

    assert.ok(e1);
    assert.ok(e2);
    // Personalized greeting for each admin
    assert.ok(e1.html.includes("Hello Super Admin Alpha,"));
    assert.ok(e2.html.includes("Hello Super Admin Beta,"));
  });

  it("5. Existing Client ticket-created email still works as expected", async () => {
    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Client Self-Submitted Ticket",
        description: "Need help configuring webhook secret tokens.",
        category: "Service Request",
        priority: "Medium",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const ticketId = data.ticket.id;

    await new Promise((r) => setTimeout(r, 200));

    // Client must receive their acknowledgement email
    const clientEmailRecord = dispatchedEmails.find((e) => e.to === clientEmail);
    assert.ok(clientEmailRecord, "Client must receive ticket created acknowledgement email");
    assert.ok(clientEmailRecord.rawSubject.includes("Ticket Created: Client Self-Submitted Ticket"));
    assert.ok(clientEmailRecord.html.includes("Alice Customer"));
    assert.ok(clientEmailRecord.html.includes(ticketId));

    // Both active admins must also receive their admin alert emails
    assert.ok(dispatchedEmails.some((e) => e.to === admin1Email));
    assert.ok(dispatchedEmails.some((e) => e.to === admin2Email));
  });

  it("6. Email transport rejection does not break ticket creation", async () => {
    shouldSimulateFailure = true;

    const res = await fetch(`${baseUrl}/api/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: "Resilience Ticket Creation Check",
        description: "Verifying email service network failure does not crash ticket endpoint.",
        category: "Technical Issue",
        priority: "High",
        clientId: clientId,
      }),
    });

    // Request must succeed with HTTP 201
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.ticket.id);

    // Verify ticket was committed to Postgres
    const dbTicket = await pool.query(`SELECT id, subject FROM tickets WHERE id = $1`, [data.ticket.id]);
    assert.strictEqual(dbTicket.rows.length, 1);
    assert.strictEqual(dbTicket.rows[0].subject, "Resilience Ticket Creation Check");

    await new Promise((r) => setTimeout(r, 120));
  });

  it("7. User-controlled HTML content is safely escaped in ticket email template", () => {
    const html = adminNewTicketTemplate({
      adminName: "Admin <script>alert('xss')</script>",
      ticketId: "TKT-XSS-101",
      subject: "Injected Subject <img src=x onerror=alert(1)>",
      priority: "Critical",
      category: "Technical Issue <iframe src=evil.com></iframe>",
      clientName: "Evil Corp <svg onload=alert(2)>",
      description: "Payload <b onmouseover=alert(3)>hover me</b> & 'quotes'",
    });

    // Must not contain raw executable tags
    assert.strictEqual(html.includes("<script>"), false);
    assert.strictEqual(html.includes("<img"), false);
    assert.strictEqual(html.includes("<iframe"), false);
    assert.strictEqual(html.includes("<svg"), false);
    assert.strictEqual(html.includes("<b onmouseover"), false);

    // Must contain escaped entities
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&lt;iframe"));
    assert.ok(html.includes("&lt;svg"));
    assert.ok(html.includes("&amp; &#39;quotes&#39;"));
  });

  // ──────────────────────────────────────────────
  // TASK TESTS (8 - 14)
  // ──────────────────────────────────────────────

  it("8. New task -> all active Administrators receive an in-app notification", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Provision Kubernetes Worker Nodes",
        description: "Scale cluster autoscaler nodepool from 3 to 10 nodes.",
        taskCategory: "Operational",
        priority: "High",
        dueDate: "2026-11-20T00:00:00.000Z",
        assignedTo: empId,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    const taskId = data.task.id;

    await new Promise((r) => setTimeout(r, 200));

    // Verify in-app notifications for Admin 1 & Admin 2
    const notifs = await pool.query(
      `SELECT user_id, title, message, notification_type FROM notifications WHERE title LIKE $1 AND user_id IN ($2, $3)`,
      [`%${taskId}%`, admin1Id, admin2Id]
    );

    assert.strictEqual(notifs.rows.length, 2);
    const userIds = notifs.rows.map((r) => r.user_id);
    assert.ok(userIds.includes(admin1Id), "Admin 1 must receive in-app notification");
    assert.ok(userIds.includes(admin2Id), "Admin 2 must receive in-app notification");

    const sample = notifs.rows[0];
    assert.strictEqual(sample.notification_type, "Task Assignment");
    assert.ok(sample.message.includes("Provision Kubernetes Worker Nodes"));
    assert.ok(sample.message.includes("Worker Employee"));
  });

  it("9. New task -> all active Administrators receive an email notification", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Renew SSL SAN Certificates",
        description: "Replace expiring certificates on ingress proxies.",
        taskCategory: "Operational",
        priority: "Critical",
        dueDate: "2026-11-25T00:00:00.000Z",
        assignedTo: empId,
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const taskId = data.task.id;

    await new Promise((r) => setTimeout(r, 200));

    const admin1EmailRecord = dispatchedEmails.find((e) => e.to === admin1Email);
    const admin2EmailRecord = dispatchedEmails.find((e) => e.to === admin2Email);

    assert.ok(admin1EmailRecord, "Admin 1 must receive email");
    assert.ok(admin2EmailRecord, "Admin 2 must receive email");

    assert.ok(admin1EmailRecord.rawSubject.includes("New Task Created: Renew SSL SAN Certificates"));
    assert.ok(admin1EmailRecord.html.includes("Super Admin Alpha"));
    assert.ok(admin1EmailRecord.html.includes(taskId));
    assert.ok(admin1EmailRecord.html.includes("Worker Employee"));
    assert.ok(admin1EmailRecord.html.includes("Replace expiring certificates"));

    assert.ok(admin2EmailRecord.html.includes("Super Admin Beta"));
  });

  it("10. Inactive Administrator receives neither in-app notification nor email for new task", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Audit SSH Authorized Keys",
        description: "Verify jump host key validity.",
        taskCategory: "Compliance",
        priority: "Medium",
        dueDate: "2026-11-30T00:00:00.000Z",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const taskId = data.task.id;

    await new Promise((r) => setTimeout(r, 200));

    // Check notifications for inactive admin
    const inactiveNotif = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 AND title LIKE $2`,
      [inactiveAdminId, `%${taskId}%`]
    );
    assert.strictEqual(inactiveNotif.rows.length, 0, "Inactive admin must not receive in-app notification");

    // Check emails for inactive admin
    const inactiveEmail = dispatchedEmails.find((e) => e.to === inactiveAdminEmail);
    assert.strictEqual(inactiveEmail, undefined, "Inactive admin must not receive email");
  });

  it("11. Multiple active Administrators each receive their own personalized task notification/email", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Database Vacuum Analyze Maintenance",
        description: "Run vacuum analyze during off-peak window.",
        taskCategory: "Administrative",
        priority: "Low",
      }),
    });

    assert.strictEqual(res.status, 201);
    await new Promise((r) => setTimeout(r, 200));

    const e1 = dispatchedEmails.find((e) => e.to === admin1Email);
    const e2 = dispatchedEmails.find((e) => e.to === admin2Email);

    assert.ok(e1);
    assert.ok(e2);
    assert.ok(e1.html.includes("Hello Super Admin Alpha,"));
    assert.ok(e2.html.includes("Hello Super Admin Beta,"));
    assert.ok(e1.html.includes("Unassigned"));
  });

  it("12. Existing Employee task assignment email still works without duplicate emails", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Deploy Redis Sentinel Cluster",
        description: "Configure failover consensus quorum.",
        taskCategory: "Operational",
        priority: "High",
        assignedTo: empId,
        dueDate: "2026-12-05T00:00:00.000Z",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    const taskId = data.task.id;

    await new Promise((r) => setTimeout(r, 200));

    // Verify Employee receives exactly ONE assignment email
    const employeeEmails = dispatchedEmails.filter((e) => e.to === empEmail);
    assert.strictEqual(employeeEmails.length, 1, "Employee must receive exactly 1 assignment email");
    assert.ok(employeeEmails[0].rawSubject.includes("New Task Assigned: Deploy Redis Sentinel Cluster"));
    assert.ok(employeeEmails[0].html.includes("Worker Employee"));
    assert.ok(employeeEmails[0].html.includes(taskId));

    // Both admins also receive their admin notifications
    assert.ok(dispatchedEmails.some((e) => e.to === admin1Email));
    assert.ok(dispatchedEmails.some((e) => e.to === admin2Email));
  });

  it("13. Email transport rejection does not break task creation", async () => {
    shouldSimulateFailure = true;

    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin1Token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Task Creation Resilience Verification",
        description: "Checking that mail server failure does not abort task creation transaction.",
        taskCategory: "Operational",
        priority: "Critical",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.task.id);

    // Verify task is committed in Postgres
    const dbTask = await pool.query(`SELECT id, title FROM tasks WHERE id = $1`, [data.task.id]);
    assert.strictEqual(dbTask.rows.length, 1);
    assert.strictEqual(dbTask.rows[0].title, "Task Creation Resilience Verification");

    await new Promise((r) => setTimeout(r, 200));
  });

  it("14. User-controlled HTML content is safely escaped in task email template", () => {
    const html = adminNewTaskTemplate({
      adminName: "Admin <script>alert('admin')</script>",
      taskId: "TSK-XSS-202",
      title: "Malicious Task <img src=x onerror=alert(1)>",
      priority: "Critical",
      category: "Operational <iframe src=attack.com></iframe>",
      assignedEmployeeName: "Worker <svg onload=alert(2)>",
      dueDate: "2026-12-31T23:59:59.000Z",
      description: "Body payload <b onmouseover=alert(3)>hover me</b> & 'quotes'",
    });

    // Must not contain raw executable tags
    assert.strictEqual(html.includes("<script>"), false);
    assert.strictEqual(html.includes("<img"), false);
    assert.strictEqual(html.includes("<iframe"), false);
    assert.strictEqual(html.includes("<svg"), false);
    assert.strictEqual(html.includes("<b onmouseover"), false);

    // Must contain escaped entities
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("&lt;img"));
    assert.ok(html.includes("&lt;iframe"));
    assert.ok(html.includes("&lt;svg"));
    assert.ok(html.includes("&amp; &#39;quotes&#39;"));
  });
});

