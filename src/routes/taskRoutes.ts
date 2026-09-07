import { Router } from "express";
import {
  getAllTasks,
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
import { upload, deleteFile, getFilePath, resolveAttachmentFilePath } from "../services/fileUploadService";
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
const router = Router();

// Helper for authorizing task access based on user role
async function authorizeTaskAccess(user: any, taskId: string) {
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
    const allTasks = await getAllTasks();

    if (role === "Administrator") {
      return res.json(allTasks);
    }

    if (role === "Manager") {
      const teamResult = await pool.query('SELECT id FROM users WHERE manager_id = $1', [user.id]);
      const teamIds = teamResult.rows.map(r => r.id);
      teamIds.push(user.id);
      const managerTasks = allTasks.filter(
        (t: any) => teamIds.includes(t.assignedTo) || String(t.assignedBy) === String(user.id) || t.assignedTo === null
      );
      return res.json(managerTasks);
    }

    if (role === "Employee") {
      const employeeTasks = allTasks.filter((t: any) => String(t.assignedTo) === String(user.id));
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
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id);

    if (status === 404) {
      return res.status(404).json({
        message: "Task not found.",
      });
    }

    if (status === 403) {
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
    const task = await createTask(req.body);

    res.status(201).json({
      success: true,
      task,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to create task.",
    });
  }
});

// PUT /api/tasks/:id
router.put("/:id", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const taskId = req.params.id;
    const updates = req.body;
    const user = (req as any).user;

    const { canAccess, task: existingTask, status } = await authorizeTaskAccess(user, taskId);
    if (status === 404) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }
    if (status === 403) {
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
    console.error("Error updating task:", error);
    if (error?.message === "Completed tasks cannot be assigned.") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to update task and log audit history.",
    });
  }
});

// POST /api/tasks/:id/reopen - Reopen a completed task
router.post("/:id/reopen", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const taskId = req.params.id;
    const user = (req as any).user;

    const { canAccess, task, status } = await authorizeTaskAccess(user, taskId);
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (task.status !== "Completed") {
      return res.status(400).json({ success: false, message: "Only completed tasks can be reopened." });
    }

    const comment = req.body?.comment || "Task reopened";
    const reopened = await reopenTask(taskId, user.id, user.fullName || "User", comment);

    res.json({
      success: true,
      message: `Task ${taskId} has been reopened.`,
      task: reopened,
    });
  } catch (error: any) {
    console.error("Failed to reopen task:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to reopen task." });
  }
});

// POST /api/tasks/:id/remind - Send task reminder email
router.post("/:id/remind", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id);
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
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send reminder." });
  }
});

// DELETE /api/tasks/:id
router.delete("/:id",authenticateToken,
authorizeRoles(["Administrator"]), async (req, res) => {
  try {
    await deleteTask(req.params.id);

    res.json({
      success: true,
      message: "Task deleted successfully.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to delete task.",
    });
  }
});

// ─── TASK PROGRESS UPDATE ───────────────────────────────────────────────
// POST /api/tasks/:id/progress - Submit a progress update
router.post("/:id/progress", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const taskId = req.params.id;
    const { progressPercentage, comment } = req.body;
    const user = (req as any).user;

    const { canAccess, task, status } = await authorizeTaskAccess(user, taskId);
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (progressPercentage === undefined || progressPercentage < 0 || progressPercentage > 100) {
      return res.status(400).json({ success: false, message: "Progress percentage must be between 0 and 100." });
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
    console.error("Failed to update task progress:", error);
    res.status(500).json({ success: false, message: "Failed to update task progress." });
  }
});

// GET /api/tasks/:id/progress - Get progress updates for a task
router.get("/:id/progress", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const updates = await getTaskProgressUpdates(req.params.id);
    res.json(updates);
  } catch (error) {
    console.error("Failed to fetch progress updates:", error);
    res.status(500).json({ success: false, message: "Failed to fetch progress updates." });
  }
});

// ─── TASK ATTACHMENTS ──────────────────────────────────────────────────
// POST /api/tasks/:id/attachments - Upload attachment
router.post("/:id/attachments", uploadLimiter, authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), upload.single("file"), async (req, res) => {
  try {
    const taskId = req.params.id;
    const user = (req as any).user;

    const { canAccess, task, status } = await authorizeTaskAccess(user, taskId);
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file provided." });
    }

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

    const created = await createTaskAttachment(attachment);

    // Write to task_history
    await pool.query(
      `INSERT INTO task_history (task_id, type, timestamp, user_full_name, description, metadata)
       VALUES ($1, 'attachment', NOW(), $2, $3, $4)`,
      [taskId, user.fullName || "User", `File uploaded: ${req.file.originalname}`, JSON.stringify({ fileName: req.file.originalname, fileSize: req.file.size })]
    );

    res.status(201).json({ success: true, attachment: created });
  } catch (error) {
    console.error("Failed to upload attachment:", error);
    res.status(500).json({ success: false, message: "Failed to upload attachment." });
  }
});

// GET /api/tasks/:id/attachments - List attachments
router.get("/:id/attachments", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const { canAccess, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const attachments = await getTaskAttachments(req.params.id);
    res.json(attachments);
  } catch (error) {
    console.error("Failed to fetch attachments:", error);
    res.status(500).json({ success: false, message: "Failed to fetch attachments." });
  }
});

// GET /api/tasks/:id/attachments/:attachmentId/preview - Preview attachment inline
router.get("/:id/attachments/:attachmentId/preview", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const { canAccess, status } = await authorizeTaskAccess((req as any).user, req.params.id);
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

    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.fileName)}"`);
    res.sendFile(resolvedPath);
  } catch (error) {
    console.error("Failed to preview attachment:", error);
    res.status(500).json({ success: false, message: "Failed to preview attachment." });
  }
});

// GET /api/tasks/:id/attachments/:attachmentId/download - Download attachment
router.get("/:id/attachments/:attachmentId/download", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const { canAccess, status } = await authorizeTaskAccess((req as any).user, req.params.id);
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

    res.download(resolvedPath, attachment.fileName);
  } catch (error) {
    console.error("Failed to download attachment:", error);
    res.status(500).json({ success: false, message: "Failed to download attachment." });
  }
});

// DELETE /api/tasks/:id/attachments/:attachmentId - Delete attachment
router.delete("/:id/attachments/:attachmentId", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const attachment = await getTaskAttachmentById(req.params.attachmentId);
    if (!attachment || attachment.taskId !== req.params.id) {
      return res.status(404).json({ success: false, message: "Attachment not found." });
    }
    deleteFile(attachment.filePath);
    await deleteTaskAttachment(req.params.attachmentId);
    res.json({ success: true, message: "Attachment deleted successfully." });
  } catch (error) {
    console.error("Failed to delete attachment:", error);
    res.status(500).json({ success: false, message: "Failed to delete attachment." });
  }
});

// ─── TASK HISTORY / TIMELINE ───────────────────────────────────────────
// GET /api/tasks/:id/history - Get task timeline
router.get("/:id/history", authenticateToken, authorizeRoles(["Administrator", "Manager", "Employee"]), async (req, res) => {
  try {
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const history = await getTaskHistory(req.params.id);
    res.json(history);
  } catch (error) {
    console.error("Failed to fetch task history:", error);
    res.status(500).json({ success: false, message: "Failed to fetch task history." });
  }
});

// ─── MANAGER REVIEW ────────────────────────────────────────────────────
// PUT /api/tasks/:id/review - Manager review (approve/reject)
router.put("/:id/review", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const taskId = req.params.id;
    const { reviewStatus, managerNotes } = req.body;
    const user = (req as any).user;

    const { canAccess, task, status } = await authorizeTaskAccess(user, taskId);
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    if (!reviewStatus || !["Pending Review", "Approved", "Rejected"].includes(reviewStatus)) {
      return res.status(400).json({ success: false, message: "Invalid review status. Must be: Pending Review, Approved, or Rejected." });
    }

    const result = await reviewTask(taskId, reviewStatus, managerNotes || "", user.id, user.fullName);
    res.json({ success: true, task: result });
  } catch (error) {
    console.error("Failed to review task:", error);
    res.status(500).json({ success: false, message: "Failed to review task." });
  }
});

// ─── OVERDUE DETECTION ────────────────────────────────────────────────
// POST /api/tasks/:id/check-overdue - Check if task is overdue
router.post("/:id/check-overdue", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const { canAccess, task, status } = await authorizeTaskAccess((req as any).user, req.params.id);
    if (status === 404) return res.status(404).json({ success: false, message: "Task not found." });
    if (status === 403) return res.status(403).json({ success: false, message: "Forbidden" });

    const result = await checkTaskOverdue(req.params.id);
    res.json(result);
  } catch (error) {
    console.error("Failed to check overdue:", error);
    res.status(500).json({ success: false, message: "Failed to check overdue status." });
  }
});

// POST /api/tasks/check-all-overdue - Check all tasks for overdue
router.post("/check-all-overdue", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
  try {
    const results = await checkAllOverdueTasks();
    res.json({ success: true, results });
  } catch (error) {
    console.error("Failed to check all overdue tasks:", error);
    res.status(500).json({ success: false, message: "Failed to check all overdue tasks." });
  }
});

// ============================================================
// POST /api/tasks/bulk - Bulk Actions
// ============================================================
router.post("/bulk", authenticateToken, authorizeRoles(["Administrator", "Manager"]), async (req, res) => {
    const { action, ids, payload } = req.body;
    const user = (req as any).user;

    if (!action || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: "Action and a non-empty array of IDs are required." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
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
        console.error("Bulk task action failed:", error);
        res.status(500).json({ success: false, message: error.message || "Bulk operation failed." });
    } finally {
        client.release();
    }
});


export default router;
