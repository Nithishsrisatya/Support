import React, { useState, useMemo } from "react";
import { AuditLog } from "../types";
import { formatDateTime } from "../utils";
import {
  Search,
  Filter,
  Download,
  Clock,
  User,
  Activity,
  ChevronDown,
  ChevronUp,
  X,
  FileSpreadsheet,
} from "lucide-react";

interface AuditLogPanelProps {
  auditLogs: AuditLog[];
  users?: { id: string; fullName: string; email: string }[];
}


type SortField = "timestamp" | "userFullName" | "action" | "entityType";
type SortDirection = "asc" | "desc";

const ACTION_OPTIONS = [
  "All Actions",
  "Login",
  "Logout",
  "Password Change",
  "Password Reset",
  "Account Creation",
  "Account Status Change",
  "User Creation",
  "User Deletion",
  "Client Creation",
  "Client Deleted",
  "Ticket Creation",
  "Ticket Update",
  "Ticket Deleted",
  "Task Assignment",
  "Task Update",
  "Task Deleted",
  "Admin Action",
  "Email Activity",
  "Authentication",
  "Log Out",
];

const ENTITY_OPTIONS = [
  "All Entities",
  "User",
  "Client",
  "Ticket",
  "Task",
  "Notification",
  "Email",
  "System",
];

export default function AuditLogPanel({ auditLogs }: AuditLogPanelProps) {
  // Filter states
  const [searchText, setSearchText] = useState("");
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [entityFilter, setEntityFilter] = useState("All Entities");
  const [userFilter, setUserFilter] = useState("All Users");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Sort states
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Expanded detail row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Derive unique users from logs
  const uniqueUsers = useMemo(() => {
    const userMap = new Map<string, string>();
    auditLogs.forEach((log) => {
      if (log.userFullName && log.userId) {
        userMap.set(log.userId, log.userFullName);
      }
    });
    return Array.from(userMap.entries()).map(([id, name]) => ({ id, name }));
  }, [auditLogs]);

  // Apply filters
  const filteredLogs = useMemo(() => {
    let logs = [...auditLogs];

    // Text search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.description?.toLowerCase().includes(q) ||
          l.userFullName?.toLowerCase().includes(q) ||
          l.action?.toLowerCase().includes(q) ||
          l.entityType?.toLowerCase().includes(q) ||
          l.entityId?.toLowerCase().includes(q) ||
          l.id?.toLowerCase().includes(q)
      );
    }

    // Action filter
    if (actionFilter !== "All Actions") {
      logs = logs.filter((l) => l.action === actionFilter);
    }

    // Entity filter
    if (entityFilter !== "All Entities") {
      logs = logs.filter((l) => l.entityType === entityFilter);
    }

    // User filter
    if (userFilter !== "All Users") {
      logs = logs.filter((l) => l.userId === userFilter || l.userFullName === userFilter);
    }

    // Date range
    if (fromDate) {
      const from = new Date(fromDate).getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() >= from);
    }
    if (toDate) {
      const to = new Date(toDate + "T23:59:59").getTime();
      logs = logs.filter((l) => new Date(l.timestamp).getTime() <= to);
    }

    // Sort
    logs.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "timestamp":
          cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          break;
        case "userFullName":
          cmp = (a.userFullName || "").localeCompare(b.userFullName || "");
          break;
        case "action":
          cmp = (a.action || "").localeCompare(b.action || "");
          break;
        case "entityType":
          cmp = (a.entityType || "").localeCompare(b.entityType || "");
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return logs;
  }, [auditLogs, searchText, actionFilter, entityFilter, userFilter, fromDate, toDate, sortField, sortDirection]);

  // Paginate
  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchText, actionFilter, entityFilter, userFilter, fromDate, toDate]);

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ["ID", "Timestamp", "User", "Action", "Entity Type", "Entity ID", "Description"];
    const rows = filteredLogs.map((l) => [
      l.id,
      new Date(l.timestamp).toISOString(),
      l.userFullName || "",
      l.action || "",
      l.entityType || "",
      l.entityId || "",
      (l.description || "").replace(/"/g, '""'),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AuditLogs_Export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 text-zinc-400" />;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-3 w-3 text-indigo-600" />
    ) : (
      <ChevronDown className="h-3 w-3 text-indigo-600" />
    );
  };

  // Action badge color
  const getActionBadge = (action: string) => {
    const actionUpper = (action || "").toLowerCase();
    if (actionUpper.includes("login") || actionUpper.includes("authentication")) return "bg-blue-50 text-blue-700";
    if (actionUpper.includes("logout")) return "bg-zinc-100 text-zinc-600";
    if (actionUpper.includes("password") || actionUpper.includes("reset")) return "bg-amber-50 text-amber-700";
    if (actionUpper.includes("creation") || actionUpper.includes("create")) return "bg-emerald-50 text-emerald-700";
    if (actionUpper.includes("delet") || actionUpper.includes("deleted")) return "bg-red-50 text-red-700";
    if (actionUpper.includes("update") || actionUpper.includes("assignment")) return "bg-sky-50 text-sky-700";
    if (actionUpper.includes("admin")) return "bg-purple-50 text-purple-700";
    if (actionUpper.includes("email")) return "bg-indigo-50 text-indigo-700";
    return "bg-zinc-50 text-zinc-600";
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 font-sans flex items-center gap-2">
          <Activity className="h-5 w-5 text-indigo-600" />
          Audit Logs & Compliance Trail
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          Track all system events: user activity, ticket/task changes, and administrative actions.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 max-w-md">
            <Search className="h-4 w-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              placeholder="Search by description, user, action, entity..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-transparent text-xs text-zinc-800 focus:outline-none"
            />
            {searchText && (
              <button onClick={() => setSearchText("")} className="text-zinc-400 hover:text-zinc-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-zinc-800"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              Action
            </label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              Entity Type
            </label>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              User
            </label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium focus:outline-none"
            >
              <option value="All Users">All Users</option>
              {uniqueUsers.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs focus:outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchText("");
                setActionFilter("All Actions");
                setEntityFilter("All Entities");
                setUserFilter("All Users");
                setFromDate("");
                setToDate("");
              }}
              className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Showing <strong className="text-zinc-800">{paginatedLogs.length}</strong> of{" "}
          <strong className="text-zinc-800">{filteredLogs.length}</strong> audit logs
        </span>
      </div>

      {/* Audit Log Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-wider font-mono text-[10px]">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-zinc-800 select-none"
                  onClick={() => handleSort("timestamp")}
                >
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Timestamp
                    <SortIcon field="timestamp" />
                  </span>
                </th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-zinc-800 select-none"
                  onClick={() => handleSort("userFullName")}
                >
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    User
                    <SortIcon field="userFullName" />
                  </span>
                </th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-zinc-800 select-none"
                  onClick={() => handleSort("action")}
                >
                  <span className="flex items-center gap-1">
                    Action
                    <SortIcon field="action" />
                  </span>
                </th>
                <th
                  className="px-4 py-3 cursor-pointer hover:text-zinc-800 select-none"
                  onClick={() => handleSort("entityType")}
                >
                  <span className="flex items-center gap-1">
                    Entity
                    <SortIcon field="entityType" />
                  </span>
                </th>
                <th className="px-4 py-3">Entity ID</th>
                <th className="px-4 py-3 hidden lg:table-cell">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-6 w-6 text-zinc-300" />
                      <p className="font-medium">No audit logs match the current filters.</p>
                      <p className="text-[11px]">Try adjusting your search criteria or clear filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      className="hover:bg-zinc-50/70 transition cursor-pointer"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 text-zinc-300">
                        {expandedId === log.id ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500 whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-zinc-100 flex items-center justify-center text-[9px] font-bold text-zinc-600">
                            {(log.userFullName || "?").charAt(0)}
                          </div>
                          <span className="font-medium text-zinc-800">{log.userFullName || "System"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${getActionBadge(log.action)}`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                          {log.entityType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500 text-[10px]">
                        {log.entityId || "-"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 hidden lg:table-cell max-w-xs truncate">
                        {log.description || "-"}
                      </td>
                    </tr>
                    {/* Expanded detail row */}
                    {expandedId === log.id && (
                      <tr className="bg-zinc-50/50">
                        <td colSpan={7} className="px-8 py-4">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">
                                Log ID
                              </span>
                              <span className="font-mono text-zinc-800">{log.id}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">
                                User ID
                              </span>
                              <span className="font-mono text-zinc-800">{log.userId}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">
                                Full Description
                              </span>
                              <p className="text-zinc-700 leading-relaxed bg-white rounded-lg border border-zinc-100 p-3">
                                {log.description || "No description available."}
                              </p>
                            </div>
                            <div>
                              <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">
                                Timestamp (ISO)
                              </span>
                              <span className="font-mono text-zinc-500 text-[11px]">{log.timestamp}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">
                                Action / Entity
                              </span>
                              <span className="text-zinc-700">
                                {log.action} on {log.entityType} ({log.entityId || "N/A"})
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
              const page = start + i;
              if (page > totalPages) return null;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`rounded-lg px-3 py-1.5 font-medium ${
                    currentPage === page
                      ? "bg-zinc-950 text-white"
                      : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
