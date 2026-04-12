"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles, Crown, Shield, Info } from "lucide-react";
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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed w-[280px] md:w-[320px] max-w-[calc(100vw-16px)] bg-white/80 backdrop-blur-xl rounded-2xl p-0 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/40 z-50 overflow-hidden"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.ready ? "visible" : "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100/50">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                AI Models
              </h3>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Governance Info */}
            <div className="mx-3 mt-3 space-y-2">
              <div className="p-3 bg-amber-50 border border-amber-100/50 rounded-xl flex items-start gap-3">
                <Shield className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-700">Governance</p>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                    {changesRemaining} {changesRemaining === 1 ? 'change' : 'changes'} remaining.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/30 border border-indigo-100/30 rounded-xl flex items-start gap-3 text-slate-500">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] leading-tight font-medium">
                  Changing the model affects the <strong>entire squad's</strong> AI host immediately.
                </p>
              </div>
            </div>

            {/* Models list */}
            <div className="p-2 max-h-[380px] overflow-y-auto custom-scrollbar">
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
                      "w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left mb-1 last:mb-0",
                      isLocked || (changesRemaining <= 0 && !isSelected)
                        ? "cursor-not-allowed opacity-50 bg-slate-50/60"
                        : isSelected
                          ? "bg-indigo-500 text-white shadow-lg shadow-indigo-100"
                          : "hover:bg-slate-50"
                    )}
                  >
                    {/* Icon */}
                    <div
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                          isSelected
                            ? "bg-white/20"
                          : isLocked
                            ? "bg-slate-100"
                            : model.provider === "google" ? "bg-blue-50" :
                              model.provider === "openai" ? "bg-emerald-50" : "bg-orange-50"
                      )}
                    >
                      <Sparkles
                          className={cn(
                            "w-4 h-4",
                            isSelected
                              ? "text-white"
                            : isLocked
                              ? "text-slate-400"
                              : model.provider === "google" ? "text-blue-500" :
                                model.provider === "openai" ? "text-emerald-500" : "text-orange-500"
                        )}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-bold tracking-tight",
                            isSelected ? "text-white" : "text-slate-900"
                          )}
                        >
                          {model.name}
                        </span>
                        {isLocked && (
                          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-500 text-[9px] font-bold rounded uppercase">
                            PRO
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        "text-[11px] truncate mt-0.5",
                        isSelected ? "text-white/80" : "text-slate-500"
                      )}>
                        {model.description}
                      </p>
                      {isLocked && (
                        <p className="mt-1 text-[10px] font-medium text-slate-400">
                          Unlocks with Pro or Plus.
                        </p>
                      )}
                    </div>

                    {/* Check */}
                    {isSelected && !isLocked && (
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center flex-shrink-0 self-center">
                        <Check className="w-3 h-3 text-indigo-600" />
                      </div>
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
