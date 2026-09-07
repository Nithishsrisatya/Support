import React from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ElementType;
  title?: string;
  message?: string;
  action?: React.ReactNode;
}

export default function EmptyState({
  icon: Icon = Inbox,
  title = "Nothing here yet",
  message = "No records found. Try adjusting filters or creating a new entry.",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center animate-in fade-in duration-300">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50">
        <Icon className="h-6 w-6 text-zinc-400" />
      </div>
      <h4 className="text-sm font-bold text-zinc-800">{title}</h4>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

