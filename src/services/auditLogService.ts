import { pool } from "../db";
import { randomUUID } from "crypto";

export async function getAllAuditLogs() {
  const result = await pool.query(`
    SELECT
      id,
      user_id AS "userId",
      user_full_name AS "userFullName",
      action,
      entity_type AS "entityType",
      entity_id AS "entityId",
      timestamp,
      description
    FROM audit_logs
    ORDER BY timestamp DESC
  `);

  return result.rows;
}

export async function getAuditLogById(id: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id AS "userId",
      user_full_name AS "userFullName",
      action,
      entity_type AS "entityType",
      entity_id AS "entityId",
      timestamp,
      description
    FROM audit_logs
    WHERE id=$1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function createAuditLog(log: any) {
  const result = await pool.query(
    `
    INSERT INTO audit_logs (
      id,
      user_id,
      user_full_name,
      action,
      entity_type,
      entity_id,
      timestamp,
      description
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,NOW(),$7
    )
    RETURNING *
    `,
    [
      log.id,
      log.userId,
      log.userFullName,
      log.action,
      log.entityType,
      log.entityId,
      log.description,
    ]
  );

  return result.rows[0];
}

export async function deleteAuditLog(id: string) {
  await pool.query(
    `
    DELETE FROM audit_logs
    WHERE id=$1
    `,
    [id]
  );
}

// ============================================================
// SEARCH & FILTER AUDIT LOGS
// ============================================================
export async function searchAuditLogs(filters: {
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}) {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.search) {
    conditions.push(`(
      description ILIKE $${paramIndex} 
      OR user_full_name ILIKE $${paramIndex} 
      OR entity_id ILIKE $${paramIndex}
    )`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }
  if (filters.action) {
    conditions.push(`action = $${paramIndex}`);
    params.push(filters.action);
    paramIndex++;
  }
  if (filters.entityType) {
    conditions.push(`entity_type = $${paramIndex}`);
    params.push(filters.entityType);
    paramIndex++;
  }
  if (filters.userId) {
    conditions.push(`user_id = $${paramIndex}`);
    params.push(filters.userId);
    paramIndex++;
  }
  if (filters.fromDate) {
    conditions.push(`timestamp >= $${paramIndex}`);
    params.push(filters.fromDate);
    paramIndex++;
  }
  if (filters.toDate) {
    conditions.push(`timestamp <= $${paramIndex}`);
    params.push(filters.toDate);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  const countResult = await pool.query(`
    SELECT COUNT(*) FROM audit_logs ${whereClause}
  `, params);

  const totalCount = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(`
    SELECT
      id,
      user_id AS "userId",
      user_full_name AS "userFullName",
      action,
      entity_type AS "entityType",
      entity_id AS "entityId",
      timestamp,
      description
    FROM audit_logs
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, limit, offset]);

  return {
    logs: result.rows,
    total: totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
  };
}

// ============================================================
// SIMPLE HELPER TO CREATE AUDIT LOG (server-side)
// ============================================================
export async function logAuditEvent(
  userId: string,
  userFullName: string,
  action: string,
  entityType: string,
  entityId: string,
  description: string
) {
  const id = `LOG-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const result = await pool.query(
    `
    INSERT INTO audit_logs (id, user_id, user_full_name, action, entity_type, entity_id, timestamp, description)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
    RETURNING *
    `,
    [id, userId, userFullName, action, entityType, entityId, description]
  );
  return result.rows[0];
}
