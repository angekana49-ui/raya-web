import { supabaseAdmin } from '@/lib/supabase/server';

export type LearningEventType =
  | 'message_sent'
  | 'assistant_response'
  | 'insight_validated'
  | 'insight_failed'
  | 'mission_graded'
  | 'mission_rewarded'
  | 'xp_awarded';

export interface LearningEventInput {
  userId: string;
  conversationId?: string | null;
  eventType: LearningEventType;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  ruleVersion?: string;
  source?: string;
}

export async function logLearningEvent(event: LearningEventInput): Promise<void> {
  const row = {
    user_id: event.userId,
    conversation_id: event.conversationId ?? null,
    event_type: event.eventType,
    idempotency_key: event.idempotencyKey,
    payload: event.payload ?? {},
    rule_version: event.ruleVersion ?? 'v1',
    source: event.source ?? 'api',
  };

  const { error } = await supabaseAdmin
    .from('learning_events')
    .upsert(row, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true });

  if (error) throw error;
}
