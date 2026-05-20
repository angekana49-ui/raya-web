/**
 * RAYA Chat API - Non-Streaming Endpoint
 * POST /api/raya/chat
 */

import { NextRequest, NextResponse } from 'next/server';
import { RayaAIService, ProgressionState } from '@/services/raya-ai.service';
import { resolveUserId } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';

const MAX_HISTORY_MESSAGES = 40;

// Initialize RAYA service
const getRayaInstance = () => {
  const apiKey = process.env.RAYA_API_KEY;
  if (!apiKey) {
    throw new Error('RAYA_API_KEY not configured');
  }

  return new RayaAIService({
    apiKey,
    baseURL: process.env.RAYA_BASE_URL || 'https://api.groq.com/openai/v1',
    model: process.env.RAYA_MODEL || 'llama-3.3-70b-versatile',
    temperature: parseFloat(process.env.RAYA_TEMPERATURE || '0.75'),
    maxTokens: parseInt(process.env.RAYA_MAX_TOKENS || '4096'),
  });
};

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required to use Raya AI.' },
        { status: 401 }
      );
    }
    const body = await req.json();
    const {
      message,
      userTier = 'free',
      progressionState,
      conversationHistory,
      sessionId,
      conversationId, // Ajouté
    } = body;

    // Validation
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    // Initialize RAYA
    const raya = getRayaInstance();

    // Restore history from client or Supabase
    let safeConversationHistory = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-MAX_HISTORY_MESSAGES)
      : [];

    if (safeConversationHistory.length < 2 && conversationId && userId) {
      try {
        const { data: dbMessages } = await supabaseAdmin
          .from('messages')
          .select('sender, text')
          .eq('conversation_id', conversationId)
          .order('timestamp', { ascending: false })
          .limit(MAX_HISTORY_MESSAGES);
        
        if (dbMessages && dbMessages.length > 0) {
          safeConversationHistory = dbMessages.reverse().map((m: any) => ({
            role: m.sender === 'assistant' ? 'assistant' : 'user',
            content: m.text,
          }));
          console.log(`[RAYA] Restored ${safeConversationHistory.length} messages from DB.`);
        }
      } catch (err) {
        console.warn('[RAYA] History restoration failed:', err);
      }
    }

    raya.setHistory(safeConversationHistory);

    // Get response
    const response = await raya.chat(
      message,
      userTier as 'free' | 'premium',
      progressionState as ProgressionState | undefined
    );

    // Return response with updated history
    return NextResponse.json({
      success: true,
      data: {
        text: response.text,
        insight: response.insight,
        progression: response.progression,
        conversationHistory: raya.getHistory(),
        sessionId: sessionId || `session_${Date.now()}`,
      },
    });
  } catch (error: any) {
    console.error('RAYA Chat API Error:', error);

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
