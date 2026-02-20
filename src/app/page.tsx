"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, NotebookPen, Lightbulb, Camera, FileText } from "lucide-react";
import type { Message, AttachedFile, Conversation } from "@/types";

// Components
import MessageBubble, { TypingIndicator } from "@/components/chat/MessageBubble";
import EmptyState from "@/components/chat/EmptyState";
import ChatInput from "@/components/chat/ChatInput";
import Sidebar from "@/components/chat/Sidebar";
import PromptsModal from "@/components/chat/PromptsModal";
import AIOptionsMenu from "@/components/menus/AIOptionsMenu";
import FilePickerMenu from "@/components/menus/FilePickerMenu";
import ModelPickerMenu from "@/components/menus/ModelPickerMenu";
import { NoTranslate } from "@/components/ui/NoTranslate";

export default function Home() {
  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Conversation state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // UI state
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [fileMenuVisible, setFileMenuVisible] = useState(false);
  const [aiMenuVisible, setAiMenuVisible] = useState(false);
  const [modelMenuVisible, setModelMenuVisible] = useState(false);
  const [promptsModalVisible, setPromptsModalVisible] = useState(false);

  // AI options state
  const [aiMode, setAiMode] = useState("normal");
  const [selectedModel, setSelectedModel] = useState("gemini");

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Load conversations on mount
  useEffect(() => {
    async function loadConversations() {
      try {
        const res = await fetch("/api/conversations");
        const { data } = await res.json();
        if (data) {
          setConversations(
            data.map((c: any) => ({
              id: c.id,
              title: c.title,
              preview: c.preview || "",
              date: new Date(c.updated_at || c.created_at),
              isActive: c.is_active,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load conversations:", err);
      }
    }
    loadConversations();
  }, []);

  // Handlers
  const handleAddFile = (file: AttachedFile) => {
    setAttachedFiles([...attachedFiles, file]);
  };

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles(attachedFiles.filter((f) => f.id !== fileId));
  };

  const sendMessage = useCallback(
    async (userMessage: Message) => {
      setIsTyping(true);

      try {
        // Create a new conversation if none is active
        let convId = activeConversationId;
        if (!convId) {
          const res = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: userMessage.text.substring(0, 50),
            }),
          });
          const { data } = await res.json();
          convId = data.id;
          setActiveConversationId(convId);
          setConversations((prev) => [
            {
              id: data.id,
              title: data.title,
              preview: "",
              date: new Date(data.created_at),
              isActive: true,
            },
            ...prev,
          ]);
        }

        // Call streaming API
        const res = await fetch("/api/raya/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage.text,
            conversationId: convId,
            aiMode,
            userTier: "free",
          }),
        });

        if (!res.ok) {
          throw new Error("Stream request failed");
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let assistantText = "";
        const assistantMsgId = (Date.now() + 1).toString();

        // Add empty assistant message to stream into
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            sender: "assistant" as const,
            text: "",
            timestamp: new Date(),
          },
        ]);
        setIsTyping(false);

        // Read stream
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE lines from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            try {
              const json = JSON.parse(trimmed.slice(6));
              if (json.type === "chunk") {
                assistantText += json.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: assistantText }
                      : m
                  )
                );
              } else if (json.type === "complete" && json.content?.text) {
                assistantText = json.content.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: assistantText }
                      : m
                  )
                );
              } else if (json.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: `Error: ${json.error}` }
                      : m
                  )
                );
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }

        // Update conversation preview in local state
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, preview: assistantText.substring(0, 100), date: new Date() }
              : c
          )
        );
      } catch (err: any) {
        console.error("Send message error:", err);
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: "assistant" as const,
            text: "An error occurred. Please try again.",
            timestamp: new Date(),
          },
        ]);
      }
    },
    [activeConversationId, aiMode]
  );

  const handleSend = () => {
    if (input.trim() === "" && attachedFiles.length === 0) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: input.trim() || "(file sent)",
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachedFiles([]);

    sendMessage(userMessage);
  };

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    setSidebarVisible(false);

    try {
      const res = await fetch(`/api/conversations/${id}`);
      const { data } = await res.json();
      if (data) {
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            timestamp: new Date(m.timestamp),
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleSuggestionPress = (prompt: string) => {
    setInput(prompt);
  };

  const handleMorePrompts = () => {
    setPromptsModalVisible(true);
  };

  const handleSelectPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleVoicePress = () => {
    alert("Coming soon: Voice message");
  };

  const handleNewChat = async () => {
    // End current conversation if one exists
    if (activeConversationId) {
      fetch(`/api/conversations/${activeConversationId}/end`, {
        method: "POST",
      }).catch(console.error);
    }
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setAttachedFiles([]);
  };

  const showHeader = messages.length === 0;

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 min-h-[60px]">
          <button
            onClick={() => setSidebarVisible(true)}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <Menu className="w-5 h-5 text-gray-700" />
          </button>

          <div className="flex-1 flex items-center justify-center gap-2">
            <img
              src="/raya-logo.jpeg"
              alt="RAYA"
              className="w-9 h-9 rounded-full object-cover"
            />
            <div className="text-center">
              <h1 className="text-lg font-bold text-gray-900"><NoTranslate>RAYA</NoTranslate></h1>
              <p className="text-xs text-gray-500">AI Assistant</p>
            </div>
          </div>

          <button
            onClick={handleNewChat}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <NotebookPen className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* Sub header */}
        <AnimatePresence>
          {showHeader && (
            <motion.div
              initial={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 pb-3 text-center overflow-hidden"
            >
              <p className="text-sm text-gray-900 font-medium mb-1 flex items-center justify-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Ask me questions about your courses
              </p>
              <p className="text-xs text-gray-500 flex items-center justify-center gap-3">
                <span className="flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" />
                  Send images
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  Share documents
                </span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {messages.length === 0 ? (
          <EmptyState
            onSuggestionPress={handleSuggestionPress}
            onMorePromptsPress={handleMorePrompts}
          />
        ) : (
          <div className="px-4 py-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Chat input */}
      <ChatInput
        value={input}
        onChangeText={setInput}
        onSend={handleSend}
        onFileButtonPress={() => setFileMenuVisible(true)}
        onAIOptionsPress={() => setAiMenuVisible(true)}
        onVoicePress={handleVoicePress}
        files={attachedFiles}
        onRemoveFile={handleRemoveFile}
        aiMode={aiMode}
      />

      {/* Menus */}
      <FilePickerMenu
        visible={fileMenuVisible}
        onClose={() => setFileMenuVisible(false)}
        onSelectFile={handleAddFile}
      />

      <AIOptionsMenu
        visible={aiMenuVisible}
        onClose={() => setAiMenuVisible(false)}
        currentMode={aiMode}
        onModeChange={setAiMode}
        currentModel={selectedModel}
        onModelChange={setSelectedModel}
        onOpenModelPicker={() => {
          setAiMenuVisible(false);
          setModelMenuVisible(true);
        }}
      />

      <ModelPickerMenu
        visible={modelMenuVisible}
        onClose={() => setModelMenuVisible(false)}
        currentModel={selectedModel}
        onSelectModel={setSelectedModel}
      />

      {/* Prompts Modal */}
      <PromptsModal
        visible={promptsModalVisible}
        onClose={() => setPromptsModalVisible(false)}
        onSelectPrompt={handleSelectPrompt}
      />

      {/* Sidebar */}
      <Sidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        userName="Test User"
        userEmail="test@raya.dev"
        onNewChat={handleNewChat}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />
    </div>
  );
}
