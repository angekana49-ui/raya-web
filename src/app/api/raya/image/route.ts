/**
 * RAYA Chat API - Image/Multimodal Endpoint
 * POST /api/raya/image
 *
 * TEMPORARY: Using OpenAI-compatible API (Groq) as a bridge.
 * When Gemini billing is ready, this will be reverted to use
 * @google/genai with full multimodal (chatWithImage) support.
 * For now, images are not processed — only text is sent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { RayaAIService, ProgressionState } from '@/services/raya-ai.service';

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
    const formData = await req.formData();
    const message = formData.get('message') as string;
    const userTier = (formData.get('userTier') as string) || 'free';
    const progressionStateStr = formData.get('progressionState') as string;
    const conversationHistoryStr = formData.get('conversationHistory') as string;
    const sessionId = formData.get('sessionId') as string;

    // Validation
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Parse JSON fields
    const progressionState = progressionStateStr
      ? JSON.parse(progressionStateStr)
      : undefined;
    const conversationHistory = conversationHistoryStr
      ? JSON.parse(conversationHistoryStr)
      : undefined;

    // Initialize RAYA
    const raya = getRayaInstance();

    // Restore conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      raya.setHistory(conversationHistory);
    }

    // TEMPORARY: Send as text-only (full image support returns with Gemini)
    const response = await raya.chat(
      message,
      userTier as 'free' | 'premium',
      progressionState as ProgressionState | undefined
    );

    // Return response
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
    console.error('RAYA Image API Error:', error);

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
