"use client";

import type { RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { AttachedFile, Message } from "@/types";
import ChatInput from "@/components/chat/ChatInput";
import EmptyState from "@/components/chat/EmptyState";
import MessageBubble, { TypingIndicator } from "@/components/chat/MessageBubble";

interface ChatWorkspaceProps {
  chatScrollRef: RefObject<HTMLElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  activeMessages: Message[];
  allMessages: Message[];
  isTyping: boolean;
  showScrollToBottom: boolean;
  fileMenuVisible: boolean;
  aiMenuVisible: boolean;
  modelMenuVisible: boolean;
  input: string;
  attachedFiles: AttachedFile[];
  aiMode: string;
  selectedModel: string;
  userIsVerified: boolean;
  onChatScroll: () => void;
  onScrollToBottom: () => void;
  onSuggestionPress: (prompt: string) => void;
  onMorePromptsPress: () => void;
  onOpenRayaCard: () => void;
  onOpenPromo: () => void;
  onOpenVerify: () => void;
  onEditMessage: (messageId: string, newText: string) => void;
  onNavigateBranch: (messageId: string, direction: "prev" | "next") => void;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onFileButtonPress: () => void;
  onAIOptionsPress: () => void;
  onModelPress: () => void;
  onVoicePress: () => void;
  onRemoveFile: (fileId: string) => void;
  onAnchorsChange: (anchors: {
    fileButton: HTMLButtonElement | null;
    aiButton: HTMLButtonElement | null;
    modelButton: HTMLButtonElement | null;
  }) => void;
}

function getSiblingMeta(allMessages: Message[], message: Message) {
  const siblings = allMessages
    .filter((candidate) => candidate.parentId === message.parentId)
    .sort((a, b) => {
      const timeA = a.timestamp?.getTime() || 0;
      const timeB = b.timestamp?.getTime() || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

  return {
    siblingCount: siblings.length,
    siblingIndex: siblings.findIndex((candidate) => candidate.id === message.id),
  };
}

export default function ChatWorkspace({
  chatScrollRef,
  messagesEndRef,
  activeMessages,
  allMessages,
  isTyping,
  showScrollToBottom,
  fileMenuVisible,
  aiMenuVisible,
  modelMenuVisible,
  input,
  attachedFiles,
  aiMode,
  selectedModel,
  userIsVerified,
  onChatScroll,
  onScrollToBottom,
  onSuggestionPress,
  onMorePromptsPress,
  onOpenRayaCard,
  onOpenPromo,
  onOpenVerify,
  onEditMessage,
  onNavigateBranch,
  onChangeText,
  onSend,
  onFileButtonPress,
  onAIOptionsPress,
  onModelPress,
  onVoicePress,
  onRemoveFile,
  onAnchorsChange,
}: ChatWorkspaceProps) {
  return (
    <>
      <main
        ref={chatScrollRef}
        onScroll={onChatScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y"
      >
        {activeMessages.length === 0 ? (
          <div className="mx-auto w-full max-w-[900px] px-3 sm:px-4 pt-14">
            <EmptyState
              onSuggestionPress={onSuggestionPress}
              onMorePromptsPress={onMorePromptsPress}
              userIsVerified={userIsVerified}
              onOpenRayaCard={onOpenRayaCard}
              onOpenPromo={onOpenPromo}
              onOpenVerify={onOpenVerify}
            />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[900px] px-3 sm:px-4 pt-14 pb-4">
            {activeMessages.map((message, idx) => {
              const { siblingCount, siblingIndex } = getSiblingMeta(allMessages, message);

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={
                    isTyping &&
                    message.sender === "assistant" &&
                    idx === activeMessages.length - 1
                  }
                  onEdit={onEditMessage}
                  siblingCount={siblingCount}
                  siblingIndex={siblingIndex}
                  onNavigateBranch={(direction) => onNavigateBranch(message.id, direction)}
                />
              );
            })}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <AnimatePresence>
        {showScrollToBottom && (
          <motion.button
            initial={{ opacity: 0, y: 10, x: "-50%" }}
            animate={{
              opacity: 1,
              y: (fileMenuVisible || aiMenuVisible || modelMenuVisible) ? -260 : 0,
              x: "-50%",
            }}
            exit={{ opacity: 0, y: 10, x: "-50%" }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onScrollToBottom}
            className="absolute bottom-28 left-1/2 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/20 transition-all hover:scale-110 active:scale-95"
            aria-label="Scroll to latest message"
          >
            <ChevronDown className="w-5 h-5 animate-bounce-subtle" />
          </motion.button>
        )}
      </AnimatePresence>

      <div className="px-2 sm:px-3 pb-3 pt-2 md:pb-2">
        <div className="mx-auto w-full max-w-[900px] px-1 sm:px-2">
          <ChatInput
            value={input}
            onChangeText={onChangeText}
            onSend={onSend}
            onFileButtonPress={onFileButtonPress}
            onAIOptionsPress={onAIOptionsPress}
            onModelPress={onModelPress}
            onVoicePress={onVoicePress}
            files={attachedFiles}
            onRemoveFile={onRemoveFile}
            aiMode={aiMode}
            selectedModel={selectedModel}
            onAnchorsChange={onAnchorsChange}
          />
        </div>
      </div>
    </>
  );
}
