import { NextRequest, NextResponse } from 'next/server'
import { updateConversation, callAnalyzeSession } from '@/services/supabase-chat.service'
import { resolveUserId } from '@/lib/auth'
import type { SessionSummaryPayload } from '@/lib/session-aggregator'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    let sessionSummary: SessionSummaryPayload | null = null

    try {
      const body = await req.json()
      if (body?.session_summary) {
        sessionSummary = body.session_summary as SessionSummaryPayload
      }
    } catch {
      // Optional body; legacy callers still post an empty request.
    }

    // Mark conversation as inactive
    await updateConversation(userId, id, { is_active: false })

    // Call Edge Function to generate insight (best-effort)
    try {
      const analysisResult = await callAnalyzeSession(id, userId, sessionSummary)
      return NextResponse.json({ success: true, analysis: analysisResult })
    } catch (analysisError: any) {
      console.error('analyze-session failed:', analysisError)
      return NextResponse.json({ success: true, analysisError: analysisError.message })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
