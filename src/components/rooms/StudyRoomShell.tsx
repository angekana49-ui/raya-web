"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, Menu, Swords, UserPlus, Users, Sparkles } from "lucide-react";
import ChatInput from "@/components/chat/ChatInput";
import RoomMessageBubble from "@/components/rooms/RoomMessageBubble";
import { cn } from "@/lib/utils";
import type { AttachedFile, AlertKind } from "@/types";
import type { UserEntitlements } from "@/lib/user-entitlements";
import RoomAIOptionsMenu from "@/components/menus/RoomAIOptionsMenu";
import ModelPickerMenu from "@/components/menus/ModelPickerMenu";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { advanceStudyRoomTimer, getRoomParticipant } from "@/services/study-rooms.service";
import { DEFAULT_USER_ENTITLEMENTS } from "@/lib/user-entitlements";
import { useRoomSession, type RoomMessage } from "@/hooks/useRoomSession";
import { roomMessageToEvent } from "@/lib/roomMessageAdapter";

type RoomMember = {
  id: string;
  name: string;
  accent: string;
  status: "explaining" | "thinking" | "ready";
};

type RoomEvent = {
  id: string;
  type: "system" | "ai" | "user" | "reward";
  title: string;
  body: string;
  meta?: string;
  accent?: string;
  files?: AttachedFile[];
};

interface StudyRoomShellProps {
  roomName: string;
  mission: string;
  onlineCount: number;
  maxMembers: number;
  durationMinutes: number;
  timerEndsAt: string | null;
  timerStatus: "idle" | "running" | "finished";
  alert5mSent: boolean;
  alert2mSent: boolean;
  alertEndSent: boolean;
  squadXp: number;
  members: RoomMember[];
  events: RoomEvent[];
  onInvite?: () => void;
  onEngage?: () => void;
  onToggleSidebar?: () => void;
  onTogglePanel?: () => void;
  panelOpen?: boolean;
  /** Room Raya mode (distinct from solo chat `aiMode` on the home page). */
  roomAiMode?: "passive" | "active";
  files?: AttachedFile[];
  isCreator?: boolean;
  conversationId?: string;
  roomId?: string;
  currentUserId?: string;
  currentDbUserId?: string | null;
  onReturnToLobby?: () => void;
  onMembersSnapshotChange?: (members: Array<{ id: string; name: string; accent: string; status: RoomMember["status"] }>) => void;
  entitlements?: UserEntitlements;
  hasReport?: boolean;
}

const statusLabel: Record<RoomMember["status"], string> = {
  explaining: "Explaining",
  thinking: "Thinking",
  ready: "Ready",
};

const quickActions = [
  { label: "Explain", text: "I think the cleanest explanation is:", actionType: "explain" },
  { label: "Vote", text: "My vote goes to option", actionType: "vote" },
  { label: "Hint", text: "Small hint for the squad:", actionType: "hint" },
  { label: "Summarize", text: "Quick summary so far:", actionType: "summarize" },
];

const MAX_ROOM_ATTACHMENTS = 3;
const MAX_ROOM_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export default function StudyRoomShell({
  roomName,
  mission,
  onlineCount,
  maxMembers,
  durationMinutes,
  timerEndsAt,
  timerStatus,
  alert5mSent,
  alert2mSent,
  alertEndSent,
  squadXp,
  members,
  events,
  onInvite,
  onEngage,
  onToggleSidebar,
  onTogglePanel,
  panelOpen = false,
  roomAiMode = "active",
  files = [],
  isCreator = false,
  conversationId,
  roomId,
  currentUserId,
  currentDbUserId,
  onReturnToLobby,
  onMembersSnapshotChange,
  entitlements,
  hasReport = false,
}: StudyRoomShellProps) {
  const [roomMessages, setRoomMessages] = useState<RoomEvent[]>(events);
  const [draft, setDraft] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [momentum, setMomentum] = useState<"Low" | "Moderate" | "High" | "Deep Focus">("Moderate");
  const [headerPulse, setHeaderPulse] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const [roomFiles, setRoomFiles] = useState<AttachedFile[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [isPreparingAttachments, setIsPreparingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingActionTypeRef = useRef<string | undefined>(undefined);
  const pendingTurnRef = useRef<{
    clientMessageId: string;
    userTempId: string;
    userText: string;
    assistantTempId?: string;
  } | null>(null);
  const [aiModeInternal, setAiModeInternal] = useState<"passive" | "active">(roomAiMode || "active");
  const [aiModelInternal, setAiModelInternal] = useState("gemini-3.1-flash-lite");
  const [changesRemaining, setChangesRemaining] = useState(isCreator ? 5 : 1);
  const [liveOnlineCount, setLiveOnlineCount] = useState(onlineCount);
  const streamingTurnRef = useRef<string | null>(null);

  useEffect(() => {
    setAiModeInternal(roomAiMode || "active");
  }, [roomAiMode]);

  useEffect(() => {
    let alive = true;
    if (!roomId || !currentDbUserId) {
      setChangesRemaining(isCreator ? 5 : 1);
      return;
    }

    getRoomParticipant(roomId).then((participant) => {
      if (!alive || !participant) return;
      const remaining = Number(participant.mode_changes_left);
      if (Number.isFinite(remaining)) {
        setChangesRemaining(Math.max(0, remaining));
      }
    });

    return () => {
      alive = false;
    };
  }, [currentDbUserId, isCreator, roomId]);

  useEffect(() => {
    setLiveOnlineCount(onlineCount);
  }, [onlineCount]);

  const [aiMenuVisible, setAiMenuVisible] = useState(false);
  const [modelMenuVisible, setModelMenuVisible] = useState(false);
  const [isRayaTyping, setIsRayaTyping] = useState(false);
  const [remainingMs, setRemainingMs] = useState(() =>
    timerEndsAt ? Math.max(0, new Date(timerEndsAt).getTime() - Date.now()) : durationMinutes * 60 * 1000
  );
  const [timerNotice, setTimerNotice] = useState<{ id: string; text: string; kind: AlertKind } | null>(null);
  const [anchors, setAnchors] = useState<{
    fileButton: HTMLButtonElement | null;
    aiButton: HTMLButtonElement | null;
    modelButton: HTMLButtonElement | null;
  }>({ fileButton: null, aiButton: null, modelButton: null });

  useEffect(() => {
    // Reset on room change
    setRoomMessages(events);
    setDraft("");
    setMomentum("Moderate");
  }, [roomName]);

  const {
    participants,
    participantLookup,
    typingMembers,
    onlineCount: sessionOnlineCount,
    connectionState,
    notifyDraftActivity,
  } = useRoomSession({
    roomId,
    conversationId,
    currentUserId,
    currentDbUserId,
    onInitialMessages: (messages, lookup) => {
      if (messages.length === 0) return;
      setRoomMessages(
        messages.map((message) =>
          roomMessageToEvent(message, currentDbUserId, lookup),
        ),
      );
    },
    onMessageInserted: (message: RoomMessage, lookup) => {
      setRoomMessages((prev) => {
        if (prev.some((entry) => entry.id === message.id)) return prev;

        const pendingTurn = pendingTurnRef.current;
        if (
          message.sender === "user" &&
          pendingTurn &&
          pendingTurn.userText === message.text &&
          !!currentDbUserId &&
          message.senderUserId === currentDbUserId
        ) {
          pendingTurnRef.current = {
            ...pendingTurn,
            userTempId: message.id,
          };
          return prev.map((entry) =>
            entry.id === pendingTurn.userTempId
              ? { ...entry, id: message.id, title: "You", meta: "Just now" }
              : entry,
          );
        }

        if (message.sender === "assistant" && pendingTurn?.assistantTempId) {
          return prev.map((entry) =>
            entry.id === pendingTurn.assistantTempId
              ? {
                  ...entry,
                  id: message.id,
                  body: message.text,
                  meta: message.modelUsed || "Moderator",
                }
              : entry,
          );
        }

        return [...prev, roomMessageToEvent(message, currentDbUserId, lookup)];
      });
    },
    onSystemEvent: (body) => {
      setRoomMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "system",
          title: "Raya rooms",
          body,
          meta: "Live",
        },
      ]);
    },
  });

  useEffect(() => {
    notifyDraftActivity(draft);
  }, [draft, notifyDraftActivity]);

  const effectivePresenceCount = useMemo(() => {
    const rosterCount = participants.length;
    const presenceCount = sessionOnlineCount ?? null;
    const candidate = presenceCount == null
      ? Math.max(liveOnlineCount, rosterCount)
      : Math.max(presenceCount, rosterCount);

    return Math.min(candidate, maxMembers);
  }, [liveOnlineCount, maxMembers, participants.length, sessionOnlineCount]);

  useEffect(() => {
    setLiveOnlineCount(effectivePresenceCount);
  }, [effectivePresenceCount]);

  useEffect(() => {
    if (timerStatus === "finished") {
      setRemainingMs(0);
      return;
    }

    if (timerStatus === "idle" || !timerEndsAt) {
      setRemainingMs(durationMinutes * 60 * 1000);
      return;
    }

    // timerStatus === "running"
    const tick = () => {
      setRemainingMs(Math.max(0, new Date(timerEndsAt).getTime() - Date.now()));
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [durationMinutes, timerEndsAt, timerStatus]);

  // Momentum and typing activity are now tied to real events
  useEffect(() => {
    const momentumInterval = setInterval(() => {
      const states: typeof momentum[] = ["Low", "Moderate", "High", "Deep Focus"];
      setMomentum(states[Math.floor(Math.random() * states.length)]);
    }, 30000);

    return () => {
      clearInterval(momentumInterval);
    };
  }, []);

  const previousFlagsRef = useRef({
    alert5mSent,
    alert2mSent,
    alertEndSent,
    timerStatus,
  });
  const pendingAlertsRef = useRef<Set<"5m" | "2m" | "end">>(new Set());

  useEffect(() => {
    const previous = previousFlagsRef.current;
    const notices: Array<{ key: string; text: string }> = [];

    if (!previous.alert5mSent && alert5mSent) {
      notices.push({ key: "5m", text: "5 minutes left in this room." });
    }
    if (!previous.alert2mSent && alert2mSent) {
      notices.push({ key: "2m", text: "2 minutes left. Time to lock in the clearest answer." });
    }
    if ((!previous.alertEndSent && alertEndSent) || (previous.timerStatus !== "finished" && timerStatus === "finished")) {
      notices.push({ 
        key: "end", 
        text: "Session Complete! You've reached the end of your focused study block. Review your squad's findings below and don't forget to generate your final report." 
      });
    }

    notices.forEach((notice) => {
      setRoomMessages((prev) => {
        if (prev.some((event) => event.id === `timer-${notice.key}`)) return prev;
        return [
          ...prev,
          {
            id: `timer-${notice.key}`,
            type: "system",
            title: "Room Timer",
            body: notice.text,
            meta: "Timer",
            kind: notice.key as AlertKind,
          },
        ];
      });
      setTimerNotice({ id: notice.key, text: notice.text, kind: notice.key as AlertKind });
    });

    previousFlagsRef.current = {
      alert5mSent,
      alert2mSent,
      alertEndSent,
      timerStatus,
    };
  }, [alert2mSent, alert5mSent, alertEndSent, timerStatus]);

  useEffect(() => {
    if (!timerNotice) return;
    const timeout = window.setTimeout(() => setTimerNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [timerNotice]);

  useEffect(() => {
    if (!roomId || timerStatus !== "running") return;

    const maybeAdvance = async (kind: AlertKind) => {
      if (pendingAlertsRef.current.has(kind)) return;
      pendingAlertsRef.current.add(kind);
      try {
        await advanceStudyRoomTimer(roomId, kind);
      } finally {
        pendingAlertsRef.current.delete(kind);
      }
    };

    if (remainingMs <= 0 && !alertEndSent) {
      void maybeAdvance("end");
      return;
    }
    if (remainingMs <= 2 * 60 * 1000 && !alert2mSent) {
      void maybeAdvance("2m");
      return;
    }
    if (remainingMs <= 5 * 60 * 1000 && !alert5mSent) {
      void maybeAdvance("5m");
    }
  }, [alert2mSent, alert5mSent, alertEndSent, remainingMs, roomId, timerStatus]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (!autoScrollRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: isRayaTyping ? "auto" : "smooth" });
  }, [isRayaTyping, roomMessages]);

  useEffect(() => {
    if (!attachmentNotice) return;
    const timeout = window.setTimeout(() => setAttachmentNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [attachmentNotice]);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return {};
      return { Authorization: `Bearer ${session.access_token}` };
    } catch {
      return {};
    }
  };

  const appendSystemRoomEvent = (title: string, body: string, meta = "System") => {
    setRoomMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "system",
        title,
        body,
        meta,
      },
    ]);
  };

  const pushUserMessage = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed && roomFiles.length === 0) return;
    if (streamingTurnRef.current) {
      appendSystemRoomEvent(
        "Raya Busy",
        "Raya is already handling the current room turn. Wait for the reply to finish before sending another call.",
        "Room flow",
      );
      return;
    }

    onEngage?.();
    setHeaderPulse(true);
    setTimeout(() => setHeaderPulse(false), 1000);

    const userMessageId = `user-${Date.now()}`;
    const clientMessageId = `room-turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const actionType = pendingActionTypeRef.current;
    pendingActionTypeRef.current = undefined;
    pendingTurnRef.current = {
      clientMessageId,
      userTempId: userMessageId,
      userText: trimmed || "Attached files",
    };
    streamingTurnRef.current = clientMessageId;
    const userMessage: RoomEvent = {
      id: userMessageId,
      type: "user",
      title: "You",
      body: trimmed,
      meta: "Now",
      accent: "linear-gradient(135deg,#7c3aed,#ec4899)",
      files: roomFiles,
    };

    setRoomMessages((prev) => [...prev, userMessage]);

    // Convert files into persistent Supabase Storage URLs to bypass Vercel 5MB limits
    let filePayloads: Array<{
      name: string;
      type: AttachedFile["type"];
      mimeType?: string;
      url?: string;
    }> = [];

    if (roomFiles.length > 0) {
      setIsPreparingAttachments(true);
      try {
        const uploadPromises = roomFiles.map(async (f) => {
          if (!f.url) return null;
          try {
            const res = await fetch(f.url);
            const blob = await res.blob();
            const safeName = f.name.replace(/[^a-zA-Z0-9.-]/g, "_");
            const fileName = `rooms/${roomId || 'temp'}/${Date.now()}-${safeName}`;
            
            const { data, error } = await supabase.storage.from("room_assets").upload(fileName, blob);
            if (!error && data) {
              const { data: publicData } = supabase.storage.from("room_assets").getPublicUrl(fileName);
              return {
                name: f.name,
                type: f.type,
                mimeType: f.mimeType,
                url: publicData.publicUrl,
              };
            }
            return null;
          } catch {
            return null;
          }
        });
        
        const results = await Promise.all(uploadPromises);
        filePayloads = results.filter(Boolean) as typeof filePayloads;
      } finally {
        setIsPreparingAttachments(false);
      }
    }

    setRoomFiles([]);
    setDraft("");

    // REAL STREAMING logic
    try {
      setIsRayaTyping(true);
      const authHeaders = await getAuthHeaders();

      // Extract fileUrls to append to the message payload ensuring Room events receive file context
      let finalMessage = trimmed || "Attached files";
      if (filePayloads.length > 0) {
        const fileUrls = filePayloads.map(f => f.url).filter(Boolean);
        if (fileUrls.length > 0) {
           finalMessage += `\n\n[Attached file URLs: ${fileUrls.join(", ")}]`;
        }
      }

      const res = await fetch("/api/raya/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          clientMessageId,
          message: finalMessage,
          aiMode: aiModeInternal,
          model: aiModelInternal,
          roomMission: mission,
          actionType,
          conversationId, // Pass the conversation ID
          files: filePayloads,
        }),
      });

      if (!res.ok) {
        let errMsg = `Stream failed (${res.status})`;
        try {
          const errBody = await res.json();
          errMsg = errBody.error || errBody.message || errMsg;
          console.error("[RAYA Room] API error:", errBody);
        } catch {
          /* non-JSON error body */
        }
        if (res.status === 401) {
          errMsg =
            "Please log in so Raya can reply in this room (the conversation is linked to your account).";
        }
        if (res.status === 409 && errMsg.toLowerCase().includes("closed")) {
          errMsg = "This room session has ended (read-only).";
        }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const assistantId = `ai-${Date.now()}`;
      let assistantIdAdded = false;
      const ensureAssistantPlaceholder = () => {
        if (assistantIdAdded) return;
        if (pendingTurnRef.current?.clientMessageId === clientMessageId) {
          pendingTurnRef.current = {
            ...pendingTurnRef.current,
            assistantTempId: assistantId,
          };
        }
        setRoomMessages((prev) => {
          if (prev.some((entry) => entry.id === assistantId)) return prev;
          return [
            ...prev,
            { id: assistantId, type: "ai", title: "RAYA Host", body: "", meta: "Moderator" },
          ];
        });
        assistantIdAdded = true;
      };

      const decoder = new TextDecoder();
      let assistantText = "";
      let sseBuffer = "";

      const handleStreamEvent = (data: any) => {
        if (data.type === "chunk" && data.content) {
          assistantText += data.content;
          ensureAssistantPlaceholder();
          setRoomMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, body: assistantText } : m))
          );
          return;
        }

        if (data.type === "complete" && data.content?.rayaSkipped) {
          setRoomMessages((prev) => prev.filter((entry) => entry.id !== assistantId));
          if (pendingTurnRef.current?.clientMessageId === clientMessageId) {
            pendingTurnRef.current = null;
          }
          streamingTurnRef.current = null;
          const hint =
            data.content?.rayaSkipReason === "passive_no_trigger"
              ? "Raya stays quiet in passive mode. Mention @raya or use a quick action (Hint, Summarize...) to bring her in."
              : "Raya did not reply to this message under the current room rules.";
          appendSystemRoomEvent("Raya", hint, "Room mode");
          return;
        }

        if (data.type === "complete" && data.content?.text) {
          ensureAssistantPlaceholder();
          setRoomMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, body: data.content.text } : m))
          );
          return;
        }

        if (data.type === "ids_resolved" && data.content) {
          const resolvedUserId = data.content.userMessageId as string | undefined;
          const resolvedAssistantId = data.content.assistantMessageId as string | undefined;
          const pendingTurn = pendingTurnRef.current;

          if (pendingTurn?.clientMessageId === clientMessageId) {
            setRoomMessages((prev) =>
              prev.map((entry) => {
                if (resolvedUserId && entry.id === pendingTurn.userTempId) {
                  return { ...entry, id: resolvedUserId };
                }
                if (resolvedAssistantId && pendingTurn.assistantTempId && entry.id === pendingTurn.assistantTempId) {
                  return { ...entry, id: resolvedAssistantId };
                }
                return entry;
              }),
            );
            pendingTurnRef.current = null;
          }
          streamingTurnRef.current = null;
          return;
        }

        if (data.type === "error") {
          throw new Error(data.error || "Raya stream error");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const completeEvents = sseBuffer.split("\n\n");
        sseBuffer = completeEvents.pop() ?? "";
        const lines = completeEvents.flatMap((event) =>
          event.split("\n").filter((line) => line.startsWith("data: ")),
        );

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk" && data.content) {
                assistantText += data.content;
                ensureAssistantPlaceholder();
                setRoomMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, body: assistantText } : m))
                );
              } else if (data.type === "complete" && data.content?.rayaSkipped) {
                setRoomMessages((prev) => prev.filter((entry) => entry.id !== assistantId));
                if (pendingTurnRef.current?.clientMessageId === clientMessageId) {
                  pendingTurnRef.current = null;
                }
                streamingTurnRef.current = null;
                  const hint =
                    data.content?.rayaSkipReason === "passive_no_trigger"
                      ? "Raya stays quiet in passive mode. Mention @raya or use a quick action (Hint, Summarize…) to bring her in."
                      : "Raya did not reply to this message under the current room rules.";
                  appendSystemRoomEvent("Raya", hint, "Room mode");
              } else if (data.type === "complete" && data.content?.text) {
                ensureAssistantPlaceholder();
                setRoomMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, body: data.content.text } : m))
                );
              } else if (data.type === "ids_resolved" && data.content) {
                const resolvedUserId = data.content.userMessageId as string | undefined;
                const resolvedAssistantId = data.content.assistantMessageId as string | undefined;
                const pendingTurn = pendingTurnRef.current;

                if (pendingTurn?.clientMessageId === clientMessageId) {
                  setRoomMessages((prev) =>
                    prev.map((entry) => {
                      if (resolvedUserId && entry.id === pendingTurn.userTempId) {
                        return { ...entry, id: resolvedUserId };
                      }
                      if (resolvedAssistantId && pendingTurn.assistantTempId && entry.id === pendingTurn.assistantTempId) {
                        return { ...entry, id: resolvedAssistantId };
                      }
                      return entry;
                    }),
                  );
                  pendingTurnRef.current = null;
                }
                streamingTurnRef.current = null;
              } else if (data.type === "error") {
                throw new Error(data.error || "Raya stream error");
              }
            } catch (e) {
              if (e instanceof Error) throw e;
              throw new Error("Raya stream parse error");
            }
          }
        }
      }

      const tail = sseBuffer.trim();
      if (tail.startsWith("data: ")) {
        handleStreamEvent(JSON.parse(tail.slice(6)));
      }
    } catch (err) {
      console.error("Streaming error:", err);
      const pendingTurn = pendingTurnRef.current;
      if (pendingTurn?.clientMessageId === clientMessageId) {
        setRoomMessages((prev) => prev.filter((entry) => entry.id !== pendingTurn.assistantTempId));
      }
      pendingTurnRef.current = null;
      streamingTurnRef.current = null;
      appendSystemRoomEvent(
        "Connection Error",
        err instanceof Error && err.message
          ? err.message
          : "Raya is having trouble connecting to the intelligence engine.",
      );
    } finally {
      if (streamingTurnRef.current === clientMessageId) {
        streamingTurnRef.current = null;
      }
      setIsRayaTyping(false);
    }
  };

  const handleFileButtonPress = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const availableSlots = Math.max(0, MAX_ROOM_ATTACHMENTS - roomFiles.length);
    const incomingFiles = Array.from(selectedFiles);

    if (availableSlots === 0) {
      setAttachmentNotice(`Room messages support up to ${MAX_ROOM_ATTACHMENTS} files at once.`);
      e.target.value = "";
      return;
    }

    const acceptedFiles = incomingFiles
      .filter((file) => {
        if (file.size > MAX_ROOM_ATTACHMENT_BYTES) {
          setAttachmentNotice(`${file.name} is too large. Keep files under 15 MB.`);
          return false;
        }
        return true;
      })
      .slice(0, availableSlots);

    if (acceptedFiles.length < incomingFiles.length) {
      setAttachmentNotice(`Only ${MAX_ROOM_ATTACHMENTS} files can be attached to one room turn.`);
    }

    const newFiles: AttachedFile[] = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      type: file.type.startsWith("image/") ? "image" : file.type === "application/pdf" ? "pdf" : "document",
      url: URL.createObjectURL(file), // Local blob URL
      size: file.size,
      mimeType: file.type,
    }));

    setRoomFiles((prev) => [...prev, ...newFiles]);
    // Reset input so the same file can be picked again
    e.target.value = "";
  };

  const handleRemoveFile = (fileId: string) => {
    setRoomFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleVoicePress = () => {
    playUISound("click");
    // Mock UI for voice
    alert("Voice recording coming soon to Rooms!");
    onEngage?.();
  };

  const playUISound = (type: "pop" | "click" | "msg") => {
    if (typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "pop") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      } else if (type === "click") {
        osc.type = "square";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      }

      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      console.warn("Audio Context failed", e);
    }
  };

  const handleModeChange = async (newMode: "passive" | "active") => {
    if (newMode === aiModeInternal) return;
    if (changesRemaining <= 0) {
      alert("No more AI mode changes left for this session!");
      return;
    }

    try {
      if (!roomId) throw new Error("Room id missing.");
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/rooms/${roomId}/mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ aiMode: newMode }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Could not update AI mode.");
      }

      const updatedMode = payload?.data?.aiMode === "passive" ? "passive" : "active";
      const remaining = Number(payload?.data?.changesRemaining);
      setAiModeInternal(updatedMode);
      if (Number.isFinite(remaining)) {
        setChangesRemaining(Math.max(0, remaining));
      }

      const systemMsg: RoomEvent = {
        id: `sys-${Date.now()}`,
        type: "system",
        title: "Settings Updated",
        body: `AI behavior switched to ${updatedMode.toUpperCase()} mode.`,
        meta: "System",
      };
      setRoomMessages(prev => [...prev, systemMsg]);
    } catch (error: any) {
      appendSystemRoomEvent(
        "Settings Not Updated",
        error?.message || "Raya could not update the shared AI mode.",
      );
    }
  };

  const handleModelChange = (newModel: string) => {
    setAiModelInternal(newModel);

    // Notify room (simulated)
    const systemMsg: RoomEvent = {
      id: `sys-mod-${Date.now()}`,
      type: "system",
      title: "Model Updated",
      body: `Intelligence model switched to ${newModel.toUpperCase()}.`,
      meta: "System",
    };
    setRoomMessages(prev => [...prev, systemMsg]);
  };

  const handleSend = () => {
    autoScrollRef.current = true;
    setShowScrollToBottom(false);
    pushUserMessage(draft);
    playUISound("pop");
  };

  const handleQuickAction = (text: string, actionType: string) => {
    onEngage?.();
    pendingActionTypeRef.current = actionType;
    setDraft(text);
  };

  const handleScroll = () => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    autoScrollRef.current = isNearBottom;
    setShowScrollToBottom(!isNearBottom);
  };

  const scrollToBottom = () => {
    if (feedRef.current) {
      autoScrollRef.current = true;
      setShowScrollToBottom(false);
      feedRef.current.scrollTo({
        top: feedRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const liveMembers = useMemo(
    () =>
    participants.length > 0
      ? participants.map((participant, index) => ({
          id: participant.userId,
          name: participant.displayName || participantLookup[participant.userId] || "Member",
          accent: `linear-gradient(135deg, ${
            ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#0891b2", "#be185d", "#65a30d"][index % 8]
          }, ${
            ["#60a5fa", "#a78bfa", "#34d399", "#f87171", "#fbbf24", "#22d3ee", "#f472b6", "#a3e635"][index % 8]
          })`,
          status: "ready" as const,
        }))
      : members,
    [members, participantLookup, participants],
  );

  useEffect(() => {
    onMembersSnapshotChange?.(liveMembers);
  }, [liveMembers, onMembersSnapshotChange]);
  const isFinished = timerStatus === "finished" || (timerStatus === "running" && remainingMs <= 0);
  const timeLeftLabel =
    isFinished
      ? "00:00"
      : `${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  const totalDurationMs = Math.max(durationMinutes * 60 * 1000, 1);
  const elapsedRatio =
    isFinished
      ? 1
      : timerStatus === "idle"
        ? 0
        : Math.min(1, Math.max(0, (totalDurationMs - remainingMs) / totalDurationMs));
  const roomLocked = Boolean(streamingTurnRef.current);
  const sessionPhaseLabel =
    timerStatus === "finished"
      ? "Session complete"
      : elapsedRatio < 0.33
        ? "Opening phase"
        : elapsedRatio < 0.8
          ? "Work phase"
          : "Final stretch";

  // Report generation
  const [reportLoading, setReportLoading] = useState(false);
  const [reportDone, setReportDone] = useState(hasReport);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [reportPreviewHtml, setReportPreviewHtml] = useState<string | null>(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPrintRequested, setReportPrintRequested] = useState(false);
  const reportFrameRef = useRef<HTMLIFrameElement | null>(null);
  const autoReportStartedRef = useRef(false);
  useEffect(() => {
    setReportDone(hasReport);
    setReportError(null);
    if (hasReport) {
      autoReportStartedRef.current = true;
    }
  }, [hasReport]);

  const handleOpenReport = async (
    mode: "view" | "pdf" = "pdf",
  ) => {
    if (!roomId) return;

    try {
      setReportPreviewLoading(true);
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`/api/rooms/report/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          roomId,
          print: mode === "pdf",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Failed to open report (${response.status})`);
      }

      const html = await response.text();
      setReportPreviewHtml(html);
      setReportPreviewOpen(true);
      setReportPrintRequested(mode === "pdf");
    } catch (error) {
      console.error("[RAYA] Failed to open room report:", error);
      setReportError("Could not open the room report right now.");
    } finally {
      setReportPreviewLoading(false);
    }
  };

  const handleGenerateReport = async (options?: { openAfter?: boolean }) => {
    if (!roomId || reportLoading) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/rooms/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ roomId }),
      });
      if (res.ok) {
        setReportDone(true);
        if (options?.openAfter) {
          void handleOpenReport("pdf");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('[RAYA] Report generation failed:', err);
        setReportError(err.error || 'Failed to generate report');
      }
    } catch (e) {
      console.error('[RAYA] Report generation error:', e);
      setReportError("The room report could not be generated right now.");
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (!isFinished || reportDone || autoReportStartedRef.current) return;
    autoReportStartedRef.current = true;
    void handleGenerateReport({ openAfter: false });
  }, [isFinished, reportDone]);

  const handlePrintPreview = () => {
    const frameWindow = reportFrameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.focus();
    frameWindow.print();
  };

  useEffect(() => {
    if (!reportPreviewOpen || !reportPrintRequested) return;
    const frameWindow = reportFrameRef.current?.contentWindow;
    if (!frameWindow) return;

    const timeout = window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      setReportPrintRequested(false);
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [reportPreviewHtml, reportPreviewOpen, reportPrintRequested]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[980px] flex-col px-2 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
      <div className="sticky top-0 z-20 mx-auto w-full max-w-[620px]">
        <div className="rounded-[22px] border border-slate-200/80 bg-white/78 shadow-[0_16px_40px_rgba(15,23,42,0.05)] backdrop-blur-sm overflow-hidden transition-all duration-300">
          {/* Top Bar - Always Visible */}
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleSidebar}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <Menu className="h-3.5 w-3.5" />
              </button>

              <div
                className="cursor-pointer select-none"
                onClick={() => {
                  setHeaderExpanded(!headerExpanded);
                  playUISound("click");
                }}
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black tracking-tight text-slate-900 truncate max-w-[120px] sm:max-w-[200px]">
                    {roomName}
                  </h2>
                  <div className={cn(
                    "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
                    timerStatus === "finished" ? "bg-slate-100 text-slate-400 border border-slate-200" :
                    timerStatus === "running" ? "bg-red-50 text-red-600 border border-red-100 ring-2 ring-red-500/10" :
                    "bg-slate-100 text-slate-500 border border-slate-200"
                  )}>
                    <span className="relative flex h-1.5 w-1.5">
                      {timerStatus === "running" && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      )}
                      <span className={cn(
                        "relative inline-flex rounded-full h-1.5 w-1.5",
                        timerStatus === "running" ? "bg-red-500" : "bg-slate-400"
                      )}></span>
                    </span>
                    {timeLeftLabel}
                    <ChevronDown className={cn(
                      "h-3 w-3 ml-0.5 transition-transform duration-300",
                      headerExpanded && "rotate-180"
                    )} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onTogglePanel}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", panelOpen && "rotate-180")} />
              </button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {timerNotice && (
              <motion.div
                key={timerNotice.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={cn(
                  "border-t border-b px-4 py-2 text-center backdrop-blur-md",
                  timerNotice.kind === 'end' ? "bg-red-50/90 border-red-100 text-red-700" :
                  timerNotice.kind === '2m' ? "bg-orange-50/90 border-orange-100 text-orange-700" :
                  "bg-amber-50/90 border-amber-100 text-amber-700"
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  {timerNotice.kind === 'end' && <Swords className="h-3 w-3 animate-pulse" />}
                  <p className="text-[11px] font-black uppercase tracking-[0.05em]">
                    {timerNotice.text}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2">
            <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              <span>{sessionPhaseLabel}</span>
              <span>{Math.round(elapsedRatio * 100)}% session progress</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  isFinished
                    ? "bg-gradient-to-r from-amber-500 to-orange-500"
                    : elapsedRatio > 0.8
                      ? "bg-gradient-to-r from-orange-500 to-red-500"
                      : "bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500"
                )}
                animate={{ width: `${Math.max(elapsedRatio * 100, isFinished ? 100 : 4)}%` }}
                transition={{ ease: "easeOut", duration: 0.35 }}
              />
            </div>
          </div>

          {/* Collapsible Content */}
          <AnimatePresence>
            {headerExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden border-t border-slate-100/50"
              >
                <div className="px-4 pb-4 pt-3 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                      {Math.min(liveOnlineCount, maxMembers)}/{maxMembers} online
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                        connectionState === "connected"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : connectionState === "reconnecting"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-100 text-slate-500",
                      )}
                    >
                      {connectionState === "connected"
                        ? "Live"
                        : connectionState === "reconnecting"
                          ? "Reconnecting..."
                          : "Connecting..."}
                    </span>
                    <motion.span
                      animate={headerPulse ? { scale: [1, 1.1, 1], backgroundColor: ["#f5f3ff", "#ddd6fe", "#f5f3ff"] } : {}}
                      className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700"
                    >
                      +{squadXp} squad XP
                    </motion.span>
                    <span className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide border",
                      momentum === "Deep Focus" ? "bg-indigo-600 text-white border-indigo-700" :
                        momentum === "High" ? "bg-orange-100 text-orange-700 border-orange-200" :
                          "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {momentum}
                    </span>
                  </div>

                  <p className="mx-auto mt-3 max-w-[500px] text-[11px] leading-relaxed text-slate-500 sm:text-xs font-medium italic">
                    {mission}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onEngage?.();
                        onInvite?.();
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white transition-all hover:bg-slate-800 active:scale-95 shadow-lg shadow-slate-200"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Invite Teammate
                    </button>
                    <button
                      type="button"
                      onClick={() => setInfoOpen((prev) => !prev)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-wide transition-all active:scale-95",
                        infoOpen
                          ? "bg-slate-100 border-slate-200 text-slate-800"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Squad Details
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", infoOpen && "rotate-180")} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {infoOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-t border-slate-100"
              >
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <Users className="h-3.5 w-3.5 text-sky-500" />
                      Online
                    </div>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {Math.min(liveOnlineCount, maxMembers)}/{maxMembers}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                      AI Mode
                    </div>
                    <p className="mt-1 text-sm font-black text-slate-900 capitalize">{aiModeInternal}</p>
                  </div>

                  {files.length > 0 && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 px-3 py-2 shadow-sm">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                        <UserPlus className="h-3.5 w-3.5 text-indigo-500" />
                        Resources
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {files.map((file) => (
                          <div key={file.id} className="text-[10px] font-bold text-indigo-700 bg-white px-1.5 py-0.5 rounded-lg border border-indigo-100">
                            {file.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2">
                      {liveMembers.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
                        >
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black text-white"
                            style={{ background: member.accent }}
                          >
                            {member.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-bold text-slate-800">{member.name}</p>
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                              {statusLabel[member.status]}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-1 py-3 sm:px-2 sm:py-4 scroll-smooth"
      >
        <div className="space-y-3 pb-3">
          {roomMessages.map((event, index) => (
            <RoomMessageBubble key={event.id} event={event} index={index} />
          ))}

          <AnimatePresence>
            {typingMembers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex items-center gap-2 px-2 py-1"
              >
                <div className="flex gap-1">
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                </div>
                <span className="text-[10px] font-medium text-slate-400 italic">
                  {typingMembers.length === 1
                    ? `${typingMembers[0]} is thinking...`
                    : `${typingMembers.length} members are thinking...`}
                </span>
              </motion.div>
            )}
            {isRayaTyping && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="flex items-center gap-2 px-2 py-1"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 shadow-sm border border-indigo-100">
                  <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                </div>
                <span className="text-[11px] font-bold text-indigo-500 italic">Raya is thinking...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* End-of-Room Overlay */}
      {isFinished && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-[620px] mt-4"
        >
          <div className="rounded-[22px] border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-orange-50/60 p-6 text-center backdrop-blur-sm shadow-lg">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mb-3">
              <Swords className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Session Complete</h3>
            <p className="mt-1 text-sm text-slate-500 font-medium">
              {roomName} has ended. Messages are now read-only.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              We keep the transcript intact, then package the session into a printable squad report.
            </p>

            {reportLoading && (
              <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
                Preparing the final room report and PDF view...
              </div>
            )}

            {reportError && !reportLoading && (
              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {reportError}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {!reportDone ? (
                <button
                  onClick={() => void handleGenerateReport({ openAfter: true })}
                  disabled={reportLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
                >
                  {reportLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Generate Squad Report</>
                  )}
                </button>
              ) : (
                <>
                <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-5 py-2.5 text-sm font-bold text-emerald-700 border border-emerald-200">
                  Report ready
                </span>
                
                <button
                  onClick={() => void handleOpenReport("pdf")}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-5 py-2.5 text-sm font-bold text-emerald-700 transition-all hover:bg-emerald-50 active:scale-95"
                >
                  <Sparkles className="h-4 w-4" /> Open / Save as PDF
                </button>
                </>
              )}
              {onReturnToLobby && (
                <button
                  onClick={onReturnToLobby}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                >
                  Return to Lobby
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      <div className="sticky bottom-0 z-20 mt-2 rounded-[26px] bg-[linear-gradient(180deg,rgba(252,253,254,0)_0%,rgba(252,253,254,0.92)_18%,rgba(252,253,254,0.98)_100%)] px-1 pb-[calc(env(safe-area-inset-bottom,0px)+4px)] pt-3 backdrop-blur-md sm:mt-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {!isFinished && quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => handleQuickAction(action.text, action.actionType)}
              disabled={roomLocked}
              className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
        {roomLocked && !isFinished && (
          <div className="mb-3 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-[11px] font-semibold text-indigo-700">
            Raya is resolving the current room turn. The next prompt will feel much cleaner if we let this answer finish first.
          </div>
        )}
        {isPreparingAttachments && !isFinished && (
          <div className="mb-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-[11px] font-semibold text-amber-700">
            Preparing attached files for the room turn...
          </div>
        )}
        {attachmentNotice && !isFinished && (
          <div className="mb-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-[11px] font-semibold text-slate-600">
            {attachmentNotice}
          </div>
        )}
        <ChatInput
          value={draft}
          onChangeText={setDraft}
          onSend={handleSend}
          onFileButtonPress={handleFileButtonPress}
          onAIOptionsPress={() => setAiMenuVisible(true)}
          onModelPress={() => setModelMenuVisible(true)}
          onVoicePress={handleVoicePress}
          files={roomFiles}
          onRemoveFile={handleRemoveFile}
          aiMode={aiModeInternal}
          selectedModel={aiModelInternal}
          onAnchorsChange={setAnchors}
          disabled={isFinished || isPreparingAttachments}
          isTyping={isRayaTyping}
          placeholder={
            isFinished
              ? "This room session has ended. Messages are read-only."
              : isPreparingAttachments
                ? "Preparing room files..."
              : roomLocked
                ? "Raya is finishing the current room turn..."
                : "Reply freely, challenge an idea, explain your reasoning, or help someone catch up..."
          }
        />
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
        />

        <RoomAIOptionsMenu
          visible={aiMenuVisible}
          onClose={() => setAiMenuVisible(false)}
          currentMode={aiModeInternal}
          onModeChange={handleModeChange}
          anchorEl={anchors.aiButton}
          isCreator={!!isCreator}
          changesRemaining={changesRemaining}
        />

        <ModelPickerMenu
          visible={modelMenuVisible}
          onClose={() => setModelMenuVisible(false)}
          currentModel={aiModelInternal}
          onSelectModel={handleModelChange}
          entitlements={DEFAULT_USER_ENTITLEMENTS}
          anchorEl={anchors.modelButton}
          changesRemaining={changesRemaining}
        />
      </div>

        <AnimatePresence>
        {showScrollToBottom && (
          <motion.button
            initial={{ opacity: 0, y: 10, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 10, x: "-50%" }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={scrollToBottom}
            className="absolute bottom-32 left-1/2 z-30 inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 px-3 py-2 text-white shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
            aria-label="Jump to latest messages"
          >
            <ChevronDown className="h-4 w-4 animate-bounce-subtle" />
            <span className="text-[11px] font-black uppercase tracking-wide">Latest</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reportPreviewOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-sm"
          >
            <div className="flex h-full w-full items-center justify-center p-3 sm:p-6">
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.98 }}
                className="flex h-full max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Room Report</p>
                    <h3 className="text-sm font-black text-slate-900 sm:text-base">{roomName}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrintPreview}
                      disabled={!reportPreviewHtml}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                    >
                      Print / Save PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReportPreviewOpen(false);
                        setReportPrintRequested(false);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="flex-1 bg-slate-100">
                  {reportPreviewLoading || !reportPreviewHtml ? (
                    <div className="flex h-full items-center justify-center px-6 text-center">
                      <div className="space-y-3">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
                          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                        </div>
                        <p className="text-sm font-semibold text-slate-600">Preparing the report preview...</p>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      ref={reportFrameRef}
                      title={`${roomName} report preview`}
                      srcDoc={reportPreviewHtml}
                      className="h-full w-full bg-white"
                    />
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
