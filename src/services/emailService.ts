import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { logEmail } from "./emailLogService";

dotenv.config();

const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_ADDRESS = process.env.EMAIL_FROM || process.env.SMTP_FROM || "noreply@complify.com";

export async function sendEmail(
  to: string,
  subject: string,
  html: string
) {
  // Development mode
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("\n==================================");
    console.log("EMAIL PREVIEW");
    console.log("==================================");
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Content:\n", html);
    console.log("==================================\n");

    // Log the email preview to database
    await logEmail(FROM_ADDRESS, to, subject, html, "Preview");

    return;
  }

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    });

    // Log successfully sent email
    await logEmail(FROM_ADDRESS, to, subject, html, "Sent");
  } catch (error) {
    console.error("Email send failed:", error);

    // Log failed email
    await logEmail(FROM_ADDRESS, to, subject, html, "Failed");
  }
}
