import { supabaseAdmin } from '@/lib/supabase/server'

// ---------- CONVERSATIONS ----------

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
  conversationId: string,
  updates: { title?: string; preview?: string; is_active?: boolean }
) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update(updates)
    .eq('id', conversationId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteConversation(conversationId: string) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .delete()
    .eq('id', conversationId)

  if (error) throw error
}

// ---------- MESSAGES ----------

export async function getMessages(conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, sender, text, timestamp, has_files, model_used, mode_used, tokens_used')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: true })

  if (error) throw error
  return data
}

export async function saveMessage(
  conversationId: string,
  message: {
    sender: 'user' | 'assistant'
    text: string
    model_used?: string
    mode_used?: string
    tokens_used?: number
  }
) {
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

export async function callAnalyzeSession(conversationId: string) {
  const { data, error } = await supabaseAdmin.functions.invoke('analyze-session', {
    body: { conversation_id: conversationId },
  })

  if (error) throw error
  return data
}
