"use client";

import { useRef, useEffect } from "react";
import { Paperclip, Plus, Send, Mic, Zap, Brain, Sparkles } from "lucide-react";
import type { AttachedFile } from "@/types";
import FileAttachment from "./FileAttachment";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onFileButtonPress: () => void;
  onAIOptionsPress: () => void;
  onVoicePress: () => void;
  files: AttachedFile[];
  onRemoveFile: (fileId: string) => void;
  aiMode?: string;
  disabled?: boolean;
  placeholder?: string;
  onAnchorsChange?: (anchors: {
    fileButton: HTMLButtonElement | null;
    aiButton: HTMLButtonElement | null;
  }) => void;
}

export default function ChatInput({
  value,
  onChangeText,
  onSend,
  onFileButtonPress,
  onAIOptionsPress,
  onVoicePress,
  files,
  onRemoveFile,
  aiMode = "normal",
  disabled = false,
  placeholder = "Message RAYA...", // Keep fixed to avoid auto-translation drift.
  onAnchorsChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const canSend = (value.trim().length > 0 || files.length > 0) && !disabled;

  useEffect(() => {
    onAnchorsChange?.({
      fileButton: fileButtonRef.current,
      aiButton: aiButtonRef.current,
    });
  }, [onAnchorsChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  // Auto-resize whenever value changes (typing, programmatic fill, reset after send)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChangeText(e.target.value);
  };

  const getModeIcon = () => {
    const modes: Record<string, { icon: React.ReactNode; color: string }> = {
      "rush-mode": {
        icon: <Zap className="w-4 h-4" />,
        color: "bg-amber-100 text-amber-700",
      },
      "deep-thinking": {
        icon: <Brain className="w-4 h-4" />,
        color: "bg-cyan-100 text-cyan-700",
      },
      "creative-mode": {
        icon: <Sparkles className="w-4 h-4" />,
        color: "bg-emerald-100 text-emerald-700",
      },
    };
    return modes[aiMode];
  };

  const modeInfo = getModeIcon();

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-[0_10px_28px_rgba(15,23,42,0.09)]">
      {/* Attached files */}
      {files.length > 0 && (
        <div className="px-3 pt-2">
          <FileAttachment
            files={files}
            onAddFile={onFileButtonPress}
            onRemoveFile={onRemoveFile}
            disabled={disabled}
          />
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* File button */}
        <button
          ref={fileButtonRef}
          onClick={onFileButtonPress}
          disabled={disabled}
          aria-label="Attach a file"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <Paperclip className="w-5 h-5 text-gray-500" />
        </button>

        {/* AI options button */}
        <button
          ref={aiButtonRef}
          onClick={onAIOptionsPress}
          disabled={disabled}
          aria-label="Open AI options"
          className={cn(
            "h-10 px-3 flex items-center justify-center rounded-full transition-colors disabled:opacity-50",
            modeInfo ? modeInfo.color : "bg-gray-100 hover:bg-gray-200"
          )}
        >
          {modeInfo ? modeInfo.icon : <Plus className="w-5 h-5 text-gray-600" />}
        </button>

        {/* Message input */}
        <div className="flex-1 bg-gray-50 border border-gray-200 rounded-[20px] px-4 py-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full resize-none bg-transparent text-base text-gray-900 placeholder-gray-400 outline-none min-h-[24px] max-h-[120px]"
          />
        </div>

        {/* Send/voice button */}
        <button
          onClick={canSend ? onSend : onVoicePress}
          disabled={disabled}
          aria-label={canSend ? "Send message" : "Record voice"}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-full transition-all disabled:opacity-50",
            canSend
              ? "bg-primary hover:bg-primary/90 text-white"
              : "bg-gray-100 hover:bg-gray-200 text-gray-500"
          )}
        >
          {canSend ? <Send className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
