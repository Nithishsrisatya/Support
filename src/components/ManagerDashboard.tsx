import React, { useState } from "react";
import { User, Client, Ticket, Task, AuditLog, TicketPriority, TaskStatus } from "../types";
import { formatDate } from "../utils";
import { 
  Users, ClipboardCheck, AlertTriangle, Play, CheckCircle2, TrendingUp, Search, 
  BarChart4, ArrowUpRight, ShieldCheck, Mail, ShieldAlert, Award, Stars, LayoutDashboard,
  Calendar as CalendarIcon
} from "lucide-react";
import HomeDashboard from "./HomeDashboard";
import DeadlineCalendar from "./DeadlineCalendar";

interface ManagerDashboardProps {
  currentManager: User;
  systemUsers: User[];
  clients: Client[];
  tickets: Ticket[];
  tasks: Task[];
  auditLogs: AuditLog[];
}

export default function ManagerDashboard({
  currentManager,
  systemUsers,
  clients,
  tickets,
  tasks,
  auditLogs,
}: ManagerDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<"dashboard" | "calendar" | "team" | "escalations" | "department">("dashboard");
  const [staffFilter, setStaffFilter] = useState("all");

  // Teammates supervised by this manager (Robert Chen supervises David Kim)
  const teammates = systemUsers.filter((u) => u.managerId === currentManager.id);
  const teammateIds = teammates.map((t) => t.id);

  // If a teammate is selected in filter, narrow active item queries
  const activeStaffIds = staffFilter === "all" ? teammateIds : [staffFilter];

  // Supervised tasks and tickets
  const supervisedTasks = tasks.filter((t) => activeStaffIds.includes(t.assignedTo));
  const supervisedTickets = tickets.filter((t) => t.assignedTo && activeStaffIds.includes(t.assignedTo));

  // Analytics metrics
  const completedSupervisedTasks = supervisedTasks.filter((t) => t.status === "Completed");
  const totalCompletedCount = completedSupervisedTasks.length;
  const totalAssignedCount = supervisedTasks.length;
  const onTimeTaskRate = totalAssignedCount > 0 
    ? Math.round((totalCompletedCount / totalAssignedCount) * 100) 
    : 100;

  const escalatedTasks = supervisedTasks.filter((t) => (t.status === "Escalated" || t.escalationStatus === "Yes") && t.status !== "Completed");
  const overdueTasks = supervisedTasks.filter(
    (t) => t.status !== "Completed" && (t.status === "Overdue" || t.isOverdue)
  );

  const resolvedTickets = supervisedTickets.filter((t) => t.status === "Resolved" || t.status === "Closed");
  const resolutionRate = supervisedTickets.length > 0
    ? Math.round((resolvedTickets.length / supervisedTickets.length) * 100)
    : 100;

  // Render a detailed productivity index score for David Kim
  // Productivity Level is based on (Tasks Completed + Tickets Resolved) - (Overdue Escalations * 1.5)
  const computeProductivityScore = (userId: string) => {
    const doneT = tasks.filter((t) => t.assignedTo === userId && t.status === "Completed").length;
    const doneTk = tickets.filter((t) => t.assignedTo === userId && (t.status === "Resolved" || t.status === "Closed")).length;
    const escT = tasks.filter((t) => t.assignedTo === userId && (t.status === "Escalated" || t.status === "Overdue")).length;
    
    const baseScore = (doneT * 12) + (doneTk * 15) - (escT * 10);
    return Math.max(0, Math.min(100, 40 + baseScore)); // bound within standard score index
  };

  return (
    <div className="space-y-6">
      
      {/* Supervisory Header Banner */}
      <div className="rounded-2xl border border-sky-150 bg-sky-50/40 p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-sky-100 px-2 py-0.5 text-[9px] font-bold text-sky-850 font-mono uppercase tracking-wide">
              SUPERVISOR ACCOUNT
            </span>
            <span className="text-zinc-300">|</span>
            <span className="text-xs font-semibold text-zinc-500 font-mono">DEP: {currentManager.department}</span>
          </div>
          <h2 className="text-lg font-bold text-zinc-900 font-sans">
            Welcome Back, Manager {currentManager.fullName}
          </h2>
          <p className="text-xs text-zinc-650 leading-relaxed max-w-2xl">
            Audit team operations, analyze escalation timelines, inspect support workloads, and track automated KPIs.
          </p>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 font-medium">Narrow Scout:</span>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold focus:outline-none"
          >
            <option value="all">Entire Team</option>
            {teammates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Role dashboard quick-metrics widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px] uppercase font-semibold">
            <span>Direct Team Members</span>
            <Users className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-extrabold text-zinc-950 font-sans">{teammates.length}</span>
            <span className="text-zinc-400 font-mono text-[10px] ml-1.5">active staff</span>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 leading-normal">Supervising helpdesk operations force</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px] uppercase font-semibold">
            <span>Assigned Works Completed</span>
            <ClipboardCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-extrabold text-zinc-950 font-sans">{totalCompletedCount}</span>
            <span className="text-zinc-400 font-mono text-[10px] ml-1.5">of {totalAssignedCount} tasks</span>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 leading-normal">Task completion index rate: {onTimeTaskRate}%</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px] uppercase font-semibold">
            <span>Critical Escalations</span>
            <AlertTriangle className="h-4 w-4 text-red-650" />
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-extrabold text-red-700 font-sans">{escalatedTasks.length}</span>
            <span className="text-zinc-400 font-mono text-[10px] ml-1.5">escalated logs</span>
          </div>
          <p className="text-[10px] text-red-500 mt-1 leading-normal">SLA safety flags overdue: {overdueTasks.length}</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 font-mono text-[10px] uppercase font-semibold">
            <span>Ticket Resolve Performance</span>
            <TrendingUp className="h-4 w-4 text-indigo-650" />
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-extrabold text-zinc-950 font-sans">{resolvedTickets.length}</span>
            <span className="text-zinc-400 font-mono text-[10px] ml-1.5">of {supervisedTickets.length} cases</span>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 leading-normal">Resolution performance: {resolutionRate}%</p>
        </div>

      </div>

      {/* Internal Tab selectors */}
      <div className="flex items-center gap-1.5 border-b border-zinc-150 pb-2">
        <button
          onClick={() => setActiveSubTab("dashboard")}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition uppercase duration-150 tracking-wider flex items-center gap-1.5 ${
            activeSubTab === "dashboard" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          <LayoutDashboard size={14} />
          <span>Dashboard Overview</span>
        </button>
        <button
          onClick={() => setActiveSubTab("calendar")}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition uppercase duration-150 tracking-wider flex items-center gap-1.5 ${
            activeSubTab === "calendar" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          <CalendarIcon size={14} />
          <span>Deadline Calendar</span>
        </button>
        <button
          onClick={() => setActiveSubTab("team")}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition uppercase duration-150 tracking-wider ${
            activeSubTab === "team" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          Staff Workload Overview
        </button>
        <button
          onClick={() => setActiveSubTab("escalations")}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition uppercase duration-150 tracking-wider flex items-center gap-1.5 ${
            activeSubTab === "escalations" 
              ? "bg-zinc-950 text-white" 
              : "text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          <span>Alerts & Escalations Center</span>
          {escalatedTasks.length > 0 && (
            <span className="ml-1 h-2 w-2 rounded-full bg-red-600 animate-ping"></span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab("department")}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition uppercase duration-150 tracking-wider ${
            activeSubTab === "department" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          Team Productivity scoring
        </button>
      </div>

      {/* Dashboard Overview */}
      {activeSubTab === "dashboard" && (
        <HomeDashboard
          clients={clients}
          users={systemUsers}
          tickets={tickets}
          tasks={tasks}
        />
      )}

      {/* Deadline Calendar */}
      {activeSubTab === "calendar" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <DeadlineCalendar
            currentUserRole="Manager"
            currentUserId={currentManager.id}
            currentUserName={currentManager.fullName}
          />
        </div>
      )}

      {/* TEAM MEMBERS WORKLOAD OVERVIEW */}
      {activeSubTab === "team" && (
        <div className="grid gap-6 md:grid-cols-2 animate-in fade-in duration-200">
          
          {/* Teammates List */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              Operational Teammates supervised
            </h3>
            
            <div className="space-y-3">
              {teammates.map((teammate) => {
                const isSelected = staffFilter === teammate.id;
                const score = computeProductivityScore(teammate.id);
                return (
                  <button
                    key={teammate.id}
                    onClick={() => setStaffFilter(isSelected ? "all" : teammate.id)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition text-left text-xs ${
                      isSelected 
                        ? "border-sky-500 bg-sky-50/20 shadow-sm" 
                        : "border-zinc-150 hover:bg-zinc-50"
                    }`}
                  >
                    <div className="space-y-0.5 truncate">
                      <p className="font-bold text-zinc-950 font-sans">{teammate.fullName}</p>
                      <p className="text-[10px] font-mono text-zinc-400">{teammate.email}</p>
                      <p className="text-[10px] text-zinc-500">Status: {teammate.status} · Level: {teammate.role}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="block text-[8px] font-mono uppercase tracking-wider text-zinc-400">Productivity Rating</span>
                      <div className="flex items-center justify-end gap-1 font-mono font-bold mt-0.5 text-zinc-900">
                        <Stars className="h-3.5 w-3.5 text-amber-500" />
                        <span>{score} index</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Supervised Work list */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              Staff Assigned Workload & SLA Monitors
            </h3>
            
            <div className="space-y-3 max-h-80 overflow-y-auto divide-y divide-zinc-100 text-xs">
              {supervisedTasks.length === 0 ? (
                <p className="py-12 text-center text-zinc-400 font-sans">No organizational task records match the current filter criteria.</p>
              ) : (
                supervisedTasks.map((task) => {
                  const subEmp = teammates.find((e) => e.id === task.assignedTo);
                  return (
                    <div key={task.id} className="pt-3 first:pt-0 pb-1.5 flex flex-col justify-between sm:flex-row sm:items-start gap-2.5">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-400">
                          <span className="font-bold text-zinc-850">{task.id}</span>
                          <span>·</span>
                          <span className="text-zinc-500">To: {subEmp?.fullName}</span>
                        </div>
                        <p className="font-semibold text-zinc-950 font-sans leading-normal">{task.title}</p>
                        <p className="text-[10px] text-zinc-500 leading-normal">Due on: {formatDate(task.dueDate)}</p>
                      </div>

                      <span className={`inline-block shrink-0 rounded-xl px-2 py-0.5 text-[10px] font-bold font-mono tracking-wide ${
                        task.status === "Completed" ? "bg-emerald-50 text-emerald-800" :
                        task.status === "Escalated" ? "bg-red-50 text-red-850 animate-pulse" :
                        "bg-sky-50 text-sky-850"
                      }`}>
                        {task.status}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* OVERDUE & ESCALATIONS ALERT CENTER */}
      {activeSubTab === "escalations" && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4 animate-in fade-in duration-200 text-xs">
          <div className="border-b border-zinc-100 pb-3">
            <h3 className="text-sm font-bold text-zinc-900 font-sans">Automated OVERDUE Operational Warnings</h3>
            <p className="text-xs text-zinc-400 mt-0.5">These records demonstrate past due limits. Automatic SLA compliance monitoring activated.</p>
          </div>

          <div className="space-y-3.5">
            {escalatedTasks.length === 0 && overdueTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 border border-dashed border-zinc-200 rounded-xl">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="font-semibold text-zinc-950">SLA Fully Compliant</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">No tasks or support activities are escalated across direct subordinates.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Escalated alerts */}
                {escalatedTasks.map((t) => {
                  const emp = teammates.find((e) => e.id === t.assignedTo);
                  return (
                    <div key={t.id} className="rounded-xl border border-red-200 bg-red-50/20 p-4 flex flex-col justify-between sm:flex-row sm:items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-mono text-[9px] text-red-650 font-semibold uppercase">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          <span>AUTO_SLA_LOG_ESCALATED</span>
                          <span>·</span>
                          <span>{t.id}</span>
                        </div>
                        <h4 className="font-bold text-zinc-950 text-xs">{t.title}</h4>
                        <p className="text-zinc-500 leading-normal text-[11px]">{t.description}</p>
                        <p className="text-[10px] text-zinc-650 font-medium">Assigned Subordinate: {emp?.fullName} · SLA Due: {formatDate(t.dueDate)}</p>
                      </div>

                      <div className="shrink-0 text-right space-y-1.5">
                        <span className="inline-block rounded bg-red-600 px-2 py-0.5 text-[9px] font-bold text-white font-mono uppercase animate-pulse">
                          Escalated status
                        </span>
                        <div className="text-[9px] text-zinc-400 font-mono">Logged: 2026-06-16</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEPARTMENT PRODUCTIVITY METRICS */}
      {activeSubTab === "department" && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-6 animate-in fade-in duration-200">
          
          <div className="border-b border-zinc-100 pb-4">
            <h3 className="text-sm font-bold text-zinc-900 font-sans">
              Supervised Department Performance Report
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Overall score distributions based on completed tasks, SLA thresholds, and customer satisfaction ratings.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            
            {/* Visualizer widget: Team Performance Graph represented in SVG */}
            <div className="bg-zinc-50/50 rounded-xl p-5 border border-zinc-150 space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide font-mono text-zinc-500">
                Department Performance Charting
              </h4>

              <div className="flex items-end justify-between h-44 border-b border-zinc-250 pb-2 px-4 gap-4">
                {teammates.map((t) => {
                  const score = computeProductivityScore(t.id);
                  const barHeight = `${score}%`;
                  return (
                    <div key={t.id} className="flex-1 flex flex-col items-center group relative">
                      {/* Tooltip dynamic */}
                      <span className="absolute bottom-full mb-1 bg-zinc-950 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition duration-150">
                        Score: {score}
                      </span>
                      <div className="w-8 rounded-t bg-sky-500 transition-all hover:bg-sky-600" style={{ height: barHeight }}></div>
                      <span className="mt-2.5 text-[10px] font-semibold text-zinc-900 truncate max-w-[80px]">
                        {t.fullName}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between text-[10px] text-zinc-400 font-mono uppercase tracking-wide">
                <span>0 INDEX (Min)</span>
                <span>100 INDEX (Max SLA)</span>
              </div>
            </div>

            {/* SLA Metrics scoreboard */}
            <div className="space-y-4 text-xs">
              <h4 className="text-xs font-semibold uppercase tracking-wide font-mono text-zinc-500">
                Team Productivity Dashboard Indicators
              </h4>

              <div className="space-y-3.5">
                
                <div className="p-3.5 rounded-xl border border-zinc-150 space-y-1 bg-white">
                  <div className="flex items-center justify-between text-[11px] font-medium text-zinc-650">
                    <span>Task SLA Response On-Time Ratio</span>
                    <span className="font-bold text-zinc-900">{onTimeTaskRate}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${onTimeTaskRate}%` }}></div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-zinc-150 space-y-1 bg-white">
                  <div className="flex items-center justify-between text-[11px] font-medium text-zinc-650">
                    <span>Client Satisfaction Support Rating</span>
                    <span className="font-bold text-zinc-900">4.8 / 5.0</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `96%` }}></div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-zinc-150 bg-sky-50/20 text-sky-850 p-4 space-y-2">
                  <p className="font-semibold text-xs flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-amber-500" />
                    <span>Compliance Recognition Record</span>
                  </p>
                  <p className="text-[11px] text-zinc-600 leading-normal">
                    David Kim achieved the June SLA Service Target with 100% gateway deployment uptime on June 15, logging compliance certificate renew metrics.
                  </p>
                </div>

              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
