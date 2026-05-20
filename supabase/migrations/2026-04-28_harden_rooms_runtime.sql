-- ============================================================
-- RAYA - 2026-04-28: Harden rooms runtime
-- ============================================================

-- Shared helper: current authenticated public.users.id
CREATE OR REPLACE FUNCTION public.current_db_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- Shared helper: room visibility / participation check for RLS and storage.
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
        sr.is_active = true
        OR sr.created_by = public.current_db_user_id()
        OR EXISTS (
          SELECT 1
          FROM public.study_room_participants srp
          WHERE srp.room_id = sr.id
            AND srp.user_id = public.current_db_user_id()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_study_room(p_room_id UUID)
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
      AND sr.created_by = public.current_db_user_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_study_room_member(p_room_id UUID)
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

-- Tighten room-level invariants to keep runtime assumptions safe.
ALTER TABLE public.study_rooms
  ALTER COLUMN online_count SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'study_rooms_duration_bounds'
      AND conrelid = 'public.study_rooms'::regclass
  ) THEN
    ALTER TABLE public.study_rooms
      ADD CONSTRAINT study_rooms_duration_bounds
      CHECK (duration BETWEEN 5 AND 240);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'study_rooms_max_members_bounds'
      AND conrelid = 'public.study_rooms'::regclass
  ) THEN
    ALTER TABLE public.study_rooms
      ADD CONSTRAINT study_rooms_max_members_bounds
      CHECK (max_members BETWEEN 2 AND 12);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'study_rooms_online_count_nonnegative'
      AND conrelid = 'public.study_rooms'::regclass
  ) THEN
    ALTER TABLE public.study_rooms
      ADD CONSTRAINT study_rooms_online_count_nonnegative
      CHECK (online_count >= 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS study_room_participants_room_joined_idx
  ON public.study_room_participants (room_id, joined_at);

CREATE INDEX IF NOT EXISTS study_room_participants_user_room_idx
  ON public.study_room_participants (user_id, room_id);

-- Replace capacity trigger with a row-locking version to avoid race conditions.
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

  IF v_current_members >= v_room.max_members THEN
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

-- Members need to see the room roster, not only their own row.
DROP POLICY IF EXISTS "study_room_participants_select" ON public.study_room_participants;
CREATE POLICY "study_room_participants_select" ON public.study_room_participants
  FOR SELECT TO authenticated
  USING (
    public.is_study_room_member(room_id)
  );

DROP POLICY IF EXISTS "study_room_participants_insert" ON public.study_room_participants;
CREATE POLICY "study_room_participants_insert" ON public.study_room_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_db_user_id()
    AND public.can_access_study_room(room_id)
  );

DROP POLICY IF EXISTS "study_room_participants_delete" ON public.study_room_participants;
CREATE POLICY "study_room_participants_delete" ON public.study_room_participants
  FOR DELETE TO authenticated
  USING (
    user_id = public.current_db_user_id()
    OR public.can_manage_study_room(room_id)
  );

-- Room files metadata should follow real room access semantics.
DROP POLICY IF EXISTS "Anyone can view active room files" ON public.room_files;
DROP POLICY IF EXISTS "room_files_select" ON public.room_files;
CREATE POLICY "room_files_select" ON public.room_files
  FOR SELECT TO authenticated
  USING (
    public.is_study_room_member(room_id)
  );

DROP POLICY IF EXISTS "Users can upload files to rooms" ON public.room_files;
DROP POLICY IF EXISTS "room_files_insert" ON public.room_files;
CREATE POLICY "room_files_insert" ON public.room_files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = public.current_db_user_id()
    AND public.is_study_room_member(room_id)
  );

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "room_files_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "room_files_storage_insert" ON storage.objects;

CREATE POLICY "room_files_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'room-files'
  );

CREATE POLICY "room_files_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-files'
  );

-- Make room creation fully atomic: room, conversation, creator membership.
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
  p_max_members := GREATEST(2, LEAST(COALESCE(p_max_members, 8), 12));

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
  ON CONFLICT (room_id, user_id) DO NOTHING;

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

-- Ensure re-joins are idempotent and new joins are serialized by the capacity trigger.
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
