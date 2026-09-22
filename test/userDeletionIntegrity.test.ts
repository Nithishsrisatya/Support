import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { pool } from "../src/db";
import { generateToken } from "../src/utils/jwt";
import userRoutes from "../src/routes/userRoutes";
import ticketRoutes from "../src/routes/ticketRoutes";
import taskRoutes from "../src/routes/taskRoutes";
import { logAuditEvent } from "../src/services/auditLogService";

describe("User Deletion & Data Integrity Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const ts = Date.now().toString().slice(-6);
  const adminId = `U-DEL-ADM-${ts}`;
  const managerId = `U-DEL-MGR-${ts}`;
  const managerActiveId = `U-DEL-MGA-${ts}`;
  const empClearId = `U-DEL-CLR-${ts}`;
  const empWithTicketsId = `U-DEL-TKT-${ts}`;
  const empWithTasksId = `U-DEL-TSK-${ts}`;
  const empSubordinateId = `U-DEL-SUB-${ts}`;
  const empTransferTargetId = `U-DEL-TRG-${ts}`;
  const clientId = `C-DEL-${ts}`;

  const adminEmail = `admin-${ts}@testdel.com`;
  const managerEmail = `mgr-${ts}@testdel.com`;
  const managerActiveEmail = `mga-${ts}@testdel.com`;
  const empClearEmail = `clr-${ts}@testdel.com`;
  const empWithTicketsEmail = `tkt-${ts}@testdel.com`;
  const empWithTasksEmail = `tsk-${ts}@testdel.com`;
  const empSubEmail = `sub-${ts}@testdel.com`;
  const empTargetEmail = `trg-${ts}@testdel.com`;
  const clientEmail = `client-${ts}@testdel.com`;

  let adminToken: string;
  let managerActiveToken: string;
  let empSubToken: string;
  let clientToken: string;

  const ticketId = `TKT-DEL-${ts}`;
  const taskId = `TSK-DEL-${ts}`;
  let auditLogId: string;

  before(async () => {
    const hashed = await bcrypt.hash("DelPass123!", 10);

    // Insert users
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, manager_id, status, first_login, created_date, updated_date)
       VALUES 
       ($1, 'Deletion Admin', $2, $3, 'Administrator', 'IT', NULL, 'Active', false, NOW(), NOW()),
       ($4, 'Deletion Manager', $5, $3, 'Manager', 'Support', NULL, 'Active', false, NOW(), NOW()),
       ($6, 'Active Manager', $7, $3, 'Manager', 'Support', NULL, 'Active', false, NOW(), NOW()),
       ($8, 'Clear Employee', $9, $3, 'Employee', 'Support', NULL, 'Active', false, NOW(), NOW()),
       ($10, 'Ticket Employee', $11, $3, 'Employee', 'Support', NULL, 'Active', false, NOW(), NOW()),
       ($12, 'Task Employee', $13, $3, 'Employee', 'Support', NULL, 'Active', false, NOW(), NOW()),
       ($14, 'Subordinate Employee', $15, $3, 'Employee', 'Support', $4, 'Active', false, NOW(), NOW()),
       ($16, 'Transfer Target Employee', $17, $3, 'Employee', 'Support', NULL, 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [
        adminId, adminEmail, hashed,
        managerId, managerEmail,
        managerActiveId, managerActiveEmail,
        empClearId, empClearEmail,
        empWithTicketsId, empWithTicketsEmail,
        empWithTasksId, empWithTasksEmail,
        empSubordinateId, empSubEmail,
        empTransferTargetId, empTargetEmail,
      ]
    );

    // Insert Client
    await pool.query(
      `INSERT INTO clients (id, company_name, company_domain, contact_person, email, "passwordHash", status, created_date, updated_date)
       VALUES ($1, 'Del Client Corp', 'delcorp.com', 'Del Contact', $2, $3, 'Active', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [clientId, clientEmail, hashed]
    );

    // Generate tokens for active users
    adminToken = generateToken({ id: adminId, role: "Administrator", email: adminEmail, userType: "User" });
    managerActiveToken = generateToken({ id: managerActiveId, role: "Manager", email: managerActiveEmail, userType: "User" });
    empSubToken = generateToken({ id: empSubordinateId, role: "Employee", email: empSubEmail, userType: "User" });
    clientToken = generateToken({ id: clientId, role: "Client", email: clientEmail, userType: "Client" });

    // Seed ticket for empWithTicketsId
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, created_date, updated_date)
       VALUES ($1, 'Del Ticket', 'Ticket blocking deletion', 'Technical Issue', 'Medium', 'In Progress', $2, $3, NOW(), NOW())`,
      [ticketId, empWithTicketsId, clientId]
    );

    // Seed task for empWithTasksId
    await pool.query(
      `INSERT INTO tasks (id, title, description, priority, status, assigned_to, assigned_by, created_date, updated_date)
       VALUES ($1, 'Del Task', 'Task blocking deletion', 'Medium', 'In Progress', $2, $3, NOW(), NOW())`,
      [taskId, empWithTasksId, adminId]
    );

    // Seed notifications
    await pool.query(
      `INSERT INTO notifications (id, user_id, notification_type, title, message, status, created_date)
       VALUES 
       ($1, $2, 'Task Assignment', 'Task assigned', 'You have a new task', 'Sent', NOW()),
       ($3, $4, 'Ticket Assignment', 'Ticket assigned', 'You have a ticket', 'Sent', NOW()),
       ($5, $6, 'Manager Notice', 'Manager update', 'Important notice', 'Sent', NOW()),
       ($7, $8, 'Admin Notice', 'Admin update', 'Admin notice', 'Sent', NOW()),
       ($9, $10, 'Clear Notice 1', 'Notification 1', 'Notice 1 for clear emp', 'Sent', NOW()),
       ($11, $10, 'Clear Notice 2', 'Notification 2', 'Notice 2 for clear emp', 'Sent', NOW())`,
      [
        `NOTIF-TSK-${ts}`, empWithTasksId,
        `NOTIF-TKT-${ts}`, empWithTicketsId,
        `NOTIF-MGR-${ts}`, managerId,
        `NOTIF-ADM-${ts}`, adminId,
        `NOTIF-CLR1-${ts}`, empClearId,
        `NOTIF-CLR2-${ts}`,
      ]
    );

    // Seed audit log for empClearId (to verify audit preservation)
    const seedAudit = await logAuditEvent(
      empClearId,
      "Clear Employee",
      "Ticket Status Changed",
      "Ticket",
      "TKT-AUD-1",
      "Historical audit event that must survive user deletion"
    );
    auditLogId = seedAudit.id;

    // Seed password reset token for empClearId
    await pool.query(
      `INSERT INTO password_reset_tokens (id, user_id, user_type, email, token_hash, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, 'User', $2, 'dummyhash', NOW() + interval '1 hour', NOW())`,
      [empClearId, empClearEmail]
    );

    // Seed comments on ticket
    await pool.query(
      `INSERT INTO ticket_comments (id, ticket_id, author_id, author_name, author_role, content, is_internal, created_date)
       VALUES (gen_random_uuid(), $1, $2, 'Clear Employee', 'Employee', 'Valuable technical comment that must remain intact', false, NOW())`,
      [ticketId, empClearId]
    );

    // Spin up server
    const app = express();
    app.use(express.json());
    app.use("/api/users", userRoutes);
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/tasks", taskRoutes);

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
    try {
      await pool.query(`DELETE FROM ticket_comments WHERE ticket_id = $1`, [ticketId]);
      await pool.query(`DELETE FROM tickets WHERE id = $1`, [ticketId]);
      await pool.query(`DELETE FROM tasks WHERE id = $1`, [taskId]);
      await pool.query(`DELETE FROM notifications WHERE user_id IN ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        adminId, managerId, managerActiveId, empClearId, empWithTicketsId, empWithTasksId, empSubordinateId, empTransferTargetId
      ]);
      await pool.query(`DELETE FROM audit_logs WHERE id = $1 OR user_id IN ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        auditLogId, adminId, managerId, managerActiveId, empClearId, empWithTicketsId, empWithTasksId, empSubordinateId, empTransferTargetId
      ]);
      await pool.query(`DELETE FROM password_reset_tokens WHERE user_id IN ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        adminId, managerId, managerActiveId, empClearId, empWithTicketsId, empWithTasksId, empSubordinateId, empTransferTargetId
      ]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        adminId, managerId, managerActiveId, empClearId, empWithTicketsId, empWithTasksId, empSubordinateId, empTransferTargetId
      ]);
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    } catch (_) {}
  });

  // ============================================================
  // 1. NOTIFICATION PRESERVATION & TRANSACTIONAL ROLLBACK ON FAILURE
  // ============================================================

  it("Deletion fails when user has active tickets; notifications remain 100% intact", async () => {
    // Check notifications exist before attempt
    const beforeNotifs = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [empWithTicketsId]
    );
    assert.equal(beforeNotifs.rows.length, 1, "Should have 1 notification before deletion attempt");

    // Attempt deletion via API
    const res = await fetch(`${baseUrl}/api/users/${empWithTicketsId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 400, "Should return 400 Bad Request");
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /active assigned workload/i);

    // CRITICAL: Verify notifications were NOT deleted!
    const afterNotifs = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [empWithTicketsId]
    );
    assert.equal(
      afterNotifs.rows.length,
      1,
      "Notifications must NOT be lost when user deletion fails due to active tickets"
    );

    // Verify user is still active in database
    const userCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [empWithTicketsId]);
    assert.equal(userCheck.rows.length, 1, "User must remain intact in database");
  });

  it("Deletion fails when user has active tasks; notifications remain 100% intact", async () => {
    // Check notifications exist before attempt
    const beforeNotifs = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [empWithTasksId]
    );
    assert.equal(beforeNotifs.rows.length, 1, "Should have 1 notification before deletion attempt");

    // Attempt deletion via API
    const res = await fetch(`${baseUrl}/api/users/${empWithTasksId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 400, "Should return 400 Bad Request");
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /active assigned workload/i);

    // CRITICAL: Verify notifications were NOT deleted!
    const afterNotifs = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [empWithTasksId]
    );
    assert.equal(
      afterNotifs.rows.length,
      1,
      "Notifications must NOT be lost when user deletion fails due to active tasks"
    );

    // Verify user is still active in database
    const userCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [empWithTasksId]);
    assert.equal(userCheck.rows.length, 1, "User must remain intact in database");
  });

  it("Deletion fails when manager has reporting subordinates; notifications remain 100% intact", async () => {
    // Check notifications exist before attempt
    const beforeNotifs = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [managerId]
    );
    assert.equal(beforeNotifs.rows.length, 1);

    // Attempt deletion via API
    const res = await fetch(`${baseUrl}/api/users/${managerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 400, "Should return 400 Bad Request");
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /reporting employee/i);

    // Notifications must remain intact
    const afterNotifs = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [managerId]
    );
    assert.equal(afterNotifs.rows.length, 1, "Manager notifications must be preserved");

    // Manager must remain in database
    const mgrCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [managerId]);
    assert.equal(mgrCheck.rows.length, 1);
  });

  it("Administrator cannot delete their own active account; notifications remain intact", async () => {
    const res = await fetch(`${baseUrl}/api/users/${adminId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /cannot delete their own/i);

    // Admin notifications preserved
    const notifs = await pool.query(`SELECT id FROM notifications WHERE user_id = $1`, [adminId]);
    assert.equal(notifs.rows.length, 1);
  });

  it("Attempting to delete non-existent user returns 404 without partial failure", async () => {
    const res = await fetch(`${baseUrl}/api/users/U-DOES-NOT-EXIST-999`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /not found/i);
  });

  // ============================================================
  // 2. SUCCESSFUL ATOMIC USER DELETION
  // ============================================================

  it("Valid user deletion succeeds atomically: notifications and user deleted, audit logs preserved", async () => {
    // empClearId has 2 notifications, 1 reset token, and 1 audit log
    const notifsBefore = await pool.query(`SELECT id FROM notifications WHERE user_id = $1`, [empClearId]);
    assert.equal(notifsBefore.rows.length, 2);

    const res = await fetch(`${baseUrl}/api/users/${empClearId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.match(data.message, /successfully/i);

    // User is deleted
    const userCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [empClearId]);
    assert.equal(userCheck.rows.length, 0, "User record must be removed");

    // Notifications were cleanly deleted
    const notifsAfter = await pool.query(`SELECT id FROM notifications WHERE user_id = $1`, [empClearId]);
    assert.equal(notifsAfter.rows.length, 0, "Notifications must be cleanly deleted");

    // Password reset tokens were cleaned up
    const tokensAfter = await pool.query(`SELECT id FROM password_reset_tokens WHERE user_id = $1`, [empClearId]);
    assert.equal(tokensAfter.rows.length, 0, "Reset tokens must be cleaned up");

    // CRITICAL (Phase 6 Invariant): Historical audit log is NOT deleted!
    const auditCheck = await pool.query(`SELECT user_id, user_full_name FROM audit_logs WHERE id = $1`, [auditLogId]);
    assert.equal(auditCheck.rows.length, 1, "Audit log must survive user deletion");
    assert.equal(auditCheck.rows[0].user_id, empClearId, "Audit log must retain original user_id");
    assert.equal(auditCheck.rows[0].user_full_name, "Clear Employee", "Audit log must retain original user_full_name");

    // Ticket comment authored by deleted user remains intact
    const commentCheck = await pool.query(
      `SELECT author_id, author_name, content FROM ticket_comments WHERE ticket_id = $1`,
      [ticketId]
    );
    assert.equal(commentCheck.rows.length, 1, "Ticket comment must remain intact");
    assert.equal(commentCheck.rows[0].author_id, empClearId);
  });

  // ============================================================
  
  it("Deleting a user who assigned tasks nullifies assigned_by without blocking deletion", async () => {
    const tempAssignerId = `U-DEL-ASG-${Date.now().toString().slice(-5)}`;
    const tempTaskId = `TSK-ASG-${Date.now().toString().slice(-5)}`;
    const hashed = await bcrypt.hash("Pass123!", 10);

    // Insert temp assigner
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES ($1, 'Task Assigner', ` + `'asg-${Date.now()}@testdel.com', $2, 'Manager', 'Support', 'Active', false, NOW(), NOW())`,
      [tempAssignerId, hashed]
    );

    // Insert task assigned_by tempAssignerId, assigned_to empSubordinateId
    await pool.query(
      `INSERT INTO tasks (id, title, description, priority, status, assigned_to, assigned_by, created_date, updated_date)
       VALUES ($1, 'Task with Assigner', 'Description', 'Medium', 'Pending', $2, $3, NOW(), NOW())`,
      [tempTaskId, empSubordinateId, tempAssignerId]
    );

    // Delete tempAssignerId
    const res = await fetch(`${baseUrl}/api/users/${tempAssignerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);

    // User is deleted
    const uCheck = await pool.query(`SELECT id FROM users WHERE id = $1`, [tempAssignerId]);
    assert.equal(uCheck.rows.length, 0);

    // Task survived with assigned_by = NULL
    const tCheck = await pool.query(`SELECT id, assigned_by FROM tasks WHERE id = $1`, [tempTaskId]);
    assert.equal(tCheck.rows.length, 1);
    assert.equal(tCheck.rows[0].assigned_by, null, "Task assigned_by should be nullified");

    // Cleanup
    await pool.query(`DELETE FROM tasks WHERE id = $1`, [tempTaskId]);
  });

  // 3. TRANSFER & DELETE INTEGRITY
  // ============================================================

  it("transferAndDeleteUser transfers workload, reports, and notifications then deletes user atomically", async () => {
    // We will transfer managerId to empTransferTargetId
    // Before: managerId has 1 reporting employee (empSubordinateId) and 1 notification
    const subBefore = await pool.query(`SELECT manager_id FROM users WHERE id = $1`, [empSubordinateId]);
    assert.equal(subBefore.rows[0].manager_id, managerId);

    const res = await fetch(`${baseUrl}/api/users/${managerId}/transfer-delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ newUserId: empTransferTargetId }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    // Old manager is deleted
    const oldMgr = await pool.query(`SELECT id FROM users WHERE id = $1`, [managerId]);
    assert.equal(oldMgr.rows.length, 0, "Old manager must be deleted");

    // Subordinate employee now reports to replacement employee
    const subAfter = await pool.query(`SELECT manager_id FROM users WHERE id = $1`, [empSubordinateId]);
    assert.equal(subAfter.rows[0].manager_id, empTransferTargetId, "Subordinate must report to replacement");

    // Notifications were reassigned to replacement employee
    const notifsTarget = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1`,
      [empTransferTargetId]
    );
    assert.ok(notifsTarget.rows.length >= 1, "Notifications must transfer to replacement");
  });

  // ============================================================
  // 4. ROLE & AUTHORIZATION REGRESSION
  // ============================================================

  it("Non-Administrator (Manager, Employee, Client) cannot delete users (403)", async () => {
    // Manager attempt (using active manager token)
    const mgrRes = await fetch(`${baseUrl}/api/users/${empWithTicketsId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${managerActiveToken}` },
    });
    assert.equal(mgrRes.status, 403);

    // Employee attempt (using active employee token)
    const empRes = await fetch(`${baseUrl}/api/users/${empWithTicketsId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${empSubToken}` },
    });
    assert.equal(empRes.status, 403);

    // Client attempt
    const clientRes = await fetch(`${baseUrl}/api/users/${empWithTicketsId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(clientRes.status, 403);
  });

  it("Non-Administrator cannot invoke transfer-delete endpoint (403)", async () => {
    const res = await fetch(`${baseUrl}/api/users/${empWithTicketsId}/transfer-delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerActiveToken}`,
      },
      body: JSON.stringify({ newUserId: empTransferTargetId }),
    });
    assert.equal(res.status, 403);
  });
});
