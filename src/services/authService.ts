import bcrypt from "bcrypt";
import { pool } from "../db";

export async function login(email: string, password: string) {
  // 1. Search in 'users' table
  let result = await pool.query(
    `SELECT id, full_name AS "fullName", email, password_hash AS "passwordHash", 
            role, status, first_login AS "firstLogin" 
     FROM users 
     WHERE email = $1 AND status = 'Active'`,
    [email]
  );

  let user = result.rows[0];
  let userType = 'User';

  // 2. If not found in 'users', search in 'clients' table
  if (!user) {
    result = await pool.query(
      `SELECT id, contact_person AS "fullName", email, "passwordHash" AS "passwordHash", 
              'Client' AS role, status, first_login AS "firstLogin" 
       FROM clients 
       WHERE email = $1 AND status = 'Active'`,
      [email]
    );
    user = result.rows[0];
    userType = 'Client';
  }

  // 3. Fail if user is not in either table
  if (!user) return null;

  // 4. Validate password (works for both tables)
  // Ensure user.passwordHash exists before comparing
  if (!user.passwordHash) {
    console.error(`Login failed: Missing hash for ${email}`);
    return null;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) return null;

  // 5. Cleanup response
  delete user.passwordHash;
  return { ...user, userType };
}