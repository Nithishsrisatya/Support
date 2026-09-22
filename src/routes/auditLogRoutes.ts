import { Router } from "express";
import {
  getAllAuditLogs,
  getAuditLogById,
  createAuditLog,
  deleteAuditLog,
  searchAuditLogs,
  logAuditEvent,
} from "../services/auditLogService";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import {
  isPlainObject,
  isNonEmptyString,
  isString,
  isValidId,
  sanitizePagination,
  isValidDateRange,
  isValidDateString,
  sanitizeSearchQuery,
} from "../utils/validator";
import { handleDatabaseError } from "../utils/dbErrorHandler";

const router = Router();

// GET /api/audit-logs/search - Search & Filter (must be before /:id)
router.get(
  "/search",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager"]),
  async (req, res) => {
    try {
      const { page, limit } = sanitizePagination(req.query.page, req.query.limit, 50, 100);
      const rawFromDate = req.query.fromDate as string;
      const rawToDate = req.query.toDate as string;
      const rawUserId = req.query.userId as string;

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
      if (rawUserId && !isValidId(rawUserId)) {
        return res.status(400).json({ success: false, message: "Invalid userId format." });
      }

      const filters: any = {
        search: sanitizeSearchQuery(req.query.q, 200) || undefined,
        action: req.query.action as string,
        entityType: req.query.entityType as string,
        userId: rawUserId,
        fromDate: rawFromDate,
        toDate: rawToDate,
        page,
        limit,
      };

      // Filter out undefined values
      Object.keys(filters).forEach((key) => {
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
  }
);

// GET /api/audit-logs
router.get(
  "/",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager"]),
  async (req, res) => {
    try {
      const logs = await getAllAuditLogs();
      res.json(logs);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to fetch audit logs.",
      });
    }
  }
);

// GET /api/audit-logs/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager"]),
  async (req, res) => {
    try {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid audit log ID format.",
        });
      }

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
  }
);

// POST /api/audit-logs
// Only Administrators may create manual operational audit logs.
// Actor identity is strictly derived from the authenticated session, and timestamp is server-generated.
router.post(
  "/",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const user = (req as any).user;
      const { action, entityType, entityId, description } = req.body;

      if (!isNonEmptyString(action, 100) || !isNonEmptyString(entityType, 100) || !isNonEmptyString(entityId, 100)) {
        return res.status(400).json({
          success: false,
          message: "action, entityType, and entityId are required (max 100 characters).",
        });
      }

      if (description !== undefined && !isString(description, 5000)) {
        return res.status(400).json({
          success: false,
          message: "description must be a string (max 5000 characters).",
        });
      }

      // Strictly derive actor identity from authenticated session.
      // Ignore any client-supplied userId, actorId, userFullName, timestamp, createdAt.
      const log = await logAuditEvent(
        user.id,
        user.fullName || "Administrator",
        String(action).slice(0, 100),
        String(entityType).slice(0, 100),
        String(entityId).slice(0, 100),
        description ? String(description) : ""
      );

      res.status(201).json({
        success: true,
        log,
      });
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to create audit log.");
    }
  }
);

// DELETE /api/audit-logs/:id
// Audit logs are immutable compliance records and cannot be deleted
router.delete("/:id", authenticateToken, async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Audit logs are immutable compliance records and cannot be deleted.",
  });
});

// DELETE /api/audit-logs
router.delete("/", authenticateToken, async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Audit logs are immutable compliance records and cannot be deleted.",
  });
});

export default router;
