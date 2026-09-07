import React, { useState } from "react";
import { Lock, Mail, ClipboardList, ChevronRight, AlertCircle } from "lucide-react";
import { apiFetch } from "../services/api";
import type { User } from "../types";

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}


export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);

    try {
      const res = await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      if (res?.success) {
        setForgotSuccess(true);
      } else {
        setForgotError(res?.message || "Failed to process request.");
      }
    } catch (err: any) {
      setForgotError(err?.message || "Failed to send reset link. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setIsLoading(true);

  try {
    const response = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (!response.success) {
      setError(response.message || "Login failed. Please try again.");
      setIsLoading(false);
      return;
    }
    
    localStorage.setItem("token", response.token);
    localStorage.setItem(
  "currentUser",
  JSON.stringify(response.user)
);
localStorage.setItem("accountType", response.user.userType);
console.log(response.user);
    onLoginSuccess(response.user);
  } catch (err: any) {
    console.error("Login request failed:", err);
    setError(err.message || "Network error. Please try again.");
  } finally {
    setIsLoading(false);
  }
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(true);
                    setForgotEmail(email);
                    setForgotSuccess(false);
                    setForgotError(null);
                  }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
                >
                  Forgot Password?
                </button>
              </div>
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

        {/* Forgot Password Modal */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#18181B] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Reset Account Password
                </h3>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="text-zinc-500 hover:text-white text-lg leading-none"
                >
                  &times;
                </button>
              </div>

              {forgotSuccess ? (
                <div className="space-y-4 py-2">
                  <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-xs text-emerald-300">
                    If an account with this email exists, a secure password reset link has been sent to your inbox. The link expires in 30 minutes.
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-xs text-zinc-400">
                    Enter the email address associated with your account. We will send you a single-use secure reset link.
                  </p>

                  {forgotError && (
                    <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
                      {forgotError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1 font-mono">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="block w-full rounded-lg border border-zinc-800 bg-[#0A0A0B]/80 py-2.5 px-3 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForgotModal(false)}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {forgotLoading ? "Sending..." : "Send Reset Link"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
