"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, Sparkles, X } from "lucide-react";

type PopupTone = "info" | "success" | "warning" | "error";

export interface SmartPopupAction {
  label: string;
  onClick: () => void;
}

export interface SmartPopupContent {
  open: boolean;
  tone: PopupTone;
  title: string;
  message: string;
  primaryAction?: SmartPopupAction;
  secondaryAction?: SmartPopupAction;
  onClose: () => void;
}

function getToneIcon(tone: PopupTone) {
  switch (tone) {
    case "success":
      return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    case "warning":
      return <Sparkles className="h-5 w-5 text-amber-500" />;
    case "error":
      return <AlertCircle className="h-5 w-5 text-rose-500" />;
    default:
      return <Info className="h-5 w-5 text-sky-500" />;
  }
}

function getToneSurface(tone: PopupTone) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50";
    case "warning":
      return "border-amber-200 bg-amber-50";
    case "error":
      return "border-rose-200 bg-rose-50";
    default:
      return "border-sky-200 bg-sky-50";
  }
}

export default function SmartPopup({
  open,
  tone,
  title,
  message,
  primaryAction,
  secondaryAction,
  onClose,
}: SmartPopupContent) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.96 }}
          className="fixed bottom-6 right-6 z-[95] w-[calc(100vw-2rem)] max-w-sm"
        >
          <div className={`rounded-[24px] border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-sm ${getToneSurface(tone)}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{getToneIcon(tone)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{message}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {(primaryAction || secondaryAction) && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {primaryAction && (
                      <button
                        onClick={primaryAction.onClick}
                        className="rounded-full bg-slate-900 px-3.5 py-2 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-slate-800"
                      >
                        {primaryAction.label}
                      </button>
                    )}
                    {secondaryAction && (
                      <button
                        onClick={secondaryAction.onClick}
                        className="rounded-full bg-white/80 px-3.5 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-white"
                      >
                        {secondaryAction.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
