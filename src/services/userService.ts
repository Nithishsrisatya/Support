import { pool } from "../db";
import bcrypt from "bcrypt";
import { sendEmail } from "./emailService";
import { welcomeEmail } from "../templates/welcomeEmail";
import { resetPasswordConfirmationTemplate } from "../templates/operationalEmails";
export async function getAllUsers() {
  const result = await pool.query(`
    SELECT
      id,
      full_name AS "fullName",
      email,
      password_hash AS "passwordHash",
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
      password_hash AS "passwordHash",
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
  // Save the plain password before hashing
  const temporaryPassword = user.passwordHash;

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
    RETURNING *
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
  password_hash = $3,
  role = $4,
  department = $5,
  manager_id = $6,
  status = $7,
  updated_date = NOW()
WHERE id = $8
RETURNING *
    `,
    [
      user.fullName,
      user.email,
      user.passwordHash,
      user.role,
      user.department,
      user.managerId,
      user.status,
      id,
    ]
  );

  return result.rows[0];
}

export async function deleteUser(id: string) {
  // Check Tickets
  const ticketCount = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM tickets
    WHERE assigned_to = $1
    `,
    [id]
  );

  // Check Tasks
  const taskCount = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM tasks
    WHERE assigned_to = $1
    `,
    [id]
  );

  // Check Notifications
  const notificationCount = await pool.query(
  `
  DELETE FROM notifications
  WHERE user_id = $1
  `,
  [id]
);

  // Check Audit Logs
  const auditCount = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM audit_logs
    WHERE user_id = $1
    `,
    [id]
  );

  const tickets = Number(ticketCount.rows[0].count);
  const tasks = Number(taskCount.rows[0].count);
  //const notifications = Number(notificationCount.rows[0].count);
  const audits = Number(auditCount.rows[0].count);

 if (tickets > 0 || tasks > 0 || audits > 0) {
  throw new Error(
    `Cannot delete employee.

Assigned Tickets: ${tickets}
Assigned Tasks: ${tasks}
Audit Logs: ${audits}



Deactivate the account instead.`
    );
  }

  await pool.query(
    `
    DELETE FROM users
    WHERE id = $1
    `,
    [id]
  );
}

export async function transferAndDeleteUser(
  oldUserId: string,
  newUserId: string
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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

    // 3️⃣ Transfer tasks
    await client.query(
      `
      UPDATE tasks
      SET assigned_to = $1
      WHERE assigned_to = $2
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

    // Transfer Audit Logs
await client.query(
  `
  UPDATE audit_logs
  SET user_id = $1
  WHERE user_id = $2
  `,
  [newUserId, oldUserId]
);
    // 5️⃣ Delete user
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
