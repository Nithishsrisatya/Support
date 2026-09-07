import React, { useState, useEffect } from "react";
import { Ticket } from "../types";
import { apiFetch } from "../services/api";
import { BarChart4, TrendingUp, TicketCheck, Clock, AlertTriangle, Star, Users, Building2, Activity } from "lucide-react";

interface DashboardStats {
  summary: {
    new: number;
    assigned: number;
    inProgress: number;
    pending: number;
    resolved: number;
    closed: number;
    open: number;
    total: number;
    avgSatisfaction: number | null;
    criticalOpen: number;
    highOpen: number;
    mediumOpen: number;
    lowOpen: number;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    completedToday: number;
  };
  byEmployee: {
    assignedTo: string;
    employeeName: string;
    total: number;
    open: number;
    closed: number;
  }[];
  byClient: {
    clientId: string;
    companyName: string;
    total: number;
    open: number;
    closed: number;
  }[];
  byPriority: {
    priority: string;
    total: number;
    open: number;
    closed: number;
  }[];
}

interface TicketDashboardProps {
  tickets: Ticket[];
}

export default function TicketDashboard({ tickets }: TicketDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const data = await apiFetch("/tickets/dashboard/stats");
      setStats(data);
    } catch (err) {
      console.error("Failed to load dashboard stats:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-800"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-sm text-zinc-500">Unable to load dashboard statistics.</p>
      </div>
    );
  }

const { summary } = stats;

  return (
    <div className="space-y-6">
      {/* Phase 1: Deadline Management Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
          <div className="flex items-center justify-between text-red-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">🔴 Overdue</span>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{summary.overdue}</p>
          <p className="text-[10px] text-red-400 mt-1">past due date</p>
        </div>

        <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <div className="flex items-center justify-between text-orange-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">🟠 Due Today</span>
            <Clock className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-orange-600">{summary.dueToday}</p>
          <p className="text-[10px] text-orange-400 mt-1">deadline today</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">📅 Due This Week</span>
            <Activity className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{summary.dueThisWeek}</p>
          <p className="text-[10px] text-amber-400 mt-1">next 7 days</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">✅ Completed Today</span>
            <TicketCheck className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{summary.completedToday}</p>
          <p className="text-[10px] text-emerald-400 mt-1">resolved/closed</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Open</span>
            <Activity className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-900">{summary.open}</p>
          <p className="text-[10px] text-zinc-400 mt-1">out of {summary.total} total</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Critical</span>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{summary.criticalOpen}</p>
          <p className="text-[10px] text-zinc-400 mt-1">High: {summary.highOpen}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Resolved</span>
            <TicketCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{summary.resolved}</p>
          <p className="text-[10px] text-zinc-400 mt-1">Closed: {summary.closed}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Satisfaction</span>
            <Star className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-900">{summary.avgSatisfaction || "—"}</p>
          <p className="text-[10px] text-zinc-400 mt-1">/ 5.0 average rating</p>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <BarChart4 className="h-4 w-4" />
          Status Breakdown
        </h3>
        <div className="grid grid-cols-6 gap-2">
          <StatusBar label="New" count={summary.new} color="bg-blue-500" />
          <StatusBar label="Assigned" count={summary.assigned} color="bg-indigo-500" />
          <StatusBar label="In Progress" count={summary.inProgress} color="bg-amber-500" />
          <StatusBar label="Pending" count={summary.pending} color="bg-purple-500" />
          <StatusBar label="Resolved" count={summary.resolved} color="bg-emerald-500" />
          <StatusBar label="Closed" count={summary.closed} color="bg-zinc-400" />
        </div>
      </div>

      {/* Priority Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            By Priority
          </h3>
          <div className="space-y-3">
            {stats.byPriority.map((item) => (
              <div key={item.priority} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    item.priority === "Critical" ? "bg-red-500" :
                    item.priority === "High" ? "bg-orange-500" :
                    item.priority === "Medium" ? "bg-sky-500" : "bg-zinc-300"
                  }`}></span>
                  <span className="font-medium text-zinc-800">{item.priority}</span>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-zinc-500">{item.open} open</span>
                  <span className="text-zinc-400">/</span>
                  <span className="text-zinc-800 font-bold">{item.total} total</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Users className="h-4 w-4" />
            By Employee
          </h3>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {stats.byEmployee.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-4">No tickets assigned.</p>
            ) : (
              stats.byEmployee.slice(0, 10).map((item) => (
                <div key={item.assignedTo} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-800 truncate max-w-[180px]">{item.employeeName || item.assignedTo}</span>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-amber-600 font-bold">{item.open}</span>
                    <span className="text-zinc-300">/</span>
                    <span className="text-zinc-500">{item.closed}</span>
                    <span className="text-zinc-300">·</span>
                    <span className="text-zinc-800 font-bold">{item.total}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* By Client */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          By Client
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {stats.byClient.length === 0 ? (
            <p className="text-sm text-zinc-400 py-4 col-span-full text-center">No clients with tickets.</p>
          ) : (
            stats.byClient.map((item) => (
              <div key={item.clientId} className="rounded-lg border border-zinc-100 p-3">
                <p className="text-sm font-semibold text-zinc-800 truncate">{item.companyName || item.clientId}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-zinc-500">
                  <span className="text-amber-600 font-bold">{item.open} open</span>
                  <span>·</span>
                  <span className="text-emerald-600">{item.closed} closed</span>
                  <span>·</span>
                  <span className="text-zinc-800 font-bold">{item.total} total</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBar({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-24 w-full items-end justify-center rounded-lg bg-zinc-50 border border-zinc-100 overflow-hidden">
        <div
          className={`w-full ${color} rounded-t transition-all duration-500`}
          style={{ height: `${Math.max(count * 8, 4)}px`, minHeight: count > 0 ? '8px' : '4px' }}
        ></div>
      </div>
      <span className="mt-1.5 text-[10px] font-bold text-zinc-600 font-mono">{count}</span>
      <span className="text-[9px] text-zinc-400 uppercase tracking-wider">{label}</span>
    </div>
  );
}

