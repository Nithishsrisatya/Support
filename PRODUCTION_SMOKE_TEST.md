# Complify Support — Production Smoke Test Plan

This document outlines the mandatory manual verification checklist to execute against a live deployment of **Complify Support** (e.g. on Render, VPS, or staging) prior to opening the system to end users.

> [!NOTE]
> All credentials in this plan are placeholders. Never record production passwords, JWT tokens, or API keys in this document.

---

## Pre-Flight Checklist

- [ ] PostgreSQL 15+ database is online and reachable.
- [ ] Environment variables configured (`DATABASE_URL` / `DB_*`, `JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGIN`, `BREVO_API_KEY` or `SMTP_*`, `INITIAL_ADMIN_PASSWORD`).
- [ ] Database migrations applied (`npm run migrate`).
- [ ] Initial Administrator seeded via `INITIAL_ADMIN_PASSWORD`.
- [ ] Production build compiled (`npm run build`).
- [ ] Node process manager running (`pm2` or Render web service).

---

## Smoke Test Verification Matrix (25 Key Workflows)

### 1. Login
- **Action**: Navigate to `FRONTEND_URL/login`. Enter Administrator credentials (`admin@example.com` / `INITIAL_ADMIN_PASSWORD`). Submit login form.
- **Expected Result**:
  - HTTP 200 returned from `POST /api/auth/login`.
  - JWT token and user profile stored in browser session.
  - User redirected to Admin Dashboard.
  - Audit log recorded for `Login` event.

### 2. Logout
- **Action**: Click the user profile icon in the top navigation bar and select **Logout**.
- **Expected Result**:
  - `localStorage` items (`currentUser`, `token`, `accountType`) flushed.
  - In-memory tickets, tasks, users, and notifications state cleared.
  - Application redirects to `/login`.
  - Subsequent back-button navigation does not expose protected views.

### 3. Admin Dashboard
- **Action**: Log in as Administrator. Inspect dashboard overview cards, navigation tabs, and system widgets.
- **Expected Result**:
  - System statistics (Active Tickets, Open Tasks, Total Clients, System Users) render with dynamic counts.
  - Charts (Ticket Status, Task Status, Priority Breakdown) render correctly without console errors.
  - Navigation tabs (Clients, Users, Tickets, Tasks, Reports, Audit Logs, Settings) accessible.

### 4. Create Client
- **Action**: Under **Clients** tab, click **Add Client**. Fill in Company Name ("Acme Corp"), Domain ("acme.com"), Contact Person ("Alice Smith"), Email ("alice@acme.com"), Phone, and City. Submit.
- **Expected Result**:
  - HTTP 200 returned from `POST /api/clients`.
  - Welcome email queued/sent to `alice@acme.com` with initial temporary credentials.
  - New client appears immediately in Clients directory.
  - Audit log recorded for `Client Creation`.

### 5. Create Employee
- **Action**: Under **Users** tab, click **Add User**. Fill in Full Name ("Bob Miller"), Email ("bob@example.com"), Role ("Employee"), Department ("Support"), and assign a Manager. Submit.
- **Expected Result**:
  - HTTP 200 returned from `POST /api/users`.
  - Welcome email dispatched containing secure temporary password.
  - User appears in User directory with `Active` status and `first_login: true`.
  - Audit log recorded for `User Creation`.

### 6. Employee Welcome Email
- **Action**: Inspect Brevo / SMTP outbound logs or `/api/email-logs`.
- **Expected Result**:
  - Welcome email delivered to `bob@example.com` with Subject `Welcome to Complify Support`.
  - HTML body is properly escaped; temporary password displayed to recipient.
  - Database `email_logs` table records entry with temporary password redacted as `[REDACTED]`.

### 7. Create Ticket
- **Action**: Log in as Client (`alice@acme.com`) or Admin. Click **New Ticket**. Enter Subject ("Billing portal error"), Category ("Technical"), Priority ("High"), Due Date (3 days out), and Description. Submit.
- **Expected Result**:
  - HTTP 200 returned from `POST /api/tickets`.
  - Ticket ID generated (e.g. `TKT-XXXXXX`) with status `New`.
  - Notification sent to client confirming submission.
  - Ticket appears in Client portal and Admin/Manager ticket lists.

### 8. Assign Ticket
- **Action**: Log in as Administrator or Manager. Open the newly created ticket. Assign to Employee "Bob Miller". Save.
- **Expected Result**:
  - HTTP 200 returned from `PUT /api/tickets/:id`.
  - Ticket status transitions to `Assigned` (or remains `New` with assignee set).
  - In-app notification and email dispatched to Bob Miller.
  - Ticket history logs assignment change with timestamp.

### 9. Ticket Lifecycle (Progress -> Resolve -> Close)
- **Action**:
  1. Log in as Employee Bob Miller. Change status from `Assigned` to `In Progress`.
  2. Change status to `Resolved` and provide Resolution Summary ("Configured billing webhook").
  3. Log in as Client Alice Smith. Review resolution and click **Confirm & Close Ticket**, providing 5-star rating and satisfaction notes.
- **Expected Result**:
  - Employee payload only submits allowed fields (`status`, `employeeNotes`, `resolutionSummary`).
  - Client payload submits `{ status: "Closed", satisfactionRating: 5, satisfactionNotes }`.
  - Status updates to `Closed`, `completed_at` and `resolution_date` timestamps recorded.
  - Resolution audit entry created.

### 10. Ticket Reopen
- **Action**: As Administrator or Manager, open the `Closed` ticket. Select **Reopen Ticket**. Enter comment ("Client reported recurring error").
- **Expected Result**:
  - HTTP 200 returned from `POST /api/tickets/:id/reopen`.
  - Status transitions to `In Progress` (or `New`).
  - Previous deadline notification deduplication records invalidated so new deadline alerts can fire.
  - Reopen event logged in ticket history and audit logs.

### 11. Create Task
- **Action**: As Manager or Admin, click **New Task**. Enter Title ("Verify SSL renewal"), Category ("Security"), Priority ("Critical"), Assignee ("Bob Miller"), Due Date (tomorrow). Submit.
- **Expected Result**:
  - HTTP 200 returned from `POST /api/tasks`.
  - Task ID generated (e.g. `TSK-XXXXXX`) with status `New` or `In Progress`.
  - In-app notification created for assignee.

### 12. Task Assignment
- **Action**: Open Task. Reassign to another team member or change priority/due date.
- **Expected Result**:
  - HTTP 200 from `PUT /api/tasks/:id`.
  - Previous assignee notified of reassignment; new assignee receives task notification.
  - If due date modified, deadline reminder tracking records reset.

### 13. Task Completion
- **Action**: Log in as Employee Bob Miller. Open assigned task. Click **Complete Task**. Fill Completion Notes ("Certificates installed and validated").
- **Expected Result**:
  - Status updates to `Completed`.
  - If task required manager review (`needsReview: true`), review status flags task as awaiting manager audit.
  - Task completed timestamp saved.

### 14. Manager Review
- **Action**: Log in as Manager. Open the completed task awaiting review. Verify the review alert banner ("Task completed and awaiting your review") and click **Review Now** / **Approve**.
- **Expected Result**:
  - HTTP 200 from `PUT /api/tasks/:id/review`.
  - Task review status marked `Approved`.
  - Notification sent to employee confirming review approval.

### 15. Task Reopen
- **Action**: Open a `Completed` task as Manager or Administrator. Click **Reopen Task** with a reason note.
- **Expected Result**:
  - HTTP 200 returned.
  - Status transitions back to `In Progress`.
  - Completion date cleared; task history logs reopening.

### 16. Attach File
- **Action**: Open ticket or task. In the Attachments section, upload a valid test file (`test_document.pdf` < 10MB).
- **Expected Result**:
  - Client-side checks pass (extension whitelist & size limit).
  - HTTP 200 from `POST /api/tickets/:id/attachments` (or task attachments).
  - File written to disk as `att-<uuid>.pdf` in isolated upload directory.
  - Magic bytes verified server-side.
  - Attachment metadata appears in attachment list with original filename.

### 17. Download/Open Attachment
- **Action**: Click download / view on the uploaded attachment. Then attempt unauthorized direct URL access without token.
- **Expected Result**:
  - Authenticated request receives file with safe `Content-Disposition` header (`inline` or `attachment; filename="..."`).
  - Unauthenticated access returns HTTP 401.
  - Cross-tenant / unauthorized role access returns HTTP 403.
  - Direct static file path (e.g. `/uploads/tickets/...`) is blocked with HTTP 404.

### 18. Notifications
- **Action**: Trigger an event generating notifications (e.g. assign a task). Click Notification bell icon in header. Mark notification as read, then click "Delete All".
- **Expected Result**:
  - Unread badge counter accurately reflects database unread count.
  - Marking read sends `PUT /api/notifications/:id/read` and updates UI optimistically.
  - Deleting clears notification in PostgreSQL.
  - Cross-user notification modification attempts return HTTP 403.

### 19. Deadline Calendar
- **Action**: Navigate to **Deadline Calendar** in navigation bar. Inspect month, week, and day views.
- **Expected Result**:
  - Active tickets and tasks display on their due date cell.
  - Color codes correctly represent urgency (Red for Overdue, Orange for Due Today, Yellow for Due Tomorrow, Blue for Upcoming, Green for Completed).
  - Clicking an item opens the corresponding detail modal.
  - Completed items correctly show green completed badges.

### 20. Password Change
- **Action**: Click user profile, navigate to **Change Password**. Enter current password and new password (> 8 chars). Submit.
- **Expected Result**:
  - HTTP 200 returned from `PUT /api/users/change-password` (or `clients/change-password`).
  - Database `password_hash` updated with new bcrypt hash (cost 10).
  - User can log in with new password; old password fails with HTTP 401.

### 21. Forgot / Reset Password
- **Action**:
  1. On `/login`, click **Forgot Password**. Enter email (`alice@acme.com`).
  2. Inspect email for reset link with single-use cryptographic token (`/reset-password?token=...`).
  3. Open link, enter new password, submit.
  4. Attempt to use the same reset link a second time.
- **Expected Result**:
  - Forgot password endpoint returns generic success message regardless of email existence.
  - Token verified via SHA-256 hash in database; expires in 30 minutes.
  - Password updated successfully; confirmation email dispatched.
  - Second attempt with the same token is rejected with HTTP 400 (`Invalid or expired password reset link`).

### 22. Search
- **Action**: Type query into top header search bar ("billing" or "Acme").
- **Expected Result**:
  - `GET /api/search?q=...` executes parameterized database search bounded by `LIMIT 50`.
  - Results grouped by Tickets, Tasks, Clients, and Employees.
  - Role scoping strictly applied (Employees only see assigned items; Clients only see own tickets; Managers only see team items).

### 23. Reports & Exports
- **Action**: Under **Reports** tab (Admin or Manager), select a date range and click **Export PDF** and **Export Excel**.
- **Expected Result**:
  - PDF document generates cleanly via `jspdf` / `jspdf-autotable`.
  - Excel `.xlsx` spreadsheet downloads with formatted headers via `exceljs`.
  - Manager reports only include supervised team data.

### 24. Role Access Checks (Anti-IDOR Matrix)
- **Action**: Test permission boundaries across roles using separate browser sessions or curl:
  1. Employee attempts to access `/api/users` or `/api/clients` -> Expect 403.
  2. Client attempts to query `/api/tasks` -> Expect 403.
  3. Client A attempts `GET /api/tickets/TKT-B` belonging to Client B -> Expect 403.
  4. Employee A attempts to edit Ticket assigned to Employee B -> Expect 403.
  5. Manager A attempts to reassign ticket to Employee outside their team -> Expect 403.
  6. Non-admin attempts to access `/api/audit-logs` -> Expect 403.
- **Expected Result**: All unauthorized boundary crosses are rejected with HTTP 403 and logged in security console.

### 25. Health Endpoint
- **Action**: Send `GET /api/health` via curl or browser.
- **Expected Result**:
  - With PostgreSQL connected: HTTP 200 with `{ "success": true, "database": "Connected", "server": "Running", "timestamp": "..." }`.
  - With PostgreSQL stopped (simulate failure): HTTP 503 with `{ "success": false, "database": "Disconnected", "server": "Running", "timestamp": "..." }`.
  - No database credentials, connection strings, or stack traces exposed.

---

## Smoke Test Sign-Off Checklist

| Test # | Workflow | Result (Pass/Fail) | Verified By | Notes / Date |
|---|---|---|---|---|
| 1 | Login | [ ] Pass | | |
| 2 | Logout | [ ] Pass | | |
| 3 | Admin Dashboard | [ ] Pass | | |
| 4 | Create Client | [ ] Pass | | |
| 5 | Create Employee | [ ] Pass | | |
| 6 | Employee Welcome Email | [ ] Pass | | |
| 7 | Create Ticket | [ ] Pass | | |
| 8 | Assign Ticket | [ ] Pass | | |
| 9 | Ticket Lifecycle | [ ] Pass | | |
| 10 | Ticket Reopen | [ ] Pass | | |
| 11 | Create Task | [ ] Pass | | |
| 12 | Task Assignment | [ ] Pass | | |
| 13 | Task Completion | [ ] Pass | | |
| 14 | Manager Review | [ ] Pass | | |
| 15 | Task Reopen | [ ] Pass | | |
| 16 | Attach File | [ ] Pass | | |
| 17 | Download Attachment | [ ] Pass | | |
| 18 | Notifications | [ ] Pass | | |
| 19 | Deadline Calendar | [ ] Pass | | |
| 20 | Password Change | [ ] Pass | | |
| 21 | Forgot/Reset Password | [ ] Pass | | |
| 22 | Global Search | [ ] Pass | | |
| 23 | Reports & Exports | [ ] Pass | | |
| 24 | Role Access Checks | [ ] Pass | | |
| 25 | Health Endpoint | [ ] Pass | | |

