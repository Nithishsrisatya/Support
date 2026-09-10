import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { logEmail } from "./emailLogService";

dotenv.config();

const RESEND_API_URL = "https://api.resend.com/emails";

function getFromAddress(): string {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || "Complify Support <noreply@complify.com>";
}

/**
 * Sends an email using an adaptive transport pipeline:
 * 1. Resend HTTPS API (Priority A: when RESEND_API_KEY is configured — works on Render Free & production)
 * 2. Nodemailer SMTP (Priority B: when SMTP_USER and SMTP_PASS are configured — for local dev / servers with open SMTP ports)
 * 3. Preview Fallback (Priority C: logs to console and database email_logs table with status 'Preview')
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const fromAddress = getFromAddress();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();

  // ---------------------------------------------------------------------------
  // Priority A: Resend HTTPS API (Port 443)
  // ---------------------------------------------------------------------------
  if (resendApiKey) {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [to],
          subject,
          html,
        }),
      });

      if (response.ok) {
        console.log(`✅ Email sent successfully via Resend API to: ${to}`);
        await logEmail(fromAddress, to, subject, html, "Sent");
        return;
      }

      // Handle non-2xx response from Resend
      const errorBody = await response.json().catch(() => null);
      const errorMessage =
        (errorBody && typeof errorBody === "object" && (errorBody.message || JSON.stringify(errorBody))) ||
        `HTTP ${response.status} ${response.statusText}`;

      console.error(`❌ Resend API delivery failed for recipient (${to}):`, errorMessage);
      await logEmail(fromAddress, to, subject, html, "Failed");
    } catch (fetchError: any) {
      console.error(`❌ Resend API network exception for recipient (${to}):`, fetchError?.message || fetchError);
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
