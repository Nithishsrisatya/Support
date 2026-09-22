// src/templates/operationalEmails.ts
import { escapeHtml, sanitizeUrl, sanitizeSubject } from "../utils/htmlSanitizer";

// ──────────────────────────────────────────────
// PASSWORD EMAIL TEMPLATES
// ──────────────────────────────────────────────

export const forgotPasswordTemplate = (name: string, resetLink: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">Password Reset Request</h2>
  </div>
  <p>Hello ${escapeHtml(name)},</p>
  <p>We received a request to reset the password for your Complify Support account.</p>
  <p>Click the button below to set a new password. This link expires in <strong>30 minutes</strong>.</p>
  <div style="text-align: center; margin: 25px 0;">
    <a href="${sanitizeUrl(resetLink)}" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
  </div>
  <p style="color: #71717a; font-size: 13px;">If you did not request a password reset, please ignore this email or contact your system administrator.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const resetPasswordConfirmationTemplate = (name: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #10b981; margin: 0;">Password Changed Successfully</h2>
  </div>
  <p>Hello ${escapeHtml(name)},</p>
  <p>Your password has been successfully updated.</p>
  <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0; color: #065f46;">If you did not make this change, please contact your system administrator immediately.</p>
  </div>
  <p>You can now log in with your new password.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const adminResetPasswordTemplate = (name: string, tempPassword: string, adminName: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">Account Password Reset by Administrator</h2>
  </div>
  <p>Hello ${escapeHtml(name)},</p>
  <p>An administrator (<strong>${escapeHtml(adminName)}</strong>) has reset your account password.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 25px 0;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">YOUR TEMPORARY PASSWORD</p>
    <p style="margin: 0;"><span style="font-family: monospace; font-size: 16px; font-weight: bold; background: #e0e7ff; color: #4f46e5; padding: 4px 8px; border-radius: 4px;">${escapeHtml(tempPassword)}</span></p>
  </div>
  <p style="color: #dc2626; font-size: 14px; font-weight: bold;">You will be required to change this password upon your next login.</p>
  <p>Please access the <a href="${sanitizeUrl(process.env.FRONTEND_URL || 'http://localhost:5173')}" style="color: #4f46e5; text-decoration: none; font-weight: bold;">Portal</a> to sign in.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

// ──────────────────────────────────────────────
// TICKET EMAIL TEMPLATES
// ──────────────────────────────────────────────

export const ticketAssignedTemplate = (employeeName: string, ticketId: string, subject: string, priority: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">New Support Ticket Assigned</h2>
  </div>
  <p>Hello ${escapeHtml(employeeName)},</p>
  <p>A new support ticket has been routed to your workspace. Please review the details below and acknowledge receipt in your dashboard.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Ticket ID:</strong> ${escapeHtml(ticketId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <p style="margin: 0;"><strong>Priority:</strong> <span style="color: ${priority === 'Critical' ? '#dc2626' : '#4f46e5'}; font-weight: bold;">${escapeHtml(priority)}</span></p>
  </div>
  <p>Access your <a href="${sanitizeUrl((process.env.FRONTEND_URL || 'http://localhost:5173') + '/employee-dashboard')}" style="color: #4f46e5; text-decoration: none; font-weight: bold;">Employee Dashboard</a> to begin work.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const ticketCreatedTemplate = (clientName: string, ticketId: string, subject: string, companyName: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">New Support Ticket Created</h2>
  </div>
  <p>Hello ${escapeHtml(clientName)},</p>
  <p>A new support ticket has been registered for <strong>${escapeHtml(companyName)}</strong>.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Ticket ID:</strong> ${escapeHtml(ticketId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
  </div>
  <p>Our support team will review your request and assign it to the appropriate engineer shortly.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const ticketStatusChangedTemplate = (clientName: string, ticketId: string, subject: string, oldStatus: string, newStatus: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #4f46e5; margin: 0;">Support Ticket Status Updated</h2>
  </div>
  <p>Hello ${escapeHtml(clientName)},</p>
  <p>The status of your support ticket has been updated.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Ticket ID:</strong> ${escapeHtml(ticketId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <p style="margin: 0 0 5px 0;"><strong>Status:</strong></p>
    <p style="margin: 0;">
      <span style="background: #f4f4f5; padding: 4px 10px; border-radius: 4px; color: #71717a;">${escapeHtml(oldStatus)}</span>
      <span style="margin: 0 8px; color: #71717a;">→</span>
      <span style="background: #e0e7ff; padding: 4px 10px; border-radius: 4px; color: #4f46e5; font-weight: bold;">${escapeHtml(newStatus)}</span>
    </p>
  </div>
  <p>Please log in to your <a href="${sanitizeUrl(process.env.FRONTEND_URL || 'http://localhost:5173')}" style="color: #4f46e5; text-decoration: none; font-weight: bold;">Client Portal</a> for the latest details.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const ticketResolvedTemplate = (clientName: string, ticketId: string, subject: string, resolutionSummary: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #10b981; margin: 0;">Support Request Resolved</h2>
  </div>
  <p>Hello ${escapeHtml(clientName)},</p>
  <p>Our engineering team has marked your recent support request (<strong>${escapeHtml(subject)}</strong>) as Resolved.</p>
  <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0; color: #065f46;"><strong>Resolution Notes:</strong></p>
    <p style="margin: 0; color: #047857; font-style: italic;">"${escapeHtml(resolutionSummary)}"</p>
  </div>
  <p>Please log in to your <a href="${sanitizeUrl(process.env.FRONTEND_URL || 'http://localhost:5173')}" style="color: #4f46e5; text-decoration: none; font-weight: bold;">Client Portal</a> to confirm this resolution and close the ticket.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const ticketClosedTemplate = (clientName: string, ticketId: string, subject: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">Support Ticket Closed</h2>
  </div>
  <p>Hello ${escapeHtml(clientName)},</p>
  <p>Support ticket (<strong>${escapeHtml(subject)}</strong>) has been officially closed.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Ticket ID:</strong> ${escapeHtml(ticketId)}</p>
    <p style="margin: 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
  </div>
  <p>Thank you for your patience. If you require further assistance, please create a new support ticket.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

// ──────────────────────────────────────────────
// TASK EMAIL TEMPLATES
// ──────────────────────────────────────────────

export const taskUpdatedTemplate = (employeeName: string, taskId: string, title: string, updatedBy: string, changes: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #4f46e5; margin: 0;">Task Updated</h2>
  </div>
  <p>Hello ${escapeHtml(employeeName)},</p>
  <p><strong>${escapeHtml(updatedBy)}</strong> has made changes to a task assigned to you.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Task Ref:</strong> ${escapeHtml(taskId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Title:</strong> ${escapeHtml(title)}</p>
    <p style="margin: 0; font-style: italic; color: #52525b;">${escapeHtml(changes)}</p>
  </div>
  <p>Access your <a href="${sanitizeUrl((process.env.FRONTEND_URL || 'http://localhost:5173') + '/employee-dashboard')}" style="color: #4f46e5; text-decoration: none; font-weight: bold;">Employee Dashboard</a> to view the latest updates.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const taskAssignedTemplate = (
  employeeName: string,
  taskId: string,
  title: string,
  dueDate?: string | null,
  description?: string | null,
  priority?: string | null
) => {
  const formattedDueDate = dueDate ? new Date(dueDate).toLocaleDateString() : "No deadline set";
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">New Internal Task Assigned</h2>
  </div>
  <p>Hello ${escapeHtml(employeeName)},</p>
  <p>Management has assigned a new operational task to your queue. Please ensure completion prior to the required deadline.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Task Ref:</strong> ${escapeHtml(taskId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Title:</strong> ${escapeHtml(title)}</p>
    ${priority ? `<p style="margin: 0 0 10px 0;"><strong>Priority:</strong> ${escapeHtml(priority)}</p>` : ""}
    ${description ? `<p style="margin: 0 0 10px 0;"><strong>Description:</strong> ${escapeHtml(description)}</p>` : ""}
    <p style="margin: 0; color: #ea580c; font-weight: bold;"><strong>Deadline:</strong> ${escapeHtml(formattedDueDate)}</p>
  </div>
  <p>Access your <a href="${sanitizeUrl((process.env.FRONTEND_URL || 'http://localhost:5173') + '/employee-dashboard')}" style="color: #4f46e5; text-decoration: none; font-weight: bold;">Employee Dashboard</a> to view full details.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;
};

export const taskCompletedTemplate = (managerName: string, employeeName: string, taskId: string, title: string, completionNotes: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #10b981; margin: 0;">Task Completed</h2>
  </div>
  <p>Hello ${escapeHtml(managerName)},</p>
  <p>Employee <strong>${escapeHtml(employeeName)}</strong> has marked the following task as completed.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Task Ref:</strong> ${escapeHtml(taskId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Title:</strong> ${escapeHtml(title)}</p>
    <p style="margin: 0; font-style: italic; color: #52525b;">"${escapeHtml(completionNotes || 'No notes provided')}"</p>
  </div>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const taskReminderTemplate = (employeeName: string, taskId: string, title: string, dueDate: string) => {
  const formattedDueDate = new Date(dueDate).toLocaleDateString();
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #ea580c; margin: 0;">Task Reminder: Upcoming Deadline</h2>
  </div>
  <p>Hello ${escapeHtml(employeeName)},</p>
  <p>This is a reminder that the following task is approaching its deadline.</p>
  <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Task Ref:</strong> ${escapeHtml(taskId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Title:</strong> ${escapeHtml(title)}</p>
    <p style="margin: 0; color: #c2410c; font-weight: bold;"><strong>Due By:</strong> ${escapeHtml(formattedDueDate)}</p>
  </div>
  <p>Please ensure completion before the deadline to avoid escalation.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;
};

// ──────────────────────────────────────────────
// REMINDER / ESCALATION EMAIL TEMPLATES
// ──────────────────────────────────────────────

export const overdueTicketReminderTemplate = (employeeName: string, ticketId: string, subject: string, daysOverdue: number, priority: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #dc2626; margin: 0;">SLA Breach Alert: Overdue Ticket</h2>
  </div>
  <p>Hello ${escapeHtml(employeeName)},</p>
  <p><strong>Urgent:</strong> A ticket assigned to you has exceeded its SLA response time.</p>
  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Ticket ID:</strong> ${escapeHtml(ticketId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Priority:</strong> <span style="color: ${priority === 'Critical' ? '#dc2626' : '#ea580c'}; font-weight: bold;">${escapeHtml(priority)}</span></p>
    <p style="margin: 0; color: #dc2626; font-weight: bold;"><strong>Overdue by:</strong> ${escapeHtml(daysOverdue)} day(s)</p>
  </div>
  <p>Immediate action is required to resolve this ticket and prevent further escalation.</p>
  <p>Access your <a href="${sanitizeUrl((process.env.FRONTEND_URL || 'http://localhost:5173') + '/employee-dashboard')}" style="color: #4f46e5; text-decoration: none; font-weight: bold;">Employee Dashboard</a> now.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

export const slaReminderTemplate = (employeeName: string, ticketId: string, subject: string, slaDeadline: string, priority: string) => {
  const formattedDeadline = new Date(slaDeadline).toLocaleString();
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #ea580c; margin: 0;">SLA Deadline Approaching</h2>
  </div>
  <p>Hello ${escapeHtml(employeeName)},</p>
  <p>This is a courtesy reminder that the SLA deadline for the following ticket is approaching.</p>
  <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Ticket ID:</strong> ${escapeHtml(ticketId)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Priority:</strong> <span style="color: ${priority === 'Critical' ? '#dc2626' : '#ea580c'}; font-weight: bold;">${escapeHtml(priority)}</span></p>
    <p style="margin: 0; color: #c2410c; font-weight: bold;"><strong>SLA Deadline:</strong> ${escapeHtml(formattedDeadline)}</p>
  </div>
  <p>Please prioritize this ticket to meet your SLA commitments.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;
};

export const escalationTemplate = (employeeName: string, taskId: string, title: string, managerName: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #dc2626; margin: 0;">⚠️ Task Escalated to Management</h2>
  </div>
  <p>Hello ${escapeHtml(employeeName)},</p>
  <p>Your task has been escalated to <strong>${escapeHtml(managerName)}</strong> for review and intervention.</p>
  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Task Ref:</strong> ${escapeHtml(taskId)}</p>
    <p style="margin: 0;"><strong>Title:</strong> ${escapeHtml(title)}</p>
  </div>
  <p>Please coordinate with your manager to resolve any blockers preventing completion.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;

// ──────────────────────────────────────────────
// CLIENT WELCOME TEMPLATE
// ──────────────────────────────────────────────

export const clientWelcomeTemplate = (contactName: string, companyName: string, tempPassword: string) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">Welcome to Complify Global Support</h2>
  </div>
  <p>Hello ${escapeHtml(contactName)},</p>
  <p>An enterprise support portal has been successfully provisioned for <strong>${escapeHtml(companyName)}</strong>.</p>
  <p>You can use this portal to submit secure support requests, track SLAs, and communicate directly with our engineering team.</p>
  
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 25px 0;">
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">YOUR TEMPORARY CREDENTIALS</p>
    <p style="margin: 0 0 10px 0;"><strong>Login URL:</strong> <a href="${sanitizeUrl(process.env.FRONTEND_URL || 'http://localhost:5173')}" style="color: #4f46e5; text-decoration: none;">Access Portal</a></p>
    <p style="margin: 0;"><strong>Temporary Password:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; background: #e0e7ff; color: #4f46e5; padding: 4px 8px; border-radius: 4px;">${escapeHtml(tempPassword)}</span></p>
  </div>

  <p style="color: #dc2626; font-size: 14px; font-weight: bold;">Security Notice: For your protection, you will be required to change this password immediately upon your first login.</p>
  <p style="font-size: 12px; color: #71717a; margin-top: 40px;">Complify Global Systems</p>
</div>
`;

// ──────────────────────────────────────────────
// DEADLINE MANAGEMENT NOTIFICATION TEMPLATES
// ──────────────────────────────────────────────

export interface DeadlineEmailParams {
  recipientName: string;
  recipientRole: "Assignee" | "Manager";
  itemType: "Ticket" | "Task";
  itemId: string;
  titleOrSubject: string;
  dueDate: string | Date;
  status: string;
  stage: "DUE_TOMORROW" | "DUE_TODAY" | "OVERDUE";
  employeeName?: string;
  clientName?: string;
}

export function getDeadlineEmailSubject(params: DeadlineEmailParams): string {
  const stageLabels: Record<DeadlineEmailParams["stage"], string> = {
    DUE_TOMORROW: "Due Tomorrow",
    DUE_TODAY: "Due Today",
    OVERDUE: "Overdue",
  };
  const stageText = stageLabels[params.stage];
  let rawSubject: string;
  if (params.recipientRole === "Manager" && params.employeeName) {
    rawSubject = `[Complify] ${params.itemType} ${stageText} (${params.employeeName}): ${params.titleOrSubject}`;
  } else {
    rawSubject = `[Complify] ${params.itemType} ${stageText}: ${params.titleOrSubject}`;
  }
  return sanitizeSubject(rawSubject);
}

export function deadlineNotificationEmailTemplate(params: DeadlineEmailParams): string {
  const formattedDueDate = new Date(params.dueDate).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const stageTheme = {
    DUE_TOMORROW: {
      color: "#ea580c",
      bgColor: "#fff7ed",
      borderColor: "#fed7aa",
      title: `${params.itemType} Approaching Deadline — Due Tomorrow`,
    },
    DUE_TODAY: {
      color: "#f59e0b",
      bgColor: "#fefce8",
      borderColor: "#fef08a",
      title: `${params.itemType} Due Today`,
    },
    OVERDUE: {
      color: "#dc2626",
      bgColor: "#fef2f2",
      borderColor: "#fecaca",
      title: `⚠️ ${params.itemType} Overdue Notice`,
    },
  }[params.stage];

  const portalLink =
    params.recipientRole === "Manager"
      ? `${process.env.FRONTEND_URL || "http://localhost:5173"}/manager-dashboard`
      : `${process.env.FRONTEND_URL || "http://localhost:5173"}/employee-dashboard`;

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: ${stageTheme.color}; margin: 0;">${stageTheme.title}</h2>
  </div>
  <p>Hello ${escapeHtml(params.recipientName)},</p>
  ${
    params.recipientRole === "Manager"
      ? `<p>The following ${escapeHtml(params.itemType.toLowerCase())} assigned to your supervised team member <strong>${escapeHtml(params.employeeName || "Team Member")}</strong> requires attention.</p>`
      : `<p>This is an automated deadline notification regarding a ${escapeHtml(params.itemType.toLowerCase())} currently assigned to you.</p>`
  }
  <div style="background-color: ${stageTheme.bgColor}; border: 1px solid ${stageTheme.borderColor}; border-radius: 8px; padding: 18px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>${escapeHtml(params.itemType)} ID:</strong> <span style="font-family: monospace; font-weight: bold;">${escapeHtml(params.itemId)}</span></p>
    <p style="margin: 0 0 10px 0;"><strong>${params.itemType === "Ticket" ? "Subject" : "Title"}:</strong> ${escapeHtml(params.titleOrSubject)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Due Date:</strong> <span style="color: ${stageTheme.color}; font-weight: bold;">${escapeHtml(formattedDueDate)}</span></p>
    <p style="margin: 0 0 10px 0;"><strong>Current Status:</strong> <span style="font-weight: 600;">${escapeHtml(params.status)}</span></p>
    ${
      params.employeeName
        ? `<p style="margin: 0 0 10px 0;"><strong>Assigned Employee:</strong> <span style="font-weight: bold; color: #4f46e5;">${escapeHtml(params.employeeName)}</span></p>`
        : ""
    }
    ${
      params.clientName
        ? `<p style="margin: 0;"><strong>Client:</strong> ${escapeHtml(params.clientName)}</p>`
        : ""
    }
  </div>
  <p>Access your workspace to view the item and update progress:</p>
  <div style="margin: 20px 0;">
    <a href="${sanitizeUrl(portalLink)}" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; display: inline-block;">
      Open ${params.recipientRole === "Manager" ? "Manager" : "Employee"} Workspace
    </a>
  </div>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;
}

// ──────────────────────────────────────────────
// PHASE 3: WEEKLY PENDING WORK EMAIL TEMPLATES
// ──────────────────────────────────────────────

export interface PendingWorkItem {
  id: string;
  type: "Ticket" | "Task";
  title: string;
  dueDate: string | null;
  priority: string;
  status: string;
  stage: "OVERDUE" | "DUE_TODAY" | "DUE_TOMORROW" | "UPCOMING";
  assignedToName?: string;
  clientName?: string;
}

export interface EmployeeWeeklyPendingEmailParams {
  employeeName: string;
  weekStartDate: string;
  totalPending: number;
  overdueCount: number;
  dueTodayCount: number;
  dueTomorrowCount: number;
  upcomingCount: number;
  overdueItems: PendingWorkItem[];
  dueTodayItems: PendingWorkItem[];
  dueTomorrowItems: PendingWorkItem[];
  upcomingItems: PendingWorkItem[];
}

export interface ManagerTeamMemberStats {
  employeeId: string;
  employeeName: string;
  totalPending: number;
  overdueCount: number;
  dueTodayCount: number;
  dueTomorrowCount: number;
  upcomingCount: number;
}

export interface ManagerWeeklyPendingEmailParams {
  managerName: string;
  weekStartDate: string;
  totalPending: number;
  overdueCount: number;
  dueTodayCount: number;
  dueTomorrowCount: number;
  upcomingCount: number;
  overdueItems: PendingWorkItem[];
  dueTodayItems: PendingWorkItem[];
  dueTomorrowItems: PendingWorkItem[];
  upcomingItems: PendingWorkItem[];
  teamStats: ManagerTeamMemberStats[];
}

function renderItemListHtml(items: PendingWorkItem[], color: string, emptyLabel: string = "None"): string {
  if (!items || items.length === 0) {
    return `<p style="color: #71717a; font-style: italic; margin: 4px 0 12px 0;">${escapeHtml(emptyLabel)}</p>`;
  }

  const rows = items
    .map(
      (item) => `
    <tr style="border-bottom: 1px solid #e4e4e7;">
      <td style="padding: 8px 12px; font-family: monospace; font-size: 12px; font-weight: bold; color: #18181b;">${escapeHtml(item.id)}</td>
      <td style="padding: 8px 12px; font-size: 13px; color: #27272a;">
        <strong>[${escapeHtml(item.type)}]</strong> ${escapeHtml(item.title)}
        ${item.clientName ? `<div style="font-size: 11px; color: #71717a;">Client: ${escapeHtml(item.clientName)}</div>` : ""}
        ${item.assignedToName ? `<div style="font-size: 11px; color: #6366f1;">Assignee: ${escapeHtml(item.assignedToName)}</div>` : ""}
      </td>
      <td style="padding: 8px 12px; font-size: 12px; color: #52525b;">${escapeHtml(item.priority)}</td>
      <td style="padding: 8px 12px; font-size: 12px; font-weight: 600; color: ${color};">
        ${escapeHtml(item.dueDate ? String(item.dueDate).split("T")[0] : "No date")}
      </td>
      <td style="padding: 8px 12px; font-size: 12px; color: #71717a;">${escapeHtml(item.status)}</td>
    </tr>`
    )
    .join("");

  return `
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; background-color: #ffffff; border-radius: 6px; overflow: hidden; border: 1px solid #e4e4e7;">
    <thead>
      <tr style="background-color: #f4f4f5; text-align: left; font-size: 11px; text-transform: uppercase; color: #71717a;">
        <th style="padding: 8px 12px;">ID</th>
        <th style="padding: 8px 12px;">Item</th>
        <th style="padding: 8px 12px;">Priority</th>
        <th style="padding: 8px 12px;">Due Date</th>
        <th style="padding: 8px 12px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

export function employeeWeeklyPendingWorkEmailTemplate(params: EmployeeWeeklyPendingEmailParams): string {
  const portalLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/employee-dashboard`;

  return `
<div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #18181b; background-color: #fafafa;">
  <div style="background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: #4f46e5; margin: 0; font-size: 20px;">📋 Weekly Pending-Work Summary</h2>
      <p style="color: #71717a; margin: 4px 0 0 0; font-size: 13px;">Week of ${escapeHtml(params.weekStartDate)}</p>
    </div>

    <p>Hello <strong>${escapeHtml(params.employeeName)}</strong>,</p>
    <p>Here is your weekly summary of currently pending tickets and tasks to help plan your week ahead.</p>

    <!-- KPI Summary Cards -->
    <div style="display: table; width: 100%; margin: 20px 0;">
      <div style="display: table-cell; width: 25%; padding: 10px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #dc2626;">Overdue</div>
        <div style="font-size: 22px; font-weight: bold; color: #dc2626; margin-top: 4px;">${params.overdueCount}</div>
      </div>
      <div style="display: table-cell; width: 25%; padding: 10px; background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #ea580c;">Due Today</div>
        <div style="font-size: 22px; font-weight: bold; color: #ea580c; margin-top: 4px;">${params.dueTodayCount}</div>
      </div>
      <div style="display: table-cell; width: 25%; padding: 10px; background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #ca8a04;">Due Tomorrow</div>
        <div style="font-size: 22px; font-weight: bold; color: #ca8a04; margin-top: 4px;">${params.dueTomorrowCount}</div>
      </div>
      <div style="display: table-cell; width: 25%; padding: 10px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #2563eb;">Upcoming</div>
        <div style="font-size: 22px; font-weight: bold; color: #2563eb; margin-top: 4px;">${params.upcomingCount}</div>
      </div>
    </div>

    ${
      params.overdueCount > 0
        ? `
      <h3 style="color: #dc2626; font-size: 15px; margin: 18px 0 8px 0;">🚨 Overdue Items (${params.overdueCount})</h3>
      ${renderItemListHtml(params.overdueItems, "#dc2626")}
    `
        : ""
    }

    ${
      params.dueTodayCount > 0
        ? `
      <h3 style="color: #ea580c; font-size: 15px; margin: 18px 0 8px 0;">⏰ Due Today (${params.dueTodayCount})</h3>
      ${renderItemListHtml(params.dueTodayItems, "#ea580c")}
    `
        : ""
    }

    ${
      params.dueTomorrowCount > 0
        ? `
      <h3 style="color: #ca8a04; font-size: 15px; margin: 18px 0 8px 0;">📅 Due Tomorrow (${params.dueTomorrowCount})</h3>
      ${renderItemListHtml(params.dueTomorrowItems, "#ca8a04")}
    `
        : ""
    }

    ${
      params.upcomingCount > 0
        ? `
      <h3 style="color: #2563eb; font-size: 15px; margin: 18px 0 8px 0;">🗓️ Upcoming Items (${params.upcomingCount})</h3>
      ${renderItemListHtml(params.upcomingItems, "#2563eb")}
    `
        : ""
    }

    ${
      params.totalPending === 0
        ? `<p style="color: #16a34a; font-weight: bold; text-align: center; padding: 20px; background-color: #f0fdf4; border-radius: 8px;">🎉 You currently have zero pending work items!</p>`
        : ""
    }

    <div style="margin: 24px 0; text-align: center;">
      <a href="${sanitizeUrl(portalLink)}" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
        Open Employee Workspace
      </a>
    </div>

    <p style="font-size: 12px; color: #71717a; text-align: center; margin-top: 30px;">Complify Support Automated Weekly Digest</p>
  </div>
</div>
`;
}

export function managerWeeklyPendingWorkEmailTemplate(params: ManagerWeeklyPendingEmailParams): string {
  const portalLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/manager-dashboard`;

  const teamStatsRows = params.teamStats
    .map(
      (m) => `
    <tr style="border-bottom: 1px solid #e4e4e7;">
      <td style="padding: 8px 12px; font-weight: 600; color: #18181b;">${escapeHtml(m.employeeName)}</td>
      <td style="padding: 8px 12px; font-weight: bold; text-align: center; color: #4f46e5;">${m.totalPending}</td>
      <td style="padding: 8px 12px; font-weight: bold; text-align: center; color: ${m.overdueCount > 0 ? "#dc2626" : "#71717a"};">${m.overdueCount}</td>
      <td style="padding: 8px 12px; font-weight: bold; text-align: center; color: ${m.dueTodayCount > 0 ? "#ea580c" : "#71717a"};">${m.dueTodayCount}</td>
      <td style="padding: 8px 12px; font-weight: bold; text-align: center; color: ${m.dueTomorrowCount > 0 ? "#ca8a04" : "#71717a"};">${m.dueTomorrowCount}</td>
      <td style="padding: 8px 12px; text-align: center; color: #2563eb;">${m.upcomingCount}</td>
    </tr>`
    )
    .join("");

  return `
<div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #18181b; background-color: #fafafa;">
  <div style="background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px;">
      <h2 style="color: #4f46e5; margin: 0; font-size: 20px;">👥 Manager Weekly Team Pending-Work Summary</h2>
      <p style="color: #71717a; margin: 4px 0 0 0; font-size: 13px;">Week of ${escapeHtml(params.weekStartDate)}</p>
    </div>

    <p>Hello <strong>${escapeHtml(params.managerName)}</strong>,</p>
    <p>Here is your weekly management overview of pending tickets and tasks across your team.</p>

    <!-- KPI Summary Cards -->
    <div style="display: table; width: 100%; margin: 20px 0;">
      <div style="display: table-cell; width: 20%; padding: 10px; background-color: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #52525b;">Total Pending</div>
        <div style="font-size: 22px; font-weight: bold; color: #18181b; margin-top: 4px;">${params.totalPending}</div>
      </div>
      <div style="display: table-cell; width: 20%; padding: 10px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #dc2626;">Overdue</div>
        <div style="font-size: 22px; font-weight: bold; color: #dc2626; margin-top: 4px;">${params.overdueCount}</div>
      </div>
      <div style="display: table-cell; width: 20%; padding: 10px; background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #ea580c;">Due Today</div>
        <div style="font-size: 22px; font-weight: bold; color: #ea580c; margin-top: 4px;">${params.dueTodayCount}</div>
      </div>
      <div style="display: table-cell; width: 20%; padding: 10px; background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #ca8a04;">Due Tomorrow</div>
        <div style="font-size: 22px; font-weight: bold; color: #ca8a04; margin-top: 4px;">${params.dueTomorrowCount}</div>
      </div>
      <div style="display: table-cell; width: 20%; padding: 10px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #2563eb;">Upcoming</div>
        <div style="font-size: 22px; font-weight: bold; color: #2563eb; margin-top: 4px;">${params.upcomingCount}</div>
      </div>
    </div>

    <!-- Team Members Workload Table -->
    <h3 style="color: #18181b; font-size: 15px; margin: 20px 0 8px 0;">📊 Team Member Workload Breakdown</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #ffffff; border-radius: 6px; overflow: hidden; border: 1px solid #e4e4e7;">
      <thead>
        <tr style="background-color: #f4f4f5; text-align: left; font-size: 11px; text-transform: uppercase; color: #71717a;">
          <th style="padding: 8px 12px;">Team Member</th>
          <th style="padding: 8px 12px; text-align: center;">Total</th>
          <th style="padding: 8px 12px; text-align: center; color: #dc2626;">Overdue</th>
          <th style="padding: 8px 12px; text-align: center; color: #ea580c;">Today</th>
          <th style="padding: 8px 12px; text-align: center; color: #ca8a04;">Tomorrow</th>
          <th style="padding: 8px 12px; text-align: center; color: #2563eb;">Upcoming</th>
        </tr>
      </thead>
      <tbody>
        ${teamStatsRows || `<tr><td colspan="6" style="padding: 12px; text-align: center; color: #71717a;">No team members assigned.</td></tr>`}
      </tbody>
    </table>

    ${
      params.overdueCount > 0
        ? `
      <h3 style="color: #dc2626; font-size: 15px; margin: 18px 0 8px 0;">🚨 Team Overdue Items (${params.overdueCount})</h3>
      ${renderItemListHtml(params.overdueItems, "#dc2626")}
    `
        : ""
    }

    ${
      params.dueTodayCount > 0
        ? `
      <h3 style="color: #ea580c; font-size: 15px; margin: 18px 0 8px 0;">⏰ Team Items Due Today (${params.dueTodayCount})</h3>
      ${renderItemListHtml(params.dueTodayItems, "#ea580c")}
    `
        : ""
    }

    ${
      params.dueTomorrowCount > 0
        ? `
      <h3 style="color: #ca8a04; font-size: 15px; margin: 18px 0 8px 0;">📅 Team Items Due Tomorrow (${params.dueTomorrowCount})</h3>
      ${renderItemListHtml(params.dueTomorrowItems, "#ca8a04")}
    `
        : ""
    }

    <div style="margin: 24px 0; text-align: center;">
      <a href="${sanitizeUrl(portalLink)}" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
        Open Manager Workspace
      </a>
    </div>

    <p style="font-size: 12px; color: #71717a; text-align: center; margin-top: 30px;">Complify Support Automated Weekly Digest</p>
  </div>
</div>
`;
}

// ──────────────────────────────────────────────
// ADMINISTRATOR CREATION NOTIFICATION TEMPLATES
// ──────────────────────────────────────────────

export interface AdminNewTicketEmailParams {
  adminName: string;
  ticketId: string;
  subject: string;
  priority: string;
  category?: string | null;
  clientName?: string | null;
  description?: string | null;
  createdAt?: string | Date | null;
}

export function adminNewTicketTemplate(params: AdminNewTicketEmailParams): string {
  const portalLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/manager-dashboard`;
  const priorityColor = params.priority === "Critical" ? "#dc2626" : params.priority === "High" ? "#ea580c" : "#4f46e5";

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">New Support Ticket Created</h2>
    <p style="color: #71717a; margin: 5px 0 0; font-size: 13px;">Administrator Notification Alert</p>
  </div>
  <p>Hello ${escapeHtml(params.adminName)},</p>
  <p>A new customer support ticket has been logged in the system and requires operational review.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Ticket ID:</strong> <span style="font-family: monospace; font-weight: bold;">${escapeHtml(params.ticketId)}</span></p>
    <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(params.subject)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Priority:</strong> <span style="color: ${priorityColor}; font-weight: bold;">${escapeHtml(params.priority)}</span></p>
    ${params.category ? `<p style="margin: 0 0 10px 0;"><strong>Category:</strong> ${escapeHtml(params.category)}</p>` : ""}
    ${params.clientName ? `<p style="margin: 0 0 10px 0;"><strong>Client / Company:</strong> ${escapeHtml(params.clientName)}</p>` : ""}
    ${params.description ? `<p style="margin: 0 0 10px 0;"><strong>Description:</strong> ${escapeHtml(params.description)}</p>` : ""}
  </div>
  <p>Review this ticket in your administration workspace:</p>
  <div style="margin: 20px 0;">
    <a href="${sanitizeUrl(portalLink)}" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; display: inline-block;">
      Open Management Workspace
    </a>
  </div>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;
}

export interface AdminNewTaskEmailParams {
  adminName: string;
  taskId: string;
  title: string;
  priority: string;
  category?: string | null;
  assignedEmployeeName?: string | null;
  dueDate?: string | Date | null;
  description?: string | null;
}

export function adminNewTaskTemplate(params: AdminNewTaskEmailParams): string {
  const portalLink = `${process.env.FRONTEND_URL || "http://localhost:5173"}/tasks`;
  const formattedDueDate = params.dueDate ? new Date(params.dueDate).toLocaleDateString() : "No deadline set";
  const priorityColor = params.priority === "Critical" ? "#dc2626" : params.priority === "High" ? "#ea580c" : "#4f46e5";

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-bottom: 2px solid #f4f4f5; padding-bottom: 15px; margin-bottom: 20px;">
    <h2 style="color: #18181b; margin: 0;">New Internal Task Created</h2>
    <p style="color: #71717a; margin: 5px 0 0; font-size: 13px;">Administrator Notification Alert</p>
  </div>
  <p>Hello ${escapeHtml(params.adminName)},</p>
  <p>A new operational task has been created in Complify Support.</p>
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
    <p style="margin: 0 0 10px 0;"><strong>Task Ref:</strong> <span style="font-family: monospace; font-weight: bold;">${escapeHtml(params.taskId)}</span></p>
    <p style="margin: 0 0 10px 0;"><strong>Title:</strong> ${escapeHtml(params.title)}</p>
    <p style="margin: 0 0 10px 0;"><strong>Priority:</strong> <span style="color: ${priorityColor}; font-weight: bold;">${escapeHtml(params.priority)}</span></p>
    ${params.category ? `<p style="margin: 0 0 10px 0;"><strong>Category:</strong> ${escapeHtml(params.category)}</p>` : ""}
    <p style="margin: 0 0 10px 0;"><strong>Assigned To:</strong> ${escapeHtml(params.assignedEmployeeName || "Unassigned")}</p>
    <p style="margin: 0 0 10px 0;"><strong>Deadline:</strong> ${escapeHtml(formattedDueDate)}</p>
    ${params.description ? `<p style="margin: 0;"><strong>Description:</strong> ${escapeHtml(params.description)}</p>` : ""}
  </div>
  <p>Review this task in your administration workspace:</p>
  <div style="margin: 20px 0;">
    <a href="${sanitizeUrl(portalLink)}" style="background-color: #4f46e5; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; display: inline-block;">
      Open Task Workspace
    </a>
  </div>
  <p style="font-size: 12px; color: #71717a; margin-top: 30px;">Complify Global Support System</p>
</div>
`;
}


