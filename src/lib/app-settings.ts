"use client";

export const APP_VERSION = "1.0.2";

export const APP_SETTINGS_EVENT = "raya:settings-changed";
export const TIPS_ENABLED_KEY = "raya_tips_enabled_v1";
export const REDUCE_MOTION_KEY = "raya_reduce_motion_v1";

export interface AppSettings {
  tipsEnabled: boolean;
  reduceMotion: boolean;
}

export function readAppSettings(): AppSettings {
  if (typeof window === "undefined") {
    return { tipsEnabled: true, reduceMotion: false };
  }

  return {
    tipsEnabled: window.localStorage.getItem(TIPS_ENABLED_KEY) !== "false",
    reduceMotion: window.localStorage.getItem(REDUCE_MOTION_KEY) === "true",
  };
}

export function writeAppSettings(next: Partial<AppSettings>) {
  if (typeof window === "undefined") return;

  const current = readAppSettings();
  const merged = { ...current, ...next };

  window.localStorage.setItem(TIPS_ENABLED_KEY, String(merged.tipsEnabled));
  window.localStorage.setItem(REDUCE_MOTION_KEY, String(merged.reduceMotion));
  applyReduceMotion(merged.reduceMotion);
  window.dispatchEvent(new CustomEvent(APP_SETTINGS_EVENT, { detail: merged }));
}

export function applyReduceMotion(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.reduceMotion = enabled ? "true" : "false";
}
