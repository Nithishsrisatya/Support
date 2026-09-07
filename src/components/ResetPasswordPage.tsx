import React, { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft, KeyRound } from "lucide-react";
import { apiFetch } from "../services/api";

interface Props {
  token: string;
  onNavigateToLogin: () => void;
}

export default function ResetPasswordPage({ token, onNavigateToLogin }: Props) {
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    async function verify() {
      if (!token || token.trim().length !== 64) {
        setTokenValid(false);
        setValidationError("Invalid or missing password reset token. Please request a new link.");
        setIsValidating(false);
        return;
      }

      try {
        const res = await apiFetch("/auth/verify-reset-token", {
          method: "POST",
          body: JSON.stringify({ token: token.trim() }),
        });

        if (res?.success) {
          setTokenValid(true);
        } else {
          setTokenValid(false);
          setValidationError(res?.message || "Invalid or expired password reset link.");
        }
      } catch (err: any) {
        setTokenValid(false);
        setValidationError(err?.message || "Invalid or expired password reset link.");
      } finally {
        setIsValidating(false);
      }
    }

    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (newPassword.length < 8) {
      setSubmitError("Password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setSubmitError("Passwords do not match. Please re-enter.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: token.trim(),
          newPassword,
        }),
      });

      if (res?.success) {
        setIsSuccess(true);
      } else {
        setSubmitError(res?.message || "Failed to reset password. Please try again.");
      }
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to reset password. The link may have expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0B] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-xl ring-1 ring-zinc-800">
            <KeyRound className="h-7 w-7 text-indigo-500" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-white font-display">
            Set New Password
          </h2>
          <p className="mt-2 text-xs uppercase tracking-widest text-zinc-500 font-mono">
            Complify Global Support System
          </p>
        </div>

        {/* Card Container */}
        <div className="rounded-2xl border border-zinc-200/10 bg-[#18181B] p-6 shadow-2xl backdrop-blur-md">
          
          {/* 1. Loading Token Validation */}
          {isValidating && (
            <div className="py-8 text-center space-y-3">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <p className="text-xs text-zinc-400 font-mono">Verifying secure reset token...</p>
            </div>
          )}

          {/* 2. Invalid Token State */}
          {!isValidating && !tokenValid && (
            <div className="space-y-5 text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-950/60 text-red-400 border border-red-800/40">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Reset Link Invalid or Expired</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  {validationError || "This password reset link is invalid or has already been used."}
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/15 hover:bg-indigo-500 transition"
              >
                <ArrowLeft className="h-4 w-4" /> Return to Sign In
              </button>
            </div>
          )}

          {/* 3. Password Reset Success State */}
          {!isValidating && isSuccess && (
            <div className="space-y-5 text-center py-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Password Reset Complete</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Your password has been securely updated. You can now sign in with your new credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="inline-flex items-center justify-center w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/15 hover:bg-indigo-500 transition"
              >
                Proceed to Sign In
              </button>
            </div>
          )}

          {/* 4. Reset Password Form */}
          {!isValidating && tokenValid && !isSuccess && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="pb-2 border-b border-zinc-800 text-center">
                <span className="text-[10px] uppercase tracking-widest text-indigo-400 font-mono font-bold">
                  Secure Password Reset
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Enter your new account password below (min 8 characters).
                </p>
              </div>

              {submitError && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* New Password */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 font-mono">
                  New Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    type={showNew ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="block w-full rounded-lg border border-zinc-800 bg-[#0A0A0B]/80 py-2.5 pl-10 pr-10 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5 font-mono">
                  Confirm Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    type={showConfirm ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="block w-full rounded-lg border border-zinc-800 bg-[#0A0A0B]/80 py-2.5 pl-10 pr-10 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/15 transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-60"
              >
                {submitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "Reset Password & Secure Account"
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={onNavigateToLogin}
                  className="text-xs text-zinc-400 hover:text-indigo-400 transition"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

