"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Trophy, Zap, TrendingUp } from "lucide-react";
import type { GamifNotification } from "@/hooks/useGamification";

interface GamificationToastProps {
  notifications: GamifNotification[];
  onDismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 3500;

function ToastItem({
  notif,
  onDismiss,
}: {
  notif: GamifNotification;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notif.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notif.id, onDismiss]);

  const content = (() => {
    switch (notif.type) {
      case "xp":
        return {
          icon: <Zap className="w-4 h-4 text-yellow-500 fill-yellow-400" />,
          title: `+${notif.amount} XP`,
          sub:
            notif.quality === "Excellent"
              ? "Excellent answer! 🔥"
              : notif.quality === "Good"
              ? "Good answer!"
              : "Keep practicing",
          bg: "bg-yellow-50 border-yellow-200",
          titleColor: "text-yellow-700",
        };
      case "mission":
        return {
          icon: <Trophy className="w-4 h-4 text-emerald-500" />,
          title: "Mission complete!",
          sub: `${notif.grade ? notif.grade + " · " : ""}+${notif.xp} XP${notif.isBonus ? " · +2 hearts" : " · +1 heart"}`,
          bg: "bg-emerald-50 border-emerald-200",
          titleColor: "text-emerald-700",
        };
      case "badge":
        return {
          icon: <span className="text-base leading-none">{notif.emoji}</span>,
          title: "Badge unlocked!",
          sub: notif.label,
          bg: "bg-violet-50 border-violet-200",
          titleColor: "text-violet-700",
        };
      case "level_up":
        return {
          icon: <TrendingUp className="w-4 h-4 text-primary" />,
          title: `Level up! → ${notif.title}`,
          sub: `You've reached level ${notif.level}`,
          bg: "bg-blue-50 border-blue-200",
          titleColor: "text-primary",
        };
      default:
        return {
          icon: <Star className="w-4 h-4 text-slate-500" />,
          title: "Achievement",
          sub: "",
          bg: "bg-slate-50 border-slate-200",
          titleColor: "text-slate-700",
        };
    }
  })();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      onClick={() => onDismiss(notif.id)}
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border shadow-md cursor-pointer select-none ${content.bg}`}
      style={{ minWidth: 220, maxWidth: 300 }}
    >
      <div className="w-7 h-7 rounded-lg bg-white/80 flex items-center justify-center flex-shrink-0 shadow-sm">
        {content.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-tight ${content.titleColor}`}>
          {content.title}
        </p>
        {content.sub && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{content.sub}</p>
        )}
      </div>
    </motion.div>
  );
}

export default function GamificationToast({
  notifications,
  onDismiss,
}: GamificationToastProps) {
  // Show at most 3 toasts at once (newest first)
  const visible = notifications.slice(-3);

  return (
    <div
      className="fixed bottom-24 right-4 z-[70] flex flex-col-reverse gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Gamification notifications"
    >
      <AnimatePresence mode="popLayout">
        {visible.map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <ToastItem notif={n} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
