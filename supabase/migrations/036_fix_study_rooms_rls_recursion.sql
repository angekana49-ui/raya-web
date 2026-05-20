-- ============================================================
-- RAYA - Migration 036: Fix study room RLS recursion
-- ============================================================

ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_participants ENABLE ROW LEVEL SECURITY;

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

CREATE OR REPLACE FUNCTION public.is_study_room_creator(p_room_id UUID)
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

CREATE OR REPLACE FUNCTION public.is_study_room_participant(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Removed: avoid selecting from study_room_participants inside an RLS-evaluated
  -- function to prevent infinite recursion. Use direct policies instead.
  SELECT false;
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
      AND tablename = 'study_room_participants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.study_room_participants', policy_record.policyname);
  END LOOP;
END
$$;

CREATE POLICY "study_rooms_select_safe" ON public.study_rooms
  FOR SELECT
  USING (
    is_active = true
    OR public.is_study_room_creator(id)
    OR id IN (
      SELECT room_id FROM public.study_room_participants WHERE user_id = public.current_db_user_id()
    )
  );

CREATE POLICY "study_rooms_insert_safe" ON public.study_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_db_user_id()
  );

CREATE POLICY "study_rooms_update_safe" ON public.study_rooms
  FOR UPDATE TO authenticated
  USING (
    created_by = public.current_db_user_id()
  )
  WITH CHECK (
    created_by = public.current_db_user_id()
  );

CREATE POLICY "study_rooms_delete_safe" ON public.study_rooms
  FOR DELETE TO authenticated
  USING (
    created_by = public.current_db_user_id()
  );

-- Implement direct policies for participants without calling functions
CREATE POLICY "study_room_participants_select_safe" ON public.study_room_participants
  FOR SELECT TO authenticated
  USING (
    user_id = public.current_db_user_id()
    OR room_id IN (
      SELECT id FROM public.study_rooms WHERE created_by = public.current_db_user_id()
    )
  );

CREATE POLICY "study_room_participants_insert_safe" ON public.study_room_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_db_user_id()
  );

CREATE POLICY "study_room_participants_delete_safe" ON public.study_room_participants
  FOR DELETE TO authenticated
  USING (
    user_id = public.current_db_user_id()
    OR room_id IN (
      SELECT id FROM public.study_rooms WHERE created_by = public.current_db_user_id()
    )
  );
