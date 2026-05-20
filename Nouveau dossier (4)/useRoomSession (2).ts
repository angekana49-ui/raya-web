"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getRoomMessages } from "@/services/study-rooms.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomMessage = {
  id: string;
  conversationId: string;
  sender: "user" | "assistant";
  senderUserId: string | null; // ← nouveau : qui a envoyé (null = assistant)
  text: string;
  timestamp: string;
  hasFiles?: boolean;
  modelUsed?: string | null;
  actionType?: string | null;
};

export type RoomParticipant = {
  id: string;
  userId: string;
  roomId: string;
  isCreator: boolean;
  joinedAt: string;
  displayName?: string;
  profilePictureUrl?: string;
};

type UseRoomSessionOptions = {
  roomId: string | null;
  conversationId: string | null | undefined;
  /** DB user id de l'utilisateur connecté (public.users.id, pas auth.uid) */
  currentDbUserId: string | null | undefined;
  enabled?: boolean;
};

type UseRoomSessionResult = {
  messages: RoomMessage[];
  participants: RoomParticipant[];
  messagesLoading: boolean;
  participantsLoading: boolean;
  sendMessage: (text: string, sender?: "user" | "assistant") => Promise<RoomMessage | null>;
};

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapMessageRow(row: any): RoomMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: row.sender,
    senderUserId: row.sender_user_id ?? null,
    text: row.text,
    timestamp: row.timestamp,
    hasFiles: row.has_files ?? false,
    modelUsed: row.model_used ?? null,
    actionType: row.action_type ?? null,
  };
}

function mapParticipantRow(row: any): RoomParticipant {
  return {
    id: row.id,
    userId: row.user_id,
    roomId: row.room_id,
    isCreator: row.is_creator ?? false,
    joinedAt: row.joined_at,
    displayName: row.users?.display_name ?? row.users?.username ?? undefined,
    profilePictureUrl: row.users?.profile_picture_url ?? undefined,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRoomSession({
  roomId,
  conversationId,
  currentDbUserId,
  enabled = true,
}: UseRoomSessionOptions): UseRoomSessionResult {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const loadedConvRef = useRef<string | null>(null);
  const loadedRoomRef = useRef<string | null>(null);

  // ── 1. Messages initiaux ────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !conversationId) {
      setMessages([]);
      loadedConvRef.current = null;
      return;
    }
    if (loadedConvRef.current === conversationId) return;

    let cancelled = false;
    loadedConvRef.current = conversationId;
    setMessagesLoading(true);

    getRoomMessages(conversationId).then((rows) => {
      if (cancelled) return;
      setMessages(rows.map(mapMessageRow));
      setMessagesLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      console.error("[useRoomSession] Failed to load messages:", err);
      setMessagesLoading(false);
    });

    return () => { cancelled = true; };
  }, [conversationId, enabled]);

  // ── 2. Participants initiaux ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !roomId) {
      setParticipants([]);
      loadedRoomRef.current = null;
      return;
    }
    if (loadedRoomRef.current === roomId) return;

    let cancelled = false;
    loadedRoomRef.current = roomId;
    setParticipantsLoading(true);

    supabase
      .from("study_room_participants")
      .select(`
        id,
        user_id,
        room_id,
        is_creator,
        joined_at,
        users ( display_name, username, profile_picture_url )
      `)
      .eq("room_id", roomId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[useRoomSession] Failed to load participants:", error);
        } else {
          setParticipants((data ?? []).map(mapParticipantRow));
        }
        setParticipantsLoading(false);
      });

    return () => { cancelled = true; };
  }, [roomId, enabled]);

  // ── 3. Realtime : messages ──────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !conversationId || !roomId) return;

    const channel = supabase
      .channel(`room-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = mapMessageRow(payload.new);
          setMessages((prev) => {
            // Remplacer le message optimiste correspondant s'il existe
            const optimisticIndex = prev.findIndex(
              (m) => m.id.startsWith("optimistic-") &&
                     m.senderUserId === incoming.senderUserId &&
                     m.text === incoming.text
            );
            if (optimisticIndex !== -1) {
              const next = [...prev];
              next[optimisticIndex] = incoming;
              return next;
            }
            // Dédupliquer
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[useRoomSession] Message channel error for room", roomId);
        }
      });

    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, roomId, enabled]);

  // ── 4. Realtime : participants (présence) ───────────────────────────────────
  useEffect(() => {
    if (!enabled || !roomId) return;

    const channel = supabase
      .channel(`room-participants:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "study_room_participants",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          // Enrichir avec les infos user (le payload Realtime ne contient pas les joins)
          const { data } = await supabase
            .from("study_room_participants")
            .select(`id, user_id, room_id, is_creator, joined_at, users ( display_name, username, profile_picture_url )`)
            .eq("id", (payload.new as any).id)
            .maybeSingle();

          const incoming = mapParticipantRow(data ?? payload.new);
          setParticipants((prev) => {
            if (prev.some((p) => p.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "study_room_participants",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          setParticipants((prev) => prev.filter((p) => p.id !== deletedId));
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[useRoomSession] Participant channel error for room", roomId);
        }
      });

    return () => { void supabase.removeChannel(channel); };
  }, [roomId, enabled]);

  // ── 5. sendMessage ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string, sender: "user" | "assistant" = "user"): Promise<RoomMessage | null> => {
      if (!conversationId) {
        console.warn("[useRoomSession] sendMessage called without conversationId");
        return null;
      }

      // Insert optimiste immédiat
      const optimistic: RoomMessage = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        sender,
        senderUserId: sender === "user" ? (currentDbUserId ?? null) : null,
        text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender,
          text,
          // Renseigner sender_user_id pour que les autres membres sachent qui a écrit
          sender_user_id: sender === "user" ? (currentDbUserId ?? null) : null,
        })
        .select()
        .single();

      if (error) {
        console.error("[useRoomSession] Failed to send message:", error);
        // Rollback optimiste
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        return null;
      }

      const confirmed = mapMessageRow(data);
      // Le listener Realtime va le recevoir et remplacer l'optimiste automatiquement
      return confirmed;
    },
    [conversationId, currentDbUserId],
  );

  return { messages, participants, messagesLoading, participantsLoading, sendMessage };
}
