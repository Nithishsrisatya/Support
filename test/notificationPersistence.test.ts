import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { pool } from "../src/db";
import { generateToken } from "../src/utils/jwt";
import notificationRoutes from "../src/routes/notificationRoutes";

describe("Notification Persistence & Authorization (Phase 10)", () => {
  let server: Server;
  let baseUrl: string;

  const ts = Date.now().toString().slice(-6);
  const adminId = `U-NOTIF-ADM-${ts}`;
  const managerId = `U-NOTIF-MGR-${ts}`;
  const emp1Id = `U-NOTIF-EMP1-${ts}`;
  const emp2Id = `U-NOTIF-EMP2-${ts}`;
  const clientId = `C-NOTIF-${ts}`;

  const adminEmail = `admin-${ts}@testnotif.com`;
  const managerEmail = `mgr-${ts}@testnotif.com`;
  const emp1Email = `emp1-${ts}@testnotif.com`;
  const emp2Email = `emp2-${ts}@testnotif.com`;
  const clientEmail = `client-${ts}@testnotif.com`;

  let adminToken: string;
  let managerToken: string;
  let emp1Token: string;
  let emp2Token: string;
  let clientToken: string;

  const notifEmp1 = `NOTIF-E1-${ts}`;
  const notifEmp1B = `NOTIF-E1B-${ts}`;
  const notifEmp2 = `NOTIF-E2-${ts}`;
  const notifMgr1 = `NOTIF-M1-${ts}`;
  const notifMgr2 = `NOTIF-M2-${ts}`;
  const notifAdm1 = `NOTIF-A1-${ts}`;
  const notifClt1 = `NOTIF-C1-${ts}`;

  before(async () => {
    const hashed = await bcrypt.hash("NotifPass123!", 10);

    // Insert users (including client user so fk_notification_user is satisfied)
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES 
       ($1, 'Notif Admin', $2, $3, 'Administrator', 'IT', 'Active', false, NOW(), NOW()),
       ($4, 'Notif Manager', $5, $3, 'Manager', 'Support', 'Active', false, NOW(), NOW()),
       ($6, 'Notif Employee 1', $7, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW()),
       ($8, 'Notif Employee 2', $9, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW()),
       ($10, 'Notif Client Contact', $11, $3, 'Client', 'Client Support', 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [
        adminId, adminEmail, hashed,
        managerId, managerEmail,
        emp1Id, emp1Email,
        emp2Id, emp2Email,
        clientId, clientEmail,
      ]
    );

    // Insert client in clients table as well
    await pool.query(
      `INSERT INTO clients (id, company_name, company_domain, contact_person, email, "passwordHash", status, created_date, updated_date)
       VALUES ($1, 'Notif Client Corp', 'notifcorp.com', 'Notif Contact', $2, $3, 'Active', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [clientId, clientEmail, hashed]
    );

    // Generate tokens
    adminToken = generateToken({ id: adminId, role: "Administrator", email: adminEmail, userType: "User" });
    managerToken = generateToken({ id: managerId, role: "Manager", email: managerEmail, userType: "User" });
    emp1Token = generateToken({ id: emp1Id, role: "Employee", email: emp1Email, userType: "User" });
    emp2Token = generateToken({ id: emp2Id, role: "Employee", email: emp2Email, userType: "User" });
    clientToken = generateToken({ id: clientId, role: "Client", email: clientEmail, userType: "Client" });

    // Seed notifications in database
    await pool.query(
      `INSERT INTO notifications (id, user_id, notification_type, title, message, status, created_date)
       VALUES 
       ($1, $2, 'Ticket Assignment', 'Ticket #1 assigned', 'You have been assigned Ticket #1', 'Sent', NOW()),
       ($3, $2, 'Task Reminder', 'Task due soon', 'Your task is due in 1 hour', 'Sent', NOW()),
       ($4, $5, 'Ticket Update', 'Ticket updated', 'Ticket #2 status changed', 'Sent', NOW()),
       ($6, $7, 'Escalation Alert', 'Ticket escalated', 'Ticket #3 escalated', 'Sent', NOW()),
       ($8, $7, 'Overdue Alert', 'Task overdue', 'Task #4 is overdue', 'Sent', NOW()),
       ($9, $10, 'Account Creation', 'New user registered', 'User joined platform', 'Sent', NOW()),
       ($11, $12, 'Ticket Update', 'Your ticket updated', 'Ticket #5 resolution update', 'Sent', NOW())`,
      [
        notifEmp1, emp1Id,
        notifEmp1B,
        notifEmp2, emp2Id,
        notifMgr1, managerId,
        notifMgr2,
        notifAdm1, adminId,
        notifClt1, clientId,
      ]
    );

    // Spin up Express app
    const app = express();
    app.use(express.json());
    app.use("/api/notifications", notificationRoutes);

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
      await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1::varchar[])`, [
        [adminId, managerId, emp1Id, emp2Id, clientId],
      ]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [
        [adminId, managerId, emp1Id, emp2Id, clientId],
      ]);
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  });

  // -------------------------------------------------------------
  // PERSISTENCE TESTS
  // -------------------------------------------------------------
  it('PUT /api/notifications/:id/read persists "Read" status and read_date in database', async () => {
    // Check initial state in DB
    const beforeRes = await pool.query(`SELECT status, read_date FROM notifications WHERE id = $1`, [notifEmp1]);
    assert.equal(beforeRes.rows[0].status, "Sent");
    assert.equal(beforeRes.rows[0].read_date, null);

    // Call API
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp1}/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.notification.status, "Read");
    assert.ok(body.notification.readDate);

    // Verify DB persistence directly
    const afterRes = await pool.query(`SELECT status, read_date FROM notifications WHERE id = $1`, [notifEmp1]);
    assert.equal(afterRes.rows[0].status, "Read");
    assert.ok(afterRes.rows[0].read_date !== null, "read_date must be populated in database");
  });

  it('PUT /api/notifications/:id/read is idempotent (returns 200 and preserves database state)', async () => {
    // Read original read_date from DB
    const firstRes = await pool.query(`SELECT status, read_date FROM notifications WHERE id = $1`, [notifEmp1]);
    const originalReadDate = firstRes.rows[0].read_date;

    // Call API again
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp1}/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.notification.status, "Read");

    // Verify DB state is still Read
    const secondRes = await pool.query(`SELECT status, read_date FROM notifications WHERE id = $1`, [notifEmp1]);
    assert.equal(secondRes.rows[0].status, "Read");
  });

  it('DELETE /api/notifications/:id persists deletion in database', async () => {
    // Verify notification exists before deletion
    const checkBefore = await pool.query(`SELECT id FROM notifications WHERE id = $1`, [notifEmp1B]);
    assert.equal(checkBefore.rows.length, 1);

    // Call API
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp1B}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    // Verify notification is completely gone from PostgreSQL
    const checkAfter = await pool.query(`SELECT id FROM notifications WHERE id = $1`, [notifEmp1B]);
    assert.equal(checkAfter.rows.length, 0, "Notification must be deleted from PostgreSQL database");
  });

  it('DELETE /api/notifications/:id returns 404 when notification does not exist or was deleted', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp1B}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  // -------------------------------------------------------------
  // AUTHORIZATION / IDOR PROTECTION TESTS
  // -------------------------------------------------------------
  it('PUT /api/notifications/:id/read returns 403 when User B attempts to mark User A notification as read', async () => {
    // Emp1 attempts to mark Emp2's notification as read
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp2}/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);

    // Verify DB state was NOT modified
    const dbCheck = await pool.query(`SELECT status, read_date FROM notifications WHERE id = $1`, [notifEmp2]);
    assert.equal(dbCheck.rows[0].status, "Sent");
    assert.equal(dbCheck.rows[0].read_date, null);
  });

  it('DELETE /api/notifications/:id returns 403 when User B attempts to delete User A notification', async () => {
    // Emp1 attempts to delete Emp2's notification
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp2}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);

    // Verify DB row was NOT deleted
    const dbCheck = await pool.query(`SELECT id, status FROM notifications WHERE id = $1`, [notifEmp2]);
    assert.equal(dbCheck.rows.length, 1, "Target notification must remain in DB");
  });

  it('Client cannot mark an Employee notification as read (403 IDOR)', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp2}/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('Client cannot delete an Employee notification (403 IDOR)', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp2}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('Manager cannot mark another user notification as read (403 IDOR)', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/${notifAdm1}/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('Manager cannot delete another user notification (403 IDOR)', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/${notifAdm1}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.status, 403);
  });

  // -------------------------------------------------------------
  // BATCH / USER OPERATIONS & OWNERSHIP
  // -------------------------------------------------------------
  it('PUT /api/notifications/user/:userId/read-all marks all notifications as read in DB', async () => {
    // Manager marks all their own notifications read
    const res = await fetch(`${baseUrl}/api/notifications/user/${managerId}/read-all`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.updated, 2);

    // Verify both notifications in DB have status 'Read'
    const dbRes = await pool.query(
      `SELECT status FROM notifications WHERE user_id = $1`,
      [managerId]
    );
    assert.equal(dbRes.rows.length, 2);
    dbRes.rows.forEach((r: any) => assert.equal(r.status, "Read"));
  });

  it('PUT /api/notifications/user/:userId/read-all returns 403 when user targets another user', async () => {
    // Emp1 attempts to mark all read for Manager
    const res = await fetch(`${baseUrl}/api/notifications/user/${managerId}/read-all`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  it('DELETE /api/notifications/user/:userId clears all notifications in DB for that user', async () => {
    // Manager clears all their own notifications
    const res = await fetch(`${baseUrl}/api/notifications/user/${managerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    // Verify DB count is 0
    const dbRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1`,
      [managerId]
    );
    assert.equal(dbRes.rows[0].count, 0);
  });

  it('DELETE /api/notifications/user/:userId returns 403 when user targets another user', async () => {
    // Emp1 attempts to clear all notifications for Admin
    const res = await fetch(`${baseUrl}/api/notifications/user/${adminId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);

    // Verify Admin notification still exists
    const dbRes = await pool.query(
      `SELECT id FROM notifications WHERE id = $1`,
      [notifAdm1]
    );
    assert.equal(dbRes.rows.length, 1);
  });

  // -------------------------------------------------------------
  // COUNT ENDPOINTS & ROLE CHECKS
  // -------------------------------------------------------------
  it('GET /api/notifications/unread-count/:userId accurately reflects DB unread count', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/unread-count/${emp2Id}`, {
      headers: { Authorization: `Bearer ${emp2Token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 1);
  });

  it('GET /api/notifications/unread-count/:userId forbids cross-user access (403) unless Administrator', async () => {
    // Emp1 accesses Emp2 unread count -> 403
    const empRes = await fetch(`${baseUrl}/api/notifications/unread-count/${emp2Id}`, {
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(empRes.status, 403);

    // Admin accesses Emp2 unread count -> 200
    const adminRes = await fetch(`${baseUrl}/api/notifications/unread-count/${emp2Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminRes.status, 200);
    const body = await adminRes.json();
    assert.equal(body.count, 1);
  });

  // -------------------------------------------------------------
  // ALL ROLES CAN OPERATE ON OWN NOTIFICATIONS
  // -------------------------------------------------------------
  it('Client can mark read and delete their own notification', async () => {
    // Client marks read
    const markRes = await fetch(`${baseUrl}/api/notifications/${notifClt1}/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(markRes.status, 200);
    const markBody = await markRes.json();
    assert.equal(markBody.notification.status, "Read");

    // Client deletes
    const delRes = await fetch(`${baseUrl}/api/notifications/${notifClt1}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(delRes.status, 200);

    // Verify gone from DB
    const dbRes = await pool.query(`SELECT id FROM notifications WHERE id = $1`, [notifClt1]);
    assert.equal(dbRes.rows.length, 0);
  });

  it('Administrator can mark read and delete their own notification', async () => {
    // Admin marks read
    const markRes = await fetch(`${baseUrl}/api/notifications/${notifAdm1}/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(markRes.status, 200);

    // Admin deletes
    const delRes = await fetch(`${baseUrl}/api/notifications/${notifAdm1}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delRes.status, 200);

    // Verify gone from DB
    const dbRes = await pool.query(`SELECT id FROM notifications WHERE id = $1`, [notifAdm1]);
    assert.equal(dbRes.rows.length, 0);
  });

  // -------------------------------------------------------------
  // AUTHENTICATION & INPUT VALIDATION
  // -------------------------------------------------------------
  it('Unauthenticated requests return 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/${notifEmp2}/read`, {
      method: "PUT",
    });
    assert.equal(res.status, 401);
  });

  it('PUT /api/notifications/:id/read returns 404 for non-existent notification ID', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/NOTIF-DOES-NOT-EXIST/read`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.equal(res.status, 404);
  });
});
