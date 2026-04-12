"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_USER_ENTITLEMENTS,
  normalizeUserEntitlements,
  type UserEntitlements,
} from "@/lib/user-entitlements";

export function useUserEntitlements(userId?: string) {
  const [entitlements, setEntitlements] = useState<UserEntitlements>(DEFAULT_USER_ENTITLEMENTS);
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
      return DEFAULT_USER_ENTITLEMENTS;
    }

    const next = normalizeUserEntitlements(data);
    setEntitlements(next);
    setLoading(false);
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
