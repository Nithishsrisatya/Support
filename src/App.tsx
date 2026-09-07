/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";

import Header from "./components/Header";
import AdminDashboard from "./components/AdminDashboard";
import ManagerDashboard from "./components/ManagerDashboard";
import EmployeeDashboard from "./components/EmployeeDashboard";
import ClientDashboard from "./components/ClientDashboard";
import LoginPage from "./components/LoginPage";
import ChangePassword from "./components/ChangePassword";
import ResetPasswordPage from "./components/ResetPasswordPage";
import ProfileModal from "./components/ProfileModal";
import NotificationCenter from "./components/NotificationCenter";

import ErrorBoundary from "./components/ErrorBoundary";

import { User, Client, Ticket, Task, Notification, AuditLog, TicketStatus, TaskStatus, TicketPriority, SentEmail, ReviewStatus } from "./types";

import { createId, generateNotification } from "./utils";
import {apiFetch} from "./services/api";
export default function App() {
  // Initialize States from LocalStorage or Seed Data
  const [users, setUsers] = useState<User[]>([]);

  const [clients, setClients] = useState<Client[]>([]);

  const [tickets, setTickets] = useState<Ticket[]>([]);

  const [tasks, setTasks] = useState<Task[]>([]);

  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Active Context States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // ✅ Client-specific active profile (not just an id)
  const [activeClient, setActiveClient] = useState<Client | null>(null);

  const [showChangePassword, setShowChangePassword] = useState(false);

  const [activeRole, setActiveRole] = useState<"Administrator" | "Manager" | "Employee" | "Client">(([] as unknown) as "Administrator" | "Manager" | "Employee" | "Client");

  const [activeUserId, setActiveUserId] = useState<string>(([] as unknown) as string);

  const [activeClientId, setActiveClientId] = useState<string>(([] as unknown) as string);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);


async function loadUsers() {
    try {
      const res = await apiFetch("/users");
      setUsers(res);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  }
   async function loadClients() {
    try {
      const data = await apiFetch("/clients");
      setClients(data);
    } catch (err) {
      console.error("Failed to load clients:", err);
    }
  }

  // ✅ Load the currently authenticated client's full profile
  async function loadMyClientProfile() {
    try {
      const client = await apiFetch("/clients/me");
      setActiveClient(client);
    } catch (err) {
      console.error("Failed to load my client profile:", err);
      setActiveClient(null);
    }
  }

  async function loadTickets() {
  try {
    const data = await apiFetch("/tickets");
    setTickets(data);
  } catch (err) {
    console.error("Failed to load tickets:", err);
  }
}
async function loadTasks() {
  try {
    const data = await apiFetch("/tasks");
    setTasks(data);
  } catch (err) {
    console.error("Failed to load tasks:", err);
  }
}
async function loadNotifications() {
  try {
    const data = await apiFetch("/notifications");

    setNotifications(data);
  } catch (err) {
    console.error("Failed to load notifications:", err);
  }
}
async function loadAuditLogs() {
  try {
    const data = await apiFetch("/audit-logs");
    setAuditLogs(data);
  } catch (err) {
    console.error("Failed to load audit logs:", err);
  }
}
  const loadAllData = async (roleToLoad: string) => {
    setIsLoadingData(true);
    console.log(`Fetching data for role: ${roleToLoad}`);

    switch (roleToLoad) {
      case "Administrator":
        await Promise.all([
          loadUsers(),
          loadClients(),
          loadTickets(),
          loadTasks(),
          loadNotifications(),
          loadAuditLogs(),
        ]);
        break;
      case "Manager":
        await Promise.all([
          loadUsers(),
          loadClients(),
          loadTickets(),
          loadTasks(),
          loadNotifications(),
          loadAuditLogs(),
        ]);
        break;
      case "Employee":
        // Employees should NOT request admin-only APIs: /users, /clients, /audit-logs
        await Promise.all([
          loadTickets(),
          loadTasks(),
          loadNotifications(),
        ]);
        break;
      case "Client":
        await Promise.all([
          loadMyClientProfile(),
          loadTickets(),
          loadNotifications(),
        ]);
        break;
      default:
        await Promise.all([
          loadTickets(),
          loadTasks(),
          loadNotifications(),
        ]);
        break;
    }
    setIsLoadingData(false);
  };

 // Maintain active context variables inside secure Storage
  useEffect(() => {
    async function initializeApp() {
      try {
        const savedUser = localStorage.getItem("currentUser");
        const token = localStorage.getItem("token"); // Assuming you store the JWT token here

        // 1. If NO token/user exists, stay on the Login page
        if (!savedUser || !token) {
          setIsAuthenticated(false);
          setIsInitializing(false);
          return;
        }

        const user = JSON.parse(savedUser);
        
        // 2. Optional: Add a call to verify the token is still valid with the backend
        // const isValid = await apiFetch("/auth/verify-token"); 
        
        setCurrentUser(user);
        setActiveRole(user.role);
        setActiveUserId(user.id);
        setIsAuthenticated(true);

        // 3. Force password change if needed
        if (user.firstLogin || user.first_login) {
          setShowChangePassword(true);
          return; // Stop data loading
        }

          // 4. Load role-aware application data
        await loadAllData(user.role);

      } catch (err) {
        console.error("Initialization failed:", err);
        setIsAuthenticated(false); // Force back to login on failure
        localStorage.removeItem("currentUser");
        localStorage.removeItem("token");
        setGlobalError("Session expired or invalid. Please log in again.");
        setShowToast(true);

      } finally {
        setIsInitializing(false);
      }
    }

    initializeApp();
  }, []);
  // Integrated server-side state with simulated/live SMTP outbox
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

  // Initial database load from server context
  
  // Real-time notification polling every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(async () => {
      try {
        const data = await apiFetch("/notifications");
        setNotifications(data);
      } catch (err) {
        // Silently fail - polling is non-critical
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Compute active entities
  const computedCurrentUser = activeRole !== "Client" ? (users.find((u) => u.id === activeUserId) || users[0]) : null;
// ✅ Resolve active client for dashboard rendering
// - Client role should use the `/clients/me` payload (activeClient state)
// - Other roles keep using the clients list + activeClientId logic
const resolvedActiveClient =
  activeRole === "Client"
    ? activeClient
    : (clients.find((c) => c.id === activeClientId) || clients[0]);

  // Notification generator trigger helper
 const triggerSystemNotification = async (
  targetUserId: string,
  type: any,
  title: string,
  message: string
) => {
  try {
    const notif = generateNotification(
      targetUserId,
      type,
      title,
      message
    );

    await apiFetch("/notifications", {
      method: "POST",
      body: JSON.stringify(notif),
    });

    await loadNotifications();
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
};
  
  const handleLoginSuccess = async (user: User) => { // <-- Note the "async" keyword here
    setIsAuthenticated(true);
    setActiveRole(user.role);
    setActiveUserId(user.id); // Set for staff roles
    setCurrentUser(user); // Set for staff roles

    if (user.role === "Client") setActiveClientId(user.id);

    // Force password change for first login
    if (user.firstLogin || user.first_login) {
      localStorage.setItem("currentUser", JSON.stringify(user)); // Save so it persists on refresh
      setShowChangePassword(true);
      return; // Stop data loading until password is changed
    }

    setShowChangePassword(false); // Ensure password change modal is hidden
    await loadAllData(user.role); // Load all data based on the user's role
  };

  const handleLogout = () => {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("token");
    localStorage.removeItem("accountType");
    setCurrentUser(null);
    setActiveClient(null);
    setIsAuthenticated(false);
  };

  // Marked Single Notification Read
  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: "Read", readDate: new Date().toISOString() } : n))
    );
  };

  const handleClearNotifications = () => {
    const targetId = currentUser ? currentUser.id : activeClient ? activeClient.id : "";
    setNotifications((prev) => prev.filter((n) => n.userId !== targetId));
  };

  // Notification Center Handlers
  const handleNotificationMarkAllAsRead = () => {
    const targetId = currentUser ? currentUser.id : activeClient ? activeClient.id : "";
    setNotifications((prev) =>
      prev.map((n) =>
        n.userId === targetId ? { ...n, status: "Read" as const, readDate: new Date().toISOString() } : n
      )
    );
  };

  const handleNotificationDelete = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleOpenNotificationCenter = () => {
    setShowNotificationCenter(true);
  };

  const handleCloseNotificationCenter = () => {
    setShowNotificationCenter(false);
  };

  // ==========================================
  // CLIENT PROFILE CREATION OPERATIONS
  // ==========================================
  const handleAddClient = async (clientInput: Omit<Client, "id" | "createdDate" | "updatedDate">) => {
    const newId = createId("C");
    const freshClient: Client = {
      ...clientInput,
      id: newId,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    await apiFetch("/clients", {
    method: "POST",
    body: JSON.stringify(freshClient),
});

await loadClients();
    setGlobalError("Client profile provisioned successfully!");
    setShowToast(true);




    // Dynamic credentials distributed log
    triggerSystemNotification(
      newId,
      "Account Creation",
      "Corporate Accounts Provisioned",
      `Portal invitation dispatched for company representative ${freshClient.contactPerson} at email: ${freshClient.email}.`
    );
  };

  const handleUpdateClient = async (id: string, updates: Partial<Client>) => {
    try {
      const existingClient = clients.find((c) => c.id === id);

      if (!existingClient) return;

      const updatedClient = {
        ...existingClient,
        companyDomain: existingClient.companyDomain || (existingClient.email ? existingClient.email.split("@")[1] : ""),
        ...updates,
        updatedDate: new Date().toISOString(),
      };

      await apiFetch(`/clients/${id}`, {
        method: "PUT",
        body: JSON.stringify(updatedClient),
      });

      await loadClients();
      setGlobalError("Client profile updated successfully!");
      setShowToast(true);
    } catch (err: any) {
      console.error("Failed to update client:", err);
      setGlobalError(err.message || "Failed to update client.");
      setShowToast(true);
      throw err;
    }
  };

  const handleUpdateMyClientProfile = async (updates: {
    companyName: string;
    companyDomain: string;
    contactPerson: string;
    email: string;
    phoneNumber?: string;
    city?: string;
  }) => {
    try {
      const res = await apiFetch("/clients/me", {
        method: "PUT",
        body: JSON.stringify(updates),
      });

      if (res && res.client) {
        setActiveClient(res.client);

        if (currentUser) {
          const updatedUser: User = {
            ...currentUser,
            fullName: res.client.contactPerson,
            email: res.client.email,
          };
          setCurrentUser(updatedUser);
          localStorage.setItem("currentUser", JSON.stringify(updatedUser));
        }
      } else {
        await loadMyClientProfile();
      }

      setGlobalError("Profile updated successfully!");
      setShowToast(true);
    } catch (err: any) {
      console.error("Failed to update profile:", err);
      setGlobalError(err.message || "Failed to update profile.");
      setShowToast(true);
      throw err;
    }
  };

const handleDeleteClient = async (id: string) => {
  try {
    await apiFetch(`/clients/${id}`, {
      method: "DELETE",
    });

    await loadClients();
    setGlobalError("Client deleted successfully!");
    setShowToast(true);
  } catch (err) {
    console.error("Failed to delete client:", err);
    setGlobalError((err as Error).message || "Failed to delete client.");
    setShowToast(true);
  }
};
  const handleDeleteEmployee = async (id: string) => {
  try {
    await apiFetch(`/users/${id}`, {
      method: "DELETE",
    });

    await loadUsers();
    setGlobalError("Employee deleted successfully!");
    setShowToast(true);
  } catch (err) {
    console.error(err);
    setGlobalError((err as Error).message || "Failed to delete employee.");
    setShowToast(true);
  }
};
  // ==========================================
  // EMPLOYEE ONBOARDING / CONFIGURATION
  // ==========================================
 const handleAddEmployee = async (empInput: Omit<User, "id" | "createdDate" | "updatedDate" | "passwordHash">) => {
    const newId = createId("U");

    const freshUser: User = {
      ...empInput,
      id: newId,
      passwordHash: `${empInput.fullName.toLowerCase().split(" ")[0]}123`,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify(freshUser),
      });

      await loadUsers();
      setGlobalError("Employee onboarded successfully!");
      setShowToast(true);


      triggerSystemNotification(
        newId,
        "Account Creation",
        "Operations Credentials Generated",
        `Welcome to support workspace, ${freshUser.fullName}! Click SWITCH active user in header to test views.`
      );
    } catch (error) {
      console.error("Failed to add employee:", error);
      setGlobalError((error as Error).message || "Failed to add employee.");
      setShowToast(true);
    }
  };
  const handleUpdateEmployee = async (
  id: string,
  updates: Partial<User>
) => {
  await apiFetch(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...updates,
      updatedDate: new Date().toISOString(),
    }),
  });

  await loadUsers();
  setGlobalError("Employee profile updated successfully!");
  setShowToast(true);

  try {
    // No specific notification for employee update in current logic, but could be added
  } catch (err) {
    console.error("Failed to update employee:", err);
    setGlobalError((err as Error).message || "Failed to update employee.");
    setShowToast(true);
  }
};

  // ==========================================
  // TICKET ACTIONS & ASSIGNMENTS
  // ==========================================
  const handleAssignTicket = async (
  ticketId: string,
  employeeId: string | null,
  priority?: TicketPriority
) => {
  try {
    const ticket = tickets.find((t) => t.id === ticketId);

    if (!ticket) return;

    // Determine what actually changed
    const employeeChanged = employeeId !== ticket.assignedTo;
    const priorityChanged = priority !== undefined && priority !== ticket.priority;

    // Only send the fields that actually changed to avoid invalid workflow transitions
    const payload: any = {};

    // 1. Always send the current assignedTo value from the dropdown
    payload.assignedTo = employeeId;

    // 2. Determine status change only when appropriate
    if (employeeChanged) {
      if (employeeId && ticket.status === "New") {
        // First-time assignment: New → Assigned
        payload.status = "Assigned";
      }
      // For reassignment or unassignment: keep existing status
    }

    // 3. Priority change (only if it actually changed)
    if (priorityChanged) {
      payload.priority = priority;
    }

    // If nothing changed, skip the API call
    if (Object.keys(payload).length === 0) return;

    await apiFetch(`/tickets/${ticketId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    await loadTickets();

    setGlobalError(`Ticket ${ticketId} assigned successfully!`);
    setShowToast(true);
    if (employeeId) {
      triggerSystemNotification(
        employeeId,
        "Ticket Assignment",
        "Assigned Support Case Dispatch",
        `Support case ${ticketId} '${ticket.subject}' assigned to your operations queue by Administrator.`
      );
    }
  } catch (err: any) {
    setGlobalError(err.message || "Failed to assign ticket.");
    setShowToast(true);
    console.error("Failed to assign ticket:", err);
  }
};
const handleDeleteTicket = async (ticketId: string) => {
  try {
    await apiFetch(`/tickets/${ticketId}`, {
      method: "DELETE",
    });

    await loadTickets();
    setGlobalError(`Ticket ${ticketId} deleted successfully!`);
    setShowToast(true);
  } catch (err) {
    console.error("Failed to delete ticket:", err);
  }
};
  const handleClientSubmitTicket = async (newTicketInput: {
  subject: string;
  description: string;
  category: any;
  priority: TicketPriority;
  dueDate?: string;
}) => {
  try {
    const newId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;
    const targetCli = activeClient || clients[0];

    const freshTicket: Ticket = {
      id: newId,
      subject: newTicketInput.subject,
      description: newTicketInput.description,
      category: newTicketInput.category,
      priority: newTicketInput.priority,
      status: "New",
      assignedTo: null,
      clientId: targetCli.id,
      dueDate: newTicketInput.dueDate || undefined,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      history: [],
    };

    await apiFetch("/tickets", {
      method: "POST",
      body: JSON.stringify(freshTicket),
    });

    await loadTickets();

    setGlobalError(`Ticket ${newId} created successfully!`);
    setShowToast(true);
    const admin = users.find((u) => u.id === "U-1") || users[0];

    triggerSystemNotification(
      admin.id,
      "Ticket Update",
      `New Ticket Case: ${newId}`,
      `Support request submitted by ${targetCli.companyName}: '${freshTicket.subject}'.`
    );

    // Notify Client
    triggerSystemNotification(
      targetCli.id,
      "Ticket Update",
      "SLA Acknowledgement Dispatched",
      `We have successfully registered your support request (${newId}). Our support team will begin working on it shortly.`
    );
  } catch (err) {
    console.error("Failed to submit ticket:", err);
    setGlobalError((err as Error).message || "Failed to submit ticket.");
    setShowToast(true);
  }
};

 const handleUpdateTicketStatus = async (
  ticketId: string,
  status: TicketStatus,
  notes?: string,
  resolution?: string
) => {
  try {
    const ticket = tickets.find((t) => t.id === ticketId);

    if (!ticket) return;

    const updatedTicket = {
      ...ticket,
      status,
      employeeNotes: notes ?? ticket.employeeNotes,
      resolutionSummary: resolution ?? ticket.resolutionSummary,
      updatedDate: new Date().toISOString(),
    };

    await apiFetch(`/tickets/${ticketId}`, {
      method: "PUT",
      body: JSON.stringify(updatedTicket),
    });

    await loadTickets();

    setGlobalError(`Ticket ${ticketId} status updated to ${status}!`);
    setShowToast(true);

    triggerSystemNotification(
      ticket.clientId,
      "Ticket Update",
      `Case Status Updated: ${status}`,
      `Your support ticket ${ticketId} has been updated to '${status}'. ${
        resolution
          ? "Please review the resolution details in the client portal."
          : "Please check the latest updates."
      }`
    );
  } catch (err) {
    console.error("Failed to update ticket status:", err);
    setGlobalError((err as Error).message || "Failed to update ticket status.");
    setShowToast(true);
  }
};

  const handleConfirmResolutionClosure = async (
  ticketId: string,
  rating: number,
  notes?: string
) => {
  try {
    const ticket = tickets.find((t) => t.id === ticketId);

    if (!ticket) return;

    const updatedTicket = {
      ...ticket,
      status: "Closed",
      satisfactionRating: rating,
      satisfactionNotes: notes,
      updatedDate: new Date().toISOString(),
    };

    await apiFetch(`/tickets/${ticketId}`, {
      method: "PUT",
      body: JSON.stringify(updatedTicket),
    });

    await loadTickets();

    setGlobalError(`Ticket ${ticketId} resolution confirmed and closed!`);
    setShowToast(true);
    if (ticket.assignedTo) {
      triggerSystemNotification(
        ticket.assignedTo,
        "Ticket Update",
        `Client Closed Support Case ${ticketId}`,
        `Good job! Client confirmed resolution on case ${ticketId} with a quality rating of ${rating}/5 stars.`
      );
    }
  } catch (err: any) {
    setGlobalError(err.message || "Failed to confirm resolution.");
    setShowToast(true);
    console.error("Failed to close ticket:", err);
  }
};

const handleReopenTicket = async (ticketId: string) => {
  try {
    const res = await apiFetch(`/tickets/${ticketId}/reopen`, {
      method: "POST",
    });
    await loadTickets();
    setGlobalError(`Ticket ${ticketId} reopened successfully!`);
    setShowToast(true);

    const ticket = tickets.find((t) => t.id === ticketId) || res?.ticket;
    if (ticket && ticket.assignedTo) {
      triggerSystemNotification(
        ticket.assignedTo,
        "Ticket Update",
        `Ticket ${ticketId} Reopened`,
        `Ticket ${ticketId} '${ticket.subject}' has been reopened and returned to active queue.`
      );
    }
  } catch (err: any) {
    console.error("Failed to reopen ticket:", err);
    setGlobalError(err.message || "Failed to reopen ticket.");
    setShowToast(true);
  }
};

const handleReopenTask = async (taskId: string) => {
  try {
    const res = await apiFetch(`/tasks/${taskId}/reopen`, {
      method: "POST",
    });
    await loadTasks();
    setGlobalError(`Task ${taskId} reopened successfully!`);
    setShowToast(true);

    const task = tasks.find((t) => t.id === taskId) || res?.task;
    if (task && task.assignedTo) {
      triggerSystemNotification(
        task.assignedTo,
        "Task Assignment",
        `Task ${taskId} Reopened`,
        `Task ${taskId} '${task.title}' has been reopened and returned to active queue.`
      );
    }
  } catch (err: any) {
    console.error("Failed to reopen task:", err);
    setGlobalError(err.message || "Failed to reopen task.");
    setShowToast(true);
  }
};

  // ==========================================
  // TASK INTERNAL MANAGEMENT OPERATIONS
  // ==========================================
 const handleAssignTask = async (
  taskInput: Omit<
    Task,
    "id" | "createdDate" | "updatedDate" | "escalationStatus" | "assignedBy"
  >
) => {
  try {
    const newId = `TSK-${Math.floor(200 + Math.random() * 900)}`;
    const admin = users.find((u) => u.id === "U-1") || users[0];

    const freshTask: Task = {
      ...taskInput,
      id: newId,
      assignedBy: admin.id,
      escalationStatus: "No",
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    await apiFetch("/tasks", {
      method: "POST",
      body: JSON.stringify(freshTask),
    });

    await loadTasks();

    setGlobalError(`Task ${newId} assigned successfully!`);
    setShowToast(true);
    triggerSystemNotification(
      taskInput.assignedTo,
      "Task Assignment",
      "New Internal Task Dispatched",
      `Task ${newId} '${taskInput.title}' has been assigned to you.`
    );
  } catch (err) {
    console.error("Failed to create task:", err);
    setGlobalError((err as Error).message || "Failed to create task.");
    setShowToast(true);
  }
};

 const handleUpdateTaskStatus = async (
  taskId: string,
  status: TaskStatus,
  notes?: string
) => {
  try {
    const taskObj = tasks.find((t) => t.id === taskId);

    if (!taskObj) return;

    const updatedTask = {
      ...taskObj,
      status,
      completionNotes: notes ?? taskObj.completionNotes,
      completionDate:
        status === "Completed"
          ? new Date().toISOString()
          : taskObj.completionDate,
      updatedDate: new Date().toISOString(),
    };

    await apiFetch(`/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(updatedTask),
    });

    await loadTasks();

    setGlobalError(`Task ${taskId} status updated to ${status}!`);
    setShowToast(true);

    if (status === "Completed") {
      const mgrUser = users.find((u) => u.id === "U-2") || users[0];
      // The user completing the task is the currently logged-in user.
      if (currentUser && mgrUser) {
        triggerSystemNotification(
          mgrUser.id,
          "Task Reminder",
          "Task Verification Completed",
          `Operator ${currentUser.fullName} completed task ${taskId}.`
        );
      }
    }
  } catch (err: any) {
    setGlobalError(err.message || "Failed to update task status.");
    setShowToast(true);
    console.error("Failed to update task:", err);
  }
};
 const handleUpdateTaskProgress = async (taskId: string, progressPercentage: number, comment: string) => {
  try {
    const taskObj = tasks.find((t) => t.id === taskId);
    if (!taskObj) return;

    const updatedTask = {
      ...taskObj,
      progressPercentage,
      updatedDate: new Date().toISOString(),
    };

    await apiFetch(`/tasks/${taskId}/progress`, {
      method: "POST",
      body: JSON.stringify({ progressPercentage, comment }),
    });

    await loadTasks();
    setGlobalError(`Task ${taskId} progress updated!`);
    setShowToast(true);

    
  } catch (err) {
    console.error("Failed to update progress:", err);
  }
};

const handleReviewTask = async (taskId: string, reviewStatus: ReviewStatus, managerNotes: string) => {
  try {
    const taskObj = tasks.find((t) => t.id === taskId);
    if (!taskObj) return;

    await apiFetch(`/tasks/${taskId}/review`, {
      method: "PUT",
      body: JSON.stringify({ reviewStatus, managerNotes }),
    });

    await loadTasks();
    setGlobalError(`Task ${taskId} reviewed as ${reviewStatus}!`);
    setShowToast(true);

    
  } catch (err) {
    console.error("Failed to review task:", err);
  }
};

const handleDeleteTask = async (taskId: string) => {
  try {
    await apiFetch(`/tasks/${taskId}`, {
      method: "DELETE",
    });

    await loadTasks();
    setGlobalError(`Task ${taskId} deleted successfully!`);
    setShowToast(true);
  } catch (err) {
    console.error("Failed to delete task:", err);
  }
};

const handleBulkTickets = async (action: 'assign' | 'updateStatus' | 'delete', ids: string[], payload?: any) => {
    try {
        await apiFetch('/tickets/bulk', {
            method: 'POST',
            body: JSON.stringify({ action, ids, payload })
        });
        await loadTickets();
        setGlobalError(`Successfully performed bulk ${action} on tickets.`);
        setShowToast(true);
    } catch (err: any) {
        console.error(`Failed to bulk ${action} tickets:`, err);
        setGlobalError(err.message || `Failed to bulk ${action} tickets.`);
        setShowToast(true);
    }
};

const handleBulkTasks = async (action: 'delete', ids: string[], payload?: any) => {
    try {
        await apiFetch('/tasks/bulk', {
            method: 'POST',
            body: JSON.stringify({ action, ids, payload })
        });
        await loadTasks();
        setGlobalError(`Successfully performed bulk ${action} on tasks.`);
        setShowToast(true);
    } catch (err: any) {
        console.error(`Failed to bulk ${action} tasks:`, err);
        setGlobalError(err.message || `Failed to bulk ${action} tasks.`);
        setShowToast(true);
    }
};
  // Switch Active Active Role perspective
  const handleSwitchRole = (role: "Administrator" | "Manager" | "Employee" | "Client", id?: string) => {
    setActiveRole(role);
    if (role === "Client") {
      if (id) setActiveClientId(id);
    } else {
      if (id) setActiveUserId(id);
    }
  };
if (isInitializing) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        <div className="text-lg font-semibold text-zinc-700">
          Initializing Application...
        </div>
      </div>
    </div>
  );
  }

  // Handle unauthenticated secure reset password link navigation
  const urlParams = new URLSearchParams(window.location.search);
  const resetTokenFromUrl = urlParams.get("token");
  const isResetPasswordPath = window.location.pathname === "/reset-password" || !!resetTokenFromUrl;

  if (isResetPasswordPath) {
    return (
      <ResetPasswordPage
        token={resetTokenFromUrl || ""}
        onNavigateToLogin={() => {
          window.history.replaceState({}, document.title, "/");
          window.location.href = "/";
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return (
    <LoginPage
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }
if (showChangePassword) {
    return (
      <ChangePassword
        firstLogin={(() => {
          // For clients, currentUser may be null; read from localStorage
          const stored = JSON.parse(localStorage.getItem("currentUser") || "{}");
          return !!(stored?.firstLogin || stored?.first_login);
        })()}
        onBack={async () => {
          setShowChangePassword(false);
          console.log("Loading dashboard data...");

          await loadAllData(activeRole);
        }}
        onSuccess={async () => {
          setShowChangePassword(false);

          // 1. Update localStorage to clear firstLogin flag (for both staff and clients)
          const stored = JSON.parse(localStorage.getItem("currentUser") || "{}");
          const updatedStored = { ...stored, firstLogin: false, first_login: false };
          localStorage.setItem("currentUser", JSON.stringify(updatedStored));

          // 2. Update React state if this is a staff user
          if (currentUser) {
            setCurrentUser(updatedStored);
          }

          // 3. Role-based secure data loading
          await loadAllData(updatedStored.role);

          alert("Password updated successfully!");
        }}
      />
    );
  }
  return (
    
    <div className="min-h-screen bg-zinc-50 text-zinc-800 pb-12 font-sans relative">
      
      {/* Global Interactive Header */}
      <Header
        currentUser={currentUser}
        activeClient={resolvedActiveClient}

        clients={clients}
        systemUsers={users}
        notifications={notifications}
        auditLogs={auditLogs}
        sentEmails={sentEmails}
        onSwitchRole={handleSwitchRole}
        onMarkNotificationRead={handleMarkNotificationRead}
        onClearNotifications={handleClearNotifications}

        onLogout={handleLogout}

  onOpenProfile={() => setShowProfileModal(true)}
  onOpenNotificationCenter={handleOpenNotificationCenter}
      />
{showProfileModal && (currentUser || activeRole === "Client") && (
  <ProfileModal
    user={currentUser}
    client={resolvedActiveClient}
    onClose={() => setShowProfileModal(false)}
    onResetPassword={() => {
      setShowProfileModal(false);
      setShowChangePassword(true);
    }}
    onUpdateClientProfile={handleUpdateMyClientProfile}
  />
)}
      {/* Debug: Active client context values (Client role) */}
      {isLoadingData && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
        </div>
      )}
      {activeRole === "Client" && (
        (() => {
          console.log("Active Role:", activeRole);
          console.log("Clients:", clients);
          console.log("Active Client ID:", activeClientId);
          console.log("Active Client:", activeClient);
          return null;
        })()
      )}

      <ErrorBoundary>
        {/* Main Grid Viewport */}
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Dynamic routing boards based on active perspective role */}
          {activeRole === "Administrator" && (
            <AdminDashboard
              systemUsers={users}
              clients={clients}
              tickets={tickets}
              tasks={tasks}
              auditLogs={auditLogs}
              onAddClient={handleAddClient}
              onUpdateClient={handleUpdateClient}
              onDeleteClient={handleDeleteClient}
              onAddEmployee={handleAddEmployee}
              onUpdateEmployee={handleUpdateEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              onAssignTicket={handleAssignTicket}
              onDeleteTicket={handleDeleteTicket}
              onDeleteTask={handleDeleteTask}
              onUpdateTaskStatus={handleUpdateTaskStatus}
              onAssignTask={handleAssignTask}
              onUpdateTaskProgress={handleUpdateTaskProgress}
              onReviewTask={handleReviewTask}
              onBulkActionTickets={handleBulkTickets}
              onBulkActionTasks={handleBulkTasks}
              onReopenTicket={handleReopenTicket}
              onReopenTask={handleReopenTask}
            />
          )}

          {activeRole === "Manager" && (
            <ManagerDashboard
              currentManager={currentUser || users.find((u) => u.id === "U-2")!}
              systemUsers={users}
              clients={clients}
              tickets={tickets}
              tasks={tasks}
              auditLogs={auditLogs}
            />
          )}

          {activeRole === "Employee" && (
            <EmployeeDashboard
              currentEmployee={currentUser || users.find((u) => u.id === "U-3")!}
              clients={clients}
              tickets={tickets}
              tasks={tasks}
              notifications={notifications}
              onUpdateTicketStatus={handleUpdateTicketStatus}
              onUpdateTaskStatus={handleUpdateTaskStatus}
            />
          )}

          {activeRole === "Client" && resolvedActiveClient && (
            <ClientDashboard
              activeClient={resolvedActiveClient}
              tickets={tickets}
              notifications={notifications}
              onSubmitTicket={handleClientSubmitTicket}
              onConfirmResolution={handleConfirmResolutionClosure}
              onReopenTicket={handleReopenTicket}
            />
          )}

        </main>
      </ErrorBoundary>
      
      {/* Notification Center Modal */}
      {showNotificationCenter && (
        <NotificationCenter
          currentUserId={currentUser ? currentUser.id : activeClient ? activeClient.id : ""}
          currentRole={activeRole}
          notifications={notifications}
          onMarkRead={handleMarkNotificationRead}
          onMarkAllAsRead={handleNotificationMarkAllAsRead}
          onDelete={handleNotificationDelete}
          onClearAll={handleClearNotifications}
          onClose={handleCloseNotificationCenter}
        />
      )}

      {/* Global Toast Notification */}
      {showToast && globalError && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={`rounded-lg px-4 py-3 shadow-lg ${globalError.includes("successfully") || globalError.includes("Success") ? "bg-emerald-500" : "bg-red-500"} text-white`}>
            <p className="font-semibold">{globalError}</p>
            <button
              onClick={() => setShowToast(false)}
              className="absolute top-1 right-1 text-white/80 hover:text-white"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
