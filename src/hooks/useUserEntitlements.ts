"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_USER_ENTITLEMENTS,
  normalizeUserEntitlements,
  type UserEntitlements,
} from "@/lib/user-entitlements";

const ENTITLEMENTS_CACHE_KEY = "raya_user_entitlements_v1";

function readEntitlementsCache(): UserEntitlements {
  if (typeof window === "undefined") return DEFAULT_USER_ENTITLEMENTS;
  try {
    const raw = localStorage.getItem(ENTITLEMENTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_USER_ENTITLEMENTS;
  } catch {
    return DEFAULT_USER_ENTITLEMENTS;
  }
}

export function useUserEntitlements(userId?: string) {
  const [entitlements, setEntitlements] = useState<UserEntitlements>(readEntitlementsCache);
  const [loading, setLoading] = useState(Boolean(userId));

  const refresh = useCallback(async () => {
    if (!userId) {
      setEntitlements(DEFAULT_USER_ENTITLEMENTS);
      setLoading(false);
      return DEFAULT_USER_ENTITLEMENTS;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc("get_user_entitlements");
    if (error) {
      console.error("Entitlements fetch error:", error.message);
      setLoading(false);
      return entitlements || DEFAULT_USER_ENTITLEMENTS;
    }

    const next = normalizeUserEntitlements(data);
    setEntitlements(next);
    setLoading(false);
    try {
      localStorage.setItem(ENTITLEMENTS_CACHE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    return next;
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    entitlements,
    loading,
    refresh,
    setEntitlements,
  };
}
