"use client";

import { useState, useRef, useCallback } from "react";
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
  placeholder = "Message RAYA...", // Note: placeholder is not translated by Google Translate
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = (value.trim().length > 0 || files.length > 0) && !disabled;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        onSend();
      }
    }
  };

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChangeText(e.target.value);
    adjustHeight();
  };

  const getModeIcon = () => {
    const modes: Record<string, { icon: React.ReactNode; color: string }> = {
      "rush-mode": {
        icon: <Zap className="w-4 h-4" />,
        color: "bg-amber-100 text-amber-700"
      },
      "deep-thinking": {
        icon: <Brain className="w-4 h-4" />,
        color: "bg-purple-100 text-purple-700"
      },
      "creative-mode": {
        icon: <Sparkles className="w-4 h-4" />,
        color: "bg-pink-100 text-pink-700"
      },
    };
    return modes[aiMode];
  };

  const modeInfo = getModeIcon();

  return (
    <div className="bg-white border-t border-gray-200">
      {/* Fichiers attachés */}
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

      {/* Barre input */}
      <div className="flex items-end gap-2 px-3 py-2">
        {/* Bouton fichier */}
        <button
          onClick={onFileButtonPress}
          disabled={disabled}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <Paperclip className="w-5 h-5 text-gray-500" />
        </button>

        {/* Bouton options IA */}
        <button
          onClick={onAIOptionsPress}
          disabled={disabled}
          className={cn(
            "h-10 px-3 flex items-center justify-center rounded-full transition-colors disabled:opacity-50",
            modeInfo ? modeInfo.color : "bg-gray-100 hover:bg-gray-200"
          )}
        >
          {modeInfo ? (
            modeInfo.icon
          ) : (
            <Plus className="w-5 h-5 text-gray-600" />
          )}
        </button>

        {/* Input */}
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

        {/* Bouton send/voice */}
        <button
          onClick={canSend ? onSend : onVoicePress}
          disabled={disabled}
          className={cn(
            "w-10 h-10 flex items-center justify-center rounded-full transition-all disabled:opacity-50",
            canSend
              ? "bg-primary hover:bg-primary/90 text-white"
              : "bg-gray-100 hover:bg-gray-200 text-gray-500"
          )}
        >
          {canSend ? (
            <Send className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
