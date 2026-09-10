import { User, Client, Ticket, Task, Notification, AuditLog } from "./types";

export const SEED_USERS: User[] = [
  {
    id: "U-1",
    fullName: "Administrator",
    email: "korlapatinithishsrisatya@gmail.com",
    passwordHash: "", // Sourced securely from INITIAL_ADMIN_PASSWORD environment variable during migration
    role: "Administrator",
    department: "Administration",
    managerId: null,
    status: "Active",
    createdDate: "2026-01-10T09:00:00Z",
    updatedDate: "2026-01-10T09:00:00Z",
  },
];

export const SEED_CLIENTS: Client[] = [];
export const SEED_TICKETS: Ticket[] = [];
export const SEED_TASKS: Task[] = [];
export const SEED_NOTIFICATIONS: Notification[] = [];
export const SEED_AUDIT_LOGS: AuditLog[] = [];
