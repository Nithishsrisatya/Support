import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { logEmail } from "./emailLogService";

dotenv.config();

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface SenderInfo {
  name: string;
  email: string;
}

/**
 * Resolves the sender identity from environment configuration.
 * Defaults to the verified Brevo sender if not explicitly configured.
 */
function getSender(): SenderInfo {
  const customEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const customName = process.env.BREVO_SENDER_NAME?.trim();
  if (customEmail) {
    return {
      name: customName || "Complify Support",
      email: customEmail,
    };
  }

  // Parse from EMAIL_FROM or SMTP_FROM (e.g. "Complify Support <knithishsrisatya@gmail.com>" or "knithishsrisatya@gmail.com")
  const rawFrom = process.env.EMAIL_FROM?.trim() || process.env.SMTP_FROM?.trim();
  if (rawFrom) {
    const match = rawFrom.match(/^(?:(.*?)<)?([^<>]+)>?$/);
    if (match) {
      const parsedName = match[1]?.trim().replace(/^["']|["']$/g, "");
      const parsedEmail = match[2]?.trim();
      if (parsedEmail && parsedEmail.includes("@")) {
        return {
          name: parsedName || "Complify Support",
          email: parsedEmail,
        };
      }
    }
  }

  // Default verified Brevo sender
  return {
    name: "Complify Support",
    email: "knithishsrisatya@gmail.com",
  };
}

function getFormattedFromAddress(): string {
  const sender = getSender();
  return `${sender.name} <${sender.email}>`;
}

/**
 * Sends an email using an adaptive transport pipeline:
 * 1. Brevo REST API (Priority A: when BREVO_API_KEY is configured — HTTPS Port 443, works on Render Free & production)
 * 2. Nodemailer SMTP (Priority B: when SMTP_USER and SMTP_PASS are configured — for local dev / servers with open SMTP ports)
 * 3. Preview Fallback (Priority C: logs to console and database email_logs table with status 'Preview')
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const sender = getSender();
  const fromAddress = getFormattedFromAddress();
  const brevoApiKey = process.env.BREVO_API_KEY?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();

  // ---------------------------------------------------------------------------
  // Priority A: Brevo REST API (HTTPS / Port 443)
  // ---------------------------------------------------------------------------
  if (brevoApiKey) {
    try {
      const response = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: sender.name,
            email: sender.email,
          },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });

      if (response.ok) {
        console.log(`✅ Email sent successfully via Brevo API to: ${to}`);
        await logEmail(fromAddress, to, subject, html, "Sent");
        return;
      }

      // Handle non-2xx response from Brevo
      const errorBody = await response.json().catch(() => null);
      const errorMessage =
        (errorBody && typeof errorBody === "object" && (errorBody.message || JSON.stringify(errorBody))) ||
        `HTTP ${response.status} ${response.statusText}`;

      console.error(`❌ Brevo API delivery failed for recipient (${to}):`, errorMessage);
      await logEmail(fromAddress, to, subject, html, "Failed");
    } catch (fetchError: any) {
      console.error(`❌ Brevo API network exception for recipient (${to}):`, fetchError?.message || fetchError);
      await logEmail(fromAddress, to, subject, html, "Failed");
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Priority B: Nodemailer SMTP (e.g., Local Dev, Port 587/465)
  // ---------------------------------------------------------------------------
  if (smtpUser && smtpPass) {
    const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "localhost",
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    try {
      await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
      });

      console.log(`✅ Email sent successfully via SMTP to: ${to}`);
      await logEmail(fromAddress, to, subject, html, "Sent");
    } catch (smtpError: any) {
      console.error(`❌ SMTP delivery failed for recipient (${to}):`, smtpError?.message || smtpError);
      await logEmail(fromAddress, to, subject, html, "Failed");
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Priority C: Preview Fallback (Development / Offline Mode)
  // ---------------------------------------------------------------------------
  console.log("\n==================================");
  console.log("EMAIL PREVIEW (No Active Transport Configured)");
  console.log("==================================");
  console.log("From:", fromAddress);
  console.log("To:", to);
  console.log("Subject:", subject);
  console.log("Content:\n", html);
  console.log("==================================\n");

  await logEmail(fromAddress, to, subject, html, "Preview");
}
