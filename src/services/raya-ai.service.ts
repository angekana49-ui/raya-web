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

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
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
  thinkingBudget?: number; // For Gemini (legacy)
  thinkingLevel?: string; // For Gemini 3.x: "NONE" | "LOW" | "MEDIUM" | "HIGH"
  topP?: number;
  reasoningEffort?: string; // For reasoning models (e.g. Groq gpt-oss): "low" | "medium" | "high"
  enableTools?: boolean; // Enable Gemini tools (urlContext, codeExecution, googleSearch)
  systemPromptPath?: string;
  studentContext?: string; // Dynamic per-user context appended after the static prompt
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface FilePayload {
  name: string;
  type: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'other';
  mimeType?: string;
  base64?: string;
}

type ExchangeType = 'test' | 'exercise' | 'discussion' | 'explanation' | 'social';
type StudentVerdict = 'correct' | 'partial' | 'incorrect' | 'not_applicable';
type Difficulty = 'easy' | 'medium' | 'hard';

export interface RayaInsight {
  exchange_type: ExchangeType;
  student_verdict: StudentVerdict;
  difficulty: Difficulty;
  concept_id: string;
  pkm_delta: number;
  // MOAT signals (optional — RAYA populates when detectable)
  prerequisite_gap_level?: string;                        // e.g. "4ème" or "Grade 6" — detected prerequisite gap
  cognitive_depth?: 'surface' | 'procedural' | 'deep';   // question depth classification
  curriculum_ref?: string;                                // e.g. "CCSS.MATH.HSA.REI.B.4" or "BAC-MATH-PROB"
  mission_grade?: {
    score: number;
    max: 10 | 20;
    feedback: string;
  };
}

export interface RayaResponse {
  text: string;
  insight: RayaInsight | null;
  insightFailureReason?: 'no_block' | 'parse_error' | 'validation_failed';
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
// CONTEXT CACHE — module-level singleton (shared across all requests / instances)
// Caches the static portion of the system prompt (sections 1–13, without §14).
// Falls back gracefully if the model doesn't support caching.
// ============================================================================

interface GeminiCacheEntry { name: string; model: string; expiresAt: number; }

let _staticPromptText: string | null = null;
let _geminiCache: GeminiCacheEntry | null = null;
let _cachingDisabled = false;            // set after first 429 to skip all future attempts
const CACHE_TTL_SECONDS = 3600;          // 1 h
const CACHE_REFRESH_MS  = 5 * 60 * 1000; // refresh 5 min before expiry

// ============================================================================
// RAYA AI SERVICE - DUAL PROVIDER
// ============================================================================

export class RayaAIService {
  private provider: AIProvider;
  private geminiClient?: GoogleGenAI;
  private openaiClient?: OpenAI;
  private config: Required<Omit<RayaConfig, 'provider' | 'baseURL' | 'thinkingBudget' | 'thinkingLevel' | 'topP' | 'reasoningEffort' | 'enableTools' | 'studentContext'>> & {
    baseURL?: string;
    thinkingBudget?: number;
    thinkingLevel?: string;
    topP?: number;
    reasoningEffort?: string;
    enableTools?: boolean;
    studentContext?: string;
  };
  private systemPrompt: string;
  private conversationHistory: ChatMessage[] = [];

  constructor(config: RayaConfig) {
    this.provider = config.provider || 'gemini';

    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model: config.model || (this.provider === 'gemini' ? 'gemini-3.1-flash-lite-preview' : 'gpt-4o-mini'),
      temperature: config.temperature || 0.75,
      maxTokens: config.maxTokens || 4096,
      thinkingBudget: config.thinkingBudget,
      thinkingLevel: config.thinkingLevel || 'MEDIUM',
      topP: config.topP || 0.85,
      reasoningEffort: config.reasoningEffort,
      enableTools: config.enableTools ?? false,
      systemPromptPath: config.systemPromptPath || path.join(process.cwd(), 'prompts/RAYA_v3.0_SYSTEM_PROMPT.md'),
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
    let prompt: string;

    // 1. Try Environment Variable (Production/Secure fallback)
    if (process.env.RAYA_SYSTEM_PROMPT) {
      prompt = process.env.RAYA_SYSTEM_PROMPT;
    } else {
      // 2. Try Local File (Development/Configurable default)
      try {
        prompt = fs.readFileSync(this.config.systemPromptPath, 'utf-8');
      } catch (error) {
        console.warn('System prompt file not found at:', this.config.systemPromptPath);
        throw new Error('System prompt not found in Environment (RAYA_SYSTEM_PROMPT) or File. Deploy will fail without it.');
      }
    }

    if (this.config.studentContext) {
      // Replace the placeholder section 14 with the real live context
      const marker = '## 14. LIVE STUDENT CONTEXT — INJECTED EACH SESSION';
      const idx = prompt.indexOf(marker);
      if (idx !== -1) {
        prompt = prompt.slice(0, idx) + this.config.studentContext;
      } else {
        prompt += '\n\n' + this.config.studentContext;
      }
    }
    return prompt;
  }

  // ==========================================================================
  // CONTEXT CACHING — static prompt (§1–13) cached on Gemini servers
  // ==========================================================================

  /** Returns the static portion of the system prompt (everything before §14). */
  private loadStaticPrompt(): string {
    if (_staticPromptText) return _staticPromptText;
    let raw: string;
    try {
      raw = fs.readFileSync(this.config.systemPromptPath, 'utf-8');
    } catch {
      throw new Error('System prompt file not found');
    }
    const marker = '## 14. LIVE STUDENT CONTEXT';
    const idx = raw.indexOf(marker);
    _staticPromptText = idx !== -1 ? raw.slice(0, idx).trimEnd() : raw;
    return _staticPromptText;
  }

  /**
   * Returns the cached-content name for the static system prompt.
   * Creates a new cache if none exists or the existing one is about to expire.
   * Returns null if the model doesn't support context caching (graceful fallback).
   */
  private async tryGetOrCreateCache(): Promise<string | null> {
    if (!this.geminiClient) return null;
    if (_cachingDisabled) return null;
    // Don't cache when tools are enabled (tools must be baked into the cache too)
    if (this.config.enableTools) return null;

    const now = Date.now();
    if (
      _geminiCache &&
      _geminiCache.model === this.config.model &&
      _geminiCache.expiresAt > now + CACHE_REFRESH_MS
    ) {
      return _geminiCache.name;
    }

    try {
      const staticPrompt = this.loadStaticPrompt();
      const cache = await (this.geminiClient as any).caches.create({
        model: this.config.model,
        config: {
          systemInstruction: staticPrompt,
          ttl: `${CACHE_TTL_SECONDS}s`,
        },
      });
      _geminiCache = {
        name: cache.name as string,
        model: this.config.model,
        expiresAt: now + CACHE_TTL_SECONDS * 1000,
      };
      console.log(`[RAYA] Gemini cache created: ${cache.name}`);
      return _geminiCache.name;
    } catch (err: any) {
      _cachingDisabled = true;
      console.warn('[RAYA] Context caching disabled (quota/unsupported), using inline prompt');
      return null;
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
    const config = this.buildGeminiConfig({ systemInstruction: this.systemPrompt });

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
      content: this.stripInsight(fullText),
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
      ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort as any } : {}),
    });

    const fullText = response.choices[0]?.message?.content || '';

    // Add response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: this.stripInsight(fullText),
    });

    return this.parseResponse(fullText, progressionState);
  }

  // ==========================================================================
  // CHAT - STREAMING
  // ==========================================================================

  async *chatStream(
    userMessage: string,
    userTier: 'free' | 'premium' = 'free',
    progressionState?: ProgressionState,
    files?: FilePayload[]
  ): AsyncGenerator<string, RayaResponse, unknown> {
    if (this.provider === 'gemini') {
      return yield* this.chatStreamGemini(userMessage, userTier, progressionState, files);
    } else {
      return yield* this.chatStreamOpenAI(userMessage, userTier, progressionState, files);
    }
  }

  private async *chatStreamGemini(
    userMessage: string,
    userTier: 'free' | 'premium',
    progressionState?: ProgressionState,
    files?: FilePayload[]
  ): AsyncGenerator<string, RayaResponse, unknown> {
    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Try context caching (static §1–13 cached on Gemini servers)
    const cacheName = await this.tryGetOrCreateCache();

    // Build config
    const config = cacheName
      ? this.buildGeminiConfig({ cachedContent: cacheName })
      : this.buildGeminiConfig({ systemInstruction: this.systemPrompt });

    // When using cache, inject §14 student context as the first exchange in contents
    // (it wasn't included in the cached static prompt)
    const historyContents = this.buildGeminiContents();
    let contents = (cacheName && this.config.studentContext)
      ? [
          { role: 'user',  parts: [{ text: `[Session context]\n${this.config.studentContext}` }] },
          { role: 'model', parts: [{ text: 'Compris.' }] },
          ...historyContents,
        ]
      : historyContents;

    // Attach files to the last user message (inlineData)
    if (files && files.length > 0) {
      const fileParts = files
        .filter((f) => f.base64 && f.mimeType)
        .map((f) => ({
          inlineData: { data: f.base64!, mimeType: f.mimeType! },
        }));
      if (fileParts.length > 0 && contents.length > 0) {
        const last = contents[contents.length - 1];
        contents = [
          ...contents.slice(0, -1),
          { ...last, parts: [...(last.parts as any[]), ...fileParts] },
        ];
      }
    }

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
      content: this.stripInsight(fullText),
    });

    return this.parseResponse(fullText, progressionState);
  }

  private async *chatStreamOpenAI(
    userMessage: string,
    userTier: 'free' | 'premium',
    progressionState?: ProgressionState,
    files?: FilePayload[]
  ): AsyncGenerator<string, RayaResponse, unknown> {
    if (!this.openaiClient) throw new Error('OpenAI client not initialized');

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Build last user content — add images if present (OpenAI vision)
    const imageFiles = files?.filter((f) => f.type === 'image' && f.base64 && f.mimeType) ?? [];
    const lastUserContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: 'text', text: userMessage },
      ...imageFiles.map((f) => ({
        type: 'image_url' as const,
        image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
      })),
    ];

    // Build messages (use multimodal content only for last user message)
    const historyWithoutLast = this.conversationHistory.slice(0, -1);
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...historyWithoutLast.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: imageFiles.length > 0 ? lastUserContent : userMessage },
    ];

    const stream = await this.openaiClient.chat.completions.create({
      model: this.config.model,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      messages,
      stream: true,
      ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort as any } : {}),
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
      content: this.stripInsight(fullText),
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
    const config = this.buildGeminiConfig({ systemInstruction: this.systemPrompt });

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
      content: this.stripInsight(fullText),
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
      /---RAYA_INSIGHT---\s*(\{[\s\S]*\})\s*---END_INSIGHT---/
    );

    let mainText = responseText;
    let insight: RayaInsight | null = null;
    let insightFailureReason: RayaResponse['insightFailureReason'];

    if (insightMatch) {
      // Remove insight from main text
      mainText = responseText
        .replace(/---RAYA_INSIGHT---[\s\S]*?---END_INSIGHT---/, '')
        .trim();

      // Parse insight JSON (strict v3 schema validation)
      try {
        const parsed = JSON.parse(insightMatch[1]) as unknown;
        if (this.isValidInsightV3(parsed)) {
          insight = parsed;
        } else {
          insightFailureReason = 'validation_failed';
          console.warn('[RAYA] insight_failed: validation_failed', insightMatch[1].slice(0, 200));
        }
      } catch (error) {
        insightFailureReason = 'parse_error';
        console.error('[RAYA] insight_failed: parse_error', error);
      }
    } else {
      insightFailureReason = 'no_block';
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
      ...(insight === null && insightFailureReason ? { insightFailureReason } : {}),
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

    // v3 progression mapping
    if (insight.exchange_type === 'test') {
      if (insight.student_verdict === 'correct') xp_earned += 25;
      else if (insight.student_verdict === 'partial') xp_earned += 15;
      else if (insight.student_verdict === 'incorrect') xp_earned += 3;
    } else if (insight.exchange_type === 'exercise') {
      if (insight.student_verdict === 'correct') xp_earned += 20;
      else if (insight.student_verdict === 'partial') xp_earned += 10;
      else if (insight.student_verdict === 'incorrect') xp_earned += 3;
    } else if (insight.exchange_type === 'discussion') {
      xp_earned += insight.pkm_delta > 0 ? 3 : 1;
    } else if (insight.exchange_type === 'explanation') {
      xp_earned += 1;
    }

    // Check streak badge
    if (state.streak_days >= 7 && !state.badges.includes('🔥🔥 Burning Flame')) {
      badges_unlocked.push('🔥🔥 Burning Flame');
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

  private isValidInsightV3(value: unknown): value is RayaInsight {
    if (!value || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;

    const exchangeTypes = new Set(['test', 'exercise', 'discussion', 'explanation', 'social']);
    const verdicts = new Set(['correct', 'partial', 'incorrect', 'not_applicable']);
    const difficulties = new Set(['easy', 'medium', 'hard']);

    if (typeof obj.exchange_type !== 'string' || !exchangeTypes.has(obj.exchange_type)) return false;
    if (typeof obj.student_verdict !== 'string' || !verdicts.has(obj.student_verdict)) return false;
    if (typeof obj.difficulty !== 'string' || !difficulties.has(obj.difficulty)) return false;
    if (typeof obj.concept_id !== 'string') return false;
    // concept_id is empty for social exchanges — that's valid
    if (typeof obj.pkm_delta !== 'number' || !Number.isFinite(obj.pkm_delta)) return false;
    if (obj.pkm_delta < -1 || obj.pkm_delta > 1) return false;

    if (obj.mission_grade !== undefined) {
      if (!obj.mission_grade || typeof obj.mission_grade !== 'object') return false;
      const mg = obj.mission_grade as Record<string, unknown>;
      if (mg.max !== 10 && mg.max !== 20) return false;
      if (typeof mg.score !== 'number' || !Number.isInteger(mg.score)) return false;
      if (mg.score < 0 || mg.score > mg.max) return false;
      if (typeof mg.feedback !== 'string') return false;
    }

    return true;
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

  /** Centralized Gemini generation config (thinkingLevel/Budget + tools + topP) */
  private buildGeminiConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const levelMap: Record<string, ThinkingLevel> = {
      MINIMAL: ThinkingLevel.MINIMAL,
      LOW: ThinkingLevel.LOW,
      MEDIUM: ThinkingLevel.MEDIUM,
      HIGH: ThinkingLevel.HIGH,
    };
    
    // If thinkingLevel is NONE, we don't pass a thinkingConfig at all
    const thinkingLevel = this.config.thinkingLevel
      ? levelMap[this.config.thinkingLevel.toUpperCase()]
      : ThinkingLevel.MEDIUM;
      
    const cfg: Record<string, unknown> = {
      temperature: this.config.temperature,
      topP: this.config.topP,
      ...overrides,
    };
    
    if (this.config.thinkingLevel?.toUpperCase() !== 'NONE' && thinkingLevel) {
       cfg.thinkingConfig = { thinkingLevel };
    }

    const tools = this.config.enableTools
      // La recherche Google (googleSearch) a des limites de quota très strictes sur les versions preview (3.1)
      // et provoque une erreur 429 instantanée. On ne garde que codeExecution pour l'instant.
      ? [{ codeExecution: {} }]
      : undefined;

    if (tools) cfg.tools = tools;
    return cfg;
  }

  private stripInsight(text: string): string {
    return text.replace(/---RAYA_INSIGHT---[\s\S]*?---END_INSIGHT---/g, '').trim();
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
