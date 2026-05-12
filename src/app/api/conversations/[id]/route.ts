import { NextRequest, NextResponse } from 'next/server'
import { getMessages, updateConversation, deleteConversation } from '@/services/supabase-chat.service'
import { resolveUserId } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserId(_req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const messages = await getMessages(userId, id)
    return NextResponse.json({ data: messages })
  } catch (error: any) {
    const message = error?.message || 'Failed to load conversation'
    const status = message.toLowerCase().includes('access denied') || message.toLowerCase().includes('not found')
      ? 404
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const updates = await req.json()
    const conversation = await updateConversation(userId, id, updates)
    return NextResponse.json({ data: conversation })
  } catch (error: any) {
    const message = error?.message || 'Failed to update conversation'
    const status = message.toLowerCase().includes('access denied') || message.toLowerCase().includes('not found')
      ? 404
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await resolveUserId(_req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    await deleteConversation(userId, id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const message = error?.message || 'Failed to delete conversation'
    const status = message.toLowerCase().includes('access denied') || message.toLowerCase().includes('not found')
      ? 404
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
