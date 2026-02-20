/**
 * RAYA Chat API - Streaming Endpoint
 * POST /api/raya/stream
 *
 * Returns Server-Sent Events (SSE) stream
 * Supports: Gemini (primary) + OpenAI (fallback)
 * Switch via RAYA_PROVIDER env var (gemini|openai)
 */

import { NextRequest } from 'next/server';
import { RayaAIService, ProgressionState, AIProvider } from '@/services/raya-ai.service';
import { saveMessage, updateConversation } from '@/services/supabase-chat.service';

const getRayaInstance = () => {
  const provider = (process.env.RAYA_PROVIDER || 'gemini') as AIProvider;

  // Gemini configuration
  if (provider === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    return new RayaAIService({
      provider: 'gemini',
      apiKey,
      model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
      temperature: parseFloat(process.env.RAYA_TEMPERATURE || '0.75'),
      maxTokens: parseInt(process.env.RAYA_MAX_TOKENS || '4096'),
      thinkingBudget: parseInt(process.env.GEMINI_THINKING_BUDGET || '24576'),
      enableTools: process.env.GEMINI_ENABLE_TOOLS === 'true',
    });
  }

  // OpenAI configuration (fallback)
  else {
    const apiKey = process.env.RAYA_API_KEY;
    if (!apiKey) {
      throw new Error('RAYA_API_KEY not configured');
    }

    return new RayaAIService({
      provider: 'openai',
      apiKey,
      baseURL: process.env.RAYA_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.RAYA_MODEL || 'gpt-4o-mini',
      temperature: parseFloat(process.env.RAYA_TEMPERATURE || '0.75'),
      maxTokens: parseInt(process.env.RAYA_MAX_TOKENS || '4096'),
    });
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      conversationId,
      aiMode,
      userTier = 'free',
      progressionState,
      conversationHistory,
      sessionId,
    } = body;

    // Validation
    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400 }
      );
    }

    // Save user message to DB
    if (conversationId) {
      await saveMessage(conversationId, {
        sender: 'user',
        text: message,
        mode_used: aiMode || 'normal',
      });
    }

    // Initialize RAYA
    const raya = getRayaInstance();

    // Restore conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      raya.setHistory(conversationHistory);
    }

    // Create a TransformStream for streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Get streaming response
          const rayaStream = raya.chatStream(
            message,
            userTier as 'free' | 'premium',
            progressionState as ProgressionState | undefined
          );

          let fullText = '';

          // Stream chunks to client
          const iterator = rayaStream[Symbol.asyncIterator]();
          while (true) {
            const { done, value } = await iterator.next();
            if (done) {
              // value is the final RayaResponse returned by the generator
              const finalResponse = value;
              if (finalResponse) {
                fullText = finalResponse.text || fullText;
                const data = JSON.stringify({
                  type: 'complete',
                  content: {
                    text: finalResponse.text,
                    insight: finalResponse.insight,
                    progression: finalResponse.progression,
                    conversationHistory: raya.getHistory(),
                    sessionId: sessionId || `session_${Date.now()}`,
                  },
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
              break;
            }
            // value is a string chunk
            fullText += value;
            const data = JSON.stringify({ type: 'chunk', content: value });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          // Save assistant message to DB after streaming completes
          if (conversationId && fullText) {
            const provider = process.env.RAYA_PROVIDER || 'gemini';
            const modelUsed = provider === 'gemini'
              ? (process.env.GEMINI_MODEL || 'gemini-flash-lite-latest')
              : (process.env.RAYA_MODEL || 'gpt-4o-mini');

            await saveMessage(conversationId, {
              sender: 'assistant',
              text: fullText,
              model_used: modelUsed,
              mode_used: aiMode || 'normal',
            });

            // Update conversation preview
            await updateConversation(conversationId, {
              preview: fullText.substring(0, 100),
            });
          }

          // Close stream
          controller.close();
        } catch (error: any) {
          const errorData = JSON.stringify({
            type: 'error',
            error: error.message || 'Stream error occurred',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    // Return SSE stream
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
      JSON.stringify({
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
