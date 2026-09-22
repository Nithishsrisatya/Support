import { Router } from "express";
import {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  updateClientProfile,
  deleteClient,
  changeClientPassword,
} from "../services/clientService";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import bcrypt from "bcrypt";
import { sendEmail } from "../services/emailService";
import { clientWelcomeTemplate } from "../templates/operationalEmails";
import { logAuditEvent } from "../services/auditLogService";
import { generateTemporaryPassword, isPredictablePassword } from "../utils/credentialUtils";
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

// GET /api/clients
router.get(
  "/",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager"]),
  async (req, res) => {
    try {
      const clients = await getAllClients();
      res.json(clients);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to fetch clients.",
      });
    }
  }
);

// PUT /api/clients/change-password
router.put(
  "/change-password",
  authenticateToken,
  async (req, res) => {
    try {
      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const clientId = (req as any).user.id;
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

      const result = await changeClientPassword(
        clientId,
        currentPassword,
        newPassword
      );

      try {
        const clientInfo = (req as any).user;
        await logAuditEvent(
          clientId,
          clientInfo?.fullName || "Client",
          "Password Change",
          "Client",
          clientId,
          `Client ${clientInfo?.fullName || "Unknown"} changed their password.`
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

// GET /api/clients/me
router.get(
  "/me",
  authenticateToken,
  authorizeRoles([], true),
  async (req, res) => {
    try {
      const clientId = (req as any).user.id;
      const client = await getClientById(clientId);

      if (!client) {
        return res.status(404).json({ message: "Client not found." });
      }

      res.json(client);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to fetch my client profile." });
    }
  }
);

// PUT /api/clients/me
router.put(
  "/me",
  authenticateToken,
  authorizeRoles([], true),
  async (req, res) => {
    try {
      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const clientId = (req as any).user.id;
      const { companyName, companyDomain, contactPerson, email, phoneNumber, city } = req.body;

      if (companyName !== undefined && (!isString(companyName, 255) || !companyName.trim())) {
        return res.status(400).json({
          success: false,
          message: "Company name cannot be empty.",
        });
      }

      if (contactPerson !== undefined && (!isString(contactPerson, 255) || !contactPerson.trim())) {
        return res.status(400).json({
          success: false,
          message: "Contact person cannot be empty.",
        });
      }

      if (email !== undefined && !isEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address.",
        });
      }

      if (phoneNumber !== undefined && !isString(phoneNumber, 50)) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format.",
        });
      }

      if (city !== undefined && !isString(city, 100)) {
        return res.status(400).json({
          success: false,
          message: "Invalid city format.",
        });
      }

      if (companyDomain !== undefined && !isString(companyDomain, 255)) {
        return res.status(400).json({
          success: false,
          message: "Invalid company domain format.",
        });
      }

      const client = await updateClientProfile(clientId, {
        companyName,
        companyDomain,
        contactPerson,
        email,
        phoneNumber,
        city,
      });

      try {
        const user = (req as any).user;
        await logAuditEvent(
          clientId,
          client.contactPerson || user?.fullName || "Client",
          "Account Status Change",
          "Client",
          clientId,
          `Client ${client.companyName} (${client.contactPerson}) updated their profile.`
        );
      } catch (logErr) {
        console.error("Failed to log audit event:", logErr);
      }

      res.json({
        success: true,
        message: "Profile updated successfully.",
        client,
      });
    } catch (error) {
      console.error(error);

      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to update profile.",
      });
    }
  }
);

// GET /api/clients/:id
router.get(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator", "Manager"], true),
  async (req, res) => {
    try {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid client ID format." });
      }

      const user = (req as any).user;
      if ((user?.userType === "Client" || user?.role === "Client") && user?.id !== req.params.id) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }

      const client = await getClientById(req.params.id);

      if (!client) {
        return res.status(404).json({
          message: "Client not found.",
        });
      }

      res.json(client);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: "Failed to fetch client.",
      });
    }
  }
);

// POST /api/clients
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
        "companyName",
        "companyDomain",
        "contactPerson",
        "email",
        "phoneNumber",
        "city",
        "status",
        "password",
      ]);

      const { companyName, contactPerson, email, phoneNumber, companyDomain, city, status, id, password } = allowed;

      if (id !== undefined && !isValidId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID format.",
        });
      }

      if (!isNonEmptyString(companyName, 255)) {
        return res.status(400).json({
          success: false,
          message: "Company name is required (max 255 characters).",
        });
      }

      if (!isNonEmptyString(contactPerson, 255)) {
        return res.status(400).json({
          success: false,
          message: "Contact person is required (max 255 characters).",
        });
      }

      if (!isEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "A valid email address is required.",
        });
      }

      if (phoneNumber !== undefined && !isString(phoneNumber, 50)) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format.",
        });
      }

      if (
        status !== undefined &&
        !isEnum(status, ["Active", "Inactive", "Disabled", "Suspended", "Pending Activation"] as const)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid client status.",
        });
      }

      if (companyDomain !== undefined && !isString(companyDomain, 255)) {
        return res.status(400).json({
          success: false,
          message: "Invalid company domain format.",
        });
      }

      if (city !== undefined && !isString(city, 100)) {
        return res.status(400).json({
          success: false,
          message: "Invalid city format.",
        });
      }

      if (password !== undefined && (!isString(password, 128) || password.length < 8)) {
        return res.status(400).json({
          success: false,
          message: "Password must be between 8 and 128 characters long.",
        });
      }

      const tempPassword = (password && !isPredictablePassword(password, contactPerson))
        ? password
        : generateTemporaryPassword();

      const passwordHash = await bcrypt.hash(tempPassword, 10);

      if (!allowed.id) {
        allowed.id = `C-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      }
      if (!allowed.status) {
        allowed.status = "Active";
      }

      const client = await createClient({
        ...allowed,
        passwordHash,
      });

      try {
        const html = clientWelcomeTemplate(
          contactPerson,
          companyName,
          tempPassword
        );

        await sendEmail(
          email,
          "Welcome to Complify Global Support - Your Portal Credentials",
          html
        );
      } catch (err) {
        console.error("Failed to send client welcome email:", err);
      }

      try {
        const admin = (req as any).user;
        await logAuditEvent(
          admin?.id || "ADMIN",
          admin?.fullName || "Administrator",
          "Client Creation",
          "Client",
          client.id,
          `Administrator ${admin?.fullName || "System"} created client ${client.companyName} (Contact: ${client.contactPerson}).`
        );
      } catch (logErr) {
        console.error("Failed to log audit event:", logErr);
      }

      res.status(201).json({
        success: true,
        client,
      });
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to create client.");
    }
  }
);

// PUT /api/clients/:id
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID format.",
        });
      }

      if (!isPlainObject(req.body)) {
        return res.status(400).json({
          success: false,
          message: "Invalid request body.",
        });
      }

      const allowed = filterAllowedFields<any>(req.body, [
        "companyName",
        "contactPerson",
        "email",
        "phoneNumber",
        "companyDomain",
        "city",
        "status",
      ]);

      const { companyName, contactPerson, email, phoneNumber, companyDomain, city, status } = allowed;

      if (companyName !== undefined && (!isString(companyName, 255) || !companyName.trim())) {
        return res.status(400).json({
          success: false,
          message: "Company name cannot be empty.",
        });
      }

      if (contactPerson !== undefined && (!isString(contactPerson, 255) || !contactPerson.trim())) {
        return res.status(400).json({
          success: false,
          message: "Contact person cannot be empty.",
        });
      }

      if (email !== undefined && !isEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address.",
        });
      }

      if (phoneNumber !== undefined && !isString(phoneNumber, 50)) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format.",
        });
      }

      if (
        status !== undefined &&
        !isEnum(status, ["Active", "Inactive", "Disabled", "Suspended", "Pending Activation"] as const)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid client status.",
        });
      }

      if (companyDomain !== undefined && !isString(companyDomain, 255)) {
        return res.status(400).json({
          success: false,
          message: "Invalid company domain format.",
        });
      }

      if (city !== undefined && !isString(city, 100)) {
        return res.status(400).json({
          success: false,
          message: "Invalid city format.",
        });
      }

      const client = await updateClient(req.params.id, allowed);

      try {
        const admin = (req as any).user;
        await logAuditEvent(
          admin?.id || "ADMIN",
          admin?.fullName || "Administrator",
          "Account Status Change",
          "Client",
          req.params.id,
          `Administrator ${admin?.fullName || "System"} updated client ${client.companyName || req.params.id}.`
        );
      } catch (logErr) {
        console.error("Failed to log audit event:", logErr);
      }

      res.json({
        success: true,
        client,
      });
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to update client.");
    }
  }
);

// DELETE /api/clients/:id
router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID format.",
        });
      }

      const admin = (req as any).user;
      await deleteClient(req.params.id);

      try {
        await logAuditEvent(
          admin?.id || "ADMIN",
          admin?.fullName || "Administrator",
          "Client Deletion",
          "Client",
          req.params.id,
          `Administrator ${admin?.fullName || "System"} deleted client ${req.params.id}.`
        );
      } catch (logErr) {
        console.error("Failed to log audit event:", logErr);
      }

      res.json({
        success: true,
        message: "Client deleted successfully.",
      });
    } catch (error) {
      return handleDatabaseError(error, res, "Failed to delete client.");
    }
  }
);

export default router;
