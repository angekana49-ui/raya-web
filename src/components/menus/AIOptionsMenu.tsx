"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Brain, Zap, Bot, Sparkles, X, Check, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIOptionId } from "@/types";
import { NoTranslate } from "@/components/ui/NoTranslate";

interface AIOption {
  id: AIOptionId;
  label: string;
  description: string;
  icon: typeof Bot;
  color: string;
  badge?: string;
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
    badge: "PRO",
  },
  {
    id: "deep-thinking",
    label: "Deep",
    description: "Detailed analysis",
    icon: Brain,
    color: "#8b5cf6",
    badge: "PRO",
  },
  {
    id: "creative-mode",
    label: "Creative",
    description: "Original responses",
    icon: Sparkles,
    color: "#ec4899",
    badge: "PRO",
  },
];

interface AIOptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  currentMode: string;
  onModeChange: (mode: string) => void;
  currentModel: string;
  onModelChange: (model: string) => void;
  onOpenModelPicker: () => void;
}

export default function AIOptionsMenu({
  visible,
  onClose,
  currentMode,
  onModeChange,
  currentModel,
  // onOpenModelPicker, // PRO - bientôt disponible
}: AIOptionsMenuProps) {
  const handleSelectMode = (modeId: string) => {
    onModeChange(modeId);
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
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />

          {/* Menu */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-16 left-3 right-3 md:left-auto md:right-auto md:bottom-20 md:w-[380px] bg-white rounded-2xl p-4 shadow-xl border border-gray-200 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">Mode <NoTranslate>RAYA</NoTranslate></h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Pro message - bientôt disponible */}
            <div className="mb-4 p-3 bg-gray-100 border border-gray-200 rounded-xl opacity-60">
              <div className="flex items-start gap-2">
                <Crown className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-500 font-medium">
                    PRO modes reserved for subscribers
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Upgrade to a paid plan to access Fast, Deep and Creative modes.
                  </p>
                  <button
                    disabled
                    className="mt-2 px-3 py-1.5 bg-gray-300 text-gray-500 text-xs font-semibold rounded-lg cursor-not-allowed"
                  >
                    Coming soon
                  </button>
                </div>
              </div>
            </div>

            {/* Modes grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {AI_OPTIONS.map((option) => {
                const IconComponent = option.icon;
                const isSelected = currentMode === option.id;
                const isPro = !!option.badge;

                return (
                  <button
                    key={option.id}
                    onClick={() => !isPro && handleSelectMode(option.id)}
                    disabled={isPro}
                    className={cn(
                      "relative p-3 rounded-xl border-2 transition-all text-left",
                      isPro
                        ? "border-gray-200 bg-gray-100 cursor-not-allowed opacity-50"
                        : isSelected
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 bg-gray-50 hover:border-gray-300"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: isPro ? "#e5e7eb" : `${option.color}15` }}
                      >
                        <IconComponent
                          className="w-4 h-4"
                          style={{ color: isPro ? "#9ca3af" : option.color }}
                        />
                      </div>
                      {isSelected && !isPro && (
                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isPro
                          ? "text-gray-400"
                          : isSelected
                            ? "text-primary"
                            : "text-gray-900"
                      )}
                    >
                      {option.label}
                    </p>
                    {option.badge && (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[9px] font-bold rounded">
                        SOON
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Model selector - PRO (bientôt disponible) */}
            <button
              disabled
              className="w-full flex items-center gap-2 bg-gray-100 rounded-lg p-3 cursor-not-allowed opacity-50"
            >
              <Bot className="w-4 h-4 text-gray-400" />
              <span className="flex-1 text-sm text-gray-400 text-left">
                Model: {getModelName()}
              </span>
              <span className="text-sm text-gray-400 font-medium">Soon</span>
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
