import { useMemo } from "react";
import {
  Building2,
  Calendar,
  Mail,
  ShieldCheck,
  Trash2,
  PencilLine,
  KeyRound,
  Power,
  UserCircle,
  AlertTriangle,
} from "lucide-react";
import type { User, UserStatus } from "../types";
import { formatDate } from "../utils";

type EmployeeProfileCounts = {
  openTicketsCount: number;
  completedTasksCount: number;
  assignedTasksCount: number;
  activeProjectsCount: number;
};

export type EmployeeProfileModalProps = {
  employee: User;
  managerName?: string;
  avatarUrl?: string | null;
  counts: EmployeeProfileCounts;
  isOpen: boolean;
  onClose: () => void;

  onEdit: (employeeId: string) => void;
  onResetPassword: (employeeId: string) => void;
  onActivate: (employeeId: string) => void;
  onDeactivate: (employeeId: string) => void;
  onDelete: (employeeId: string) => void;
};

function getInitials(fullName: string) {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

function statusBadge(status: UserStatus) {
  switch (status) {
    case "Active":
      return {
        className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        label: "Active",
        icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
      };
    case "Inactive":
      return {
        className: "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200",
        label: "Inactive",
        icon: <AlertTriangle className="h-4 w-4 text-zinc-600" />,
      };
    case "Disabled":
      return {
        className: "bg-orange-50 text-orange-800 ring-1 ring-orange-100",
        label: "Disabled",
        icon: <AlertTriangle className="h-4 w-4 text-orange-700" />,
      };
    case "Suspended":
      return {
        className: "bg-red-50 text-red-800 ring-1 ring-red-100",
        label: "Suspended",
        icon: <AlertTriangle className="h-4 w-4 text-red-700" />,
      };
    default:
      return {
        className: "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200",
        label: status,
        icon: <AlertTriangle className="h-4 w-4 text-zinc-600" />,
      };
  }
}

function ActionButton(props: {
  onClick: () => void;
  variant:
    | "primary"
    | "danger"
    | "soft"
    | "ghost"
    | "warning"
    | "success";
  icon: React.ReactNode;
  label: string;
  confirmText?: string;
  disabled?: boolean;
}) {
  const {
    onClick,
    variant,
    icon,
    label,
    confirmText,
    disabled,
  } = props;

  const className =
    variant === "primary"
      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
      : variant === "success"
        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
        : variant === "warning"
          ? "bg-orange-600 hover:bg-orange-700 text-white"
          : variant === "danger"
            ? "bg-red-600 hover:bg-red-700 text-white"
            : variant === "soft"
              ? "bg-zinc-100 hover:bg-zinc-200 text-zinc-900"
              : "bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (confirmText) {
          const ok = window.confirm(confirmText);
          if (!ok) return;
        }
        onClick();
      }}
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-200 ${className} disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function EmployeeProfileModal({
  employee,
  managerName,
  avatarUrl,
  counts,
  isOpen,
  onClose,
  onEdit,
  onResetPassword,
  onActivate,
  onDeactivate,
  onDelete,
}: EmployeeProfileModalProps) {
  const initials = useMemo(() => getInitials(employee.fullName), [employee.fullName]);
  const createdDateLabel = useMemo(() => formatDate(employee.createdDate), [employee.createdDate]);

  const badge = statusBadge(employee.status);

  if (!isOpen) return null;

  const canDeactivate = employee.status === "Active";
  const canActivate = employee.status !== "Active";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 animate-in fade-in duration-200">
        {/* Modal Header */}
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative">
              {avatarUrl ? (
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                <img
                  src={avatarUrl}
                  alt={employee.fullName}
                  className="h-14 w-14 rounded-2xl ring-1 ring-zinc-200 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100">
                  <span className="text-lg font-extrabold text-indigo-700">{initials}</span>
                </div>
              )}

              <div className="absolute -bottom-1 -right-1 rounded-full bg-white ring-1 ring-zinc-200 p-1">
                <UserCircle className="h-4 w-4 text-indigo-600" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold tracking-tight text-zinc-950">
                  {employee.fullName}
                </h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold ${badge.className}`}>
                  {badge.icon}
                  <span>{badge.label}</span>
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500 font-mono">
                {employee.role} · {employee.department}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition"
              aria-label="Close employee profile"
            >
              Close
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Left: Profile Facts */}
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-indigo-600" />
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Email
                  </div>
                </div>
                <div className="mt-2 truncate text-sm font-semibold text-zinc-900">{employee.email}</div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Role
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{employee.role}</div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-600" />
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Department
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{employee.department}</div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4 text-indigo-600" />
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Manager
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{managerName || "—"}</div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Join Date
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{createdDateLabel}</div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Account Status
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-900">{employee.status}</div>
              </div>
            </div>

            {/* Summary Cards */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-zinc-900">Work Summary</h3>
                <span className="text-xs font-semibold text-zinc-400">Snapshot</span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SummaryCard
                  title="Open Tickets"
                  value={counts.openTicketsCount}
                  tone="indigo"
                  subtitle="Awaiting resolution"
                />
                <SummaryCard
                  title="Completed Tasks"
                  value={counts.completedTasksCount}
                  tone="emerald"
                  subtitle="Successfully done"
                />
                <SummaryCard
                  title="Assigned Tasks"
                  value={counts.assignedTasksCount}
                  tone="sky"
                  subtitle="In your queue"
                />
                <SummaryCard
                  title="Active Projects"
                  value={counts.activeProjectsCount}
                  tone="amber"
                  subtitle="Currently running"
                />
              </div>
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/40 p-5">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white ring-1 ring-zinc-200">
                  <KeyRound className="h-4 w-4 text-indigo-600" />
                </span>
                Quick Actions
              </h3>
              <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                Enterprise controls for managing the employee lifecycle. No backend calls happen here.
              </p>

              <div className="mt-4 space-y-3">
                <ActionButton
                  onClick={() => onEdit(employee.id)}
                  variant="soft"
                  icon={<PencilLine className="h-4 w-4" />}
                  label="Edit Employee"
                />

                <ActionButton
                  onClick={() => onResetPassword(employee.id)}
                  variant="primary"
                  icon={<KeyRound className="h-4 w-4" />}
                  label="Reset Password"
                />

                {canDeactivate && (
                  <ActionButton
                    onClick={() => onDeactivate(employee.id)}
                    variant="warning"
                    icon={<Power className="h-4 w-4" />}
                    label="Deactivate Account"
                  />
                )}

                {canActivate && (
                  <ActionButton
                    onClick={() => onActivate(employee.id)}
                    variant="success"
                    icon={<Power className="h-4 w-4" />}
                    label="Activate Account"
                  />
                )}

                <ActionButton
                  onClick={() => onDelete(employee.id)}
                  variant="danger"
                  icon={<Trash2 className="h-4 w-4" />}
                  label="Delete Employee"
                  confirmText={`Delete ${employee.fullName}? This cannot be undone.`}
                />
              </div>

              <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-zinc-500 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-zinc-900">Operational note</p>
                    <p className="mt-1 text-[12px] text-zinc-500 leading-relaxed">
                      The callbacks are provided by the parent. This modal only renders UI and surfaces user intent.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-extrabold text-zinc-900">At a glance</h3>
              <div className="mt-3 space-y-2 text-xs text-zinc-600">
                <Row label="User ID" value={employee.id} />
                <Row label="Status" value={employee.status} />
                <Row label="Join date" value={createdDateLabel} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-zinc-400 font-semibold">{label}</span>
      <span className="font-mono text-zinc-900">{value}</span>
    </div>
  );
}

function SummaryCard(props: {
  title: string;
  subtitle: string;
  value: number;
  tone: "indigo" | "emerald" | "sky" | "amber";
}) {
  const { title, subtitle, value, tone } = props;

  const toneMap = {
    indigo: {
      badge: "bg-indigo-50 text-indigo-700 ring-indigo-100",
      value: "text-indigo-700",
      icon: "bg-indigo-50 text-indigo-700",
    },
    emerald: {
      badge: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      value: "text-emerald-700",
      icon: "bg-emerald-50 text-emerald-700",
    },
    sky: {
      badge: "bg-sky-50 text-sky-700 ring-sky-100",
      value: "text-sky-700",
      icon: "bg-sky-50 text-sky-700",
    },
    amber: {
      badge: "bg-amber-50 text-amber-700 ring-amber-100",
      value: "text-amber-700",
      icon: "bg-amber-50 text-amber-700",
    },
  } as const;

  const t = toneMap[tone];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            {title}
          </div>
          <div className={`mt-1 text-2xl font-extrabold ${t.value}`}>{value}</div>
        </div>
        <div className={`rounded-xl p-2 ring-1 ${t.badge}`}> 
          {/* icon placeholder via css-only badge */}
          <span aria-hidden className="block h-2.5 w-2.5 rounded-full bg-current opacity-70" />
        </div>
      </div>
      <div className="mt-2 text-xs font-medium text-zinc-500">{subtitle}</div>
    </div>
  );
}

