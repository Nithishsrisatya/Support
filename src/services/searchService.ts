import { pool } from "../db";

// ============================================================
// GLOBAL SEARCH
// Searches Tickets, Tasks, Employees, Clients from one query
// ============================================================
export async function globalSearch(q: string, role: string, userId: string) {
  const term = `%${(q || "").trim()}%`;

  // Pre-fetch manager team IDs once if applicable
  let managerTeamIds: string[] = [];
  if (role === "Manager") {
    const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [userId]);
    managerTeamIds = teamResult.rows.map(r => r.id);
    managerTeamIds.push(userId);
  }

  // 1. Search Tickets Query Setup
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
    ticketsQuery += ` AND (t.assigned_to = ANY($2::text[]) OR t.assigned_to IS NULL)`;
    ticketsParams.push(managerTeamIds);
  }
  ticketsQuery += ` ORDER BY t.created_date DESC LIMIT 50`;

  // 2. Search Tasks Query Setup
  let tasksQuery = "";
  const tasksParams: any[] = [term];
  if (role !== "Client") {
    tasksQuery = `
      SELECT t.id, t.title, t.status, t.priority, t.due_date AS "dueDate",
             u.full_name AS "assignedToName", t.created_date AS "createdDate"
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE (t.title ILIKE $1 OR t.description ILIKE $1 OR t.id ILIKE $1)
    `;

    if (role === "Employee") {
      tasksQuery += ` AND t.assigned_to = $2`;
      tasksParams.push(userId);
    } else if (role === "Manager") {
      tasksQuery += ` AND (t.assigned_to = ANY($2::text[]) OR t.assigned_by = $3 OR t.assigned_to IS NULL)`;
      tasksParams.push(managerTeamIds, userId);
    }
    tasksQuery += ` ORDER BY t.created_date DESC LIMIT 50`;
  }

  // 3. Search Employees Query Setup (staff only)
  let employeesQuery = "";
  const employeesParams: any[] = [term];
  if (["Administrator", "Manager"].includes(role)) {
    if (role === "Administrator") {
      employeesQuery = `
        SELECT id, full_name AS "fullName", email, department, role, status
        FROM users
        WHERE full_name ILIKE $1 OR email ILIKE $1 OR id ILIKE $1
        ORDER BY full_name
        LIMIT 20
      `;
    } else if (role === "Manager") {
      employeesQuery = `
        SELECT id, full_name AS "fullName", email, department, role, status
        FROM users
        WHERE (full_name ILIKE $1 OR email ILIKE $1 OR id ILIKE $1)
          AND (manager_id = $2 OR id = $2)
        ORDER BY full_name
        LIMIT 20
      `;
      employeesParams.push(userId);
    }
  }

  // 4. Search Clients Query Setup (staff only)
  let clientsQuery = "";
  const clientsParams: any[] = [term];
  if (["Administrator", "Manager"].includes(role)) {
    clientsQuery = `
      SELECT id, company_name AS "companyName", contact_person AS "contactPerson",
             email, status
      FROM clients
      WHERE company_name ILIKE $1 OR contact_person ILIKE $1 OR email ILIKE $1 OR id ILIKE $1
      ORDER BY company_name
      LIMIT 20
    `;
  }

  // Execute all authorized queries concurrently
  const [ticketsRes, tasksRes, employeesRes, clientsRes] = await Promise.all([
    pool.query(ticketsQuery, ticketsParams),
    tasksQuery ? pool.query(tasksQuery, tasksParams) : Promise.resolve({ rows: [] }),
    employeesQuery ? pool.query(employeesQuery, employeesParams) : Promise.resolve({ rows: [] }),
    clientsQuery ? pool.query(clientsQuery, clientsParams) : Promise.resolve({ rows: [] }),
  ]);

  return {
    tickets: ticketsRes.rows,
    tasks: tasksRes.rows,
    employees: employeesRes.rows,
    clients: clientsRes.rows,
  };
}
