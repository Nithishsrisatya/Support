import { pool } from "../db";

// ============================================================
// TICKET REPORTS
// ============================================================

export async function getTicketReport(filters: {
  status?: string;
  priority?: string;
  assignedTo?: string;
  clientId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

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

  // Main report data
  const tickets = await pool.query(`
    SELECT
      t.id, t.subject, t.description, t.category, t.priority, t.status,
t.assigned_to AS "assignedTo", t.client_id AS "clientId",
      t.created_date AS "createdDate", t.updated_date AS "updatedDate",
      t.due_date AS "dueDate", t.completed_at AS "completedAt",
      CASE WHEN t.due_date IS NOT NULL AND t.status NOT IN ('Resolved', 'Closed') AND t.due_date < NOW() THEN true ELSE false END AS "isOverdue",
      t.resolution_summary AS "resolutionSummary", t.resolution_date AS "resolutionDate",
      t.satisfaction_rating AS "satisfactionRating",
      u.full_name AS "assignedToName",
      c.company_name AS "companyName"
    FROM tickets t
    LEFT JOIN users u ON t.assigned_to = u.id
    LEFT JOIN clients c ON t.client_id = c.id
    ${whereClause}
    ORDER BY t.created_date DESC
  `, params);

  // Summary aggregation
  const summary = await pool.query(`
    SELECT
      COUNT(*) AS "total",
      COUNT(*) FILTER (WHERE t.status = 'New') AS "new",
      COUNT(*) FILTER (WHERE t.status = 'Assigned') AS "assigned",
      COUNT(*) FILTER (WHERE t.status = 'In Progress') AS "inProgress",
      COUNT(*) FILTER (WHERE t.status = 'Pending') AS "pending",
      COUNT(*) FILTER (WHERE t.status = 'Resolved') AS "resolved",
      COUNT(*) FILTER (WHERE t.status = 'Closed') AS "closed",
      ROUND(AVG(t.satisfaction_rating) FILTER (WHERE t.satisfaction_rating IS NOT NULL), 2) AS "avgSatisfaction",
      COUNT(*) FILTER (WHERE t.priority = 'Critical' AND t.status NOT IN ('Closed', 'Resolved')) AS "criticalOpen",
      COUNT(*) FILTER (WHERE t.priority = 'High' AND t.status NOT IN ('Closed', 'Resolved')) AS "highOpen"
    FROM tickets t
    ${whereClause}
  `, params);

  // Resolution time stats
  const resolutionStats = await pool.query(`
    SELECT
      ROUND(AVG(EXTRACT(EPOCH FROM (t.resolution_date::timestamp - t.created_date::timestamp)) / 3600)::numeric, 2) AS "avgResolutionHours",
      ROUND(MIN(EXTRACT(EPOCH FROM (t.resolution_date::timestamp - t.created_date::timestamp)) / 3600)::numeric, 2) AS "minResolutionHours",
      ROUND(MAX(EXTRACT(EPOCH FROM (t.resolution_date::timestamp - t.created_date::timestamp)) / 3600)::numeric, 2) AS "maxResolutionHours"
    FROM tickets t
    WHERE t.resolution_date IS NOT NULL
    ${filters.fromDate || filters.toDate ? "AND" : ""} ${conditions.length > 0 ? conditions.join(" AND ").replace(/t\./g, "t.") : ""}
  `, params);

  return {
    tickets: tickets.rows,
    summary: summary.rows[0],
    resolutionStats: resolutionStats.rows[0],
  };
}

// ============================================================
// TASK REPORTS
// ============================================================

export async function getTaskReport(filters: {
  status?: string;
  priority?: string;
  assignedTo?: string;
  assignedBy?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

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
  if (filters.assignedTo) {
    conditions.push(`t.assigned_to = $${paramIndex}`);
    params.push(filters.assignedTo);
    paramIndex++;
  }
  if (filters.assignedBy) {
    conditions.push(`t.assigned_by = $${paramIndex}`);
    params.push(filters.assignedBy);
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

  const tasks = await pool.query(`
    SELECT
      t.id, t.title, t.description, t.task_category AS "taskCategory",
      t.priority, t.status, t.escalation_status AS "escalationStatus",
      t.assigned_to AS "assignedTo", t.assigned_by AS "assignedBy",
      t.start_date AS "startDate",
      t.due_date AS "dueDate", t.completion_date AS "completionDate",
      t.completed_at AS "completedAt",
      CASE WHEN t.due_date IS NOT NULL AND t.status NOT IN ('Completed', 'Escalated') AND t.due_date < NOW() THEN true ELSE false END AS "isOverdue",
      t.completion_notes AS "completionNotes", t.progress_percentage AS "progressPercentage",
      t.review_status AS "reviewStatus",
      t.created_date AS "createdDate", t.updated_date AS "updatedDate",
      assignee.full_name AS "assignedToName",
      assigner.full_name AS "assignedByName"
    FROM tasks t
    LEFT JOIN users assignee ON t.assigned_to = assignee.id
    LEFT JOIN users assigner ON t.assigned_by = assigner.id
    ${whereClause}
    ORDER BY t.created_date DESC
  `, params);

  const summary = await pool.query(`
    SELECT
      COUNT(*) AS "total",
      COUNT(*) FILTER (WHERE t.status = 'Completed') AS "completed",
      COUNT(*) FILTER (WHERE t.status IN ('Pending', 'Assigned', 'In Progress')) AS "active",
      COUNT(*) FILTER (WHERE t.status = 'Overdue' OR (t.status NOT IN ('Completed', 'Escalated') AND t.due_date < NOW())) AS "overdue",
      COUNT(*) FILTER (WHERE t.status = 'Escalated' OR t.escalation_status = 'Yes') AS "escalated",
      ROUND(AVG(t.progress_percentage) FILTER (WHERE t.progress_percentage IS NOT NULL), 2) AS "avgProgress"
    FROM tasks t
    ${whereClause ? `WHERE ${conditions.join(" AND ")}` : ""}
  `, params);

  return {
    tasks: tasks.rows,
    summary: summary.rows[0],
  };
}

// ============================================================
// EMPLOYEE PRODUCTIVITY REPORT
// ============================================================

export async function getEmployeeProductivityReport(filters: {
  fromDate?: string;
  toDate?: string;
  department?: string;
}) {
  let conditions = "";
  const params: any[] = [];
  
  if (filters.department) {
    conditions = "WHERE u.department = $1";
    params.push(filters.department);
  }

  const dateFilter = filters.fromDate && filters.toDate
    ? `AND t.created_date >= ${filters.fromDate ? `'${filters.fromDate}'` : "'1970-01-01'"}` 
    : "";
  
  const employees = await pool.query(`
    SELECT
      u.id, u.full_name AS "fullName", u.email, u.department, u.role, u.status,
      (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id) AS "totalTicketsAssigned",
      (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status IN ('Resolved', 'Closed')) AS "ticketsResolved",
      (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status NOT IN ('Resolved', 'Closed')) AS "ticketsOpen",
      (SELECT COUNT(*) FROM tasks tk WHERE tk.assigned_to = u.id) AS "totalTasksAssigned",
      (SELECT COUNT(*) FROM tasks tk WHERE tk.assigned_to = u.id AND tk.status = 'Completed') AS "tasksCompleted",
      (SELECT COUNT(*) FROM tasks tk WHERE tk.assigned_to = u.id AND tk.status NOT IN ('Completed')) AS "tasksPending",
      (SELECT COUNT(*) FROM tasks tk WHERE tk.assigned_to = u.id AND (tk.status = 'Overdue' OR (tk.status NOT IN ('Completed', 'Escalated') AND tk.due_date < NOW()))) AS "tasksOverdue",
      (SELECT ROUND(AVG(t.satisfaction_rating)::numeric, 2) FROM tickets t WHERE t.assigned_to = u.id AND t.satisfaction_rating IS NOT NULL) AS "avgSatisfaction"
    FROM users u
    WHERE u.role IN ('Employee', 'Manager')
    ${filters.department ? "AND u.department = $1" : ""}
    ORDER BY u.full_name
  `, params);

  // Compute productivity score for each employee
  const enriched = employees.rows.map((emp: any) => {
    const resolvedScore = (emp.ticketsResolved || 0) * 15;
    const completedScore = (emp.tasksCompleted || 0) * 12;
    const overduePenalty = (emp.tasksOverdue || 0) * 10;
    const satisfactionBonus = (emp.avgSatisfaction || 0) * 5;
    const baseScore = 40 + resolvedScore + completedScore - overduePenalty + satisfactionBonus;
    return {
      ...emp,
      productivityScore: Math.max(0, Math.min(100, Math.round(baseScore))),
    };
  });

  // Team summary
  const teamSummary = {
    totalEmployees: enriched.length,
    totalTicketsResolved: enriched.reduce((sum: number, e: any) => sum + (e.ticketsResolved || 0), 0),
    totalTasksCompleted: enriched.reduce((sum: number, e: any) => sum + (e.tasksCompleted || 0), 0),
    totalTasksOverdue: enriched.reduce((sum: number, e: any) => sum + (e.tasksOverdue || 0), 0),
    avgProductivityScore: enriched.length > 0
      ? Math.round(enriched.reduce((sum: number, e: any) => sum + e.productivityScore, 0) / enriched.length)
      : 0,
    avgSatisfactionOverall: enriched.length > 0
      ? Math.round((enriched.reduce((sum: number, e: any) => sum + (e.avgSatisfaction || 0), 0) / enriched.length) * 100) / 100
      : 0,
  };

  return {
    employees: enriched,
    teamSummary,
  };
}

// ============================================================
// CLIENT STATISTICS REPORT
// ============================================================

export async function getClientStatisticsReport(filters: {
  fromDate?: string;
  toDate?: string;
  status?: string;
}) {
  const statusFilter = filters.status ? "AND c.status = $1" : "";
  const params: any[] = filters.status ? [filters.status] : [];

  const clients = await pool.query(`
    SELECT
      c.id, c.company_name AS "companyName", c.contact_person AS "contactPerson",
      c.email, c.phone_number AS "phoneNumber", c.status, c.created_date AS "createdDate",
      (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id) AS "totalTickets",
      (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id AND t.status IN ('Resolved', 'Closed')) AS "closedTickets",
      (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id AND t.status NOT IN ('Resolved', 'Closed')) AS "openTickets",
      (SELECT ROUND(AVG(t.satisfaction_rating)::numeric, 2) FROM tickets t WHERE t.client_id = c.id AND t.satisfaction_rating IS NOT NULL) AS "avgSatisfaction",
      (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id AND t.priority = 'Critical' AND t.status NOT IN ('Resolved', 'Closed')) AS "criticalOpenTickets",
      (SELECT MAX(t.created_date) FROM tickets t WHERE t.client_id = c.id) AS "lastTicketDate"
    FROM clients c
    WHERE 1=1 ${statusFilter}
    ORDER BY "totalTickets" DESC
  `, params);

  const summary = await pool.query(`
    SELECT
      COUNT(*) AS "totalClients",
      COUNT(*) FILTER (WHERE c.status = 'Active') AS "activeClients",
      ROUND(AVG(subq."totalTickets")::numeric, 2) AS "avgTicketsPerClient",
      ROUND(AVG(subq."avgSatisfaction")::numeric, 2) AS "overallAvgSatisfaction"
    FROM clients c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS "totalTickets",
        ROUND(AVG(t.satisfaction_rating)::numeric, 2) AS "avgSatisfaction"
      FROM tickets t
      WHERE t.client_id = c.id
    ) subq ON true
    WHERE 1=1 ${statusFilter}
  `, params);

  return {
    clients: clients.rows,
    summary: summary.rows[0],
  };
}

// ============================================================
// EXPORT FUNCTIONS - Returns raw data for frontend export
// ============================================================

export async function getExportData(type: string, filters: any = {}) {
  switch (type) {
    case "tickets":
      return getTicketReport(filters);
    case "tasks":
      return getTaskReport(filters);
    case "employees":
      return getEmployeeProductivityReport(filters);
    case "clients":
      return getClientStatisticsReport(filters);
    default:
      throw new Error(`Unknown export type: ${type}`);
  }
}

