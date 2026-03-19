"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExchangeResult, MissionEvent, MissionGrade } from "@/lib/assessment-engine";
import { SKILL_CATALOG } from "@/lib/assessment-engine";
import { getLevelInfo } from "@/lib/level-titles";
import { supabase } from "@/lib/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillItem {
  key: string;
  label: string;
  progress: number;
}

export interface LoopStep {
  label: string;
  done: boolean;
}

export interface FeedEntry {
  label: string;
  xp: string;
  timestamp: number;
}

export interface BadgeItem {
  id: string;
  label: string;
  emoji: string;
  unlocked: boolean;
}

// ─── Notification types (session-only, never persisted) ──────────────────────

export type GamifNotification =
  | { id: string; type: "xp"; amount: number; quality: "Excellent" | "Good" | "Keep practicing" }
  | { id: string; type: "mission"; title: string; xp: number; isBonus: boolean; grade?: string }
  | { id: string; type: "badge"; emoji: string; label: string }
  | { id: string; type: "level_up"; title: string; level: number };

// ─────────────────────────────────────────────────────────────────────────────

/**
 * MissionTrigger — how a mission advances:
 * - "message_sent"  : deterministic counter, advances on every message sent
 * - "graded"        : RAYA grades the student's response (/10 or /20),
 *                     XP = round(baseXP × score/max), min threshold 35%
 */
export type MissionTrigger =
  | { event: "message_sent" }
  | { event: "graded"; gradeMax: 10 | 20 };

export interface ActiveMission {
  id: string;
  title: string;
  target: number;
  current: number;
  xpReward: number;
  isBonus: boolean;
  isDaily?: boolean;
  completed: boolean;
  prompt: string;
  trigger: MissionTrigger;
  lastGrade?: { score: number; max: number };  // filled after graded completion
}

export interface GamificationState {
  // XP & level
  xpToday: number;
  totalXp: number;
  xpByDay: Record<string, number>;
  // Hearts (rate-limiting)
  hearts: number;
  maxHearts: number;
  halfHeartOwed: boolean;
  nextHeartRegenAt: number;
  // Streak
  streakCount: number;
  lastActivityDate: string | null;
  // Missions
  todaysMissions: ActiveMission[];
  completedMissionIds: string[];
  weeklyCompleted: number;
  monthlyCompleted: number;
  weekKey: string;
  dayKey: string;
  monthKey: string;
  // Active mission (session-only — not persisted)
  activeMissionId: string | null;
  // Skills
  skills: SkillItem[];
  // Learning loop
  learningLoop: LoopStep[];
  // Feed & badges
  recentFeed: FeedEntry[];
  badges: BadgeItem[];
  // Session-only (not persisted)
  messagesThisSession: number;
  topicsThisSession: string[];
}

// ─── Mission grade → XP ───────────────────────────────────────────────────────

const MISSION_MIN_THRESHOLD = 0.35; // 35% min to earn any XP

function missionGradeToXP(grade: MissionGrade, baseXP: number): number {
  const ratio = grade.score / grade.max;
  if (ratio < MISSION_MIN_THRESHOLD) return 0;
  return Math.round(baseXP * ratio);
}

// ─── Mission pools ────────────────────────────────────────────────────────────
//
// All exercise missions use trigger { event: "graded" }.
// RAYA generates a challenge, grades the student's answer, returns mission_grade in insight JSON.
// XP = round(xpReward × score/max)  — transparent and predictable for the student.
//
// Prompts use [MISSION_GRADE:N] tag so RAYA knows to grade and at what scale.

const REGULAR_MISSION_POOL: {
  title: string;
  trigger: MissionTrigger;
  prompt: string;
}[] = [
  {
    title: "Daily Quiz",
    trigger: { event: "graded", gradeMax: 10 },
    prompt:
      "[MISSION_GRADE:10] I want to do my Daily Quiz mission. First, ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then give me a 3-question quiz on that subject. After I answer all 3, grade my overall performance out of 10.",
  },
  {
    title: "Problem of the Day",
    trigger: { event: "graded", gradeMax: 10 },
    prompt:
      "[MISSION_GRADE:10] I want to do my Problem of the Day mission. First, ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then give me one complete problem to solve step by step. After I solve it, grade my solution out of 10.",
  },
  {
    title: "Error Hunt",
    trigger: { event: "graded", gradeMax: 10 },
    prompt:
      "[MISSION_GRADE:10] I want to do my Error Hunt mission. First, ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then write a short paragraph or equation set with 3–5 errors for me to find and correct. After I correct them, grade my corrections out of 10.",
  },
  {
    title: "Conceptual Challenge",
    trigger: { event: "graded", gradeMax: 20 },
    prompt:
      "[MISSION_GRADE:20] I want to do my Conceptual Challenge mission. First, ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then ask me a question requiring genuine understanding — not formula recall. After my explanation, grade depth and clarity out of 20.",
  },
  {
    title: "Definition Sprint",
    trigger: { event: "graded", gradeMax: 10 },
    prompt:
      "[MISSION_GRADE:10] I want to do my Definition Sprint mission. First, ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then give me 5 key terms from that subject to define. After I define all 5, grade my accuracy out of 10.",
  },
  {
    title: "Full Proof",
    trigger: { event: "graded", gradeMax: 20 },
    prompt:
      "[MISSION_GRADE:20] I want to do my Full Proof mission. First, ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then ask me to prove or demonstrate something important in that subject. After my answer, grade rigor and completeness out of 20.",
  },
  {
    title: "Critical Analysis",
    trigger: { event: "graded", gradeMax: 20 },
    prompt:
      "[MISSION_GRADE:20] I want to do my Critical Analysis mission. First, ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then present me with a text, situation, or argument to analyze critically. After my analysis, grade depth and reasoning quality out of 20.",
  },
];

// Bonus days (JS getDay): 0=Sun, 3=Wed, 4=Thu, 6=Sat
const BONUS_MISSION_BY_DAY: Record<number, {
  title: string;
  xpReward: number;
  trigger: MissionTrigger;
  prompt: string;
}> = {
  3: {
    title: "Wednesday Deep Dive · 2 subjects /20",
    xpReward: 100,
    trigger: { event: "graded", gradeMax: 20 },
    prompt:
      "[MISSION_GRADE:20] Wednesday challenge! Ask me which 2 subjects I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then give me 1 exercise per subject. After I complete both, grade my overall performance out of 20.",
  },
  4: {
    title: "Thursday Rapid Fire · 5 questions /10",
    xpReward: 100,
    trigger: { event: "graded", gradeMax: 10 },
    prompt:
      "[MISSION_GRADE:10] Thursday sprint! Ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then rapid-fire: 5 short questions back to back, short answers only. After I answer all 5, grade my overall performance out of 10.",
  },
  6: {
    title: "Saturday Deep Dive · weakest skill /20",
    xpReward: 150,
    trigger: { event: "graded", gradeMax: 20 },
    prompt:
      "[MISSION_GRADE:20] Saturday challenge! Ask me which subject I want to focus on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then give me your hardest exercise on that subject. Coach me through it if I struggle. At the end, grade my final answer out of 20.",
  },
  0: {
    title: "Sunday Review · 3 subjects /20",
    xpReward: 120,
    trigger: { event: "graded", gradeMax: 20 },
    prompt:
      "[MISSION_GRADE:20] Sunday review! Ask me which 3 subjects I want to review today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then give me 1 question per subject. After I answer all 3, grade my overall performance out of 20.",
  },
};

const DAILY_CHALLENGE = {
  title: "Daily Challenge · RAYA picks",
  trigger: { event: "graded", gradeMax: 20 } as MissionTrigger,
  prompt:
    "[MISSION_GRADE:20] Daily Challenge! First, ask me which subject I want to work on today. Once I answer, adapt the difficulty to my school level (use my profile if you know it, otherwise pick a typical secondary school level). Then generate your most stimulating challenge — you choose the type (quiz, problem, proof, analysis). Make it the best exercise of the day. After I answer, grade me out of 20.",
};

// ─── Hearts helpers ───────────────────────────────────────────────────────────

const REGEN_INTERVAL_MS = 12 * 60 * 1000;
const REGEN_CAP  = 5;
const ACCUM_CAP  = 50;

export function getNetMessages(hearts: number, halfHeartOwed: boolean): number {
  return hearts * 2 - (halfHeartOwed ? 1 : 0);
}

// ─── Time helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string { return d.toISOString().slice(0, 10); }
function todayStr(): string { return toDateStr(new Date()); }
function yesterdayStr(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); return toDateStr(d);
}
function getWeekKey(d: Date): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
function getMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── XP tracking helper ───────────────────────────────────────────────────────

function addXpToDay(xpByDay: Record<string, number>, amount: number): Record<string, number> {
  const today = todayStr();
  return { ...xpByDay, [today]: (xpByDay[today] ?? 0) + amount };
}

// ─── Mission generation ───────────────────────────────────────────────────────

function generateDailyMissions(dayOfWeek: number, weekKey: string, completedIds: string[]): ActiveMission[] {
  const idSet = new Set(completedIds);
  const missions: ActiveMission[] = [];

  // 3 regular missions (graded exercises)
  const startIdx = dayOfWeek * 3;
  for (let slot = 0; slot < 3; slot++) {
    const tpl = REGULAR_MISSION_POOL[(startIdx + slot) % REGULAR_MISSION_POOL.length];
    const id = `${weekKey}_d${dayOfWeek}_s${slot}`;
    const gradeMax = tpl.trigger.event === "graded" ? tpl.trigger.gradeMax : undefined;
    missions.push({
      id,
      title: tpl.title,
      target: 1,
      current: 0,
      xpReward: 50,
      isBonus: false,
      completed: idSet.has(id),
      prompt: tpl.prompt,
      trigger: tpl.trigger,
      ...(gradeMax ? { lastGrade: undefined } : {}),
    });
  }

  // Bonus mission (Wed / Thu / Sat / Sun)
  const bonus = BONUS_MISSION_BY_DAY[dayOfWeek];
  if (bonus) {
    const id = `${weekKey}_d${dayOfWeek}_bonus`;
    missions.push({
      id,
      title: bonus.title,
      target: 1,
      current: 0,
      xpReward: bonus.xpReward,
      isBonus: true,
      completed: idSet.has(id),
      prompt: bonus.prompt,
      trigger: bonus.trigger,
    });
  }

  // Daily challenge
  const dailyId = `${weekKey}_d${dayOfWeek}_daily`;
  missions.push({
    id: dailyId,
    title: DAILY_CHALLENGE.title,
    target: 1,
    current: 0,
    xpReward: 80,
    isBonus: false,
    isDaily: true,
    completed: idSet.has(dailyId),
    prompt: DAILY_CHALLENGE.prompt,
    trigger: DAILY_CHALLENGE.trigger,
  });

  return missions;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// localStorage intentionally removed — guest progress is session-only.
// This maximises sign-up motivation: progress disappears when the tab closes.

const DEFAULT_LOOP: LoopStep[] = [
  { label: "Warm-up request", done: false },
  { label: "Core exercise", done: false },
  { label: "Correction pass", done: false },
  { label: "Reflection note", done: false },
];

const DEFAULT_BADGES: BadgeItem[] = [
  { id: "streak",        label: "3-Day Streak",       emoji: "🔥",  unlocked: false },
  { id: "streak_5",      label: "5-Day Streak",        emoji: "🔥🔥", unlocked: false },
  { id: "streak_week",   label: "Week Warrior",        emoji: "🗓️", unlocked: false },
  { id: "mission",       label: "Mission Finisher",    emoji: "🏆",  unlocked: false },
  { id: "monthly_champ", label: "Monthly Champion",    emoji: "👑",  unlocked: false },
  { id: "focus",         label: "Focus Sprint",        emoji: "⚡",  unlocked: false },
  { id: "xp_1k",         label: "1K Club",             emoji: "⭐",  unlocked: false },
  { id: "xp_10k",        label: "10K Club",            emoji: "💎",  unlocked: false },
];

function buildInitialState(): GamificationState {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const wk = getWeekKey(now);
  const dk = todayStr();
  const mk = getMonthKey(now);
  return {
    xpToday: 0,
    totalXp: 0,
    xpByDay: {},
    hearts: REGEN_CAP,
    maxHearts: ACCUM_CAP,
    halfHeartOwed: false,
    nextHeartRegenAt: 0,
    streakCount: 0,
    lastActivityDate: null,
    todaysMissions: generateDailyMissions(dayOfWeek, wk, []),
    completedMissionIds: [],
    weeklyCompleted: 0,
    monthlyCompleted: 0,
    weekKey: wk,
    dayKey: dk,
    monthKey: mk,
    activeMissionId: null,
    skills: Object.entries(SKILL_CATALOG).map(([key, label]) => ({ key, label, progress: 0 })),
    learningLoop: DEFAULT_LOOP,
    recentFeed: [],
    badges: DEFAULT_BADGES,
    messagesThisSession: 0,
    topicsThisSession: [],
  };
}

// ─── Mission auto-advance (message_sent missions only) ────────────────────────

function advanceMissions(
  missions: ActiveMission[],
  completedIds: string[],
  events: MissionEvent[]
): { missions: ActiveMission[]; newlyCompleted: ActiveMission[] } {
  const newlyCompleted: ActiveMission[] = [];
  const idSet = new Set(completedIds);

  const updated = missions.map((m) => {
    if (m.completed || idSet.has(m.id)) return m;
    // Graded missions complete via the grade path, not events
    if (m.trigger.event === "graded") return m;
    // Count matching message_sent events
    const matchCount = events.filter((e) => e.type === m.trigger.event).length;
    if (matchCount === 0) return m;
    const newCurrent = Math.min(m.target, m.current + matchCount);
    const isNowComplete = newCurrent >= m.target;
    if (isNowComplete) newlyCompleted.push({ ...m, current: newCurrent, completed: true });
    return { ...m, current: newCurrent, completed: isNowComplete };
  });

  return { missions: updated, newlyCompleted };
}

// ─── DB ↔ state helpers ───────────────────────────────────────────────────────

function mergeDbState(db: Record<string, unknown>, local: GamificationState): GamificationState {
  const now = new Date();
  const curWeek = getWeekKey(now);
  const completedIds = (db.completed_mission_ids as string[]) ?? local.completedMissionIds;
  const dbMissions = db.today_missions as ActiveMission[] | null;
  const missions = dbMissions?.length
    ? dbMissions
    : generateDailyMissions(now.getDay(), curWeek, completedIds);

  return {
    ...local,
    totalXp: Math.max((db.total_xp as number) ?? 0, local.totalXp),
    xpToday: (db.xp_today as number) ?? local.xpToday,
    xpByDay: (db.xp_by_day as Record<string, number>) ?? local.xpByDay,
    streakCount: Math.max((db.streak_count as number) ?? 0, local.streakCount),
    lastActivityDate: (db.last_activity_date as string) ?? local.lastActivityDate,
    hearts: Math.min(ACCUM_CAP, Math.max((db.hearts as number) ?? 0, local.hearts)),
    weekKey: curWeek,
    monthKey: getMonthKey(now),
    weeklyCompleted: (db.weekly_completed as number) ?? local.weeklyCompleted,
    monthlyCompleted: (db.monthly_completed as number) ?? local.monthlyCompleted,
    completedMissionIds: completedIds,
    todaysMissions: missions,
    badges: (db.badges as BadgeItem[])?.length ? (db.badges as BadgeItem[]) : local.badges,
    skills: (db.skills as SkillItem[])?.length ? (db.skills as SkillItem[]) : local.skills,
    recentFeed: (db.recent_feed as FeedEntry[])?.length ? (db.recent_feed as FeedEntry[]) : local.recentFeed,
    learningLoop: (db.learning_loop as LoopStep[])?.length ? (db.learning_loop as LoopStep[]) : local.learningLoop,
    // Restore active mission for logged-in users so a mid-mission page refresh can be resumed
    activeMissionId: (db.active_mission_id as string | null) ?? null,
  };
}

function toDbPayload(s: GamificationState): Record<string, unknown> {
  return {
    totalXp: s.totalXp,
    xpToday: s.xpToday,
    xpByDay: s.xpByDay,
    streakCount: s.streakCount,
    longestStreak: s.streakCount,
    lastActivityDate: s.lastActivityDate,
    hearts: Math.min(ACCUM_CAP, Math.max(0, s.hearts)),
    lastHeartRegen: s.nextHeartRegenAt > 0
      ? new Date(s.nextHeartRegenAt - REGEN_INTERVAL_MS).toISOString()
      : new Date().toISOString(),
    weekKey: s.weekKey,
    monthKey: s.monthKey,
    weeklyCompleted: s.weeklyCompleted,
    monthlyCompleted: s.monthlyCompleted,
    completedMissionIds: s.completedMissionIds,
    todaysMissions: s.todaysMissions,
    activeMissionId: s.activeMissionId ?? null,
    badges: s.badges,
    skills: s.skills,
    recentFeed: s.recentFeed,
    learningLoop: s.learningLoop,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGamification(userId?: string) {
  const [state, setState] = useState<GamificationState>(buildInitialState);
  const dbLoadedRef = useRef(false);
  const dbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pendingNotifications, setPendingNotifications] = useState<GamifNotification[]>([]);

  const dismissNotification = useCallback((id: string) => {
    setPendingNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Load from DB when user logs in; reset when they log out
  useEffect(() => {
    if (!userId) { dbLoadedRef.current = false; return; }
    async function loadFromDb() {
      const { data, error } = await supabase.rpc("get_gamification");
      if (error || !data) return;
      dbLoadedRef.current = true;
      setState((prev) => mergeDbState(data as Record<string, unknown>, prev));
    }
    loadFromDb();
  }, [userId]);

  // Debounced sync to DB — 3s after state changes
  useEffect(() => {
    if (!userId || !dbLoadedRef.current) return;
    if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current);
    dbSyncTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.rpc("upsert_gamification", { state: toDbPayload(state) });
      if (error) console.error("Gamification DB sync error:", error.message);
    }, 3000);
    return () => {
      if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current);
    };
  }, [state, userId]);

  // Heart auto-regen (check every 15s)
  useEffect(() => {
    const tick = () => {
      setState((prev) => {
        if (prev.hearts >= REGEN_CAP) return prev;
        const now = Date.now();
        if (prev.nextHeartRegenAt === 0 || now < prev.nextHeartRegenAt) return prev;
        let h = prev.hearts;
        let nextRegen = prev.nextHeartRegenAt;
        while (h < REGEN_CAP && now >= nextRegen) {
          h++;
          nextRegen += REGEN_INTERVAL_MS;
        }
        return { ...prev, hearts: h, nextHeartRegenAt: h >= REGEN_CAP ? 0 : nextRegen };
      });
    };
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Consume a heart ──
  const consumeHeart = useCallback(() => {
    setState((prev) => {
      if (prev.halfHeartOwed) {
        if (prev.hearts <= 0) return prev;
        const now = Date.now();
        const nextRegen = prev.hearts === REGEN_CAP ? now + REGEN_INTERVAL_MS : prev.nextHeartRegenAt;
        return { ...prev, hearts: prev.hearts - 1, halfHeartOwed: false, nextHeartRegenAt: nextRegen };
      }
      return { ...prev, halfHeartOwed: true };
    });
  }, []);

  // ── Earn hearts ──
  const earnHearts = useCallback((n: number) => {
    setState((prev) => {
      const newHearts = Math.min(ACCUM_CAP, prev.hearts + n);
      const feed: FeedEntry[] = [
        { label: `+${n} heart${n > 1 ? "s" : ""} earned!`, xp: `♥ ${newHearts}`, timestamp: Date.now() },
        ...prev.recentFeed.slice(0, 9),
      ];
      return { ...prev, hearts: newHearts, recentFeed: feed };
    });
  }, []);

  // ── Streak ──
  const streakPatch = useCallback((prev: GamificationState): Partial<GamificationState> => {
    const today = todayStr();
    if (prev.lastActivityDate === today) return {};
    const streak = prev.lastActivityDate === yesterdayStr() ? prev.streakCount + 1 : 1;
    return { streakCount: streak, lastActivityDate: today };
  }, []);

  // ── Message sent — streak + session counter + learning loop + message_sent missions ──
  const onMessageSent = useCallback((_text: string) => {
    setState((prev) => {
      const newMsgCount = prev.messagesThisSession + 1;

      const loop = prev.learningLoop.map((s, i) => {
        if (i === 0 && !s.done && newMsgCount >= 1) return { ...s, done: true };
        if (i === 1 && !s.done && newMsgCount >= 2) return { ...s, done: true };
        if (i === 3 && !s.done && newMsgCount >= 4) return { ...s, done: true };
        return s;
      });

      const badges = prev.badges.map((b) => {
        const newStreak = (streakPatch(prev).streakCount ?? prev.streakCount);
        if (b.id === "streak"      && newStreak >= 3) return { ...b, unlocked: true };
        if (b.id === "streak_5"    && newStreak >= 5) return { ...b, unlocked: true };
        if (b.id === "streak_week" && newStreak >= 7) return { ...b, unlocked: true };
        return b;
      });

      // Advance message_sent missions
      const { missions } = advanceMissions(
        prev.todaysMissions,
        prev.completedMissionIds,
        [{ type: "message_sent" }]
      );

      return {
        ...prev,
        ...streakPatch(prev),
        messagesThisSession: newMsgCount,
        learningLoop: loop,
        badges,
        todaysMissions: missions,
      };
    });
  }, [streakPatch]);

  // ── Exchange evaluated (after stream complete) ──
  const onExchangeEvaluated = useCallback((result: ExchangeResult) => {
    let capturedNotifs: GamifNotification[] = [];
    setState((prev) => {
      // ── 1. XP from exchange quality ──
      const newXpToday = prev.xpToday + result.xpEarned;
      const newTotalXp = prev.totalXp + result.xpEarned;

      // ── 2. Skills ──
      let skills = [...prev.skills];
      for (const sp of result.skillProgress) {
        const idx = skills.findIndex((sk) => sk.key === sp.key);
        if (idx >= 0) {
          skills[idx] = { ...skills[idx], progress: Math.min(100, skills[idx].progress + sp.delta) };
        } else if (SKILL_CATALOG[sp.key]) {
          skills = [...skills, { key: sp.key, label: SKILL_CATALOG[sp.key], progress: Math.min(100, sp.delta) }];
        }
      }

      // ── 3. Topics ──
      const primarySkillKey = result.skillProgress[0]?.key ?? result.skillKey;
      const newTopics = primarySkillKey
        ? Array.from(new Set([...prev.topicsThisSession, primarySkillKey]))
        : prev.topicsThisSession;

      // ── 4. Graded mission path ──
      let gradedMissionXP = 0;
      let gradedMission: ActiveMission | null = null;
      let activeMissionId = prev.activeMissionId;

      if (result.missionGrade && prev.activeMissionId) {
        const m = prev.todaysMissions.find(
          (m) => m.id === prev.activeMissionId && !m.completed && m.trigger.event === "graded"
        );
        if (m) {
          gradedMission = m;
          gradedMissionXP = missionGradeToXP(result.missionGrade, m.xpReward);
          activeMissionId = null; // mission done, clear active
        }
      }

      // ── 5. Apply mission updates ──
      // message_sent missions already advanced in onMessageSent
      // graded mission: mark complete
      const missionsWith = prev.todaysMissions.map((m) => {
        if (gradedMission && m.id === gradedMission.id) {
          return {
            ...m,
            current: m.target,
            completed: true,
            lastGrade: result.missionGrade
              ? { score: result.missionGrade.score, max: result.missionGrade.max }
              : m.lastGrade,
          };
        }
        return m;
      });

      const newlyCompleted: ActiveMission[] = [];
      if (gradedMission) newlyCompleted.push({ ...gradedMission, completed: true });

      const completedIds = [
        ...prev.completedMissionIds,
        ...newlyCompleted.map((m) => m.id),
      ];
      const weeklyCompleted = prev.weeklyCompleted + newlyCompleted.length;
      const monthlyCompleted = prev.monthlyCompleted + newlyCompleted.length;

      // ── 6. Hearts from completed missions ──
      const heartsEarned = newlyCompleted.reduce((acc, m) => acc + (m.isBonus ? 2 : 1), 0);
      const newHearts = Math.min(ACCUM_CAP, prev.hearts + heartsEarned);

      // ── 7. Total XP (exchange + grade) ──
      const totalXpEarned = result.xpEarned + gradedMissionXP;
      const finalXpToday = prev.xpToday + totalXpEarned;
      const finalTotalXp = prev.totalXp + totalXpEarned;

      // ── 8. Badges ──
      const badges = prev.badges.map((b) => {
        const regularDone = missionsWith.filter((m) => !m.isBonus && m.completed).length;
        if (b.id === "mission"       && regularDone >= 3)         return { ...b, unlocked: true };
        if (b.id === "focus"         && finalXpToday >= 50)       return { ...b, unlocked: true };
        if (b.id === "xp_1k"         && finalTotalXp >= 1_000)   return { ...b, unlocked: true };
        if (b.id === "xp_10k"        && finalTotalXp >= 10_000)  return { ...b, unlocked: true };
        if (b.id === "monthly_champ" && monthlyCompleted >= 15)  return { ...b, unlocked: true };
        return b;
      });

      // ── 9. Learning loop ──
      const loop = prev.learningLoop.map((s, i) => {
        if (i === 2 && !s.done && result.missionEvents.some((e) => e.type === "correction_requested"))
          return { ...s, done: true };
        return s;
      });

      // ── 10. Feed ──
      const feedEntries: FeedEntry[] = [];
      if (result.xpEarned > 0) {
        feedEntries.push({
          label: result.qualityLabel === "Excellent" ? "Excellent answer!"
            : result.qualityLabel === "Good" ? "Good answer"
            : "Question answered",
          xp: `+${result.xpEarned} XP`,
          timestamp: Date.now(),
        });
      }
      for (const m of newlyCompleted) {
        const gradeStr = m.lastGrade ? ` · ${m.lastGrade.score}/${m.lastGrade.max}` : "";
        const earnedXP = gradedMission?.id === m.id ? gradedMissionXP : m.xpReward;
        feedEntries.push({
          label: `Mission: ${m.title.length > 28 ? m.title.slice(0, 26) + "…" : m.title}${gradeStr}`,
          xp: `+${earnedXP} XP`,
          timestamp: Date.now() - 1,
        });
      }
      const feed = [...feedEntries, ...prev.recentFeed].slice(0, 10);

      // ── 11. Notifications ──
      const ts = Date.now().toString(36);
      capturedNotifs = [];
      if (result.xpEarned > 0) {
        capturedNotifs.push({ id: `xp-${ts}`, type: "xp", amount: result.xpEarned, quality: result.qualityLabel });
      }
      for (const m of newlyCompleted) {
        const earnedXP = gradedMission?.id === m.id ? gradedMissionXP : m.xpReward;
        const gradeStr = result.missionGrade && gradedMission?.id === m.id
          ? `${result.missionGrade.score}/${result.missionGrade.max}`
          : undefined;
        capturedNotifs.push({
          id: `mission-${m.id}-${ts}`,
          type: "mission",
          title: m.title,
          xp: earnedXP,
          isBonus: m.isBonus,
          grade: gradeStr,
        });
      }
      badges.forEach((b, i) => {
        if (b.unlocked && !prev.badges[i]?.unlocked) {
          capturedNotifs.push({ id: `badge-${b.id}-${ts}`, type: "badge", emoji: b.emoji, label: b.label });
        }
      });
      const prevLevel = getLevelInfo(prev.totalXp).currentLevel;
      const newLevel  = getLevelInfo(finalTotalXp).currentLevel;
      if (newLevel > prevLevel) {
        capturedNotifs.push({ id: `level-${newLevel}-${ts}`, type: "level_up", title: getLevelInfo(finalTotalXp).title, level: newLevel });
      }

      return {
        ...prev,
        xpToday: finalXpToday,
        totalXp: finalTotalXp,
        xpByDay: addXpToDay(prev.xpByDay, totalXpEarned),
        skills,
        topicsThisSession: newTopics,
        todaysMissions: missionsWith,
        completedMissionIds: completedIds,
        weeklyCompleted,
        monthlyCompleted,
        hearts: newHearts,
        activeMissionId,
        badges,
        learningLoop: loop,
        recentFeed: feed,
      };
    });

    queueMicrotask(() => {
      if (capturedNotifs.length > 0) {
        setPendingNotifications((prev) => [...prev, ...capturedNotifs]);
      }
    });
  }, []);

  // ── Response received (fallback — when no insight JSON available) ──
  const onResponseReceived = useCallback((xpEarned?: number, newBadgeIds?: string[]) => {
    const xp = typeof xpEarned === "number" && xpEarned > 0 ? xpEarned : 8;
    setState((prev) => {
      const newXpToday = prev.xpToday + xp;
      const newTotalXp = prev.totalXp + xp;
      const badges = prev.badges.map((b) => {
        if (newBadgeIds?.some((id) => id.toLowerCase().includes(b.id))) return { ...b, unlocked: true };
        if (b.id === "focus"  && newXpToday >= 50)       return { ...b, unlocked: true };
        if (b.id === "xp_1k"  && newTotalXp >= 1_000)   return { ...b, unlocked: true };
        if (b.id === "xp_10k" && newTotalXp >= 10_000)  return { ...b, unlocked: true };
        return b;
      });
      const label =
        prev.messagesThisSession <= 1 ? "Warm-up answered" :
        prev.messagesThisSession <= 2 ? "Core exercise answered" : "Question answered";
      const feed: FeedEntry[] = [
        { label, xp: `+${xp} XP`, timestamp: Date.now() },
        ...prev.recentFeed.slice(0, 9),
      ];
      return { ...prev, xpToday: newXpToday, totalXp: newTotalXp, xpByDay: addXpToDay(prev.xpByDay, xp), badges, recentFeed: feed };
    });
  }, []);

  // ── Correction requested ──
  const onCorrectionRequested = useCallback(() => {
    setState((prev) => {
      const loop = prev.learningLoop.map((s, i) => i === 2 ? { ...s, done: true } : s);
      const feed: FeedEntry[] = [
        { label: "Correction requested", xp: "+5 XP", timestamp: Date.now() },
        ...prev.recentFeed.slice(0, 9),
      ];
      return { ...prev, learningLoop: loop, xpToday: prev.xpToday + 5, totalXp: prev.totalXp + 5, xpByDay: addXpToDay(prev.xpByDay, 5), recentFeed: feed };
    });
  }, []);

  // ── Complete a mission manually (from UI) ──
  const completeMission = useCallback((missionId: string) => {
    setState((prev) => {
      const mission = prev.todaysMissions.find((m) => m.id === missionId);
      if (!mission || mission.completed) return prev;

      const missions = prev.todaysMissions.map((m) =>
        m.id === missionId ? { ...m, completed: true } : m
      );
      const completedIds = [...prev.completedMissionIds, missionId];
      const xp = mission.xpReward;
      const newXpToday = prev.xpToday + xp;
      const weeklyCompleted = prev.weeklyCompleted + 1;
      const monthlyCompleted = prev.monthlyCompleted + 1;
      const newTotalXp = prev.totalXp + xp;

      const badges = prev.badges.map((b) => {
        const regularDone = missions.filter((m) => !m.isBonus && m.completed).length;
        if (b.id === "mission"       && regularDone >= 3)         return { ...b, unlocked: true };
        if (b.id === "focus"         && newXpToday >= 50)         return { ...b, unlocked: true };
        if (b.id === "xp_1k"         && newTotalXp >= 1_000)     return { ...b, unlocked: true };
        if (b.id === "xp_10k"        && newTotalXp >= 10_000)    return { ...b, unlocked: true };
        if (b.id === "monthly_champ" && monthlyCompleted >= 15)  return { ...b, unlocked: true };
        return b;
      });

      const heartsEarned = mission.isBonus ? 2 : 1;
      const newHearts = Math.min(ACCUM_CAP, prev.hearts + heartsEarned);

      const title = mission.title.length > 32 ? mission.title.slice(0, 30) + "…" : mission.title;
      const feed: FeedEntry[] = [
        { label: `Mission done: ${title}`, xp: `+${xp} XP`, timestamp: Date.now() },
        { label: `+${heartsEarned} heart${heartsEarned > 1 ? "s" : ""} earned`, xp: `♥ ${newHearts}`, timestamp: Date.now() - 1 },
        ...prev.recentFeed.slice(0, 8),
      ];

      return {
        ...prev,
        todaysMissions: missions,
        completedMissionIds: completedIds,
        weeklyCompleted,
        monthlyCompleted,
        xpToday: newXpToday,
        totalXp: newTotalXp,
        xpByDay: addXpToDay(prev.xpByDay, xp),
        hearts: newHearts,
        recentFeed: feed,
        badges,
      };
    });
  }, []);

  /**
   * Start a mission: set it as the active mission and return its dynamic prompt.
   * The prompt includes a hint about the student's weakest skill for RAYA to factor in.
   */
  const startMission = useCallback((missionId: string): string => {
    setState((prev) => ({ ...prev, activeMissionId: missionId }));

    const mission = state.todaysMissions.find((m) => m.id === missionId);
    if (!mission) return "Let's start a new challenge!";

    // Add weakest skill context so RAYA can target it if relevant
    const weakest = [...state.skills]
      .filter((s) => s.progress < 80)
      .sort((a, b) => a.progress - b.progress)[0];
    const hint = weakest
      ? ` [Student context: weakest skill is "${weakest.label}" at ${weakest.progress}% — prioritize it if it fits the mission type.]`
      : "";

    return mission.prompt + hint;
  }, [state.todaysMissions, state.skills]);

  // ── Skill practice prompt ──
  const getPracticePrompt = useCallback((skillKey: string): string => {
    const label = SKILL_CATALOG[skillKey] ?? skillKey;
    return `Give me an exercise to practice ${label}. Make it appropriate for my level.`;
  }, []);

  // Guest progress that would be lost on tab close
  const hasUnsavedProgress = !userId && (state.totalXp > 0 || state.completedMissionIds.length > 0);

  return {
    state,
    hasUnsavedProgress,
    pendingNotifications,
    dismissNotification,
    onMessageSent,
    onExchangeEvaluated,
    onResponseReceived,
    onCorrectionRequested,
    completeMission,
    startMission,
    consumeHeart,
    earnHearts,
    getPracticePrompt,
  };
}
