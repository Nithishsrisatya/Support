import { pool } from "../db";
import { createNotification } from "./notificationService";
import { randomUUID } from "crypto";

// ============================================================
// TICKET LIFECYCLE & VALID WORKFLOW TRANSITIONS
// ============================================================
export const TERMINAL_TICKET_STATUSES = ["Resolved", "Closed"] as const;
export const ACTIVE_TICKET_STATUSES = ["New", "Assigned", "In Progress", "Pending"] as const;

export function isTerminalTicketStatus(status: string): boolean {
  return TERMINAL_TICKET_STATUSES.includes(status as any);
}

export function isActiveTicketStatus(status: string): boolean {
  return ACTIVE_TICKET_STATUSES.includes(status as any);
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  "New": ["Assigned", "Closed"],
  "Assigned": ["In Progress", "Pending", "Resolved", "Closed"],
  "In Progress": ["Pending", "Resolved", "Closed"],
  "Pending": ["In Progress", "Resolved", "Closed"],
  "Resolved": ["Closed", "In Progress", "Assigned"],
  "Closed": ["In Progress", "Assigned", "New"],
};

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ============================================================
// GET ALL TICKETS
// ============================================================
export async function getAllTickets() {
  const result = await pool.query(`
SELECT 
      t.id,
      t.subject,
      t.description,
      t.category,
      t.priority,
      t.status,
      t.assigned_to AS "assignedTo",
      t.client_id AS "clientId",
      t.created_date AS "createdDate",
      t.updated_date AS "updatedDate",
      t.due_date AS "dueDate",
      t.completed_at AS "completedAt",
      t.resolution_summary AS "resolutionSummary",
      t.resolution_date AS "resolutionDate",
      t.employee_notes AS "employeeNotes",
      t.satisfaction_rating AS "satisfactionRating",
      t.satisfaction_notes AS "satisfactionNotes",
      CASE WHEN t.due_date IS NOT NULL AND t.status NOT IN ('Resolved', 'Closed') AND t.due_date < NOW() THEN true ELSE false END AS "isOverdue",
      json_agg(json_build_object(
        'timestamp', th.timestamp,
        'status', th.status,
        'updatedBy', th.updated_by,
        'comment', th.comment
      )) AS history
    FROM tickets t
    LEFT JOIN ticket_history th ON t.id = th.ticket_id
    GROUP BY t.id
    ORDER BY t.created_date DESC
  `);
  return result.rows;
}

// ============================================================
// GET TICKET BY ID
// ============================================================
export async function getTicketById(id: string) {
  const tickets = await getAllTickets();
  return tickets.find(ticket => ticket.id === id) || null;
}

// ============================================================
// GET TICKET BY ID - DIRECT QUERY
// ============================================================
export async function getTicketByIdDirect(id: string) {
  const result = await pool.query(
    `SELECT * FROM tickets WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// ============================================================
// SEARCH / FILTER TICKETS
// ============================================================
export async function searchTickets(filters: {
  search?: string;
  status?: string;
  priority?: string;
  category?: string;
  assignedTo?: string;
  clientId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}) {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.search) {
    conditions.push(`(t.subject ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }
  if (filters.status) {
    conditions.push(`t.status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }
  if (filters.priority) {
    conditions.push(`t.priority = $${paramIndex}`);
    params.push(filters.priority);
    paramIndex++;
  }
  if (filters.category) {
    conditions.push(`t.category = $${paramIndex}`);
    params.push(filters.category);
    paramIndex++;
  }
  if (filters.assignedTo) {
    conditions.push(`t.assigned_to = $${paramIndex}`);
    params.push(filters.assignedTo);
    paramIndex++;
  }
  if (filters.clientId) {
    conditions.push(`t.client_id = $${paramIndex}`);
    params.push(filters.clientId);
    paramIndex++;
  }
  if (filters.fromDate) {
    conditions.push(`t.created_date >= $${paramIndex}`);
    params.push(filters.fromDate);
    paramIndex++;
  }
  if (filters.toDate) {
    conditions.push(`t.created_date <= $${paramIndex}`);
    params.push(filters.toDate);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  const countResult = await pool.query(`
    SELECT COUNT(*) FROM tickets t ${whereClause}
  `, params);

  const totalCount = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(`
    SELECT 
      t.id,
      t.subject,
      t.description,
      t.category,
      t.priority,
      t.status,
      t.assigned_to AS "assignedTo",
      t.client_id AS "clientId",
      t.due_date AS "dueDate",
      t.completed_at AS "completedAt",
      t.created_date AS "createdDate",
      t.updated_date AS "updatedDate",
      t.resolution_summary AS "resolutionSummary",
      t.resolution_date AS "resolutionDate",
      t.employee_notes AS "employeeNotes",
      t.satisfaction_rating AS "satisfactionRating",
      t.satisfaction_notes AS "satisfactionNotes",
      CASE WHEN t.due_date IS NOT NULL AND t.status NOT IN ('Resolved', 'Closed') AND t.due_date < NOW() THEN true ELSE false END AS "isOverdue",
      json_agg(json_build_object(
        'timestamp', th.timestamp,
        'status', th.status,
        'updatedBy', th.updated_by,
        'comment', th.comment
      )) AS history
    FROM tickets t
    LEFT JOIN ticket_history th ON t.id = th.ticket_id
    ${whereClause}
    GROUP BY t.id
    ORDER BY t.created_date DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, limit, offset]);

  return {
    tickets: result.rows,
    total: totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
  };
}

// ============================================================
// CREATE TICKET
// ============================================================
export async function createTicket(ticket: any) {
  const result = await pool.query(
    `
    INSERT INTO tickets (
      id,
      subject,
      description,
      category,
      priority,
      status,
      assigned_to,
      client_id,
      due_date,
      created_date,
      updated_date
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    RETURNING *
    `,
    [
      ticket.id,
      ticket.subject,
      ticket.description,
      ticket.category,
      ticket.priority,
      ticket.status || "New",
      ticket.assignedTo || null,
      ticket.clientId,
      ticket.dueDate || null,
    ]
  );

  // Record initial history entry
  await createTicketHistoryEntry({
    ticketId: ticket.id,
    status: ticket.status || "New",
    updatedBy: ticket.createdBy || "System",
    comment: "Ticket created.",
  });

  return result.rows[0];
}

// ============================================================
// UPDATE TICKET (with workflow validation)
// ============================================================
export async function updateTicket(id: string, updates: any, changedBy: string = "System") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const oldTicket = await client.query(
      `SELECT * FROM tickets WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (oldTicket.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    const oldStatus = oldTicket.rows[0].status;
    const newStatus = updates.status || oldStatus;

    // Validate workflow transition
    if (updates.status && updates.status !== oldStatus) {
      if (!isValidTransition(oldStatus, updates.status)) {
        throw new Error(`Invalid status transition: ${oldStatus} → ${updates.status}`);
      }
    }

    // Prevent assigning/reassigning terminal tickets without reopening to an active status
    if (isTerminalTicketStatus(oldStatus)) {
      const isReopeningToActive = updates.status && isActiveTicketStatus(updates.status);
      if (updates.assigned_to !== undefined && !isReopeningToActive) {
        throw new Error("Closed tickets cannot be assigned.");
      }
    }

    const mergedTicket = { ...oldTicket.rows[0], ...updates };

    console.log("Merged Ticket:", mergedTicket);
    console.log("assigned_to:", mergedTicket.assigned_to);

// Auto-set completed_at when status changes to Resolved or Closed
    const isCompleting = (updates.status === "Resolved" || updates.status === "Closed") && oldStatus !== "Resolved" && oldStatus !== "Closed";
    const isReopening = (oldStatus === "Resolved" || oldStatus === "Closed") && updates.status && !["Resolved", "Closed"].includes(updates.status);

    const result = await client.query(
      `
      UPDATE tickets
      SET
        subject = $1,
        description = $2,
        category = $3,
        priority = $4,
        status = $5,
        assigned_to = $6,
        client_id = $7,
        due_date = $8,
        resolution_summary = $9,
        satisfaction_rating = $10,
        employee_notes = $11,
        completed_at = $12,
        updated_date = NOW()
      WHERE id = $13
      RETURNING *
      `,
      [
        mergedTicket.subject,
        mergedTicket.description,
        mergedTicket.category,
        mergedTicket.priority,
        mergedTicket.status,
        mergedTicket.assigned_to,
        mergedTicket.client_id,
        updates.due_date || oldTicket.rows[0].due_date || null,
        mergedTicket.resolution_summary,
        mergedTicket.satisfaction_rating,
        mergedTicket.employee_notes,
        isCompleting ? new Date().toISOString() : (isReopening ? null : oldTicket.rows[0].completed_at || null),
        id,
      ]
    );

    const updatedTicket = result.rows[0];

    // Clear deadline notifications if reopened or due date modified
    if (isReopening || (updates.due_date && updates.due_date !== oldTicket.rows[0].due_date)) {
      await client.query(
        `DELETE FROM deadline_notifications WHERE item_type = 'Ticket' AND item_id = $1`,
        [id]
      );
    }

    // Auto-record history for status changesd
    if (updates.status && updates.status !== oldStatus) {
      await createTicketHistoryEntry(
        {
          ticketId: id,
          status: updates.status,
          updatedBy: changedBy,
          comment: updates.comment || `Status changed from ${oldStatus} to ${updates.status}`,
        },
        client
      );
    }

    // Record history entry if assigned_to changed
    if (updates.assigned_to && updates.assigned_to !== oldTicket.rows[0].assigned_to) {
      await createTicketHistoryEntry(
        {
          ticketId: id,
          status: mergedTicket.status,
          updatedBy: changedBy,
          comment: `Ticket reassigned to user ${updates.assigned_to}`,
        },
        client
      );
    }

    // Record history entry if priority changed
    if (updates.priority && updates.priority !== oldTicket.rows[0].priority) {
      await createTicketHistoryEntry(
        {
          ticketId: id,
          status: mergedTicket.status,
          updatedBy: changedBy,
          comment: `Priority changed from ${oldTicket.rows[0].priority} to ${updates.priority}`,
        },
        client
      );
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// REASSIGN TICKET (with dedicated history entry)
// ============================================================
export async function reassignTicket(id: string, newAssigneeId: string | null, reassignedBy: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const oldTicket = await client.query(
      `SELECT * FROM tickets WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (oldTicket.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    const oldStatus = oldTicket.rows[0].status;
    if (isTerminalTicketStatus(oldStatus)) {
      throw new Error("Closed tickets cannot be assigned.");
    }

    const oldAssignee = oldTicket.rows[0].assigned_to;
    const newStatus = newAssigneeId ? "Assigned" : oldTicket.rows[0].status;

    const result = await client.query(
      `
      UPDATE tickets
      SET assigned_to = $1, status = $2, updated_date = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [newAssigneeId, newStatus, id]
    );

    // Record reassignment in history
    const comment = oldAssignee
      ? `Reassigned from user ${oldAssignee} to ${newAssigneeId || "unassigned"} by ${reassignedBy}`
      : `Assigned to user ${newAssigneeId} by ${reassignedBy}`;

    await createTicketHistoryEntry(
      {
        ticketId: id,
        status: newStatus,
        updatedBy: reassignedBy,
        comment,
      },
      client
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// REOPEN TICKET (Transition terminal ticket back to active status)
// ============================================================
export async function reopenTicket(
  id: string,
  reopenedBy: string,
  targetStatus?: string,
  comment?: string
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const oldTicket = await client.query(
      `SELECT * FROM tickets WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (oldTicket.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    const oldStatus = oldTicket.rows[0].status;
    if (!isTerminalTicketStatus(oldStatus)) {
      throw new Error("Ticket is already active.");
    }

    // Determine target active status
    let newStatus: string;
    if (targetStatus && isActiveTicketStatus(targetStatus)) {
      newStatus = targetStatus;
    } else {
      newStatus = oldTicket.rows[0].assigned_to ? "Assigned" : "New";
    }

    const result = await client.query(
      `
      UPDATE tickets
      SET
        status = $1,
        completed_at = NULL,
        updated_date = NOW()
      WHERE id = $2
      RETURNING *
      `,
      [newStatus, id]
    );

    const reopenComment = comment || `Ticket reopened from ${oldStatus} to ${newStatus} by ${reopenedBy}`;

    await createTicketHistoryEntry(
      {
        ticketId: id,
        status: newStatus,
        updatedBy: reopenedBy,
        comment: reopenComment,
      },
      client
    );

    // Reset deadline notifications for reopened ticket
    await client.query(
      `DELETE FROM deadline_notifications WHERE item_type = 'Ticket' AND item_id = $1`,
      [id]
    );

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// DELETE TICKET
// ============================================================
export async function deleteTicket(id: string) {
  await pool.query(`DELETE FROM tickets WHERE id = $1`, [id]);
}

// ============================================================
// TICKET HISTORY
// ============================================================
export async function createTicketHistoryEntry(
  entry: {
    ticketId: string;
    status: string;
    updatedBy: string;
    comment: string;
  },
  client?: any
) {
  const query = `
    INSERT INTO ticket_history (ticket_id, timestamp, status, updated_by, comment)
    VALUES ($1, NOW(), $2, $3, $4)
  `;
  const params = [entry.ticketId, entry.status, entry.updatedBy, entry.comment];

  if (client) {
    // Use the transaction client when called from within a transaction
    await client.query(query, params);
  } else {
    // Use the pool when called outside a transaction
    await pool.query(query, params);
  }
}

export async function getTicketHistory(ticketId: string) {
  const result = await pool.query(
    `
    SELECT timestamp, status, updated_by AS "updatedBy", comment
    FROM ticket_history
    WHERE ticket_id = $1
    ORDER BY timestamp ASC
    `,
    [ticketId]
  );
  return result.rows;
}

// ============================================================
// TICKET COMMENTS
// ============================================================
export async function addTicketComment(comment: {
  ticketId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  isInternal: boolean;
}) {
  const result = await pool.query(
    `
    INSERT INTO ticket_comments (ticket_id, author_id, author_name, author_role, content, is_internal, created_date)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id, ticket_id AS "ticketId", author_id AS "authorId", author_name AS "authorName",
              author_role AS "authorRole", content, is_internal AS "isInternal", created_date AS "createdDate"
    `,
    [comment.ticketId, comment.authorId, comment.authorName, comment.authorRole, comment.content, comment.isInternal]
  );
  return result.rows[0];
}

export async function getTicketComments(ticketId: string, includeInternal: boolean = false) {
  let query = `
    SELECT id, ticket_id AS "ticketId", author_id AS "authorId", author_name AS "authorName",
           author_role AS "authorRole", content, is_internal AS "isInternal", created_date AS "createdDate"
    FROM ticket_comments
    WHERE ticket_id = $1
  `;
  if (!includeInternal) {
    query += ` AND is_internal = false`;
  }
  query += ` ORDER BY created_date ASC`;

  const result = await pool.query(query, [ticketId]);
  return result.rows;
}

export async function deleteTicketComment(commentId: string) {
  await pool.query(`DELETE FROM ticket_comments WHERE id = $1`, [commentId]);
}

// ============================================================
// TICKET ATTACHMENTS
// ============================================================
export async function addTicketAttachment(attachment: {
  ticketId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByName: string;
}) {
  const result = await pool.query(
    `
    INSERT INTO ticket_attachments (ticket_id, file_name, file_path, file_size, mime_type, uploaded_by, uploaded_by_name, created_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id, ticket_id AS "ticketId", file_name AS "fileName", file_path AS "filePath",
              file_size AS "fileSize", mime_type AS "mimeType", uploaded_by AS "uploadedBy",
              uploaded_by_name AS "uploadedByName", created_date AS "createdDate"
    `,
    [attachment.ticketId, attachment.fileName, attachment.filePath, attachment.fileSize, attachment.mimeType, attachment.uploadedBy, attachment.uploadedByName]
  );
  return result.rows[0];
}

export async function getTicketAttachments(ticketId: string) {
  const result = await pool.query(
    `
    SELECT id, ticket_id AS "ticketId", file_name AS "fileName", file_path AS "filePath",
           file_size AS "fileSize", mime_type AS "mimeType", uploaded_by AS "uploadedBy",
           uploaded_by_name AS "uploadedByName", created_date AS "createdDate"
    FROM ticket_attachments
    WHERE ticket_id = $1
    ORDER BY created_date DESC
    `,
    [ticketId]
  );
  return result.rows;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAttachmentById(attachmentId: string) {
  if (!attachmentId || !UUID_REGEX.test(attachmentId)) {
    return null;
  }
  const result = await pool.query(
    `
    SELECT id, ticket_id AS "ticketId", file_name AS "fileName", file_path AS "filePath",
           file_size AS "fileSize", mime_type AS "mimeType", uploaded_by AS "uploadedBy",
           uploaded_by_name AS "uploadedByName", created_date AS "createdDate"
    FROM ticket_attachments
    WHERE id = $1
    `,
    [attachmentId]
  );
  return result.rows[0] || null;
}

export async function deleteTicketAttachment(attachmentId: string) {
  if (!attachmentId || !UUID_REGEX.test(attachmentId)) {
    return;
  }
  await pool.query(`DELETE FROM ticket_attachments WHERE id = $1`, [attachmentId]);
}

// ============================================================
// UNIFIED TIMELINE
// ============================================================
export async function getTicketTimeline(ticketId: string) {
  // Get history entries
  const historyResult = await pool.query(
    `SELECT timestamp, status AS "type", updated_by AS "user", comment AS "description", 'history' AS "entryType" FROM ticket_history WHERE ticket_id = $1`,
    [ticketId]
  );

  // Get comments
  const commentsResult = await pool.query(
    `SELECT created_date AS "timestamp", author_name AS "user", content AS "description", 'comment' AS "entryType", is_internal AS "isInternal" FROM ticket_comments WHERE ticket_id = $1`,
    [ticketId]
  );

  // Get attachments
  const attachmentsResult = await pool.query(
    `SELECT created_date AS "timestamp", uploaded_by_name AS "user", file_name AS "description", 'attachment' AS "entryType" FROM ticket_attachments WHERE ticket_id = $1`,
    [ticketId]
  );

  // Combine and sort by timestamp
  const timeline = [
    ...historyResult.rows.map((r: any) => ({ ...r, isInternal: false })),
    ...commentsResult.rows.map((r: any) => ({ ...r })),
    ...attachmentsResult.rows.map((r: any) => ({ ...r, isInternal: false })),
  ].sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return timeline;
}

// ============================================================
// DASHBOARD STATS
// ============================================================
export async function getTicketDashboardStats() {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'New') AS "new",
      COUNT(*) FILTER (WHERE status = 'Assigned') AS "assigned",
      COUNT(*) FILTER (WHERE status = 'In Progress') AS "inProgress",
      COUNT(*) FILTER (WHERE status = 'Pending') AS "pending",
      COUNT(*) FILTER (WHERE status = 'Resolved') AS "resolved",
      COUNT(*) FILTER (WHERE status = 'Closed') AS "closed",
      COUNT(*) FILTER (WHERE status NOT IN ('Closed', 'Resolved')) AS "open",
      COUNT(*) AS "total",
      ROUND(AVG(satisfaction_rating) FILTER (WHERE satisfaction_rating IS NOT NULL), 1) AS "avgSatisfaction",
      COUNT(*) FILTER (WHERE priority = 'Critical' AND status NOT IN ('Closed', 'Resolved')) AS "criticalOpen",
      COUNT(*) FILTER (WHERE priority = 'High' AND status NOT IN ('Closed', 'Resolved')) AS "highOpen",
      COUNT(*) FILTER (WHERE priority = 'Medium' AND status NOT IN ('Closed', 'Resolved')) AS "mediumOpen",
      COUNT(*) FILTER (WHERE priority = 'Low' AND status NOT IN ('Closed', 'Resolved')) AS "lowOpen",
      -- Phase 1: Deadline Management cards
      COUNT(*) FILTER (WHERE due_date IS NOT NULL AND status NOT IN ('Resolved', 'Closed') AND due_date < NOW()) AS "overdue",
      COUNT(*) FILTER (WHERE due_date::date = NOW()::date AND status NOT IN ('Resolved', 'Closed')) AS "dueToday",
      COUNT(*) FILTER (WHERE due_date IS NOT NULL AND status NOT IN ('Resolved', 'Closed')
        AND due_date >= NOW() AND due_date <= NOW() + INTERVAL '7 days') AS "dueThisWeek",
      COUNT(*) FILTER (WHERE completed_at::date = NOW()::date) AS "completedToday"
    FROM tickets
  `);

  // Tickets by employee (assigned tickets grouped)
  const byEmployee = await pool.query(`
    SELECT 
      assigned_to AS "assignedTo",
      u.full_name AS "employeeName",
      COUNT(*) AS "total",
      COUNT(*) FILTER (WHERE t.status NOT IN ('Closed', 'Resolved')) AS "open",
      COUNT(*) FILTER (WHERE t.status IN ('Resolved', 'Closed')) AS "closed"
    FROM tickets t
    LEFT JOIN users u ON t.assigned_to = u.id
    WHERE t.assigned_to IS NOT NULL
    GROUP BY t.assigned_to, u.full_name
    ORDER BY "total" DESC
  `);

  // Tickets by client
  const byClient = await pool.query(`
    SELECT 
      t.client_id AS "clientId",
      c.company_name AS "companyName",
      COUNT(*) AS "total",
      COUNT(*) FILTER (WHERE t.status NOT IN ('Closed', 'Resolved')) AS "open",
      COUNT(*) FILTER (WHERE t.status IN ('Resolved', 'Closed')) AS "closed"
    FROM tickets t
    LEFT JOIN clients c ON t.client_id = c.id
    GROUP BY t.client_id, c.company_name
    ORDER BY "total" DESC
  `);

  // Tickets by priority
  const byPriority = await pool.query(`
    SELECT 
      priority,
      COUNT(*) AS "total",
      COUNT(*) FILTER (WHERE status NOT IN ('Closed', 'Resolved')) AS "open",
      COUNT(*) FILTER (WHERE status IN ('Resolved', 'Closed')) AS "closed"
    FROM tickets
    GROUP BY priority
    ORDER BY CASE priority
      WHEN 'Critical' THEN 1
      WHEN 'High' THEN 2
      WHEN 'Medium' THEN 3
      WHEN 'Low' THEN 4
    END
  `);

  return {
    summary: result.rows[0],
    byEmployee: byEmployee.rows,
    byClient: byClient.rows,
    byPriority: byPriority.rows,
  };
}
