import React, { useState, useMemo } from "react";
import { User, Client, Ticket, Task, AuditLog, TicketStatus, TicketPriority, TaskStatus } from "../types";
import { formatDate } from "../utils";
import {
  BarChart4, TrendingUp, FileSpreadsheet, FileText, FileDown,
  Download, Search, Filter, Calendar, Users, Building2,
  CheckCircle2, AlertTriangle, Clock, Star, Award, Activity,
  ChevronDown, ChevronUp, Printer, PieChart, LineChart,
} from "lucide-react";
import {
  PieChart as RechartPie, Pie, Cell, Tooltip as RechartTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  LineChart as RechartLine, Line,
} from "recharts";

interface ReportsPanelProps {
  users: User[];
  clients: Client[];
  tickets: Ticket[];
  tasks: Task[];
  auditLogs: AuditLog[];
}

type ReportTab = "tickets" | "tasks" | "employees" | "clients";

const CHART_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

export default function ReportsPanel({
  users,
  clients,
  tickets,
  tasks,
  auditLogs,
}: ReportsPanelProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>("tickets");
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  // Filter states
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  // ─── TICKET REPORT ──────────────────────────────────────
  const ticketReport = useMemo(() => {
    const total = tickets.length;
    const byStatus = {
      new: tickets.filter(t => t.status === "New").length,
      assigned: tickets.filter(t => t.status === "Assigned").length,
      inProgress: tickets.filter(t => t.status === "In Progress").length,
      pending: tickets.filter(t => t.status === "Pending").length,
      resolved: tickets.filter(t => t.status === "Resolved").length,
      closed: tickets.filter(t => t.status === "Closed").length,
    };
    const open = byStatus.new + byStatus.assigned + byStatus.inProgress + byStatus.pending;
    const criticalOpen = tickets.filter(t => t.priority === "Critical" && !["Closed", "Resolved"].includes(t.status)).length;
    const highOpen = tickets.filter(t => t.priority === "High" && !["Closed", "Resolved"].includes(t.status)).length;
    const avgSatisfaction = tickets
      .filter(t => t.satisfactionRating)
      .reduce((sum, t, _, arr) => sum + (t.satisfactionRating || 0) / arr.length, 0);

    return { total, byStatus, open, resolved: byStatus.resolved + byStatus.closed, criticalOpen, highOpen, avgSatisfaction };
  }, [tickets]);

  // ─── TASK REPORT ────────────────────────────────────────
  const taskReport = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === "Completed").length;
    const active = tasks.filter(t => ["Pending", "Assigned", "In Progress"].includes(t.status)).length;
    const overdue = tasks.filter(t => t.status === "Overdue" || (t.status !== "Completed" && new Date(t.dueDate) < new Date())).length;
    const escalated = tasks.filter(t => t.status === "Escalated" || t.escalationStatus === "Yes").length;
    const avgProgress = tasks
      .filter(t => t.progressPercentage)
      .reduce((sum, t, _, arr) => sum + (t.progressPercentage || 0) / arr.length, 0);

    return { total, completed, active, overdue, escalated, avgProgress };
  }, [tasks]);

  // ─── EMPLOYEE PRODUCTIVITY ──────────────────────────────
  const employeeProductivity = useMemo(() => {
    return users
      .filter(u => u.role === "Employee" || u.role === "Manager")
      .map(emp => {
        const assignedTickets = tickets.filter(t => t.assignedTo === emp.id);
        const resolvedTickets = assignedTickets.filter(t => ["Resolved", "Closed"].includes(t.status));
        const assignedTasks = tasks.filter(t => t.assignedTo === emp.id);
        const completedTasks = assignedTasks.filter(t => t.status === "Completed");
        const overdueTasks = assignedTasks.filter(t => t.status === "Overdue" || (t.status !== "Completed" && new Date(t.dueDate) < new Date()));
        const avgSat = assignedTickets
          .filter(t => t.satisfactionRating)
          .reduce((sum, t, _, arr) => sum + (t.satisfactionRating || 0) / (arr.length || 1), 0);

        const score = Math.max(0, Math.min(100,
          40 + (resolvedTickets.length * 15) + (completedTasks.length * 12) - (overdueTasks.length * 10) + (avgSat * 5)
        ));

        return {
          id: emp.id,
          fullName: emp.fullName,
          email: emp.email,
          department: emp.department,
          role: emp.role,
          ticketsResolved: resolvedTickets.length,
          tasksCompleted: completedTasks.length,
          tasksOverdue: overdueTasks.length,
          avgSatisfaction: avgSat || 0,
          productivityScore: Math.round(score),
        };
      })
      .sort((a, b) => b.productivityScore - a.productivityScore);
  }, [users, tickets, tasks]);

  // ─── CLIENT STATISTICS ──────────────────────────────────
  const clientStats = useMemo(() => {
    return clients.map(client => {
      const clientTickets = tickets.filter(t => t.clientId === client.id);
      const closed = clientTickets.filter(t => ["Resolved", "Closed"].includes(t.status));
      const open = clientTickets.filter(t => !["Resolved", "Closed"].includes(t.status));
      const criticalOpen = clientTickets.filter(t => t.priority === "Critical" && !["Resolved", "Closed"].includes(t.status));
      const avgSat = clientTickets
        .filter(t => t.satisfactionRating)
        .reduce((sum, t, _, arr) => sum + (t.satisfactionRating || 0) / (arr.length || 1), 0);
      const lastTicket = clientTickets.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())[0];

      return {
        id: client.id,
        companyName: client.companyName,
        contactPerson: client.contactPerson,
        email: client.email,
        status: client.status,
        totalTickets: clientTickets.length,
        closedTickets: closed.length,
        openTickets: open.length,
        criticalOpenTickets: criticalOpen.length,
        avgSatisfaction: avgSat || 0,
        lastTicketDate: lastTicket?.createdDate || null,
      };
    }).sort((a, b) => b.totalTickets - a.totalTickets);
  }, [clients, tickets]);

  // ─── EXPORT FUNCTIONS ───────────────────────────────────
  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(h => JSON.stringify((obj as any)[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const exportToExcel = async (data: any[], filename: string) => {
    // Dynamic import of exceljs
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(filename);
    
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const headerRow = sheet.addRow(headers.map(h => h.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())));
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    
    data.forEach(item => {
      sheet.addRow(headers.map(h => (item as any)[h] ?? ""));
    });
    
    sheet.columns.forEach(column => {
      column.width = 20;
    });
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const exportToPDF = async (title: string, data: any[], headers: string[], filename: string) => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    
    autoTable(doc, {
      head: [headers],
      body: data.map(item => headers.map(h => String((item as any)[h.replace(/\s/g, '')] ?? ""))),
      startY: 32,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [31, 41, 55] },
    });
    
    doc.save(`${filename}.pdf`);
  };

  // ─── RENDER TICKET REPORT ───────────────────────────────
  const renderTicketReport = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Total Tickets</span>
            <BarChart4 className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-900">{ticketReport.total}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Open</span>
            <Activity className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{ticketReport.open}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Resolved</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{ticketReport.resolved}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Avg Rating</span>
            <Star className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-900">{ticketReport.avgSatisfaction > 0 ? ticketReport.avgSatisfaction.toFixed(1) : "—"}</p>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Status Distribution</h3>
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(ticketReport.byStatus).map(([key, count]) => (
            <div key={key} className="flex flex-col items-center text-center">
              <div className="flex h-20 w-full items-end justify-center rounded-lg bg-zinc-50 border border-zinc-100 overflow-hidden">
                <div
                  className={`w-full rounded-t transition-all duration-500 ${
                    key === "new" ? "bg-blue-500" :
                    key === "assigned" ? "bg-indigo-500" :
                    key === "inProgress" ? "bg-amber-500" :
                    key === "pending" ? "bg-purple-500" :
                    key === "resolved" ? "bg-emerald-500" : "bg-zinc-400"
                  }`}
                  style={{ height: `${Math.max((count / Math.max(ticketReport.total, 1)) * 100, 4)}px` }}
                ></div>
              </div>
              <span className="mt-1.5 text-[10px] font-bold text-zinc-600 font-mono">{count}</span>
              <span className="text-[9px] text-zinc-400 uppercase tracking-wider">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </span>
            </div>
          ))}
        </div>
      </div>

{/* Charts Row - Recharts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status Pie Chart */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-indigo-500" />
            Ticket Status Distribution
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <RechartPie>
              <Pie
                data={Object.entries(ticketReport.byStatus).map(([key, value]) => ({
                  name: key.replace(/([A-Z])/g, ' $1').trim(),
                  value,
                }))}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
              >
                {Object.entries(ticketReport.byStatus).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartTooltip />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </RechartPie>
          </ResponsiveContainer>
        </div>

        {/* Priority Pie Chart */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Ticket Priority Distribution
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <RechartPie>
              <Pie
                data={(["Critical", "High", "Medium", "Low"] as const).map(p => ({
                  name: p,
                  value: tickets.filter(t => t.priority === p).length,
                }))}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
              >
                {(["Critical", "High", "Medium", "Low"]).map((_, index) => (
                  <Cell key={`cell-${index}`} fill={["#EF4444", "#F59E0B", "#6366F1", "#10B981"][index]} />
                ))}
              </Pie>
              <RechartTooltip />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </RechartPie>
          </ResponsiveContainer>
        </div>

        {/* Monthly Ticket Trend */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <LineChart className="h-4 w-4 text-sky-500" />
            Monthly Ticket Trend
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <RechartLine data={(() => {
              const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
              return months.map(m => {
                const monthIdx = months.indexOf(m);
                const count = tickets.filter(t => {
                  const d = new Date(t.createdDate);
                  return d.getMonth() === monthIdx;
                }).length;
                return { month: m, tickets: count };
              });
            })()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#71717A" />
              <YAxis tick={{ fontSize: 10 }} stroke="#71717A" allowDecimals={false} />
              <RechartTooltip />
              <Line type="monotone" dataKey="tickets" stroke="#6366F1" strokeWidth={2} dot={{ fill: "#6366F1", r: 4 }} />
            </RechartLine>
          </ResponsiveContainer>
        </div>

        {/* Monthly Task Completion */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Monthly Task Completion
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={(() => {
              const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
              return months.map(m => {
                const monthIdx = months.indexOf(m);
                const completed = tasks.filter(t => {
                  const d = new Date(t.completionDate || t.updatedDate);
                  return d.getMonth() === monthIdx && t.status === "Completed";
                }).length;
                const assigned = tasks.filter(t => {
                  const d = new Date(t.createdDate);
                  return d.getMonth() === monthIdx;
                }).length;
                return { month: m, Completed: completed, Assigned: assigned };
              });
            })()}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#71717A" />
              <YAxis tick={{ fontSize: 10 }} stroke="#71717A" allowDecimals={false} />
              <RechartTooltip />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="Assigned" fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Completed" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Employee Productivity Bar Chart */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-2">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart4 className="h-4 w-4 text-indigo-500" />
            Employee Productivity Bar Chart
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={employeeProductivity.map(e => ({
              name: e.fullName.split(" ")[0],
              Productivity: e.productivityScore,
              Tickets: e.ticketsResolved,
              Tasks: e.tasksCompleted,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#71717A" />
              <YAxis tick={{ fontSize: 10 }} stroke="#71717A" />
              <RechartTooltip />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="Productivity" fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tickets" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tasks" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Priority Alert */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-800">{ticketReport.criticalOpen} Critical Open</p>
              <p className="text-xs text-red-600">{ticketReport.highOpen} High priority open</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-bold text-zinc-800">Resolution Rate</p>
              <p className="text-xs text-zinc-500">
                {ticketReport.total > 0
                  ? `${Math.round((ticketReport.resolved / ticketReport.total) * 100)}% resolved`
                  : "No tickets yet"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Export Report:</span>
        <button onClick={() => exportToCSV(tickets, "ticket-report")}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          <FileDown className="h-3.5 w-3.5" /> CSV
        </button>
        <button onClick={() => exportToExcel(tickets, "ticket-report")}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
        </button>
        <button onClick={() => exportToPDF(
          "Ticket Report",
          tickets,
          ["ID", "Subject", "Priority", "Status", "Assigned To", "Created"],
          "ticket-report"
        )}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          <FileText className="h-3.5 w-3.5" /> PDF
        </button>
      </div>
    </div>
  );

  // ─── RENDER TASK REPORT ─────────────────────────────────
  const renderTaskReport = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Total</span>
          <p className="mt-2 text-2xl font-bold text-zinc-900">{taskReport.total}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Completed</span>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{taskReport.completed}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Active</span>
          <p className="mt-2 text-2xl font-bold text-amber-600">{taskReport.active}</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 font-mono">Overdue</span>
          <p className="mt-2 text-2xl font-bold text-red-600">{taskReport.overdue}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Avg Progress</span>
          <p className="mt-2 text-2xl font-bold text-zinc-900">{taskReport.avgProgress > 0 ? `${Math.round(taskReport.avgProgress)}%` : "—"}</p>
        </div>
      </div>

      {/* Progress bars */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Completion vs Active vs Overdue</h3>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-emerald-700">Completed</span>
              <span className="font-mono text-zinc-500">{taskReport.completed}/{taskReport.total}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${taskReport.total > 0 ? (taskReport.completed / taskReport.total) * 100 : 0}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-amber-700">Active</span>
              <span className="font-mono text-zinc-500">{taskReport.active}/{taskReport.total}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${taskReport.total > 0 ? (taskReport.active / taskReport.total) * 100 : 0}%` }}></div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-red-700">Overdue / Escalated</span>
              <span className="font-mono text-zinc-500">{taskReport.overdue + taskReport.escalated}/{taskReport.total}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-red-500" style={{ width: `${taskReport.total > 0 ? ((taskReport.overdue + taskReport.escalated) / taskReport.total) * 100 : 0}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Export Report:</span>
        <button onClick={() => exportToCSV(tasks, "task-report")}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          <FileDown className="h-3.5 w-3.5" /> CSV
        </button>
        <button onClick={() => exportToExcel(tasks, "task-report")}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
        </button>
        <button onClick={() => exportToPDF("Task Report", tasks, ["ID", "Title", "Priority", "Status", "Assigned To", "Due Date"], "task-report")}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          <FileText className="h-3.5 w-3.5" /> PDF
        </button>
      </div>
    </div>
  );

  // ─── RENDER EMPLOYEE PRODUCTIVITY ───────────────────────
  const renderEmployeeProductivity = () => {
    const topScore = Math.max(...employeeProductivity.map(e => e.productivityScore), 1);

    return (
      <div className="space-y-6">
        {/* Team Summary */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Team Members</span>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{employeeProductivity.length}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Tickets Resolved</span>
            <p className="mt-2 text-2xl font-bold text-emerald-600">
              {employeeProductivity.reduce((sum, e) => sum + e.ticketsResolved, 0)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Tasks Completed</span>
            <p className="mt-2 text-2xl font-bold text-blue-600">
              {employeeProductivity.reduce((sum, e) => sum + e.tasksCompleted, 0)}
            </p>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 font-mono">Overdue Tasks</span>
            <p className="mt-2 text-2xl font-bold text-red-600">
              {employeeProductivity.reduce((sum, e) => sum + e.tasksOverdue, 0)}
            </p>
          </div>
        </div>

        {/* Productivity Chart */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-6 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" />
            Employee Productivity Scores
          </h3>
          <div className="flex items-end justify-between gap-2 h-48 border-b border-zinc-200 pb-2">
            {employeeProductivity.slice(0, 10).map(emp => (
              <div key={emp.id} className="flex-1 flex flex-col items-center group relative">
                <span className="absolute bottom-full mb-1 bg-zinc-950 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition">
                  {emp.fullName}: {emp.productivityScore} pts
                </span>
                <div
                  className={`w-full rounded-t transition-all ${
                    emp.productivityScore >= 70 ? "bg-emerald-500" :
                    emp.productivityScore >= 40 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ height: `${(emp.productivityScore / topScore) * 100}%` }}
                ></div>
                <span className="mt-1.5 text-[8px] font-semibold text-zinc-700 truncate max-w-[60px] text-center">
                  {emp.fullName.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Employee List */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider font-mono text-[10px]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Resolved</th>
                  <th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Overdue</th>
                  <th className="px-4 py-3">Satisfaction</th>
                  <th className="px-4 py-3">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {employeeProductivity.map(emp => (
                  <tr key={emp.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-semibold text-zinc-900">{emp.fullName}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{emp.department}</td>
                    <td className="px-4 py-2.5 text-emerald-600 font-bold">{emp.ticketsResolved}</td>
                    <td className="px-4 py-2.5 text-blue-600 font-bold">{emp.tasksCompleted}</td>
                    <td className="px-4 py-2.5 text-red-600 font-bold">{emp.tasksOverdue}</td>
                    <td className="px-4 py-2.5">{emp.avgSatisfaction > 0 ? `${emp.avgSatisfaction.toFixed(1)}/5` : "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        emp.productivityScore >= 70 ? "bg-emerald-50 text-emerald-700" :
                        emp.productivityScore >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                      }`}>
                        {emp.productivityScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Export Report:</span>
          <button onClick={() => exportToCSV(employeeProductivity, "employee-productivity")}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <FileDown className="h-3.5 w-3.5" /> CSV
          </button>
          <button onClick={() => exportToExcel(employeeProductivity, "employee-productivity")}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </button>
          <button onClick={() => exportToPDF(
            "Employee Productivity Report",
            employeeProductivity,
            ["Employee", "Department", "Resolved", "Completed", "Overdue", "Satisfaction", "Score"],
            "employee-productivity"
          )}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>
    );
  };

  // ─── RENDER CLIENT STATISTICS ───────────────────────────
  const renderClientStatistics = () => {
    const totalOpenTickets = clientStats.reduce((sum, c) => sum + c.openTickets, 0);
    const totalClosedTickets = clientStats.reduce((sum, c) => sum + c.closedTickets, 0);
    const avgSatisfactionOverall = clientStats
      .filter(c => c.avgSatisfaction > 0)
      .reduce((sum, c, _, arr) => sum + c.avgSatisfaction / arr.length, 0);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Total Clients</span>
            <p className="mt-2 text-2xl font-bold text-zinc-900">{clientStats.length}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Open Tickets</span>
            <p className="mt-2 text-2xl font-bold text-amber-600">{totalOpenTickets}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Closed Tickets</span>
            <p className="mt-2 text-2xl font-bold text-emerald-600">{totalClosedTickets}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Avg Satisfaction</span>
            <p className="mt-2 text-2xl font-bold text-zinc-900">
              {avgSatisfactionOverall > 0 ? avgSatisfactionOverall.toFixed(1) : "—"}
            </p>
          </div>
        </div>

        {/* Client List */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider font-mono text-[10px]">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total Tickets</th>
                  <th className="px-4 py-3">Open</th>
                  <th className="px-4 py-3">Closed</th>
                  <th className="px-4 py-3">Critical</th>
                  <th className="px-4 py-3">Satisfaction</th>
                  <th className="px-4 py-3">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {clientStats.map(client => (
                  <tr key={client.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-semibold text-zinc-900">{client.companyName}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{client.contactPerson}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        client.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                      }`}>{client.status}</span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-zinc-900">{client.totalTickets}</td>
                    <td className="px-4 py-2.5 text-amber-600 font-bold">{client.openTickets}</td>
                    <td className="px-4 py-2.5 text-emerald-600 font-bold">{client.closedTickets}</td>
                    <td className="px-4 py-2.5">
                      {client.criticalOpenTickets > 0 ? (
                        <span className="text-red-600 font-bold">{client.criticalOpenTickets}</span>
                      ) : (
                        <span className="text-zinc-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{client.avgSatisfaction > 0 ? `${client.avgSatisfaction.toFixed(1)}/5` : "—"}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-[10px]">
                      {client.lastTicketDate ? formatDate(client.lastTicketDate) : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Export Report:</span>
          <button onClick={() => exportToCSV(clientStats, "client-statistics")}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <FileDown className="h-3.5 w-3.5" /> CSV
          </button>
          <button onClick={() => exportToExcel(clientStats, "client-statistics")}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </button>
          <button onClick={() => exportToPDF(
            "Client Statistics Report",
            clientStats,
            ["Company", "Contact", "Status", "Total Tickets", "Open", "Closed", "Critical", "Satisfaction", "Last Activity"],
            "client-statistics"
          )}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Report Navigation Tabs */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 font-sans">
            Reporting & Analytics
          </h2>
          <p className="text-sm text-zinc-500">
            Generate detailed reports and export to CSV, Excel, or PDF.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1">
          {(["tickets", "tasks", "employees", "clients"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                activeTab === tab
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {tab === "employees" ? "Employee Productivity" : `${tab.charAt(0).toUpperCase() + tab.slice(1)}`}
            </button>
          ))}
        </div>
      </div>

      {/* Report Content */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === "tickets" && renderTicketReport()}
        {activeTab === "tasks" && renderTaskReport()}
        {activeTab === "employees" && renderEmployeeProductivity()}
        {activeTab === "clients" && renderClientStatistics()}
      </div>
    </div>
  );
}

