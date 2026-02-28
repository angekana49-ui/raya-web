"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  Lightbulb,
  Camera,
  FileText,
  ChevronRight,
  UserPlus,
  Heart,
  LogOut,
} from "lucide-react";
import type { Message, AttachedFile, Conversation } from "@/types";

// Components
import MessageBubble, { TypingIndicator } from "@/components/chat/MessageBubble";
import EmptyState from "@/components/chat/EmptyState";
import ChatInput from "@/components/chat/ChatInput";
import Sidebar from "@/components/chat/Sidebar";
import PromptsModal from "@/components/chat/PromptsModal";
import ProgressSidebar from "@/components/chat/ProgressSidebar";
import AIOptionsMenu from "@/components/menus/AIOptionsMenu";
import FilePickerMenu from "@/components/menus/FilePickerMenu";
import ModelPickerMenu from "@/components/menus/ModelPickerMenu";
import AuthModal from "@/components/modals/AuthModal";
import EarnHeartsModal from "@/components/modals/EarnHeartsModal";
import XPOverviewModal from "@/components/modals/XPOverviewModal";
import { NoTranslate } from "@/components/ui/NoTranslate";
import { useGamification, getNetMessages } from "@/hooks/useGamification";
import type { BadgeItem } from "@/hooks/useGamification";
import { useAuth } from "@/hooks/useAuth";
import { analyzeUserMessage, evaluateExchange } from "@/lib/assessment-engine";
import type { MessageAnalysis } from "@/lib/assessment-engine";

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
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [earnHeartsVisible, setEarnHeartsVisible] = useState(false);
  const [xpOverviewVisible, setXpOverviewVisible] = useState(false);
  const [userMenuVisible, setUserMenuVisible] = useState(false);

  // Auth
  const { user, loading: authLoading, signOut } = useAuth();
  const [fileMenuAnchor, setFileMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [aiMenuAnchor, setAiMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [learningHudVisible, setLearningHudVisible] = useState(false);
  const [progressTab, setProgressTab] = useState<"overview" | "mission" | "skills">("overview");
  const [sharedBadgeId, setSharedBadgeId] = useState<string | null>(null);

  // AI options state
  const [aiMode, setAiMode] = useState("normal");
  const [selectedModel, setSelectedModel] = useState("gemini-3");

  // Gamification
  const gamification = useGamification();
  // Destructure stable callbacks to avoid sendMessage being recreated on every render
  const { onExchangeEvaluated: gamOnExchangeEvaluated } = gamification;

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionTurnCount = useRef(0);
  const pendingAnalysis = useRef<MessageAnalysis | null>(null);

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
              isActive: false,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load conversations:", err);
      }
    }
    loadConversations();
  }, []);

  // ── Derived gamification values ─────────────────────────────────────────────

  const { state: g } = gamification;
  const REGEN_CAP_DISPLAY = 5;
  const netMessages = getNetMessages(g.hearts, g.halfHeartOwed ?? false);

  const isPeakLabel = () => {
    const h = new Date().getHours();
    return (h >= 8 && h < 10) || (h >= 17 && h < 21) ? "Peak hours · ×1" : "Off-peak · ×2";
  };


  // Live regen countdown — only starts interval when a heart is actually regenerating
  const [regenCountdown, setRegenCountdown] = useState("");
  useEffect(() => {
    const active = g.nextHeartRegenAt > 0 && g.hearts < REGEN_CAP_DISPLAY;
    if (!active) { setRegenCountdown(""); return; }
    const tick = () => {
      const ms = Math.max(0, g.nextHeartRegenAt - Date.now());
      if (ms === 0) { setRegenCountdown(""); return; }
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      setRegenCountdown(`${min}m ${String(sec).padStart(2, "0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [g.nextHeartRegenAt, g.hearts]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAddFile = (file: AttachedFile) => {
    setAttachedFiles((prev) => [...prev, file]);
  };

  const handleRemoveFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
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
            ...prev.map((c) => ({ ...c, isActive: false })),
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
            model: selectedModel,
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

        // Read stream
        let buffer = "";
        let lastFlush = 0;
        const flushAssistantText = () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, text: assistantText }
                : m
            )
          );
        };

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
                const now = Date.now();
                if (now - lastFlush > 60) {
                  flushAssistantText();
                  lastFlush = now;
                }
              } else if (json.type === "complete" && json.content?.text) {
                assistantText = json.content.text;
                flushAssistantText();
                // Assessment layer: evaluate exchange with AI insight
                const insight = json.content?.insight ?? null;
                const analysis = pendingAnalysis.current ?? analyzeUserMessage("");
                const exchangeResult = evaluateExchange(insight, analysis, sessionTurnCount.current);
                gamOnExchangeEvaluated(exchangeResult);
                pendingAnalysis.current = null;
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
        flushAssistantText();

        // Update conversation preview in local state
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, preview: assistantText.substring(0, 100), date: new Date(), isActive: true }
              : { ...c, isActive: false }
          )
        );
        setIsTyping(false);
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
    [activeConversationId, aiMode, selectedModel, gamOnExchangeEvaluated]
  );

  const handleSend = () => {
    if (isTyping) return;
    if (input.trim() === "" && attachedFiles.length === 0) return;
    if (netMessages <= 0) { setEarnHeartsVisible(true); return; }

    const msgText = input.trim() || "(file sent)";
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: msgText,
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachedFiles([]);

    // Analyse message before sending (result used after stream completes)
    pendingAnalysis.current = analyzeUserMessage(msgText);
    sessionTurnCount.current += 1;

    // Gamification: consume heart + streak/session tracking
    gamification.consumeHeart();
    gamification.onMessageSent(msgText);

    sendMessage(userMessage);
  };

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    setConversations((prev) =>
      prev.map((c) => ({ ...c, isActive: c.id === id }))
    );

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

  const handleSuggestionPress = (prompt: string) => setInput(prompt);
  const handleMorePrompts = () => setPromptsModalVisible(true);
  const handleSelectPrompt = (prompt: string) => setInput(prompt);

  const handleVoicePress = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: (Date.now() + 2).toString(),
        sender: "assistant",
        text: "Voice mode is coming soon. For now, you can type your question or attach an image.",
        timestamp: new Date(),
      },
    ]);
  };

  const handleNewChat = async () => {
    if (activeConversationId) {
      fetch(`/api/conversations/${activeConversationId}/end`, { method: "POST" }).catch(console.error);
    }
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setAttachedFiles([]);
  };

  const handleStartMissionInChat = (missionId: string) => {
    setInput(gamification.getMissionStartPrompt(missionId));
    setLearningHudVisible(false);
  };

  const handlePracticeSkill = (skillKey: string) => {
    setInput(gamification.getPracticePrompt(skillKey));
  };

  const handleShareBadge = async (badge: BadgeItem) => {
    const text = `I just unlocked the "${badge.label}" badge on RAYA! 🎓`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text, title: "RAYA Badge" });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // user cancelled share — ignore
    }
    setSharedBadgeId(badge.id);
    setTimeout(() => setSharedBadgeId(null), 2000);
  };

  const handleOpenMissionsFromEarnHearts = () => {
    setEarnHeartsVisible(false);
    setLearningHudVisible(true);
    setProgressTab("mission");
  };

  const showHeader = messages.length === 0;
  const peakLabel = isPeakLabel();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex bg-transparent overflow-hidden">
      <Sidebar
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
        userName={user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Guest"}
        userEmail={user?.email ?? ""}
        onNewChat={handleNewChat}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onSignOut={signOut}
        onOpenAuth={() => setAuthModalVisible(true)}
      />

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col bg-[linear-gradient(180deg,#f8fbff_0%,#f4f7fb_50%,#eef3f8_100%)]">

        {/* Header */}
        <header className="bg-white/90 border-b border-slate-200 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 min-h-[60px]">
            <button
              onClick={() => setSidebarVisible((prev) => !prev)}
              aria-label={sidebarVisible ? "Close sidebar" : "Open sidebar"}
              className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>

            <div className="flex-1 flex items-center justify-center gap-2">
              <img src="/raya-logo.jpeg" alt="RAYA" className="w-9 h-9 rounded-full object-cover" />
              <div className="text-center">
                <h1 className="text-lg font-bold text-gray-900"><NoTranslate>RAYA</NoTranslate></h1>
                <p className="text-xs text-gray-500">AI Assistant</p>
              </div>
            </div>

            <button
              onClick={() => setLearningHudVisible((prev) => !prev)}
              aria-label={learningHudVisible ? "Hide progress panel" : "Show progress panel"}
              className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <ChevronRight
                className={`w-5 h-5 text-gray-700 transition-transform ${
                  learningHudVisible ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {/* Sub header (visible only on empty state) */}
          <AnimatePresence>
            {showHeader && (
              <motion.div
                initial={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 pb-3 text-center overflow-hidden"
              >
                <p className="text-sm text-gray-900 font-medium mb-1 flex items-center justify-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  Ask me anything about your lessons
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

        <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
          {/* Hearts display */}
          <button
            onClick={() => setEarnHeartsVisible(true)}
            className="absolute top-3 left-4 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/80 border border-slate-200 shadow-sm hover:bg-white transition-colors"
            aria-label={`${netMessages} messages remaining`}
            title={regenCountdown ? `Next heart in ${regenCountdown}` : "Hearts — tap to earn more"}
          >
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Heart
                  key={i}
                  className={`w-3.5 h-3.5 transition-colors ${
                    i < Math.min(g.hearts, 5)
                      ? "text-red-400 fill-red-400"
                      : "text-slate-200 fill-slate-200"
                  } ${netMessages === 0 ? "animate-pulse" : ""}`}
                />
              ))}
            </div>
            <span className={`text-[11px] font-semibold ml-0.5 ${netMessages === 0 ? "text-red-500" : "text-slate-600"}`}>
              {netMessages}
            </span>
          </button>

          {!authLoading && !user && (
            <button
              onClick={() => setAuthModalVisible(true)}
              className="absolute top-3 right-4 z-20 h-9 px-3 max-lg:w-9 max-lg:px-0 rounded-full text-xs font-semibold text-white bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              aria-label="Sign up or log in"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="max-lg:hidden">Sign up / Log in</span>
            </button>
          )}

          {!authLoading && user && (
            <div className="absolute top-3 right-4 z-20 flex items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => setUserMenuVisible((v) => !v)}
                  className="w-9 h-9 rounded-full bg-[linear-gradient(135deg,#2563eb,#7c3aed)] flex items-center justify-center text-white text-sm font-bold hover:opacity-90 transition-opacity"
                  aria-label="Account menu"
                  title={user.email ?? ""}
                >
                  {(user.email?.[0] ?? "U").toUpperCase()}
                </button>

                <AnimatePresence>
                  {userMenuVisible && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-30"
                        onClick={() => setUserMenuVisible(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-11 z-40 w-52 rounded-2xl border border-slate-200 bg-white shadow-xl p-2"
                      >
                        <p className="px-2 py-1.5 text-[11px] text-slate-400 truncate">{user.email}</p>
                        <hr className="my-1 border-slate-100" />
                        <button
                          onClick={async () => { setUserMenuVisible(false); await signOut(); }}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-xl text-xs text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Sign out
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Chat area */}
          <main className="flex-1 min-h-0 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="mx-auto w-full max-w-[900px] px-3 sm:px-4">
                <EmptyState
                  onSuggestionPress={handleSuggestionPress}
                  onMorePromptsPress={handleMorePrompts}
                />
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[900px] px-3 sm:px-4 py-4">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </main>
        </div>

        {/* No-hearts banner */}
        {netMessages === 0 && (
          <div className="px-3 pb-1">
            <div className="mx-auto w-full max-w-[900px]">
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                <Heart className="w-4 h-4 text-red-400 fill-red-400 shrink-0 animate-pulse" />
                <span className="text-xs text-red-600 flex-1">
                  No hearts left!{regenCountdown ? ` Next heart in ${regenCountdown}.` : ""}
                </span>
                <button
                  onClick={() => setEarnHeartsVisible(true)}
                  className="text-xs font-semibold text-red-600 underline hover:text-red-700 shrink-0"
                >
                  Earn more
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat input */}
        <div className="px-2 sm:px-3 pb-3 pt-2 md:pb-2">
          <div className="mx-auto w-full max-w-[900px] px-1 sm:px-2">
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
              onAnchorsChange={({ fileButton, aiButton }) => {
                setFileMenuAnchor(fileButton);
                setAiMenuAnchor(aiButton);
              }}
            />
          </div>
        </div>
      </div>

      {/* Right sidebar — progress panel */}
      <ProgressSidebar
        visible={learningHudVisible}
        onClose={() => setLearningHudVisible(false)}
        progressTab={progressTab}
        onTabChange={setProgressTab}
        g={g}
        netMessages={netMessages}
        regenCountdown={regenCountdown}
        peakLabel={peakLabel}
        sharedBadgeId={sharedBadgeId}
        onStartMissionInChat={handleStartMissionInChat}
        onPracticeSkill={handlePracticeSkill}
        onShareBadge={handleShareBadge}
        onOpenEarnHearts={() => setEarnHeartsVisible(true)}
        onOpenXPOverview={() => setXpOverviewVisible(true)}
      />

      {/* Menus */}
      <FilePickerMenu
        visible={fileMenuVisible}
        onClose={() => setFileMenuVisible(false)}
        onSelectFile={handleAddFile}
        anchorEl={fileMenuAnchor}
      />
      <AIOptionsMenu
        visible={aiMenuVisible}
        onClose={() => setAiMenuVisible(false)}
        currentMode={aiMode}
        onModeChange={setAiMode}
        currentModel={selectedModel}
        onModelChange={setSelectedModel}
        anchorEl={aiMenuAnchor}
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
      <PromptsModal
        visible={promptsModalVisible}
        onClose={() => setPromptsModalVisible(false)}
        onSelectPrompt={handleSelectPrompt}
      />

      {/* Modals */}
      <AuthModal
        visible={authModalVisible}
        onClose={() => setAuthModalVisible(false)}
      />
      <XPOverviewModal
        visible={xpOverviewVisible}
        onClose={() => setXpOverviewVisible(false)}
        g={g}
      />
      <EarnHeartsModal
        visible={earnHeartsVisible}
        onClose={() => setEarnHeartsVisible(false)}
        hearts={g.hearts}
        netMessages={netMessages}
        regenCountdown={regenCountdown}
        peakLabel={peakLabel}
        badges={g.badges}
        onShareBadge={handleShareBadge}
        onEarnHearts={gamification.earnHearts}
        onOpenMissions={handleOpenMissionsFromEarnHearts}
      />
    </div>
  );
}
