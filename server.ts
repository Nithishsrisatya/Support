import express from "express";
import path from "path";
import fs from "fs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
app.use(express.json({ limit: "50mb" }));

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), "database.json");

interface DBState {
  users: any[];
  clients: any[];
  tickets: any[];
  tasks: any[];
  notifications: any[];
  auditLogs: any[];
  sentEmails: any[];
}

// Helper to seed initial structure if file not present
const getSeedState = () => {
  // We'll read directly from our pre-defined seeds or output a default structure
  // To avoid runtime import complexities in compiled CJS, we define a fallback or read directly
  return {
    users: [
      {
        id: "U-1",
        fullName: "Sarah Jenkins",
        email: "sarah@workflow.com",
        passwordHash: "sarah123",
        role: "Administrator",
        department: "Administration",
        managerId: null,
        status: "Active",
        createdDate: "2026-01-10T09:00:00Z",
        updatedDate: "2026-01-10T09:00:00Z",
      },
      {
        id: "U-2",
        fullName: "Robert Chen",
        email: "robert@workflow.com",
        passwordHash: "robert123",
        role: "Manager",
        department: "Support & Operations",
        managerId: null,
        status: "Active",
        createdDate: "2026-01-15T11:30:00Z",
        updatedDate: "2026-01-15T11:30:00Z",
      },
      {
        id: "U-3",
        fullName: "David Kim",
        email: "david@workflow.com",
        passwordHash: "david123",
        role: "Employee",
        department: "Support & Operations",
        managerId: "U-2",
        status: "Active",
        createdDate: "2026-01-20T08:15:00Z",
        updatedDate: "2026-01-20T08:15:00Z",
      }
    ],
    clients: [
      {
        id: "C-1",
        companyName: "TechCorp Pro",
        contactPerson: "Alice Mercer",
        email: "alice@techcorp.com",
        phoneNumber: "+1 (555) 123-4567",
        status: "Active",
        createdDate: "2026-02-01T10:00:00Z",
        updatedDate: "2026-02-01T10:00:00Z",
      },
      {
        id: "C-2",
        companyName: "Quantum Solutions",
        contactPerson: "Frank Vance",
        email: "frank@quantum.com",
        phoneNumber: "+1 (555) 987-6543",
        status: "Active",
        createdDate: "2026-02-15T14:20:00Z",
        updatedDate: "2026-02-15T14:20:00Z",
      }
    ],
    tickets: [
      {
        id: "TKT-3104",
        subject: "AWS VPC Tunnel Failover Disruption",
        description: "VPC tunnel fails automatically under peak traffic, throwing socket exception routes. Need custom failback parameters set up.",
        category: "Technical Issue",
        priority: "Critical",
        status: "Assigned",
        assignedTo: "U-3",
        clientId: "C-2",
        createdDate: "2026-06-15T10:30:00Z",
        updatedDate: "2026-06-15T11:15:00Z",
        history: [
          {
            timestamp: "2026-06-15T10:30:00Z",
            status: "New",
            updatedBy: "Frank Vance",
            comment: "Corporate client representative Frank Vance submitted ticket case.",
          },
          {
            timestamp: "2026-06-15T11:15:00Z",
            status: "Assigned",
            updatedBy: "Sarah Jenkins",
            comment: "System administrator assigned case to Support Engineer David Kim.",
          }
        ]
      }
    ],
    tasks: [
      {
        id: "TSK-201",
        title: "Review Quantum Solutions SLA Parameters",
        description: "Audit packet transmission logs on failover node and determine response guidelines under contract section 4.2.",
        assignedTo: "U-3",
        assignedBy: "U-1",
        status: "Pending",
        priority: "High",
        dueDate: "2026-06-20",
        createdDate: "2026-06-15T11:20:00Z",
        updatedDate: "2026-06-15T11:20:00Z",
        escalationStatus: "No"
      }
    ],
    notifications: [],
    auditLogs: [
      {
        id: "LOG-901",
        timestamp: "2026-06-15T11:15:00Z",
        userId: "U-1",
        fullName: "Sarah Jenkins",
        action: "Ticket Update",
        entityType: "Ticket",
        entityId: "TKT-3104",
        description: "Administrator Sarah Jenkins updated dispatcher parameters on Case: AWS VPC Tunnel Failover Disruption (Assigned: U-3)."
      }
    ],
    sentEmails: [
      {
        id: "EM-101",
        timestamp: "2026-06-15T10:30:00Z",
        from: "support@yourdomain.com",
        to: "frank@quantum.com",
        subject: "SLA Acknowledgement Dispatched: [TKT-3104]",
        body: "Hello Frank Vance,\n\nWe have registered support ticket AWS VPC Tunnel Failover Disruption. Our engineers are reviewing it according to priority parameters.",
        status: "Delivered (Simulation)"
      }
    ]
  };
};

// Database I/O Layer
const readDB = (): DBState => {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const seed = getSeedState();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
      return seed;
    }
    const data = fs.readFileSync(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database file, using fallback:", err);
    return getSeedState();
  }
};

const writeDB = (state: DBState) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing database file:", err);
  }
};

// SMTP Nodemailer Transporter Helper
const sendRealEmail = async (to: string, subject: string, body: string): Promise<boolean> => {
  try {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 2525;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM_EMAIL || "support@yourdomain.com";

    if (!user || !pass) {
      console.log(`[SMTP-Simulation] No SMTP credentials in env. Logging mail to: ${to}`);
      return false;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      text: body,
      html: body.split("\n").join("<br />")
    });

    console.log(`[SMTP-Success] Live email dispatched successfully to: ${to}`);
    return true;
  } catch (error) {
    console.error("[SMTP-Error] Failed to send real email. Error context:", error);
    return false;
  }
};

// ==========================================
// REST SERVICES
// ==========================================

// 1. Get database state
app.get("/api/state", (req, res) => {
  const state = readDB();
  res.json(state);
});

// 2. Synchronize database state and send emails
app.post("/api/sync", async (req, res) => {
  const clientState = req.body as DBState;
  const currentState = readDB();

  // Validate incoming structure
  if (!clientState || !clientState.tickets) {
    return res.status(400).json({ error: "Invalid state structure" });
  }

  // Detect newly added tickets or updates to trigger automated emails
  const newEmailsToLog: any[] = [];

  // Compare tickets for assignments or status updates
  clientState.tickets.forEach(async (newTicket) => {
    const oldTicket = currentState.tickets.find((t) => t.id === newTicket.id);
    
    // CASE A: Freshly filed ticket
    if (!oldTicket) {
      const clientObj = clientState.clients.find((c) => c.id === newTicket.clientId);
      if (clientObj) {
        const subjectMsg = `SLA Ticket Registered: [${newTicket.id}] - ${newTicket.subject}`;
        const bodyMsg = `Hello ${clientObj.contactPerson},\n\n` +
          `Your support case "${newTicket.subject}" has been successfully filed in our helpdesk.\n` +
          `Details:\n` +
          `- Urgency Level: ${newTicket.priority}\n` +
          `- Department Category: ${newTicket.category}\n` +
          `- Case Reference ID: ${newTicket.id}\n\n` +
          `Our support technicians have been notified and will prioritize investigation according to your SLA agreements.\n\n` +
          `Best regards,\n` +
          `SLA Support Workflow Desk`;

        newEmailsToLog.push({
          id: `EM-${Math.floor(1000 + Math.random() * 9000)}`,
          timestamp: new Date().toISOString(),
          from: process.env.SMTP_FROM_EMAIL || "support@yourdomain.com",
          to: clientObj.email,
          subject: subjectMsg,
          body: bodyMsg,
          status: "Pending Transmission"
        });
      }
    }
    // CASE B: Ticket status transitioned (assigned or resolved by operator)
    else if (oldTicket.status !== newTicket.status || oldTicket.assignedTo !== newTicket.assignedTo) {
      const clientObj = clientState.clients.find((c) => c.id === newTicket.clientId);
      const assigneeObj = clientState.users.find((u) => u.id === newTicket.assignedTo);

      if (newTicket.status === "Assigned" && oldTicket.assignedTo !== newTicket.assignedTo && assigneeObj) {
        // Mail assigned engineer
        const subjectMsg = `SLA Support Case Assignment: [${newTicket.id}]`;
        const bodyMsg = `Hello ${assigneeObj.fullName},\n\n` +
          `You have been assigned to SLA Support Case ${newTicket.id} "${newTicket.subject}".\n\n` +
          `Description:\n` +
          `"${newTicket.description}"\n\n` +
          `Please log into your operator dashboard, review logs, and update progression updates.\n\n` +
          `Workflow Operations Desk`;

        newEmailsToLog.push({
          id: `EM-${Math.floor(1000 + Math.random() * 9000)}`,
          timestamp: new Date().toISOString(),
          from: process.env.SMTP_FROM_EMAIL || "support@yourdomain.com",
          to: assigneeObj.email,
          subject: subjectMsg,
          body: bodyMsg,
          status: "Pending Transmission"
        });
      }

      if (newTicket.status === "Resolved" && oldTicket.status !== "Resolved" && clientObj) {
        // Mail original client with resolution summary
        const subjectMsg = `Case Resolution Update: [${newTicket.id}]`;
        const bodyMsg = `Hello ${clientObj.contactPerson},\n\n` +
          `We are pleased to inform you that Case Reference ${newTicket.id} "${newTicket.subject}" has been marked to Resolved.\n\n` +
          `Formal Resolution Brief from Support team:\n` +
          `"${newTicket.resolutionSummary || "Diagnostic standard tests completed successfully"}"\n\n` +
          `Please sign into the helpdesk portal, rate support quality, and submit formal closure.\n\n` +
          `Best regards,\n` +
          `SLA Support Workflow Desk`;

        newEmailsToLog.push({
          id: `EM-${Math.floor(1000 + Math.random() * 9000)}`,
          timestamp: new Date().toISOString(),
          from: process.env.SMTP_FROM_EMAIL || "support@yourdomain.com",
          to: clientObj.email,
          subject: subjectMsg,
          body: bodyMsg,
          status: "Pending Transmission"
        });
      }
    }
  });

  // Handle tasks assignments
  clientState.tasks.forEach((newTask) => {
    const oldTask = currentState.tasks.find((tk) => tk.id === newTask.id);
    if (!oldTask) {
      const assigneeObj = clientState.users.find((u) => u.id === newTask.assignedTo);
      if (assigneeObj) {
        const subjectMsg = `New Action Item Dispatched: [${newTask.id}]`;
        const bodyMsg = `Hello ${assigneeObj.fullName},\n\n` +
          `A workflow task "${newTask.title}" has been assigned to you with a deadline of ${newTask.dueDate}.\n\n` +
          `Priority Level: ${newTask.priority}\n` +
          `Description/SLA Actions:\n` +
          `"${newTask.description}"\n\n` +
          `Please log in and tick off the task when completed.\n\n` +
          `Management Team Workflow Dispatcher`;

        newEmailsToLog.push({
          id: `EM-${Math.floor(1000 + Math.random() * 9000)}`,
          timestamp: new Date().toISOString(),
          from: process.env.SMTP_FROM_EMAIL || "support@yourdomain.com",
          to: assigneeObj.email,
          subject: subjectMsg,
          body: bodyMsg,
          status: "Pending Transmission"
        });
      }
    }
  });

  // Attempt real transmissions and update status flags
  for (const logEmail of newEmailsToLog) {
    const success = await sendRealEmail(logEmail.to, logEmail.subject, logEmail.body);
    logEmail.status = success ? "Dispatched" : "Simulated Outbox (No SMTP secrets)";
  }

  // Prepend current logged logs to the global email listing
  const currentSentEmails = currentState.sentEmails || [];
  const updatedSentEmails = [...newEmailsToLog, ...currentSentEmails].slice(0, 100);

  // Write finalized dynamic states
  const consolidatedState: DBState = {
    users: clientState.users,
    clients: clientState.clients,
    tickets: clientState.tickets,
    tasks: clientState.tasks,
    notifications: clientState.notifications,
    auditLogs: clientState.auditLogs,
    sentEmails: updatedSentEmails
  };

  writeDB(consolidatedState);
  res.json(consolidatedState);
});

// Start dev or production listener
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server fully booting on port ${PORT}`);
  });
}

start();
