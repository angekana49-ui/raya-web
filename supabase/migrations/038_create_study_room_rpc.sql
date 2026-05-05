-- ============================================================
-- RAYA - Migration 038: Create Study Room RPC Function
-- ============================================================

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
  v_room_id UUID;
  v_now TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_room public.study_rooms;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get the database user ID
  SELECT id INTO v_db_user_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_db_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Validate parameters
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF p_mission IS NULL OR trim(p_mission) = '' THEN
    RAISE EXCEPTION 'Mission is required';
  END IF;

  IF p_duration IS NULL OR p_duration <= 0 THEN
    p_duration := 60;
  END IF;

  IF p_ai_mode NOT IN ('passive', 'active') THEN
    p_ai_mode := 'passive';
  END IF;

  IF p_max_members IS NULL OR p_max_members <= 0 THEN
    p_max_members := 8;
  END IF;

  v_now := now();
  v_ends_at := v_now + make_interval(mins => p_duration);

  -- Create conversation
  INSERT INTO public.conversations (
    user_id,
    title,
    preview,
    is_active,
    context_type
  ) VALUES (
    v_db_user_id,
    'Room: ' || p_title,
    '',
    true,
    'study_room'
  ) RETURNING id INTO v_conversation_id;

  -- Create study room
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
    p_title,
    p_mission,
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
  ) RETURNING * INTO v_room;

  RETURN v_room;
EXCEPTION
  WHEN OTHERS THEN
    -- Clean up conversation if room creation fails
    IF v_conversation_id IS NOT NULL THEN
      DELETE FROM public.conversations WHERE id = v_conversation_id;
    END IF;
    RAISE;
END;
$$;

-- Grant execute permission
REVOKE ALL ON FUNCTION public.create_study_room(TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_study_room(TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;