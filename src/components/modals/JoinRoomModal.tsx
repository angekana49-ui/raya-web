"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link2, ShieldCheck, Users, X } from "lucide-react";

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin?: (inviteCode: string) => Promise<boolean | void> | boolean | void;
}

export default function JoinRoomModal({
  isOpen,
  onClose,
  onJoin,
}: JoinRoomModalProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setInviteCode("");
    setIsJoining(false);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || isJoining) return;

    setIsJoining(true);
    try {
      const joined = await onJoin?.(inviteCode.trim());
      if (joined !== false) {
        onClose();
      }
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] px-5 py-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]">
                      <Users className="h-3.5 w-3.5" />
                      Join Room
                    </div>
                    <h2 className="text-xl font-black">Enter an invite</h2>
                    <p className="mt-1 text-sm text-slate-300">
                      Jump straight into a live squad session without a heavy signup wall.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                    Invite code or link slug
                  </label>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Link2 className="h-4 w-4 text-slate-400" />
                    <input
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-slate-900 outline-none"
                      placeholder="e.g. ALGEBRA-8PM"
                    />
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-500" />
                    <p className="text-xs leading-relaxed text-slate-600">
                      Guests can enter first and secure their account later. The goal is instant belonging, not friction.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isJoining}
                    className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800"
                  >
                    {isJoining ? "Checking..." : "Join room"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
