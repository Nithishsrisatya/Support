import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Ticket as TicketIcon,
  CheckSquare,
  Clock,
  Filter,
  User as UserIcon,
  Building2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "../services/api";
import { formatDateTime } from "../utils";
import TicketDetailModal from "./TicketDetailModal";
import TaskDetailModal from "./TaskDetailModal";
import { Ticket, Task, TicketStatus, TaskStatus, ReviewStatus } from "../types";

export type CalendarFilterType =
  | "all"
  | "tickets"
  | "tasks"
  | "my_items"
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "completed";

export type CalendarViewMode = "month" | "week" | "day";

export interface CalendarEvent {
  id: string;
  type: "ticket" | "task";
  title: string;
  dueDate: string;
  status: string;
  priority?: string | null;
  assignedTo?: string | null;
  assignedEmployeeName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  deadlineStage: "COMPLETED" | "UPCOMING" | "DUE_TOMORROW" | "DUE_TODAY" | "OVERDUE";
  color: "green" | "blue" | "yellow" | "orange" | "red";
}

interface DeadlineCalendarProps {
  currentUserRole: string; // 'Administrator' | 'Manager' | 'Employee' | 'Client'
  currentUserId: string;
  currentUserName?: string;
  onRefreshData?: () => void;
}

export default function DeadlineCalendar({
  currentUserRole,
  currentUserId,
  currentUserName = "User",
  onRefreshData,
}: DeadlineCalendarProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [filter, setFilter] = useState<CalendarFilterType>("all");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal inspection states
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  // Format YYYY-MM-DD
  const formatYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Calculate visible range based on current viewMode & currentDate
  const visibleRange = useMemo(() => {
    if (viewMode === "month") {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      // First day of month
      const firstDayOfMonth = new Date(year, month, 1);
      // Last day of month
      const lastDayOfMonth = new Date(year, month + 1, 0);

      // Start from previous Sunday
      const start = new Date(firstDayOfMonth);
      start.setDate(start.getDate() - start.getDay());

      // End on following Saturday
      const end = new Date(lastDayOfMonth);
      end.setDate(end.getDate() + (6 - end.getDay()));

      return { start, end };
    } else if (viewMode === "week") {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());

      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      return { start, end };
    } else {
      // Day view
      const start = new Date(currentDate);
      const end = new Date(currentDate);
      return { start, end };
    }
  }, [currentDate, viewMode]);

  // Fetch events whenever visibleRange changes
  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const startStr = formatYMD(visibleRange.start);
      const endStr = formatYMD(visibleRange.end);

      const data: CalendarEvent[] = await apiFetch(
        `/calendar/deadlines?start=${startStr}&end=${endStr}`
      );
      setEvents(data || []);
    } catch (err: any) {
      console.error("Failed to fetch calendar deadlines:", err);
      setFetchError(err.message || "Failed to load calendar deadlines");
    } finally {
      setLoading(false);
    }
  }, [visibleRange]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Navigation handlers
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() - 1);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() - 7);
    } else {
      next.setDate(next.getDate() - 1);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === "month") {
      next.setMonth(next.getMonth() + 1);
    } else if (viewMode === "week") {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + 1);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Header Title
  const headerTitle = useMemo(() => {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    if (viewMode === "month") {
      return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else if (viewMode === "week") {
      const s = visibleRange.start;
      const e = visibleRange.end;
      return `${monthNames[s.getMonth()].slice(0, 3)} ${s.getDate()} - ${monthNames[e.getMonth()].slice(0, 3)} ${e.getDate()}, ${e.getFullYear()}`;
    } else {
      return `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
    }
  }, [currentDate, viewMode, visibleRange]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (filter === "tickets" && ev.type !== "ticket") return false;
      if (filter === "tasks" && ev.type !== "task") return false;
      if (filter === "my_items") {
        if (currentUserRole === "Client") {
          if (ev.clientId !== currentUserId) return false;
        } else {
          if (ev.assignedTo !== currentUserId) return false;
        }
      }
      if (filter === "overdue" && ev.deadlineStage !== "OVERDUE") return false;
      if (filter === "due_today" && ev.deadlineStage !== "DUE_TODAY") return false;
      if (filter === "due_tomorrow" && ev.deadlineStage !== "DUE_TOMORROW") return false;
      if (filter === "completed" && ev.deadlineStage !== "COMPLETED") return false;
      return true;
    });
  }, [events, filter, currentUserId, currentUserRole]);

  // Group events by date string (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const dateKey = String(ev.dueDate).split("T")[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(ev);
    }
    return map;
  }, [filteredEvents]);

  // Clicking an event opens existing modals
  const handleEventClick = async (event: CalendarEvent) => {
    try {
      setModalLoading(true);
      if (event.type === "ticket") {
        const ticketData: Ticket = await apiFetch(`/tickets/${event.id}`);
        setSelectedTicket(ticketData);
      } else if (event.type === "task") {
        const taskData: Task = await apiFetch(`/tasks/${event.id}`);
        setSelectedTask(taskData);
      }
    } catch (err: any) {
      console.error("Failed to fetch event details:", err);
      alert(err.message || "Failed to open details for this item.");
    } finally {
      setModalLoading(false);
    }
  };

  // Color classes map for stage pills
  const getStagePillClasses = (stage: CalendarEvent["deadlineStage"]) => {
    switch (stage) {
      case "COMPLETED":
        return "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200";
      case "UPCOMING":
        return "bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200";
      case "DUE_TOMORROW":
        return "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200";
      case "DUE_TODAY":
        return "bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200";
      case "OVERDUE":
        return "bg-red-100 text-red-800 border-red-300 hover:bg-red-200";
      default:
        return "bg-zinc-100 text-zinc-800 border-zinc-300 hover:bg-zinc-200";
    }
  };

  // Calendar Grid Days for Month View
  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const curr = new Date(visibleRange.start);
    while (curr <= visibleRange.end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [visibleRange]);

  const todayStr = formatYMD(new Date());

  return (
    <div className="space-y-6">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <CalendarIcon size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Deadline Calendar</h2>
              <p className="text-xs text-zinc-500">
                Track ticket SLAs, task deliverables, and critical milestones by due date.
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Buttons */}
          <div className="flex rounded-xl bg-zinc-100 p-1">
            {(["month", "week", "day"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wide transition ${
                  viewMode === mode
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadEvents()}
            disabled={loading}
            className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition shadow-sm"
            title="Refresh deadlines"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-indigo-600" : ""} />
          </button>
        </div>
      </div>

      {/* NAVIGATION BAR & FILTERS */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 shadow-sm"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={handleToday}
            className="px-3.5 py-1.5 text-xs font-bold rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 shadow-sm"
          >
            Today
          </button>
          <button
            onClick={handleNext}
            className="p-2 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 shadow-sm"
          >
            <ChevronRight size={16} />
          </button>
          <h3 className="text-base font-bold text-zinc-900 ml-2 font-mono">
            {headerTitle}
          </h3>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 mr-1 text-xs text-zinc-400 font-bold">
            <Filter size={14} />
            <span>Filter:</span>
          </div>
          {[
            { id: "all", label: "All" },
            { id: "tickets", label: "Tickets" },
            ...(currentUserRole !== "Client" ? [{ id: "tasks", label: "Tasks" }] : []),
            { id: "my_items", label: "My Items" },
            { id: "overdue", label: "Overdue" },
            { id: "due_today", label: "Due Today" },
            { id: "due_tomorrow", label: "Due Tomorrow" },
            { id: "completed", label: "Completed" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as CalendarFilterType)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                filter === f.id
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* COLOR LEGEND */}
      <div className="flex flex-wrap items-center gap-3 px-1 text-xs font-medium text-zinc-600">
        <span className="font-bold text-zinc-500 uppercase tracking-wider text-[11px]">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          <span>Completed</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500"></span>
          <span>Upcoming</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
          <span>Due Tomorrow</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-500"></span>
          <span>Due Today</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600"></span>
          <span>Overdue</span>
        </span>
      </div>

      {/* ERROR MESSAGE */}
      {fetchError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{fetchError}</span>
        </div>
      )}

      {/* CALENDAR BODY */}
      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        {/* ─────────────── 1. MONTH VIEW ─────────────── */}
        {viewMode === "month" && (
          <div>
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/70 text-center text-xs font-bold text-zinc-500 py-3 font-mono">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-zinc-200">
              {monthDays.map((day) => {
                const dayStr = formatYMD(day);
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = dayStr === todayStr;
                const dayEvents = eventsByDate.get(dayStr) || [];

                return (
                  <div
                    key={dayStr}
                    className={`min-h-[120px] p-2 flex flex-col justify-between transition ${
                      !isCurrentMonth ? "bg-zinc-50/50 text-zinc-400" : "bg-white"
                    } ${isToday ? "bg-indigo-50/30 ring-1 ring-inset ring-indigo-500/30" : ""}`}
                  >
                    {/* Date Number */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded-md ${
                          isToday
                            ? "bg-indigo-600 text-white"
                            : isCurrentMonth
                            ? "text-zinc-900"
                            : "text-zinc-400"
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] text-zinc-400 font-medium">
                          {dayEvents.length} item{dayEvents.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Events list */}
                    <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[140px] pr-0.5">
                      {dayEvents.map((ev) => (
                        <div
                          key={`${ev.type}-${ev.id}`}
                          onClick={() => handleEventClick(ev)}
                          className={`cursor-pointer p-1.5 rounded-lg border text-xs font-medium transition shadow-2xs ${getStagePillClasses(
                            ev.deadlineStage
                          )}`}
                          title={`${ev.type.toUpperCase()}: ${ev.title}\nDue: ${formatDateTime(
                            ev.dueDate
                          )}\nStatus: ${ev.status}`}
                        >
                          <div className="flex items-center gap-1 font-bold text-[10px] leading-none mb-0.5">
                            {ev.type === "ticket" ? (
                              <TicketIcon size={11} className="shrink-0" />
                            ) : (
                              <CheckSquare size={11} className="shrink-0" />
                            )}
                            <span className="uppercase">{ev.id}</span>
                          </div>
                          <p className="truncate font-semibold text-[11px] leading-tight">
                            {ev.title}
                          </p>
                          {ev.assignedEmployeeName && (
                            <p className="text-[10px] opacity-80 truncate flex items-center gap-1 mt-0.5">
                              <UserIcon size={9} />
                              <span>{ev.assignedEmployeeName}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─────────────── 2. WEEK VIEW ─────────────── */}
        {viewMode === "week" && (
          <div>
            <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-bold text-zinc-600 py-3 font-mono">
              {monthDays.map((day) => {
                const dayStr = formatYMD(day);
                const isToday = dayStr === todayStr;
                return (
                  <div key={dayStr} className="flex flex-col items-center">
                    <span className="text-zinc-400 text-[10px] uppercase">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day.getDay()]}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-md mt-0.5 ${
                        isToday ? "bg-indigo-600 text-white font-bold" : "text-zinc-900"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-7 divide-x divide-zinc-200 min-h-[350px]">
              {monthDays.map((day) => {
                const dayStr = formatYMD(day);
                const dayEvents = eventsByDate.get(dayStr) || [];

                return (
                  <div key={dayStr} className="p-2 space-y-2 bg-white">
                    {dayEvents.length === 0 ? (
                      <p className="text-center text-zinc-300 text-[11px] pt-8 italic">
                        No events
                      </p>
                    ) : (
                      dayEvents.map((ev) => (
                        <div
                          key={`${ev.type}-${ev.id}`}
                          onClick={() => handleEventClick(ev)}
                          className={`cursor-pointer p-2 rounded-xl border text-xs font-medium transition shadow-2xs space-y-1 ${getStagePillClasses(
                            ev.deadlineStage
                          )}`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span className="flex items-center gap-1 uppercase">
                              {ev.type === "ticket" ? <TicketIcon size={11} /> : <CheckSquare size={11} />}
                              {ev.id}
                            </span>
                            <span>{ev.status}</span>
                          </div>
                          <p className="font-bold text-xs leading-snug line-clamp-2">
                            {ev.title}
                          </p>
                          {ev.assignedEmployeeName && (
                            <p className="text-[10px] opacity-80 truncate flex items-center gap-1">
                              <UserIcon size={10} />
                              <span>{ev.assignedEmployeeName}</span>
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─────────────── 3. DAY VIEW ─────────────── */}
        {viewMode === "day" && (
          <div className="p-6">
            <div className="mb-4 pb-3 border-b border-zinc-100 flex items-center justify-between">
              <h4 className="text-sm font-bold text-zinc-900 font-mono">
                Scheduled Deadlines for {headerTitle}
              </h4>
              <span className="text-xs text-zinc-400">
                {(eventsByDate.get(formatYMD(currentDate)) || []).length} item(s)
              </span>
            </div>

            {(() => {
              const dayStr = formatYMD(currentDate);
              const dayEvents = eventsByDate.get(dayStr) || [];

              if (dayEvents.length === 0) {
                return (
                  <div className="py-16 text-center text-zinc-400 text-sm">
                    <CalendarIcon size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No deadlines scheduled for this period.</p>
                  </div>
                );
              }

              return (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {dayEvents.map((ev) => (
                    <div
                      key={`${ev.type}-${ev.id}`}
                      onClick={() => handleEventClick(ev)}
                      className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm hover:shadow-md space-y-3 ${getStagePillClasses(
                        ev.deadlineStage
                      )}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold uppercase font-mono">
                          {ev.type === "ticket" ? <TicketIcon size={13} /> : <CheckSquare size={13} />}
                          {ev.id}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white/70">
                          {ev.status}
                        </span>
                      </div>

                      <h5 className="text-sm font-bold text-zinc-900 leading-snug">
                        {ev.title}
                      </h5>

                      <div className="pt-2 border-t border-black/5 text-xs space-y-1 opacity-90">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} />
                          <span>Due: {formatDateTime(ev.dueDate)}</span>
                        </div>
                        {ev.assignedEmployeeName && (
                          <div className="flex items-center gap-1.5">
                            <UserIcon size={12} />
                            <span>Assigned: {ev.assignedEmployeeName}</span>
                          </div>
                        )}
                        {ev.clientName && (
                          <div className="flex items-center gap-1.5">
                            <Building2 size={12} />
                            <span>Client: {ev.clientName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* GLOBAL EMPTY STATE */}
        {filteredEvents.length === 0 && !loading && viewMode !== "day" && (
          <div className="py-16 text-center text-zinc-400 text-sm">
            <CalendarIcon size={36} className="mx-auto mb-2 opacity-30" />
            <p className="font-medium">No deadlines scheduled for this period.</p>
          </div>
        )}
      </div>

      {/* DETAIL MODALS (REUSING EXISTING MODALS) */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          users={[]}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          onClose={() => {
            setSelectedTicket(null);
            loadEvents();
            onRefreshData?.();
          }}
          onUpdateStatus={() => {
            setSelectedTicket(null);
            loadEvents();
            onRefreshData?.();
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          currentUserName={currentUserName}
          isManager={["Administrator", "Manager"].includes(currentUserRole)}
          onClose={() => {
            setSelectedTask(null);
            loadEvents();
            onRefreshData?.();
          }}
          onUpdateStatus={() => {
            setSelectedTask(null);
            loadEvents();
            onRefreshData?.();
          }}
          onUpdateProgress={() => {
            setSelectedTask(null);
            loadEvents();
            onRefreshData?.();
          }}
          onReviewTask={() => {
            setSelectedTask(null);
            loadEvents();
            onRefreshData?.();
          }}
        />
      )}
    </div>
  );
}

