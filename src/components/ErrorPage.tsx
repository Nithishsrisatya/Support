import React from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

interface ErrorPageProps {
  code?: number;
  title?: string;
  message?: string;
  onRetry?: () => void;
  onHome?: () => void;
}

export default function ErrorPage({
  code = 404,
  title,
  message,
  onRetry,
  onHome,
}: ErrorPageProps) {
  const resolvedTitle = title ?? (code === 404 ? "Page Not Found" : "Unexpected Error");
  const resolvedMessage =
    message ??
    (code === 404
      ? "The page you're looking for doesn't exist or has been moved."
      : "Something went wrong while processing your request. Please try again.");

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100">
          <AlertTriangle className="h-8 w-8 text-zinc-600" />
        </div>
        <p className="font-mono text-5xl font-extrabold tracking-tight text-zinc-900">{code}</p>
        <h2 className="mt-3 text-lg font-bold text-zinc-900">{resolvedTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">{resolvedMessage}</p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-800"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          )}
          {onHome && (
            <button
              onClick={onHome}
              className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
            >
              <Home className="h-4 w-4" />
              Go Home
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
