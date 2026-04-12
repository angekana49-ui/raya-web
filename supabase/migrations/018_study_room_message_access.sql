-- ============================================================
-- RAYA - Migration 018: Study Room Message Access
-- Shared Supabase project safe-scope:
-- only opens read access for messages tied to active study rooms.
-- ============================================================

DROP POLICY IF EXISTS "active_study_room_messages_read" ON public.messages;
CREATE POLICY "active_study_room_messages_read" ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT c.id
      FROM public.conversations c
      JOIN public.study_rooms sr
        ON sr.conversation_id = c.id
      WHERE c.context_type = 'study_room'
        AND sr.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION public.get_room_messages(
  p_conversation_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  sender TEXT,
  text TEXT,
  "timestamp" TIMESTAMPTZ,
  model_used TEXT,
  mode_used TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    LEFT JOIN public.study_rooms sr
      ON sr.conversation_id = c.id
    LEFT JOIN public.users u
      ON u.id = c.user_id
    WHERE c.id = p_conversation_id
      AND (
        u.auth_user_id = auth.uid()
        OR (
          c.context_type = 'study_room'
          AND sr.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Conversation not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.sender, m.text, m.timestamp, m.model_used, m.mode_used
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.timestamp DESC
  LIMIT p_limit;
END;
$$;
