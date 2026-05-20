-- ============================================================
-- RAYA - Migration 026: Fix Study Rooms RLS
-- ============================================================

ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Creators can manage their rooms" ON public.study_rooms;

CREATE POLICY "Creators can manage their rooms" ON public.study_rooms
  FOR ALL TO authenticated
  USING (
    created_by IN (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by IN (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  );
