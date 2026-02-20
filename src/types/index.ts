// Types pour RAYA Web

export interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  files?: AttachedFile[];
  timestamp?: Date;
}

export interface AttachedFile {
  id: string;
  name: string;
  type: "image" | "pdf" | "document" | "spreadsheet" | "other";
  url: string;
  size?: number;
}

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  date: Date;
  isActive?: boolean;
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
