"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Zap, Bot, Sparkles, X, Check, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIOptionId } from "@/types";
import { NoTranslate } from "@/components/ui/NoTranslate";
import { getModeLockType, type UserEntitlements } from "@/lib/user-entitlements";

interface AIOption {
  id: AIOptionId;
  label: string;
  description: string;
  icon: typeof Bot;
  color: string;
}

const AI_OPTIONS: AIOption[] = [
  {
    id: "normal",
    label: "Standard",
    description: "Balanced responses",
    icon: Bot,
    color: "#3b82f6",
  },
  {
    id: "rush-mode",
    label: "Fast",
    description: "Concise responses",
    icon: Zap,
    color: "#f59e0b",
  },
  {
    id: "deep-thinking",
    label: "Deep",
    description: "Detailed analysis",
    icon: Brain,
    color: "#8b5cf6",
  },
  {
    id: "creative-mode",
    label: "Creative",
    description: "Original responses",
    icon: Sparkles,
    color: "#ec4899",
  },
];

interface AIOptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  currentMode: string;
  onModeChange: (mode: string) => void;
  currentModel: string;
  onModelChange: (model: string) => void;
  entitlements: UserEntitlements;
  anchorEl?: HTMLElement | null;
  onOpenModelPicker: () => void;
  onLockedModeSelect?: (modeId: string, lockType: "level_up" | "premium") => void;
}

export default function AIOptionsMenu({
  visible,
  onClose,
  currentMode,
  onModeChange,
  currentModel,
  entitlements,
  anchorEl,
  // onOpenModelPicker, // PRO - coming soon
  onLockedModeSelect,
}: AIOptionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });

  useEffect(() => {
    if (!visible || !anchorEl) return;

    const updatePosition = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width || 272;
      const menuHeight = menuRect?.height || 300;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 8;
      const margin = 8;

      // Prefer opening directly above the trigger button.
      let left = anchorRect.left;
      left = Math.max(margin, Math.min(left, vw - menuWidth - margin));

      let top = anchorRect.top - menuHeight - gap;
      if (top < margin) top = Math.min(anchorRect.bottom + gap, vh - menuHeight - margin);

      setPosition((prev) => {
        const changed =
          Math.abs(prev.top - top) > 0.5 ||
          Math.abs(prev.left - left) > 0.5 ||
          !prev.ready;
        return changed ? { top, left, ready: true } : prev;
      });
    };

    let rafId = 0;
    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updatePosition();
      });
    };

    updatePosition();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [visible, anchorEl]);

  const handleSelectMode = (modeId: string) => {
    onModeChange(modeId);
    onClose();
  };

  const handleLockedSelect = (modeId: string, lockType: "level_up" | "premium") => {
    onLockedModeSelect?.(modeId, lockType);
    onClose();
  };

  const getModelName = () => {
    const modelNames: Record<string, string> = {
      "gpt-4-turbo": "GPT-4",
      "claude-sonnet": "Claude",
      "gemini-3": "Gemini",
    };
    return modelNames[currentModel] || "GPT-4";
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-transparent z-40"
            onClick={onClose}
          />

          {/* Menu */}
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed w-[264px] md:w-[272px] max-w-[calc(100vw-16px)] bg-white/80 backdrop-blur-xl rounded-2xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/40 z-50"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.ready ? "visible" : "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">AI Modes</h3>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Access message */}
            <div className="mb-3 p-3 bg-indigo-50/50 border border-indigo-100/50 rounded-xl">
              <div className="flex items-start gap-2">
                <Crown className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[11px] text-indigo-700 font-bold leading-tight uppercase tracking-wider">
                    Advanced Intelligence
                  </p>
                  <p className="text-xs text-indigo-500/80 mt-1 leading-snug">
                    {entitlements.hasPremiumAccess
                      ? "All advanced modes are active on this account."
                      : entitlements.levelUpActive
                        ? "Rush Mode is unlocked. Pro will add the deeper specialist modes later."
                        : "Use a Level Up Code to unlock Rush Mode. Pro will unlock the full advanced stack."}
                  </p>
                </div>
              </div>
            </div>

            {/* Modes grid */}
            <div className="grid grid-cols-2 gap-2">
              {AI_OPTIONS.map((option) => {
                const IconComponent = option.icon;
                const isSelected = currentMode === option.id;
                const lockType = getModeLockType(entitlements, option.id);
                const isLocked = lockType !== null;
                const badgeLabel = lockType === "level_up" ? "LEVEL UP" : lockType === "premium" ? "PRO" : null;

                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      if (lockType === null) {
                        handleSelectMode(option.id);
                        return;
                      }
                      handleLockedSelect(option.id, lockType);
                    }}
                    className={cn(
                      "relative p-3 rounded-xl border transition-all text-left",
                      isLocked
                        ? "border-slate-100 bg-slate-50/50 cursor-pointer"
                        : isSelected
                          ? "border-indigo-500 bg-indigo-500 text-white shadow-lg shadow-indigo-200"
                          : "border-slate-100 bg-white/50 hover:border-indigo-200 hover:bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center",
                          isSelected ? "bg-white/20" : "bg-slate-100"
                        )}
                      >
                        <IconComponent
                          className={cn("w-3.5 h-3.5", isSelected ? "text-white" : "text-slate-600")}
                          style={!isSelected && !isLocked ? { color: option.color } : {}}
                        />
                      </div>
                      {isSelected && !isLocked && (
                        <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm">
                          <Check className="w-2 h-2 text-indigo-600" />
                        </div>
                      )}
                    </div>
                    <p
                        className={cn(
                          "text-[12px] font-bold tracking-tight",
                          isSelected ? "text-white" : "text-slate-900",
                          isLocked && "text-slate-500"
                        )}
                      >
                        {option.label}
                      </p>
                      {badgeLabel && (
                        <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-500 text-[9px] font-bold rounded uppercase">
                          {badgeLabel}
                        </span>
                      )}
                      {isLocked && (
                        <p className="mt-1 text-[10px] font-medium text-slate-400">
                          {lockType === "level_up" ? "Unlock with a Level Up Code" : "Reserved for Pro and Plus"}
                        </p>
                      )}
                    </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
