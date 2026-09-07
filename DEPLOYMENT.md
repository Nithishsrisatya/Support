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
       └───> [ Outgoing SMTP ] ── Transactional email provider (Mailgun/SES/SendGrid)
```

---

## 2. Server Requirements

- **Operating System:** Ubuntu 22.04 / 24.04 LTS (recommended)
- **Node.js:** Node.js 20 LTS or higher
- **Package Manager:** npm 10+
- **Process Manager:** PM2 (`npm install -g pm2`)
- **Web Server:** Nginx (`sudo apt install nginx certbot python3-certbot-nginx`)
- **Database:** PostgreSQL 15+ (Local or Cloud-managed e.g. AWS RDS, Supabase, Neon)
- **RAM / CPU:** Minimum 2 vCPU, 4GB RAM (handles 1,000+ active users)

---

## 3. Environment Variables Reference

Create a `.env` file on the production server in the application root directory (`/var/www/complify/.env`).

> [!CAUTION]
> **NEVER commit `.env` to Git or version control.** Always populate `.env` directly on the target production server via secure secret injection.

### A. Secret Variables (High Security)

| Variable | Description | Example / Format |
|---|---|---|
| `JWT_SECRET` | High-entropy random secret for signing JWT access tokens (min 32 chars). | `openssl rand -base64 32` |
| `DB_PASSWORD` | PostgreSQL database user password (if using granular vars). | `secure_pg_password_here` |
| `DATABASE_URL` | Full PostgreSQL connection URI (alternative to granular vars). | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `SMTP_PASS` | Password / API secret for your outgoing SMTP relay. | `your_smtp_api_key` |

### B. Configuration Variables (Non-Secret)

| Variable | Description | Recommended Production Value |
|---|---|---|
| `NODE_ENV` | Runtime environment. Enables production optimizations. | `production` |
| `PORT` | Local port Express listens on (behind Nginx). | `3000` |
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
| `SMTP_HOST` | Outgoing SMTP mail server host. | `smtp.mailgun.org` / `smtp.sendgrid.net` |
| `SMTP_PORT` | SMTP port (`465` for SSL, `587` for STARTTLS). | `587` |
| `SMTP_USER` | SMTP username or API user. | `postmaster@yourcompany.com` |
| `EMAIL_FROM` | Verified sender address shown in email headers. | `Complify Support <noreply@yourcompany.com>` |
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

