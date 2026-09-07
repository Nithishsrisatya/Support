import { Router } from "express";
import {
  getAllAuditLogs,
  getAuditLogById,
  createAuditLog,
  deleteAuditLog,
  searchAuditLogs,
} from "../services/auditLogService";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
const router = Router();

// GET /api/audit-logs/search - Search & Filter (must be before /:id)
router.get("/search", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    const filters: any = {
      search: req.query.q as string,
      action: req.query.action as string,
      entityType: req.query.entityType as string,
      userId: req.query.userId as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };

    // Filter out undefined values
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined || filters[key] === null) {
        delete filters[key];
      }
    });

    const result = await searchAuditLogs(filters);
    res.json(result);
  } catch (err) {
    console.error("Failed to search audit logs:", err);
    res.status(500).json({ success: false, message: "Failed to search audit logs." });
  }
});

// GET /api/audit-logs
router.get("/",authenticateToken,
authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const logs = await getAllAuditLogs();
    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch audit logs.",
    });
  }
});

// GET /api/audit-logs/:id
router.get("/:id",authenticateToken,
authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const log = await getAuditLogById(req.params.id);

    if (!log) {
      return res.status(404).json({
        message: "Audit log not found.",
      });
    }

    res.json(log);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch audit log.",
    });
  }
});

// POST /api/audit-logs
router.post("/",authenticateToken,
authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const log = await createAuditLog(req.body);

    res.status(201).json({
      success: true,
      log,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to create audit log.",
    });
  }
});

// DELETE /api/audit-logs/:id
router.delete("/:id",authenticateToken,
authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    await deleteAuditLog(req.params.id);

    res.json({
      success: true,
      message: "Audit log deleted successfully.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to delete audit log.",
    });
  }
});

export default router;
