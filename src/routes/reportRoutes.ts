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

const router = Router();

// ============================================================
// GET /api/reports/tickets - Ticket Report
// ============================================================
router.get("/tickets", authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const filters = {
      status: req.query.status as string,
      priority: req.query.priority as string,
      assignedTo: req.query.assignedTo as string,
      clientId: req.query.clientId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    };

    // Clean undefined values
    Object.keys(filters).forEach(key => {
      if ((filters as any)[key] === undefined) delete (filters as any)[key];
    });

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
    const filters = {
      status: req.query.status as string,
      priority: req.query.priority as string,
      assignedTo: req.query.assignedTo as string,
      assignedBy: req.query.assignedBy as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    };

    Object.keys(filters).forEach(key => {
      if ((filters as any)[key] === undefined) delete (filters as any)[key];
    });

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
    const filters = {
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      department: req.query.department as string,
    };

    Object.keys(filters).forEach(key => {
      if ((filters as any)[key] === undefined) delete (filters as any)[key];
    });

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
    const filters = {
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      status: req.query.status as string,
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

