-- ============================================================
-- RAYA - 2026-05-11: Room visibility hardening
-- Goal:
--   - Only creator + members can read room/content directly.
--   - "Users with link" path is enforced through join_study_room(room_id),
--     which adds them as participants first, then grants normal access.
-- ============================================================

-- 1) Access helper: no broad "public room" read anymore.
CREATE OR REPLACE FUNCTION public.can_access_study_room(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_rooms sr
    WHERE sr.id = p_room_id
      AND (
        sr.created_by = public.current_db_user_id()
        OR EXISTS (
          SELECT 1
          FROM public.study_room_participants srp
          WHERE srp.room_id = sr.id
            AND srp.user_id = public.current_db_user_id()
        )
      )
  );
$$;

-- 2) Tighten direct SELECT on study_rooms
--    (link-holder flow must join first via RPC, then read as member).
DROP POLICY IF EXISTS "study_rooms_select_locked" ON public.study_rooms;
CREATE POLICY "study_rooms_select_locked" ON public.study_rooms
  FOR SELECT TO authenticated
  USING (
    created_by = public.current_db_user_id()
    OR id IN (
      SELECT room_id
      FROM public.study_room_participants
      WHERE user_id = public.current_db_user_id()
    )
  );

-- 3) Keep join-by-link behavior explicit and active-only.
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

  v_user_id := public.current_db_user_id();
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

  -- Idempotent re-join
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

  -- "Has the link" path: allow joining active room by id.
  INSERT INTO public.study_room_participants (room_id, user_id)
  VALUES (p_room_id, v_user_id);

  UPDATE public.study_rooms
  SET updated_at = now()
  WHERE id = p_room_id;

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

REVOKE ALL ON FUNCTION public.join_study_room(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_study_room(UUID) TO authenticated;
