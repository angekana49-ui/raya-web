"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Bot } from "lucide-react";
import { AI_MODELS } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { isModelUnlocked, type UserEntitlements } from "@/lib/user-entitlements";

interface ModelPickerMenuProps {
  visible: boolean;
  onClose: () => void;
  currentModel: string;
  onSelectModel: (modelId: string) => void;
  entitlements: UserEntitlements;
  anchorEl?: HTMLElement | null;
  onLockedModelSelect?: (modelId: string) => void;
  changesRemaining: number;
}

export default function ModelPickerMenu({
  visible,
  onClose,
  currentModel,
  onSelectModel,
  entitlements,
  anchorEl,
  onLockedModelSelect,
  changesRemaining,
}: ModelPickerMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });

  useEffect(() => {
    if (!visible || !anchorEl) return;

    const updatePosition = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width || 320; 
      const menuHeight = menuRect?.height || 400; 
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 8;
      const margin = 8;

      let left = anchorRect.left;
      left = Math.max(margin, Math.min(left, vw - menuWidth - margin));

      let top = anchorRect.top - menuHeight - gap;
      if (top < margin) {
        top = Math.min(anchorRect.bottom + gap, vh - menuHeight - margin);
      }

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

  const handleSelect = (modelId: string) => {
    if (changesRemaining <= 0 && modelId !== currentModel) return;
    onSelectModel(modelId);
    onClose();
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
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">AI Models</h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Models list */}
            <div className="space-y-1">
              {AI_MODELS.map((model) => {
                const isSelected = currentModel === model.id;
                const isLocked = !isModelUnlocked(entitlements, model.id);

                return (
                  <button
                    key={model.id}
                    onClick={() => {
                      if (isLocked) {
                        onLockedModelSelect?.(model.id);
                        onClose();
                        return;
                      }
                      handleSelect(model.id);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-2 rounded-xl border transition-all text-left",
                      isLocked || (changesRemaining <= 0 && !isSelected)
                        ? "cursor-not-allowed opacity-50 bg-slate-50/60"
                        : isSelected
                          ? "border-indigo-500 bg-indigo-500 text-white shadow-md shadow-indigo-100"
                          : "border-transparent bg-transparent hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                          isSelected
                            ? "bg-white/20"
                          : isLocked
                            ? "bg-slate-100"
                            : "bg-indigo-50"
                        )}
                      >
                        <Bot
                          className={cn(
                            "w-3 h-3",
                            isSelected
                              ? "text-white"
                            : isLocked
                              ? "text-slate-400"
                              : "text-indigo-500"
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className={cn(
                          "text-[12px] font-bold leading-none truncate",
                          isSelected ? "text-white" : "text-slate-900"
                        )}>
                          {model.name.replace('Gemini', 'Gem.').replace('Claude', 'Cl.')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isLocked && (
                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-500 text-[8px] font-black rounded uppercase tracking-tighter">
                          PRO
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
