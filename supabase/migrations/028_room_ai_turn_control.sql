-- ============================================================
-- RAYA - Migration 028: Room AI Turn Control
-- ============================================================

ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS ai_turn_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (ai_turn_status IN ('idle', 'busy')),
  ADD COLUMN IF NOT EXISTS ai_turn_started_at TIMESTAMPTZ;

UPDATE public.study_rooms
SET
  ai_turn_status = CASE
    WHEN timer_status = 'running' THEN COALESCE(ai_turn_status, 'idle')
    ELSE 'idle'
  END,
  ai_turn_started_at = CASE
    WHEN timer_status = 'running' THEN ai_turn_started_at
    ELSE NULL
  END;

CREATE INDEX IF NOT EXISTS study_rooms_conversation_runtime_idx
  ON public.study_rooms (conversation_id, timer_status, is_active);

CREATE OR REPLACE FUNCTION public.advance_study_room_timer(
  p_room_id UUID,
  p_alert_kind TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count INTEGER := 0;
BEGIN
  IF p_alert_kind = '5m' THEN
    UPDATE public.study_rooms
    SET
      alert_5m_sent = true,
      updated_at = now()
    WHERE id = p_room_id
      AND is_active = true
      AND timer_status = 'running'
      AND timer_ends_at IS NOT NULL
      AND timer_ends_at - now() <= interval '5 minutes'
      AND alert_5m_sent = false;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN v_row_count > 0;
  ELSIF p_alert_kind = '2m' THEN
    UPDATE public.study_rooms
    SET
      alert_2m_sent = true,
      updated_at = now()
    WHERE id = p_room_id
      AND is_active = true
      AND timer_status = 'running'
      AND timer_ends_at IS NOT NULL
      AND timer_ends_at - now() <= interval '2 minutes'
      AND alert_2m_sent = false;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN v_row_count > 0;
  ELSIF p_alert_kind = 'end' THEN
    UPDATE public.study_rooms
    SET
      timer_status = 'finished',
      is_active = false,
      online_count = 0,
      alert_end_sent = true,
      ai_turn_status = 'idle',
      ai_turn_started_at = NULL,
      updated_at = now()
    WHERE id = p_room_id
      AND is_active = true
      AND timer_ends_at IS NOT NULL
      AND timer_ends_at <= now()
      AND alert_end_sent = false;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN v_row_count > 0;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_study_room_timer(UUID, TEXT) TO authenticated;
