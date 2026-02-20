"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, X } from "lucide-react";

interface PromptItem {
  id: string;
  emoji: string;
  text: string;
  prompt: string;
}

interface PromptCategory {
  id: string;
  title: string;
  emoji: string;
  prompts: PromptItem[];
}

const PROMPTS_LIBRARY: PromptCategory[] = [
  {
    id: "basics",
    title: "Essentials",
    emoji: "🎯",
    prompts: [
      { id: "1", emoji: "💡", text: "Explain simply", prompt: "Explain this concept to me in a simple way" },
      { id: "2", emoji: "✏️", text: "Homework help", prompt: "Help me solve this exercise" },
      { id: "3", emoji: "📝", text: "Generate a quiz", prompt: "Create a quiz on this topic to test my knowledge" },
      { id: "4", emoji: "📋", text: "Summarize", prompt: "Give me a summary of this content" },
    ],
  },
  {
    id: "study",
    title: "Study",
    emoji: "📚",
    prompts: [
      { id: "5", emoji: "📄", text: "Study sheet", prompt: "Create a complete study sheet on this chapter" },
      { id: "6", emoji: "🔄", text: "Rephrase", prompt: "Rephrase this idea differently for better understanding" },
      { id: "7", emoji: "📊", text: "Course outline", prompt: "Give me a structured and detailed outline of this course" },
      { id: "8", emoji: "🔑", text: "Key points", prompt: "What are the essential key points to remember?" },
    ],
  },
  {
    id: "practice",
    title: "Practice",
    emoji: "💪",
    prompts: [
      { id: "9", emoji: "🔢", text: "Math problem", prompt: "Give me a math problem to solve" },
      { id: "10", emoji: "✏️", text: "Grammar exercise", prompt: "Give me a grammar or spelling exercise" },
      { id: "11", emoji: "🗣️", text: "Language practice", prompt: "Help me practice with a dialogue" },
      { id: "12", emoji: "🎯", text: "Practice exercise", prompt: "Give me an adapted practice exercise" },
    ],
  },
  {
    id: "science",
    title: "Science",
    emoji: "🔬",
    prompts: [
      { id: "13", emoji: "🧪", text: "Experiment", prompt: "Suggest a simple scientific experiment to try" },
      { id: "14", emoji: "🌍", text: "Natural phenomenon", prompt: "Explain this natural phenomenon in detail" },
      { id: "15", emoji: "⚛️", text: "Scientific concept", prompt: "Help me understand this scientific concept" },
      { id: "16", emoji: "🔭", text: "Science question", prompt: "I have a science question, can you help?" },
    ],
  },
  {
    id: "languages",
    title: "Languages",
    emoji: "🗣️",
    prompts: [
      { id: "17", emoji: "🇬🇧", text: "Translate", prompt: "Translate this text with explanations" },
      { id: "18", emoji: "📖", text: "Vocabulary", prompt: "Explain this word and give usage examples" },
      { id: "19", emoji: "✏️", text: "Conjugation", prompt: "Help me with this conjugation in detail" },
      { id: "20", emoji: "💬", text: "Expression", prompt: "How to express this idea?" },
    ],
  },
  {
    id: "creative",
    title: "Creativity",
    emoji: "🎨",
    prompts: [
      { id: "21", emoji: "📝", text: "Writing", prompt: "Help me write a well-structured text" },
      { id: "22", emoji: "🤔", text: "Brainstorming", prompt: "Help me generate creative ideas on this topic" },
      { id: "23", emoji: "🎭", text: "Literary analysis", prompt: "Help me analyze this literary text" },
      { id: "24", emoji: "📚", text: "Commentary", prompt: "Help me write a detailed commentary" },
    ],
  },
  {
    id: "teachers",
    title: "For Teachers",
    emoji: "👩‍🏫",
    prompts: [
      { id: "25", emoji: "📊", text: "Understand PKM scores", prompt: "I'm a teacher. Explain how PKM scores work and how to interpret student mastery levels" },
      { id: "26", emoji: "📋", text: "Generate exam questions", prompt: "I'm a teacher. Generate exam questions with answer key on this topic for my class" },
      { id: "27", emoji: "📈", text: "Analyze student difficulties", prompt: "I'm a teacher. Help me analyze common student difficulties and suggest remediation strategies" },
      { id: "28", emoji: "📝", text: "Create lesson plan", prompt: "I'm a teacher. Help me create a detailed lesson plan with objectives, activities, and assessments" },
      { id: "29", emoji: "✅", text: "Grading rubric", prompt: "I'm a teacher. Create a grading rubric for this assignment with clear criteria" },
      { id: "30", emoji: "🎯", text: "Differentiated exercises", prompt: "I'm a teacher. Generate differentiated exercises for various student levels on this topic" },
    ],
  },
];

interface PromptsModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export default function PromptsModal({
  visible,
  onClose,
  onSelectPrompt,
}: PromptsModalProps) {
  const handlePromptSelect = (prompt: string) => {
    onSelectPrompt(prompt);
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
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 md:inset-4 md:m-auto md:max-w-2xl md:max-h-[90vh] bg-white z-50 flex flex-col md:rounded-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 bg-white">
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </button>

              <div className="flex-1 text-center px-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Prompt Library
                </h2>
                <p className="text-xs text-gray-500">
                  Select a prompt to get started
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors md:hidden"
              >
                <X className="w-5 h-5 text-gray-700" />
              </button>
              <div className="w-10 hidden md:block" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {PROMPTS_LIBRARY.map((category) => (
                <div key={category.id} className="mb-6">
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{category.emoji}</span>
                    <h3 className="flex-1 text-lg font-bold text-gray-900">
                      {category.title}
                    </h3>
                    <span className="px-2 py-1 bg-blue-50 rounded-full text-xs font-semibold text-primary">
                      {category.prompts.length}
                    </span>
                  </div>

                  {/* Prompts list */}
                  <div className="space-y-2">
                    {category.prompts.map((prompt) => (
                      <div
                        key={prompt.id}
                        onClick={() => handlePromptSelect(prompt.prompt)}
                        className="flex items-center gap-3 p-3 bg-white border-2 border-gray-200 rounded-xl cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                      >
                        <span className="text-xl">{prompt.emoji}</span>
                        <span className="flex-1 text-base font-medium text-gray-900">
                          {prompt.text}
                        </span>
                        <span className="text-xl text-gray-400">›</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Footer tip */}
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-base font-semibold text-gray-900 mb-1">
                  💡 Tip
                </p>
                <p className="text-sm text-gray-600">
                  These prompts will automatically fill the text area. You
                  can edit them before sending!
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
