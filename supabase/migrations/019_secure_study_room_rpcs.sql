-- ============================================================
-- RAYA - Migration 019: Secure Study Room RPCs
-- Shared Supabase project safe-scope:
-- limits room RPC execution to authenticated users and hardens updates.
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_room_online_count(room_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.study_rooms
  SET
    online_count = LEAST(COALESCE(online_count, 0) + 1, GREATEST(COALESCE(max_members, 0), 0)),
    updated_at = now()
  WHERE id = room_id
    AND is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_room_online_count(room_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.study_rooms
  SET
    online_count = GREATEST(COALESCE(online_count, 0) - 1, 0),
    updated_at = now()
  WHERE id = room_id
    AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_room_online_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_room_online_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_study_room_timer(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_room_messages(UUID, INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_room_online_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_room_online_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_study_room_timer(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_room_messages(UUID, INT) TO authenticated;
