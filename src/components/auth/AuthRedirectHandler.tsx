"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { AuthResetSession } from "@/hooks/useUserProfile";

interface Props {
  onConfirmed: () => void;
  onEmailUpgraded: () => void;
  onResetPassword: (session: AuthResetSession) => void;
  onConfirmFailed: () => void;
}

/**
 * Reads URL search params on mount and fires callbacks.
 * Must be wrapped in <Suspense> by the parent (Next.js requirement for useSearchParams).
 */
export default function AuthRedirectHandler({ onConfirmed, onEmailUpgraded, onResetPassword, onConfirmFailed }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const confirmed = searchParams.get("confirmed");
    const emailUpgraded = searchParams.get("email_upgraded");
    const resetPassword = searchParams.get("reset_password");
    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");
    const error = searchParams.get("error");

    if (confirmed === "1") {
      onConfirmed();
      router.replace("/");
    } else if (emailUpgraded === "1") {
      onEmailUpgraded();
      router.replace("/");
    } else if (resetPassword === "1" && accessToken) {
      onResetPassword({
        accessToken,
        refreshToken: refreshToken ?? undefined,
      });
      router.replace("/");
    } else if (error === "confirmation_failed") {
      onConfirmFailed();
      router.replace("/");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
