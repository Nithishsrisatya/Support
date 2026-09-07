import cron from "node-cron";
import { pool } from "../db";
import { sendEmail } from "./emailService";
import { createNotification } from "./notificationService";
import { getDeadlineStage, DeadlineStage } from "./deadlineService";
import {
  PendingWorkItem,
  EmployeeWeeklyPendingEmailParams,
  ManagerTeamMemberStats,
  ManagerWeeklyPendingEmailParams,
  employeeWeeklyPendingWorkEmailTemplate,
  managerWeeklyPendingWorkEmailTemplate,
} from "../templates/operationalEmails";

export interface EmployeeWeeklyPendingSummary {
  employeeId: string;
  totalPending: number;
  overdueItems: PendingWorkItem[];
  dueTodayItems: PendingWorkItem[];
  dueTomorrowItems: PendingWorkItem[];
  upcomingItems: PendingWorkItem[];
}

export interface ManagerWeeklyPendingSummary {
  managerId: string;
  totalPending: number;
  overdueItems: PendingWorkItem[];
  dueTodayItems: PendingWorkItem[];
  dueTomorrowItems: PendingWorkItem[];
  upcomingItems: PendingWorkItem[];
  teamStats: ManagerTeamMemberStats[];
}

/**
 * Calculates Monday (YYYY-MM-DD) of the week for a given reference date.
 */
export function getWeekStartDate(dateInput: Date = new Date()): string {
  const d = new Date(dateInput);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

/**
 * Persistently records a weekly notification dispatch using database UNIQUE(week_start, recipient_id).
 * Returns true if record was inserted (not duplicate), false if conflict (duplicate).
 */
export async function recordWeeklyPendingWorkNotification(
  weekStart: string,
  recipientId: string,
  recipientRole: string
): Promise<boolean> {
  try {
    const result = await pool.query(
      `INSERT INTO weekly_pending_work_notifications (week_start, recipient_id, recipient_role, sent_at)
       VALUES ($1::date, $2, $3, NOW())
       ON CONFLICT (week_start, recipient_id) DO NOTHING
       RETURNING id`,
      [weekStart, recipientId, recipientRole]
    );
    return result.rowCount !== null && result.rowCount > 0;
  } catch (err) {
    console.error("Failed to record weekly pending work notification:", err);
    return false;
  }
}

/**
 * Collects and categorizes all pending tickets and tasks assigned to an employee.
 * Excludes terminal items (Resolved/Closed tickets, Completed tasks).
 */
export async function getWeeklyPendingItemsForEmployee(
  employeeId: string,
  referenceDate: Date = new Date()
): Promise<EmployeeWeeklyPendingSummary> {
  // Query active tickets
  const ticketsResult = await pool.query(
    `SELECT t.id, t.subject AS title, t.priority, t.status, t.due_date, c.company_name AS client_name
     FROM tickets t
     LEFT JOIN clients c ON t.client_id = c.id
     WHERE t.assigned_to = $1
       AND t.status NOT IN ('Resolved', 'Closed')
     ORDER BY t.due_date ASC NULLS LAST`,
    [employeeId]
  );

  // Query active tasks
  const tasksResult = await pool.query(
    `SELECT t.id, t.title, t.priority, t.status, t.due_date, u.full_name AS assigned_to_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.assigned_to = $1
       AND t.status NOT IN ('Completed')
     ORDER BY t.due_date ASC NULLS LAST`,
    [employeeId]
  );

  const overdueItems: PendingWorkItem[] = [];
  const dueTodayItems: PendingWorkItem[] = [];
  const dueTomorrowItems: PendingWorkItem[] = [];
  const upcomingItems: PendingWorkItem[] = [];

  // Categorize tickets
  for (const row of ticketsResult.rows) {
    const stage: DeadlineStage = getDeadlineStage(row.due_date, referenceDate);
    const item: PendingWorkItem = {
      id: row.id,
      type: "Ticket",
      title: row.title,
      dueDate: row.due_date,
      priority: row.priority || "Medium",
      status: row.status,
      stage,
      clientName: row.client_name,
    };

    if (stage === "OVERDUE") overdueItems.push(item);
    else if (stage === "DUE_TODAY") dueTodayItems.push(item);
    else if (stage === "DUE_TOMORROW") dueTomorrowItems.push(item);
    else upcomingItems.push(item);
  }

  // Categorize tasks
  for (const row of tasksResult.rows) {
    const stage: DeadlineStage = getDeadlineStage(row.due_date, referenceDate);
    const item: PendingWorkItem = {
      id: row.id,
      type: "Task",
      title: row.title,
      dueDate: row.due_date,
      priority: row.priority || "Medium",
      status: row.status,
      stage,
      assignedToName: row.assigned_to_name,
    };

    if (stage === "OVERDUE") overdueItems.push(item);
    else if (stage === "DUE_TODAY") dueTodayItems.push(item);
    else if (stage === "DUE_TOMORROW") dueTomorrowItems.push(item);
    else upcomingItems.push(item);
  }

  const totalPending =
    overdueItems.length +
    dueTodayItems.length +
    dueTomorrowItems.length +
    upcomingItems.length;

  return {
    employeeId,
    totalPending,
    overdueItems,
    dueTodayItems,
    dueTomorrowItems,
    upcomingItems,
  };
}

/**
 * Collects and categorizes pending tickets and tasks for a manager (own work + supervised team + manager-created unassigned tasks).
 */
export async function getWeeklyPendingItemsForManager(
  managerId: string,
  referenceDate: Date = new Date()
): Promise<ManagerWeeklyPendingSummary> {
  // Query direct reports
  const teamResult = await pool.query(
    `SELECT id, full_name, email FROM users WHERE manager_id = $1 AND status = 'Active' ORDER BY full_name`,
    [managerId]
  );
  const teamMembers = teamResult.rows;
  const teamMemberIds: string[] = teamMembers.map((m) => m.id);

  // All relevant assignee IDs: team members + manager self
  const relevantAssigneeIds = [...teamMemberIds, managerId];

  // Query tickets
  const ticketsResult = await pool.query(
    `SELECT t.id, t.subject AS title, t.priority, t.status, t.due_date, t.assigned_to,
            u.full_name AS assigned_to_name, c.company_name AS client_name
     FROM tickets t
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN clients c ON t.client_id = c.id
     WHERE t.assigned_to = ANY($1::varchar[])
       AND t.status NOT IN ('Resolved', 'Closed')
     ORDER BY t.due_date ASC NULLS LAST`,
    [relevantAssigneeIds]
  );

  // Query tasks: assigned to team/self, or created by manager and unassigned
  const tasksResult = await pool.query(
    `SELECT t.id, t.title, t.priority, t.status, t.due_date, t.assigned_to,
            u.full_name AS assigned_to_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     WHERE ((t.assigned_to = ANY($1::varchar[])) OR (t.assigned_by = $2 AND t.assigned_to IS NULL))
       AND t.status NOT IN ('Completed')
     ORDER BY t.due_date ASC NULLS LAST`,
    [relevantAssigneeIds, managerId]
  );

  const overdueItems: PendingWorkItem[] = [];
  const dueTodayItems: PendingWorkItem[] = [];
  const dueTomorrowItems: PendingWorkItem[] = [];
  const upcomingItems: PendingWorkItem[] = [];

  // Per-employee stats tracking
  const statsMap = new Map<string, ManagerTeamMemberStats>();
  for (const m of teamMembers) {
    statsMap.set(m.id, {
      employeeId: m.id,
      employeeName: m.full_name,
      totalPending: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      dueTomorrowCount: 0,
      upcomingCount: 0,
    });
  }

  // Categorize tickets
  for (const row of ticketsResult.rows) {
    const stage: DeadlineStage = getDeadlineStage(row.due_date, referenceDate);
    const item: PendingWorkItem = {
      id: row.id,
      type: "Ticket",
      title: row.title,
      dueDate: row.due_date,
      priority: row.priority || "Medium",
      status: row.status,
      stage,
      assignedToName: row.assigned_to_name,
      clientName: row.client_name,
    };

    if (stage === "OVERDUE") overdueItems.push(item);
    else if (stage === "DUE_TODAY") dueTodayItems.push(item);
    else if (stage === "DUE_TOMORROW") dueTomorrowItems.push(item);
    else upcomingItems.push(item);

    if (row.assigned_to && statsMap.has(row.assigned_to)) {
      const s = statsMap.get(row.assigned_to)!;
      s.totalPending++;
      if (stage === "OVERDUE") s.overdueCount++;
      else if (stage === "DUE_TODAY") s.dueTodayCount++;
      else if (stage === "DUE_TOMORROW") s.dueTomorrowCount++;
      else s.upcomingCount++;
    }
  }

  // Categorize tasks
  for (const row of tasksResult.rows) {
    const stage: DeadlineStage = getDeadlineStage(row.due_date, referenceDate);
    const item: PendingWorkItem = {
      id: row.id,
      type: "Task",
      title: row.title,
      dueDate: row.due_date,
      priority: row.priority || "Medium",
      status: row.status,
      stage,
      assignedToName: row.assigned_to_name,
    };

    if (stage === "OVERDUE") overdueItems.push(item);
    else if (stage === "DUE_TODAY") dueTodayItems.push(item);
    else if (stage === "DUE_TOMORROW") dueTomorrowItems.push(item);
    else upcomingItems.push(item);

    if (row.assigned_to && statsMap.has(row.assigned_to)) {
      const s = statsMap.get(row.assigned_to)!;
      s.totalPending++;
      if (stage === "OVERDUE") s.overdueCount++;
      else if (stage === "DUE_TODAY") s.dueTodayCount++;
      else if (stage === "DUE_TOMORROW") s.dueTomorrowCount++;
      else s.upcomingCount++;
    }
  }

  const totalPending =
    overdueItems.length +
    dueTodayItems.length +
    dueTomorrowItems.length +
    upcomingItems.length;

  const teamStats = Array.from(statsMap.values());

  return {
    managerId,
    totalPending,
    overdueItems,
    dueTodayItems,
    dueTomorrowItems,
    upcomingItems,
    teamStats,
  };
}

/**
 * Dispatches weekly summary email and in-app notification to an Employee.
 */
export async function sendEmployeeWeeklyPendingWorkSummary(
  employee: { id: string; fullName: string; email: string },
  referenceDate: Date = new Date(),
  force: boolean = false
): Promise<boolean> {
  const weekStart = getWeekStartDate(referenceDate);

  if (!force) {
    const isNew = await recordWeeklyPendingWorkNotification(weekStart, employee.id, "Employee");
    if (!isNew) {
      return false; // Already sent for this week
    }
  } else {
    // Record if not existing
    await recordWeeklyPendingWorkNotification(weekStart, employee.id, "Employee");
  }

  const summary = await getWeeklyPendingItemsForEmployee(employee.id, referenceDate);

  const emailParams: EmployeeWeeklyPendingEmailParams = {
    employeeName: employee.fullName,
    weekStartDate: weekStart,
    totalPending: summary.totalPending,
    overdueCount: summary.overdueItems.length,
    dueTodayCount: summary.dueTodayItems.length,
    dueTomorrowCount: summary.dueTomorrowItems.length,
    upcomingCount: summary.upcomingItems.length,
    overdueItems: summary.overdueItems,
    dueTodayItems: summary.dueTodayItems,
    dueTomorrowItems: summary.dueTomorrowItems,
    upcomingItems: summary.upcomingItems,
  };

  const html = employeeWeeklyPendingWorkEmailTemplate(emailParams);
  const subject = `[Complify] Weekly Pending-Work Summary - ${summary.totalPending} Pending Item(s)`;

  await sendEmail(employee.email, subject, html);

  // In-app notification
  await createNotification({
    id: `N-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId: employee.id,
    notificationType: "Weekly Pending Summary",
    title: "Weekly Pending Work Summary",
    message: `You have ${summary.totalPending} pending item(s) (${summary.overdueItems.length} overdue, ${summary.dueTodayItems.length} due today, ${summary.dueTomorrowItems.length} due tomorrow).`,
    status: "Sent",
    readDate: null,
  });

  return true;
}

/**
 * Dispatches weekly summary email and in-app notification to a Manager.
 */
export async function sendManagerWeeklyPendingWorkSummary(
  manager: { id: string; fullName: string; email: string },
  referenceDate: Date = new Date(),
  force: boolean = false
): Promise<boolean> {
  const weekStart = getWeekStartDate(referenceDate);

  if (!force) {
    const isNew = await recordWeeklyPendingWorkNotification(weekStart, manager.id, "Manager");
    if (!isNew) {
      return false; // Already sent for this week
    }
  } else {
    await recordWeeklyPendingWorkNotification(weekStart, manager.id, "Manager");
  }

  const summary = await getWeeklyPendingItemsForManager(manager.id, referenceDate);

  const emailParams: ManagerWeeklyPendingEmailParams = {
    managerName: manager.fullName,
    weekStartDate: weekStart,
    totalPending: summary.totalPending,
    overdueCount: summary.overdueItems.length,
    dueTodayCount: summary.dueTodayItems.length,
    dueTomorrowCount: summary.dueTomorrowItems.length,
    upcomingCount: summary.upcomingItems.length,
    overdueItems: summary.overdueItems,
    dueTodayItems: summary.dueTodayItems,
    dueTomorrowItems: summary.dueTomorrowItems,
    upcomingItems: summary.upcomingItems,
    teamStats: summary.teamStats,
  };

  const html = managerWeeklyPendingWorkEmailTemplate(emailParams);
  const subject = `[Complify] Manager Weekly Team Pending-Work Summary - ${summary.totalPending} Item(s)`;

  await sendEmail(manager.email, subject, html);

  // In-app notification
  await createNotification({
    id: `N-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId: manager.id,
    notificationType: "Weekly Pending Summary",
    title: "Weekly Team Pending-Work Summary",
    message: `Your team has ${summary.totalPending} pending item(s) (${summary.overdueItems.length} overdue, ${summary.dueTodayItems.length} due today, ${summary.dueTomorrowItems.length} due tomorrow).`,
    status: "Sent",
    readDate: null,
  });

  return true;
}

/**
 * Main weekly dispatcher that iterates all active Employees and Managers.
 */
export async function sendWeeklyPendingWorkSummary(
  referenceDate: Date = new Date(),
  force: boolean = false
): Promise<{ employeesNotified: number; managersNotified: number; errors: string[] }> {
  let employeesNotified = 0;
  let managersNotified = 0;
  const errors: string[] = [];

  try {
    const usersResult = await pool.query(
      `SELECT id, full_name, email, role
       FROM users
       WHERE status = 'Active'
         AND role IN ('Employee', 'Manager')
       ORDER BY role, full_name`
    );

    for (const user of usersResult.rows) {
      try {
        if (user.role === "Employee") {
          const sent = await sendEmployeeWeeklyPendingWorkSummary(
            { id: user.id, fullName: user.full_name, email: user.email },
            referenceDate,
            force
          );
          if (sent) employeesNotified++;
        } else if (user.role === "Manager") {
          const sent = await sendManagerWeeklyPendingWorkSummary(
            { id: user.id, fullName: user.full_name, email: user.email },
            referenceDate,
            force
          );
          if (sent) managersNotified++;
        }
      } catch (userErr: any) {
        const errMsg = `Error sending weekly summary to ${user.role} ${user.id} (${user.email}): ${userErr.message}`;
        console.error(errMsg, userErr);
        errors.push(errMsg);
      }
    }
  } catch (err: any) {
    const errMsg = `Global weekly pending work job failed: ${err.message}`;
    console.error(errMsg, err);
    errors.push(errMsg);
  }

  return { employeesNotified, managersNotified, errors };
}

/**
 * Initializes the weekly Monday cron scheduler for pending work summaries.
 */
export function startWeeklyPendingWorkScheduler() {
  const hour = process.env.WEEKLY_PENDING_WORK_HOUR
    ? Number(process.env.WEEKLY_PENDING_WORK_HOUR)
    : 8;
  const cronExpr = `0 ${hour} * * 1`; // Every Monday at 8:00 AM (or configured hour)

  cron.schedule(cronExpr, async () => {
    console.log(`⏰ Running Weekly Pending-Work Summary job (Monday ${hour}:00 AM)...`);
    try {
      const stats = await sendWeeklyPendingWorkSummary();
      console.log(
        `  ✅ Weekly Pending-Work job complete: ${stats.employeesNotified} employee(s), ${stats.managersNotified} manager(s) notified. Errors: ${stats.errors.length}`
      );
    } catch (err) {
      console.error("❌ Weekly Pending-Work cron error:", err);
    }
  });

  console.log(`  ✅ Weekly pending-work summary scheduler started (Monday ${hour}:00 AM)`);
}
