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
}

export type ClientStatus = "Active" | "Inactive" | "Disabled" | "Suspended" | "Pending Activation";

export interface Client {
  id: string; // ClientID
  companyName: string;
  contactPerson: string;
  email: string;
  phoneNumber: string;
  status: ClientStatus;
  createdDate: string;
  updatedDate: string;
}

export type TicketCategory = "Technical Issue" | "Account Issue" | "Billing Issue" | "Service Request" | "General Inquiry";

export type TicketPriority = "Low" | "Medium" | "High" | "Critical";

export type TicketStatus = "New" | "Assigned" | "In Progress" | "Pending" | "Resolved" | "Closed";

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

export interface Task {
  id: string; // TaskID
  title: string;
  description: string;
  taskCategory: TaskCategory;
  assignedBy: string; // UserID (Administrator)
  assignedTo: string; // UserID (Employee)
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  escalationStatus: "Yes" | "No";
  completionDate?: string;
  completionNotes?: string;
  createdDate: string;
  updatedDate: string;
}

export type NotificationType =
  | "Account Creation"
  | "Password Reset"
  | "Ticket Assignment"
  | "Ticket Update"
  | "Task Assignment"
  | "Task Reminder"
  | "Escalation Alert";

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
  | "Password Reset"
  | "Ticket Creation"
  | "Ticket Update"
  | "Task Assignment"
  | "Task Update"
  | "Account Creation"
  | "Account Status Change";

export type AuditLogEntityType = "User" | "Client" | "Ticket" | "Task" | "Notification";

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

