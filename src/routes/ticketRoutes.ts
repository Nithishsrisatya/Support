import { Router } from "express";
import {
  getAllTickets,
  getTicketById,
  createTicket,
  updateTicket,
  deleteTicket,
  searchTickets,
  reassignTicket,
  reopenTicket,
  isTerminalTicketStatus,
  isActiveTicketStatus,
  addTicketComment,
  getTicketComments,
  deleteTicketComment,
  addTicketAttachment,
  getTicketAttachments,
  getAttachmentById,
  deleteTicketAttachment,
  getTicketTimeline,
  getTicketDashboardStats,
  createTicketHistoryEntry,
} from "../services/ticketService";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import { sendEmail } from "../services/emailService";
import {
  ticketCreatedTemplate,
  ticketAssignedTemplate,
  ticketStatusChangedTemplate,
  ticketResolvedTemplate,
  ticketClosedTemplate,
  overdueTicketReminderTemplate,
  slaReminderTemplate,
} from "../templates/operationalEmails";
import { pool } from "../db";
import { upload, deleteFile, fileExists, resolveAttachmentFilePath } from "../services/fileUploadService";
import { logAuditEvent } from "../services/auditLogService";
import { uploadLimiter } from "../middleware/rateLimiter";
import path from "path";
import fs from "fs";

const router = Router();

// Helper for authorizing ticket access based on user role
async function authorizeTicketAccess(user: any, ticketId: string, { allowUnassignedManager = false } = {}) {
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return { canAccess: false, ticket: null, status: 404 };
  }

  const role = String(user?.role ?? "").trim();
  let canAccess = false;

  if (role === "Administrator") {
    canAccess = true;
  } else if (role === "Client") {
    canAccess = String(ticket.clientId ?? ticket.client_id) === String(user.id);
  } else if (role === "Employee") {
    canAccess = String(ticket.assignedTo) === String(user.id);
  } else if (role === "Manager") {
    const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
    const teamIds = teamResult.rows.map(r => r.id);
    teamIds.push(user.id); // Manager can access their own assigned tickets
    canAccess = teamIds.includes(ticket.assignedTo);
    if (allowUnassignedManager && ticket.assignedTo === null) {
      canAccess = true;
    }
  }

  if (!canAccess) {
    return { canAccess: false, ticket, status: 403 };
  }

  return { canAccess: true, ticket, status: 200 };
}


// ============================================================
// GET /api/tickets/search - Search & Filter Tickets (must be before /:id)
// ============================================================
router.get("/search", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();
    
    const filters: any = {
      search: req.query.q as string,
      status: req.query.status as string,
      priority: req.query.priority as string,
      category: req.query.category as string,
      assigned_to: req.query.assigned_to as string,
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

    // Clients can only search their own tickets
    if (role === "Client") {
      filters.clientId = user.id;
    } else if (role === "Employee") {
      filters.assigned_to = user.id;
    } else if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map(r => r.id);
      teamIds.push(user.id); // Include manager's own tickets
      // We'll pass an array to the search function, assuming it can handle it.
      // This is a conceptual change; searchTickets implementation may need adjustment.
      filters.assigned_to_in = teamIds;
    }

    const result = await searchTickets(filters);
    res.json(result);
  } catch (err) {
    console.error("Failed to search tickets:", err);
    res.status(500).json({ success: false, message: "Failed to search tickets." });
  }
});

// ============================================================
// GET /api/tickets/dashboard/stats - Dashboard Statistics
// ============================================================
router.get("/dashboard/stats", authenticateToken, 
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const stats = await getTicketDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error("Failed to fetch dashboard stats:", err);
    res.status(500).json({ success: false, message: "Failed to fetch dashboard stats." });
  }
});

// ============================================================
// GET /api/tickets - Staff can view all; Clients can view their own
// ============================================================
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();
    const allTickets = await getAllTickets();

    if (role === "Administrator") {
      return res.json(allTickets);
    }

    if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map(r => r.id);
      teamIds.push(user.id); // Manager can see their own tickets too
      const managerTickets = allTickets.filter(
        (t: any) => teamIds.includes(t.assignedTo) || t.assignedTo === null
      );
      return res.json(managerTickets);
    }

    if (role === "Employee") {
      const employeeTickets = allTickets.filter((t: any) => String(t.assignedTo) === String(user.id));
      return res.json(employeeTickets);
    }

    if (role === "Client") {
      const clientTickets = allTickets.filter((t: any) => String(t.clientId ?? t.client_id ?? t.clientid) === String(user.id));
      return res.json(clientTickets);
    }

    return res.status(403).json({ success: false, message: "Forbidden" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch tickets." });
  }
});

// ============================================================
// GET /api/tickets/:id - Staff and Clients (Clients can view their own tickets)
// ============================================================
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { canAccess, ticket, status } = await authorizeTicketAccess((req as any).user, req.params.id);

    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "You do not have permission to view this ticket." });

    res.json(ticket);
  } catch (error) {
    console.error("Failed to fetch ticket by ID:", error);
    res.status(500).json({ success: false, message: "Failed to fetch ticket." });
  }
});

// ============================================================
// GET /api/tickets/:id/timeline - Unified Activity Timeline
// ============================================================
router.get("/:id/timeline", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();
    const ticketId = req.params.id;

    const { canAccess, ticket, status } = await authorizeTicketAccess(user, ticketId);

    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const timeline = await getTicketTimeline(ticketId);
    // Filter out internal comments for clients
    const filtered = role === "Client" 
      ? timeline.filter((entry: any) => !entry.isInternal)
      : timeline;

    res.json(filtered);
  } catch (err) {
    console.error("Failed to fetch timeline:", err);
    res.status(500).json({ success: false, message: "Failed to fetch timeline." });
  }
});

// ============================================================
// POST /api/tickets/:id/reassign - Reassign ticket
// ============================================================
router.post("/:id/reassign", authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const user = (req as any).user;
    const { assigneeId } = req.body;

    const currentTicket = await getTicketById(req.params.id);
    if (!currentTicket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }

    if (isTerminalTicketStatus(currentTicket.status)) {
      return res.status(400).json({ success: false, message: "Closed tickets cannot be assigned." });
    }

    const ticket = await reassignTicket(req.params.id, assigneeId || null, user.fullName || "Administrator");

    // ✉️ Email: Notify new assignee
    if (assigneeId) {
      pool.query(
        `SELECT full_name AS "fullName", email FROM users WHERE id = $1`,
        [assigneeId]
      ).then(empRes => {
        if (empRes.rows.length > 0) {
          const emp = empRes.rows[0];
          const html = ticketAssignedTemplate(
            emp.fullName,
            req.params.id,
            ticket.subject,
            ticket.priority
          );
          sendEmail(emp.email, `Ticket Reassigned: ${ticket.subject}`, html);
        }
      }).catch(err => console.error("Reassign email failed:", err));
    }

res.json({ success: true, ticket });

    // Audit log: Ticket Reassignment (non-blocking)
    try {
      await logAuditEvent(
        user?.id || "SYSTEM",
        user?.fullName || "System",
        "Ticket Update",
        "Ticket",
        req.params.id,
        `${user?.fullName || "System"} reassigned ticket ${req.params.id} to ${assigneeId || "unassigned"}.`
      );
    } catch (logErr) {
      console.error("Failed to log audit event:", logErr);
    }
  } catch (error: any) {
    console.error("Failed to reassign ticket:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to reassign ticket." });
  }
});

// ============================================================
// POST /api/tickets - Admin and Clients
// ============================================================
router.post("/", authenticateToken, 
  authorizeRoles(["Administrator"], true), async (req, res) => {
  try {
    const ticket = await createTicket(req.body);

    // ✉️ Email trigger: Ticket Created (notify client)
    if (ticket && ticket.client_id) {
      pool.query(
        `SELECT contact_person AS "contactPerson", company_name AS "companyName", email FROM clients WHERE id = $1`,
        [ticket.client_id]
      ).then(clientRes => {
        if (clientRes.rows.length > 0) {
          const client = clientRes.rows[0];
          const html = ticketCreatedTemplate(
            client.contactPerson || client.contact_person,
            ticket.id,
            ticket.subject,
            client.companyName || client.company_name
          );
          sendEmail(client.email, `Ticket Created: ${ticket.subject}`, html);
        }
      }).catch(err => console.error("Ticket created email failed:", err));
    }

res.status(201).json({ success: true, ticket });

    // Audit log: Ticket Creation (non-blocking)
    try {
      const user = (req as any).user;
      await logAuditEvent(
        user?.id || "SYSTEM",
        user?.fullName || "System",
        "Ticket Creation",
        "Ticket",
        ticket.id,
        `${user?.fullName || "System"} created ticket ${ticket.id}: ${ticket.subject}`
      );
    } catch (logErr) {
      console.error("Failed to log audit event:", logErr);
    }
  } catch (error) {
    console.error("Failed to create ticket:", error);
    res.status(500).json({ success: false, message: "Failed to create ticket." });
  }
});

// ============================================================
// PUT /api/tickets/:id - Update ticket (with workflow validation)
// ============================================================
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    console.log("===== UPDATE TICKET =====");
    console.log(req.body);
    const user = (req as any).user;
    const ticketId = req.params.id;

    // Authorization check
    const { canAccess, ticket: oldTicket, status } = await authorizeTicketAccess(user, ticketId, { allowUnassignedManager: true });

    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "You do not have permission to update this ticket." });

    if (!oldTicket) return res.status(404).json({ success: false, message: "Ticket not found." }); // Should be caught by authorizeTicketAccess
    
    // Normalize field names for DB (camelCase -> snake_case)
    const dbUpdates: any = { ...req.body };
    if (dbUpdates.assignedTo !== undefined) {
      dbUpdates.assigned_to = dbUpdates.assignedTo;
      delete dbUpdates.assignedTo;
    }

    // Backend Security: Prevent assigning terminal tickets without reopening
    if (dbUpdates.assigned_to !== undefined) {
      if (isTerminalTicketStatus(oldTicket.status)) {
        const isReopening = req.body.status && isActiveTicketStatus(req.body.status);
        if (!isReopening) {
          return res.status(400).json({ success: false, message: "Closed tickets cannot be assigned." });
        }
      }
    }

    console.log("dbUpdates =", dbUpdates);
    if (dbUpdates.clientId !== undefined) {
      dbUpdates.client_id = dbUpdates.clientId;
      delete dbUpdates.clientId;
    }
    if (dbUpdates.resolutionSummary !== undefined) {
      dbUpdates.resolution_summary = dbUpdates.resolutionSummary;
      delete dbUpdates.resolutionSummary;
    }
    if (dbUpdates.satisfactionRating !== undefined) {
      dbUpdates.satisfaction_rating = dbUpdates.satisfactionRating;
      delete dbUpdates.satisfactionRating;
    }
    if (dbUpdates.employeeNotes !== undefined) {
      dbUpdates.employee_notes = dbUpdates.employeeNotes;
      delete dbUpdates.employeeNotes;
    }
    if (dbUpdates.dueDate !== undefined) {
      dbUpdates.due_date = dbUpdates.dueDate;
      delete dbUpdates.dueDate;
    }
    if (dbUpdates.completedAt !== undefined) {
      dbUpdates.completed_at = dbUpdates.completedAt;
      delete dbUpdates.completedAt;
    }

    const ticket = await updateTicket(ticketId, dbUpdates, user.fullName || "User");

    // ✉️ Email triggers based on what changed
    (async () => {
      try {
        // 1. Ticket Assigned to employee
        if (req.body.assignedTo && req.body.assignedTo !== (oldTicket?.assignedTo)) {
          pool.query(
            `SELECT full_name AS "fullName", email FROM users WHERE id = $1`,
            [req.body.assignedTo]
          ).then(empRes => {
            if (empRes.rows.length > 0) {
              const emp = empRes.rows[0];
              const html = ticketAssignedTemplate(
                emp.fullName,
                ticketId,
                ticket.subject || oldTicket?.subject,
                req.body.priority || oldTicket?.priority
              );
              sendEmail(emp.email, `New Ticket Assigned: ${ticket.subject || oldTicket?.subject}`, html);
            }
          }).catch(err => console.error("Ticket assigned email failed:", err));
        }

        // 2. Status changed → notify client
        if (req.body.status && req.body.status !== oldTicket?.status) {
          const newStatus = req.body.status;
          const oldStatus = oldTicket?.status;

          pool.query(
            `SELECT contact_person AS "contactPerson", company_name AS "companyName", email FROM clients WHERE id = $1`,
            [oldTicket?.clientId || oldTicket?.client_id]
          ).then(clientRes => {
            if (clientRes.rows.length > 0) {
              const client = clientRes.rows[0];

              if (newStatus === "Resolved") {
                const html = ticketResolvedTemplate(
                  client.contactPerson || client.contact_person,
                  ticketId,
                  ticket.subject || oldTicket?.subject,
                  req.body.resolutionSummary || req.body.resolution_summary || "Issue has been addressed."
                );
                sendEmail(client.email, `Ticket Resolved: ${ticket.subject || oldTicket?.subject}`, html);
              } else if (newStatus === "Closed") {
                const html = ticketClosedTemplate(
                  client.contactPerson || client.contact_person,
                  ticketId,
                  ticket.subject || oldTicket?.subject
                );
                sendEmail(client.email, `Ticket Closed: ${ticket.subject || oldTicket?.subject}`, html);
              } else {
                const html = ticketStatusChangedTemplate(
                  client.contactPerson || client.contact_person,
                  ticketId,
                  ticket.subject || oldTicket?.subject,
                  oldStatus || "Unknown",
                  newStatus
                );
                sendEmail(client.email, `Ticket Status Updated: ${ticket.subject || oldTicket?.subject}`, html);
              }
            }
          }).catch(err => console.error("Ticket status email failed:", err));
        }
      } catch (err) {
        console.error("Email trigger error:", err);
      }
    })();

res.json({ success: true, ticket });

    // Audit log: Ticket Update (non-blocking)
    (async () => {
      try {
        const user = (req as any).user;
        const statusChanged = req.body.status && req.body.status !== oldTicket?.status;
        const action = statusChanged ? "Ticket Update" : "Ticket Update";
        const desc = statusChanged
          ? `${user?.fullName || "System"} changed ticket ${ticketId} status from ${oldTicket?.status} to ${req.body.status}.`
          : `${user?.fullName || "System"} updated ticket ${ticketId}.`;
        await logAuditEvent(
          user?.id || "SYSTEM",
          user?.fullName || "System",
          action,
          "Ticket",
          ticketId,
          desc
        );
      } catch (logErr) {
        console.error("Failed to log audit event:", logErr);
      }
    })();
  } catch (error: any) {
    console.error("Failed to update ticket:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update ticket." });
  }
});

// ============================================================
// TICKET COMMENTS API
// ============================================================

// GET /api/tickets/:id/comments - Get ticket comments
router.get("/:id/comments", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    const { canAccess, ticket, status } = await authorizeTicketAccess(user, req.params.id);
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    // Staff can see internal notes, clients cannot
    const includeInternal = role !== "Client";
    const comments = await getTicketComments(req.params.id, includeInternal);
    res.json(comments);
  } catch (err) {
    console.error("Failed to fetch comments:", err);
    res.status(500).json({ success: false, message: "Failed to fetch comments." });
  }
});

// POST /api/tickets/:id/comments - Add a comment
router.post("/:id/comments", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const ticketId = req.params.id;
    const { content, isInternal } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Comment content is required." });
    }

    // Verify ticket access
    const { canAccess, ticket, status } = await authorizeTicketAccess(user, ticketId);
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const comment = await addTicketComment({
      ticketId,
      authorId: user.id,
      authorName: user.fullName || "Unknown",
      authorRole: user.role || "User",
      content: content.trim(),
      isInternal: isInternal === true,
    });

    if (ticket) {
      // Record in history
      await createTicketHistoryEntry({
        ticketId,
        status: ticket.status,
        updatedBy: user.fullName || "User",
        comment: `${isInternal ? "Internal note" : "Comment"} added: ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}`,
      });
    }

    res.status(201).json({ success: true, comment });
  } catch (err) {
    console.error("Failed to add comment:", err);
    res.status(500).json({ success: false, message: "Failed to add comment." });
  }
});

// DELETE /api/tickets/:id/comments/:commentId - Delete a comment
router.delete("/:id/comments/:commentId", authenticateToken, 
  authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    await deleteTicketComment(req.params.commentId);
    res.json({ success: true, message: "Comment deleted." });
  } catch (err) {
    console.error("Failed to delete comment:", err);
    res.status(500).json({ success: false, message: "Failed to delete comment." });
  }
});

// ============================================================
// TICKET ATTACHMENTS API
// ============================================================

// GET /api/tickets/:id/attachments - Get ticket attachments
router.get("/:id/attachments", authenticateToken, async (req, res) => {
  try {
    const { canAccess, status } = await authorizeTicketAccess((req as any).user, req.params.id);
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const ticketId = req.params.id;
    const attachments = await getTicketAttachments(ticketId);
    res.json(attachments);
  } catch (err) {
    console.error("Failed to fetch attachments:", err);
    res.status(500).json({ success: false, message: "Failed to fetch attachments." });
  }
});

// POST /api/tickets/:id/attachments - Upload attachment
router.post("/:id/attachments", uploadLimiter, authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const user = (req as any).user;
    const ticketId = req.params.id;

    const { canAccess, ticket, status } = await authorizeTicketAccess(user, ticketId);
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const attachment = await addTicketAttachment({
      ticketId,
      fileName: req.file.originalname,
      filePath: req.file.filename,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: user.id,
      uploadedByName: user.fullName || "Unknown",
    });

    // Record in history
    if (ticket) {
      await createTicketHistoryEntry({
        ticketId,
        status: ticket.status,
        updatedBy: user.fullName || "User",
        comment: `File attached: ${req.file.originalname}`,
      });
    }

    res.status(201).json({ success: true, attachment });
  } catch (err: any) {
    console.error("Failed to upload attachment:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to upload attachment." });
  }
});

// GET /api/tickets/:id/attachments/:attachmentId/preview - Preview attachment inline
router.get("/:id/attachments/:attachmentId/preview", authenticateToken, async (req, res) => {
  try {
    const { canAccess, status } = await authorizeTicketAccess((req as any).user, req.params.id);
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const attachment = await getAttachmentById(req.params.attachmentId);
    if (!attachment || attachment.ticketId !== req.params.id) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    const resolvedPath = resolveAttachmentFilePath(attachment.filePath);
    if (!resolvedPath) {
      return res.status(404).json({ success: false, message: "File not found on disk." });
    }

    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
    res.sendFile(resolvedPath);
  } catch (err) {
    console.error("Failed to preview attachment:", err);
    res.status(500).json({ success: false, message: "Failed to preview attachment." });
  }
});

// GET /api/tickets/:id/attachments/:attachmentId/download - Download attachment
router.get("/:id/attachments/:attachmentId/download", authenticateToken, async (req, res) => {
  try {
    const { canAccess, status } = await authorizeTicketAccess((req as any).user, req.params.id);
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const attachment = await getAttachmentById(req.params.attachmentId);
    if (!attachment || attachment.ticketId !== req.params.id) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    const resolvedPath = resolveAttachmentFilePath(attachment.filePath);
    if (!resolvedPath) {
      return res.status(404).json({ success: false, message: "File not found on disk." });
    }

    res.download(resolvedPath, attachment.fileName);
  } catch (err) {
    console.error("Failed to download attachment:", err);
    res.status(500).json({ success: false, message: "Failed to download attachment." });
  }
});

// DELETE /api/tickets/:id/attachments/:attachmentId - Delete attachment
router.delete("/:id/attachments/:attachmentId", authenticateToken,
  authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const attachment = await getAttachmentById(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ success: false, message: "Attachment not found." });

    // Delete file from disk
    deleteFile(attachment.filePath);
    
    // Delete from database
    await deleteTicketAttachment(req.params.attachmentId);

    res.json({ success: true, message: "Attachment deleted." });
  } catch (err) {
    console.error("Failed to delete attachment:", err);
    res.status(500).json({ success: false, message: "Failed to delete attachment." });
  }
});

// ============================================================
// POST /api/tickets/:id/reopen - Reopen a resolved/closed ticket
// ============================================================
router.post("/:id/reopen", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const ticketId = req.params.id;
    const role = String(user?.role ?? "").trim();

    // Role authorization check: Employees cannot reopen tickets
    if (role === "Employee") {
      return res.status(403).json({ success: false, message: "Employees are not authorized to reopen tickets." });
    }

    const { canAccess, ticket: oldTicket, status } = await authorizeTicketAccess(user, ticketId, { allowUnassignedManager: true });
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "You do not have permission to reopen this ticket." });

    if (!oldTicket || !isTerminalTicketStatus(oldTicket.status)) {
      return res.status(400).json({ success: false, message: "Only resolved or closed tickets can be reopened." });
    }

    const ticket = await reopenTicket(
      ticketId,
      user.fullName || "User",
      req.body.status,
      req.body.comment
    );

    // Audit log: Ticket Reopen (non-blocking)
    try {
      await logAuditEvent(
        user?.id || "SYSTEM",
        user?.fullName || "System",
        "Ticket Update",
        "Ticket",
        ticketId,
        `${user?.fullName || "System"} reopened ticket ${ticketId} (status: ${ticket.status}).`
      );
    } catch (logErr) {
      console.error("Failed to log audit event:", logErr);
    }

    res.json({ success: true, ticket });
  } catch (error: any) {
    console.error("Failed to reopen ticket:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to reopen ticket." });
  }
});

// ============================================================
// POST /api/tickets/:id/remind-overdue - Send overdue ticket reminder to assigned employee
// ============================================================
router.post("/:id/remind-overdue", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });

    if (isTerminalTicketStatus(ticket.status)) {
      return res.status(400).json({ success: false, message: "Cannot send reminders for completed or closed tickets." });
    }

    const assignedToId = ticket.assignedTo;
    if (!assignedToId) return res.status(400).json({ success: false, message: "Ticket is not assigned to anyone." });

    const daysOverdue = req.body.daysOverdue || 1;

    pool.query(
      `SELECT full_name AS "fullName", email FROM users WHERE id = $1`,
      [assignedToId]
    ).then(empRes => {
      if (empRes.rows.length > 0) {
        const emp = empRes.rows[0];
        const html = overdueTicketReminderTemplate(
          emp.fullName,
          ticket.id || req.params.id,
          ticket.subject,
          daysOverdue,
          ticket.priority
        );
        sendEmail(emp.email, `SLA Breach Alert: Ticket ${ticket.id || req.params.id} Overdue`, html);
      }
    }).catch(err => console.error("Overdue reminder email failed:", err));

    res.json({ success: true, message: "Overdue reminder email sent." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send reminder." });
  }
});

// POST /api/tickets/:id/remind-sla - Send SLA deadline reminder
router.post("/:id/remind-sla", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });

    if (isTerminalTicketStatus(ticket.status)) {
      return res.status(400).json({ success: false, message: "Cannot send reminders for completed or closed tickets." });
    }

    const assignedToId = ticket.assignedTo;
    if (!assignedToId) return res.status(400).json({ success: false, message: "Ticket is not assigned to anyone." });

    const slaDeadline = req.body.slaDeadline || new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // Default: 4 hours from now

    pool.query(
      `SELECT full_name AS "fullName", email FROM users WHERE id = $1`,
      [assignedToId]
    ).then(empRes => {
      if (empRes.rows.length > 0) {
        const emp = empRes.rows[0];
        const html = slaReminderTemplate(
          emp.fullName,
          ticket.id || req.params.id,
          ticket.subject,
          slaDeadline,
          ticket.priority
        );
        sendEmail(emp.email, `SLA Deadline Approaching: Ticket ${ticket.id || req.params.id}`, html);
      }
    }).catch(err => console.error("SLA reminder email failed:", err));

    res.json({ success: true, message: "SLA reminder email sent." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send SLA reminder." });
  }
});

// DELETE /api/tickets/:id - Admin Only
router.delete("/:id", authenticateToken, 
  authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const user = (req as any).user;
    const ticketId = req.params.id;
    // Fetch ticket first for audit description
    const ticketDel = await getTicketById(ticketId);
    await deleteTicket(ticketId);
    
    // Audit log: Ticket Deletion (non-blocking)
    try {
      await logAuditEvent(
        user?.id || "SYSTEM",
        user?.fullName || "System",
        "Ticket Deleted",
        "Ticket",
        ticketId,
        `${user?.fullName || "System"} deleted ticket ${ticketId}${ticketDel ? `: ${ticketDel.subject}` : ""}.`
      );
    } catch (logErr) {
      console.error("Failed to log audit event:", logErr);
    }
    
    res.json({ success: true, message: "Ticket deleted." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete ticket." });
  }
});

// ============================================================
// POST /api/tickets/bulk - Bulk Actions
// ============================================================
router.post("/bulk", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
    const { action, ids, payload } = req.body;
    const user = (req as any).user;

    if (!action || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: "Action and a non-empty array of IDs are required." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let result;
        let logAction = "Bulk Ticket Update";
        let logDescription = "";

        switch (action) {
            case 'assign':
                if (!payload || !payload.assigneeId) {
                    throw new Error("Assignee ID is required for 'assign' action.");
                }
                // Check if any of the target tickets are terminal (Resolved or Closed)
                const terminalCheck = await client.query(
                    `SELECT id, status FROM tickets WHERE id = ANY($1::text[]) AND status IN ('Resolved', 'Closed')`,
                    [ids]
                );
                if (terminalCheck.rows.length > 0) {
                    throw new Error("Closed tickets cannot be assigned.");
                }

                // When assigning, also update status from 'New' to 'Assigned'
                await client.query(
                    `UPDATE tickets SET status = 'Assigned', updated_date = NOW() WHERE id = ANY($1::text[]) AND status = 'New'`,
                    [ids]
                );
                result = await client.query(
                    `UPDATE tickets SET assigned_to = $1, updated_date = NOW() WHERE id = ANY($2::text[]) RETURNING id`,
                    [payload.assigneeId, ids]
                );
                logDescription = `${user.fullName} bulk-assigned ${result.rowCount} ticket(s) to employee ${payload.assigneeId}.`;
                break;

            case 'updateStatus':
                if (!payload || !payload.status) {
                    throw new Error("Status is required for 'updateStatus' action.");
                }
                result = await client.query(
                    `UPDATE tickets SET status = $1, updated_date = NOW() WHERE id = ANY($2::text[]) RETURNING id`,
                    [payload.status, ids]
                );
                logDescription = `${user.fullName} bulk-updated status of ${result.rowCount} ticket(s) to '${payload.status}'.`;
                break;

            case 'delete':
                if (user.role !== 'Administrator') {
                    throw new Error("Only Administrators can perform bulk delete.");
                }
                logAction = "Bulk Ticket Deletion";
                // Note: Assuming ON DELETE CASCADE is set for related tables like comments, history, attachments.
                result = await client.query(`DELETE FROM tickets WHERE id = ANY($1::text[]) RETURNING id`, [ids]);
                logDescription = `${user.fullName} bulk-deleted ${result.rowCount} ticket(s).`;
                break;

            default:
                throw new Error("Invalid bulk action specified.");
        }

        await logAuditEvent(user.id, user.fullName, logAction, "Ticket", `Multiple (${ids.length})`, logDescription);
        await client.query('COMMIT');
        res.json({ success: true, message: `Successfully performed '${action}' on ${result.rowCount} tickets.` });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Bulk ticket action failed:", error);
        res.status(500).json({ success: false, message: error.message || "Bulk operation failed." });
    } finally {
        client.release();
    }
});

export default router;
