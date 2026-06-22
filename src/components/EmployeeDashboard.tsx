import React, { useState } from "react";
import { User, Client, Ticket, Task, Notification, TicketStatus, TaskStatus, TicketPriority } from "../types";
import { formatDate, formatDateTime } from "../utils";
import { 
  ClipboardList, Clock, CheckCircle2, ChevronRight, Save, Upload, 
  HelpCircle, AlertTriangle, AlertCircle, FileText, Send, Sparkles
} from "lucide-react";

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
  // Tabs: 'tickets' | 'tasks' | 'deadlines'
  const [activeTab, setActiveTab] = useState<"tickets" | "tasks" | "deadlines">("tickets");
  
  // Modal / Form trigger states
  const [resolvingTicketId, setViewingResolutionModal] = useState<string | null>(null);
  const [completingTaskId, setViewingCompletionModal] = useState<string | null>(null);

  // Forms states
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");

  // Filter personal data
  const employeeTickets = tickets.filter((t) => t.assignedTo === currentEmployee.id);
  const employeeTasks = tasks.filter((t) => t.assignedTo === currentEmployee.id);

  // Stats Counters
  const countAssignedTasks = employeeTasks.filter((t) => t.status === "Assigned").length;
  const countInProgressTasks = employeeTasks.filter((t) => t.status === "In Progress").length;
  const countCompletedTasks = employeeTasks.filter((t) => t.status === "Completed").length;
  const countOpenTickets = employeeTickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length;

  // Handle mock file uploads
  const handleMockUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadedFileName(e.target.files[0].name);
    }
  };

  const handleResolveTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingTicketId || !resolutionSummary) return;
    
    // Resolve ticket and save
    onUpdateTicketStatus(resolvingTicketId, "Resolved", resolutionNotes, resolutionSummary);
    
    // Reset Form
    setResolutionSummary("");
    setResolutionNotes("");
    setViewingResolutionModal(null);
  };

  const handleCompleteTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTaskId) return;

    // Compile completion note including mocked upload files name
    const finalNote = uploadedFileName 
      ? `${taskNotes} (Attached file: ${uploadedFileName})` 
      : taskNotes;

    // Complete task and save
    onUpdateTaskStatus(completingTaskId, "Completed", finalNote);

    // Reset Form
    setTaskNotes("");
    setUploadedFileName("");
    setViewingCompletionModal(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Dashboard Greeting Banner */}
      <div className="rounded-2xl border border-zinc-250 bg-white p-5 flex flex-col justify-between sm:flex-row sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Operations Console active</span>
          </div>
          <h2 className="text-lg font-bold text-zinc-900 font-sans mt-0.5">David Kim, Operations Engineer</h2>
          <p className="text-xs text-zinc-500 leading-normal">
            Active workspace directory. Work on assigned support tickets, complete task logs, and ensure SLA uptime.
          </p>
        </div>

        {/* Counters summary widget */}
        <div className="flex gap-4 text-xs font-semibold font-mono text-zinc-700 bg-zinc-50 rounded-xl p-3 border border-zinc-150">
          <div>
            <span className="block text-[8px] text-zinc-400 uppercase tracking-widest leading-none">Open Tickets</span>
            <span className="block text-base font-bold text-indigo-600 mt-1">{countOpenTickets} cases</span>
          </div>
          <div className="border-l border-zinc-200 pl-3">
            <span className="block text-[8px] text-zinc-400 uppercase tracking-widest leading-none">In Progress Tasks</span>
            <span className="block text-base font-bold text-zinc-900 mt-1">{countInProgressTasks} active</span>
          </div>
        </div>
      </div>

      {/* Primary Workspace Nav Subtabs */}
      <div className="flex gap-1.5 rounded-xl bg-zinc-100 p-1 w-max">
        <button
          onClick={() => setActiveTab("tickets")}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-lg transition duration-150 ${
            activeTab === "tickets" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          My Support Cases ({employeeTickets.filter(t => t.status !== "Closed" && t.status !== "Resolved").length})
        </button>
        <button
          onClick={() => setActiveTab("tasks")}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-lg transition duration-150 ${
            activeTab === "tasks" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          My Tasks ({employeeTasks.filter(tk => tk.status !== "Completed").length})
        </button>
        <button
          onClick={() => setActiveTab("deadlines")}
          className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wide rounded-lg transition duration-150 ${
            activeTab === "deadlines" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          My Deadline Monitor
        </button>
      </div>

      {/* MY SUPPORT TICKETS PANEL */}
      {activeTab === "tickets" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            {employeeTickets.length === 0 ? (
              <p className="py-12 text-center text-zinc-450 text-xs">No support tickets have been assigned to your workspace yet.</p>
            ) : (
              <div className="divide-y divide-zinc-150">
                {employeeTickets.map((ticket) => {
                  const client = clients.find((c) => c.id === ticket.clientId);
                  const isClosed = ticket.status === "Closed" || ticket.status === "Resolved";

                  return (
                    <div key={ticket.id} className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-zinc-50/40 transition text-xs">
                      <div className="space-y-1.5 flex-1 select-none">
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span className="font-bold text-zinc-900">{ticket.id}</span>
                          <span className="text-zinc-300">·</span>
                          <span className="font-semibold text-indigo-650">{client?.companyName}</span>
                          <span className="text-zinc-300">·</span>
                          <span className="text-zinc-400">Received {formatDate(ticket.createdDate)}</span>
                        </div>

                        <h4 className="text-xs font-bold text-zinc-900 leading-snug">{ticket.subject}</h4>
                        <p className="text-[11px] text-zinc-500 leading-relaxed text-zinc-650 max-w-2xl">{ticket.description}</p>

                        <div className="flex flex-wrap gap-2 text-[9px] font-bold font-mono tracking-wide uppercase pt-1">
                          <span className={`rounded-xl px-1.5 py-0.2 ${
                            ticket.priority === "Critical" ? "bg-red-50 text-red-800 animate-pulse" :
                            ticket.priority === "High" ? "bg-orange-50 text-orange-850" : "bg-zinc-100 text-zinc-800"
                          }`}>
                            {ticket.priority} Urgency
                          </span>
                          <span className="rounded-xl bg-sky-50 px-1.5 py-0.2 text-sky-850">
                            {ticket.category}
                          </span>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-zinc-600">
                            State: {ticket.status}
                          </span>
                        </div>
                      </div>

                      {/* Interactive Workspace workflows */}
                      {!isClosed ? (
                        <div className="shrink-0 flex sm:flex-col items-stretch gap-2 bg-zinc-50 p-3 rounded-lg border border-zinc-150">
                          {ticket.status === "Assigned" && (
                            <button
                              type="button"
                              onClick={() => onUpdateTicketStatus(ticket.id, "In Progress")}
                              className="rounded-lg bg-zinc-950 px-3.5 py-1.5 font-bold text-white transition hover:bg-zinc-800 tracking-wide text-xs"
                            >
                              Accept & Start Work
                            </button>
                          )}

                          {ticket.status === "In Progress" && (
                            <div className="w-full flex flex-col gap-2">
                              {/* Request user response / pause */}
                              <button
                                type="button"
                                onClick={() => onUpdateTicketStatus(ticket.id, "Pending")}
                                className="rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 font-semibold text-zinc-700 transition hover:bg-zinc-50"
                              >
                                Wait for Client Info
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => setViewingResolutionModal(ticket.id)}
                                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 font-bold text-white transition hover:bg-indigo-700 tracking-wide text-xs"
                              >
                                Resolve Support Ticket
                              </button>
                            </div>
                          )}

                          {ticket.status === "Pending" && (
                            <button
                              type="button"
                              onClick={() => onUpdateTicketStatus(ticket.id, "In Progress")}
                              className="rounded-lg bg-zinc-900 px-3.5 py-1.5 font-bold text-white text-xs"
                            >
                              Resume Investigation
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="shrink-0 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-emerald-800 self-start">
                          <p className="font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Resolved Case</span>
                          </p>
                          <p className="text-[10px] text-emerald-600 mt-0.5 leading-normal max-w-[160px]">
                            Successfully resolved. Log closed files securely.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RESOLVE TICKET DIALOG SHEET */}
          {resolvingTicketId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                <h3 className="text-base font-bold text-zinc-900 font-sans">
                  Generate Ticket Resolution brief
                </h3>
                <p className="text-xs text-zinc-400 mt-1 pb-3 border-b border-zinc-100">
                  Provide diagnostic findings. This summary will be sent directly to the client's coordinator.
                </p>

                <form onSubmit={handleResolveTicketSubmit} className="mt-4 space-y-3.5 text-xs">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Resolution Summary *</label>
                    <textarea
                      required
                      rows={3}
                      value={resolutionSummary}
                      onChange={(e) => setResolutionSummary(e.target.value)}
                      placeholder="e.g. Cleared load balancer threads, patched index key socket leaks, and restarted live operations gateway."
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Internal Engineering Notes (Optional)</label>
                    <textarea
                      rows={2}
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="e.g. Leaks resolved. Plugs will automatically hold Tier-3 load cycles."
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-100 mt-5">
                    <button
                      type="button"
                      onClick={() => setViewingResolutionModal(null)}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white transition hover:bg-indigo-700"
                    >
                      Complete Resolution
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* MY ASSIGNED TASKS PANEL */}
      {activeTab === "tasks" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          <div className="grid gap-4 md:grid-cols-2">
            {employeeTasks.length === 0 ? (
              <p className="py-12 text-center text-zinc-450 text-xs col-span-2">No organizational tasks have been assigned to your workspace.</p>
            ) : (
              employeeTasks.map((task) => {
                const isCompleted = task.status === "Completed";
                const isOverdue = task.status !== "Completed" && new Date(task.dueDate) < new Date("2026-06-16");

                return (
                  <div key={task.id} className={`rounded-x2 border bg-white p-5 rounded-2xl shadow-sm space-y-4 hover:shadow-md transition text-xs flex flex-col justify-between ${
                    isOverdue ? "border-red-200 bg-red-50/10" : "border-zinc-200"
                  }`}>
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center justify-between text-zinc-400 font-mono text-[9px] uppercase font-semibold">
                        <span>Ref: {task.id} · {task.taskCategory}</span>
                        <span className={`rounded-xl px-2 py-0.5 text-[9px] font-bold ${
                          isCompleted ? "bg-emerald-50 text-emerald-800" :
                          task.status === "Escalated" || isOverdue ? "bg-red-50 text-red-900 animate-pulse" :
                          "bg-sky-50 text-sky-850"
                        }`}>
                          {task.status} {isOverdue && "(OVERDUE)"}
                        </span>
                      </div>

                      <h4 className="font-bold text-zinc-900 text-xs">{task.title}</h4>
                      <p className="text-[11px] text-zinc-550 leading-normal text-zinc-600">{task.description}</p>
                    </div>

                    <div className="space-y-3.5 pt-3 border-t border-zinc-100 flex flex-col gap-2">
                      <div className="flex items-center justify-between mt-1 text-[11px] text-zinc-500 font-mono select-none">
                        <span>Fulfill Deadline:</span>
                        <span className={isOverdue ? "text-red-600 font-bold" : "text-zinc-850"}>{formatDate(task.dueDate)}</span>
                      </div>

                      {!isCompleted ? (
                        <div className="flex items-center gap-2">
                          {task.status === "Assigned" && (
                            <button
                              type="button"
                              onClick={() => onUpdateTaskStatus(task.id, "In Progress")}
                              className="flex-1 rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-zinc-800"
                            >
                              Accept Task
                            </button>
                          )}

                          {(task.status === "In Progress" || task.status === "Escalated") && (
                            <button
                              type="button"
                              onClick={() => setViewingCompletionModal(task.id)}
                              className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700"
                            >
                              Set Fuses (Complete)
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 bg-zinc-50 rounded-lg text-zinc-500">
                          <p className="font-mono text-[9px] uppercase tracking-wider">Completed logs</p>
                          <p className="mt-1 italic text-zinc-600 font-sans">"{task.completionNotes}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* COMPLETE TASK DIALOG SHEET */}
          {completingTaskId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                <h3 className="text-base font-bold text-zinc-900 font-sans flex items-center gap-1.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span>Verify Work Completion</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1 pb-3 border-b border-zinc-100 leading-normal">
                  Supply auditing notes and attach execution reports. Checked files are saved on secure VPS system files.
                </p>

                <form onSubmit={handleCompleteTaskSubmit} className="mt-4 space-y-4.5 text-xs">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Completion Notes *</label>
                    <textarea
                      required
                      rows={2.5}
                      value={taskNotes}
                      onChange={(e) => setTaskNotes(e.target.value)}
                      placeholder="e.g. Conducted localized MFA sweeps, flagged inactive sessions, and verified key audits pass securely."
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-805 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Mock Attachment Document (Optional)</label>
                    <div className="flex items-center justify-between border border-dashed border-zinc-250 rounded-xl p-3.5 bg-zinc-50/50 hover:bg-zinc-50 transition cursor-pointer relative">
                      <input
                        type="file"
                        onChange={handleMockUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-zinc-405" />
                        <span className="text-zinc-500 font-medium">
                          {uploadedFileName || "Choose compliance proof..."}
                        </span>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider text-indigo-600 font-mono font-bold">Select</span>
                    </div>
                    {uploadedFileName && (
                      <p className="text-[10px] text-emerald-600 mt-1.5 flex items-center gap-1 select-none">
                        <FileText className="h-3 w-3" />
                        <span>Ready upload metadata: {uploadedFileName}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-100 mt-5">
                    <button
                      type="button"
                      onClick={() => setViewingCompletionModal(null)}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white transition hover:bg-emerald-700"
                    >
                      File Complete Report
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* DEADLINE MONITOR TAB */}
      {activeTab === "deadlines" && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 animate-in fade-in duration-200 text-xs">
          <div className="border-b border-zinc-100 pb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            <div>
              <h3 className="text-sm font-bold text-zinc-950 font-sans">Deadline Calendar Monitor</h3>
              <p className="text-zinc-450 text-[11px] leading-relaxed">System dates are calibrated relative to audit epoch 2026-06-16.</p>
            </div>
          </div>

          <div className="space-y-2">
            {employeeTasks.map((t) => {
              const isOverdue = t.status !== "Completed" && new Date(t.dueDate) < new Date("2026-06-16");
              return (
                <div key={t.id} className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                  t.status === "Completed" ? "bg-emerald-50/15 border-emerald-150 text-emerald-800" :
                  isOverdue ? "bg-red-50/15 border-red-200 text-red-900 animate-pulse" :
                  "bg-zinc-50/50 border-zinc-150 text-zinc-800"
                }`}>
                  <div className="space-y-0.5">
                    <p className="font-mono text-[9px] uppercase tracking-wide text-zinc-400">Ref: {t.id} · Category: {t.taskCategory}</p>
                    <p className="font-bold text-zinc-950">{t.title}</p>
                    <p className="text-[10px] text-zinc-500">SLA Priority: {t.priority} Urgency</p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="block text-[8px] uppercase tracking-widest text-zinc-400 font-mono">Limit target</span>
                    <span className={`font-mono font-bold text-xs ${isOverdue ? "text-red-600 font-extrabold" : "text-zinc-850"}`}>
                      {t.dueDate} {isOverdue && "(OVERDUE)"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
