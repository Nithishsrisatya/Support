import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import bcrypt from "bcrypt";
import { pool } from "../src/db";
import ticketRoutes from "../src/routes/ticketRoutes";
import taskRoutes from "../src/routes/taskRoutes";
import { generateToken } from "../src/utils/jwt";
import { setEmailSenderForTesting } from "../src/services/emailService";
import {
  checkAllDeadlines,
  recordDeadlineNotification,
  deleteDeadlineNotificationRecord,
  clearDeadlineNotifications,
  getDeadlineStage,
} from "../src/services/deadlineService";
import {
  startScheduledEmails,
  stopScheduledEmails,
  _resetSchedulerStateForTesting,
  runDailyTaskReminders,
  runWeeklyDigest,
  runOverdueTicketCheck,
  runEscalationCheck,
} from "../src/services/scheduledEmailService";
import {
  sendWeeklyPendingWorkSummary,
  sendEmployeeWeeklyPendingWorkSummary,
  sendManagerWeeklyPendingWorkSummary,
  recordWeeklyPendingWorkNotification,
  deleteWeeklyPendingWorkNotification,
  getWeekStartDate,
  getWeeklyPendingItemsForEmployee,
  getWeeklyPendingItemsForManager,
  startWeeklyPendingWorkScheduler,
  stopWeeklyPendingWorkScheduler,
  _resetWeeklySchedulerStateForTesting,
} from "../src/services/weeklyPendingWorkService";
import { updateTicket, reopenTicket } from "../src/services/ticketService";
import { updateTask, reopenTask } from "../src/services/taskService";
import { withAdvisoryLock, ADVISORY_LOCK_IDS } from "../src/utils/schedulerLock";

describe("Phase 11 — Scheduler & Production Operations Reliability", () => {
  let server: Server;
  let baseUrl: string;

  const ts = Date.now().toString().slice(-6);
  const adminId = `U-SCH-ADM-${ts}`;
  const managerId = `U-SCH-MGR-${ts}`;
  const empId = `U-SCH-EMP-${ts}`;
  const clientId = `C-SCH-${ts}`;

  const adminEmail = `admin-${ts}@testsch.com`;
  const managerEmail = `mgr-${ts}@testsch.com`;
  const empEmail = `emp-${ts}@testsch.com`;
  const clientEmail = `client-${ts}@testsch.com`;

  let adminToken: string;
  let managerToken: string;
  let empToken: string;
  let clientToken: string;

  // Track emails dispatched via mock
  let emailsSent: Array<{ to: string; subject: string; html: string }> = [];
  let shouldEmailFail = false;

  // Test tasks and tickets
  const taskDueTomorrow = `TSK-TOM-${ts}`;
  const taskDueToday = `TSK-TOD-${ts}`;
  const taskOverdue = `TSK-OVR-${ts}`;
  const taskCompleted = `TSK-CMP-${ts}`;
  const taskReopen = `TSK-ROP-${ts}`;

  const ticketDueTomorrow = `TKT-TOM-${ts}`;
  const ticketDueToday = `TKT-TOD-${ts}`;
  const ticketOverdue = `TKT-OVR-${ts}`;
  const ticketResolved = `TKT-RES-${ts}`;
  const ticketClosed = `TKT-CLO-${ts}`;
  const ticketReopen = `TKT-ROP-${ts}`;

  before(async () => {
    // Install email mock to avoid sending real network emails to Google SMTP / Brevo
    setEmailSenderForTesting(async (to, subject, html, options) => {
      if (shouldEmailFail) {
        if (options?.throwOnError) {
          throw new Error("Simulated email delivery failure");
        }
        return { success: false, transport: "preview", error: "Simulated email delivery failure" };
      }
      emailsSent.push({ to, subject, html });
      return { success: true, transport: "preview" };
    });

    const hashed = await bcrypt.hash("SchPass123!", 10);

    // 1. Insert test users
    await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash, role, department, status, first_login, created_date, updated_date)
       VALUES 
       ($1, 'Scheduler Admin', $2, $3, 'Administrator', 'IT', 'Active', false, NOW(), NOW()),
       ($4, 'Scheduler Manager', $5, $3, 'Manager', 'Support', 'Active', false, NOW(), NOW()),
       ($6, 'Scheduler Employee', $7, $3, 'Employee', 'Support', 'Active', false, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET status = 'Active'`,
      [adminId, adminEmail, hashed, managerId, managerEmail, empId, empEmail]
    );

    // Link employee to manager
    await pool.query(`UPDATE users SET manager_id = $1 WHERE id = $2`, [managerId, empId]);

    // 2. Insert test client
    await pool.query(
      `INSERT INTO clients (id, company_name, contact_person, email, status, created_date, updated_date)
       VALUES ($1, 'Scheduler Client Corp', 'Client Rep', $2, 'Active', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [clientId, clientEmail]
    );

    // Tokens
    adminToken = generateToken({ id: adminId, role: "Administrator", email: adminEmail, userType: "User" });
    managerToken = generateToken({ id: managerId, role: "Manager", email: managerEmail, userType: "User" });
    empToken = generateToken({ id: empId, role: "Employee", email: empEmail, userType: "User" });
    clientToken = generateToken({ id: clientId, role: "Client", email: clientEmail, userType: "Client" });

    // Dates for tasks/tickets
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const todayStr = new Date().toISOString().split("T")[0];

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // 3. Insert test tasks
    await pool.query(
      `INSERT INTO tasks (id, title, description, task_category, priority, status, assigned_to, assigned_by, due_date, escalation_status, created_date, updated_date)
       VALUES
       ($1, 'Task Due Tomorrow', 'Desc', 'Support', 'High', 'In Progress', $2, $3, $4, 'No', NOW(), NOW()),
       ($5, 'Task Due Today', 'Desc', 'Support', 'Critical', 'In Progress', $2, $3, $6, 'No', NOW(), NOW()),
       ($7, 'Task Overdue', 'Desc', 'Support', 'Medium', 'In Progress', $2, $3, $8, 'No', NOW(), NOW()),
       ($9, 'Task Completed', 'Desc', 'Support', 'Low', 'Completed', $2, $3, $8, 'No', NOW(), NOW()),
       ($10, 'Task For Reopen', 'Desc', 'Support', 'Medium', 'Completed', $2, $3, $4, 'No', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        taskDueTomorrow, empId, managerId, tomorrowStr,
        taskDueToday, todayStr,
        taskOverdue, yesterdayStr,
        taskCompleted,
        taskReopen,
      ]
    );

    // 4. Insert test tickets
    await pool.query(
      `INSERT INTO tickets (id, subject, description, category, priority, status, assigned_to, client_id, due_date, created_date, updated_date)
       VALUES
       ($1, 'Ticket Due Tomorrow', 'Desc', 'Technical Issue', 'High', 'In Progress', $2, $3, $4, NOW(), NOW()),
       ($5, 'Ticket Due Today', 'Desc', 'Billing', 'Critical', 'In Progress', $2, $3, $6, NOW(), NOW()),
       ($7, 'Ticket Overdue', 'Desc', 'Technical Issue', 'Medium', 'In Progress', $2, $3, $8, NOW(), NOW()),
       ($9, 'Ticket Resolved', 'Desc', 'Support', 'Low', 'Resolved', $2, $3, $8, NOW(), NOW()),
       ($10, 'Ticket Closed', 'Desc', 'Support', 'Low', 'Closed', $2, $3, $8, NOW(), NOW()),
       ($11, 'Ticket For Reopen', 'Desc', 'Support', 'Medium', 'Resolved', $2, $3, $4, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        ticketDueTomorrow, empId, clientId, tomorrowStr,
        ticketDueToday, todayStr,
        ticketOverdue, yesterdayStr,
        ticketResolved,
        ticketClosed,
        ticketReopen,
      ]
    );

    // 5. Mount Express test server for manual reminder route testing
    const app = express();
    app.use(express.json());
    app.use("/api/tickets", ticketRoutes);
    app.use("/api/tasks", taskRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // 1. Stop all registered cron tasks so no background timers keep Node event loop open
    stopScheduledEmails();
    stopWeeklyPendingWorkScheduler();

    // 2. Close Express test server
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 3. Clean up test notifications and records
    try {
      await pool.query(`DELETE FROM deadline_notifications WHERE recipient_id IN ($1, $2, $3)`, [empId, managerId, adminId]);
      await pool.query(`DELETE FROM weekly_pending_work_notifications WHERE recipient_id IN ($1, $2, $3)`, [empId, managerId, adminId]);
      await pool.query(`DELETE FROM notifications WHERE user_id IN ($1, $2, $3)`, [empId, managerId, adminId]);
      await pool.query(`DELETE FROM tasks WHERE id IN ($1, $2, $3, $4, $5)`, [taskDueTomorrow, taskDueToday, taskOverdue, taskCompleted, taskReopen]);
      await pool.query(`DELETE FROM tickets WHERE id IN ($1, $2, $3, $4, $5, $6)`, [ticketDueTomorrow, ticketDueToday, ticketOverdue, ticketResolved, ticketClosed, ticketReopen]);
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [empId, managerId, adminId]);
      await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    } catch (err) {
      console.error("Teardown cleanup error in schedulerReliability.test.ts:", err);
    }

    // 4. Reset email sender mock
    setEmailSenderForTesting(null);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Process singleton registration guard
  // ──────────────────────────────────────────────────────────────────────────
  it("1. Scheduler registration does not duplicate within one process", () => {
    _resetSchedulerStateForTesting();
    const firstCall = startScheduledEmails({ runCatchup: false });
    assert.strictEqual(firstCall, true, "First startScheduledEmails call should register schedulers");

    const secondCall = startScheduledEmails({ runCatchup: false });
    assert.strictEqual(secondCall, false, "Second startScheduledEmails call should skip duplicate registration");

    // Clean up timers created in test 1
    stopScheduledEmails();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Duplicate scheduler execution does not duplicate deadline notifications
  // ──────────────────────────────────────────────────────────────────────────
  it("2. Duplicate scheduler execution does not duplicate deadline notifications", async () => {
    // Run 1: Evaluates tasks and tickets
    const stats1 = await checkAllDeadlines();
    assert.ok(stats1.totalNotificationsSent >= 1, "First checkAllDeadlines should record deadline notifications");

    // Run 2: Immediately run again
    const stats2 = await checkAllDeadlines();
    assert.strictEqual(stats2.totalNotificationsSent, 0, "Second checkAllDeadlines run must send 0 duplicate notifications");

    // Check database uniqueness in deadline_notifications
    const rows = await pool.query(
      `SELECT item_type, item_id, stage, recipient_id, COUNT(*)
       FROM deadline_notifications
       WHERE recipient_id IN ($1, $2)
       GROUP BY item_type, item_id, stage, recipient_id
       HAVING COUNT(*) > 1`,
      [empId, managerId]
    );
    assert.strictEqual(rows.rows.length, 0, "There must be zero duplicate rows in deadline_notifications");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Concurrent execution cannot create duplicate reminder records
  // ──────────────────────────────────────────────────────────────────────────
  it("3. Concurrent execution cannot create duplicate reminder records (advisory locks & constraints)", async () => {
    // 3a. Test advisory lock exclusivity
    const clientA = await pool.connect();
    try {
      const lockRes = await clientA.query("SELECT pg_try_advisory_lock($1) AS acquired", [99999]);
      assert.strictEqual(lockRes.rows[0].acquired, true);

      // Attempt to run job with same lock using withAdvisoryLock
      const concurrentResult = await withAdvisoryLock(99999, "TestConcurrentJob", async () => {
        return "SHOULD_NOT_EXECUTE";
      });

      assert.strictEqual(concurrentResult.executed, false, "Concurrent job should be skipped while lock is held");
      assert.strictEqual(concurrentResult.reason, "already_running");
    } finally {
      await clientA.query("SELECT pg_advisory_unlock($1)", [99999]);
      clientA.release();
    }

    // 3b. Test database ON CONFLICT DO NOTHING under concurrent parallel inserts
    const testItemId = `ITEM-CONC-${Date.now()}`;
    const results = await Promise.all([
      recordDeadlineNotification("Task", testItemId, "DUE_TOMORROW", empId, "Assignee"),
      recordDeadlineNotification("Task", testItemId, "DUE_TOMORROW", empId, "Assignee"),
      recordDeadlineNotification("Task", testItemId, "DUE_TOMORROW", empId, "Assignee"),
    ]);

    const trueCount = results.filter((r) => r === true).length;
    const falseCount = results.filter((r) => r === false).length;

    assert.strictEqual(trueCount, 1, "Exactly one parallel insert must succeed");
    assert.strictEqual(falseCount, 2, "Other concurrent inserts must return false (conflict prevented)");

    // Clean up
    await pool.query(`DELETE FROM deadline_notifications WHERE item_id = $1`, [testItemId]);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Terminal tickets and tasks are strictly excluded
  // ──────────────────────────────────────────────────────────────────────────
  it("4. Terminal tickets and tasks are strictly excluded from deadline reminders", async () => {
    const taskRows = await pool.query(
      `SELECT * FROM deadline_notifications WHERE item_type = 'Task' AND item_id = $1`,
      [taskCompleted]
    );
    assert.strictEqual(taskRows.rows.length, 0, "Completed task must never receive deadline notifications");

    const resolvedRows = await pool.query(
      `SELECT * FROM deadline_notifications WHERE item_type = 'Ticket' AND item_id = $1`,
      [ticketResolved]
    );
    assert.strictEqual(resolvedRows.rows.length, 0, "Resolved ticket must never receive deadline notifications");

    const closedRows = await pool.query(
      `SELECT * FROM deadline_notifications WHERE item_type = 'Ticket' AND item_id = $1`,
      [ticketClosed]
    );
    assert.strictEqual(closedRows.rows.length, 0, "Closed ticket must never receive deadline notifications");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Reopened items follow existing reminder rules
  // ──────────────────────────────────────────────────────────────────────────
  it("5. Reopened items reset reminder state and receive new reminders", async () => {
    // 5a. Task reopen
    await recordDeadlineNotification("Task", taskReopen, "DUE_TOMORROW", empId, "Assignee");
    const preTaskCheck = await pool.query(
      `SELECT COUNT(*) FROM deadline_notifications WHERE item_type = 'Task' AND item_id = $1`,
      [taskReopen]
    );
    assert.strictEqual(Number(preTaskCheck.rows[0].count), 1);

    await reopenTask(taskReopen, managerId, "Scheduler Manager", "Reopening for testing");

    const postTaskCheck = await pool.query(
      `SELECT COUNT(*) FROM deadline_notifications WHERE item_type = 'Task' AND item_id = $1`,
      [taskReopen]
    );
    assert.strictEqual(Number(postTaskCheck.rows[0].count), 0, "Reopening task must clear prior deadline notifications");

    // 5b. Ticket reopen
    await recordDeadlineNotification("Ticket", ticketReopen, "DUE_TOMORROW", empId, "Assignee");
    const preTicketCheck = await pool.query(
      `SELECT COUNT(*) FROM deadline_notifications WHERE item_type = 'Ticket' AND item_id = $1`,
      [ticketReopen]
    );
    assert.strictEqual(Number(preTicketCheck.rows[0].count), 1);

    await reopenTicket(ticketReopen, "Scheduler Manager", "In Progress", "Reopening for testing");

    const postTicketCheck = await pool.query(
      `SELECT COUNT(*) FROM deadline_notifications WHERE item_type = 'Ticket' AND item_id = $1`,
      [ticketReopen]
    );
    assert.strictEqual(Number(postTicketCheck.rows[0].count), 0, "Reopening ticket must clear prior deadline notifications");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Due-date changes reset/recalculate reminder state correctly
  // ──────────────────────────────────────────────────────────────────────────
  it("6. Due-date changes reset reminder records so new deadlines trigger cleanly", async () => {
    // 6a. Task due-date change
    await recordDeadlineNotification("Task", taskDueTomorrow, "DUE_TOMORROW", empId, "Assignee");
    const newDueDate = "2026-12-15T12:00:00.000Z";
    await updateTask(taskDueTomorrow, { dueDate: newDueDate }, managerId, "Scheduler Manager");

    const taskNotifs = await pool.query(
      `SELECT COUNT(*) FROM deadline_notifications WHERE item_type = 'Task' AND item_id = $1`,
      [taskDueTomorrow]
    );
    assert.strictEqual(Number(taskNotifs.rows[0].count), 0, "Updating task due_date must clear deadline notifications");

    // 6b. Ticket due-date change
    await recordDeadlineNotification("Ticket", ticketDueTomorrow, "DUE_TOMORROW", empId, "Assignee");
    await updateTicket(ticketDueTomorrow, { due_date: newDueDate }, "Scheduler Manager");

    const ticketNotifs = await pool.query(
      `SELECT COUNT(*) FROM deadline_notifications WHERE item_type = 'Ticket' AND item_id = $1`,
      [ticketDueTomorrow]
    );
    assert.strictEqual(Number(ticketNotifs.rows[0].count), 0, "Updating ticket due_date must clear deadline notifications");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Weekly pending work is idempotent
  // ──────────────────────────────────────────────────────────────────────────
  it("7. Weekly pending work dispatch is strictly idempotent", async () => {
    const refDate = new Date();
    const weekStart = getWeekStartDate(refDate);
    // Ensure clean state for test users for this week
    await pool.query(
      `DELETE FROM weekly_pending_work_notifications WHERE week_start = $1::date AND recipient_id IN ($2, $3)`,
      [weekStart, empId, managerId]
    );

    // 7a. Employee weekly dispatch idempotency
    const empSent1 = await sendEmployeeWeeklyPendingWorkSummary(
      { id: empId, fullName: "Scheduler Employee", email: empEmail },
      refDate
    );
    assert.strictEqual(empSent1, true, "First employee weekly dispatch should succeed");

    const empSent2 = await sendEmployeeWeeklyPendingWorkSummary(
      { id: empId, fullName: "Scheduler Employee", email: empEmail },
      refDate
    );
    assert.strictEqual(empSent2, false, "Second employee weekly dispatch should return false (already sent)");

    // 7b. Manager weekly dispatch idempotency
    const mgrSent1 = await sendManagerWeeklyPendingWorkSummary(
      { id: managerId, fullName: "Scheduler Manager", email: managerEmail },
      refDate
    );
    assert.strictEqual(mgrSent1, true, "First manager weekly dispatch should succeed");

    const mgrSent2 = await sendManagerWeeklyPendingWorkSummary(
      { id: managerId, fullName: "Scheduler Manager", email: managerEmail },
      refDate
    );
    assert.strictEqual(mgrSent2, false, "Second manager weekly dispatch should return false (already sent)");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Weekly notifications are not duplicated
  // ──────────────────────────────────────────────────────────────────────────
  it("8. Weekly notifications are not duplicated at database level", async () => {
    const weekStart = getWeekStartDate(new Date());
    const isNew = await recordWeeklyPendingWorkNotification(weekStart, empId, "Employee");
    assert.strictEqual(isNew, false, "Duplicate weekly notification insert must return false");

    const rows = await pool.query(
      `SELECT COUNT(*) FROM weekly_pending_work_notifications WHERE week_start = $1::date AND recipient_id = $2`,
      [weekStart, empId]
    );
    assert.strictEqual(Number(rows.rows[0].count), 1, "Must have exactly 1 record in weekly_pending_work_notifications");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Boot/startup catch-up is idempotent
  // ──────────────────────────────────────────────────────────────────────────
  it("9. Boot/startup catch-up runs safely and idempotently", async () => {
    // Simulate multiple boot runs back-to-back
    const runA = await checkAllDeadlines();
    const runB = await checkAllDeadlines();

    assert.strictEqual(runB.totalNotificationsSent, 0, "Boot deadline catch-up run B must not duplicate run A");

    const escA = await runEscalationCheck();
    const escB = await runEscalationCheck();

    assert.strictEqual(escB.escalated, 0, "Boot escalation catch-up run B must not duplicate run A");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Duplicate execution does not send duplicate emails
  // ──────────────────────────────────────────────────────────────────────────
  it("10. Duplicate execution does not send duplicate emails", async () => {
    // Clear notifications for taskDueTomorrow so we can test single execution
    await clearDeadlineNotifications("Task", taskDueTomorrow);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Reset task due date back to tomorrow
    await pool.query(`UPDATE tasks SET due_date = $1, status = 'In Progress' WHERE id = $2`, [
      tomorrow.toISOString().split("T")[0],
      taskDueTomorrow,
    ]);

    const initialSent = emailsSent.length;
    const run1 = await runDailyTaskReminders();
    assert.strictEqual(run1.sent, 1, "First task reminder execution should send reminder");
    assert.strictEqual(emailsSent.length, initialSent + 1, "Exactly one email should be sent");

    const run2 = await runDailyTaskReminders();
    assert.strictEqual(run2.sent, 0, "Second task reminder execution must send 0 reminders");
    assert.strictEqual(emailsSent.length, initialSent + 1, "No additional email should be sent on second execution");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 11: Email failure allows appropriate retry
  // ──────────────────────────────────────────────────────────────────────────
  it("11. Email failure allows appropriate retry via record deletion", async () => {
    const testTaskId = `TSK-FAIL-${Date.now()}`;
    // 1. First record notification
    const recorded = await recordDeadlineNotification("Task", testTaskId, "DUE_TOMORROW", empId, "Assignee");
    assert.strictEqual(recorded, true);

    // 2. Second record fails due to conflict
    const duplicateBlocked = await recordDeadlineNotification("Task", testTaskId, "DUE_TOMORROW", empId, "Assignee");
    assert.strictEqual(duplicateBlocked, false);

    // 3. Simulate email delivery failure: delete recorded notification
    const deleted = await deleteDeadlineNotificationRecord("Task", testTaskId, "DUE_TOMORROW", empId);
    assert.strictEqual(deleted, true);

    // 4. Retry: should now succeed!
    const retrySucceeded = await recordDeadlineNotification("Task", testTaskId, "DUE_TOMORROW", empId, "Assignee");
    assert.strictEqual(retrySucceeded, true, "Notification record must be insertable again after failure cleanup");

    // Clean up
    await deleteDeadlineNotificationRecord("Task", testTaskId, "DUE_TOMORROW", empId);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 12: Successful email does not get resent on next scheduler run
  // ──────────────────────────────────────────────────────────────────────────
  it("12. Successful email does not get resent on next identical scheduler run", async () => {
    const weekStart = getWeekStartDate(new Date());
    // Run weekly digest
    const digest1 = await runWeeklyDigest();
    const digest2 = await runWeeklyDigest();

    assert.strictEqual(digest2.managersNotified, 0, "Second weekly digest run must notify 0 managers");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 13: Manager/employee/client notification scope remains unchanged
  // ──────────────────────────────────────────────────────────────────────────
  it("13. Notification scope remains strictly enforced across roles", async () => {
    // 13a. Employee summary only contains assigned items
    const empSummary = await getWeeklyPendingItemsForEmployee(empId);
    assert.strictEqual(empSummary.employeeId, empId);
    assert.ok(empSummary.totalPending >= 1);

    // 13b. Manager summary contains supervised team stats
    const mgrSummary = await getWeeklyPendingItemsForManager(managerId);
    assert.strictEqual(mgrSummary.managerId, managerId);
    const empStat = mgrSummary.teamStats.find((s) => s.employeeId === empId);
    assert.ok(empStat !== undefined, "Manager summary must include supervised employee stats");

    // 13c. Client user is never in weekly pending work
    const clientRows = await pool.query(
      `SELECT * FROM weekly_pending_work_notifications WHERE recipient_id = $1`,
      [clientId]
    );
    assert.strictEqual(clientRows.rows.length, 0, "Clients must never receive weekly pending work notifications");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 14: Scheduler startup does not register the same job twice
  // ──────────────────────────────────────────────────────────────────────────
  it("14. startWeeklyPendingWorkScheduler does not register duplicate cron jobs", () => {
    _resetWeeklySchedulerStateForTesting();
    const firstReg = startWeeklyPendingWorkScheduler(false);
    assert.strictEqual(firstReg, true);

    const secondReg = startWeeklyPendingWorkScheduler(false);
    assert.strictEqual(secondReg, false, "Second call should return false to prevent duplicate cron job registration");

    // Clean up
    stopWeeklyPendingWorkScheduler();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 15: Existing manual reminder endpoints still work with strict authorization
  // ──────────────────────────────────────────────────────────────────────────
  it("15. Existing manual reminder endpoints still work and enforce strict authorization", async () => {
    // 15a. Unauthenticated request -> 401
    const resUnauth = await fetch(`${baseUrl}/api/tickets/${ticketDueTomorrow}/remind-overdue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resUnauth.status, 401);

    // 15b. Employee cannot send overdue reminder -> 403
    const resEmpForbidden = await fetch(`${baseUrl}/api/tickets/${ticketDueTomorrow}/remind-overdue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resEmpForbidden.status, 403);

    // 15c. Remind on terminal ticket -> 400
    const resTerminalTicket = await fetch(`${baseUrl}/api/tickets/${ticketResolved}/remind-overdue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resTerminalTicket.status, 400);

    // 15d. Remind on terminal task -> 400
    const resTerminalTask = await fetch(`${baseUrl}/api/tasks/${taskCompleted}/remind`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resTerminalTask.status, 400);

    // 15e. Legitimate manager SLA reminder on active ticket -> 200
    const resManagerSla = await fetch(`${baseUrl}/api/tickets/${ticketDueTomorrow}/remind-sla`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        slaDeadline: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    assert.strictEqual(resManagerSla.status, 200);
    const slaJson = await resManagerSla.json();
    assert.strictEqual(slaJson.success, true);
  });
});
