import { pool } from "./db";
import {
  SEED_USERS,
  SEED_CLIENTS,
  SEED_TICKETS,
  SEED_TASKS,
  SEED_NOTIFICATIONS,
  SEED_AUDIT_LOGS,
} from "./seedData";

async function migrate() {
  try {
    console.log("🚀 Starting database migration...");

    // =========================================================================
    // 1. CORE SCHEMA CREATION (Parent tables first, then child tables)
    // =========================================================================

    // 1. Users Table
    console.log("➡️ Creating users...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        department VARCHAR(100),
        manager_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Active',
        first_login BOOLEAN DEFAULT false,
        created_date TIMESTAMP DEFAULT NOW(),
        updated_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ users created");

    // 2. Clients Table
    console.log("➡️ Creating clients...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(50) PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        company_domain VARCHAR(255),
        contact_person VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(50),
        city VARCHAR(100),
        status VARCHAR(50) NOT NULL DEFAULT 'Active',
        password_hash VARCHAR(255),
        "passwordHash" VARCHAR(255),
        first_login BOOLEAN DEFAULT false,
        created_date TIMESTAMP DEFAULT NOW(),
        updated_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ clients created");

    // 3. Tickets Table
    console.log("➡️ Creating tickets...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(50) PRIMARY KEY,
        subject VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100) NOT NULL,
        priority VARCHAR(50) NOT NULL DEFAULT 'Medium',
        status VARCHAR(50) NOT NULL DEFAULT 'New',
        assigned_to VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        client_id VARCHAR(50) REFERENCES clients(id) ON DELETE CASCADE,
        due_date TIMESTAMP DEFAULT NULL,
        completed_at TIMESTAMP DEFAULT NULL,
        is_overdue BOOLEAN DEFAULT false,
        resolution_summary TEXT DEFAULT NULL,
        resolution_date TIMESTAMP DEFAULT NULL,
        employee_notes TEXT DEFAULT NULL,
        satisfaction_rating INTEGER DEFAULT NULL,
        satisfaction_notes TEXT DEFAULT NULL,
        created_date TIMESTAMP DEFAULT NOW(),
        updated_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ tickets created");

    // 4. Ticket History Table
    console.log("➡️ Creating ticket_history...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_history (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        timestamp TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) NOT NULL,
        updated_by VARCHAR(255) NOT NULL,
        comment TEXT
      )
    `);
    console.log("✅ ticket_history created");

    // 5. Tasks Table
    console.log("➡️ Creating tasks...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        task_category VARCHAR(100),
        priority VARCHAR(50) NOT NULL DEFAULT 'Medium',
        status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        assigned_to VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        assigned_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        start_date TIMESTAMP DEFAULT NULL,
        due_date TIMESTAMP DEFAULT NULL,
        completion_date TIMESTAMP DEFAULT NULL,
        completed_at TIMESTAMP DEFAULT NULL,
        completion_notes TEXT DEFAULT NULL,
        escalation_status VARCHAR(50) DEFAULT 'No',
        progress_percentage INTEGER DEFAULT 0,
        review_status VARCHAR(50) DEFAULT NULL,
        manager_notes TEXT DEFAULT NULL,
        reviewed_by VARCHAR(50) DEFAULT NULL,
        reviewed_date TIMESTAMP DEFAULT NULL,
        created_date TIMESTAMP DEFAULT NOW(),
        updated_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ tasks created");

    // 6. Notifications Table
    console.log("➡️ Creating notifications...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        notification_type VARCHAR(100) NOT NULL,
        title VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Sent',
        created_date TIMESTAMP DEFAULT NOW(),
        read_date TIMESTAMP DEFAULT NULL
      )
    `);
    console.log("✅ notifications created");

    // 7. Audit Logs Table
    console.log("➡️ Creating audit_logs...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50),
        user_full_name VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        description TEXT
      )
    `);
    console.log("✅ audit_logs created");

    // 8. Email Logs Table
    console.log("➡️ Creating email_logs...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_address VARCHAR(255) NOT NULL,
        to_address VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'Sent',
        created_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ email_logs created");

    // 9. Ticket Comments Table
    console.log("➡️ Creating ticket_comments...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id VARCHAR(50) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        author_name VARCHAR(255) NOT NULL,
        author_role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        is_internal BOOLEAN NOT NULL DEFAULT false,
        created_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ ticket_comments created");

    // 10. Ticket Attachments Table
    console.log("➡️ Creating ticket_attachments...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id VARCHAR(50) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        file_name VARCHAR(500) NOT NULL,
        file_path VARCHAR(1000) NOT NULL,
        file_size BIGINT NOT NULL DEFAULT 0,
        mime_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
        uploaded_by VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        uploaded_by_name VARCHAR(255) NOT NULL,
        created_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ ticket_attachments created");

    // 11. Task History Table
    console.log("➡️ Creating task_history...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'status_change',
        timestamp TIMESTAMP DEFAULT NOW(),
        user_full_name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        metadata JSONB
      )
    `);
    console.log("✅ task_history created");

    // 12. Task Attachments Table
    console.log("➡️ Creating task_attachments...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        file_name VARCHAR(500) NOT NULL,
        file_path VARCHAR(1000) NOT NULL,
        file_size BIGINT NOT NULL DEFAULT 0,
        mime_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
        uploaded_by VARCHAR(50) NOT NULL,
        uploaded_by_name VARCHAR(255) NOT NULL,
        created_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ task_attachments created");

    // 13. Task Progress Updates Table
    console.log("➡️ Creating task_progress_updates...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_progress_updates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR(50) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        user_full_name VARCHAR(255) NOT NULL,
        progress_percentage INTEGER NOT NULL DEFAULT 0,
        comment TEXT NOT NULL DEFAULT '',
        created_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ task_progress_updates created");

    // 14. Password Reset Tokens Table
    console.log("➡️ Creating password_reset_tokens...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(50) NOT NULL,
        user_type VARCHAR(20) NOT NULL DEFAULT 'User',
        email VARCHAR(255) NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ password_reset_tokens created");

    // 15. Deadline Notifications Table
    console.log("➡️ Creating deadline_notifications...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deadline_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_type VARCHAR(20) NOT NULL,
        item_id VARCHAR(50) NOT NULL,
        stage VARCHAR(30) NOT NULL,
        recipient_id VARCHAR(50) NOT NULL,
        recipient_role VARCHAR(20) NOT NULL,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_deadline_notification UNIQUE (item_type, item_id, stage, recipient_id)
      )
    `);
    console.log("✅ deadline_notifications created");

    // 16. Weekly Pending Work Notifications Table
    console.log("➡️ Creating weekly_pending_work_notifications...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weekly_pending_work_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        week_start DATE NOT NULL,
        recipient_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_role VARCHAR(20) NOT NULL,
        total_pending INTEGER NOT NULL DEFAULT 0,
        overdue_count INTEGER NOT NULL DEFAULT 0,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_weekly_pending_work_notification UNIQUE (week_start, recipient_id)
      )
    `);
    console.log("✅ weekly_pending_work_notifications created");

    // =========================================================================
    // 2. BACKWARD-COMPATIBILITY SCHEMA UPDATES (for existing databases)
    // =========================================================================
    try {
      await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0`);
      await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT NULL`);
      await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_notes TEXT DEFAULT NULL`);
      await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(50) DEFAULT NULL`);
      await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reviewed_date TIMESTAMP DEFAULT NULL`);
      await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMP DEFAULT NULL`);
      await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP DEFAULT NULL`);
      console.log("✅ Task table columns verified");
    } catch (err) {
      console.log("  ℹ️  Some task columns may already exist (safe to continue)");
    }

    try {
      await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS due_date TIMESTAMP DEFAULT NULL`);
      await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP DEFAULT NULL`);
      await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN DEFAULT false`);
      console.log("✅ Ticket table deadline columns verified");
    } catch (err) {
      console.log("  ℹ️  Some ticket columns may already exist (safe to continue)");
    }

    try {
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS "passwordHash" VARCHAR(255) DEFAULT NULL`);
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT NULL`);
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT false`);
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_domain VARCHAR(255) DEFAULT NULL`);
      await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT NULL`);
      console.log("✅ Client table columns verified");
    } catch (err) {
      console.log("  ℹ️  Some client columns may already exist (safe to continue)");
    }

    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login BOOLEAN DEFAULT false`);
      console.log("✅ User table columns verified");
    } catch (err) {
      console.log("  ℹ️  Some user columns may already exist (safe to continue)");
    }

    // =========================================================================
    // 3. INDEXES CREATION
    // =========================================================================
    console.log("➡️ Creating indexes...");
    try {
      // Users
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id)`);

      // Clients
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)`);

      // Tickets
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_due_date ON tickets(due_date)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_created_date ON tickets(created_date)`);

      // Tasks
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)`);

      // Ticket child tables
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_history(ticket_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_comments_author_id ON ticket_comments(author_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploaded_by ON ticket_attachments(uploaded_by)`);

      // Task child tables
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_progress_task_id ON task_progress_updates(task_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_progress_user_id ON task_progress_updates(user_id)`);

      // Notifications
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications(user_id, status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_created_date ON notifications(created_date)`);

      // Password Reset Tokens
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens(email)`);

      // Deadline Notifications
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_deadline_notifications_item ON deadline_notifications(item_type, item_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_deadline_notifications_recipient ON deadline_notifications(recipient_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_deadline_notifications_stage ON deadline_notifications(stage)`);

      // Weekly Pending Work Notifications
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_weekly_pending_work_week ON weekly_pending_work_notifications(week_start)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_weekly_pending_work_recipient ON weekly_pending_work_notifications(recipient_id)`);

      console.log("✅ Indexes created");
    } catch (err) {
      console.log("  ℹ️  Some indexes may already exist (safe to continue)");
    }

    // =========================================================================
    // 4. SEED DATA INSERTION (ON CONFLICT (id) DO NOTHING)
    // =========================================================================
    console.log("➡️ Seeding initial data...");

    // Users
    for (const user of SEED_USERS) {
      await pool.query(
        `
        INSERT INTO users (
          id,
          full_name,
          email,
          password_hash,
          role,
          department,
          manager_id,
          status,
          created_date,
          updated_date
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          user.id,
          user.fullName,
          user.email,
          user.passwordHash,
          user.role,
          user.department,
          user.managerId,
          user.status,
          user.createdDate,
          user.updatedDate,
        ]
      );
    }
    console.log("✅ Users seeded");

    // Clients
    for (const client of SEED_CLIENTS) {
      await pool.query(
        `
        INSERT INTO clients (
          id,
          company_name,
          contact_person,
          email,
          phone_number,
          status,
          created_date,
          updated_date
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          client.id,
          client.companyName,
          client.contactPerson,
          client.email,
          client.phoneNumber,
          client.status,
          client.createdDate,
          client.updatedDate,
        ]
      );
    }
    console.log("✅ Clients seeded");

    // Tickets & Ticket History
    for (const ticket of SEED_TICKETS) {
      await pool.query(
        `
        INSERT INTO tickets (
          id,
          subject,
          description,
          category,
          priority,
          status,
          assigned_to,
          client_id,
          created_date,
          updated_date,
          resolution_summary,
          resolution_date,
          employee_notes,
          satisfaction_rating,
          satisfaction_notes
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
        )
        ON CONFLICT (id) DO NOTHING
        `,
        [
          ticket.id,
          ticket.subject,
          ticket.description,
          ticket.category,
          ticket.priority,
          ticket.status,
          ticket.assignedTo,
          ticket.clientId,
          ticket.createdDate,
          ticket.updatedDate,
          ticket.resolutionSummary ?? null,
          ticket.resolutionDate ?? null,
          ticket.employeeNotes ?? null,
          ticket.satisfactionRating ?? null,
          ticket.satisfactionNotes ?? null,
        ]
      );

      // Ticket History
      if (ticket.history && Array.isArray(ticket.history)) {
        for (const history of ticket.history) {
          await pool.query(
            `
            INSERT INTO ticket_history (
              ticket_id,
              timestamp,
              status,
              updated_by,
              comment
            )
            VALUES ($1,$2,$3,$4,$5)
            `,
            [
              ticket.id,
              history.timestamp,
              history.status,
              history.updatedBy,
              history.comment,
            ]
          );
        }
      }
    }
    console.log("✅ Tickets seeded");

    // Tasks
    for (const task of SEED_TASKS) {
      await pool.query(
        `
        INSERT INTO tasks (
          id,
          title,
          description,
          status,
          assigned_to,
          created_date,
          updated_date
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          task.id,
          task.title,
          task.description,
          task.status,
          task.assignedTo,
          task.createdDate,
          task.updatedDate,
        ]
      );
    }
    console.log("✅ Tasks seeded");

    // Notifications
    for (const notification of SEED_NOTIFICATIONS) {
      await pool.query(
        `
        INSERT INTO notifications (
          id,
          user_id,
          notification_type,
          title,
          message,
          status,
          created_date,
          read_date
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          notification.id,
          notification.userId,
          notification.notificationType,
          notification.title,
          notification.message,
          notification.status,
          notification.createdDate,
          notification.readDate ?? null,
        ]
      );
    }
    console.log("✅ Notifications seeded");

    // Audit Logs
    for (const log of SEED_AUDIT_LOGS) {
      await pool.query(
        `
        INSERT INTO audit_logs (
          id,
          user_id,
          user_full_name,
          action,
          entity_type,
          entity_id,
          timestamp,
          description
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          log.id,
          log.userId,
          log.userFullName,
          log.action,
          log.entityType,
          log.entityId,
          log.timestamp,
          log.description,
        ]
      );
    }
    console.log("✅ Audit Logs seeded");

    console.log("🎉 Migration completed successfully!");

    await pool.end();
    process.exit(0);
  } catch (err: any) {
    console.error("❌ Migration failed");
    console.error(err);
    console.error(err?.stack);

    await pool.end();

    process.exit(1);
  }
}

migrate();