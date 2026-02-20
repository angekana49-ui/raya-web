import { NextRequest, NextResponse } from 'next/server'
import { getConversations, createConversation } from '@/services/supabase-chat.service'
import { TEST_USER_ID } from '@/lib/supabase/test-user'

export async function GET() {
  try {
    const conversations = await getConversations(TEST_USER_ID)
    return NextResponse.json({ data: conversations })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title } = await req.json()
    const conversation = await createConversation(TEST_USER_ID, title || 'Nouvelle conversation')
    return NextResponse.json({ data: conversation })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
