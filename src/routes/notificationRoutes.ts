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
const router = Router();

// GET /api/notifications
router.get("/", authenticateToken,
authorizeRoles(
  ["Administrator",
  "Manager",
  "Employee",
  "Client"]
), async (req, res) => {
  try {
    const user = (req as any).user;
    if (user?.role === "Administrator") {
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
});

// GET /api/notifications/user/:userId - Get notifications for a specific user
router.get("/user/:userId", authenticateToken,
authorizeRoles(
  ["Administrator",
  "Manager",
  "Employee",
  "Client"]
), async (req, res) => {
  try {
    const user = (req as any).user;
    if (user?.role !== "Administrator" && user?.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const notifications = await getNotificationsByUserId(req.params.userId);
    res.json(notifications);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch user notifications.",
    });
  }
});

// GET /api/notifications/unread-count/:userId - Get unread count for a user
router.get("/unread-count/:userId", authenticateToken,
authorizeRoles(
  ["Administrator",
  "Manager",
  "Employee",
  "Client"]
), async (req, res) => {
  try {
    const user = (req as any).user;
    if (user?.role !== "Administrator" && user?.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const count = await getUnreadCountByUserId(req.params.userId);
    res.json({ count });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch unread count.",
    });
  }
});

// GET /api/notifications/total-count/:userId - Get total notification count for a user
router.get("/total-count/:userId", authenticateToken,
authorizeRoles(
  ["Administrator",
  "Manager",
  "Employee",
  "Client"]
), async (req, res) => {
  try {
    const user = (req as any).user;
    if (user?.role !== "Administrator" && user?.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const count = await getNotificationCountByUserId(req.params.userId);
    res.json({ count });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch notification count.",
    });
  }
});

// PUT /api/notifications/:id/read - Mark a single notification as read
router.put("/:id/read", authenticateToken,
authorizeRoles(
  ["Administrator",
  "Manager",
  "Employee",
  "Client"]
), async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await getNotificationById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Notification not found." });
    }
    if (user?.role !== "Administrator" && user?.id !== existing.userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const notification = await markAsRead(req.params.id);

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found or already read.",
      });
    }

    res.json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read.",
    });
  }
});

// PUT /api/notifications/user/:userId/read-all - Mark all notifications as read for a user
router.put("/user/:userId/read-all", authenticateToken,
authorizeRoles(
  ["Administrator",
  "Manager",
  "Employee",
  "Client"]
), async (req, res) => {
  try {
    const user = (req as any).user;
    if (user?.role !== "Administrator" && user?.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const updated = await markAllAsReadByUserId(req.params.userId);
    res.json({
      success: true,
      updated: updated.length,
      message: `${updated.length} notifications marked as read.`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read.",
    });
  }
});

// GET /api/notifications/:id
router.get("/:id", authenticateToken,
authorizeRoles(
  ["Administrator",
  "Manager",
  "Employee",
  "Client"]
), async (req, res) => {
  try {
    const user = (req as any).user;
    const notification = await getNotificationById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found.",
      });
    }

    if (user?.role !== "Administrator" && user?.id !== notification.userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    res.json(notification);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch notification.",
    });
  }
});

// POST /api/notifications
router.post("/", authenticateToken,
authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const notification = await createNotification(req.body);

    res.status(201).json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to create notification.",
    });
  }
});

// PUT /api/notifications/:id
router.put("/:id", authenticateToken,
authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const notification = await updateNotification(req.params.id, req.body);

    res.json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to update notification.",
    });
  }
});

// DELETE /api/notifications/user/:userId - Delete all notifications for a user
router.delete("/user/:userId", authenticateToken,
authorizeRoles(
  ["Administrator",
  "Manager",
  "Employee",
  "Client"]
), async (req, res) => {
  try {
    const user = (req as any).user;
    if (user?.role !== "Administrator" && user?.id !== req.params.userId) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    await deleteAllNotificationsByUserId(req.params.userId);
    res.json({
      success: true,
      message: "All notifications deleted successfully.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notifications.",
    });
  }
});

// DELETE /api/notifications/:id
router.delete("/:id", authenticateToken,
authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    await deleteNotification(req.params.id);

    res.json({
      success: true,
      message: "Notification deleted successfully.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification.",
    });
  }
});

export default router;
