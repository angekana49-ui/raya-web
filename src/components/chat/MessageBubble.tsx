"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, File, Image as ImageIcon, ChevronDown, ChevronLeft, ChevronRight, X, ExternalLink, Edit2, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import type { Message, AttachedFile } from "@/types";
import { formatTime } from "@/lib/utils";

// ─── Markdown + LaTeX component map ──────────────────────────────────────────
const PROSE: Components = {
  // Headings
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-gray-900 mt-5 mb-2 first:mt-0 border-b border-slate-100 pb-1">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-gray-800 mt-3 mb-1 first:mt-0">{children}</h3>
  ),
  // Paragraph
  p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-[1.7]">{children}</p>,
  // Emphasis
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
  // Lists
  ul: ({ children }) => (
    <ul className="mb-2.5 space-y-1 pl-5 list-disc marker:text-primary/60">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2.5 space-y-1 pl-5 list-decimal marker:text-gray-500">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.65] pl-0.5">{children}</li>,
  // Code
  code: ({ className, children }) => {
    const isBlock = !!className;
    if (isBlock) {
      return <code className={`${className} font-mono text-sm`}>{children}</code>;
    }
    return (
      <code className="bg-slate-100 text-slate-800 border border-slate-200 rounded-md px-1.5 py-0.5 text-[0.82em] font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-slate-900 text-slate-100 rounded-xl px-4 py-3.5 my-3 overflow-x-auto text-sm font-mono leading-relaxed">
      {children}
    </pre>
  ),
  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-primary/50 pl-4 my-3 text-gray-600 italic bg-primary/[0.03] rounded-r-lg py-1">
      {children}
    </blockquote>
  ),
  // Tables
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-xl border border-slate-200 shadow-sm">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 border-b border-slate-200">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-slate-700 text-xs uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 border-b border-slate-100 text-gray-700">{children}</td>
  ),
  tr: ({ children }) => <tr className="even:bg-slate-50/50">{children}</tr>,
  // Horizontal rule
  hr: () => <hr className="border-slate-200 my-4" />,
  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/75 transition-colors"
    >
      {children}
    </a>
  ),
};

interface MessageBubbleProps {
  message: Message;
  /** True while the AI is still streaming this message — renders plain text to avoid KaTeX overhead */
  isStreaming?: boolean;
  onEdit?: (messageId: string, newText: string) => void;
  // Branching props
  siblingCount?: number;
  siblingIndex?: number;
  onNavigateBranch?: (direction: 'prev' | 'next') => void;
}

function InfinityRailThinkingIcon() {
  return (
    <svg
      viewBox="0 0 120 60"
      className="w-6 h-4 text-primary"
      aria-hidden="true"
    >
      <path
        id="thinking-infinity-path"
        d="M 10 30
           C 10 12, 38 12, 60 30
           C 82 48, 110 48, 110 30
           C 110 12, 82 12, 60 30
           C 38 48, 10 48, 10 30"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.25"
      />
      <circle r="4" fill="currentColor">
        <animateMotion dur="1.6s" repeatCount="indefinite" rotate="auto">
          <mpath href="#thinking-infinity-path" />
        </animateMotion>
      </circle>
      <circle r="2.5" fill="currentColor" opacity="0.6">
        <animateMotion dur="1.6s" begin="0.8s" repeatCount="indefinite" rotate="auto">
          <mpath href="#thinking-infinity-path" />
        </animateMotion>
      </circle>
    </svg>
  );
}

function AttachedFileDisplay({
  file,
  onPreview,
}: {
  file: AttachedFile;
  onPreview?: (file: AttachedFile) => void;
}) {
  const ext = file.name.split(".").pop()?.toUpperCase() || "FILE";

  const getIcon = () => {
    switch (file.type) {
      case "image":
        return <ImageIcon className="w-4 h-4 text-primary" />;
      case "pdf":
        return <FileText className="w-4 h-4 text-red-500" />;
      case "document":
        return <FileText className="w-4 h-4 text-primary" />;
      default:
        return <File className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <button
      type="button"
      onClick={() => onPreview?.(file)}
      className="w-[188px] flex-shrink-0 text-left rounded-xl border border-white/25 bg-white/12 px-2.5 py-2 hover:bg-white/20 transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-white/85 flex items-center justify-center">
          {getIcon()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white truncate">{file.name}</p>
          <p className="text-[10px] text-white/70 mt-0.5">
            {file.type.toUpperCase()} - {ext}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function MessageBubble({ 
  message, 
  isStreaming = false,
  onEdit,
  siblingCount = 1,
  siblingIndex = 0,
  onNavigateBranch,
}: MessageBubbleProps) {
  const isUser = message.sender === "user";
  const [previewFile, setPreviewFile] = useState<AttachedFile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.text);
  const editContainerRef = useRef<HTMLDivElement>(null);

  // Cancel edit when clicking outside the edit area
  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (editContainerRef.current && !editContainerRef.current.contains(e.target as Node)) {
        setIsEditing(false);
        setEditValue(message.text);
      }
    };
    // Small delay to avoid the click that opened the editor from immediately closing it
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing, message.text]);

  // Auto-cancel edit when the AI starts streaming (user sent another message)
  useEffect(() => {
    if (isStreaming && isEditing) {
      setIsEditing(false);
      setEditValue(message.text);
    }
  }, [isStreaming]);

  const handleSaveEdit = () => {
    if (editValue.trim() && editValue !== message.text && onEdit) {
      onEdit(message.id, editValue.trim());
    }
    setIsEditing(false);
  };

  // User message: right-side bubble.
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-5 ml-auto max-w-[85%] sm:max-w-[75%] md:max-w-[70%] lg:max-w-[620px] group relative"
      >
        <div translate="no" className="notranslate msg-body px-4 py-3 rounded-[20px] bg-[linear-gradient(145deg,var(--primary),var(--primary-dark))] text-white rounded-br-md shadow-[0_8px_24px_rgba(90,108,255,0.25)]">
          {!isEditing && onEdit && (
            <button
              onClick={() => {
                setEditValue(message.text);
                setIsEditing(true);
              }}
              className="sm:absolute sm:-left-10 sm:top-2 sm:p-2 p-1.5 rounded-full text-white/60 sm:text-slate-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-white/10 sm:hover:bg-slate-100 sm:hover:text-slate-600 float-right ml-2 -mt-1 sm:float-none sm:ml-0 sm:mt-0"
              title="Edit message"
            >
              <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}

          {message.files && message.files.length > 0 && (
            <div className="mb-2 -mx-1 px-1 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
              {message.files.map((file) => (
                <AttachedFileDisplay key={file.id} file={file} onPreview={setPreviewFile} />
              ))}
              </div>
            </div>
          )}

          {isEditing ? (
            <div ref={editContainerRef} className="flex flex-col gap-2 mt-1">
              <textarea
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  } else if (e.key === 'Escape') {
                    setIsEditing(false);
                    setEditValue(message.text);
                  }
                }}
                className="w-full bg-white/10 border border-white/20 rounded-lg p-2 sm:p-2 text-sm sm:text-base text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 resize-none min-h-[60px] sm:min-h-[80px]"
                rows={3}
              />
              <div className="flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditValue(message.text);
                  }}
                  className="px-3 py-2 sm:py-1.5 text-xs sm:text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={!editValue.trim() || editValue === message.text}
                  className="px-3 py-2 sm:py-1.5 text-xs sm:text-xs font-medium rounded-lg bg-white text-primary hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Save &</span> Submit
                </button>
              </div>
            </div>
          ) : (
            <p className="chat-text text-base whitespace-pre-wrap">{message.text}</p>
          )}

          {siblingCount > 1 && !isEditing && (
            <div className="flex items-center justify-end gap-1.5 sm:gap-2 mt-2 pt-2 border-t border-white/10">
              <span className="text-[10px] sm:text-[11px] text-white/60 font-medium">
                {siblingIndex + 1} / {siblingCount}
              </span>
              <div className="flex gap-0.5">
                <button
                  disabled={siblingIndex === 0}
                  onClick={() => onNavigateBranch?.('prev')}
                  className="p-1.5 sm:p-1 rounded bg-white/5 hover:bg-white/20 active:bg-white/30 disabled:opacity-30 transition-colors"
                  title="Previous branch"
                >
                  <ChevronLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white/80" />
                </button>
                <button
                  disabled={siblingIndex === siblingCount - 1}
                  onClick={() => onNavigateBranch?.('next')}
                  className="p-1.5 sm:p-1 rounded bg-white/5 hover:bg-white/20 active:bg-white/30 disabled:opacity-30 transition-colors"
                  title="Next branch"
                >
                  <ChevronRight className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white/80" />
                </button>
              </div>
            </div>
          )}

          {message.timestamp && !isEditing && (
            <p className="text-xs mt-1 text-white/70">{formatTime(message.timestamp)}</p>
          )}
        </div>

        <AnimatePresence>
          {previewFile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-black/55 flex items-center justify-center p-4"
              onClick={() => setPreviewFile(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                className="w-full max-w-3xl max-h-[86vh] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    {previewFile.type === "image" ? (
                      <ImageIcon className="w-4 h-4 text-primary" />
                    ) : (
                      <FileText className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{previewFile.name}</p>
                    <p className="text-xs text-slate-500 uppercase">
                      {previewFile.type} - {previewFile.name.split(".").pop() || "file"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open(previewFile.url, "_blank", "noopener,noreferrer")}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFile(null)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-slate-50 max-h-[70vh] overflow-auto flex items-center justify-center p-3">
                  {previewFile.type === "image" ? (
                    <img
                      src={previewFile.url}
                      alt={previewFile.name}
                      className="max-w-full max-h-[68vh] object-contain rounded-xl"
                    />
                  ) : previewFile.type === "pdf" ? (
                    <iframe
                      src={previewFile.url}
                      title={previewFile.name}
                      className="w-full h-[68vh] rounded-xl border border-slate-200 bg-white"
                    />
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-sm text-slate-600">
                        Preview is limited for this format in-app.
                      </p>
                      <button
                        type="button"
                        onClick={() => window.open(previewFile.url, "_blank", "noopener,noreferrer")}
                        className="mt-3 inline-flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open file
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // Assistant message: plain text while streaming, full Markdown + LaTeX once complete.
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mb-5 w-full"
    >
      <div translate="no" className="notranslate msg-body text-gray-900 max-w-[760px]">
        <div className="chat-text text-base">
          {isStreaming ? (
            // Fast plain-text during stream — no KaTeX/markdown parse overhead
            <p className="whitespace-pre-wrap leading-[1.7]">{message.text}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
              components={PROSE}
            >
              {message.text}
            </ReactMarkdown>
          )}
        </div>

        {siblingCount > 1 && (
            <div className="flex items-center justify-start gap-1.5 sm:gap-2 mt-2 pt-1">
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                {siblingIndex + 1} / {siblingCount}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={siblingIndex === 0}
                  onClick={() => onNavigateBranch?.('prev')}
                  className="p-1.5 sm:p-1 rounded hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 transition-colors"
                  title="Previous branch"
                >
                  <ChevronLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-400" />
                </button>
                <button
                  disabled={siblingIndex === siblingCount - 1}
                  onClick={() => onNavigateBranch?.('next')}
                  className="p-1.5 sm:p-1 rounded hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 transition-colors"
                  title="Next branch"
                >
                  <ChevronRight className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          )}

        {message.timestamp && (
          <p className="text-xs mt-2 text-gray-400">{formatTime(message.timestamp)}</p>
        )}
      </div>
    </motion.div>
  );
}

export function TypingIndicator() {
  const steps = ["Analyzing your request", "Planning the response", "Generating answer"];
  const [stepIndex, setStepIndex] = useState(0);
  const [showReasoning, setShowReasoning] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % steps.length);
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-3 w-full">
      <div className="max-w-[760px] rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <InfinityRailThinkingIcon />
          <span>{steps[stepIndex]}</span>
        </div>

        <button
          onClick={() => setShowReasoning((prev) => !prev)}
          className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ChevronDown
            className={`w-3 h-3 transition-transform ${showReasoning ? "rotate-180" : ""}`}
          />
          {showReasoning ? "Hide reasoning steps" : "Show reasoning steps"}
        </button>

        {showReasoning && (
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    index <= stepIndex ? "bg-primary" : "bg-slate-300"
                  }`}
                />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}
