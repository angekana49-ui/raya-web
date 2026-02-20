"use client";

import { motion } from "framer-motion";
import { FileText, File, Image as ImageIcon } from "lucide-react";
import type { Message, AttachedFile } from "@/types";
import { cn, formatTime } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

function AttachedFileDisplay({ file }: { file: AttachedFile }) {
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

  if (file.type === "image") {
    return (
      <div className="rounded-lg overflow-hidden mb-1">
        <img src={file.url} alt={file.name} className="w-full h-[150px] object-cover rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded">
      {getIcon()}
      <span className="text-sm text-white truncate flex-1">{file.name}</span>
    </div>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === "user";

  // Message utilisateur : bulle avec largeur responsive
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-4 ml-auto max-w-[85%] sm:max-w-[75%] md:max-w-[65%] lg:max-w-[55%] xl:max-w-[45%]"
      >
        <div className="px-4 py-3 rounded-[20px] bg-primary text-white rounded-br-md">
          {/* Fichiers attachés */}
          {message.files && message.files.length > 0 && (
            <div className="flex flex-col gap-1 mb-2">
              {message.files.map((file) => (
                <AttachedFileDisplay key={file.id} file={file} />
              ))}
            </div>
          )}

          {/* Texte */}
          <p className="text-base leading-relaxed whitespace-pre-wrap">{message.text}</p>

          {/* Timestamp */}
          {message.timestamp && (
            <p className="text-xs mt-1 text-white/70">
              {formatTime(message.timestamp)}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // Message IA : pas de bulle, texte simple (style ChatGPT/Claude)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mb-4 w-full"
    >
      <div className="text-gray-900 dark:text-gray-100">
        {/* Texte */}
        <p className="text-base leading-relaxed whitespace-pre-wrap">{message.text}</p>

        {/* Timestamp */}
        {message.timestamp && (
          <p className="text-xs mt-2 text-gray-400">
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mb-4 w-full"
    >
      <div className="inline-flex items-center gap-1.5">
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity, delay: 0 }}
          className="w-2 h-2 bg-gray-400 rounded-full"
        />
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
          className="w-2 h-2 bg-gray-400 rounded-full"
        />
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
          className="w-2 h-2 bg-gray-400 rounded-full"
        />
      </div>
    </motion.div>
  );
}
