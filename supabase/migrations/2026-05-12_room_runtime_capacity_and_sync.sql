-- ============================================================
-- RAYA - 2026-05-12: Room runtime capacity and sync hardening
-- Fixes:
--   - capacity is enforced from persisted participants, max 8
--   - joins are serialized on the room row
--   - creator membership exists for every newly created room
--   - online_count is treated as presence display, not capacity truth
-- ============================================================

ALTER TABLE public.study_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;

DELETE FROM public.study_room_participants a
USING public.study_room_participants b
WHERE a.room_id = b.room_id
  AND a.user_id = b.user_id
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS study_room_participants_room_user_key
  ON public.study_room_participants (room_id, user_id);

UPDATE public.study_rooms
SET max_members = 8
WHERE max_members IS NULL OR max_members > 8;

ALTER TABLE public.study_rooms
  DROP CONSTRAINT IF EXISTS study_rooms_max_members_bounds;

ALTER TABLE public.study_rooms
  ADD CONSTRAINT study_rooms_max_members_bounds
  CHECK (max_members BETWEEN 2 AND 8);

CREATE OR REPLACE FUNCTION public.enforce_study_room_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.study_rooms%ROWTYPE;
  v_current_members INTEGER;
BEGIN
  SELECT *
  INTO v_room
  FROM public.study_rooms
  WHERE id = NEW.room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.is_active = false OR v_room.timer_status = 'finished' THEN
    RAISE EXCEPTION 'Room is not active or does not exist.';
  END IF;

  SELECT COUNT(*)
  INTO v_current_members
  FROM public.study_room_participants
  WHERE room_id = NEW.room_id;

  IF v_current_members >= LEAST(COALESCE(v_room.max_members, 8), 8) THEN
    RAISE EXCEPTION 'Room is full.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_study_room_capacity_trigger ON public.study_room_participants;
CREATE TRIGGER enforce_study_room_capacity_trigger
  BEFORE INSERT ON public.study_room_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_study_room_capacity();

CREATE OR REPLACE FUNCTION public.create_study_room(
  p_ai_mode TEXT DEFAULT 'passive',
  p_duration INTEGER DEFAULT 60,
  p_max_members INTEGER DEFAULT 8,
  p_mission TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL
)
RETURNS public.study_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_user_id UUID;
  v_conversation_id UUID;
  v_now TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_room public.study_rooms;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_db_user_id := public.current_db_user_id();
  IF v_db_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF p_mission IS NULL OR trim(p_mission) = '' THEN
    RAISE EXCEPTION 'Mission is required';
  END IF;

  p_duration := GREATEST(5, LEAST(COALESCE(p_duration, 60), 240));
  p_max_members := GREATEST(2, LEAST(COALESCE(p_max_members, 8), 8));

  IF p_ai_mode NOT IN ('passive', 'active') THEN
    p_ai_mode := 'passive';
  END IF;

  v_now := now();
  v_ends_at := v_now + make_interval(mins => p_duration);

  INSERT INTO public.conversations (
    user_id,
    title,
    preview,
    is_active,
    context_type
  ) VALUES (
    v_db_user_id,
    'Room: ' || trim(p_title),
    '',
    true,
    'study_room'
  )
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.study_rooms (
    created_by,
    title,
    mission,
    duration,
    ai_mode,
    max_members,
    online_count,
    is_active,
    conversation_id,
    timer_status,
    timer_started_at,
    timer_ends_at,
    files
  ) VALUES (
    v_db_user_id,
    trim(p_title),
    trim(p_mission),
    p_duration,
    p_ai_mode,
    p_max_members,
    1,
    true,
    v_conversation_id,
    'running',
    v_now,
    v_ends_at,
    '[]'::jsonb
  )
  RETURNING * INTO v_room;

  INSERT INTO public.study_room_participants (
    room_id,
    user_id,
    is_creator
  ) VALUES (
    v_room.id,
    v_db_user_id,
    true
  )
  ON CONFLICT (room_id, user_id) DO UPDATE
  SET is_creator = true;

  RETURN v_room;
EXCEPTION
  WHEN OTHERS THEN
    IF v_conversation_id IS NOT NULL THEN
      DELETE FROM public.conversations
      WHERE id = v_conversation_id;
    END IF;
    RAISE;
END;
$$;

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
  v_current_members INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_id := public.current_db_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  SELECT *
  INTO v_room
  FROM public.study_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.is_active = false OR v_room.timer_status = 'finished' THEN
    RAISE EXCEPTION 'Room is not active or does not exist.';
  END IF;

  RETURN QUERY
  SELECT
    srp.room_id,
    srp.user_id,
    srp.is_creator,
    srp.mode_changes_left,
    srp.model_changes_left,
    srp.joined_at
  FROM public.study_room_participants srp
  WHERE srp.room_id = p_room_id
    AND srp.user_id = v_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_current_members
  FROM public.study_room_participants
  WHERE room_id = p_room_id;

  IF v_current_members >= LEAST(COALESCE(v_room.max_members, 8), 8) THEN
    RAISE EXCEPTION 'Room is full.';
  END IF;

  INSERT INTO public.study_room_participants (room_id, user_id)
  VALUES (p_room_id, v_user_id);

  UPDATE public.study_rooms
  SET
    online_count = LEAST(v_current_members + 1, LEAST(COALESCE(v_room.max_members, 8), 8)),
    updated_at = now()
  WHERE id = p_room_id
    AND timer_status <> 'finished';

  RETURN QUERY
  SELECT
    srp.room_id,
    srp.user_id,
    srp.is_creator,
    srp.mode_changes_left,
    srp.model_changes_left,
    srp.joined_at
  FROM public.study_room_participants srp
  WHERE srp.room_id = p_room_id
    AND srp.user_id = v_user_id
  LIMIT 1;
END;
$$;

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
  v_member_count INTEGER;
  v_next_online_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_user_id := public.current_db_user_id();
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

  SELECT COUNT(*)
  INTO v_member_count
  FROM public.study_room_participants
  WHERE room_id = p_room_id;

  v_next_online_count := LEAST(
    GREATEST(COALESCE(p_online_count, 0), v_member_count),
    LEAST(COALESCE(v_max_members, 8), 8)
  );

  UPDATE public.study_rooms
  SET
    online_count = v_next_online_count,
    updated_at = now()
  WHERE id = p_room_id
    AND timer_status <> 'finished';

  RETURN v_next_online_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_study_room(TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_study_room(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_room_online_count(UUID, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_study_room(TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_study_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_room_online_count(UUID, INTEGER) TO authenticated;
