import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  transferAndDeleteUser,
  changePassword,
} from "../services/userService";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import { logAuditEvent } from "../services/auditLogService";

const router = Router();

// ============================================
// GET ALL USERS
// Administrator, Manager
// ============================================
router.get(
  "/",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager"]),
  async (req, res) => {
    try {
      const users = await getAllUsers();
      res.json(users);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch users.",
      });
    }
  }
);

// ============================================
// GET USER BY ID
// Administrator, Manager
// ============================================
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager"]),
  async (req, res) => {
    try {
      const user = await getUserById(req.params.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      res.json(user);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user.",
      });
    }
  }
);

// ============================================
// CREATE USER
// Administrator Only
// ============================================
router.post(
  "/",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      const user = await createUser(req.body);
      const adminUser = (req as any).user;

      // Audit log: User Creation
      try {
        await logAuditEvent(
          adminUser?.id || "ADMIN",
          adminUser?.fullName || "Administrator",
          "User Creation",
          "User",
          user.id,
          `Administrator ${adminUser?.fullName || "System"} created user ${user.fullName} (${user.email}) with role ${user.role}.`
        );
      } catch (logErr) {
        console.error("Failed to log audit event:", logErr);
      }

      res.status(201).json({
        success: true,
        user,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: "Failed to create user.",
      });
    }
  }
);

// ============================================
// CHANGE PASSWORD
// Logged-in User
// IMPORTANT: Must be before "/:id"
// ============================================
router.put(
  "/change-password",
  authenticateToken,
  async (req, res) => {
    console.log("✅ CHANGE PASSWORD ROUTE HIT");

    try {
      const userId = (req as any).user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required.",
        });
      }

      const result = await changePassword(
        userId,
        currentPassword,
        newPassword
      );

      // Audit log: Password Change
      try {
        const userInfo = (req as any).user;
        await logAuditEvent(
          userId,
          userInfo?.fullName || "User",
          "Password Change",
          "User",
          userId,
          `User ${userInfo?.fullName || "Unknown"} changed their password.`
        );
      } catch (logErr) {
        console.error("Failed to log audit event:", logErr);
      }

      res.json(result);
    } catch (error) {
      console.error(error);

      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to change password.",
      });
    }
  }
);

// ============================================
// UPDATE USER
// Administrator Only
// ============================================
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      const user = await updateUser(req.params.id, req.body);

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: "Failed to update user.",
      });
    }
  }
);

// ============================================
// TRANSFER & DELETE USER
// Administrator Only
// ============================================
router.post(
  "/:id/transfer-delete",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      const oldUserId = req.params.id;
      const { newUserId } = req.body;

      if (!newUserId) {
        return res.status(400).json({
          success: false,
          message: "Replacement employee is required.",
        });
      }

      if (oldUserId === newUserId) {
        return res.status(400).json({
          success: false,
          message: "Cannot transfer to the same employee.",
        });
      }

      const result = await transferAndDeleteUser(
        oldUserId,
        newUserId
      );

      res.json(result);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error",
      });
    }
  }
);

// ============================================
// DELETE USER
// Administrator Only
// ============================================
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      await deleteUser(req.params.id);

      res.json({
        success: true,
        message: "User deleted successfully.",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to delete user.",
      });
    }
  }
);

export default router;