import type { StudyRoomPreview } from "@/types";

export type StudyRoomTheme = {
  timeLeft: string;
  squadXp: number;
  hostLine: string;
  studentLine: string;
  rewardLine: string;
};

export type DemoRoomMember = {
  id: string;
  name: string;
  accent: string;
  status: "explaining" | "thinking" | "ready";
  role: string;
  streak: number;
};

export type DemoRoomEvent = {
  id: string;
  type: "system" | "ai" | "user" | "reward";
  title: string;
  body: string;
  meta: string;
  accent?: string;
};

export const INITIAL_STUDY_ROOMS: StudyRoomPreview[] = [
  {
    id: "algebra-sprint",
    title: "Algebra Sprint",
    mission:
      "Compare two solving methods, help the slowest teammate catch up, then lock the clearest explanation.",
    onlineCount: 4,
    maxMembers: 8,
    vibe: "High energy",
  },
  {
    id: "bio-cram",
    title: "Bio Cram Lab",
    mission: "Turn a messy chapter into flash explanations before the timer hits zero.",
    onlineCount: 3,
    maxMembers: 8,
    vibe: "Catch-up mode",
  },
  {
    id: "essay-clinic",
    title: "Essay Clinic",
    mission:
      "Trade thesis feedback, sharpen structure, and vote for the strongest opening line.",
    onlineCount: 5,
    maxMembers: 8,
    vibe: "Creative pressure",
  },
];

const ROOM_THEME_BY_ID: Record<string, StudyRoomTheme> = {
  "algebra-sprint": {
    timeLeft: "06:24",
    squadXp: 120,
    hostLine:
      "Two teams are leaning toward answer B. Bonus XP if someone explains why C fails before locking it in.",
    studentLine:
      "I think the variable cancels after we divide both sides, but I want to verify the sign first.",
    rewardLine:
      "Catch-up help activated. The team earned +20 XP because Amira summarized Naomi's approach in one sentence.",
  },
  "bio-cram": {
    timeLeft: "09:10",
    squadXp: 85,
    hostLine:
      "You already know the definition. Now push one level deeper: what function does the cell structure actually serve?",
    studentLine:
      "I can remember mitochondria, but I want a shorter way to explain why the membrane shape matters.",
    rewardLine:
      "Memory chain unlocked. The squad earned +15 XP after Jayden turned the explanation into a rapid mnemonic.",
  },
  "essay-clinic": {
    timeLeft: "11:42",
    squadXp: 140,
    hostLine:
      "You have three decent thesis lines. Vote for the strongest one, then someone defend the choice in one punchy sentence.",
    studentLine:
      "Option two feels stronger because it makes the argument sharper, but I think the intro still sounds too safe.",
    rewardLine:
      "Clarity bonus unlocked. Naomi gained helper credit for tightening the opening hook without changing the meaning.",
  },
};

const DEFAULT_THEME: StudyRoomTheme = {
  timeLeft: "07:30",
  squadXp: 95,
  hostLine: "The squad is live. Push for the clearest explanation, not just the fastest answer.",
  studentLine:
    "I have an idea, but I want to hear if someone can make it simpler before we lock it in.",
  rewardLine: "Team bonus unlocked. Clear collaboration pushed the room momentum higher.",
};

export function getSelectedRoom(
  rooms: StudyRoomPreview[],
  activeRoomId: string,
): StudyRoomPreview {
  return rooms.find((room) => room.id === activeRoomId) ?? rooms[0] ?? INITIAL_STUDY_ROOMS[0];
}

export function getStudyRoomTheme(room: StudyRoomPreview): StudyRoomTheme {
  const theme = ROOM_THEME_BY_ID[room.id] ?? DEFAULT_THEME;
  if (room.duration) {
    return {
      ...theme,
      timeLeft: `${room.duration < 10 ? '0' : ''}${room.duration}:00`
    };
  }
  return theme;
}

export function buildStudyRoomInviteUrl(origin: string | null | undefined, roomId: string): string {
  if (origin) return `${origin}/rooms/${roomId}`;
  return `https://raya.app/rooms/${roomId}`;
}

export function extractStudyRoomId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  try {
    const parsedUrl = new URL(trimmed);
    const roomInvite = parsedUrl.searchParams.get("roomInvite");
    if (roomInvite) return roomInvite.trim();

    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    const roomsIndex = segments.findIndex((segment) => segment === "rooms");
    if (roomsIndex >= 0 && segments[roomsIndex + 1]) {
      return decodeURIComponent(segments[roomsIndex + 1]).trim();
    }
  } catch {
    // Input is not a full URL. Fall back to plain slug/code handling.
  }

  return trimmed
    .replace(/^\/+/, "")
    .replace(/^rooms\//i, "")
    .trim();
}

export function isStudyRoomUnavailable(room: Pick<StudyRoomPreview, "timerStatus" | "onlineCount" | "maxMembers">): boolean {
  return room.timerStatus === "finished" || room.onlineCount >= room.maxMembers;
}

export type StudyRoomStatus = "live" | "full" | "closed";

export function getStudyRoomStatus(room: Pick<StudyRoomPreview, "timerStatus" | "onlineCount" | "maxMembers">): StudyRoomStatus {
  if (room.timerStatus === "finished") return "closed";
  if (room.onlineCount >= room.maxMembers) return "full";
  return "live";
}

export function getStudyRoomStatusMeta(room: Pick<StudyRoomPreview, "timerStatus" | "onlineCount" | "maxMembers">): {
  status: StudyRoomStatus;
  label: "Live" | "Full" | "Closed";
  detail: string;
} {
  const status = getStudyRoomStatus(room);

  if (status === "closed") {
    return {
      status,
      label: "Closed",
      detail: "Session finished",
    };
  }

  if (status === "full") {
    return {
      status,
      label: "Full",
      detail: `${room.onlineCount}/${room.maxMembers} seats taken`,
    };
  }

  return {
    status,
    label: "Live",
    detail: `${room.onlineCount}/${room.maxMembers} inside now`,
  };
}

export function buildDemoRoomMembers(currentUserName: string): DemoRoomMember[] {
  return [
    {
      id: "m1",
      name: "Naomi",
      accent: "linear-gradient(135deg,#2563eb,#4f46e5)",
      status: "explaining",
      role: "Fast explainer",
      streak: 3,
    },
    {
      id: "m2",
      name: "Jayden",
      accent: "linear-gradient(135deg,#f97316,#f59e0b)",
      status: "thinking",
      role: "Clutch solver",
      streak: 2,
    },
    {
      id: "m3",
      name: "Amira",
      accent: "linear-gradient(135deg,#10b981,#14b8a6)",
      status: "ready",
      role: "Helper",
      streak: 4,
    },
    {
      id: "m4",
      name: currentUserName,
      accent: "linear-gradient(135deg,#7c3aed,#ec4899)",
      status: "ready",
      role: "You",
      streak: 1,
    },
  ];
}

export function buildDemoRoomEvents(theme: StudyRoomTheme): DemoRoomEvent[] {
  return [
    {
      id: "e1",
      type: "system",
      title: "Room Mission",
      body: "Solve the algebra prompt, then explain why the method works before posting the final answer.",
      meta: "8 min challenge",
    },
    {
      id: "e2",
      type: "ai",
      title: "RAYA Host",
      body: theme.hostLine,
      meta: "Moderator",
    },
    {
      id: "e3",
      type: "user",
      title: "Naomi",
      body: theme.studentLine,
      meta: "Explaining",
      accent: "linear-gradient(135deg,#2563eb,#4f46e5)",
    },
    {
      id: "e4",
      type: "reward",
      title: "Squad Bonus Unlocked",
      body: theme.rewardLine,
      meta: "Reward",
    },
  ];
}

export function createStudyRoomId(title: string): string {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
}

export function normalizeInviteCode(inviteCode: string): string {
  return inviteCode.trim().toLowerCase();
}

export function findStudyRoomByInviteCode(
  rooms: StudyRoomPreview[],
  inviteCode: string,
): StudyRoomPreview | undefined {
  const normalizedCode = normalizeInviteCode(inviteCode);
  return rooms.find(
    (room) =>
      room.id === normalizedCode ||
      room.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") === normalizedCode,
  );
}

export function buildInvitedRoomPreview(inviteCode: string): StudyRoomPreview {
  const normalizedCode = normalizeInviteCode(inviteCode);
  return {
    id: normalizedCode,
    title: inviteCode.trim(),
    mission: "Invited room preview. Join the squad, catch up fast, and help shape the discussion.",
    onlineCount: 1,
    maxMembers: 8,
    vibe: "Invite room",
  };
}
