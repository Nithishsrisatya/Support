import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { pool } from "../src/db";
import { generateToken } from "../src/utils/jwt";
import auditLogRoutes from "../src/routes/auditLogRoutes";
import userRoutes from "../src/routes/userRoutes";
import ticketRoutes from "../src/routes/ticketRoutes";
import { transferAndDeleteUser } from "../src/services/userService";
import { logAuditEvent, getAllAuditLogs } from "../src/services/auditLogService";

describe("Audit Log Integrity & Tamper Resistance Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const adminId = `U-AUD-A-${Date.now().toString().slice(-5)}`;
  const managerId = `U-AUD-M-${Date.now().toString().slice(-5)}`;
  const empId1 = `U-AUD-E1-${Date.now().toString().slice(-4)}`;
  const empId2 = `U-AUD-E2-${Date.now().toString().slice(-4)}`;
  const clientId = `C-AUD-${Date.now().toString().slice(-6)}`;

  const adminEmail = `admin-${Date.now()}@testaudit.com`;
  const managerEmail = `manager-${Date.now()}@testaudit.com`;
  const empEmail1 = `emp1-${Date.now()}@testaudit.com`;
  const empEmail2 = `emp2-${Date.now()}@testaudit.com`;
  const clientEmail = `client-${Date.now()}@testaudit.com`;

  let adminToken: string;
  let managerToken: string;
  let empToken: string;
  let clientToken: string;
  let empToken2: string;

  let testLogId: string;

  before(async () => {
    const hashed = await bcrypt.hash("AuditPass123!", 10);

    // Insert Admin, Manager, Employees
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES 
       ($1, 'Audit Admin', $2, $3, 'Administrator', 'IT', 'Active', false, NOW(), NOW()),
       ($4, 'Audit Manager', $5, $3, 'Manager', 'Support', 'Active', false, NOW(), NOW()),
       ($6, 'Audit Emp One', $7, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW()),
       ($8, 'Audit Emp Two', $9, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [adminId, adminEmail, hashed, managerId, managerEmail, empId1, empEmail1, empId2, empEmail2]
    );

    // Insert Client
    await pool.query(
      `INSERT INTO clients (id, company_name, company_domain, contact_person, email, "passwordHash", status, created_date, updated_date)
       VALUES ($1, 'Audit Corp', 'testaudit.com', 'Audit Contact', $2, $3, 'Active', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [clientId, clientEmail, hashed]
    );

    // Generate tokens
    adminToken = generateToken({ id: adminId, role: "Administrator", email: adminEmail, userType: "User" });
    managerToken = generateToken({ id: managerId, role: "Manager", email: managerEmail, userType: "User" });
    empToken = generateToken({ id: empId1, role: "Employee", email: empEmail1, userType: "User" });
    clientToken = generateToken({ id: clientId, role: "Client", email: clientEmail, userType: "Client" });
    empToken2 = generateToken({ id: empId2, role: "Employee", email: empEmail2, userType: "User" });

    // Seed a known audit log for deletion / read tests
    const seedLog = await logAuditEvent(
      adminId,
      "Audit Admin",
      "System Verification",
      "System",
      "SYS-1",
      "Initial verification audit record"
    );
    testLogId = seedLog.id;

    // Spin up Express app
    const app = express();
    app.use(express.json());
    app.use("/api/audit-logs", auditLogRoutes);
    app.use("/api/users", userRoutes);
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
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Cleanup
    try {
      await pool.query(`DELETE FROM audit_logs WHERE user_id IN ($1, $2, $3, $4, $5) OR id = $6`, [
        adminId,
        managerId,
        empId1,
        empId2,
        clientId,
        testLogId,
      ]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4)`, [adminId, managerId, empId1, empId2]);
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    } catch (_) {}
  });

  // ============================================================
  // 1. ARBITRARY AUDIT EVENT CREATION RESTRICTIONS
  // ============================================================

  it("Employee cannot create arbitrary audit events via POST /api/audit-logs (403)", async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({
        action: "Forged Action",
        entityType: "User",
        entityId: empId2,
        description: "Employee attempting to forge an audit record",
      }),
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  it("Client cannot create arbitrary audit events via POST /api/audit-logs (403)", async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${clientToken}`,
      },
      body: JSON.stringify({
        action: "Forged Action",
        entityType: "Client",
        entityId: clientId,
        description: "Client attempting to forge an audit record",
      }),
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  it("Manager cannot create arbitrary audit events via POST /api/audit-logs (403)", async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        action: "Manager Action",
        entityType: "Task",
        entityId: "TSK-1",
        description: "Manager attempting to create arbitrary audit record",
      }),
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  // ============================================================
  // 2. AUDIT ACTOR IDENTITY & TIMESTAMP INTEGRITY
  // ============================================================

  it("Admin audit creation derives actor identity from session and ignores client-supplied actorId/userId", async () => {
    // Attempt to spoof actor identity by specifying another user's ID
    const res = await fetch(`${baseUrl}/api/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        userId: empId1, // Attempted spoof!
        actorId: empId1, // Attempted spoof!
        userFullName: "Innocent Victim", // Attempted spoof!
        action: "Admin Maintenance",
        entityType: "System",
        entityId: "MAINT-1",
        description: "Legitimate maintenance action",
      }),
    });

    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.log);

    // Verify in database that the actor is the authenticated Admin, NOT the spoofed empId1
    const dbRes = await pool.query(`SELECT user_id, user_full_name FROM audit_logs WHERE id = $1`, [data.log.id]);
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].user_id, adminId, "Audit record must be attributed to authenticated admin");
    assert.notEqual(dbRes.rows[0].user_id, empId1, "Spoofed userId must not be accepted");
  });

  it("Admin audit creation uses server timestamp and ignores client-supplied forged timestamp", async () => {
    const forgedDate = "2020-01-01T00:00:00.000Z";
    const res = await fetch(`${baseUrl}/api/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        timestamp: forgedDate, // Attempted backdate!
        createdAt: forgedDate,
        action: "Timestamp Test",
        entityType: "System",
        entityId: "TIME-1",
        description: "Testing timestamp tamper resistance",
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();

    const dbRes = await pool.query(`SELECT timestamp FROM audit_logs WHERE id = $1`, [data.log.id]);
    assert.equal(dbRes.rows.length, 1);
    const recordedYear = new Date(dbRes.rows[0].timestamp).getFullYear();
    assert.ok(recordedYear >= 2026, `Expected current server year (>= 2026), got ${recordedYear}`);
  });

  // ============================================================
  // 3. AUDIT LOG DELETION IMMUTABILITY
  // ============================================================

  it("Administrator cannot delete historical audit logs via DELETE /api/audit-logs/:id (403)", async () => {
    const res = await fetch(`${baseUrl}/api/audit-logs/${testLogId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.message, /immutable.*cannot be deleted/i);

    // Verify record was NOT deleted
    const checkDb = await pool.query(`SELECT id FROM audit_logs WHERE id = $1`, [testLogId]);
    assert.equal(checkDb.rows.length, 1, "Audit log must remain intact in database");
  });

  it("Manager, Employee, and Client cannot delete audit logs (403)", async () => {
    for (const token of [managerToken, empToken, clientToken]) {
      const res = await fetch(`${baseUrl}/api/audit-logs/${testLogId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
    }
  });

  // ============================================================
  // 4. HISTORICAL ATTRIBUTION INTEGRITY (USER DELETION / TRANSFER)
  // ============================================================

  it("transferAndDeleteUser does NOT reattribute historical audit logs to the new user", async () => {
    // 1. Create an audit record specifically attributed to empId1
    const empLog = await logAuditEvent(
      empId1,
      "Audit Emp One",
      "Historical Action",
      "Ticket",
      "TKT-HIST-1",
      "Employee One original historical action"
    );

    // 2. Perform transfer and delete of empId1 to empId2
    const transferResult = await transferAndDeleteUser(empId1, empId2);
    assert.equal(transferResult.success, true);

    // 3. Query the audit log and verify user_id is STILL empId1 (NOT empId2)
    const dbRes = await pool.query(`SELECT user_id, user_full_name FROM audit_logs WHERE id = $1`, [empLog.id]);
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].user_id, empId1, "Historical audit record must retain original actor ID");
    assert.notEqual(dbRes.rows[0].user_id, empId2, "Historical audit record must NOT be reattributed to new user");
  });

  // ============================================================
  // 5. NORMAL APPLICATION AUDIT LOGGING & ID LENGTH INTEGRITY
  // ============================================================

  it("logAuditEvent generates valid ID adhering to database column limit and inserts successfully", async () => {
    const log = await logAuditEvent(
      adminId,
      "Audit Admin",
      "Compliance Verification",
      "Security",
      "SEC-1",
      "Verifying logAuditEvent executes without VARCHAR overflow"
    );

    assert.ok(log);
    assert.ok(log.id.length <= 20, `Audit log ID '${log.id}' length ${log.id.length} exceeds 20 characters`);
  });

  // ============================================================
  // 6. REGRESSION: AUTHORIZED AUDIT LOG READS
  // ============================================================

  it("Administrator and Manager can read audit logs (GET /api/audit-logs and /search)", async () => {
    // Admin list
    const adminRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminRes.status, 200);

    // Manager search
    const managerRes = await fetch(`${baseUrl}/api/audit-logs/search?action=System%20Verification`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(managerRes.status, 200);
    const searchData = await managerRes.json();
    assert.ok(Array.isArray(searchData.logs));
  });

  it("Employee and Client cannot read audit logs (403)", async () => {
    const empRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${empToken2}` },
    });
    assert.equal(empRes.status, 403);

    const clientRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    assert.equal(clientRes.status, 403);
  });
});

