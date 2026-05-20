"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Waves, BadgeCheck, UserRound, Info, ShieldCheck, ChevronRight, Smartphone, Share, PlusSquare } from "lucide-react";
import { APP_VERSION, readAppSettings, writeAppSettings } from "@/lib/app-settings";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userIsVerified?: boolean;
  onOpenRayaCard?: () => void;
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  icon,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-indigo-500">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-900">{label}</span>
            <span
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                enabled ? "bg-indigo-500" : "bg-slate-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  enabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
    </button>
  );
}

export default function SettingsModal({
  isOpen,
  onClose,
  userIsVerified = false,
  onOpenRayaCard,
}: SettingsModalProps) {
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const settings = readAppSettings();
    setTipsEnabled(settings.tipsEnabled);
    setReduceMotion(settings.reduceMotion);
  }, [isOpen]);

  const handleTipsToggle = () => {
    const next = !tipsEnabled;
    setTipsEnabled(next);
    writeAppSettings({ tipsEnabled: next });
  };

  const handleReduceMotionToggle = () => {
    const next = !reduceMotion;
    setReduceMotion(next);
    writeAppSettings({ reduceMotion: next });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="zen-backdrop z-[60]"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">Settings</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">Security & Backup</h3>
                  <div className="space-y-3">
                    {!userIsVerified && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenRayaCard?.();
                        }}
                        className="w-full rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-left hover:bg-violet-100 transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-white p-2 text-violet-600 shadow-sm group-hover:scale-110 transition-transform">
                            <ShieldCheck className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-violet-900">Raya Card (Backup)</p>
                            <p className="text-xs text-violet-600/80 font-medium">Secure your progress without an email</p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-violet-400 group-hover:translate-x-1 transition-transform" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">Preferences</h3>
                  <div className="space-y-3">
                    <ToggleRow
                      label="Show tips & alerts"
                      description="Control helpful nudges like Level Up Code reminders and other lightweight prompts."
                      enabled={tipsEnabled}
                      onToggle={handleTipsToggle}
                      icon={<Sparkles className="w-4 h-4" />}
                    />
                    <ToggleRow
                      label="Reduce motion"
                      description="Keep the app calmer by minimizing animations and motion-heavy transitions."
                      enabled={reduceMotion}
                      onToggle={handleReduceMotionToggle}
                      icon={<Waves className="w-4 h-4" />}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">App Experience</h3>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                      <div className="flex items-center gap-3 mb-3 text-indigo-600">
                        <Smartphone className="w-5 h-5" />
                        <span className="text-sm font-bold uppercase tracking-widest">Mobile Shortcut</span>
                      </div>
                      <p className="text-xs text-indigo-900/70 font-medium leading-relaxed mb-4">
                        Add Raya to your home screen for the best experience. It works just like a native app!
                      </p>
                      
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 bg-white/60 p-3 rounded-xl border border-white">
                          <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600"><Share className="w-3.5 h-3.5" /></div>
                          <p className="text-[11px] font-semibold text-slate-700">
                            <strong>iOS (Safari):</strong> Tap the share icon and select <span className="text-indigo-600">"Add to Home Screen"</span>.
                          </p>
                        </div>
                        <div className="flex items-start gap-3 bg-white/60 p-3 rounded-xl border border-white">
                          <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-600"><PlusSquare className="w-3.5 h-3.5" /></div>
                          <p className="text-[11px] font-semibold text-slate-700">
                            <strong>Android (Chrome):</strong> Tap the menu icon (⋮) and select <span className="text-indigo-600">"Install app"</span>.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">Account</h3>
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-white p-2 text-indigo-500 shadow-sm">
                        {userIsVerified ? <BadgeCheck className="w-4 h-4" /> : <UserRound className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Account status</p>
                        <p className="text-xs text-slate-500">
                          {userIsVerified ? "Verified account" : "Instant account"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">About</h3>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-white p-2 text-slate-500 shadow-sm">
                        <Info className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">App version</p>
                        <p className="text-xs text-slate-500">RAYA Web v{APP_VERSION}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
