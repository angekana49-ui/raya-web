"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, KeyRound, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { deriveCredentials, isValidMasterKey, normalizeMasterKey } from "@/lib/zkar";
import { cn } from "@/lib/utils";

interface LoginRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenEmailAuth: () => void;
}

export function LoginRecoveryModal({ isOpen, onClose, onOpenEmailAuth }: LoginRecoveryModalProps) {
  const [activeTab, setActiveTab] = useState<"email" | "recovery">("email");
  
  // Restore State
  const [restoreKey, setRestoreKey] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedKey = normalizeMasterKey(restoreKey.trim());
    if (!normalizedKey) return;

    setIsRestoring(true);
    setRestoreError(null);

    try {
      if (!isValidMasterKey(normalizedKey)) {
        throw new Error("Invalid Recovery Key format. Use the 16-character key.");
      }

      const { email, password } = await deriveCredentials(normalizedKey);
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) throw new Error("Invalid Recovery Key. Please check and try again.");

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
            className="zen-backdrop z-[90]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative z-[100] w-full max-w-md bg-white backdrop-blur-2xl rounded-3xl shadow-[0_24px_60px_rgba(79,70,229,0.15)] border border-indigo-100 overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between p-6 pb-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,#2563eb_0%,#7c3aed_100%)] flex items-center justify-center shadow-md">
                  <KeyRound className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 leading-tight">Access Account</h2>
                  <p className="text-sm text-slate-500 font-medium">Choose your method</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex p-6 pb-2">
              <div className="flex w-full bg-slate-100/80 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab("email")}
                  className={cn(
                    "flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2",
                    activeTab === "email" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Mail className="w-4 h-4" /> Email
                </button>
                <button
                  onClick={() => setActiveTab("recovery")}
                  className={cn(
                    "flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2",
                    activeTab === "recovery" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <KeyRound className="w-4 h-4" /> Recovery Key
                </button>
              </div>
            </div>

            <div className="p-6 pt-4 flex-1 overflow-y-auto">
              {activeTab === "email" && (
                <div className="flex flex-col gap-4 text-center">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
                    <Mail className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
                    <h3 className="text-base font-bold text-slate-800 mb-2">Standard Email Auth</h3>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-[260px] mx-auto">
                      Use your email to create a new profile or log into an existing account safely.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenEmailAuth();
                    }}
                    className="w-full h-12 rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white text-sm font-bold shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 hover:opacity-90"
                  >
                    Continue with Email <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {activeTab === "recovery" && (
                <form onSubmit={handleRestore} className="space-y-5">
                  <p className="text-sm text-slate-600 text-center px-4">
                    Enter your 16-character Master Key to restore an instant profile.
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Master Key</label>
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
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3.5 font-bold transition-all disabled:opacity-50 flex items-center justify-center shadow-[0_8px_20px_rgba(79,70,229,0.2)]"
                    >
                      {isRestoring ? <Loader2 className="w-5 h-5 animate-spin" /> : "Restore Account"}
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
