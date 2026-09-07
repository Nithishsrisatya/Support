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
// --- Import Email Services (Phase 8) ---
import { sendEmail } from "../services/emailService";
import { clientWelcomeTemplate } from "../templates/operationalEmails";
import { logAuditEvent } from "../services/auditLogService";

const router = Router();

// GET /api/clients
router.get("/",authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const clients = await getAllClients();
    res.json(clients);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch clients.",
    });
  }
});

// ============================================
// CHANGE PASSWORD
// Logged-in Client
// IMPORTANT: Must be before "/:id"
// ============================================
router.put(
  "/change-password",
  authenticateToken,
  async (req, res) => {
    try {
      const clientId = (req as any).user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required.",
        });
      }

      const result = await changeClientPassword(
        clientId,
        currentPassword,
        newPassword
      );

      // Audit log: Password Change (Client)
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

// GET /api/clients/me - Logged in client profile
// ⚠️ MUST be before GET /:id to avoid Express matching "me" as :id
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

// PUT /api/clients/me - Logged in client profile update (Self-service)
// ⚠️ MUST be before PUT /:id to avoid Express matching "me" as :id
router.put(
  "/me",
  authenticateToken,
  authorizeRoles([], true),
  async (req, res) => {
    try {
      const clientId = (req as any).user.id;
      const { companyName, companyDomain, contactPerson, email, phoneNumber, city } = req.body;

      const client = await updateClientProfile(clientId, {
        companyName,
        companyDomain,
        contactPerson,
        email,
        phoneNumber,
        city,
      });

      // Audit log: Client Profile Update
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
router.get("/:id", authenticateToken,
  authorizeRoles(["Administrator", "Manager"], true), async (req, res) => {
  try {
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
});

// POST /api/clients
router.post(
  "/",
  authenticateToken,
  authorizeRoles(["Administrator"]),
  async (req, res) => {
    try {
      // Generate temporary password
      const tempPassword = req.body.password || "TempAuth123!";

      // Hash password before saving
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      // Save client with hashed password
      const client = await createClient({
        ...req.body,
        passwordHash,
      });

      // Send welcome email
      try {
        const html = clientWelcomeTemplate(
          req.body.contactPerson,
          req.body.companyName,
          tempPassword
        );

        await sendEmail(
          req.body.email,
          "Welcome to Complify Global Support - Your Portal Credentials",
          html
        );
      } catch (err) {
        console.error("Failed to send client welcome email:", err);
      }

      // Audit log: Client Creation
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
      console.error(error);

      res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to create client.",
      });
    }
  }
);

// PUT /api/clients/:id
router.put("/:id",authenticateToken,
  authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const client = await updateClient(req.params.id, req.body);

    // Audit log: Client Update
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
    console.error(error);

    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to update client.",
    });
  }
});

// DELETE /api/clients/:id
router.delete("/:id",authenticateToken,
  authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    await deleteClient(req.params.id);

    // Audit log: Client Deletion
    try {
      const admin = (req as any).user;
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
    console.error(error);

    res.status(500).json({
      success: false,
      message: error instanceof Error
        ? error.message
        : "Failed to delete client.",
    });
  }
});

export default router;
