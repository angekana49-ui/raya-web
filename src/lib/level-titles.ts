/**
 * Level system — shared between page and sidebar.
 *
 * Exponential curve: each tier is ~2-3× the previous.
 * At ~250-350 XP/active day:
 *   Apprentice (500 XP)    → 2 days
 *   Scholar    (3 000 XP)  → ~10 days
 *   Sage       (10 000 XP) → ~1 month
 *   Expert     (25 000 XP) → ~3 months
 *   Genius     (50 000 XP) → ~5-6 months (nearly a full school year)
 */

export const XP_LEVELS = [0, 500, 3_000, 10_000, 25_000, 50_000] as const;

export const LEVEL_TITLES = [
  "Student",     // 0
  "Apprentice",  // 1
  "Scholar",     // 2
  "Sage",        // 3
  "Expert",      // 4
  "Genius",      // 5
] as const;

// Next title preview (what you unlock at the next level)
export const NEXT_LEVEL_TITLES = [
  "Apprentice",  // 0 → 1
  "Scholar",     // 1 → 2
  "Sage",        // 2 → 3
  "Expert",      // 3 → 4
  "Genius",      // 4 → 5
  "Max!",        // 5 (already maxed)
] as const;

export interface LevelInfo {
  currentLevel: number;
  title: string;
  nextTitle: string;
  currentLevelXp: number;
  nextLevelXp: number;
  xpProgressPercent: number;
}

export function getLevelInfo(totalXp: number): LevelInfo {
  const levels = XP_LEVELS as unknown as number[];
  const currentLevel = levels.reduce((acc, threshold, idx) =>
    totalXp >= threshold ? idx : acc, 0);
  const currentLevelXp = levels[currentLevel] ?? 0;
  const nextLevelXp    = levels[Math.min(currentLevel + 1, levels.length - 1)] ?? currentLevelXp;
  const xpProgressPercent =
    nextLevelXp === currentLevelXp
      ? 100
      : Math.max(0, Math.min(100,
          ((totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100));
  const title     = LEVEL_TITLES[currentLevel]      ?? "Genius";
  const nextTitle = NEXT_LEVEL_TITLES[currentLevel] ?? "Max!";
  return { currentLevel, title, nextTitle, currentLevelXp, nextLevelXp, xpProgressPercent };
}
