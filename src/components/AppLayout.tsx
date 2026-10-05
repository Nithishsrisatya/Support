import React, { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Building2,
  Users,
  LifeBuoy,
  CheckSquare,
  Calendar,
  BarChart3,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  Search,
  Bell,
  User as UserIcon,
  ChevronRight,
  Ticket as TicketIcon,
} from "lucide-react";
import { User, Notification } from "../types";
import { apiFetch } from "../services/api";

export type NavTab =
  | "dashboard"
  | "clients"
  | "employees"
  | "tickets"
  | "tasks"
  | "calendar"
  | "reports"
  | "audit";

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Building2 },
  { id: "employees", label: "Employees", icon: Users },
  { id: "tickets", label: "Tickets", icon: LifeBuoy },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "audit", label: "Audit Logs", icon: ShieldAlert },
];

const TAB_TITLES: Record<NavTab, { title: string; subtitle: string }> = {
  dashboard: { title: "Executive Dashboard", subtitle: "Real-time Operations & Metrics" },
  clients: { title: "Clients Directory", subtitle: "Accounts, Contracts & Contacts" },
  employees: { title: "Staff & Employees", subtitle: "Directory, Roles & Workload" },
  tickets: { title: "Support Tickets", subtitle: "Triage, Assignments & SLAs" },
  tasks: { title: "Organizational Tasks", subtitle: "Execution, Subtasks & Review" },
  calendar: { title: "Deadline Calendar", subtitle: "Upcoming Schedules & Milestones" },
  reports: { title: "Reports & Analytics", subtitle: "Exportable Audits & Performance" },
  audit: { title: "Audit Trail", subtitle: "Security Logs & System Activities" },
};

interface AppLayoutProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  user?: User | null;
  notifications?: Notification[];
  onLogout?: () => void;
  onOpenProfile?: () => void;
  onOpenNotificationCenter?: () => void;
  children: React.ReactNode;
}

export default function AppLayout({
  activeTab,
  onTabChange,
  user,
  notifications = [],
  onLogout,
  onOpenProfile,
  onOpenNotificationCenter,
  children,
}: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Global search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    tickets: any[];
    tasks: any[];
    employees: any[];
    clients: any[];
  }>({ tickets: [], tasks: [], employees: [], clients: [] });
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Unread notifications count
  const unreadCount = notifications.filter(
    (n) => n.userId === user?.id && n.status !== "Read"
  ).length;

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close search on escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowSearchResults(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const currentTabMeta = TAB_TITLES[activeTab] || {
    title: "Operations Workspace",
    subtitle: "Management Console",
  };

  // User initials for avatar
  const userInitials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "AD";

  const renderNavLinks = () => (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              onTabChange(item.id);
              setMobileOpen(false);
            }}
            className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              isActive
                ? "bg-indigo-50 text-indigo-700 font-semibold shadow-sm shadow-indigo-100/50"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 transition-colors ${
                isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
              }`}
            />
            <span className="flex-1 text-left truncate">{item.label}</span>
            {isActive && (
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col bg-white">
      {/* Workspace Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-slate-900 tracking-tight font-sans truncate">
            Support & Task Core
          </h1>
          <p className="text-[10px] font-semibold text-slate-400 font-mono tracking-wider uppercase truncate">
            Operations Workspace
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto">{renderNavLinks()}</div>

      {/* Sidebar Footer - User Profile & Logout */}
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 border border-slate-200/60">
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:opacity-80 transition"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white shadow-xs">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {user?.fullName || "Administrator"}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-block rounded bg-indigo-100/80 px-1.5 py-0.2 text-[9px] font-bold text-indigo-700 uppercase tracking-wide">
                  {user?.role || "Admin"}
                </span>
              </div>
            </div>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              title="Sign out of platform"
              aria-label="Log Out"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* ───────────────────────────────────────────────────────── */}
      {/* MOBILE DRAWER OVERLAY */}
      {/* ───────────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-full bg-white shadow-2xl flex flex-col">
            <div className="absolute right-2.5 top-3.5">
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────── */}
      {/* DESKTOP FIXED SIDEBAR */}
      {/* ───────────────────────────────────────────────────────── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col border-r border-slate-200">
        {renderSidebarContent()}
      </aside>

      {/* ───────────────────────────────────────────────────────── */}
      {/* MAIN CONTAINER (OFFSET BY SIDEBAR WIDTH ON DESKTOP) */}
      {/* ───────────────────────────────────────────────────────── */}
      <div className="lg:pl-64 flex flex-col flex-1 min-h-screen">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
          {/* Left: Mobile Toggle & Breadcrumbs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>Workspace</span>
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium text-slate-600 capitalize">{activeTab}</span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
                {currentTabMeta.title}
              </h2>
            </div>
          </div>

          {/* Right: Global Search & Action Controls */}
          <div className="flex items-center gap-3">
            {/* Global Search Input */}
            <div ref={searchContainerRef} className="relative hidden md:block">
              <div className="flex w-64 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/20 transition">
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
                  placeholder="Search tickets, tasks, people..."
                  className="w-full bg-transparent text-xs text-slate-800 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => handleSearch("")}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Floating Search Results Dropdown */}
              {showSearchResults && (
                <div className="absolute right-0 mt-2 w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-black/5 z-50 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-semibold text-slate-900">
                      Search Results
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 font-mono">
                      {searching ? "Searching..." : `${totalResults} found`}
                    </span>
                  </div>

                  <div className="mt-2 max-h-80 overflow-y-auto space-y-3">
                    {searching ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
                      </div>
                    ) : totalResults === 0 ? (
                      <p className="py-8 text-center text-xs text-slate-400">
                        No results found for "{searchQuery}".
                      </p>
                    ) : (
                      <>
                        {searchResults.tickets?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                              <TicketIcon className="h-3 w-3" />
                              <span>Tickets ({searchResults.tickets.length})</span>
                            </div>
                            <div className="space-y-1">
                              {searchResults.tickets.map((t: any) => (
                                <div
                                  key={t.id}
                                  onClick={() => {
                                    onTabChange("tickets");
                                    setShowSearchResults(false);
                                  }}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2 hover:bg-slate-50 cursor-pointer transition"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-800 truncate">
                                      {t.subject}
                                    </p>
                                    <p className="text-[10px] font-mono text-slate-400">
                                      {t.id}
                                    </p>
                                  </div>
                                  <span className="ml-2 text-[10px] font-medium text-slate-500 shrink-0">
                                    {t.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.tasks?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                              <CheckSquare className="h-3 w-3" />
                              <span>Tasks ({searchResults.tasks.length})</span>
                            </div>
                            <div className="space-y-1">
                              {searchResults.tasks.map((task: any) => (
                                <div
                                  key={task.id}
                                  onClick={() => {
                                    onTabChange("tasks");
                                    setShowSearchResults(false);
                                  }}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2 hover:bg-slate-50 cursor-pointer transition"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-800 truncate">
                                      {task.title}
                                    </p>
                                    <p className="text-[10px] font-mono text-slate-400">
                                      {task.id}
                                    </p>
                                  </div>
                                  <span className="ml-2 text-[10px] font-medium text-slate-500 shrink-0">
                                    {task.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.employees?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-sky-600">
                              <Users className="h-3 w-3" />
                              <span>Employees ({searchResults.employees.length})</span>
                            </div>
                            <div className="space-y-1">
                              {searchResults.employees.map((emp: any) => (
                                <div
                                  key={emp.id}
                                  onClick={() => {
                                    onTabChange("employees");
                                    setShowSearchResults(false);
                                  }}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2 hover:bg-slate-50 cursor-pointer transition"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-800 truncate">
                                      {emp.fullName}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      {emp.role} · {emp.department}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.clients?.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-purple-600">
                              <Building2 className="h-3 w-3" />
                              <span>Clients ({searchResults.clients.length})</span>
                            </div>
                            <div className="space-y-1">
                              {searchResults.clients.map((c: any) => (
                                <div
                                  key={c.id}
                                  onClick={() => {
                                    onTabChange("clients");
                                    setShowSearchResults(false);
                                  }}
                                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2 hover:bg-slate-50 cursor-pointer transition"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-800 truncate">
                                      {c.companyName}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                      {c.contactPerson}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notifications Bell */}
            <button
              onClick={onOpenNotificationCenter}
              title="Notifications"
              className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-xs"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-xs">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Profile Avatar Trigger */}
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 hover:bg-slate-50 transition shadow-xs"
              aria-label="Open profile modal"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                {userInitials}
              </div>
            </button>
          </div>
        </header>

        {/* Main Canvas Content */}
        <main className="flex-1 min-w-0 bg-slate-50 p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

