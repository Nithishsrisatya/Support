import React, { useState, useEffect } from "react";
import { Ticket, TicketStatus, TicketComment, TicketAttachment, TicketTimelineEntry } from "../types";
import { formatDateTime, getDaysRemainingBadge } from "../utils";
import { X, Send, Paperclip, Download, Trash2, Clock, MessageSquare, FileText, Activity, ChevronDown, ChevronUp, ShieldAlert, ImageIcon, ExternalLink, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { apiFetch, getAuthenticatedBlobUrl, downloadAuthenticatedAttachment } from "../services/api";

interface TicketDetailModalProps {
  ticket: Ticket;
  users: { id: string; fullName: string }[];
  currentUserId: string;
  currentUserRole: string;
  currentUserName: string;
  onClose: () => void;
  onUpdateStatus: (ticketId: string, status: TicketStatus, notes?: string, resolution?: string) => void;
  onReopenTicket?: (ticketId: string) => void;
}

export default function TicketDetailModal({
  ticket,
  users,
  currentUserId,
  currentUserRole,
  currentUserName,
  onClose,
  onUpdateStatus,
  onReopenTicket,
}: TicketDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"details" | "timeline" | "comments" | "attachments">("details");
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string; id: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isStaff = ["Administrator", "Manager", "Employee"].includes(currentUserRole);
  const isClient = currentUserRole === "Client";
  const isTerminal = ticket.status === "Resolved" || ticket.status === "Closed";
  const canReopen = isTerminal && (
    currentUserRole === "Administrator" ||
    currentUserRole === "Manager" ||
    (currentUserRole === "Client" && (ticket.clientId === currentUserId || (ticket as any).client_id === currentUserId))
  );

  useEffect(() => {
    loadTicketData();
    return () => {
      if (previewImage?.url) {
        URL.revokeObjectURL(previewImage.url);
      }
    };
  }, [ticket.id]);

  async function loadTicketData() {
    setLoading(true);
    try {
      const [commentsData, attachmentsData, timelineData] = await Promise.all([
        apiFetch(`/tickets/${ticket.id}/comments`),
        apiFetch(`/tickets/${ticket.id}/attachments`),
        apiFetch(`/tickets/${ticket.id}/timeline`),
      ]);
      setComments(commentsData);
      setAttachments(attachmentsData);
      setTimeline(timelineData);
    } catch (err) {
      console.error("Failed to load ticket details:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReopen() {
    if (!window.confirm(`Reopen ticket ${ticket.id}? It will become active again.`)) return;
    try {
      if (onReopenTicket) {
        onReopenTicket(ticket.id);
      } else {
        await apiFetch(`/tickets/${ticket.id}/reopen`, {
          method: "POST",
          body: JSON.stringify({ comment: `Reopened by ${currentUserName}` }),
        });
        onUpdateStatus(ticket.id, ticket.assignedTo ? "Assigned" : "New");
      }
    } catch (err) {
      console.error("Failed to reopen ticket:", err);
      alert("Failed to reopen ticket.");
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const result = await apiFetch(`/tickets/${ticket.id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          content: newComment.trim(),
          isInternal,
        }),
      });
      if (result.success) {
        setNewComment("");
        loadTicketData();
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const result = await apiFetch(`/tickets/${ticket.id}/attachments`, {
        method: "POST",
        body: formData,
      });

      if (result && result.success) {
        loadTicketData();
      }
    } catch (err) {
      console.error("Failed to upload file:", err);
      alert("Failed to upload file. Please ensure file type and size are allowed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handlePreview(att: TicketAttachment) {
    if (previewImage?.url) {
      URL.revokeObjectURL(previewImage.url);
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewImage({ url: "", name: att.fileName, id: att.id });
    try {
      const blobUrl = await getAuthenticatedBlobUrl(`/tickets/${ticket.id}/attachments/${att.id}/preview`);
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

  async function handleDownload(att: TicketAttachment) {
    try {
      await downloadAuthenticatedAttachment(`/tickets/${ticket.id}/attachments/${att.id}/download`, att.fileName);
    } catch (err: any) {
      console.error("Download failed:", err);
      alert(err.message || "Failed to download attachment.");
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!window.confirm("Delete this attachment?")) return;
    try {
      await apiFetch(`/tickets/${ticket.id}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      loadTicketData();
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  }

  function handleStatusChange(newStatus: TicketStatus) {
    if (newStatus === "Resolved") {
      setShowResolveModal(true);
    } else {
      onUpdateStatus(ticket.id, newStatus);
    }
  }

  function handleResolveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolutionSummary) return;
    onUpdateStatus(ticket.id, "Resolved", resolutionNotes, resolutionSummary);
    setShowResolveModal(false);
    setResolutionSummary("");
    setResolutionNotes("");
  }

  // Determine available workflow actions
  const status = ticket.status;
  const availableActions: TicketStatus[] = [];
  if (status === "New" && isStaff) availableActions.push("Assigned");
  if (status === "Assigned" && isStaff) {
    availableActions.push("In Progress");
    availableActions.push("Pending");
  }
  if (status === "In Progress" && isStaff) {
    availableActions.push("Pending");
    availableActions.push("Resolved");
  }
  if (status === "Pending" && isStaff) {
    availableActions.push("In Progress");
    availableActions.push("Resolved");
  }
  if (status === "Resolved" && isClient) availableActions.push("Closed");

  const getStatusColor = (s: string) => {
    switch (s) {
      case "New": return "bg-blue-100 text-blue-800";
      case "Assigned": return "bg-indigo-100 text-indigo-800";
      case "In Progress": return "bg-amber-100 text-amber-800";
      case "Pending": return "bg-purple-100 text-purple-800";
      case "Resolved": return "bg-emerald-100 text-emerald-800";
      case "Closed": return "bg-zinc-100 text-zinc-600";
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto pt-10 pb-10">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 p-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 mb-1">
              <span className="font-bold text-zinc-800">{ticket.id}</span>
              <span>·</span>
              <span>{formatDateTime(ticket.createdDate)}</span>
            </div>
            <h2 className="text-lg font-bold text-zinc-900">{ticket.subject}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-zinc-100 transition">
            <X className="h-5 w-5 text-zinc-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 px-5 pt-3">
          {(["details", "comments", "attachments", "timeline"] as const).map((tab) => (
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
              {tab === "comments" && <MessageSquare className="h-3.5 w-3.5" />}
              {tab === "attachments" && <Paperclip className="h-3.5 w-3.5" />}
              {tab === "timeline" && <Activity className="h-3.5 w-3.5" />}
              {tab}
              {tab === "comments" && comments.length > 0 && (
                <span className="ml-1 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold">{comments.length}</span>
              )}
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
                  {/* Terminal Status Notification Banner */}
                  {isTerminal && (
                    <div className="rounded-xl border border-zinc-300 bg-zinc-100/90 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-zinc-800 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-zinc-500"></span>
                          Terminal Record ({ticket.status}) — Non-Active Work
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">This ticket is preserved as a historical record. It is excluded from active workload and assignment workflows.</p>
                      </div>
                      {canReopen && (
                        <button
                          onClick={handleReopen}
                          className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm"
                        >
                          Reopen Ticket
                        </button>
                      )}
                    </div>
                  )}

                  {/* Status & Priority Badges */}
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getStatusColor(status)}`}>
                      {status} {isTerminal && "(Terminal)"}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-bold text-zinc-700 uppercase tracking-wider">
                      {ticket.category}
                    </span>
                  </div>

                  {/* Description */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Description</h4>
                    <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
                  </div>

                  {/* Assigned To */}
                  <div>
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Assigned To</h4>
                    <p className="text-sm text-zinc-800 font-medium">
                      {ticket.assignedTo
                        ? users.find((u) => u.id === ticket.assignedTo)?.fullName || ticket.assignedTo
                        : "Unassigned"}
                    </p>
                  </div>

                  {/* Due Date & Days Remaining */}
                  {ticket.dueDate && (
                    <div>
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Due Date</h4>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${ticket.isOverdue ? "text-red-600" : "text-zinc-800"}`}>
                          {formatDateTime(ticket.dueDate)}
                        </p>
                        {(() => {
                          const badge = getDaysRemainingBadge(ticket.dueDate, ticket.status);
                          return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.color}`}>{badge.text}</span>;
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Completed Date */}
                  {ticket.completedAt && (
                    <div>
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Completed Date</h4>
                      <p className="text-sm font-medium text-emerald-700">{formatDateTime(ticket.completedAt)}</p>
                    </div>
                  )}

                  {/* Resolution (if resolved/closed) */}
                  {(ticket.status === "Resolved" || ticket.status === "Closed") && ticket.resolutionSummary && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                      <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Resolution Summary</h4>
                      <p className="text-sm text-emerald-800">{ticket.resolutionSummary}</p>
                      {ticket.resolutionDate && (
                        <p className="text-xs text-emerald-600 mt-2 font-mono">Resolved: {formatDateTime(ticket.resolutionDate)}</p>
                      )}
                    </div>
                  )}

                  {/* Satisfaction (if closed) */}
                  {ticket.status === "Closed" && ticket.satisfactionRating && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                      <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Satisfaction Rating</h4>
                      <p className="text-sm text-amber-800 font-bold">{ticket.satisfactionRating}/5 Stars</p>
                      {ticket.satisfactionNotes && (
                        <p className="text-xs text-amber-700 mt-1 italic">"{ticket.satisfactionNotes}"</p>
                      )}
                    </div>
                  )}

                  {/* Employee Notes (staff only) */}
                  {isStaff && ticket.employeeNotes && (
                    <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Internal Notes</h4>
                      <p className="text-sm text-zinc-700 whitespace-pre-wrap">{ticket.employeeNotes}</p>
                    </div>
                  )}

                  {/* Workflow Actions */}
                  {availableActions.length > 0 && !isTerminal && (
                    <div className="border-t border-zinc-200 pt-4">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Workflow Actions</h4>
                      <div className="flex flex-wrap gap-2">
                        {availableActions.map((action) => (
                          <button
                            key={action}
                            onClick={() => handleStatusChange(action)}
                            className={`rounded-lg px-4 py-2 text-xs font-bold transition shadow-sm ${
                              action === "Resolved" || action === "Closed"
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : action === "Assigned"
                                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                                : "bg-zinc-800 text-white hover:bg-zinc-700"
                            }`}
                          >
                            {action === "Assigned" ? "Mark Assigned" :
                             action === "Closed" ? "Confirm & Close" :
                             `Move to ${action}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {isTerminal && canReopen && (
                    <div className="border-t border-zinc-200 pt-4">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Lifecycle Actions</h4>
                      <button
                        onClick={handleReopen}
                        className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition shadow-sm"
                      >
                        Reopen Ticket
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* COMMENTS TAB */}
              {activeTab === "comments" && (
                <div className="space-y-4">
                  {/* Comment List */}
                  <div className="space-y-3">
                    {comments.length === 0 ? (
                      <p className="text-center text-sm text-zinc-400 py-8">No comments yet.</p>
                    ) : (
                      comments.map((comment, idx) => (
                        <div key={comment.id} className={`rounded-xl p-4 border ${comment.isInternal ? 'border-purple-200 bg-purple-50/30' : 'border-zinc-200 bg-white'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-900">{comment.authorName}</span>
                              <span className="text-[9px] text-zinc-400 font-mono">{comment.authorRole}</span>
                              {comment.isInternal && (
                                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 uppercase">Internal</span>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono">{formatDateTime(comment.createdDate)}</span>
                          </div>
                          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add Comment (staff only) */}
                  {isStaff && (
                    <form onSubmit={handleAddComment} className="border-t border-zinc-200 pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isInternal}
                            onChange={(e) => setIsInternal(e.target.checked)}
                            className="rounded"
                          />
                          <ShieldAlert className="h-3.5 w-3.5 text-purple-500" />
                          Internal Note (staff only)
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="Add a comment..."
                          rows={2}
                          className="flex-1 rounded-xl border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                        />
                        <button
                          type="submit"
                          disabled={!newComment.trim()}
                          className="self-end rounded-xl bg-indigo-600 px-4 py-2 text-white font-bold text-xs hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                    </form>
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
                      <p className="text-xs text-zinc-400 mt-1">Max 10MB. Allowed: images, PDF, DOC, XLS, TXT, CSV, ZIP</p>
                    </div>
                  )}

                  {/* Attachment List */}
                  <div className="space-y-2">
                    {attachments.length === 0 ? (
                      <p className="text-center text-sm text-zinc-400 py-6">No attachments.</p>
                    ) : (
                      attachments.map((att) => {
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

              {/* TIMELINE TAB */}
              {activeTab === "timeline" && (
                <div className="space-y-3">
                  {timeline.length === 0 ? (
                    <p className="text-center text-sm text-zinc-400 py-8">No activity recorded.</p>
                  ) : (
                    timeline.map((entry, idx) => (
                      <div key={idx} className="relative flex gap-4 pb-3">
                        {idx !== timeline.length - 1 && (
                          <div className="absolute left-4 top-8 h-full w-px bg-zinc-200"></div>
                        )}
                        
                        <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm ${
                          entry.entryType === "history" ? "bg-amber-50 border-amber-200 text-amber-600" :
                          entry.entryType === "comment" ? "bg-indigo-50 border-indigo-200 text-indigo-600" :
                          "bg-emerald-50 border-emerald-200 text-emerald-600"
                        }`}>
                          {entry.entryType === "history" ? <Clock className="h-4 w-4" /> :
                           entry.entryType === "comment" ? <MessageSquare className="h-4 w-4" /> :
                           <Paperclip className="h-4 w-4" />}
                        </div>

                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-zinc-800">{entry.user}</p>
                            <span className="text-[10px] text-zinc-400 font-mono">{formatDateTime(entry.timestamp)}</span>
                          </div>
                          <p className="text-sm text-zinc-600 mt-0.5">
                            {entry.entryType === "history" ? (
                              <span className="font-medium text-amber-700">{entry.type}</span>
                            ) : entry.entryType === "comment" ? (
                              <span className="font-medium text-indigo-700">Comment</span>
                            ) : (
                              <span className="font-medium text-emerald-700">Attachment</span>
                            )}
                            : {entry.description}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 px-5 py-3 flex items-center justify-between text-xs text-zinc-400">
          <span className="font-mono">Updated: {formatDateTime(ticket.updatedDate)}</span>
          <span className="font-mono">Client ID: {ticket.clientId}</span>
        </div>
      </div>

      {/* RESOLVE MODAL */}
      {showResolveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-900">Resolve Ticket</h3>
            <p className="text-xs text-zinc-500 mt-1 mb-4">Provide resolution details for the client.</p>
            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Resolution Summary *</label>
                <textarea
                  required
                  rows={3}
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Describe how the issue was resolved..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Internal Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowResolveModal(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                <button type="submit" className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm">Resolve Ticket</button>
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

