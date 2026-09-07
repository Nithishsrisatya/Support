import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware";
import { pool } from "../db";
import {
  CalendarDeadlineEvent,
  getCalendarDeadlineStage,
} from "../services/deadlineService";

const router = Router();

function formatCalendarDueDate(dueDate: any): string {
  if (!dueDate) return "";
  if (dueDate instanceof Date) {
    const year = dueDate.getFullYear();
    const month = String(dueDate.getMonth() + 1).padStart(2, "0");
    const day = String(dueDate.getDate()).padStart(2, "0");
    const hours = String(dueDate.getHours()).padStart(2, "0");
    const minutes = String(dueDate.getMinutes()).padStart(2, "0");
    const seconds = String(dueDate.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }
  const str = String(dueDate);
  if (str.length === 10 && str.includes("-")) {
    return `${str}T00:00:00`;
  }
  return str;
}

/**
 * GET /api/calendar/deadlines?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Fetches role-authorized ticket and task events within the specified date range.
 */
router.get("/deadlines", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user || !user.role) {
      return res.status(401).json({ error: "Unauthorized: Invalid authentication." });
    }

    const role = String(user.role).trim();
    const userId = String(user.id).trim();

    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        error: "Missing required query parameters: 'start' and 'end' (YYYY-MM-DD).",
      });
    }

    const startDate = new Date(String(start));
    const endDate = new Date(String(end));

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        error: "Invalid date format for 'start' or 'end'. Use YYYY-MM-DD.",
      });
    }

    const startStr = String(start).split("T")[0];
    const endStr = String(end).split("T")[0];

    const events: CalendarDeadlineEvent[] = [];
    const now = new Date();

    // ──────────────────────────────────────────────
    // 1. QUERY ROLE-AUTHORIZED TICKETS
    // ──────────────────────────────────────────────
    let ticketQuery = "";
    let ticketParams: any[] = [];

    if (role === "Administrator") {
      ticketQuery = `
        SELECT
          t.id,
          t.subject AS title,
          t.status,
          t.priority,
          t.due_date,
          t.assigned_to,
          t.client_id,
          c.company_name AS client_name,
          u.full_name AS employee_name
        FROM tickets t
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.due_date IS NOT NULL
          AND t.due_date::date >= $1::date
          AND t.due_date::date <= $2::date
      `;
      ticketParams = [startStr, endStr];
    } else if (role === "Manager") {
      const teamRes = await pool.query(
        `SELECT id FROM users WHERE manager_id = $1`,
        [userId]
      );
      const teamIds = teamRes.rows.map((r) => r.id);
      teamIds.push(userId);

      ticketQuery = `
        SELECT
          t.id,
          t.subject AS title,
          t.status,
          t.priority,
          t.due_date,
          t.assigned_to,
          t.client_id,
          c.company_name AS client_name,
          u.full_name AS employee_name
        FROM tickets t
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.due_date IS NOT NULL
          AND t.due_date::date >= $1::date
          AND t.due_date::date <= $2::date
          AND (t.assigned_to = ANY($3::varchar[]) OR (t.assigned_to IS NULL AND t.client_id IS NOT NULL))
      `;
      ticketParams = [startStr, endStr, teamIds];
    } else if (role === "Employee") {
      ticketQuery = `
        SELECT
          t.id,
          t.subject AS title,
          t.status,
          t.priority,
          t.due_date,
          t.assigned_to,
          t.client_id,
          c.company_name AS client_name,
          u.full_name AS employee_name
        FROM tickets t
        LEFT JOIN clients c ON t.client_id = c.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.due_date IS NOT NULL
          AND t.due_date::date >= $1::date
          AND t.due_date::date <= $2::date
          AND t.assigned_to = $3
      `;
      ticketParams = [startStr, endStr, userId];
    } else if (role === "Client") {
      ticketQuery = `
        SELECT
          t.id,
          t.subject AS title,
          t.status,
          t.priority,
          t.due_date,
          t.assigned_to,
          t.client_id,
          c.company_name AS client_name,
          NULL AS employee_name
        FROM tickets t
        LEFT JOIN clients c ON t.client_id = c.id
        WHERE t.due_date IS NOT NULL
          AND t.due_date::date >= $1::date
          AND t.due_date::date <= $2::date
          AND t.client_id = $3
      `;
      ticketParams = [startStr, endStr, userId];
    }

    if (ticketQuery) {
      const ticketResult = await pool.query(ticketQuery, ticketParams);
      for (const row of ticketResult.rows) {
        const { stage, color } = getCalendarDeadlineStage(
          "ticket",
          row.status,
          row.due_date,
          now
        );
        events.push({
          id: row.id,
          type: "ticket",
          title: row.title,
          dueDate: formatCalendarDueDate(row.due_date),
          status: row.status,
          priority: row.priority,
          assignedTo: role === "Client" ? null : row.assigned_to,
          assignedEmployeeName: role === "Client" ? null : row.employee_name,
          clientId: row.client_id,
          clientName: row.client_name,
          deadlineStage: stage,
          color,
        });
      }
    }

    // ──────────────────────────────────────────────
    // 2. QUERY ROLE-AUTHORIZED TASKS
    // ──────────────────────────────────────────────
    // Clients do NOT have access to internal tasks
    if (role !== "Client") {
      let taskQuery = "";
      let taskParams: any[] = [];

      if (role === "Administrator") {
        taskQuery = `
          SELECT
            t.id,
            t.title,
            t.status,
            t.priority,
            t.due_date,
            t.assigned_to,
            u.full_name AS employee_name
          FROM tasks t
          LEFT JOIN users u ON t.assigned_to = u.id
          WHERE t.due_date IS NOT NULL
            AND t.due_date::date >= $1::date
            AND t.due_date::date <= $2::date
        `;
        taskParams = [startStr, endStr];
      } else if (role === "Manager") {
        const teamRes = await pool.query(
          `SELECT id FROM users WHERE manager_id = $1`,
          [userId]
        );
        const teamIds = teamRes.rows.map((r) => r.id);
        teamIds.push(userId);

        taskQuery = `
          SELECT
            t.id,
            t.title,
            t.status,
            t.priority,
            t.due_date,
            t.assigned_to,
            u.full_name AS employee_name
          FROM tasks t
          LEFT JOIN users u ON t.assigned_to = u.id
          WHERE t.due_date IS NOT NULL
            AND t.due_date::date >= $1::date
            AND t.due_date::date <= $2::date
            AND (
              t.assigned_to = ANY($3::varchar[])
              OR t.assigned_by = $4
              OR t.assigned_to IS NULL
            )
        `;
        taskParams = [startStr, endStr, teamIds, userId];
      } else if (role === "Employee") {
        taskQuery = `
          SELECT
            t.id,
            t.title,
            t.status,
            t.priority,
            t.due_date,
            t.assigned_to,
            u.full_name AS employee_name
          FROM tasks t
          LEFT JOIN users u ON t.assigned_to = u.id
          WHERE t.due_date IS NOT NULL
            AND t.due_date::date >= $1::date
            AND t.due_date::date <= $2::date
            AND t.assigned_to = $3
        `;
        taskParams = [startStr, endStr, userId];
      }

      if (taskQuery) {
        const taskResult = await pool.query(taskQuery, taskParams);
        for (const row of taskResult.rows) {
          const { stage, color } = getCalendarDeadlineStage(
            "task",
            row.status,
            row.due_date,
            now
          );
          events.push({
            id: row.id,
            type: "task",
            title: row.title,
            dueDate: formatCalendarDueDate(row.due_date),
            status: row.status,
            priority: row.priority,
            assignedTo: row.assigned_to,
            assignedEmployeeName: row.employee_name,
            clientId: null,
            clientName: null,
            deadlineStage: stage,
            color,
          });
        }
      }
    }

    // Sort chronologically by due date, then ID
    events.sort((a, b) => {
      const timeDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });

    return res.json(events);
  } catch (error) {
    console.error("Calendar deadlines API error:", error);
    return res.status(500).json({ error: "Failed to fetch calendar deadlines." });
  }
});

export default router;
