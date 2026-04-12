-- ============================================================
-- RAYA - Migration 025: Study Room Reports & Governance
-- ============================================================

-- 1. Study Room Reports table
CREATE TABLE IF NOT EXISTS public.study_room_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          UUID NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  summary          TEXT NOT NULL,
  squad_score      INTEGER DEFAULT 0,
  key_learnings    TEXT,
  highlights       JSONB DEFAULT '[]',
  recommendations  TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for reports
ALTER TABLE public.study_room_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone in the room (via existence of conversation accessibility) can read the report
CREATE POLICY "Anyone with room access can read report" ON public.study_room_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.study_rooms sr
      WHERE sr.id = public.study_room_reports.room_id
        AND sr.is_active = true
    ) OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = public.study_room_reports.conversation_id
    )
  );

-- 2. Governance / Participant Limits table
CREATE TABLE IF NOT EXISTS public.study_room_participants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                UUID NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id                UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mode_changes_left      INTEGER NOT NULL DEFAULT 1,
  model_changes_left     INTEGER NOT NULL DEFAULT 1,
  is_creator             BOOLEAN DEFAULT false,
  joined_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Add creator limits to study_room_participants (default 5/3)
-- We use a trigger to init the participant row with correct limits
CREATE OR REPLACE FUNCTION public.init_room_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_creator BOOLEAN;
BEGIN
  -- Check if user is the creator
  SELECT (created_by = NEW.user_id) INTO v_is_creator
  FROM public.study_rooms
  WHERE id = NEW.room_id;

  NEW.is_creator := COALESCE(v_is_creator, false);

  IF NEW.is_creator THEN
    NEW.mode_changes_left := 5;
    NEW.model_changes_left := 3;
  ELSE
    NEW.mode_changes_left := 1;
    NEW.model_changes_left := 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_room_participant_insert
  BEFORE INSERT ON public.study_room_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.init_room_participant();

-- Enable RLS for participants
ALTER TABLE public.study_room_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their own limits" ON public.study_room_participants
  FOR SELECT USING (
    auth_user_id_from_id(user_id) = auth.uid()
  );

-- Helper function to decrement limits securely
CREATE OR REPLACE FUNCTION public.decrement_room_limit(
  p_room_id UUID,
  p_limit_type TEXT -- 'mode' or 'model'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_rows_updated INTEGER;
BEGIN
  -- Get public.users.id for the current auth user
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = auth.uid();

  IF v_user_id IS NULL THEN RETURN false; END IF;

  IF p_limit_type = 'mode' THEN
    UPDATE public.study_room_participants
    SET mode_changes_left = mode_changes_left - 1
    WHERE room_id = p_room_id
      AND user_id = v_user_id
      AND mode_changes_left > 0;
  ELSIF p_limit_type = 'model' THEN
    UPDATE public.study_room_participants
    SET model_changes_left = model_changes_left - 1
    WHERE room_id = p_room_id
      AND user_id = v_user_id
      AND model_changes_left > 0;
  ELSE
    RETURN false;
  END IF;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RETURN v_rows_updated > 0;
END;
$$;

-- Note for later: Apply this migration via Supabase Dashboard or CLI.
