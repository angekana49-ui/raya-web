"use client";

import { BookOpen, MessageSquare } from "lucide-react";

interface EmptyStateProps {
  onSuggestionPress: (prompt: string) => void;
  onMorePromptsPress: () => void;
}

const QUICK_SUGGESTIONS = [
  {
    id: "1",
    icon: "💡",
    title: "Explain a concept",
    description: "Understand simply",
    prompt: "Explain this concept to me",
  },
  {
    id: "2",
    icon: "✍️",
    title: "Homework help",
    description: "Solve an exercise",
    prompt: "Help me with this exercise",
  },
  {
    id: "3",
    icon: "📝",
    title: "Generate a quiz",
    description: "Test my knowledge",
    prompt: "Create a quiz on this topic",
  },
  {
    id: "4",
    icon: "📚",
    title: "Summarize a lesson",
    description: "Key points",
    prompt: "Summarize this lesson for me",
  },
];

export default function EmptyState({ onSuggestionPress, onMorePromptsPress }: EmptyStateProps) {
  return (
    <div className="px-6 py-8 flex flex-col items-center">
      {/* Hero section */}
      <div className="flex flex-col items-center mb-8">
        <img
          src="/raya-logo.jpeg"
          alt="RAYA"
          className="w-16 h-16 rounded-full object-cover mb-4"
        />

        <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">
          Start a conversation
        </h1>

        <p className="text-base text-gray-500 text-center">
          Choose a prompt or ask your question directly
        </p>
      </div>

      {/* Quick suggestions grid */}
      <div className="w-full grid grid-cols-2 gap-3 mb-6">
        {QUICK_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => onSuggestionPress(suggestion.prompt)}
            className="bg-white border-2 border-gray-200 rounded-xl p-4 text-left hover:border-primary hover:bg-primary/5 transition-all duration-200 shadow-sm"
          >
            <span className="text-3xl mb-2 block">{suggestion.icon}</span>
            <h3 className="text-base font-semibold text-gray-900 mb-0.5">
              {suggestion.title}
            </h3>
            <p className="text-xs text-gray-500">{suggestion.description}</p>
          </button>
        ))}
      </div>

      {/* More prompts button */}
      <button
        onClick={onMorePromptsPress}
        className="flex items-center gap-2 px-6 py-3 bg-blue-50 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors mb-6"
      >
        <img src="/raya-logo.jpeg" alt="" className="w-4 h-4 rounded-full object-cover" />
        <span className="text-base text-primary font-semibold">View all prompts</span>
      </button>

      {/* Footer info */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm text-gray-500">
            Math • French • English • Science
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
