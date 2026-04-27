"use client";

import {
  BookOpen,
  MessageSquare,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import { NoTranslate } from "@/components/ui/NoTranslate";

interface EmptyStateProps {
  onSuggestionPress: (prompt: string) => void;
  onMorePromptsPress: () => void;
  userIsVerified?: boolean;
  onOpenPromo?: () => void;
  onOpenRayaCard?: () => void;
  onOpenVerify?: () => void;
}

// EmptyState now focuses solely on the user prompt and the core library
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 20
    }
  },
};

export default function EmptyState({
  onSuggestionPress,
  onMorePromptsPress,
  userIsVerified = false,
  onOpenPromo,
  onOpenRayaCard,
  onOpenVerify,
}: EmptyStateProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="px-5 py-8 sm:px-6 flex flex-col items-center w-full max-w-3xl mx-auto"
    >
      <motion.div variants={itemVariants} className="flex flex-col items-center mb-12 text-center relative">
        {/* Raya Pulse Effect */}
        <div className="relative mb-6">
          <motion.div
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.15, 0.4, 0.15],
              background: [
                "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)",
                "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)",
                "radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)"
              ]
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute -inset-10 blur-3xl rounded-full"
          />
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-tr from-primary/30 to-violet-500/30 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <Image
              src="/raya-logo.jpeg"
              alt="RAYA"
              width={80}
              height={80}
              className="relative rounded-full object-cover border-4 border-white shadow-2xl ring-1 ring-primary/10 group-hover:scale-105 transition-transform duration-500"
              priority
            />
          </div>
        </div>

        <motion.h1
          className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight"
        >
          How can <NoTranslate>RAYA</NoTranslate> help you today?
        </motion.h1>

        <p className="text-slate-500 max-w-md mx-auto leading-relaxed mb-6">
          I'm your personalized AI study partner. Pick a prompt below or start typing to begin your learning journey.
        </p>

        {!userIsVerified && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-lg mx-auto bg-amber-50 border border-amber-200/60 rounded-2xl p-4 sm:p-5 text-left shadow-sm mt-4"
          >
            <div className="flex items-start gap-4">
              <div className="mt-1 bg-amber-100 p-2 rounded-full shrink-0">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-900 mb-1">Welcome aboard! Two quick things...</h3>
                <p className="text-xs text-amber-800/80 mb-3 leading-relaxed">
                  You are currently using an instant account. Verify it to secure your progress and unlock the full account benefits.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={onOpenVerify}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors text-center"
                  >
                    Verify with Email
                  </button>
                  <button
                    onClick={onOpenRayaCard}
                    className="flex-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold py-2 px-3 rounded-lg transition-colors border border-amber-300/50 text-center"
                  >
                    Get Backup Card
                  </button>
                  <button
                    onClick={onOpenPromo}
                    className="flex-1 bg-white hover:bg-slate-50 text-amber-700 text-xs font-bold py-2 px-3 rounded-lg transition-colors border border-amber-200 text-center"
                  >
                    Enter Level Up Code
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      <motion.div variants={itemVariants} className="flex flex-col items-center gap-6 w-full mb-10">
        <button
          onClick={onMorePromptsPress}
          className="group flex items-center gap-4 px-6 py-3 bg-white/70 backdrop-blur-xl border border-indigo-100/80 text-indigo-700 rounded-full hover:bg-white hover:border-indigo-200/80 transition-all shadow-lg shadow-indigo-500/5 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-0.5 active:translate-y-0"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-100 to-indigo-50 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
            <Sparkles className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-sm font-bold tracking-wide">Explore Prompt Library</span>
          <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
        </button>

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 opacity-50 mt-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">All subjects covered</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Multi-format support</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
