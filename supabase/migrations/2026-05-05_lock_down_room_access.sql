-- ============================================================
-- RAYA - 2026-05-05: Lock down room access
-- ============================================================

ALTER TABLE public.study_rooms
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'study_rooms_visibility_check'
      AND conrelid = 'public.study_rooms'::regclass
  ) THEN
    ALTER TABLE public.study_rooms
      ADD CONSTRAINT study_rooms_visibility_check
      CHECK (visibility IN ('private', 'public'));
  END IF;
END
$$;

UPDATE public.study_rooms
SET visibility = 'private'
WHERE visibility IS NULL;

ALTER TABLE public.study_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.study_room_participants REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_room_participants;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_files;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END
$$;

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
        public.is_study_room_member(sr.id)
        OR (sr.visibility = 'public' AND sr.is_active = true)
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

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'study_rooms'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.study_rooms', policy_record.policyname);
  END LOOP;

  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages', policy_record.policyname);
  END LOOP;

  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'study_room_reports'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.study_room_reports', policy_record.policyname);
  END LOOP;
END
$$;

CREATE POLICY "study_rooms_select_locked" ON public.study_rooms
  FOR SELECT
  USING (
    created_by = public.current_db_user_id()
    OR (visibility = 'public' AND is_active = true)
    OR id IN (
      SELECT room_id
      FROM public.study_room_participants
      WHERE user_id = public.current_db_user_id()
    )
  );

CREATE POLICY "study_rooms_insert_locked" ON public.study_rooms
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.current_db_user_id());

CREATE POLICY "study_rooms_update_locked" ON public.study_rooms
  FOR UPDATE TO authenticated
  USING (created_by = public.current_db_user_id())
  WITH CHECK (created_by = public.current_db_user_id());

CREATE POLICY "study_rooms_delete_locked" ON public.study_rooms
  FOR DELETE TO authenticated
  USING (created_by = public.current_db_user_id());

CREATE POLICY "messages_select_locked" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = public.current_db_user_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.study_rooms sr
      WHERE sr.conversation_id = messages.conversation_id
        AND public.is_study_room_member(sr.id)
    )
  );

CREATE POLICY "messages_insert_locked" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = public.current_db_user_id()
    )
  );

CREATE POLICY "messages_update_locked" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = public.current_db_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = public.current_db_user_id()
    )
  );

CREATE POLICY "messages_delete_locked" ON public.messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = public.current_db_user_id()
    )
  );

CREATE POLICY "study_room_reports_select_locked" ON public.study_room_reports
  FOR SELECT TO authenticated
  USING (public.is_study_room_member(room_id));

ALTER TABLE public.room_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active room files" ON public.room_files;
DROP POLICY IF EXISTS "Users can upload files to rooms" ON public.room_files;
DROP POLICY IF EXISTS "room_files_select" ON public.room_files;
DROP POLICY IF EXISTS "room_files_insert" ON public.room_files;

CREATE POLICY "room_files_select" ON public.room_files
  FOR SELECT TO authenticated
  USING (public.is_study_room_member(room_id));

CREATE POLICY "room_files_insert" ON public.room_files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = public.current_db_user_id()
    AND public.is_study_room_member(room_id)
  );

UPDATE storage.buckets
SET public = false
WHERE id = 'room-files';

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "room_files_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "room_files_storage_insert" ON storage.objects;

CREATE POLICY "room_files_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'room-files'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.is_study_room_member((storage.foldername(name))[1]::uuid)
      ELSE false
    END
  );

CREATE POLICY "room_files_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-files'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.is_study_room_member((storage.foldername(name))[1]::uuid)
      ELSE false
    END
  );

DROP FUNCTION IF EXISTS public.get_room_messages(UUID, INT);

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
    WHERE c.id = p_conversation_id
      AND c.user_id = public.current_db_user_id()
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.study_rooms sr
    WHERE sr.conversation_id = p_conversation_id
      AND public.is_study_room_member(sr.id)
  ) THEN
    RAISE EXCEPTION 'Conversation not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.sender, m.text, m.timestamp, m.model_used, m.mode_used
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.timestamp DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$$;

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_study_room_member(p_room_id) THEN
    RAISE EXCEPTION 'Room not found or access denied';
  END IF;

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

REVOKE ALL ON FUNCTION public.get_room_messages(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_study_room_timer(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_messages(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_study_room_timer(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.acquire_room_ai_turn(p_conversation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id UUID;
BEGIN
  UPDATE public.study_rooms
  SET
    ai_turn_status = 'busy',
    ai_turn_started_at = now(),
    updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND is_active = true
    AND timer_status IN ('idle', 'running')
    AND (
      ai_turn_status = 'idle'
      OR ai_turn_started_at IS NULL
      OR ai_turn_started_at < now() - interval '90 seconds'
    )
  RETURNING id INTO v_room_id;

  IF v_room_id IS NOT NULL THEN
    RETURN 'ok';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.study_rooms
    WHERE conversation_id = p_conversation_id
      AND (is_active = false OR timer_status = 'finished')
  ) THEN
    RETURN 'closed';
  END IF;

  RETURN 'busy';
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_room_ai_turn(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_room_ai_turn(UUID) TO service_role;
