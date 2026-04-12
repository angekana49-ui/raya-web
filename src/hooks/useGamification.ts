"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLevelInfo } from "@/lib/level-titles";
import { supabase } from "@/lib/supabase/client";
import type { ExchangeResult } from "@/lib/assessment-engine";
import { useNotificationStore } from "@/store/useNotificationStore";

// ─── Types ───────────────────────────────────────────────────────────────────

export type MissionTrigger = "messages" | "prompts" | "xp_total";

export interface ActiveMission {
  id: string;
  title: string;
  target: number;
  current: number;
  xpReward: number;
  completed: boolean;
  trigger: MissionTrigger;
}

export interface BadgeItem {
  id: string;
  label: string;
  emoji: string;
  unlocked: boolean;
}

export type GamifNotification =
  | { id: string; type: "xp"; amount: number; quality?: string }
  | { id: string; type: "mission"; title: string; xp: number }
  | { id: string; type: "badge"; emoji: string; label: string }
  | { id: string; type: "level_up"; title: string; level: number };

export interface GamificationState {
  xpToday: number;
  totalXp: number;
  xpByDay: Record<string, number>;
  hearts: number;
  maxHearts: number;
  halfHeartOwed: boolean;
  nextHeartRegenAt: number;
  streakCount: number;
  lastActivityDate: string | null; // "YYYY-MM-DD"
  todaysMissions: ActiveMission[];
  badges: BadgeItem[];
  messagesThisSession: number;
}

const REGEN_INTERVAL_MS = 12 * 60 * 1000;
const REGEN_CAP = 5;
const ACCUM_CAP = 50;

export function getNetMessages(hearts: number, halfHeartOwed: boolean): number {
  return hearts * 2 - (halfHeartOwed ? 1 : 0);
}

function toDateStr(d: Date): string { return d.toISOString().slice(0, 10); }
function todayStr(): string { return toDateStr(new Date()); }
function yesterdayStr(): string {
  const d = new Date(); d.setDate(d.getDate() - 1); return toDateStr(d);
}

const DEFAULT_QUESTS: ActiveMission[] = [
  { id: "warmup", title: "Warm-up (Send 3 messages)", target: 3, current: 0, xpReward: 15, completed: false, trigger: "messages" },
  { id: "explorer", title: "Explorer (Use 1 Prompt)", target: 1, current: 0, xpReward: 25, completed: false, trigger: "prompts" },
  { id: "marathon", title: "Marathon (Earn 50 XP today)", target: 50, current: 0, xpReward: 40, completed: false, trigger: "xp_total" },
];

const DEFAULT_BADGES: BadgeItem[] = [
  { id: "streak", label: "3-Day Streak", emoji: "🔥", unlocked: false },
  { id: "streak_5", label: "5-Day Streak", emoji: "🔥🔥", unlocked: false },
  { id: "streak_week", label: "Week Warrior", emoji: "🗓️", unlocked: false },
  { id: "xp_1k", label: "1K Club", emoji: "⭐", unlocked: false },
  { id: "xp_10k", label: "10K Club", emoji: "💎", unlocked: false },
];

function buildInitialState(): GamificationState {
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
    todaysMissions: JSON.parse(JSON.stringify(DEFAULT_QUESTS)),
    badges: JSON.parse(JSON.stringify(DEFAULT_BADGES)),
    messagesThisSession: 0,
  };
}

// ─── DB logic ────────────────────────────────────────────────────────────────

function mergeDbState(db: Record<string, unknown>, local: GamificationState): GamificationState {
  const today = todayStr();
  const dbLastActivity = (db.last_activity_date as string) || local.lastActivityDate;
  
  // Reset daily quests and xpToday if the day has rolled over since last DB save
  const isNewDay = dbLastActivity !== today;
  
  const missions = isNewDay
    ? JSON.parse(JSON.stringify(DEFAULT_QUESTS))
    : (db.today_missions as ActiveMission[])?.length ? (db.today_missions as ActiveMission[]) : local.todaysMissions;

  return {
    ...local,
    totalXp: Math.max((db.total_xp as number) ?? 0, local.totalXp),
    xpToday: isNewDay ? 0 : ((db.xp_today as number) ?? local.xpToday),
    xpByDay: (db.xp_by_day as Record<string, number>) ?? local.xpByDay,
    streakCount: Math.max((db.streak_count as number) ?? 0, local.streakCount),
    lastActivityDate: dbLastActivity,
    hearts: Math.min(ACCUM_CAP, Math.max((db.hearts as number) ?? 0, local.hearts)),
    todaysMissions: missions,
    badges: (db.badges as BadgeItem[])?.length ? (db.badges as BadgeItem[]) : local.badges,
  };
}

function toDbPayload(s: GamificationState): Record<string, unknown> {
  return {
    totalXp: s.totalXp,
    xpToday: s.xpToday,
    xpByDay: s.xpByDay,
    streakCount: s.streakCount,
    longestStreak: s.streakCount, // can be tracked in DB
    lastActivityDate: s.lastActivityDate,
    hearts: Math.min(ACCUM_CAP, Math.max(0, s.hearts)),
    lastHeartRegen: s.nextHeartRegenAt > 0
      ? new Date(s.nextHeartRegenAt - REGEN_INTERVAL_MS).toISOString()
      : new Date().toISOString(),
    today_missions: s.todaysMissions,
    badges: s.badges,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useGamification(userId?: string) {
  const [state, setState] = useState<GamificationState>(buildInitialState);
  const dbLoadedRef = useRef(false);
  const dbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addNotification = useNotificationStore(s => s.addNotification);

  const dismissNotification = useCallback((id: string) => {
    // Now handled globally
  }, []);

  // 1. Initial DB Load
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

  // 2. Continuous DB Sync (debounced)
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

  // 3. Heart Auto-Regen Loop
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

  const earnHearts = useCallback((n: number) => {
    setState((prev) => ({ ...prev, hearts: Math.min(ACCUM_CAP, prev.hearts + n) }));
  }, []);

  // ─── Deterministic Advancement Logic ───
  // A helper that evaluates if quests are completed based on state, and applies XP.
  const processQuestsAndLevel = useCallback((prev: GamificationState, simulatedXpToday: number, simulatedTotalXp: number, triggerEvent?: MissionTrigger) => {
    let newXpToday = simulatedXpToday;
    let newTotalXp = simulatedTotalXp;
    const notifs: GamifNotification[] = [];
    const ts = Date.now().toString(36);

    // Update missions
    const updatedMissions = prev.todaysMissions.map(m => {
      if (m.completed) return m;
      let newCurrent = m.current;
      
      if (triggerEvent === "messages" && m.trigger === "messages") {
        newCurrent = Math.min(m.target, m.current + 1);
      } else if (triggerEvent === "prompts" && m.trigger === "prompts") {
        newCurrent = Math.min(m.target, m.current + 1);
      }
      
      // The xp_total trigger always assesses the exact current xpToday
      if (m.trigger === "xp_total") {
        newCurrent = Math.min(m.target, newXpToday);
      }

      if (newCurrent >= m.target && !m.completed) {
        // Mission just completed! Award XP
        newXpToday += m.xpReward;
        newTotalXp += m.xpReward;
        notifs.push({ id: `mission-${m.id}-${ts}`, type: "mission", title: m.title, xp: m.xpReward });
        return { ...m, current: newCurrent, completed: true };
      }
      return { ...m, current: newCurrent };
    });

    // Let's do a second pass for xp_total in case the mission rewards just pushed it over
    const finalMissions = updatedMissions.map(m => {
      if (m.completed || m.trigger !== "xp_total") return m;
      const newCurrent = Math.min(m.target, newXpToday);
      if (newCurrent >= m.target) {
         newXpToday += m.xpReward;
         newTotalXp += m.xpReward;
         notifs.push({ id: `mission-${m.id}-${ts}-2`, type: "mission", title: m.title, xp: m.xpReward });
         return { ...m, current: newCurrent, completed: true };
      }
      return { ...m, current: newCurrent };
    });

    // Check Badges
    const updatedBadges = prev.badges.map(b => {
      if (b.unlocked) return b;
      if (b.id === "streak" && prev.streakCount >= 3) return { ...b, unlocked: true };
      if (b.id === "streak_5" && prev.streakCount >= 5) return { ...b, unlocked: true };
      if (b.id === "streak_week" && prev.streakCount >= 7) return { ...b, unlocked: true };
      if (b.id === "xp_1k" && newTotalXp >= 1000) return { ...b, unlocked: true };
      if (b.id === "xp_10k" && newTotalXp >= 10000) return { ...b, unlocked: true };
      return b;
    });

    updatedBadges.forEach((b, i) => {
       if (b.unlocked && !prev.badges[i].unlocked) {
           notifs.push({ id: `badge-${b.id}-${ts}`, type: "badge", emoji: b.emoji, label: b.label });
       }
    });

    // Check Level Up
    const prevLevel = getLevelInfo(prev.totalXp).currentLevel;
    const newLevel = getLevelInfo(newTotalXp).currentLevel;
    if (newLevel > prevLevel) {
       notifs.push({ id: `level-${newLevel}-${ts}`, type: "level_up", title: getLevelInfo(newTotalXp).title, level: newLevel });
    }

    if (notifs.length > 0) {
      // Return notifications to the caller to emit them outside of setState
    }

    return { newXpToday, newTotalXp, finalMissions, updatedBadges, notifs };
  }, [addNotification]); // addNotification is stable from useNotificationStore

  const resolveStreak = useCallback((prev: GamificationState) => {
    const today = todayStr();
    // If we haven't touched the day string, we process streak
    if (prev.lastActivityDate === today) return { state: prev, notifs: [] };
    
    // It's a new day
    const isConsecutive = prev.lastActivityDate === yesterdayStr();
    const newStreak = isConsecutive ? prev.streakCount + 1 : 1;
    
    // Also reset quests Daily if it crossed a day boundary in-memory
    const missions = JSON.parse(JSON.stringify(DEFAULT_QUESTS));

    return { 
      state: { ...prev, lastActivityDate: today, streakCount: newStreak, todaysMissions: missions, xpToday: 0 },
      notifs: [] 
    };
  }, []);

  // ─── Actions ───
  
  // Helper to emit a list of notifications
  const emitNotifications = useCallback((notifs: GamifNotification[]) => {
    if (notifs.length === 0) return;
    notifs.forEach(n => {
      addNotification({
        type: n.type,
        title: n.type === 'xp' ? `+${n.amount} XP` : n.type === 'mission' ? 'Mission Complete!' : n.type === 'badge' ? 'Badge Unlocked!' : 'Level Up!',
        sub: n.type === 'xp' ? (n.quality || 'Good answer!') : n.type === 'mission' ? n.title : n.type === 'badge' ? n.label : n.title,
        payload: n
      });
    });
  }, [addNotification]);

  // Fired when user sends a chat message
  const onMessageSent = useCallback(() => {
    let notificationsToEmit: GamifNotification[] = [];
    
    setState((prev) => {
      const { state: stateWithStreak, notifs: streakNotifs } = resolveStreak(prev);
      const newMsgCount = stateWithStreak.messagesThisSession + 1;
      const baseEarned = 2;
      
      const { newXpToday, newTotalXp, finalMissions, updatedBadges, notifs } = processQuestsAndLevel(
        stateWithStreak, 
        stateWithStreak.xpToday + baseEarned, 
        stateWithStreak.totalXp + baseEarned, 
        "messages"
      );

      notificationsToEmit = [...streakNotifs, ...notifs];
      const today = todayStr();
      const newXpByDay = { ...stateWithStreak.xpByDay, [today]: (stateWithStreak.xpByDay[today] ?? 0) + baseEarned };

      return {
        ...stateWithStreak,
        messagesThisSession: newMsgCount,
        xpToday: newXpToday,
        totalXp: newTotalXp,
        xpByDay: newXpByDay,
        todaysMissions: finalMissions,
        badges: updatedBadges
      };
    });

    // Emit outside of setState
    queueMicrotask(() => emitNotifications(notificationsToEmit));
  }, [resolveStreak, processQuestsAndLevel, emitNotifications]);

  // Fired when user clicks a prompt in Empty State
  const onPromptUsed = useCallback(() => {
    let notificationsToEmit: GamifNotification[] = [];

    setState((prev) => {
      const { state: stateWithStreak, notifs: streakNotifs } = resolveStreak(prev);
      const { newXpToday, newTotalXp, finalMissions, updatedBadges, notifs } = processQuestsAndLevel(
        stateWithStreak, 
        stateWithStreak.xpToday, 
        stateWithStreak.totalXp, 
        "prompts"
      );

      notificationsToEmit = [...streakNotifs, ...notifs];

      return {
        ...stateWithStreak,
        xpToday: newXpToday,
        totalXp: newTotalXp,
        todaysMissions: finalMissions,
        badges: updatedBadges
      };
    });

    queueMicrotask(() => emitNotifications(notificationsToEmit));
  }, [resolveStreak, processQuestsAndLevel, emitNotifications]);

  // Fired when AI finishes replying to give qualitative XP
  const onExchangeEvaluated = useCallback((result: ExchangeResult) => {
    let notificationsToEmit: GamifNotification[] = [];

    setState((prev) => {
      const { state: stateWithStreak, notifs: streakNotifs } = resolveStreak(prev);
      const earned = result.xpEarned || 5; 
      
      const ts = Date.now().toString(36);
      const baseNotif: GamifNotification[] = earned > 0 ? [{
        id: `eval-xp-${ts}`,
        type: 'xp',
        amount: earned,
        quality: result.qualityLabel || 'Great exchange!'
      }] : [];

      const { newXpToday, newTotalXp, finalMissions, updatedBadges, notifs } = processQuestsAndLevel(
        stateWithStreak, 
        stateWithStreak.xpToday + earned, 
        stateWithStreak.totalXp + earned
      );

      notificationsToEmit = [...streakNotifs, ...baseNotif, ...notifs];
      const today = todayStr();
      const newXpByDay = { ...stateWithStreak.xpByDay, [today]: (stateWithStreak.xpByDay[today] ?? 0) + earned };

      return {
        ...stateWithStreak,
        xpToday: newXpToday,
        totalXp: newTotalXp,
        xpByDay: newXpByDay,
        todaysMissions: finalMissions,
        badges: updatedBadges
      };
    });

    queueMicrotask(() => emitNotifications(notificationsToEmit));
  }, [resolveStreak, processQuestsAndLevel, emitNotifications]);

  const onResponseReceived = useCallback((xpEarned?: number) => {
    const earned = typeof xpEarned === "number" && xpEarned > 0 ? xpEarned : 5;
    let notificationsToEmit: GamifNotification[] = [];

    setState((prev) => {
      const { state: stateWithStreak, notifs: streakNotifs } = resolveStreak(prev);
      const ts = Date.now().toString(36);
      const baseNotif: GamifNotification[] = [{
        id: `resp-xp-${ts}`,
        type: 'xp',
        amount: earned,
        quality: 'Intelligence gain'
      }];

      const { newXpToday, newTotalXp, finalMissions, updatedBadges, notifs } = processQuestsAndLevel(
        stateWithStreak, 
        stateWithStreak.xpToday + earned, 
        stateWithStreak.totalXp + earned
      );

      notificationsToEmit = [...streakNotifs, ...baseNotif, ...notifs];
      const today = todayStr();
      const newXpByDay = { ...stateWithStreak.xpByDay, [today]: (stateWithStreak.xpByDay[today] ?? 0) + earned };

      return {
        ...stateWithStreak,
        xpToday: newXpToday,
        totalXp: newTotalXp,
        xpByDay: newXpByDay,
        todaysMissions: finalMissions,
        badges: updatedBadges
      };
    });

    queueMicrotask(() => emitNotifications(notificationsToEmit));
  }, [resolveStreak, processQuestsAndLevel, emitNotifications]);

  const hasUnsavedProgress = !userId && (state.totalXp > 0);

  return {
    state,
    hasUnsavedProgress,
    pendingNotifications: [], // Keep for back-compat
    dismissNotification,
    onMessageSent,
    onPromptUsed,
    onExchangeEvaluated,
    onResponseReceived,
    consumeHeart,
    earnHearts,
  };
}
