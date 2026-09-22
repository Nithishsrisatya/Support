import { Router } from "express";
import {
  getAllNotifications,
  getNotificationById,
  getNotificationsByUserId,
  getUnreadCountByUserId,
  getNotificationCountByUserId,
  createNotification,
  markAsRead,
  markAllAsReadByUserId,
  deleteAllNotificationsByUserId,
  updateNotification,
  deleteNotification,
} from "../services/notificationService";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import {
  isPlainObject,
  isNonEmptyString,
  isString,
  isEnum,
  isValidId,
  filterAllowedFields,
} from "../utils/validator";
import { handleDatabaseError } from "../utils/dbErrorHandler";

const router = Router();

// GET /api/notifications
router.get(
  "/",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      const user = (req as any).user;
      if (user?.role === "Administrator" && req.query.all === "true") {
        const notifications = await getAllNotifications();
        return res.json(notifications);
      }
      const notifications = await getNotificationsByUserId(user.id);
      res.json(notifications);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to fetch notifications.",
      });
    }
  }
);

// GET /api/notifications/unread-count/:userId
router.get(
  "/unread-count/:userId",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUserId = req.params.userId;
      if (!isValidId(targetUserId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
      }
      if (user?.role !== "Administrator" && user?.id !== targetUserId) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      const count = await getUnreadCountByUserId(targetUserId);
      res.json({ count });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to fetch unread notification count.",
      });
    }
  }
);

// GET /api/notifications/total-count/:userId
router.get(
  "/total-count/:userId",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUserId = req.params.userId;
      if (!isValidId(targetUserId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
      }
      if (user?.role !== "Administrator" && user?.id !== targetUserId) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      const count = await getNotificationCountByUserId(targetUserId);
      res.json({ count });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to fetch total notification count.",
      });
    }
  }
);

// GET /api/notifications/user/:userId - Get notifications for a specific user
router.get(
  "/user/:userId",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUserId = req.params.userId;
      if (!isValidId(targetUserId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
      }
      if (user?.role !== "Administrator" && user?.id !== targetUserId) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      const notifications = await getNotificationsByUserId(targetUserId);
      res.json(notifications);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to fetch user notifications.",
      });
    }
  }
);

// PUT /api/notifications/user/:userId/read-all - Mark all notifications as read
router.put(
  "/user/:userId/read-all",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUserId = req.params.userId;
      if (!isValidId(targetUserId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
      }
      if (user?.id !== targetUserId) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      const updated = await markAllAsReadByUserId(targetUserId);
      res.json({
        success: true,
        message: "All notifications marked as read.",
        updated: updated.length,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to mark all notifications as read.",
      });
    }
  }
);

// DELETE /api/notifications/user/:userId - Clear all notifications for user
router.delete(
  "/user/:userId",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const targetUserId = req.params.userId;
      if (!isValidId(targetUserId)) {
        return res.status(400).json({ success: false, message: "Invalid user ID." });
      }
      if (user?.id !== targetUserId) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      const count = await deleteAllNotificationsByUserId(targetUserId);
      res.json({
        success: true,
        message: "All notifications cleared.",
        count,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to clear notifications.",
      });
    }
  }
);

// GET /api/notifications/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid notification ID." });
      }

      const user = (req as any).user;
      const notification = await getNotificationById(req.params.id);

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found.",
        });
      }

      if (user?.role !== "Administrator" && notification.userId !== user?.id) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }

      res.json(notification);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to fetch notification.",
      });
    }
  }
);

// POST /api/notifications
router.post(
  "/",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const caller = (req as any).user;
      const allowed = filterAllowedFields<any>(req.body, [
        "id",
        "userId",
        "notificationType",
        "title",
        "message",
        "status",
        "relatedId",
        "relatedType",
      ]);

      const { userId, notificationType, title, message, status, relatedId, relatedType } = allowed;

      if (!isValidId(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid recipient user ID format.",
        });
      }

      // Authorization guard: non-Administrators cannot create notifications targeted to other users
      if (caller?.role !== "Administrator" && userId !== caller?.id) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You cannot create notifications for another user.",
        });
      }

      if (
        !isNonEmptyString(title, 255) ||
        !isNonEmptyString(message, 5000)
      ) {
        return res.status(400).json({
          success: false,
          message: "title and message are required.",
        });
      }

      const validNotificationTypes = [
        "Account Creation",
        "Password Reset",
        "Ticket Assignment",
        "Ticket Update",
        "Task Assignment",
        "Task Reminder",
        "Escalation Alert",
        "Overdue Alert",
        "Due Reminder",
        "Deadline Reminder",
        "Weekly Pending Summary",
      ];
      if (!isNonEmptyString(notificationType, 100) || !validNotificationTypes.includes(notificationType)) {
        return res.status(400).json({
          success: false,
          message: "Valid notificationType is required.",
        });
      }

      if (status !== undefined && !isEnum(status, ["Unread", "Read"] as const)) {
        return res.status(400).json({
          success: false,
          message: "Invalid notification status. Must be Unread or Read.",
        });
      }

      if (relatedId !== undefined && relatedId !== null && !isValidId(relatedId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid relatedId format.",
        });
      }

      if (relatedType !== undefined && !isString(relatedType, 50)) {
        return res.status(400).json({
          success: false,
          message: "Invalid relatedType format.",
        });
      }

      const notification = await createNotification(allowed);

      res.status(201).json({
        success: true,
        notification,
      });
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to create notification.");
    }
  }
);

// PUT /api/notifications/:id/read - Mark single notification as read
router.put(
  "/:id/read",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const id = req.params.id;

      if (!isValidId(id)) {
        return res.status(400).json({ success: false, message: "Invalid notification ID." });
      }

      const existing = await getNotificationById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Notification not found." });
      }

      if (existing.userId !== user?.id) {
        return res.status(403).json({ success: false, message: "Forbidden: You cannot modify this notification." });
      }

      if (existing.status === "Read") {
        return res.json({
          success: true,
          notification: existing,
          message: "Notification already marked as read.",
        });
      }

      const updated = await markAsRead(id);
      res.json({
        success: true,
        notification: updated,
      });
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to mark notification as read.");
    }
  }
);

// DELETE /api/notifications/:id - Delete single notification
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager", "Employee", "Client"]),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const id = req.params.id;

      if (!isValidId(id)) {
        return res.status(400).json({ success: false, message: "Invalid notification ID." });
      }

      const existing = await getNotificationById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: "Notification not found." });
      }

      if (existing.userId !== user?.id) {
        return res.status(403).json({ success: false, message: "Forbidden: You cannot delete this notification." });
      }

      await deleteNotification(id);
      res.json({
        success: true,
        message: "Notification deleted.",
      });
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to delete notification.");
    }
  }
);

// PUT /api/notifications/:id - Update notification (Administrator only)
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid notification ID." });
      }

      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const allowed = filterAllowedFields<any>(req.body, [
        "title",
        "message",
        "status",
        "notificationType",
      ]);

      if (allowed.status !== undefined && !isEnum(allowed.status, ["Unread", "Read"] as const)) {
        return res.status(400).json({
          success: false,
          message: "Invalid notification status.",
        });
      }

      if (allowed.title !== undefined && !isNonEmptyString(allowed.title, 255)) {
        return res.status(400).json({
          success: false,
          message: "title must be a non-empty string (max 255 characters).",
        });
      }

      if (allowed.message !== undefined && !isNonEmptyString(allowed.message, 5000)) {
        return res.status(400).json({
          success: false,
          message: "message must be a non-empty string (max 5000 characters).",
        });
      }

      const notification = await updateNotification(req.params.id, allowed);

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found.",
        });
      }

      res.json(notification);
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to update notification.");
    }
  }
);

export default router;
