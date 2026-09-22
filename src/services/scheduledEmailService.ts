import cron, { ScheduledTask } from "node-cron";
import { pool } from "../db";
import { sendEmail } from "./emailService";
import { createNotification } from "./notificationService";
import {
  taskReminderTemplate,
  overdueTicketReminderTemplate,
  slaReminderTemplate,
} from "../templates/operationalEmails";
import {
  checkAllDeadlines,
  recordDeadlineNotification,
  deleteDeadlineNotificationRecord,
} from "./deadlineService";
import {
  startWeeklyPendingWorkScheduler,
  stopWeeklyPendingWorkScheduler,
  getWeekStartDate,
} from "./weeklyPendingWorkService";
import { escapeHtml } from "../utils/htmlSanitizer";
import { withAdvisoryLock, ADVISORY_LOCK_IDS } from "../utils/schedulerLock";

// ──────────────────────────────────────────────
// PROCESS SINGLETON REGISTRATION GUARD & TASK TRACKING
// ──────────────────────────────────────────────
let isSchedulerInitialized = false;
let activeCronTasks: ScheduledTask[] = [];

export function isScheduledEmailsRunning(): boolean {
  return isSchedulerInitialized;
}

export function _resetSchedulerStateForTesting(): void {
  isSchedulerInitialized = false;
}

export function stopScheduledEmails(): void {
  for (const task of activeCronTasks) {
    try {
      task.stop();
    } catch (_) {}
  }
  activeCronTasks = [];
  stopWeeklyPendingWorkScheduler();
  isSchedulerInitialized = false;
}

// ──────────────────────────────────────────────
// HELPERS - In-App notifications
// ──────────────────────────────────────────────
async function createInAppNotification(
  userId: string,
  notificationType: string,
  title: string,
  message: string
) {
  try {
    await createNotification({
      id: `N-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId,
      notificationType,
      title,
      message,
      status: "Sent",
      readDate: null,
    });
  } catch (err) {
    console.error("Failed to create in-app notification:", err);
  }
}

// ──────────────────────────────────────────────
// DAILY TASK REMINDER
// Runs every day at 8:00 AM
// Sends reminders for tasks due tomorrow
// Uses deadline_notifications to prevent duplicates with deadlineService
// ──────────────────────────────────────────────
export async function runDailyTaskReminders(referenceDate: Date = new Date()): Promise<{
  inspected: number;
  sent: number;
}> {
  return (
    await withAdvisoryLock(
      ADVISORY_LOCK_IDS.DAILY_TASK_REMINDERS,
      "DailyTaskReminders",
      async () => {
        const tomorrow = new Date(referenceDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const year = tomorrow.getFullYear();
        const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
        const day = String(tomorrow.getDate()).padStart(2, "0");
        const tomorrowStr = `${year}-${month}-${day}`;

        const result = await pool.query(
          `SELECT
            t.id AS task_id,
            t.title,
            t.due_date,
            t.assigned_to AS assigned_to,
            u.full_name AS employee_name,
            u.email
          FROM tasks t
          JOIN users u ON t.assigned_to = u.id
          WHERE t.due_date::date = $1
            AND t.status NOT IN ('Completed', 'Escalated')
            AND u.status = 'Active'`,
          [tomorrowStr]
        );

        let sentCount = 0;
        for (const row of result.rows) {
          // Idempotency check with deadlineService using the shared deadline_notifications table
          const isFirstNotification = await recordDeadlineNotification(
            "Task",
            row.task_id,
            "DUE_TOMORROW",
            row.assigned_to as string,
            "Assignee"
          );

          if (!isFirstNotification) {
            // Already notified by deadlineService or previous execution
            continue;
          }

          try {
            const html = taskReminderTemplate(
              row.employee_name,
              row.task_id,
              row.title,
              row.due_date
            );
            await sendEmail(
              row.email,
              `⏰ Reminder: Task "${row.title}" Due Tomorrow`,
              html,
              { throwOnError: true }
            );

            await createInAppNotification(
              row.assigned_to as string,
              "Task Reminder",
              "Task Due Tomorrow",
              `Task "${row.title}" (${row.task_id}) is due tomorrow (${new Date(row.due_date).toLocaleDateString()}).`
            );
            sentCount++;
            console.log(`  ✅ Task reminder sent to ${row.email} for ${row.title}`);
          } catch (sendErr) {
            console.error(`Failed to dispatch daily task reminder to ${row.email}:`, sendErr);
            // Allow retry on next execution if email failed
            await deleteDeadlineNotificationRecord(
              "Task",
              row.task_id,
              "DUE_TOMORROW",
              row.assigned_to as string
            );
          }
        }

        console.log(`  📊 Daily task reminder complete: Sent ${sentCount} reminder(s) out of ${result.rows.length} inspected.`);
        return { inspected: result.rows.length, sent: sentCount };
      }
    )
  ).result ?? { inspected: 0, sent: 0 };
}

function startDailyTaskReminders() {
  activeCronTasks.push(
    cron.schedule("0 8 * * *", async () => {
      console.log("⏰ Running daily task reminder check...");
      try {
        await runDailyTaskReminders();
      } catch (error) {
        console.error("❌ Daily task reminder error:", error);
      }
    })
  );
  console.log("  ✅ Daily task reminder scheduler started (8:00 AM)");
}

// ──────────────────────────────────────────────
// WEEKLY DIGEST
// Runs every Monday at 9:00 AM
// Sends open ticket summary to managers and administrators
// Uses database idempotency (week_start) to prevent duplicate digests
// ──────────────────────────────────────────────
export async function runWeeklyDigest(referenceDate: Date = new Date()): Promise<{
  managersNotified: number;
}> {
  return (
    await withAdvisoryLock(
      ADVISORY_LOCK_IDS.WEEKLY_DIGEST,
      "WeeklyDigest",
      async () => {
        const weekStart = getWeekStartDate(referenceDate);

        // Get all managers and admins
        const managers = await pool.query(
          `SELECT id, full_name, email, role FROM users WHERE role IN ('Manager', 'Administrator') AND status = 'Active'`
        );

        // Get open ticket summary
        const openTickets = await pool.query(
          `SELECT
            COUNT(*) AS total_open,
            COUNT(*) FILTER (WHERE priority = 'Critical') AS critical,
            COUNT(*) FILTER (WHERE priority = 'High') AS high,
            COUNT(*) FILTER (WHERE status = 'New') AS unassigned
          FROM tickets
          WHERE status NOT IN ('Resolved', 'Closed')`
        );

        const stats = openTickets.rows[0];
        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">Weekly Support Digest</h2>
    <p style="color: #71717a; margin: 5px 0 0;">Open Ticket Summary</p>
  </div>
  <p>Hello,</p>
  <p>Here is the weekly summary of open support tickets in Complify:</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">OPEN TICKETS</p>
    <p style="margin: 0 0 5px 0;"><strong>Total Open:</strong> ${stats.total_open}</p>
    <p style="margin: 0 0 5px 0;"><strong>🔴 Critical:</strong> ${stats.critical}</p>
    <p style="margin: 0 0 5px 0;"><strong>🟠 High:</strong> ${stats.high}</p>
    <p style="margin: 0;"><strong>📋 Unassigned:</strong> ${stats.unassigned}</p>
  </div>
  <p>Please review your team's workload in the <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/manager-dashboard" style="color: #4f46e5; text-decoration: none;">Manager Dashboard</a>.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>`;

        let notified = 0;
        for (const mgr of managers.rows) {
          const isFirst = await recordDeadlineNotification(
            "Digest",
            weekStart,
            "WEEKLY_DIGEST",
            mgr.id,
            mgr.role
          );
          if (!isFirst) {
            continue; // Already received digest for this week
          }

          try {
            await sendEmail(
              mgr.email,
              "📊 Weekly Support Digest - Open Tickets Summary",
              html,
              { throwOnError: true }
            );
            notified++;
          } catch (sendErr) {
            console.error(`Failed to send weekly digest to ${mgr.email}:`, sendErr);
            // Allow retry if sending failed
            await deleteDeadlineNotificationRecord(
              "Digest",
              weekStart,
              "WEEKLY_DIGEST",
              mgr.id
            );
          }
        }

        console.log(`  ✅ Weekly digest sent to ${notified} manager(s)/admin(s) for week ${weekStart}`);
        return { managersNotified: notified };
      }
    )
  ).result ?? { managersNotified: 0 };
}

function startWeeklyDigest() {
  activeCronTasks.push(
    cron.schedule("0 9 * * 1", async () => {
      console.log("📊 Running weekly digest...");
      try {
        await runWeeklyDigest();
      } catch (error) {
        console.error("❌ Weekly digest error:", error);
      }
    })
  );
  console.log("  ✅ Weekly digest scheduler started (Monday 9:00 AM)");
}

// ──────────────────────────────────────────────
// OVERDUE TICKET CHECK (SLA BREACH)
// Runs every day at 7:00 AM and 6:00 PM
// Sends SLA breach alerts for tickets un-updated past priority thresholds
// Uses deadline_notifications with SLA_BREACH stage to prevent duplicates
// ──────────────────────────────────────────────
export async function runOverdueTicketCheck(): Promise<{
  inspected: number;
  alertsSent: number;
}> {
  return (
    await withAdvisoryLock(
      ADVISORY_LOCK_IDS.OVERDUE_TICKET_CHECK,
      "OverdueTicketCheck",
      async () => {
        const result = await pool.query(
          `SELECT
            t.id AS ticket_id,
            t.subject,
            t.priority,
            t.created_date,
            t.assigned_to AS assigned_to,
            u.full_name AS employee_name,
            u.email
          FROM tickets t
          JOIN users u ON t.assigned_to = u.id
          WHERE t.status NOT IN ('Resolved', 'Closed')
            AND t.assigned_to IS NOT NULL
            AND (
              (t.priority = 'Critical' AND t.updated_date < NOW() - INTERVAL '4 hours')
              OR (t.priority = 'High' AND t.updated_date < NOW() - INTERVAL '8 hours')
              OR (t.priority = 'Medium' AND t.updated_date < NOW() - INTERVAL '24 hours')
              OR (t.priority = 'Low' AND t.updated_date < NOW() - INTERVAL '48 hours')
            )
            AND u.status = 'Active'`
        );

        let alertsSent = 0;
        for (const row of result.rows) {
          const isFirst = await recordDeadlineNotification(
            "Ticket",
            row.ticket_id,
            "SLA_BREACH",
            row.assigned_to as string,
            "Assignee"
          );

          if (!isFirst) {
            continue; // Already sent SLA breach alert for this ticket
          }

          try {
            const daysOverdue = Math.floor(
              (Date.now() - new Date(row.created_date).getTime()) / (1000 * 60 * 60 * 24)
            );
            const html = overdueTicketReminderTemplate(
              row.employee_name,
              row.ticket_id,
              row.subject,
              daysOverdue || 1,
              row.priority
            );

            await sendEmail(
              row.email,
              `🚨 SLA Breach Alert: Ticket ${row.ticket_id} Overdue`,
              html,
              { throwOnError: true }
            );

            await createInAppNotification(
              row.assigned_to as string,
              "Ticket Update",
              "Ticket Overdue - SLA Breach",
              `Ticket ${row.ticket_id} "${row.subject}" is overdue (${row.priority} priority).`
            );
            alertsSent++;
            console.log(`  ✅ Overdue alert sent to ${row.email} for ticket ${row.ticket_id}`);
          } catch (sendErr) {
            console.error(`Failed to send SLA breach email for ticket ${row.ticket_id}:`, sendErr);
            // Allow retry if sending failed
            await deleteDeadlineNotificationRecord(
              "Ticket",
              row.ticket_id,
              "SLA_BREACH",
              row.assigned_to as string
            );
          }
        }

        console.log(`  📊 Overdue ticket check complete: Sent ${alertsSent} alert(s) out of ${result.rows.length} inspected.`);
        return { inspected: result.rows.length, alertsSent };
      }
    )
  ).result ?? { inspected: 0, alertsSent: 0 };
}

function startOverdueTicketCheck() {
  activeCronTasks.push(
    cron.schedule("0 7,18 * * *", async () => {
      console.log("⏰ Running overdue ticket check...");
      try {
        await runOverdueTicketCheck();
      } catch (error) {
        console.error("❌ Overdue ticket check error:", error);
      }
    })
  );
  console.log("  ✅ Overdue ticket check scheduler started (7:00 AM & 6:00 PM)");
}

// ──────────────────────────────────────────────
// SCHEDULED ESCALATION CHECK
// Runs every day at 7:30 AM AND on server startup catch-up
// Escalates overdue tasks automatically with atomic row locking
// ──────────────────────────────────────────────
export async function runEscalationCheck(): Promise<{
  inspected: number;
  escalated: number;
}> {
  return (
    await withAdvisoryLock(
      ADVISORY_LOCK_IDS.ESCALATION_CHECK,
      "EscalationCheck",
      async () => {
        const result = await pool.query(
          `SELECT
            t.id AS task_id,
            t.title,
            t.due_date,
            t.assigned_to AS assigned_to,
            u.full_name AS employee_name,
            u.email,
            t.assigned_by
          FROM tasks t
          JOIN users u ON t.assigned_to = u.id
          WHERE t.due_date < NOW()
            AND t.status NOT IN ('Completed', 'Escalated')
            AND t.escalation_status = 'No'
            AND u.status = 'Active'`
        );

        let escalatedCount = 0;
        for (const row of result.rows) {
          // Atomic conditional update to guarantee idempotency under concurrency
          const updateRes = await pool.query(
            `UPDATE tasks
             SET escalation_status = 'Yes', status = 'Escalated', updated_date = NOW()
             WHERE id = $1 AND escalation_status = 'No' AND status NOT IN ('Completed', 'Escalated')
             RETURNING id`,
            [row.task_id]
          );

          if ((updateRes.rowCount ?? 0) === 0) {
            // Already escalated concurrently by another instance/job
            continue;
          }

          escalatedCount++;

          // In-app notification
          await createInAppNotification(
            row.assigned_to as string,
            "Escalation Alert",
            "Task Overdue - Escalated",
            `Task "${row.title}" (${row.task_id}) has been escalated due to overdue due date (${new Date(row.due_date).toLocaleDateString()}).`
          );

          // Send escalation email
          try {
            const formattedDueDate = new Date(row.due_date).toLocaleDateString();
            const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #dc2626; margin: 0;">⚠️ Task Auto-Escalated</h2>
  </div>
  <p>Hello ${escapeHtml(row.employee_name)},</p>
  <p>Your task <strong>${escapeHtml(row.title)}</strong> has been automatically escalated due to its overdue status.</p>
  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Task Ref:</strong> ${escapeHtml(row.task_id)}</p>
    <p style="margin: 0; color: #dc2626; font-weight: bold;"><strong>Due Date:</strong> ${escapeHtml(formattedDueDate)}</p>
  </div>
  <p>Please coordinate with your manager to resolve this immediately.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>`;
            await sendEmail(
              row.email,
              `⚠️ Task Auto-Escalated: ${row.title}`,
              html
            );
            console.log(`  ✅ Auto-escalated task ${row.task_id} and notified ${row.email}`);
          } catch (sendErr) {
            console.error(`Failed to send auto-escalation email for task ${row.task_id}:`, sendErr);
          }
        }

        console.log(`  📊 Escalation check complete: Auto-escalated ${escalatedCount} task(s) out of ${result.rows.length} inspected.`);
        return { inspected: result.rows.length, escalated: escalatedCount };
      }
    )
  ).result ?? { inspected: 0, escalated: 0 };
}

function startEscalationCheck(runCatchup: boolean = true) {
  // Boot catch-up check
  if (runCatchup) {
    runEscalationCheck().catch((err) => {
      console.error("❌ Initial escalation check failed:", err);
    });
  }

  // Scheduled recurring check
  activeCronTasks.push(
    cron.schedule("30 7 * * *", async () => {
      console.log("⏰ Running escalation check for overdue tasks...");
      try {
        await runEscalationCheck();
      } catch (error) {
        console.error("❌ Escalation check error:", error);
      }
    })
  );
  console.log("  ✅ Escalation check scheduler started (7:30 AM & boot catch-up)");
}

// ──────────────────────────────────────────────
// DEADLINE MANAGEMENT SYSTEM SCHEDULER
// Runs every hour and on startup
// Dispatches Due Tomorrow, Due Today, and Overdue alerts for Tickets & Tasks
// ──────────────────────────────────────────────
function startDeadlineManagementScheduler(runCatchup: boolean = true) {
  // Run on startup (boot catch-up) under advisory lock
  if (runCatchup) {
    withAdvisoryLock(
      ADVISORY_LOCK_IDS.DEADLINE_MANAGEMENT,
      "InitialDeadlineCheck",
      () => checkAllDeadlines()
    )
      .then((res) => {
        if (res.executed && res.result) {
          const stats = res.result;
          console.log(
            `  ⏱️ Initial deadline check complete: ${stats.tasksInspected} tasks, ${stats.ticketsInspected} tickets evaluated, ${stats.totalNotificationsSent} notification(s) sent.`
          );
        }
      })
      .catch((err) => {
        console.error("❌ Initial deadline check failed:", err);
      });
  }

  // Schedule recurring hourly check under advisory lock
  activeCronTasks.push(
    cron.schedule("0 * * * *", async () => {
      console.log("⏰ Running hourly deadline management check...");
      try {
        const res = await withAdvisoryLock(
          ADVISORY_LOCK_IDS.DEADLINE_MANAGEMENT,
          "HourlyDeadlineCheck",
          () => checkAllDeadlines()
        );
        if (res.executed && res.result) {
          const stats = res.result;
          console.log(
            `  ✅ Hourly deadline check complete: ${stats.tasksInspected} tasks, ${stats.ticketsInspected} tickets evaluated, ${stats.totalNotificationsSent} notification(s) sent.`
          );
        }
      } catch (err) {
        console.error("❌ Hourly deadline check error:", err);
      }
    })
  );
  console.log("  ✅ Deadline management scheduler started (Hourly & boot catch-up)");
}

// ──────────────────────────────────────────────
// INITIALIZE ALL SCHEDULERS (PROCESS SINGLETON)
// ──────────────────────────────────────────────
export function startScheduledEmails(options?: { runCatchup?: boolean }): boolean {
  if (isSchedulerInitialized) {
    console.log("⚠️ Scheduled email services already initialized in this process. Skipping duplicate registration.");
    return false;
  }
  isSchedulerInitialized = true;

  const runCatchup = options?.runCatchup ?? true;

  console.log("\n📅 Starting scheduled email services...");
  startDeadlineManagementScheduler(runCatchup);
  startDailyTaskReminders();
  startWeeklyDigest();
  startWeeklyPendingWorkScheduler(runCatchup);
  startOverdueTicketCheck();
  startEscalationCheck(runCatchup);
  console.log("📅 All scheduled email services initialized\n");
  return true;
}
