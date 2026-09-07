import { pool } from "../db";

export async function getTaskHistory(taskId: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      task_id AS "taskId",
      type,
      timestamp,
      user_full_name AS "userFullName",
      description,
      metadata
    FROM task_history
    WHERE task_id = $1
    ORDER BY timestamp DESC
    `,
    [taskId]
  );
  return result.rows;
}

export async function createTaskHistoryEntry(entry: {
  taskId: string;
  type: string;
  userFullName: string;
  description: string;
  metadata?: any;
}) {
  const result = await pool.query(
    `
    INSERT INTO task_history (
      task_id,
      type,
      timestamp,
      user_full_name,
      description,
      metadata
    )
    VALUES ($1, $2, NOW(), $3, $4, $5)
    RETURNING *
    `,
    [
      entry.taskId,
      entry.type,
      entry.userFullName,
      entry.description,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );
  return result.rows[0];
}

export async function deleteTaskHistory(taskId: string) {
  await pool.query(
    `DELETE FROM task_history WHERE task_id = $1`,
    [taskId]
  );
}

