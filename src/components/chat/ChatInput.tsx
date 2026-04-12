"use client";

import { useRef, useEffect, useState } from "react";
import { Paperclip, Plus, Send, Mic, Zap, Brain, Sparkles, Cpu, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AttachedFile } from "@/types";
import FileAttachment from "./FileAttachment";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onFileButtonPress: () => void;
  onAIOptionsPress?: () => void;
  onVoicePress: () => void;
  files: AttachedFile[];
  onRemoveFile: (fileId: string) => void;
  aiMode?: string;
  selectedModel?: string;
  onModelPress?: () => void;
  disabled?: boolean;
  placeholder?: string;
  onAnchorsChange?: (anchors: {
    fileButton: HTMLButtonElement | null;
    aiButton: HTMLButtonElement | null;
    modelButton: HTMLButtonElement | null;
  }) => void;
}

export default function ChatInput({
  value,
  onChangeText,
  onSend,
  onFileButtonPress,
  onAIOptionsPress,
  onVoicePress,
  onModelPress,
  files,
  onRemoveFile,
  aiMode = "normal",
  selectedModel = "gpt-4o",
  disabled = false,
  placeholder = "Message RAYA...",
  onAnchorsChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const canSend = (value.trim().length > 0 || files.length > 0) && !disabled;

  useEffect(() => {
    onAnchorsChange?.({
      fileButton: fileButtonRef.current,
      aiButton: aiButtonRef.current,
      modelButton: modelButtonRef.current,
    });
  }, [onAnchorsChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChangeText(e.target.value);
  };

  const getModeInfo = () => {
    const modes: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
      "rush-mode": {
        icon: <Zap className="w-4 h-4" />,
        color: "bg-amber-100 text-amber-700 border-amber-200",
        label: "Rush",
      },
      "deep-thinking": {
        icon: <Brain className="w-4 h-4" />,
        color: "bg-indigo-100 text-indigo-700 border-indigo-200",
        label: "Deep",
      },
      "creative-mode": {
        icon: <Sparkles className="w-4 h-4" />,
        color: "bg-emerald-100 text-emerald-700 border-emerald-200",
        label: "Creative",
      },
      "active": {
        icon: <Bot className="w-4 h-4" />,
        color: "bg-indigo-600 text-white border-indigo-700 shadow-sm",
        label: "Active",
      },
      "passive": {
        icon: <Bot className="w-4 h-4" />,
        color: "bg-slate-100 text-slate-600 border-slate-200",
        label: "Passive",
      },
    };
    return modes[aiMode];
  };

  const modeInfo = getModeInfo();

  return (
    <div
      className={cn(
        "relative rounded-[28px] border transition-all duration-500 bg-white/80 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden",
        isFocused
          ? "border-indigo-300 ring-4 ring-indigo-500/5 shadow-[0_20px_50px_-12px_rgba(79,70,229,0.12)]"
          : "border-slate-200 shadow-sm",
        disabled && "opacity-80 grayscale-[0.1]"
      )}
    >
      {/* Attached files */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pt-4 overflow-hidden border-b border-slate-100/50"
          >
            <FileAttachment
              files={files}
              onAddFile={onFileButtonPress}
              onRemoveFile={onRemoveFile}
              disabled={disabled}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-Level Input */}
      <div className="flex flex-col">
        {/* Level 1: Text Area (Dynamic but starts at 56px) */}
        <div className="px-5 flex items-center min-h-[56px]">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full resize-none bg-transparent text-[16px] sm:text-[17px] text-slate-800 placeholder:text-slate-400/80 outline-none py-4 leading-tight min-h-[56px] max-h-[180px]"
          />
        </div>

        {/* Level 2: Action Toolbar (Fixed 56px) */}
        <div className="flex items-center justify-between px-3 h-[56px] border-t border-slate-100 bg-slate-50/40">
          <div className="flex items-center gap-1">
            <motion.button
              ref={fileButtonRef}
              whileTap={{ scale: 0.92 }}
              onClick={onFileButtonPress}
              disabled={disabled}
              className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-white text-slate-500 transition-colors disabled:opacity-30"
              title="Attach files"
            >
              <Plus className="w-5 h-5" />
            </motion.button>

            {onAIOptionsPress && (
              <motion.button
                ref={aiButtonRef}
                whileTap={{ scale: 0.92 }}
                onClick={onAIOptionsPress}
                disabled={disabled}
                className={cn(
                  "h-10 px-2 sm:px-3 flex items-center gap-2 rounded-2xl transition-all disabled:opacity-30 border border-transparent shadow-sm",
                  modeInfo ? modeInfo.color : "bg-white border-slate-200/50 hover:bg-white text-slate-600"
                )}
                title="AI Mode"
              >
                {modeInfo ? (
                  <>
                    {modeInfo.icon}
                    <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider">{modeInfo.label}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider">Mode</span>
                  </>
                )}
              </motion.button>
            )}

            {onModelPress && (
              <motion.button
                ref={modelButtonRef}
                whileTap={{ scale: 0.92 }}
                onClick={onModelPress}
                disabled={disabled}
                className="h-10 px-2 sm:px-3 flex items-center gap-2 rounded-2xl bg-white border border-slate-200/50 hover:bg-slate-50 text-slate-600 transition-all shadow-sm disabled:opacity-30"
                title="Change Model"
              >
                <Cpu className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider">
                  {selectedModel?.replace('gpt-4o', 'GPT-4o').replace('claude', 'Claude') || "Model"}
                </span>
              </motion.button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onVoicePress}
              disabled={disabled}
              className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-white text-slate-500 transition-colors disabled:opacity-30"
              title="Voice message"
            >
              <Mic className="w-5 h-5" />
            </motion.button>

            <motion.button
              whileHover={canSend ? { scale: 1.02 } : {}}
              whileTap={canSend ? { scale: 0.95 } : {}}
              onClick={onSend}
              disabled={!canSend}
              className={cn(
                "h-10 px-5 flex items-center gap-2 rounded-2xl transition-all shadow-md active:shadow-sm font-bold text-sm",
                canSend
                  ? "bg-slate-900 text-white shadow-slate-200"
                  : "bg-slate-100 text-slate-300 shadow-transparent"
              )}
            >
              <span>Send</span>
              <Send className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
