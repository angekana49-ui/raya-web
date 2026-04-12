"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Trophy,
  Flame,
  Circle,
  CheckCircle2,
  Share2,
  Target,
  X,
} from "lucide-react";
import type { GamificationState, BadgeItem } from "@/hooks/useGamification";
import { getLevelInfo } from "@/lib/level-titles";
import { NoTranslate } from "@/components/ui/NoTranslate";
import { cn } from "@/lib/utils";

interface ProgressSidebarProps {
  visible: boolean;
  onClose: () => void;
  g: GamificationState;
  sharedBadgeId: string | null;
  onShareBadge: (badge: BadgeItem) => void;
  onOpenXPOverview: () => void;
  userIsVerified: boolean;
  hasUnsavedProgress: boolean;
  onVerify: () => void;
  usageSummary: string;
  usageDescription: string;
  accountLabel: string;
  accountHandle: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProgressSidebar({
  visible,
  onClose,
  g,
  sharedBadgeId,
  onShareBadge,
  onOpenXPOverview,
  userIsVerified,
  hasUnsavedProgress,
  onVerify,
  usageSummary,
  usageDescription,
  accountLabel,
  accountHandle,
}: ProgressSidebarProps) {
  const { currentLevel, title: levelTitle } = getLevelInfo(g.totalXp);
  const [identityReady, setIdentityReady] = useState(false);

  useEffect(() => {
    setIdentityReady(true);
  }, []);

  const handleShareProgress = async () => {
    const text =
      `🎓 My RAYA progress\n` +
      `🔥 ${g.streakCount} day streak\n` +
      `⚡ Level ${currentLevel} · ${levelTitle} · ${g.totalXp} XP\n` +
      `👉 Try RAYA at raya.bluestift.com`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text, title: "My RAYA Progress" });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch { /* user cancelled */ }
  };

  // Determine which levels to show in the map: 1 past, current, and 3 future.
  const startLvl = Math.max(1, currentLevel - 1);
  const nodes = Array.from({ length: 5 }).map((_, i) => startLvl + i);

  return (
    <aside
      className={cn(
        "fixed inset-y-2 right-2 z-50 md:relative md:inset-0 h-[calc(100vh-1rem)] shrink-0 glass-panel rounded-3xl flex flex-col overflow-hidden transition-all duration-300",
        visible
          ? "w-[280px] sm:w-[320px] opacity-100 translate-x-0"
          : "w-0 opacity-0 pointer-events-none translate-x-full md:translate-x-0"
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <img src="/raya-logo.jpeg" alt="RAYA" className="w-8 h-8 rounded-[10px] object-cover shadow-sm" />
        <div className="flex-1">
          <span className="text-sm font-black text-slate-800 uppercase tracking-wide">
            <NoTranslate>Journey</NoTranslate>
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-full transition-colors"
          aria-label="Close progress panel"
        >
          <X className="w-4 h-4 text-slate-400 font-bold" />
        </button>
      </div>

      {/* ── Verification nudge banner for instant accounts ── */}
      {!userIsVerified && (
        <div
          className={`mx-3 mb-2 rounded-xl px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-all ${hasUnsavedProgress
              ? "bg-[linear-gradient(135deg,#fef3c7_0%,#fde68a_100%)] border border-amber-300 shadow-sm"
              : "bg-[linear-gradient(135deg,#eef2ff_0%,#e0e7ff_100%)] border border-indigo-200"
            }`}
          onClick={onVerify}
        >
          <span className="text-lg shrink-0">{hasUnsavedProgress ? "⚠️" : "🔒"}</span>
          <div className="flex-1 min-w-0">
            {hasUnsavedProgress ? (
              <>
                <p className="text-[11px] font-extrabold text-amber-900 leading-tight">
                  {g.totalXp} XP at risk!
                </p>
                <p className="text-[10px] text-amber-800 mt-0.5 font-medium leading-tight">Close this tab and it's gone. <span className="underline font-bold">Verify this account {"->"}</span></p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-extrabold text-indigo-900 leading-tight">Keep this progress across devices</p>
                <p className="text-[10px] text-indigo-700 mt-0.5 font-medium leading-tight">Verify your instant account to fully secure this journey.</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Header Stats ── */}
      <div className="px-3 pb-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-orange-100 bg-[linear-gradient(135deg,#fff7ed_0%,#fffff_100%)] p-2.5 flex items-center gap-2 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-black text-orange-700 leading-none">{g.streakCount} <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Day</span></p>
              <p className="text-[9px] text-orange-400 font-semibold uppercase tracking-wide">Streak</p>
            </div>
          </div>

          <button onClick={onOpenXPOverview} className="rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_100%)] p-2.5 flex items-center gap-2 shadow-sm hover:ring-2 hover:ring-indigo-100 transition-all text-left">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm font-black text-indigo-700 leading-none">{g.totalXp} <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">XP</span></p>
              <p className="text-[9px] text-indigo-400 font-semibold uppercase tracking-wide">Total XP</p>
            </div>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6 flex flex-col gap-5 hidden-scrollbar">

        {/* 1. Progress Gauge (Direct on Sidebar background) */}
        <div className="px-1 py-1 relative group">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none mb-1.5">Current Rank</p>
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">{levelTitle}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                Lvl {currentLevel}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between items-end mb-1 px-0.5">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Progress</span>
              <span className="text-[10px] font-black text-slate-600">
                {Math.round(g.totalXp - (getLevelInfo(g.totalXp).currentLevelXp))}
                <span className="text-slate-300 mx-1">/</span>
                {getLevelInfo(g.totalXp).nextLevelXp - getLevelInfo(g.totalXp).currentLevelXp}
                <span className="ml-0.5 text-[8px] text-slate-400 uppercase tracking-wide">XP</span>
              </span>
            </div>

            <div className="h-3.5 w-full bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/50 p-1 relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${getLevelInfo(g.totalXp).xpProgressPercent}%` }}
                transition={{ duration: 1.2, ease: "easeOut" }}
                className="h-full rounded-full bg-[linear-gradient(90deg,#4f46e5_0%,#8b5cf6_100%)] shadow-[0_0_12px_rgba(79,70,229,0.2)] relative"
              />
            </div>

            <div className="flex justify-between items-center px-0.5 pt-1">
              <div className="flex items-center gap-1.5">
                <Target className="w-3 h-3 text-slate-400" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Next:</span>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-tight">{getLevelInfo(g.totalXp).nextTitle}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Simplified Gamification for MVP - Removed Quests and Trophy Cabinet */}

        <div className="rounded-[24px] border border-slate-200/70 bg-white/90 shadow-sm p-4 space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Account</p>
            <p className="mt-1 text-sm font-black text-slate-900">{identityReady ? accountLabel : "Student"}</p>
            <p className="text-[11px] font-semibold text-slate-500">{identityReady ? accountHandle : "@student"}</p>
          </div>
          <div className={cn(
            "rounded-2xl px-3 py-2.5 text-[11px] font-semibold leading-relaxed",
            userIsVerified
              ? "border border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border border-amber-200 bg-amber-50 text-amber-800"
          )}>
            {userIsVerified
              ? "Account secured. Your progress is tied to a verified profile."
              : hasUnsavedProgress
                ? "Instant account with progress at risk until you verify it."
                : "Instant account active. Verify it to fully secure your progress."}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200/70 bg-white/90 shadow-sm p-4 space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Study Access</p>
            <p className="mt-1 text-sm font-black text-slate-900">{usageSummary}</p>
          </div>
          <p className="text-[11px] font-semibold leading-relaxed text-slate-600">
            {usageDescription}
          </p>
        </div>

      </div>

      {/* Bottom Share Bar */}
      <div className="p-3 bg-white border-t border-slate-100 z-10">
        <button
          onClick={handleShareProgress}
          className="w-full h-12 rounded-[16px] bg-slate-900 text-white flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-md hover:shadow-lg hover:-translate-y-0.5"
        >
          <Share2 className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-wider">Share Rank</span>
        </button>
      </div>

    </aside>
  );
}
