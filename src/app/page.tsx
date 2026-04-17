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
  UserPlus,
  Heart,
  Mail,
  LogOut,
} from "lucide-react";
import { Message, AttachedFile, Conversation, StudyRoomPreview } from "@/types";

// Components
import Sidebar from "@/components/chat/Sidebar";
import PromptsModal from "@/components/chat/PromptsModal";
import ProgressSidebar from "@/components/chat/ProgressSidebar";
import ChatWorkspace from "@/components/chat/ChatWorkspace";
import StudyRoomShell from "@/components/rooms/StudyRoomShell";
import StudyRoomSidebar from "@/components/rooms/StudyRoomSidebar";
import StudyRoomsLobby from "@/components/rooms/StudyRoomsLobby";
import AIOptionsMenu from "@/components/menus/AIOptionsMenu";
import FilePickerMenu from "@/components/menus/FilePickerMenu";
import ModelPickerMenu from "@/components/menus/ModelPickerMenu";
import AuthModal from "@/components/modals/AuthModal";
import EarnHeartsModal from "@/components/modals/EarnHeartsModal";
import XPOverviewModal from "@/components/modals/XPOverviewModal";
import OnboardingModal from "@/components/modals/OnboardingModal";
import PromoCodeModal from "@/components/modals/PromoCodeModal";
import CreateRoomModal from "@/components/modals/CreateRoomModal";
import JoinRoomModal from "@/components/modals/JoinRoomModal";
import InviteRoomModal from "@/components/modals/InviteRoomModal";
import { RayaCardModal } from "@/components/modals/RayaCardModal";
import { NoTranslate } from "@/components/ui/NoTranslate";
import SmartPopup, { type SmartPopupContent } from "@/components/ui/SmartPopup";
import { useGamification, getNetMessages } from "@/hooks/useGamification";
import type { BadgeItem, GamificationState } from "@/hooks/useGamification";
import { useStudyRooms } from "@/hooks/useStudyRooms";
import { useAuth } from "@/hooks/useAuth";
import { useUserEntitlements } from "@/hooks/useUserEntitlements";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { AuthResetSession, UserProfile } from "@/hooks/useUserProfile";
import { supabase } from "@/lib/supabase/client";
import {
  buildConversationHistoryFromLeaf,
  buildConversationHistoryFromRecords,
  findDeepestRecentLeaf,
  findMessage,
  getActiveThread,
  getLatestLeafId,
  getSiblingMessages,
  mapConversationRecord,
  mapMessageRecord,
  type ConversationRecord,
  type MessageRecord,
} from "@/lib/chat-thread";
import { getOrCreateInstallationId } from "@/lib/guest";
import { analyzeUserMessage, evaluateExchange } from "@/lib/assessment-engine";
import type { MessageAnalysis } from "@/lib/assessment-engine";
import { getLevelInfo } from "@/lib/level-titles";
import { SessionAggregator } from "@/lib/session-aggregator";
import type { SessionSummaryPayload } from "@/lib/session-aggregator";
import {
  buildStudyRoomInviteUrl,
} from "@/lib/study-room-data";
import {
  getFirstUnlockedMode,
  getFirstUnlockedModel,
  type UserEntitlements,
} from "@/lib/user-entitlements";
import type { RayaInsight } from "@/services/raya-ai.service";
import { APP_SETTINGS_EVENT, applyReduceMotion, readAppSettings } from "@/lib/app-settings";
import { canShowPopup, markPopupSeen } from "@/lib/popup-cadence";

type PopupQueueItem = Omit<SmartPopupContent, "open" | "onClose"> & {
  durationMs?: number;
};

const MAX_CONVERSATION_HISTORY = 20;
const STREAM_REQUEST_TIMEOUT_MS = 45000;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function buildStudentContext(
  g: GamificationState,
  profile: UserProfile | null | undefined,
): string {
  const safeProfile: UserProfile = profile ?? {
    username: "",
    displayName: "",
    schoolLevel: "",
    hasEmail: false,
    hasVerifiedEmail: false,
    authMethod: "anonymous",
    accountState: "onboarding_pending",
    planTier: "free",
    onboardingCompleted: false,
  };
  const missions = Array.isArray(g.todaysMissions) ? g.todaysMissions : [];
  const levelInfo = getLevelInfo(g.totalXp);
  const streakText = g.streakCount > 0
    ? `🔥 ${g.streakCount}-day streak`
    : "First session (no streak yet)";

  const missionLines = missions.map((m) => {
    const check = m.completed ? "✓" : "○";
    return `- [${check}] ${m.title} (${m.current}/${m.target})`;
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
  const [authResetToken, setAuthResetToken] = useState<AuthResetSession | undefined>(undefined);
  const [authUpgradeMode, setAuthUpgradeMode] = useState(false);
  const [authEmailUpgraded, setAuthEmailUpgraded] = useState(false);
  const [popupQueue, setPopupQueue] = useState<PopupQueueItem[]>([]);
  const [activePopup, setActivePopup] = useState<PopupQueueItem | null>(null);
  const showConfirmedBanner = false;
  const showEmailUpgradedBanner = false;
  const showErrorBanner = false;
  const showLevelUpNudge = false;
  const [openLevelUpCodeRequest, setOpenLevelUpCodeRequest] = useState(0);
  const [earnHeartsVisible, setEarnHeartsVisible] = useState(false);
  const [xpOverviewVisible, setXpOverviewVisible] = useState(false);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [rayaCardModalOpen, setRayaCardModalOpen] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  // Auth + profile
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, updateProfile, isProfileComplete } = useUserProfile(user?.id);
  const { entitlements, setEntitlements, refresh: refreshEntitlements } = useUserEntitlements(user?.id);
  const {
    activeView,
    setActiveView,
    activeRoomId,
    setActiveRoomId,
    createRoomModalOpen,
    setCreateRoomModalOpen,
    joinRoomModalOpen,
    setJoinRoomModalOpen,
    inviteRoomModalOpen,
    setInviteRoomModalOpen,
    invitedGuestFlow,
    invitedGuestAlias,
    roomOnboardingNudgeVisible,
    studyRooms,
    selectedRoom,
    selectedRoomTheme,
    openInvitedGuestOnboarding,
    registerInvitedGuestEngagement,
    clearInvitedGuestFlow,
    handleCreateRoom,
    handleJoinRoom,
    handleRemoveRoom,
    roomError,
    clearRoomError,
  } = useStudyRooms({
    authLoading,
    isProfileComplete,
    isSignedIn: !!user,
    userId: user?.id ?? null,
  });
  const [fileMenuAnchor, setFileMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [aiMenuAnchor, setAiMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [modelMenuAnchor, setModelMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [learningHudVisible, setLearningHudVisible] = useState(false);

  const [sharedBadgeId, setSharedBadgeId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const popupTimeoutRef = useRef<number | null>(null);

  // AI options state
  const [aiMode, setAiMode] = useState("normal");
  const [selectedModel, setSelectedModel] = useState("gemini-3.1-flash-lite-preview");

  const enqueuePopup = useCallback((popup: PopupQueueItem) => {
    setPopupQueue((current) => [...current, popup]);
  }, []);

  const closeActivePopup = useCallback(() => {
    if (popupTimeoutRef.current !== null) {
      window.clearTimeout(popupTimeoutRef.current);
      popupTimeoutRef.current = null;
    }
    setActivePopup(null);
  }, []);

  useEffect(() => {
    setAiMode((current) => (
      entitlements.availableModes.includes(current)
        ? current
        : getFirstUnlockedMode(entitlements, "normal")
    ));
    setSelectedModel((current) => (
      entitlements.availableModels.includes(current)
        ? current
        : getFirstUnlockedModel(entitlements, "gemini-3.1-flash-lite-preview")
    ));
  }, [entitlements.availableModels, entitlements.availableModes]);

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
  const sessionAggregatorRef = useRef<SessionAggregator | null>(null);
  // Conversation history for multi-turn memory (reset on new/switched conversation)
  const conversationHistoryRef = useRef<unknown[]>([]);

  const getSessionAggregator = useCallback(() => {
    if (!sessionAggregatorRef.current) {
      sessionAggregatorRef.current = new SessionAggregator("", "");
    }
    return sessionAggregatorRef.current;
  }, []);

  const buildSessionSummary = useCallback((): SessionSummaryPayload | null => {
    const aggregator = sessionAggregatorRef.current;
    if (!aggregator) return null;
    const summary = aggregator.finalizePayload();
    return summary.exchange_count > 0 ? summary : null;
  }, []);

  const resetSessionAggregator = useCallback(() => {
    sessionAggregatorRef.current = null;
  }, []);

  const endConversation = useCallback(async (conversationId: string) => {
    const sessionSummary = buildSessionSummary();
    resetSessionAggregator();

    try {
      const authHeaders = await getAuthHeaders();
      await fetch(`/api/conversations/${conversationId}/end`, {
        method: "POST",
        headers: sessionSummary
          ? { "Content-Type": "application/json", ...authHeaders }
          : authHeaders,
        ...(sessionSummary ? { body: JSON.stringify({ session_summary: sessionSummary }) } : {}),
      });
    } catch (error) {
      console.error("Failed to end conversation:", error);
    }
  }, [buildSessionSummary, resetSessionAggregator]);

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
            (data as ConversationRecord[]).map(mapConversationRecord)
          );
        }
      } catch (err) {
        console.error("Failed to load conversations:", err);
      }
    }
    loadConversations();
  }, [user]);

  useEffect(() => {
    if (authLoading || authModalVisible || rayaCardModalOpen) return;
    if (invitedGuestFlow && !roomOnboardingNudgeVisible) {
      setOnboardingVisible(false);
      return;
    }
    if (!user || !isProfileComplete) {
      setOnboardingVisible(true);
      return;
    }
    setOnboardingVisible(false);
    setOnboardingError(null);
  }, [authLoading, authModalVisible, rayaCardModalOpen, invitedGuestFlow, isProfileComplete, roomOnboardingNudgeVisible, user]);

  useEffect(() => {
    const settings = readAppSettings();
    applyReduceMotion(settings.reduceMotion);

    const syncSettings = () => {
      const next = readAppSettings();
      applyReduceMotion(next.reduceMotion);
      if (!next.tipsEnabled && activePopup?.title === "Got a Level Up Code?") {
        closeActivePopup();
      }
    };

    window.addEventListener(APP_SETTINGS_EVENT, syncSettings);
    return () => window.removeEventListener(APP_SETTINGS_EVENT, syncSettings);
  }, [activePopup?.title, closeActivePopup]);

  useEffect(() => {
    if (activePopup || popupQueue.length === 0) return;
    const [nextPopup, ...rest] = popupQueue;
    setActivePopup(nextPopup);
    setPopupQueue(rest);
  }, [activePopup, popupQueue]);

  useEffect(() => {
    if (!activePopup?.durationMs) return;
    popupTimeoutRef.current = window.setTimeout(() => {
      setActivePopup(null);
      popupTimeoutRef.current = null;
    }, activePopup.durationMs);

    return () => {
      if (popupTimeoutRef.current !== null) {
        window.clearTimeout(popupTimeoutRef.current);
        popupTimeoutRef.current = null;
      }
    };
  }, [activePopup]);

  useEffect(() => {
    if (!roomError) return;
    const errorObj = typeof roomError === "string" ? { tone: "error" as const, title: "Error", message: roomError } : roomError;
    enqueuePopup({
      tone: errorObj.tone,
      title: errorObj.title,
      message: errorObj.message,
      primaryAction: {
        label: "Understood",
        onClick: () => {
          clearRoomError();
          closeActivePopup();
        },
      },
      durationMs: 8000,
    });
  }, [roomError, enqueuePopup, clearRoomError, closeActivePopup]);

  useEffect(() => {
    if (authLoading || !user || entitlements.levelUpActive) return;
    const { tipsEnabled } = readAppSettings();
    if (!tipsEnabled) return;
    if (!canShowPopup("level_up_nudge", 36)) return;

    const timer = window.setTimeout(() => {
      markPopupSeen("level_up_nudge");
      enqueuePopup({
        tone: "warning",
        title: "Got a Level Up Code?",
        message: "Unlock extra context, one more AI mode, and your first premium discount from the profile menu.",
        primaryAction: {
          label: "Open menu",
          onClick: () => {
            setSidebarVisible(true);
            setOpenLevelUpCodeRequest((value) => value + 1);
            closeActivePopup();
          },
        },
        secondaryAction: {
          label: "Later",
          onClick: closeActivePopup,
        },
        durationMs: 10000,
      });
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [authLoading, closeActivePopup, enqueuePopup, entitlements.levelUpActive, user]);

  useEffect(() => {
    if (authLoading || !user || profile.hasVerifiedEmail || entitlements.historyWindowDays === null) return;
    const { tipsEnabled } = readAppSettings();
    if (!tipsEnabled) return;
    if (!canShowPopup("history_window", 72)) return;

    const timer = window.setTimeout(() => {
      markPopupSeen("history_window");
      enqueuePopup({
        tone: "info",
        title: `${entitlements.historyWindowDays}-day visible history`,
        message: "Your full data is still kept safely, but instant accounts can only reopen the last 30 days until the email is verified.",
        primaryAction: {
          label: "Verify email",
          onClick: () => {
            setAuthUpgradeMode(true);
            setAuthEmailUpgraded(false);
            setAuthModalVisible(true);
            closeActivePopup();
          },
        },
        secondaryAction: {
          label: "Later",
          onClick: closeActivePopup,
        },
        durationMs: 12000,
      });
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [
    authLoading,
    closeActivePopup,
    enqueuePopup,
    entitlements.historyWindowDays,
    profile.hasVerifiedEmail,
    user,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "room_expired") {
      enqueuePopup({
        tone: "warning",
        title: "Room Expired or Invalid",
        message: "The study room link you followed is no longer active or the room has been closed.",
        primaryAction: {
          label: "Dismiss",
          onClick: closeActivePopup,
        },
        durationMs: 8000,
      });
      // Clear the param
      window.history.replaceState(null, "", "/");
    }
  }, [enqueuePopup, closeActivePopup]);

  const { state: g, hasUnsavedProgress } = gamification;
  const REGEN_CAP_DISPLAY = 5;
  const netMessages = getNetMessages(g.hearts, g.halfHeartOwed ?? false);
  const messageLimitActive = false;
  const heartPolicyLabel = "10 messages · 24/7";


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

  const handleCompleteOnboarding = useCallback(async ({
    username,
    displayName,
    schoolLevel,
    captchaToken,
  }: {
    username: string;
    displayName: string;
    schoolLevel: string;
    captchaToken?: string;
  }) => {
    setOnboardingLoading(true);
    setOnboardingError(null);

    try {
      let activeUser = user;

      if (!activeUser) {
        const { data, error } = await supabase.auth.signInAnonymously({
          options: {
            captchaToken,
            data: {
              display_name: displayName || username,
              school_level: schoolLevel,
              installation_id: getOrCreateInstallationId(),
            },
          },
        });
        if (error) throw error;
        activeUser = data.user;
      }

      if (!activeUser) {
        throw new Error("Could not initialize your session.");
      }

      const { data, error } = await supabase.rpc("complete_user_onboarding", {
        p_username: username,
        p_display_name: displayName,
        p_school_level: schoolLevel,
      });
      if (error) throw error;

      updateProfile({
        username,
        displayName: displayName || username,
        schoolLevel,
        hasEmail: Boolean((data as { hasEmail?: boolean } | null)?.hasEmail ?? profile.hasEmail),
        hasVerifiedEmail: Boolean(
          (data as { hasVerifiedEmail?: boolean } | null)?.hasVerifiedEmail ?? profile.hasVerifiedEmail
        ),
        authMethod:
          ((data as { authMethod?: UserProfile["authMethod"] } | null)?.authMethod ?? profile.authMethod),
        accountState:
          ((data as { accountState?: UserProfile["accountState"] } | null)?.accountState ?? profile.accountState),
        planTier:
          ((data as { planTier?: string } | null)?.planTier ?? profile.planTier),
        onboardingCompleted: Boolean(
          (data as { onboardingCompleted?: boolean } | null)?.onboardingCompleted ?? profile.onboardingCompleted
        ),
      });
      void refreshEntitlements();
      clearInvitedGuestFlow();
      setOnboardingVisible(false);
    } catch (error: any) {
      console.error("[Onboarding] Error:", error);
      const message = String(error?.message || "Could not save your profile.");
      if (message.toLowerCase().includes("anonymous sign-ins are disabled")) {
        setOnboardingError("Anonymous access is not enabled yet in Supabase.");
      } else {
        setOnboardingError(message);
      }
    } finally {
      setOnboardingLoading(false);
    }
  }, [
    profile.accountState,
    profile.authMethod,
    profile.hasEmail,
    profile.hasVerifiedEmail,
    profile.onboardingCompleted,
    profile.planTier,
    refreshEntitlements,
    updateProfile,
    user,
  ]);

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
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), STREAM_REQUEST_TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch("/api/raya/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              message: messageForAi,
              clientMessageId: userMessage.id,
              conversationId: convId,
              aiMode,
              model: selectedModel,
              userTier: entitlements.hasPremiumAccess ? "premium" : "free",
              studentContext: buildStudentContext(gamification.state, profile),
              conversationHistory: conversationHistoryRef.current.slice(-MAX_CONVERSATION_HISTORY),
              parentId: userMessage.parentId,
              files: userMessage.files?.map((f) => ({
                name: f.name,
                type: f.type,
                mimeType: f.mimeType,
                base64: f.base64,
              })),
            }),
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeoutId);
        }

        if (!res.ok) {
          const errText = await res.text();
          let errorMessage = errText;
          try {
            const parsed = JSON.parse(errText) as { error?: string; message?: string };
            errorMessage = parsed.error || parsed.message || errText;
          } catch {
            // keep raw text
          }
          console.error(`Stream request failed with status ${res.status}:`, errorMessage);
          throw new Error(errorMessage || `Stream request failed: ${res.status}`);
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
                const typedInsight = insight && typeof insight === "object" ? insight as Partial<RayaInsight> : null;
                getSessionAggregator().addExchange(
                  exchangeResult.analyticsPoint,
                  messageForAi,
                  typedInsight?.concept_id,
                  typedInsight?.student_verdict === "correct"
                );
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

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (value) {
              buffer += decoder.decode(value, { stream: !done });

              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) handleSseLine(line);
            }

            if (done) break;
          }

          buffer += decoder.decode();
          if (buffer.trim().length > 0) {
            handleSseLine(buffer);
          }
        } finally {
          reader.releaseLock();
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
        const errorText = err?.name === "AbortError"
          ? "The assistant took too long to respond. Please retry."
          : err?.message || "An error occurred. Please try again.";
        setAllMessages((prev) => {
          const newId = (Date.now() + 1).toString();
          setActiveLeafId(newId);
          return [
            ...prev,
            {
              id: newId,
              sender: "assistant" as const,
              text: errorText,
              timestamp: new Date(),
              parentId: userMessage.id,
            },
          ]
        });
      }
    },
    [activeConversationId, aiMode, selectedModel, entitlements.hasPremiumAccess, gamOnExchangeEvaluated, gamification.state, getSessionAggregator, profile]
  );

  const handleSend = () => {
    if (isTyping) return;
    if (authLoading || !user || !isProfileComplete) {
      setOnboardingVisible(true);
      return;
    }
    if (input.trim() === "" && attachedFiles.length === 0) return;
    if (messageLimitActive && netMessages <= 0) { setEarnHeartsVisible(true); return; }

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

    // Gamification
    if (messageLimitActive) gamification.consumeHeart();
    gamification.onMessageSent();

    sendMessage(userMessage);
  };

  const handleSelectConversation = async (id: string) => {
    if (activeConversationId && activeConversationId !== id) {
      void endConversation(activeConversationId);
    } else {
      resetSessionAggregator();
    }
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
        const messageRecords = data as MessageRecord[];
        setAllMessages(messageRecords.map(mapMessageRecord));
        // Find the most recent message to be the active leaf
        setActiveLeafId(getLatestLeafId(messageRecords));

        // Rebuild multi-turn history for the active branch only
        // Delay this slightly because activeMessages takes a render cycle to update
        setTimeout(() => {
          conversationHistoryRef.current = buildConversationHistoryFromRecords(messageRecords).slice(-MAX_CONVERSATION_HISTORY);
        }, 0);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      resetSessionAggregator();
      setActiveConversationId(null);
      setAllMessages([]);
      setActiveLeafId(null);
    }
    
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/conversations/${id}`, { method: "DELETE", headers });
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleSuggestionPress = (prompt: string) => {
    setInput(prompt);
    gamification.onPromptUsed();
  };
  const handleMorePrompts = () => setPromptsModalVisible(true);
  const handleSelectPrompt = (prompt: string) => setInput(prompt);

  const handleVoicePress = useCallback(() => {
    enqueuePopup({
      tone: "info",
      title: "Voice Is Not In The MVP",
      message: "Voice input is not enabled yet. For now, type your question or attach an image/document so Raya can help immediately.",
      primaryAction: {
        label: "Attach a File",
        onClick: () => {
          setFileMenuVisible(true);
          closeActivePopup();
        },
      },
      secondaryAction: {
        label: "Keep Typing",
        onClick: closeActivePopup,
      },
    });
  }, [closeActivePopup, enqueuePopup]);

  const handleNewChat = async () => {
    if (activeConversationId) {
      void endConversation(activeConversationId);
    } else {
      resetSessionAggregator();
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
  };

  const handleEditMessage = (messageId: string, newText: string) => {
    if (isTyping) return;
    if (authLoading || !user || !isProfileComplete) {
      setOnboardingVisible(true);
      return;
    }
    if (messageLimitActive && netMessages <= 0) { setEarnHeartsVisible(true); return; }

    const messageToEdit = findMessage(allMessages, messageId);
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
    conversationHistoryRef.current = buildConversationHistoryFromLeaf(
      allMessages,
      messageToEdit.parentId,
    );

    // Analyse message before sending
    pendingAnalysis.current = analyzeUserMessage(newText);
    sessionTurnCount.current += 1;

    // Gamification
    if (messageLimitActive) gamification.consumeHeart();
    gamification.onMessageSent();

    // Call the AI
    sendMessage(userMessage, newText);
  };

  const handleNavigateBranch = (messageId: string, direction: 'prev' | 'next') => {
    const targetMessage = findMessage(allMessages, messageId);
    if (!targetMessage) return;

    const siblings = getSiblingMessages(allMessages, targetMessage);

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

    const deepestLeafId = findDeepestRecentLeaf(allMessages, targetSibling.id);

    // Update active view
    setActiveLeafId(deepestLeafId);

    // Rebuild context (in case they start chatting from there)
    conversationHistoryRef.current = buildConversationHistoryFromLeaf(allMessages, deepestLeafId);
  };

  const showHeader = activeMessages.length === 0;
  const peakLabel = heartPolicyLabel;
  const sidebarUserName =
    profile.displayName ||
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "Student";
  const sidebarUserEmail = profile.hasVerifiedEmail
    ? (user?.email ?? "")
    : `@${profile.username || "student"}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "room_expired") {
      enqueuePopup({
        tone: "error",
        title: "Room Expired",
        message: "This study room session has ended.",
        durationMs: 5000,
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [enqueuePopup]);

  const handleRoomFull = useCallback((room: StudyRoomPreview) => {
    enqueuePopup({
      tone: "info",
      title: "Room is Full",
      message: `"${room.title}" has reached its maximum capacity of 8 members. Try another room or create your own!`,
      primaryAction: {
        label: "I understand",
        onClick: closeActivePopup,
      },
      durationMs: 6000,
    });
  }, [enqueuePopup, closeActivePopup]);

  const menuDisplayName = profile.displayName || profile.username || "Student";
  const menuUsername = profile.username ? `@${profile.username}` : "@student";
  const menuContact = profile.hasVerifiedEmail ? (user?.email ?? menuUsername) : menuUsername;
  const usageSummary = `${entitlements.tokenLimit === null ? "Unlimited" : `${Math.round(entitlements.tokenLimit / 1000)}k`} tokens · ${entitlements.fileUploadLimit === null ? "Unlimited" : entitlements.fileUploadLimit} file upload${entitlements.fileUploadLimit === 1 ? "" : "s"}`;
  const usageDescription = entitlements.hasPremiumAccess
    ? `Premium access is active with ${entitlements.roomMinutesLimit} minute rooms and an XP x${entitlements.xpMultiplier} booster.`
    : entitlements.levelUpActive && profile.hasVerifiedEmail
      ? `Verified Level Up accounts get stronger limits, Creative Mode, ${entitlements.roomMinutesLimit} minute rooms, and a light XP boost.`
    : profile.hasVerifiedEmail
      ? `Verified accounts get the full ${entitlements.tokenWindowHours}-hour study window with double the token budget.`
      : `Instant accounts get a lighter ${entitlements.tokenWindowHours}-hour window until the email is verified.`;
  const handleLockedModeSelect = useCallback((_: string, lockType: "level_up" | "premium") => {
    if (lockType === "level_up") {
      setPromoModalOpen(true);
      return;
    }
    enqueuePopup({
      tone: "info",
      title: "Premium Mode Locked",
      message: "This AI mode is reserved for Pro or Plus. The lock is real even if the full paywall is not live yet.",
      primaryAction: {
        label: "Use Available Modes",
        onClick: closeActivePopup,
      },
    });
  }, [closeActivePopup, enqueuePopup]);
  const handleLockedModelSelect = useCallback(() => {
    enqueuePopup({
      tone: "info",
      title: "Advanced Model Locked",
      message: "Advanced models are reserved for Pro or Plus. You can keep studying with the currently unlocked models.",
      primaryAction: {
        label: "Use Current Model",
        onClick: closeActivePopup,
      },
    });
  }, [closeActivePopup, enqueuePopup]);
  const isRoomView = activeView === "rooms";
  const showSoloHeader = !isRoomView && showHeader;
  const selectedRoomInviteUrl =
    buildStudyRoomInviteUrl(
      typeof window !== "undefined" ? window.location.origin : null,
      selectedRoom.id,
    );
  // Current user as the only real member
  const realRoomMembers = [{
    id: user?.id ?? 'me',
    name: profile.displayName || profile.username || 'You',
    accent: 'linear-gradient(135deg,#7c3aed,#ec4899)',
    status: 'ready' as const,
  }];

  // ── Render ──────────────────────────────────────────────────────────────────

  const dismissLevelUpNudge = useCallback(() => {}, []);

  return (
    <>
      {/* Auth redirect handler — reads URL params on mount, fires callbacks */}
      <Suspense fallback={null}>
        <AuthRedirectHandler
          onConfirmed={() => {
            enqueuePopup({
              tone: "success",
              title: "Account confirmed",
              message: "Welcome to RAYA. Your account is now verified and ready to go.",
              durationMs: 4000,
            });
          }}
          onEmailUpgraded={() => {
            updateProfile({
              hasEmail: true,
              hasVerifiedEmail: true,
              authMethod: "email",
              accountState: "active_verified",
            });
            void refreshEntitlements();
            setAuthUpgradeMode(false);
            setAuthEmailUpgraded(true);
            setAuthModalVisible(true);
            enqueuePopup({
              tone: "success",
              title: "Email confirmed",
              message: "Set your password to finish securing this account.",
              durationMs: 4500,
            });
          }}
          onResetPassword={(token) => {
            setAuthResetToken(token);
            setAuthModalVisible(true);
          }}
          onConfirmFailed={() => {
            enqueuePopup({
              tone: "error",
              title: "Link expired",
              message: "This confirmation link is no longer valid. Request a new one to continue.",
              durationMs: 5000,
            });
          }}
        />
      </Suspense>

      <div className="h-[100dvh] flex min-h-0 bg-transparent overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
        <Sidebar
          visible={sidebarVisible}
          onClose={() => setSidebarVisible(false)}
          userName={sidebarUserName}
          userEmail={sidebarUserEmail}
          userIsVerified={profile.hasVerifiedEmail}
          entitlements={entitlements}
          openLevelUpCodeRequest={openLevelUpCodeRequest}
          onPromoApplied={(nextEntitlements: UserEntitlements) => {
            setEntitlements(nextEntitlements);
            void refreshEntitlements();
          }}
          onNewChat={() => {
            setActiveView("chat");
            handleNewChat();
          }}
          conversations={conversations}
          rooms={studyRooms}
          activeRoomId={activeRoomId}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            setActiveView("chat");
            handleSelectConversation(id);
          }}
          onSelectRoom={(id) => {
            setActiveView("rooms");
            setActiveRoomId(id || null);
          }}
          onDeleteConversation={handleDeleteConversation}
          onSignOut={signOut}
          onOpenAuth={() => setAuthModalVisible(true)}
          onUpgradeAccount={() => {
            setAuthUpgradeMode(true);
            setAuthEmailUpgraded(false);
            setAuthModalVisible(true);
          }}
          onOpenPrompts={() => setPromptsModalVisible(true)}
          activeView={activeView}
          onSelectView={setActiveView}
          onCreateRoom={() => setCreateRoomModalOpen(true)}
          onJoinRoom={() => setJoinRoomModalOpen(true)}
          onRoomFull={handleRoomFull}
          onRemoveRoom={handleRemoveRoom}
        />

        {/* Main column */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-transparent">
          {isRoomView && invitedGuestFlow && (
            <div className="mx-auto mt-2 w-full max-w-[980px] px-3 sm:px-4">
              <div
                className={`rounded-[24px] border px-4 py-3 shadow-sm backdrop-blur-sm ${
                  roomOnboardingNudgeVisible
                    ? "border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#fffbeb_100%)]"
                    : "border-sky-100 bg-[linear-gradient(135deg,#eff6ff_0%,#ffffff_100%)]"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                      {roomOnboardingNudgeVisible ? "Keep your place" : "Instant access active"}
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {roomOnboardingNudgeVisible
                        ? `${invitedGuestAlias}, keep your place in the squad.`
                        : `You're in as ${invitedGuestAlias}. Explore the room first.`}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {roomOnboardingNudgeVisible
                        ? "Choose your name and school level so this room can remember you next time."
                        : "No signup wall right now. You can use the room freely, then claim your identity when you're ready."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      openInvitedGuestOnboarding();
                      setOnboardingVisible(true);
                    }}
                    className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                      roomOnboardingNudgeVisible
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "bg-sky-600 text-white hover:bg-sky-700"
                    }`}
                  >
                    {roomOnboardingNudgeVisible ? "Claim identity" : "Claim now"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isRoomView && (
            <header className="glass-panel border-t-0 border-x-0 rounded-b-[2rem] mx-2 mt-2 sticky top-2 z-50">
              <div className="flex items-center justify-between px-4 py-3 min-h-[60px]">
                <button
                  onClick={() => {
                    const isMobile = window.innerWidth < 768;
                    if (isMobile && !sidebarVisible) {
                      setLearningHudVisible(false);
                      setSidebarVisible(true);
                    } else {
                      setSidebarVisible(prev => !prev);
                    }
                  }}
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
                  onClick={() => {
                    const isMobile = window.innerWidth < 768;
                    if (isMobile && !learningHudVisible) {
                      setSidebarVisible(false);
                      setLearningHudVisible(true);
                    } else {
                      setLearningHudVisible(prev => !prev);
                    }
                  }}
                  aria-label={learningHudVisible ? "Hide progress panel" : "Show progress panel"}
                  className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                >
                  <ChevronRight
                    className={`w-5 h-5 text-gray-700 transition-transform ${learningHudVisible ? "rotate-180" : ""}`}
                  />
                </button>
              </div>

              <AnimatePresence>
                {showSoloHeader && (
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
          )}

          <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
            {/* Hearts display */}
            {!isRoomView && messageLimitActive && <button
              onClick={() => setEarnHeartsVisible(true)}
              className="absolute top-3 left-4 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/80 border border-slate-200 shadow-sm hover:bg-white transition-colors"
              aria-label={`${netMessages} messages remaining`}
              title={regenCountdown ? `Next heart in ${regenCountdown}` : "Hearts — tap to earn more"}
            >
              <div className="flex items-center gap-0.5">
                {Array.from({ length: REGEN_CAP_DISPLAY }).map((_, i) => {
                  const eff = Math.min(g.hearts - (g.halfHeartOwed ? 0.5 : 0), REGEN_CAP_DISPLAY);
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
            </button>}

            {/* Shared Profile/Auth Button - Positioned to match old Solo layout */}
            <div className="absolute top-3.5 right-4 z-[60] flex items-center gap-2">
              {!authLoading && !user && !onboardingVisible && (
                <button
                  onClick={() => setAuthModalVisible(true)}
                  className="h-9 px-3 rounded-full text-xs font-semibold text-white bg-[linear-gradient(90deg,#2563eb_0%,#7c3aed_100%)] hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Sign up</span>
                </button>
              )}

              {/* User Profil Menu Removed */}
            </div>

            {isRoomView ? (
              activeRoomId ? (
                <StudyRoomShell
                  roomName={selectedRoom.title}
                  mission={selectedRoom.mission}
                  onlineCount={selectedRoom.onlineCount}
                  maxMembers={selectedRoom.maxMembers ?? 8}
                  durationMinutes={selectedRoom.duration ?? 0}
                  timerEndsAt={selectedRoom.timerEndsAt ?? null}
                  timerStatus={selectedRoom.timerStatus ?? "idle"}
                  alert5mSent={selectedRoom.alert5mSent ?? false}
                  alert2mSent={selectedRoom.alert2mSent ?? false}
                  alertEndSent={selectedRoom.alertEndSent ?? false}
                  squadXp={selectedRoomTheme.squadXp}
                  members={realRoomMembers}
                  events={[]}
                  onInvite={() => setInviteRoomModalOpen(true)}
                  onEngage={registerInvitedGuestEngagement}
                  onToggleSidebar={() => setSidebarVisible((prev) => !prev)}
                  onTogglePanel={() => setLearningHudVisible((prev) => !prev)}
                  onReturnToLobby={() => {
                    setActiveView("rooms");
                    setActiveRoomId(null);
                  }}
                  panelOpen={learningHudVisible}
                  files={selectedRoom.files}
                  isCreator={false}
                  roomAiMode={selectedRoom.aiMode ?? "active"}
                  conversationId={selectedRoom.conversationId}
                  roomId={selectedRoom.id}
                  currentUserId={user?.id}
                  entitlements={entitlements}
                />
              ) : (
                <StudyRoomsLobby
                  rooms={studyRooms}
                  onCreateRoom={() => setCreateRoomModalOpen(true)}
                  onJoinRoom={() => setJoinRoomModalOpen(true)}
                  onToggleSidebar={() => setSidebarVisible((prev) => !prev)}
                  onTogglePanel={() => setLearningHudVisible((prev) => !prev)}
                  panelOpen={learningHudVisible}
                  onSelectRoom={(id) => {
                    setActiveView("rooms");
                    setActiveRoomId(id);
                  }}
                  onRoomFull={handleRoomFull}
                  onRemoveRoom={handleRemoveRoom}
                />
              )
            ) : (
              <ChatWorkspace
                chatScrollRef={chatScrollRef}
                messagesEndRef={messagesEndRef}
                activeMessages={activeMessages}
                allMessages={allMessages}
                isTyping={isTyping}
                showScrollToBottom={showScrollToBottom}
                fileMenuVisible={fileMenuVisible}
                aiMenuVisible={aiMenuVisible}
                modelMenuVisible={modelMenuVisible}
                input={input}
                attachedFiles={attachedFiles}
                aiMode={aiMode}
                selectedModel={selectedModel}
                userIsVerified={profile.hasVerifiedEmail}
                onChatScroll={handleChatScroll}
                onScrollToBottom={() => {
                  autoScrollRef.current = true;
                  setShowScrollToBottom(false);
                  scrollToBottom("smooth");
                }}
                onSuggestionPress={handleSuggestionPress}
                onMorePromptsPress={handleMorePrompts}
                onOpenRayaCard={() => setRayaCardModalOpen(true)}
                onOpenPromo={() => setPromoModalOpen(true)}
                onOpenVerify={() => {
                  setAuthUpgradeMode(true);
                  setAuthEmailUpgraded(false);
                  setAuthModalVisible(true);
                }}
                onEditMessage={handleEditMessage}
                onNavigateBranch={handleNavigateBranch}
                onChangeText={setInput}
                onSend={handleSend}
                onFileButtonPress={() => setFileMenuVisible(true)}
                onAIOptionsPress={() => setAiMenuVisible(true)}
                onModelPress={() => setModelMenuVisible(true)}
                onVoicePress={handleVoicePress}
                onRemoveFile={handleRemoveFile}
                onAnchorsChange={({ fileButton, aiButton, modelButton }) => {
                  setFileMenuAnchor(fileButton);
                  setAiMenuAnchor(aiButton);
                  setModelMenuAnchor(modelButton);
                }}
              />
            )}
          </div>

          {/* No-hearts banner */}
          {!isRoomView && messageLimitActive && netMessages === 0 && (
            <div className="px-3 pb-1">
              <div className="mx-auto w-full max-w-[900px]">
                <div className="flex items-center gap-2 rounded-[20px] bg-red-50/70 backdrop-blur-sm border border-red-100/50 px-4 py-3 shadow-sm">
                  <Heart className="w-5 h-5 text-red-500 fill-red-400 shrink-0 animate-pulse" />
                  <span className="text-sm text-red-700 font-medium flex-1 leading-tight">
                    No hearts left!{regenCountdown ? <> Next heart in <NoTranslate>{regenCountdown}</NoTranslate>.</> : ""}
                  </span>
                  <button
                    onClick={() => setEarnHeartsVisible(true)}
                    className="text-sm font-bold text-red-600 underline underline-offset-4 hover:text-red-800 transition-colors shrink-0"
                  >
                    Earn more
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right sidebar — progress panel */}
        {isRoomView ? (
          <StudyRoomSidebar
            visible={learningHudVisible}
            onClose={() => setLearningHudVisible(false)}
            members={realRoomMembers.map(({ id, name, accent }) => ({
              id,
              name,
              role: 'Member',
              accent,
              streak: 0,
            }))}
            roomId={activeRoomId ? selectedRoom.id : undefined}
            roomName={activeRoomId ? selectedRoom.title : undefined}
            mission={activeRoomId ? selectedRoom.mission : undefined}
            timerStatus={activeRoomId ? (selectedRoom.timerStatus ?? "idle") : "idle"}
            timerEndsAt={activeRoomId ? selectedRoom.timerEndsAt ?? null : null}
            onlineCount={activeRoomId ? selectedRoom.onlineCount : undefined}
            maxMembers={activeRoomId ? (selectedRoom.maxMembers ?? 8) : undefined}
            roomAiMode={activeRoomId ? (selectedRoom.aiMode ?? "active") : undefined}
            files={activeRoomId ? selectedRoom.files : undefined}
          />
        ) : (
          <ProgressSidebar
            visible={learningHudVisible}
            onClose={() => setLearningHudVisible(false)}
            g={g}
            sharedBadgeId={sharedBadgeId}
            onShareBadge={handleShareBadge}
            onOpenXPOverview={() => setXpOverviewVisible(true)}
            userIsVerified={profile.hasVerifiedEmail}
            hasUnsavedProgress={hasUnsavedProgress}
            onVerify={() => setAuthModalVisible(true)}
            usageSummary={usageSummary}
            usageDescription={usageDescription}
            accountLabel={menuDisplayName}
            accountHandle={menuContact}
          />
        )}

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
          entitlements={entitlements}
          anchorEl={aiMenuAnchor}
          onOpenModelPicker={() => {
            setAiMenuVisible(false);
            setModelMenuVisible(true);
          }}
          onLockedModeSelect={handleLockedModeSelect}
        />
        <ModelPickerMenu
          visible={modelMenuVisible}
          onClose={() => setModelMenuVisible(false)}
          currentModel={selectedModel}
          onSelectModel={setSelectedModel}
          entitlements={entitlements}
          anchorEl={modelMenuAnchor}
          onLockedModelSelect={handleLockedModelSelect}
          changesRemaining={10} // Fallback or derived value
        />
        <PromptsModal
          visible={promptsModalVisible}
          onClose={() => setPromptsModalVisible(false)}
          onSelectPrompt={handleSelectPrompt}
        />
        <OnboardingModal
          visible={onboardingVisible}
          defaultName={profile.displayName}
          defaultUsername={profile.username}
          defaultSchoolLevel={profile.schoolLevel}
          loading={onboardingLoading}
          error={onboardingError}
          turnstileSiteKey={turnstileSiteKey}
          onComplete={handleCompleteOnboarding}
          onOpenRayaCard={() => {
            setOnboardingVisible(false);
            setRayaCardModalOpen(true);
          }}
        />
        <RayaCardModal 
          isOpen={rayaCardModalOpen} 
          onClose={() => setRayaCardModalOpen(false)} 
          defaultTab="restore" 
        />
        <PromoCodeModal
          isOpen={promoModalOpen}
          onClose={() => setPromoModalOpen(false)}
          onApplied={(nextEntitlements: UserEntitlements) => {
            setEntitlements(nextEntitlements);
            void refreshEntitlements();
          }}
        />
        <CreateRoomModal
          isOpen={createRoomModalOpen}
          onClose={() => setCreateRoomModalOpen(false)}
          onCreate={handleCreateRoom}
        />
        <JoinRoomModal
          isOpen={joinRoomModalOpen}
          onClose={() => setJoinRoomModalOpen(false)}
          onJoin={handleJoinRoom}
        />
        <InviteRoomModal
          isOpen={inviteRoomModalOpen}
          onClose={() => setInviteRoomModalOpen(false)}
          roomName={selectedRoom.title}
          inviteUrl={selectedRoomInviteUrl}
          onlineCount={selectedRoom.onlineCount}
        />

        {/* Modals */}
        <AuthModal
          visible={authModalVisible}
          onClose={() => {
            setAuthModalVisible(false);
            setAuthResetToken(undefined);
            setAuthUpgradeMode(false);
            setAuthEmailUpgraded(false);
          }}
          resetToken={authResetToken}
          upgradeMode={authUpgradeMode}
          emailUpgraded={authEmailUpgraded}
        />
        <XPOverviewModal
          visible={xpOverviewVisible}
          onClose={() => setXpOverviewVisible(false)}
          g={g}
        />
        {messageLimitActive && (
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
        )}
      </div>

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

      <AnimatePresence>
        {showEmailUpgradedBanner && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2.5 bg-sky-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg"
          >
            <span>✓</span>
            <span>Email confirmed — set your password to finish.</span>
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

      <AnimatePresence>
        {showLevelUpNudge && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-[90] w-[calc(100vw-2rem)] max-w-xs rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm"
          >
            <p className="text-sm font-semibold text-slate-900">Got a Level Up Code?</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Open your profile menu to unlock extra context, one more mode, and 50% off your first plan.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  setSidebarVisible(true);
                  setOpenLevelUpCodeRequest((value) => value + 1);
                  dismissLevelUpNudge();
                }}
                className="h-9 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
              >
                Open menu
              </button>
              <button
                onClick={dismissLevelUpNudge}
                className="h-9 rounded-xl bg-slate-100 px-3 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Not now
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <SmartPopup
        open={!!activePopup}
        tone={activePopup?.tone ?? "info"}
        title={activePopup?.title ?? ""}
        message={activePopup?.message ?? ""}
        primaryAction={activePopup?.primaryAction}
        secondaryAction={activePopup?.secondaryAction}
        onClose={closeActivePopup}
      />

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {(sidebarVisible || learningHudVisible) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSidebarVisible(false);
              setLearningHudVisible(false);
            }}
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>
    </>
  );
}
