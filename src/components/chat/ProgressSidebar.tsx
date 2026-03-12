"use client";

import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Target,
  Sparkles,
  Trophy,
  Medal,
  Flame,
  Circle,
  CheckCircle2,
  Lock,
  Clock3,
  Share2,
  X,
  Heart,
  Zap,
} from "lucide-react";
import type { GamificationState, BadgeItem } from "@/hooks/useGamification";
import { getLevelInfo } from "@/lib/level-titles";
import { NoTranslate } from "@/components/ui/NoTranslate";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProgressSidebarProps {
  visible: boolean;
  onClose: () => void;
  progressTab: "overview" | "mission" | "skills";
  onTabChange: (tab: "overview" | "mission" | "skills") => void;
  g: GamificationState;
  netMessages: number;
  regenCountdown: string;
  peakLabel: string;
  sharedBadgeId: string | null;
  onStartMissionInChat: (missionId: string) => void;
  onPracticeSkill: (skillKey: string) => void;
  onShareBadge: (badge: BadgeItem) => void;
  onOpenEarnHearts: () => void;
  onOpenXPOverview: () => void;
  isLoggedIn: boolean;
  hasUnsavedProgress: boolean;
  onSignUp: () => void;
}

// ─── Isolated countdown component ────────────────────────────────────────────
// Isolated so its 1s interval only re-renders this tiny node, not the whole sidebar.

const DailyCountdown = memo(function DailyCountdown({ active }: { active: boolean }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!active) { setLabel(""); return; }
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const ms = midnight.getTime() - now.getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      setLabel(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!label) return null;
  return (
    <p className="text-[10px] text-amber-500 flex items-center gap-1 mb-2">
      <Clock3 className="w-3 h-3" />
      Expires in <NoTranslate>{label}</NoTranslate>
    </p>
  );
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProgressSidebar({
  visible,
  onClose,
  progressTab,
  onTabChange,
  g,
  netMessages,
  regenCountdown,
  peakLabel,
  sharedBadgeId,
  onStartMissionInChat,
  onPracticeSkill,
  onShareBadge,
  onOpenEarnHearts,
  onOpenXPOverview,
  isLoggedIn,
  hasUnsavedProgress,
  onSignUp,
}: ProgressSidebarProps) {
  const { currentLevel, title: levelTitle, nextTitle, nextLevelXp, xpProgressPercent } = getLevelInfo(g.totalXp);

  const hasUncompletedDaily = g.todaysMissions.some((m) => m.isDaily && !m.completed);
  const countdownActive = visible && progressTab === "mission" && hasUncompletedDaily;

  // ── Share card ──
  const handleShareProgress = async () => {
    const strongest = [...g.skills].sort((a, b) => b.progress - a.progress)[0];
    const skillLine = strongest && strongest.progress > 0
      ? `📚 Top skill: ${strongest.label} (${strongest.progress}%)\n`
      : "";
    const text =
      `🎓 My RAYA progress\n` +
      `🔥 ${g.streakCount} day streak\n` +
      `⚡ Level ${currentLevel} · ${levelTitle} · ${g.totalXp} XP\n` +
      skillLine +
      `👉 Try RAYA at raya.bluestift.com`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text, title: "My RAYA Progress" });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <aside
      className={`h-full shrink-0 bg-white border-l border-gray-200 shadow-sm flex flex-col overflow-hidden z-10 transition-[width,opacity] duration-300 ${
        visible
          ? "w-[82vw] max-w-[320px] md:w-[320px] opacity-100"
          : "w-0 opacity-0 border-l-0 pointer-events-none"
      }`}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <img src="/raya-logo.jpeg" alt="RAYA" className="w-8 h-8 rounded-lg object-cover" />
        <span className="flex-1 text-lg font-bold text-primary">
          <NoTranslate>RAYA Progress</NoTranslate>
        </span>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Close progress panel"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="px-3 pb-2">
        <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl">
          {(["overview", "mission", "skills"] as const).map((tab) => {
            const Icon = tab === "overview" ? BarChart3 : tab === "mission" ? Target : Sparkles;
            const label = tab === "overview" ? "Overview" : tab === "mission" ? "Mission" : "Skills";
            return (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`h-8 text-xs rounded-lg flex items-center justify-center gap-1 transition-colors ${
                  progressTab === tab
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {tab === "mission" && hasUncompletedDaily && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sign-up nudge banner (guest only) ── */}
      {!isLoggedIn && (
        <div
          className={`mx-2 mb-2 rounded-xl px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-all ${
            hasUnsavedProgress
              ? "bg-[linear-gradient(135deg,#fef3c7_0%,#fde68a_100%)] border border-amber-300"
              : "bg-[linear-gradient(135deg,#eef2ff_0%,#e0e7ff_100%)] border border-indigo-200"
          }`}
          onClick={onSignUp}
        >
          <span className="text-xl shrink-0">{hasUnsavedProgress ? "⚠️" : "🔒"}</span>
          <div className="flex-1 min-w-0">
            {hasUnsavedProgress ? (
              <>
                <p className="text-[11px] font-bold text-amber-800 leading-tight">
                  {g.totalXp} XP · {g.completedMissionIds.length} mission{g.completedMissionIds.length > 1 ? "s" : ""} — not saved
                </p>
                <p className="text-[10px] text-amber-700 mt-0.5">Close this tab and it's gone. <span className="underline font-semibold">Create a free account →</span></p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-bold text-indigo-800 leading-tight">Progress resets when you leave</p>
                <p className="text-[10px] text-indigo-600 mt-0.5">Sign up free to keep your XP, streak & missions.</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">

        {/* ── Overview tab ── */}
        {progressTab === "overview" && (
          <div className="space-y-2.5">

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => onTabChange("mission")}
                className="rounded-2xl border border-orange-100 bg-[linear-gradient(135deg,#fff7ed_0%,#ffedd5_100%)] p-3 flex flex-col items-center gap-0.5 hover:shadow-md transition-shadow"
              >
                <Flame className="w-5 h-5 text-orange-500 mb-0.5" />
                <span className="text-xl font-bold text-orange-700 leading-none">{g.streakCount}</span>
                <span className="text-[10px] text-orange-500 font-medium">day streak</span>
                <span className="text-[9px] text-orange-400 mt-0.5">
                  {g.streakCount < 3 ? `${3 - g.streakCount} to badge` : "🔥 on fire"}
                </span>
              </button>

              <button
                onClick={onOpenXPOverview}
                className="rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#e0e7ff_100%)] p-3 flex flex-col items-center gap-0.5 hover:shadow-md transition-shadow"
              >
                <Sparkles className="w-5 h-5 text-indigo-500 mb-0.5" />
                <span className="text-xl font-bold text-indigo-700 leading-none">{g.xpToday}</span>
                <span className="text-[10px] text-indigo-500 font-medium">XP today</span>
                <span className="text-[9px] text-indigo-400 mt-0.5">{g.totalXp} total</span>
              </button>

              <button
                onClick={() => onTabChange("mission")}
                className="rounded-2xl border border-violet-100 bg-[linear-gradient(135deg,#f5f3ff_0%,#ede9fe_100%)] p-3 flex flex-col items-center gap-0.5 hover:shadow-md transition-shadow"
              >
                <Target className="w-5 h-5 text-violet-500 mb-0.5" />
                <span className="text-xl font-bold text-violet-700 leading-none">{g.weeklyCompleted}</span>
                <span className="text-[10px] text-violet-500 font-medium">weekly</span>
                <span className="text-[9px] text-violet-400 mt-0.5">/ 25 missions</span>
              </button>
            </div>

            {/* Level card */}
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">
                  Level {currentLevel} — <span className="text-indigo-600">{levelTitle}</span>
                </p>
                <span className="text-[10px] text-slate-400">{Math.max(0, nextLevelXp - g.totalXp)} XP to next</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className="h-full bg-[linear-gradient(90deg,#6366f1_0%,#8b5cf6_60%,#a78bfa_100%)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${xpProgressPercent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {g.totalXp} / {nextLevelXp} XP — next title:{" "}
                <span className="font-medium text-indigo-500">{nextTitle}</span>
              </p>
            </div>

            {/* Hearts */}
            <div
              className={`rounded-2xl border shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow ${
                netMessages === 0
                  ? "border-red-200 bg-[linear-gradient(135deg,#fff1f2_0%,#ffe4e6_100%)]"
                  : "border-rose-100 bg-[linear-gradient(135deg,#fff1f2_0%,#fce7f3_100%)]"
              }`}
              onClick={onOpenEarnHearts}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-rose-700 flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                  Hearts
                </p>
                <span className="text-[10px] text-rose-400">{g.hearts} stored · tap to earn</span>
              </div>
              <div className="flex items-center gap-1 mb-1.5">
                {Array.from({ length: 5 }).map((_, i) => {
                  const eff = Math.min(g.hearts - (g.halfHeartOwed ? 0.5 : 0), 5);
                  const isFull = i < Math.floor(eff);
                  const isHalf = !isFull && i === Math.floor(eff) && eff % 1 === 0.5;
                  if (isHalf) return (
                    <span key={i} className="relative inline-flex w-5 h-5 flex-shrink-0">
                      <Heart className="absolute w-5 h-5 text-rose-100 fill-rose-100" />
                      <Heart className="absolute w-5 h-5 text-red-400 fill-red-400 drop-shadow-sm" style={{ clipPath: "inset(0 50% 0 0)" }} />
                    </span>
                  );
                  return (
                    <Heart key={i} className={`w-5 h-5 transition-all ${isFull ? "text-red-400 fill-red-400 drop-shadow-sm" : "text-rose-100 fill-rose-100"}`} />
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-rose-700">
                  {netMessages} <span className="text-xs font-medium text-rose-500">messages left</span>
                </p>
                <span className="text-[10px] text-rose-400">{peakLabel}</span>
              </div>
              <p className="text-[10px] text-rose-500 mt-1">
                {netMessages === 0
                  ? regenCountdown ? <>Next heart in <NoTranslate>{regenCountdown}</NoTranslate></> : "Earn hearts to keep chatting"
                  : regenCountdown
                  ? <>+1 heart in <NoTranslate>{regenCountdown}</NoTranslate></>
                  : "Full — auto regen every 12 min"}
              </p>
            </div>

            {/* Daily learning loop */}
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">Today's Learning Loop</p>
              <div className="space-y-1.5">
                {g.learningLoop.map((step) => (
                  <div key={step.label} className="flex items-center gap-2 text-xs">
                    {step.done
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      : <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    }
                    <span className={step.done ? "text-slate-700 line-through decoration-emerald-300" : "text-slate-500"}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Badges */}
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Medal className="w-3.5 h-3.5 text-amber-500" />
                  Badges
                </p>
                <span className="text-[10px] text-slate-400">
                  {g.badges.filter((b) => b.unlocked).length}/{g.badges.length} unlocked
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.badges.map((badge) => (
                  <div
                    key={badge.id}
                    className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                      badge.unlocked
                        ? "bg-amber-50 text-amber-700 border-amber-100"
                        : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}
                  >
                    <span className={badge.unlocked ? "" : "grayscale opacity-40"}>{badge.emoji}</span>
                    <span>{badge.label}</span>
                    {badge.unlocked && (
                      <button
                        onClick={() => onShareBadge(badge)}
                        className="ml-0.5 text-amber-500 hover:text-amber-700 transition-colors"
                        aria-label={`Share ${badge.label}`}
                      >
                        {sharedBadgeId === badge.id
                          ? <span className="text-[10px] font-medium text-emerald-600">✓</span>
                          : <Share2 className="w-3 h-3" />
                        }
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {g.badges.every((b) => !b.unlocked) && (
                <p className="mt-2 text-[11px] text-slate-400 italic">Chat to unlock your first badge!</p>
              )}
            </div>

            {/* Recent feed */}
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">Recent Activity</p>
              <div className="space-y-1.5 text-[11px]">
                {g.recentFeed.length === 0 ? (
                  <p className="text-slate-400 italic">Start chatting to earn XP!</p>
                ) : (
                  g.recentFeed.slice(0, 5).map((entry, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-slate-600 truncate pr-2">{entry.label}</span>
                      <span className={`shrink-0 font-medium ${entry.xp.startsWith("+") ? "text-emerald-600" : "text-amber-600"}`}>
                        {entry.xp}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Share progress */}
            <button
              onClick={handleShareProgress}
              className="w-full rounded-2xl border border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ede9fe_100%)] p-3 flex items-center gap-3 hover:shadow-md transition-shadow text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                <Share2 className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-800">Share my progress</p>
                <p className="text-[11px] text-indigo-500 truncate">
                  Level {currentLevel} · {levelTitle} · {g.totalXp} XP
                </p>
              </div>
            </button>
          </div>
        )}

        {/* ── Mission tab ── */}
        {progressTab === "mission" && (
          <div className="space-y-2.5">

            {/* Streak banner */}
            <div className="rounded-2xl border border-orange-100 bg-[linear-gradient(135deg,#fff7ed_0%,#ffedd5_80%,#ffffff_100%)] shadow-sm p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-orange-700">{g.streakCount} day streak</p>
                <p className="text-[11px] text-orange-500">
                  {g.streakCount === 0
                    ? "Start chatting to begin your streak!"
                    : g.streakCount < 3
                    ? `${3 - g.streakCount} more day${3 - g.streakCount > 1 ? "s" : ""} to the 🔥 badge`
                    : g.streakCount < 7
                    ? `${7 - g.streakCount} more days to the 7-day badge`
                    : "Amazing — keep the flame alive!"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-orange-400 uppercase tracking-wide">Best</p>
                <p className="text-sm font-semibold text-orange-600">{g.streakCount}d</p>
              </div>
            </div>

            {/* Daily challenge */}
            {g.todaysMissions.filter((m) => m.isDaily).map((dc) => (
              <div
                key={dc.id}
                className={`rounded-2xl border-2 shadow-sm overflow-hidden ${
                  dc.completed
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-amber-300 bg-[linear-gradient(135deg,#fffbeb_0%,#fef9c3_100%)]"
                }`}
              >
                <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">Daily Challenge</p>
                  <span className="ml-auto text-[11px] font-bold text-amber-600">+{dc.xpReward} XP ×2</span>
                </div>
                <div className="px-3 pb-3">
                  <p className={`text-xs font-medium text-slate-700 mb-2 leading-snug ${dc.completed ? "line-through text-slate-400" : ""}`}>
                    {dc.title}
                  </p>
                  {!dc.completed && (
                    <>
                      {/* Isolated countdown — only this node re-renders every second */}
                      <DailyCountdown active={countdownActive} />
                      <button
                        onClick={() => onStartMissionInChat(dc.id)}
                        className="w-full h-7 rounded-lg bg-amber-500 text-white text-[11px] font-semibold hover:bg-amber-600 transition-colors"
                      >
                        Take the challenge
                      </button>
                    </>
                  )}
                  {dc.completed && (
                    <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Challenge completed! +{dc.xpReward} XP
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Regular missions */}
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <p className="text-xs font-semibold text-slate-700">Today's Missions</p>
                <span className="text-[10px] text-slate-400">
                  {g.todaysMissions.filter((m) => !m.isBonus && !m.isDaily && m.completed).length}/3 done
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {g.todaysMissions.filter((m) => !m.isBonus && !m.isDaily).map((mission) => (
                  <div key={mission.id} className={`px-3 py-2.5 ${mission.completed ? "bg-emerald-50/40" : ""}`}>
                    <div className="flex items-start gap-2">
                      {mission.completed
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        : <Circle className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs leading-snug ${mission.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                          {mission.title}
                        </p>
                        <span className="text-[10px] text-emerald-600 font-medium">+{mission.xpReward} XP</span>
                      </div>
                    </div>
                    {!mission.completed && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span>{mission.current}/{mission.target}</span>
                          <span>{Math.round((mission.current / mission.target) * 100)}%</span>
                        </div>
                        <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, (mission.current / mission.target) * 100)}%` }}
                          />
                        </div>
                        <button
                          onClick={() => onStartMissionInChat(mission.id)}
                          className="w-full h-7 rounded-lg bg-primary/90 text-white text-[11px] font-medium hover:bg-primary transition-colors"
                        >
                          Start in chat
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Bonus mission */}
            {g.todaysMissions.filter((m) => m.isBonus).map((bonus) => (
              <div
                key={bonus.id}
                className={`rounded-2xl border shadow-sm overflow-hidden ${
                  bonus.completed
                    ? "border-emerald-100 bg-emerald-50/40"
                    : "border-amber-200 bg-[linear-gradient(135deg,#fffbeb_0%,#fef3c7_100%)]"
                }`}
              >
                <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                  <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Bonus Mission</p>
                  <span className="ml-auto text-[11px] font-bold text-amber-600">+{bonus.xpReward} XP</span>
                </div>
                <div className="px-3 pb-3">
                  <p className={`text-xs text-slate-700 mb-2 ${bonus.completed ? "line-through text-slate-400" : ""}`}>
                    {bonus.title}
                  </p>
                  {!bonus.completed && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-amber-500">
                        <span>{bonus.current}/{bonus.target}</span>
                        <span>{Math.round((bonus.current / bonus.target) * 100)}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-amber-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all duration-500"
                          style={{ width: `${Math.min(100, (bonus.current / bonus.target) * 100)}%` }}
                        />
                      </div>
                      <button
                        onClick={() => onStartMissionInChat(bonus.id)}
                        className="w-full h-7 rounded-lg bg-amber-500 text-white text-[11px] font-medium hover:bg-amber-600 transition-colors"
                      >
                        Start in chat
                      </button>
                    </div>
                  )}
                  {bonus.completed && (
                    <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Bonus claimed!
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Weekly progress */}
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-700">Weekly Progress</p>
                <span className="text-[10px] text-violet-600 font-medium">{g.weeklyCompleted} / 25</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#7c3aed_0%,#a78bfa_100%)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (g.weeklyCompleted / 25) * 100)}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                21 regular + 4 bonus this week · {Math.max(0, 25 - g.weeklyCompleted)} remaining
              </p>
            </div>

            {/* Monthly progress */}
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-700">Monthly Progress</p>
                <span className="text-[10px] text-indigo-600 font-medium">{g.monthlyCompleted} / 100</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#4f46e5_0%,#818cf8_100%)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (g.monthlyCompleted / 100) * 100)}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                4 weeks × 25 missions · {Math.max(0, 100 - g.monthlyCompleted)} remaining this month
              </p>
            </div>
          </div>
        )}

        {/* ── Skills tab ── */}
        {progressTab === "skills" && (
          <div className="space-y-2.5">
            <div className="rounded-2xl border border-sky-200 bg-[linear-gradient(135deg,#ecfeff_0%,#eff6ff_55%,#ffffff_100%)] shadow-sm p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-sky-800">Skill Momentum</p>
                <span className="text-[10px] text-sky-600">Stay sharp</span>
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                {["🧠", "📈", "💡", "🏅"].map((emoji, idx) => (
                  <motion.span
                    key={`skills-${emoji}`}
                    className="text-2xl"
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: idx * 0.35, ease: "easeInOut" }}
                  >
                    {emoji}
                  </motion.span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3 space-y-2">
              {g.skills.map((skill) => (
                <div key={skill.key} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-slate-700 truncate">{skill.label}</p>
                    <p className="text-[11px] text-slate-500">{skill.progress}%</p>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-[linear-gradient(90deg,#5a6cff_0%,#8b5cf6_100%)]"
                      style={{ width: `${Math.max(0, Math.min(100, skill.progress))}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Clock3 className="w-3 h-3" />
                      {skill.progress >= 80 ? "Mastered" : skill.progress > 0 ? "In progress" : "Not started"}
                    </span>
                    <button
                      onClick={() => { onPracticeSkill(skill.key); onClose(); }}
                      className="text-[10px] text-primary font-medium hover:underline"
                    >
                      Practice
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/90 shadow-sm p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">Focus Suggestions</p>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const practiced = g.skills.filter((s) => s.progress > 0);
                  const weakest   = practiced.length > 0 ? [...practiced].sort((a, b) => a.progress - b.progress)[0] : null;
                  const strongest = practiced.length > 0 ? [...practiced].sort((a, b) => b.progress - a.progress)[0] : null;
                  return (
                    <>
                      {weakest ? (
                        <button
                          onClick={() => { onPracticeSkill(weakest.key); onClose(); }}
                          className="text-[11px] px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 transition-colors"
                        >
                          Reinforce: {weakest.label} ({weakest.progress}%)
                        </button>
                      ) : (
                        <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                          Start chatting to unlock suggestions
                        </span>
                      )}
                      {g.streakCount > 0 && (
                        <span className="text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-1">
                          <Flame className="w-3 h-3" />
                          Streak-safe drill
                        </span>
                      )}
                      {strongest && strongest.progress > 50 && (
                        <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Strong: {strongest.label} ✓
                        </span>
                      )}
                      <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Adaptive quiz soon
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
