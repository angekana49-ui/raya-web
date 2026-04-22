"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudyRoomPreview } from "@/types";
import { supabase } from "@/lib/supabase/client";
import {
  buildInvitedRoomPreview,
  findStudyRoomByInviteCode,
  getSelectedRoom,
  getStudyRoomTheme,
  type StudyRoomTheme,
} from "@/lib/study-room-data";
import { createStudyRoom, getActiveRooms, getRoomHistory, joinRoom, mapStudyRoomRow, RoomJoinError, uploadRoomFiles } from "@/services/study-rooms.service";

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
  handleRemoveRoom: (id: string) => void;
  roomError: string | null;
  clearRoomError: () => void;
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
  const [removedRoomIds, setRemovedRoomIds] = useState<string[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const joinedRoomRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("removed_study_rooms");
    if (saved) {
      try {
        setRemovedRoomIds(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse removed rooms", e);
      }
    }
  }, []);

  const handleRemoveRoom = useCallback((id: string) => {
    setRemovedRoomIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      localStorage.setItem("removed_study_rooms", JSON.stringify(next));
      return next;
    });
    if (activeRoomIdState === id) {
      setActiveRoomIdState(null);
    }
  }, [activeRoomIdState]);

  const clearRoomError = useCallback(() => setRoomError(null), []);

  const visibleRooms = useMemo(() => {
    const seen = new Set<string>();
    return studyRooms.filter((room) => {
      if (removedRoomIds.includes(room.id)) return false;
      if (seen.has(room.id)) return false;
      seen.add(room.id);
      return true;
    });
  }, [studyRooms, removedRoomIds]);

  // Load rooms from Supabase
  useEffect(() => {
    async function loadRooms() {
      const [activeRooms, historyRooms] = await Promise.all([
        getActiveRooms(),
        getRoomHistory(),
      ]);

      const merged = new Map<string, StudyRoomPreview>();
      [...activeRooms, ...historyRooms].forEach((room) => {
        const existing = merged.get(room.id);
        merged.set(room.id, existing ? { ...existing, ...room } : room);
      });

      setStudyRooms(
        [...merged.values()].sort((left, right) => {
          const leftUpdated = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
          const rightUpdated = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime();
          return rightUpdated - leftUpdated;
        }),
      );
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
          
          setStudyRooms((prev) => {
            const index = prev.findIndex((room) => room.id === mapped.id);
            if (index === -1) {
              // If it's inactive from the start, we might not want to add it to 'live' list 
              // unless it's the one we are currently looking at
              if (row.is_active === false && mapped.timerStatus !== "finished" && mapped.id !== activeRoomIdState) {
                return prev;
              }
              return [mapped, ...prev];
            }
            
            const next = [...prev];
            // If it becomes inactive and it's NOT the one we are looking at, remove it
            if (row.is_active === false && mapped.timerStatus !== "finished" && mapped.id !== activeRoomIdState) {
              next.splice(index, 1);
            } else {
              next[index] = { ...next[index], ...mapped };
            }
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
    if (!activeRoomIdState) {
      joinedRoomRef.current = null;
      return;
    }
    if (!isSignedIn) return;
    if (joinedRoomRef.current === activeRoomIdState) return;

    const room = studyRooms.find((entry) => entry.id === activeRoomIdState);
    if (!room || room.timerStatus === "finished") {
      joinedRoomRef.current = activeRoomIdState;
      return;
    }

    let cancelled = false;
    joinedRoomRef.current = activeRoomIdState;

    void joinRoom(activeRoomIdState).catch((error) => {
      if (cancelled) return;
      joinedRoomRef.current = null;

      if (error instanceof RoomJoinError) {
        setRoomError(error.message);
        if (error.code === "ROOM_FULL" || error.code === "ROOM_CLOSED") {
          setActiveRoomIdState(null);
        }
        return;
      }

      console.error("Failed to ensure room membership:", error);
      setRoomError("Could not join this room right now.");
      setActiveRoomIdState(null);
    });

    return () => {
      cancelled = true;
    };
  }, [activeRoomIdState, isSignedIn, studyRooms]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const roomInvite = params.get("roomInvite");

    if (requestedView === "rooms") {
      setActiveViewState("rooms");
    }

    if (!roomInvite) return;

    const joinedRoom =
      findStudyRoomByInviteCode(studyRooms, roomInvite) ?? buildInvitedRoomPreview(roomInvite);

    setStudyRooms((prev) => {
      if (prev.some((room) => room.id === joinedRoom.id)) return prev;
      return [joinedRoom, ...prev];
    });
    setActiveViewState("rooms");
    setActiveRoomIdState(joinedRoom.id);
    setInvitedGuestFlow(true);
    setInvitedGuestAlias("Guest learner");
    setRoomOnboardingNudgeVisible(!authLoading && (!isSignedIn || !isProfileComplete));
  }, [authLoading, isProfileComplete, isSignedIn, studyRooms]);

  useEffect(() => {
    if (authLoading) return;
    if (isSignedIn && isProfileComplete) {
      setRoomOnboardingNudgeVisible(false);
    }
  }, [authLoading, isProfileComplete, isSignedIn]);

  const selectedRoom = useMemo(
    () => getSelectedRoom(visibleRooms, activeRoomIdState ?? visibleRooms[0]?.id ?? ""),
    [activeRoomIdState, visibleRooms],
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
      // 1. Create the room
      const session = await createStudyRoom({
        title: payload.title,
        mission: payload.mission,
        duration: payload.duration,
        aiMode: payload.aiMode,
        files: [] // We'll use the room_files table instead
      });

      // 2. Upload files if any
      if (payload.files.length > 0) {
        await uploadRoomFiles(session.id, payload.files);
      }

      const createdRoom: StudyRoomPreview = {
        ...mapStudyRoomRow(session),
        vibe: "Fresh room",
      };

      setStudyRooms((prev) => {
        // Double check against race conditions with realtime subscription
        if (prev.some(r => r.id === createdRoom.id)) return prev;
        return [createdRoom, ...prev];
      });
      setActiveViewState("rooms");
      setActiveRoomIdState(createdRoom.id);
      setCreateRoomModalOpen(false);
    } catch (err) {
      try {
        console.error('Failed to create room in DB:', (err as any)?.message ?? JSON.parse(JSON.stringify(err)));
      } catch (logErr) {
        console.error('Failed to create room in DB (unstringifiable):', err, 'log error:', logErr);
      }
      setRoomError(((err as any)?.message) ? String((err as any).message) : "Could not create study room. Please try again.");
    }
  }, []);

  const handleJoinRoom = useCallback((inviteCode: string) => {
    const joinedRoom =
      findStudyRoomByInviteCode(studyRooms, inviteCode) ?? buildInvitedRoomPreview(inviteCode);

    setStudyRooms((prev) => {
      if (prev.some((room) => room.id === joinedRoom.id)) return prev;
      return [joinedRoom, ...prev];
    });
    setActiveViewState("rooms");
    setActiveRoomIdState(joinedRoom.id);
    setJoinRoomModalOpen(false);

    if (!authLoading && (!isSignedIn || !isProfileComplete)) {
      setInvitedGuestFlow(true);
      setInvitedGuestAlias("Guest learner");
      setRoomOnboardingNudgeVisible(false);
    }
  }, [authLoading, isProfileComplete, isSignedIn, studyRooms]);

  return {
    activeView: activeViewState,
    setActiveView,
    activeRoomId: activeRoomIdState,
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
    studyRooms: visibleRooms,
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
  };
}
