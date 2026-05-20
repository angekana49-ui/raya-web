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
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed w-[200px] bg-white/90 backdrop-blur-xl rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/40 z-50 overflow-hidden"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.ready ? "visible" : "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2 px-1 pt-0.5">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">AI Modes</h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Modes list (Compact single column) */}
            <div className="space-y-1">
              {AI_OPTIONS.map((option) => {
                const IconComponent = option.icon;
                const isSelected = currentMode === option.id;
                const lockType = getModeLockType(entitlements, option.id);
                const isLocked = lockType !== null;
                const badgeLabel = lockType === "level_up" ? "L.UP" : lockType === "premium" ? "PRO" : null;

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
                      "w-full flex items-center justify-between p-2 rounded-xl border transition-all text-left",
                      isLocked
                        ? "border-slate-50 bg-slate-50/30 cursor-pointer opacity-60"
                        : isSelected
                          ? "border-indigo-500 bg-indigo-500 text-white shadow-md shadow-indigo-100"
                          : "border-transparent bg-transparent hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                          isSelected ? "bg-white/20" : "bg-slate-100"
                        )}
                      >
                        <IconComponent
                          className={cn("w-3 h-3", isSelected ? "text-white" : "text-slate-600")}
                          style={!isSelected && !isLocked ? { color: option.color } : {}}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className={cn(
                          "text-[12px] font-bold leading-none truncate",
                          isSelected ? "text-white" : "text-slate-900"
                        )}>
                          {option.label}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {badgeLabel && (
                        <span className={cn(
                          "px-1.5 py-0.5 text-[8px] font-black rounded uppercase tracking-tighter",
                          isSelected ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-500"
                        )}>
                          {badgeLabel}
                        </span>
                      )}
                      {isSelected && !isLocked && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
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
