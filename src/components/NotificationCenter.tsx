import React, { useState, useMemo } from "react";
import { Notification, NotificationType } from "../types";
import { getRelativeTime } from "../utils";
import {
  Bell,
  CheckCheck,
  Trash2,
  Mail,
  MailOpen,
  X,
  Filter,
  ArrowUpDown,
  Clock,
  ShieldAlert,
  UserPlus,
  KeyRound,
  TicketCheck,
  ClipboardList,
  AlertTriangle,
  Inbox,
  Eye,
} from "lucide-react";

interface NotificationCenterProps {
  notifications: Notification[];
  currentUserId: string;
  currentRole: "Administrator" | "Manager" | "Employee" | "Client";
  onMarkRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// Map notification types to icons
const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case "Account Creation":
      return <UserPlus className="h-4 w-4 text-blue-600" />;
    case "Password Reset":
      return <KeyRound className="h-4 w-4 text-amber-600" />;
    case "Ticket Assignment":
      return <TicketCheck className="h-4 w-4 text-indigo-600" />;
    case "Ticket Update":
      return <TicketCheck className="h-4 w-4 text-purple-600" />;
    case "Task Assignment":
      return <ClipboardList className="h-4 w-4 text-emerald-600" />;
    case "Task Reminder":
      return <Clock className="h-4 w-4 text-sky-600" />;
    case "Escalation Alert":
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    default:
      return <Bell className="h-4 w-4 text-zinc-600" />;
  }
};

export default function NotificationCenter({
  notifications,
  currentUserId,
  currentRole,
  onMarkRead,
  onMarkAllAsRead,
  onClearAll,
  onDelete,
  onClose,
}: NotificationCenterProps) {
  // Filter state: "all" | "unread" | "read"
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read">("all");
  const [typeFilter, setTypeFilter] = useState<NotificationType | "all">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Get unique notification types from the data
  const notificationTypes = useMemo(() => {
    const types = new Set(notifications.map((n) => n.notificationType));
    return Array.from(types);
  }, [notifications]);

  // Apply filters
  const filteredNotifications = useMemo(() => {
    let filtered = [...notifications];

    // Status filter
    if (statusFilter === "unread") {
      filtered = filtered.filter((n) => n.status !== "Read");
    } else if (statusFilter === "read") {
      filtered = filtered.filter((n) => n.status === "Read");
    }

    // Type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((n) => n.notificationType === typeFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      const dateA = new Date(a.createdDate).getTime();
      const dateB = new Date(b.createdDate).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return filtered;
  }, [notifications, statusFilter, typeFilter, sortOrder]);

  const unreadCount = notifications.filter((n) => n.status !== "Read").length;
  const readCount = notifications.filter((n) => n.status === "Read").length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-20 overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900 font-sans">Notification Center</h2>
              <p className="text-xs text-zinc-500 font-mono">
                {currentRole} · {unreadCount} unread · {notifications.length} total
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark All Read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={onClearAll}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-6 py-3 bg-zinc-50/50 shrink-0">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Status:</span>
          </div>
          <div className="flex gap-1">
            {(["all", "unread", "read"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                className={`rounded-lg px-3 py-1 text-[11px] font-semibold transition ${
                  statusFilter === opt
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
                }`}
              >
                {opt === "all" ? "All" : opt === "unread" ? `Unread (${unreadCount})` : `Read (${readCount})`}
              </button>
            ))}
          </div>

          <div className="hidden sm:block w-px h-5 bg-zinc-200" />

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as NotificationType | "all")}
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium focus:outline-none"
            >
              <option value="all">All Types</option>
              {notificationTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="hidden sm:block w-px h-5 bg-zinc-200" />

          <button
            onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 transition"
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortOrder === "newest" ? "Newest First" : "Oldest First"}
          </button>

          <div className="ml-auto text-[10px] text-zinc-400 font-mono">
            {filteredNotifications.length} of {notifications.length} shown
          </div>
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100">
                <Inbox className="h-8 w-8 text-zinc-300" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900">All caught up!</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                {statusFilter !== "all"
                  ? `No ${statusFilter} notifications match your filters.`
                  : "You have no notifications at this time."}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const isUnread = notification.status !== "Read";
              return (
                <div
                  key={notification.id}
                  className={`group relative flex items-start gap-3 rounded-xl p-4 transition border ${
                    isUnread
                      ? "bg-indigo-50/40 border-indigo-100 hover:bg-indigo-50/60"
                      : "bg-white border-zinc-100 hover:bg-zinc-50/60"
                  }`}
                >
                  {/* Icon */}
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isUnread ? "bg-white shadow-sm border border-indigo-200" : "bg-zinc-50 border border-zinc-200"
                  }`}>
                    {getNotificationIcon(notification.notificationType)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-sm font-semibold truncate ${
                            isUnread ? "text-zinc-900" : "text-zinc-700"
                          }`}>
                            {notification.title}
                          </h4>
                          {isUnread && (
                            <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                          )}
                        </div>
                        <p className={`text-xs leading-relaxed ${
                          isUnread ? "text-zinc-700" : "text-zinc-500"
                        }`}>
                          {notification.message}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getRelativeTime(notification.createdDate)}
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-600">
                        {notification.notificationType}
                      </span>
                      {notification.readDate && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <MailOpen className="h-3 w-3" />
                          Read
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isUnread && (
                      <button
                        onClick={() => onMarkRead(notification.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-indigo-100 hover:text-indigo-600 transition opacity-0 group-hover:opacity-100"
                        title="Mark as read"
                      >
                        <MailOpen className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(notification.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-100 hover:text-red-600 transition opacity-0 group-hover:opacity-100"
                        title="Delete notification"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-3 text-[10px] text-zinc-400 shrink-0">
          <span className="flex items-center gap-1">
            <Bell className="h-3 w-3" />
            Role: {currentRole}
          </span>
          <span>
            {unreadCount > 0
              ? `${unreadCount} notification${unreadCount !== 1 ? "s" : ""} need${unreadCount === 1 ? "s" : ""} your attention`
              : "All notifications are read"}
          </span>
        </div>
      </div>
    </div>
  );
}

