/**
 * RAYA AI Service - Dual Provider (Gemini + OpenAI Fallback)
 * Switch instantly via RAYA_PROVIDER env var
 *
 * Features:
 * - Gemini (primary) with thinking tokens & Google Search
 * - OpenAI (fallback) for instant failover
 * - Streaming support for both
 * - Automatic insight parsing (---RAYA_INSIGHT---)
 * - Progression system (XP, badges, streaks)
 */

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type AIProvider = 'gemini' | 'openai';

export interface RayaConfig {
  provider?: AIProvider;
  apiKey: string;
  baseURL?: string; // For OpenAI
  model?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingBudget?: number; // For Gemini
  enableTools?: boolean; // Enable Google Search for Gemini
  systemPromptPath?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface RayaInsight {
  session_id: string;
  timestamp: string;
  academic: {
    concept: string;
    subject_area: string;
    curriculum_alignment: {
      country: string;
      system: string;
      grade: string;
      exam: string;
      topic_code: string;
    };
    pkm: {
      global: number;
      reformulation: number;
      accuracy: number;
      application: number;
      conceptual_understanding: number;
      procedural_fluency: number;
    };
    performance: {
      attempts: number;
      successes: number;
      errors: string[];
      misconceptions: string[];
      breakthrough_moments: string[];
    };
  };
  pedagogical: {
    learning_patterns: {
      style_indicators: string[];
      effective_strategies: string[];
      struggle_points: string[];
    };
    engagement: {
      level: number;
      persistence: number;
      question_quality: 'low' | 'medium' | 'high';
      autonomy: number;
      help_seeking_behavior: 'too little' | 'appropriate' | 'too much';
    };
    metacognition: {
      self_awareness: number;
      error_detection: number;
      strategy_adaptation: number;
    };
    study_habits?: {
      session_timing?: string;
      energy_level?: string;
      consistency?: string;
      recommendation?: string;
    };
  };
  recommendations: {
    for_student: string;
    for_teacher: string;
    next_steps: string[];
    intervention_needed: boolean;
    estimated_time_to_mastery: string;
  };
  context: {
    session_type: 'SOCRATIC' | 'EXAM_DIRECT' | 'REVIEW';
    session_duration_minutes: number;
    turn_count: number;
    multimodal_used: boolean;
    exam_proximity: number | null;
  };
}

export interface RayaResponse {
  text: string;
  insight: RayaInsight | null;
  progression?: {
    xp_earned: number;
    level: number;
    badges_unlocked: string[];
  };
}

export interface ProgressionState {
  total_xp: number;
  level: number;
  badges: string[];
  streak_days: number;
  last_session_date: string;
}

// ============================================================================
// RAYA AI SERVICE - DUAL PROVIDER
// ============================================================================

export class RayaAIService {
  private provider: AIProvider;
  private geminiClient?: GoogleGenAI;
  private openaiClient?: OpenAI;
  private config: Required<Omit<RayaConfig, 'provider' | 'baseURL' | 'thinkingBudget' | 'enableTools'>> & {
    baseURL?: string;
    thinkingBudget?: number;
    enableTools?: boolean;
  };
  private systemPrompt: string;
  private conversationHistory: ChatMessage[] = [];

  constructor(config: RayaConfig) {
    this.provider = config.provider || 'gemini';

    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model || (this.provider === 'gemini' ? 'gemini-flash-lite-latest' : 'gpt-4o-mini'),
      temperature: config.temperature || 0.75,
      maxTokens: config.maxTokens || 4096,
      thinkingBudget: config.thinkingBudget || 24576,
      enableTools: config.enableTools ?? false,
      systemPromptPath: config.systemPromptPath || path.join(process.cwd(), 'prompts/RAYA_v2.0_SYSTEM_PROMPT_EN.md'),
    };

    // Initialize appropriate client
    if (this.provider === 'gemini') {
      this.geminiClient = new GoogleGenAI({
        apiKey: this.config.apiKey,
      });
    } else {
      this.openaiClient = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL || 'https://api.openai.com/v1',
      });
    }

    this.systemPrompt = this.loadSystemPrompt();
  }

  // ==========================================================================
  // SYSTEM PROMPT LOADING
  // ==========================================================================

  private loadSystemPrompt(): string {
    try {
      return fs.readFileSync(this.config.systemPromptPath, 'utf-8');
    } catch (error) {
      console.error('Failed to load system prompt:', error);
      throw new Error('System prompt file not found. Check systemPromptPath.');
    }
  }

  // ==========================================================================
  // BUILD GEMINI CONTENTS (with system instruction)
  // ==========================================================================

  private buildGeminiContents() {
    return this.conversationHistory
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
  }

  // ==========================================================================
  // CHAT - TEXT ONLY
  // ==========================================================================

  async chat(
    userMessage: string,
    userTier: 'free' | 'premium' = 'free',
    progressionState?: ProgressionState
  ): Promise<RayaResponse> {
    if (this.provider === 'gemini') {
      return this.chatGemini(userMessage, userTier, progressionState);
    } else {
      return this.chatOpenAI(userMessage, userTier, progressionState);
    }
  }

  private async chatGemini(
    userMessage: string,
    userTier: 'free' | 'premium',
    progressionState?: ProgressionState
  ): Promise<RayaResponse> {
    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build config
    const tools = this.config.enableTools ? [{ googleSearch: {} }] : undefined;
    const config: any = {
      systemInstruction: this.systemPrompt,
      thinkingConfig: {
        thinkingBudget: this.config.thinkingBudget,
      },
    };
    if (tools) {
      config.tools = tools;
    }

    // Build contents
    const contents = this.buildGeminiContents();

    // Generate response
    const response = await this.geminiClient.models.generateContent({
      model: this.config.model,
      config,
      contents,
    });

    const fullText = response.text || '';

    // Add response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: fullText,
    });

    return this.parseResponse(fullText, progressionState);
  }

  private async chatOpenAI(
    userMessage: string,
    userTier: 'free' | 'premium',
    progressionState?: ProgressionState
  ): Promise<RayaResponse> {
    if (!this.openaiClient) throw new Error('OpenAI client not initialized');

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build OpenAI messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    const response = await this.openaiClient.chat.completions.create({
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      messages,
    });

    const fullText = response.choices[0]?.message?.content || '';

    // Add response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: fullText,
    });

    return this.parseResponse(fullText, progressionState);
  }

  // ==========================================================================
  // CHAT - STREAMING
  // ==========================================================================

  async *chatStream(
    userMessage: string,
    userTier: 'free' | 'premium' = 'free',
    progressionState?: ProgressionState
  ): AsyncGenerator<string, RayaResponse, unknown> {
    if (this.provider === 'gemini') {
      return yield* this.chatStreamGemini(userMessage, userTier, progressionState);
    } else {
      return yield* this.chatStreamOpenAI(userMessage, userTier, progressionState);
    }
  }

  private async *chatStreamGemini(
    userMessage: string,
    userTier: 'free' | 'premium',
    progressionState?: ProgressionState
  ): AsyncGenerator<string, RayaResponse, unknown> {
    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build config
    const tools = this.config.enableTools ? [{ googleSearch: {} }] : undefined;
    const config: any = {
      systemInstruction: this.systemPrompt,
      thinkingConfig: {
        thinkingBudget: this.config.thinkingBudget,
      },
    };
    if (tools) {
      config.tools = tools;
    }

    // Build contents
    const contents = this.buildGeminiContents();

    // Generate streaming response
    const response = await this.geminiClient.models.generateContentStream({
      model: this.config.model,
      config,
      contents,
    });

    let fullText = '';

    // Stream chunks
    for await (const chunk of response) {
      const chunkText = chunk.text || '';
      if (chunkText) {
        fullText += chunkText;
        yield chunkText;
      }
    }

    // Add response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: fullText,
    });

    return this.parseResponse(fullText, progressionState);
  }

  private async *chatStreamOpenAI(
    userMessage: string,
    userTier: 'free' | 'premium',
    progressionState?: ProgressionState
  ): AsyncGenerator<string, RayaResponse, unknown> {
    if (!this.openaiClient) throw new Error('OpenAI client not initialized');

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build messages
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    const stream = await this.openaiClient.chat.completions.create({
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      messages,
      stream: true,
    });

    let fullText = '';

    // Stream chunks
    for await (const chunk of stream) {
      const chunkText = chunk.choices[0]?.delta?.content || '';
      if (chunkText) {
        fullText += chunkText;
        yield chunkText;
      }
    }

    // Add response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: fullText,
    });

    return this.parseResponse(fullText, progressionState);
  }

  // ==========================================================================
  // CHAT WITH IMAGE (Gemini only)
  // ==========================================================================

  async chatWithImage(
    userMessage: string,
    imageBase64: string,
    mimeType: string = 'image/png',
    userTier: 'free' | 'premium' = 'free',
    progressionState?: ProgressionState
  ): Promise<RayaResponse> {
    if (this.provider !== 'gemini') {
      throw new Error('Image support only available with Gemini provider');
    }

    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: `[IMAGE] ${userMessage}`,
    });

    // Build config
    const tools = this.config.enableTools ? [{ googleSearch: {} }] : undefined;
    const config: any = {
      systemInstruction: this.systemPrompt,
      thinkingConfig: {
        thinkingBudget: this.config.thinkingBudget,
      },
    };
    if (tools) {
      config.tools = tools;
    }

    // Build contents with image
    const contents = [
      ...this.buildGeminiContents().slice(0, -1), // Exclude last message
      {
        role: 'user',
        parts: [
          { text: userMessage },
          {
            inlineData: {
              data: imageBase64,
              mimeType,
            },
          },
        ],
      },
    ];

    const response = await this.geminiClient.models.generateContent({
      model: this.config.model,
      config,
      contents,
    });

    const fullText = response.text || '';

    // Add response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: fullText,
    });

    return this.parseResponse(fullText, progressionState);
  }

  // ==========================================================================
  // RESPONSE PARSING
  // ==========================================================================

  private parseResponse(
    responseText: string,
    progressionState?: ProgressionState
  ): RayaResponse {
    // Extract main text (remove insight JSON)
    const insightMatch = responseText.match(
      /---RAYA_INSIGHT---\s*(\{[\s\S]*?\})\s*---END_INSIGHT---/
    );

    let mainText = responseText;
    let insight: RayaInsight | null = null;

    if (insightMatch) {
      // Remove insight from main text
      mainText = responseText
        .replace(/---RAYA_INSIGHT---[\s\S]*?---END_INSIGHT---/, '')
        .trim();

      // Parse insight JSON
      try {
        insight = JSON.parse(insightMatch[1]);
      } catch (error) {
        console.error('Failed to parse insight JSON:', error);
      }
    }

    // Calculate progression if insight exists
    let progression;
    if (insight && progressionState) {
      progression = this.calculateProgression(insight, progressionState);
    }

    return {
      text: mainText,
      insight,
      progression,
    };
  }

  // ==========================================================================
  // PROGRESSION CALCULATION
  // ==========================================================================

  private calculateProgression(
    insight: RayaInsight,
    state: ProgressionState
  ): { xp_earned: number; level: number; badges_unlocked: string[] } {
    let xp_earned = 0;
    const badges_unlocked: string[] = [];

    // XP from PKM performance
    const pkm = insight.academic.pkm;
    if (pkm.global >= 0.85) {
      xp_earned += 200; // Mastered concept
    } else if (pkm.accuracy >= 0.7) {
      xp_earned += 30; // Good answer
    }

    // XP from engagement
    if (insight.pedagogical.engagement.persistence >= 0.8) {
      xp_earned += 20;
    }

    // Check streak badge
    if (state.streak_days >= 7 && !state.badges.includes('🔥🔥 Burning Flame')) {
      badges_unlocked.push('🔥🔥 Burning Flame');
    }

    // Check mastery badges
    if (pkm.global >= 0.85 && insight.academic.subject_area === 'Algebra') {
      if (!state.badges.includes('∑ Algebraist')) {
        badges_unlocked.push('∑ Algebraist');
        xp_earned += 100;
      }
    }

    // Calculate new level
    const new_total_xp = state.total_xp + xp_earned;
    const new_level = this.calculateLevel(new_total_xp);

    return {
      xp_earned,
      level: new_level,
      badges_unlocked,
    };
  }

  private calculateLevel(total_xp: number): number {
    if (total_xp < 500) return Math.floor(total_xp / 100) + 1;
    if (total_xp < 1500) return Math.floor((total_xp - 500) / 200) + 6;
    if (total_xp < 3500) return Math.floor((total_xp - 1500) / 400) + 11;
    if (total_xp < 7000) return Math.floor((total_xp - 3500) / 700) + 16;
    if (total_xp < 12000) return Math.floor((total_xp - 7000) / 1000) + 21;
    return Math.floor((total_xp - 12000) / 2000) + 26;
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  public clearHistory(): void {
    this.conversationHistory = [];
  }

  public getHistory(): ChatMessage[] {
    return this.conversationHistory;
  }

  public setHistory(history: ChatMessage[]): void {
    this.conversationHistory = history;
  }

  public getProvider(): AIProvider {
    return this.provider;
  }
}

// ============================================================================
// SINGLETON INSTANCE (Optional)
// ============================================================================

let rayaServiceInstance: RayaAIService | null = null;

export function getRayaService(config?: RayaConfig): RayaAIService {
  if (!rayaServiceInstance) {
    if (!config) {
      throw new Error('RayaAIService not initialized. Provide config on first call.');
    }
    rayaServiceInstance = new RayaAIService(config);
  }
  return rayaServiceInstance;
}
