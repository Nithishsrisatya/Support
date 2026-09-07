import { Notification, NotificationType, NotificationStatus } from "./types";

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

// ── Deadline helpers ──────────────────────────────────────
export function getDaysRemaining(dateStr: string): string {
  if (!dateStr) return "—";
  const now = new Date();
  const due = new Date(dateStr);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "1d left";
  return `${diffDays}d left`;
}

export function getDaysRemainingColor(dateStr: string, status: string): string {
  if (!dateStr) return "text-zinc-400";
  if (["Closed", "Resolved", "Completed", "Escalated"].includes(status)) return "text-emerald-400";
  const now = new Date();
  const due = new Date(dateStr);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "text-red-500 font-bold";
  if (diffDays <= 2) return "text-orange-400 font-bold";
  return "text-zinc-400";
}

// Short text label for a due date (used in compact lists/tables)
export function getDaysRemainingText(dateStr: string): string {
  if (!dateStr) return "—";
  const now = new Date();
  const due = new Date(dateStr);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "1d left";
  return `${diffDays}d left`;
}

export function getDaysRemainingBadge(dateStr: string, status: string): { text: string; color: string } {
  if (!dateStr) return { text: "—", color: "bg-zinc-100 text-zinc-400" };
  if (["Closed", "Resolved", "Completed", "Escalated"].includes(status)) return { text: "Done", color: "bg-emerald-100 text-emerald-700" };
  const now = new Date();
  const due = new Date(dateStr);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: "Overdue", color: "bg-red-100 text-red-700" };
  if (diffDays === 0) return { text: "Due today", color: "bg-orange-100 text-orange-700" };
  if (diffDays <= 2) return { text: `${diffDays}d left`, color: "bg-orange-100 text-orange-700" };
  if (diffDays <= 7) return { text: `${diffDays}d left`, color: "bg-amber-100 text-amber-700" };
  return { text: `${diffDays}d left`, color: "bg-zinc-100 text-zinc-600" };
}

// Helpers for state mutators
export function createId(prefix: string): string {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
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
