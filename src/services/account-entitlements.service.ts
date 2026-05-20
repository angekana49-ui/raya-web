import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_USER_ENTITLEMENTS, normalizeUserEntitlements, type UserEntitlements } from "@/lib/user-entitlements";

export async function getUserEntitlementsForUser(userId: string): Promise<UserEntitlements> {
  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, account_type, account_state")
    .eq("id", userId)
    .single();

  if (error || !user) {
    return DEFAULT_USER_ENTITLEMENTS;
  }

  const { data: redemptions, error: redemptionError } = await supabaseAdmin
    .from("user_promo_code_redemptions")
    .select("promo_codes!inner ( bonus_features, is_active, valid_from, valid_until )")
    .eq("user_id", userId);

  if (redemptionError) {
    console.error("Entitlements redemption lookup error:", redemptionError.message);
  }

  const now = Date.now();
  const levelUpActive = Array.isArray(redemptions) && redemptions.some((row) => {
    const promoCodes = (row as unknown as { promo_codes?: unknown }).promo_codes;
    const promo = Array.isArray(promoCodes)
      ? (promoCodes[0] as Record<string, unknown> | undefined)
      : (promoCodes as Record<string, unknown> | undefined);
    if (!promo) return false;

    const isActive = promo.is_active === true;
    const validFrom = typeof promo.valid_from === "string" ? Date.parse(promo.valid_from) : NaN;
    const validUntil = typeof promo.valid_until === "string" ? Date.parse(promo.valid_until) : NaN;
    const bonusFeatures = Array.isArray(promo.bonus_features) ? promo.bonus_features : [];

    return (
      isActive &&
      Number.isFinite(validFrom) &&
      validFrom <= now &&
      (!Number.isFinite(validUntil) || validUntil >= now) &&
      bonusFeatures.some((item) => item === "level_up")
    );
  });

  const planTier = String(user.account_type ?? "free");
  const isPro = planTier === "pro";
  const isPlus = planTier === "plus";
  const hasPremiumAccess = isPro || isPlus;
  const accountState = String(user.account_state ?? "onboarding_pending");
  const isVerified = accountState === "active_verified" || hasPremiumAccess;

  let next = normalizeUserEntitlements({
    accountState,
    planTier,
    levelUpActive,
    hasPremiumAccess,
    canPurchasePremium: accountState === "active_verified" && !hasPremiumAccess,
    tokenWindowHours: 4,
    tokenLimit: isVerified ? 60_000 : 30_000,
    fileUploadLimit: isVerified ? 3 : 1,
    historyWindowDays: isVerified ? null : 30,
    roomMinutesLimit: 60,
    xpMultiplier: 1,
    availableModes: levelUpActive || hasPremiumAccess ? ["normal", "rush-mode"] : ["normal"],
    availableModels: ["gemini-3.1-flash-lite"],
    badges: levelUpActive ? ["level_up"] : [],
  });

  if (levelUpActive && isVerified && !hasPremiumAccess) {
    next = {
      ...next,
      tokenLimit: 90_000,
      fileUploadLimit: 4,
      roomMinutesLimit: 75,
      xpMultiplier: 1.25,
      availableModes: ["normal", "rush-mode", "creative-mode"],
      badges: ["level_up", "verified_level_up"],
    };
  }

  if (isPro) {
    next = {
      ...next,
      tokenLimit: 120_000,
      fileUploadLimit: 6,
      roomMinutesLimit: 90,
      xpMultiplier: 2,
      availableModes: ["normal", "rush-mode", "deep-thinking", "creative-mode"],
      availableModels: ["gemini-3.1-flash-lite", "gpt-4-turbo", "gpt-4", "claude-sonnet"],
      badges: ["pro"],
    };
  } else if (isPlus) {
    next = {
      ...next,
      tokenLimit: null,
      fileUploadLimit: 10,
      roomMinutesLimit: 120,
      xpMultiplier: 3,
      availableModes: ["normal", "rush-mode", "deep-thinking", "creative-mode"],
      availableModels: ["gemini-3.1-flash-lite", "gpt-4-turbo", "gpt-4", "claude-sonnet"],
      badges: ["plus"],
    };
  }

  return next;
}
