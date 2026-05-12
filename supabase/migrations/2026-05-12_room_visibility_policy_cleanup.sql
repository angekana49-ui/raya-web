-- ============================================================
-- RAYA - 2026-05-12: Remove legacy broad room visibility
-- Postgres combines permissive SELECT policies with OR, so any
-- leftover "active rooms are public" policy would still leak rooms.
-- ============================================================

ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active rooms" ON public.study_rooms;
DROP POLICY IF EXISTS "study_rooms_select" ON public.study_rooms;
DROP POLICY IF EXISTS "study_rooms_select_safe" ON public.study_rooms;
DROP POLICY IF EXISTS "study_rooms_select_locked" ON public.study_rooms;

CREATE POLICY "study_rooms_select_locked" ON public.study_rooms
  FOR SELECT TO authenticated
  USING (
    created_by = public.current_db_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.study_room_participants srp
      WHERE srp.room_id = study_rooms.id
        AND srp.user_id = public.current_db_user_id()
    )
  );

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
