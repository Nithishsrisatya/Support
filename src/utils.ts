import { AuditLog, AuditLogAction, AuditLogEntityType, Notification, NotificationType, NotificationStatus } from "./types";

// Humanize ISO date strings
export function formatDateTime(isoString: string): string {
  if (!isoString) return "N/A";
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(dateString: string): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Generate humanized relative time
export function getRelativeTime(isoString: string, currentIsoTime: string = "2026-06-16T08:59:31-07:00"): string {
  const past = new Date(isoString).getTime();
  const current = new Date(currentIsoTime).getTime();
  const diffMs = current - past;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// Helpers for state mutators
export function createId(prefix: string): string {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Global logger helper
export function generateAuditLog(
  userId: string,
  userFullName: string,
  action: AuditLogAction,
  entityType: AuditLogEntityType,
  entityId: string,
  description: string
): AuditLog {
  return {
    id: `LOG-${Math.floor(10000 + Math.random() * 90000)}`,
    userId,
    userFullName,
    action,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    description,
  };
}

// Global notification generator helper
export function generateNotification(
  userId: string,
  notificationType: NotificationType,
  title: string,
  message: string
): Notification {
  return {
    id: `N-${Math.floor(100000 + Math.random() * 900000)}`,
    userId,
    notificationType,
    title,
    message,
    status: "Sent",
    createdDate: new Date().toISOString(),
  };
}
