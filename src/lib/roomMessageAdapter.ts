export type RoomEvent = {
  id: string;
  type: "system" | "ai" | "user" | "reward";
  title: string;
  body: string;
  meta?: string;
  accent?: string;
};

export type AdaptableRoomMessage = {
  id: string;
  sender: "user" | "assistant";
  senderUserId: string | null;
  text: string;
  modelUsed?: string | null;
};

const PARTICIPANT_COLORS = [
  "#2563eb", "#7c3aed", "#059669", "#dc2626",
  "#d97706", "#0891b2", "#be185d", "#65a30d",
];

export function roomMessageToEvent(
  message: AdaptableRoomMessage,
  currentDbUserId: string | null | undefined,
  participantLookup: Record<string, string>,
): RoomEvent {
  if (message.sender === "assistant") {
    return {
      id: message.id,
      type: "ai",
      title: "RAYA Host",
      body: message.text,
      meta: message.modelUsed || "Moderator",
    };
  }

  if (currentDbUserId && message.senderUserId === currentDbUserId) {
    return {
      id: message.id,
      type: "user",
      title: "You",
      body: message.text,
      meta: "Just now",
    };
  }

  const senderId = message.senderUserId || "";
  const name = participantLookup[senderId] || "Member";
  const stableIndex = senderId
    ? Array.from(senderId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % PARTICIPANT_COLORS.length
    : 0;

  return {
    id: message.id,
    type: "user",
    title: name,
    body: message.text,
    meta: "Just now",
    accent: PARTICIPANT_COLORS[stableIndex],
  };
}
