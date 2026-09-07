import { pool } from "../db";
import { sendEmail } from "./emailService";
import { createNotification } from "./notificationService";
import {
  deadlineNotificationEmailTemplate,
  getDeadlineEmailSubject,
} from "../templates/operationalEmails";

export type DeadlineStage = "OVERDUE" | "DUE_TODAY" | "DUE_TOMORROW" | "UPCOMING";
export type CalendarDeadlineStage = "COMPLETED" | "UPCOMING" | "DUE_TOMORROW" | "DUE_TODAY" | "OVERDUE";
export type CalendarDeadlineColor = "green" | "blue" | "yellow" | "orange" | "red";

export interface CalendarDeadlineEvent {
  id: string;
  type: "ticket" | "task";
  title: string;
  dueDate: string;
  status: string;
  priority?: string;
  assignedTo?: string | null;
  assignedEmployeeName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  deadlineStage: CalendarDeadlineStage;
  color: CalendarDeadlineColor;
}

/**
 * Calculates the deadline stage for a given due date relative to the reference time (default: now).
 */
export function getDeadlineStage(
  dueDateInput: Date | string | null | undefined,
  nowInput: Date = new Date()
): DeadlineStage {
  if (!dueDateInput) return "UPCOMING";
  const due = new Date(dueDateInput);
  const now = new Date(nowInput);

  if (isNaN(due.getTime())) return "UPCOMING";

  const formatYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = formatYMD(now);
  const dueStr = formatYMD(due);

  if (dueStr < todayStr) {
    return "OVERDUE";
  }

  if (dueStr === todayStr) {
    return "DUE_TODAY";
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatYMD(tomorrow);

  if (dueStr === tomorrowStr) {
    return "DUE_TOMORROW";
  }

  return "UPCOMING";
}

/**
 * Computes calendar display stage and color for tickets and tasks.
 * Terminal status takes strict priority over deadline status (e.g. Completed yesterday -> green).
 */
export function getCalendarDeadlineStage(
  itemType: "ticket" | "task",
  status: string,
  dueDateInput: Date | string | null | undefined,
  now: Date = new Date()
): { stage: CalendarDeadlineStage; color: CalendarDeadlineColor } {
  const isTerminal =
    itemType === "task"
      ? status === "Completed"
      : status === "Resolved" || status === "Closed";

  if (isTerminal) {
    return { stage: "COMPLETED", color: "green" };
  }

  const stage = getDeadlineStage(dueDateInput, now);
  switch (stage) {
    case "OVERDUE":
      return { stage: "OVERDUE", color: "red" };
    case "DUE_TODAY":
      return { stage: "DUE_TODAY", color: "orange" };
    case "DUE_TOMORROW":
      return { stage: "DUE_TOMORROW", color: "yellow" };
    case "UPCOMING":
    default:
      return { stage: "UPCOMING", color: "blue" };
  }
}

/**
 * Attempts to record a sent deadline notification.
 * Uses a UNIQUE constraint to ensure exactly ONE notification per (item_type, item_id, stage, recipient_id).
 * Returns true if record was inserted (first time), or false if already sent.
 */
export async function recordDeadlineNotification(
  itemType: "Ticket" | "Task",
  itemId: string,
  stage: "DUE_TOMORROW" | "DUE_TODAY" | "OVERDUE",
  recipientId: string,
  recipientRole: "Assignee" | "Manager"
): Promise<boolean> {
  try {
    const result = await pool.query(
      `INSERT INTO deadline_notifications (
         item_type,
         item_id,
         stage,
         recipient_id,
         recipient_role,
         sent_at
       )
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (item_type, item_id, stage, recipient_id) DO NOTHING
       RETURNING id`,
      [itemType, itemId, stage, recipientId, recipientRole]
    );

    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    console.error("Failed to record deadline notification:", err);
    return false;
  }
}

/**
 * Clears sent deadline notifications for a reopened item or when due date is extended.
 */
export async function clearDeadlineNotifications(
  itemType: "Ticket" | "Task",
  itemId: string
): Promise<number> {
  try {
    const result = await pool.query(
      `DELETE FROM deadline_notifications WHERE item_type = $1 AND item_id = $2`,
      [itemType, itemId]
    );
    return result.rowCount ?? 0;
  } catch (err) {
    console.error("Failed to clear deadline notifications:", err);
    return 0;
  }
}

/**
 * Internal helper to send email and create in-app notification if not already sent.
 */
async function notifyRecipient({
  recipientId,
  recipientName,
  recipientEmail,
  recipientRole,
  itemType,
  itemId,
  titleOrSubject,
  dueDate,
  status,
  stage,
  employeeName,
  clientName,
}: {
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  recipientRole: "Assignee" | "Manager";
  itemType: "Ticket" | "Task";
  itemId: string;
  titleOrSubject: string;
  dueDate: Date | string;
  status: string;
  stage: "DUE_TOMORROW" | "DUE_TODAY" | "OVERDUE";
  employeeName?: string;
  clientName?: string;
}): Promise<boolean> {
  const isFirstNotification = await recordDeadlineNotification(
    itemType,
    itemId,
    stage,
    recipientId,
    recipientRole
  );

  if (!isFirstNotification) {
    return false; // Duplicate prevented by persistent table
  }

  const stageLabels = {
    DUE_TOMORROW: "Due Tomorrow",
    DUE_TODAY: "Due Today",
    OVERDUE: "Overdue",
  };
  const label = stageLabels[stage];

  const formattedDueDate = new Date(dueDate).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // 1. Create In-App Notification
  try {
    const notifTitle =
      recipientRole === "Manager"
        ? `Team ${itemType} ${label} (${employeeName}): ${titleOrSubject}`
        : `${itemType} ${label}: ${titleOrSubject}`;

    const notifMessage =
      recipientRole === "Manager"
        ? `${itemType} ${itemId} assigned to ${employeeName} is ${label.toLowerCase()} (Due: ${formattedDueDate}).`
        : `${itemType} ${itemId} is ${label.toLowerCase()} (Due: ${formattedDueDate}).`;

    await createNotification({
      id: `N-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: recipientId,
      notificationType: stage === "OVERDUE" ? "Overdue Alert" : "Deadline Reminder",
      title: notifTitle,
      message: notifMessage,
      status: "Sent",
      readDate: null,
    });
  } catch (err) {
    console.error(`Failed to create in-app notification for ${recipientId}:`, err);
  }

  // 2. Dispatch Email
  try {
    const emailSubject = getDeadlineEmailSubject({
      recipientName,
      recipientRole,
      itemType,
      itemId,
      titleOrSubject,
      dueDate,
      status,
      stage,
      employeeName,
      clientName,
    });

    const emailHtml = deadlineNotificationEmailTemplate({
      recipientName,
      recipientRole,
      itemType,
      itemId,
      titleOrSubject,
      dueDate,
      status,
      stage,
      employeeName,
      clientName,
    });

    await sendEmail(recipientEmail, emailSubject, emailHtml);
  } catch (err) {
    console.error(`Failed to send deadline email to ${recipientEmail}:`, err);
  }

  return true;
}

/**
 * Checks all active tasks for deadlines and dispatches notifications for Due Tomorrow, Due Today, and Overdue.
 * Completed tasks are strictly excluded.
 */
export async function checkTaskDeadlines(now: Date = new Date()): Promise<{
  inspected: number;
  notified: number;
}> {
  let notifiedCount = 0;

  const result = await pool.query(
    `SELECT
       t.id AS task_id,
       t.title,
       t.status,
       t.due_date,
       t.assigned_to,
       u.full_name AS employee_name,
       u.email AS employee_email,
       u.status AS employee_status,
       u.manager_id,
       m.full_name AS manager_name,
       m.email AS manager_email,
       m.status AS manager_status
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN users m ON u.manager_id = m.id
     WHERE t.status != 'Completed'
       AND t.due_date IS NOT NULL`
  );

  for (const row of result.rows) {
    const stage = getDeadlineStage(row.due_date, now);
    if (stage === "UPCOMING") continue;

    // Notify assigned employee if assigned and active
    if (row.assigned_to && row.employee_email && row.employee_status === "Active") {
      const sentEmp = await notifyRecipient({
        recipientId: row.assigned_to,
        recipientName: row.employee_name,
        recipientEmail: row.employee_email,
        recipientRole: "Assignee",
        itemType: "Task",
        itemId: row.task_id,
        titleOrSubject: row.title,
        dueDate: row.due_date,
        status: row.status,
        stage,
        employeeName: row.employee_name,
      });
      if (sentEmp) notifiedCount++;
    }

    // Notify employee's manager if exists and active
    if (row.manager_id && row.manager_email && row.manager_status === "Active") {
      const sentMgr = await notifyRecipient({
        recipientId: row.manager_id,
        recipientName: row.manager_name,
        recipientEmail: row.manager_email,
        recipientRole: "Manager",
        itemType: "Task",
        itemId: row.task_id,
        titleOrSubject: row.title,
        dueDate: row.due_date,
        status: row.status,
        stage,
        employeeName: row.employee_name,
      });
      if (sentMgr) notifiedCount++;
    }
  }

  return { inspected: result.rows.length, notified: notifiedCount };
}

/**
 * Checks all active tickets for deadlines and dispatches notifications for Due Tomorrow, Due Today, and Overdue.
 * Resolved and Closed tickets are strictly excluded.
 * Uses ticket due_date rather than update age / SLA.
 */
export async function checkTicketDeadlines(now: Date = new Date()): Promise<{
  inspected: number;
  notified: number;
}> {
  let notifiedCount = 0;

  const result = await pool.query(
    `SELECT
       t.id AS ticket_id,
       t.subject,
       t.status,
       t.due_date,
       t.assigned_to,
       t.client_id,
       c.company_name AS client_name,
       u.full_name AS employee_name,
       u.email AS employee_email,
       u.status AS employee_status,
       u.manager_id,
       m.full_name AS manager_name,
       m.email AS manager_email,
       m.status AS manager_status
     FROM tickets t
     LEFT JOIN clients c ON t.client_id = c.id
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN users m ON u.manager_id = m.id
     WHERE t.status NOT IN ('Resolved', 'Closed')
       AND t.due_date IS NOT NULL`
  );

  for (const row of result.rows) {
    const stage = getDeadlineStage(row.due_date, now);
    if (stage === "UPCOMING") continue;

    // Notify assigned employee if assigned and active
    if (row.assigned_to && row.employee_email && row.employee_status === "Active") {
      const sentEmp = await notifyRecipient({
        recipientId: row.assigned_to,
        recipientName: row.employee_name,
        recipientEmail: row.employee_email,
        recipientRole: "Assignee",
        itemType: "Ticket",
        itemId: row.ticket_id,
        titleOrSubject: row.subject,
        dueDate: row.due_date,
        status: row.status,
        stage,
        employeeName: row.employee_name,
        clientName: row.client_name,
      });
      if (sentEmp) notifiedCount++;
    }

    // Notify employee's manager if exists and active
    if (row.manager_id && row.manager_email && row.manager_status === "Active") {
      const sentMgr = await notifyRecipient({
        recipientId: row.manager_id,
        recipientName: row.manager_name,
        recipientEmail: row.manager_email,
        recipientRole: "Manager",
        itemType: "Ticket",
        itemId: row.ticket_id,
        titleOrSubject: row.subject,
        dueDate: row.due_date,
        status: row.status,
        stage,
        employeeName: row.employee_name,
        clientName: row.client_name,
      });
      if (sentMgr) notifiedCount++;
    }
  }

  return { inspected: result.rows.length, notified: notifiedCount };
}

/**
 * Top-level function to check all ticket and task deadlines across the system.
 */
export async function checkAllDeadlines(now: Date = new Date()): Promise<{
  tasksInspected: number;
  ticketsInspected: number;
  totalNotificationsSent: number;
}> {
  const taskRes = await checkTaskDeadlines(now);
  const ticketRes = await checkTicketDeadlines(now);

  return {
    tasksInspected: taskRes.inspected,
    ticketsInspected: ticketRes.inspected,
    totalNotificationsSent: taskRes.notified + ticketRes.notified,
  };
}
