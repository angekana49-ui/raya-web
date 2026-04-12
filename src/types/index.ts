// Types pour RAYA Web

export interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  files?: AttachedFile[];
  timestamp?: Date;
  parentId?: string;
}

export interface AttachedFile {
  id: string;
  name: string;
  type: "image" | "pdf" | "document" | "spreadsheet" | "other";
  url: string;       // local blob URL, remote URL, or persisted data URL
  base64?: string;   // base64-encoded content for sending to AI
  mimeType?: string; // e.g. "image/jpeg", "application/pdf"
  size?: number;
}

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  date: Date;
  isActive?: boolean;
}

export interface StudyRoomPreview {
  id: string;
  title: string;
  mission: string;
  onlineCount: number;
  maxMembers: number;
  vibe: string;
  duration?: number;
  aiMode?: "passive" | "active";
  files?: AttachedFile[];
  conversationId?: string;
  timerStartedAt?: string | null;
  timerEndsAt?: string | null;
  timerStatus?: "idle" | "running" | "finished";
  alert5mSent?: boolean;
  alert2mSent?: boolean;
  alertEndSent?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  hasReport?: boolean;
  reportCreatedAt?: string | null;
}

export interface AIModel {
  id: string;
  name: string;
  provider: "google" | "openai" | "anthropic";
  description: string;
  features: string[];
  maxTokens: number;
  costPerRequest?: number;
  isAvailable: boolean;
  isPremium?: boolean;
}

export interface ChatMode {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export type AIOptionId = "normal" | "rush-mode" | "deep-thinking" | "creative-mode";
