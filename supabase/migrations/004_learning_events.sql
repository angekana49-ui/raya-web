-- ============================================================
-- RAYA - Migration 004: Immutable learning event log + idempotency
-- ============================================================

CREATE TABLE IF NOT EXISTS public.learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'message_sent',
      'assistant_response',
      'insight_validated',
      'mission_graded',
      'xp_awarded'
    )
  ),
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  rule_version TEXT NOT NULL DEFAULT 'v1',
  source TEXT NOT NULL DEFAULT 'api',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS learning_events_user_occurred_idx
  ON public.learning_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS learning_events_conversation_idx
  ON public.learning_events (conversation_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS learning_events_type_idx
  ON public.learning_events (event_type, occurred_at DESC);

ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_learning_events" ON public.learning_events;
CREATE POLICY "own_learning_events" ON public.learning_events
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );
