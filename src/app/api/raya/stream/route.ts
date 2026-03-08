/**
 * RAYA Chat API - Streaming Endpoint
 * POST /api/raya/stream
 *
 * Returns Server-Sent Events (SSE) stream
 * Supports: Gemini (primary) + OpenAI (automatic fallback on quota/error)
 */

import { NextRequest } from 'next/server';
import { RayaAIService, ProgressionState, AIProvider, FilePayload } from '@/services/raya-ai.service';
import { saveMessage, updateConversation } from '@/services/supabase-chat.service';
import { logLearningEvent } from '@/services/learning-events.service';
import { analyzeUserMessage, evaluateExchange } from '@/lib/assessment-engine';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveUserId } from '@/lib/auth';

const RULE_VERSION = 'v2';
const DAILY_XP_CAP = 500;
const MISSION_MIN_THRESHOLD = 0.35;

/** True if the 429/quota error comes from Gemini exhausting its daily free-tier limit. */
const isQuotaError = (error: any): boolean => {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    error?.status === 429 ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
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

const buildGeminiInstance = (studentContext?: string, requestedModel?: string) => {
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
    studentContext: sanitizeStudentContext(studentContext),
  });
};

const buildOpenAIInstance = (studentContext?: string, requestedModel?: string) => {
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
    studentContext: sanitizeStudentContext(studentContext),
  });
};

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    const body = await req.json();
    const {
      message,
      conversationId,
      aiMode,
      userTier = 'free',
      progressionState,
      conversationHistory,
      sessionId,
      clientMessageId,
      studentContext,
      files,
      model,
      parentId,
    } = body;
    const filePayloads: FilePayload[] | undefined = Array.isArray(files) && files.length > 0
      ? files
      : undefined;

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400 });
    }
    
    // Allow unauthenticated users for "guest mode" but prevent them from writing to DB.
    if (conversationId && !userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized conversation write' }), { status: 401 });
    }
    
    // Bug #6: Validate message length to prevent absurd token counts/DoD.
    if (message.length > 20000) {
      return new Response(JSON.stringify({ error: 'Message is too long (max 20000 chars)' }), { status: 413 });
    }
    const turnId = typeof clientMessageId === 'string' && clientMessageId.trim().length > 0
      ? clientMessageId.trim()
      : `srv_${Date.now()}`;
    const turnKeyBase = conversationId ? `${conversationId}:${turnId}` : null;
    const missionContextPresent =
      hasMissionGradeTag(message) ||
      (Array.isArray(conversationHistory) &&
        conversationHistory.some((m: any) =>
          m?.role === 'user' && hasMissionGradeTag(String(m?.content ?? m?.text ?? ''))
        ));

    // Save user message (non-blocking, but we need its ID for branching so we await it if there's a conversationId)
    let userMsgId: string | undefined = undefined;
    if (conversationId && userId) {
      try {
        const userMsgSaved = await saveMessage(userId, conversationId, {
          sender: 'user',
          text: message,
          mode_used: aiMode || 'normal',
          parent_id: parentId,
        });
        userMsgId = userMsgSaved?.id;
      } catch (e) {
        console.error('Failed to save user message:', e);
      }
      
      if (turnKeyBase) {
        logLearningEvent({
          userId,
          conversationId,
          eventType: 'message_sent',
          idempotencyKey: `${turnKeyBase}:user`,
          payload: {
            mode: aiMode || 'normal',
            has_files: !!(filePayloads && filePayloads.length > 0),
            file_count: filePayloads?.length ?? 0,
          },
          ruleVersion: RULE_VERSION,
        }).catch(console.error);
      }
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        // Runs a full stream with the given RayaAIService instance.
        // Returns { fullText, modelUsed, insight } on success, throws on error.
        const runStream = async (raya: RayaAIService, modelUsed: string) => {
          if (conversationHistory && Array.isArray(conversationHistory)) {
            raya.setHistory(conversationHistory);
          }

          const rayaStream = raya.chatStream(
            message,
            userTier as 'free' | 'premium',
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

          if (forceOpenAI) {
            result = await runStream(
              buildOpenAIInstance(studentContext, model),
              model || process.env.RAYA_MODEL || 'gpt-4o-mini'
            );
          } else {
            try {
              result = await runStream(
                buildGeminiInstance(studentContext, model),
                model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview'
              );
            } catch (geminiError: any) {
              const openaiKey = process.env.RAYA_API_KEY;
              const openaiReady = openaiKey && !openaiKey.startsWith('YOUR_');
              
              if (isQuotaError(geminiError) && openaiReady) {
                // ── Automatic fallback to OpenAI on Gemini quota error ────────
                console.warn('[RAYA] Gemini quota exceeded — falling back to OpenAI/Groq');
                try {
                  result = await runStream(
                    buildOpenAIInstance(studentContext, model),
                    model || process.env.RAYA_MODEL || 'gpt-4o-mini'
                  );
                } catch (fallbackError: any) {
                  // If fallback ALSO hits a quota/429 error, we throw that so it propagates.
                  console.error('[RAYA] Fallback (OpenAI/Groq) ALSO failed:', fallbackError);
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
              const aiMsgSaved = await saveMessage(userId, conversationId, {
                sender: 'assistant',
                text: result.fullText,
                model_used: result.modelUsed,
                mode_used: aiMode || 'normal',
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
                    mode: aiMode || 'normal',
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
                  const userTurns = Array.isArray(conversationHistory)
                    ? conversationHistory.filter((m: any) => m?.role === 'user').length + 1
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
                  const userTurns = Array.isArray(conversationHistory)
                    ? conversationHistory.filter((m: any) => m?.role === 'user').length + 1
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
            } catch (dbError) {
              console.error('[RAYA] Background DB operations failed after stream complete, swallowing to not break client:', dbError);
            }
          }

          controller.close();
        } catch (error: any) {
          send({ type: 'error', error: error.message || 'Stream error occurred' });
          controller.close();
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
