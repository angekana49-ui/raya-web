import { supabaseAdmin } from '@/lib/supabase/server'
import type { SessionSummaryPayload } from '@/lib/session-aggregator'

// ---------- CONVERSATIONS ----------

export async function assertConversationOwnership(userId: string, conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error('Conversation not found or access denied')
  }
}

export async function getConversations(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, title, preview, is_active, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createConversation(userId: string, title: string) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      user_id: userId,
      title,
      preview: '',
      is_active: true,
      context_type: 'general',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  updates: { title?: string; preview?: string; is_active?: boolean }
) {
  await assertConversationOwnership(userId, conversationId)

  // CRITICAL FIX: Prevent mass assignment. Since supabaseAdmin uses the Service Role key, RLS is bypassed.
  // Passing user input directly into .update() allows attackers to overwrite ANY column (e.g., user_id).
  const safeUpdates: Record<string, any> = {}
  if (updates.title !== undefined) safeUpdates.title = updates.title
  if (updates.preview !== undefined) safeUpdates.preview = updates.preview
  if (updates.is_active !== undefined) safeUpdates.is_active = updates.is_active

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update(safeUpdates)
    .eq('id', conversationId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteConversation(userId: string, conversationId: string) {
  await assertConversationOwnership(userId, conversationId)

  const { error } = await supabaseAdmin
    .from('conversations')
    .delete()
    .eq('id', conversationId)

  if (error) throw error
}

// ---------- MESSAGES ----------

export async function getMessages(userId: string, conversationId: string) {
  await assertConversationOwnership(userId, conversationId)

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, sender, text, timestamp, has_files, model_used, mode_used, tokens_used, parent_id')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true })

  if (error) throw error
  return data
}

export async function saveMessage(
  userId: string,
  conversationId: string,
  message: {
    sender: 'user' | 'assistant'
    text: string
    model_used?: string
    mode_used?: string
    tokens_used?: number
    parent_id?: string
  }
) {
  await assertConversationOwnership(userId, conversationId)

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      ...message,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ---------- EDGE FUNCTION ----------

export async function callAnalyzeSession(
  conversationId: string,
  userId: string,
  sessionSummary?: SessionSummaryPayload | null
) {
  let body: Record<string, unknown> = { conversation_id: conversationId }

  if (sessionSummary) {
    const { data: enrollment, error: enrollmentError } = await supabaseAdmin
      .from('users')
      .select('class_year_id, school_id')
      .eq('id', userId)
      .single()

    if (enrollmentError) throw enrollmentError

    if (enrollment?.class_year_id && enrollment?.school_id) {
      body = {
        conversation_id: conversationId,
        session_summary: {
          ...sessionSummary,
          class_year_id: enrollment.class_year_id,
          school_id: enrollment.school_id,
        },
      }
    }
  }

  const { data, error } = await supabaseAdmin.functions.invoke('analyze-session', {
    body,
  })

  if (error) throw error
  return data
}
