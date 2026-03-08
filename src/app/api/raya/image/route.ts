/**
 * RAYA Chat API - Image/Multimodal Endpoint
 * POST /api/raya/image
 *
 * Full image support with Gemini (primary)
 * Falls back to text-only if OpenAI provider is used
 */

import { NextRequest, NextResponse } from 'next/server';
import { RayaAIService, ProgressionState, AIProvider } from '@/services/raya-ai.service';
import { resolveUserId } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';

const getRayaInstance = () => {
  const provider = (process.env.RAYA_PROVIDER || 'gemini') as AIProvider;

  // Gemini configuration (supports images)
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

  // OpenAI configuration (fallback - no image support)
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
  const userId = await resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized usage' }, { status: 401 });
  }

  const tempFilePath: string | null = null;

  try {
    const formData = await req.formData();
    const message = formData.get('message') as string;
    const image = formData.get('image') as File;
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

    if (!image) {
      return NextResponse.json(
        { error: 'Image is required for this endpoint' },
        { status: 400 }
      );
    }

    if (image.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image is too large (max 5MB)' },
        { status: 413 }
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
    const provider = process.env.RAYA_PROVIDER || 'gemini';

    // Restore conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      raya.setHistory(conversationHistory);
    }

    let response;

    // Gemini: Full image support
    if (provider === 'gemini') {
      // Convert image to base64
      const arrayBuffer = await image.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString('base64');

      response = await raya.chatWithImage(
        message,
        base64Image,
        image.type || 'image/png',
        userTier as 'free' | 'premium',
        progressionState as ProgressionState | undefined
      );
    }
    // OpenAI: Fallback to text-only
    else {
      console.warn('Image support not available with OpenAI provider. Sending text-only.');
      response = await raya.chat(
        `${message} [Note: Image was provided but not processed - OpenAI fallback mode]`,
        userTier as 'free' | 'premium',
        progressionState as ProgressionState | undefined
      );
    }

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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
