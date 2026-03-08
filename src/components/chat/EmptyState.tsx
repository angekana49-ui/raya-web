"use client";

import {
  BookOpen,
  MessageSquare,
  Lightbulb,
  NotebookPen,
  ClipboardList,
  FileText,
} from "lucide-react";

interface EmptyStateProps {
  onSuggestionPress: (prompt: string) => void;
  onMorePromptsPress: () => void;
}

const QUICK_SUGGESTIONS = [
  {
    id: "1",
    icon: Lightbulb,
    title: "Explain a concept",
    description: "Simple and clear",
    prompt: "Let's start a new topic. Explain it simply, then ask me one check question.",
  },
  {
    id: "2",
    icon: NotebookPen,
    title: "Homework help",
    description: "Step-by-step guidance",
    prompt: "Help me solve this exercise. Guide me with hints, don't give the full answer at once.",
  },
  {
    id: "3",
    icon: ClipboardList,
    title: "Generate a quiz",
    description: "Quick self-test",
    prompt: "Create a short quiz on this topic and adapt difficulty to my level.",
  },
  {
    id: "4",
    icon: FileText,
    title: "Summarize a lesson",
    description: "Core ideas only",
    prompt: "Summarize this lesson with key points, common mistakes, and one practice exercise.",
  },
];

export default function EmptyState({
  onSuggestionPress,
  onMorePromptsPress,
}: EmptyStateProps) {
  return (
    <div className="px-5 py-8 sm:px-6 flex flex-col items-center">
      <div className="flex flex-col items-center mb-8 text-center">
        <img
          src="/raya-logo.jpeg"
          alt="RAYA"
          className="w-16 h-16 rounded-2xl object-cover mb-4 shadow-md"
        />

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Start a conversation
        </h1>

        <p className="text-sm sm:text-base text-gray-600 max-w-md">
          Pick a prompt or ask your question directly. RAYA adapts to your
          level as you interact.
        </p>
      </div>

      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {QUICK_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => onSuggestionPress(suggestion.prompt)}
            className="bg-white/90 border border-slate-200 rounded-2xl p-4 text-left hover:border-primary hover:bg-primary/5 transition-all duration-200 shadow-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <suggestion.icon className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-0.5">
              {suggestion.title}
            </h3>
            <p className="text-xs text-gray-600">{suggestion.description}</p>
          </button>
        ))}
      </div>

      <button
        onClick={onMorePromptsPress}
        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-colors mb-6 shadow-sm"
      >
        <img
          src="/raya-logo.jpeg"
          alt=""
          className="w-4 h-4 rounded-full object-cover"
        />
        <span className="text-base text-primary font-semibold">
          Open prompt library
        </span>
      </button>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm text-gray-500">
            Math - French - English - Science
          </span>
        </div>

        <div className="flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm text-gray-500">
            Supports images, PDFs and documents
          </span>
        </div>
      </div>
    </div>
  );
}
