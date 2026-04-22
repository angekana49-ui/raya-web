import type { Message } from "@/types";

const ACTIVE_CONVERSATION_CACHE_KEY = "raya_active_conversation_cache_v1";

type CachedMessage = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  files?: Message["files"];
  timestamp?: string;
  parentId?: string;
};

export type ActiveConversationCache = {
  conversationId: string | null;
  activeLeafId: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  messages: CachedMessage[];
  updatedAt: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function writeActiveConversationCache(payload: {
  conversationId: string | null;
  activeLeafId: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  messages: Message[];
}) {
  if (!isBrowser()) return;

  const serializable: ActiveConversationCache = {
    conversationId: payload.conversationId,
    activeLeafId: payload.activeLeafId,
    history: payload.history,
    updatedAt: new Date().toISOString(),
    messages: payload.messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      text: message.text,
      files: message.files,
      timestamp: message.timestamp?.toISOString(),
      parentId: message.parentId,
    })),
  };

  try {
    window.localStorage.setItem(ACTIVE_CONVERSATION_CACHE_KEY, JSON.stringify(serializable));
  } catch {
    // ignore storage errors
  }
}

export function readActiveConversationCache(): ActiveConversationCache | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_CONVERSATION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveConversationCache;
  } catch {
    return null;
  }
}

export function clearActiveConversationCache() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(ACTIVE_CONVERSATION_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function hydrateCachedMessages(messages: CachedMessage[]): Message[] {
  return messages.map((message) => ({
    id: message.id,
    sender: message.sender,
    text: message.text,
    files: message.files,
    timestamp: message.timestamp ? new Date(message.timestamp) : undefined,
    parentId: message.parentId,
  }));
}
