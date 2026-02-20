/**
 * RAYA AI Service - Multi-Provider Version
 * Uses OpenAI-compatible API (works with Groq, Mistral, OpenAI, Gemini via proxy)
 *
 * Features:
 * - OpenAI SDK with configurable baseURL (multi-provider)
 * - Streaming support
 * - Automatic insight parsing (---RAYA_INSIGHT---)
 * - Progression system (XP, badges, streaks)
 * - Conversation history management
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface RayaConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
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
// RAYA AI SERVICE
// ============================================================================

export class RayaAIService {
  private client: OpenAI;
  private config: Required<RayaConfig>;
  private systemPrompt: string;
  private conversationHistory: ChatMessage[] = [];

  constructor(config: RayaConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.groq.com/openai/v1',
      model: config.model || 'llama-3.3-70b-versatile',
      temperature: config.temperature || 0.75,
      maxTokens: config.maxTokens || 4096,
      systemPromptPath: config.systemPromptPath || path.join(process.cwd(), 'prompts/RAYA_v2.0_SYSTEM_PROMPT_EN.md'),
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });

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
  // BUILD MESSAGES (system + history)
  // ==========================================================================

  private buildMessages(): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    for (const msg of this.conversationHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    return messages;
  }

  // ==========================================================================
  // CHAT - TEXT ONLY
  // ==========================================================================

  async chat(
    userMessage: string,
    userTier: 'free' | 'premium' = 'free',
    progressionState?: ProgressionState
  ): Promise<RayaResponse> {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Generate response
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      messages: this.buildMessages(),
    });

    const fullText = response.choices[0]?.message?.content || '';

    // Add assistant response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: fullText,
    });

    // Parse response
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
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Generate streaming response
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      messages: this.buildMessages(),
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

    // Add assistant response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: fullText,
    });

    // Parse and return final response
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
