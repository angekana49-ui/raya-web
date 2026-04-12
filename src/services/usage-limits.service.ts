import { supabaseAdmin } from "@/lib/supabase/server";

type UsagePlan = "instant_free" | "verified_free" | "premium";

export interface UsageAllowance {
  plan: UsagePlan;
  hasEmail: boolean;
  tokenLimit: number | null;
  fileUploadLimit: number | null;
  windowHours: number | null;
}

export interface UsageSnapshot extends UsageAllowance {
  tokensUsed: number;
  fileUploadsUsed: number;
  windowKey: string | null;
  windowStartedAt: string | null;
}

const USAGE_WINDOW_HOURS = 4;
const INSTANT_TOKEN_LIMIT = 30_000;
const INSTANT_FILE_UPLOAD_LIMIT = 1;
const VERIFIED_TOKEN_LIMIT = 60_000;
const VERIFIED_FILE_UPLOAD_LIMIT = 3;

function getWindowParts(now = new Date()) {
  const windowStart = new Date(now);
  const startHour = Math.floor(windowStart.getUTCHours() / USAGE_WINDOW_HOURS) * USAGE_WINDOW_HOURS;
  windowStart.setUTCHours(startHour, 0, 0, 0);
  const windowKey = [
    windowStart.getUTCFullYear(),
    String(windowStart.getUTCMonth() + 1).padStart(2, "0"),
    String(windowStart.getUTCDate()).padStart(2, "0"),
    String(windowStart.getUTCHours()).padStart(2, "0"),
  ].join("");

  return {
    windowKey,
    windowStartedAt: windowStart.toISOString(),
  };
}

export function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function estimateFileUploadCount(files?: Array<unknown>): number {
  return Array.isArray(files) ? files.length : 0;
}

async function getUserPlan(userId: string): Promise<UsageAllowance> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("account_type, account_state")
    .eq("id", userId)
    .single();

  if (error) throw error;

  const accountType = String(data?.account_type ?? "free").toLowerCase();
  const accountState = String(data?.account_state ?? "onboarding_pending").toLowerCase();
  const hasVerifiedEmail = accountState === "active_verified";
  const hasEmail = hasVerifiedEmail || accountState === "active_unverified";

  if (!hasVerifiedEmail) {
    return {
      plan: "instant_free",
      hasEmail: false,
      tokenLimit: INSTANT_TOKEN_LIMIT,
      fileUploadLimit: INSTANT_FILE_UPLOAD_LIMIT,
      windowHours: USAGE_WINDOW_HOURS,
    };
  }

  if (accountType === "premium" || accountType === "pro") {
    return {
      plan: "premium",
      hasEmail,
      tokenLimit: null,
      fileUploadLimit: null,
      windowHours: USAGE_WINDOW_HOURS,
    };
  }

  return {
    plan: "verified_free",
    hasEmail,
    tokenLimit: VERIFIED_TOKEN_LIMIT,
    fileUploadLimit: VERIFIED_FILE_UPLOAD_LIMIT,
    windowHours: USAGE_WINDOW_HOURS,
  };
}

export async function getUsageSnapshot(userId: string): Promise<UsageSnapshot> {
  const allowance = await getUserPlan(userId);
  if (allowance.plan === "premium") {
    return {
      ...allowance,
      tokensUsed: 0,
      fileUploadsUsed: 0,
      windowKey: null,
      windowStartedAt: null,
    };
  }

  const { windowKey, windowStartedAt } = getWindowParts();
  const { data, error } = await supabaseAdmin
    .from("email_usage_windows")
    .select("tokens_used, file_uploads_used")
    .eq("user_id", userId)
    .eq("window_key", windowKey)
    .maybeSingle();

  if (error) throw error;

  return {
    ...allowance,
    tokensUsed: Number(data?.tokens_used ?? 0),
    fileUploadsUsed: Number(data?.file_uploads_used ?? 0),
    windowKey,
    windowStartedAt,
  };
}

export async function assertUsageWithinLimits(userId: string, options: {
  estimatedInputTokens?: number;
  requestedFileUploads?: number;
}) {
  const snapshot = await getUsageSnapshot(userId);
  if (snapshot.plan === "premium") return snapshot;

  const estimatedInputTokens = Math.max(0, options.estimatedInputTokens ?? 0);
  const requestedFileUploads = Math.max(0, options.requestedFileUploads ?? 0);

  if (
    snapshot.fileUploadLimit !== null &&
    snapshot.fileUploadsUsed + requestedFileUploads > snapshot.fileUploadLimit
  ) {
    throw new Error(
      `File upload limit reached for this ${snapshot.windowHours}-hour window. Try again later or upgrade your plan.`
    );
  }

  if (
    snapshot.tokenLimit !== null &&
    snapshot.tokensUsed + estimatedInputTokens > snapshot.tokenLimit
  ) {
    throw new Error(
      `Token limit reached for this ${snapshot.windowHours}-hour window. Try again later or upgrade your plan.`
    );
  }

  return snapshot;
}

export async function recordUsage(userId: string, options: {
  tokensUsed?: number;
  fileUploadsUsed?: number;
}) {
  const snapshot = await getUsageSnapshot(userId);
  if (snapshot.plan === "premium" || !snapshot.windowKey || !snapshot.windowStartedAt) {
    return snapshot;
  }

  const tokensDelta = Math.max(0, options.tokensUsed ?? 0);
  const uploadsDelta = Math.max(0, options.fileUploadsUsed ?? 0);

  const nextTokens = snapshot.tokensUsed + tokensDelta;
  const nextUploads = snapshot.fileUploadsUsed + uploadsDelta;

  const { error } = await supabaseAdmin
    .from("email_usage_windows")
    .upsert({
      user_id: userId,
      window_key: snapshot.windowKey,
      window_started_at: snapshot.windowStartedAt,
      tokens_used: nextTokens,
      file_uploads_used: nextUploads,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,window_key" });

  if (error) throw error;

  return {
    ...snapshot,
    tokensUsed: nextTokens,
    fileUploadsUsed: nextUploads,
  };
}
