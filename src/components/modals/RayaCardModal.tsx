"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, KeyRound, Loader2, Copy, CheckCircle2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { generateMasterKey, deriveCredentials, isValidMasterKey, normalizeMasterKey } from "@/lib/zkar";
import { cn } from "@/lib/utils";

interface RayaCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "backup" | "restore";
}

function getStoredOrGenerateMasterKey() {
  let key = "";

  try {
    const stored = localStorage.getItem("raya_master_key");
    if (stored) {
      key = normalizeMasterKey(stored);
    }
  } catch {
    // ignore storage issues
  }

  if (!key) {
    key = generateMasterKey();
    try {
      localStorage.setItem("raya_master_key", key);
    } catch {
      // ignore storage issues
    }
  }

  return key;
}

function getMaskedMasterKey(masterKey: string) {
  if (!masterKey) return "••••-••••-••••-••••";
  return masterKey
    .split("-")
    .map((segment) => `${segment.slice(0, 1)}•••`)
    .join("-");
}

export function RayaCardModal({ isOpen, onClose, defaultTab = "backup" }: RayaCardModalProps) {
  const [activeTab, setActiveTab] = useState<"backup" | "restore">(defaultTab);

  const [masterKey, setMasterKey] = useState("");
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [restoreKey, setRestoreKey] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const revealTimeoutRef = useRef<number | null>(null);
  const syncingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setActiveTab(defaultTab);
    setRestoreError(null);
    setUpgradeError(null);
    setCopied(false);
    setIsRevealed(false);

    return () => {
      if (revealTimeoutRef.current) {
        window.clearTimeout(revealTimeoutRef.current);
        revealTimeoutRef.current = null;
      }
    };
  }, [defaultTab, isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== "backup") return;

    const key = getStoredOrGenerateMasterKey();
    let alreadySynced = false;

    try {
      alreadySynced = localStorage.getItem("raya_master_key_synced") === "1";
    } catch {
      // ignore storage issues
    }

    setMasterKey(key);
    setUpgradeSuccess(alreadySynced);
    setIsUpgrading(false);

    if (!alreadySynced) {
      void linkKeyInBackground(key);
    }
  }, [activeTab, isOpen]);

  const linkKeyInBackground = async (key: string) => {
    if (syncingKeyRef.current === key) return;

    syncingKeyRef.current = key;
    setIsUpgrading(true);
    setUpgradeError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setUpgradeError("No active session. Key saved locally.");
        return;
      }

      const res = await fetch("/api/auth/zkar/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ masterKey: key }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setUpgradeSuccess(true);
          try {
            localStorage.setItem("raya_master_key_synced", "1");
          } catch {
            // ignore storage issues
          }
          return;
        }
        throw new Error(body.error || "Failed to sync account.");
      }

      setUpgradeSuccess(true);
      try {
        localStorage.setItem("raya_master_key_synced", "1");
      } catch {
        // ignore storage issues
      }
    } catch (err: any) {
      setUpgradeError(err.message || "Failed to sync account.");
    } finally {
      setIsUpgrading(false);
      syncingKeyRef.current = null;
    }
  };

  const handleCopy = async () => {
    if (!masterKey) return;
    await navigator.clipboard.writeText(masterKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleRevealToggle = () => {
    const next = !isRevealed;
    setIsRevealed(next);

    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }

    if (next) {
      revealTimeoutRef.current = window.setTimeout(() => {
        setIsRevealed(false);
        revealTimeoutRef.current = null;
      }, 20000);
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedKey = normalizeMasterKey(restoreKey.trim());
    if (!normalizedKey) return;

    setIsRestoring(true);
    setRestoreError(null);

    try {
      if (!isValidMasterKey(normalizedKey)) {
        throw new Error("Invalid Recovery Key format. Use the 16-character key shown on your Raya Card.");
      }

      const { email, password } = await deriveCredentials(normalizedKey);
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        throw new Error("Invalid Recovery Key. Please check and try again.");
      }

      localStorage.setItem("raya_master_key", normalizedKey);
      localStorage.setItem("raya_master_key_synced", "1");
      onClose();
      window.location.reload();
    } catch (err: any) {
      setRestoreError(err.message || "Invalid Recovery Key.");
    } finally {
      setIsRestoring(false);
    }
  };

  const displayedKey = isRevealed ? masterKey : getMaskedMasterKey(masterKey);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="zen-backdrop"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-indigo-100 bg-white/90 shadow-[0_24px_60px_rgba(79,70,229,0.15)] backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between p-6 pb-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold leading-tight text-slate-900">Sync Account</h2>
                  <p className="text-sm font-medium text-slate-500">Raya Card Recovery</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex p-6 pb-2">
              <div className="flex w-full rounded-xl bg-slate-100/80 p-1">
                <button
                  onClick={() => setActiveTab("backup")}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-sm font-semibold transition-all",
                    activeTab === "backup" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  Backup / Link
                </button>
                <button
                  onClick={() => setActiveTab("restore")}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-sm font-semibold transition-all",
                    activeTab === "restore" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  Restore Access
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {activeTab === "backup" && (
                <div className="space-y-6">
                  <div className="flex gap-3 rounded-xl border border-amber-200/60 bg-amber-50 p-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                    <div className="text-sm leading-relaxed text-amber-800">
                      <span className="font-bold">Never share this screen.</span> Anyone with this Recovery Key will have full native access to your account and progress.
                    </div>
                  </div>

                  <div className="relative">
                    <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-6 shadow-lg">
                      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                      <div className="relative z-10 flex flex-col items-center justify-center space-y-4 text-center">
                        <p className="text-sm font-medium uppercase tracking-widest text-indigo-100">Recovery Key</p>

                        <div className="w-full rounded-xl border border-white/10 bg-black/20 p-4 backdrop-blur-md">
                          <p className="break-all text-center font-mono text-xl font-bold tracking-widest text-white">
                            {displayedKey}
                          </p>
                          <p className="mt-2 text-center text-xs text-indigo-200">
                            {isRevealed ? "Visible for 20 seconds" : "Hidden by default for privacy"}
                          </p>
                        </div>

                        <div className="flex w-full gap-2">
                          <button
                            type="button"
                            onClick={handleRevealToggle}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/20 px-4 py-3 font-bold text-white transition-colors hover:bg-white/30"
                          >
                            {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            {isRevealed ? "Hide Key" : "Show Key"}
                          </button>
                          <button
                            type="button"
                            onClick={handleCopy}
                            disabled={!masterKey}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/20 px-4 py-3 font-bold text-white transition-colors hover:bg-black/30 disabled:opacity-50"
                          >
                            {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? "Copied" : "Copy"}
                          </button>
                        </div>

                        {isUpgrading && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Linking to account...
                          </div>
                        )}
                        {upgradeSuccess && !isUpgrading && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Account linked
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {upgradeError && (
                    <p className="text-center text-sm font-medium text-red-500">{upgradeError}</p>
                  )}

                  {upgradeSuccess && !upgradeError && (
                    <div className="flex items-center justify-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <p className="text-sm font-semibold">Account secured</p>
                    </div>
                  )}

                  <div className="text-center">
                    <p className="pb-2 text-sm font-medium text-slate-500">Save this key somewhere safe</p>
                    <p className="mx-auto max-w-[280px] text-xs text-slate-400">
                      If you change devices and do not use email, this Recovery Key is the only way to get your account back.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "restore" && (
                <form onSubmit={handleRestore} className="space-y-5">
                  <p className="px-4 text-center text-sm text-slate-600">
                    Enter your 16-character Recovery Key to instantly restore your progress on this device.
                  </p>

                  <div className="space-y-1">
                    <label className="ml-1 text-xs font-bold uppercase tracking-widest text-slate-500">Recovery Key</label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                        <KeyRound className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        autoFocus
                        type="text"
                        required
                        value={restoreKey}
                        onChange={(e) => setRestoreKey(normalizeMasterKey(e.target.value))}
                        placeholder="AAAA-BBBB-CCCC-DDDD"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 font-mono text-slate-900 placeholder-slate-300 transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {restoreError && (
                    <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
                      {restoreError}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isRestoring || !restoreKey.trim()}
                      className="flex w-full items-center justify-center rounded-xl bg-indigo-600 py-3.5 font-bold text-white shadow-[0_8px_20px_rgba(79,70,229,0.2)] transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isRestoring ? <Loader2 className="h-5 w-5 animate-spin" /> : "Restore Account"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
