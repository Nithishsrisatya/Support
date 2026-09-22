import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import path from "path";
import fs from "fs";
import { pool } from "../src/db";
import ticketRoutes from "../src/routes/ticketRoutes";
import taskRoutes from "../src/routes/taskRoutes";
import { generateToken } from "../src/utils/jwt";
import {
  UPLOAD_BASE_DIR,
  UPLOAD_DIR,
  UPLOAD_TASKS_DIR,
  resolveAttachmentFilePath,
  deleteFile,
  validateFileContent,
  auditOrphanFiles,
  getSafeContentDisposition,
} from "../src/services/fileUploadService";

describe("Phase 12 — File Storage & Upload Security Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const ts = Date.now().toString().slice(-6);

  // Users
  const adminId = `U-FIL-ADM-${ts}`;
  const mgr1Id = `U-FIL-MG1-${ts}`;
  const mgr2Id = `U-FIL-MG2-${ts}`;
  const emp1Id = `U-FIL-EM1-${ts}`;
  const emp2Id = `U-FIL-EM2-${ts}`;
  const client1Id = `C-FIL-CL1-${ts}`;
  const client2Id = `C-FIL-CL2-${ts}`;

  const adminEmail = `admin-${ts}@testfile.com`;
  const mgr1Email = `mgr1-${ts}@testfile.com`;
  const mgr2Email = `mgr2-${ts}@testfile.com`;
  const emp1Email = `emp1-${ts}@testfile.com`;
  const emp2Email = `emp2-${ts}@testfile.com`;
  const client1Email = `client1-${ts}@testfile.com`;
  const client2Email = `client2-${ts}@testfile.com`;

  let adminToken: string;
  let mgr1Token: string;
  let mgr2Token: string;
  let emp1Token: string;
  let emp2Token: string;
  let client1Token: string;
  let client2Token: string;

  // Tickets & Tasks
  const ticket1Id = `TKT-FIL-1-${ts}`;
  const ticket2Id = `TKT-FIL-2-${ts}`;
  const task1Id = `TSK-FIL-1-${ts}`;
  const task2Id = `TSK-FIL-2-${ts}`;

  // Track created attachment IDs and physical files for cleanup
  const createdAttachmentIds: string[] = [];
  const createdDiskFiles: string[] = [];

  // Valid file byte signatures for testing
  const validPngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
    0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
  ]);

  const validPdfBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n120\n%%EOF"
  );

  before(async () => {
    const hashed = await bcrypt.hash("FilePass123!", 10);

    // 1. Insert test users
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES
       ($1, 'File Admin', $2, $3, 'Administrator', 'IT', 'Active', false, NOW(), NOW()),
       ($4, 'File Manager 1', $5, $3, 'Manager', 'Support', 'Active', false, NOW(), NOW()),
       ($6, 'File Manager 2', $7, $3, 'Manager', 'Sales', 'Active', false, NOW(), NOW()),
       ($8, 'File Employee 1', $9, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW()),
       ($10, 'File Employee 2', $11, $3, 'Employee', 'Sales', 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [
        adminId, adminEmail, hashed,
        mgr1Id, mgr1Email,
        mgr2Id, mgr2Email,
        emp1Id, emp1Email,
        emp2Id, emp2Email,
      ]
    );

    // Set manager relationships
    await pool.query(`UPDATE users SET manager_id = $1 WHERE id = $2`, [mgr1Id, emp1Id]);
    await pool.query(`UPDATE users SET manager_id = $1 WHERE id = $2`, [mgr2Id, emp2Id]);

    // 2. Insert test clients
    await pool.query(
      `INSERT INTO clients (id, company_name, contact_person, email, status, created_date, updated_date)
       VALUES
       ($1, 'File Client Corp 1', 'Client Rep 1', $2, 'Active', NOW(), NOW()),
       ($3, 'File Client Corp 2', 'Client Rep 2', $4, 'Active', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [client1Id, client1Email, client2Id, client2Email]
    );

    // 3. Generate tokens
    adminToken = generateToken({ id: adminId, role: "Administrator", email: adminEmail, userType: "User" });
    mgr1Token = generateToken({ id: mgr1Id, role: "Manager", email: mgr1Email, userType: "User" });
    mgr2Token = generateToken({ id: mgr2Id, role: "Manager", email: mgr2Email, userType: "User" });
    emp1Token = generateToken({ id: emp1Id, role: "Employee", email: emp1Email, userType: "User" });
    emp2Token = generateToken({ id: emp2Id, role: "Employee", email: emp2Email, userType: "User" });
    client1Token = generateToken({ id: client1Id, role: "Client", email: client1Email, userType: "Client" });
    client2Token = generateToken({ id: client2Id, role: "Client", email: client2Email, userType: "Client" });

    // 4. Insert test tickets
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, created_date, updated_date)
       VALUES
       ($1, 'Ticket One Team 1', 'Description 1', 'Technical Issue', 'High', 'In Progress', $2, $3, NOW(), NOW()),
       ($4, 'Ticket Two Team 2', 'Description 2', 'Billing', 'Medium', 'In Progress', $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticket1Id, emp1Id, client1Id, ticket2Id, emp2Id, client2Id]
    );

    // 5. Insert test tasks
    await pool.query(
      `INSERT INTO tasks (id, title, description, task_category, priority, status, assigned_to, assigned_by, created_date, updated_date)
       VALUES
       ($1, 'Task One Team 1', 'Description 1', 'Support', 'High', 'In Progress', $2, $3, NOW(), NOW()),
       ($4, 'Task Two Team 2', 'Description 2', 'Sales', 'Medium', 'In Progress', $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [task1Id, emp1Id, mgr1Id, task2Id, emp2Id, mgr2Id]
    );

    // 6. Mount Express test server (mirroring server.ts)
    const app = express();
    app.use(express.json());
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/tasks", taskRoutes);

    // Static files: only serve dist/ (do not serve uploads/)
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // 1. Close Express test server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 2. Clean up test files from disk
    for (const file of createdDiskFiles) {
      deleteFile(file);
    }

    // Clean up created attachments in DB
    try {
      if (createdAttachmentIds.length > 0) {
        await pool.query(`DELETE FROM ticket_attachments WHERE id = ANY($1::uuid[])`, [createdAttachmentIds]);
        await pool.query(`DELETE FROM task_attachments WHERE id = ANY($1::uuid[])`, [createdAttachmentIds]);
      }
      await pool.query(`DELETE FROM ticket_attachments WHERE ticket_id IN ($1, $2)`, [ticket1Id, ticket2Id]);
      await pool.query(`DELETE FROM task_attachments WHERE task_id IN ($1, $2)`, [task1Id, task2Id]);
      await pool.query(`DELETE FROM ticket_history WHERE ticket_id IN ($1, $2)`, [ticket1Id, ticket2Id]);
      await pool.query(`DELETE FROM task_history WHERE task_id IN ($1, $2)`, [task1Id, task2Id]);
      await pool.query(`DELETE FROM tickets WHERE id IN ($1, $2)`, [ticket1Id, ticket2Id]);
      await pool.query(`DELETE FROM tasks WHERE id IN ($1, $2)`, [task1Id, task2Id]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5)`, [adminId, mgr1Id, mgr2Id, emp1Id, emp2Id]);
      await pool.query(`DELETE FROM clients WHERE id IN ($1, $2)`, [client1Id, client2Id]);
    } catch (err) {
      console.error("Cleanup error in fileStorageSecurity.test.ts:", err);
    }
  });

  // Shared helper for multipart uploads
  async function uploadFile(
    ticketOrTaskId: string,
    targetType: "tickets" | "tasks",
    fileName: string,
    fileBytes: Buffer,
    mimeType: string,
    token: string
  ) {
    const formData = new FormData();
    const blob = new Blob([fileBytes], { type: mimeType });
    formData.append("file", blob, fileName);

    return await fetch(`${baseUrl}/api/${targetType}/${ticketOrTaskId}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Valid attachment upload (image / document)
  // ──────────────────────────────────────────────────────────────────────────
  it("1. Valid attachment upload succeeds with 201 Created and safe metadata", async () => {
    const res = await uploadFile(ticket1Id, "tickets", "screenshot.png", validPngBytes, "image/png", emp1Token);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.attachment.id);
    assert.strictEqual(body.attachment.fileName, "screenshot.png");
    assert.strictEqual(body.attachment.mimeType, "image/png");
    assert.strictEqual(body.attachment.fileSize, validPngBytes.length);

    createdAttachmentIds.push(body.attachment.id);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Oversized upload (>10MB) rejected
  // ──────────────────────────────────────────────────────────────────────────
  it("2. Oversized upload (>10MB) is rejected with HTTP 413 Payload Too Large", async () => {
    // 11 MB buffer
    const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 0x41);
    const res = await uploadFile(ticket1Id, "tickets", "large.pdf", oversizedBuffer, "application/pdf", emp1Token);
    assert.strictEqual(res.status, 413);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.message.includes("10MB"));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Unsupported file type rejected
  // ──────────────────────────────────────────────────────────────────────────
  it("3. Unsupported file type (.xyz / application/octet-stream) is rejected with HTTP 400", async () => {
    const fakeBytes = Buffer.from("Random binary data");
    const res = await uploadFile(ticket1Id, "tickets", "data.xyz", fakeBytes, "application/octet-stream", emp1Token);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Executable file rejected
  // ──────────────────────────────────────────────────────────────────────────
  it("4. Executable files (.exe, .bat, .sh) are strictly rejected with HTTP 400", async () => {
    const exeBytes = Buffer.from("MZ\x90\x00\x03\x00\x00\x00");
    const res = await uploadFile(ticket1Id, "tickets", "program.exe", exeBytes, "application/x-msdownload", emp1Token);
    assert.strictEqual(res.status, 400);

    const batBytes = Buffer.from("@echo off\r\ncalc.exe");
    const resBat = await uploadFile(ticket1Id, "tickets", "script.bat", batBytes, "text/plain", emp1Token);
    assert.strictEqual(resBat.status, 400);

    const shBytes = Buffer.from("#!/bin/sh\r\nrm -rf /");
    const resSh = await uploadFile(ticket1Id, "tickets", "run.sh", shBytes, "text/plain", emp1Token);
    assert.strictEqual(resSh.status, 400);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Dangerous double extension rejected
  // ──────────────────────────────────────────────────────────────────────────
  it("5. Dangerous double extension (evil.php.png, trojan.exe.pdf) is rejected with HTTP 400", async () => {
    const res1 = await uploadFile(ticket1Id, "tickets", "evil.php.png", validPngBytes, "image/png", emp1Token);
    assert.strictEqual(res1.status, 400);
    const body1 = await res1.json();
    assert.strictEqual(body1.success, false);

    const res2 = await uploadFile(ticket1Id, "tickets", "trojan.exe.pdf", validPdfBytes, "application/pdf", emp1Token);
    assert.strictEqual(res2.status, 400);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Path traversal filename rejected or safely contained
  // ──────────────────────────────────────────────────────────────────────────
  it("6. Path traversal filename (../../passwd.png) is safely stripped and contained", async () => {
    const res = await uploadFile(
      ticket1Id,
      "tickets",
      "../../../../etc/passwd.png",
      validPngBytes,
      "image/png",
      emp1Token
    );
    // Either rejected with 400 or safely stripped
    if (res.status === 201) {
      const body = await res.json();
      assert.ok(body.attachment.id);
      createdAttachmentIds.push(body.attachment.id);
      // Query DB to inspect stored file path
      const dbRes = await pool.query(`SELECT file_path FROM ticket_attachments WHERE id = $1`, [body.attachment.id]);
      const storedPath = dbRes.rows[0].file_path;
      // Stored file path must be a generated unique name, not containing '..'
      assert.ok(!storedPath.includes(".."));
      assert.ok(!storedPath.includes("/"));
      assert.ok(!storedPath.includes("\\"));
    } else {
      assert.strictEqual(res.status, 400);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Absolute path filename cannot escape upload directory
  // ──────────────────────────────────────────────────────────────────────────
  it("7. Absolute path filename (C:\\Windows\\cmd.png) cannot escape upload directory", async () => {
    const res = await uploadFile(
      ticket1Id,
      "tickets",
      "C:\\Windows\\System32\\cmd.exe.png",
      validPngBytes,
      "image/png",
      emp1Token
    );
    // Either rejected with 400 or safely normalized
    if (res.status === 201) {
      const body = await res.json();
      createdAttachmentIds.push(body.attachment.id);
      const dbRes = await pool.query(`SELECT file_path FROM ticket_attachments WHERE id = $1`, [body.attachment.id]);
      const resolved = resolveAttachmentFilePath(dbRes.rows[0].file_path);
      assert.ok(resolved !== null);
      assert.ok(resolved.startsWith(UPLOAD_BASE_DIR), "Resolved path must be inside UPLOAD_BASE_DIR");
    } else {
      assert.strictEqual(res.status, 400);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Same original filename produces unique physical files
  // ──────────────────────────────────────────────────────────────────────────
  it("8. Uploading two files with identical original names creates unique storage files (no overwrite)", async () => {
    const res1 = await uploadFile(ticket1Id, "tickets", "contract.pdf", validPdfBytes, "application/pdf", emp1Token);
    assert.strictEqual(res1.status, 201);
    const body1 = await res1.json();
    createdAttachmentIds.push(body1.attachment.id);

    const res2 = await uploadFile(ticket1Id, "tickets", "contract.pdf", validPdfBytes, "application/pdf", emp1Token);
    assert.strictEqual(res2.status, 201);
    const body2 = await res2.json();
    createdAttachmentIds.push(body2.attachment.id);

    assert.notStrictEqual(body1.attachment.id, body2.attachment.id);

    // Verify distinct disk filenames in database
    const rows = await pool.query(
      `SELECT file_path FROM ticket_attachments WHERE id IN ($1, $2)`,
      [body1.attachment.id, body2.attachment.id]
    );
    assert.strictEqual(rows.rows.length, 2);
    assert.notStrictEqual(rows.rows[0].file_path, rows.rows[1].file_path);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Physical filesystem path is NOT exposed in API response
  // ──────────────────────────────────────────────────────────────────────────
  it("9. Physical filesystem path is not exposed in API responses", async () => {
    const res = await uploadFile(ticket1Id, "tickets", "evidence.png", validPngBytes, "image/png", emp1Token);
    assert.strictEqual(res.status, 201);
    const body = await res.json();
    createdAttachmentIds.push(body.attachment.id);

    // Response must not contain filePath, internal directory structure, or full path
    assert.strictEqual(body.attachment.filePath, undefined);
    assert.ok(!JSON.stringify(body).includes("uploads\\tickets"));
    assert.ok(!JSON.stringify(body).includes("uploads/tickets"));

    // GET /api/tickets/:id/attachments list also must not expose filePath
    const listRes = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments`, {
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    const listBody = await listRes.json();
    assert.strictEqual(listRes.status, 200);
    assert.ok(Array.isArray(listBody));
    for (const item of listBody) {
      assert.strictEqual(item.filePath, undefined);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Unauthenticated attachment access rejected
  // ──────────────────────────────────────────────────────────────────────────
  it("10. Unauthenticated attachment access is rejected with HTTP 401 Unauthorized", async () => {
    const listRes = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments`);
    assert.strictEqual(listRes.status, 401);

    const previewRes = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/any-id/preview`);
    assert.strictEqual(previewRes.status, 401);

    const downloadRes = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/any-id/download`);
    assert.strictEqual(downloadRes.status, 401);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Unauthorized employee attachment access rejected (IDOR)
  // ──────────────────────────────────────────────────────────────────────────
  it("11. Unauthorized employee access to another team's ticket attachment is rejected with HTTP 403", async () => {
    // emp2 belongs to team 2 and is not assigned to ticket 1
    const attId = createdAttachmentIds[0];
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/preview`, {
      headers: { Authorization: `Bearer ${emp2Token}` },
    });
    assert.strictEqual(res.status, 403);

    const dlRes = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/download`, {
      headers: { Authorization: `Bearer ${emp2Token}` },
    });
    assert.strictEqual(dlRes.status, 403);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Unauthorized client attachment access rejected (IDOR)
  // ──────────────────────────────────────────────────────────────────────────
  it("12. Unauthorized client access to another client's ticket attachment is rejected with HTTP 403", async () => {
    const attId = createdAttachmentIds[0];
    // client2 tries to access ticket1 attachment (owned by client1)
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/preview`, {
      headers: { Authorization: `Bearer ${client2Token}` },
    });
    assert.strictEqual(res.status, 403);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 13: Manager scope enforced
  // ──────────────────────────────────────────────────────────────────────────
  it("13. Manager cannot access attachments on tickets outside supervised team scope (403)", async () => {
    const attId = createdAttachmentIds[0];
    // mgr2 manages Sales team; Ticket 1 belongs to Support team (emp1, mgr1)
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/preview`, {
      headers: { Authorization: `Bearer ${mgr2Token}` },
    });
    assert.strictEqual(res.status, 403);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 14: Authorized users can access permitted attachment
  // ──────────────────────────────────────────────────────────────────────────
  it("14. Authorized users (Assignee, Supervisor Manager, Owner Client, Admin) can access attachment", async () => {
    const attId = createdAttachmentIds[0];

    // 1. Assignee Employee (emp1)
    const resEmp = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/preview`, {
      headers: { Authorization: `Bearer ${emp1Token}` },
    });
    assert.strictEqual(resEmp.status, 200);

    // 2. Supervised Manager (mgr1)
    const resMgr = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/preview`, {
      headers: { Authorization: `Bearer ${mgr1Token}` },
    });
    assert.strictEqual(resMgr.status, 200);

    // 3. Client Owner (client1)
    const resClt = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/preview`, {
      headers: { Authorization: `Bearer ${client1Token}` },
    });
    assert.strictEqual(resClt.status, 200);

    // 4. Administrator
    const resAdm = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/preview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resAdm.status, 200);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 15: Unauthorized attachment deletion rejected
  // ──────────────────────────────────────────────────────────────────────────
  it("15. Unauthorized user (cross-team employee/manager) cannot delete attachment (403)", async () => {
    const attId = createdAttachmentIds[0];

    // emp2 tries to delete Ticket 1 attachment
    const resEmp = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${emp2Token}` },
    });
    assert.strictEqual(resEmp.status, 403);

    // mgr2 tries to delete Ticket 1 attachment
    const resMgr = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${mgr2Token}` },
    });
    assert.strictEqual(resMgr.status, 403);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 16: Authorized attachment deletion works and removes physical file
  // ──────────────────────────────────────────────────────────────────────────
  it("16. Authorized attachment deletion deletes database record and removes file from disk", async () => {
    // Upload an attachment specifically to delete
    const uploadRes = await uploadFile(ticket1Id, "tickets", "to_delete.png", validPngBytes, "image/png", emp1Token);
    assert.strictEqual(uploadRes.status, 201);
    const body = await uploadRes.json();
    const targetAttId = body.attachment.id;

    // Verify physical file exists before deletion
    const dbRes = await pool.query(`SELECT file_path FROM ticket_attachments WHERE id = $1`, [targetAttId]);
    const storedPath = dbRes.rows[0].file_path;
    const physicalPath = resolveAttachmentFilePath(storedPath);
    assert.ok(physicalPath !== null);
    assert.ok(fs.existsSync(physicalPath));

    // Delete attachment via API (as Administrator)
    const delRes = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${targetAttId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(delRes.status, 200);

    // Verify DB record is gone
    const checkDb = await pool.query(`SELECT id FROM ticket_attachments WHERE id = $1`, [targetAttId]);
    assert.strictEqual(checkDb.rows.length, 0);

    // Verify file is deleted from disk
    assert.strictEqual(fs.existsSync(physicalPath), false, "Physical file must be unlinked from disk");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 17: Deleted attachment cannot be downloaded or previewed
  // ──────────────────────────────────────────────────────────────────────────
  it("17. Deleted attachment returns HTTP 404 on preview or download", async () => {
    // Generate a random UUID that does not exist in DB
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const resPreview = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${nonExistentId}/preview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resPreview.status, 404);

    const resDownload = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${nonExistentId}/download`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resDownload.status, 404);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 18: Static public URL cannot bypass authorization
  // ──────────────────────────────────────────────────────────────────────────
  it("18. Direct static HTTP request to /uploads cannot bypass authorization", async () => {
    const attId = createdAttachmentIds[0];
    const dbRes = await pool.query(`SELECT file_path FROM ticket_attachments WHERE id = $1`, [attId]);
    const storedFilename = dbRes.rows[0].file_path;

    // Try fetching file directly through web server static route without Authorization header
    const directRes = await fetch(`${baseUrl}/uploads/tickets/${storedFilename}`);
    // Should NOT return 200 with the file; must either return 404 or SPA index.html
    const contentType = directRes.headers.get("content-type") || "";
    assert.ok(
      directRes.status === 404 || contentType.includes("text/html"),
      "Direct static access to uploaded file must be forbidden or routed to SPA fallback"
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 19: Security headers prevent active script execution
  // ──────────────────────────────────────────────────────────────────────────
  it("19. Attachment preview returns nosniff, CSP sandbox, and sanitized Content-Disposition", async () => {
    const attId = createdAttachmentIds[0];
    const res = await fetch(`${baseUrl}/api/tickets/${ticket1Id}/attachments/${attId}/preview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);

    const nosniff = res.headers.get("x-content-type-options");
    const csp = res.headers.get("content-security-policy");
    const disposition = res.headers.get("content-disposition");

    assert.strictEqual(nosniff, "nosniff");
    assert.ok(csp?.includes("default-src 'none'"));
    assert.ok(csp?.includes("sandbox"));
    assert.ok(disposition?.includes("filename="));

    // Also test getSafeContentDisposition helper with quotes and CRLF
    const maliciousName = `evil"test\r\nHeader: inject<script>.png`;
    const safeDisp = getSafeContentDisposition(maliciousName, "inline");
    assert.ok(!safeDisp.includes("\r"));
    assert.ok(!safeDisp.includes("\n"));
    assert.ok(!safeDisp.includes('"test'));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 20: File/DB failure cleanup behaves safely
  // ──────────────────────────────────────────────────────────────────────────
  it("20. Content validation failure immediately removes temporary uploaded file from disk", async () => {
    // Count files before
    const initialOrphans = await auditOrphanFiles();

    // Attempt to upload an invalid file (e.g. claim PNG MIME, but send invalid text content)
    const fakePng = Buffer.from("NOT_A_PNG_FILE_HEADER_TEXT_STRING");
    const res = await uploadFile(ticket1Id, "tickets", "fake.png", fakePng, "image/png", emp1Token);
    assert.strictEqual(res.status, 400);

    // Count files after
    const afterOrphans = await auditOrphanFiles();
    assert.strictEqual(
      afterOrphans.diskFilesCount,
      initialOrphans.diskFilesCount,
      "Failed upload must not leave an orphaned file on disk"
    );
  });
});

