import type { Message } from "@/types";

const ACTIVE_CONVERSATION_CACHE_KEY = "raya_active_conversation_cache_v1";
const CONVERSATIONS_LIST_CACHE_KEY = "raya_conversations_list_cache_v1";

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

function scopedKey(baseKey: string, ownerKey?: string | null) {
  if (!ownerKey) return null;
  return `${baseKey}:${ownerKey}`;
}

export function writeActiveConversationCache(payload: {
  ownerKey?: string | null;
  conversationId: string | null;
  activeLeafId: string | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  messages: Message[];
}) {
  if (!isBrowser()) return;
  const cacheKey = scopedKey(ACTIVE_CONVERSATION_CACHE_KEY, payload.ownerKey);
  if (!cacheKey) return;

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
    window.localStorage.setItem(cacheKey, JSON.stringify(serializable));
  } catch {
    // ignore storage errors
  }
}

export function readActiveConversationCache(ownerKey?: string | null): ActiveConversationCache | null {
  if (!isBrowser()) return null;
  const cacheKey = scopedKey(ACTIVE_CONVERSATION_CACHE_KEY, ownerKey);
  if (!cacheKey) return null;

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveConversationCache;
  } catch {
    return null;
  }
}

export function clearActiveConversationCache(ownerKey?: string | null) {
  if (!isBrowser()) return;
  const cacheKey = scopedKey(ACTIVE_CONVERSATION_CACHE_KEY, ownerKey);
  try {
    if (cacheKey) {
      window.localStorage.removeItem(cacheKey);
    }
    window.localStorage.removeItem(ACTIVE_CONVERSATION_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function writeConversationsListCache(conversations: any[], ownerKey?: string | null) {
  if (!isBrowser()) return;
  const cacheKey = scopedKey(CONVERSATIONS_LIST_CACHE_KEY, ownerKey);
  if (!cacheKey) return;
  try {
    const serializable = conversations.map(c => ({
      ...c,
      date: c.date instanceof Date ? c.date.toISOString() : c.date
    }));
    window.localStorage.setItem(cacheKey, JSON.stringify(serializable));
  } catch {
    // ignore
  }
}

export function readConversationsListCache(ownerKey?: string | null): any[] | null {
  if (!isBrowser()) return null;
  const cacheKey = scopedKey(CONVERSATIONS_LIST_CACHE_KEY, ownerKey);
  if (!cacheKey) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.map((c: any) => ({
      ...c,
      date: new Date(c.date)
    }));
  } catch {
    return null;
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
