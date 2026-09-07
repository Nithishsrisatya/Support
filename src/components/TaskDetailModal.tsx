import React, { useState, useEffect } from "react";
import { Task, TaskAttachment, TaskHistoryEntry, TaskStatus, ReviewStatus } from "../types";
import { formatDateTime, getDaysRemainingBadge } from "../utils";
import { X, Send, Paperclip, Download, Trash2, Clock, MessageSquare, FileText, Activity, ChevronDown, ChevronUp, ShieldAlert, ImageIcon, CheckCircle, XCircle, AlertTriangle, Upload, AlertCircle, Loader2 } from "lucide-react";
import { apiFetch, getAuthenticatedBlobUrl, downloadAuthenticatedAttachment } from "../services/api";

interface TaskDetailModalProps {
  task: Task;
  currentUserId: string;
  currentUserRole: string;
  currentUserName: string;
  onClose: () => void;
  onUpdateStatus: (taskId: string, status: TaskStatus, notes?: string) => void;
  onUpdateProgress: (taskId: string, progressPercentage: number, comment: string) => void;
  onReviewTask: (taskId: string, reviewStatus: ReviewStatus, managerNotes: string) => void;
  onReopenTask?: (taskId: string) => void;
  isManager?: boolean;
}

export default function TaskDetailModal({
  task,
  currentUserId,
  currentUserRole,
  currentUserName,
  onClose,
  onUpdateStatus,
  onUpdateProgress,
  onReviewTask,
  onReopenTask,
  isManager = false,
}: TaskDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "timeline" | "attachments">("details");
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [timeline, setTimeline] = useState<TaskHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string; id: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Progress update state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressPercentage, setProgressPercentage] = useState(task.progressPercentage || 0);
  const [progressComment, setProgressComment] = useState("");

  // Review state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("Approved");
  const [managerNotes, setManagerNotes] = useState("");

  // Complete task state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");

  const isStaff = ["Administrator", "Manager", "Employee"].includes(currentUserRole);
  const canEdit = ["Administrator", "Manager"].includes(currentUserRole) || task.assignedTo === currentUserId;

  useEffect(() => {
    loadTaskData();
    return () => {
      if (previewImage?.url) {
        URL.revokeObjectURL(previewImage.url);
      }
    };
  }, [task.id]);

  async function loadTaskData() {
    setLoading(true);
    try {
      const [attachmentsData, historyData] = await Promise.all([
        apiFetch(`/tasks/${task.id}/attachments`),
        apiFetch(`/tasks/${task.id}/history`),
      ]);
      setAttachments(attachmentsData);
      setTimeline(historyData);
    } catch (err) {
      console.error("Failed to load task details:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      await apiFetch(`/tasks/${task.id}/attachments`, {
        method: "POST",
        body: formData,
      });

      loadTaskData();
    } catch (err) {
      console.error("Failed to upload file:", err);
      alert("Failed to upload file. Please ensure file type and size are allowed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handlePreview(att: TaskAttachment) {
    if (previewImage?.url) {
      URL.revokeObjectURL(previewImage.url);
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewImage({ url: "", name: att.fileName, id: att.id });
    try {
      const blobUrl = await getAuthenticatedBlobUrl(`/tasks/${task.id}/attachments/${att.id}/preview`);
      setPreviewImage({ url: blobUrl, name: att.fileName, id: att.id });
    } catch (err: any) {
      console.error("Failed to load attachment preview:", err);
      setPreviewError(err.message || "Unable to load attachment.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    if (previewImage?.url) {
      URL.revokeObjectURL(previewImage.url);
    }
    setPreviewImage(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }

  async function handleDownload(att: TaskAttachment) {
    try {
      await downloadAuthenticatedAttachment(`/tasks/${task.id}/attachments/${att.id}/download`, att.fileName);
    } catch (err: any) {
      console.error("Download failed:", err);
      alert(err.message || "Failed to download attachment.");
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!window.confirm("Delete this attachment?")) return;
    try {
      await apiFetch(`/tasks/${task.id}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      loadTaskData();
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  }

  function handleProgressSubmit(e: React.FormEvent) {
    e.preventDefault();
    onUpdateProgress(task.id, progressPercentage, progressComment);
    setShowProgressModal(false);
    setProgressComment("");
  }

  function handleCompleteSubmit(e: React.FormEvent) {
    e.preventDefault();
    onUpdateStatus(task.id, "Completed", completionNotes);
    setShowCompleteModal(false);
    setCompletionNotes("");
  }

  function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    onReviewTask(task.id, reviewStatus, managerNotes);
    setShowReviewModal(false);
    setManagerNotes("");
  }

  const getStatusColor = (s: string) => {
    switch (s) {
      case "Pending": return "bg-zinc-100 text-zinc-700";
      case "Assigned": return "bg-indigo-100 text-indigo-800";
      case "In Progress": return "bg-amber-100 text-amber-800";
      case "Completed": return "bg-emerald-100 text-emerald-800";
      case "Overdue": return "bg-red-100 text-red-800";
      case "Escalated": return "bg-purple-100 text-purple-800";
      default: return "bg-zinc-100 text-zinc-600";
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "Critical": return "bg-red-100 text-red-800";
      case "High": return "bg-orange-100 text-orange-800";
      case "Medium": return "bg-sky-100 text-sky-800";
      case "Low": return "bg-zinc-100 text-zinc-700";
      default: return "bg-zinc-100 text-zinc-600";
    }
  };

  // Determine available status workflow actions
  const status = task.status;
  const availableActions: { status: TaskStatus; label: string }[] = [];
  if (status === "Assigned" && isStaff) {
    availableActions.push({ status: "In Progress", label: "Accept & Start Work" });
  }
  if (status === "In Progress" && isStaff) {
    availableActions.push({ status: "Completed", label: "Mark Complete" });
  }
  if (["Overdue", "Escalated"].includes(status) && isStaff) {
    availableActions.push({ status: "In Progress", label: "Resume Work" });
  }
  if (status !== "Completed" && isStaff) {
    availableActions.push({ status: "Escalated", label: "Escalate to Manager" });
  }

  // Check if task is overdue
  const isOverdueTask = task.isOverdue; // Use the isOverdue flag from the task object
  const needsReview = status === "Completed" && !task.reviewStatus;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto pt-10 pb-10">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 p-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 mb-1">
              <span className="font-bold text-zinc-800">{task.id}</span>
              <span>·</span>
              <span>{formatDateTime(task.createdDate)}</span>
            </div>
            <h2 className="text-lg font-bold text-zinc-900">{task.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-100 transition">
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        {/* Overdue/Review/Completed Alert Banner */}
        {status === "Completed" && (
          <div className="mx-5 mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold text-emerald-800">
                This task is Completed and non-active.
              </span>
            </div>
            {onReopenTask && ["Administrator", "Manager"].includes(currentUserRole) && (
              <button
                onClick={() => {
                  onReopenTask(task.id);
                  onClose();
                }}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm"
              >
                Reopen Task
              </button>
            )}
          </div>
        )}
        {status !== "Completed" && isOverdueTask && (
          <div className="mx-5 mt-3 rounded-xl bg-red-50 border border-red-200 p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span className="text-xs font-semibold text-red-700">Task is overdue! Due date was {formatDateTime(task.dueDate)}</span>
          </div>
        )}
        {status !== "Completed" && needsReview && isManager && (
          <div className="mx-5 mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Task completed and awaiting your review</span>
            <button
              onClick={() => setShowReviewModal(true)}
              className="ml-auto rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700"
            >
              Review Now
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 px-5 pt-3">
          {(["details", "timeline", "attachments"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
                activeTab === tab
                  ? "bg-zinc-50 text-zinc-900 border border-zinc-200 border-b-transparent -mb-px"
                  : "text-zinc-400 hover:text-zinc-700"
              }`}
            >
              {tab === "details" && <FileText className="h-3.5 w-3.5" />}
              {tab === "timeline" && <Activity className="h-3.5 w-3.5" />}
              {tab === "attachments" && <Paperclip className="h-3.5 w-3.5" />}
              {tab}
              {tab === "attachments" && attachments.length > 0 && (
                <span className="ml-1 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold">{attachments.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-800"></div>
            </div>
          ) : (
            <>
              {/* DETAILS TAB */}
              {activeTab === "details" && (
                <div className="space-y-5">
                  {/* Status & Priority Badges */}
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusColor(status)}`}>
                      {status}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-bold text-zinc-700 uppercase tracking-wider">
                      {task.taskCategory}
                    </span>
                    {task.reviewStatus && (
                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        task.reviewStatus === "Approved" ? "bg-emerald-100 text-emerald-800" :
                        task.reviewStatus === "Rejected" ? "bg-red-100 text-red-800" :
                        "bg-amber-100 text-amber-800"
                      }`}>
                        {task.reviewStatus}
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Progress</h4>
                      <span className="text-xs font-bold text-zinc-700">{task.progressPercentage || 0}%</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${task.progressPercentage || 0}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Description</h4>
                    <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{task.description}</p>
                  </div>

                  {/* Due Date */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Due Date</h4>
                    <p className="text-sm font-medium text-zinc-800 flex items-center gap-2">
                      <span>{formatDateTime(task.dueDate)}</span>
                      {task.dueDate && (() => {
                        const badge = getDaysRemainingBadge(task.dueDate, task.status);
                        return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.color}`}>{badge.text}</span>;
                      })()}
                    </p>
                  </div>

                  {/* Completion Notes */}
                  {task.status === "Completed" && task.completionNotes && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                      <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Completion Notes</h4>
                      <p className="text-sm text-emerald-800 italic">"{task.completionNotes}"</p>
                      {task.completionDate && (
                        <p className="text-xs text-emerald-600 mt-2 font-mono">Completed: {formatDateTime(task.completionDate)}</p>
                      )}
                    </div>
                  )}

                  {/* Manager Review Notes */}
                  {task.managerNotes && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                      <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Manager Review Notes</h4>
                      <p className="text-sm text-amber-800">{task.managerNotes}</p>
                    </div>
                  )}

                  {/* Workflow Actions */}
                  <div className="border-t border-zinc-200 pt-4 space-y-2">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Actions</h4>
                    <div className="flex flex-wrap items-center gap-2">
                      {status === "Completed" ? (
                        <>
                          <span className="inline-flex items-center rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 font-mono">
                            Completed (Non-Active)
                          </span>
                          {onReopenTask && ["Administrator", "Manager"].includes(currentUserRole) && (
                            <button
                              onClick={() => {
                                onReopenTask(task.id);
                                onClose();
                              }}
                              className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm"
                            >
                              Reopen Task
                            </button>
                          )}
                          {isManager && needsReview && (
                            <button
                              onClick={() => setShowReviewModal(true)}
                              className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm"
                            >
                              Review & Close
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Update Progress Button */}
                          {(status === "In Progress" || status === "Assigned") && isStaff && (
                            <button
                              onClick={() => {
                                setProgressPercentage(task.progressPercentage || 0);
                                setShowProgressModal(true);
                              }}
                              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-sm"
                            >
                              Update Progress
                            </button>
                          )}

                          {/* Status Workflow Buttons */}
                          {availableActions.map((action) => (
                            <button
                              key={action.status}
                              onClick={() => {
                                if (action.status === "Completed") {
                                  setShowCompleteModal(true);
                                } else {
                                  onUpdateStatus(task.id, action.status);
                                }
                              }}
                              className={`rounded-lg px-4 py-2 text-xs font-bold transition shadow-sm ${
                                action.status === "Escalated"
                                  ? "bg-purple-600 text-white hover:bg-purple-700"
                                  : action.status === "Completed"
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : "bg-zinc-800 text-white hover:bg-zinc-700"
                              }`}
                            >
                              {action.label}
                            </button>
                          ))}

                          {/* Review Button (Managers Only) */}
                          {isManager && needsReview && (
                            <button
                              onClick={() => setShowReviewModal(true)}
                              className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm"
                            >
                              Review & Close
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TIMELINE TAB */}
              {activeTab === "timeline" && (
                <div className="space-y-3">
                  {timeline.length === 0 ? (
                    <p className="text-center text-sm text-zinc-400 py-8">No activity recorded.</p>
                  ) : (
                    timeline.map((entry: any, idx: number) => (
                      <div key={entry.id || idx} className="relative flex gap-4 pb-3">
                        {idx !== timeline.length - 1 && (
                          <div className="absolute left-4 top-8 h-full w-px bg-zinc-200"></div>
                        )}
                        
                        <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm ${
                          entry.type === "status_change" ? "bg-amber-50 border-amber-200 text-amber-600" :
                          entry.type === "progress" ? "bg-indigo-50 border-indigo-200 text-indigo-600" :
                          entry.type === "attachment" ? "bg-emerald-50 border-emerald-200 text-emerald-600" :
                          entry.type === "review" ? "bg-purple-50 border-purple-200 text-purple-600" :
                          "bg-zinc-50 border-zinc-200 text-zinc-600"
                        }`}>
                          {entry.type === "status_change" ? <Clock className="h-4 w-4" /> :
                           entry.type === "progress" ? <Activity className="h-4 w-4" /> :
                           entry.type === "attachment" ? <Paperclip className="h-4 w-4" /> :
                           entry.type === "review" ? <CheckCircle className="h-4 w-4" /> :
                           <FileText className="h-4 w-4" />}
                        </div>

                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-zinc-800">{entry.userFullName}</p>
                            <span className="text-[10px] text-zinc-400 font-mono">{formatDateTime(entry.timestamp)}</span>
                          </div>
                          <p className="text-sm text-zinc-600 mt-0.5">{entry.description}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ATTACHMENTS TAB */}
              {activeTab === "attachments" && (
                <div className="space-y-4">
                  {/* Upload (staff only) */}
                  {isStaff && (
                    <div className="border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center hover:bg-zinc-50 cursor-pointer relative">
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        disabled={uploading}
                      />
                      <Paperclip className="h-6 w-6 text-zinc-400 mx-auto mb-2" />
                      <p className="text-sm text-zinc-500 font-medium">
                        {uploading ? "Uploading..." : "Click to upload a file"}
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">Max 10MB</p>
                    </div>
                  )}

                  {/* Attachment List */}
                  <div className="space-y-2">
                    {attachments.length === 0 ? (
                      <p className="text-center text-sm text-zinc-400 py-6">No attachments.</p>
                    ) : (
                      attachments.map((att: any) => {
                        const isImage = att.mimeType?.startsWith("image/");
                        return (
                          <div key={att.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 transition">
                            <div className="flex items-center gap-3">
                              {isImage ? (
                                <ImageIcon className="h-5 w-5 text-sky-500" />
                              ) : (
                                <FileText className="h-5 w-5 text-zinc-400" />
                              )}
                              <div>
                                <p className="text-sm font-medium text-zinc-800">{att.fileName}</p>
                                <p className="text-[10px] text-zinc-400 font-mono">
                                  {(att.fileSize / 1024).toFixed(1)} KB · uploaded by {att.uploadedByName} · {formatDateTime(att.createdDate)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isImage && (
                                <button
                                  onClick={() => handlePreview(att)}
                                  className="rounded-lg p-2 hover:bg-sky-50 text-zinc-500 hover:text-sky-600 transition"
                                  title="Preview Image"
                                >
                                  <ImageIcon className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDownload(att)}
                                className="rounded-lg p-2 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition"
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                              {isStaff && (
                                <button
                                  onClick={() => handleDeleteAttachment(att.id)}
                                  className="rounded-lg p-2 hover:bg-red-50 text-zinc-500 hover:text-red-600 transition"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 px-5 py-3 flex items-center justify-between text-xs text-zinc-400">
          <span className="font-mono">Updated: {formatDateTime(task.updatedDate)}</span>
          <span className="font-mono">Assignee: {task.assignedTo}</span>
        </div>
      </div>

      {/* PROGRESS UPDATE MODAL */}
      {showProgressModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900">Update Progress</h3>
            <p className="text-xs text-zinc-500 mt-1 mb-4">Track your task completion progress.</p>
            <form onSubmit={handleProgressSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Progress: {progressPercentage}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progressPercentage}
                  onChange={(e) => setProgressPercentage(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Comment</label>
                <textarea
                  value={progressComment}
                  onChange={(e) => setProgressComment(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="What have you completed so far?"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowProgressModal(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 shadow-sm">Save Progress</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE TASK MODAL */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" /> Complete Task
            </h3>
            <p className="text-xs text-zinc-500 mt-1 mb-4">Provide completion notes for manager review.</p>
            <form onSubmit={handleCompleteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Completion Notes *</label>
                <textarea
                  required
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Describe the work completed..."
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCompleteModal(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                <button type="submit" className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm">Mark Complete</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVIEW MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" /> Manager Review
            </h3>
            <p className="text-xs text-zinc-500 mt-1 mb-4">Review the completed task and provide feedback.</p>
            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Decision</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewStatus("Approved")}
                    className={`flex-1 rounded-lg border-2 px-4 py-3 text-xs font-bold transition ${
                      reviewStatus === "Approved"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                    }`}
                  >
                    <CheckCircle className="h-4 w-4 inline mr-1" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewStatus("Rejected")}
                    className={`flex-1 rounded-lg border-2 px-4 py-3 text-xs font-bold transition ${
                      reviewStatus === "Rejected"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                    }`}
                  >
                    <XCircle className="h-4 w-4 inline mr-1" />
                    Reject
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Manager Notes</label>
                <textarea
                  value={managerNotes}
                  onChange={(e) => setManagerNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  placeholder={reviewStatus === "Approved" ? "Great work! Any additional feedback..." : "Please explain why this task is being rejected..."}
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowReviewModal(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                <button type="submit" className={`rounded-lg px-5 py-2 text-sm font-bold text-white shadow-sm ${
                  reviewStatus === "Approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                }`}>
                  {reviewStatus === "Approved" ? "Approve Task" : "Reject Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMAGE PREVIEW OVERLAY */}
      {previewImage && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={closePreview}>
          <div className="relative max-w-4xl max-h-[92vh] w-full rounded-2xl overflow-hidden bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50">
              <span className="text-xs font-semibold text-zinc-700 truncate max-w-md">{previewImage.name}</span>
              <div className="flex items-center gap-2">
                {previewImage.url && (
                  <button
                    onClick={() => {
                      const found = attachments.find(a => a.id === previewImage.id);
                      if (found) handleDownload(found);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-300 transition"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                )}
                <button onClick={closePreview} className="rounded-lg p-1 hover:bg-zinc-200 transition">
                  <XCircle className="h-5 w-5 text-zinc-500" />
                </button>
              </div>
            </div>

            <div className="p-4 flex items-center justify-center min-h-[300px] max-h-[80vh] overflow-auto bg-zinc-950/5">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2 py-12 text-zinc-500">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  <span className="text-xs font-medium">Loading preview...</span>
                </div>
              ) : previewError ? (
                <div className="text-center py-10 px-4 space-y-3">
                  <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
                  <p className="text-sm font-semibold text-zinc-800">Unable to load attachment.</p>
                  <p className="text-xs text-zinc-500 max-w-sm">{previewError}</p>
                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        const found = attachments.find(a => a.id === previewImage.id);
                        if (found) handlePreview(found);
                      }}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                    >
                      Retry
                    </button>
                    <button
                      onClick={closePreview}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : previewImage.url ? (
                <img
                  src={previewImage.url}
                  alt={previewImage.name}
                  className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
