-- ============================================================
-- RAYA - Migration 031: Room Message Identity
-- ============================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_auth_user_id UUID,
  ADD COLUMN IF NOT EXISTS sender_label TEXT;

CREATE INDEX IF NOT EXISTS messages_sender_auth_user_id_idx
  ON public.messages (sender_auth_user_id);
