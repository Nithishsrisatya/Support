# Complify Support

A modern, role-based support, ticket, task, client, deadline, notification, reporting, and email management web application.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [User Roles & Access Control](#user-roles--access-control)
- [Deadline Management System](#deadline-management-system)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Local Setup](#installation--local-setup)
- [Environment Configuration](#environment-configuration)
- [Database Migrations](#database-migrations)
- [Security Hardening](#security-hardening)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Production Deployment](#production-deployment)

---

## Overview

**Complify Support** is a role-based customer support and task lifecycle management platform. It enables organizations to streamline client support requests, assign and track internal tasks, monitor operational SLAs, visualize deadlines on an interactive calendar, deliver automated email digests, and enforce strict role-based data isolation across administrators, managers, employees, and clients.

---

## Key Features

- **Authentication & JWT Authorization:** Secure token-based authentication with expiration controls, forced password reset capability, and secure password reset links with single-use SHA-256 hashed tokens.
- **Role-Based Access Control (RBAC):** Distinct permissions and views for Administrators, Managers, Employees, and Clients.
- **Client Management:** Complete CRUD operations for client organizations, dedicated client portals, and contact profile self-service editing.
- **Employee & User Management:** User directory with department tracking, manager-to-employee reporting structures, status management, and workload distribution.
- **Ticket Lifecycle Management:** Comprehensive ticket creation, categorization, priority levels, assignment, status workflow (`New`, `Assigned`, `In Progress`, `Pending`, `Resolved`, `Closed`), SLA tracking, and resolution timestamps.
- **Task Lifecycle Management:** Internal task delegation, category grouping, priority levels, sub-assignments, status workflows, and completion auditing.
- **Comments & Audit Logging:** Threaded discussion on tickets and tasks, internal notes, and detailed system-wide audit logging.
- **Attachment Management:** Secure multi-file uploads with MIME validation, file size limits, and path traversal protection for ticket and task attachments.
- **Interactive Deadline Calendar:** Role-aware calendar displaying tickets and tasks by due date with color-coded urgency indicators.
- **Automated Deadline Notifications:** Scheduled background jobs evaluating due dates and dispatching email and in-app alerts for upcoming, due today, and overdue items.
- **Weekly Pending-Work Summaries:** Automated Monday morning workload digests sent to employees and managers summarizing pending and overdue responsibilities.
- **Reports & Dashboard Analytics:** Visual KPIs, ticket and task status breakdowns, priority distribution charts, employee workload tables, and exportable summary reports.
- **Email Infrastructure & Logging:** Centralized transactional email dispatch via SMTP with development preview fallback and full database email logging.

---

## User Roles & Access Control

| Role | Capabilities |
|---|---|
| **Administrator** | Full system visibility. Manages users, clients, system settings, global tickets, global tasks, audit logs, and manual scheduler triggers. |
| **Manager** | Oversees departmental workloads and assigned direct reports. Tracks team tickets and tasks, reassigns work, reviews reports, and receives team workload digests. |
| **Employee** | Manages assigned tickets and tasks, updates progress, logs comments, uploads attachments, views personal deadline calendar, and receives task reminders. |
| **Client** | Submits support tickets, tracks ticket status, views assigned support updates, communicates via ticket comments, uploads attachments, and manages client profile details. Client data is strictly isolated to the authenticated client organization. |

---

## Deadline Management System

The deadline engine provides automated tracking and proactive alerts across the entire organization:

- **Urgency Levels:**
  - **Upcoming:** Due date is more than 1 day in the future (standard badge styling).
  - **Due Tomorrow:** Due date is tomorrow (triggers advance reminder email and in-app notification).
  - **Due Today:** Due date matches the current calendar day (triggers priority reminder).
  - **Overdue:** Past the designated due date (triggers overdue alerts and manager escalation).
  - **Completed / Terminal Work:** Completed tasks and Resolved/Closed tickets are strictly excluded from all deadline alerts.
- **Interactive Calendar:** Role-scoped calendar view color-coding items by deadline urgency (Green = Completed, Blue = Upcoming, Yellow = Due Tomorrow, Orange = Due Today, Red = Overdue).
- **Weekly Workload Summary:** Every Monday at 08:00 AM, the scheduler generates:
  - **Employee Digest:** Breakdown of overdue, due this week, and upcoming assigned work.
  - **Manager Digest:** Aggregate team metrics and individual employee workload breakdowns.
  - **Duplicate Prevention:** Database-backed deduplication table ensures zero duplicate digests per calendar week.

---

## Technology Stack

- **Frontend:**
  - React 19 (SPA architecture)
  - TypeScript
  - Vite
  - Tailwind CSS
  - Lucide React (Icons)
  - Recharts (Data visualization & dashboard charts)
  - Framer Motion (Transitions & animations)
- **Backend:**
  - Node.js & Express
  - TypeScript (via TSX in development, ESBuild in production)
  - PostgreSQL (`pg` connection pool with SSL support)
  - JSON Web Tokens (`jsonwebtoken`)
  - Password Hashing (`bcrypt`)
  - Security (`helmet`, `express-rate-limit`, `cors`)
  - File Uploads (`multer`)
  - Cron Scheduling (`node-cron`)
  - Email Services (`nodemailer`)

---

## Project Structure

```text
├── DEPLOYMENT.md             # Production operations & deployment guide
├── README.md                 # Project documentation
├── package.json              # Dependencies and npm scripts
├── server.ts                 # Express API server entry point & static host
├── vite.config.ts            # Vite build configuration
├── tailwind.config.js        # Tailwind CSS styling configuration
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore configuration
├── public/                   # Static public assets
├── uploads/                  # Persistent runtime storage for ticket attachments (git-ignored)
└── src/
    ├── App.tsx               # Main application routing and shell
    ├── main.tsx              # React client entry point
    ├── types.ts              # TypeScript type definitions and interfaces
    ├── migrate.ts            # PostgreSQL schema definitions and migrations
    ├── db.ts                 # Database pool connection configuration
    ├── config/               # Environment variable validation and configuration
    ├── middleware/           # Auth, role authorization, and rate limiting middleware
    ├── routes/               # Express API route controllers
    ├── services/             # Core business logic and database service layers
    ├── templates/            # HTML transactional email templates
    ├── utils/                # JWT utilities, helpers, and formatters
    └── components/           # React UI components, dashboards, modals, and charts
```

---

## Getting Started

### Prerequisites

- **Node.js:** 20 LTS or higher
- **npm:** 10+
- **PostgreSQL:** 15+ running locally or on a cloud provider

### Installation & Local Setup

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Copy the `.env.example` file to create your local `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and configure your PostgreSQL database credentials, JWT secret, and optional SMTP settings.

3. **Run Database Migrations:**
   Initialize all database tables, foreign keys, and indexes:
   ```bash
   npm run migrate
   ```

4. **Start the Development Servers:**
   - In terminal 1, run the backend API server:
     ```bash
     npm run server
     ```
   - In terminal 2, run the Vite frontend development server:
     ```bash
     npm run dev
     ```

---

## Environment Configuration

All environment configuration is validated at runtime. A comprehensive template is provided in [`.env.example`](.env.example).

Key configuration groups:
- **Runtime:** `NODE_ENV`, `PORT`
- **Database:** `DATABASE_URL` (or granular `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL`, `DB_POOL_MAX`)
- **Authentication:** `JWT_SECRET`, `JWT_EXPIRES_IN`
- **CORS & Domain:** `FRONTEND_URL`, `CORS_ORIGIN`
- **SMTP Email:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- **Storage & Limits:** `UPLOAD_DIR`, `AUTH_RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_MAX`, `API_RATE_LIMIT_MAX`

> **Note:** Never commit the `.env` file or sensitive credentials to version control.

---

## Database Migrations

Database tables and indexes are managed via [`src/migrate.ts`](src/migrate.ts). To apply migrations:

```bash
npm run migrate
```

This ensures all 16 relational tables (`users`, `clients`, `tickets`, `tasks`, `ticket_comments`, `task_history`, `notifications`, `email_logs`, `audit_logs`, `password_reset_tokens`, `deadline_notifications`, `weekly_pending_work_notifications`, etc.) and their supporting indexes are up to date.

---

## Security Hardening

Complify Support incorporates multi-layered security controls:

- **Password Security:** All passwords hashed with `bcrypt` (10 salt rounds). Single-use 256-bit SHA-256 tokens for password resets with expiration checking.
- **JWT Protection:** Enforces strong, high-entropy secrets in production; prevents token replay and unauthorized escalation.
- **Rate Limiting:** Granular rate limiting on sensitive routes (`/api/auth/*` max 15 requests / 15m; `/api/tickets/upload` max 50 requests / 15m; general API max 500 requests / 15m).
- **Security Headers:** HTTP headers configured via `helmet` (Strict Content Security Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).
- **CORS Allowlist:** Origin verification preventing unauthorized cross-origin requests.
- **Input Sanitization & Parameterized Queries:** All PostgreSQL queries use parameterized arguments (`$1`, `$2`) to prevent SQL injection.
- **IDOR Protection:** Strict role and tenant checking ensuring clients only access their own organization's tickets, attachments, and profile data.

---

## Testing & Quality Assurance

The codebase includes automated test suites covering all critical subsystems:

- Step 6A Secure Password Reset & Token Hashing
- Step 6B Server Security Hardening & Rate Limiting
- Step 6C Environment Configuration & Secrets Validation
- Phase 1 Deadline Notification Engine
- Phase 2 Interactive Deadline Calendar
- Phase 3 Weekly Pending-Work Reminders
- Task & Ticket Lifecycle Workflows
- RBAC & IDOR Data Isolation
- Attachment Security & MIME Validation

### Code Quality & Build Verification

```bash
# Static TypeScript typecheck across all frontend and backend code
npm run typecheck

# Full production build verification (Vite SPA + ESBuild server bundle)
npm run build
```

---

## Production Deployment

For detailed production deployment instructions including Nginx reverse proxy configuration, PM2 process management, SSL certificate provisioning, and automated backup strategies, refer to the [Production Deployment Guide (`DEPLOYMENT.md`)](DEPLOYMENT.md).

```bash
# Build production bundle
npm run build

# Start production server
npm start
```

