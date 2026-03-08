"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { NoTranslate } from "@/components/ui/NoTranslate";
import { cn } from "@/lib/utils";

const SCHOOL_LEVELS: { group: string; levels: string[] }[] = [
  {
    group: "Middle school",
    levels: ["6ème / Grade 6", "5ème / Grade 7", "4ème / Grade 8", "3ème / Grade 9"],
  },
  {
    group: "High school",
    levels: ["2nde / Grade 10", "1ère / Grade 11", "Terminale / Grade 12"],
  },
  {
    group: "University",
    levels: ["L1 / 1st year", "L2 / 2nd year", "L3 / 3rd year", "M1 / M2"],
  },
  {
    group: "Other",
    levels: ["Primary school", "Vocational / Technical", "Other"],
  },
];

interface OnboardingModalProps {
  visible: boolean;
  defaultName?: string;
  onComplete: (displayName: string, schoolLevel: string) => void;
}

export default function OnboardingModal({
  visible,
  defaultName = "",
  onComplete,
}: OnboardingModalProps) {
  const [displayName, setDisplayName] = useState(defaultName);
  const [selectedLevel, setSelectedLevel] = useState("");

  const canSubmit = selectedLevel !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    onComplete(displayName.trim() || defaultName, selectedLevel);
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/40"
          />

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", damping: 26, stiffness: 340 }}
            className="fixed z-[80] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-[420px] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-[linear-gradient(135deg,#2563eb_0%,#7c3aed_100%)] px-6 pt-6 pb-5">
              <div className="flex items-center gap-3 mb-1">
                <img src="/raya-logo.jpeg" alt="RAYA" className="w-8 h-8 rounded-lg object-cover" />
                <span className="text-lg font-bold text-white"><NoTranslate>RAYA</NoTranslate></span>
              </div>
              <h3 className="text-base font-bold text-white mt-2">Let's set up your profile</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                RAYA adapts to your curriculum and school level — takes 10 seconds.
              </p>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Your first name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Ange"
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-300 focus:bg-white transition-colors"
                />
              </div>

              {/* School level */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                  Your school level
                </label>
                <div className="space-y-2">
                  {SCHOOL_LEVELS.map((group) => (
                    <div key={group.group}>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                        {group.group}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.levels.map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setSelectedLevel(level)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                              selectedLevel === level
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
                            )}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full h-11 rounded-xl bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                Start with RAYA
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
