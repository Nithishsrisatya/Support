import React, { useState } from "react";
import { User, Client, Ticket, Task, Notification, TicketStatus, TaskStatus } from "../types";
import { formatDate } from "../utils";
import { 
  Clock, CheckCircle2, Upload, FileText, AlertTriangle, ShieldAlert, Eye, LayoutDashboard,
  Calendar as CalendarIcon
} from "lucide-react";
import TicketDetailModal from "./TicketDetailModal";
import HomeDashboard from "./HomeDashboard";
import DeadlineCalendar from "./DeadlineCalendar";

interface EmployeeDashboardProps {
  currentEmployee: User;
  clients: Client[];
  tickets: Ticket[];
  tasks: Task[];
  notifications: Notification[];
  onUpdateTicketStatus: (ticketId: string, status: TicketStatus, notes?: string, resolution?: string) => void;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus, notes?: string) => void;
}

export default function EmployeeDashboard({
  currentEmployee,
  clients,
  tickets,
  tasks,
  notifications,
  onUpdateTicketStatus,
  onUpdateTaskStatus,
}: EmployeeDashboardProps) {
const [activeTab, setActiveTab] = useState<"dashboard" | "tickets" | "tasks" | "deadlines">("dashboard");
  
  const [resolvingTicketId, setViewingResolutionModal] = useState<string | null>(null);
  const [completingTaskId, setViewingCompletionModal] = useState<string | null>(null);
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<Ticket | null>(null);

  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");

  const employeeTickets = tickets.filter((t) => t.assignedTo === currentEmployee.id);
  const employeeTasks = tasks.filter((t) => t.assignedTo === currentEmployee.id);

  const countInProgressTasks = employeeTasks.filter((t) => t.status !== "Completed" && ["In Progress", "Assigned"].includes(t.status)).length;
  const countOpenTickets = employeeTickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length;

  // Focus Mode Calculations
  const overdueTasks = employeeTasks.filter(t => t.isOverdue && t.status !== "Completed");
  const criticalTickets = employeeTickets.filter(t => t.status !== "Closed" && t.status !== "Resolved" && t.priority === "Critical");

  const handleMockUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadedFileName(e.target.files[0].name);
    }
  };

  const handleResolveTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingTicketId || !resolutionSummary) return;
    onUpdateTicketStatus(resolvingTicketId, "Resolved", resolutionNotes, resolutionSummary);
    setResolutionSummary("");
    setResolutionNotes("");
    setViewingResolutionModal(null);
  };

  const handleCompleteTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTaskId) return;
    const finalNote = uploadedFileName ? `${taskNotes} (Attached file: ${uploadedFileName})` : taskNotes;
    onUpdateTaskStatus(completingTaskId, "Completed", finalNote);
    setTaskNotes("");
    setUploadedFileName("");
    setViewingCompletionModal(null);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Dynamic Greeting Banner */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 flex flex-col justify-between sm:flex-row sm:items-center gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Workspace Active</span>
          </div>
          <h2 className="text-lg font-bold text-zinc-900 font-sans">
            {currentEmployee.fullName}, {currentEmployee.department}
          </h2>
          <p className="text-xs text-zinc-500 leading-normal">
            Manage your support tickets, complete compliance tasks, and maintain SLA uptime.
          </p>
        </div>

        <div className="flex gap-4 text-xs font-semibold font-mono text-zinc-700 bg-zinc-50 rounded-xl p-3 border border-zinc-150">
          <div>
            <span className="block text-[9px] text-zinc-400 uppercase tracking-widest leading-none">Open Tickets</span>
            <span className="block text-xl font-bold text-indigo-600 mt-1">{countOpenTickets}</span>
          </div>
          <div className="border-l border-zinc-200 pl-4">
            <span className="block text-[9px] text-zinc-400 uppercase tracking-widest leading-none">Active Tasks</span>
            <span className="block text-xl font-bold text-emerald-600 mt-1">{countInProgressTasks}</span>
          </div>
        </div>
      </div>

      {/* 2. Focus Mode Alert Banner (Only shows if urgent items exist) */}
      {(overdueTasks.length > 0 || criticalTickets.length > 0) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-900">Focus Mode: Action Required</h3>
            <p className="text-xs text-red-700 mt-1">
              You have {criticalTickets.length > 0 ? <span className="font-bold">{criticalTickets.length} critical ticket(s)</span> : null} 
              {criticalTickets.length > 0 && overdueTasks.length > 0 ? " and " : null}
              {overdueTasks.length > 0 ? <span className="font-bold">{overdueTasks.length} overdue task(s)</span> : null} that require immediate attention.
            </p>
          </div>
        </div>
      )}

{/* Primary Workspace Nav Subtabs */}
      <div className="flex gap-1.5 rounded-xl bg-zinc-100 p-1 w-max">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition duration-150 flex items-center gap-1.5 ${
            activeTab === "dashboard" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <LayoutDashboard size={14} />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab("tickets")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition duration-150 ${
            activeTab === "tickets" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Support Cases ({employeeTickets.filter(t => t.status !== "Closed" && t.status !== "Resolved").length})
        </button>
        <button
          onClick={() => setActiveTab("tasks")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition duration-150 ${
            activeTab === "tasks" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Internal Tasks ({employeeTasks.filter(tk => tk.status !== "Completed").length})
        </button>
        <button
          onClick={() => setActiveTab("deadlines")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition duration-150 flex items-center gap-1.5 ${
            activeTab === "deadlines" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <CalendarIcon size={14} />
          Deadline Calendar
        </button>
      </div>

{/* Dashboard Overview */}
      {activeTab === "dashboard" && (
        <HomeDashboard
          tickets={tickets}
          tasks={tasks}
          users={[currentEmployee]}
        />
      )}

      {/* MY SUPPORT TICKETS PANEL */}
      {activeTab === "tickets" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {employeeTickets.length === 0 ? (
              <p className="py-12 text-center text-zinc-500 text-sm">No support tickets have been assigned to your workspace.</p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {employeeTickets.map((ticket) => {
                  const client = clients.find((c) => c.id === ticket.clientId);
                  const isClosed = ticket.status === "Closed" || ticket.status === "Resolved";
                  const isCritical = ticket.priority === "Critical" && !isClosed;

                  return (
                    <div key={ticket.id} className={`p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 transition text-sm ${isCritical ? 'bg-red-50/30' : 'hover:bg-zinc-50/50'}`}>
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="font-bold text-zinc-900">{ticket.id}</span>
                          <span className="text-zinc-300">·</span>
                          <span className="font-semibold text-indigo-600">{client?.companyName}</span>
                          <span className="text-zinc-300">·</span>
                          <span className="text-zinc-500">{formatDate(ticket.createdDate)}</span>
                        </div>

                        <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                          {isCritical && <ShieldAlert className="h-4 w-4 text-red-600" />}
                          {ticket.subject}
                        </h4>
                        <p className="text-xs text-zinc-600 leading-relaxed max-w-3xl">{ticket.description}</p>

                        <div className="flex gap-2 text-[10px] font-bold font-mono uppercase pt-2">
                          <span className={`rounded-md px-2 py-1 ${
                            ticket.priority === "Critical" ? "bg-red-100 text-red-800" :
                            ticket.priority === "High" ? "bg-orange-100 text-orange-800" : "bg-zinc-100 text-zinc-800"
                          }`}>
                            {ticket.priority}
                          </span>
                          <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-600">
                            Status: {ticket.status}
                          </span>
                        </div>
                      </div>

                      {!isClosed ? (
                        <div className="shrink-0 flex sm:flex-col items-stretch gap-2 bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                          <button
                            onClick={() => setSelectedTicketDetail(ticket)}
                            className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 text-xs shadow-sm flex items-center justify-center gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" /> View Details
                          </button>
                          {ticket.status === "Assigned" && (
                            <button onClick={() => onUpdateTicketStatus(ticket.id, "In Progress")} className="rounded-lg bg-zinc-900 px-4 py-2 font-bold text-white hover:bg-zinc-800 text-xs">
                              Accept & Start Work
                            </button>
                          )}
                          {ticket.status === "In Progress" && (
                            <>
                              <button onClick={() => onUpdateTicketStatus(ticket.id, "Pending")} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-bold text-zinc-700 hover:bg-zinc-50 text-xs">
                                Wait for Client Info
                              </button>
                              <button onClick={() => setViewingResolutionModal(ticket.id)} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 text-xs shadow-sm">
                                Resolve Ticket
                              </button>
                            </>
                          )}
                          {ticket.status === "Pending" && (
                            <button onClick={() => onUpdateTicketStatus(ticket.id, "In Progress")} className="rounded-lg bg-zinc-900 px-4 py-2 font-bold text-white hover:bg-zinc-800 text-xs">
                              Resume Work
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="shrink-0 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-emerald-800 self-start">
                          <p className="font-bold flex items-center gap-1.5 text-sm">
                            <CheckCircle2 className="h-4 w-4" />
                            Resolved Case
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MY ASSIGNED TASKS PANEL */}
      {activeTab === "tasks" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid gap-4 md:grid-cols-2">
            {employeeTasks.length === 0 ? (
              <p className="py-12 text-center text-zinc-500 text-sm col-span-2">No organizational tasks have been assigned.</p>
            ) : (
              employeeTasks.map((task) => {
                const isCompleted = task.status === "Completed";
                const isOverdue = task.isOverdue; // Use the isOverdue flag from the task object

                return (
                  <div key={task.id} className={`border bg-white p-6 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition text-sm flex flex-col justify-between ${
                    isOverdue ? "border-red-300 bg-red-50/20" : "border-zinc-200"
                  }`}>
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between text-zinc-500 font-mono text-[10px] uppercase font-bold">
                        <span>Ref: {task.id}</span>
                        <span className={`rounded-md px-2 py-1 ${
                          isCompleted ? "bg-emerald-100 text-emerald-800" :
                          isOverdue ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800"
                        }`}>
                          {task.status} {isOverdue && "(OVERDUE)"}
                        </span>
                      </div>
                      <h4 className="font-bold text-zinc-900">{task.title}</h4>
                      <p className="text-xs text-zinc-600 leading-relaxed">{task.description}</p>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-zinc-100 flex flex-col">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-500">Deadline:</span>
                        <span className={isOverdue ? "text-red-600 font-bold" : "text-zinc-900 font-bold"}>{formatDate(task.dueDate)}</span>
                      </div>

                      {!isCompleted ? (
                        <div className="flex items-center gap-2">
                          {task.status === "Assigned" && (
                            <button onClick={() => onUpdateTaskStatus(task.id, "In Progress")} className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-800 transition shadow-sm">
                              Accept Task
                            </button>
                          )}
                          {(task.status === "In Progress" || task.status === "Escalated") && (
                            <button onClick={() => setViewingCompletionModal(task.id)} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-sm">
                              Complete Task
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-zinc-50 rounded-xl text-zinc-600 border border-zinc-100 text-xs">
                          <p className="font-bold text-zinc-800 flex items-center gap-1.5 mb-1"><CheckCircle2 className="h-3 w-3 text-emerald-600"/> Completed logs</p>
                          <p className="italic">"{task.completionNotes}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* DEADLINE CALENDAR */}
      {activeTab === "deadlines" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <DeadlineCalendar
            currentUserRole="Employee"
            currentUserId={currentEmployee.id}
            currentUserName={currentEmployee.fullName}
          />
        </div>
      )}

      {/* RESOLVE TICKET MODAL */}
      {resolvingTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-7 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900">Resolve Ticket</h3>
            <p className="text-sm text-zinc-500 mt-1 mb-5">Provide diagnostic findings for the client.</p>

            <form onSubmit={handleResolveTicketSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block font-bold text-zinc-700 mb-1.5">Resolution Summary *</label>
                <textarea required rows={3} value={resolutionSummary} onChange={(e) => setResolutionSummary(e.target.value)} className="w-full rounded-xl border border-zinc-200 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label className="block font-bold text-zinc-700 mb-1.5">Internal Notes (Optional)</label>
                <textarea rows={2} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} className="w-full rounded-xl border border-zinc-200 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setViewingResolutionModal(null)} className="rounded-xl px-4 py-2 font-bold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                <button type="submit" className="rounded-xl bg-indigo-600 px-5 py-2 font-bold text-white hover:bg-indigo-700 shadow-sm">Resolve</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE TASK MODAL */}
      {completingTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-7 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Verify Completion
            </h3>
            <p className="text-sm text-zinc-500 mt-1 mb-5">Supply auditing notes and execution reports.</p>

            <form onSubmit={handleCompleteTaskSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block font-bold text-zinc-700 mb-1.5">Completion Notes *</label>
                <textarea required rows={3} value={taskNotes} onChange={(e) => setTaskNotes(e.target.value)} className="w-full rounded-xl border border-zinc-200 p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div>
                <label className="block font-bold text-zinc-700 mb-1.5">Attachment (Optional)</label>
                <div className="flex items-center justify-between border-2 border-dashed border-zinc-200 rounded-xl p-4 hover:bg-zinc-50 cursor-pointer relative">
                  <input type="file" onChange={handleMockUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-zinc-400" />
                    <span className="text-zinc-600 font-medium">{uploadedFileName || "Choose file..."}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setViewingCompletionModal(null)} className="rounded-xl px-4 py-2 font-bold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                <button type="submit" className="rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 shadow-sm">Complete Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TICKET DETAIL MODAL */}
      {selectedTicketDetail && (
        <TicketDetailModal
          ticket={selectedTicketDetail}
          users={[]}
          currentUserId={currentEmployee.id}
          currentUserRole={currentEmployee.role}
          currentUserName={currentEmployee.fullName}
          onClose={() => setSelectedTicketDetail(null)}
          onUpdateStatus={(ticketId, status, notes, resolution) => {
            onUpdateTicketStatus(ticketId, status, notes, resolution);
            setSelectedTicketDetail(null);
          }}
        />
      )}

    </div>
  );
}
