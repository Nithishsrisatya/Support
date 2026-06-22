import React, { useState } from "react";
import { User, Client, Notification, AuditLog, SentEmail } from "../types";
import { formatDateTime, getRelativeTime } from "../utils";
import { Shield, Users, Briefcase, Bell, ClipboardList, Check, Database, HelpCircle, LogIn, Mail, LogOut } from "lucide-react";

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
}

export default function Header({
  currentUser,
  activeClient,
  clients,
  systemUsers,
  notifications,
  auditLogs,
  sentEmails = [],
  onSwitchRole,
  onMarkNotificationRead,
  onClearNotifications,
  onLogout,
}: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showSelectors, setShowSelectors] = useState(false);
  const [showEmails, setShowEmails] = useState(false);

  // Filter notifications for active context (User or Client)
  const activeTargetId = currentUser ? currentUser.id : activeClient ? activeClient.id : "";
  const roleNotifications = notifications.filter((n) => n.userId === activeTargetId);
  const unreadCount = roleNotifications.filter((n) => n.status !== "Read").length;

  const currentRoleName = currentUser ? currentUser.role : "Client";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Logo & Platform Name */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-900 font-sans sm:text-lg">
              Support & Task Core
            </h1>
            <p className="hidden text-[10px] uppercase tracking-wider text-zinc-400 font-mono sm:block">
              INTEGRATED SRS PLATFORM
            </p>
          </div>
        </div>

        {/* Live System Time & Environment Status */}
        <div className="hidden lg:flex lg:items-center lg:gap-4">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-100">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-mono text-[10px] tracking-wide">● AUDIT ACTIVE</span>
          </div>

          <div className="text-right font-mono text-[11px] text-zinc-500">
            <div>SYSTEM: 2026-06-16 08:59</div>
            <div className="text-[9px] text-zinc-400">ROLE-BASED CLOSED MODEL</div>
          </div>
        </div>

        {/* Core Quick Controls & Interactive Role Switcher */}
        <div className="flex items-center gap-3">
          
          {/* Persona quick switch badge */}
          <div className="relative">
            <button
              onClick={() => setShowSelectors(!showSelectors)}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              <div className="flex h-4 w-4 items-center justify-center rounded bg-zinc-900 text-[9px] text-white">
                {currentRoleName.charAt(0)}
              </div>
              <span className="max-w-[80px] truncate sm:max-w-[120px]">
                {currentUser ? currentUser.fullName : activeClient ? activeClient.companyName : "Guest"}
              </span>
              <span className="rounded bg-zinc-200 px-1 py-0.2 text-[8px] uppercase tracking-wider text-zinc-600 font-mono">
                {currentRoleName}
              </span>
            </button>

            {showSelectors && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="border-b border-zinc-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                  Switch Active Role Experience
                </div>
                
                {/* Admin Quick Switch */}
                <button
                  type="button"
                  onClick={() => {
                    onSwitchRole("Administrator", "U-1");
                    setShowSelectors(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition hover:bg-zinc-50 text-zinc-700"
                >
                  <Shield className="h-4 w-4 text-purple-600" />
                  <div className="flex-1 truncate">
                    <p className="font-semibold text-zinc-900">Sarah Jenkins</p>
                    <p className="text-[10px] text-zinc-400">Main Administrator</p>
                  </div>
                  {currentUser?.id === "U-1" && <Check className="h-3.5 w-3.5 text-zinc-900" />}
                </button>

                {/* Manager Quick Switch */}
                <button
                  type="button"
                  onClick={() => {
                    onSwitchRole("Manager", "U-2");
                    setShowSelectors(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition hover:bg-zinc-50 text-zinc-700"
                >
                  <Users className="h-4 w-4 text-sky-600" />
                  <div className="flex-1 truncate">
                    <p className="font-semibold text-zinc-900">Robert Chen</p>
                    <p className="text-[10px] text-zinc-400">Team Manager</p>
                  </div>
                  {currentUser?.id === "U-2" && <Check className="h-3.5 w-3.5 text-zinc-900" />}
                </button>

                {/* Employee Quick Switch */}
                <button
                  type="button"
                  onClick={() => {
                    onSwitchRole("Employee", "U-3");
                    setShowSelectors(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition hover:bg-zinc-50 text-zinc-700"
                >
                  <Briefcase className="h-4 w-4 text-emerald-600" />
                  <div className="flex-1 truncate">
                    <p className="font-semibold text-zinc-900">David Kim</p>
                    <p className="text-[10px] text-zinc-400">Support Employee</p>
                  </div>
                  {currentUser?.id === "U-3" && <Check className="h-3.5 w-3.5 text-zinc-900" />}
                </button>

                {/* Client perspective switcher */}
                <div className="mt-1 border-t border-zinc-100">
                  <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                    Select Corporate Client Portal
                  </div>
                  {clients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSwitchRole("Client", c.id);
                        setShowSelectors(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-1 text-left text-[11px] text-zinc-600 transition hover:bg-zinc-50"
                    >
                      <span className="truncate font-medium">{c.companyName}</span>
                      <span className="text-[9px] text-zinc-400 font-mono">({c.contactPerson})</span>
                      {activeClient?.id === c.id && !currentUser && <Check className="h-3 w-3 text-zinc-950" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notifications Trigger */}
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
                  <span className="text-xs font-semibold text-zinc-900 font-sans">
                    Notifications ({unreadCount} unread)
                  </span>
                  {roleNotifications.length > 0 && (
                    <button
                      onClick={onClearNotifications}
                      className="text-[10px] font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                  {roleNotifications.length === 0 ? (
                    <p className="py-8 text-center text-xs text-zinc-400">No active notifications.</p>
                  ) : (
                    roleNotifications.map((n) => (
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
              </div>
            )}
          </div>

          {/* Global Audit Logs Indicator */}
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

          {/* SMTP Live Outbox Tracing Dropdown */}
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
                  <span className="rounded bg-emerald-950 px-2.5 py-0.5 text-[8.5px] font-bold text-emerald-300 font-mono">
                    {sentEmails.length} DISPATCHED
                  </span>
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
                          <p><span className="text-zinc-400 font-bold">FROM:</span> {em.from}</p>
                          <p><span className="text-zinc-400 font-bold">TO:</span> {em.to}</p>
                          <p><span className="text-zinc-400 font-bold">SUBJ:</span> <span className="text-zinc-650 font-bold">{em.subject}</span></p>
                        </div>
                        <div className="bg-zinc-100 p-2 rounded text-zinc-600 text-[9.5px] leading-relaxed whitespace-pre-line max-h-24 overflow-y-auto font-sans">
                          {em.body}
                        </div>
                        <div className="flex items-center justify-between text-[8px] uppercase font-bold pt-1 border-t border-zinc-150">
                          <span>Status:</span>
                          <span className={`px-1.5 py-0.2 rounded-full ${
                            em.status.includes("Dispatched") ? "bg-emerald-50 text-emerald-800" : "bg-indigo-100 text-indigo-400"
                          }`}>{em.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 border-t border-zinc-100 pt-2 text-center text-[9px] text-zinc-500">
                  SMTP logs are preserved server-side to guarantee zero data loss.
                </div>
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
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 font-mono">
                  {auditLogs.length} LOGS
                </span>
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto space-y-3 pr-1">
                {auditLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="border-l-2 border-zinc-800 pl-3 py-0.5">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="font-semibold text-zinc-700">{log.userFullName}</span>
                      <span className="font-mono text-zinc-400">{getRelativeTime(log.timestamp)}</span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] font-bold text-zinc-800 uppercase tracking-tight">
                      [{log.action}]
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-600 leading-relaxed">{log.description}</p>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-[8.5px] text-zinc-400">
                      <span>Ref: {log.entityType} ({log.entityId})</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-zinc-100 pt-2 text-center">
                <p className="text-[10px] text-zinc-400">Displaying 10 most recent compliance logs.</p>
              </div>
            </div>
          )}

          {/* Secure Logout Button */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 hover:text-red-700"
              title="Secure Logout Session"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}

        </div>

      </div>
    </header>
  );
}
