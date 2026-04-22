/**
 * RAYA Chat API - Streaming Endpoint
 * POST /api/raya/stream
 *
 * Returns Server-Sent Events (SSE) stream
 * Supports: Gemini (primary) + Groq-compatible fallback on quota/error
 */

import { NextRequest } from 'next/server';
import { RayaAIService, ProgressionState, AIProvider, FilePayload } from '@/services/raya-ai.service';
import { assertConversationAccessible, saveMessage, updateConversation } from '@/services/supabase-chat.service';
import { logLearningEvent } from '@/services/learning-events.service';
import { assertUsageWithinLimits, estimateFileUploadCount, estimateTextTokens, recordUsage } from '@/services/usage-limits.service';
import { getUserEntitlementsForUser } from '@/services/account-entitlements.service';
import { analyzeUserMessage, evaluateExchange } from '@/lib/assessment-engine';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveUserId } from '@/lib/auth';
import { getModelById } from '@/lib/ai-models';
import { getFirstUnlockedMode, getFirstUnlockedModel, isModeUnlocked, isModelUnlocked } from '@/lib/user-entitlements';
import { buildRoomPrompt, shouldRayaRespondInRoom } from '@/lib/room-ai';
import fs from 'fs';
import path from 'path';

const RULE_VERSION = 'v2';
const DAILY_XP_CAP = 500;
const MISSION_MIN_THRESHOLD = 0.35;
const MAX_HISTORY_MESSAGES = 20;
const MAX_FILE_PAYLOADS = 3;
const ROOM_AI_TURN_STALE_MS = 90_000;
const SOLO_SYSTEM_PROMPT_PATH = path.join(process.cwd(), 'prompts/RAYA_v3.0_SYSTEM_PROMPT.md');
const ROOM_SYSTEM_PROMPT_PATH = path.join(process.cwd(), 'prompts/RAYA_ROOMS_PROMPT_DRAFT.md');
const DEFAULT_FALLBACK_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_FALLBACK_MODEL = 'mixtral-8x7b-32768';

type RoomTurnAcquireResult =
  | { ok: true }
  | { ok: false; code: 'ROOM_CLOSED' | 'ROOM_AI_BUSY'; message: string };

const promptTemplateCache = new Map<string, string>();

/** True if the 429/quota error comes from Gemini exhausting its daily free-tier limit. */
const isQuotaError = (error: any): boolean => {
  const msg = String(error?.message || error || '').toLowerCase();
  const status = error?.status || error?.code;
  return (
    status === 429 ||
    status === 503 || // Service unavailable
    status === 401 || // Unauthorized (bad key -> fallback)
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('overloaded')
  );
};

const sanitizeStudentContext = (raw?: string): string | undefined => {
  if (!raw || typeof raw !== 'string') return undefined;
  // Keep context informative but prevent prompt-breakout markers / oversized payloads.
  const stripped = raw
    .replace(/---RAYA_INSIGHT---/gi, '')
    .replace(/---END_INSIGHT---/gi, '')
    .replace(/\u0000/g, '')
    .trim();
  if (!stripped) return undefined;
  return stripped.slice(0, 4000);
};

const hasMissionGradeTag = (text: string): boolean =>
  /\[MISSION_GRADE:(10|20)\]/i.test(text);

const buildModeInstruction = (modeId?: string): string => {
  switch (modeId) {
    case 'rush-mode':
      return '[AI MODE]\nRush Mode: answer quickly, stay concise, prioritize direct help and short explanations.\n';
    case 'deep-thinking':
      return '[AI MODE]\nDeep Thinking: slow down, reason carefully, show structure, and explain difficult steps thoroughly.\n';
    case 'creative-mode':
      return '[AI MODE]\nCreative Mode: use memorable analogies, inventive examples, and more playful explanations while staying accurate.\n';
    default:
      return '';
  }
};

const getRecentRoomAcademicHealth = async (conversationId: string): Promise<{ nullRatio: number; total: number }> => {
  const { data, error } = await supabaseAdmin
    .from('learning_events')
    .select('event_type, payload')
    .eq('conversation_id', conversationId)
    .in('event_type', ['insight_validated', 'insight_failed'])
    .order('occurred_at', { ascending: false })
    .limit(10);

  if (error || !data || data.length < 5) return { nullRatio: 0, total: data?.length || 0 };

  const nonAcademicCount = data.filter(evt => {
    if (evt.event_type === 'insight_failed') return true;
    const exchangeType = evt.payload?.exchange_type;
    return exchangeType === 'social' || !exchangeType;
  }).length;

  return { 
    nullRatio: nonAcademicCount / data.length,
    total: data.length
  };
};

const isValidMissionGrade = (value: unknown): value is { score: number; max: 10 | 20; feedback: string } => {
  if (!value || typeof value !== 'object') return false;
  const mg = value as Record<string, unknown>;
  if (mg.max !== 10 && mg.max !== 20) return false;
  if (typeof mg.score !== 'number' || !Number.isInteger(mg.score)) return false;
  if (mg.score < 0 || mg.score > mg.max) return false;
  if (typeof mg.feedback !== 'string') return false;
  return true;
};

const missionGradeToBaseXP = (max: 10 | 20): number => (max === 20 ? 80 : 50);

const missionGradeToXP = (score: number, max: 10 | 20): number => {
  const ratio = score / max;
  if (ratio < MISSION_MIN_THRESHOLD) return 0;
  return Math.round(missionGradeToBaseXP(max) * ratio);
};

const getTodaysXpAwarded = async (userId: string): Promise<number> => {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabaseAdmin
    .from('learning_events')
    .select('event_type,payload')
    .eq('user_id', userId)
    .in('event_type', ['xp_awarded', 'mission_rewarded'])
    .gte('occurred_at', dayStart.toISOString());

  if (error || !data) return 0;
  return data.reduce((sum, row: any) => {
    const xp = Number(row?.payload?.xp_earned ?? 0);
    return sum + (Number.isFinite(xp) ? Math.max(0, xp) : 0);
  }, 0);
};

const getPromptTemplate = (promptPath: string, envKey?: string): string => {
  const envPrompt = envKey ? process.env[envKey] : undefined;
  // Validate: skip if it looks like unresolved shell syntax (e.g. "$(cat ...)")
  // or is too short to be a real prompt
  if (envPrompt && envPrompt.length > 200 && !envPrompt.includes('$(') && !envPrompt.includes('`cat ')) {
    return envPrompt;
  }
  if (envPrompt) {
    console.warn(`[RAYA] Env ${envKey} looks invalid (len=${envPrompt.length}, contains shell syntax). Falling back to file: ${promptPath}`);
  }

  const cached = promptTemplateCache.get(promptPath);
  if (cached) {
    return cached;
  }

  const prompt = fs.readFileSync(promptPath, 'utf-8');
  promptTemplateCache.set(promptPath, prompt);
  return prompt;
};

const buildGeminiInstance = (
  studentContext?: string,
  requestedModel?: string,
  systemPrompt?: string,
  systemPromptPath?: string,
) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return new RayaAIService({
    provider: 'gemini' as AIProvider,
    apiKey,
    model: requestedModel || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview',
    temperature: parseFloat(process.env.RAYA_TEMPERATURE || '0.75'),
    maxTokens: parseInt(process.env.RAYA_MAX_TOKENS || '4096'),
    thinkingLevel: process.env.GEMINI_THINKING_LEVEL || 'MEDIUM',
    topP: parseFloat(process.env.RAYA_TOP_P || '0.85'),
    enableTools: process.env.GEMINI_ENABLE_TOOLS === 'true',
    systemPrompt,
    systemPromptPath,
    studentContext: sanitizeStudentContext(studentContext),
  });
};

const buildOpenAIInstance = (
  studentContext?: string,
  requestedModel?: string,
  systemPrompt?: string,
  systemPromptPath?: string,
) => {
  const apiKey = process.env.RAYA_API_KEY;
  if (!apiKey) throw new Error('RAYA_API_KEY not configured');
  return new RayaAIService({
    provider: 'openai' as AIProvider,
    apiKey,
    baseURL: process.env.RAYA_BASE_URL || 'https://api.openai.com/v1',
    model: requestedModel || process.env.RAYA_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.RAYA_TEMPERATURE || '0.75'),
    maxTokens: parseInt(process.env.RAYA_MAX_TOKENS || '4096'),
    reasoningEffort: process.env.RAYA_REASONING_EFFORT || undefined,
    systemPrompt,
    systemPromptPath,
    studentContext: sanitizeStudentContext(studentContext),
  });
};

const buildFallbackInstance = (
  studentContext?: string,
  requestedModel?: string,
  systemPrompt?: string,
  systemPromptPath?: string,
) => {
  const apiKey = process.env.RAYA_API_KEY;
  if (!apiKey) throw new Error('RAYA_API_KEY not configured');
  return new RayaAIService({
    provider: 'openai' as AIProvider,
    apiKey,
    baseURL: process.env.RAYA_BASE_URL || DEFAULT_FALLBACK_BASE_URL,
    model: requestedModel || process.env.RAYA_MODEL || DEFAULT_FALLBACK_MODEL,
    temperature: parseFloat(process.env.RAYA_TEMPERATURE || '0.75'),
    maxTokens: parseInt(process.env.RAYA_MAX_TOKENS || '4096'),
    reasoningEffort: process.env.RAYA_REASONING_EFFORT || undefined,
    systemPrompt,
    systemPromptPath,
    studentContext: sanitizeStudentContext(studentContext),
  });
};

const getRoomRuntimeState = async (conversationId: string) => {
  const { data, error } = await supabaseAdmin
    .from('study_rooms')
    .select('id, is_active, timer_status, ai_turn_status, ai_turn_started_at, max_members, online_count')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

const tryAcquireRoomAiTurn = async (conversationId: string): Promise<RoomTurnAcquireResult> => {
  // Read-then-update avoids fragile PostgREST `.or()` filter strings on timestamps.
  const { data: roomRow, error: fetchError } = await supabaseAdmin
    .from('study_rooms')
    .select('id, is_active, timer_status, ai_turn_status, ai_turn_started_at')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!roomRow || roomRow.is_active === false || roomRow.timer_status === 'finished') {
    return {
      ok: false,
      code: 'ROOM_CLOSED',
      message: 'This room session is closed. The room is now read-only.',
    };
  }

  const startedMs = roomRow.ai_turn_started_at
    ? new Date(roomRow.ai_turn_started_at).getTime()
    : 0;
  const stale = !roomRow.ai_turn_started_at || startedMs < Date.now() - ROOM_AI_TURN_STALE_MS;
  const locked = roomRow.ai_turn_status === 'busy' && !stale;
  if (locked) {
    return {
      ok: false,
      code: 'ROOM_AI_BUSY',
      message: 'Raya is already responding to the room. Let the current response finish before calling Raya again.',
    };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('study_rooms')
    .update({
      ai_turn_status: 'busy',
      ai_turn_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomRow.id)
    .eq('is_active', true)
    .in('timer_status', ['idle', 'running'])
    .select('id')
    .maybeSingle();

  if (updateError) throw updateError;
  if (updated?.id) {
    return { ok: true };
  }

  return {
    ok: false,
    code: 'ROOM_AI_BUSY',
    message: 'Raya is already responding to the room. Let the current response finish before calling Raya again.',
  };
};

const releaseRoomAiTurn = async (conversationId: string) => {
  const { error } = await supabaseAdmin
    .from('study_rooms')
    .update({
      ai_turn_status: 'idle',
      ai_turn_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('conversation_id', conversationId);

  if (error) {
    console.error('[RAYA] Failed to release room AI turn lock:', error);
  }
};

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Authentication required to use Raya AI.' }), { status: 401 });
    }

    const body = await req.json();
    const {
      message,
      conversationId,
      aiMode,
      progressionState,
      conversationHistory,
      sessionId,
      clientMessageId,
      studentContext,
      files,
      model,
      parentId,
      roomMission, 
      actionType, 
    } = body;
    const filePayloads: FilePayload[] | undefined = Array.isArray(files) && files.length > 0
      ? files.slice(0, MAX_FILE_PAYLOADS)
      : undefined;
    const safeConversationHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-MAX_HISTORY_MESSAGES)
      : undefined;
    const requestedFileUploads = estimateFileUploadCount(filePayloads);

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400 });
    }

    if (message.length > 20000) {
      return new Response(JSON.stringify({ error: 'Message is too long (max 20000 chars)' }), { status: 413 });
    }

    const isRoomRequest = Boolean(roomMission);
    const requestedRoomMode = aiMode === 'passive' ? 'passive' : 'active';
    
    if (isRoomRequest) {
      console.log(`[RAYA] Room Request detected. Mode: ${requestedRoomMode}, Mission length: ${roomMission.length}`);
    }

    // Access check + entitlements in parallel (independent round-trips).
    const [, entitlements] = await Promise.all([
      conversationId && userId
        ? assertConversationAccessible(userId, conversationId)
        : Promise.resolve(null),
      userId ? getUserEntitlementsForUser(userId) : Promise.resolve(null),
    ]);
    const effectiveMode = isRoomRequest
      ? requestedRoomMode
      : entitlements
      ? (isModeUnlocked(entitlements, String(aiMode || 'normal'))
          ? String(aiMode || 'normal')
          : getFirstUnlockedMode(entitlements, 'normal'))
      : String(aiMode || 'normal');
    const effectiveModel = entitlements
      ? (isModelUnlocked(entitlements, String(model || 'gemini-3.1-flash-lite-preview'))
          ? String(model || 'gemini-3.1-flash-lite-preview')
          : getFirstUnlockedModel(entitlements, 'gemini-3.1-flash-lite-preview'))
      : String(model || 'gemini-3.1-flash-lite-preview');

    const effectiveUserTier = entitlements?.hasPremiumAccess ? 'premium' : 'free';
    const requestedModelInfo = getModelById(effectiveModel);
    
    console.log(`[RAYA] effectiveModel: ${effectiveModel}, provider: ${requestedModelInfo?.provider || 'google'}`);

    const requestedProvider = requestedModelInfo?.provider === 'google'
      ? 'google'
      : (effectiveModel.startsWith('gpt-') || effectiveModel.startsWith('claude-') || effectiveModel.startsWith('openai/') || requestedModelInfo?.provider === 'openai')
        ? 'openai'
        : 'google';
    const geminiRequestedModel = requestedProvider === 'google' ? effectiveModel : undefined;
    const openAIRequestedModel = requestedProvider === 'openai' ? effectiveModel : undefined;

    // 1. Resolve room state and academic health if applicable
    let shouldRespond = true; 
    let shouldForceHealthIntervention = false;
    let roomState = null;

    if (isRoomRequest && conversationId) {
      const [runtime, health] = await Promise.all([
        getRoomRuntimeState(conversationId),
        requestedRoomMode === 'passive'
          ? getRecentRoomAcademicHealth(conversationId)
          : Promise.resolve({ nullRatio: 0, total: 0 }),
      ]);
      roomState = runtime;
      if (!roomState || roomState.is_active === false || roomState.timer_status === 'finished') {
        return new Response(
          JSON.stringify({ error: 'This room session is closed. The room is now read-only.', code: 'ROOM_CLOSED' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (requestedRoomMode === 'passive' && health.total >= 8 && health.nullRatio >= 0.85) {
        shouldForceHealthIntervention = true;
      }

      shouldRespond = shouldRayaRespondInRoom({
        mode: requestedRoomMode,
        userMessage: message,
        actionType,
        healthIntervention: shouldForceHealthIntervention,
      });
    }

    // 2. Select context and system prompt
    let systemPrompt: string;
    let finalStudentContext: string;

    if (isRoomRequest) {
      const roomPromptBase = getPromptTemplate(ROOM_SYSTEM_PROMPT_PATH, 'RAYA_ROOMS_SYSTEM_PROMPT');
      systemPrompt = roomPromptBase; // In rooms, the base prompt IS the room prompt
      finalStudentContext = buildRoomPrompt({
        mission: roomMission || 'General study session',
        mode: effectiveMode as any,
        userMessage: message,
        actionType,
        healthIntervention: shouldForceHealthIntervention,
        studentContext: studentContext ? String(studentContext) : '',
        timerStatus: isRoomRequest && conversationId && roomState ? String(roomState.timer_status) : undefined,
        maxMembers: roomState?.max_members ?? undefined,
        onlineCount: roomState?.online_count ?? undefined,
      });
    } else {
      systemPrompt = getPromptTemplate(SOLO_SYSTEM_PROMPT_PATH, 'RAYA_SYSTEM_PROMPT');
      const modeInstruction = buildModeInstruction(effectiveMode);
      finalStudentContext = modeInstruction 
        ? `${modeInstruction}\n${studentContext || ''}`.trim()
        : String(studentContext || '');
    }

    // Usage limits are enforced inside the stream (parallel with user message save) to avoid a duplicate DB round-trip here.

    const turnId = typeof clientMessageId === 'string' && clientMessageId.trim().length > 0
      ? clientMessageId.trim()
      : `srv_${Date.now()}`;
    const turnKeyBase = conversationId ? `${conversationId}:${turnId}` : null;
    const missionContextPresent =
      hasMissionGradeTag(message) ||
      (Array.isArray(safeConversationHistory) &&
        safeConversationHistory.some((m: any) =>
          m?.role === 'user' && hasMissionGradeTag(String(m?.content ?? m?.text ?? ''))
        ));

    // Parallelized initial tasks (DB Save + Usage check)
    // We don't await usage check or message save *before* starting the stream logic
    // unless they fail immediately.
    const userMsgPromise = (conversationId && userId) 
      ? saveMessage(userId, conversationId, {
          sender: 'user',
          text: message,
          sender_user_id: userId,
          mode_used: effectiveMode || 'normal',
          parent_id: parentId,
          action_type: actionType,
        }).catch(e => {
          console.error('[RAYA] Failed to save user message:', e);
          return null;
        })
      : Promise.resolve(null);

    const usagePromise = userId 
      ? assertUsageWithinLimits(userId, {
          estimatedInputTokens: estimateTextTokens(message),
          requestedFileUploads,
        }).catch(e => {
          throw e; // We want context of usage limits to stop the stream
        })
      : Promise.resolve();

    const roomTurnLockPromise: Promise<RoomTurnAcquireResult> =
      isRoomRequest && conversationId && shouldRespond
        ? tryAcquireRoomAiTurn(conversationId)
        : Promise.resolve({ ok: true as const });

    const encoder = new TextEncoder();
    let roomTurnLocked = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        // User save + usage + room AI lock in parallel to reduce time-to-first-token.
        const [userMsgSaved, , turnLock] = await Promise.all([
          userMsgPromise,
          usagePromise,
          roomTurnLockPromise,
        ]);
        const userMsgId = userMsgSaved?.id;

        if (isRoomRequest && conversationId) {
          if (!turnLock.ok) {
            send({ type: 'error', error: turnLock.message, code: turnLock.code });
            controller.close();
            return;
          }
          roomTurnLocked = true;
        }

        if (turnKeyBase && userId && conversationId) {
          logLearningEvent({
            userId,
            conversationId,
            eventType: 'message_sent',
            idempotencyKey: `${turnKeyBase}:user`,
            payload: {
              mode: effectiveMode || 'normal',
              has_files: !!(filePayloads && filePayloads.length > 0),
              file_count: filePayloads?.length ?? 0,
            },
            ruleVersion: RULE_VERSION,
          }).catch(console.error);
        }

        // Runs a full stream with the given RayaAIService instance.
        // Returns { fullText, modelUsed, insight } on success, throws on error.
        const runStream = async (raya: RayaAIService, modelUsed: string) => {
          // ROOM RESPONSE ALGO (Execution phase)
          if (!shouldRespond) {
            send({
              type: 'complete',
              content: {
                text: "",
                insight: null,
                progression: null,
                conversationHistory: safeConversationHistory || [],
                sessionId: sessionId || `session_${Date.now()}`,
                userMessageId: userMsgId,
                rayaSkipped: true,
                rayaSkipReason:
                  effectiveMode === 'passive'
                    ? 'passive_no_trigger'
                    : 'room_response_rules',
              },
            });
            return { fullText: "", modelUsed, insight: null };
          }

          if (safeConversationHistory) {
            raya.setHistory(safeConversationHistory);
          }

          const rayaStream = raya.chatStream(
            message,
            effectiveUserTier as 'free' | 'premium',
            progressionState as ProgressionState | undefined,
            filePayloads
          );

          let fullText = '';
          let finalInsight: unknown = null;
          const iterator = rayaStream[Symbol.asyncIterator]();

          while (true) {
            const { done, value } = await iterator.next();
            if (done) {
              const finalResponse = value;
              if (finalResponse) {
                fullText = finalResponse.text || fullText;
                finalInsight = finalResponse.insight ?? null;
                send({
                  type: 'complete',
                  content: {
                    text: finalResponse.text,
                    insight: finalResponse.insight,
                    progression: finalResponse.progression,
                    conversationHistory: raya.getHistory(),
                    sessionId: sessionId || `session_${Date.now()}`,
                    userMessageId: userMsgId, // Return so client knows the parent
                  },
                });
              }
              break;
            }
            fullText += value;
            send({ type: 'chunk', content: value });
          }

          return { fullText, modelUsed, insight: finalInsight };
        };

        try {
          // ── Primary: Gemini (unless env forces OpenAI) ──────────────────────
          const forceOpenAI = process.env.RAYA_PROVIDER === 'openai';
          let result: { fullText: string; modelUsed: string; insight: unknown };

          if (forceOpenAI || requestedProvider === 'openai') {
            result = await runStream(
              buildOpenAIInstance(finalStudentContext, openAIRequestedModel, systemPrompt, isRoomRequest ? ROOM_SYSTEM_PROMPT_PATH : SOLO_SYSTEM_PROMPT_PATH),
              openAIRequestedModel || process.env.RAYA_MODEL || 'gpt-4o-mini'
            );
          } else {
            try {
              result = await runStream(
                buildGeminiInstance(finalStudentContext, geminiRequestedModel, systemPrompt, isRoomRequest ? ROOM_SYSTEM_PROMPT_PATH : SOLO_SYSTEM_PROMPT_PATH),
                geminiRequestedModel || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview'
              );
            } catch (geminiError: any) {
              const openaiKey = process.env.RAYA_API_KEY;
              const openaiReady = openaiKey && !openaiKey.startsWith('YOUR_');
              
              // Broadened fallback: Trigger on Quota, Server errors (5xx), or typical performance timeouts
              const shouldFallback = isQuotaError(geminiError) || 
                                     geminiError.status >= 500 || 
                                     geminiError.message?.toLowerCase().includes('timeout') ||
                                     geminiError.message?.toLowerCase().includes('econnreset');

              if (shouldFallback && openaiReady) {
                console.warn('[RAYA] Primary AI issues detected — falling back to secondary provider', geminiError.message);
                try {
                  result = await runStream(
                    buildFallbackInstance(
                      finalStudentContext,
                      undefined,
                      systemPrompt,
                      isRoomRequest ? ROOM_SYSTEM_PROMPT_PATH : SOLO_SYSTEM_PROMPT_PATH,
                    ),
                    process.env.RAYA_MODEL || DEFAULT_FALLBACK_MODEL
                  );
                } catch (fallbackError: any) {
                  console.error('[RAYA] Both AI providers failed:', fallbackError);
                  throw fallbackError;
                }
              } else {
                throw geminiError;
              }
            }
          }

          // Save assistant message to DB
          // Bug #1 Fix: Wrap DB ops in try/catch so they don't overwrite user message on failure.
          if (conversationId && userId && result.fullText) {
            try {
              await recordUsage(userId, {
                tokensUsed: estimateTextTokens(message) + estimateTextTokens(result.fullText),
                fileUploadsUsed: requestedFileUploads,
              });

              const aiMsgSaved = await saveMessage(userId, conversationId, {
                sender: 'assistant',
                text: result.fullText,
                model_used: result.modelUsed,
                mode_used: effectiveMode || 'normal',
                parent_id: userMsgId, // The AI message is a child of the user message
              });
              
              // We dispatch a final 'ids_resolved' event so the front-end knows the true DB IDs of both messages in this turn
              if (aiMsgSaved?.id || userMsgId) {
                send({
                  type: 'ids_resolved',
                  content: {
                    userMessageId: userMsgId,
                    assistantMessageId: aiMsgSaved?.id,
                  }
                });
              }

              await updateConversation(userId, conversationId, {
                preview: result.fullText.substring(0, 100),
              });
              if (turnKeyBase) {
                await logLearningEvent({
                  userId,
                  conversationId,
                  eventType: 'assistant_response',
                  idempotencyKey: `${turnKeyBase}:assistant`,
                  payload: {
                    mode: effectiveMode || 'normal',
                    model: result.modelUsed,
                    response_length: result.fullText.length,
                  },
                  ruleVersion: RULE_VERSION,
                });
                if (result.insight && typeof result.insight === 'object') {
                  await logLearningEvent({
                    userId,
                    conversationId,
                    eventType: 'insight_validated',
                    idempotencyKey: `${turnKeyBase}:insight`,
                    payload: result.insight as Record<string, unknown>,
                    ruleVersion: RULE_VERSION,
                  });

                  const maybeMissionGrade = (result.insight as Record<string, unknown>).mission_grade;

                  if (missionContextPresent && isValidMissionGrade(maybeMissionGrade)) {
                    await logLearningEvent({
                      userId,
                      conversationId,
                      eventType: 'mission_graded',
                      idempotencyKey: `${turnKeyBase}:mission_grade`,
                      payload: { mission_grade: maybeMissionGrade as Record<string, unknown> },
                      ruleVersion: RULE_VERSION,
                    });

                    const rawMissionXp = missionGradeToXP(maybeMissionGrade.score, maybeMissionGrade.max);
                    const todaysBeforeMission = await getTodaysXpAwarded(userId);
                    const missionRemainingXp = Math.max(0, DAILY_XP_CAP - todaysBeforeMission);
                    const cappedMissionXp = Math.max(0, Math.min(rawMissionXp, missionRemainingXp));
                    const heartsEarned = cappedMissionXp > 0 ? 1 : 0;

                    await logLearningEvent({
                      userId,
                      conversationId,
                      eventType: 'mission_rewarded',
                      idempotencyKey: `${turnKeyBase}:mission_reward`,
                      payload: {
                        mission_grade: maybeMissionGrade as Record<string, unknown>,
                        xp_earned: cappedMissionXp,
                        raw_xp_earned: rawMissionXp,
                        hearts_earned: heartsEarned,
                        daily_cap: DAILY_XP_CAP,
                        daily_remaining_before_award: missionRemainingXp,
                      },
                      ruleVersion: RULE_VERSION,
                    });
                  }

                  // Deterministic XP event from validated insight + user message analysis.
                  const analysis = analyzeUserMessage(message);
                  const userTurns = Array.isArray(safeConversationHistory)
                    ? safeConversationHistory.filter((m: any) => m?.role === 'user').length + 1
                    : 1;
                  const exchange = evaluateExchange(result.insight as any, analysis, userTurns);
                  const todaysXp = await getTodaysXpAwarded(userId);
                  const remainingXp = Math.max(0, DAILY_XP_CAP - todaysXp);
                  const cappedXp = Math.max(0, Math.min(exchange.xpEarned, remainingXp));

                  await logLearningEvent({
                    userId,
                    conversationId,
                    eventType: 'xp_awarded',
                    idempotencyKey: `${turnKeyBase}:xp`,
                    payload: {
                      xp_earned: cappedXp,
                      raw_xp_earned: exchange.xpEarned,
                      daily_cap: DAILY_XP_CAP,
                      daily_remaining_before_award: remainingXp,
                      quality_label: exchange.qualityLabel,
                      is_academic: exchange.isAcademic,
                      skill_key: exchange.skillKey,
                      skill_delta: exchange.skillDelta,
                      mission_grade: exchange.missionGrade ?? null,
                    },
                    ruleVersion: RULE_VERSION,
                  });
                } else {
                  // ── No insight: log failure + award fallback XP from message analysis ──
                  const failureReason = (result as any).insightFailureReason ?? 'no_block';
                  await logLearningEvent({
                    userId,
                    conversationId,
                    eventType: 'insight_failed',
                    idempotencyKey: `${turnKeyBase}:insight_failed`,
                    payload: { reason: failureReason },
                    ruleVersion: RULE_VERSION,
                  });

                  // Still award XP estimated from message analysis so students aren't penalized
                  const analysis = analyzeUserMessage(message);
                  const userTurns = Array.isArray(safeConversationHistory)
                    ? safeConversationHistory.filter((m: any) => m?.role === 'user').length + 1
                    : 1;
                  const exchange = evaluateExchange(null, analysis, userTurns);
                  if (exchange.isAcademic && exchange.xpEarned > 0) {
                    const todaysXp = await getTodaysXpAwarded(userId);
                    const remainingXp = Math.max(0, DAILY_XP_CAP - todaysXp);
                    const cappedXp = Math.max(0, Math.min(exchange.xpEarned, remainingXp));
                    await logLearningEvent({
                      userId,
                      conversationId,
                      eventType: 'xp_awarded',
                      idempotencyKey: `${turnKeyBase}:xp`,
                      payload: {
                        xp_earned: cappedXp,
                        raw_xp_earned: exchange.xpEarned,
                        daily_cap: DAILY_XP_CAP,
                        daily_remaining_before_award: remainingXp,
                        quality_label: exchange.qualityLabel,
                        is_academic: true,
                        skill_key: exchange.skillKey,
                        skill_delta: exchange.skillDelta,
                        fallback: true,
                      },
                      ruleVersion: RULE_VERSION,
                    });
                  }
                }
              }
            } catch (dbError: any) {
              console.error('[RAYA] Background DB operations failed after stream complete:', {
                error: dbError.message,
                userId,
                conversationId,
                fullTextLength: result.fullText.length
              });
            }
          }

          controller.close();
        } catch (error: any) {
          send({ type: 'error', error: error.message || 'Stream error occurred' });
          controller.close();
        } finally {
          if (roomTurnLocked && conversationId) {
            await releaseRoomAiTurn(conversationId);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('RAYA Stream API Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      // Bug #5: Add Authorization to CORS headers for external clients
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
