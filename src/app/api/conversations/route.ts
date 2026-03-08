import { NextRequest, NextResponse } from 'next/server'
import { getConversations, createConversation } from '@/services/supabase-chat.service'
import { resolveUserId } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req)
  if (!userId) return NextResponse.json({ data: [] })

  try {
    const conversations = await getConversations(userId)
    return NextResponse.json({ data: conversations })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { title } = await req.json()
    const conversation = await createConversation(userId, title || 'New conversation')
    return NextResponse.json({ data: conversation })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
