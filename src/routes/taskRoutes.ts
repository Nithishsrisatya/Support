import { Router } from "express";
import {
  getAllTasks,
  getTasksForManager,
  getTasksForEmployee,
  searchTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateTaskProgress,
  reviewTask,
  checkTaskOverdue,
  checkAllOverdueTasks,
  getTaskProgressUpdates,
  reopenTask,
  isTerminalTaskStatus,
} from "../services/taskService";
import {
  getTaskHistory,
} from "../services/taskHistoryService";
import {
  getTaskAttachments,
  getTaskAttachmentById,
  createTaskAttachment,
  deleteTaskAttachment,
} from "../services/taskAttachmentService";
import {
  upload,
  createUploadMiddleware,
  deleteFile,
  getFilePath,
  resolveAttachmentFilePath,
  validateFileContent,
  getSafeContentDisposition,
  isSafeInlinePreviewType,
} from "../services/fileUploadService";
import { authenticateToken } from "../middleware/authMiddleware";
import { authorizeRoles } from "../middleware/roleMiddleware";
import { sendEmail } from "../services/emailService";
import {
  taskAssignedTemplate,
  taskCompletedTemplate,
  escalationTemplate,
  taskReminderTemplate,
  taskUpdatedTemplate,
} from "../templates/operationalEmails";
import { logAuditEvent } from "../services/auditLogService";
import { uploadLimiter } from "../middleware/rateLimiter";
import { pool } from "../db";
import path from "path";
import fs from "fs";
import {
  isPlainObject,
  isNonEmptyString,
  isString,
  isEnum,
  isNumber,
  isValidDateString,
  isStringArray,
  isValidId,
  filterAllowedFields,
  isValidDateRange,
} from "../utils/validator";
import { handleDatabaseError } from "../utils/dbErrorHandler";
const router = Router();

// Helper for authorizing task access based on user role
async function authorizeTaskAccess(user: any, taskId: string, { allowUnassignedManager = false } = {}) {
  if (!isValidId(taskId)) {
    return { canAccess: false, task: null, status: 400 };
  }
  const task = await getTaskById(taskId);
  if (!task) {
    return { canAccess: false, task: null, status: 404 };
  }

  const role = String(user?.role ?? "").trim();
  let canAccess = false;

  if (role === "Administrator") {
    canAccess = true;
  } else if (role === "Manager") {
    if (String(task.assignedBy) === String(user.id) || String(task.assignedTo) === String(user.id)) {
      canAccess = true;
    } else {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map(r => r.id);
      canAccess = teamIds.includes(task.assignedTo);
      if (allowUnassignedManager && task.assignedTo === null) {
        canAccess = true;
      }
    }
  } else if (role === "Employee") {
    canAccess = String(task.assignedTo) === String(user.id);
  }

  if (!canAccess) {
    return { canAccess: false, task, status: 403 };
  }

  return { canAccess: true, task, status: 200 };
}


// GET /api/tasks
router.get("/", authenticateToken,
authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    // Check if pagination or filtering query params were requested
    const hasPaginationOrFilter = req.query.page !== undefined || req.query.limit !== undefined || req.query.search !== undefined || req.query.status !== undefined || req.query.priority !== undefined;

    if (hasPaginationOrFilter) {
      const filters: any = {
        search: typeof req.query.search === "string" ? req.query.search : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        priority: typeof req.query.priority === "string" ? req.query.priority : undefined,
        page: req.query.page !== undefined ? parseInt(String(req.query.page), 10) : 1,
        limit: req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : 50,
      };

      if (role === "Manager") {
        const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
        const teamIds = teamResult.rows.map(r => r.id);
        teamIds.push(user.id);
        filters.assignedToIn = teamIds;
      } else if (role === "Employee") {
        filters.assignedTo = user.id;
      }

      const result = await searchTasks(filters);
      return res.json(result);
    }

    if (role === "Administrator") {
      const allTasks = await getAllTasks();
      return res.json(allTasks);
    }

    if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map(r => r.id);
      teamIds.push(user.id);
      const managerTasks = await getTasksForManager(teamIds, user.id);
      return res.json(managerTasks);
    }

    if (role === "Employee") {
      const employeeTasks = await getTasksForEmployee(user.id);
      return res.json(employeeTasks);
    }

    return res.status(403).json({ success: false, message: "Forbidden" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch tasks.",
    });
  }
});

// GET /api/tasks/:id
router.get("/:id", authenticateToken,
authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id, { allowUnassignedManager: true });

    if (status === 400) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID format.",
      });
    }

    if (status === 404) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    if (status === 403 || !canAccess) {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch task.",
    });
  }
});

// POST /api/tasks
router.post("/", authenticateToken,
  authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body.",
      });
    }

    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    const allowed = filterAllowedFields<any>(req.body, [
      "id",
      "title",
      "description",
      "taskCategory",
      "priority",
      "dueDate",
      "startDate",
      "assignedTo",
      "assignedBy",
    ]);

    if (role === "Manager") {
      allowed.assignedBy = user.id;
      if (allowed.assignedTo) {
        const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
        const allowedAssignees = teamResult.rows.map((r: any) => r.id);
        allowedAssignees.push(user.id);
        if (!allowedAssignees.includes(allowed.assignedTo)) {
          return res.status(403).json({
            success: false,
            message: "Managers can only assign tasks to supervised team members or themselves.",
          });
        }
      }
    }

    const { id, title, description, taskCategory, priority, dueDate, assignedTo, startDate, assignedBy } = allowed;

    if (id !== undefined && !isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID format.",
      });
    }

    if (!isNonEmptyString(title, 255)) {
      return res.status(400).json({
        success: false,
        message: "Title is required (max 255 characters).",
      });
    }

    if (description !== undefined && (!isString(description, 10000))) {
      return res.status(400).json({
        success: false,
        message: "Description must be a string (max 10000 characters).",
      });
    }

    if (taskCategory !== undefined && !isEnum(taskCategory, ["Operational", "Support", "Administrative", "Documentation", "Compliance"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Valid task category is required.",
      });
    }

    if (priority !== undefined && !isEnum(priority, ["Low", "Medium", "High", "Critical"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Valid priority is required.",
      });
    }

    if (dueDate !== undefined && dueDate !== null && !isValidDateString(dueDate)) {
      return res.status(400).json({
        success: false,
        message: "Valid due date is required.",
      });
    }

    if (startDate !== undefined && startDate !== null && !isValidDateString(startDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid start date format.",
      });
    }

    if (startDate && dueDate) {
      const range = isValidDateRange(startDate, dueDate);
      if (!range.valid) {
        return res.status(400).json({
          success: false,
          message: "Start date must be earlier than or equal to due date.",
        });
      }
    }

    if (assignedTo !== undefined && assignedTo !== null && !isValidId(assignedTo)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignedTo format.",
      });
    }

    if (assignedBy !== undefined && assignedBy !== null && !isValidId(assignedBy)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignedBy format.",
      });
    }

    if (!allowed.id) {
      allowed.id = `TSK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    }
    if (!allowed.status) {
      allowed.status = "Pending";
    }

    const task = await createTask(allowed);

    res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to create task.");
  }
});

// PUT /api/tasks/:id
router.put("/:id", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request body.",
      });
    }

    const taskId = req.params.id;
    if (!isValidId(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID format.",
      });
    }

    const updates = filterAllowedFields<any>(req.body, [
      "id",
      "title",
      "description",
      "taskCategory",
      "priority",
      "status",
      "dueDate",
      "startDate",
      "assignedTo",
      "progressPercentage",
      "reviewStatus",
      "completionNotes",
    ]);

    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    // IDOR Prevention: Prevent body ID vs URL param mismatch
    if (updates.id !== undefined && String(updates.id) !== String(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Task ID in request body does not match URL parameter.",
      });
    }

    if (updates.taskCategory !== undefined && !isEnum(updates.taskCategory, ["Operational", "Support", "Administrative", "Documentation", "Compliance"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task category.",
      });
    }

    if (updates.priority !== undefined && !isEnum(updates.priority, ["Low", "Medium", "High", "Critical"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task priority.",
      });
    }

    if (updates.status !== undefined && !isEnum(updates.status, ["Pending", "Assigned", "In Progress", "Completed", "Overdue", "Escalated"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task status.",
      });
    }

    if (updates.dueDate !== undefined && updates.dueDate !== null && !isValidDateString(updates.dueDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid due date format.",
      });
    }

    if (updates.startDate !== undefined && updates.startDate !== null && !isValidDateString(updates.startDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid start date format.",
      });
    }

    if (updates.startDate && updates.dueDate) {
      const range = isValidDateRange(updates.startDate, updates.dueDate);
      if (!range.valid) {
        return res.status(400).json({
          success: false,
          message: "Start date must be earlier than or equal to due date.",
        });
      }
    }

    if (updates.assignedTo !== undefined && updates.assignedTo !== null && !isValidId(updates.assignedTo)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignedTo format.",
      });
    }

    if (updates.progressPercentage !== undefined && !isNumber(updates.progressPercentage, { min: 0, max: 100 })) {
      return res.status(400).json({
        success: false,
        message: "Progress percentage must be a number between 0 and 100.",
      });
    }

    if (updates.reviewStatus !== undefined && !isEnum(updates.reviewStatus, ["Pending Review", "Approved", "Rejected"] as const)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review status.",
      });
    }

    if (updates.title !== undefined && (!isString(updates.title, 255) || !updates.title.trim())) {
      return res.status(400).json({
        success: false,
        message: "Title cannot be empty (max 255 characters).",
      });
    }

    if (updates.description !== undefined && (!isString(updates.description, 10000) || !updates.description.trim())) {
      return res.status(400).json({
        success: false,
        message: "Description cannot be empty (max 10000 characters).",
      });
    }

    if (updates.completionNotes !== undefined && !isString(updates.completionNotes, 5000)) {
      return res.status(400).json({
        success: false,
        message: "Completion notes must be a string (max 5000 characters).",
      });
    }

    const { canAccess, task: existingTask, status } = await authorizeTaskAccess(user, taskId, { allowUnassignedManager: true });
    if (status === 400) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID format.",
      });
    }
    if (status === 404) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }
    if (status === 403 || !canAccess) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    // Role-based reassignment boundary check
    if (role === "Manager") {
      if (updates.assignedTo !== undefined && updates.assignedTo !== existingTask.assignedTo && updates.assignedTo !== null) {
        const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
        const allowedAssignees = teamResult.rows.map((r: any) => r.id);
        allowedAssignees.push(user.id);
        if (!allowedAssignees.includes(updates.assignedTo)) {
          return res.status(403).json({
            success: false,
            message: "Managers can only assign tasks to supervised team members or themselves.",
          });
        }
      }
    } else if (role === "Employee") {
      if (updates.assignedTo !== undefined && updates.assignedTo !== existingTask.assignedTo) {
        return res.status(403).json({
          success: false,
          message: "Employees cannot reassign tasks.",
        });
      }
    }

    // Lifecycle rule: Completed tasks cannot be assigned or reassigned without reopening
    if (existingTask.status === "Completed") {
      const isReopening = updates.status && updates.status !== "Completed" && updates.status !== "Escalated";
      const isChangingAssignee = updates.assignedTo !== undefined && updates.assignedTo !== existingTask.assignedTo;
      if (!isReopening && (isChangingAssignee || updates.status === "Assigned")) {
        return res.status(400).json({
          success: false,
          message: "Completed tasks cannot be assigned.",
        });
      }
    }

    // Extract the user making the request from the JWT payload
    const userId = user ? user.id : "SYS";
    const userFullName = user ? user.fullName : "Unknown User";

    // Dynamically generate an audit log comment based on the action
    let action = "Task Update";
    let logDescription = "Task details were updated.";

    if (updates.status === "Assigned") {
      action = "Task Assignment";
      logDescription = `Task assigned to employee for execution.`;
    } else if (updates.status === "In Progress") {
      action = "Task Update";
      logDescription = `Work commenced on this task.`;
    } else if (updates.status === "Completed") {
      action = "Task Update";
      logDescription = `Task successfully completed. Notes: ${updates.completionNotes || "None provided"}`;
      // Auto-stamp the completion date
      updates.completionDate = new Date().toISOString(); 
    } else if (updates.status === "Escalated") {
      action = "Task Update";
      logDescription = `WARNING: Task has been escalated to management!`;
    }

    // Pass everything to our new transaction service
    const task = await updateTask(taskId, updates, userId, userFullName, action, logDescription);

    // ==========================================
    // ✉️ EMAIL TRIGGERS
    // ==========================================
    if (updates.status === "Assigned" && updates.assignedTo) {
      pool.query('SELECT full_name AS "fullName", email FROM users WHERE id = $1', [updates.assignedTo])
        .then(empRes => {
          if (empRes.rows.length > 0) {
            const emp = empRes.rows[0];
            const html = taskAssignedTemplate(emp.fullName, task.id, task.title, task.dueDate);
            sendEmail(emp.email, `New Task Assigned: ${task.title}`, html);
          }
        }).catch(err => console.error("Task assigned email failed:", err));
    }

    // ✉️ Task Completed → notify manager
    if (updates.status === "Completed") {
      // Find the assignedBy user (the manager who assigned the task)
      const assignedById = task.assignedBy;
      if (assignedById) {
        pool.query('SELECT full_name AS "fullName", email FROM users WHERE id = $1', [assignedById])
          .then(mgrRes => {
            if (mgrRes.rows.length > 0) {
              const mgr = mgrRes.rows[0];
              // Get the employee name who completed it
              pool.query('SELECT full_name AS "fullName" FROM users WHERE id = $1', [updates.assignedTo || task.assignedTo])
                .then(empNameRes => {
                  const empName = empNameRes.rows.length > 0 ? empNameRes.rows[0].fullName : "Employee";
                  const html = taskCompletedTemplate(
                    mgr.fullName,
                    empName,
                    task.id,
                    task.title,
                    updates.completionNotes || task.completionNotes || ""
                  );
                  sendEmail(mgr.email, `Task Completed: ${task.title}`, html);
                }).catch(err => console.error("Task completed employee name query failed:", err));
            }
          }).catch(err => console.error("Task completed email failed:", err));
      }
    }

    // ✉️ Task Updated → notify the assigned employee (non-status changes)
    const isStatusChange = ["Assigned", "In Progress", "Completed", "Escalated"].includes(updates.status);
    if (!isStatusChange && task.assignedTo) {
      const assignedToId = updates.assignedTo || task.assignedTo;
      if (assignedToId) {
        pool.query('SELECT full_name AS "fullName", email FROM users WHERE id = $1', [assignedToId])
          .then(empRes => {
            if (empRes.rows.length > 0) {
              const emp = empRes.rows[0];
              const changes = Object.keys(updates)
                .filter(k => k !== 'assignedTo')
                .map(k => `${k}: ${updates[k]}`)
                .join(', ');
              const html = taskUpdatedTemplate(emp.fullName, task.id, task.title, userFullName, changes || 'Task details updated');
              sendEmail(emp.email, `Task Updated: ${task.title}`, html);
            }
          }).catch(err => console.error("Task updated email failed:", err));
      }
    }

    // ✉️ Task Escalated → notify the assigned employee
    if (updates.status === "Escalated") {
      const assignedToId = updates.assignedTo || task.assignedTo;
      const assignedById = task.assignedBy;
      if (assignedToId) {
        pool.query('SELECT full_name AS "fullName", email FROM users WHERE id = $1', [assignedToId])
          .then(empRes => {
            if (empRes.rows.length > 0) {
              const emp = empRes.rows[0];
              // Get manager name
              let managerName = "Management";
              if (assignedById) {
                pool.query('SELECT full_name AS "fullName" FROM users WHERE id = $1', [assignedById])
                  .then(mgrRes => {
                    if (mgrRes.rows.length > 0) managerName = mgrRes.rows[0].fullName;
                    const html = escalationTemplate(emp.fullName, task.id, task.title, managerName);
                    sendEmail(emp.email, `Task Escalated: ${task.title}`, html);
                  }).catch(() => {
                    const html = escalationTemplate(emp.fullName, task.id, task.title, managerName);
                    sendEmail(emp.email, `Task Escalated: ${task.title}`, html);
                  });
              } else {
                const html = escalationTemplate(emp.fullName, task.id, task.title, managerName);
                sendEmail(emp.email, `Task Escalated: ${task.title}`, html);
              }
            }
          }).catch(err => console.error("Task escalation email failed:", err));
      }
    }
    // ==========================================

    res.json({
      success: true,
      task,
    });

  } catch (error: any) {
    if (error?.message === "Completed tasks cannot be assigned.") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    return handleDatabaseError(error, res, "Failed to update task and log audit history.");
  }
});

// POST /api/tasks/:id/reopen - Reopen a completed task
router.post("/:id/reopen", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const taskId = req.params.id;
    if (!isValidId(taskId)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const user = (req as any).user;

    const { canAccess, task, status } = await authorizeTaskAccess(user, taskId);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }

    if (task.status !== "Completed") {
      return res.status(400).json({ success: false, message: "Only completed tasks can be reopened." });
    }

    if (req.body.comment !== undefined && (!isString(req.body.comment, 2000))) {
      return res.status(400).json({ success: false, message: "Comment must be a string (max 2000 characters)." });
    }

    const comment = req.body?.comment || "Task reopened";
    const reopened = await reopenTask(taskId, user.id, user.fullName || "User", comment);

    res.json({
      success: true,
      message: `Task ${taskId} has been reopened.`,
      task: reopened,
    });
  } catch (error: any) {
    return handleDatabaseError(error, res, "Failed to reopen task.");
  }
});

// POST /api/tasks/:id/remind - Send task reminder email
router.post("/:id/remind", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const taskId = req.params.id;
    if (!isValidId(taskId)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, taskId);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found." });
    }

    if (task.status === "Completed") {
      return res.status(400).json({ success: false, message: "Cannot send reminders for completed tasks." });
    }

    const assignedToId = task.assignedTo;
    if (!assignedToId) {
      return res.status(400).json({ success: false, message: "Task has no assignee." });
    }

    pool.query('SELECT full_name AS "fullName", email FROM users WHERE id = $1', [assignedToId])
      .then(empRes => {
        if (empRes.rows.length > 0) {
          const emp = empRes.rows[0];
          const html = taskReminderTemplate(
            emp.fullName,
            task.id,
            task.title,
            task.dueDate
          );
          sendEmail(emp.email, `Reminder: Task ${task.id} - ${task.title}`, html);
        }
      }).catch(err => console.error("Task reminder email failed:", err));

    res.json({ success: true, message: "Reminder email sent." });
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to send reminder.");
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", authenticateToken, authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    await deleteTask(req.params.id);

    res.json({
      success: true,
      message: "Task deleted successfully.",
    });
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to delete task.");
  }
});

// ─── TASK PROGRESS UPDATE ───────────────────────────────────────────────
// POST /api/tasks/:id/progress - Submit a progress update
router.post("/:id/progress", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const taskId = req.params.id;
    if (!isValidId(taskId)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const { progressPercentage, comment } = req.body;
    const user = (req as any).user;

    const { canAccess, task, status } = await authorizeTaskAccess(user, taskId);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (!isNumber(progressPercentage, { min: 0, max: 100 })) {
      return res.status(400).json({ success: false, message: "Progress percentage must be between 0 and 100." });
    }

    if (comment !== undefined && (!isString(comment, 2000))) {
      return res.status(400).json({ success: false, message: "Comment must be a string (max 2000 characters)." });
    }

    const result = await updateTaskProgress(
      taskId,
      progressPercentage,
      comment || "",
      user.id,
      user.fullName
    );

    res.json(result);
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to update task progress.");
  }
});

// GET /api/tasks/:id/progress - Get progress updates for a task
router.get("/:id/progress", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const updates = await getTaskProgressUpdates(req.params.id);
    res.json(updates);
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to fetch progress updates.");
  }
});

// ─── TASK ATTACHMENTS ──────────────────────────────────────────────────
// POST /api/tasks/:id/attachments - Upload attachment
router.post("/:id/attachments", uploadLimiter, authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), createUploadMiddleware("file"), async (req, res) => {
  try {
    const taskId = req.params.id;
    if (!isValidId(taskId)) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const user = (req as any).user;

    const { canAccess, task, status } = await authorizeTaskAccess(user, taskId);
    if (status === 400) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    if (status === 404) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(404).json({ success: false, message: "Task not found." });
    }
    if (status === 403) {
      if (req.file?.path) deleteFile(req.file.path);
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file provided." });
    }

    // Magic-byte content validation
    const validation = await validateFileContent(req.file.path, req.file.originalname, req.file.mimetype);
    if (!validation.valid) {
      deleteFile(req.file.path);
      return res.status(400).json({
        success: false,
        message: validation.reason || "Invalid file content.",
      });
    }

    let created;
    try {
      const attachment = {
        id: crypto.randomUUID(),
        taskId,
        fileName: req.file.originalname,
        filePath: req.file.filename,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: user.id,
        uploadedByName: user.fullName || "User",
      };

      created = await createTaskAttachment(attachment);

      // Write to task_history
      await pool.query(
        `INSERT INTO task_history (task_id, type, timestamp, user_full_name, description, metadata)
         VALUES ($1, 'attachment', NOW(), $2, $3, $4)`,
        [taskId, user.fullName || "User", `File uploaded: ${req.file.originalname}`, JSON.stringify({ fileName: req.file.originalname, fileSize: req.file.size })]
      );
    } catch (dbErr) {
      deleteFile(req.file.path);
      throw dbErr;
    }

    res.status(201).json({
      success: true,
      attachment: {
        id: created.id,
        taskId: created.taskId,
        fileName: created.fileName,
        fileSize: Number(created.fileSize),
        mimeType: created.mimeType,
        uploadedBy: created.uploadedBy,
        uploadedByName: created.uploadedByName,
        createdDate: created.createdDate,
      },
    });
  } catch (error: any) {
    if (req.file?.path) deleteFile(req.file.path);
    return handleDatabaseError(error, res, "Failed to upload attachment.");
  }
});

// GET /api/tasks/:id/attachments - List attachments
router.get("/:id/attachments", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const { canAccess, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const attachments = await getTaskAttachments(req.params.id);
    const safeAttachments = attachments.map((att: any) => ({
      id: att.id,
      taskId: att.taskId,
      fileName: att.fileName,
      fileSize: Number(att.fileSize),
      mimeType: att.mimeType,
      uploadedBy: att.uploadedBy,
      uploadedByName: att.uploadedByName,
      createdDate: att.createdDate,
    }));
    res.json(safeAttachments);
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to fetch attachments.");
  }
});

// GET /api/tasks/:id/attachments/:attachmentId/preview - Preview attachment inline
router.get("/:id/attachments/:attachmentId/preview", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.attachmentId)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }
    const { canAccess, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const attachment = await getTaskAttachmentById(req.params.attachmentId);
    if (!attachment || attachment.taskId !== req.params.id) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    const resolvedPath = resolveAttachmentFilePath(attachment.filePath);
    if (!resolvedPath) {
      return res.status(404).json({ success: false, message: "File not found on disk." });
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

    const mime = attachment.mimeType || "application/octet-stream";
    if (isSafeInlinePreviewType(mime)) {
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", getSafeContentDisposition(attachment.fileName, "inline"));
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", getSafeContentDisposition(attachment.fileName, "attachment"));
    }

    res.sendFile(resolvedPath);
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to preview attachment.");
  }
});

// GET /api/tasks/:id/attachments/:attachmentId/download - Download attachment
router.get("/:id/attachments/:attachmentId/download", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.attachmentId)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }
    const { canAccess, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const attachment = await getTaskAttachmentById(req.params.attachmentId);
    if (!attachment || attachment.taskId !== req.params.id) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    const resolvedPath = resolveAttachmentFilePath(attachment.filePath);
    if (!resolvedPath) {
      return res.status(404).json({ success: false, message: "File not found on disk." });
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Disposition", getSafeContentDisposition(attachment.fileName, "attachment"));

    res.download(resolvedPath, attachment.fileName);
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to download attachment.");
  }
});

// DELETE /api/tasks/:id/attachments/:attachmentId - Delete attachment
router.delete("/:id/attachments/:attachmentId", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.attachmentId)) {
      return res.status(400).json({ success: false, message: "Invalid ID format." });
    }
    const user = (req as any).user;
    const { canAccess, status } = await authorizeTaskAccess(user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const attachment = await getTaskAttachmentById(req.params.attachmentId);
    if (!attachment || attachment.taskId !== req.params.id) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }

    await deleteTaskAttachment(req.params.attachmentId);
    deleteFile(attachment.filePath);

    res.json({ success: true, message: "Attachment deleted successfully." });
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to delete attachment.");
  }
});

// ─── TASK HISTORY / TIMELINE ───────────────────────────────────────────
// GET /api/tasks/:id/history - Get task timeline
router.get("/:id/history", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const history = await getTaskHistory(req.params.id);
    res.json(history);
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to fetch task history.");
  }
});

// ─── MANAGER REVIEW ────────────────────────────────────────────────────
// PUT /api/tasks/:id/review - Manager review (approve/reject)
router.put("/:id/review", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isPlainObject(req.body)) {
      return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const taskId = req.params.id;
    if (!isValidId(taskId)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const { reviewStatus, managerNotes } = req.body;
    const user = (req as any).user;

    const { canAccess, task, status } = await authorizeTaskAccess(user, taskId);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (!isEnum(reviewStatus, ["Pending Review", "Approved", "Rejected"] as const)) {
      return res.status(400).json({ success: false, message: "Invalid review status. Must be: Pending Review, Approved, or Rejected." });
    }

    if (managerNotes !== undefined && (!isString(managerNotes, 5000))) {
      return res.status(400).json({ success: false, message: "Manager notes must be a string (max 5000 characters)." });
    }

    const result = await reviewTask(taskId, reviewStatus, managerNotes || "", user.id, user.fullName);
    res.json({ success: true, task: result });
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to review task.");
  }
});

// ─── OVERDUE DETECTION ────────────────────────────────────────────────
// POST /api/tasks/:id/check-overdue - Check if task is overdue
router.post("/:id/check-overdue", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid task ID format." });
    }
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 400) return res.status(400).json({ success: false, message: "Invalid task ID format." });
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const result = await checkTaskOverdue(req.params.id);
    res.json(result);
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to check overdue status.");
  }
});

// POST /api/tasks/check-all-overdue - Check all tasks for overdue (Administrator only)
router.post("/check-all-overdue", authenticateToken, authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    const results = await checkAllOverdueTasks();
    res.json({ success: true, results });
  } catch (error) {
    return handleDatabaseError(error, res, "Failed to check all overdue tasks.");
  }
});

// ============================================================
// POST /api/tasks/bulk - Bulk Actions
// ============================================================
router.post("/bulk", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
    if (!isPlainObject(req.body)) {
        return res.status(400).json({ success: false, message: "Invalid request body." });
    }
    const { action, ids, payload } = req.body;
    const user = (req as any).user;
    const role = String(user?.role ?? "").trim();

    if (!isNonEmptyString(action, 50) || !isStringArray(ids, { minItems: 1 })) {
        return res.status(400).json({ success: false, message: "Action and a non-empty array of IDs are required." });
    }

    if (ids.length > 100 || !ids.every((id: string) => isValidId(id))) {
        return res.status(400).json({ success: false, message: "Invalid IDs in bulk request (max 100 valid IDs)." });
    }

    if (payload !== undefined && !isPlainObject(payload)) {
        return res.status(400).json({ success: false, message: "Payload must be an object." });
    }

    if (action === 'assign' && payload?.assigneeId && !isValidId(payload.assigneeId)) {
        return res.status(400).json({ success: false, message: "Invalid assignee ID format." });
    }

    if (action === 'updateStatus' && payload?.status && !isEnum(payload.status, ["Pending", "Assigned", "In Progress", "Completed", "Overdue", "Escalated"] as const)) {
        return res.status(400).json({ success: false, message: "Invalid task status." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (role === "Manager") {
            const teamResult = await client.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
            const teamIds = teamResult.rows.map((r: any) => r.id);
            teamIds.push(user.id);

            const scopeCheck = await client.query(
                `SELECT id FROM tasks WHERE id = ANY($1::text[]) AND (assigned_to = ANY($2::varchar[]) OR assigned_by = $3 OR assigned_to IS NULL)`,
                [ids, teamIds, user.id]
            );
            if (scopeCheck.rows.length !== ids.length) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    success: false,
                    message: "One or more tasks are outside your authorized team scope.",
                });
            }

            if (action === 'assign') {
                if (!payload || !payload.assigneeId || !teamIds.includes(payload.assigneeId)) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({
                        success: false,
                        message: "Managers can only assign tasks to supervised team members or themselves.",
                    });
                }
            }
        }
        let result;
        let logAction = "Bulk Task Update";
        let logDescription = "";

        switch (action) {
            case 'assign':
                if (!payload || !payload.assigneeId) {
                    throw new Error("Assignee ID is required for 'assign' action.");
                }
                const completedCheck = await client.query(
                    `SELECT id FROM tasks WHERE id = ANY($1::text[]) AND status = 'Completed'`,
                    [ids]
                );
                if (completedCheck.rows.length > 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        message: "Completed tasks cannot be assigned.",
                    });
                }
                result = await client.query(
                    `UPDATE tasks SET assigned_to = $1, status = 'Assigned', updated_date = NOW() WHERE id = ANY($2::text[]) RETURNING id`,
                    [payload.assigneeId, ids]
                );
                logDescription = `${user.fullName} bulk-assigned ${result.rowCount} task(s) to employee ${payload.assigneeId}.`;
                break;

            case 'updateStatus':
                if (!payload || !payload.status) {
                    throw new Error("Status is required for 'updateStatus' action.");
                }
                if (payload.status === 'Assigned') {
                    const compCheck = await client.query(
                        `SELECT id FROM tasks WHERE id = ANY($1::text[]) AND status = 'Completed'`,
                        [ids]
                    );
                    if (compCheck.rows.length > 0) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            success: false,
                            message: "Completed tasks cannot be assigned.",
                        });
                    }
                }
                result = await client.query(
                    `UPDATE tasks SET status = $1, updated_date = NOW() WHERE id = ANY($2::text[]) RETURNING id`,
                    [payload.status, ids]
                );
                logDescription = `${user.fullName} bulk-updated status of ${result.rowCount} task(s) to '${payload.status}'.`;
                break;

            case 'delete':
                if (user.role !== 'Administrator') {
                    throw new Error("Only Administrators can perform bulk delete.");
                }
                logAction = "Bulk Task Deletion";
                // Note: Assuming ON DELETE CASCADE is set for related tables like history, attachments.
                result = await client.query(`DELETE FROM tasks WHERE id = ANY($1::text[]) RETURNING id`, [ids]);
                logDescription = `${user.fullName} bulk-deleted ${result.rowCount} task(s).`;
                break;

            default:
                throw new Error("Invalid bulk action specified.");
        }

        await logAuditEvent(user.id, user.fullName, logAction, "Task", `Multiple (${ids.length})`, logDescription);
        await client.query('COMMIT');
        res.json({ success: true, message: `Successfully performed '${action}' on ${result.rowCount} tasks.` });

    } catch (error: any) {
        await client.query('ROLLBACK');
        return handleDatabaseError(error, res, "Bulk operation failed.");
    } finally {
        client.release();
    }
});


export default router;
