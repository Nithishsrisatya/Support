import React, { useState } from "react";
import { User, Client } from "../types";
import { Lock, Mail, ClipboardList, ChevronRight, AlertCircle } from "lucide-react";

interface LoginPageProps {
  users: User[];
  clients: Client[];
  onLoginSuccess: (
    role: "Administrator" | "Manager" | "Employee" | "Client",
    targetId: string
  ) => void;
}

export default function LoginPage({ users, clients, onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const trimmedEmail = email.trim().toLowerCase();

      // 1. Try finding a Staff User with this email
      const foundUser = users.find(
        (u) => u.email.toLowerCase() === trimmedEmail
      );

      if (foundUser) {
        if (foundUser.passwordHash !== password) {
          setError("Incorrect password for this user profile.");
          setIsLoading(false);
          return;
        }

        if (foundUser.status === "Suspended" || foundUser.status === "Disabled") {
          setError("This user profile is currently deactivated.");
          setIsLoading(false);
          return;
        }

        onLoginSuccess(foundUser.role, foundUser.id);
        setIsLoading(false);
        return;
      }

      // 2. Try finding a Client with this email
      const foundClient = clients.find(
        (c) => c.email.toLowerCase() === trimmedEmail
      );

      if (foundClient) {
        if (password !== "client123" && password !== "client") {
          setError("Invalid security key for this client profile. Use 'client123'.");
          setIsLoading(false);
          return;
        }

        if (foundClient.status === "Suspended" || foundClient.status === "Disabled") {
          setError("This client profile is currently suspended.");
          setIsLoading(false);
          return;
        }

        onLoginSuccess("Client", foundClient.id);
        setIsLoading(false);
        return;
      }

      // If no matching profile is found at all
      setError("No registered staff user or client profile found with this email address.");
      setIsLoading(false);
    }, 600);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-xl ring-1 ring-zinc-800">
            <ClipboardList className="h-7 w-7 text-indigo-500 animate-pulse" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-white font-display">
            Support & Task Core
          </h2>
          <p className="mt-2 text-xs uppercase tracking-widest text-zinc-500 font-mono">
            Unified Intelligent Gateway
          </p>
        </div>

        {/* Form Container */}
        <div className="rounded-2xl border border-zinc-200/10 bg-[#18181B] p-6 shadow-2xl backdrop-blur-md">
          
          <div className="mb-6 pb-2 border-b border-zinc-800 text-center">
            <span className="text-[10px] uppercase tracking-widest text-indigo-400 font-mono font-bold">
              Automatic Identity Resolution
            </span>
            <p className="text-[11px] text-zinc-500 mt-1">
              Authentication engine dynamically determines your role context.
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-200 animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin}>
            
            {/* User field (email) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 font-mono">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="block w-full rounded-lg border border-zinc-800 bg-[#0A0A0B]/80 py-2.5 pl-10 pr-4 text-xs text-zinc-200 placeholder-zinc-650 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 font-mono">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-lg border border-zinc-800 bg-[#0A0A0B]/80 py-2.5 pl-10 pr-4 text-xs text-zinc-200 placeholder-zinc-650 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="relative flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/15 transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-zinc-800"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <span className="flex items-center gap-1">
                  Secure Sign In <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
