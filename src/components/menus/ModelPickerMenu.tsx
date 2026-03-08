"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles, Crown } from "lucide-react";
import { AI_MODELS } from "@/lib/ai-models";
import { cn } from "@/lib/utils";

interface ModelPickerMenuProps {
  visible: boolean;
  onClose: () => void;
  currentModel: string;
  onSelectModel: (modelId: string) => void;
}

export default function ModelPickerMenu({
  visible,
  onClose,
  currentModel,
  onSelectModel,
}: ModelPickerMenuProps) {
  const handleSelect = (modelId: string) => {
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
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />

          {/* Menu */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-20 left-3 right-3 md:left-1/2 md:-translate-x-1/2 md:w-[400px] bg-white rounded-2xl shadow-xl border border-gray-200 z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                Choose a model
              </h3>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Pro message - coming soon */}
            <div className="mx-3 mt-3 p-3 bg-gray-100 border border-gray-200 rounded-xl opacity-60">
              <div className="flex items-start gap-2">
                <Crown className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-gray-500 font-medium">
                    PRO models reserved for subscribers
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Upgrade to a paid plan to access GPT-4, Claude and more.
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

            {/* Models list */}
            <div className="p-2 max-h-[400px] overflow-y-auto">
              {AI_MODELS.map((model) => {
                const isSelected = currentModel === model.id;
                const isPro = model.isPremium;

                return (
                  <button
                    key={model.id}
                    onClick={() => !isPro && handleSelect(model.id)}
                    disabled={isPro}
                    className={cn(
                      "w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left",
                      isPro
                        ? "cursor-not-allowed opacity-50"
                        : isSelected
                          ? "bg-primary/10"
                          : "hover:bg-gray-50"
                    )}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                        isPro
                          ? "bg-gray-200"
                          : model.provider === "google" && "bg-blue-100",
                        !isPro && model.provider === "openai" && "bg-green-100",
                        !isPro && model.provider === "anthropic" && "bg-orange-100"
                      )}
                    >
                      <Sparkles
                        className={cn(
                          "w-5 h-5",
                          isPro
                            ? "text-gray-400"
                            : model.provider === "google" && "text-blue-600",
                          !isPro && model.provider === "openai" && "text-green-600",
                          !isPro && model.provider === "anthropic" && "text-orange-600"
                        )}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-semibold",
                            isPro
                              ? "text-gray-400"
                              : isSelected
                                ? "text-primary"
                                : "text-gray-900"
                          )}
                        >
                          {model.name}
                        </span>
                        {model.isPremium && (
                          <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-bold rounded">
                            SOON
                          </span>
                        )}
                        {model.costPerRequest && !isPro && (
                          <span className="text-xs text-gray-500">
                            {model.costPerRequest} credits
                          </span>
                        )}
                      </div>
                      <p className={cn("text-sm truncate", isPro ? "text-gray-400" : "text-gray-500")}>
                        {model.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {model.features.slice(0, 3).map((feature) => (
                          <span
                            key={feature}
                            className={cn(
                              "px-1.5 py-0.5 text-[10px] rounded",
                              isPro ? "bg-gray-200 text-gray-400" : "bg-gray-100 text-gray-600"
                            )}
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Check */}
                    {isSelected && !isPro && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-white" />
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
