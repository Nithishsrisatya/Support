import React, { useState } from "react";
import { User, Client, Notification, AuditLog, SentEmail } from "../types";
import { getRelativeTime } from "../utils";
import { Bell, ClipboardList, Database, Mail, Search, Ticket, CheckSquare, Building2, Users, X } from "lucide-react";
import ProfileDropdown from "./ProfileDropdown";
import ProfileModal from "./ProfileModal";
import { apiFetch } from "../services/api";

interface HeaderProps {
  currentUser: User | null;
  activeClient: Client | null;
  clients: Client[];
  systemUsers: User[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  sentEmails?: SentEmail[];
  onSwitchRole: (role: "Administrator" | "Manager" | "Employee" | "Client", targetId?: string) => void;
  onMarkNotificationRead: (id: string) => void;
  onClearNotifications: () => void;
  onLogout?: () => void;
  onOpenProfile: () => void;
  onOpenResetPassword?: () => void;
  onOpenNotificationCenter?: () => void;
}

export default function Header({
  currentUser,
  activeClient,
  notifications,
  auditLogs,
  sentEmails = [],
  onMarkNotificationRead,
  onClearNotifications,
  onSwitchRole: _onSwitchRole,
  onOpenProfile,
  onOpenResetPassword,
  onLogout,
  onOpenNotificationCenter,
}: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showEmails, setShowEmails] = useState(false);
const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>({
    tickets: [],
    tasks: [],
    employees: [],
    clients: [],
  });
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);

const activeTargetId = currentUser ? currentUser.id : activeClient ? activeClient.id : "";
  const roleNotifications = notifications.filter((n) => n.userId === activeTargetId);
  const unreadCount = roleNotifications.filter((n) => n.status !== "Read").length;

  const currentRoleName = currentUser ? currentUser.role : "Client";

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults({ tickets: [], tasks: [], employees: [], clients: [] });
      setShowSearchResults(false);
      return;
    }
    setSearching(true);
    setShowSearchResults(true);
    try {
      const data = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
      setSearchResults(data || { tickets: [], tasks: [], employees: [], clients: [] });
    } catch (err) {
      console.error("Search failed:", err);
      setSearchResults({ tickets: [], tasks: [], employees: [], clients: [] });
    } finally {
      setSearching(false);
    }
  };

  const totalResults =
    (searchResults.tickets?.length || 0) +
    (searchResults.tasks?.length || 0) +
    (searchResults.employees?.length || 0) +
    (searchResults.clients?.length || 0);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-900 font-sans sm:text-lg">Support & Task Core</h1>
            <p className="hidden text-[10px] uppercase tracking-wider text-zinc-400 font-mono sm:block">INTEGRATED SRS PLATFORM</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Global Search */}
          <div className="relative hidden md:block">
            <div className="flex w-64 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 focus-within:border-zinc-400 focus-within:bg-white transition">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
                placeholder="Search tickets, tasks, people..."
                className="w-full bg-transparent text-xs text-zinc-800 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => handleSearch("")} className="text-zinc-400 hover:text-zinc-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {showSearchResults && (
              <div className="absolute right-0 mt-2 w-96 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl ring-1 ring-black/5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                  <span className="text-xs font-semibold text-zinc-900">Search Results</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 font-mono">
                    {searching ? "..." : `${totalResults} found`}
                  </span>
                </div>

                <div className="mt-2 max-h-80 overflow-y-auto space-y-3">
                  {searching ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800"></div>
                    </div>
                  ) : totalResults === 0 ? (
                    <p className="py-8 text-center text-xs text-zinc-400">No results found for "{searchQuery}".</p>
                  ) : (
                    <>
                      {searchResults.tickets?.length > 0 && (
                        <SearchGroup
                          icon={<Ticket className="h-3.5 w-3.5 text-amber-500" />}
                          label="Tickets"
                          items={searchResults.tickets.map((t: any) => ({
                            id: t.id,
                            title: t.subject,
                            subtitle: `${t.status} · ${t.priority}`,
                          }))}
                        />
                      )}
                      {searchResults.tasks?.length > 0 && (
                        <SearchGroup
                          icon={<CheckSquare className="h-3.5 w-3.5 text-emerald-500" />}
                          label="Tasks"
                          items={searchResults.tasks.map((t: any) => ({
                            id: t.id,
                            title: t.title,
                            subtitle: `${t.status} · ${t.priority}`,
                          }))}
                        />
                      )}
                      {searchResults.employees?.length > 0 && (
                        <SearchGroup
                          icon={<Users className="h-3.5 w-3.5 text-sky-500" />}
                          label="Employees"
                          items={searchResults.employees.map((u: any) => ({
                            id: u.id,
                            title: u.fullName,
                            subtitle: `${u.role} · ${u.department}`,
                          }))}
                        />
                      )}
                      {searchResults.clients?.length > 0 && (
                        <SearchGroup
                          icon={<Building2 className="h-3.5 w-3.5 text-purple-500" />}
                          label="Clients"
                          items={searchResults.clients.map((c: any) => ({
                            id: c.id,
                            title: c.companyName,
                            subtitle: c.contactPerson,
                          }))}
                        />
                      )}
                    </>
                  )}
                </div>

                <div className="mt-2 border-t border-zinc-100 pt-2 text-center text-[9px] text-zinc-400">
                  Press Esc or click outside to close
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
                setShowLogs(false);
                setShowEmails(false);
              }}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-xs font-medium hover:bg-zinc-100 transition"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-white">
                {currentRoleName.charAt(0)}
              </div>
              <div className="text-left">
                <div className="font-semibold">{currentUser ? currentUser.fullName : activeClient?.companyName}</div>
                <div className="text-[10px] text-zinc-500">{currentRoleName}</div>
              </div>
            </button>

            {showProfileMenu && (
              <ProfileDropdown
                onProfile={() => {
                  setShowProfileMenu(false);
                  setShowProfileModal(true);
                  onOpenProfile();
                }}
                onLogout={() => {
                  setShowProfileMenu(false);
                  onLogout?.();
                }}
              />
            )}

            {/* {showProfileModal && currentUser && (
              <ProfileModal
                user={currentUser}
                onClose={() => setShowProfileModal(false)}
                onResetPassword={() => {
                  setShowProfileModal(false);
                  onOpenResetPassword?.();
                }}
              />
            )} */}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowLogs(false);
              }}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
              title="In-App Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white shadow-sm font-sans animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                  <span className="text-xs font-semibold text-zinc-900 font-sans">Notifications ({unreadCount} unread)</span>
                  {roleNotifications.length > 0 && (
                    <button onClick={onClearNotifications} className="text-[10px] font-medium text-zinc-500 hover:text-zinc-900 hover:underline">
                      Clear All
                    </button>
                  )}
                </div>

                <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                  {roleNotifications.length === 0 ? (
                    <p className="py-8 text-center text-xs text-zinc-400">No active notifications.</p>
                  ) : (
                    roleNotifications.slice(0, 5).map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-lg p-2 text-xs transition border ${
                          n.status !== "Read" ? "bg-zinc-50 border-zinc-200" : "bg-white border-zinc-100 opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <p className="font-semibold text-zinc-950 text-[11px]">{n.title}</p>
                          {n.status !== "Read" && (
                            <button
                              onClick={() => onMarkNotificationRead(n.id)}
                              className="text-[9px] font-semibold text-zinc-500 hover:text-zinc-900 shrink-0"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-600 leading-normal">{n.message}</p>
                        <p className="mt-1 text-[9px] text-zinc-400 font-mono">{getRelativeTime(n.createdDate)}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* View All Link */}
                {roleNotifications.length > 5 && (
                  <div className="mt-2 border-t border-zinc-100 pt-2">
                    <button
                      onClick={() => {
                        setShowNotifications(false);
                        onOpenNotificationCenter?.();
                      }}
                      className="w-full rounded-lg bg-zinc-50 py-2 text-center text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition"
                    >
                      View All ({roleNotifications.length} notifications)
                    </button>
                  </div>
                )}
                {roleNotifications.length > 0 && roleNotifications.length <= 5 && (
                  <div className="mt-2 border-t border-zinc-100 pt-2">
                    <button
                      onClick={() => {
                        setShowNotifications(false);
                        onOpenNotificationCenter?.();
                      }}
                      className="w-full rounded-lg bg-zinc-50 py-2 text-center text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition"
                    >
                      View Full Notification Center →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setShowLogs(!showLogs);
              setShowNotifications(false);
              setShowEmails(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
            title="Real-time Platform Audit Log"
          >
            <Database className="h-4 w-4 text-zinc-500" />
          </button>

          <div className="relative">
            <button
              onClick={() => {
                setShowEmails(!showEmails);
                setShowLogs(false);
                setShowNotifications(false);
              }}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
              title="SMTP Outbox Tracing Log"
            >
              <Mail className="h-4 w-4 text-zinc-500" />
              {sentEmails.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-[8px] font-bold text-white shadow-sm font-sans animate-pulse">
                  {sentEmails.length}
                </span>
              )}
            </button>

            {showEmails && (
              <div className="absolute right-0 mt-2 w-[420px] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl ring-1 ring-black/5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-900 font-sans">Real-time SMTP Mail Dispatcher Feed</h3>
                    <p className="text-[9px] text-zinc-400 uppercase tracking-widest font-mono">Live SMTP Transmissions</p>
                  </div>
                  <span className="rounded bg-emerald-950 px-2.5 py-0.5 text-[8.5px] font-bold text-emerald-300 font-mono">{sentEmails.length} DISPATCHED</span>
                </div>

                <div className="mt-3 max-h-80 overflow-y-auto space-y-3 pr-1 text-xs">
                  {sentEmails.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400 font-sans space-y-2">
                      <Mail className="h-8 w-8 mx-auto text-zinc-300 opacity-60" />
                      <p>No processed SMTP logs in this active environment context.</p>
                      <p className="text-[10px]">Create, update, or assign tickets/tasks to see auto-emails dispatch!</p>
                    </div>
                  ) : (
                    sentEmails.map((em) => (
                      <div key={em.id} className="border border-zinc-200 bg-zinc-50 rounded-lg p-2.5 font-mono text-[10px] text-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between border-b border-zinc-200 pb-1">
                          <span className="text-indigo-600 font-extrabold">{em.id}</span>
                          <span className="text-[9px] text-zinc-400">{getRelativeTime(em.timestamp)}</span>
                        </div>
                        <div className="space-y-0.5">
                          <p>
                            <span className="text-zinc-400 font-bold">FROM:</span> {em.from}
                          </p>
                          <p>
                            <span className="text-zinc-400 font-bold">TO:</span> {em.to}
                          </p>
                          <p>
                            <span className="text-zinc-400 font-bold">SUBJ:</span> <span className="text-zinc-650 font-bold">{em.subject}</span>
                          </p>
                        </div>
                        <div className="bg-zinc-100 p-2 rounded text-zinc-600 text-[9.5px] leading-relaxed whitespace-pre-line max-h-24 overflow-y-auto font-sans">
                          {em.body}
                        </div>
                        <div className="flex items-center justify-between text-[8px] uppercase font-bold pt-1 border-t border-zinc-150">
                          <span>Status:</span>
                          <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-400">{em.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 border-t border-zinc-100 pt-2 text-center text-[9px] text-zinc-500">SMTP logs are preserved server-side to guarantee zero data loss.</div>
              </div>
            )}
          </div>

{showLogs && (
            <div className="absolute right-4 top-16 z-50 mt-1 w-96 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl ring-1 ring-black/5 sm:right-6 lg:right-8 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-900">Live Audit Activity Trail</h3>
                  <p className="text-[9px] text-zinc-400 uppercase tracking-widest font-mono">SOX/SLA Compliance</p>
                </div>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 font-mono">{auditLogs.length} LOGS</span>
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto space-y-3 pr-1">
                {auditLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="border-l-2 border-zinc-800 pl-3 py-0.5">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="font-semibold text-zinc-700">{log.userFullName}</span>
                      <span className="font-mono text-zinc-400">{getRelativeTime(log.timestamp)}</span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] font-bold text-zinc-800 uppercase tracking-tight">[{log.action}]</p>
                    <p className="mt-0.5 text-[11px] text-zinc-600 leading-relaxed">{log.description}</p>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-[8.5px] text-zinc-400">
                      <span>
                        Ref: {log.entityType} ({log.entityId})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-zinc-100 pt-2 text-center">
                <p className="text-[10px] text-zinc-400">Displaying 10 most recent compliance logs.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function SearchGroup({ icon, label, items }: { icon: React.ReactNode; label: string; items: { id: string; title: string; subtitle: string }[] }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="text-[9px] text-zinc-400 font-mono">({items.length})</span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-2.5 py-1.5 hover:bg-zinc-50 transition cursor-pointer">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-800 truncate">{item.title}</p>
              <p className="text-[10px] text-zinc-400 font-mono truncate">{item.id}</p>
            </div>
            <span className="ml-2 shrink-0 text-[9px] text-zinc-400">{item.subtitle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

