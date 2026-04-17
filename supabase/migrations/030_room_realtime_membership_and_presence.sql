-- ============================================================
-- RAYA - Migration 030: Room Realtime Membership And Presence
-- ============================================================

-- 1) Fix learning_events allowed event types so runtime logging
--    matches the application code.
ALTER TABLE public.learning_events
  DROP CONSTRAINT IF EXISTS learning_events_event_type_check;

ALTER TABLE public.learning_events
  ADD CONSTRAINT learning_events_event_type_check
  CHECK (
    event_type IN (
      'message_sent',
      'assistant_response',
      'insight_validated',
      'insight_failed',
      'mission_graded',
      'mission_rewarded',
      'xp_awarded'
    )
  );

-- 2) Secure room join through a SECURITY DEFINER RPC so room
--    capacity and membership are enforced server-side.
DROP FUNCTION IF EXISTS public.join_study_room(UUID);

CREATE OR REPLACE FUNCTION public.join_study_room(p_room_id UUID)
RETURNS TABLE(
  joined_room_id UUID,
  joined_user_id UUID,
  participant_is_creator BOOLEAN,
  participant_mode_changes_left INTEGER,
  participant_model_changes_left INTEGER,
  participant_joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_room public.study_rooms%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id
  INTO v_user_id
  FROM public.users
  WHERE auth_user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT *
  INTO v_room
  FROM public.study_rooms
  WHERE id = p_room_id;

  IF NOT FOUND OR v_room.is_active = false OR v_room.timer_status = 'finished' THEN
    RAISE EXCEPTION 'Room is not active or does not exist.';
  END IF;

  INSERT INTO public.study_room_participants (room_id, user_id)
  VALUES (p_room_id, v_user_id)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN QUERY
  SELECT
    srp.room_id AS joined_room_id,
    srp.user_id AS joined_user_id,
    srp.is_creator AS participant_is_creator,
    srp.mode_changes_left AS participant_mode_changes_left,
    srp.model_changes_left AS participant_model_changes_left,
    srp.joined_at AS participant_joined_at
  FROM public.study_room_participants srp
  WHERE srp.room_id = p_room_id
    AND srp.user_id = v_user_id
  LIMIT 1;
END;
$$;

-- 3) Let connected room members resync exact online count from
--    Supabase Realtime presence so the room card / prompt stay fresh.
CREATE OR REPLACE FUNCTION public.sync_room_online_count(
  p_room_id UUID,
  p_online_count INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_max_members INTEGER;
  v_next_online_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id
  INTO v_user_id
  FROM public.users
  WHERE auth_user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.study_room_participants srp
    WHERE srp.room_id = p_room_id
      AND srp.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You must join the room before syncing presence.';
  END IF;

  SELECT max_members
  INTO v_max_members
  FROM public.study_rooms
  WHERE id = p_room_id
    AND is_active = true
    AND timer_status IN ('idle', 'running');

  IF v_max_members IS NULL THEN
    RAISE EXCEPTION 'Room is not active or does not exist.';
  END IF;

  v_next_online_count := LEAST(GREATEST(COALESCE(p_online_count, 0), 0), GREATEST(v_max_members, 0));

  UPDATE public.study_rooms
  SET
    online_count = v_next_online_count,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN v_next_online_count;
END;
$$;

REVOKE ALL ON FUNCTION public.join_study_room(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_room_online_count(UUID, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.join_study_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_room_online_count(UUID, INTEGER) TO authenticated;
