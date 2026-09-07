import React from "react";
import {
  Building2,
  Users,
  Ticket,
  CheckSquare,
  ArrowRight,
  AlertCircle,
  Clock,
  AlertTriangle,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { Client, User, Ticket as TicketType, Task, TicketPriority, TicketStatus } from "../types";
import { formatDate, getDaysRemainingBadge } from "../utils";
import DashboardCharts from "./DashboardCharts";

// ── Helper: days remaining / overdue ──────────────────────
function isDueToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const now = new Date();
  const due = new Date(dateStr);
  return due.toDateString() === now.toDateString();
}

function isDueThisWeek(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const now = new Date();
  const due = new Date(dateStr);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  return due >= now && due <= endOfWeek;
}

function isCompletedToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const now = new Date();
  const completed = new Date(dateStr);
  return completed.toDateString() === now.toDateString();
}

// ── Interfaces ──────────────────────────────────────────────
interface HomeDashboardProps {
  clients?: Client[];
  users?: User[];
  tickets?: TicketType[];
  tasks?: Task[];
  onNavigate?: (section: string) => void;
}

// ── Priority / Status badge color map (dark theme) ─────────
const priorityColors: Record<TicketPriority, string> = {
  Low: "bg-zinc-800 text-zinc-300",
  Medium: "bg-indigo-900/50 text-indigo-300",
  High: "bg-orange-900/50 text-orange-300",
  Critical: "bg-red-900/50 text-red-300",
};

const ticketStatusColors: Record<TicketStatus, string> = {
  New: "bg-blue-900/40 text-blue-300",
  Assigned: "bg-purple-900/40 text-purple-300",
  "In Progress": "bg-amber-900/40 text-amber-300",
  Pending: "bg-zinc-800 text-zinc-400",
  Resolved: "bg-emerald-900/40 text-emerald-300",
  Closed: "bg-zinc-800 text-zinc-500",
};

const taskStatusColors: Record<string, string> = {
  Pending: "bg-zinc-800 text-zinc-400",
  Assigned: "bg-purple-900/40 text-purple-300",
  "In Progress": "bg-amber-900/40 text-amber-300",
  Completed: "bg-emerald-900/40 text-emerald-300",
  Overdue: "bg-red-900/50 text-red-300",
  Escalated: "bg-red-900/50 text-red-300",
};

const clientStatusColors: Record<string, string> = {
  Active: "bg-emerald-900/40 text-emerald-300",
  Inactive: "bg-zinc-800 text-zinc-400",
  Disabled: "bg-red-900/40 text-red-300",
  Suspended: "bg-red-900/40 text-red-300",
  "Pending Activation": "bg-amber-900/40 text-amber-300",
};

const userStatusColors: Record<string, string> = {
  Active: "bg-emerald-900/40 text-emerald-300",
  Inactive: "bg-zinc-800 text-zinc-400",
  Disabled: "bg-red-900/40 text-red-300",
  Suspended: "bg-red-900/40 text-red-300",
};

// ── Card wrapper ────────────────────────────────────────────
function Card({
  title,
  icon: Icon,
  iconColor,
  viewAllLabel,
  onViewAll,
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  viewAllLabel: string;
  onViewAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group rounded-xl border border-zinc-800 bg-[#18181B] p-5 shadow-lg shadow-black/20 transition-all duration-300 hover:shadow-xl hover:shadow-black/30 hover:-translate-y-0.5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-lg p-2 ${iconColor}`}>
            <Icon size={18} />
          </div>
          <h3 className="text-sm font-bold text-zinc-200 tracking-tight">{title}</h3>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-[10px] font-semibold text-zinc-400 transition-all hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-200"
          >
            View All
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* Body with scroll */}
      <div className="flex-1 overflow-y-auto max-h-[320px] space-y-2 scrollbar-thin">
        {children}
      </div>
    </div>
  );
}

// ── No Records ──────────────────────────────────────────────
function NoRecords({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <AlertCircle size={28} className="text-zinc-700 mb-2" />
      <p className="text-xs text-zinc-500">{message}</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────
export default function HomeDashboard({
  clients = [],
  users = [],
  tickets = [],
  tasks = [],
  onNavigate,
}: HomeDashboardProps) {
  // Sort all by newest first (by createdDate)
  const recentClients = [...clients]
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
    .slice(0, 5);

  const recentUsers = [...users]
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
    .slice(0, 5);

  const recentTickets = [...tickets]
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
    .slice(0, 5);

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
    .slice(0, 5);

// ── Deadline Metric Cards ──────────────────────────────
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));

  const overdueTickets = tickets.filter(t => t.isOverdue && t.status !== "Resolved" && t.status !== "Closed");
  const dueTodayTickets = tickets.filter(t => !t.isOverdue && t.status !== "Resolved" && t.status !== "Closed" && isDueToday(t.dueDate));
  const dueThisWeekTickets = tickets.filter(t => !t.isOverdue && t.status !== "Resolved" && t.status !== "Closed" && isDueThisWeek(t.dueDate));
  const completedTodayTickets = tickets.filter(t => isCompletedToday(t.completedAt));

  const overdueTasks = tasks.filter(t => t.isOverdue && t.status !== "Completed");
  const dueTodayTasks = tasks.filter(t => !t.isOverdue && t.status !== "Completed" && isDueToday(t.dueDate));
  const dueThisWeekTasks = tasks.filter(t => !t.isOverdue && t.status !== "Completed" && isDueThisWeek(t.dueDate));
  const completedTodayTasks = tasks.filter(t => isCompletedToday(t.completedAt));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6">
        <h2 className="text-xl font-bold tracking-tight text-zinc-100">
          Dashboard Overview
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          A quick summary of your most recent records across all modules.
        </p>
      </div>

      {/* ── Deadline Metric Cards ────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <div className="rounded-xl border border-red-800 bg-red-950/30 p-4 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-red-400">Overdue</span>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-400">{overdueTickets.length + overdueTasks.length}</p>
          <p className="text-[10px] text-zinc-500 mt-1">
            {overdueTickets.length} tickets · {overdueTasks.length} tasks
          </p>
        </div>

        <div className="rounded-xl border border-orange-800 bg-orange-950/30 p-4 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-orange-400">Due Today</span>
            <Clock className="h-4 w-4 text-orange-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-orange-400">{dueTodayTickets.length + dueTodayTasks.length}</p>
          <p className="text-[10px] text-zinc-500 mt-1">
            {dueTodayTickets.length} tickets · {dueTodayTasks.length} tasks
          </p>
        </div>

        <div className="rounded-xl border border-sky-800 bg-sky-950/30 p-4 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-sky-400">Due This Week</span>
            <Calendar className="h-4 w-4 text-sky-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-sky-400">{dueThisWeekTickets.length + dueThisWeekTasks.length}</p>
          <p className="text-[10px] text-zinc-500 mt-1">
            {dueThisWeekTickets.length} tickets · {dueThisWeekTasks.length} tasks
          </p>
        </div>

        <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 shadow-lg">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-emerald-400">Completed Today</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">{completedTodayTickets.length + completedTodayTasks.length}</p>
          <p className="text-[10px] text-zinc-500 mt-1">
            {completedTodayTickets.length} tickets · {completedTodayTasks.length} tasks
          </p>
        </div>
      </div>

      {/* 2-column grid → 1 column on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* ──────────── 1. Recent Tickets ──────────── */}
        <Card
          title="Recent Tickets"
          icon={Ticket}
          iconColor="bg-amber-900/30 text-amber-400"
          viewAllLabel="View All Tickets"
          onViewAll={onNavigate ? () => onNavigate("tickets") : undefined}
        >
          {recentTickets.length === 0 ? (
            <NoRecords message="No tickets found." />
          ) : (
            recentTickets.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5 transition-colors hover:bg-zinc-800/60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-zinc-400">
                    {t.id}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        priorityColors[t.priority] ?? "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {t.priority}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        ticketStatusColors[t.status] ?? "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-zinc-200">
                  {t.subject}
                </p>
              </div>
            ))
          )}
        </Card>

        {/* ──────────── 2. Recent Tasks ──────────── */}
        <Card
          title="Recent Tasks"
          icon={CheckSquare}
          iconColor="bg-emerald-900/30 text-emerald-400"
          viewAllLabel="View All Tasks"
          onViewAll={onNavigate ? () => onNavigate("tasks") : undefined}
        >
          {recentTasks.length === 0 ? (
            <NoRecords message="No tasks found." />
          ) : (
            recentTasks.map((tk) => {
              const assignee = users.find((u) => u.id === tk.assignedTo);
              return (
                <div
                  key={tk.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5 transition-colors hover:bg-zinc-800/60"
                >
                  <div className="flex items-center justify-between">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-200">
                      {tk.title}
                    </p>
                    <span
                      className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        taskStatusColors[tk.status] ?? "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {tk.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
                    <span>
                      Assigned to:{" "}
                      <span className="font-medium text-zinc-400">
                        {assignee?.fullName ?? "N/A"}
                      </span>
                    </span>
                    <span className="text-zinc-700">|</span>
                    <span>Due: {formatDate(tk.dueDate)}</span>
                  </div>
                </div>
              );
            })
          )}
        </Card>

        {/* ──────────── 3. Recent Clients ──────────── */}
        <Card
          title="Recent Clients"
          icon={Building2}
          iconColor="bg-purple-900/30 text-purple-400"
          viewAllLabel="View All Clients"
          onViewAll={onNavigate ? () => onNavigate("clients") : undefined}
        >
          {recentClients.length === 0 ? (
            <NoRecords message="No clients found." />
          ) : (
            recentClients.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5 transition-colors hover:bg-zinc-800/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-200">
                    {c.companyName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                    {c.contactPerson}
                  </p>
                </div>
                <span
                  className={`ml-3 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    clientStatusColors[c.status] ?? "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {c.status}
                </span>
              </div>
            ))
          )}
        </Card>

        {/* ──────────── 4. Recent Employees ──────────── */}
        <Card
          title="Recent Employees"
          icon={Users}
          iconColor="bg-sky-900/30 text-sky-400"
          viewAllLabel="View All Employees"
          onViewAll={onNavigate ? () => onNavigate("employees") : undefined}
        >
          {recentUsers.length === 0 ? (
            <NoRecords message="No employees found." />
          ) : (
            recentUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-2.5 transition-colors hover:bg-zinc-800/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-200">
                    {u.fullName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                    {u.department}
                  </p>
                </div>
                <span
                  className={`ml-3 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    userStatusColors[u.status] ?? "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {u.status}
                </span>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* ── Dashboard Charts ───────────────────── */}
      <div className="mb-6">
        <DashboardCharts users={users} clients={clients} tickets={tickets} tasks={tasks} />
      </div>
    </div>
  );
}
