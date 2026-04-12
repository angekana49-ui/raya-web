export interface UserEntitlements {
  accountState: "onboarding_pending" | "active_unverified" | "active_verified";
  planTier: string;
  levelUpActive: boolean;
  hasPremiumAccess: boolean;
  canPurchasePremium: boolean;
  tokenWindowHours: number;
  tokenLimit: number | null;
  fileUploadLimit: number | null;
  historyWindowDays: number | null;
  roomMinutesLimit: number;
  xpMultiplier: number;
  availableModes: string[];
  availableModels: string[];
  badges: string[];
}

export type ModeLockType = "level_up" | "premium" | null;

export const DEFAULT_USER_ENTITLEMENTS: UserEntitlements = {
  accountState: "onboarding_pending",
  planTier: "free",
  levelUpActive: false,
  hasPremiumAccess: false,
  canPurchasePremium: false,
  tokenWindowHours: 4,
  tokenLimit: 30_000,
  fileUploadLimit: 1,
  historyWindowDays: 30,
  roomMinutesLimit: 60,
  xpMultiplier: 1,
  availableModes: ["normal"],
  availableModels: ["gemini-3.1-flash-lite-preview"],
  badges: [],
};

export function normalizeUserEntitlements(value: unknown): UserEntitlements {
  const data = (value && typeof value === "object" ? value : {}) as Partial<UserEntitlements>;

  return {
    accountState:
      data.accountState === "active_unverified" ||
      data.accountState === "active_verified" ||
      data.accountState === "onboarding_pending"
        ? data.accountState
        : DEFAULT_USER_ENTITLEMENTS.accountState,
    planTier: typeof data.planTier === "string" && data.planTier.trim()
      ? data.planTier
      : DEFAULT_USER_ENTITLEMENTS.planTier,
    levelUpActive: Boolean(data.levelUpActive),
    hasPremiumAccess: Boolean(data.hasPremiumAccess),
    canPurchasePremium: Boolean(data.canPurchasePremium),
    tokenWindowHours:
      typeof data.tokenWindowHours === "number" && Number.isFinite(data.tokenWindowHours)
        ? data.tokenWindowHours
        : DEFAULT_USER_ENTITLEMENTS.tokenWindowHours,
    tokenLimit:
      data.tokenLimit === null || typeof data.tokenLimit === "number"
        ? data.tokenLimit
        : DEFAULT_USER_ENTITLEMENTS.tokenLimit,
    fileUploadLimit:
      data.fileUploadLimit === null || typeof data.fileUploadLimit === "number"
        ? data.fileUploadLimit
        : DEFAULT_USER_ENTITLEMENTS.fileUploadLimit,
    historyWindowDays:
      data.historyWindowDays === null || typeof data.historyWindowDays === "number"
        ? data.historyWindowDays
        : DEFAULT_USER_ENTITLEMENTS.historyWindowDays,
    roomMinutesLimit:
      typeof data.roomMinutesLimit === "number" && Number.isFinite(data.roomMinutesLimit)
        ? data.roomMinutesLimit
        : DEFAULT_USER_ENTITLEMENTS.roomMinutesLimit,
    xpMultiplier:
      typeof data.xpMultiplier === "number" && Number.isFinite(data.xpMultiplier)
        ? data.xpMultiplier
        : DEFAULT_USER_ENTITLEMENTS.xpMultiplier,
    availableModes: Array.isArray(data.availableModes)
      ? data.availableModes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : DEFAULT_USER_ENTITLEMENTS.availableModes,
    availableModels: Array.isArray(data.availableModels)
      ? data.availableModels.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : DEFAULT_USER_ENTITLEMENTS.availableModels,
    badges: Array.isArray(data.badges)
      ? data.badges.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : DEFAULT_USER_ENTITLEMENTS.badges,
  };
}

export function isModeUnlocked(entitlements: UserEntitlements, modeId: string): boolean {
  return entitlements.availableModes.includes(modeId);
}

export function isModelUnlocked(entitlements: UserEntitlements, modelId: string): boolean {
  return entitlements.availableModels.includes(modelId);
}

export function getModeLockType(entitlements: UserEntitlements, modeId: string): ModeLockType {
  if (modeId === "normal" || isModeUnlocked(entitlements, modeId)) {
    return null;
  }

  if (modeId === "rush-mode") {
    return "level_up";
  }

  return "premium";
}

export function getFirstUnlockedMode(entitlements: UserEntitlements, fallback = "normal"): string {
  return entitlements.availableModes[0] ?? fallback;
}

export function getFirstUnlockedModel(entitlements: UserEntitlements, fallback = "gemini-3.1-flash-lite-preview"): string {
  return entitlements.availableModels[0] ?? fallback;
}
