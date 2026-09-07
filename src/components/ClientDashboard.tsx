import React, { useState } from "react";
import { Client, Ticket, Notification, TicketCategory, TicketPriority, TicketStatus } from "../types";
import HomeDashboard from "./HomeDashboard";
import { 
  Plus, MessageSquare, Clock, CheckCircle2,
  ShieldCheck, LifeBuoy, Activity, AlertCircle, Send, LayoutDashboard, CalendarDays,
  Calendar as CalendarIcon
} from "lucide-react";
import DeadlineCalendar from "./DeadlineCalendar";
import { getDaysRemainingText, formatDate } from "../utils";

interface ClientDashboardProps {
  activeClient: Client;
  tickets: Ticket[];
  notifications: Notification[];
  onSubmitTicket: (newTicket: {
    subject: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority;
    dueDate?: string;
  }) => void;
  onConfirmResolution: (ticketId: string, rating: number, notes?: string) => void;
  onReopenTicket?: (ticketId: string) => void;
}

export default function ClientDashboard({
  activeClient,
  tickets,
  notifications,
  onSubmitTicket,
  onConfirmResolution,
  onReopenTicket,
}: ClientDashboardProps) {
const [activeTab, setActiveTab] = useState<"dashboard" | "my_tickets" | "submit_ticket" | "calendar">("dashboard");
  
// Local Form state
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("Technical Issue");
  const [priority, setPriority] = useState<TicketPriority>("Medium");
  const [dueDate, setDueDate] = useState("");

  // Resolution state
  const [resolvingTicketId, setResolvingTicketId] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const clientTickets = tickets.filter((t) => t.clientId === activeClient.id);
  const openTicketsCount = clientTickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitTicket({ subject, description, category, priority, dueDate: dueDate || undefined });
    setActiveTab("my_tickets");
    setSubject("");
    setDescription("");
    setCategory("Technical Issue");
    setPriority("Medium");
    setDueDate("");
  };

  const handleConfirmResolution = (e: React.FormEvent) => {
    e.preventDefault();
    if (resolvingTicketId) {
      onConfirmResolution(resolvingTicketId, rating, resolutionNotes);
      setResolvingTicketId(null);
      setRating(5);
      setResolutionNotes("");
    }
  };

  // Helper to determine step in the process
  const getTicketStep = (status: TicketStatus) => {
    if (["Closed", "Resolved"].includes(status)) return 3;
    if (["In Progress", "Pending"].includes(status)) return 2;
    return 1;
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Premium Concierge Banner */}
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-950 to-zinc-900 p-6 sm:p-8 flex flex-col justify-between sm:flex-row sm:items-center gap-6 shadow-lg text-white">
        <div className="flex items-center gap-5">
          <div className="h-14 w-14 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Building2Icon />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 font-mono">System Secure</span>
            </div>
            <h2 className="text-2xl font-bold font-sans tracking-tight">
              Welcome, {activeClient.contactPerson.split(' ')[0]}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {activeClient.companyName} Support Portal
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveTab("submit_ticket")}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.5)]"
        >
          <LifeBuoy size={18} />
          Request Support
        </button>
      </div>

      {/* 2. Simplified Navigation */}
      <div className="flex gap-1.5 rounded-xl bg-zinc-100 p-1 w-max">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition duration-150 flex items-center gap-1.5 ${
            activeTab === "dashboard" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <LayoutDashboard size={14} />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab("my_tickets")}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition duration-150 ${
            activeTab === "my_tickets" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          Active Issues ({openTicketsCount})
        </button>
        <button
          onClick={() => setActiveTab("submit_ticket")}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition duration-150 ${
            activeTab === "submit_ticket" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          New Request
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition duration-150 flex items-center gap-1.5 ${
            activeTab === "calendar" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
          }`}
        >
          <CalendarIcon size={14} />
          Deadlines Calendar
        </button>
      </div>

      {/* Dashboard Overview */}
      {activeTab === "dashboard" && (
        <HomeDashboard
          clients={[activeClient]}
          tickets={tickets}
          users={[]}
          tasks={[]}
        />
      )}

      {/* 3. MY TICKETS (Live Status Trackers) */}
      {activeTab === "my_tickets" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {clientTickets.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
              <ShieldCheck className="mx-auto h-12 w-12 text-zinc-300 mb-4" />
              <h3 className="text-lg font-bold text-zinc-900">All systems operational</h3>
              <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto">You currently have no active support requests. If you experience any issues, our team is ready to help.</p>
            </div>
          ) : (
            clientTickets.sort((a,b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()).map((ticket) => {
              const step = getTicketStep(ticket.status);
              const isResolved = ticket.status === "Resolved";
              const isClosed = ticket.status === "Closed";

              return (
                <div key={ticket.id} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    
                    {/* Ticket Info */}
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-3 font-mono text-[11px] uppercase font-bold tracking-wider">
                        <span className="text-zinc-900">ID: {ticket.id}</span>
                        <span className="text-zinc-300">|</span>
                        <span className="text-zinc-500">{formatDate(ticket.createdDate)}</span>
                        <span className="text-zinc-300">|</span>
                        <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{ticket.category}</span>
                      </div>
                      
                      <h4 className="text-lg font-bold text-zinc-900">{ticket.subject}</h4>
                      <p className="text-sm text-zinc-600 leading-relaxed max-w-3xl">{ticket.description}</p>
                    </div>

                    {/* Action Area (If Resolved) */}
                    {isResolved && (
                      <div className="shrink-0 bg-emerald-50 rounded-xl p-4 border border-emerald-100 sm:w-64 space-y-2">
                        <p className="text-xs font-bold text-emerald-800 mb-2 flex items-center gap-1.5">
                          <CheckCircle2 size={14} /> Issue Resolved
                        </p>
                        <p className="text-xs text-emerald-700 mb-3 italic">"{ticket.resolutionSummary}"</p>
                        <button 
                          onClick={() => setResolvingTicketId(ticket.id)}
                          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition"
                        >
                          Confirm & Close Ticket
                        </button>
                        {onReopenTicket && (
                          <button 
                            onClick={() => onReopenTicket(ticket.id)}
                            className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition"
                          >
                            Reopen Issue
                          </button>
                        )}
                      </div>
                    )}

                    {isClosed && (
                      <div className="shrink-0 text-right space-y-2">
                         <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
                           <CheckCircle2 size={14} /> Closed
                         </span>
                         {onReopenTicket && (
                           <div>
                             <button
                               onClick={() => onReopenTicket(ticket.id)}
                               className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition"
                             >
                               Reopen Ticket
                             </button>
                           </div>
                         )}
                      </div>
                    )}
                  </div>

                  {/* Visual Status Tracker Bar (Only show if not closed) */}
                  {!isClosed && !isResolved && (
                    <div className="mt-8 pt-6 border-t border-zinc-100">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400 relative">
                        {/* Background Line */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-zinc-100 rounded-full z-0"></div>
                        {/* Active Line */}
                        <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-indigo-500 rounded-full z-0 transition-all duration-500 ${step === 1 ? 'w-0' : step === 2 ? 'w-1/2' : 'w-full'}`}></div>

                        <div className={`flex flex-col items-center gap-2 z-10 bg-white px-2 ${step >= 1 ? 'text-indigo-600' : ''}`}>
                          <div className={`h-4 w-4 rounded-full border-2 ${step >= 1 ? 'border-indigo-500 bg-white' : 'border-zinc-200 bg-zinc-100'}`}></div>
                          <span>Submitted</span>
                        </div>
                        <div className={`flex flex-col items-center gap-2 z-10 bg-white px-2 ${step >= 2 ? 'text-indigo-600' : ''}`}>
                          <div className={`h-4 w-4 rounded-full border-2 ${step >= 2 ? 'border-indigo-500 bg-white' : 'border-zinc-200 bg-zinc-100'}`}></div>
                          <span>In Progress</span>
                        </div>
                        <div className={`flex flex-col items-center gap-2 z-10 bg-white px-2 ${step >= 3 ? 'text-emerald-500' : ''}`}>
                          <div className={`h-4 w-4 rounded-full border-2 ${step >= 3 ? 'border-emerald-500 bg-white' : 'border-zinc-200 bg-zinc-100'}`}></div>
                          <span>Resolved</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 4. SUBMIT NEW TICKET (Frictionless Form) */}
      {activeTab === "submit_ticket" && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
          <div className="mb-8">
            <h3 className="text-xl font-bold text-zinc-900">How can we help?</h3>
            <p className="text-sm text-zinc-500 mt-1">Please provide the details of your issue and our team will investigate immediately.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-bold text-zinc-700 mb-2">Brief Subject</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Cannot access compliance module 3"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                />
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-bold text-zinc-700 mb-2">Detailed Description</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Please describe what you were trying to do, and any error messages you received..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">Issue Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                >
                  <option value="Technical Issue">Technical / Platform Issue</option>
                  <option value="Account Issue">Account / Login Issue</option>
                  <option value="Billing Issue">Billing / Invoice Inquiry</option>
                  <option value="Service Request">New Service Request</option>
                  <option value="General Inquiry">General Inquiry</option>
                </select>
              </div>

<div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">Business Impact (Urgency)</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                >
                  <option value="Low">Low - Minor inconvenience</option>
                  <option value="Medium">Medium - Normal workflow affected</option>
                  <option value="High">High - Significant business blockage</option>
                  <option value="Critical">Critical - System down / Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">Target Due Date</label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-100 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white transition hover:bg-indigo-700 shadow-sm"
              >
                <Send size={16} />
                Submit Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. DEADLINES CALENDAR */}
      {activeTab === "calendar" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <DeadlineCalendar
            currentUserRole="Client"
            currentUserId={activeClient.id}
            currentUserName={activeClient.contactPerson}
          />
        </div>
      )}

      {/* RESOLUTION CONFIRMATION MODAL */}
      {resolvingTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-2xl">
            <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
              <CheckCircle2 className="text-emerald-500" /> Close Ticket
            </h3>
            <p className="text-sm text-zinc-500 mt-2 mb-6">Are you satisfied with the resolution provided by our team?</p>

            <form onSubmit={handleConfirmResolution} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">Satisfaction Rating (1-5)</label>
                <input 
                  type="range" min="1" max="5" value={rating} 
                  onChange={(e) => setRating(Number(e.target.value))} 
                  className="w-full accent-emerald-500" 
                />
                <div className="flex justify-between text-xs text-zinc-400 font-bold mt-1">
                  <span>1 - Poor</span>
                  <span className="text-emerald-600">{rating} Stars</span>
                  <span>5 - Excellent</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-2">Feedback (Optional)</label>
                <textarea 
                  rows={2} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} 
                  placeholder="Tell us how we did..."
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20" 
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button type="button" onClick={() => setResolvingTicketId(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-100">Cancel</button>
                <button type="submit" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 shadow-sm">Confirm Closure</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Quick helper component for the banner icon
function Building2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
  );
}