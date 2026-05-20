-- ============================================================
-- RAYA - Migration 009: Guest identity + onboarding
-- ============================================================

-- Allow profiles without email for anonymous/guest users.
ALTER TABLE public.users
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS guest_installation_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique_idx
  ON public.users ((lower(username)))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := NULLIF(trim(COALESCE(NEW.email, '')), '');
  v_meta_username TEXT := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'username', '')), '');
  v_fallback_username TEXT := 'student_' || left(replace(NEW.id::text, '-', ''), 8);
  v_username TEXT := COALESCE(
    v_meta_username,
    NULLIF(split_part(COALESCE(v_email, ''), '@', 1), ''),
    v_fallback_username
  );
  v_display_name TEXT := COALESCE(
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'display_name', '')), ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    v_username
  );
BEGIN
  INSERT INTO public.users (
    auth_user_id,
    email,
    username,
    full_name,
    display_name,
    school_level,
    guest_installation_id,
    role,
    account_type
  )
  VALUES (
    NEW.id,
    v_email,
    v_username,
    v_display_name,
    v_display_name,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'school_level', '')), ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'installation_id', '')), ''),
    'student',
    'free'
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.users.email),
    guest_installation_id = COALESCE(EXCLUDED.guest_installation_id, public.users.guest_installation_id);

  INSERT INTO public.gamification_state (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'username', COALESCE(u.username, ''),
    'displayName', COALESCE(u.display_name, u.full_name, ''),
    'schoolLevel', COALESCE(u.school_level, ''),
    'hasEmail', u.email IS NOT NULL AND length(trim(u.email)) > 0
  ) INTO result
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();

  RETURN result;
END;
$$;

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
    WHERE lower(u.username) = v_username
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
