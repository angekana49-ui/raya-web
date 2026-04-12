-- ============================================================
-- RAYA - Migration 021: User Account States
-- Replaces guest-style heuristics with explicit identity lifecycle
-- fields while staying compatible with the shared Supabase project.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_method TEXT
    CHECK (auth_method IN ('anonymous', 'email', 'recovery_key')),
  ADD COLUMN IF NOT EXISTS account_state TEXT
    CHECK (account_state IN ('onboarding_pending', 'active_unverified', 'active_verified')),
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.compute_user_account_state(
  p_onboarding_completed_at TIMESTAMPTZ,
  p_email_verified_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_onboarding_completed_at IS NULL THEN 'onboarding_pending'
    WHEN p_email_verified_at IS NOT NULL THEN 'active_verified'
    ELSE 'active_unverified'
  END;
$$;

UPDATE public.users u
SET
  email = COALESCE(NULLIF(trim(COALESCE(u.email, '')), ''), NULLIF(trim(COALESCE(au.email, '')), '')),
  email_verified_at = COALESCE(u.email_verified_at, au.email_confirmed_at),
  auth_method = COALESCE(
    u.auth_method,
    CASE
      WHEN NULLIF(trim(COALESCE(u.email, au.email, '')), '') IS NULL THEN 'anonymous'
      WHEN lower(COALESCE(u.email, au.email)) LIKE '%@zkar.raya.local' THEN 'recovery_key'
      ELSE 'email'
    END
  ),
  onboarding_completed_at = COALESCE(
    u.onboarding_completed_at,
    CASE
      WHEN NULLIF(trim(COALESCE(u.username, '')), '') IS NOT NULL
        AND NULLIF(trim(COALESCE(u.school_level, '')), '') IS NOT NULL
      THEN COALESCE(u.updated_at, u.created_at, now())
      ELSE NULL
    END
  ),
  account_state = COALESCE(
    u.account_state,
    public.compute_user_account_state(
      COALESCE(
        u.onboarding_completed_at,
        CASE
          WHEN NULLIF(trim(COALESCE(u.username, '')), '') IS NOT NULL
            AND NULLIF(trim(COALESCE(u.school_level, '')), '') IS NOT NULL
          THEN COALESCE(u.updated_at, u.created_at, now())
          ELSE NULL
        END
      ),
      COALESCE(u.email_verified_at, au.email_confirmed_at)
    )
  )
FROM auth.users au
WHERE au.id = u.auth_user_id;

UPDATE public.users
SET
  auth_method = COALESCE(auth_method, 'anonymous'),
  account_state = COALESCE(
    account_state,
    public.compute_user_account_state(onboarding_completed_at, email_verified_at)
  )
WHERE auth_user_id IS NULL;

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
  v_auth_method TEXT := CASE
    WHEN v_email IS NULL THEN 'anonymous'
    WHEN lower(v_email) LIKE '%@zkar.raya.local' THEN 'recovery_key'
    ELSE 'email'
  END;
BEGIN
  INSERT INTO public.users (
    auth_user_id,
    email,
    username,
    display_name,
    school_level,
    guest_installation_id,
    role,
    account_type,
    auth_method,
    email_verified_at,
    account_state,
    onboarding_completed_at
  )
  VALUES (
    NEW.id,
    v_email,
    v_username,
    v_display_name,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'school_level', '')), ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'installation_id', '')), ''),
    'student',
    'free',
    v_auth_method,
    NEW.email_confirmed_at,
    'onboarding_pending',
    NULL
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.users.email),
    guest_installation_id = COALESCE(EXCLUDED.guest_installation_id, public.users.guest_installation_id),
    auth_method = COALESCE(EXCLUDED.auth_method, public.users.auth_method),
    email_verified_at = COALESCE(EXCLUDED.email_verified_at, public.users.email_verified_at),
    account_state = public.compute_user_account_state(
      public.users.onboarding_completed_at,
      COALESCE(EXCLUDED.email_verified_at, public.users.email_verified_at)
    );

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
    'displayName', COALESCE(u.display_name, ''),
    'schoolLevel', COALESCE(u.school_level, ''),
    'hasEmail', u.email IS NOT NULL AND length(trim(u.email)) > 0,
    'hasVerifiedEmail', u.email_verified_at IS NOT NULL,
    'authMethod', COALESCE(u.auth_method, 'anonymous'),
    'accountState', COALESCE(u.account_state, public.compute_user_account_state(u.onboarding_completed_at, u.email_verified_at)),
    'planTier', COALESCE(u.account_type, 'free'),
    'onboardingCompleted', u.onboarding_completed_at IS NOT NULL
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
    WHERE lower(u.username) = lower(v_username)
      AND u.auth_user_id <> auth.uid()
  ) THEN
    RAISE EXCEPTION 'This username is already taken.';
  END IF;

  UPDATE public.users
  SET
    username = v_username,
    display_name = COALESCE(NULLIF(v_display_name, ''), v_username),
    school_level = v_school_level,
    onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
    account_state = CASE
      WHEN email_verified_at IS NOT NULL THEN 'active_verified'
      ELSE 'active_unverified'
    END
  WHERE auth_user_id = auth.uid();

  SELECT public.get_user_profile() INTO v_profile;
  RETURN v_profile;
END;
$$;
