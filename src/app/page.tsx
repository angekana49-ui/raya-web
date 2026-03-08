"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Suspense } from "react";
import AuthRedirectHandler from "@/components/auth/AuthRedirectHandler";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  Lightbulb,
  Camera,
  FileText,
  ChevronRight,
  ChevronDown,
  UserPlus,
  Heart,
  LogOut,
} from "lucide-react";
import type { Message, AttachedFile, Conversation } from "@/types";

// Components
import MessageBubble, { TypingIndicator } from "@/components/chat/MessageBubble";
import EmptyState from "@/components/chat/EmptyState";
import ChatInput from "@/components/chat/ChatInput";
import GamificationToast from "@/components/chat/GamificationToast";
import Sidebar from "@/components/chat/Sidebar";
import PromptsModal from "@/components/chat/PromptsModal";
import ProgressSidebar from "@/components/chat/ProgressSidebar";
import AIOptionsMenu from "@/components/menus/AIOptionsMenu";
import FilePickerMenu from "@/components/menus/FilePickerMenu";
import ModelPickerMenu from "@/components/menus/ModelPickerMenu";
import AuthModal from "@/components/modals/AuthModal";
import EarnHeartsModal from "@/components/modals/EarnHeartsModal";
import XPOverviewModal from "@/components/modals/XPOverviewModal";
// OnboardingModal kept in file but not triggered — RAYA handles onboarding naturally in conversation
// import OnboardingModal from "@/components/modals/OnboardingModal";
import { NoTranslate } from "@/components/ui/NoTranslate";
import { useGamification, getNetMessages } from "@/hooks/useGamification";
import type { BadgeItem, GamificationState } from "@/hooks/useGamification";
import { useAuth } from "@/hooks/useAuth";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { UserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/lib/supabase/client";
import { analyzeUserMessage, evaluateExchange } from "@/lib/assessment-engine";
import type { MessageAnalysis } from "@/lib/assessment-engine";
import { getLevelInfo } from "@/lib/level-titles";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function buildStudentContext(
  g: GamificationState,
  profile: UserProfile | null | undefined,
): string {
  const safeProfile: UserProfile = profile ?? { displayName: "", schoolLevel: "" };
  const missions = Array.isArray(g.todaysMissions) ? g.todaysMissions : [];
  const levelInfo = getLevelInfo(g.totalXp);
  const streakText = g.streakCount > 0
    ? `🔥 ${g.streakCount}-day streak`
    : "First session (no streak yet)";

  const missionLines = missions.map((m) => {
    const check = m.completed ? "✓" : "○";
    const tag = m.isDaily ? " [Daily Challenge]" : m.isBonus ? " [Bonus]" : "";
    return `- [${check}] ${m.title}${tag} (${m.current}/${m.target})`;
  }).join("\n");

  return `## 14. LIVE STUDENT CONTEXT — THIS SESSION

**Student name:** ${safeProfile.displayName || "Unknown"}
**School level:** ${safeProfile.schoolLevel || "Not specified"}
**RAYA Level:** Level ${levelInfo.currentLevel} · ${levelInfo.title} (${g.totalXp} XP total)
**Streak:** ${streakText}

**Today's missions:**
${missionLines}

### Instructions for this session
- Calibrate difficulty and curriculum to the school level above (no need to ask again)
- Address the student by name if they haven't introduced themselves
- Reference their streak naturally when motivating
- If a mission is a Daily Challenge → generate one original, challenging academic question adapted to their level
- Never mention XP amounts, hearts, or mission rewards — the app UI handles that
`;
}

/** Trace from a leaf message back to the root to get the linear conversation branch. */
function getActiveThread(allMessages: Message[], leafId: string | null): Message[] {
  if (!leafId || allMessages.length === 0) return [];
  const byId: Record<string, Message> = {};
  for (const m of allMessages) byId[m.id] = m;
  const thread: Message[] = [];
  let cur: string | null = leafId;
  while (cur && byId[cur]) {
    thread.unshift(byId[cur]);
    cur = byId[cur].parentId ?? null;
  }
  return thread;
}

export default function Home() {
  // Messages state
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // Derived active thread
  const activeMessages = useMemo(
    () => getActiveThread(allMessages, activeLeafId),
    [allMessages, activeLeafId]
  );

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
  const [authResetToken, setAuthResetToken] = useState<string | undefined>(undefined);
  const [showConfirmedBanner, setShowConfirmedBanner] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [earnHeartsVisible, setEarnHeartsVisible] = useState(false);
  const [xpOverviewVisible, setXpOverviewVisible] = useState(false);
  const [userMenuVisible, setUserMenuVisible] = useState(false);

  // Auth + profile
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, updateProfile } = useUserProfile(user?.id);
  const [fileMenuAnchor, setFileMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [aiMenuAnchor, setAiMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [learningHudVisible, setLearningHudVisible] = useState(false);
  const [progressTab, setProgressTab] = useState<"overview" | "mission" | "skills">("overview");
  const [sharedBadgeId, setSharedBadgeId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // AI options state
  const [aiMode, setAiMode] = useState("normal");
  const [selectedModel, setSelectedModel] = useState("gemini-3.1-flash-lite-preview");

  // Gamification (userId = auth.uid → triggers DB sync when logged in)
  const gamification = useGamification(user?.id);
  // Destructure stable callbacks to avoid sendMessage being recreated on every render
  const { onExchangeEvaluated: gamOnExchangeEvaluated } = gamification;

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLElement | null>(null);
  const autoScrollRef = useRef(true);
  const sessionTurnCount = useRef(0);
  const pendingAnalysis = useRef<MessageAnalysis | null>(null);
  // Conversation history for multi-turn memory (reset on new/switched conversation)
  const conversationHistoryRef = useRef<unknown[]>([]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = chatScrollRef.current;
    if (!el) return;
    // Use direct scrollTop to avoid repeated smooth-scroll queuing during stream updates.
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceToBottom < 80;
    setShowScrollToBottom(distanceToBottom > 140);
  }, []);

  // Auto-scroll only when user is near bottom.
  useEffect(() => {
    if (!autoScrollRef.current) return;
    scrollToBottom(isTyping ? "auto" : "smooth");
  }, [activeMessages, isTyping, scrollToBottom]);

  // Load conversations when user logs in (or on first mount if already logged in)
  useEffect(() => {
    if (!user) { setConversations([]); return; }
    async function loadConversations() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/conversations", { headers });
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
  }, [user]);

  // ── Derived gamification values ─────────────────────────────────────────────

  const { state: g, hasUnsavedProgress } = gamification;
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
    async (userMessage: Message, aiText?: string) => {
      setIsTyping(true);
      const messageForAi = aiText ?? userMessage.text;

      try {
        // Create a new conversation if none is active
        let convId = activeConversationId;
        if (!convId) {
          const authHeaders = await getAuthHeaders();
          // Skip conversation creation if not authenticated (chat runs in-memory, convId stays null)
          if (Object.keys(authHeaders).length > 0) {
          const res = await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              title: userMessage.text.substring(0, 50),
            }),
          });
          if (res.ok) {
            const { data } = await res.json();
            if (data?.id) {
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
          }
          } // end if (authHeaders)
        }

        // Call streaming API
        const authHeaders = await getAuthHeaders();
        const res = await fetch("/api/raya/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            message: messageForAi,
            clientMessageId: userMessage.id,
            conversationId: convId,
            aiMode,
            model: selectedModel,
            userTier: "free",
            studentContext: buildStudentContext(gamification.state, profile),
            conversationHistory: conversationHistoryRef.current,
            parentId: userMessage.parentId,
            files: userMessage.files?.map((f) => ({
              name: f.name,
              type: f.type,
              mimeType: f.mimeType,
              base64: f.base64,
            })),
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Stream request failed with status ${res.status}:`, errText);
          throw new Error(`Stream request failed: ${res.status} - ${errText}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let assistantText = "";
        const assistantMsgId = (Date.now() + 1).toString();
        let streamHadError = false;
        let streamHadEvent = false;
        let streamCompleted = false;

        // Add empty assistant message to stream into
        setAllMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            sender: "assistant" as const,
            text: "",
            timestamp: new Date(),
            parentId: userMessage.id,
          },
        ]);
        setActiveLeafId(assistantMsgId);

        // Read stream
        let buffer = "";
        let lastFlush = 0;
        let finalAssistantMessageId = assistantMsgId;
        const flushAssistantText = () => {
          setAllMessages((prev) =>
            prev.map((m) =>
              m.id === finalAssistantMessageId // Might be updated to DB ID
                ? { ...m, text: assistantText }
              : m
            )
          );
        };
        const applyStreamError = (errorText: string) => {
          streamHadError = true;
          setAllMessages((prev) =>
            prev.map((m) =>
              m.id === finalAssistantMessageId
                ? { ...m, text: `Error: ${errorText}` }
                : m
            )
          );
        };
        const handleSseLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) return;
          streamHadEvent = true;

          try {
            const json = JSON.parse(trimmed.slice(6));
            if (json.type === "chunk") {
              if (typeof json.content === "string" && json.content.length > 0) {
                assistantText += json.content;
                const now = Date.now();
                if (now - lastFlush > 60) {
                  flushAssistantText();
                  lastFlush = now;
                }
              }
            } else if (json.type === "complete") {
              streamCompleted = true;
              if (typeof json.content?.text === "string") {
                assistantText = json.content.text;
                flushAssistantText();
              }
              if (Array.isArray(json.content?.conversationHistory)) {
                // Bug #7 Fix: Cap conversation history to last 20 messages to prevent 413 Payload Too Large
                conversationHistoryRef.current = json.content.conversationHistory.slice(-20);
              }
              // Assessment layer: evaluate once only (pendingAnalysis = null after first call)
              if (pendingAnalysis.current !== null) {
                const insight = json.content?.insight ?? null;
                const exchangeResult = evaluateExchange(insight, pendingAnalysis.current, sessionTurnCount.current);
                gamOnExchangeEvaluated(exchangeResult);
                pendingAnalysis.current = null;
              }
            } else if (json.type === "ids_resolved") {
              const { userMessageId, assistantMessageId } = json.content;
              if (userMessageId || assistantMessageId) {
                setAllMessages((prev) => prev.map(m => {
                  if (m.id === userMessage.id && userMessageId) return { ...m, id: userMessageId };
                  if (m.id === finalAssistantMessageId && assistantMessageId) return { ...m, id: assistantMessageId, parentId: userMessageId || m.parentId };
                  // Also update child references
                  if (m.parentId === userMessage.id && userMessageId) return { ...m, parentId: userMessageId };
                  if (m.parentId === finalAssistantMessageId && assistantMessageId) return { ...m, parentId: assistantMessageId };
                  return m;
                }));
                // Update active leaf and local tracker if we matched the assistant msg
                if (assistantMessageId) {
                  finalAssistantMessageId = assistantMessageId;
                  setActiveLeafId(prev => prev === assistantMsgId ? assistantMessageId : prev);
                }
              }
            } else if (json.type === "error") {
              applyStreamError(json.error || "Stream error occurred");
            }
          } catch {
            // Ignore malformed SSE lines
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (value) {
            buffer += decoder.decode(value, { stream: !done });

            // Parse SSE lines from buffer
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) handleSseLine(line);
          }

          if (done) break;
        }
        // Flush any trailing decoder bytes and leftover line.
        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          handleSseLine(buffer);
        }

        if (!streamHadError) {
          if (assistantText.length > 0) {
            flushAssistantText();
          } else if (streamHadEvent && streamCompleted) {
            setAllMessages((prev) =>
              prev.map((m) =>
                m.id === finalAssistantMessageId
                  ? { ...m, text: "The assistant returned an empty response. Please retry." }
                  : m
              )
            );
          } else if (!streamHadEvent) {
            setAllMessages((prev) =>
              prev.map((m) =>
                m.id === finalAssistantMessageId
                  ? { ...m, text: "No stream data received from the assistant. Please retry." }
                  : m
              )
            );
          }
        }

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
        setAllMessages((prev) => {
          const newId = (Date.now() + 1).toString();
          setActiveLeafId(newId);
          return [
            ...prev,
            {
              id: newId,
              sender: "assistant" as const,
              text: "An error occurred. Please try again.",
              timestamp: new Date(),
              parentId: userMessage.id,
            },
          ]
        });
      }
    },
    [activeConversationId, aiMode, selectedModel, gamOnExchangeEvaluated, gamification.state, profile]
  );

  const handleSend = () => {
    if (isTyping) return;
    if (input.trim() === "" && attachedFiles.length === 0) return;
    if (netMessages <= 0) { setEarnHeartsVisible(true); return; }

    const msgText = input.trim() || "(file sent)";
    const parentId = activeLeafId || undefined;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: msgText,
      files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
      timestamp: new Date(),
      parentId,
    };

    setAllMessages((prev) => [...prev, userMessage]);
    setActiveLeafId(userMessage.id);
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
    conversationHistoryRef.current = [];
    setActiveConversationId(id);
    setActiveLeafId(null);
    setConversations((prev) =>
      prev.map((c) => ({ ...c, isActive: c.id === id }))
    );

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/conversations/${id}`, { headers });
      const { data } = await res.json();
      if (data) {
        setAllMessages(
          data.map((m: any) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            timestamp: new Date(m.timestamp),
            parentId: m.parent_id || undefined,
          }))
        );
        // Find the most recent message to be the active leaf
        if (data.length > 0) {
          const lastIndex = data.length - 1;
          setActiveLeafId(data[lastIndex].id);
        } else {
          setActiveLeafId(null);
        }
        
        // Rebuild multi-turn history for the active branch only
        // Delay this slightly because activeMessages takes a render cycle to update
        setTimeout(() => {
           const msgMap = new Map<string, any>(data.map((m:any) => [m.id, m]));
           const thread: any[] = [];
           let currentId: string | null = data.length > 0 ? data[data.length - 1].id : null;
           while (currentId && msgMap.has(currentId)) {
              const m: any = msgMap.get(currentId);
              if (m.sender === "user" || m.sender === "assistant") {
                thread.unshift({ role: m.sender as "user" | "assistant", content: m.text as string });
              }
              currentId = m.parent_id ?? null;
           }
           conversationHistoryRef.current = thread;
        }, 0);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/conversations/${id}`, { method: "DELETE", headers });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setAllMessages([]);
        setActiveLeafId(null);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleSuggestionPress = (prompt: string) => setInput(prompt);
  const handleMorePrompts = () => setPromptsModalVisible(true);
  const handleSelectPrompt = (prompt: string) => setInput(prompt);

  const handleVoicePress = () => {
    setAllMessages((prev) => {
      const newId = (Date.now() + 2).toString();
      setActiveLeafId(newId);
      return [
      ...prev,
      {
        id: newId,
        sender: "assistant",
        text: "Voice mode is coming soon. For now, you can type your question or attach an image.",
        timestamp: new Date(),
        parentId: activeLeafId || undefined,
      },
    ]});
  };

  const handleNewChat = async () => {
    if (activeConversationId) {
      getAuthHeaders().then(headers =>
        fetch(`/api/conversations/${activeConversationId}/end`, { method: "POST", headers }).catch(console.error)
      );
    }
      conversationHistoryRef.current = [];
      setActiveConversationId(null);
      setAllMessages([]);
      setActiveLeafId(null);
      setInput("");
      setAttachedFiles([]);
      autoScrollRef.current = true;
      setShowScrollToBottom(false);
    };

  const handleStartMissionInChat = (missionId: string) => {
    if (isTyping) return;
    if (netMessages <= 0) { setEarnHeartsVisible(true); return; }

    const aiPrompt = gamification.startMission(missionId);
    const mission = gamification.state.todaysMissions.find((m) => m.id === missionId);
    const displayText = mission ? `▶ ${mission.title}` : "Starting mission...";

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: displayText,
      timestamp: new Date(),
      parentId: activeLeafId || undefined,
    };

    setAllMessages((prev) => [...prev, userMessage]);
    setActiveLeafId(userMessage.id);
    setInput("");
    setAttachedFiles([]);
    setLearningHudVisible(false);

    pendingAnalysis.current = analyzeUserMessage(aiPrompt);
    sessionTurnCount.current += 1;
    gamification.consumeHeart();
    gamification.onMessageSent(aiPrompt);

    sendMessage(userMessage, aiPrompt);
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

  const handleEditMessage = (messageId: string, newText: string) => {
    if (isTyping) return;
    if (netMessages <= 0) { setEarnHeartsVisible(true); return; }

    const messageToEdit = allMessages.find(m => m.id === messageId);
    if (!messageToEdit) return;

    // Create a new substituted message as a sibling (same parent_id)
    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: newText,
      timestamp: new Date(),
      parentId: messageToEdit.parentId,
    };

    // Update state to render this new branch tip immediately
    setAllMessages(prev => [...prev, userMessage]);
    setActiveLeafId(userMessage.id);

    // Completely rebuild conversationHistory up to this point
    // This removes the future of the old branch from the AI's context.
    const thread: any[] = [];
    let currentId: string | undefined = messageToEdit.parentId;
    const msgMap = new Map(allMessages.map(m => [m.id, m]));
    
    while (currentId && msgMap.has(currentId)) {
      const m = msgMap.get(currentId)!;
      if (m.sender === "user" || m.sender === "assistant") {
        thread.unshift({ role: m.sender as "user" | "assistant", content: m.text });
      }
      currentId = m.parentId;
    }
    conversationHistoryRef.current = thread;

    // Analyse message before sending
    pendingAnalysis.current = analyzeUserMessage(newText);
    sessionTurnCount.current += 1;

    // Gamification
    gamification.consumeHeart();
    gamification.onMessageSent(newText);

    // Call the AI
    sendMessage(userMessage, newText);
  };

  const handleNavigateBranch = (messageId: string, direction: 'prev' | 'next') => {
    const targetMessage = allMessages.find(m => m.id === messageId);
    if (!targetMessage) return;

    // Find all siblings (messages sharing the same parentId)
    const siblings = allMessages.filter(m => m.parentId === targetMessage.parentId);
    // Sort siblings ascending by timestamp (or ID if timestamp is missing)
    siblings.sort((a, b) => {
      const timeA = a.timestamp?.getTime() || 0;
      const timeB = b.timestamp?.getTime() || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    const currentIndex = siblings.findIndex(m => m.id === messageId);
    if (currentIndex === -1) return;

    let targetSibling;
    if (direction === 'prev' && currentIndex > 0) {
      targetSibling = siblings[currentIndex - 1];
    } else if (direction === 'next' && currentIndex < siblings.length - 1) {
      targetSibling = siblings[currentIndex + 1];
    } else {
      return; // Can't navigate
    }

    // Now, we need to trace down the new branch to find its lowest leaf
    // We want the most recent leaf that originates from targetSibling
    const childrenMap = new Map<string, Message[]>();
    for (const msg of allMessages) {
      if (msg.parentId) {
        if (!childrenMap.has(msg.parentId)) childrenMap.set(msg.parentId, []);
        childrenMap.get(msg.parentId)!.push(msg);
      }
    }

    let deepestLeafId = targetSibling.id;
    let currentLevel = [targetSibling];
    
    // Simple BFS to find the furthest leaf in the sub-tree
    while (currentLevel.length > 0) {
      const nextLevel: Message[] = [];
      for (const node of currentLevel) {
        deepestLeafId = node.id; // Keep updating to latest encountered leaf
        const kids = childrenMap.get(node.id);
        if (kids) {
          // Follow the most recent child (last one added)
          kids.sort((a,b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
          if(kids[0]) nextLevel.push(kids[0]);
        }
      }
      currentLevel = nextLevel;
    }

    // Update active view
    setActiveLeafId(deepestLeafId);

    // Rebuild context (in case they start chatting from there)
    const thread2: any[] = [];
    let currentId2: string | undefined = deepestLeafId;
    const msgMap2 = new Map<string, Message>(allMessages.map(m => [m.id, m]));
    
    while (currentId2 && msgMap2.has(currentId2)) {
      const m2: Message = msgMap2.get(currentId2)!;
      if (m2.sender === "user" || m2.sender === "assistant") {
        thread2.unshift({ role: m2.sender as "user" | "assistant", content: m2.text });
      }
      currentId2 = m2.parentId;
    }
    conversationHistoryRef.current = thread2;
  };

  const showHeader = activeMessages.length === 0;
  const peakLabel = isPeakLabel();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
    {/* Auth redirect handler — reads URL params on mount, fires callbacks */}
    <Suspense fallback={null}>
      <AuthRedirectHandler
        onConfirmed={() => {
          setShowConfirmedBanner(true);
          setTimeout(() => setShowConfirmedBanner(false), 4000);
        }}
        onResetPassword={(token) => {
          setAuthResetToken(token);
          setAuthModalVisible(true);
        }}
        onConfirmFailed={() => {
          setShowErrorBanner(true);
          setTimeout(() => setShowErrorBanner(false), 5000);
        }}
      />
    </Suspense>

    <div className="h-[100dvh] flex min-h-0 bg-transparent overflow-hidden">
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
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[linear-gradient(180deg,#f8fbff_0%,#f4f7fb_50%,#eef3f8_100%)]">

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
              {Array.from({ length: 5 }).map((_, i) => {
                const eff = Math.min(g.hearts - (g.halfHeartOwed ? 0.5 : 0), 5);
                const isFull = i < Math.floor(eff);
                const isHalf = !isFull && i === Math.floor(eff) && eff % 1 === 0.5;
                const pulse = netMessages === 0 ? "animate-pulse" : "";
                if (isHalf) return (
                  <span key={i} className={`relative inline-flex w-3.5 h-3.5 flex-shrink-0 ${pulse}`}>
                    <Heart className="absolute w-3.5 h-3.5 text-slate-200 fill-slate-200" />
                    <Heart className="absolute w-3.5 h-3.5 text-red-400 fill-red-400" style={{ clipPath: "inset(0 50% 0 0)" }} />
                  </span>
                );
                return (
                  <Heart key={i} className={`w-3.5 h-3.5 transition-colors ${isFull ? "text-red-400 fill-red-400" : "text-slate-200 fill-slate-200"} ${pulse}`} />
                );
              })}
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
          <main
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y"
          >
            {activeMessages.length === 0 ? (
              <div className="mx-auto w-full max-w-[900px] px-3 sm:px-4 pt-14">
                <EmptyState
                  onSuggestionPress={handleSuggestionPress}
                  onMorePromptsPress={handleMorePrompts}
                />
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[900px] px-3 sm:px-4 pt-14 pb-4">
                {activeMessages.map((message, idx) => {
                  
                  // Compute sibling info for this message
                  const siblings = allMessages.filter(m => m.parentId === message.parentId);
                  // Sort them nicely
                  siblings.sort((a, b) => {
                    const timeA = a.timestamp?.getTime() || 0;
                    const timeB = b.timestamp?.getTime() || 0;
                    if (timeA !== timeB) return timeA - timeB;
                    return a.id.localeCompare(b.id);
                  });

                  const siblingCount = siblings.length;
                  const siblingIndex = siblings.findIndex(m => m.id === message.id);

                  return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isStreaming={
                      isTyping &&
                      message.sender === "assistant" &&
                      idx === activeMessages.length - 1
                    }
                    onEdit={handleEditMessage}
                    siblingCount={siblingCount}
                    siblingIndex={siblingIndex}
                    onNavigateBranch={(direction) => handleNavigateBranch(message.id, direction)}
                  />
                  );
                })}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </main>

          {showScrollToBottom && (
            <button
              type="button"
              onClick={() => {
                autoScrollRef.current = true;
                setShowScrollToBottom(false);
                scrollToBottom("smooth");
              }}
              aria-label="Scroll to latest message"
              className="absolute bottom-4 right-4 z-30 w-10 h-10 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          )}
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
        isLoggedIn={!!user}
        hasUnsavedProgress={hasUnsavedProgress}
        onSignUp={() => setAuthModalVisible(true)}
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
      {/* OnboardingModal désactivé — RAYA gère l'onboarding naturellement en conversation */}
      <AuthModal
        visible={authModalVisible}
        onClose={() => { setAuthModalVisible(false); setAuthResetToken(undefined); }}
        resetToken={authResetToken}
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

    {/* Gamification toasts — rendered outside overflow-hidden root to avoid iOS clipping */}
    <GamificationToast
      notifications={gamification.pendingNotifications}
      onDismiss={gamification.dismissNotification}
    />

    {/* Email confirmed banner */}
    <AnimatePresence>
      {showConfirmedBanner && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2.5 bg-emerald-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg"
        >
          <span>✓</span>
          <span>Account confirmed — welcome to RAYA!</span>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Confirmation failed banner */}
    <AnimatePresence>
      {showErrorBanner && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2.5 bg-red-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg"
        >
          <span>✕</span>
          <span>This link has expired. Please request a new one.</span>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
