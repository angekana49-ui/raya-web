import { NextRequest, NextResponse } from 'next/server'
import { updateConversation, callAnalyzeSession } from '@/services/supabase-chat.service'
import { resolveUserId } from '@/lib/auth'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserId(_req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params

    // Mark conversation as inactive
    await updateConversation(userId, id, { is_active: false })

    // Call Edge Function to generate insight (best-effort)
    try {
      const analysisResult = await callAnalyzeSession(id)
      return NextResponse.json({ success: true, analysis: analysisResult })
    } catch (analysisError: any) {
      console.error('analyze-session failed:', analysisError)
      return NextResponse.json({ success: true, analysisError: analysisError.message })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
