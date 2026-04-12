const INSTALLATION_KEY = "raya_installation_id_v1";

export function getOrCreateInstallationId(): string {
  if (typeof window === "undefined") return "server";

  const existing = window.localStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;

  const next =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(INSTALLATION_KEY, next);
  return next;
}
