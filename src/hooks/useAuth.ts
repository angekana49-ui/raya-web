"use client";

import { useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export interface AuthState {
  user: User | null;
  dbUserId: string | null;
  loading: boolean;
  isGuest: boolean;
}

export function useAuth(): AuthState & { signOut: () => Promise<void> } {
  const [user, setUser] = useState<User | null>(null);
  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolveDbUserId = async (nextUser: User | null) => {
      if (!nextUser) {
        setDbUserId(null);
        return;
      }

      const { data, error } = await supabase.rpc("get_db_user_id");
      if (error) {
        console.error("Could not resolve DB user ID:", error.message || error.code || error);
        setDbUserId(null);
        return;
      }

      setDbUserId(typeof data === "string" ? data : null);
    };

    // Hydrate from existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      await resolveDbUserId(nextUser);
      setLoading(false);
    });

    // Keep in sync with auth events (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      await resolveDbUserId(nextUser);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { 
    user, 
    dbUserId,
    loading, 
    signOut,
    isGuest: user ? !user.email || user.user_metadata?.guest_installation_id : false
  };
}
