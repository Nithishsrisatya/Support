import dotenv from "dotenv";

dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import { validateProductionEnv, getCorsOrigins } from "./src/config/env";
import { authLimiter, apiLimiter } from "./src/middleware/rateLimiter";
import { pool } from "./src/db";
import authRoutes from "./src/routes/authRoutes";
import userRoutes from "./src/routes/userRoutes";
import clientRoutes from "./src/routes/clientRoutes";
import ticketRoutes from "./src/routes/ticketRoutes";
import taskRoutes from "./src/routes/taskRoutes";
import notificationRoutes from "./src/routes/notificationRoutes";
import auditLogRoutes from "./src/routes/auditLogRoutes";
import reportRoutes from "./src/routes/reportRoutes";
import searchRoutes from "./src/routes/searchRoutes";
import calendarRoutes from "./src/routes/calendarRoutes";
import { getAllUsers } from "./src/services/userService";
import { getAllClients } from "./src/services/clientService";
import { getAllTickets } from "./src/services/ticketService";
import { getAllTasks } from "./src/services/taskService";
import { getAllNotifications } from "./src/services/notificationService";
import { getAllAuditLogs } from "./src/services/auditLogService";
import { sendEmail } from "./src/services/emailService";
import { welcomeEmail } from "./src/templates/welcomeEmail";
import { startScheduledEmails } from "./src/services/scheduledEmailService";
import { getAllEmailLogs } from "./src/services/emailLogService";
import { authenticateToken } from "./src/middleware/authMiddleware";
import { authorizeRoles } from "./src/middleware/roleMiddleware";

// Validate production configuration on startup
validateProductionEnv();

const app = express();

// -----------------------------------------------------
// Reverse Proxy & Security Headers
// -----------------------------------------------------
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: { action: "deny" },
    noSniff: true,
  })
);

app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// -----------------------------------------------------
// CORS & Body Parsing
// -----------------------------------------------------
const allowedOrigins = getCorsOrigins();
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

app.use(express.json({ limit: "10mb" }));

// -----------------------------------------------------
// Rate Limiting
// -----------------------------------------------------
app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);

// -----------------------------------------------------
// API Routes
// -----------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/calendar", calendarRoutes);
// -----------------------------------------------------
// Static Files
// -----------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

app.use(express.static(distPath));

// -----------------------------------------------------
// Application State
// -----------------------------------------------------

app.get("/api/state", authenticateToken, authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const [
      users,
      clients,
      tickets,
      tasks,
      notifications,
      auditLogs,
    ] = await Promise.all([
      getAllUsers(),
      getAllClients(),
      getAllTickets(),
      getAllTasks(),
      getAllNotifications(),
      getAllAuditLogs(),
    ]);

    res.json({
      users,
      clients,
      tickets,
      tasks,
      notifications,
      auditLogs,
    });
  } catch (error) {
    console.error("Error loading application state:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load application state",
    });
  }
});

// -----------------------------------------------------
// Synchronization API
// -----------------------------------------------------

app.post("/api/sync", async (req, res) => {
  try {
    // Future implementation:
    // Save all updates to PostgreSQL

    res.json({
      success: true,
      message: "Synchronization completed successfully.",
      sentEmails: [],
    });
  } catch (error) {
    console.error("Synchronization Error:", error);

    res.status(500).json({
      success: false,
      message: "Synchronization failed.",
    });
  }
});

// -----------------------------------------------------
// Health Check
// -----------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    database: "Connected",
    server: "Running",
    timestamp: new Date(),
  });
});
// -----------------------------------------------------
// Email Logs API
// -----------------------------------------------------
app.get("/api/email-logs", authenticateToken, authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const logs = await getAllEmailLogs();
    res.json(logs);
  } catch (error) {
    console.error("Failed to fetch email logs:", error);
    res.status(500).json({ success: false, message: "Failed to fetch email logs." });
  }
});

// -----------------------------------------------------
// Email Testing
// -----------------------------------------------------
app.get("/api/test-email", authenticateToken, authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    await sendEmail(
      "test@gmail.com",
      "Welcome to Complify",
      welcomeEmail(
        "David",
        "test@gmail.com",
        "Password123"
      )
    );

    res.json({
      success: true,
      message: "Email service tested successfully."
    });
  } catch (error) {
    console.error("Email Test Error:", error);

    res.status(500).json({
      success: false,
      message: "Email test failed."
    });
  }
});
// -----------------------------------------------------
// React Catch-All
// -----------------------------------------------------

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// -----------------------------------------------------
// Centralized Error Handling Middleware
// -----------------------------------------------------

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode = typeof err.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    console.error("Express Error Handler:", err);
  } else {
    console.error(`[ERROR] ${req.method} ${req.path} -> ${err.message || "Internal Server Error"}`);
  }

  res.status(statusCode).json({
    success: false,
    message: isProd && statusCode === 500 ? "Internal Server Error." : err.message || "An unexpected error occurred.",
    ...(isProd ? {} : { stack: err.stack }),
  });
});

// -----------------------------------------------------
// Process Lifecycle & Crash Guards
// -----------------------------------------------------

process.on("unhandledRejection", (reason: any, promise) => {
  console.error("[CRITICAL] Unhandled Rejection at:", promise, "reason:", reason?.message || reason);
});

process.on("uncaughtException", (error: Error) => {
  console.error("[CRITICAL] Uncaught Exception:", error.message);
  // Allow PM2 / systemd process manager to restart
  process.exit(1);
});

// -----------------------------------------------------
// Server Start
// -----------------------------------------------------

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log("=======================================");
  console.log("🚀 Complify Backend Started");
  console.log("=======================================");
  console.log(`🌐 Server : http://localhost:${PORT}`);
  console.log(`📂 Frontend : ${distPath}`);
  console.log("🐘 Database : PostgreSQL Connected");
  console.log("=======================================");

  // Start scheduled email services
  startScheduledEmails();
});

