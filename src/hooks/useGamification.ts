"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExchangeResult, MissionEvent } from "@/lib/assessment-engine";

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

export type MissionTrigger =
  | { event: "message_sent" }
  | { event: "subject_practiced"; subject?: string }
  | { event: "correction_requested" }
  | { event: "exchange_completed" };

export interface ActiveMission {
  id: string;
  title: string;
  target: number;
  current: number;
  xpReward: number;
  isBonus: boolean;
  isDaily?: boolean;   // daily challenge — x2 XP, same for everyone each day
  completed: boolean;
  prompt: string;
  trigger: MissionTrigger;
}

export interface GamificationState {
  // XP & level
  xpToday: number;
  totalXp: number;
  xpByDay: Record<string, number>;   // ISO date → XP earned that day
  // Hearts (rate-limiting)
  hearts: number;
  maxHearts: number;         // accumulation cap (50)
  halfHeartOwed: boolean;    // off-peak: true after 1st message, clears on 2nd (heart consumed)
  nextHeartRegenAt: number;  // timestamp ms
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

// ─── Mission pools ────────────────────────────────────────────────────────────

const REGULAR_MISSION_POOL: {
  title: string;
  target: number;
  prompt: string;
  trigger: MissionTrigger;
}[] = [
  {
    title: "Send 3 messages today",
    target: 3,
    trigger: { event: "message_sent" },
    prompt: "Let's start our session! Give me a warm-up challenge to kick things off.",
  },
  {
    title: "Practice a skill topic",
    target: 1,
    trigger: { event: "subject_practiced" },
    prompt: "I want to practice a topic. Give me an exercise on algebra, grammar, or physics.",
  },
  {
    title: "Complete a full Q&A exchange",
    target: 4,
    trigger: { event: "message_sent" },
    prompt: "Let's do a Q&A session. Ask me a question, I'll answer, then correct me.",
  },
  {
    title: "Ask for a correction",
    target: 1,
    trigger: { event: "correction_requested" },
    prompt: "Can you correct this sentence for me and explain the mistake? [write your sentence]",
  },
  {
    title: "Explore a new concept",
    target: 1,
    trigger: { event: "exchange_completed" },
    prompt: "Explain a concept I haven't seen yet — challenge me with something new!",
  },
  {
    title: "Solve 2 problems in a row",
    target: 2,
    trigger: { event: "subject_practiced" },
    prompt: "Give me 2 problems to solve back to back. Let's go!",
  },
  {
    title: "Explain a topic in your own words",
    target: 1,
    trigger: { event: "exchange_completed" },
    prompt: "Ask me to explain a concept in my own words so you can evaluate my understanding.",
  },
];

// ─── Daily challenge — AI-personalized ───────────────────────────────────────
// One generic prompt: RAYA generates the challenge adapted to the student's level,
// curriculum and session history. Reward is fixed (controlled by the app, not the AI).

const DAILY_CHALLENGE = {
  title: "Daily Challenge · Personalized by RAYA",
  prompt:
    "It's the Daily Challenge! " +
    "Generate an original, stimulating question perfectly matched to my school level — " +
    "a real academic challenge on the subject you judge most useful for me today. " +
    "Choose the topic yourself based on what we've worked on. Make it tough!",
  trigger: { event: "exchange_completed" } as MissionTrigger,
};

// Bonus days (JS getDay): 0=Sun, 3=Wed, 4=Thu, 6=Sat → 4 bonus days/week
const BONUS_MISSION_BY_DAY: Record<number, {
  title: string;
  target: number;
  xpReward: number;
  prompt: string;
  trigger: MissionTrigger;
}> = {
  3: {
    title: "Wednesday Deep Dive: solve 2 problems",
    target: 2,
    xpReward: 100,
    trigger: { event: "subject_practiced" },
    prompt: "Wednesday challenge! Give me 2 different problems from different subjects.",
  },
  4: {
    title: "Thursday Sprint: 5 exchanges in one session",
    target: 5,
    xpReward: 100,
    trigger: { event: "message_sent" },
    prompt: "Thursday sprint mode! Let's go fast — 5 exchanges back to back!",
  },
  6: {
    title: "Saturday Master: conquer a weak skill",
    target: 1,
    xpReward: 150,
    trigger: { event: "subject_practiced" },
    prompt: "Saturday challenge! Target my weakest skill and give me your hardest exercise.",
  },
  0: {
    title: "Sunday Review: revisit 3 different subjects",
    target: 3,
    xpReward: 120,
    trigger: { event: "subject_practiced" },
    prompt: "Sunday review! I want to revisit 3 different subjects I practiced this week.",
  },
};

// ─── Hearts helpers ───────────────────────────────────────────────────────────

const REGEN_INTERVAL_MS = 12 * 60 * 1000; // 1 heart / 12 min = 5/hr
const REGEN_CAP  = 5;   // auto-regen fills up to 5
const ACCUM_CAP  = 50;  // hearts can stockpile up to 50

/** Peak hours: 8–10h and 17–21h → 1 heart = 1 message. Off-peak → 1 heart = 2 messages. */
function isPeakHour(): boolean {
  const h = new Date().getHours();
  return (h >= 8 && h < 10) || (h >= 17 && h < 21);
}

/** Net messages remaining given current hearts + half-heart state. */
export function getNetMessages(hearts: number, halfHeartOwed: boolean): number {
  return isPeakHour() ? hearts : hearts * 2 - (halfHeartOwed ? 1 : 0);
}

// ─── Time helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
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

  // ── 3 regular missions ──
  const startIdx = dayOfWeek * 3;
  for (let slot = 0; slot < 3; slot++) {
    const tpl = REGULAR_MISSION_POOL[(startIdx + slot) % REGULAR_MISSION_POOL.length];
    const id = `${weekKey}_d${dayOfWeek}_s${slot}`;
    missions.push({
      id,
      title: tpl.title,
      target: tpl.target,
      current: 0,
      xpReward: 50,
      isBonus: false,
      completed: idSet.has(id),
      prompt: tpl.prompt,
      trigger: tpl.trigger,
    });
  }

  // ── Bonus mission (Wed / Thu / Sat / Sun) ──
  const bonus = BONUS_MISSION_BY_DAY[dayOfWeek];
  if (bonus) {
    const id = `${weekKey}_d${dayOfWeek}_bonus`;
    missions.push({
      id,
      title: bonus.title,
      target: bonus.target,
      current: 0,
      xpReward: bonus.xpReward,
      isBonus: true,
      completed: idSet.has(id),
      prompt: bonus.prompt,
      trigger: bonus.trigger,
    });
  }

  // ── Daily challenge — AI-personalized, same slot every day ──
  const dailyId = `${weekKey}_d${dayOfWeek}_daily`;
  missions.push({
    id: dailyId,
    title: DAILY_CHALLENGE.title,
    target: 1,
    current: 0,
    xpReward: 80, // x2 vs regular (urgency bonus)
    isBonus: false,
    isDaily: true,
    completed: idSet.has(dailyId),
    prompt: DAILY_CHALLENGE.prompt,
    trigger: DAILY_CHALLENGE.trigger,
  });

  return missions;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "raya_gamification_v6";

const SKILL_PATTERNS: { key: string; label: string; regex: RegExp }[] = [
  { key: "algebra",  label: "Algebra",  regex: /algebra|equat|polynôm|polynome|variable|factori|calcul/i },
  { key: "grammar",  label: "Grammar",  regex: /grammar|grammaire|conjugu|verbe|spelling|orthograph|syntax/i },
  { key: "physics",  label: "Physics",  regex: /physic|physique|force|énergi|energie|vitesse|accélér|accel|newton/i },
];

const DEFAULT_LOOP: LoopStep[] = [
  { label: "Warm-up request", done: false },
  { label: "Core exercise", done: false },
  { label: "Correction pass", done: false },
  { label: "Reflection note", done: false },
];

const DEFAULT_BADGES: BadgeItem[] = [
  { id: "streak",  label: "3-Day Streak",     emoji: "🔥", unlocked: false },
  { id: "mission", label: "Mission Finisher",  emoji: "🏆", unlocked: false },
  { id: "focus",   label: "Focus Sprint",      emoji: "⚡", unlocked: false },
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
    skills: SKILL_PATTERNS.map((s) => ({ key: s.key, label: s.label, progress: 0 })),
    learningLoop: DEFAULT_LOOP,
    recentFeed: [],
    badges: DEFAULT_BADGES,
    messagesThisSession: 0,
    topicsThisSession: [],
  };
}

function loadState(): GamificationState {
  if (typeof window === "undefined") return buildInitialState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildInitialState();
    const saved = JSON.parse(raw);
    const now = new Date();
    const today = todayStr();
    const curWeek = getWeekKey(now);
    const curMonth = getMonthKey(now);
    const isNewDay   = saved.dayKey   !== today;
    const isNewWeek  = saved.weekKey  !== curWeek;
    const isNewMonth = saved.monthKey !== curMonth;

    const completedIds: string[] = isNewWeek ? [] : (saved.completedMissionIds ?? []);
    const missions = isNewDay
      ? generateDailyMissions(now.getDay(), curWeek, completedIds)
      : (saved.todaysMissions ?? generateDailyMissions(now.getDay(), curWeek, completedIds));

    return {
      ...buildInitialState(),
      ...saved,
      // Preserve accumulated hearts (cap only at ACCUM_CAP)
      hearts: Math.min(saved.hearts ?? REGEN_CAP, ACCUM_CAP),
      maxHearts: ACCUM_CAP,
      halfHeartOwed: saved.halfHeartOwed ?? false,
      nextHeartRegenAt: saved.nextHeartRegenAt ?? 0,
      xpToday: isNewDay ? 0 : (saved.xpToday ?? 0),
      xpByDay: saved.xpByDay ?? {},
      learningLoop: isNewDay ? DEFAULT_LOOP : (saved.learningLoop ?? DEFAULT_LOOP),
      todaysMissions: missions,
      completedMissionIds: completedIds,
      weeklyCompleted:  isNewWeek  ? 0 : (saved.weeklyCompleted  ?? 0),
      monthlyCompleted: isNewMonth ? 0 : (saved.monthlyCompleted ?? 0),
      weekKey:  curWeek,
      dayKey:   today,
      monthKey: curMonth,
      messagesThisSession: 0,
      topicsThisSession: [],
    };
  } catch {
    return buildInitialState();
  }
}

function persistState(state: GamificationState) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { messagesThisSession, topicsThisSession, ...toSave } = state;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch { /* quota */ }
}

// ─── Mission auto-advance helper ─────────────────────────────────────────────

function missionMatchesEvent(trigger: MissionTrigger | undefined, event: MissionEvent): boolean {
  if (!trigger) return false;
  if (trigger.event !== event.type) return false;
  // For subject_practiced: if trigger specifies a subject, it must match
  if (
    trigger.event === "subject_practiced" &&
    "subject" in trigger &&
    trigger.subject &&
    event.subject !== trigger.subject
  ) return false;
  return true;
}

function advanceMissions(
  missions: ActiveMission[],
  completedIds: string[],
  events: MissionEvent[]
): { missions: ActiveMission[]; newlyCompleted: ActiveMission[] } {
  const newlyCompleted: ActiveMission[] = [];
  const idSet = new Set(completedIds);

  const updated = missions.map((m) => {
    if (m.completed || idSet.has(m.id)) return m;
    // Count how many events match this mission's trigger
    const matchCount = events.filter((e) => missionMatchesEvent(m.trigger, e)).length;
    if (matchCount === 0) return m;
    const newCurrent = Math.min(m.target, m.current + matchCount);
    const isNowComplete = newCurrent >= m.target;
    if (isNowComplete) newlyCompleted.push({ ...m, current: newCurrent, completed: true });
    return { ...m, current: newCurrent, completed: isNowComplete };
  });

  return { missions: updated, newlyCompleted };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGamification() {
  const [state, setState] = useState<GamificationState>(buildInitialState);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setState(loadState());
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    persistState(state);
  }, [state]);

  // ── Heart auto-regen (check every 15s) — only fills up to REGEN_CAP ──
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
  // Peak  : 1 heart per message
  // Off-peak : 1 heart per 2 messages (halfHeartOwed tracks the in-between state)
  const consumeHeart = useCallback(() => {
    setState((prev) => {
      const peak = isPeakHour();
      if (peak) {
        if (prev.hearts <= 0) return prev;
        const now = Date.now();
        const nextRegen = prev.hearts === REGEN_CAP ? now + REGEN_INTERVAL_MS : prev.nextHeartRegenAt;
        return { ...prev, hearts: prev.hearts - 1, nextHeartRegenAt: nextRegen };
      } else {
        if (prev.halfHeartOwed) {
          // 2nd off-peak message: consume 1 heart
          if (prev.hearts <= 0) return prev;
          const now = Date.now();
          const nextRegen = prev.hearts === REGEN_CAP ? now + REGEN_INTERVAL_MS : prev.nextHeartRegenAt;
          return { ...prev, hearts: prev.hearts - 1, halfHeartOwed: false, nextHeartRegenAt: nextRegen };
        } else {
          // 1st off-peak message: mark half owed, no heart consumed yet
          return { ...prev, halfHeartOwed: true };
        }
      }
    });
  }, []);

  // ── Earn hearts (missions, sharing, invites) ──
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

  // ── Message sent — streak + session counter + learning loop steps only ──
  // Skill detection and XP are handled by onExchangeEvaluated (after AI responds)
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
        if (b.id === "streak" && newStreak >= 3) return { ...b, unlocked: true };
        return b;
      });

      return {
        ...prev,
        ...streakPatch(prev),
        messagesThisSession: newMsgCount,
        learningLoop: loop,
        badges,
      };
    });
  }, [streakPatch]);

  // ── Exchange evaluated (called after stream complete, with AI insight) ──
  const onExchangeEvaluated = useCallback((result: ExchangeResult) => {
    setState((prev) => {
      // ── 1. XP ──
      const newXpToday = prev.xpToday + result.xpEarned;
      const newTotalXp = prev.totalXp + result.xpEarned;

      // ── 2. Skills ──
      const skills = prev.skills.map((sk) =>
        sk.key === result.skillKey
          ? { ...sk, progress: Math.min(100, sk.progress + result.skillDelta) }
          : sk
      );

      // ── 3. Topics this session ──
      const newTopics = result.skillKey
        ? Array.from(new Set([...prev.topicsThisSession, result.skillKey]))
        : prev.topicsThisSession;

      // ── 4. Mission auto-progress ──
      const { missions, newlyCompleted } = advanceMissions(
        prev.todaysMissions,
        prev.completedMissionIds,
        result.missionEvents
      );
      const completedIds = [
        ...prev.completedMissionIds,
        ...newlyCompleted.map((m) => m.id),
      ];
      const weeklyCompleted = prev.weeklyCompleted + newlyCompleted.length;
      const monthlyCompleted = prev.monthlyCompleted + newlyCompleted.length;

      // ── 5. Hearts reward for completed missions ──
      const heartsEarned = newlyCompleted.reduce(
        (acc, m) => acc + (m.isBonus ? 2 : 1),
        0
      );
      const newHearts = Math.min(ACCUM_CAP, prev.hearts + heartsEarned);

      // ── 6. Badges ──
      const badges = prev.badges.map((b) => {
        const regularDone = missions.filter((m) => !m.isBonus && m.completed).length;
        if (b.id === "mission" && regularDone >= 3) return { ...b, unlocked: true };
        if (b.id === "focus" && newXpToday >= 50) return { ...b, unlocked: true };
        return b;
      });

      // ── 7. Learning loop: step 2 (core exercise) after exchange ──
      const loop = prev.learningLoop.map((s, i) => {
        if (i === 2 && !s.done && result.missionEvents.some((e) => e.type === "correction_requested"))
          return { ...s, done: true };
        return s;
      });

      // ── 8. Feed ──
      const qualityEntry = {
        label: result.qualityLabel === "Excellent"
          ? "Excellent answer!"
          : result.qualityLabel === "Good"
          ? "Good answer"
          : "Question answered",
        xp: `+${result.xpEarned} XP`,
        timestamp: Date.now(),
      };
      const missionEntries = newlyCompleted.map((m) => ({
        label: `Mission done: ${m.title.length > 28 ? m.title.slice(0, 26) + "…" : m.title}`,
        xp: `+${m.xpReward} XP`,
        timestamp: Date.now() - 1,
      }));
      const feed = [qualityEntry, ...missionEntries, ...prev.recentFeed].slice(0, 10);

      return {
        ...prev,
        xpToday: newXpToday,
        totalXp: newTotalXp,
        xpByDay: addXpToDay(prev.xpByDay, result.xpEarned),
        skills,
        topicsThisSession: newTopics,
        todaysMissions: missions,
        completedMissionIds: completedIds,
        weeklyCompleted,
        monthlyCompleted,
        hearts: newHearts,
        badges,
        learningLoop: loop,
        recentFeed: feed,
      };
    });
  }, []);

  // ── Response received (stream complete) ──
  const onResponseReceived = useCallback((xpEarned?: number, newBadgeIds?: string[]) => {
    const xp = typeof xpEarned === "number" && xpEarned > 0 ? xpEarned : 8;
    setState((prev) => {
      const newXpToday = prev.xpToday + xp;
      const badges = prev.badges.map((b) => {
        if (newBadgeIds?.some((id) => id.toLowerCase().includes(b.id))) return { ...b, unlocked: true };
        if (b.id === "focus" && newXpToday >= 50) return { ...b, unlocked: true };
        return b;
      });
      const label =
        prev.messagesThisSession <= 1 ? "Warm-up answered" :
        prev.messagesThisSession <= 2 ? "Core exercise answered" : "Question answered";
      const feed: FeedEntry[] = [
        { label, xp: `+${xp} XP`, timestamp: Date.now() },
        ...prev.recentFeed.slice(0, 9),
      ];
      return { ...prev, xpToday: newXpToday, totalXp: prev.totalXp + xp, xpByDay: addXpToDay(prev.xpByDay, xp), badges, recentFeed: feed };
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

  // ── Complete a mission ──
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

      const badges = prev.badges.map((b) => {
        const regularDone = missions.filter((m) => !m.isBonus && m.completed).length;
        if (b.id === "mission" && regularDone >= 3) return { ...b, unlocked: true };
        if (b.id === "focus" && newXpToday >= 50) return { ...b, unlocked: true };
        return b;
      });

      // Hearts reward — can exceed REGEN_CAP (stockpile), capped at ACCUM_CAP
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
        totalXp: prev.totalXp + xp,
        xpByDay: addXpToDay(prev.xpByDay, xp),
        hearts: newHearts,
        recentFeed: feed,
        badges,
      };
    });
  }, []);

  // ── Get prompt to inject in chat for a mission ──
  const getMissionStartPrompt = useCallback((missionId: string): string => {
    const mission = state.todaysMissions.find((m) => m.id === missionId);
    return mission?.prompt ?? "Let's start a new exercise!";
  }, [state.todaysMissions]);

  // ── Skill practice prompt ──
  const getPracticePrompt = useCallback((skillKey: string): string => {
    const map: Record<string, string> = {
      algebra: "Give me an algebra exercise to practice — equations, factoring, or polynomials.",
      grammar: "Give me a grammar exercise — sentence correction, conjugation, or syntax.",
      physics: "Give me a physics problem — forces, energy, kinematics, or thermodynamics.",
    };
    return map[skillKey] ?? `Give me an exercise to practice ${skillKey}.`;
  }, []);

  return {
    state,
    onMessageSent,
    onExchangeEvaluated,
    onResponseReceived,
    onCorrectionRequested,
    completeMission,
    consumeHeart,
    earnHearts,
    getMissionStartPrompt,
    getPracticePrompt,
  };
}
