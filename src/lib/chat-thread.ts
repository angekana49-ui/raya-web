import type { Conversation, Message } from "@/types";

export type ConversationRecord = {
  id: string;
  title: string;
  preview?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type MessageRecord = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  parent_id?: string | null;
};

export type ChatHistoryEntry = {
  role: "user" | "assistant";
  content: string;
};

/** Trace from a leaf message back to the root to get the linear conversation branch. */
export function getActiveThread(allMessages: Message[], leafId: string | null): Message[] {
  if (!leafId || allMessages.length === 0) return [];

  const byId: Record<string, Message> = {};
  for (const message of allMessages) {
    byId[message.id] = message;
  }

  const thread: Message[] = [];
  let currentId: string | null = leafId;
  while (currentId && byId[currentId]) {
    thread.unshift(byId[currentId]);
    currentId = byId[currentId].parentId ?? null;
  }

  return thread;
}

export function mapConversationRecord(record: ConversationRecord): Conversation {
  return {
    id: record.id,
    title: record.title,
    preview: record.preview || "",
    date: new Date(record.updated_at || record.created_at || Date.now()),
    isActive: false,
  };
}

export function mapMessageRecord(record: MessageRecord): Message {
  return {
    id: record.id,
    sender: record.sender,
    text: record.text,
    timestamp: new Date(record.timestamp),
    parentId: record.parent_id || undefined,
  };
}

export function getLatestLeafId(records: MessageRecord[]): string | null {
  return records.length > 0 ? records[records.length - 1].id : null;
}

export function buildConversationHistoryFromRecords(records: MessageRecord[]): ChatHistoryEntry[] {
  const activeLeafId = getLatestLeafId(records);
  if (!activeLeafId) return [];

  const messageMap = new Map<string, MessageRecord>(records.map((record) => [record.id, record]));
  const thread: ChatHistoryEntry[] = [];
  let currentId: string | null = activeLeafId;

  while (currentId && messageMap.has(currentId)) {
    const message: MessageRecord = messageMap.get(currentId)!;
    thread.unshift({ role: message.sender, content: message.text });
    currentId = message.parent_id ?? null;
  }

  return thread;
}

export function buildConversationHistoryFromLeaf(
  messages: Message[],
  leafId: string | null | undefined,
): ChatHistoryEntry[] {
  if (!leafId) return [];

  const messageMap = new Map<string, Message>(messages.map((message) => [message.id, message]));
  const thread: ChatHistoryEntry[] = [];
  let currentId: string | null = leafId;

  while (currentId && messageMap.has(currentId)) {
    const message: Message = messageMap.get(currentId)!;
    thread.unshift({ role: message.sender, content: message.text });
    currentId = message.parentId ?? null;
  }

  return thread;
}

export function findMessage(messages: Message[], messageId: string): Message | undefined {
  return messages.find((message) => message.id === messageId);
}

export function getSiblingMessages(messages: Message[], target: Message): Message[] {
  return messages
    .filter((message) => message.parentId === target.parentId)
    .sort((a, b) => {
      const timeA = a.timestamp?.getTime() || 0;
      const timeB = b.timestamp?.getTime() || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });
}

export function findDeepestRecentLeaf(messages: Message[], startId: string): string {
  const childrenMap = new Map<string, Message[]>();

  for (const message of messages) {
    if (!message.parentId) continue;
    const siblings = childrenMap.get(message.parentId) ?? [];
    siblings.push(message);
    childrenMap.set(message.parentId, siblings);
  }

  let deepestLeafId = startId;
  let currentLevel = [findMessage(messages, startId)].filter(Boolean) as Message[];

  while (currentLevel.length > 0) {
    const nextLevel: Message[] = [];

    for (const node of currentLevel) {
      deepestLeafId = node.id;
      const children = childrenMap.get(node.id);
      if (!children || children.length === 0) continue;

      children.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
      if (children[0]) {
        nextLevel.push(children[0]);
      }
    }

    currentLevel = nextLevel;
  }

  return deepestLeafId;
}
