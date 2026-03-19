"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Heart, X, Target, Medal, Link2, Tv2 } from "lucide-react";
import type { BadgeItem } from "@/hooks/useGamification";

import { NoTranslate } from "@/components/ui/NoTranslate";

// ─── Props ────────────────────────────────────────────────────────────────────

interface EarnHeartsModalProps {
  visible: boolean;
  onClose: () => void;
  hearts: number;
  netMessages: number;
  regenCountdown: string;
  peakLabel: string;
  badges: BadgeItem[];
  onShareBadge: (badge: BadgeItem) => Promise<void>;
  onEarnHearts: (amount: number) => void;
  onOpenMissions: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EarnHeartsModal({
  visible,
  onClose,
  hearts,
  netMessages,
  regenCountdown,
  peakLabel,
  badges,
  onShareBadge,
  onEarnHearts,
  onOpenMissions,
}: EarnHeartsModalProps) {
  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/30"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[360px] rounded-2xl border border-rose-100 bg-white p-4 shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Heart
                      key={i}
                      className={`w-4 h-4 ${i < Math.min(hearts, 5) ? "text-red-400 fill-red-400" : "text-slate-200 fill-slate-200"}`}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Net messages count */}
            <div className="mb-3 rounded-xl bg-rose-50 border border-rose-100 px-3 py-2 flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-rose-700 leading-none">{netMessages}</p>
                <p className="text-[11px] text-rose-500 mt-0.5">messages remaining</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold text-rose-600">{peakLabel}</p>
                <p className="text-[10px] text-rose-400">1 heart = 2 msgs</p>
                {regenCountdown && (
                  <p className="text-[10px] text-rose-400 mt-0.5">+1♥ in <NoTranslate>{regenCountdown}</NoTranslate></p>
                )}
              </div>
            </div>

            {/* Earn options */}
            <div className="space-y-2">
              {/* Complete a mission */}
              <button
                onClick={onOpenMissions}
                className="w-full flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 hover:bg-violet-100 transition-colors text-left"
              >
                <Target className="w-5 h-5 text-violet-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-violet-800">Complete a mission</p>
                  <p className="text-[11px] text-violet-500">+1 regular · +2 bonus</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                  <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                </div>
              </button>

              {/* Share badge */}
              <button
                onClick={async () => {
                  const unlockedBadge = badges.find((b) => b.unlocked);
                  if (unlockedBadge) {
                    await onShareBadge(unlockedBadge);
                    onEarnHearts(1);
                  } else {
                    onOpenMissions();
                  }
                }}
                className="w-full flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 hover:bg-amber-100 transition-colors text-left"
              >
                <Medal className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800">Share a badge</p>
                  <p className="text-[11px] text-amber-500">Share your achievement</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                </div>
              </button>

              {/* Invite a friend */}
              <button
                onClick={async () => {
                  const text = "Join me on RAYA — the AI tutor that actually makes you smarter! 🎓";
                  try {
                    if (navigator.share) await navigator.share({ text, title: "RAYA" });
                    else await navigator.clipboard.writeText(text);
                  } catch { /* ignored */ }
                  onEarnHearts(5);
                  onClose();
                }}
                className="w-full flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 hover:bg-emerald-100 transition-colors text-left"
              >
                <Link2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-800">Invite a friend</p>
                  <p className="text-[11px] text-emerald-500">Share RAYA with someone</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Heart key={i} className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                  ))}
                </div>
              </button>

              {/* Watch an ad (placeholder) */}
              <button
                disabled
                className="w-full flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 cursor-not-allowed opacity-60 text-left"
              >
                <Tv2 className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-600">Watch a short ad</p>
                  <p className="text-[11px] text-slate-400">Coming soon</p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  {[0, 1, 2].map((i) => (
                    <Heart key={i} className="w-3.5 h-3.5 text-red-300 fill-red-300" />
                  ))}
                </div>
              </button>
            </div>

            <p className="mt-3 text-[10px] text-slate-400 text-center">
              Auto regen: +1♥ every 12 min (cap 5) · Stockpile up to 50
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
