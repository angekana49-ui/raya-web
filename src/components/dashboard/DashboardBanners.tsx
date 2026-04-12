"use client";

import { motion, AnimatePresence } from "framer-motion";
import SmartPopup from "@/components/ui/SmartPopup";

interface DashboardBannersProps {
  showConfirmedBanner: boolean;
  showEmailUpgradedBanner: boolean;
  showErrorBanner: boolean;
  showLevelUpNudge: boolean;
  activePopup: any;
  closeActivePopup: () => void;
  setSidebarVisible: (v: boolean) => void;
  setOpenLevelUpCodeRequest: (callback: (prev: number) => number) => void;
  dismissLevelUpNudge: () => void;
}

export default function DashboardBanners(props: DashboardBannersProps) {
  const {
    showConfirmedBanner, showEmailUpgradedBanner, showErrorBanner,
    showLevelUpNudge, activePopup, closeActivePopup,
    setSidebarVisible, setOpenLevelUpCodeRequest, dismissLevelUpNudge
  } = props;

  return (
    <>
      {/* Email confirmed banner */}
      <AnimatePresence>
        {showConfirmedBanner && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2.5 bg-emerald-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg"
          >
            <span>✓</span>
            <span>Account confirmed — welcome to RAYA!</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEmailUpgradedBanner && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2.5 bg-sky-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg"
          >
            <span>✓</span>
            <span>Email confirmed — set your password to finish.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation failed banner */}
      <AnimatePresence>
        {showErrorBanner && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2.5 bg-red-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg"
          >
            <span>✕</span>
            <span>This link has expired. Please request a new one.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLevelUpNudge && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-[90] w-[calc(100vw-2rem)] max-w-xs rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm"
          >
            <p className="text-sm font-semibold text-slate-900">Got a Level Up Code?</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Open your profile menu to unlock extra context, one more mode, and 50% off your first plan.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  setSidebarVisible(true);
                  setOpenLevelUpCodeRequest((value) => value + 1);
                  dismissLevelUpNudge();
                }}
                className="h-9 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
              >
                Open menu
              </button>
              <button
                onClick={dismissLevelUpNudge}
                className="h-9 rounded-xl bg-slate-100 px-3 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Not now
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SmartPopup
        open={!!activePopup}
        tone={activePopup?.tone ?? "info"}
        title={activePopup?.title ?? ""}
        message={activePopup?.message ?? ""}
        primaryAction={activePopup?.primaryAction}
        secondaryAction={activePopup?.secondaryAction}
        onClose={closeActivePopup}
      />
    </>
  );
}
