const POPUP_PREFIX = "raya_popup_seen_v1:";

function getPopupStorageKey(key: string): string {
  return `${POPUP_PREFIX}${key}`;
}

export function canShowPopup(key: string, cooldownHours: number): boolean {
  if (typeof window === "undefined") return false;

  const raw = window.localStorage.getItem(getPopupStorageKey(key));
  if (!raw) return true;

  const lastSeenAt = Number(raw);
  if (!Number.isFinite(lastSeenAt)) return true;

  return Date.now() - lastSeenAt >= cooldownHours * 60 * 60 * 1000;
}

export function markPopupSeen(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getPopupStorageKey(key), String(Date.now()));
}
