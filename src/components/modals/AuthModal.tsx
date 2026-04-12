"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, Loader2, CheckCircle2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import TurnstileWidget from "@/components/security/TurnstileWidget";
import type { AuthResetSession } from "@/hooks/useUserProfile";

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  resetToken?: AuthResetSession;
  upgradeMode?: boolean;
  emailUpgraded?: boolean;
}

type Screen =
  | "auth"
  | "forgot"
  | "forgot_sent"
  | "upgrade_email"
  | "upgrade_pending"
  | "new_password"
  | "new_password_done";

interface CaptchaBlockProps {
  visible: boolean;
  siteKey: string;
  action: string;
  resetKey: number;
  error: string | null;
  onToken: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
}

function CaptchaBlock({
  visible,
  siteKey,
  action,
  resetKey,
  error,
  onToken,
  onExpire,
  onError,
}: CaptchaBlockProps) {
  if (!visible) return null;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
        <TurnstileWidget
          siteKey={siteKey}
          action={action}
          resetKey={resetKey}
          onToken={onToken}
          onExpire={onExpire}
          onError={onError}
        />
      </div>

      {error && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </>
  );
}

export default function AuthModal({
  visible,
  onClose,
  resetToken,
  upgradeMode = false,
  emailUpgraded = false,
}: AuthModalProps) {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [screen, setScreen] = useState<Screen>("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaError(null);
    setCaptchaResetKey((value) => value + 1);
  };

  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaError(null);
  }, []);

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaError("Verification expired. Please try again.");
  }, []);

  const handleCaptchaError = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaError("Verification failed to load. Please refresh and try again.");
  }, []);

  useEffect(() => {
    if (resetToken?.accessToken) {
      setScreen("new_password");
    } else if (emailUpgraded) {
      setScreen("new_password");
    } else if (upgradeMode) {
      setScreen("upgrade_email");
    } else {
      setScreen("auth");
    }
  }, [emailUpgraded, resetToken, upgradeMode, visible]);

  const reset = () => {
    setEmail("");
    setPassword("");
    setError(null);
    setConfirmPending(false);
    setLoading(false);
    setShowPassword(false);
    resetCaptcha();
    setScreen(resetToken?.accessToken || emailUpgraded ? "new_password" : upgradeMode ? "upgrade_email" : "auth");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const switchMode = (next: "signup" | "login") => {
    setMode(next);
    setError(null);
    setConfirmPending(false);
    resetCaptcha();
  };

  const captchaRequired = Boolean(turnstileSiteKey) && (
    screen === "auth" ||
    screen === "forgot"
  );

  const ensureCaptchaReady = () => {
    if (!captchaRequired) return true;
    if (captchaToken) return true;
    setCaptchaError("Please complete the verification first.");
    return false;
  };

  useEffect(() => {
    if (!visible) return;
    resetCaptcha();
  }, [screen, mode, visible]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!ensureCaptchaReady()) return;

    setLoading(true);
    setError(null);

    if (mode === "signup") {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password, captchaToken }),
      });
      const json = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(json.error ?? "Signup failed. Please try again.");
        resetCaptcha();
      } else {
        setConfirmPending(true);
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
        options: {
          captchaToken: captchaToken ?? undefined,
        },
      });
      setLoading(false);
      if (err) {
        setError(
          err.message === "Invalid login credentials"
            ? "Wrong email or password."
            : err.message
        );
        resetCaptcha();
      } else {
        handleClose();
      }
    }
  };

  const handleUpgradeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email required.");
      return;
    }

    setLoading(true);
    setError(null);

    const redirectTo = `${window.location.origin}/auth/callback?type=email_change`;
    const { error: updateError } = await supabase.auth.updateUser(
      { email: trimmedEmail },
      {
        emailRedirectTo: redirectTo,
      }
    );

    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      resetCaptcha();
      return;
    }

    resetCaptcha();
    setScreen("upgrade_pending");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    if (!ensureCaptchaReady()) return;

    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmedEmail, captchaToken }),
    });
    setLoading(false);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? "Could not send reset email. Please try again.");
      resetCaptcha();
      return;
    }
    resetCaptcha();
    setScreen("forgot_sent");
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    setError(null);

    if (resetToken?.accessToken) {
      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: resetToken.accessToken,
        refresh_token: resetToken.refreshToken ?? "",
      });
      if (sessionErr) {
        setLoading(false);
        setError("Invalid or expired reset link. Please request a new one.");
        return;
      }
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) {
      setError(updateErr.message);
    } else {
      setScreen("new_password_done");
    }
  };

  const isAuthScreen = screen === "auth";
  const showModeToggle = isAuthScreen && !confirmPending;

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/35"
            onClick={handleClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 24, stiffness: 320 }}
            className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[380px] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
          >
            <div className="bg-[linear-gradient(135deg,#2563eb_0%,#7c3aed_100%)] px-5 pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {(screen === "forgot" || screen === "new_password") && (
                    <button
                      onClick={() => {
                        setScreen(upgradeMode ? "upgrade_email" : "auth");
                        setError(null);
                        resetCaptcha();
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-md bg-white/20 hover:bg-white/30 transition-colors shrink-0"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {screen === "upgrade_email" || screen === "upgrade_pending"
                        ? "Verify this account"
                        : screen === "forgot" || screen === "forgot_sent"
                        ? "Reset password"
                        : screen === "new_password" || screen === "new_password_done"
                        ? "New password"
                        : mode === "signup"
                        ? "Create your account"
                        : "Welcome back"}
                    </h3>
                    <p className="mt-0.5 text-xs text-blue-100">
                      {screen === "upgrade_email"
                        ? "Step 1 of 2: confirm your email, then create a password for this instant account."
                        : screen === "upgrade_pending"
                        ? "Step 1 complete. Confirm your email, then you'll choose a password."
                        : screen === "forgot"
                        ? "We'll send a reset link to your email."
                        : screen === "forgot_sent"
                        ? "Check your inbox."
                        : screen === "new_password" || screen === "new_password_done"
                        ? "Choose a new password for your account."
                        : mode === "signup"
                        ? "Save progress, keep streaks, sync across devices."
                        : "Sign in to continue your learning streak."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 transition-colors ml-3 shrink-0"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>

              {showModeToggle && (
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
              )}
            </div>

            <div className="px-5 py-4">
              {screen === "auth" && (
                <>
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
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {error && (
                        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          {error}
                        </p>
                      )}

                      <CaptchaBlock
                        visible={captchaRequired}
                        siteKey={turnstileSiteKey}
                        action={mode === "signup" ? "email_signup" : "email_login"}
                        resetKey={captchaResetKey}
                        error={captchaError}
                        onToken={handleCaptchaToken}
                        onExpire={handleCaptchaExpire}
                        onError={handleCaptchaError}
                      />

                      <button
                        type="submit"
                        disabled={loading || !email.trim() || password.length < 6}
                        className="w-full h-10 rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                      >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {mode === "signup" ? "Create account" : "Sign in"}
                      </button>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          {mode === "signup" ? "Already have an account? " : "No account yet? "}
                          <button
                            type="button"
                            onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
                            className="text-indigo-500 font-medium hover:underline"
                          >
                            {mode === "signup" ? "Log in" : "Sign up"}
                          </button>
                        </span>
                        {mode === "login" && (
                          <button
                            type="button"
                            onClick={() => { setScreen("forgot"); setError(null); }}
                            className="text-indigo-400 hover:text-indigo-600 hover:underline"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </>
              )}

              {screen === "upgrade_email" && (
                <form onSubmit={handleUpgradeEmail} className="space-y-3">
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

                  {error && (
                    <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full h-10 rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save with email
                  </button>
                </form>
              )}

              {screen === "upgrade_pending" && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-800">Check your email</p>
                  <p className="text-xs text-slate-500">
                    We sent a confirmation link to{" "}
                    <span className="font-medium text-slate-700">{email}</span>.
                    Confirm it to verify this instant account, then you'll set a password.
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-1 h-9 w-full rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              )}

              {screen === "forgot" && (
                <form onSubmit={handleForgot} className="space-y-3">
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
                  {error && (
                    <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}
                  <CaptchaBlock
                    visible={captchaRequired}
                    siteKey={turnstileSiteKey}
                    action="password_reset"
                    resetKey={captchaResetKey}
                    error={captchaError}
                    onToken={handleCaptchaToken}
                    onExpire={handleCaptchaExpire}
                    onError={handleCaptchaError}
                  />
                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full h-10 rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Send reset link
                  </button>
                </form>
              )}

              {screen === "forgot_sent" && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-800">Reset link sent</p>
                  <p className="text-xs text-slate-500">
                    If an account exists for{" "}
                    <span className="font-medium text-slate-700">{email}</span>,
                    you'll receive a reset link shortly.
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-1 h-9 w-full rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              )}

              {screen === "new_password" && (
                <form onSubmit={handleNewPassword} className="space-y-3">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="New password (min. 6 chars)"
                      autoComplete="new-password"
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
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {error && (
                    <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={loading || password.length < 6}
                    className="w-full h-10 rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Set password
                  </button>
                </form>
              )}

              {screen === "new_password_done" && (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  <p className="text-sm font-semibold text-slate-800">Account secured</p>
                  <p className="text-xs text-slate-500">
                    Your email account is now ready. Older chats and the larger usage window are unlocked.
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-1 h-9 w-full rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Let's go
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
