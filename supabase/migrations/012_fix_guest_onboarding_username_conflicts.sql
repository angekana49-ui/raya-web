-- ============================================================
-- RAYA - Migration 012: Fix guest onboarding username conflicts
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_user_onboarding(
  p_username TEXT,
  p_display_name TEXT,
  p_school_level TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT := trim(COALESCE(p_username, ''));
  v_display_name TEXT := trim(COALESCE(p_display_name, ''));
  v_school_level TEXT := trim(COALESCE(p_school_level, ''));
  v_profile jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF length(v_username) < 3 THEN
    RAISE EXCEPTION 'Username must be at least 3 characters.';
  END IF;

  IF v_username !~ '[A-Z]' THEN
    RAISE EXCEPTION 'Username must contain at least one uppercase letter.';
  END IF;

  IF v_username !~ '[0-9]' THEN
    RAISE EXCEPTION 'Username must contain at least one digit.';
  END IF;

  IF v_username !~ '^[a-zA-Z0-9._-]{3,24}$' THEN
    RAISE EXCEPTION 'Username must be 3-24 chars and use only letters, numbers, dot, underscore, or hyphen.';
  END IF;

  IF v_school_level = '' THEN
    RAISE EXCEPTION 'School level is required.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users u
    WHERE lower(u.username) = lower(v_username)
      AND u.auth_user_id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'This username is already taken.';
  END IF;

  UPDATE public.users
  SET
    username = v_username,
    display_name = COALESCE(NULLIF(v_display_name, ''), v_username),
    full_name = COALESCE(NULLIF(v_display_name, ''), v_username),
    school_level = v_school_level
  WHERE auth_user_id = auth.uid();

  SELECT public.get_user_profile() INTO v_profile;
  RETURN v_profile;
END;
$$;
