/**
 * RAYA Chat API - Non-Streaming Endpoint
 * POST /api/raya/chat
 */

import { NextRequest, NextResponse } from 'next/server';
import { RayaAIService, ProgressionState } from '@/services/raya-ai.service';

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
    const body = await req.json();
    const {
      message,
      userTier = 'free',
      progressionState,
      conversationHistory,
      sessionId,
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

    // Restore conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      raya.setHistory(conversationHistory);
    }

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
