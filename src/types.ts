/**
 * Types & Enums for the Integrated Support Ticket & Task Management System
 */

export type UserRole = "Administrator" | "Manager" | "Employee" | "Client";

export type UserStatus = "Active" | "Inactive" | "Disabled" | "Suspended";

export interface User {
  id: string; // UserID
  fullName: string;
  email: string;
  passwordHash: string; // Stores mocked encrypted/hashed passwords
  role: UserRole;
  department: string; // Support, Operations, Administration, etc.
  managerId: string | null; // ManagerID (Foreign Key)
  status: UserStatus;
  createdDate: string;
  updatedDate: string;
  firstLogin?: boolean;
  first_login?: boolean;
}

export type ClientStatus = "Active" | "Inactive" | "Disabled" | "Suspended" | "Pending Activation";

export interface Client {
  id: string; // ClientID
  companyName: string;
  companyDomain?: string;
  contactPerson: string;
  email: string;
  phoneNumber: string;
  city?: string;
  status: ClientStatus;
  createdDate: string;
  updatedDate: string;
  firstLogin?: boolean;
}

export type TicketCategory = "Technical Issue" | "Account Issue" | "Billing Issue" | "Service Request" | "General Inquiry";

export type TicketPriority = "Low" | "Medium" | "High" | "Critical";

export type TicketStatus = "New" | "Assigned" | "In Progress" | "Pending" | "Resolved" | "Closed";
export const TERMINAL_TICKET_STATUSES: readonly TicketStatus[] = ["Resolved", "Closed"] as const;
export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = ["New", "Assigned", "In Progress", "Pending"] as const;

export interface Ticket {
  id: string; // TicketID
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo: string | null; // UserID (Employee)
  clientId: string; // ClientID
  createdDate: string;
  updatedDate: string;
  dueDate?: string | null;
  completedAt?: string | null;
  isOverdue?: boolean;
  resolutionSummary?: string;
  resolutionDate?: string;
  employeeNotes?: string;
satisfactionRating?: number; // 1-5 scale for metrics
  satisfactionNotes?: string;
  history: TicketHistoryEntry[];
}

export interface TicketHistoryEntry {
  timestamp: string;
  status: TicketStatus;
  updatedBy: string; // FullName who changed it
  comment: string;
}

export type TaskCategory = "Operational" | "Support" | "Administrative" | "Documentation" | "Compliance";

export type TaskPriority = "Low" | "Medium" | "High" | "Critical";

export type TaskStatus = "Pending" | "Assigned" | "In Progress" | "Completed" | "Overdue" | "Escalated";
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ["Completed"] as const;
export const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = ["Pending", "Assigned", "In Progress", "Overdue", "Escalated"] as const;

export type ReviewStatus = "Pending Review" | "Approved" | "Rejected";

export interface TaskProgressUpdate {
  id: string;
  taskId: string;
  userId: string;
  userFullName: string;
  progressPercentage: number; // 0-100
  comment: string;
  createdDate: string;
}

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  type: "status_change" | "progress" | "attachment" | "review" | "creation";
  timestamp: string;
  userFullName: string;
  description: string;
  metadata?: any;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByName: string;
  createdDate: string;
}

export interface Task {
  id: string; // TaskID
  title: string;
  description: string;
  taskCategory: TaskCategory;
  assignedBy: string; // UserID (Administrator)
  assignedTo: string; // UserID (Employee)
  startDate?: string | null;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  escalationStatus: "Yes" | "No";
  completionDate?: string;
  completedAt?: string | null;
  completionNotes?: string;
  isOverdue?: boolean;
  createdDate: string;
  updatedDate: string;
  
  // Phase 7 additions
  progressPercentage?: number; // 0-100
  reviewStatus?: ReviewStatus;
  managerNotes?: string;
  reviewedBy?: string; // UserID
  reviewedDate?: string;
}

export type NotificationType =
  | "Account Creation"
  | "Password Reset"
  | "Ticket Assignment"
  | "Ticket Update"
  | "Task Assignment"
  | "Task Reminder"
  | "Escalation Alert"
  | "Overdue Alert"
  | "Due Reminder";

export type NotificationStatus = "Sent" | "Delivered" | "Read" | "Failed";

export interface Notification {
  id: string; // NotificationID
  userId: string; // UserID (Foreign Key)
  notificationType: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  createdDate: string;
  readDate?: string;
}

export type AuditLogAction =
  | "Login"
  | "Logout"
  | "Password Change"
  | "Password Reset"
  | "User Creation"
  | "User Deletion"
  | "Client Creation"
  | "Client Deletion"
  | "Ticket Creation"
  | "Ticket Update"
  | "Ticket Deletion"
  | "Task Assignment"
  | "Task Update"
  | "Task Deletion"
  | "Account Creation"
  | "Account Status Change"
  | "Email Activity"
  | "Admin Action";

export type AuditLogEntityType = "User" | "Client" | "Ticket" | "Task" | "Notification" | "Email" | "System";

export interface AuditLog {
  id: string; // LogID
  userId: string; // UserID (Foreign Key)
  userFullName: string;
  action: AuditLogAction;
  entityType: AuditLogEntityType;
  entityId: string;
  timestamp: string;
  description: string;
}

export interface SentEmail {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  status: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  content: string;
  isInternal: boolean;
  createdDate: string;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByName: string;
  createdDate: string;
}

export interface TicketTimelineEntry {
  id: string;
  ticketId: string;
  type: "history" | "comment" | "attachment";
  timestamp: string;
  description: string;
  user: string;
  metadata?: any;
}
