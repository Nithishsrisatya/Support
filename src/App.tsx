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

import { User, Client, Ticket, Task, Notification, AuditLog, TicketStatus, TaskStatus, TicketPriority, SentEmail } from "./types";
import { SEED_USERS, SEED_CLIENTS, SEED_TICKETS, SEED_TASKS, SEED_NOTIFICATIONS, SEED_AUDIT_LOGS } from "./seedData";
import { createId, generateAuditLog, generateNotification } from "./utils";

export default function App() {
  // Initialize States from LocalStorage or Seed Data
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem("crm_sys_users");
    return saved ? JSON.parse(saved) : SEED_USERS;
  });

  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem("crm_sys_clients");
    return saved ? JSON.parse(saved) : SEED_CLIENTS;
  });

  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem("crm_sys_tickets");
    return saved ? JSON.parse(saved) : SEED_TICKETS;
  });

  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem("crm_sys_tasks");
    return saved ? JSON.parse(saved) : SEED_TASKS;
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem("crm_sys_notifications");
    return saved ? JSON.parse(saved) : SEED_NOTIFICATIONS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem("crm_sys_auditlogs");
    return saved ? JSON.parse(saved) : SEED_AUDIT_LOGS;
  });

  // Active Context States
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem("crm_sys_is_authenticated") === "true";
  });

  const [activeRole, setActiveRole] = useState<"Administrator" | "Manager" | "Employee" | "Client">(() => {
    return (localStorage.getItem("crm_sys_active_role") as any) || "Administrator";
  });

  const [activeUserId, setActiveUserId] = useState<string>(() => {
    return localStorage.getItem("crm_sys_active_userid") || "U-1";
  });

  const [activeClientId, setActiveClientId] = useState<string>(() => {
    return localStorage.getItem("crm_sys_active_clientid") || "C-2";
  });

  // Maintain active context variables inside secure Storage
  useEffect(() => {
    localStorage.setItem("crm_sys_is_authenticated", isAuthenticated ? "true" : "false");
  }, [isAuthenticated]);

  useEffect(() => {
    localStorage.setItem("crm_sys_active_role", activeRole);
  }, [activeRole]);

  useEffect(() => {
    localStorage.setItem("crm_sys_active_userid", activeUserId);
  }, [activeUserId]);

  useEffect(() => {
    localStorage.setItem("crm_sys_active_clientid", activeClientId);
  }, [activeClientId]);

  // Sync to local storage when state modifications occur
  useEffect(() => {
    localStorage.setItem("crm_sys_users", JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem("crm_sys_clients", JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem("crm_sys_tickets", JSON.stringify(tickets));
  }, [tickets]);

  useEffect(() => {
    localStorage.setItem("crm_sys_tasks", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("crm_sys_notifications", JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem("crm_sys_auditlogs", JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Integrated server-side state with simulated/live SMTP outbox
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);

  // Initial database load from server context
  useEffect(() => {
    const initServerState = async () => {
      try {
        const response = await fetch("/api/state");
        if (response.ok) {
          const data = await response.json();
          if (data.users && data.users.length > 0) setUsers(data.users);
          if (data.clients && data.clients.length > 0) setClients(data.clients);
          if (data.tickets && data.tickets.length > 0) setTickets(data.tickets);
          if (data.tasks) setTasks(data.tasks);
          if (data.notifications) setNotifications(data.notifications);
          if (data.auditLogs && data.auditLogs.length > 0) setAuditLogs(data.auditLogs);
          if (data.sentEmails) setSentEmails(data.sentEmails);
        }
      } catch (e) {
        console.warn("[Database Offline] Falling back to default mock cache store:", e);
      }
    };
    initServerState();
  }, []);

  // Live synchronizer to Node db and Mailer
  useEffect(() => {
    const syncTimeout = setTimeout(async () => {
      try {
        const payload = { users, clients, tickets, tasks, notifications, auditLogs };
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          const syncResult = await response.json();
          if (syncResult.sentEmails) {
            setSentEmails(syncResult.sentEmails);
          }
        }
      } catch (e) {
        console.error("Auto Sync Server Endpoint unreachable:", e);
      }
    }, 400);

    return () => clearTimeout(syncTimeout);
  }, [users, clients, tickets, tasks, notifications, auditLogs]);

  // Compute active entities
  const currentUser = activeRole !== "Client" ? (users.find((u) => u.id === activeUserId) || users[0]) : null;
  const activeClient = activeRole === "Client" ? (clients.find((c) => c.id === activeClientId) || clients[0]) : null;

  // Audit and notification generator trigger helper
  const triggerSystemAudit = (
    userId: string,
    fullName: string,
    action: any,
    entityType: any,
    entityId: string,
    description: string
  ) => {
    const log = generateAuditLog(userId, fullName, action, entityType, entityId, description);
    setAuditLogs((prev) => [log, ...prev]);
  };

  const triggerSystemNotification = (
    targetUserId: string,
    type: any,
    title: string,
    message: string
  ) => {
    const notif = generateNotification(targetUserId, type, title, message);
    setNotifications((prev) => [notif, ...prev]);
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

  // Secure Auth Login & Session Logout
  const handleLoginSuccess = (role: "Administrator" | "Manager" | "Employee" | "Client", targetId: string) => {
    setIsAuthenticated(true);
    setActiveRole(role);
    if (role === "Client") {
      setActiveClientId(targetId);
    } else {
      setActiveUserId(targetId);
    }

    let fullName = "Unknown User";
    if (role === "Client") {
      const cli = clients.find(c => c.id === targetId);
      if (cli) fullName = `${cli.contactPerson} (${cli.companyName})`;
    } else {
      const u = users.find(usr => usr.id === targetId);
      if (u) fullName = u.fullName;
    }

    triggerSystemAudit(
      targetId,
      fullName,
      "Authentication",
      role === "Client" ? "Client" : "User",
      targetId,
      `User ${fullName} authenticated to security node [${targetId}] with permission flag: ${role}.`
    );
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    // Log explicit session end audit trail
    let userId = currentUser ? currentUser.id : activeClient ? activeClient.id : "U-GUEST";
    let userName = currentUser ? currentUser.fullName : activeClient ? activeClient.contactPerson : "Guest";
    triggerSystemAudit(
      userId,
      userName,
      "Log Out",
      currentUser ? "User" : activeClient ? "Client" : "User",
      userId,
      `Secure communication session terminated for ${userName}.`
    );
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

  // ==========================================
  // CLIENT PROFILE CREATION OPERATIONS
  // ==========================================
  const handleAddClient = (clientInput: Omit<Client, "id" | "createdDate" | "updatedDate">) => {
    const newId = createId("C");
    const freshClient: Client = {
      ...clientInput,
      id: newId,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    setClients((prev) => [freshClient, ...prev]);

    // Record audits & trigger email credentials distribution simulation
    const adminUser = users.find((u) => u.id === "U-1") || users[0];
    triggerSystemAudit(
      adminUser.id,
      adminUser.fullName,
      "Account Creation",
      "Client",
      newId,
      `Administrator Sarah Jenkins registered new Client Company File: ${freshClient.companyName} (${freshClient.contactPerson}).`
    );

    // Dynamic credentials distributed log
    triggerSystemNotification(
      newId,
      "Account Creation",
      "Corporate Accounts Provisioned",
      `Portal invitation dispatched for company representative ${freshClient.contactPerson} at email: ${freshClient.email}.`
    );
  };

  const handleUpdateClient = (id: string, updates: Partial<Client>) => {
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates, updatedDate: new Date().toISOString() } : c))
    );

    const client = clients.find((c) => c.id === id);
    const adminUser = users.find((u) => u.id === "U-1") || users[0];

    if (client) {
      triggerSystemAudit(
        adminUser.id,
        adminUser.fullName,
        "Account Status Change",
        "Client",
        id,
        `Administrator modified properties on Client file ${client.companyName}: Updated status to ${updates.status || "Properties Modified"}.`
      );
    }
  };

  // ==========================================
  // EMPLOYEE ONBOARDING / CONFIGURATION
  // ==========================================
  const handleAddEmployee = (empInput: Omit<User, "id" | "createdDate" | "updatedDate" | "passwordHash">) => {
    const newId = createId("U");
    const freshUser: User = {
      ...empInput,
      id: newId,
      passwordHash: `${empInput.fullName.toLowerCase().split(" ")[0]}123`,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    setUsers((prev) => [...prev, freshUser]);

    const admin = users.find((u) => u.id === "U-1") || users[0];
    triggerSystemAudit(
      admin.id,
      admin.fullName,
      "Account Creation",
      "User",
      newId,
      `Administrator Sarah Jenkins provisioned user account for ${freshUser.fullName} (Department: ${freshUser.department}).`
    );

    // Welcome alerts setup
    triggerSystemNotification(
      newId,
      "Account Creation",
      "Operations Credentials Generated",
      `Welcome to support workspace, ${freshUser.fullName}! Click SWITCH active user in header to test views.`
    );
  };

  const handleUpdateEmployee = (id: string, updates: Partial<User>) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates, updatedDate: new Date().toISOString() } : u))
    );

    const targetUser = users.find((u) => u.id === id);
    const admin = users.find((u) => u.id === "U-1") || users[0];

    if (targetUser) {
      triggerSystemAudit(
        admin.id,
        admin.fullName,
        "Account Status Change",
        "User",
        id,
        `Sarah Jenkins updated variables on operator ${targetUser.fullName}: ${JSON.stringify(updates)}.`
      );
    }
  };

  // ==========================================
  // TICKET ACTIONS & ASSIGNMENTS
  // ==========================================
  const handleAssignTicket = (ticketId: string, employeeId: string | null, priority?: TicketPriority) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          const freshStatus = employeeId ? "Assigned" : "New";
          const freshPriority = priority || t.priority;
          
          let commentMsg = "";
          if (employeeId) {
            const empUser = users.find((u) => u.id === employeeId);
            commentMsg = `Assigned Support Technician: ${empUser?.fullName || "Engineer"}.`;
          } else {
            commentMsg = `Ticket unassigned and placed back in main dispatcher queue.`;
          }

          if (priority && priority !== t.priority) {
            commentMsg += ` Status priority overridden to ${priority} Urgency level.`;
          }

          return {
            ...t,
            assignedTo: employeeId,
            priority: freshPriority,
            status: freshStatus,
            updatedDate: new Date().toISOString(),
            history: [
              ...t.history,
              {
                timestamp: new Date().toISOString(),
                status: freshStatus,
                updatedBy: "Sarah Jenkins",
                comment: commentMsg,
              },
            ],
          };
        }
        return t;
      })
    );

    const ticket = tickets.find((t) => t.id === ticketId);
    const admin = users.find((u) => u.id === "U-1") || users[0];

    if (ticket) {
      triggerSystemAudit(
        admin.id,
        admin.fullName,
        "Ticket Update",
        "Ticket",
        ticketId,
        `Administrator Sarah Jenkins updated dispatcher parameters on Case: ${ticket.subject} (Assigned: ${employeeId || "Queue"}).`
      );

      if (employeeId) {
        // Notify tech
        triggerSystemNotification(
          employeeId,
          "Ticket Assignment",
          "Assigned Support Case Dispatch",
          `Support case ${ticketId} '${ticket.subject}' assigned to your operations queue by Administrator.`
        );
      }
    }
  };

  const handleClientSubmitTicket = (newTicketInput: {
    subject: string;
    description: string;
    category: any;
    priority: TicketPriority;
  }) => {
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
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      history: [
        {
          timestamp: new Date().toISOString(),
          status: "New",
          updatedBy: targetCli.contactPerson,
          comment: `Client ticket generated through web portal by Representative ${targetCli.contactPerson}.`,
        },
      ],
    };

    setTickets((prev) => [freshTicket, ...prev]);

    // Audit logs & Administrator notifications
    triggerSystemAudit(
      targetCli.id,
      targetCli.contactPerson,
      "Ticket Creation",
      "Ticket",
      newId,
      `Client group ${targetCli.companyName} registered support case: ${freshTicket.subject}.`
    );

    // Notify administration queue
    const admin = users.find((u) => u.id === "U-1") || users[0];
    triggerSystemNotification(
      admin.id,
      "Ticket Update",
      `New Ticket Case: ${newId}`,
      `Support request submitted by ${targetCli.companyName}: '${freshTicket.subject}'. Open dispatch dashboard immediately.`
    );

    // Notify Client acknowledgement
    triggerSystemNotification(
      targetCli.id,
      "Ticket Update",
      `SLA Acknowledgement Dispatched`,
      `We have safely registered case ${newId}. Our technicians will begin troubleshooting immediately under SLA agreements.`
    );
  };

  const handleUpdateTicketStatus = (
    ticketId: string,
    status: TicketStatus,
    notes?: string,
    resolution?: string
  ) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          const freshHistory = [
            ...t.history,
            {
              timestamp: new Date().toISOString(),
              status,
              updatedBy: currentUser?.fullName || "Engineer David Kim",
              comment: notes || `Diagnostic metrics updated on support channel. Status is now ${status}.`,
            },
          ];

          return {
            ...t,
            status,
            resolutionSummary: resolution || t.resolutionSummary,
            resolutionDate: resolution ? new Date().toISOString() : t.resolutionDate,
            employeeNotes: notes || t.employeeNotes,
            updatedDate: new Date().toISOString(),
            history: freshHistory,
          };
        }
        return t;
      })
    );

    const ticket = tickets.find((t) => t.id === ticketId);
    if (ticket) {
      const activeTech = currentUser || users.find((u) => u.id === "U-3") || users[0];
      
      triggerSystemAudit(
        activeTech.id,
        activeTech.fullName,
        "Ticket Update",
        "Ticket",
        ticketId,
        `Technician David Kim transitioned operations status of Ticket ${ticketId} to ${status}.`
      );

      // Notify clients
      triggerSystemNotification(
        ticket.clientId,
        "Ticket Update",
        `Case status updated: ${status}`,
        `Supervisor technician updated case ${ticketId} status to '${status}'. ${resolution ? "Please complete resolution steps in portal." : "Review logs."}`
      );
    }
  };

  const handleConfirmResolutionClosure = (ticketId: string, rating: number, notes?: string) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          return {
            ...t,
            status: "Closed",
            satisfactionRating: rating,
            satisfactionNotes: notes,
            updatedDate: new Date().toISOString(),
            history: [
              ...t.history,
              {
                timestamp: new Date().toISOString(),
                status: "Closed",
                updatedBy: activeClient?.contactPerson || "Client representative",
                comment: `Client confirmed resolution rating service quality: ${rating}/5 stars. Notes: "${notes || "No notes"}". support ticket officially closed.`,
              },
            ],
          };
        }
        return t;
      })
    );

    const ticket = tickets.find((t) => t.id === ticketId);
    if (ticket) {
      const targetCli = activeClient || clients[0];
      
      triggerSystemAudit(
        targetCli.id,
        targetCli.contactPerson,
        "Ticket Update",
        "Ticket",
        ticketId,
        `Client confirmed resolution on SLA Ticket ${ticketId}. Feedback: ${rating} stars generated. Logging closed case.`
      );

      // Notify operations engineer
      if (ticket.assignedTo) {
        triggerSystemNotification(
          ticket.assignedTo,
          "Ticket Update",
          `Client Closed Support case ${ticketId}`,
          `Good job! Client confirmed resolution on case ${ticketId} with quality rating of ${rating}/5 stars.`
        );
      }
    }
  };

  // ==========================================
  // TASK INTERNAL MANAGEMENT OPERATIONS
  // ==========================================
  const handleAssignTask = (taskInput: Omit<Task, "id" | "createdDate" | "updatedDate" | "escalationStatus" | "assignedBy">) => {
    const newId = `TSK-${Math.floor(200 + Math.random() * 90)}`;
    const admin = users.find((u) => u.id === "U-1") || users[0];

    const freshTask: Task = {
      ...taskInput,
      id: newId,
      assignedBy: admin.id,
      escalationStatus: "No",
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    setTasks((prev) => [freshTask, ...prev]);

    triggerSystemAudit(
      admin.id,
      admin.fullName,
      "Task Assignment",
      "Task",
      newId,
      `Administrator Sarah Jenkins registered SLA operational task ${newId} with assignee node: ${taskInput.assignedTo}.`
    );

    // Send notifications to employee
    triggerSystemNotification(
      taskInput.assignedTo,
      "Task Assignment",
      "New Internal Task Dispatched",
      `Task ${newId} '${taskInput.title}' assigned by Administrator. Target completion date: ${taskInput.dueDate}.`
    );
  };

  const handleUpdateTaskStatus = (taskId: string, status: TaskStatus, notes?: string) => {
    setTasks((prev) =>
      prev.map((tk) => {
        if (tk.id === taskId) {
          const isDone = status === "Completed";
          return {
            ...tk,
            status,
            completionNotes: notes || tk.completionNotes,
            completionDate: isDone ? new Date().toISOString() : tk.completionDate,
            updatedDate: new Date().toISOString(),
          };
        }
        return tk;
      })
    );

    const taskObj = tasks.find((t) => t.id === taskId);
    const activeTech = currentUser || users.find((u) => u.id === "U-3") || users[0];

    if (taskObj) {
      triggerSystemAudit(
        activeTech.id,
        activeTech.fullName,
        "Task Update",
        "Task",
        taskId,
        `Technician David Kim transitioned internal workload task ${taskId} to ${status}.`
      );

      // If completed, notify supervising manager robert
      if (status === "Completed") {
        const mgrUser = users.find((u) => u.id === "U-2") || users[0];
        triggerSystemNotification(
          mgrUser.id,
          "Task Reminder",
          "Task Verification Completed",
          `Operator ${activeTech.fullName} logged completion notes on SLA Task ${taskId}: "${notes || "No notes"}". Audit ready.`
        );
      }
    }
  };

  if (!isAuthenticated) {
    return (
      <LoginPage
        users={users}
        clients={clients}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-800 pb-12 font-sans">
      
      {/* Global Interactive Header */}
      <Header
        currentUser={currentUser}
        activeClient={activeClient}
        clients={clients}
        systemUsers={users}
        notifications={notifications}
        auditLogs={auditLogs}
        sentEmails={sentEmails}
        onSwitchRole={handleSwitchRole}
        onMarkNotificationRead={handleMarkNotificationRead}
        onClearNotifications={handleClearNotifications}
        onLogout={handleLogout}
      />

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
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onAssignTicket={handleAssignTicket}
            onAssignTask={handleAssignTask}
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

        {activeRole === "Client" && activeClient && (
          <ClientDashboard
            activeClient={activeClient}
            tickets={tickets}
            notifications={notifications}
            onSubmitTicket={handleClientSubmitTicket}
            onConfirmResolution={handleConfirmResolutionClosure}
          />
        )}

      </main>
    </div>
  );
}
