import { pool } from "../db";
import bcrypt from "bcrypt";
import { sendEmail } from "./emailService";
import { welcomeEmail } from "../templates/welcomeEmail";
import { resetPasswordConfirmationTemplate } from "../templates/operationalEmails";
import { generateTemporaryPassword, isPredictablePassword } from "../utils/credentialUtils";
export async function getAllUsers() {
  const result = await pool.query(`
    SELECT
      id,
      full_name AS "fullName",
      email,
      role,
      department,
      manager_id AS "managerId",
      status,
      created_date AS "createdDate",
      updated_date AS "updatedDate",
      first_login AS "firstLogin"
    FROM users
    ORDER BY created_date DESC;
  `);

  return result.rows;
}

export async function getUserById(id: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      full_name AS "fullName",
      email,
      role,
      department,
      manager_id AS "managerId",
      status,
      created_date AS "createdDate",
      updated_date AS "updatedDate",
      first_login AS "firstLogin"
    FROM users
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}
export async function createUser(user: any) {
  // Determine plain password; generate secure temporary password if omitted or predictable
  const candidatePassword = user.password || user.passwordHash;
  const temporaryPassword = (!candidatePassword || isPredictablePassword(candidatePassword, user.fullName))
    ? generateTemporaryPassword()
    : candidatePassword;

  // Hash it
  const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

  // Save user
  const result = await pool.query(
    `
    INSERT INTO users (
      id,
      full_name,
      email,
      password_hash,
      role,
      department,
      manager_id,
      status,
      created_date,
      updated_date,
      first_login  
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),$9
    )
    RETURNING
      id,
      full_name AS "fullName",
      email,
      role,
      department,
      manager_id AS "managerId",
      status,
      created_date AS "createdDate",
      updated_date AS "updatedDate",
      first_login AS "firstLogin"
    `,
    [
      user.id,
      user.fullName,
      user.email,
      hashedPassword,
      user.role,
      user.department,
      user.managerId,
      user.status,
      user.firstLogin,
    ]
  );

  // Send welcome email (don't fail user creation if email fails)
  try {
    await sendEmail(
      user.email,
      "Welcome to Complify Support",
      welcomeEmail(
        user.fullName,
        user.email,
        temporaryPassword
      )
    );

    console.log("✅ Welcome email sent.");
  } catch (error) {
    console.error("❌ Failed to send welcome email:", error);
  }

  return result.rows[0];
}

export async function updateUser(id: string, updates: any) {
  // Get the existing user
  const existing = await getUserById(id);

  if (!existing) {
    throw new Error("User not found");
  }

  // Merge existing values with updates
  const user = {
    ...existing,
    ...updates,
  };

  const result = await pool.query(
    `
    UPDATE users
    SET
      full_name = $1,
      email = $2,
      role = $3,
      department = $4,
      manager_id = $5,
      status = $6,
      updated_date = NOW()
    WHERE id = $7
    RETURNING
      id,
      full_name AS "fullName",
      email,
      role,
      department,
      manager_id AS "managerId",
      status,
      created_date AS "createdDate",
      updated_date AS "updatedDate",
      first_login AS "firstLogin"
    `,
    [
      user.fullName,
      user.email,
      user.role,
      user.department,
      user.managerId,
      user.status,
      id,
    ]
  );

  return result.rows[0];
}

export async function deleteUser(id: string, requestingUserId?: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Verify user exists and lock the row to avoid concurrency races
    const userRes = await client.query(
      `SELECT id, full_name, email, role, status FROM users WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (userRes.rows.length === 0) {
      throw new Error("User not found.");
    }

    // Prevent self-deletion if requesting user matches
    if (requestingUserId && requestingUserId === id) {
      throw new Error("Administrators cannot delete their own active account.");
    }

    // 2. Pre-deletion validation: check all constraints BEFORE deleting any data
    const ticketCount = await client.query(
      `
      SELECT COUNT(*) AS count
      FROM tickets
      WHERE assigned_to = $1
      `,
      [id]
    );

    const taskCount = await client.query(
      `
      SELECT COUNT(*) AS count
      FROM tasks
      WHERE assigned_to = $1
      `,
      [id]
    );

    const reportCount = await client.query(
      `
      SELECT COUNT(*) AS count
      FROM users
      WHERE manager_id = $1
      `,
      [id]
    );

    const tickets = Number(ticketCount.rows[0].count);
    const tasks = Number(taskCount.rows[0].count);
    const reports = Number(reportCount.rows[0].count);

    if (tickets > 0 || tasks > 0) {
      throw new Error(
        `Cannot delete employee with active assigned workload.

Assigned Tickets: ${tickets}
Assigned Tasks: ${tasks}

Reassign tickets and tasks before deleting, or use transfer.`
      );
    }

    if (reports > 0) {
      throw new Error(
        `Cannot delete manager with ${reports} reporting employee(s). Reassign employees before deleting, or use transfer.`
      );
    }

    // 3. Atomically perform related dependent record cleanups inside transaction
    // Handle tasks assigned_by (nullable foreign key)
    await client.query(
      `UPDATE tasks SET assigned_by = NULL WHERE assigned_by = $1`,
      [id]
    );

    // Delete user notifications
    await client.query(
      `DELETE FROM notifications WHERE user_id = $1`,
      [id]
    );

    // Delete password reset tokens for user
    await client.query(
      `DELETE FROM password_reset_tokens WHERE user_id = $1`,
      [id]
    );

    // Delete deadline & reminder deduplication tracking
    await client.query(
      `DELETE FROM deadline_notifications WHERE recipient_id = $1`,
      [id]
    );
    await client.query(
      `DELETE FROM weekly_pending_work_notifications WHERE recipient_id = $1`,
      [id]
    );

    // 4. Delete user record
    await client.query(
      `DELETE FROM users WHERE id = $1`,
      [id]
    );

    await client.query("COMMIT");

    return {
      success: true,
      message: "User deleted successfully.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function transferAndDeleteUser(
  oldUserId: string,
  newUserId: string
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Verify old user exists and lock the row
    const oldUserRes = await client.query(
      `SELECT id, full_name, email, role, status FROM users WHERE id = $1 FOR UPDATE`,
      [oldUserId]
    );
    if (oldUserRes.rows.length === 0) {
      throw new Error("Old employee not found.");
    }

    // 2. Verify new user exists and is active
    const newUserRes = await client.query(
      `SELECT id, full_name, email, role, status FROM users WHERE id = $1`,
      [newUserId]
    );
    if (newUserRes.rows.length === 0) {
      throw new Error("Replacement employee not found.");
    }
    if (newUserRes.rows[0].status !== "Active") {
      throw new Error("Replacement employee is not active.");
    }

    // 1️⃣ Transfer employees reporting to this manager
    await client.query(
      `
      UPDATE users
      SET manager_id = $1
      WHERE manager_id = $2
      `,
      [newUserId, oldUserId]
    );

    // 2️⃣ Transfer tickets
    await client.query(
      `
      UPDATE tickets
      SET assigned_to = $1
      WHERE assigned_to = $2
      `,
      [newUserId, oldUserId]
    );

    // 3️⃣ Transfer tasks assigned_to
    await client.query(
      `
      UPDATE tasks
      SET assigned_to = $1
      WHERE assigned_to = $2
      `,
      [newUserId, oldUserId]
    );

    // Transfer tasks assigned_by
    await client.query(
      `
      UPDATE tasks
      SET assigned_by = $1
      WHERE assigned_by = $2
      `,
      [newUserId, oldUserId]
    );

    // 4️⃣ Transfer notifications
    await client.query(
      `
      UPDATE notifications
      SET user_id = $1
      WHERE user_id = $2
      `,
      [newUserId, oldUserId]
    );

    // Clean up old user's password reset tokens
    await client.query(
      `DELETE FROM password_reset_tokens WHERE user_id = $1`,
      [oldUserId]
    );

    // Clean up old user's deadline/pending work notifications
    await client.query(
      `DELETE FROM deadline_notifications WHERE recipient_id = $1`,
      [oldUserId]
    );
    await client.query(
      `DELETE FROM weekly_pending_work_notifications WHERE recipient_id = $1`,
      [oldUserId]
    );

    // 5️⃣ Delete old user
    await client.query(
      `
      DELETE FROM users
      WHERE id = $1
      `,
      [oldUserId]
    );

    await client.query("COMMIT");

    return {
      success: true,
      message: "Employee transferred and deleted successfully.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const result = await pool.query(
    `
    SELECT password_hash
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error("User not found.");
  }

  const user = result.rows[0];

  const isMatch = await bcrypt.compare(
    currentPassword,
    user.password_hash
  );

  if (!isMatch) {
    throw new Error("Current password is incorrect.");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Get user info for email
  const userInfo = await pool.query(
    `SELECT full_name AS "fullName", email FROM users WHERE id = $1`,
    [userId]
  );

  await pool.query(
    `
    UPDATE users
    SET
      password_hash = $1,
      first_login = FALSE,
      updated_date = NOW()
    WHERE id = $2
    `,
    [hashedPassword, userId]
  );

  // Send password changed confirmation email
  if (userInfo.rows.length > 0) {
    try {
      const { fullName, email } = userInfo.rows[0];
      const html = resetPasswordConfirmationTemplate(fullName);
      await sendEmail(email, "Password Changed Successfully - Complify Support", html);
      console.log("✅ Password changed confirmation email sent.");
    } catch (err) {
      console.error("❌ Failed to send password changed confirmation:", err);
    }
  }

  return {
    success: true,
    message: "Password changed successfully.",
  };
}
