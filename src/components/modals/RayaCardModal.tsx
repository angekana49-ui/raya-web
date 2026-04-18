"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck, KeyRound, Loader2, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { generateMasterKey, deriveCredentials, isValidMasterKey, normalizeMasterKey } from "@/lib/zkar";
import { cn } from "@/lib/utils";

interface RayaCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "backup" | "restore";
}

export function RayaCardModal({ isOpen, onClose, defaultTab = "backup" }: RayaCardModalProps) {
  const [activeTab, setActiveTab] = useState<"backup" | "restore">(defaultTab);

  // Backup State
  const [masterKey, setMasterKey] = useState<string>("");
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  // Restore State
  const [restoreKey, setRestoreKey] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      setRestoreError(null);
      setUpgradeError(null);
      setCopied(false);

      if (defaultTab === "backup") {
        setUpgradeSuccess(false);
        setIsUpgrading(false);

        // ── Instant key: generate or retrieve synchronously ──
        let key = "";
        try {
          const stored = localStorage.getItem("raya_master_key");
          if (stored) {
            key = normalizeMasterKey(stored);
            setUpgradeSuccess(true); // already linked
          }
        } catch { /* private browsing */ }

        if (!key) {
          key = generateMasterKey(); // crypto.getRandomValues = synchronous
          try { localStorage.setItem("raya_master_key", key); } catch { /* ignore */ }
        }

        // Key is visible IMMEDIATELY — no reveal button, no spinner
        setMasterKey(key);

        // ── Background server linking (silent, non-blocking) ──
        if (!upgradeSuccess) {
          linkKeyToAccount(key);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultTab]);

  const linkKeyToAccount = async (key: string) => {
    setIsUpgrading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setUpgradeError("No active session. Key saved locally.");
        return;
      }

      const res = await fetch('/api/auth/zkar/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ masterKey: key })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // If key is already in use by this account, that's fine
        if (res.status === 409) {
          setUpgradeSuccess(true);
          return;
        }
        throw new Error(body.error || "Failed to sync account.");
      }

      setUpgradeSuccess(true);
    } catch (err: any) {
      setUpgradeError(err.message);
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleCopy = () => {
    if (!masterKey) return;
    navigator.clipboard.writeText(masterKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error("Invalid Recovery Key. Please check and try again.");
      }

      localStorage.setItem("raya_master_key", normalizedKey);
      onClose();
      window.location.reload();
    } catch (err: any) {
      setRestoreError(err.message);
    } finally {
      setIsRestoring(false);
    }
  };

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
            className="relative z-10 w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-3xl shadow-[0_24px_60px_rgba(79,70,229,0.15)] border border-indigo-100 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 leading-tight">Sync Account</h2>
                  <p className="text-sm text-slate-500 font-medium">Zero-Knowledge Recovery</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex p-6 pb-2">
              <div className="flex w-full bg-slate-100/80 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab("backup")}
                  className={cn(
                    "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                    activeTab === "backup" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Backup / Link
                </button>
                <button
                  onClick={() => setActiveTab("restore")}
                  className={cn(
                    "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                    activeTab === "restore" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Restore Access
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 pt-4 flex-1 overflow-y-auto">
              {activeTab === "backup" && (
                <div className="space-y-5">
                  <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 leading-relaxed">
                      <span className="font-bold">Never share this screen.</span> Anyone with this Recovery Key will have full access to your account.
                    </div>
                  </div>

                  {/* Key card — always visible immediately */}
                  <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-6 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                    <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-4">
                      <p className="text-indigo-100 text-sm font-medium uppercase tracking-widest">Recovery Key</p>
                      
                      <div
                        className="bg-black/20 backdrop-blur-md border border-white/10 rounded-xl p-4 w-full cursor-pointer hover:bg-black/30 transition-colors"
                        onClick={handleCopy}
                      >
                        <p className="font-mono text-xl text-white tracking-widest font-bold break-all text-center">
                          {masterKey || "..."}
                        </p>
                        <p className="text-indigo-200 text-xs mt-2 flex items-center justify-center gap-1">
                          {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? "Copied!" : "Tap to copy"}
                        </p>
                      </div>

                      {/* Status badge — small, non-blocking */}
                      <div className="h-4">
                        {isUpgrading && (
                          <div className="flex items-center gap-1.5 text-indigo-200 text-[10px] font-bold uppercase tracking-wider">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Linking...
                          </div>
                        )}
                        {upgradeSuccess && !isUpgrading && (
                          <div className="flex items-center gap-1.5 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                            <CheckCircle2 className="w-3 h-3" />
                            Account linked
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {upgradeError && (
                    <p className="text-sm text-red-500 font-medium text-center">{upgradeError}</p>
                  )}

                  <div className="text-center">
                    <p className="text-sm text-slate-500 font-medium pb-2">Take a screenshot to save your key</p>
                    <p className="text-xs text-slate-400 max-w-[280px] mx-auto">
                      Since you don't use an email, this Key is the ONLY way to recover your account if you change devices.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "restore" && (
                <form onSubmit={handleRestore} className="space-y-5">
                  <p className="text-sm text-slate-600 text-center px-4">
                    Enter your 16-character Recovery Key to instantly restore your progress on this device.
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Recovery Key</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <KeyRound className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        autoFocus
                        type="text"
                        required
                        value={restoreKey}
                        onChange={(e) => setRestoreKey(normalizeMasterKey(e.target.value))}
                        placeholder="AAAA-BBBB-CCCC-DDDD"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder-slate-300"
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {restoreError && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
                      {restoreError}
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isRestoring || !restoreKey.trim()}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-[0_8px_20px_rgba(79,70,229,0.2)]"
                    >
                      {isRestoring ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "Restore Account"
                      )}
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
