import { pool } from "../db";
import { sendEmail } from "./emailService";
import { resetPasswordConfirmationTemplate } from "../templates/operationalEmails";

export async function getAllClients() {
  const result = await pool.query(`
    SELECT
      id,
      company_name AS "companyName",
      company_domain AS "companyDomain",
      contact_person AS "contactPerson",
      email,
      phone_number AS "phoneNumber",
      city,
      status,
      created_date AS "createdDate",
      updated_date AS "updatedDate"
    FROM clients
    ORDER BY created_date DESC;
  `);

  return result.rows;
}

export async function getClientById(id: string) {
  const result = await pool.query(
    `
    SELECT
      id,
      company_name AS "companyName",
      company_domain AS "companyDomain",
      contact_person AS "contactPerson",
      email,
      phone_number AS "phoneNumber",
      city,
      status,
      created_date AS "createdDate",
      updated_date AS "updatedDate"
    FROM clients
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

// Ensure this is the ONLY createClient function in the file
export async function createClient(client: any) {
  // Validate company domain against email
  const emailDomain = client.email?.split("@")[1]?.toLowerCase() || "";
  const companyDomain = client.companyDomain?.toLowerCase() || "";

  // Now compare them safely
  if (emailDomain !== companyDomain) {
    throw new Error("Company email must belong to the registered company domain.");
  }

  const result = await pool.query(
    `
    INSERT INTO clients (
      id, 
      company_name, 
      company_domain, 
      contact_person, 
      email, 
      phone_number, 
      city, 
      status, 
      "passwordHash", 
      first_login, 
      created_date
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    RETURNING *
    `,
    [
      client.id,
      client.companyName,
      client.companyDomain,
      client.contactPerson,
      client.email,
      client.phoneNumber,
      client.city,
      client.status || 'Active',
      client.passwordHash,
      true, 
    ]
  );

  return result.rows[0];
}

export async function updateClient(id: string, client: any) {
  // Validate company domain against email
  const emailDomain = client.email?.split("@")[1]?.toLowerCase() || "";
  const companyDomain = client.companyDomain?.toLowerCase() || "";

  if (emailDomain !== companyDomain) {
    throw new Error(
      "Company email must belong to the registered company domain."
    );
  }

  const result = await pool.query(
    `
    UPDATE clients
    SET
      company_name = $1,
      company_domain = $2,
      contact_person = $3,
      email = $4,
      phone_number = $5,
      city = $6,
      status = $7,
      updated_date = NOW()
    WHERE id = $8
    RETURNING *
    `,
    [
      client.companyName,
      client.companyDomain,
      client.contactPerson,
      client.email,
      client.phoneNumber,
      client.city,
      client.status,
      id,
    ]
  );

  return result.rows[0];
}

export async function deleteClient(id: string) {
  const ticketCount = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM tickets
    WHERE client_id = $1
    `,
    [id]
  );

  if (Number(ticketCount.rows[0].count) > 0) {
    throw new Error(
      "Cannot delete client because tickets are assigned to this client."
    );
  }

  await pool.query(
    `
    DELETE FROM clients
    WHERE id = $1
    `,
    [id]
  );
}

// ============================================
// CHANGE PASSWORD (Logged-in Client)
// ============================================
export async function changeClientPassword(
  clientId: string,
  currentPassword: string,
  newPassword: string
) {
  const bcrypt = await import("bcrypt");

  const result = await pool.query(
    `
    SELECT
      "passwordHash"
    FROM clients
    WHERE id = $1
    `,
    [clientId]
  );

  if (result.rows.length === 0) {
    throw new Error("Client not found.");
  }

  const client = result.rows[0];

  const isMatch = await bcrypt.default.compare(
    currentPassword,
    client.passwordHash
  );

  if (!isMatch) {
    throw new Error("Current password is incorrect.");
  }

  const hashedPassword = await bcrypt.default.hash(newPassword, 10);

  // Get client info for email
  const clientInfo = await pool.query(
    `SELECT contact_person AS "contactPerson", email FROM clients WHERE id = $1`,
    [clientId]
  );

  await pool.query(
    `
    UPDATE clients
    SET
      "passwordHash" = $1,
      first_login = FALSE,
      updated_date = NOW()
    WHERE id = $2
    `,
    [hashedPassword, clientId]
  );

  // Send password changed confirmation email
  if (clientInfo.rows.length > 0) {
    try {
      const { contactPerson, email } = clientInfo.rows[0];
      const html = resetPasswordConfirmationTemplate(contactPerson);
      await sendEmail(email, "Password Changed Successfully - Complify Support", html);
      console.log("✅ Client password changed confirmation email sent.");
    } catch (err) {
      console.error("❌ Failed to send client password changed confirmation:", err);
    }
  }

  return {
    success: true,
    message: "Password changed successfully.",
  };
}

// ============================================
// UPDATE CLIENT PROFILE (Self-service by Logged-in Client)
// ============================================
export async function updateClientProfile(
  clientId: string,
  data: {
    companyName?: string;
    companyDomain?: string;
    contactPerson?: string;
    email?: string;
    phoneNumber?: string;
    city?: string;
  }
) {
  const companyName = data.companyName?.trim();
  const companyDomain = data.companyDomain?.trim().toLowerCase();
  const contactPerson = data.contactPerson?.trim();
  const email = data.email?.trim();
  const phoneNumber = data.phoneNumber !== undefined ? data.phoneNumber.trim() : "";
  const city = data.city !== undefined ? data.city.trim() : "";

  if (!companyName || !companyDomain || !contactPerson || !email) {
    throw new Error("Company Name, Company Domain, Contact Person, and Email are required.");
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Please enter a valid email address.");
  }

  const emailDomain = email.split("@")[1]?.toLowerCase() || "";
  if (emailDomain !== companyDomain) {
    throw new Error("Company email must belong to the registered company domain.");
  }

  const result = await pool.query(
    `
    UPDATE clients
    SET
      company_name = $1,
      company_domain = $2,
      contact_person = $3,
      email = $4,
      phone_number = $5,
      city = $6,
      updated_date = NOW()
    WHERE id = $7
    RETURNING
      id,
      company_name AS "companyName",
      company_domain AS "companyDomain",
      contact_person AS "contactPerson",
      email,
      phone_number AS "phoneNumber",
      city,
      status,
      created_date AS "createdDate",
      updated_date AS "updatedDate"
    `,
    [
      companyName,
      companyDomain,
      contactPerson,
      email,
      phoneNumber,
      city,
      clientId,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error("Client not found.");
  }

  return result.rows[0];
}


