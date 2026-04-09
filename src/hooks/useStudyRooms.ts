"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudyRoomPreview } from "@/types";
import { supabase } from "@/lib/supabase/client";
import {
  findStudyRoomByInviteCode,
  getSelectedRoom,
  getStudyRoomTheme,
  type StudyRoomTheme,
} from "@/lib/study-room-data";
import { createStudyRoom, getActiveRooms, getStudyRoom, mapStudyRoomRow } from "@/services/study-rooms.service";

type UseStudyRoomsOptions = {
  authLoading: boolean;
  isProfileComplete: boolean;
  isSignedIn: boolean;
  userId?: string | null;
};

type ActiveView = "chat" | "rooms";

type UseStudyRoomsResult = {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  activeRoomId: string | null;
  setActiveRoomId: (roomId: string | null) => void;
  createRoomModalOpen: boolean;
  setCreateRoomModalOpen: (open: boolean) => void;
  joinRoomModalOpen: boolean;
  setJoinRoomModalOpen: (open: boolean) => void;
  inviteRoomModalOpen: boolean;
  setInviteRoomModalOpen: (open: boolean) => void;
  invitedGuestFlow: boolean;
  invitedGuestAlias: string;
  roomOnboardingNudgeVisible: boolean;
  studyRooms: StudyRoomPreview[];
  selectedRoom: StudyRoomPreview;
  selectedRoomTheme: StudyRoomTheme;
  openInvitedGuestOnboarding: () => void;
  registerInvitedGuestEngagement: () => void;
  clearInvitedGuestFlow: () => void;
  handleCreateRoom: (payload: { title: string; mission: string; duration: number; aiMode: "passive" | "active"; files: File[] }) => void;
  handleJoinRoom: (inviteCode: string) => void;
  handleRemoveRoom: (roomId: string) => void;
  userId?: string | null;
};

export function useStudyRooms({
  authLoading,
  isProfileComplete,
  isSignedIn,
  userId,
}: UseStudyRoomsOptions): UseStudyRoomsResult {
  const [activeViewState, setActiveViewState] = useState<ActiveView>("chat");
  const [studyRooms, setStudyRooms] = useState<StudyRoomPreview[]>([]);
  const [activeRoomIdState, setActiveRoomIdState] = useState<string | null>(null);
  const [createRoomModalOpen, setCreateRoomModalOpen] = useState(false);
  const [joinRoomModalOpen, setJoinRoomModalOpen] = useState(false);
  const [inviteRoomModalOpen, setInviteRoomModalOpen] = useState(false);
  const [invitedGuestFlow, setInvitedGuestFlow] = useState(false);
  const [invitedGuestAlias, setInvitedGuestAlias] = useState("Guest learner");
  const [roomOnboardingNudgeVisible, setRoomOnboardingNudgeVisible] = useState(false);
  const [hiddenRooms, setHiddenRooms] = useState<string[]>([]);

  // Load hidden rooms from local storage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("raya_hidden_rooms");
      if (stored) setHiddenRooms(JSON.parse(stored));
    } catch {}
  }, []);

  // Load rooms from Supabase
  useEffect(() => {
    async function loadRooms() {
      const rooms = await getActiveRooms();
      setStudyRooms(rooms);
    }
    loadRooms();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("study-rooms-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_rooms" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id?: string; is_active?: boolean };
            if (!oldRow.id) return;
            setStudyRooms((prev) => prev.filter((room) => room.id !== oldRow.id));
            return;
          }

          const row = payload.new as any;
          if (!row?.id) return;

          const mapped = mapStudyRoomRow(row);
          if (row.is_active === false) {
            setStudyRooms((prev) => prev.filter((room) => room.id !== row.id));
            return;
          }

          setStudyRooms((prev) => {
            const index = prev.findIndex((room) => room.id === mapped.id);
            if (index === -1) return [mapped, ...prev];
            const next = [...prev];
            next[index] = { ...next[index], ...mapped };
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const setActiveView = useCallback((view: ActiveView) => {
    setActiveViewState(view);
  }, []);

  const setActiveRoomId = useCallback((roomId: string | null) => {
    setActiveRoomIdState(roomId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const roomInvite = params.get("roomInvite");

    if (requestedView === "rooms") {
      setActiveViewState("rooms");
    }

    if (!roomInvite) return;

    async function resolveAndJoin() {
      const invite = roomInvite as string;
      const existing = studyRooms.find((r) => r.id === invite);
      if (existing) {
        setActiveViewState("rooms");
        setActiveRoomIdState(existing.id);
        return;
      }

      const room = await getStudyRoom(invite);
      if (room) {
        setStudyRooms((prev) => {
          if (prev.some((r) => r.id === room.id)) return prev;
          return [room, ...prev];
        });
        setActiveViewState("rooms");
        setActiveRoomIdState(room.id);
        setInvitedGuestFlow(true);
        setInvitedGuestAlias("Guest learner");
        setRoomOnboardingNudgeVisible(!authLoading && (!isSignedIn || !isProfileComplete));
      } else {
        // Redirection with alert-trigger (handled by parent or via URL param)
        window.history.replaceState(null, "", "/?error=room_expired");
        setActiveViewState("chat");
        // We'll trust the parent to show the alert based on the URL param or state.
      }
    }

    resolveAndJoin();
  }, [authLoading, isProfileComplete, isSignedIn, studyRooms]);

  useEffect(() => {
    if (authLoading) return;
    if (isSignedIn && isProfileComplete) {
      setRoomOnboardingNudgeVisible(false);
    }
  }, [authLoading, isProfileComplete, isSignedIn]);

  const selectedRoom = useMemo(
    () => getSelectedRoom(studyRooms, activeRoomIdState ?? studyRooms[0]?.id ?? ""),
    [activeRoomIdState, studyRooms],
  );

  const selectedRoomTheme = useMemo(
    () => getStudyRoomTheme(selectedRoom),
    [selectedRoom],
  );

  const openInvitedGuestOnboarding = useCallback(() => {
    setRoomOnboardingNudgeVisible(true);
  }, []);

  const registerInvitedGuestEngagement = useCallback(() => {
    if (!invitedGuestFlow) return;
    if (authLoading) return;
    if (!isSignedIn || !isProfileComplete) {
      setRoomOnboardingNudgeVisible(true);
    }
  }, [authLoading, invitedGuestFlow, isProfileComplete, isSignedIn]);

  const clearInvitedGuestFlow = useCallback(() => {
    setInvitedGuestFlow(false);
    setRoomOnboardingNudgeVisible(false);
  }, []);

  const handleCreateRoom = useCallback(async (payload: { 
    title: string; 
    mission: string; 
    duration: number; 
    aiMode: "passive" | "active"; 
    files: File[] 
  }) => {
    const attachedFiles = payload.files.map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      type: file.type.startsWith("image/") ? "image" : file.type === "application/pdf" ? "pdf" : "document",
      size: file.size,
      mimeType: file.type
    }));

    try {
      // userId is now resolved inside the service via get_db_user_id() RPC
      const session = await createStudyRoom({
        title: payload.title,
        mission: payload.mission,
        duration: payload.duration,
        aiMode: payload.aiMode,
        files: attachedFiles
      });

      const createdRoom: StudyRoomPreview = {
        ...mapStudyRoomRow(session),
        vibe: "Fresh room",
      };

      setStudyRooms((prev) => [createdRoom, ...prev]);
      setActiveViewState("rooms");
      setActiveRoomIdState(createdRoom.id);
      setCreateRoomModalOpen(false);
    } catch (err) {
      console.error('Failed to create room in DB:', err);
    }
  }, []);

  const handleJoinRoom = useCallback(async (inviteCode: string) => {
    const existing = studyRooms.find((r) => r.id === inviteCode);
    if (existing) {
      setActiveViewState("rooms");
      setActiveRoomIdState(existing.id);
      setJoinRoomModalOpen(false);
      return;
    }

    const room = await getStudyRoom(inviteCode);
    if (room) {
      setStudyRooms((prev) => {
        if (prev.some((r) => r.id === room.id)) return prev;
        return [room, ...prev];
      });
      setActiveViewState("rooms");
      setActiveRoomIdState(room.id);
      setJoinRoomModalOpen(false);

      if (!authLoading && (!isSignedIn || !isProfileComplete)) {
        setInvitedGuestFlow(true);
        setInvitedGuestAlias("Guest learner");
        setRoomOnboardingNudgeVisible(false);
      }
    } else {
      alert("This room link is invalid or has expired. Redirecting to lobby...");
      setJoinRoomModalOpen(false);
      setActiveViewState("chat");
    }
  }, [authLoading, isProfileComplete, isSignedIn, studyRooms]);

  const handleRemoveRoom = useCallback((roomId: string) => {
    setHiddenRooms((prev) => {
      const next = [...prev, roomId];
      try { localStorage.setItem("raya_hidden_rooms", JSON.stringify(next)); } catch {}
      return next;
    });
    if (activeRoomIdState === roomId) {
      setActiveViewState("chat");
      setActiveRoomIdState(null);
    }
  }, [activeRoomIdState]);

  const visibleStudyRooms = useMemo(() => {
    return studyRooms.filter(r => !hiddenRooms.includes(r.id));
  }, [studyRooms, hiddenRooms]);

  return {
    activeView: activeViewState,
    setActiveView,
    activeRoomId: activeRoomIdState,
    setActiveRoomId: setActiveRoomIdState,
    createRoomModalOpen,
    setCreateRoomModalOpen,
    joinRoomModalOpen,
    setJoinRoomModalOpen,
    inviteRoomModalOpen,
    setInviteRoomModalOpen,
    invitedGuestFlow,
    invitedGuestAlias,
    roomOnboardingNudgeVisible,
    studyRooms: visibleStudyRooms,
    selectedRoom: selectedRoom!,
    selectedRoomTheme: selectedRoomTheme!,
    openInvitedGuestOnboarding,
    registerInvitedGuestEngagement,
    clearInvitedGuestFlow,
    handleCreateRoom,
    handleJoinRoom,
    handleRemoveRoom,
  };
}
