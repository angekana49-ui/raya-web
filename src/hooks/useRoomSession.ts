"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getRoomMessages } from "@/services/study-rooms.service";

export type RoomMessage = {
  id: string;
  sender: "user" | "assistant";
  senderUserId: string | null;
  text: string;
  timestamp: string;
  modelUsed?: string | null;
};

export type RoomParticipant = {
  id: string;
  userId: string;
  joinedAt: string;
  displayName?: string;
};

type ConnectionState = "connecting" | "connected" | "reconnecting" | "error";

type UseRoomSessionOptions = {
  roomId?: string;
  conversationId?: string;
  currentUserId?: string;
  currentDbUserId?: string | null;
  enabled?: boolean;
  onInitialMessages?: (messages: RoomMessage[], participantLookup: Record<string, string>) => void;
  onMessageInserted?: (message: RoomMessage, participantLookup: Record<string, string>) => void;
  onSystemEvent?: (body: string) => void;
};

type UseRoomSessionResult = {
  participants: RoomParticipant[];
  participantLookup: Record<string, string>;
  typingMembers: string[];
  onlineCount: number | null;
  connectionState: ConnectionState;
  notifyDraftActivity: (text: string) => void;
};

function mapRoomMessage(row: any): RoomMessage {
  return {
    id: row.id,
    sender: row.sender,
    senderUserId: row.sender_user_id ?? null,
    text: row.text,
    timestamp: row.timestamp,
    modelUsed: row.model_used ?? null,
  };
}

function mapParticipant(row: any): RoomParticipant {
  return {
    id: row.id,
    userId: row.user_id,
    joinedAt: row.joined_at,
    displayName: row.users?.display_name ?? row.users?.username ?? undefined,
  };
}

function buildParticipantLookup(participants: RoomParticipant[]) {
  return participants.reduce<Record<string, string>>((acc, participant) => {
    acc[participant.userId] = participant.displayName || "Member";
    return acc;
  }, {});
}

export function useRoomSession({
  roomId,
  conversationId,
  currentUserId,
  currentDbUserId,
  enabled = true,
  onInitialMessages,
  onMessageInserted,
  onSystemEvent,
}: UseRoomSessionOptions): UseRoomSessionResult {
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [typingMembers, setTypingMembers] = useState<string[]>([]);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const presenceKeyRef = useRef(
    currentDbUserId || currentUserId || `guest-${Math.random().toString(36).slice(2, 10)}`,
  );
  const onInitialMessagesRef = useRef(onInitialMessages);
  const onMessageInsertedRef = useRef(onMessageInserted);
  const onSystemEventRef = useRef(onSystemEvent);
  const lastMessageTimestampRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const participantLookupRef = useRef<Record<string, string>>({});
  const messageChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const membershipSnapshotRef = useRef<Set<string>>(new Set());
  const participantsHydratedRef = useRef(false);
  const lastTrackedTypingRef = useRef<boolean | null>(null);
  const lastParticipantKeyRef = useRef<string>("");

  useEffect(() => {
    onInitialMessagesRef.current = onInitialMessages;
  }, [onInitialMessages]);

  useEffect(() => {
    onMessageInsertedRef.current = onMessageInserted;
  }, [onMessageInserted]);

  useEffect(() => {
    onSystemEventRef.current = onSystemEvent;
  }, [onSystemEvent]);

  const participantLookup = useMemo(
    () => buildParticipantLookup(participants),
    [participants],
  );

  useEffect(() => {
    participantLookupRef.current = participantLookup;
  }, [participantLookup]);

  const resolveParticipantName = useCallback(async (userId: string | null | undefined) => {
    if (!userId) return null;

    const cached = participantLookupRef.current[userId];
    if (cached) return cached;

    const { data, error } = await supabase
      .from("users")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("[useRoomSession] Failed to resolve participant name:", error);
      return null;
    }

    const resolvedName = data?.display_name ?? data?.username ?? null;
    if (!resolvedName) return null;

    participantLookupRef.current = {
      ...participantLookupRef.current,
      [userId]: resolvedName,
    };

    setParticipants((prev) => {
      if (prev.some((participant) => participant.userId === userId)) {
        return prev.map((participant) =>
          participant.userId === userId
            ? { ...participant, displayName: participant.displayName || resolvedName }
            : participant,
        );
      }
      return prev;
    });

    return resolvedName;
  }, []);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return {};
      return { Authorization: `Bearer ${session.access_token}` };
    } catch {
      return {};
    }
  }, []);

  const emitMembershipDelta = useCallback(async (nextParticipants: RoomParticipant[]) => {
    if (!participantsHydratedRef.current) {
      membershipSnapshotRef.current = new Set(nextParticipants.map((participant) => participant.userId));
      participantsHydratedRef.current = true;
      return;
    }

    const previousIds = membershipSnapshotRef.current;
    const nextIds = new Set(nextParticipants.map((participant) => participant.userId));
    membershipSnapshotRef.current = nextIds;

    const joinedIds = Array.from(nextIds).filter((userId) => !previousIds.has(userId));
    const leftIds = Array.from(previousIds).filter((userId) => !nextIds.has(userId));

    for (const joiningUserId of joinedIds) {
      if (joiningUserId === currentDbUserId) continue;
      const name =
        (await resolveParticipantName(joiningUserId)) ||
        participantLookupRef.current[joiningUserId] ||
        "A member";
      onSystemEventRef.current?.(`${name} joined the room.`);
    }

    for (const leavingUserId of leftIds) {
      if (leavingUserId === currentDbUserId) continue;
      const name =
        participantLookupRef.current[leavingUserId] ||
        (await resolveParticipantName(leavingUserId)) ||
        "A member";
      onSystemEventRef.current?.(`${name} left the room.`);
    }
  }, [currentDbUserId, resolveParticipantName]);

  const loadParticipants = useCallback(async (options?: { emitDelta?: boolean }) => {
    if (!enabled || !roomId) {
      setParticipants([]);
      membershipSnapshotRef.current = new Set();
      participantsHydratedRef.current = false;
      return [];
    }

    let nextParticipants: RoomParticipant[] = [];

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/rooms/${roomId}/participants`, { headers });
      if (!res.ok) throw new Error(`participants request failed (${res.status})`);
      const payload = await res.json();
      nextParticipants = ((payload?.data || []) as any[]).map((row) => ({
        id: row.id,
        userId: row.id,
        joinedAt: row.joinedAt || new Date().toISOString(),
        displayName: row.displayName ?? row.username ?? undefined,
      }));
    } catch (routeError) {
      console.error("[useRoomSession] Participants route failed:", routeError);

      const { data, error } = await supabase
        .from("study_room_participants")
        .select(`
          id,
          user_id,
          joined_at,
          users ( display_name, username )
        `)
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (error) {
        console.error("[useRoomSession] Failed to load participants:", error);
        return [];
      }

      nextParticipants = (data ?? []).map(mapParticipant);
    }

    const participantKey = nextParticipants
      .map((participant) => `${participant.userId}:${participant.displayName ?? ""}:${participant.joinedAt}`)
      .join("|");

    if (participantKey === lastParticipantKeyRef.current) {
      return nextParticipants;
    }

    lastParticipantKeyRef.current = participantKey;
    setParticipants(nextParticipants);
    participantLookupRef.current = buildParticipantLookup(nextParticipants);

    if (options?.emitDelta) {
      await emitMembershipDelta(nextParticipants);
    } else {
      membershipSnapshotRef.current = new Set(nextParticipants.map((participant) => participant.userId));
      participantsHydratedRef.current = true;
    }

    return nextParticipants;
  }, [emitMembershipDelta, enabled, getAuthHeaders, roomId]);

  const loadInitialMessages = useCallback(async () => {
    if (!enabled || !conversationId) {
      lastMessageTimestampRef.current = null;
      onInitialMessagesRef.current?.([], participantLookupRef.current);
      return [];
    }

    const rows = await getRoomMessages(conversationId);
    const messages = rows.map(mapRoomMessage);
    lastMessageTimestampRef.current = messages.at(-1)?.timestamp ?? null;
    onInitialMessagesRef.current?.(messages, participantLookupRef.current);
    return messages;
  }, [conversationId, enabled]);

  const reloadMissedMessages = useCallback(async () => {
    if (!enabled || !conversationId) return;

    const query = supabase
      .from("messages")
      .select("id, sender, sender_user_id, text, timestamp, model_used")
      .eq("conversation_id", conversationId)
      .order("timestamp", { ascending: true });

    const { data, error } = lastMessageTimestampRef.current
      ? await query.gt("timestamp", lastMessageTimestampRef.current)
      : await query;

    let missedMessages: RoomMessage[] = [];
    if (error) {
      console.error("[useRoomSession] Failed to reload room messages:", error);
      // Fallback through RPC-backed route to avoid direct table policy/join failures.
      const rows = await getRoomMessages(conversationId);
      const allMessages = rows.map(mapRoomMessage);
      missedMessages = lastMessageTimestampRef.current
        ? allMessages.filter((message) => message.timestamp > (lastMessageTimestampRef.current as string))
        : allMessages;
    } else {
      missedMessages = (data ?? []).map(mapRoomMessage);
    }

    if (missedMessages.length === 0) return;

    for (const message of missedMessages) {
      if (message.sender === "user" && message.senderUserId && !participantLookupRef.current[message.senderUserId]) {
        await resolveParticipantName(message.senderUserId);
      }
    }

    lastMessageTimestampRef.current = missedMessages.at(-1)?.timestamp ?? lastMessageTimestampRef.current;
    missedMessages.forEach((message) =>
      onMessageInsertedRef.current?.(message, participantLookupRef.current),
    );
  }, [conversationId, enabled, resolveParticipantName]);

  const syncTypingMembers = useCallback(() => {
    const channel = presenceChannelRef.current;
    if (!channel) return;

    const state = channel.presenceState<Record<string, unknown>>();
    const selfId = currentDbUserId || currentUserId || null;
    const uniqueTyping = new Map<string, string>();
    const presentIds = new Set<string>();

    Object.entries(state).forEach(([presenceKey, entries]) => {
      if (!Array.isArray(entries) || entries.length === 0) return;

      entries.forEach((entry: any) => {
        const entryUserId =
          typeof entry?.db_user_id === "string"
            ? entry.db_user_id
            : typeof entry?.user_id === "string"
              ? entry.user_id
              : presenceKey;
        presentIds.add(entryUserId);
        if (!entry?.typing || !entryUserId || entryUserId === selfId) return;
        const displayName =
          entry?.display_name ||
          participantLookup[entryUserId] ||
          "Member";
        uniqueTyping.set(entryUserId, displayName);
      });
    });

    setOnlineCount(presentIds.size);
    setTypingMembers(Array.from(uniqueTyping.values()));
  }, [currentDbUserId, currentUserId, participantLookup]);

  const trackPresence = useCallback(
    async (typing: boolean) => {
      const channel = presenceChannelRef.current;
      if (!channel) return;
      if (lastTrackedTypingRef.current === typing) return;

      lastTrackedTypingRef.current = typing;

      await channel.track({
        user_id: currentUserId || null,
        db_user_id: currentDbUserId || currentUserId || null,
        display_name: participantLookup[currentDbUserId || currentUserId || ""] || null,
        typing,
        online_at: new Date().toISOString(),
      });
    },
    [currentDbUserId, currentUserId, participantLookup],
  );

  const notifyDraftActivity = useCallback(
    (text: string) => {
      if (!presenceChannelRef.current) return;
      const isTyping = text.trim().length > 0;

      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      void trackPresence(isTyping);

      if (!isTyping) return;

      typingTimeoutRef.current = window.setTimeout(() => {
        void trackPresence(false);
        typingTimeoutRef.current = null;
      }, 2000);
    },
    [trackPresence],
  );

  useEffect(() => {
    if (!enabled || !conversationId) return;
    void loadInitialMessages();
  }, [enabled, conversationId, loadInitialMessages]);

  useEffect(() => {
    if (!enabled || !roomId) return;
    void loadParticipants({ emitDelta: false });
  }, [enabled, roomId, loadParticipants]);

  useEffect(() => {
    if (!enabled || !conversationId || !roomId) return;

    const interval = window.setInterval(() => {
      void reloadMissedMessages();
      void loadParticipants({ emitDelta: true });
    }, 2500);

    return () => window.clearInterval(interval);
  }, [conversationId, enabled, loadParticipants, reloadMissedMessages, roomId]);

  useEffect(() => {
    if (!enabled || !conversationId || !roomId) {
      setConnectionState("connecting");
      return;
    }

    setConnectionState("connecting");

    const messageChannel = supabase
      .channel(`room-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const message = mapRoomMessage(payload.new);
          if (message.sender === "user" && message.senderUserId && !participantLookupRef.current[message.senderUserId]) {
            await resolveParticipantName(message.senderUserId);
          }
          lastMessageTimestampRef.current = message.timestamp;
          onMessageInsertedRef.current?.(message, participantLookupRef.current);
        },
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          messageChannelRef.current = messageChannel;
          setConnectionState("connected");
          await reloadMissedMessages();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionState("reconnecting");
          return;
        }

        if (status === "CLOSED") {
          setConnectionState("error");
        }
      });

    const presenceChannel = supabase
      .channel(`room-presence:${roomId}`, {
        config: {
          presence: {
            key: presenceKeyRef.current,
          },
        },
      })
      .on("presence", { event: "sync" }, () => {
        syncTypingMembers();
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "study_room_participants",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          await loadParticipants({ emitDelta: true });
          syncTypingMembers();
        },
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          presenceChannelRef.current = presenceChannel;
          lastTrackedTypingRef.current = null;
          await trackPresence(false);
          syncTypingMembers();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionState("reconnecting");
          return;
        }

        if (status === "CLOSED") {
          setConnectionState("error");
        }
      });

    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      void supabase.removeChannel(messageChannel);
      void supabase.removeChannel(presenceChannel);
      messageChannelRef.current = null;
      presenceChannelRef.current = null;
      lastTrackedTypingRef.current = null;
    };
  }, [
    conversationId,
    currentDbUserId,
    currentUserId,
    enabled,
    loadParticipants,
    reloadMissedMessages,
    roomId,
    syncTypingMembers,
    trackPresence,
  ]);

  return {
    participants,
    participantLookup,
    typingMembers,
    onlineCount,
    connectionState,
    notifyDraftActivity,
  };
}
