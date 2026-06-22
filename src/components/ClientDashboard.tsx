import React, { useState } from "react";
import { Client, Ticket, Notification, TicketCategory, TicketPriority, TicketStatus } from "../types";
import { formatDate, formatDateTime } from "../utils";
import { 
  Plus, MessageSquare, ClipboardCheck, Clock, CheckCircle2, ChevronRight, 
  Search, ExternalLink, Send, ShieldCheck, Stars, Smile, MessageCircleHeart
} from "lucide-react";

interface ClientDashboardProps {
  activeClient: Client;
  tickets: Ticket[];
  notifications: Notification[];
  onSubmitTicket: (newTicket: {
    subject: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority;
  }) => void;
  onConfirmResolution: (ticketId: string, rating: number, notes?: string) => void;
}

export default function ClientDashboard({
  activeClient,
  tickets,
  notifications,
  onSubmitTicket,
  onConfirmResolution,
}: ClientDashboardProps) {
  // Tabs: 'my_tickets' | 'submit_ticket'
  const [activeTab, setActiveTab] = useState<"my_tickets" | "submit_ticket">("my_tickets");
  
  // Local Form state
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("Technical Issue");
  const [priority, setPriority] = useState<TicketPriority>("Medium");

  // Selection state for viewing ticket timeline history
  const [focusedTicketId, setFocusedTicketId] = useState<string | null>(null);

  // Client confirmation states
  const [confirmingTicketId, setConfirmingTicketId] = useState<string | null>(null);
  const [satisfactionRating, setSatisfactionRating] = useState(5);
  const [satisfactionReview, setSatisfactionNotes] = useState("");

  // Filter tickets submitted by this corporate client
  const clientTickets = tickets.filter((t) => t.clientId === activeClient.id);
  const focusedTicket = tickets.find((t) => t.id === focusedTicketId);

  // Counters
  const openCount = clientTickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length;
  const resolvedCount = clientTickets.filter((t) => t.status === "Resolved").length;
  const closedCount = clientTickets.filter((t) => t.status === "Closed").length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !description) return;
    
    onSubmitTicket({
      subject,
      description,
      category,
      priority,
    });

    // Reset Form & Switch back to list
    setSubject("");
    setDescription("");
    setCategory("Technical Issue");
    setPriority("Medium");
    setActiveTab("my_tickets");
  };

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingTicketId) return;

    onConfirmResolution(confirmingTicketId, satisfactionRating, satisfactionReview);

    // Reset Form
    setConfirmingTicketId(null);
    setSatisfactionRating(5);
    setSatisfactionNotes("");
  };

  return (
    <div className="space-y-6">
      
      {/* Welcome banner */}
      <div className="rounded-2xl border border-indigo-150 bg-indigo-50/30 p-5 flex flex-col justify-between sm:flex-row sm:items-center gap-4">
        <div>
          <span className="rounded bg-indigo-100 px-2.5 py-0.5 text-[9px] font-bold text-indigo-850 font-mono uppercase tracking-wide">
            Corporate Client Portal
          </span>
          <h2 className="text-lg font-bold text-zinc-950 font-sans mt-1.5">
            Welcome to helpdesk support: {activeClient.companyName}
          </h2>
          <p className="text-xs text-zinc-550 leading-relaxed max-w-xl">
            Register support cases, monitor engineer resolution logs, and verify complete ticket closures.
          </p>
        </div>

        {/* Counters widget */}
        <div className="flex gap-4 text-xs font-semibold font-mono text-zinc-700 bg-white rounded-xl p-3 border border-zinc-150 self-start sm:self-center shadow-sm">
          <div>
            <span className="block text-[8px] text-zinc-400 uppercase tracking-widest leading-none">Pending Cases</span>
            <span className="block text-base font-extrabold text-zinc-950 mt-1">{openCount} active</span>
          </div>
          <div className="border-l border-zinc-200 pl-3">
            <span className="block text-[8px] text-zinc-400 uppercase tracking-widest leading-none">Awaiting confirm</span>
            <span className="block text-base font-extrabold text-indigo-600 mt-1">{resolvedCount} pending</span>
          </div>
        </div>
      </div>

      {/* Nav Controls */}
      <div className="flex gap-1.5 border-b border-zinc-150 pb-2.5">
        <button
          onClick={() => {
            setActiveTab("my_tickets");
            setFocusedTicketId(null);
          }}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition uppercase duration-150 tracking-wider ${
            activeTab === "my_tickets" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          My Support Cases ({clientTickets.length})
        </button>
        <button
          onClick={() => {
            setActiveTab("submit_ticket");
            setFocusedTicketId(null);
          }}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition uppercase duration-150 tracking-wider flex items-center gap-1.5 ${
            activeTab === "submit_ticket" ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          <Plus className="h-4 w-4" />
          <span>file new ticket</span>
        </button>
      </div>

      {/* MY TICKETS TABLE PANEL */}
      {activeTab === "my_tickets" && (
        <div className="grid gap-6 lg:grid-cols-3 items-start animate-in fade-in duration-200 text-xs">
          
          {/* Left panel: tickets grid lists */}
          <div className="lg:col-span-2 space-y-3.5">
            {clientTickets.length === 0 ? (
              <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center text-zinc-400 font-sans">
                No tickets have been registered for your company profile. Click 'Submit Ticket' to start.
              </div>
            ) : (
              clientTickets.map((ticket) => {
                const isFocused = focusedTicketId === ticket.id;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => {
                      setFocusedTicketId(ticket.id);
                      setConfirmingTicketId(null);
                    }}
                    className={`w-full text-left p-4.5 rounded-2xl border bg-white shadow-sm hover:shadow-md transition text-xs space-y-3 flex flex-col justify-between ${
                      isFocused ? "border-indigo-600 bg-indigo-50/5" : "border-zinc-200"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                        <span className="font-bold text-zinc-800">{ticket.id}</span>
                        <span>Filed: {formatDate(ticket.createdDate)}</span>
                      </div>
                      
                      <h4 className="font-extrabold text-zinc-950 font-sans text-xs">{ticket.subject}</h4>
                      <p className="text-[11px] text-zinc-500 leading-normal line-clamp-2">{ticket.description}</p>
                    </div>

                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-3 font-mono text-[9px] font-bold uppercase">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-sky-50 px-1.5 py-0.2 text-sky-850">{ticket.category}</span>
                        <span className={`rounded px-1.5 py-0.2 ${
                          ticket.priority === "Critical" ? "bg-red-50 text-red-800" : "bg-zinc-100 text-zinc-650"
                        }`}>{ticket.priority} Urgency</span>
                      </div>

                      <span className={`rounded-xl px-2 py-0.5 ${
                        ticket.status === "Resolved" ? "bg-indigo-600 text-white animate-pulse" :
                        ticket.status === "Closed" ? "bg-emerald-50 text-emerald-800" :
                        "bg-zinc-100 text-zinc-700"
                      }`}>
                        {ticket.status === "Resolved" ? "Awaiting Confirm" : ticket.status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right panel: Focused Ticket Timeline History logs */}
          <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-200 space-y-4">
            {focusedTicket ? (
              <div className="space-y-4">
                <div className="border-b border-zinc-200 pb-3">
                  <span className="font-mono text-[10px] font-bold text-zinc-400">DETAIL STATUS REPORT</span>
                  <h3 className="text-xs font-bold text-zinc-950 font-sans leading-snug mt-1">{focusedTicket.subject}</h3>
                  <div className="mt-2 text-[10px] text-zinc-500">
                    Category: {focusedTicket.category} · Priority: {focusedTicket.priority} · ID: {focusedTicket.id}
                  </div>
                </div>

                {/* If resolved, show active Confirmation trigger option */}
                {focusedTicket.status === "Resolved" && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-2">
                    <p className="font-bold text-indigo-850 flex items-center gap-1.5">
                      <MessageCircleHeart className="h-4.5 w-4.5" />
                      <span>Support Case Resolved</span>
                    </p>
                    <p className="text-[11px] text-zinc-600 leading-normal">
                      David Kim has resolved this issue! Please review and confirm below.
                    </p>

                    <button
                      onClick={() => setConfirmingTicketId(focusedTicket.id)}
                      className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-center font-bold text-white text-xs hover:bg-indigo-700 transition"
                    >
                      Confirm Resolution & Close Case
                    </button>
                  </div>
                )}

                {/* Confirm satisfaction review block in timeline */}
                {confirmingTicketId === focusedTicket.id && (
                  <form onSubmit={handleConfirmSubmit} className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
                    <h5 className="font-bold text-zinc-900 border-b border-zinc-100 pb-2">Rate Support Quality</h5>
                    
                    <div>
                      <label className="block text-[10px] font-medium text-zinc-500 mb-1">Satisfaction Score</label>
                      <div className="flex gap-1.5 pt-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setSatisfactionRating(star)}
                            className="text-amber-500 font-bold focus:outline-none"
                          >
                            <Stars className={`h-5 w-5 ${satisfactionRating >= star ? "fill-amber-500" : "text-zinc-300"}`} />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-zinc-500 mb-1">Review Feedback (Optional)</label>
                      <textarea
                        rows={2}
                        value={satisfactionReview}
                        onChange={(e) => setSatisfactionNotes(e.target.value)}
                        placeholder="Write support quality review..."
                        className="w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setConfirmingTicketId(null)}
                        className="rounded bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded bg-emerald-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-emerald-700"
                      >
                        File Closure Rate
                      </button>
                    </div>
                  </form>
                )}

                {/* Resolution Summary if Closed or Resolved */}
                {focusedTicket.resolutionSummary && (
                  <div className="bg-white rounded-xl p-3.5 border border-zinc-150 space-y-1">
                    <span className="block text-[9px] uppercase tracking-wider text-zinc-400 font-mono">Formal Resolution Brief</span>
                    <p className="font-semibold text-zinc-800 leading-normal">{focusedTicket.resolutionSummary}</p>
                    {focusedTicket.satisfactionRating && (
                      <div className="pt-2 text-amber-600 font-mono font-bold flex items-center gap-1 border-t border-zinc-100 mt-2">
                        <Smile className="h-4 w-4" />
                        <span>Closed with Rating: {'★'.repeat(focusedTicket.satisfactionRating)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Interactive Lifecycle Timeline list */}
                <div className="space-y-4 pt-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono">
                    Activity & Transition History
                  </h4>
                  
                  <div className="relative pl-3 border-l-2 border-zinc-200 space-y-4">
                    {focusedTicket.history.map((h, i) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full border border-white bg-zinc-950"></div>
                        <div className="space-y-0.5">
                          <span className="block font-mono text-[9px] text-zinc-400">{formatDateTime(h.timestamp)}</span>
                          <p className="font-semibold text-zinc-900">
                            Status changed to <span className="font-extrabold uppercase text-[10px]">[{h.status}]</span>
                          </p>
                          <p className="text-zinc-600 text-[10.5px] leading-relaxed">{h.comment}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <p className="py-16 text-center text-zinc-400">Select any ticket on the left to view active timelines and resolution parameters.</p>
            )}
          </div>

        </div>
      )}

      {/* SUBMIT NEW PORTAL TICKET FORM PANEL */}
      {activeTab === "submit_ticket" && (
        <div className="max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm animate-in fade-in duration-200 text-xs text-zinc-800">
          <div className="border-b border-zinc-100 pb-3">
            <h3 className="text-sm font-bold text-zinc-950 font-sans">File Helpdesk Ticket</h3>
            <p className="text-xs text-zinc-400 mt-0.5 leading-normal">
              Register technical issues, billing inquiries, or account locks. Your workspace coordinator will prioritize immediately.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Subject Brief *</label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Broken links on shopping dashboard"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-805"
              />
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Detailed Case Narrative *</label>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe technical diagnostics, socket logs, or browser specs..."
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-805 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Issue Category Type</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 focus:outline-none"
                >
                  <option value="Technical Issue">Technical Issue</option>
                  <option value="Account Issue">Account Issue</option>
                  <option value="Billing Issue">Billing Issue</option>
                  <option value="Service Request">Service Request</option>
                  <option value="General Inquiry">General Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">SLA Urgency Level (Priority)</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 font-semibold focus:outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-6">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("my_tickets");
                  setSubject("");
                  setDescription("");
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-650"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-650 px-4 py-2 font-bold text-white transition hover:bg-indigo-750"
              >
                File Support Ticket
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
