import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, sanitizeSubject, sanitizeUrl } from "../src/utils/htmlSanitizer";
import { welcomeEmail } from "../src/templates/welcomeEmail";
import {
  forgotPasswordTemplate,
  resetPasswordConfirmationTemplate,
  adminResetPasswordTemplate,
  ticketAssignedTemplate,
  ticketCreatedTemplate,
  ticketStatusChangedTemplate,
  ticketResolvedTemplate,
  ticketClosedTemplate,
  taskUpdatedTemplate,
  taskAssignedTemplate,
  taskCompletedTemplate,
  taskReminderTemplate,
  overdueTicketReminderTemplate,
  slaReminderTemplate,
  escalationTemplate,
  clientWelcomeTemplate,
  getDeadlineEmailSubject,
  deadlineNotificationEmailTemplate,
  employeeWeeklyPendingWorkEmailTemplate,
  managerWeeklyPendingWorkEmailTemplate,
} from "../src/templates/operationalEmails";
import { sanitizeEmailBody } from "../src/services/emailLogService";
import { sendEmail } from "../src/services/emailService";
import { pool } from "../src/db";

describe("Phase 8: Email HTML & User-Controlled Input Escaping Security Hardening", () => {
  // ──────────────────────────────────────────────
  // 1. htmlSanitizer Unit Tests
  // ──────────────────────────────────────────────
  describe("htmlSanitizer utility functions", () => {
    it("escapeHtml escapes dangerous HTML characters (<, >, &, \", ')", () => {
      const input = `<script>alert("XSS & 'injection'")</script>`;
      const output = escapeHtml(input);

      assert.strictEqual(output.includes("<script>"), false);
      assert.strictEqual(output.includes("</script>"), false);
      assert.strictEqual(
        output,
        "&lt;script&gt;alert(&quot;XSS &amp; &#39;injection&#39;&quot;)&lt;/script&gt;"
      );
    });

    it("escapeHtml escapes img onerror XSS vectors", () => {
      const input = `<img src=x onerror=alert('PWNED')>`;
      const output = escapeHtml(input);

      assert.strictEqual(output.includes("<img"), false);
      assert.strictEqual(
        output,
        "&lt;img src=x onerror=alert(&#39;PWNED&#39;)&gt;"
      );
    });

    it("escapeHtml handles null, undefined, numbers, and empty string safely", () => {
      assert.strictEqual(escapeHtml(null), "");
      assert.strictEqual(escapeHtml(undefined), "");
      assert.strictEqual(escapeHtml(""), "");
      assert.strictEqual(escapeHtml(42), "42");
      assert.strictEqual(escapeHtml(0), "0");
    });

    it("escapeHtml preserves safe text while escaping embedded entities", () => {
      const input = "O'Connor & Sons <Solutions> - 100% Reliable";
      const expected = "O&#39;Connor &amp; Sons &lt;Solutions&gt; - 100% Reliable";
      assert.strictEqual(escapeHtml(input), expected);
    });

    it("sanitizeSubject strips CRLF and line break injection attacks", () => {
      const maliciousSubject = "Ticket Resolved\r\nBcc: attacker@evil.com\r\nSubject: Injected";
      const sanitized = sanitizeSubject(maliciousSubject);

      assert.strictEqual(sanitized.includes("\r"), false);
      assert.strictEqual(sanitized.includes("\n"), false);
      assert.strictEqual(
        sanitized,
        "Ticket Resolved Bcc: attacker@evil.com Subject: Injected"
      );
    });

    it("sanitizeSubject handles null, undefined, empty, and excess whitespace", () => {
      assert.strictEqual(sanitizeSubject(null), "");
      assert.strictEqual(sanitizeSubject(undefined), "");
      assert.strictEqual(sanitizeSubject("   "), "");
      assert.strictEqual(
        sanitizeSubject("  Hello \r\n\t  World  "),
        "Hello World"
      );
    });

    it("sanitizeUrl disallows dangerous protocols (javascript:, data:, vbscript:)", () => {
      assert.strictEqual(sanitizeUrl("javascript:alert(1)"), "#");
      assert.strictEqual(sanitizeUrl("  JAVASCRIPT:alert('XSS')"), "#");
      assert.strictEqual(sanitizeUrl("data:text/html,<script>alert(1)</script>"), "#");
      assert.strictEqual(sanitizeUrl("vbscript:msgbox(1)"), "#");
      assert.strictEqual(sanitizeUrl(null), "#");
      assert.strictEqual(sanitizeUrl(undefined), "#");
      assert.strictEqual(sanitizeUrl(""), "#");
    });

    it("sanitizeUrl allows safe http, https, and relative URLs and escapes characters", () => {
      assert.strictEqual(
        sanitizeUrl("https://example.com/portal"),
        "https://example.com/portal"
      );
      assert.strictEqual(
        sanitizeUrl("http://localhost:5173/reset?token=123&user=admin"),
        "http://localhost:5173/reset?token=123&amp;user=admin"
      );
      assert.strictEqual(
        sanitizeUrl("/employee-dashboard"),
        "/employee-dashboard"
      );
    });
  });

  // ──────────────────────────────────────────────
  // 2. Email Templates Escaping Integration Tests
  // ──────────────────────────────────────────────
  describe("Email Templates HTML Escaping", () => {
    const xssPayload = `<script>alert('XSS')</script>`;
    const tagPayload = `<img src=x onerror="steal()">`;

    it("welcomeEmail escapes name, email, and password while preserving HTML markup", () => {
      const html = welcomeEmail(
        `John <script>Doe</script>`,
        `john<img onerror="hack()">@test.com`,
        `Pass&<123>`
      );

      // Raw dangerous strings must NOT be present
      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes('<img onerror="hack()">'), false);
      assert.strictEqual(html.includes("Pass&<123>"), false);

      // Escaped entities must be present
      assert.strictEqual(html.includes("&lt;script&gt;Doe&lt;/script&gt;"), true);
      assert.strictEqual(html.includes("&lt;img onerror=&quot;hack()&quot;&gt;"), true);
      assert.strictEqual(html.includes("Pass&amp;&lt;123&gt;"), true);

      // Static HTML elements remain intact
      assert.strictEqual(html.includes("<h2>Welcome to Complify Support</h2>"), true);
      assert.strictEqual(html.includes("<table>"), true);
      assert.strictEqual(html.includes("<td><b>Email</b></td>"), true);
      assert.strictEqual(html.includes("<td><b>Password</b></td>"), true);
    });

    it("forgotPasswordTemplate escapes user name and sanitizes reset link URL", () => {
      const maliciousLink = `javascript:alert('steal_token')`;
      const html = forgotPasswordTemplate(`Attacker ${xssPayload}`, maliciousLink);

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("javascript:alert"), false);
      assert.strictEqual(html.includes('href="#"'), true);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("Reset Password"), true);
    });

    it("resetPasswordConfirmationTemplate escapes user name", () => {
      const html = resetPasswordConfirmationTemplate(`Alice ${tagPayload}`);

      assert.strictEqual(html.includes("<img"), false);
      assert.strictEqual(html.includes("&lt;img"), true);
      assert.strictEqual(html.includes("Password Changed Successfully"), true);
    });

    it("adminResetPasswordTemplate escapes all inputs and preserves password redaction", () => {
      const html = adminResetPasswordTemplate(
        `Bob ${xssPayload}`,
        `Temp&<999>`,
        `Admin ${tagPayload}`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<img"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("&lt;img"), true);
      assert.strictEqual(html.includes("Temp&amp;&lt;999&gt;"), true);

      // Verify that emailLogService's sanitizeEmailBody can redact the temporary password
      const loggedBody = sanitizeEmailBody(html);
      assert.strictEqual(loggedBody.includes("Temp&amp;&lt;999&gt;"), false);
      assert.strictEqual(loggedBody.includes("[REDACTED]"), true);
    });

    it("ticketAssignedTemplate escapes employeeName, ticketId, subject, priority", () => {
      const html = ticketAssignedTemplate(
        `Engineer ${xssPayload}`,
        `TKT-<script>`,
        `Database crash <script>alert(1)</script>`,
        `Critical <bold>`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<bold>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("Database crash &lt;script&gt;"), true);
      assert.strictEqual(html.includes("Critical &lt;bold&gt;"), true);
    });

    it("ticketCreatedTemplate escapes clientName, companyName, ticketId, subject", () => {
      const html = ticketCreatedTemplate(
        `Client ${xssPayload}`,
        `TKT-101`,
        `Urgent issue <b>bold</b>`,
        `Corp & Associates <LLC>`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<b>bold</b>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("Corp &amp; Associates &lt;LLC&gt;"), true);
    });

    it("ticketStatusChangedTemplate escapes clientName, ticketId, subject, statuses", () => {
      const html = ticketStatusChangedTemplate(
        `Client ${tagPayload}`,
        `TKT-102`,
        `Subject <script>`,
        `In Progress <script>`,
        `Resolved <test>`
      );

      assert.strictEqual(html.includes("<img"), false);
      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<test>"), false);
      assert.strictEqual(html.includes("&lt;img"), true);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("&lt;test&gt;"), true);
    });

    it("ticketResolvedTemplate escapes resolutionSummary and subject", () => {
      const html = ticketResolvedTemplate(
        `Client`,
        `TKT-103`,
        `Server failure`,
        `Fixed issue by removing <script>evil()</script> & restarting service`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(
        html.includes("&lt;script&gt;evil()&lt;/script&gt; &amp; restarting service"),
        true
      );
    });

    it("ticketClosedTemplate escapes clientName and subject", () => {
      const html = ticketClosedTemplate(
        `Client ${xssPayload}`,
        `TKT-104`,
        `Subject with "quotes" & <tags>`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(
        html.includes("Subject with &quot;quotes&quot; &amp; &lt;tags&gt;"),
        true
      );
    });

    it("taskUpdatedTemplate escapes employeeName, taskId, title, updatedBy, changes", () => {
      const html = taskUpdatedTemplate(
        `Emp ${xssPayload}`,
        `TSK-101`,
        `Security Update <script>`,
        `Admin ${tagPayload}`,
        `Changed deadline to <script>now()</script>`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<img"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("&lt;img"), true);
    });

    it("taskAssignedTemplate escapes employeeName, taskId, title", () => {
      const html = taskAssignedTemplate(
        `Emp ${xssPayload}`,
        `TSK-102`,
        `Database Migration <script>`,
        "2026-12-31"
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
    });

    it("taskCompletedTemplate escapes managerName, employeeName, taskId, title, completionNotes", () => {
      const html = taskCompletedTemplate(
        `Manager ${xssPayload}`,
        `Emp ${tagPayload}`,
        `TSK-103`,
        `Title <script>`,
        `Done! Verified <script>alert(1)</script>`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<img"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("&lt;img"), true);
    });

    it("taskReminderTemplate escapes employeeName, taskId, title", () => {
      const html = taskReminderTemplate(
        `Emp ${xssPayload}`,
        `TSK-104`,
        `Review logs <script>`,
        "2026-12-31"
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
    });

    it("overdueTicketReminderTemplate escapes employeeName, ticketId, subject, priority", () => {
      const html = overdueTicketReminderTemplate(
        `Emp ${xssPayload}`,
        `TKT-105`,
        `Critical Bug <script>`,
        3,
        `High <alert>`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<alert>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
    });

    it("slaReminderTemplate escapes employeeName, ticketId, subject, priority", () => {
      const html = slaReminderTemplate(
        `Emp ${xssPayload}`,
        `TKT-106`,
        `API slowdown <script>`,
        "2026-12-31T10:00:00Z",
        `Critical <script>`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
    });

    it("escalationTemplate escapes employeeName, taskId, title, managerName", () => {
      const html = escalationTemplate(
        `Emp ${xssPayload}`,
        `TSK-105`,
        `Server crash <script>`,
        `Manager ${tagPayload}`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<img"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("&lt;img"), true);
    });

    it("clientWelcomeTemplate escapes contactName, companyName, tempPassword and preserves redaction", () => {
      const html = clientWelcomeTemplate(
        `Contact ${xssPayload}`,
        `Company <script>Acme</script>`,
        `ClientTemp&<456>`
      );

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("ClientTemp&amp;&lt;456&gt;"), true);

      // Verify redaction in email logs
      const sanitized = sanitizeEmailBody(html);
      assert.strictEqual(sanitized.includes("ClientTemp&amp;&lt;456&gt;"), false);
      assert.strictEqual(sanitized.includes("[REDACTED]"), true);
    });

    it("getDeadlineEmailSubject sanitizes CRLF header injection from subject", () => {
      const subject = getDeadlineEmailSubject({
        recipientName: "Manager",
        recipientRole: "Manager",
        itemType: "Ticket",
        itemId: "T-1",
        titleOrSubject: "Urgent fix\r\nBcc: evil@hacker.com",
        dueDate: "2026-12-31",
        status: "Open",
        stage: "OVERDUE",
        employeeName: "John\r\nCc: evil2@hacker.com",
      });

      assert.strictEqual(subject.includes("\r"), false);
      assert.strictEqual(subject.includes("\n"), false);
      assert.strictEqual(
        subject,
        "[Complify] Ticket Overdue (John Cc: evil2@hacker.com): Urgent fix Bcc: evil@hacker.com"
      );
    });

    it("deadlineNotificationEmailTemplate escapes all dynamic variables", () => {
      const html = deadlineNotificationEmailTemplate({
        recipientName: `Boss ${xssPayload}`,
        recipientRole: "Manager",
        itemType: "Ticket",
        itemId: "TKT-99<script>",
        titleOrSubject: `Outage in production <script>alert(1)</script>`,
        dueDate: "2026-12-31T12:00:00Z",
        status: `In Progress <status>`,
        stage: "OVERDUE",
        employeeName: `Dev ${tagPayload}`,
        clientName: `Acme Corp <LLC>`,
      });

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<status>"), false);
      assert.strictEqual(html.includes("<LLC>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("&lt;status&gt;"), true);
      assert.strictEqual(html.includes("&lt;LLC&gt;"), true);
    });

    it("employeeWeeklyPendingWorkEmailTemplate escapes items in workload tables", () => {
      const html = employeeWeeklyPendingWorkEmailTemplate({
        employeeName: `Engineer ${xssPayload}`,
        weekStartDate: "2026-09-14 <script>",
        totalPending: 1,
        overdueCount: 1,
        dueTodayCount: 0,
        dueTomorrowCount: 0,
        upcomingCount: 0,
        overdueItems: [
          {
            id: "TKT-101",
            type: "Ticket",
            title: `Exploit test <script>alert('xss')</script>`,
            dueDate: "2026-09-10",
            priority: "Critical",
            status: "Open <status>",
            stage: "OVERDUE",
            clientName: `Client <corp>`,
            assignedToName: `Assignee <dev>`,
          },
        ],
        dueTodayItems: [],
        dueTomorrowItems: [],
        upcomingItems: [],
      });

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<status>"), false);
      assert.strictEqual(html.includes("<corp>"), false);
      assert.strictEqual(html.includes("<dev>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("&lt;status&gt;"), true);
    });

    it("managerWeeklyPendingWorkEmailTemplate escapes team members and items", () => {
      const html = managerWeeklyPendingWorkEmailTemplate({
        managerName: `Manager ${xssPayload}`,
        weekStartDate: "2026-09-14",
        totalPending: 1,
        overdueCount: 1,
        dueTodayCount: 0,
        dueTomorrowCount: 0,
        upcomingCount: 0,
        overdueItems: [
          {
            id: "TSK-201",
            type: "Task",
            title: `Task with <b>bold</b> and <script>`,
            dueDate: "2026-09-10",
            priority: "High",
            status: "In Progress",
            stage: "OVERDUE",
          },
        ],
        dueTodayItems: [],
        dueTomorrowItems: [],
        upcomingItems: [],
        teamStats: [
          {
            employeeId: "EMP-1",
            employeeName: `Subordinate ${tagPayload}`,
            totalPending: 1,
            overdueCount: 1,
            dueTodayCount: 0,
            dueTomorrowCount: 0,
            upcomingCount: 0,
          },
        ],
      });

      assert.strictEqual(html.includes("<script>"), false);
      assert.strictEqual(html.includes("<img"), false);
      assert.strictEqual(html.includes("<b>bold</b>"), false);
      assert.strictEqual(html.includes("&lt;script&gt;"), true);
      assert.strictEqual(html.includes("&lt;img"), true);
    });
  });

  // ──────────────────────────────────────────────
  // 3. Central sendEmail & Log Redaction Tests
  // ──────────────────────────────────────────────
  describe("sendEmail Subject Sanitization & Log Redaction", () => {
    it("sendEmail sanitizes CRLF in subject and safely logs email", async () => {
      const recipient = `security-phase8-${Date.now()}@test.com`;
      const injectedSubject = `Important Notice\r\nBcc: evil@injected.com\r\nHeader-Injection: 1`;
      const html = `<p>Test content with escaped input: &lt;script&gt;</p>`;

      // sendEmail should not throw and should sanitize the subject before logging
      await sendEmail(recipient, injectedSubject, html);

      const res = await pool.query(
        `SELECT * FROM email_logs WHERE to_address = $1 ORDER BY created_date DESC LIMIT 1`,
        [recipient]
      );

      assert.strictEqual(res.rows.length, 1);
      const log = res.rows[0];

      // Subject in database log must have NO CRLF
      assert.strictEqual(log.subject.includes("\r"), false);
      assert.strictEqual(log.subject.includes("\n"), false);
      assert.strictEqual(
        log.subject,
        "Important Notice Bcc: evil@injected.com Header-Injection: 1"
      );
    });
  });
});

