"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AuthModal({ visible, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  const reset = () => {
    setEmail("");
    setPassword("");
    setError(null);
    setConfirmPending(false);
    setLoading(false);
    setShowPassword(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const switchMode = (next: "signup" | "login") => {
    setMode(next);
    setError(null);
    setConfirmPending(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });
      setLoading(false);
      if (err) {
        setError(err.message);
      } else if (!data.session) {
        // Supabase requires email confirmation
        setConfirmPending(true);
      } else {
        // Email confirmation disabled in dashboard → logged in immediately
        handleClose();
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      setLoading(false);
      if (err) {
        setError(
          err.message === "Invalid login credentials"
            ? "Wrong email or password."
            : err.message
        );
      } else {
        handleClose();
      }
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/35"
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[380px] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
          >
            {/* Header gradient */}
            <div className="bg-[linear-gradient(135deg,#2563eb_0%,#7c3aed_100%)] px-5 pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">
                    {mode === "signup" ? "Create your account" : "Welcome back"}
                  </h3>
                  <p className="mt-0.5 text-xs text-blue-100">
                    {mode === "signup"
                      ? "Save progress, keep streaks, sync across devices."
                      : "Sign in to continue your learning streak."}
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 transition-colors ml-3 shrink-0"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>

              {/* Mode toggle */}
              <div className="mt-3 grid grid-cols-2 gap-1 p-1 bg-white/20 rounded-xl">
                {(["signup", "login"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`h-7 text-xs font-semibold rounded-lg transition-colors ${
                      mode === m
                        ? "bg-white text-indigo-700"
                        : "text-white/80 hover:text-white"
                    }`}
                  >
                    {m === "signup" ? "Sign up" : "Log in"}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              {/* Confirmation pending */}
              {confirmPending ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-800">Check your email</p>
                  <p className="text-xs text-slate-500">
                    We sent a confirmation link to{" "}
                    <span className="font-medium text-slate-700">{email}</span>.
                    Click it to activate your account.
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-1 h-9 w-full rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  {/* Email */}
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      autoComplete="email"
                      required
                      disabled={loading}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-300 focus:bg-white transition-colors disabled:opacity-50"
                    />
                  </div>

                  {/* Password */}
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (min. 6 chars)"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      disabled={loading}
                      className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-300 focus:bg-white transition-colors disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPassword
                        ? <EyeOff className="w-4 h-4" />
                        : <Eye className="w-4 h-4" />
                      }
                    </button>
                  </div>

                  {/* Error */}
                  {error && (
                    <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading || !email.trim() || password.length < 6}
                    className="w-full h-10 rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {mode === "signup" ? "Create account" : "Sign in"}
                  </button>

                  <p className="text-center text-[11px] text-slate-400">
                    {mode === "signup" ? "Already have an account? " : "No account yet? "}
                    <button
                      type="button"
                      onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
                      className="text-indigo-500 font-medium hover:underline"
                    >
                      {mode === "signup" ? "Log in" : "Sign up"}
                    </button>
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
