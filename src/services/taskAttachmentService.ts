import { pool } from "../db";
import crypto from "crypto";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getTaskAttachments(taskId: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      task_id AS "taskId",
      file_name AS "fileName",
      file_path AS "filePath",
      file_size AS "fileSize",
      mime_type AS "mimeType",
      uploaded_by AS "uploadedBy",
      uploaded_by_name AS "uploadedByName",
      created_date AS "createdDate"
    FROM task_attachments
    WHERE task_id = $1
    ORDER BY created_date DESC
    `,
    [taskId]
  );
  return result.rows;
}

export async function getTaskAttachmentById(attachmentId: string) {
  if (!attachmentId || !UUID_REGEX.test(attachmentId)) {
    return null;
  }
  const result = await pool.query(
    `
    SELECT
      id,
      task_id AS "taskId",
      file_name AS "fileName",
      file_path AS "filePath",
      file_size AS "fileSize",
      mime_type AS "mimeType",
      uploaded_by AS "uploadedBy",
      uploaded_by_name AS "uploadedByName",
      created_date AS "createdDate"
    FROM task_attachments
    WHERE id = $1
    `,
    [attachmentId]
  );
  return result.rows[0] || null;
}

export async function createTaskAttachment(attachment: any) {
  const attachmentId = attachment.id && UUID_REGEX.test(attachment.id) ? attachment.id : crypto.randomUUID();
  const result = await pool.query(
    `
    INSERT INTO task_attachments (
      id,
      task_id,
      file_name,
      file_path,
      file_size,
      mime_type,
      uploaded_by,
      uploaded_by_name,
      created_date
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING id, task_id AS "taskId", file_name AS "fileName", file_path AS "filePath",
              file_size AS "fileSize", mime_type AS "mimeType", uploaded_by AS "uploadedBy",
              uploaded_by_name AS "uploadedByName", created_date AS "createdDate"
    `,
    [
      attachmentId,
      attachment.taskId,
      attachment.fileName,
      attachment.filePath,
      attachment.fileSize,
      attachment.mimeType,
      attachment.uploadedBy,
      attachment.uploadedByName,
    ]
  );
  return result.rows[0];
}

export async function deleteTaskAttachment(attachmentId: string) {
  if (!attachmentId || !UUID_REGEX.test(attachmentId)) {
    return;
  }
  await pool.query(
    `DELETE FROM task_attachments WHERE id = $1`,
    [attachmentId]
  );
}

