import { pool } from "../db";
import { TaskStatus, TERMINAL_TASK_STATUSES, ACTIVE_TASK_STATUSES } from "../types";

export function isTerminalTaskStatus(status: TaskStatus | string): boolean {
  return (TERMINAL_TASK_STATUSES as readonly string[]).includes(status);
}

export function isActiveTaskStatus(status: TaskStatus | string): boolean {
  return (ACTIVE_TASK_STATUSES as readonly string[]).includes(status);
}

export async function getAllTasks() {
  const result = await pool.query(`
    SELECT
      id,
      title,
      description,
      task_category AS "taskCategory",
      assigned_by AS "assignedBy",
      assigned_to AS "assignedTo",
      start_date AS "startDate",
      due_date AS "dueDate",
      priority,
      status,
      escalation_status AS "escalationStatus",
      completion_date AS "completionDate",
      completed_at AS "completedAt",
      completion_notes AS "completionNotes",
      progress_percentage AS "progressPercentage",
      review_status AS "reviewStatus",
      manager_notes AS "managerNotes",
      reviewed_by AS "reviewedBy",
      reviewed_date AS "reviewedDate",
      created_date AS "createdDate",
      updated_date AS "updatedDate",
      CASE WHEN due_date IS NOT NULL AND status NOT IN ('Completed', 'Escalated') AND due_date < NOW() THEN true ELSE false END AS "isOverdue"
    FROM tasks
    ORDER BY created_date DESC;
  `);

  return result.rows;
}

export async function getTaskById(id: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      title,
      description,
      task_category AS "taskCategory",
      assigned_by AS "assignedBy",
      assigned_to AS "assignedTo",
      start_date AS "startDate",
      due_date AS "dueDate",
      priority,
      status,
      escalation_status AS "escalationStatus",
      completion_date AS "completionDate",
      completed_at AS "completedAt",
      completion_notes AS "completionNotes",
      progress_percentage AS "progressPercentage",
      review_status AS "reviewStatus",
      manager_notes AS "managerNotes",
      reviewed_by AS "reviewedBy",
      reviewed_date AS "reviewedDate",
      created_date AS "createdDate",
      updated_date AS "updatedDate",
      CASE WHEN due_date IS NOT NULL AND status NOT IN ('Completed', 'Escalated') AND due_date < NOW() THEN true ELSE false END AS "isOverdue"
    FROM tasks
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function createTask(task: any) {
  const result = await pool.query(
    `
    INSERT INTO tasks (
      id,
      title,
      description,
      task_category,
      assigned_by,
      assigned_to,
      start_date,
      due_date,
      priority,
      status,
      escalation_status,
      completion_date,
      completion_notes,
      created_date,
      updated_date
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()
    )
    RETURNING *
    `,
    [
      task.id,
      task.title,
      task.description,
      task.taskCategory,
      task.assignedBy,
      task.assignedTo,
      task.startDate || null,
      task.dueDate,
      task.priority,
      task.status,
      task.escalationStatus,
      task.completionDate ?? null,
      task.completionNotes ?? null,
    ]
  );

  return result.rows[0];
}

export async function updateTask(
  id: string, 
  taskUpdates: any,
  userId: string = "SYS",
  userFullName: string = "System API",
  action: string = "Task Update",
  logDescription: string = "Task details updated."
) {
  const client = await pool.connect();

  try {
    // 1. Start a SQL Transaction
    await client.query('BEGIN');

    // 1b. Check existing task state
    const currentRes = await client.query('SELECT status, assigned_to FROM tasks WHERE id = $1 FOR UPDATE', [id]);
    if (currentRes.rows.length === 0) {
      throw new Error("Task not found.");
    }
    const existingTask = currentRes.rows[0];

    // Lifecycle rule: Completed tasks cannot be assigned or reassigned without reopening
    if (existingTask.status === "Completed") {
      const isTryingToAssign = (taskUpdates.assignedTo !== undefined && taskUpdates.assignedTo !== existingTask.assigned_to) || taskUpdates.status === "Assigned";
      if (isTryingToAssign && taskUpdates.status !== "In Progress" && taskUpdates.status !== "Pending") {
        throw new Error("Completed tasks cannot be assigned.");
      }
    }

    // 2. Update the main task record (Safely handling Completion Notes)
    // Auto-set completed_at when status changes to Completed
    const isCompleting = taskUpdates.status === "Completed";
    const isReopening = taskUpdates.status && taskUpdates.status !== "Completed" && taskUpdates.status !== "Escalated";

    const updateResult = await client.query(
      `
      UPDATE tasks
      SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        task_category = COALESCE($3, task_category),
        assigned_by = COALESCE($4, assigned_by),
        assigned_to = COALESCE($5, assigned_to),
        start_date = COALESCE($6, start_date),
        due_date = COALESCE($7, due_date),
        priority = COALESCE($8, priority),
        status = COALESCE($9, status),
        escalation_status = COALESCE($10, escalation_status),
        completion_date = COALESCE($11, completion_date),
        completed_at = COALESCE($12, completed_at),
        completion_notes = COALESCE($13, completion_notes),
        updated_date = NOW()
      WHERE id = $14
      RETURNING *
      `,
      [
        taskUpdates.title || null,
        taskUpdates.description || null,
        taskUpdates.taskCategory || null,
        taskUpdates.assignedBy || null,
        taskUpdates.assignedTo || null,
        taskUpdates.startDate || null,
        taskUpdates.dueDate || null,
        taskUpdates.priority || null,
        taskUpdates.status || null,
        taskUpdates.escalationStatus || null,
        taskUpdates.completionDate || null,
        isCompleting ? new Date().toISOString() : (isReopening ? null : taskUpdates.completedAt || null),
        taskUpdates.completionNotes || null,
        id
      ]
    );

    const updatedTask = updateResult.rows[0];

    // Clear deadline notifications if reopened or due date updated
    if (
      (existingTask.status === "Completed" && taskUpdates.status && taskUpdates.status !== "Completed") ||
      (taskUpdates.dueDate && taskUpdates.dueDate !== existingTask.due_date)
    ) {
      await client.query(
        `DELETE FROM deadline_notifications WHERE item_type = 'Task' AND item_id = $1`,
        [id]
      );
    }

    // 3. Write to the audit_logs table
    const logId = `LOG-${Math.floor(10000000 + Math.random() * 90000000)}`;
    await client.query(
      `
      INSERT INTO audit_logs (id, user_id, user_full_name, action, entity_type, entity_id, timestamp, description)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      `,
      [logId, userId, userFullName, action, "Task", id, logDescription]
    );

    // 4. Commit the transaction
    await client.query('COMMIT');

    return updatedTask;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenTask(
  taskId: string,
  userId: string,
  userFullName: string,
  comment?: string
) {
  const task = await getTaskById(taskId);
  if (!task) {
    throw new Error("Task not found.");
  }
  if (task.status !== "Completed") {
    throw new Error("Only completed tasks can be reopened.");
  }

  const newStatus: TaskStatus = task.assignedTo ? "Assigned" : "Pending";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE tasks
       SET status = $1,
           completed_at = NULL,
           updated_date = NOW()
       WHERE id = $2
       RETURNING *`,
      [newStatus, taskId]
    );

    const reopenedTask = result.rows[0];

    // Write to task_history
    await client.query(
      `INSERT INTO task_history (task_id, type, timestamp, user_full_name, description, metadata)
       VALUES ($1, 'status_change', NOW(), $2, $3, $4)`,
      [
        taskId,
        userFullName,
        `Task reopened by ${userFullName}${comment ? `: ${comment}` : ""}`,
        JSON.stringify({ previousStatus: "Completed", newStatus, comment }),
      ]
    );

    // Audit log
    const reopenLogId = `LOG-${Math.floor(10000000 + Math.random() * 90000000)}`;
    await client.query(
      `INSERT INTO audit_logs (id, user_id, user_full_name, action, entity_type, entity_id, timestamp, description)
       VALUES ($1, $2, $3, 'Task Update', 'Task', $4, NOW(), $5)`,
      [reopenLogId, userId, userFullName, taskId, `Task ${taskId} reopened by ${userFullName}`]
    );

    // Reset deadline notifications for reopened task
    await client.query(
      `DELETE FROM deadline_notifications WHERE item_type = 'Task' AND item_id = $1`,
      [taskId]
    );

    await client.query("COMMIT");
    return reopenedTask;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteTask(id: string) {
  await pool.query(
    `
    DELETE FROM tasks
    WHERE id = $1
    `,
    [id]
  );
}

// ─── PROGRESS UPDATE ────────────────────────────────────────────────────

export async function updateTaskProgress(
  taskId: string,
  progressPercentage: number,
  comment: string,
  userId: string,
  userFullName: string
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update task progress percentage
    await client.query(
      `UPDATE tasks SET progress_percentage = $1, updated_date = NOW() WHERE id = $2`,
      [progressPercentage, taskId]
    );

    // Record progress update in task_progress_updates table
    await client.query(
      `INSERT INTO task_progress_updates (id, task_id, user_id, user_full_name, progress_percentage, comment, created_date)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
      [taskId, userId, userFullName, progressPercentage, comment]
    );

    // Write to task_history
    await client.query(
      `INSERT INTO task_history (task_id, type, timestamp, user_full_name, description, metadata)
       VALUES ($1, 'progress', NOW(), $2, $3, $4)`,
      [
        taskId,
        userFullName,
        `Progress updated to ${progressPercentage}%: ${comment}`,
        JSON.stringify({ progressPercentage, comment }),
      ]
    );

    // Audit log
    const progLogId = `LOG-${Math.floor(10000000 + Math.random() * 90000000)}`;
    await client.query(
      `INSERT INTO audit_logs (id, user_id, user_full_name, action, entity_type, entity_id, timestamp, description)
       VALUES ($1, $2, $3, 'Task Update', 'Task', $4, NOW(), $5)`,
      [progLogId, userId, userFullName, taskId, `Progress updated to ${progressPercentage}% on task ${taskId}`]
    );

    await client.query("COMMIT");
    return { success: true, progressPercentage };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ─── MANAGER REVIEW ─────────────────────────────────────────────────────

export async function reviewTask(
  taskId: string,
  reviewStatus: string,
  managerNotes: string,
  reviewerId: string,
  reviewerName: string
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE tasks
       SET review_status = $1, manager_notes = $2, reviewed_by = $3, reviewed_date = NOW(), updated_date = NOW()
       WHERE id = $4`,
      [reviewStatus, managerNotes, reviewerId, taskId]
    );

    // Write to task_history
    await client.query(
      `INSERT INTO task_history (task_id, type, timestamp, user_full_name, description, metadata)
       VALUES ($1, 'review', NOW(), $2, $3, $4)`,
      [
        taskId,
        reviewerName,
        `Manager review: ${reviewStatus}${managerNotes ? ` - ${managerNotes}` : ""}`,
        JSON.stringify({ reviewStatus, managerNotes }),
      ]
    );

    // Audit log
    const revLogId = `LOG-${Math.floor(10000000 + Math.random() * 90000000)}`;
    await client.query(
      `INSERT INTO audit_logs (id, user_id, user_full_name, action, entity_type, entity_id, timestamp, description)
       VALUES ($1, $2, $3, 'Task Update', 'Task', $4, NOW(), $5)`,
      [revLogId, reviewerId, reviewerName, taskId, `Task ${taskId} reviewed as ${reviewStatus} by ${reviewerName}`]
    );

    await client.query("COMMIT");
    return { success: true, reviewStatus };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ─── OVERDUE DETECTION ──────────────────────────────────────────────────

export async function checkTaskOverdue(taskId: string) {
  const task = await getTaskById(taskId);
  if (!task) return { success: false, message: "Task not found" };

  if (task.status === "Completed" || task.status === "Escalated") {
    return { success: false, message: "Task already completed or escalated" };
  }

  const dueDate = new Date(task.dueDate);
  const now = new Date();

  if (dueDate < now) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE tasks SET status = 'Overdue', escalation_status = 'Yes', updated_date = NOW() WHERE id = $1`,
        [taskId]
      );

      // Write to task_history
      await client.query(
        `INSERT INTO task_history (task_id, type, timestamp, user_full_name, description, metadata)
         VALUES ($1, 'status_change', NOW(), 'System', $2, $3)`,
        [
          taskId,
          `Task auto-marked as Overdue (due date: ${task.dueDate})`,
          JSON.stringify({ previousStatus: task.status, newStatus: "Overdue" }),
        ]
      );

      // Audit log
      const ovLogId = `LOG-${Math.floor(10000000 + Math.random() * 90000000)}`;
      await client.query(
        `INSERT INTO audit_logs (id, user_id, user_full_name, action, entity_type, entity_id, timestamp, description)
         VALUES ($1, 'SYSTEM', 'System', 'Task Update', 'Task', $2, NOW(), $3)`,
        [ovLogId, taskId, `Task ${taskId} auto-detected as overdue`]
      );

      await client.query("COMMIT");
      return { success: true, message: "Task marked as overdue", status: "Overdue" };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { success: false, message: "Task is not yet overdue" };
}

export async function checkAllOverdueTasks() {
  const result = await pool.query(
    `SELECT id FROM tasks
     WHERE status NOT IN ('Completed', 'Escalated', 'Overdue')
     AND due_date < NOW()`
  );

  const results = [];
  for (const row of result.rows) {
    const res = await checkTaskOverdue(row.id);
    results.push({ taskId: row.id, ...res });
  }

  return results;
}

// ─── GET PROGRESS UPDATES ───────────────────────────────────────────────

export async function getTaskProgressUpdates(taskId: string) {
  const result = await pool.query(
    `SELECT
       id,
       task_id AS "taskId",
       user_id AS "userId",
       user_full_name AS "userFullName",
       progress_percentage AS "progressPercentage",
       comment,
       created_date AS "createdDate"
     FROM task_progress_updates
     WHERE task_id = $1
     ORDER BY created_date DESC`,
    [taskId]
  );
  return result.rows;
}
