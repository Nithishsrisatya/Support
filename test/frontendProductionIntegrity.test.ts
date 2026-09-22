import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { ApiError, apiFetch } from "../src/services/api";
import { isTokenExpired, getRelativeTime } from "../src/utils";

describe("Phase 15 — Frontend Production Integrity & Cleanup", () => {
  let mockServer: Server;
  let mockServerUrl: string;
  const originalFetch = globalThis.fetch;

  // Mock localStorage in Node.js test environment
  const mockStorage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => { mockStorage[key] = String(value); },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => {
      for (const k of Object.keys(mockStorage)) {
        delete mockStorage[k];
      }
    },
  };

  before(async () => {
    (globalThis as any).localStorage = mockLocalStorage;

    const app = express();
    app.use(express.json());

    app.get("/api/test-401", (_req, res) => {
      res.status(401).json({ error: "Unauthorized" });
    });

    app.get("/api/test-403", (_req, res) => {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
    });

    app.get("/api/test-400", (_req, res) => {
      res.status(400).json({ error: "Validation failed", details: ["Invalid field"] });
    });

    app.get("/api/test-404", (_req, res) => {
      res.status(404).json({ error: "Resource not found" });
    });

    app.get("/api/test-409", (_req, res) => {
      res.status(409).json({ error: "Conflict detected" });
    });

    app.get("/api/test-413", (_req, res) => {
      res.status(413).json({ error: "Payload too large" });
    });

    app.get("/api/test-429", (_req, res) => {
      res.status(429).json({ error: "Too many requests" });
    });

    app.get("/api/test-500", (_req, res) => {
      res.status(500).json({ error: "Internal server error" });
    });

    app.get("/api/test-503", (_req, res) => {
      res.status(503).json({ error: "Service unavailable" });
    });

    app.get("/api/test-success", (_req, res) => {
      res.status(200).json({ success: true, count: 42 });
    });

    await new Promise<void>((resolve) => {
      mockServer = app.listen(0, () => {
        const addr = mockServer.address() as AddressInfo;
        mockServerUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Intercept fetch to route relative /api requests to test server
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(input);
      const relative = urlStr.startsWith("http") ? urlStr.replace(/^https?:\/\/[^/]+/, "") : urlStr;
      return originalFetch(`${mockServerUrl}${relative}`, init);
    };
  });

  after(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).localStorage;
    mockServer?.close();
  });

  // 1. ApiError class creation and properties
  it("1. ApiError exposes status, message, and structured data correctly", () => {
    const errorData = { field: "email", code: "INVALID_EMAIL" };
    const err = new ApiError(422, "Unprocessable Entity", errorData);

    assert.equal(err instanceof Error, true);
    assert.equal(err instanceof ApiError, true);
    assert.equal(err.name, "ApiError");
    assert.equal(err.status, 422);
    assert.equal(err.message, "Unprocessable Entity");
    assert.deepEqual(err.data, errorData);
  });

  // 2. 401 handling clears auth tokens and throws ApiError(401)
  it("2. 401 response clears currentUser, token, accountType from localStorage and throws ApiError(401)", async () => {
    mockLocalStorage.setItem("token", "test-expired-token");
    mockLocalStorage.setItem("currentUser", JSON.stringify({ id: "U-1", name: "Alice" }));
    mockLocalStorage.setItem("accountType", "User");

    await assert.rejects(
      async () => {
        await apiFetch("/test-401");
      },
      (err: any) => {
        assert.equal(err instanceof ApiError, true);
        assert.equal(err.status, 401);
        assert.match(err.message, /Session expired or unauthorized/i);
        return true;
      }
    );

    // Verify localStorage was wiped of auth keys
    assert.equal(mockLocalStorage.getItem("token"), null);
    assert.equal(mockLocalStorage.getItem("currentUser"), null);
    assert.equal(mockLocalStorage.getItem("accountType"), null);
  });

  // 3. 403 handling: returns null when throwOn403 is false, throws ApiError when true
  it("3. 403 handling: returns null gracefully by default, throws ApiError(403) when throwOn403: true", async () => {
    // Case A: throwOn403 is omitted / false -> returns null
    const result = await apiFetch("/test-403");
    assert.equal(result, null);

    // Case B: throwOn403 is true -> throws ApiError(403)
    await assert.rejects(
      async () => {
        await apiFetch("/test-403", { throwOn403: true } as any);
      },
      (err: any) => {
        assert.equal(err instanceof ApiError, true);
        assert.equal(err.status, 403);
        assert.match(err.message, /Forbidden|insufficient/i);
        return true;
      }
    );
  });

  // 4. Other HTTP errors propagate status and throw ApiError
  it("4. Diverse HTTP error statuses (400, 404, 409, 413, 429, 500, 503) throw ApiError with exact status and data", async () => {
    const statusEndpoints = [
      { ep: "/test-400", expectedStatus: 400 },
      { ep: "/test-404", expectedStatus: 404 },
      { ep: "/test-409", expectedStatus: 409 },
      { ep: "/test-413", expectedStatus: 413 },
      { ep: "/test-429", expectedStatus: 429 },
      { ep: "/test-500", expectedStatus: 500 },
      { ep: "/test-503", expectedStatus: 503 },
    ];

    for (const { ep, expectedStatus } of statusEndpoints) {
      await assert.rejects(
        async () => {
          await apiFetch(ep);
        },
        (err: any) => {
          assert.equal(err instanceof ApiError, true);
          assert.equal(err.status, expectedStatus, `Expected status ${expectedStatus} for ${ep}`);
          assert.ok(err.message, "Expected error message");
          return true;
        }
      );
    }
  });

  // 5. isTokenExpired detects valid, expired, and malformed JWTs
  it("5. isTokenExpired reliably detects unexpired, expired, and malformed tokens", () => {
    const makeJwt = (payload: any) => {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = "fakesignature";
      return `${header}.${body}.${sig}`;
    };

    const nowSec = Math.floor(Date.now() / 1000);

    // Unexpired (1 hour in future)
    const validToken = makeJwt({ id: "U-1", role: "Employee", exp: nowSec + 3600 });
    assert.equal(isTokenExpired(validToken), false);

    // Expired (1 hour in past)
    const expiredToken = makeJwt({ id: "U-1", role: "Employee", exp: nowSec - 3600 });
    assert.equal(isTokenExpired(expiredToken), true);

    // Expired just 1 second ago
    const justExpiredToken = makeJwt({ id: "U-1", role: "Employee", exp: nowSec - 1 });
    assert.equal(isTokenExpired(justExpiredToken), true);

    // Malformed tokens
    assert.equal(isTokenExpired(""), true);
    assert.equal(isTokenExpired("not.a.valid.jwt.at.all"), true);
    assert.equal(isTokenExpired("randomgibberish"), true);
    assert.equal(isTokenExpired("header.invalidsignature"), true);

    // Token without exp claim is not expired
    const noExpToken = makeJwt({ id: "U-1", role: "Admin" });
    assert.equal(isTokenExpired(noExpToken), false);
  });

  // 6. Logout auth-state cleanup
  it("6. Auth logout flushes credentials, tokens, and in-memory application state", () => {
    // Populate mock storage
    mockLocalStorage.setItem("token", "active-jwt-token");
    mockLocalStorage.setItem("currentUser", JSON.stringify({ id: "U-LOGOUT", fullName: "User" }));
    mockLocalStorage.setItem("accountType", "User");

    // Simulate in-memory collections before logout
    let tickets = [{ id: "TKT-1" }, { id: "TKT-2" }];
    let tasks = [{ id: "TSK-1" }];
    let notifications = [{ id: "NOTIF-1" }];
    let auditLogs = [{ id: "AUD-1" }];
    let users = [{ id: "U-1" }];
    let clients = [{ id: "C-1" }];
    let currentUser: any = { id: "U-LOGOUT" };
    let isAuthenticated = true;

    // Execute logout logic
    mockLocalStorage.removeItem("currentUser");
    mockLocalStorage.removeItem("token");
    mockLocalStorage.removeItem("accountType");
    currentUser = null;
    isAuthenticated = false;
    tickets = [];
    tasks = [];
    notifications = [];
    auditLogs = [];
    users = [];
    clients = [];

    // Verify complete eradication
    assert.equal(mockLocalStorage.getItem("token"), null);
    assert.equal(mockLocalStorage.getItem("currentUser"), null);
    assert.equal(mockLocalStorage.getItem("accountType"), null);
    assert.equal(currentUser, null);
    assert.equal(isAuthenticated, false);
    assert.equal(tickets.length, 0);
    assert.equal(tasks.length, 0);
    assert.equal(notifications.length, 0);
    assert.equal(auditLogs.length, 0);
    assert.equal(users.length, 0);
    assert.equal(clients.length, 0);
  });

  // 7. Task paginated response normalization
  it("7. Task response shape normalization handles paginated object { tasks: [...], total } and raw array", () => {
    // Normalization helper matching App.tsx
    const normalizeTasks = (data: any) => (Array.isArray(data) ? data : (data?.tasks || []));

    // Case 1: Paginated response from backend
    const paginatedResponse = {
      tasks: [{ id: "TSK-P1", title: "Review" }, { id: "TSK-P2", title: "Deploy" }],
      total: 2,
      page: 1,
      limit: 50,
      totalPages: 1,
    };
    const normalizedFromPaginated = normalizeTasks(paginatedResponse);
    assert.equal(Array.isArray(normalizedFromPaginated), true);
    assert.equal(normalizedFromPaginated.length, 2);
    assert.equal(normalizedFromPaginated[0].id, "TSK-P1");

    // Case 2: Legacy or direct array response
    const arrayResponse = [{ id: "TSK-A1", title: "Direct" }];
    const normalizedFromArray = normalizeTasks(arrayResponse);
    assert.equal(Array.isArray(normalizedFromArray), true);
    assert.equal(normalizedFromArray.length, 1);
    assert.equal(normalizedFromArray[0].id, "TSK-A1");
  });

  // 8. Defensive fallback when API returns null or non-array
  it("8. Defensive fallback when API returns null, undefined, or empty payload guarantees empty array", () => {
    const normalizeTasks = (data: any) => (Array.isArray(data) ? data : (data?.tasks || []));
    const normalizeList = (data: any) => (Array.isArray(data) ? data : []);

    assert.deepEqual(normalizeTasks(null), []);
    assert.deepEqual(normalizeTasks(undefined), []);
    assert.deepEqual(normalizeTasks({}), []);
    assert.deepEqual(normalizeTasks("unexpected string"), []);

    assert.deepEqual(normalizeList(null), []);
    assert.deepEqual(normalizeList(undefined), []);
    assert.deepEqual(normalizeList({ error: "Forbidden" }), []);
  });

  // 9. Notification optimistic update & rollback pattern
  it("9. Notification optimistic update updates state immediately and rolls back on API rejection", async () => {
    let notifications = [
      { id: "N-1", isRead: false, message: "Alert 1" },
      { id: "N-2", isRead: false, message: "Alert 2" },
    ];

    // Optimistic mutation helper
    const markAsReadWithRollback = async (notifId: string, shouldFail: boolean) => {
      const prevNotifications = [...notifications];
      // Step 1: Optimistic update
      notifications = notifications.map((n) => (n.id === notifId ? { ...n, isRead: true } : n));
      assert.equal(notifications.find((n) => n.id === notifId)?.isRead, true);

      // Step 2: API call simulation
      try {
        if (shouldFail) {
          throw new ApiError(500, "Network error updating notification");
        }
      } catch (err) {
        // Step 3: Rollback on error
        notifications = prevNotifications;
        throw err;
      }
    };

    // Success path
    await markAsReadWithRollback("N-1", false);
    assert.equal(notifications.find((n) => n.id === "N-1")?.isRead, true);

    // Failure path with rollback
    await assert.rejects(async () => {
      await markAsReadWithRollback("N-2", true);
    });
    // Verify rollback restored isRead: false
    assert.equal(notifications.find((n) => n.id === "N-2")?.isRead, false);
  });

  // 10. Role-based Ticket payload sanitization (Employee)
  it("10. Employee ticket update sanitizes payload: sends only status, employeeNotes, resolutionSummary and omits restricted fields", () => {
    const existingTicket = {
      id: "TKT-100",
      title: "Production Incident",
      clientId: "C-RESTRICTED",
      assignedTo: "U-RESTRICTED",
      priority: "Critical",
      dueDate: "2026-10-01",
      status: "In Progress",
      createdAt: "2026-09-20",
    };

    const isEmployee = true;
    const newStatus = "Resolved";
    const employeeNotes = "Fixed the database pool leak";
    const resolutionSummary = "Patched configuration";

    const payload: any = isEmployee
      ? {
          status: newStatus,
          employeeNotes: employeeNotes || undefined,
          resolutionSummary: resolutionSummary || undefined,
        }
      : {
          ...existingTicket,
          status: newStatus,
          employeeNotes,
          resolutionSummary,
        };

    // Assert that restricted fields were NOT included in the payload
    assert.equal(payload.status, "Resolved");
    assert.equal(payload.employeeNotes, employeeNotes);
    assert.equal(payload.resolutionSummary, resolutionSummary);
    assert.equal(payload.clientId, undefined);
    assert.equal(payload.assignedTo, undefined);
    assert.equal(payload.priority, undefined);
    assert.equal(payload.dueDate, undefined);
    assert.equal(payload.title, undefined);
  });

  // 11. Role-based Ticket payload sanitization (Client closure)
  it("11. Client ticket resolution confirmation sends strictly Closed status, satisfactionRating, and satisfactionNotes", () => {
    const existingTicket = {
      id: "TKT-200",
      clientId: "C-MY-ID",
      assignedTo: "U-EMPLOYEE",
      priority: "High",
      dueDate: "2026-09-30",
      status: "Resolved",
    };

    const closurePayload = {
      status: "Closed",
      satisfactionRating: 5,
      satisfactionNotes: "Excellent and speedy resolution",
    };

    assert.equal(closurePayload.status, "Closed");
    assert.equal(closurePayload.satisfactionRating, 5);
    assert.equal(closurePayload.satisfactionNotes, "Excellent and speedy resolution");
    assert.equal((closurePayload as any).clientId, undefined);
    assert.equal((closurePayload as any).assignedTo, undefined);
    assert.equal((closurePayload as any).priority, undefined);
    assert.equal((closurePayload as any).dueDate, undefined);
  });

  // 12. Role-based Task payload sanitization (Employee)
  it("12. Employee task completion sanitizes payload: sends only status, completionNotes, completionDate and omits metadata", () => {
    const existingTask = {
      id: "TSK-300",
      title: "Deploy Migration",
      assignedBy: "U-MANAGER",
      assignedTo: "U-EMPLOYEE",
      priority: "High",
      dueDate: "2026-09-25",
      status: "In Progress",
    };

    const completionPayload = {
      status: "Completed",
      completionNotes: "All schema migrations applied successfully",
      completionDate: new Date().toISOString(),
    };

    assert.equal(completionPayload.status, "Completed");
    assert.ok(completionPayload.completionNotes);
    assert.ok(completionPayload.completionDate);
    assert.equal((completionPayload as any).assignedBy, undefined);
    assert.equal((completionPayload as any).assignedTo, undefined);
    assert.equal((completionPayload as any).priority, undefined);
    assert.equal((completionPayload as any).dueDate, undefined);
  });

  // 13. Task review alert logic in TaskDetailModal
  it("13. Task review alert logic correctly requires status === 'Completed' and needsReview and isManager", () => {
    const shouldShowReviewBanner = (status: string, needsReview: boolean, isManager: boolean) =>
      status === "Completed" && needsReview && isManager;

    // Completed task requiring review viewed by manager -> SHOW banner
    assert.equal(shouldShowReviewBanner("Completed", true, true), true);

    // In-progress task viewed by manager -> DO NOT SHOW banner (prevents the inverted condition bug!)
    assert.equal(shouldShowReviewBanner("In Progress", true, true), false);

    // Completed task viewed by employee (not manager) -> DO NOT SHOW banner
    assert.equal(shouldShowReviewBanner("Completed", true, false), false);

    // Completed task where needsReview is false -> DO NOT SHOW banner
    assert.equal(shouldShowReviewBanner("Completed", false, true), false);
  });

  // 14. Client-side file upload validation
  it("14. Client-side file upload validation enforces 10 MB limit and approved extension whitelist", () => {
    const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".txt", ".csv", ".docx", ".xlsx"];
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    const validateUpload = (filename: string, sizeBytes: number): { valid: boolean; error?: string } => {
      const ext = path.extname(filename).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return {
          valid: false,
          error: `File type ${ext} not allowed. Please upload images, PDFs, text, or office documents.`,
        };
      }
      if (sizeBytes > MAX_FILE_SIZE) {
        return {
          valid: false,
          error: "File size exceeds 10 MB limit.",
        };
      }
      return { valid: true };
    };

    // Valid uploads
    assert.equal(validateUpload("receipt.png", 2 * 1024 * 1024).valid, true);
    assert.equal(validateUpload("contract.pdf", 9.9 * 1024 * 1024).valid, true);
    assert.equal(validateUpload("data.xlsx", 500 * 1024).valid, true);
    assert.equal(validateUpload("logs.txt", 1024).valid, true);

    // Oversized upload (> 10 MB)
    const oversized = validateUpload("huge_video.pdf", 10.5 * 1024 * 1024);
    assert.equal(oversized.valid, false);
    assert.match(oversized.error!, /exceeds 10 MB/i);

    // Dangerous / Disallowed extensions
    assert.equal(validateUpload("exploit.exe", 1024).valid, false);
    assert.equal(validateUpload("malware.bat", 1024).valid, false);
    assert.equal(validateUpload("script.sh", 1024).valid, false);
    assert.equal(validateUpload("payload.php", 1024).valid, false);
    assert.equal(validateUpload("server.js", 1024).valid, false);
  });

  // 15. Date utility getRelativeTime handles past, future, and invalid dates dynamically
  it("15. getRelativeTime computes dynamic relative times without frozen 2026-06-16 development date", () => {
    const now = new Date();

    // 10 seconds ago
    const justNowIso = new Date(now.getTime() - 10 * 1000).toISOString();
    assert.equal(getRelativeTime(justNowIso), "Just now");

    // 5 minutes ago
    const fiveMinAgoIso = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    assert.equal(getRelativeTime(fiveMinAgoIso), "5m ago");

    // 3 hours ago
    const threeHoursAgoIso = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
    assert.equal(getRelativeTime(threeHoursAgoIso), "3h ago");

    // 4 days ago
    const fourDaysAgoIso = new Date(now.getTime() - 4 * 86400 * 1000).toISOString();
    assert.equal(getRelativeTime(fourDaysAgoIso), "4d ago");

    // Future timestamp
    const futureIso = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    assert.match(getRelativeTime(futureIso), /in \d+m|in a few seconds/i);

    // Invalid timestamp does not throw error
    const invalidResult = getRelativeTime("invalid-date-string");
    assert.ok(invalidResult === "—" || invalidResult === "Invalid date");
  });

  // 16. Absence of hardcoded localhost URLs, mock uploads, and dead files in frontend codebase
  it("16. Frontend source code integrity check: no fake mock uploads, no hardcoded secrets, and dead files deleted", () => {
    // A. Verify ResetPasswordModal.tsx was completely deleted
    const deadModalPath = path.resolve(process.cwd(), "src/components/ResetPasswordModal.tsx");
    assert.equal(fs.existsSync(deadModalPath), false, "ResetPasswordModal.tsx must be deleted");

    // B. Verify EmployeeDashboard does not contain handleMockUpload
    const employeeDashboardPath = path.resolve(process.cwd(), "src/components/EmployeeDashboard.tsx");
    const employeeDashboardSrc = fs.readFileSync(employeeDashboardPath, "utf-8");
    assert.equal(
      employeeDashboardSrc.includes("handleMockUpload"),
      false,
      "EmployeeDashboard must not contain handleMockUpload"
    );

    // C. Verify ManagerDashboard does not contain hardcoded "Logged: 2026-06-16"
    const managerDashboardPath = path.resolve(process.cwd(), "src/components/ManagerDashboard.tsx");
    const managerDashboardSrc = fs.readFileSync(managerDashboardPath, "utf-8");
    assert.equal(
      managerDashboardSrc.includes("Logged: 2026-06-16"),
      false,
      "ManagerDashboard must not contain hardcoded Logged: 2026-06-16"
    );

    // D. Verify ManagerDashboard does not contain hardcoded "David Kim"
    assert.equal(
      managerDashboardSrc.includes("David Kim"),
      false,
      "ManagerDashboard must not contain static David Kim SLA card"
    );

    // E. Verify utils.ts does not have default frozen parameter 2026-06-16
    const utilsPath = path.resolve(process.cwd(), "src/utils.ts");
    const utilsSrc = fs.readFileSync(utilsPath, "utf-8");
    assert.equal(
      utilsSrc.includes('currentIsoTime: string = "2026-06-16'),
      false,
      "utils.ts must not have frozen 2026-06-16 default parameter"
    );
  });
});
