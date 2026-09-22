import { Router } from "express";
import {
  getAllTickets,
  getTicketById,
  getTicketsForManager,
  getTicketsForEmployee,
  getTicketsForClient,
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
import {
  upload,
  createUploadMiddleware,
  deleteFile,
  fileExists,
  resolveAttachmentFilePath,
  validateFileContent,
  getSafeContentDisposition,
  isSafeInlinePreviewType,
} from "../services/fileUploadService";
import { logAuditEvent } from "../services/auditLogService";
import { uploadLimiter } from "../middleware/rateLimiter";
import path from "path";
import fs from "fs";
import {
  isPlainObject,
  isNonEmptyString,
  isString,
  isEnum,
  isNumber,
  isValidDateString,
  isStringArray,
  isValidId,
  sanitizePagination,
  sanitizeSearchQuery,
  filterAllowedFields,
  isValidDateRange,
} from "../utils/validator";
import { handleDatabaseError } from "../utils/dbErrorHandler";

const router = Router();

// Helper for authorizing ticket access based on user role
async function authorizeTicketAccess(user: any, ticketId: string, { allowUnassignedManager = false } = {}) {
  if (!isValidId(ticketId)) {
    return { canAccess: false, ticket: null, status: 400 };
  }
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

    if (req.query.status !== undefined && !isEnum(req.query.status, ["New", "Assigned", "In Progress", "Pending", "Resolved", "Closed"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid ticket status." });
    }
    if (req.query.priority !== undefined && !isEnum(req.query.priority, ["Low", "Medium", "High", "Critical"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid ticket priority." });
    }
    if (req.query.category !== undefined && !isEnum(req.query.category, ["Technical Issue", "Account Issue", "Billing Issue", "Service Request", "General Inquiry"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid ticket category." });
    }

    const assignedToRaw = (req.query.assignedTo || req.query.assigned_to) as string | undefined;
    if (assignedToRaw !== undefined && !isValidId(assignedToRaw)) {
      return res.status(400).json({ success: false, message: "Invalid assignedTo format." });
    }

    const fromDateRaw = req.query.fromDate as string | undefined;
    const toDateRaw = req.query.toDate as string | undefined;
    if (fromDateRaw !== undefined && !isValidDateString(fromDateRaw)) {
      return res.status(400).json({ success: false, message: "Invalid fromDate format." });
    }
    if (toDateRaw !== undefined && !isValidDateString(toDateRaw)) {
      return res.status(400).json({ success: false, message: "Invalid toDate format." });
    }
    if (fromDateRaw && toDateRaw) {
      const range = isValidDateRange(fromDateRaw, toDateRaw);
      if (!range.valid) {
        return res.status(400).json({ success: false, message: "fromDate must be earlier than or equal to toDate." });
      }
    }

    const { page, limit } = sanitizePagination(req.query.page, req.query.limit, 50, 100);
    const searchQuery = sanitizeSearchQuery(req.query.q, 200);

    const filters: any = {
      search: searchQuery || undefined,
      status: req.query.status as string,
      priority: req.query.priority as string,
      category: req.query.category as string,
      assignedTo: assignedToRaw,
      fromDate: fromDateRaw,
      toDate: toDateRaw,
      page,
      limit,
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
      filters.assignedTo = user.id;
    } else if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map(r => r.id);
      teamIds.push(user.id); // Include manager's own tickets
      filters.assignedToIn = teamIds;
      filters.includeUnassigned = true;
    }

    const result = await searchTickets(filters);
    res.json(result);
  } catch (err) {
    return handleDatabaseError(err, res, "Failed to search tickets.");
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

    if (role === "Administrator") {
      const allTickets = await getAllTickets();
      return res.json(allTickets);
    }

    if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map(r => r.id);
      teamIds.push(user.id); // Manager can see their own tickets too
      const managerTickets = await getTicketsForManager(teamIds, true);
      return res.json(managerTickets);
    }

    if (role === "Employee") {
      const employeeTickets = await getTicketsForEmployee(user.id);
      return res.json(employeeTickets);
    }

    if (role === "Client") {
      const clientTickets = await getTicketsForClient(user.id);
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
    const { canAccess, ticket, status } = await authorizeTicketAccess((req as any).user, req.params.id, { allowUnassignedManager: true });

    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "You do not have permission to view this ticket." });

    res.json(ticket);
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to fetch ticket.");
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

    const { canAccess, ticket, status } = await authorizeTicketAccess(user, ticketId, { allowUnassignedManager: true });

    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
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
    return handleDatabaseError(err, res, "Failed to fetch timeline.");
  }
});

// ============================================================
// POST /api/tickets/:id/reassign - Reassign ticket
// ============================================================
router.post("/:id/reassign", authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();
    const { assigneeId } = req.body;

    if (assigneeId !== undefined && assigneeId !== null && !isValidId(assigneeId)) {
      return res.status(400).json({ success: false, message: "Invalid assigneeId format." });
    }

    const { canAccess, ticket: currentTicket, status } = await authorizeTicketAccess(user, req.params.id, { allowUnassignedManager: true });
    if (status === 400) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    if (status === 404 || !currentTicket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }
    if (status === 403 || !canAccess) {
      return res.status(403).json({ success: false, message: "You do not have permission to reassign this ticket." });
    }

    if (isTerminalTicketStatus(currentTicket.status)) {
      return res.status(400).json({ success: false, message: "Closed tickets cannot be assigned." });
    }

    if (role === "Manager" && assigneeId) {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const allowedAssignees = teamResult.rows.map((r: any) => r.id);
      allowedAssignees.push(user.id);
      if (!allowedAssignees.includes(assigneeId)) {
        return res.status(403).json({
          success: false,
          message: "Managers can only assign tickets to supervised team members or themselves.",
        });
      }
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
    if (error?.message === "Closed tickets cannot be assigned.") {
      return res.status(400).json({ success: false, message: error.message });
    }
    return handleDatabaseError(error, res, "Failed to reassign ticket.");
  }
});

// ============================================================
// POST /api/tickets - Admin and Clients
// ============================================================
router.post("/", authenticateToken, 
  authorizeRoles(["Administrator"], true), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }

    const allowed = filterAllowedFields<any>(req.body, [
      "id",
      "subject",
      "description",
      "category",
      "priority",
      "dueDate",
      "assignedTo",
      "clientId",
    ]);

    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();
    if (role === "Client") {
      allowed.clientId = user.id;
    }

    const { id, subject, description, category, priority, dueDate, assignedTo, clientId } = allowed;

    if (id !== undefined && !isValidId(id)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }

    if (!isNonEmptyString(subject, 255)) {
      return res.status(400).json({ success: false, message: "Subject is required (max 255 characters)." });
    }

    if (!isNonEmptyString(description, 10000)) {
      return res.status(400).json({ success: false, message: "Description is required (max 10000 characters)." });
    }

    if (!isEnum(category, ["Technical Issue", "Account Issue", "Billing Issue", "Service Request", "General Inquiry"] as const)) {
      return res.status(400).json({ success: false, message: "Valid category is required." });
    }

    if (!isEnum(priority, ["Low", "Medium", "High", "Critical"] as const)) {
      return res.status(400).json({ success: false, message: "Valid priority is required." });
    }

    if (dueDate !== undefined && dueDate !== null && !isValidDateString(dueDate)) {
      return res.status(400).json({ success: false, message: "Invalid due date format." });
    }

    if (assignedTo !== undefined && assignedTo !== null && !isValidId(assignedTo)) {
      return res.status(400).json({ success: false, message: "Invalid assignedTo format." });
    }

    if (clientId !== undefined && clientId !== null && !isValidId(clientId)) {
      return res.status(400).json({ success: false, message: "Invalid clientId format." });
    }

    if (!allowed.id) {
      allowed.id = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    }
    if (!allowed.status) {
      allowed.status = "New";
    }

    const ticket = await createTicket(allowed);

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
    return handleDatabaseError(error, res, "Failed to create ticket.");
  }
});

// ============================================================
// PUT /api/tickets/:id - Update ticket (with workflow validation)
// ============================================================
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body.",
      });
    }

    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();
    const ticketId = req.params.id;
    if (!isValidId(ticketId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID format.",
      });
    }

    // 1. IDOR Prevention: Prevent body ID vs URL param mismatch
    if (req.body.id !== undefined && String(req.body.id) !== String(ticketId)) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID in request body does not match URL parameter.",
      });
    }

    // Input type validation for provided fields
    const rawRating = req.body.satisfactionRating !== undefined ? req.body.satisfactionRating : req.body.satisfaction_rating;
    if (rawRating !== undefined && !isNumber(rawRating, { min: 1, max: 5, integer: true })) {
      return res.status(400).json({
        success: false,
        message: "Satisfaction rating must be an integer between 1 and 5.",
      });
    }

    const rawDueDate = req.body.dueDate !== undefined ? req.body.dueDate : req.body.due_date;
    if (rawDueDate !== undefined && rawDueDate !== null && !isValidDateString(rawDueDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid due date format.",
      });
    }

    if (req.body.category !== undefined && !isEnum(req.body.category, ["Technical Issue", "Account Issue", "Billing Issue", "Service Request", "General Inquiry"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket category.",
      });
    }

    if (req.body.priority !== undefined && !isEnum(req.body.priority, ["Low", "Medium", "High", "Critical"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket priority.",
      });
    }

    if (req.body.status !== undefined && !isEnum(req.body.status, ["New", "Assigned", "In Progress", "Pending", "Resolved", "Closed"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket status.",
      });
    }

    if (req.body.subject !== undefined && (!isString(req.body.subject, 255) || !req.body.subject.trim())) {
      return res.status(400).json({
        success: false,
        message: "Subject cannot be empty (max 255 characters).",
      });
    }

    if (req.body.description !== undefined && (!isString(req.body.description, 10000) || !req.body.description.trim())) {
      return res.status(400).json({
        success: false,
        message: "Description cannot be empty (max 10000 characters).",
      });
    }

    const rawNotes = req.body.satisfactionNotes !== undefined ? req.body.satisfactionNotes : req.body.satisfaction_notes;
    if (rawNotes !== undefined && !isString(rawNotes, 2000)) {
      return res.status(400).json({
        success: false,
        message: "Satisfaction notes must be a string (max 2000 characters).",
      });
    }

    const rawEmployeeNotes = req.body.employeeNotes !== undefined ? req.body.employeeNotes : req.body.employee_notes;
    if (rawEmployeeNotes !== undefined && !isString(rawEmployeeNotes, 5000)) {
      return res.status(400).json({
        success: false,
        message: "Employee notes must be a string (max 5000 characters).",
      });
    }

    const rawResolution = req.body.resolutionSummary !== undefined ? req.body.resolutionSummary : req.body.resolution_summary;
    if (rawResolution !== undefined && !isString(rawResolution, 5000)) {
      return res.status(400).json({
        success: false,
        message: "Resolution summary must be a string (max 5000 characters).",
      });
    }

    const rawAssignedTo = req.body.assignedTo !== undefined ? req.body.assignedTo : req.body.assigned_to;
    if (rawAssignedTo !== undefined && rawAssignedTo !== null && !isValidId(rawAssignedTo)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignedTo format.",
      });
    }

    const rawClientId = req.body.clientId !== undefined ? req.body.clientId : req.body.client_id;
    if (rawClientId !== undefined && rawClientId !== null && !isValidId(rawClientId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid clientId format.",
      });
    }

    // 2. Authorization Check: Verify user has access to this ticket
    const { canAccess, ticket: oldTicket, status } = await authorizeTicketAccess(user, ticketId, { allowUnassignedManager: true });

    if (status === 400) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    if (status === 404 || !oldTicket) {
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }
    if (status === 403 || !canAccess) {
      return res.status(403).json({ success: false, message: "You do not have permission to update this ticket." });
    }

    // 3. Role-Based Field Update Authorization (comparing against existing record)

    // (a) Client ID / Ticket Ownership
    const requestedClientId = req.body.clientId !== undefined ? req.body.clientId : req.body.client_id;
    if (requestedClientId !== undefined && String(requestedClientId) !== String(oldTicket.clientId)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to change ticket ownership or client.",
      });
    }

    // (b) Assignment (assignedTo / assigned_to)
    const requestedAssignedTo = req.body.assignedTo !== undefined ? req.body.assignedTo : req.body.assigned_to;
    if (requestedAssignedTo !== undefined) {
      const normOldAssignee = oldTicket.assignedTo || null;
      const normNewAssignee = requestedAssignedTo || null;
      if (normOldAssignee !== normNewAssignee) {
        if (role === "Client") {
          return res.status(403).json({
            success: false,
            message: "Clients are not authorized to assign or reassign tickets.",
          });
        }
        if (role === "Employee") {
          return res.status(403).json({
            success: false,
            message: "Employees are not authorized to assign or reassign tickets.",
          });
        }
        if (role === "Manager") {
          const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
          const allowedAssignees = teamResult.rows.map((r: any) => r.id);
          allowedAssignees.push(user.id);
          if (normNewAssignee !== null && !allowedAssignees.includes(normNewAssignee)) {
            return res.status(403).json({
              success: false,
              message: "Managers can only assign tickets to supervised team members or themselves.",
            });
          }
        }
      }
    }

    // (c) Priority
    if (req.body.priority !== undefined && req.body.priority !== oldTicket.priority) {
      if (role === "Client") {
        return res.status(403).json({
          success: false,
          message: "Clients cannot modify ticket priority.",
        });
      }
      if (role === "Employee") {
        return res.status(403).json({
          success: false,
          message: "Employees cannot modify ticket priority.",
        });
      }
    }

    // (d) Due Date / SLA Deadline
    const requestedDueDate = req.body.dueDate !== undefined ? req.body.dueDate : req.body.due_date;
    if (requestedDueDate !== undefined) {
      const oldDue = oldTicket.dueDate ? new Date(oldTicket.dueDate).toISOString() : null;
      const newDue = requestedDueDate ? new Date(requestedDueDate).toISOString() : null;
      if (oldDue !== newDue) {
        if (role === "Client") {
          return res.status(403).json({
            success: false,
            message: "Clients cannot modify ticket due date.",
          });
        }
        if (role === "Employee") {
          return res.status(403).json({
            success: false,
            message: "Employees cannot modify ticket due date.",
          });
        }
      }
    }

    // (e) Satisfaction Rating & Notes
    const requestedRating = req.body.satisfactionRating !== undefined ? req.body.satisfactionRating : req.body.satisfaction_rating;
    if (requestedRating !== undefined && Number(requestedRating) !== Number(oldTicket.satisfactionRating)) {
      if (role === "Employee") {
        return res.status(403).json({
          success: false,
          message: "Employees cannot modify satisfaction rating.",
        });
      }
      if (role === "Manager") {
        return res.status(403).json({
          success: false,
          message: "Managers cannot modify satisfaction rating.",
        });
      }
      if (role === "Client") {
        if (oldTicket.status !== "Resolved" && req.body.status !== "Closed") {
          return res.status(400).json({
            success: false,
            message: "Satisfaction rating can only be provided when closing a resolved ticket.",
          });
        }
      }
    }

    // (f) Internal Employee Notes
    const requestedEmployeeNotes = req.body.employeeNotes !== undefined ? req.body.employeeNotes : req.body.employee_notes;
    if (requestedEmployeeNotes !== undefined && requestedEmployeeNotes !== oldTicket.employeeNotes) {
      if (role === "Client") {
        return res.status(403).json({
          success: false,
          message: "Clients cannot modify internal employee notes.",
        });
      }
    }

    // (g) Resolution Summary
    const requestedResolution = req.body.resolutionSummary !== undefined ? req.body.resolutionSummary : req.body.resolution_summary;
    if (requestedResolution !== undefined && requestedResolution !== oldTicket.resolutionSummary) {
      if (role === "Client") {
        return res.status(403).json({
          success: false,
          message: "Clients cannot modify resolution summary.",
        });
      }
    }

    // (h) Subject, Description, Category
    const subjectChanged = req.body.subject !== undefined && req.body.subject !== oldTicket.subject;
    const descChanged = req.body.description !== undefined && req.body.description !== oldTicket.description;
    const catChanged = req.body.category !== undefined && req.body.category !== oldTicket.category;
    if (subjectChanged || descChanged || catChanged) {
      if (role === "Client") {
        return res.status(403).json({
          success: false,
          message: "Clients cannot edit ticket subject, description, or category after creation.",
        });
      }
      if (role === "Employee") {
        return res.status(403).json({
          success: false,
          message: "Employees cannot modify ticket subject, description, or category.",
        });
      }
    }

    // (i) Status & Lifecycle Transitions
    if (req.body.status !== undefined && req.body.status !== oldTicket.status) {
      if (role === "Client") {
        // Clients can only confirm resolution by transitioning from Resolved -> Closed
        if (oldTicket.status !== "Resolved" || req.body.status !== "Closed") {
          return res.status(403).json({
            success: false,
            message: "Clients can only close tickets that are in Resolved status.",
          });
        }
      } else if (role === "Employee") {
        // Employees cannot close tickets directly (reserved for client confirmation or manager/admin)
        if (req.body.status === "Closed") {
          return res.status(403).json({
            success: false,
            message: "Employees cannot close tickets. Only clients or managers can confirm closure.",
          });
        }
        if (req.body.status === "New") {
          return res.status(403).json({
            success: false,
            message: "Employees cannot reset ticket status to New.",
          });
        }
        if (isTerminalTicketStatus(oldTicket.status)) {
          return res.status(403).json({
            success: false,
            message: "Employees cannot modify tickets in terminal status.",
          });
        }
      }
    }

    // Backend Security: Prevent assigning terminal tickets without reopening
    if (requestedAssignedTo !== undefined) {
      if (isTerminalTicketStatus(oldTicket.status)) {
        const isReopening = req.body.status && isActiveTicketStatus(req.body.status);
        if (!isReopening) {
          return res.status(400).json({ success: false, message: "Closed tickets cannot be assigned." });
        }
      }
    }

    // 4. Build sanitized updates for database (role-restricted field extraction)
    const dbUpdates: any = {};

    // Status (if changed or passed)
    if (req.body.status !== undefined) dbUpdates.status = req.body.status;

    if (role === "Client") {
      // Clients only update closure rating & notes
      if (requestedRating !== undefined) dbUpdates.satisfaction_rating = requestedRating;
      if (req.body.satisfactionNotes !== undefined || req.body.satisfaction_notes !== undefined) {
        dbUpdates.satisfaction_notes = req.body.satisfactionNotes || req.body.satisfaction_notes;
      }
    } else if (role === "Employee") {
      // Employees update status, resolution summary, employee notes
      if (requestedResolution !== undefined) dbUpdates.resolution_summary = requestedResolution;
      if (requestedEmployeeNotes !== undefined) dbUpdates.employee_notes = requestedEmployeeNotes;
    } else {
      // Manager and Administrator
      if (requestedAssignedTo !== undefined) dbUpdates.assigned_to = requestedAssignedTo;
      if (req.body.priority !== undefined) dbUpdates.priority = req.body.priority;
      if (requestedDueDate !== undefined) dbUpdates.due_date = requestedDueDate;
      if (requestedResolution !== undefined) dbUpdates.resolution_summary = requestedResolution;
      if (requestedEmployeeNotes !== undefined) dbUpdates.employee_notes = requestedEmployeeNotes;
      if (req.body.subject !== undefined) dbUpdates.subject = req.body.subject;
      if (req.body.description !== undefined) dbUpdates.description = req.body.description;
      if (req.body.category !== undefined) dbUpdates.category = req.body.category;
      if (req.body.completedAt !== undefined || req.body.completed_at !== undefined) {
        dbUpdates.completed_at = req.body.completedAt || req.body.completed_at;
      }
      if (role === "Administrator" && requestedClientId !== undefined) {
        dbUpdates.client_id = requestedClientId;
      }
      if (role === "Administrator" && requestedRating !== undefined) {
        dbUpdates.satisfaction_rating = requestedRating;
      }
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
    return handleDatabaseError(error, res, "Failed to update ticket.");
  }
});

// ============================================================
// TICKET COMMENTS API
// ============================================================

// GET /api/tickets/:id/comments - Get ticket comments
router.get("/:id/comments", authenticateToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    const { canAccess, ticket, status } = await authorizeTicketAccess(user, req.params.id, { allowUnassignedManager: true });
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    // Staff can see internal notes, clients cannot
    const includeInternal = role !== "Client";
    const comments = await getTicketComments(req.params.id, includeInternal);
    res.json(comments);
  } catch (err) {
    return handleDatabaseError(err, res, "Failed to fetch comments.");
  }
});

// POST /api/tickets/:id/comments - Add a comment
router.post("/:id/comments", authenticateToken, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const user = (req as any).user;
    const ticketId = req.params.id;
    if (!isValidId(ticketId)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    const { content, isInternal } = req.body;

    if (!isNonEmptyString(content, 5000)) {
      return res.status(400).json({ success: false, message: "Comment content is required (max 5000 characters)." });
    }

    if (isInternal !== undefined && typeof isInternal !== "boolean") {
      return res.status(400).json({ success: false, message: "isInternal must be a boolean." });
    }

    // Verify ticket access
    const { canAccess, ticket, status } = await authorizeTicketAccess(user, ticketId, { allowUnassignedManager: true });
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
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
    return handleDatabaseError(err, res, "Failed to add comment.");
  }
});

// DELETE /api/tickets/:id/comments/:commentId - Delete a comment
router.delete("/:id/comments/:commentId", authenticateToken, 
  authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.commentId)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }
    await deleteTicketComment(req.params.commentId);
    res.json({ success: true, message: "Comment deleted." });
  } catch (err) {
    return handleDatabaseError(err, res, "Failed to delete comment.");
  }
});

// ============================================================
// TICKET ATTACHMENTS API
// ============================================================

// GET /api/tickets/:id/attachments - Get ticket attachments
router.get("/:id/attachments", authenticateToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    const { canAccess, status } = await authorizeTicketAccess((req as any).user, req.params.id, { allowUnassignedManager: true });
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const ticketId = req.params.id;
    const attachments = await getTicketAttachments(ticketId);
    // Sanitize response to omit internal server storage filePath
    const safeAttachments = attachments.map((att: any) => ({
      id: att.id,
      ticketId: att.ticketId,
      fileName: att.fileName,
      fileSize: Number(att.fileSize),
      mimeType: att.mimeType,
      uploadedBy: att.uploadedBy,
      uploadedByName: att.uploadedByName,
      createdDate: att.createdDate,
    }));
    res.json(safeAttachments);
  } catch (err) {
    return handleDatabaseError(err, res, "Failed to fetch attachments.");
  }
});

// POST /api/tickets/:id/attachments - Upload attachment
router.post("/:id/attachments", uploadLimiter, authenticateToken, createUploadMiddleware("file"), async (req, res) => {
  try {
    const user = (req as any).user;
    const ticketId = req.params.id;
    if (!isValidId(ticketId)) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }

    const { canAccess, ticket, status } = await authorizeTicketAccess(user, ticketId, { allowUnassignedManager: true });
    if (status === 400) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    if (status === 404) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(404).json({ success: false, message: "Ticket not found." });
    }
    if (status === 403) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    // Magic-byte content validation
    const validation = await validateFileContent(req.file.path, req.file.originalname, req.file.mimetype);
    if (!validation.valid) {
      deleteFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: validation.reason || "Invalid file content.",
      });
    }

    let attachment;
    try {
      attachment = await addTicketAttachment({
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
    } catch (dbErr) {
      // Rollback: remove uploaded file from disk if database insertion failed
      deleteFile(req.file.path);
      throw dbErr;
    }

    res.status(201).json({
      success: true,
      attachment: {
        id: attachment.id,
        ticketId: attachment.ticketId,
        fileName: attachment.fileName,
        fileSize: Number(attachment.fileSize),
        mimeType: attachment.mimeType,
        uploadedBy: attachment.uploadedBy,
        uploadedByName: attachment.uploadedByName,
        createdDate: attachment.createdDate,
      },
    });
  } catch (err: any) {
    if (req.file?.path) deleteFile(req.file.path);
    return handleDatabaseError(err, res, "Failed to upload attachment.");
  }
});

// GET /api/tickets/:id/attachments/:attachmentId/preview - Preview attachment inline
router.get("/:id/attachments/:attachmentId/preview", authenticateToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.attachmentId)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }
    const { canAccess, status } = await authorizeTicketAccess((req as any).user, req.params.id, { allowUnassignedManager: true });
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
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

    // Security headers to prevent MIME sniffing and script execution
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

    const mime = attachment.mimeType || "application/octet-stream";
    if (isSafeInlinePreviewType(mime)) {
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", getSafeContentDisposition(attachment.fileName, "inline"));
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", getSafeContentDisposition(attachment.fileName, "attachment"));
    }

    res.sendFile(resolvedPath);
  } catch (err) {
    return handleDatabaseError(err, res, "Failed to preview attachment.");
  }
});

// GET /api/tickets/:id/attachments/:attachmentId/download - Download attachment
router.get("/:id/attachments/:attachmentId/download", authenticateToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.attachmentId)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }
    const { canAccess, status } = await authorizeTicketAccess((req as any).user, req.params.id, { allowUnassignedManager: true });
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
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

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Disposition", getSafeContentDisposition(attachment.fileName, "attachment"));

    res.download(resolvedPath, attachment.fileName);
  } catch (err) {
    return handleDatabaseError(err, res, "Failed to download attachment.");
  }
});

// DELETE /api/tickets/:id/attachments/:attachmentId - Delete attachment
router.delete("/:id/attachments/:attachmentId", authenticateToken, async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.attachmentId)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }
    const user = (req as any).user;
    const { canAccess, status } = await authorizeTicketAccess(user, req.params.id, { allowUnassignedManager: true });
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const attachment = await getAttachmentById(req.params.attachmentId);
    if (!attachment || attachment.ticketId !== req.params.id) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    // Role check: Administrator, Manager (within ticket team scope), or the user who uploaded the file
    const role = String(user?.role ?? "").trim();
    const isUploader = String(attachment.uploadedBy) === String(user.id);
    if (role !== "Administrator" && role !== "Manager" && !isUploader) {
      return res.status(403).json({ success: false, message: "Forbidden: You cannot delete this attachment." });
    }

    // Delete from database first, then delete file from disk
    await deleteTicketAttachment(req.params.attachmentId);
    deleteFile(attachment.filePath);

    res.json({ success: true, message: "Attachment deleted." });
  } catch (err) {
    return handleDatabaseError(err, res, "Failed to delete attachment.");
  }
});

// ============================================================
// POST /api/tickets/:id/reopen - Reopen a resolved/closed ticket
// ============================================================
router.post("/:id/reopen", authenticateToken, async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const user = (req as any).user;
    const ticketId = req.params.id;
    if (!isValidId(ticketId)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    const role = String(user?.role ?? "").trim();

    // Role authorization check: Employees cannot reopen tickets
    if (role === "Employee") {
      return res.status(403).json({ success: false, message: "Employees are not authorized to reopen tickets." });
    }

    if (req.body.status !== undefined && !isEnum(req.body.status, ["New", "Assigned", "In Progress", "Pending", "Resolved", "Closed"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid ticket status." });
    }

    if (req.body.comment !== undefined && (!isString(req.body.comment, 2000))) {
      return res.status(400).json({ success: false, message: "Comment must be a string (max 2000 characters)." });
    }

    const { canAccess, ticket: oldTicket, status } = await authorizeTicketAccess(user, ticketId, { allowUnassignedManager: true });
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
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
    return handleDatabaseError(error, res, "Failed to reopen ticket.");
  }
});

// ============================================================
// POST /api/tickets/:id/remind-overdue - Send overdue ticket reminder to assigned employee
// ============================================================
router.post("/:id/remind-overdue", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    const user = (req as any).user;
    const { canAccess, ticket, status } = await authorizeTicketAccess(user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    if (status === 404 || !ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403 || !canAccess) return res.status(403).json({ success: false, message: "Forbidden" });

    if (isTerminalTicketStatus(ticket.status)) {
      return res.status(400).json({ success: false, message: "Cannot send reminders for completed or closed tickets." });
    }

    const assignedToId = ticket.assignedTo;
    if (!assignedToId) return res.status(400).json({ success: false, message: "Ticket is not assigned to anyone." });

    if (req.body.daysOverdue !== undefined && !isNumber(req.body.daysOverdue, { min: 0 })) {
      return res.status(400).json({ success: false, message: "daysOverdue must be a non-negative number." });
    }

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
    return handleDatabaseError(error, res, "Failed to send reminder.");
  }
});

// POST /api/tickets/:id/remind-sla - Send SLA deadline reminder
router.post("/:id/remind-sla", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
    const user = (req as any).user;
    const { canAccess, ticket, status } = await authorizeTicketAccess(user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    if (status === 404 || !ticket) return res.status(404).json({ success: false, message: "Ticket not found." });
    if (status === 403 || !canAccess) return res.status(403).json({ success: false, message: "Forbidden" });

    if (isTerminalTicketStatus(ticket.status)) {
      return res.status(400).json({ success: false, message: "Cannot send reminders for completed or closed tickets." });
    }

    const assignedToId = ticket.assignedTo;
    if (!assignedToId) return res.status(400).json({ success: false, message: "Ticket is not assigned to anyone." });

    if (req.body.slaDeadline !== undefined && !isValidDateString(req.body.slaDeadline)) {
      return res.status(400).json({ success: false, message: "Invalid SLA deadline format." });
    }

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
    return handleDatabaseError(error, res, "Failed to send SLA reminder.");
  }
});

// DELETE /api/tickets/:id - Admin Only
router.delete("/:id", authenticateToken, 
  authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const user = (req as any).user;
    const ticketId = req.params.id;
    if (!isValidId(ticketId)) {
      return res.status(400).json({ success: false, message: "Invalid ticket ID format." });
    }
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
    return handleDatabaseError(error, res, "Failed to delete ticket.");
  }
});

// ============================================================
// POST /api/tickets/bulk - Bulk Actions
// ============================================================
router.post("/bulk", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
    if (!isPlainObject(req.body)) {
        return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const { action, ids, payload } = req.body;
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    if (!isNonEmptyString(action, 50) || !isStringArray(ids, { minItems: 1 })) {
        return res.status(400).json({ success: false, message: "Action and a non-empty array of IDs are required." });
    }

    if (ids.length > 100 || !ids.every((id: string) => isValidId(id))) {
        return res.status(400).json({ success: false, message: "Invalid IDs in bulk request (max 100 valid IDs)." });
    }

    if (payload !== undefined && !isPlainObject(payload)) {
        return res.status(400).json({ success: false, message: "Payload must be an object." });
    }

    if (action === 'assign' && payload?.assigneeId && !isValidId(payload.assigneeId)) {
        return res.status(400).json({ success: false, message: "Invalid assignee ID format." });
    }

    if (action === 'updateStatus' && payload?.status && !isEnum(payload.status, ["New", "Assigned", "In Progress", "Pending", "Resolved", "Closed"] as const)) {
        return res.status(400).json({ success: false, message: "Invalid ticket status." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (role === "Manager") {
            const teamResult = await client.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
            const teamIds = teamResult.rows.map((r: any) => r.id);
            teamIds.push(user.id);

            const scopeCheck = await client.query(
                `SELECT id FROM tickets WHERE id = ANY($1::text[]) AND (assigned_to = ANY($2::varchar[]) OR assigned_to IS NULL)`,
                [ids, teamIds]
            );
            if (scopeCheck.rows.length !== ids.length) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    success: false,
                    message: "One or more tickets are outside your authorized team scope.",
                });
            }

            if (action === 'assign') {
                if (!payload || !payload.assigneeId || !teamIds.includes(payload.assigneeId)) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({
                        success: false,
                        message: "Managers can only assign tickets to supervised team members or themselves.",
                    });
                }
            }
        }
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
        if (error?.message === "Closed tickets cannot be assigned." || error?.message === "Invalid bulk action specified." || error?.message?.includes("is required for")) {
            return res.status(400).json({ success: false, message: error.message });
        }
        return handleDatabaseError(error, res, "Bulk operation failed.");
    } finally {
        client.release();
    }
});

export default router;
