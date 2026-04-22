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

  const loadParticipants = useCallback(async () => {
    if (!enabled || !roomId) {
      setParticipants([]);
      return [];
    }

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

    const nextParticipants = (data ?? []).map(mapParticipant);
    setParticipants(nextParticipants);
    participantLookupRef.current = buildParticipantLookup(nextParticipants);
    return nextParticipants;
  }, [enabled, roomId]);

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

    if (error) {
      console.error("[useRoomSession] Failed to reload room messages:", error);
      return;
    }

    const missedMessages = (data ?? []).map(mapRoomMessage);
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
    let presentCount = 0;

    Object.values(state).forEach((entries) => {
      if (!Array.isArray(entries) || entries.length === 0) return;
      presentCount += 1;

      entries.forEach((entry: any) => {
        const entryUserId = typeof entry?.db_user_id === "string" ? entry.db_user_id : entry?.user_id;
        if (!entry?.typing || !entryUserId || entryUserId === selfId) return;
        const displayName =
          entry?.display_name ||
          participantLookup[entryUserId] ||
          "Member";
        uniqueTyping.set(entryUserId, displayName);
      });
    });

    setOnlineCount(presentCount);
    setTypingMembers(Array.from(uniqueTyping.values()));
  }, [currentDbUserId, currentUserId, participantLookup]);

  const trackPresence = useCallback(
    async (typing: boolean) => {
      const channel = presenceChannelRef.current;
      if (!channel) return;

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
    void loadParticipants();
  }, [enabled, roomId, loadParticipants]);

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
        async (payload) => {
          let systemEventBody: string | null = null;

          if (payload.eventType === "INSERT") {
            const joiningUserId = (payload.new as any)?.user_id as string | undefined;
            if (joiningUserId && joiningUserId !== currentDbUserId) {
              const name =
                (await resolveParticipantName(joiningUserId)) ||
                participantLookupRef.current[joiningUserId] ||
                "A member";
              systemEventBody = `${name} joined the room.`;
            }
          }

          if (payload.eventType === "DELETE") {
            const leavingUserId = (payload.old as any)?.user_id as string | undefined;
            if (leavingUserId && leavingUserId !== currentDbUserId) {
              const name =
                participantLookupRef.current[leavingUserId] ||
                (await resolveParticipantName(leavingUserId)) ||
                "A member";
              systemEventBody = `${name} left the room.`;
            }
          }

          await loadParticipants();
          syncTypingMembers();
          if (systemEventBody) {
            onSystemEventRef.current?.(systemEventBody);
          }
        },
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          presenceChannelRef.current = presenceChannel;
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
    };
  }, [
    conversationId,
    currentDbUserId,
    currentUserId,
    enabled,
    loadParticipants,
    resolveParticipantName,
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
