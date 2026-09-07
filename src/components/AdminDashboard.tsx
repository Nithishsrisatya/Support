import React, { useState, useEffect, useMemo } from "react";
import { User, Client, Ticket, Task, AuditLog, TicketPriority, TicketCategory, TaskCategory, TaskPriority, TaskStatus, TicketStatus, ReviewStatus, UserRole, UserStatus as SystemUserStatus, ClientStatus } from "../types";
import { createId, formatDateTime, formatDate, getDaysRemainingBadge } from "../utils";
import CreateClientModal from "./CreateClientModal";
import EditClientModal from "./EditClientModal";
import { apiFetch } from "../services/api";
import { 
  Building2, UserPlus, Users, FileSignature, Target, ShieldAlert, BadgeInfo, Search, Filter, Plus,
  Sparkles, CheckCircle2, ClipboardCheck, ArrowUpDown, ChevronRight, FileSpreadsheet, Eye, Save, Trash2, Clock, Activity, HelpCircle, CheckSquare, LifeBuoy
} from "lucide-react";
import EmployeeProfileModal from "./EmployeeProfileModal";
import TicketDetailModal from "./TicketDetailModal";
import TaskDetailModal from "./TaskDetailModal";
import TicketDashboard from "./TicketDashboard";
import ReportsPanel from "./ReportsPanel";
import AuditLogPanel from "./AuditLogPanel";
import HomeDashboard from "./HomeDashboard";
import DeadlineCalendar from "./DeadlineCalendar";
import Pagination from "./Pagination";
import EmptyState from "./EmptyState";


interface AdminDashboardProps {
  systemUsers: User[];
  clients: Client[];
  tickets: Ticket[];
  tasks: Task[];
  auditLogs: AuditLog[];
  onAddClient: (
  client: Omit<
    Client,
    "id" | "createdDate" | "updatedDate"
  >
) => void;
  onUpdateClient: (id: string, updates: Partial<Client>) => Promise<any> | void;
  onDeleteClient: (id: string) => void;
  onAddEmployee: (newUser: Omit<User, "id" | "createdDate" | "updatedDate" | "passwordHash">) => void;
  onUpdateEmployee: (id: string, updates: Partial<User>) => void;
  onDeleteEmployee: (id: string) => void;
  onAssignTicket: (ticketId: string, employeeId: string | null, priority?: TicketPriority) => void;
  onAssignTask: (newTask: Omit<Task, "id" | "createdDate" | "updatedDate" | "escalationStatus" | "assignedBy">) => void;
  
  onDeleteTicket: (ticketId: string) => void;
  onUpdateTicketStatus?: (
    ticketId: string,
    status: TicketStatus,
    notes?: string,
    resolution?: string
  ) => void;
  onUpdateTaskStatus: (
  taskId: string,
  status: TaskStatus,
  notes?: string
) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTaskProgress: (taskId: string, progressPercentage: number, comment: string) => void;
  onReviewTask: (taskId: string, reviewStatus: ReviewStatus, managerNotes: string) => void;
  onBulkActionTickets: (action: 'assign' | 'updateStatus' | 'delete', ids: string[], payload?: any) => void;
  onBulkActionTasks: (action: 'delete', ids: string[], payload?: any) => void;
  onReopenTicket?: (ticketId: string) => void;
  onReopenTask?: (taskId: string) => void;
}

export default function AdminDashboard({
  systemUsers,
  clients,
  tickets,
  tasks,
  auditLogs,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onAssignTicket,
  onDeleteTicket,
  onAssignTask,
  onDeleteTask,
  onUpdateTaskStatus,
  onUpdateTicketStatus,
  onUpdateTaskProgress,
  onReviewTask,
  onBulkActionTickets,
  onBulkActionTasks,
  onReopenTicket,
  onReopenTask,
}: AdminDashboardProps) {
  // Tabs: 'clients' | 'employees' | 'tickets' | 'tasks' | 'dashboard'
const [activeTab, setActiveTab] = useState<
  "dashboard" | "clients" | "employees" | "tickets" | "tasks" | "calendar" | "reports" | "audit"
>(() => {
  return (
    (localStorage.getItem("activeTab") as
      | "dashboard"
      | "clients"
      | "employees"
      | "tickets"
      | "tasks"
      | "calendar"
      | "reports"
      | "audit") || "dashboard"
  );
});

// Filter/Search states
  const [clientSearch, setClientSearch] = useState("");
  const [clientStatusFilter, setClientStatusFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");

  // --- Phase 10: Pagination state ---
  const [clientPage, setClientPage] = useState(1);
  const [clientPageSize, setClientPageSize] = useState(10);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketPageSize, setTicketPageSize] = useState(10);
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);

  // Reset to first page whenever filters/search change
  useEffect(() => {
    setClientPage(1);
  }, [clientSearch, clientStatusFilter]);
  useEffect(() => {
    setTicketPage(1);
  }, [ticketStatusFilter]);
  useEffect(() => {
    setTaskPage(1);
  }, [taskStatusFilter]);

  // --- Phase 5: Dashboard Metrics ---
  const totalEmployees = systemUsers.length;
  const totalClients = clients.length;
  const openTickets = tickets.filter((t) => ["New", "Assigned", "In Progress", "Pending"].includes(t.status)).length;
  const pendingTasks = tasks.filter((t) => t.status !== "Completed" && ["Pending", "Assigned", "In Progress", "Overdue", "Escalated"].includes(t.status)).length;

  // Selection / Modal States for Create forms
  const [showClientModal, setShowClientModal] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<Task | null>(null);
  const [viewingHistoryClient, setViewingHistoryClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);


  const [employeeToResetPassword, setEmployeeToResetPassword] = useState<User | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  const [editEmpForm, setEditEmpForm] = useState({
    fullName: "",
    email: "",
    role: "Employee" as UserRole,
    department: "",
    managerId: null as string | null,
    status: "Active" as SystemUserStatus,
  });

  useEffect(() => {
    if (editingEmployee) {
      setEditEmpForm({
        fullName: editingEmployee.fullName,
        email: editingEmployee.email,
        role: editingEmployee.role,
        department: editingEmployee.department,
        managerId: editingEmployee.managerId,
        status: editingEmployee.status,
      });
    }
  }, [editingEmployee]);

  // Sync selectedEmployee with the main list to prevent stale data in the modal
  useEffect(() => {
    if (selectedEmployee) {
      const updatedEmployee = systemUsers.find(u => u.id === selectedEmployee.id);
      if (updatedEmployee && JSON.stringify(updatedEmployee) !== JSON.stringify(selectedEmployee)) {
        setSelectedEmployee(updatedEmployee);
      }
    }
  }, [systemUsers, selectedEmployee]);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // --- Phase 9: Bulk Actions State ---
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkAction, setBulkAction] = useState<"assign" | "close" | "delete" | "export" | "">("");

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
  const [newTaskStartDate, setNewTaskStartDate] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("Medium");

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
      startDate: newTaskStartDate || undefined,
      dueDate: newTaskDueDate,
      priority: newTaskPriority,
      status: "Assigned",
    });
    // Reset Form
    setNewTaskTitle("");
    setNewTaskDesc("");
    setNewTaskCategory("Operational");
    setNewTaskAssignedTo("");
    setNewTaskStartDate("");
    setNewTaskDueDate("");
    setNewTaskPriority("Medium");
    setShowTaskModal(false);
  };

  const handleConfirmResetPassword = async () => {
    if (!employeeToResetPassword) return;

    setIsResettingPassword(true);
    setResetPasswordError(null);

    try {
      const result = await apiFetch(`/auth/admin-reset-password/${employeeToResetPassword.id}`, {
        method: 'POST',
      });
      
      alert(result.message || 'Password reset successfully. A temporary password has been sent to the employee\'s email.');
      
      setEmployeeToResetPassword(null);
    } catch (error) {
      setResetPasswordError(error instanceof Error ? error.message : 'An unknown error occurred while resetting the password.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleEditFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditEmpForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    if (!editEmpForm.fullName.trim() || !editEmpForm.email.trim()) {
      alert("Full Name and Email are required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(editEmpForm.email)) {
      alert("Please enter a valid email address.");
      return;
    }

    const updates: Partial<User> = {
      fullName: editEmpForm.fullName,
      email: editEmpForm.email,
      role: editEmpForm.role,
      department: editEmpForm.department,
      managerId: editEmpForm.managerId || null,
      status: editEmpForm.status,
    };

    onUpdateEmployee(editingEmployee.id, updates);
    setEditingEmployee(null);
  };

  const selectedEmployeeCounts = useMemo(() => {
    if (!selectedEmployee) return null;

    const employeeTickets = tickets.filter((t) => t.assignedTo === selectedEmployee.id);
    const employeeTasks = tasks.filter((tk) => tk.assignedTo === selectedEmployee.id);

    const openTicketsCount = employeeTickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length;
    const completedTasksCount = employeeTasks.filter((tk) => tk.status === "Completed").length;
    const assignedTasksCount = employeeTasks.filter((tk) => tk.status !== "Completed").length;

    // Placeholder for projects; dataset not present in current model
    const activeProjectsCount = 0;

    return {
      openTicketsCount,
      completedTasksCount,
      assignedTasksCount,
      activeProjectsCount,
    };
  }, [selectedEmployee, tickets, tasks]);

  // Derived dashboard metrics
  const activeClientsCount = clients.filter((c) => c.status === "Active").length;
  
  // NOTE: The overview tab UI below uses the Phase 5 metrics:
  // totalEmployees, totalClients, openTickets, pendingTasks, and recentActivity.

  const activeEmployeesCount = systemUsers.filter((u) => u.role === "Employee").length;
  const activeManagersCount = systemUsers.filter((u) => u.role === "Manager").length;
  const openTicketsCount = tickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length;
  const resolvedTicketsCount = tickets.filter((t) => t.status === "Resolved" || t.status === "Closed").length;
  const escalatedTasksCount = tasks.filter((tk) => tk.status === "Escalated" || tk.escalationStatus === "Yes").length;
  const overdueTasksCount = tasks.filter((tk) => tk.isOverdue).length;

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

  // --- Phase 10: Paginated slices ---
  const filteredTickets = tickets.filter((t) => ticketStatusFilter === "all" || t.status === ticketStatusFilter);
  const filteredTasks = tasks.filter((tk) => taskStatusFilter === "all" || tk.status === taskStatusFilter);

  const paginatedClients = filteredClients.slice(
    (clientPage - 1) * clientPageSize,
    clientPage * clientPageSize
  );
  const paginatedTickets = filteredTickets.slice(
    (ticketPage - 1) * ticketPageSize,
    ticketPage * ticketPageSize
  );
  const paginatedTasks = filteredTasks.slice(
    (taskPage - 1) * taskPageSize,
    taskPage * taskPageSize
  );

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

  // ─── Phase 9: Bulk Actions ─────────────────────────────────────────────
  const toggleTicketSelection = (id: string) => {
    setSelectedTicketIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllTickets = (ids: string[]) => {
    setSelectedTicketIds((prev) =>
      prev.length === ids.length ? [] : ids
    );
  };

  const toggleTaskSelection = (id: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllTasks = (ids: string[]) => {
    setSelectedTaskIds((prev) =>
      prev.length === ids.length ? [] : ids
    );
  };

  const handleBulkTicketAction = (action: "assign" | "close" | "delete" | "export") => {
    if (selectedTicketIds.length === 0) return;

    if (action === "assign") {
      if (!bulkAssignee) return; // Handled by App.tsx now
      const terminalSelected = tickets.filter(
        (t) => selectedTicketIds.includes(t.id) && (t.status === "Resolved" || t.status === "Closed")
      );
      if (terminalSelected.length > 0) {
        alert("Closed or resolved tickets cannot be assigned. Please deselect terminal tickets or reopen them first.");
        return;
      }
      onBulkActionTickets('assign', selectedTicketIds, { assigneeId: bulkAssignee });
      setSelectedTicketIds([]);
      setBulkAssignee("");
    } else if (action === "close") {
      onBulkActionTickets('updateStatus', selectedTicketIds, { status: 'Closed' });
      setSelectedTicketIds([]);
    } else if (action === "delete") {
      onBulkActionTickets('delete', selectedTicketIds);
      setSelectedTicketIds([]);
    } else if (action === "export") {
      const selected = tickets.filter((t) => selectedTicketIds.includes(t.id));
      handleExportCSV("Selected_Tickets", selected);
      setSelectedTicketIds([]);
    }
    setSelectedTicketIds([]); // Clear selection after action
  };

  const handleBulkTaskAction = (action: "delete" | "export") => {
    if (selectedTaskIds.length === 0) return;

    if (action === "delete") {
      onBulkActionTasks('delete', selectedTaskIds);
      setSelectedTaskIds([]);
    } else if (action === "export") {
      const selected = tasks.filter((t) => selectedTaskIds.includes(t.id));
      handleExportCSV("Selected_Tasks", selected);
      setSelectedTaskIds([]);
    }
    setSelectedTaskIds([]); // Clear selection after action
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
          {(["dashboard", "clients", "employees", "tickets", "tasks", "calendar", "reports", "audit"] as const).map((tab) => (
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

      {/* DASHBOARD TAB CONTAINER - Redesigned Home Dashboard */}
      {activeTab === "dashboard" && (
        <HomeDashboard
          clients={clients}
          users={systemUsers}
          tickets={tickets}
          tasks={tasks}
          onNavigate={(section) => {
            // Map section names to tab names
            if (section === "employees") setActiveTab("employees");
            else if (section === "clients") setActiveTab("clients");
            else if (section === "tickets") setActiveTab("tickets");
            else if (section === "tasks") setActiveTab("tasks");
            else if (section === "calendar") setActiveTab("calendar");
          }}
        />
      )}

      {/* DEADLINE CALENDAR TAB */}
      {activeTab === "calendar" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <DeadlineCalendar
            currentUserRole="Administrator"
            currentUserId="U-1"
            currentUserName="Administrator"
          />
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
                        <EmptyState
                          title="No clients found"
                          message="No clients match the specified filters. Try adjusting search queries."
                        />
                      </td>
                    </tr>
) : (
                    paginatedClients.map((client) => (
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
                            {/* Edit Client Button */}
                            <button
                              onClick={() => setEditingClient(client)}
                              className="rounded px-2 py-1 text-[10px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
                            >
                              Edit
                            </button>
                            
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
                              onClick={() => {
                                if (window.confirm(`Delete ${client.companyName}?`)) {
                                  onDeleteClient(client.id);
                                }
                              }}
                              className="rounded px-2 py-1 text-[10px] font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              Delete
                            </button>
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

          {/* Client Pagination */}
          {filteredClients.length > 0 && (
            <Pagination
              page={clientPage}
              pageSize={clientPageSize}
              totalItems={filteredClients.length}
              onPageChange={setClientPage}
              onPageSizeChange={(size) => {
                setClientPageSize(size);
                setClientPage(1);
              }}
            />
          )}

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

          {/* Edit Client Modal */}
          <EditClientModal
            client={editingClient}
            isOpen={!!editingClient}
            onClose={() => setEditingClient(null)}
            onUpdateClient={onUpdateClient}
          />

          {/* Create Client Modal */}
          <CreateClientModal
            isOpen={showClientModal}
            onClose={() => setShowClientModal(false)}
            onAddClient={onAddClient}
          />

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
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmployee(user);
                      setIsEmployeeModalOpen(true);
                    }}
                    className="flex w-full items-start justify-between text-left"
                  >
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-900 font-sans">{user.fullName}</h4>
                      <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{user.email}</p>
                    </div>

                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold font-mono tracking-wider uppercase ${
                        user.role === "Administrator"
                          ? "bg-purple-50 text-purple-700"
                          : user.role === "Manager"
                            ? "bg-sky-50 text-sky-700"
                            : "bg-zinc-50 text-zinc-600"
                      }`}
                    >
                      {user.role}
                    </span>
                  </button>

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
                    {user.role !== "Administrator" && user.role !== "Manager" && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete ${user.fullName}?`)) {
                            onDeleteEmployee(user.id);
                          }
                        }}
                        className="text-[10px] font-semibold text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    )}

                    <button
                      onClick={() =>
                        onUpdateEmployee(user.id, {
                          status: user.status === "Active" ? "Disabled" : "Active",
                        })
                      }
                      className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-900"
                    >
                      {user.status === "Active" ? "Deactivate Account" : "Activate Account"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Employee Profile Modal (Details + Lifecycle Actions) */}
          {selectedEmployee && (
            <EmployeeProfileModal
              employee={selectedEmployee}
              managerName={
                selectedEmployee.managerId
                  ? systemUsers.find((u) => u.id === selectedEmployee.managerId)?.fullName
                  : undefined
              }
              counts={
                selectedEmployeeCounts ?? {
                  openTicketsCount: 0,
                  completedTasksCount: 0,
                  assignedTasksCount: 0,
                  activeProjectsCount: 0,
                }
              }
              isOpen={isEmployeeModalOpen}
              onClose={() => {
                setIsEmployeeModalOpen(false);
                setSelectedEmployee(null);
              }}
              onEdit={(employeeId) => {
                const employeeToEdit = systemUsers.find((u) => u.id === employeeId);
                if (employeeToEdit) {
                  setEditingEmployee(employeeToEdit);
                  setIsEmployeeModalOpen(false);
                }
              }}
              onResetPassword={(employeeId) => {
                // Parent currently only exposes onUpdateEmployee/onDeleteEmployee.
                // Keep modal buildable by mapping reset intent to a no-op status update.
                onUpdateEmployee(employeeId, { status: selectedEmployee.status });
                const employeeToReset = systemUsers.find((u) => u.id === employeeId);
                if (employeeToReset) {
                  setEmployeeToResetPassword(employeeToReset);
                }
              }}
              onActivate={(employeeId) => onUpdateEmployee(employeeId, { status: "Active" })}
              onDeactivate={(employeeId) => onUpdateEmployee(employeeId, { status: "Disabled" })}
              onDelete={(employeeId) => onDeleteEmployee(employeeId)}
            />
          )}

          {/* CREATE EMPLOYEE MODAL SHEET */}
          {showEmployeeModal && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 pt-16">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl mb-8">
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

          {/* EDIT EMPLOYEE MODAL SHEET */}
          {editingEmployee && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 pt-16">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl mb-8">
                <h3 className="text-base font-bold text-zinc-900 font-sans">
                  Edit Employee Profile
                </h3>
                <p className="text-xs text-zinc-400 mt-1 pb-3 border-b border-zinc-100 leading-normal">
                  Update the details for {editingEmployee.fullName}.
                </p>

                <form onSubmit={handleUpdateEmployeeSubmit} className="mt-4 space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      name="fullName"
                      required
                      value={editEmpForm.fullName}
                      onChange={handleEditFormChange}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Email Address *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={editEmpForm.email}
                      onChange={handleEditFormChange}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Role</label>
                    <select
                      name="role"
                      value={editEmpForm.role}
                      onChange={handleEditFormChange}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 focus:outline-none"
                    >
                      <option value="Employee">Employee</option>
                      <option value="Manager">Manager</option>
                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Department</label>
                    <input
                      type="text"
                      name="department"
                      value={editEmpForm.department}
                      onChange={handleEditFormChange}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Manager</label>
                    <select
                      name="managerId"
                      value={editEmpForm.managerId || ""}
                      onChange={handleEditFormChange}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2"
                    >
                      <option value="">No Manager Assigned</option>
                      {systemUsers
                        .filter((u) => u.role === "Manager" && u.id !== editingEmployee.id)
                        .map((mgr) => (
                          <option key={mgr.id} value={mgr.id}>
                            {mgr.fullName}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={editEmpForm.status}
                      onChange={handleEditFormChange}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 focus:outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Disabled">Disabled</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-5">
                    <button type="button" onClick={() => setEditingEmployee(null)} className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-lg bg-zinc-950 px-4 py-2 font-bold text-white transition hover:bg-zinc-800">
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ADMIN RESET PASSWORD CONFIRMATION MODAL */}
          {employeeToResetPassword && (
            <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-zinc-900">Reset Password Confirmation</h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Are you sure you want to reset the password for{' '}
                  <strong className="font-semibold text-zinc-900">{employeeToResetPassword.fullName}</strong>
                  {' ('}<span className="font-mono text-xs">{employeeToResetPassword.email}</span>{')'}?
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  This will generate a new temporary password and send it to the employee's email address. They will be required to change it on their next login.
                </p>

                {resetPasswordError && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                    <p className="font-bold">Error</p>
                    <p>{resetPasswordError}</p>
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEmployeeToResetPassword(null);
                      setResetPasswordError(null);
                    }}
                    disabled={isResettingPassword}
                    className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmResetPassword}
                    disabled={isResettingPassword}
                    className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResettingPassword ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
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

{/* Bulk Actions Toolbar */}
          {selectedTicketIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <span className="text-xs font-bold text-indigo-700">
                {selectedTicketIds.length} ticket(s) selected
              </span>
              <select
                value={bulkAssignee}
                onChange={(e) => setBulkAssignee(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold focus:outline-none"
              >
                <option value="">Assign to employee...</option>
                {systemUsers
                  .filter((u) => u.role === "Employee")
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => handleBulkTicketAction("assign")}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Assign
              </button>
              <button
                onClick={() => handleBulkTicketAction("close")}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                Close
              </button>
              <button
                onClick={() => handleBulkTicketAction("export")}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700"
              >
                Export
              </button>
              <button
                onClick={() => handleBulkTicketAction("delete")}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={() => setSelectedTicketIds([])}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-500 hover:bg-zinc-100"
              >
                Clear
              </button>
            </div>
          )}

{/* Ticket Listing Grid and Dispatcher widget */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-xs">
            {filteredTickets.length === 0 ? (
              <p className="py-12 text-center text-zinc-400 text-xs">No support cases are currently listed in this category view.</p>
            ) : (
              <div className="divide-y divide-zinc-200">
                {paginatedTickets.map((ticket) => {
                    const clientComp = clients.find((c) => c.id === ticket.clientId);
                    return (
                      <div key={ticket.id} className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between transition ${
                        selectedTicketIds.includes(ticket.id) ? "bg-indigo-50/50" : "hover:bg-zinc-55/40"
                      }`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedTicketIds.includes(ticket.id)}
                            onChange={() => toggleTicketSelection(ticket.id)}
                            className="mt-1 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                          />
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
{ticket.dueDate && (() => {
                              const badge = getDaysRemainingBadge(ticket.dueDate, ticket.status);
                              return <span className={`rounded px-1.5 py-0.5 ${badge.color}`}>{badge.text}</span>;
                            })()}
                          </div>
                          </div>
                        </div>

                        {/* Dispatch Drawer Control right inside layout */}
                        <div className="shrink-0 space-y-2 rounded-xl bg-zinc-50 p-3.5 border border-zinc-150">
                          <span className="block text-[8.5px] uppercase tracking-wider text-zinc-400 font-mono font-semibold">
                            {ticket.status === "Resolved" || ticket.status === "Closed" ? "Terminal Status" : "Dispatch Assignee"}
                          </span>
                          
                          <div className="flex flex-col gap-2">
                            {ticket.status === "Resolved" || ticket.status === "Closed" ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center rounded-md bg-zinc-200/90 px-2.5 py-1 text-xs font-bold text-zinc-700">
                                  {ticket.status} (Non-Active)
                                </span>
                                {onReopenTicket && (
                                  <button
                                    onClick={() => onReopenTicket(ticket.id)}
                                    className="rounded bg-amber-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm"
                                  >
                                    Reopen
                                  </button>
                                )}
                              </div>
                            ) : (
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
                            )}

                            <div className="flex gap-2 mt-1">
                              <button
                                onClick={() => setSelectedTicket(ticket)}
                                className="flex-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                              >
                                View Details
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Delete ticket ${ticket.id}?`)) {
                                    onDeleteTicket(ticket.id);
                                  }
                                }}
                                className="flex-1 rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Ticket Pagination */}
          {filteredTickets.length > 0 && (
            <Pagination
              page={ticketPage}
              pageSize={ticketPageSize}
              totalItems={filteredTickets.length}
              onPageChange={setTicketPage}
              onPageSizeChange={(size) => {
                setTicketPageSize(size);
                setTicketPage(1);
              }}
            />
          )}

          {/* Ticket Detail Modal */}
          {selectedTicket && (
            <TicketDetailModal
              ticket={selectedTicket}
              users={systemUsers}
              currentUserId={systemUsers.find(u => u.role === "Administrator")?.id || ""}
              currentUserRole="Administrator"
              currentUserName={systemUsers.find(u => u.role === "Administrator")?.fullName || "Administrator"}
              onClose={() => setSelectedTicket(null)}
              onUpdateStatus={(ticketId, status, notes, resolution) => {
                // Call the actual onUpdateTicketStatus prop from AdminDashboard
                onUpdateTicketStatus?.(ticketId, status, notes, resolution);
                setSelectedTicket(null);
              }}
              onReopenTicket={(ticketId) => {
                onReopenTicket?.(ticketId);
                setSelectedTicket(null);
              }}
            />
          )}
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

          {/* Bulk Actions Toolbar for Tasks */}
          {selectedTaskIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
              <span className="text-xs font-bold text-indigo-700">
                {selectedTaskIds.length} task(s) selected
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => handleBulkTaskAction("export")}
                  className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700"
                >
                  Export
                </button>
                <button
                  onClick={() => handleBulkTaskAction("delete")}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedTaskIds([])}
                  className="ml-auto rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-500 hover:bg-zinc-100"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Task Grid layout */}
          {filteredTasks.length === 0 ? (
            <EmptyState
              title="No tasks found"
              message="No tasks match the specified filter. Try a different status."
            />
          ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {paginatedTasks.map((task) => {
                const assigneeUser = systemUsers.find((u) => u.id === task.assignedTo);

                // Determine overdue calculation dynamically relative to mock environment time "2026-06-16"
                const isTaskOverdue = task.isOverdue;

                return (
                  <div key={task.id} className={`relative rounded-2xl bg-white border p-5 shadow-sm space-y-4 hover:shadow-md transition ${
                    isTaskOverdue ? "border-red-200 bg-red-50/10" :
                    selectedTaskIds.includes(task.id) ? "border-indigo-300 ring-2 ring-indigo-200" : "border-zinc-200"
                  }`}>
                    <div className="absolute top-3 right-3">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(task.id)}
                        onChange={() => toggleTaskSelection(task.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 pr-8">
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
                        {task.status === "Completed" ? "Completed (Non-Active)" : task.status} {isTaskOverdue && "(OVERDUE)"}
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
                        {task.dueDate && (() => {
                          const badge = getDaysRemainingBadge(task.dueDate, task.status);
                          return <span className={`ml-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.color}`}>{badge.text}</span>;
                        })()}
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

                    <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3">
                      <button
                        onClick={() => setSelectedTaskDetail(task)}
                        className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                      >
                        View Details
                      </button>

                      {task.status === "Completed" && onReopenTask && (
                        <button
                          onClick={() => onReopenTask(task.id)}
                          className="rounded bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm"
                        >
                          Reopen
                        </button>
                      )}

                      {task.status !== "Completed" && task.status !== "In Progress" && task.status !== "Escalated" && (
                        <button
                          onClick={() =>
                            onUpdateTaskStatus(task.id, "Completed", "Task completed successfully.")
                          }
                          className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Complete
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (window.confirm(`Delete task ${task.id}?`)) {
                            onDeleteTask(task.id);
                          }
                        }}
                        className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                    
                  </div>
);
              })}
          </div>
          )}

          {/* Task Pagination */}
          {filteredTasks.length > 0 && (
            <Pagination
              page={taskPage}
              pageSize={taskPageSize}
              totalItems={filteredTasks.length}
              onPageChange={setTaskPage}
              onPageSizeChange={(size) => {
                setTaskPageSize(size);
                setTaskPage(1);
              }}
            />
          )}

          {/* CREATE TASK MODAL SHEET */}
          {showTaskModal && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 pt-16">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl mb-8">
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
                    <label className="block font-semibold text-zinc-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={newTaskStartDate}
                      onChange={(e) => setNewTaskStartDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                    />
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

          {/* Task Detail Modal */}
          {selectedTaskDetail && (
            <TaskDetailModal
              task={selectedTaskDetail}
              currentUserId={systemUsers.find(u => u.role === "Administrator")?.id || ""}
              currentUserRole="Administrator"
              currentUserName={systemUsers.find(u => u.role === "Administrator")?.fullName || "Administrator"}
              onClose={() => setSelectedTaskDetail(null)}
              onUpdateStatus={(taskId, status, notes) => {
                onUpdateTaskStatus(taskId, status, notes);
                setSelectedTaskDetail(null);
              }}
              onUpdateProgress={onUpdateTaskProgress}
              onReviewTask={onReviewTask}
              onReopenTask={(taskId) => {
                onReopenTask?.(taskId);
                setSelectedTaskDetail(null);
              }}
              isManager={true}
            />
          )}

        </div>
      )}

      {/* REPORTS & ANALYTICS TAB */}
      {activeTab === "reports" && (
        <ReportsPanel
          users={systemUsers}
          clients={clients}
          tickets={tickets}
          tasks={tasks}
          auditLogs={auditLogs}
        />
      )}

      {/* AUDIT LOG TAB */}
      {activeTab === "audit" && (
        <AuditLogPanel
          auditLogs={auditLogs}
          users={systemUsers}
        />
      )}

    </div>
  );
}
