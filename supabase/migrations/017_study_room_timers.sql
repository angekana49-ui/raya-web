-- ============================================================
-- RAYA - Migration 017: Shared Study Room Timers
-- ============================================================

ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timer_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timer_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (timer_status IN ('idle', 'running', 'finished')),
  ADD COLUMN IF NOT EXISTS alert_5m_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_2m_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_end_sent BOOLEAN NOT NULL DEFAULT false;

UPDATE public.study_rooms
SET
  timer_started_at = COALESCE(timer_started_at, created_at),
  timer_ends_at = COALESCE(timer_ends_at, created_at + make_interval(mins => duration)),
  timer_status = CASE
    WHEN COALESCE(timer_ends_at, created_at + make_interval(mins => duration)) <= now() THEN 'finished'
    ELSE 'running'
  END,
  alert_5m_sent = CASE
    WHEN COALESCE(timer_ends_at, created_at + make_interval(mins => duration)) - now() <= interval '5 minutes' THEN true
    ELSE alert_5m_sent
  END,
  alert_2m_sent = CASE
    WHEN COALESCE(timer_ends_at, created_at + make_interval(mins => duration)) - now() <= interval '2 minutes' THEN true
    ELSE alert_2m_sent
  END,
  alert_end_sent = CASE
    WHEN COALESCE(timer_ends_at, created_at + make_interval(mins => duration)) <= now() THEN true
    ELSE alert_end_sent
  END
WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.study_rooms_apply_timer_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.timer_started_at IS NULL THEN
    NEW.timer_started_at := now();
  END IF;

  IF NEW.timer_ends_at IS NULL THEN
    NEW.timer_ends_at := NEW.timer_started_at + make_interval(mins => NEW.duration);
  END IF;

  IF NEW.timer_status = 'idle' THEN
    NEW.timer_status := CASE
      WHEN NEW.timer_ends_at <= now() THEN 'finished'
      ELSE 'running'
    END;
  END IF;

  IF NEW.timer_status = 'finished' THEN
    NEW.alert_end_sent := true;
  END IF;

  IF NEW.timer_ends_at - now() <= interval '5 minutes' THEN
    NEW.alert_5m_sent := true;
  END IF;

  IF NEW.timer_ends_at - now() <= interval '2 minutes' THEN
    NEW.alert_2m_sent := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS study_rooms_apply_timer_defaults_trigger ON public.study_rooms;
CREATE TRIGGER study_rooms_apply_timer_defaults_trigger
  BEFORE INSERT ON public.study_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.study_rooms_apply_timer_defaults();

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
      alert_end_sent = true,
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
