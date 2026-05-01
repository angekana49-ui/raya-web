"use client";

import { motion } from "framer-motion";
import { Bot, FileText, Sparkles, Trophy } from "lucide-react";
import type { AttachedFile } from "@/types";
import { resolveAttachedFileUrl } from "@/lib/attached-files";

type RoomEvent = {
  id: string;
  type: "system" | "ai" | "user" | "reward";
  title: string;
  body: string;
  meta?: string;
  accent?: string;
  files?: AttachedFile[];
};

interface RoomMessageBubbleProps {
  event: RoomEvent;
  index: number;
}

export default function RoomMessageBubble({ event, index }: RoomMessageBubbleProps) {
  const isAi = event.type === "ai";
  const isReward = event.type === "reward";
  const isSystem = event.type === "system";
  const isOwnMessage = event.type === "user" && event.title === "You";
  const isInlineEvent = isSystem || isReward;

  const openAttachedFile = (file: AttachedFile) => {
    const fileUrl = resolveAttachedFileUrl(file);
    if (!fileUrl || typeof window === "undefined") return;
    window.open(fileUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index === 0 ? 0.02 : 0 }}
      className={isInlineEvent ? "flex justify-center" : isOwnMessage ? "flex justify-end" : "flex justify-start"}
    >
      {isInlineEvent ? (
        <div
          className={[
            "max-w-[86%] rounded-full border px-4 py-2 text-center shadow-sm",
            isReward
              ? "border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#fffbeb_100%)]"
              : "border-slate-200 bg-slate-50/90",
          ].join(" ")}
        >
          <div className="flex items-center justify-center gap-2">
            {isReward ? (
              <Trophy className="h-4 w-4 text-amber-600" />
            ) : (
              <Sparkles className="h-4 w-4 text-slate-500" />
            )}
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{event.title}</p>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{event.body}</p>
        </div>
      ) : (
        <div className={`flex max-w-[86%] items-end gap-2 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
          {!isOwnMessage && (
            <div
              className={[
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                isAi ? "bg-indigo-100 text-indigo-600" : "text-white",
              ].join(" ")}
              style={!isAi ? { background: event.accent ?? "#2563eb" } : undefined}
            >
              {isAi ? <Bot className="h-4 w-4" /> : event.title.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div
            className={[
              "rounded-[22px] px-4 py-3 shadow-sm",
              isOwnMessage
                ? "bg-[linear-gradient(135deg,#2563eb_0%,#4f46e5_100%)] text-white"
                : isAi
                ? "border border-indigo-200 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_100%)] text-slate-900"
                : "border border-slate-200 bg-white text-slate-900",
            ].join(" ")}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className={`text-xs font-black ${isOwnMessage ? "text-white/85" : "text-slate-700"}`}>
                {event.title}
              </p>
              {event.meta && (
                <span className={`text-[10px] font-bold uppercase tracking-wide ${isOwnMessage ? "text-white/70" : "text-slate-400"}`}>
                  {event.meta}
                </span>
              )}
            </div>
            <p className={`text-sm leading-relaxed ${isOwnMessage ? "text-white" : "text-slate-700"}`}>
              {event.body || (isAi ? (
                <span className="flex gap-1 py-1">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                </span>
              ) : "")}
            </p>
            {event.files && event.files.length > 0 && (
              <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
                {event.files.map((file, idx) => (
                  <button
                    type="button"
                    key={idx} 
                    onClick={() => openAttachedFile(file)}
                    className={`rounded-2xl border px-3 py-2 text-left text-[10px] font-bold ${
                      isOwnMessage ? "border-white/20 bg-white/10 text-white" : "border-slate-100 bg-slate-50 text-slate-600"
                    }`}
                    disabled={!resolveAttachedFileUrl(file)}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="max-w-[220px] truncate">{file.name}</div>
                        <div className={`mt-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                          isOwnMessage ? "text-white/65" : "text-slate-400"
                        }`}>
                          Tap to open
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
