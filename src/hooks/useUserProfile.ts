"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

export interface UserProfile {
  username: string;
  displayName: string;
  schoolLevel: string;
  hasEmail: boolean;
  hasVerifiedEmail: boolean;
  authMethod: "anonymous" | "email" | "recovery_key";
  accountState: "onboarding_pending" | "active_unverified" | "active_verified";
  planTier: string;
  onboardingCompleted: boolean;
}

const PROFILE_KEY = "raya_user_profile_v1";

export type AuthResetSession = {
  accessToken: string;
  refreshToken?: string;
};

function emptyProfile(): UserProfile {
  return {
    username: "",
    displayName: "",
    schoolLevel: "",
    hasEmail: false,
    hasVerifiedEmail: false,
    authMethod: "anonymous",
    accountState: "onboarding_pending",
    planTier: "free",
    onboardingCompleted: false,
  };
}

function readProfile(): UserProfile {
  if (typeof window === "undefined") return emptyProfile();
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...emptyProfile(), ...JSON.parse(raw) } : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

export function useUserProfile(userId?: string) {
  const [profile, setProfile] = useState<UserProfile>(readProfile);
  const dbLoadedRef = useRef(false);
  const dbSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) {
      dbLoadedRef.current = false;
      setProfile(emptyProfile());
      try {
        localStorage.removeItem(PROFILE_KEY);
      } catch {
        // ignore storage failures
      }
      return;
    }

    async function load() {
      const { data, error } = await supabase.rpc("get_user_profile");
      if (error || !data) return;

      const db = data as Partial<UserProfile>;
      const merged: UserProfile = {
        username: db.username || profile.username,
        displayName: db.displayName || profile.displayName,
        schoolLevel: db.schoolLevel || profile.schoolLevel,
        hasEmail: typeof db.hasEmail === "boolean" ? db.hasEmail : profile.hasEmail,
        hasVerifiedEmail:
          typeof db.hasVerifiedEmail === "boolean" ? db.hasVerifiedEmail : profile.hasVerifiedEmail,
        authMethod:
          db.authMethod === "email" || db.authMethod === "recovery_key" || db.authMethod === "anonymous"
            ? db.authMethod
            : profile.authMethod,
        accountState:
          db.accountState === "active_unverified" ||
          db.accountState === "active_verified" ||
          db.accountState === "onboarding_pending"
            ? db.accountState
            : profile.accountState,
        planTier: typeof db.planTier === "string" && db.planTier.trim() ? db.planTier : profile.planTier,
        onboardingCompleted:
          typeof db.onboardingCompleted === "boolean" ? db.onboardingCompleted : profile.onboardingCompleted,
      };

      dbLoadedRef.current = true;
      setProfile(merged);
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
      } catch {
        // ignore quota issues
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || !dbLoadedRef.current) return;
    if (dbSyncTimer.current) clearTimeout(dbSyncTimer.current);
    dbSyncTimer.current = setTimeout(async () => {
      const { error } = await supabase.rpc("upsert_user_profile", {
        p_display_name: profile.displayName,
        p_school_level: profile.schoolLevel,
      });
      if (error) console.error("Profile DB sync error:", error.message);
    }, 2000);
    return () => {
      if (dbSyncTimer.current) clearTimeout(dbSyncTimer.current);
    };
  }, [profile.displayName, profile.schoolLevel, userId]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota issues
      }
      dbLoadedRef.current = true;
      return next;
    });
  }, []);

  const isProfileComplete =
    profile.accountState !== "onboarding_pending" &&
    profile.username.trim() !== "" &&
    profile.schoolLevel !== "";

  return { profile, updateProfile, isProfileComplete };
}
