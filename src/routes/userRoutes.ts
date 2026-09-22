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
import {
  isPlainObject,
  isNonEmptyString,
  isString,
  isEmail,
  isEnum,
  isValidId,
  filterAllowedFields,
} from "../utils/validator";
import { handleDatabaseError } from "../utils/dbErrorHandler";

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
      if (!isValidId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format.",
        });
      }

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
      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const allowed = filterAllowedFields<any>(req.body, [
        "id",
        "fullName",
        "email",
        "role",
        "department",
        "managerId",
        "status",
        "password",
        "passwordHash",
        "firstLogin",
      ]);

      const { fullName, email, role, department, managerId, status, id, password, passwordHash } = allowed;

      if (id !== undefined && !isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format.",
        });
      }

      if (!isNonEmptyString(fullName, 255)) {
        return res.status(400).json({
          success: false,
          message: "Full name is required (max 255 characters).",
        });
      }

      if (!isEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "A valid email address is required.",
        });
      }

      if (!isEnum(role, ["Administrator", "Manager", "Employee", "Client"] as const)) {
        return res.status(400).json({
          success: false,
          message: "Valid role is required (Administrator, Manager, Employee, Client).",
        });
      }

      if (status !== undefined && !isEnum(status, ["Active", "Inactive", "Disabled", "Suspended"] as const)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user status.",
        });
      }

      if (department !== undefined && !isString(department, 100)) {
        return res.status(400).json({
          success: false,
          message: "Invalid department format.",
        });
      }

      if (managerId !== undefined && managerId !== null && !isValidId(managerId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid manager ID.",
        });
      }

      const candidatePassword = password || passwordHash;
      if (candidatePassword !== undefined && (!isString(candidatePassword, 128) || candidatePassword.length < 8)) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters long (between 8 and 128 characters).",
        });
      }

      if (!allowed.id) {
        allowed.id = `U-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      }
      if (!allowed.status) {
        allowed.status = "Active";
      }
      if (allowed.firstLogin === undefined) {
        allowed.firstLogin = true;
      }

      const user = await createUser(allowed);
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
      return handleDatabaseError(error, res, "Failed to create user.");
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
      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const userId = (req as any).user.id;
      const { currentPassword, newPassword } = req.body;

      if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword)) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required.",
        });
      }

      if (currentPassword.length > 128) {
        return res.status(400).json({
          success: false,
          message: "Current password exceeds maximum allowed length.",
        });
      }

      if (newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters long (between 8 and 128 characters).",
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
      if (!isValidId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format.",
        });
      }

      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const allowed = filterAllowedFields<any>(req.body, [
        "fullName",
        "email",
        "role",
        "status",
        "department",
        "managerId",
      ]);

      const { fullName, email, role, status, department, managerId } = allowed;

      if (fullName !== undefined && (!isString(fullName, 255) || !fullName.trim())) {
        return res.status(400).json({
          success: false,
          message: "Full name cannot be empty.",
        });
      }

      if (email !== undefined && !isEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address.",
        });
      }

      if (role !== undefined && !isEnum(role, ["Administrator", "Manager", "Employee", "Client"] as const)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user role.",
        });
      }

      if (status !== undefined && !isEnum(status, ["Active", "Inactive", "Disabled", "Suspended"] as const)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user status.",
        });
      }

      if (department !== undefined && !isString(department, 100)) {
        return res.status(400).json({
          success: false,
          message: "Invalid department format.",
        });
      }

      if (managerId !== undefined && managerId !== null && !isValidId(managerId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid manager ID.",
        });
      }

      const user = await updateUser(req.params.id, allowed);

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to update user.");
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
      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const oldUserId = req.params.id;
      const { newUserId } = req.body;

      if (!isValidId(oldUserId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid current user ID format.",
        });
      }

      if (!isNonEmptyString(newUserId, 100) || !isValidId(newUserId)) {
        return res.status(400).json({
          success: false,
          message: "Valid replacement employee ID is required.",
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
      console.error("Transfer and delete user error:", error);

      const msg = error instanceof Error ? error.message : "Failed to transfer and delete user.";
      const status = msg.toLowerCase().includes("not found") ? 404 : 400;

      res.status(status).json({
        success: false,
        message: msg,
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
      if (!isValidId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format.",
        });
      }

      const requestingUserId = (req as any).user?.id;
      await deleteUser(req.params.id, requestingUserId);

      res.json({
        success: true,
        message: "User deleted successfully.",
      });
    } catch (error) {
      console.error("Delete user error:", error);

      const msg = error instanceof Error ? error.message : "Failed to delete user.";
      const status = msg.toLowerCase().includes("not found") ? 404 : 400;

      res.status(status).json({
        success: false,
        message: msg,
      });
    }
  }
);

export default router;