import { pool } from "../db";

// ============================================================
// GLOBAL SEARCH
// Searches Tickets, Tasks, Employees, Clients from one query
// ============================================================
export async function globalSearch(q: string, role: string, userId: string) {
  const term = `%${(q || "").trim()}%`;

  // Search Tickets
  let ticketsQuery = `
    SELECT t.id, t.subject, t.status, t.priority, t.client_id AS "clientId",
           c.company_name AS "companyName", t.created_date AS "createdDate"
    FROM tickets t
    LEFT JOIN clients c ON t.client_id = c.id
    WHERE (t.subject ILIKE $1 OR t.description ILIKE $1 OR t.id ILIKE $1)
  `;
  const ticketsParams: any[] = [term];

  if (role === "Client") {
    ticketsQuery += ` AND t.client_id = $2`;
    ticketsParams.push(userId);
  } else if (role === "Employee") {
    ticketsQuery += ` AND t.assigned_to = $2`;
    ticketsParams.push(userId);
  } else if (role === "Manager") {
    const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [userId]);
    const teamIds = teamResult.rows.map(r => r.id);
    teamIds.push(userId);
    ticketsQuery += ` AND (t.assigned_to = ANY($2::text[]) OR t.assigned_to IS NULL)`;
    ticketsParams.push(teamIds);
  }

  const tickets = await pool.query(ticketsQuery, ticketsParams);

  // Search Tasks
  let tasks: any = { rows: [] };
  if (role !== "Client") {
    let tasksQuery = `
      SELECT t.id, t.title, t.status, t.priority, t.due_date AS "dueDate",
             u.full_name AS "assignedToName", t.created_date AS "createdDate"
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE (t.title ILIKE $1 OR t.description ILIKE $1 OR t.id ILIKE $1)
    `;
    const tasksParams: any[] = [term];

    if (role === "Employee") {
      tasksQuery += ` AND t.assigned_to = $2`;
      tasksParams.push(userId);
    } else if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [userId]);
      const teamIds = teamResult.rows.map(r => r.id);
      teamIds.push(userId);
      tasksQuery += ` AND (t.assigned_to = ANY($2::text[]) OR t.assigned_by = $3)`;
      tasksParams.push(teamIds, userId);
    }

    tasks = await pool.query(tasksQuery, tasksParams);
  }

  // Search Employees (staff only)
  let employees: any = { rows: [] };
  if (["Administrator", "Manager"].includes(role)) {
    employees = await pool.query(
      `SELECT id, full_name AS "fullName", email, department, role, status
       FROM users
       WHERE full_name ILIKE $1 OR email ILIKE $1 OR id ILIKE $1
       ORDER BY full_name
       LIMIT 20`,
      [term]
    );
  }

  // Search Clients (staff only)
  let clients: any = { rows: [] };
  if (["Administrator", "Manager"].includes(role)) {
    clients = await pool.query(
      `SELECT id, company_name AS "companyName", contact_person AS "contactPerson",
              email, status
       FROM clients
       WHERE company_name ILIKE $1 OR contact_person ILIKE $1 OR email ILIKE $1 OR id ILIKE $1
       ORDER BY company_name
       LIMIT 20`,
      [term]
    );
  }

  return {
    tickets: tickets.rows,
    tasks: tasks.rows,
    employees: employees.rows,
    clients: clients.rows,
  };
}
