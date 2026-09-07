import cron from "node-cron";
import { pool } from "../db";
import { sendEmail } from "./emailService";
import { createNotification } from "./notificationService";
import {
  taskReminderTemplate,
  overdueTicketReminderTemplate,
  slaReminderTemplate,
} from "../templates/operationalEmails";
import { checkAllDeadlines } from "./deadlineService";
import { startWeeklyPendingWorkScheduler } from "./weeklyPendingWorkService";

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
// ──────────────────────────────────────────────
function startDailyTaskReminders() {
  cron.schedule("0 8 * * *", async () => {
    console.log("⏰ Running daily task reminder check...");
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

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

for (const row of result.rows) {
        const html = taskReminderTemplate(
          row.employee_name,
          row.task_id,
          row.title,
          row.due_date
        );
        await sendEmail(
          row.email,
          `⏰ Reminder: Task "${row.title}" Due Tomorrow`,
          html
        );
        // In-app notification
        await createInAppNotification(
          row.assigned_to as string,
          "Task Reminder",
          "Task Due Tomorrow",
          `Task "${row.title}" (${row.task_id}) is due tomorrow (${new Date(row.due_date).toLocaleDateString()}).`
        );
        console.log(`  ✅ Task reminder sent to ${row.email} for ${row.title}`);
      }

      console.log(`  📊 Sent ${result.rows.length} task reminder(s)`);
    } catch (error) {
      console.error("❌ Daily task reminder error:", error);
    }
  });
  console.log("  ✅ Daily task reminder scheduler started (8:00 AM)");
}

// ──────────────────────────────────────────────
// WEEKLY DIGEST
// Runs every Monday at 9:00 AM
// Sends open ticket summary to managers
// ──────────────────────────────────────────────
function startWeeklyDigest() {
  cron.schedule("0 9 * * 1", async () => {
    console.log("📊 Running weekly digest...");
    try {
      // Get all managers and admins
      const managers = await pool.query(
        `SELECT full_name, email FROM users WHERE role IN ('Manager', 'Administrator') AND status = 'Active'`
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

      for (const mgr of managers.rows) {
        await sendEmail(
          mgr.email,
          "📊 Weekly Support Digest - Open Tickets Summary",
          html
        );
      }
      console.log(`  ✅ Weekly digest sent to ${managers.rows.length} manager(s)`);
    } catch (error) {
      console.error("❌ Weekly digest error:", error);
    }
  });
  console.log("  ✅ Weekly digest scheduler started (Monday 9:00 AM)");
}

// ──────────────────────────────────────────────
// OVERDUE TICKET CHECK
// Runs every day at 7:00 AM and 6:00 PM
// Sends SLA breach alerts for overdue tickets
// ──────────────────────────────────────────────
function startOverdueTicketCheck() {
  cron.schedule("0 7,18 * * *", async () => {
    console.log("⏰ Running overdue ticket check...");
    try {
      // Tickets that haven't been updated in the last 24 hours and are not Resolved/Closed
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

      for (const row of result.rows) {
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
          html
        );
        // In-app notification
        await createInAppNotification(
          row.assigned_to as string,
          "Ticket Update",
          "Ticket Overdue - SLA Breach",
          `Ticket ${row.ticket_id} "${row.subject}" is overdue (${row.priority} priority).`
        );
        console.log(`  ✅ Overdue alert sent to ${row.email} for ticket ${row.ticket_id}`);
      }
      console.log(`  📊 Sent ${result.rows.length} overdue alert(s)`);
    } catch (error) {
      console.error("❌ Overdue ticket check error:", error);
    }
  });
  console.log("  ✅ Overdue ticket check scheduler started (7:00 AM & 6:00 PM)");
}

// ──────────────────────────────────────────────
// SCHEDULED ESCALATION CHECK
// Runs every day at 7:30 AM
// Escalates overdue tasks automatically
// ──────────────────────────────────────────────
function startEscalationCheck() {
  cron.schedule("30 7 * * *", async () => {
    console.log("⏰ Running escalation check for overdue tasks...");
    try {
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

      for (const row of result.rows) {
        // Mark as escalated
        await pool.query(
          `UPDATE tasks SET escalation_status = 'Yes', status = 'Escalated', updated_date = NOW() WHERE id = $1`,
          [row.task_id]
        );

        // In-app notification
        await createInAppNotification(
          row.assigned_to as string,
          "Escalation Alert",
          "Task Overdue - Escalated",
          `Task "${row.title}" (${row.task_id}) has been escalated due to overdue due date (${new Date(row.due_date).toLocaleDateString()}).`
        );

        // Send escalation email
        const managerName = "Management";
        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #dc2626; margin: 0;">⚠️ Task Auto-Escalated</h2>
  </div>
  <p>Hello ${row.employee_name},</p>
  <p>Your task <strong>${row.title}</strong> has been automatically escalated due to its overdue status.</p>
  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Task Ref:</strong> ${row.task_id}</p>
    <p style="margin: 0; color: #dc2626; font-weight: bold;"><strong>Due Date:</strong> ${new Date(row.due_date).toLocaleDateString()}</p>
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
      }
      console.log(`  📊 Auto-escalated ${result.rows.length} task(s)`);
    } catch (error) {
      console.error("❌ Escalation check error:", error);
    }
  });
  console.log("  ✅ Escalation check scheduler started (7:30 AM)");
}

// ──────────────────────────────────────────────
// DEADLINE MANAGEMENT SYSTEM SCHEDULER
// Runs every hour and on startup
// Dispatches Due Tomorrow, Due Today, and Overdue alerts for Tickets & Tasks
// ──────────────────────────────────────────────
function startDeadlineManagementScheduler() {
  // Run on startup
  checkAllDeadlines()
    .then((stats) => {
      console.log(
        `  ⏱️ Initial deadline check complete: ${stats.tasksInspected} tasks, ${stats.ticketsInspected} tickets evaluated, ${stats.totalNotificationsSent} notification(s) sent.`
      );
    })
    .catch((err) => {
      console.error("❌ Initial deadline check failed:", err);
    });

  // Schedule recurring hourly check
  cron.schedule("0 * * * *", async () => {
    console.log("⏰ Running hourly deadline management check...");
    try {
      const stats = await checkAllDeadlines();
      console.log(
        `  ✅ Hourly deadline check complete: ${stats.tasksInspected} tasks, ${stats.ticketsInspected} tickets evaluated, ${stats.totalNotificationsSent} notification(s) sent.`
      );
    } catch (err) {
      console.error("❌ Hourly deadline check error:", err);
    }
  });
  console.log("  ✅ Deadline management scheduler started (Hourly)");
}

// ──────────────────────────────────────────────
// INITIALIZE ALL SCHEDULERS
// ──────────────────────────────────────────────
export function startScheduledEmails() {
  console.log("\n📅 Starting scheduled email services...");
  startDeadlineManagementScheduler();
  startDailyTaskReminders();
  startWeeklyDigest();
  startWeeklyPendingWorkScheduler();
  startOverdueTicketCheck();
  startEscalationCheck();
  console.log("📅 All scheduled email services initialized\n");
}


