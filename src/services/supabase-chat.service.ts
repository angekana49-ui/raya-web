import { supabaseAdmin } from '@/lib/supabase/server'
import type { SessionSummaryPayload } from '@/lib/session-aggregator'

const GUEST_CONVERSATION_VISIBILITY_DAYS = 30

// Simple request-level cache for user account state to reduce DB roundtrips
const userAccountStateCache = new Map<string, {
  hasVerifiedEmail: boolean
  accountState: 'onboarding_pending' | 'active_unverified' | 'active_verified'
  timestamp: number
}>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

function getGuestVisibilityCutoffIso(): string {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - GUEST_CONVERSATION_VISIBILITY_DAYS)
  return cutoff.toISOString()
}

async function getUserAccountState(userId: string): Promise<{
  hasVerifiedEmail: boolean
  accountState: 'onboarding_pending' | 'active_unverified' | 'active_verified'
}> {
  const cached = userAccountStateCache.get(userId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return { hasVerifiedEmail: cached.hasVerifiedEmail, accountState: cached.accountState };
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('account_state')
    .eq('id', userId)
    .single()

  if (error) throw error

  const accountState = (
    data?.account_state === 'active_unverified' ||
    data?.account_state === 'active_verified' ||
    data?.account_state === 'onboarding_pending'
  )
    ? data.account_state
    : 'onboarding_pending'

  const result = {
    hasVerifiedEmail: accountState === 'active_verified',
    accountState,
  };

  userAccountStateCache.set(userId, { ...result, timestamp: Date.now() });
  return result;
}

type ConversationAccessRow = {
  id: string
  user_id: string
  context_type: string | null
  updated_at: string | null
  study_rooms?:
    | Array<{
        id: string
        is_active: boolean | null
        created_by: string
      }>
    | null
}

async function assertStudyRoomConversationMembership(userId: string, conversation: ConversationAccessRow) {
  const room = (conversation.study_rooms || [])[0]
  if (!room) {
    throw new Error('Conversation not found or access denied')
  }

  if (room.created_by === userId) {
    return room
  }

  const { data, error } = await supabaseAdmin
    .from('study_room_participants')
    .select('user_id')
    .eq('room_id', room.id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error('Conversation not found or access denied')
  }

  return room
}

async function getConversationAccessRow(conversationId: string): Promise<ConversationAccessRow | null> {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select(`
      id,
      user_id,
      context_type,
      updated_at,
      study_rooms (
        id,
        is_active,
        created_by
      )
    `)
    .eq('id', conversationId)
    .maybeSingle()

  if (error) throw error
  return data as ConversationAccessRow | null
}

// ---------- CONVERSATIONS ----------

export async function assertConversationOwnership(userId: string, conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, updated_at')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new Error('Conversation not found or access denied')
  }
}

export async function assertConversationAccessible(userId: string, conversationId: string) {
  const [data, userState] = await Promise.all([
    getConversationAccessRow(conversationId),
    getUserAccountState(userId)
  ]);

  if (!data) {
    throw new Error('Conversation not found or access denied')
  }

  const isOwner = data.user_id === userId

  if (data.context_type === 'study_room') {
    await assertStudyRoomConversationMembership(userId, data)
    return data
  }

  if (!isOwner) {
    throw new Error('Conversation not found or access denied')
  }

  const { hasVerifiedEmail } = userState;
  if (hasVerifiedEmail) return data

  const cutoffIso = getGuestVisibilityCutoffIso()
  const updatedAt = data.updated_at ? new Date(data.updated_at).toISOString() : null
  if (updatedAt && updatedAt < cutoffIso) {
    throw new Error(`This conversation is hidden until you verify your email.`)
  }

  return data
}

export async function getConversations(userId: string) {
  const { hasVerifiedEmail } = await getUserAccountState(userId)
  let query = supabaseAdmin
    .from('conversations')
    .select('id, title, preview, is_active, created_at, updated_at')
    .eq('user_id', userId)
    .or('context_type.is.null,context_type.eq.general')
    .order('updated_at', { ascending: false })
    .limit(50)

  if (!hasVerifiedEmail) {
    query = query.gte('updated_at', getGuestVisibilityCutoffIso())
  }

  const { data, error } = await query

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
  const accessRow = await getConversationAccessRow(conversationId)
  if (!accessRow) {
    throw new Error('Conversation not found or access denied')
  }

  const isOwner = accessRow.user_id === userId

  if (accessRow.context_type === 'study_room') {
    const room = await assertStudyRoomConversationMembership(userId, accessRow)
    if (!room.is_active) {
      throw new Error('Conversation not found or access denied')
    }

    // Room members may refresh preview only. Title/status stay host-owned.
    if (!isOwner && (updates.title !== undefined || updates.is_active !== undefined)) {
      throw new Error('Conversation not found or access denied')
    }
  } else {
    if (!isOwner) {
      throw new Error('Conversation not found or access denied')
    }

    const { hasVerifiedEmail } = await getUserAccountState(userId)
    if (!hasVerifiedEmail) {
      const cutoffIso = getGuestVisibilityCutoffIso()
      const updatedAt = accessRow.updated_at ? new Date(accessRow.updated_at).toISOString() : null
      if (updatedAt && updatedAt < cutoffIso) {
        throw new Error(`This conversation is hidden until you verify your email.`)
      }
    }
  }

  // CRITICAL FIX: Prevent mass assignment. Since supabaseAdmin uses the Service Role key, RLS is bypassed.
  // Passing user input directly into .update() allows attackers to overwrite ANY column (e.g., user_id).
  const safeUpdates: Record<string, string | boolean> = {}
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
  await assertConversationAccessible(userId, conversationId)

  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('id, sender, sender_user_id, text, timestamp, has_files, model_used, mode_used, tokens_used, parent_id')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(100)

  if (error) throw error
  // Sort back to ascending for the UI
  return (data || []).sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
}

export async function saveMessage(
  userId: string,
  conversationId: string,
  message: {
    sender: 'user' | 'assistant'
    text: string
    sender_user_id?: string | null
    model_used?: string
    mode_used?: string
    tokens_used?: number
    parent_id?: string
    action_type?: string
  }
) {
  await assertConversationAccessible(userId, conversationId)

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
