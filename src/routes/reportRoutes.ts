import { Router } from "express";
import {
  getTicketReport,
  getTaskReport,
  getEmployeeProductivityReport,
  getClientStatisticsReport,
} from "../services/reportService";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import { sendWeeklyPendingWorkSummary } from "../services/weeklyPendingWorkService";
import { pool } from "../db";
import {
  isEnum,
  isValidId,
  isString,
  isValidDateString,
  isValidDateRange,
} from "../utils/validator";

const router = Router();

// ============================================================
// GET /api/reports/tickets - Ticket Report
// ============================================================
router.get("/tickets", authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    const rawStatus = req.query.status as string;
    const rawPriority = req.query.priority as string;
    const rawAssignedTo = req.query.assignedTo as string;
    const rawClientId = req.query.clientId as string;
    const rawFromDate = req.query.fromDate as string;
    const rawToDate = req.query.toDate as string;

    if (rawStatus && !isEnum(rawStatus, ["New", "Assigned", "In Progress", "Pending", "Resolved", "Closed"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid ticket status filter." });
    }
    if (rawPriority && !isEnum(rawPriority, ["Low", "Medium", "High", "Critical"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid ticket priority filter." });
    }
    if (rawAssignedTo && !isValidId(rawAssignedTo)) {
      return res.status(400).json({ success: false, message: "Invalid assignedTo ID format." });
    }
    if (rawClientId && !isValidId(rawClientId)) {
      return res.status(400).json({ success: false, message: "Invalid clientId format." });
    }
    if (rawFromDate && !isValidDateString(rawFromDate)) {
      return res.status(400).json({ success: false, message: "Invalid fromDate format." });
    }
    if (rawToDate && !isValidDateString(rawToDate)) {
      return res.status(400).json({ success: false, message: "Invalid toDate format." });
    }
    if (rawFromDate && rawToDate) {
      const range = isValidDateRange(rawFromDate, rawToDate);
      if (!range.valid) {
        return res.status(400).json({ success: false, message: range.error || "Invalid date range." });
      }
    }

    const filters: any = {
      status: rawStatus,
      priority: rawPriority,
      assignedTo: rawAssignedTo,
      clientId: rawClientId,
      fromDate: rawFromDate,
      toDate: rawToDate,
    };

    // Clean undefined values
    Object.keys(filters).forEach(key => {
      if ((filters as any)[key] === undefined) delete (filters as any)[key];
    });

    if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map((r: any) => r.id);
      teamIds.push(user.id);
      filters.assignedToIn = teamIds;
      filters.includeUnassigned = true;
    }

    const report = await getTicketReport(filters);
    res.json(report);
  } catch (err) {
    console.error("Failed to generate ticket report:", err);
    res.status(500).json({ success: false, message: "Failed to generate ticket report." });
  }
});

// ============================================================
// GET /api/reports/tasks - Task Report
// ============================================================
router.get("/tasks", authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    const rawStatus = req.query.status as string;
    const rawPriority = req.query.priority as string;
    const rawAssignedTo = req.query.assignedTo as string;
    const rawAssignedBy = req.query.assignedBy as string;
    const rawFromDate = req.query.fromDate as string;
    const rawToDate = req.query.toDate as string;

    if (rawStatus && !isEnum(rawStatus, ["Pending", "Assigned", "In Progress", "Completed", "Overdue", "Escalated"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid task status filter." });
    }
    if (rawPriority && !isEnum(rawPriority, ["Low", "Medium", "High", "Critical"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid task priority filter." });
    }
    if (rawAssignedTo && !isValidId(rawAssignedTo)) {
      return res.status(400).json({ success: false, message: "Invalid assignedTo ID format." });
    }
    if (rawAssignedBy && !isValidId(rawAssignedBy)) {
      return res.status(400).json({ success: false, message: "Invalid assignedBy ID format." });
    }
    if (rawFromDate && !isValidDateString(rawFromDate)) {
      return res.status(400).json({ success: false, message: "Invalid fromDate format." });
    }
    if (rawToDate && !isValidDateString(rawToDate)) {
      return res.status(400).json({ success: false, message: "Invalid toDate format." });
    }
    if (rawFromDate && rawToDate) {
      const range = isValidDateRange(rawFromDate, rawToDate);
      if (!range.valid) {
        return res.status(400).json({ success: false, message: range.error || "Invalid date range." });
      }
    }

    const filters: any = {
      status: rawStatus,
      priority: rawPriority,
      assignedTo: rawAssignedTo,
      assignedBy: rawAssignedBy,
      fromDate: rawFromDate,
      toDate: rawToDate,
    };

    Object.keys(filters).forEach(key => {
      if ((filters as any)[key] === undefined) delete (filters as any)[key];
    });

    if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map((r: any) => r.id);
      teamIds.push(user.id);
      filters.assignedToIn = teamIds;
      filters.assignedByMe = user.id;
      filters.includeUnassigned = true;
    }

    const report = await getTaskReport(filters);
    res.json(report);
  } catch (err) {
    console.error("Failed to generate task report:", err);
    res.status(500).json({ success: false, message: "Failed to generate task report." });
  }
});

// ============================================================
// GET /api/reports/employees - Employee Productivity Report
// ============================================================
router.get("/employees", authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    const rawFromDate = req.query.fromDate as string;
    const rawToDate = req.query.toDate as string;
    const rawDepartment = req.query.department as string;

    if (rawDepartment && (!isString(rawDepartment, 100) || !rawDepartment.trim())) {
      return res.status(400).json({ success: false, message: "Invalid department format." });
    }
    if (rawFromDate && !isValidDateString(rawFromDate)) {
      return res.status(400).json({ success: false, message: "Invalid fromDate format." });
    }
    if (rawToDate && !isValidDateString(rawToDate)) {
      return res.status(400).json({ success: false, message: "Invalid toDate format." });
    }
    if (rawFromDate && rawToDate) {
      const range = isValidDateRange(rawFromDate, rawToDate);
      if (!range.valid) {
        return res.status(400).json({ success: false, message: range.error || "Invalid date range." });
      }
    }

    const filters: any = {
      fromDate: rawFromDate,
      toDate: rawToDate,
      department: rawDepartment,
    };

    Object.keys(filters).forEach(key => {
      if ((filters as any)[key] === undefined) delete (filters as any)[key];
    });

    if (role === "Manager") {
      filters.managerId = user.id;
    }

    const report = await getEmployeeProductivityReport(filters);
    res.json(report);
  } catch (err) {
    console.error("Failed to generate employee productivity report:", err);
    res.status(500).json({ success: false, message: "Failed to generate employee productivity report." });
  }
});

// ============================================================
// GET /api/reports/clients - Client Statistics Report
// ============================================================
router.get("/clients", authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const rawFromDate = req.query.fromDate as string;
    const rawToDate = req.query.toDate as string;
    const rawStatus = req.query.status as string;

    if (rawStatus && !isEnum(rawStatus, ["Active", "Inactive", "Disabled", "Suspended", "Pending Activation"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid client status filter." });
    }
    if (rawFromDate && !isValidDateString(rawFromDate)) {
      return res.status(400).json({ success: false, message: "Invalid fromDate format." });
    }
    if (rawToDate && !isValidDateString(rawToDate)) {
      return res.status(400).json({ success: false, message: "Invalid toDate format." });
    }
    if (rawFromDate && rawToDate) {
      const range = isValidDateRange(rawFromDate, rawToDate);
      if (!range.valid) {
        return res.status(400).json({ success: false, message: range.error || "Invalid date range." });
      }
    }

    const filters: any = {
      fromDate: rawFromDate,
      toDate: rawToDate,
      status: rawStatus,
    };

    Object.keys(filters).forEach(key => {
      if ((filters as any)[key] === undefined) delete (filters as any)[key];
    });

    const report = await getClientStatisticsReport(filters);
    res.json(report);
  } catch (err) {
    console.error("Failed to generate client statistics report:", err);
    res.status(500).json({ success: false, message: "Failed to generate client statistics report." });
  }
});
// ============================================================
// POST /api/reports/weekly-pending-work/trigger - Trigger Weekly Summary (Admin only)
// ============================================================
router.post(
  "/weekly-pending-work/trigger",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      const force = req.body?.force === true;
      const stats = await sendWeeklyPendingWorkSummary(new Date(), force);

      res.json({
        success: true,
        message: "Weekly pending-work summary triggered successfully.",
        stats,
      });
    } catch (err: any) {
      console.error("Failed to trigger weekly pending work summary:", err);
      res.status(500).json({
        success: false,
        message: err.message || "Failed to trigger weekly pending work summary.",
      });
    }
  }
);

export default router;

