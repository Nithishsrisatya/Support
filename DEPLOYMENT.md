# Complify Support — Production Deployment Guide

This document is the official operational reference for deploying and maintaining **Complify Support** in a production environment.

---

## 1. System Architecture

```
Internet (HTTPS: 443)
       │
       ▼
[ Nginx Reverse Proxy ] ── SSL Termination (Let's Encrypt / Certbot)
  ├── Static asset caching & Gzip compression
  ├── Enforces client_max_body_size (15M)
  └── Proxies /api and SPA fallback to http://127.0.0.1:3000
       │
       ▼
[ Node.js Process (PM2) ] ── dist/server.mjs (Express API + Vite Static Host)
   ├── API Routers (/api/*)
   ├── In-process Cron Schedulers (Daily reminders, Overdue SLA alerts)
   └── Helmet security headers & rate limiting
        │
        ├───> [ PostgreSQL 15+ ] ── Relational Database (SSL enabled for Cloud)
        ├───> [ Persistent Disk ] ── uploads/ (Mounted persistent directory)
        ├───> [ Brevo REST API ] ── Outbound HTTPS / Port 443 (Recommended for Render Free / Production)
        └───> [ Nodemailer SMTP ] ── Outbound Port 587/465 (Local development fallback)
```

---

## 2. Server Requirements

- **Operating System:** Ubuntu 22.04 / 24.04 LTS (recommended) or PaaS (Render / Railway / Fly.io)
- **Node.js:** Node.js 20 LTS or higher
- **Package Manager:** npm 10+
- **Process Manager:** PM2 (`npm install -g pm2`) or PaaS Web Service
- **Web Server:** Nginx (`sudo apt install nginx certbot python3-certbot-nginx`)
- **Database:** PostgreSQL 15+ (Local or Cloud-managed e.g. AWS RDS, Supabase, Neon, Render PostgreSQL)
- **RAM / CPU:** Minimum 2 vCPU, 4GB RAM (handles 1,000+ active users)

---

## 3. Environment Variables Reference

Create a `.env` file on the production server in the application root directory (`/var/www/complify/.env`) or configure environment variables in your PaaS dashboard (e.g. Render Environment).

> [!CAUTION]
> **NEVER commit `.env` to Git or version control.** Always populate `.env` directly on the target production server via secure secret injection.

### A. Secret Variables (High Security)

| Variable | Description | Example / Format |
|---|---|---|
| `JWT_SECRET` | High-entropy random secret for signing JWT access tokens (min 32 chars). | `openssl rand -base64 32` |
| `DB_PASSWORD` | PostgreSQL database user password (if using granular vars). | `secure_pg_password_here` |
| `DATABASE_URL` | Full PostgreSQL connection URI (alternative to granular vars). | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `BREVO_API_KEY` | **Recommended Production (Render Free):** Brevo REST API Key (`xkeysib-...`) sending over HTTPS (Port 443). Bypasses cloud SMTP port blocks. | `xkeysib_your_brevo_api_key_here` |
| `SMTP_PASS` | Password / API secret for outgoing SMTP relay (used for local development). | `your_smtp_api_key` |

### B. Configuration Variables (Non-Secret)

| Variable | Description | Recommended Production Value |
|---|---|---|
| `NODE_ENV` | Runtime environment. Enables production optimizations. | `production` |
| `PORT` | Local port Express listens on (behind Nginx or PaaS router). | `3000` |
| `DB_HOST` | PostgreSQL hostname / IP address. | `127.0.0.1` or cloud host |
| `DB_PORT` | PostgreSQL port. | `5432` |
| `DB_NAME` | PostgreSQL database name. | `complify` |
| `DB_USER` | PostgreSQL database username. | `complify_user` |
| `DB_SSL` | Enable PostgreSQL SSL. Set to `true` for managed cloud DB. | `true` (cloud) / `false` (local) |
| `DB_POOL_MAX` | Max concurrent database connections in pool. | `20` |
| `DB_IDLE_TIMEOUT` | Idle connection timeout in milliseconds. | `30000` |
| `DB_CONNECTION_TIMEOUT` | Connection acquisition timeout in milliseconds. | `5000` |
| `FRONTEND_URL` | Canonical public HTTPS domain for email links and portal access. | `https://support.yourcompany.com` |
| `CORS_ORIGIN` | Allowed cross-origin domains (comma-separated if multiple). | `https://support.yourcompany.com` |
| `EMAIL_FROM` | Verified sender address shown in email headers. | `Complify Support <knithishsrisatya@gmail.com>` |
| `BREVO_SENDER_NAME` | *(Optional)* Custom sender display name for Brevo API. | `Complify Support` |
| `BREVO_SENDER_EMAIL` | *(Optional)* Verified sender email for Brevo API. | `knithishsrisatya@gmail.com` |
| `SMTP_HOST` | Outgoing SMTP mail server host (local development fallback). | `smtp-relay.brevo.com` / `localhost` |
| `SMTP_PORT` | SMTP port (`465` for SSL, `587` for STARTTLS). | `587` |
| `SMTP_USER` | SMTP username or API user (local development fallback). | `postmaster@yourcompany.com` |
| `UPLOAD_DIR` | Absolute path for persistent file storage. | `/var/www/complify/uploads/tickets` |

---

## 4. Step-by-Step Deployment Procedure

### Step 1: Clone Repository & Install Dependencies

```bash
cd /var/www
git clone <repository_url> complify
cd complify
npm ci --omit=dev
```

*(Note: If building on the server, run `npm ci` without `--omit=dev` so build tools like `esbuild`, `vite`, and `typescript` are available).*

### Step 2: Configure Environment

```bash
cp .env.example .env
nano .env
```
Populate `.env` with your production values and save.

### Step 3: Run Database Migrations

Apply database schemas, foreign keys, indexes, and tables:

```bash
npm run migrate
```

### Step 4: Build Application

Compile the React 19 frontend SPA and the ESBuild backend bundle (`dist/server.mjs`):

```bash
npm run build
```

### Step 5: Start with PM2 Process Manager

```bash
# Start application
pm2 start dist/server.mjs --name "complify-support"

# Configure PM2 to auto-start on server reboot
pm2 startup
pm2 save
```

### Step 6: Configure Nginx Reverse Proxy

Create `/etc/nginx/sites-available/complify-support`:

```nginx
server {
    server_name support.yourcompany.com;

    # Client upload size limit (matches application 10MB limit + headroom)
    client_max_body_size 15M;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and obtain a free SSL certificate:

```bash
sudo ln -s /etc/nginx/sites-available/complify-support /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Install Let's Encrypt SSL
sudo certbot --nginx -d support.yourcompany.com
```

---

## 5. Persistent Upload Storage Setup

Ensure the upload directory exists and is owned by the application runtime user:

```bash
sudo mkdir -p /var/www/complify/uploads/tickets
sudo chown -R www-data:www-data /var/www/complify/uploads
sudo chmod -R 750 /var/www/complify/uploads
```

Set `UPLOAD_DIR=/var/www/complify/uploads/tickets` in `.env`.

---

## 6. Automated Backup Strategy

### A. Daily PostgreSQL Database Backup (Logical)

Create a daily cron job (`/etc/cron.daily/backup-postgres`):

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/complify/db"
mkdir -p "$BACKUP_DIR"
pg_dump -U complify_user -Fc complify > "$BACKUP_DIR/complify_$(date +\%Y\%m\%d_\%H\%M\%S).dump"

# Keep last 14 days of backups locally
find "$BACKUP_DIR" -type f -mtime +14 -name "*.dump" -delete
```

### B. Daily Attachments Backup

```bash
#!/bin/bash
# Sync uploads directory to offsite cloud storage (e.g. AWS S3 / Cloudflare R2 via rclone)
rclone sync /var/www/complify/uploads/ s3:your-backup-bucket/complify-uploads/
```

---

## 7. Operational Commands Quick Reference

| Action | Command |
|---|---|
| **View Live Server Logs** | `pm2 logs complify-support` |
| **Restart Application** | `pm2 restart complify-support` |
| **Check Process Status** | `pm2 status` |
| **Run Migrations** | `npm run migrate` |
| **Test Production Build** | `npm run build` |
| **Typecheck Codebase** | `npm run typecheck` |
| **Reload Nginx** | `sudo systemctl reload nginx` |

---

## 8. Scheduler & Cloud PaaS (Render Free) Operational Architecture

Complify Support includes automated in-process schedulers powered by `node-cron` for deadline evaluations, overdue SLA breach alerts, automatic task escalations, daily task reminders, weekly management digests, and Monday weekly pending-work summaries.

### A. Render Free Tier Sleep & Wake Behavior
- **Inactivity Sleep:** Render Free web services automatically spin down into a sleep state after 15 minutes without incoming HTTP traffic.
- **Clock Suspension:** While the service is asleep, process CPU execution is suspended, which means internal timers (`node-cron`) do not tick while the container is sleeping.
- **Wake-up Trigger:** Any incoming HTTPS request (API call or frontend navigation) wakes the container.

### B. Automatic Boot & Wake Catch-Up
To guarantee that business-critical alerts and transitions are not lost during sleep periods or container restarts, the application executes an automatic, database-backed catch-up cycle immediately upon container startup:
1. **Initial Deadline Check:** Evaluates all active tickets and tasks for `Due Tomorrow`, `Due Today`, and `Overdue` stages.
2. **Initial Task Escalation Check:** Queries and auto-escalates any overdue tasks (`due_date < NOW()`).
3. **Monday Weekly Pending Work Catch-Up:** If the service boots or wakes on a Monday at or after 8:00 AM, it triggers the weekly summary dispatch.

### C. Database-Backed Idempotency & Multi-Instance Safety
Schedulers are guaranteed to be safe under process restarts, Render wake-ups, and horizontal multi-instance deployments:
1. **PostgreSQL Advisory Locks:** Every scheduled job acquires a dedicated session-level advisory lock (`pg_try_advisory_lock(bigint)`). If an instance is already executing a job, concurrent instances skip immediately without blocking or executing duplicate work. If a process crashes, PostgreSQL drops session advisory locks automatically.
2. **Database Unique Constraints:**
   - `deadline_notifications` enforces `UNIQUE(item_type, item_id, stage, recipient_id)`.
   - `weekly_pending_work_notifications` enforces `UNIQUE(week_start, recipient_id)`.
   Repeated executions within the same stage/period are strictly deduplicated at the PostgreSQL engine level.
3. **Delivery Failure Retry:** If an email delivery fails (e.g. temporary SMTP timeout), the tracking record is removed so that subsequent scheduler executions can legitimately retry sending. Once delivered, the record is retained permanently to prevent duplicate dispatches.
4. **Lifecycle & Due-Date Invalidation:** When tickets/tasks are reopened or their `due_date` is modified, existing notification records are deleted so updated deadlines trigger fresh notifications.

### D. Production Best Practice for Continuous 24/7 Cron Precision
If deploying on Render Free and requiring exact cron firing without waiting for human traffic:
- Set up a free external uptime monitor (e.g., [UptimeRobot](https://uptimerobot.com), [BetterStack](https://betterstack.com), or [cron-job.org](https://cron-job.org)) to ping `/api/health` every **10–14 minutes**.
- This keeps the Render container awake 24/7 at zero cost and guarantees on-the-minute execution of all cron jobs.

---

## 9. File Uploads & Ephemeral Storage Architecture (Render Free)

### A. Current Local Filesystem Architecture
- Attachments are stored locally on disk in `./uploads` (with dedicated subdirectories `./uploads/tickets` and `./uploads/tasks`).
- Storage filenames use collision-safe, cryptographically secure random identifiers (`att-${crypto.randomUUID()}.${ext}`).
- Original user-supplied filenames are kept as metadata in PostgreSQL for display and download headers, but never control physical disk paths.
- File access is strictly routed through authenticated API endpoints (`/api/tickets/:id/attachments/...` and `/api/tasks/:id/attachments/...`) enforcing RBAC, Manager team scope, and ticket/task ownership before serving files.
- The `./uploads` directory is never exposed through static web server routes (`express.static`), preventing direct unauthorized file downloads.

### B. Render Free Ephemeral Filesystem Limitation
- **Ephemeral Disk Storage:** The filesystem of a Render Free web service is non-persistent and ephemeral.
- **Restart & Redeploy Resets:** Whenever a Render Free web service restarts, redeploys, or spins down from inactivity, any files saved to the local `./uploads` directory are discarded.
- **Metadata Persistence:** PostgreSQL database records (`ticket_attachments`, `task_attachments`) persist across redeploys because the database runs on a separate managed instance. However, attachment binaries on disk will be cleared upon container replacement.
- **Testing & Demo Suitability:** The local filesystem architecture is fully functional, secure, and self-contained for development, staging, demonstrations, and test suites without requiring paid cloud infrastructure.

### C. Recommended Durable Production Architecture
For a permanent, enterprise-grade production deployment where uploaded files must survive redeployments:
1. **Cloud Object Storage (Recommended):**
   - Use an S3-compatible object storage provider (such as AWS S3, Cloudflare R2, Google Cloud Storage, or MinIO).
   - Use pre-signed URLs with short expirations (e.g., 15 minutes) generated server-side after verifying user permissions.
   - Cloudflare R2 offers 10 GB of storage and zero egress fees on its free tier.
2. **Persistent Disk Mounts:**
   - On Render Paid tiers or dedicated VPS hosting, configure a persistent disk mounted to the path specified in `process.env.UPLOAD_DIR` (e.g., `/var/data/uploads`).
   - Ensure file backup scripts sync this directory to offsite backup storage on a regular schedule.
