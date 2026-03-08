// AI model configuration for RAYA Web

import type { AIModel, ChatMode } from "@/types";

export const AI_MODELS: AIModel[] = [
  {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1",
    provider: "google",
    description: "Fast and efficient default model",
    features: ["Text", "Images", "Documents", "Code"],
    maxTokens: 8000,
    isAvailable: true,
    isPremium: false,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    description: "Most powerful for complex analysis",
    features: ["Text", "Images", "Advanced Analysis", "Reasoning"],
    maxTokens: 128000,
    costPerRequest: 5,
    isAvailable: true,
    isPremium: true,
  },
  {
    id: "gpt-4",
    name: "GPT-4",
    provider: "openai",
    description: "Balanced high-quality model",
    features: ["Text", "Images", "Code", "Analysis"],
    maxTokens: 8000,
    costPerRequest: 3,
    isAvailable: true,
    isPremium: true,
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    provider: "anthropic",
    description: "Excellent for educational content",
    features: ["Text", "Analysis", "Explanation", "Code"],
    maxTokens: 200000,
    costPerRequest: 4,
    isAvailable: true,
    isPremium: true,
  },
];

export const CHAT_MODES: ChatMode[] = [
  {
    id: "deep-thinking",
    name: "Deep Thinking",
    description: "Detailed analysis and complete response",
    icon: "brain",
    systemPrompt:
      "You are an expert educational assistant. Provide detailed, structured and complete explanations.",
    temperature: 0.3,
    maxTokens: 4000,
  },
  {
    id: "rush-mode",
    name: "Rush Mode",
    description: "Quick and concise response",
    icon: "zap",
    systemPrompt: "You are a quick and efficient assistant. Provide concise and direct answers.",
    temperature: 0.5,
    maxTokens: 1000,
  },
  {
    id: "creative",
    name: "Creative Mode",
    description: "Original and innovative responses",
    icon: "sparkles",
    systemPrompt: "You are a creative assistant. Use analogies and original examples.",
    temperature: 0.8,
    maxTokens: 3000,
  },
];

export const DEFAULT_CONFIG = {
  model: "gemini-3.1-flash-lite-preview",
  mode: "normal",
  temperature: 0.5,
  maxTokens: 2000,
};

export const getModelById = (modelId: string): AIModel | undefined => {
  return AI_MODELS.find((model) => model.id === modelId);
};

export const getModeById = (modeId: string): ChatMode | undefined => {
  return CHAT_MODES.find((mode) => mode.id === modeId);
};
