-- ============================================================
-- RAYA - Migration 037: Fix RLS Circular Logic
-- ============================================================
-- Objective: Remove recursive function calls in RLS policies
-- that cause infinite loops and block all room operations.
-- ============================================================

-- 1. Redefine current_db_user_id with better performance (STABLE)
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

-- 2. Drop the recursive policies
DROP POLICY IF EXISTS "study_rooms_select_safe" ON public.study_rooms;
DROP POLICY IF EXISTS "study_rooms_insert_safe" ON public.study_rooms;
DROP POLICY IF EXISTS "study_rooms_update_safe" ON public.study_rooms;
DROP POLICY IF EXISTS "study_rooms_delete_safe" ON public.study_rooms;

DROP POLICY IF EXISTS "study_room_participants_select_safe" ON public.study_room_participants;
DROP POLICY IF EXISTS "study_room_participants_insert_safe" ON public.study_room_participants;
DROP POLICY IF EXISTS "study_room_participants_delete_safe" ON public.study_room_participants;

-- 3. Implement DIRECT policies for study_rooms (No function calls that SELECT from the same table)
CREATE POLICY "study_rooms_select" ON public.study_rooms
  FOR SELECT
  USING (
    is_active = true
    OR created_by = public.current_db_user_id()
    OR id IN (
      SELECT room_id FROM public.study_room_participants
      WHERE user_id = public.current_db_user_id()
    )
  );

CREATE POLICY "study_rooms_insert" ON public.study_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_db_user_id()
  );

CREATE POLICY "study_rooms_update" ON public.study_rooms
  FOR UPDATE TO authenticated
  USING (
    created_by = public.current_db_user_id()
  )
  WITH CHECK (
    created_by = public.current_db_user_id()
  );

CREATE POLICY "study_rooms_delete" ON public.study_rooms
  FOR DELETE TO authenticated
  USING (
    created_by = public.current_db_user_id()
  );

-- 4. Implement DIRECT policies for study_room_participants
CREATE POLICY "study_room_participants_select" ON public.study_room_participants
  FOR SELECT TO authenticated
  USING (
    user_id = public.current_db_user_id()
    OR room_id IN (
      SELECT id FROM public.study_rooms
      WHERE created_by = public.current_db_user_id()
    )
  );

CREATE POLICY "study_room_participants_insert" ON public.study_room_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_db_user_id()
  );

CREATE POLICY "study_room_participants_delete" ON public.study_room_participants
  FOR DELETE TO authenticated
  USING (
    user_id = public.current_db_user_id()
    OR room_id IN (
      SELECT id FROM public.study_rooms
      WHERE created_by = public.current_db_user_id()
    )
  );

-- 5. Final check on conversations table
-- Ensure user_id link is solid
DROP POLICY IF EXISTS "conversations_all" ON public.conversations;
CREATE POLICY "conversations_all_access" ON public.conversations
  FOR ALL TO authenticated
  USING (
    user_id = public.current_db_user_id()
  )
  WITH CHECK (
    user_id = public.current_db_user_id()
  );

-- Clean up the dangerous functions to avoid confusion
DROP FUNCTION IF EXISTS public.is_study_room_creator(UUID);
DROP FUNCTION IF EXISTS public.is_study_room_participant(UUID);
