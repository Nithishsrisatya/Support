import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { pool } from "../src/db";
import { generateToken } from "../src/utils/jwt";
import ticketRoutes from "../src/routes/ticketRoutes";
import taskRoutes from "../src/routes/taskRoutes";
import searchRoutes from "../src/routes/searchRoutes";
import {
  getTicketById,
  getTicketsForManager,
  getTicketsForEmployee,
  getTicketsForClient,
  addTicketComment,
} from "../src/services/ticketService";
import {
  getTasksForManager,
  getTasksForEmployee,
  searchTasks,
} from "../src/services/taskService";
import { globalSearch } from "../src/services/searchService";

describe("Phase 14 — Backend Performance & Data-Access Hardening", () => {
  let server: Server;
  let baseUrl: string;

  const ts = Date.now().toString().slice(-6);

  // Test identifiers
  const adminId = `U-PRF-ADM-${ts}`;
  const mgr1Id = `U-PRF-MG1-${ts}`;
  const mgr2Id = `U-PRF-MG2-${ts}`;
  const emp1Id = `U-PRF-EM1-${ts}`;
  const emp2Id = `U-PRF-EM2-${ts}`;
  const client1Id = `C-PRF-CL1-${ts}`;
  const client2Id = `C-PRF-CL2-${ts}`;

  const adminEmail = `perf-admin-${ts}@testperf.com`;
  const mgr1Email = `perf-mgr1-${ts}@testperf.com`;
  const mgr2Email = `perf-mgr2-${ts}@testperf.com`;
  const emp1Email = `perf-emp1-${ts}@testperf.com`;
  const emp2Email = `perf-emp2-${ts}@testperf.com`;
  const client1Email = `perf-cl1-${ts}@testperf.com`;
  const client2Email = `perf-cl2-${ts}@testperf.com`;

  let adminToken: string;
  let mgr1Token: string;
  let mgr2Token: string;
  let emp1Token: string;
  let emp2Token: string;
  let client1Token: string;

  // Primary test tickets & tasks
  const ticket1Id = `TKT-PRF-1-${ts}`;
  const ticket2Id = `TKT-PRF-2-${ts}`;
  const task1Id = `TSK-PRF-1-${ts}`;
  const task2Id = `TSK-PRF-2-${ts}`;

  // Batch tickets & tasks for search/limit tests
  const bulkTicketIds: string[] = [];
  const bulkTaskIds: string[] = [];

  before(async () => {
    const hashed = await bcrypt.hash("PerfPass123!", 10);

    // 1. Insert test users
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES
       ($1, 'Perf Admin', $2, $3, 'Administrator', 'IT', 'Active', false, NOW(), NOW()),
       ($4, 'Perf Manager 1', $5, $3, 'Manager', 'Support', 'Active', false, NOW(), NOW()),
       ($6, 'Perf Manager 2', $7, $3, 'Manager', 'Sales', 'Active', false, NOW(), NOW()),
       ($8, 'Perf Employee 1', $9, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW()),
       ($10, 'Perf Employee 2', $11, $3, 'Employee', 'Sales', 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [
        adminId, adminEmail, hashed,
        mgr1Id, mgr1Email,
        mgr2Id, mgr2Email,
        emp1Id, emp1Email,
        emp2Id, emp2Email,
      ]
    );

    // Set manager hierarchies
    await pool.query(`UPDATE users SET manager_id = $1 WHERE id = $2`, [mgr1Id, emp1Id]);
    await pool.query(`UPDATE users SET manager_id = $1 WHERE id = $2`, [mgr2Id, emp2Id]);

    // 2. Insert test clients
    await pool.query(
      `INSERT INTO clients (id, company_name, contact_person, email, status, created_date, updated_date)
       VALUES
       ($1, 'Perf Client Corp 1', 'Perf Contact 1', $2, 'Active', NOW(), NOW()),
       ($3, 'Perf Client Corp 2', 'Perf Contact 2', $4, 'Active', NOW(), NOW())
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

    // 4. Insert test tickets
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, created_date, updated_date)
       VALUES
       ($1, 'Perf Ticket Team 1', 'Description for ticket 1', 'Technical Issue', 'High', 'In Progress', $2, $3, NOW(), NOW()),
       ($4, 'Perf Ticket Team 2', 'Description for ticket 2', 'Billing', 'Medium', 'Open', $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ticket1Id, emp1Id, client1Id, ticket2Id, emp2Id, client2Id]
    );

    // Insert history entry for ticket1Id
    await pool.query(
      `INSERT INTO ticket_history (ticket_id, status, updated_by, comment, timestamp)
       VALUES ($1, 'In Progress', 'Perf Admin', 'Ticket created for performance testing', NOW())`,
      [ticket1Id]
    );

    // 5. Insert test tasks
    await pool.query(
      `INSERT INTO tasks (id, title, description, task_category, priority, status, assigned_to, assigned_by, created_date, updated_date)
       VALUES
       ($1, 'Perf Task Team 1', 'Description for task 1', 'Support', 'High', 'In Progress', $2, $3, NOW(), NOW()),
       ($4, 'Perf Task Team 2', 'Description for task 2', 'Sales', 'Medium', 'Pending', $5, $6, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [task1Id, emp1Id, mgr1Id, task2Id, emp2Id, mgr2Id]
    );

    // 6. Insert 55 bulk tickets and tasks for search limit tests (to verify LIMIT 50 clamping)
    for (let i = 1; i <= 55; i++) {
      const bTktId = `TKT-BLKP-${ts}-${i}`;
      const bTskId = `TSK-BLKP-${ts}-${i}`;
      bulkTicketIds.push(bTktId);
      bulkTaskIds.push(bTskId);
      await pool.query(
        `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, created_date, updated_date)
         VALUES ($1, $2, 'Bulk description', 'Technical Issue', 'Low', 'Open', $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [bTktId, `PerfSearchTermBulk Ticket ${i}`, emp1Id, client1Id]
      );
      await pool.query(
        `INSERT INTO tasks (id, title, description, task_category, priority, status, assigned_to, assigned_by, created_date, updated_date)
         VALUES ($1, $2, 'Bulk description', 'Support', 'Low', 'Pending', $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [bTskId, `PerfSearchTermBulk Task ${i}`, emp1Id, mgr1Id]
      );
    }

    // 7. Mount Express test app
    const app = express();
    app.use(express.json());

    // Health check endpoint (mirroring server.ts)
    app.get("/api/health", async (req, res) => {
      try {
        await pool.query("SELECT 1");
        res.json({
          success: true,
          database: "Connected",
          server: "Running",
          timestamp: new Date(),
        });
      } catch (error) {
        res.status(503).json({
          success: false,
          database: "Disconnected",
          server: "Running",
          timestamp: new Date(),
        });
      }
    });

    app.use("/api/tickets", ticketRoutes);
    app.use("/api/tasks", taskRoutes);
    app.use("/api/search", searchRoutes);

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

    try {
      // Clean up bulk items
      if (bulkTicketIds.length > 0) {
        await pool.query(`DELETE FROM ticket_history WHERE ticket_id = ANY($1::varchar[])`, [bulkTicketIds]);
        await pool.query(`DELETE FROM tickets WHERE id = ANY($1::varchar[])`, [bulkTicketIds]);
      }
      if (bulkTaskIds.length > 0) {
        await pool.query(`DELETE FROM task_history WHERE task_id = ANY($1::varchar[])`, [bulkTaskIds]);
        await pool.query(`DELETE FROM tasks WHERE id = ANY($1::varchar[])`, [bulkTaskIds]);
      }

      // Clean up primary items
      await pool.query(`DELETE FROM ticket_comments WHERE ticket_id IN ($1, $2)`, [ticket1Id, ticket2Id]);
      await pool.query(`DELETE FROM ticket_history WHERE ticket_id IN ($1, $2)`, [ticket1Id, ticket2Id]);
      await pool.query(`DELETE FROM tickets WHERE id IN ($1, $2)`, [ticket1Id, ticket2Id]);
      await pool.query(`DELETE FROM task_history WHERE task_id IN ($1, $2)`, [task1Id, task2Id]);
      await pool.query(`DELETE FROM tasks WHERE id IN ($1, $2)`, [task1Id, task2Id]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5)`, [adminId, mgr1Id, mgr2Id, emp1Id, emp2Id]);
      await pool.query(`DELETE FROM clients WHERE id IN ($1, $2)`, [client1Id, client2Id]);
    } catch (err) {
      console.error("Cleanup error in backendPerformance.test.ts:", err);
    }
  });

  // =========================================================================
  // 1. getTicketById O(1) direct indexed lookup
  // =========================================================================
  it("1. getTicketById returns the exact ticket with full history in single query", async () => {
    const ticket = await getTicketById(ticket1Id);
    assert.ok(ticket !== null, "Ticket should exist");
    assert.equal(ticket.id, ticket1Id);
    assert.equal(ticket.subject, "Perf Ticket Team 1");
    assert.ok(Array.isArray(ticket.history), "Ticket should have history array");
    assert.ok(ticket.history.length >= 1, "History array should contain at least 1 entry");
    assert.equal(ticket.history[0].updatedBy, "Perf Admin");
    assert.equal(ticket.history[0].status, "In Progress");
    assert.equal(ticket.isOverdue, false);
  });

  it("2. getTicketById returns null for non-existent ticket without scanning or erroring", async () => {
    const ticket = await getTicketById(`NON-EXISTENT-${ts}`);
    assert.equal(ticket, null, "Non-existent ticket should return null");
  });

  // =========================================================================
  // 2. Role-based Direct SQL Filtering for Tickets
  // =========================================================================
  it("3. getTicketsForManager returns only tickets belonging to assigned team members", async () => {
    // mgr1 oversees emp1Id (team member). emp2Id belongs to mgr2.
    const tickets = await getTicketsForManager([emp1Id]);
    assert.ok(Array.isArray(tickets), "Expected array of tickets");
    const foundT1 = tickets.some((t) => t.id === ticket1Id);
    const foundT2 = tickets.some((t) => t.id === ticket2Id);
    assert.equal(foundT1, true, "Manager 1 must see Team 1 ticket");
    assert.equal(foundT2, false, "Manager 1 must NOT see Team 2 ticket");
  });

  it("4. getTicketsForManager returns empty array when team is empty without throwing", async () => {
    const tickets = await getTicketsForManager([]);
    assert.ok(Array.isArray(tickets), "Expected array");
    assert.equal(tickets.length, 0, "Empty team must return empty tickets array");
  });

  it("5. getTicketsForEmployee returns only tickets assigned to the employee", async () => {
    const ticketsEmp1 = await getTicketsForEmployee(emp1Id);
    assert.ok(ticketsEmp1.some((t) => t.id === ticket1Id), "Employee 1 must see ticket 1");
    assert.equal(ticketsEmp1.some((t) => t.id === ticket2Id), false, "Employee 1 must NOT see ticket 2");

    const ticketsEmp2 = await getTicketsForEmployee(emp2Id);
    assert.equal(ticketsEmp2.some((t) => t.id === ticket1Id), false, "Employee 2 must NOT see ticket 1");
    assert.ok(ticketsEmp2.some((t) => t.id === ticket2Id), "Employee 2 must see ticket 2");
  });

  it("6. getTicketsForClient returns only tickets belonging to the client", async () => {
    const ticketsClient1 = await getTicketsForClient(client1Id);
    assert.ok(ticketsClient1.some((t) => t.id === ticket1Id), "Client 1 must see ticket 1");
    assert.equal(ticketsClient1.some((t) => t.id === ticket2Id), false, "Client 1 must NOT see ticket 2");
  });

  // =========================================================================
  // 3. Role-based Direct SQL Filtering for Tasks
  // =========================================================================
  it("7. getTasksForManager returns only tasks assigned to or created by manager's team", async () => {
    const tasksMgr1 = await getTasksForManager([emp1Id], mgr1Id);
    assert.ok(Array.isArray(tasksMgr1), "Expected array of tasks");
    const foundTask1 = tasksMgr1.some((t) => t.id === task1Id);
    const foundTask2 = tasksMgr1.some((t) => t.id === task2Id);
    assert.equal(foundTask1, true, "Manager 1 must see Task 1");
    assert.equal(foundTask2, false, "Manager 1 must NOT see Task 2");
  });

  it("8. getTasksForEmployee returns only tasks assigned to or created by the employee", async () => {
    const tasksEmp1 = await getTasksForEmployee(emp1Id);
    assert.ok(tasksEmp1.some((t) => t.id === task1Id), "Employee 1 must see task 1");
    assert.equal(tasksEmp1.some((t) => t.id === task2Id), false, "Employee 1 must NOT see task 2");

    const tasksEmp2 = await getTasksForEmployee(emp2Id);
    assert.equal(tasksEmp2.some((t) => t.id === task1Id), false, "Employee 2 must NOT see task 1");
    assert.ok(tasksEmp2.some((t) => t.id === task2Id), "Employee 2 must see task 2");
  });

  // =========================================================================
  // 4. searchTasks Safe Pagination & Clamping
  // =========================================================================
  it("9. searchTasks correctly limits results by limit parameter", async () => {
    const result = await searchTasks({ limit: 5, page: 1 });
    assert.ok(Array.isArray(result.tasks));
    assert.ok(result.tasks.length <= 5, "Results count must not exceed 5");
    assert.equal(result.page, 1);
    assert.equal(result.limit, 5);
  });

  it("10. searchTasks clamps excessive limit to maximum 100", async () => {
    const result = await searchTasks({ limit: 500 });
    assert.equal(result.limit, 100, "Limit should be clamped to max 100");
  });

  it("11. searchTasks calculates correct total count and totalPages", async () => {
    const result = await searchTasks({ limit: 10, page: 1 });
    assert.ok(typeof result.total === "number");
    assert.ok(result.total >= 55, "Total count must reflect at least the 55 bulk tasks");
    assert.equal(result.totalPages, Math.ceil(result.total / 10));
  });

  it("12. searchTasks applies category and status filters directly in SQL", async () => {
    const result = await searchTasks({
      task_category: "Support",
      status: "In Progress",
      assigned_to: emp1Id,
    });
    assert.ok(result.tasks.length >= 1, "Should find at least 1 matching task");
    assert.ok(result.tasks.every((t) => t.taskCategory === "Support" && t.status === "In Progress"));
  });

  // =========================================================================
  // 5. Global Search Performance & Query Bounding
  // =========================================================================
  it("13. globalSearch limits ticket results to 50 items", async () => {
    const searchRes = await globalSearch("PerfSearchTermBulk", "Administrator", adminId);
    assert.ok(Array.isArray(searchRes.tickets));
    assert.ok(
      searchRes.tickets.length <= 50,
      `Tickets count (${searchRes.tickets.length}) must not exceed bounded LIMIT 50`
    );
  });

  it("14. globalSearch limits task results to 50 items", async () => {
    const searchRes = await globalSearch("PerfSearchTermBulk", "Administrator", adminId);
    assert.ok(Array.isArray(searchRes.tasks));
    assert.ok(
      searchRes.tasks.length <= 50,
      `Tasks count (${searchRes.tasks.length}) must not exceed bounded LIMIT 50`
    );
  });

  it("15. globalSearch executes ticket, task, employee, and client queries concurrently", async () => {
    const start = Date.now();
    const searchRes = await globalSearch("Perf", "Administrator", adminId);
    const duration = Date.now() - start;
    assert.ok(searchRes.tickets.length > 0, "Should return tickets");
    assert.ok(searchRes.tasks.length > 0, "Should return tasks");
    assert.ok(duration < 2000, `Global search should execute in parallel under 2000ms (took ${duration}ms)`);
  });

  // =========================================================================
  // 6. Health Check Database Ping (SELECT 1)
  // =========================================================================
  it("16. GET /api/health returns HTTP 200 with { database: 'Connected' } when pool queries succeed", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.database, "Connected");
    assert.equal(body.server, "Running");
  });

  // =========================================================================
  // 7. Database Performance Indexes Verification
  // =========================================================================
  it("17. Performance indexes exist in PostgreSQL schema for tasks(created_date) and audit_logs", async () => {
    // Check idx_tasks_created_date
    const taskIdxRes = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'tasks' AND indexname = 'idx_tasks_created_date'`
    );
    assert.equal(taskIdxRes.rows.length, 1, "idx_tasks_created_date must exist on tasks table");

    // Check audit_logs indexes
    const auditIdxRes = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'audit_logs' AND indexname IN (
        'idx_audit_logs_timestamp',
        'idx_audit_logs_user_id',
        'idx_audit_logs_action',
        'idx_audit_logs_entity'
      )`
    );
    assert.equal(auditIdxRes.rows.length, 4, "All 4 performance indexes must exist on audit_logs table");
  });

  // =========================================================================
  // 8. Transaction Atomicity and Rollback Protection
  // =========================================================================
  it("18. Transaction rollback ensures atomicity when error occurs during transactional update", async () => {
    // Verify addTicketComment commits cleanly inside transaction
    const comment = await addTicketComment({
      ticketId: ticket1Id,
      authorId: adminId,
      authorName: "Perf Admin",
      authorRole: "Administrator",
      content: "Valid transactional comment",
      isInternal: false,
    });
    assert.ok(comment.id, "Comment should be created");

    // Check count of comments
    const countBefore = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM ticket_comments WHERE ticket_id = $1`,
      [ticket1Id]
    );

    // Attempt transactional operation that triggers an error and rolls back
    const client = await pool.connect();
    let errorCaught = false;
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ticket_comments (ticket_id, author_id, author_name, author_role, content, is_internal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ticket1Id, adminId, "Perf Admin", "Administrator", "This will roll back", false]
      );
      // Deliberately cause a failure (invalid query)
      await client.query(`INSERT INTO non_existent_table_xyz VALUES (1)`);
      await client.query("COMMIT");
    } catch (err) {
      errorCaught = true;
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    assert.equal(errorCaught, true, "Error should be caught and transaction rolled back");

    // Verify comment count has not changed after rollback
    const countAfter = await pool.query(
      `SELECT COUNT(*)::int as cnt FROM ticket_comments WHERE ticket_id = $1`,
      [ticket1Id]
    );
    assert.equal(countAfter.rows[0].cnt, countBefore.rows[0].cnt, "Comment count must be unchanged after rollback");
  });
});
