-- ============================================================
-- RAYA - Migration 020: Study Room Timer Function Search Path
-- ============================================================

ALTER FUNCTION public.study_rooms_apply_timer_defaults() SET search_path = public;
