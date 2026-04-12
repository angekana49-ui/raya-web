-- ============================================================
-- RAYA - Migration 027: Room Capacity And Report Constraints
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS study_room_reports_room_id_unique_idx
  ON public.study_room_reports (room_id);

CREATE OR REPLACE FUNCTION public.enforce_study_room_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_members INTEGER;
  v_current_members INTEGER;
BEGIN
  SELECT max_members
  INTO v_max_members
  FROM public.study_rooms
  WHERE id = NEW.room_id
    AND is_active = true;

  IF v_max_members IS NULL THEN
    RAISE EXCEPTION 'Room is not active or does not exist.';
  END IF;

  SELECT COUNT(*)
  INTO v_current_members
  FROM public.study_room_participants
  WHERE room_id = NEW.room_id;

  IF v_current_members >= v_max_members THEN
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
