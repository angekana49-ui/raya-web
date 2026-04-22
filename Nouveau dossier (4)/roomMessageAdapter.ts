import type { RoomMessage, RoomParticipant } from "./useRoomSession";

export type RoomEvent = {
  id: string;
  type: "system" | "ai" | "user" | "reward";
  title: string;
  body: string;
  meta?: string;
  accent?: string;
};

const PARTICIPANT_COLORS = [
  "#2563eb", "#7c3aed", "#059669", "#dc2626",
  "#d97706", "#0891b2", "#be185d", "#65a30d",
];

/**
 * Convertit un RoomMessage (DB) en RoomEvent (UI RoomMessageBubble).
 * Grâce à sender_user_id, on sait exactement qui a écrit chaque message.
 */
export function roomMessageToEvent(
  message: RoomMessage,
  currentDbUserId: string | null | undefined,
  participants: RoomParticipant[],
): RoomEvent {
  // ── Message IA ──────────────────────────────────────────────────────────────
  if (message.sender === "assistant") {
    return {
      id: message.id,
      type: "ai",
      title: "Raya",
      body: message.text,
      meta: message.modelUsed ?? undefined,
    };
  }

  // ── Message de l'utilisateur courant ────────────────────────────────────────
  const isOwn =
    message.id.startsWith("optimistic-") || // insert optimiste
    (!!currentDbUserId && message.senderUserId === currentDbUserId);

  if (isOwn) {
    return { id: message.id, type: "user", title: "You", body: message.text };
  }

  // ── Message d'un autre membre ───────────────────────────────────────────────
  const sorted = [...participants].sort(
    (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
  );

  const author = sorted.find((p) => p.userId === message.senderUserId);
  const colorIndex = author
    ? sorted.indexOf(author) % PARTICIPANT_COLORS.length
    : 0;

  return {
    id: message.id,
    type: "user",
    title: author?.displayName ?? "Member",
    body: message.text,
    accent: PARTICIPANT_COLORS[colorIndex],
  };
}

/** Événement système inline (ex: "Alice a rejoint la room") */
export function makeSystemEvent(body: string): RoomEvent {
  return {
    id: `system-${Date.now()}-${Math.random()}`,
    type: "system",
    title: "Raya rooms",
    body,
  };
}
