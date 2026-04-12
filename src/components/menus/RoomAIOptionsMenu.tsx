"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, Check, Shield, Zap, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIOption {
  id: "passive" | "active";
  label: string;
  description: string;
  icon: typeof Bot;
  color: string;
}

const ROOM_AI_OPTIONS: AIOption[] = [
  {
    id: "active",
    label: "Active",
    description: "Raya proactively guides and moderates the squad.",
    icon: Bot,
    color: "#4f46e5",
  },
  {
    id: "passive",
    label: "Passive",
    description: "Raya only responds when explicitly mentioned.",
    icon: Zap,
    color: "#64748b",
  },
];

interface RoomAIOptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  currentMode: "passive" | "active";
  onModeChange: (mode: "passive" | "active") => void;
  anchorEl?: HTMLElement | null;
  isCreator: boolean;
  changesRemaining: number;
}

export default function RoomAIOptionsMenu({
  visible,
  onClose,
  currentMode,
  onModeChange,
  anchorEl,
  isCreator,
  changesRemaining,
}: RoomAIOptionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, ready: false });

  useEffect(() => {
    if (!visible || !anchorEl) return;

    const updatePosition = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      const menuWidth = menuRect?.width || 280;
      const menuHeight = menuRect?.height || 360;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 8;
      const margin = 8;

      let left = anchorRect.left;
      left = Math.max(margin, Math.min(left, vw - menuWidth - margin));

      let top = anchorRect.top - menuHeight - gap;
      if (top < margin) top = Math.min(anchorRect.bottom + gap, vh - menuHeight - margin);

      setPosition((prev) => ({ top, left, ready: true }));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [visible, anchorEl]);

  const handleSelectMode = (modeId: "passive" | "active") => {
    if (changesRemaining <= 0 && modeId !== currentMode) return;
    onModeChange(modeId);
    onClose();
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-transparent z-40"
            onClick={onClose}
          />

          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed w-[280px] bg-white/90 backdrop-blur-xl rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-white/40 z-50"
            style={{
              top: position.top,
              left: position.left,
              visibility: position.ready ? "visible" : "hidden",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">AI Behavior</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Shared Session Mode</p>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 space-y-3">
              <div className={cn(
                "p-3 rounded-xl border flex items-start gap-3",
                isCreator ? "bg-amber-50 border-amber-100" : "bg-indigo-50 border-indigo-100"
              )}>
                <Shield className={cn("w-4 h-4 mt-0.5", isCreator ? "text-amber-500" : "text-indigo-500")} />
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-700">
                    {isCreator ? "Room Creator" : "Member Permissions"}
                  </p>
                  <p className="text-xs font-bold text-slate-500 mt-1">
                    {changesRemaining} {changesRemaining === 1 ? 'change' : 'changes'} remaining this session.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3 text-slate-500">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] leading-snug font-medium">
                  Switching modes affects <strong>everyone</strong> in the room immediately. 
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {ROOM_AI_OPTIONS.map((option) => {
                const isSelected = currentMode === option.id;
                const canChange = changesRemaining > 0 || isSelected;

                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelectMode(option.id)}
                    disabled={!canChange}
                    className={cn(
                      "w-full p-3 rounded-xl border transition-all text-left flex items-start gap-3",
                      isSelected
                        ? "bg-indigo-600 border-indigo-700 text-white shadow-lg"
                        : canChange 
                          ? "bg-white border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30" 
                          : "bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      isSelected ? "bg-white/20" : "bg-slate-100"
                    )}>
                      <option.icon className={cn("w-4 h-4", isSelected ? "text-white" : "text-slate-600")} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase tracking-wide leading-none">{option.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <p className={cn("text-[11px] font-medium leading-tight mt-1", isSelected ? "text-indigo-100" : "text-slate-500")}>
                        {option.description}
                      </p>
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
