"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

export interface UserProfile {
  displayName: string;
  schoolLevel: string; // e.g. "Terminale S", "3ème", "Grade 10"
}

const PROFILE_KEY = "raya_user_profile_v1";

function readProfile(): UserProfile {
  if (typeof window === "undefined") return { displayName: "", schoolLevel: "" };
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : { displayName: "", schoolLevel: "" };
  } catch {
    return { displayName: "", schoolLevel: "" };
  }
}

export function useUserProfile(userId?: string) {
  const [profile, setProfile] = useState<UserProfile>(readProfile);
  const dbLoadedRef  = useRef(false);
  const dbSyncTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from DB when user logs in
  useEffect(() => {
    if (!userId) { dbLoadedRef.current = false; return; }
    async function load() {
      const { data, error } = await supabase.rpc("get_user_profile");
      if (error || !data) return;
      const db = data as { displayName?: string; schoolLevel?: string };
      // DB wins for school level (authoritative), merge with local name if DB empty
      const merged: UserProfile = {
        displayName: db.displayName || profile.displayName,
        schoolLevel: db.schoolLevel || profile.schoolLevel,
      };
      dbLoadedRef.current = true;
      setProfile(merged);
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(merged)); } catch { /* quota */ }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Debounced DB upsert whenever profile changes (only after initial DB load)
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
    return () => { if (dbSyncTimer.current) clearTimeout(dbSyncTimer.current); };
  }, [profile, userId]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updates };
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      // Mark DB as loaded so the debounced upsert fires immediately on next change
      dbLoadedRef.current = true;
      return next;
    });
  }, []);

  const isProfileComplete = profile.schoolLevel !== "";

  return { profile, updateProfile, isProfileComplete };
}
