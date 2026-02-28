"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Flame, Target, Zap, Star, TrendingUp } from "lucide-react";
import type { GamificationState } from "@/hooks/useGamification";
import { getLevelInfo, XP_LEVELS, LEVEL_TITLES } from "@/lib/level-titles";

// ─── Badge unlock conditions ──────────────────────────────────────────────────

const BADGE_CONDITIONS: Record<string, string> = {
  streak:  "Maintain a 3-day study streak",
  mission: "Complete 3 regular missions in one day",
  focus:   "Earn 50 XP in a single day",
};

// ─── XP earn rates ────────────────────────────────────────────────────────────

const EARN_RATES = [
  { label: "Excellent answer",   xp: "+12 XP",      color: "text-emerald-600" },
  { label: "Good answer",        xp: "+8 XP",       color: "text-emerald-600" },
  { label: "Ask for correction", xp: "+5 XP",       color: "text-emerald-600" },
  { label: "Regular mission",    xp: "+50 XP",      color: "text-violet-600"  },
  { label: "Daily challenge",    xp: "+80 XP ×2",   color: "text-amber-600"   },
  { label: "Bonus mission",      xp: "+100–150 XP", color: "text-orange-600"  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface XPOverviewModalProps {
  visible: boolean;
  onClose: () => void;
  g: GamificationState;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function XPOverviewModal({ visible, onClose, g }: XPOverviewModalProps) {
  const { currentLevel, title: levelTitle, nextTitle, nextLevelXp, xpProgressPercent } =
    getLevelInfo(g.totalXp);

  // ── 7-day XP chart ──
  const today = new Date();
  const chartDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const label = i === 6 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
    return { key, label, xp: g.xpByDay?.[key] ?? 0 };
  });
  const maxDayXp = Math.max(...chartDays.map((d) => d.xp), 1);

  // ── Level thresholds ──
  const levels = XP_LEVELS as unknown as number[];

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
            className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[400px] max-h-[88vh] rounded-2xl border border-indigo-100 bg-white shadow-xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">XP Overview</h3>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">

              {/* ── XP Summary cards ── */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-2.5 text-center">
                  <p className="text-xl font-bold text-indigo-700 leading-none">{g.totalXp}</p>
                  <p className="text-[10px] text-indigo-500 mt-0.5">Total XP</p>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 text-center">
                  <p className="text-xl font-bold text-emerald-700 leading-none">{g.xpToday}</p>
                  <p className="text-[10px] text-emerald-500 mt-0.5">Today</p>
                </div>
                <div className="rounded-xl bg-orange-50 border border-orange-100 p-2.5 text-center">
                  <p className="text-xl font-bold text-orange-700 leading-none">{g.streakCount}</p>
                  <p className="text-[10px] text-orange-500 mt-0.5 flex items-center justify-center gap-0.5">
                    <Flame className="w-2.5 h-2.5" /> Streak
                  </p>
                </div>
              </div>

              {/* ── 7-day bar chart ── */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-600 mb-3 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                  Last 7 days
                </p>
                <div className="flex items-end gap-1 h-[72px]">
                  {chartDays.map((d, i) => (
                    <div key={d.key} className="flex-1 flex flex-col items-center gap-0.5">
                      <div className="w-full flex flex-col justify-end" style={{ height: 52 }}>
                        <motion.div
                          className={`w-full rounded-t-sm ${i === 6 ? "bg-indigo-500" : "bg-indigo-200"}`}
                          initial={{ height: 0 }}
                          animate={{ height: Math.max(2, (d.xp / maxDayXp) * 52) }}
                          transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
                        />
                      </div>
                      {d.xp > 0 && (
                        <span className="text-[8px] text-slate-400">{d.xp}</span>
                      )}
                      <span className={`text-[9px] ${i === 6 ? "text-indigo-600 font-semibold" : "text-slate-400"}`}>
                        {d.label}
                      </span>
                    </div>
                  ))}
                </div>
                {chartDays.every((d) => d.xp === 0) && (
                  <p className="text-[10px] text-slate-400 italic text-center mt-1">
                    Start chatting to see your XP history!
                  </p>
                )}
              </div>

              {/* ── Level journey ── */}
              <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-3">Level Journey</p>

                {/* Node track */}
                <div className="relative px-2">
                  {/* connecting line */}
                  <div className="absolute top-3 left-[calc(1/12*100%+8px)] right-[calc(1/12*100%+8px)] h-0.5 bg-slate-100">
                    <div
                      className="h-full bg-indigo-400 transition-all duration-700"
                      style={{ width: `${currentLevel === 0 ? 0 : (currentLevel / (levels.length - 1)) * 100}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-6 gap-0">
                    {LEVEL_TITLES.map((title, lvl) => {
                      const threshold = levels[lvl] ?? 0;
                      const isCurrent = lvl === currentLevel;
                      const isUnlocked = lvl < currentLevel;
                      return (
                        <div key={lvl} className="flex flex-col items-center gap-1 relative">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 border-2 transition-colors ${
                            isCurrent
                              ? "border-indigo-500 bg-indigo-500 text-white shadow-md shadow-indigo-200"
                              : isUnlocked
                              ? "border-indigo-300 bg-indigo-100"
                              : "border-slate-200 bg-white"
                          }`}>
                            {isUnlocked
                              ? <span className="text-[9px] text-indigo-500">✓</span>
                              : <span className="text-[9px] font-bold text-current">{lvl}</span>
                            }
                          </div>
                          <p className={`text-[9px] text-center leading-tight ${
                            isCurrent ? "text-indigo-600 font-semibold" :
                            isUnlocked ? "text-slate-500" : "text-slate-400"
                          }`}>
                            {title}
                          </p>
                          <p className="text-[8px] text-slate-400">
                            {threshold >= 1000 ? `${threshold / 1000}k` : threshold === 0 ? "—" : threshold}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Progress bar to next level */}
                <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <motion.div
                    className="h-full bg-[linear-gradient(90deg,#6366f1,#8b5cf6)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${xpProgressPercent}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {g.totalXp} / {nextLevelXp} XP — {Math.max(0, nextLevelXp - g.totalXp)} XP to{" "}
                  <span className="text-indigo-500 font-medium">{nextTitle}</span>
                </p>
              </div>

              {/* ── Mission completion ── */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-600 mb-2.5 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-violet-500" />
                  Mission Completion
                </p>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                      <span>Weekly</span>
                      <span className="font-semibold text-violet-600">{g.weeklyCompleted} / 25</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-400 transition-all duration-500"
                        style={{ width: `${Math.min(100, (g.weeklyCompleted / 25) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                      <span>Monthly</span>
                      <span className="font-semibold text-indigo-600">{g.monthlyCompleted} / 100</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-400 transition-all duration-500"
                        style={{ width: `${Math.min(100, (g.monthlyCompleted / 100) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── How to earn XP ── */}
              <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-2 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  How to Earn XP
                </p>
                <div className="rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
                  {EARN_RATES.map((r, i) => (
                    <div
                      key={r.label}
                      className={`flex items-center justify-between px-3 py-2 text-[11px] ${
                        i < EARN_RATES.length - 1 ? "border-b border-slate-100" : ""
                      }`}
                    >
                      <span className="text-slate-600">{r.label}</span>
                      <span className={`font-semibold ${r.color}`}>{r.xp}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Badges ── */}
              <div>
                <p className="text-[11px] font-semibold text-slate-600 mb-2 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  Badges ({g.badges.filter((b) => b.unlocked).length}/{g.badges.length} unlocked)
                </p>
                <div className="space-y-1.5">
                  {g.badges.map((badge) => (
                    <div
                      key={badge.id}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-[11px] ${
                        badge.unlocked
                          ? "border-amber-100 bg-amber-50"
                          : "border-slate-100 bg-slate-50 opacity-70"
                      }`}
                    >
                      <span className={badge.unlocked ? "" : "grayscale opacity-50"}>{badge.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold ${badge.unlocked ? "text-amber-800" : "text-slate-500"}`}>
                          {badge.label}
                        </p>
                        <p className={`text-[10px] ${badge.unlocked ? "text-amber-500" : "text-slate-400"}`}>
                          {BADGE_CONDITIONS[badge.id] ?? ""}
                        </p>
                      </div>
                      {badge.unlocked && (
                        <span className="text-emerald-500 text-[10px] font-medium shrink-0">✓ Unlocked</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Current level summary ── */}
              <div className="rounded-xl border border-indigo-100 bg-[linear-gradient(135deg,#eef2ff_0%,#ede9fe_100%)] p-3 text-center">
                <p className="text-xs font-semibold text-indigo-800">
                  Level {currentLevel} — {levelTitle}
                </p>
                <p className="text-[10px] text-indigo-500 mt-0.5">
                  {g.totalXp} XP total · Keep going to reach{" "}
                  <span className="font-medium">{nextTitle}</span>!
                </p>
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
