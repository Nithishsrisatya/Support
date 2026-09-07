import { pool } from "../db";

export async function getAllNotifications() {
  const result = await pool.query(`
    SELECT
      id,
      user_id AS "userId",
      notification_type AS "notificationType",
      title,
      message,
      status,
      created_date AS "createdDate",
      read_date AS "readDate"
    FROM notifications
    ORDER BY created_date DESC
  `);

  return result.rows;
}

export async function getNotificationById(id: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id AS "userId",
      notification_type AS "notificationType",
      title,
      message,
      status,
      created_date AS "createdDate",
      read_date AS "readDate"
    FROM notifications
    WHERE id=$1
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function getNotificationsByUserId(userId: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id AS "userId",
      notification_type AS "notificationType",
      title,
      message,
      status,
      created_date AS "createdDate",
      read_date AS "readDate"
    FROM notifications
    WHERE user_id=$1
    ORDER BY created_date DESC
    `,
    [userId]
  );

  return result.rows;
}

export async function getUnreadCountByUserId(userId: string) {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM notifications
    WHERE user_id=$1 AND status != 'Read'
    `,
    [userId]
  );

  return result.rows[0]?.count || 0;
}

export async function getNotificationCountByUserId(userId: string) {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM notifications
    WHERE user_id=$1
    `,
    [userId]
  );

  return result.rows[0]?.count || 0;
}

export async function createNotification(notification: any) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (id, user_id, notification_type, title, message, status, created_date, read_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7) RETURNING *`,
      [
        notification.id,
        notification.userId,
        notification.notificationType,
        notification.title,
        notification.message,
        notification.status || 'Sent',
        notification.readDate ?? null,
      ]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Critical Notification Error:", error);
    // Return null instead of throwing, so the main API flow isn't interrupted
    return null; 
  }
}

export async function markAsRead(id: string) {
  const result = await pool.query(
    `
    UPDATE notifications
    SET status='Read', read_date=NOW()
    WHERE id=$1 AND status != 'Read'
    RETURNING *
    `,
    [id]
  );

  return result.rows[0] || null;
}

export async function markAllAsReadByUserId(userId: string) {
  const result = await pool.query(
    `
    UPDATE notifications
    SET status='Read', read_date=NOW()
    WHERE user_id=$1 AND status != 'Read'
    RETURNING *
    `,
    [userId]
  );

  return result.rows;
}

export async function deleteAllNotificationsByUserId(userId: string) {
  await pool.query(
    `
    DELETE FROM notifications
    WHERE user_id=$1
    `,
    [userId]
  );
}

export async function updateNotification(id: string, notification: any) {
  const result = await pool.query(
    `
    UPDATE notifications
    SET
      user_id=$1,
      notification_type=$2,
      title=$3,
      message=$4,
      status=$5,
      read_date=$6
    WHERE id=$7
    RETURNING *
    `,
    [
      notification.userId,
      notification.notificationType,
      notification.title,
      notification.message,
      notification.status,
      notification.readDate ?? null,
      id,
    ]
  );

  return result.rows[0];
}

export async function deleteNotification(id: string) {
  await pool.query(
    `
    DELETE FROM notifications
    WHERE id=$1
    `,
    [id]
  );
}
