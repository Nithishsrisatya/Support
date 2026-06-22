import React, { useState } from "react";
import { User, Client, Ticket, Task, AuditLog, TicketPriority, TicketCategory, TaskCategory, TaskPriority } from "../types";
import { createId, formatDateTime, formatDate } from "../utils";
import { 
  Building2, UserPlus, Users, FileSignature, Target, ShieldAlert, BadgeInfo, Search, Filter, Plus,
  Sparkles, CheckCircle2, ClipboardCheck, ArrowUpDown, ChevronRight, FileSpreadsheet, Eye, Save, Trash2, Clock
} from "lucide-react";

interface AdminDashboardProps {
  systemUsers: User[];
  clients: Client[];
  tickets: Ticket[];
  tasks: Task[];
  auditLogs: AuditLog[];
  onAddClient: (newClient: Omit<Client, "id" | "createdDate" | "updatedDate">) => void;
  onUpdateClient: (id: string, updates: Partial<Client>) => void;
  onAddEmployee: (newUser: Omit<User, "id" | "createdDate" | "updatedDate" | "passwordHash">) => void;
  onUpdateEmployee: (id: string, updates: Partial<User>) => void;
  onAssignTicket: (ticketId: string, employeeId: string | null, priority?: TicketPriority) => void;
  onAssignTask: (newTask: Omit<Task, "id" | "createdDate" | "updatedDate" | "escalationStatus" | "assignedBy">) => void;
}

export default function AdminDashboard({
  systemUsers,
  clients,
  tickets,
  tasks,
  auditLogs,
  onAddClient,
  onUpdateClient,
  onAddEmployee,
  onUpdateEmployee,
  onAssignTicket,
  onAssignTask,
}: AdminDashboardProps) {
  // Tabs: 'clients' | 'employees' | 'tickets' | 'tasks' | 'dashboard'
  const [activeTab, setActiveTab] = useState<"dashboard" | "clients" | "employees" | "tickets" | "tasks">("dashboard");

  // Filter/Search states
  const [clientSearch, setClientSearch] = useState("");
  const [clientStatusFilter, setClientStatusFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");

  // Selection / Modal States for Create forms
  const [showClientModal, setShowClientModal] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [viewingHistoryClient, setViewingHistoryClient] = useState<Client | null>(null);

  // Form Fields
  const [newClientName, setNewClientName] = useState("");
  const [newClientContact, setNewClientContact] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientStatus, setNewClientStatus] = useState<Client["status"]>("Active");

  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpRole, setNewEmpRole] = useState<User["role"]>("Employee");
  const [newEmpDept, setNewEmpDept] = useState("Support & Operations");
  const [newEmpMgr, setNewEmpMgr] = useState("");
  const [newEmpStatus, setNewEmpStatus] = useState<User["status"]>("Active");

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState<TaskCategory>("Operational");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("Medium");

  // Form Submission Handlers
  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientContact || !newClientEmail) return;
    onAddClient({
      companyName: newClientName,
      contactPerson: newClientContact,
      email: newClientEmail,
      phoneNumber: newClientPhone || "+1 (555) 000-0000",
      status: newClientStatus,
    });
    // Reset Form
    setNewClientName("");
    setNewClientContact("");
    setNewClientEmail("");
    setNewClientPhone("");
    setNewClientStatus("Active");
    setShowClientModal(false);
  };

  const handleCreateEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpName || !newEmpEmail) return;
    onAddEmployee({
      fullName: newEmpName,
      email: newEmpEmail,
      role: newEmpRole,
      department: newEmpDept,
      managerId: newEmpMgr || null,
      status: newEmpStatus,
    });
    // Reset Form
    setNewEmpName("");
    setNewEmpEmail("");
    setNewEmpRole("Employee");
    setNewEmpDept("Support & Operations");
    setNewEmpMgr("");
    setNewEmpStatus("Active");
    setShowEmployeeModal(false);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle || !newTaskAssignedTo || !newTaskDueDate) return;
    onAssignTask({
      title: newTaskTitle,
      description: newTaskDesc,
      taskCategory: newTaskCategory,
      assignedTo: newTaskAssignedTo,
      dueDate: newTaskDueDate,
      priority: newTaskPriority,
      status: "Assigned",
    });
    // Reset Form
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskCategory("Operational");
    setNewTaskAssignedTo("");
    setNewTaskDueDate("");
    setNewTaskPriority("Medium");
    setShowTaskModal(false);
  };

  // Derived dashboard metrics
  const activeClientsCount = clients.filter((c) => c.status === "Active").length;
  const activeEmployeesCount = systemUsers.filter((u) => u.role === "Employee").length;
  const activeManagersCount = systemUsers.filter((u) => u.role === "Manager").length;
  const openTicketsCount = tickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length;
  const resolvedTicketsCount = tickets.filter((t) => t.status === "Resolved" || t.status === "Closed").length;
  const escalatedTasksCount = tasks.filter((tk) => tk.status === "Escalated" || tk.escalationStatus === "Yes").length;
  const overdueTasksCount = tasks.filter((tk) => tk.status === "Overdue" || (tk.status !== "Completed" && new Date(tk.dueDate) < new Date("2026-06-16"))).length;

  // Filtered Client / Employee lists
  const filteredClients = clients.filter((c) => {
    const matchesSearch = 
      c.companyName.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(clientSearch.toLowerCase());
    const matchesStatus = clientStatusFilter === "all" || c.status === clientStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredEmployees = systemUsers.filter((u) => {
    const matchesSearch = 
      u.fullName.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      u.department.toLowerCase().includes(employeeSearch.toLowerCase());
    return matchesSearch;
  });

  // Export report payload simulation helper
  const handleExportCSV = (reportName: string, dataObjList: any[]) => {
    const headers = Object.keys(dataObjList[0] || {});
    const rows = dataObjList.map((obj) => headers.map((h) => JSON.stringify(obj[h])).join(","));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportName}_Compliance_Export_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Page Title & Operational Tabs */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 font-sans">
            Admin Operations Workspace
          </h2>
          <p className="text-sm text-zinc-500 lead-relaxed">
            Configure system directory details, provision client credentials, assign tickets, and generate SLA audits.
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1">
          {(["dashboard", "clients", "employees", "tickets", "tasks"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                activeTab === tab
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* DASHBOARD TAB CONTAINER */}
      {activeTab === "dashboard" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Quick Metrics KPI Bento Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 font-mono">Organization Clients</span>
                <span className="rounded-full bg-indigo-50 p-1.5 text-indigo-600"><Building2 className="h-4 w-4" /></span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950">{clients.length}</span>
                <span className="text-xs text-zinc-500 font-mono">({activeClientsCount} active)</span>
              </div>
              <div className="mt-2 text-[10px] text-zinc-400">Total registered company files</div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 font-mono">Assigned Operations Force</span>
                <span className="rounded-full bg-emerald-50 p-1.5 text-emerald-600"><Users className="h-4 w-4" /></span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950">{systemUsers.length}</span>
                <span className="text-xs text-zinc-500 font-mono">({activeEmployeesCount} staff)</span>
              </div>
              <div className="mt-2 text-[10px] text-zinc-400">Engineers, Admins & supervisors</div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 font-mono">Backlog Open Tickets</span>
                <span className="rounded-full bg-orange-50 p-1.5 text-orange-600"><BadgeInfo className="h-4 w-4" /></span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-950">{openTicketsCount}</span>
                <span className="text-xs text-emerald-600 font-mono">({resolvedTicketsCount} resolved)</span>
              </div>
              <div className="mt-2 text-[10px] text-zinc-400">SLA active pending cases</div>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-red-600 font-mono">Escalations Outstanding</span>
                <span className="rounded-full bg-red-100 p-1.5 text-red-600"><ShieldAlert className="h-4 w-4" /></span>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-red-800">{escalatedTasksCount}</span>
                <span className="text-xs text-orange-700 font-mono">({overdueTasksCount} overdue)</span>
              </div>
              <div className="mt-2 text-[10px] text-red-500">Requires supervisor override</div>
            </div>

          </div>

          {/* SLA Performance SVG Graphics Container */}
          <div className="grid gap-6 lg:grid-cols-3">
            
            {/* Custom SVG Data Visualization Card */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 font-sans">
                    Support Ticket SLA Distribution & Urgencies
                  </h3>
                  <p className="text-xs text-zinc-400">Visual mapping of support categorizations and active urgencies.</p>
                </div>
                
                <button
                  onClick={() => handleExportCSV("support_analysis", tickets)}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>SLA CSV</span>
                </button>
              </div>

              {/* Graphic Plot using Raw SVG blocks */}
              <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
                
                {/* SVG Radial Chart demonstrating ticket success */}
                <div className="relative flex flex-col items-center justify-center shrink-0">
                  <svg className="h-32 w-32" viewBox="0 0 36 36">
                    <path
                      className="text-zinc-100"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-indigo-600"
                      strokeDasharray={`${Math.round((resolvedTicketsCount / tickets.length) * 100)}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-bold text-zinc-900">
                      {Math.round((resolvedTicketsCount / tickets.length) * 100)}%
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-mono">RESOLVED</span>
                  </div>
                </div>

                {/* SVG Stacked Bar Charts representing Priorities */}
                <div className="w-full space-y-3">
                  {["Critical", "High", "Medium", "Low"].map((level) => {
                    const count = tickets.filter((t) => t.priority === level).length;
                    const pct = (count / tickets.length) * 100;
                    const barColor = 
                      level === "Critical" ? "bg-red-500" :
                      level === "High" ? "bg-orange-500" :
                      level === "Medium" ? "bg-indigo-500" : "bg-sky-500";
                    return (
                      <div key={level} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span className="text-zinc-600">{level} Urgency</span>
                          <span className="text-zinc-900 font-mono">
                            {count} ({Math.round(pct)}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-zinc-100">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>

            {/* Platform Quick Statistics Log Alerts */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900 border-b border-zinc-100 pb-3">
                SLA Compliance Guard
              </h3>
              <div className="mt-4 space-y-4">
                
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded bg-amber-50 p-1 text-amber-600">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-800">Target Resolution Durations</p>
                    <p className="text-[11px] text-zinc-500">Critical priority support tickets have strict 4-hour SLA limits before escalations trigger.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded bg-red-100 p-1 text-red-600">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-800">Automatic Overdue Engine</p>
                    <p className="text-[11px] text-zinc-500">Overdue tasks automatically mark supervisors with escalation logs in accordance with ISO audit protocols.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded bg-emerald-50 p-1 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-800">Direct Client Confirmation</p>
                    <p className="text-[11px] text-zinc-500">Tickets are securely persisted and verified with custom customer feedback metrics upon resolution.</p>
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Active Operational Audits Overview & Actions */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Immediate Administrative Tasks</h3>
                <p className="text-xs text-zinc-400">Outstanding actions required by administrative dispatchers.</p>
              </div>
              <button 
                onClick={() => handleExportCSV("tasks_report", tasks)}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Export Task Workbook
              </button>
            </div>
            
            <div className="mt-4 divide-y divide-zinc-100 text-xs">
              {tasks.slice(0, 4).map((task) => (
                <div key={task.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold font-mono uppercase ${
                      task.priority === "Critical" ? "bg-red-100 text-red-800" :
                      task.priority === "High" ? "bg-orange-100 text-orange-850" :
                      task.priority === "Medium" ? "bg-indigo-100 text-indigo-800" : "bg-zinc-100 text-zinc-800"
                    }`}>
                      {task.priority}
                    </span>
                    <div>
                      <p className="font-semibold text-zinc-900">{task.title}</p>
                      <p className="text-[10px] text-zinc-400">Category: {task.taskCategory} · Due: {formatDate(task.dueDate)}</p>
                    </div>
                  </div>
                  <span className={`rounded-xl px-2 py-0.5 text-[10px] font-bold font-mono ${
                    task.status === "Completed" ? "bg-emerald-50 text-emerald-700" :
                    task.status === "Escalated" ? "bg-red-100 text-red-800 animate-pulse" :
                    task.status === "Overdue" ? "bg-orange-100 text-orange-800" : "bg-sky-50 text-sky-800"
                  }`}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* CLIENT MANAGEMENT WORKSPACE TAB */}
      {activeTab === "clients" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Controls Bar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2 max-w-md">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search Client ID, Company name, Contact person..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-zinc-800 focus:outline-none"
              />
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Filter className="h-3.5 w-3.5" />
                <span>Status:</span>
              </div>
              <select
                value={clientStatusFilter}
                onChange={(e) => setClientStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Disabled">Disabled</option>
                <option value="Suspended">Suspended</option>
                <option value="Pending Activation">Pending Activation</option>
              </select>

              <button
                type="button"
                onClick={() => setShowClientModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4" />
                <span>Create Client</span>
              </button>
            </div>
          </div>

          {/* Client Tables */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider font-mono text-[10px]">
                  <tr>
                    <th className="px-6 py-3.5">Client ID</th>
                    <th className="px-6 py-3.5">Company Name</th>
                    <th className="px-6 py-3.5">Contact Representative</th>
                    <th className="px-6 py-3.5">Ported Email</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Registered On</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-zinc-700">
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-zinc-400">
                        No clients match the specified filters. Try adjusting search queries.
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client) => (
                      <tr key={client.id} className="hover:bg-zinc-50/70 transition">
                        <td className="px-6 py-4 font-mono font-bold text-zinc-950">{client.id}</td>
                        <td className="px-6 py-4 font-semibold text-zinc-950">{client.companyName}</td>
                        <td className="px-6 py-4">{client.contactPerson}</td>
                        <td className="px-6 py-4 font-mono text-zinc-500">{client.email}</td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            client.status === "Active" ? "bg-emerald-50 text-emerald-700" :
                            client.status === "Pending Activation" ? "bg-purple-50 text-purple-700" :
                            "bg-zinc-100 text-zinc-500"
                          }`}>
                            {client.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-500">{formatDate(client.createdDate)}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            
                            {/* Toggle Activation Actions */}
                            {client.status === "Active" ? (
                              <button
                                onClick={() => onUpdateClient(client.id, { status: "Disabled" })}
                                className="rounded px-2 py-1 text-[10px] font-semibold text-red-600 transition hover:bg-red-50"
                              >
                                Disable
                              </button>
                            ) : (
                              <button
                                onClick={() => onUpdateClient(client.id, { status: "Active" })}
                                className="rounded px-2 py-1 text-[10px] font-semibold text-emerald-600 transition hover:bg-emerald-50"
                              >
                                Activate
                              </button>
                            )}

                            <button
                              onClick={() => setViewingHistoryClient(client)}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-50 shadow-sm"
                            >
                              <Eye className="h-3 w-3" />
                              <span>History</span>
                            </button>

                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Collapsible Detail Sheet: Client History View */}
          {viewingHistoryClient && (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5 space-y-4 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900">
                      Operational Performance File: {viewingHistoryClient.companyName}
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      CLIENT ID: {viewingHistoryClient.id} · EMAIL: {viewingHistoryClient.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingHistoryClient(null)}
                  className="rounded bg-zinc-200/80 hover:bg-zinc-300 px-2 py-0.5 text-xs text-zinc-700 font-bold"
                >
                  Close History
                </button>
              </div>

              {/* Grid lists of client activity history */}
              <div className="grid gap-4 md:grid-cols-2">
                
                {/* Tickets submitted by this client */}
                <div className="bg-white rounded-xl p-4 border border-zinc-200">
                  <h4 className="text-xs font-semibold text-zinc-900 uppercase tracking-wide font-mono border-b border-zinc-100 pb-2 mb-3">
                    Historical Helpdesk Tickets
                  </h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {tickets.filter((t) => t.clientId === viewingHistoryClient.id).length === 0 ? (
                      <p className="text-center text-xs text-zinc-400 py-6">No historical support tickets filed.</p>
                    ) : (
                      tickets
                        .filter((t) => t.clientId === viewingHistoryClient.id)
                        .map((tk) => (
                          <div key={tk.id} className="p-2.5 rounded-lg border border-zinc-100 hover:border-zinc-200 text-xs">
                            <div className="flex items-center justify-between font-mono text-[10px]">
                              <span className="font-bold text-zinc-800">{tk.id}</span>
                              <span className="text-zinc-400">{formatDate(tk.createdDate)}</span>
                            </div>
                            <p className="mt-1 font-semibold text-zinc-900 truncate">{tk.subject}</p>
                            <div className="mt-2 flex items-center justify-between text-[10px]">
                              <span className={`rounded-xl px-1.5 py-0.2 text-[9px] font-semibold ${
                                tk.status === "Closed" ? "bg-zinc-100 text-zinc-600" : "bg-emerald-50 text-emerald-800"
                              }`}>
                                {tk.status}
                              </span>
                              {tk.satisfactionRating && (
                                <span className="font-bold text-zinc-800">★ {tk.satisfactionRating}/5</span>
                              )}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Audit Actions related to this Client */}
                <div className="bg-white rounded-xl p-4 border border-zinc-200">
                  <h4 className="text-xs font-semibold text-zinc-900 uppercase tracking-wide font-mono border-b border-zinc-100 pb-2 mb-3">
                    Compliance Audit Trail
                  </h4>
                  <div className="space-y-2.5 max-h-56 overflow-y-auto font-mono text-[10.5px]">
                    {auditLogs.filter((log) => log.entityType === "Client" && log.entityId === viewingHistoryClient.id).length === 0 ? (
                      <p className="text-center text-xs text-zinc-400 py-6 font-sans">No audit events recorded for this client profile.</p>
                    ) : (
                      auditLogs
                        .filter((log) => log.entityType === "Client" && log.entityId === viewingHistoryClient.id)
                        .map((log) => (
                          <div key={log.id} className="border-l border-zinc-300 pl-2.5 py-0.5">
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="font-bold uppercase">[{log.action}]</span>
                              <span className="text-zinc-450">{formatDateTime(log.timestamp)}</span>
                            </div>
                            <p className="mt-0.5 text-zinc-650 font-sans leading-relaxed">{log.description}</p>
                          </div>
                        ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* CREATE CLIENT MODAL SHEET */}
          {showClientModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
              <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
                <h3 className="text-base font-bold text-zinc-900 font-sans">
                  Provision New Client Profile
                </h3>
                <p className="text-xs text-zinc-400 mt-1 pb-3 border-b border-zinc-100 leading-normal">
                  Create a secure corporate portal account. Logins are generated synchronously.
                </p>

                <form onSubmit={handleCreateClient} className="mt-4 space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Company Name *</label>
                    <input
                      type="text"
                      required
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="e.g. InnoTech Ltd"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Contact Person Name *</label>
                    <input
                      type="text"
                      required
                      value={newClientContact}
                      onChange={(e) => setNewClientContact(e.target.value)}
                      placeholder="e.g. Johnathan Finch"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Representative Email *</label>
                    <input
                      type="email"
                      required
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="e.g. finch@innotech.com"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Phone Number</label>
                    <input
                      type="text"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      placeholder="e.g. +1 (555) 441-2299"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Active Status Setup</label>
                    <select
                      value={newClientStatus}
                      onChange={(e) => setNewClientStatus(e.target.value as Client["status"])}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 focus:outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="Pending Activation">Pending Activation</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-5">
                    <button
                      type="button"
                      onClick={() => setShowClientModal(false)}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650 transition hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-zinc-950 px-4 py-2 font-bold text-white transition hover:bg-zinc-800"
                    >
                      Provision Profile
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* EMPLOYEE MANAGEMENT WORKSPACE TAB */}
      {activeTab === "employees" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2 max-w-sm">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search staff, department, role..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-zinc-800 focus:outline-none"
              />
            </div>

            <button
              onClick={() => setShowEmployeeModal(true)}
              className="flex items-center gap-1 bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs py-1.5 px-4 rounded-xl shadow-sm transition"
            >
              <UserPlus className="h-4 w-4" />
              <span>Onboard Employee</span>
            </button>
          </div>

          {/* Directory Details Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredEmployees.map((user) => {
              const supervisedTeammatesCount = systemUsers.filter((u) => u.managerId === user.id).length;
              const openAssignedCount = tickets.filter((t) => t.assignedTo === user.id && t.status !== "Closed" && t.status !== "Resolved").length;
              const totalCompletedTasks = tasks.filter((tk) => tk.assignedTo === user.id && tk.status === "Completed").length;

              return (
                <div key={user.id} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm hover:shadow-md transition">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-900 font-sans">{user.fullName}</h4>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{user.email}</p>
                    </div>
                    
                    <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold font-mono tracking-wider uppercase ${
                      user.role === "Administrator" ? "bg-purple-50 text-purple-700" :
                      user.role === "Manager" ? "bg-sky-50 text-sky-700" : "bg-zinc-50 text-zinc-600"
                    }`}>
                      {user.role}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-zinc-50/70 rounded-lg p-3">
                    <div>
                      <span className="block text-[9px] text-zinc-400 uppercase tracking-wide">Department</span>
                      <span className="font-semibold text-zinc-800">{user.department}</span>
                    </div>
                    
                    <div>
                      <span className="block text-[9px] text-zinc-400 uppercase tracking-wide">Status</span>
                      <span className="font-semibold text-emerald-600">{user.status}</span>
                    </div>

                    <div className="mt-2.5 col-span-2 border-t border-zinc-150 pt-2 grid grid-cols-2 gap-2">
                      <div>
                        <span className="block text-[9px] text-zinc-400 uppercase tracking-wide">Open Tickets</span>
                        <span className="font-mono font-bold text-zinc-800">{openAssignedCount} cases</span>
                      </div>
                      <div>
                        <span className="block text-[9px] text-zinc-400 uppercase tracking-wide">Done Tasks</span>
                        <span className="font-mono font-bold text-zinc-800">{totalCompletedTasks} completed</span>
                      </div>
                    </div>
                  </div>

                  {user.role === "Employee" && (
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                      <span>Supervisor Link:</span>
                      <select
                        value={user.managerId || ""}
                        onChange={(e) => onUpdateEmployee(user.id, { managerId: e.target.value || null })}
                        className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-sans font-medium text-zinc-800 focus:outline-none"
                      >
                        <option value="">No Manager Assigned</option>
                        {systemUsers
                          .filter((u) => u.role === "Manager")
                          .map((mgr) => (
                            <option key={mgr.id} value={mgr.id}>
                              {mgr.fullName} (Manager)
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                    <button
                      onClick={() => onUpdateEmployee(user.id, { status: user.status === "Active" ? "Disabled" : "Active" })}
                      className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-900"
                    >
                      {user.status === "Active" ? "Deactivate Account" : "Activate Account"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CREATE EMPLOYEE MODAL SHEET */}
          {showEmployeeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                <h3 className="text-base font-bold text-zinc-900 font-sans">
                  Onboard Operations Personnel
                </h3>
                <p className="text-xs text-zinc-400 mt-1 pb-3 border-b border-zinc-100 leading-normal">
                  Register internal credentials for team engineers, operators, or supervisors.
                </p>

                <form onSubmit={handleCreateEmployee} className="mt-4 space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      placeholder="e.g. Marcus Aurelius"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={newEmpEmail}
                      onChange={(e) => setNewEmpEmail(e.target.value)}
                      placeholder="marcus@workflow.com"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Access Authorization Level (Role)</label>
                    <select
                      value={newEmpRole}
                      onChange={(e) => setNewEmpRole(e.target.value as User["role"])}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 focus:outline-none"
                    >
                      <option value="Employee">Employee (Operational staff)</option>
                      <option value="Manager">Manager (Supervisory controls)</option>
                      <option value="Administrator">Administrator (Terminal keys)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Department Scope</label>
                    <input
                      type="text"
                      value={newEmpDept}
                      onChange={(e) => setNewEmpDept(e.target.value)}
                      placeholder="Support & Operations"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </div>

                  {newEmpRole === "Employee" && (
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Supervisor Linkage</label>
                      <select
                        value={newEmpMgr}
                        onChange={(e) => setNewEmpMgr(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2"
                      >
                        <option value="">No Supervisor Assigned</option>
                        {systemUsers
                          .filter((u) => u.role === "Manager")
                          .map((mgr) => (
                            <option key={mgr.id} value={mgr.id}>
                              {mgr.fullName} (Manager)
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-5">
                    <button
                      type="button"
                      onClick={() => setShowEmployeeModal(false)}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-zinc-950 px-4 py-2 font-bold text-white transition hover:bg-zinc-800"
                    >
                      Complete Onboarding
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

      {/* INTERACTIVE TICKET ASSIGNOR DISPATCHER TAB */}
      {activeTab === "tickets" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 font-sans">Active Support Ticket Dispatcher</h3>
              <p className="text-xs text-zinc-400">Classify urgent helpdesk requests and assign to engineers immediately.</p>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 font-medium">Lifecycle Filter:</span>
              <select
                value={ticketStatusFilter}
                onChange={(e) => setTicketStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Lifecycles</option>
                <option value="New">New (Unassigned)</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending Information</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed Files</option>
              </select>
            </div>
          </div>

          {/* Ticket Listing Grid and Dispatcher widget */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-xs">
            {tickets.filter((t) => ticketStatusFilter === "all" || t.status === ticketStatusFilter).length === 0 ? (
              <p className="py-12 text-center text-zinc-400 text-xs">No support cases are currently listed in this category view.</p>
            ) : (
              <div className="divide-y divide-zinc-200">
                {tickets
                  .filter((t) => ticketStatusFilter === "all" || t.status === ticketStatusFilter)
                  .map((ticket) => {
                    const clientComp = clients.find((c) => c.id === ticket.clientId);
                    return (
                      <div key={ticket.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-55/40 transition">
                        <div className="space-y-1 sm:max-w-xl">
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                            <span className="font-bold text-zinc-900">{ticket.id}</span>
                            <span className="text-zinc-300">·</span>
                            <span className="font-medium text-indigo-600">{clientComp?.companyName}</span>
                            <span className="text-zinc-300">·</span>
                            <span className="text-zinc-400">{formatDateTime(ticket.createdDate)}</span>
                          </div>
                          
                          <h4 className="text-xs font-bold text-zinc-900">{ticket.subject}</h4>
                          <p className="text-[11px] text-zinc-500 leading-relaxed text-zinc-600 line-clamp-2">
                            {ticket.description}
                          </p>

                          <div className="pt-1.5 flex flex-wrap gap-1.5 text-[9px] font-bold font-mono uppercase">
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-800">
                              {ticket.category}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 ${
                              ticket.priority === "Critical" ? "bg-red-100 text-red-800" :
                              ticket.priority === "High" ? "bg-orange-100 text-orange-850" :
                              ticket.priority === "Medium" ? "bg-indigo-150 text-indigo-850" : "bg-zinc-100 text-zinc-800"
                            }`}>
                              {ticket.priority} Urgency
                            </span>
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">
                              Status: {ticket.status}
                            </span>
                          </div>
                        </div>

                        {/* Dispatch Drawer Control right inside layout */}
                        <div className="shrink-0 space-y-2 rounded-xl bg-zinc-50 p-3.5 border border-zinc-150">
                          <span className="block text-[8.5px] uppercase tracking-wider text-zinc-400 font-mono font-semibold">
                            Dispatch Assignee
                          </span>
                          
                          <div className="flex items-center gap-2">
                            <select
                              value={ticket.assignedTo || ""}
                              onChange={(e) => onAssignTicket(ticket.id, e.target.value || null, ticket.priority)}
                              className="rounded border border-zinc-250 bg-white px-2 py-1 text-xs font-medium text-zinc-850 focus:outline-none"
                            >
                              <option value="">Unassigned (Queue)</option>
                              {systemUsers
                                .filter((u) => u.role === "Employee")
                                .map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.fullName} ({emp.department})
                                  </option>
                                ))}
                            </select>

                            <select
                              value={ticket.priority}
                              onChange={(e) => onAssignTicket(ticket.id, ticket.assignedTo, e.target.value as TicketPriority)}
                              className="rounded border border-zinc-250 bg-white px-1.5 py-1 text-xs font-mono font-bold text-zinc-850 focus:outline-none"
                            >
                              <option value="Low">Low</option>
                              <option value="Medium">Medium</option>
                              <option value="High">High</option>
                              <option value="Critical">Critical</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* TASK MANAGEMENT WORKPLACE TAB */}
      {activeTab === "tasks" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 font-sans">Organizational Task Assignments</h3>
              <p className="text-xs text-zinc-400">Only Administrator is authorized to assign workflows in accordance with regulatory SLA models.</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={taskStatusFilter}
                onChange={(e) => setTaskStatusFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Schedulings</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed WORK</option>
                <option value="Overdue">Overdue Alerts</option>
                <option value="Escalated">Escalated Logs</option>
              </select>

              <button
                onClick={() => setShowTaskModal(true)}
                className="flex items-center gap-1.5 bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-xs py-1.5 px-3.5 rounded-xl transition"
              >
                <Plus className="h-4 w-4" />
                <span>Assign Task</span>
              </button>
            </div>
          </div>

          {/* Task Grid layout */}
          <div className="grid gap-4 md:grid-cols-2">
            {tasks
              .filter((tk) => taskStatusFilter === "all" || tk.status === taskStatusFilter)
              .map((task) => {
                const assigneeUser = systemUsers.find((u) => u.id === task.assignedTo);
                
                // Determine overdue calculation dynamically relative to mock environment time "2026-06-16"
                const isTaskOverdue = task.status !== "Completed" && new Date(task.dueDate) < new Date("2026-06-16");

                return (
                  <div key={task.id} className={`rounded-2xl bg-white border p-5 shadow-sm space-y-4 hover:shadow-md transition ${
                    isTaskOverdue ? "border-red-200 bg-red-50/10" : "border-zinc-200"
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-mono text-[9px]">
                          <span className="font-bold text-zinc-900">{task.id}</span>
                          <span className="text-zinc-300">·</span>
                          <span className="rounded bg-zinc-100 px-1 py-0.2 uppercase font-semibold text-zinc-650">
                            {task.taskCategory}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-zinc-900 leading-snug">{task.title}</h4>
                      </div>

                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold font-mono tracking-wider ${
                        task.status === "Completed" ? "bg-emerald-50 text-emerald-800" :
                        task.status === "Escalated" || isTaskOverdue ? "bg-red-100 text-red-800 animate-pulse" :
                        "bg-zinc-100 text-zinc-700"
                      }`}>
                        {task.status} {isTaskOverdue && "(OVERDUE)"}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-600 leading-normal">{task.description}</p>

                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-50 p-3 text-[10.5px]">
                      <div>
                        <span className="block text-[8.5px] uppercase text-zinc-400 font-mono">Representative Assigned</span>
                        <span className="font-semibold text-zinc-800">{assigneeUser?.fullName || "Unassigned"}</span>
                      </div>
                      <div>
                        <span className="block text-[8.5px] uppercase text-zinc-400 font-mono">Limit Date (Due Date)</span>
                        <span className={`font-semibold font-mono ${isTaskOverdue ? "text-red-600 font-bold" : "text-zinc-800"}`}>
                          {formatDate(task.dueDate)}
                        </span>
                      </div>
                    </div>

                    {task.status === "Completed" && task.completionNotes && (
                      <div className="border-t border-zinc-150 pt-2.5">
                        <span className="block text-[8px] uppercase text-zinc-400 font-mono font-bold">Employee Verification Notes</span>
                        <p className="text-[10px] text-zinc-600 italic leading-normal mt-0.5">
                          "{task.completionNotes}"
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* CREATE TASK MODAL SHEET */}
          {showTaskModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                <h3 className="text-base font-bold text-zinc-900 font-sans">
                  Assign Administrative Task
                </h3>
                <p className="text-xs text-zinc-400 mt-1 pb-3 border-b border-zinc-100">
                  Only Administrators possess operational authority to initiate task actions.
                </p>

                <form onSubmit={handleCreateTask} className="mt-4 space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Task Title *</label>
                    <input
                      type="text"
                      required
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="e.g. Audit Annual Compliance Report"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-805"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Detail Instructions</label>
                    <textarea
                      value={newTaskDesc}
                      onChange={(e) => setNewTaskDesc(e.target.value)}
                      rows={2}
                      placeholder="Provide precise execution boundaries..."
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-805"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Category</label>
                      <select
                        value={newTaskCategory}
                        onChange={(e) => setNewTaskCategory(e.target.value as TaskCategory)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2"
                      >
                        <option value="Operational">Operational</option>
                        <option value="Support">Support</option>
                        <option value="Administrative">Administrative</option>
                        <option value="Documentation">Documentation</option>
                        <option value="Compliance">Compliance</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Priority</label>
                      <select
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 font-semibold"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Assign Employee Representative *</label>
                    <select
                      required
                      value={newTaskAssignedTo}
                      onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2"
                    >
                      <option value="">Select Employee...</option>
                      {systemUsers
                        .filter((u) => u.role === "Employee")
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName} ({emp.department})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Limit Date (Due Date) *</label>
                    <input
                      type="date"
                      required
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-5">
                    <button
                      type="button"
                      onClick={() => setShowTaskModal(false)}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-zinc-950 px-4 py-2 font-bold text-white transition hover:bg-zinc-800"
                    >
                      Dispatch Task
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
