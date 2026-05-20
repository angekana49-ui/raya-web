-- ============================================================
-- RAYA - 039: Database Security Hardening
-- ============================================================

-- 1. Break infinite recursion on study_room_participants by ensuring 
-- we use SECURITY DEFINER to bypass nested RLS checks against study_rooms.

CREATE OR REPLACE FUNCTION public.is_study_room_participant(p_room_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_room_participants
    WHERE room_id = p_room_id 
    AND user_id = public.current_db_user_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_study_room_creator(p_room_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_rooms
    WHERE id = p_room_id 
    AND created_by = public.current_db_user_id()
  );
$$;

-- Apply non-recursive policies to study_room_participants
DROP POLICY IF EXISTS "study_room_participants_select" ON public.study_room_participants;
DROP POLICY IF EXISTS "study_room_participants_insert" ON public.study_room_participants;
DROP POLICY IF EXISTS "study_room_participants_delete" ON public.study_room_participants;

CREATE POLICY "study_room_participants_select" ON public.study_room_participants
  FOR SELECT TO authenticated
  USING (
    user_id = public.current_db_user_id()
    OR public.is_study_room_creator(room_id)
    OR public.is_study_room_participant(room_id)
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
    OR public.is_study_room_creator(room_id)
  );


-- 2. Revoke execution from anonymous users for all SECURITY DEFINER functions 
-- preventing Auth bypass and resolving Supabase Lint #0028
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT 'REVOKE EXECUTE ON FUNCTION ' || p.oid::regprocedure::text || ' FROM public, anon;' AS query
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef = true
    )
    LOOP
        EXECUTE rec.query;
    END LOOP;
END $$;

-- 3. Ensure authenticated users and service_role retain execution rights on SECURITY DEFINER functions
-- matching our intended access controls
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN (
        SELECT 'GRANT EXECUTE ON FUNCTION ' || p.oid::regprocedure::text || ' TO authenticated, service_role;' AS query
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef = true
    )
    LOOP
        EXECUTE rec.query;
    END LOOP;
END $$;
