-- ============================================================
-- RAYA - Migration 035: Anti-Farm & Promo Code Security
-- ============================================================
-- 1. Anyone can redeem a Level Up code (it gets recorded),
--    but benefits only activate for verified email accounts.
-- 2. Per-identity limit: one real email can only redeem ONE code
--    across ALL promo codes, preventing a single person from
--    burning all slots in a class.
-- 3. Auto-cleanup of anonymous accounts inactive for 60+ days.
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. REWRITE redeem_level_up_code
--    • Everyone can call it (anonymous, ZKAR, verified)
--    • The redemption is RECORDED for everyone
--    • But get_user_entitlements only ACTIVATES benefits
--      when account_state = 'active_verified'
--    • Anti-farm: one verified email = max 1 code redemption
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.redeem_level_up_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_user public.users%ROWTYPE;
  v_promo public.promo_codes%ROWTYPE;
  v_normalized_code TEXT := UPPER(TRIM(COALESCE(p_code, '')));
  v_is_verified BOOLEAN;
  v_existing_any_redemption BOOLEAN;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_normalized_code = '' THEN
    RAISE EXCEPTION 'Level Up Code is required';
  END IF;

  SELECT *
  INTO v_user
  FROM public.users
  WHERE auth_user_id = v_auth_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  v_is_verified := COALESCE(v_user.account_state, 'onboarding_pending') = 'active_verified';

  -- ================================================================
  -- ANTI-FARM: If user IS verified, check they haven't already
  -- redeemed ANY level_up code (not just this one).
  -- This prevents one person using multiple codes to eat all class
  -- slots. One real verified email = one code, period.
  -- ================================================================
  IF v_is_verified THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_promo_code_redemptions upr
      JOIN public.promo_codes pc ON pc.id = upr.promo_code_id
      WHERE upr.user_id = v_user.id
        AND COALESCE(pc.bonus_features, '[]'::jsonb) ? 'level_up'
    ) INTO v_existing_any_redemption;

    IF v_existing_any_redemption THEN
      RETURN jsonb_build_object(
        'redeemed', FALSE,
        'alreadyRedeemed', TRUE,
        'message', 'You have already redeemed a Level Up Code. Each verified account can only use one.',
        'entitlements', public.get_user_entitlements()
      );
    END IF;
  END IF;

  -- Lock for concurrency prevention (double-spend)
  PERFORM pg_advisory_xact_lock(hashtext(v_normalized_code));

  SELECT *
  INTO v_promo
  FROM public.promo_codes
  WHERE UPPER(code) = v_normalized_code
    AND is_active = TRUE
    AND valid_from <= NOW()
    AND (valid_until IS NULL OR valid_until >= NOW())
    AND COALESCE(bonus_features, '[]'::jsonb) ? 'level_up'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired Level Up Code';
  END IF;

  -- Check if THIS user already redeemed THIS specific code
  IF EXISTS (
    SELECT 1
    FROM public.user_promo_code_redemptions upr
    WHERE upr.user_id = v_user.id
      AND upr.promo_code_id = v_promo.id
  ) THEN
    RETURN jsonb_build_object(
      'redeemed', FALSE,
      'alreadyRedeemed', TRUE,
      'message', 'Level Up Code already redeemed',
      'entitlements', public.get_user_entitlements()
    );
  END IF;

  IF v_promo.max_uses IS NOT NULL AND COALESCE(v_promo.current_uses, 0) >= v_promo.max_uses THEN
    RAISE EXCEPTION 'This Level Up Code has reached its usage limit';
  END IF;

  -- Record the redemption for everyone (verified or not)
  INSERT INTO public.user_promo_code_redemptions (
    user_id,
    promo_code_id,
    code,
    metadata
  )
  VALUES (
    v_user.id,
    v_promo.id,
    v_normalized_code,
    jsonb_build_object(
      'bonus_features', COALESCE(v_promo.bonus_features, '[]'::jsonb),
      'activated', v_is_verified
    )
  );

  -- Only count toward max_uses if the user is verified (real seat taken)
  IF v_is_verified THEN
    UPDATE public.promo_codes
    SET current_uses = COALESCE(current_uses, 0) + 1
    WHERE id = v_promo.id;
  END IF;

  RETURN jsonb_build_object(
    'redeemed', TRUE,
    'alreadyRedeemed', FALSE,
    'activated', v_is_verified,
    'message', CASE
      WHEN v_is_verified THEN 'Level Up Code applied successfully!'
      ELSE 'Code recorded! Verify your email to activate the benefits.'
    END,
    'bonusFeatures', COALESCE(v_promo.bonus_features, '[]'::jsonb),
    'entitlements', public.get_user_entitlements()
  );
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 2. UPDATE get_user_entitlements to gate level_up benefits
--    behind account_state = 'active_verified'
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_entitlements()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_user public.users%ROWTYPE;
  v_level_up_active BOOLEAN := FALSE;
  v_is_pro BOOLEAN := FALSE;
  v_is_plus BOOLEAN := FALSE;
  v_has_premium_access BOOLEAN := FALSE;
  v_is_verified BOOLEAN := FALSE;
  v_available_modes TEXT[] := ARRAY['normal'];
  v_available_models TEXT[] := ARRAY['gemini-3.1-flash-lite-preview'];
  v_token_limit INTEGER := 30000;
  v_file_upload_limit INTEGER := 1;
  v_history_window_days INTEGER := 30;
  v_room_minutes_limit INTEGER := 60;
  v_xp_multiplier NUMERIC := 1;
  v_badges TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_auth_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'accountState', 'onboarding_pending',
      'planTier', 'free',
      'levelUpActive', FALSE,
      'hasPremiumAccess', FALSE,
      'canPurchasePremium', FALSE,
      'tokenWindowHours', 4,
      'tokenLimit', 30000,
      'fileUploadLimit', 1,
      'historyWindowDays', 30,
      'roomMinutesLimit', 60,
      'xpMultiplier', 1,
      'availableModes', to_jsonb(ARRAY['normal']::TEXT[]),
      'availableModels', to_jsonb(ARRAY['gemini-3.1-flash-lite-preview']::TEXT[]),
      'badges', to_jsonb(ARRAY[]::TEXT[])
    );
  END IF;

  SELECT *
  INTO v_user
  FROM public.users
  WHERE auth_user_id = v_auth_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'accountState', 'onboarding_pending',
      'planTier', 'free',
      'levelUpActive', FALSE,
      'hasPremiumAccess', FALSE,
      'canPurchasePremium', FALSE,
      'tokenWindowHours', 4,
      'tokenLimit', 30000,
      'fileUploadLimit', 1,
      'historyWindowDays', 30,
      'roomMinutesLimit', 60,
      'xpMultiplier', 1,
      'availableModes', to_jsonb(ARRAY['normal']::TEXT[]),
      'availableModels', to_jsonb(ARRAY['gemini-3.1-flash-lite-preview']::TEXT[]),
      'badges', to_jsonb(ARRAY[]::TEXT[])
    );
  END IF;

  v_is_pro := COALESCE(v_user.account_type::TEXT, 'free') = 'pro';
  v_is_plus := COALESCE(v_user.account_type::TEXT, 'free') = 'plus';
  v_has_premium_access := v_is_pro OR v_is_plus;
  v_is_verified := COALESCE(v_user.account_state, 'onboarding_pending') = 'active_verified' OR v_has_premium_access;

  -- ════════════════════════════════════════════════════════════
  -- Level Up is ONLY active if the user is verified AND has
  -- a valid redemption. Unverified users see "code recorded"
  -- but get zero benefits until they verify their email.
  -- ════════════════════════════════════════════════════════════
  IF v_is_verified THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_promo_code_redemptions upr
      JOIN public.promo_codes pc ON pc.id = upr.promo_code_id
      WHERE upr.user_id = v_user.id
        AND pc.is_active = TRUE
        AND pc.valid_from <= NOW()
        AND (pc.valid_until IS NULL OR pc.valid_until >= NOW())
        AND COALESCE(pc.bonus_features, '[]'::jsonb) ? 'level_up'
    )
    INTO v_level_up_active;
  END IF;

  IF v_is_verified THEN
    v_token_limit := 60000;
    v_file_upload_limit := 3;
    v_history_window_days := NULL;
  END IF;

  IF v_level_up_active THEN
    v_available_modes := array_append(v_available_modes, 'rush-mode');
    v_badges := ARRAY['level_up'];
  END IF;

  IF v_level_up_active AND v_is_verified AND NOT v_has_premium_access THEN
    v_token_limit := 90000;
    v_file_upload_limit := 4;
    v_room_minutes_limit := 75;
    v_xp_multiplier := 1.25;
    v_available_modes := ARRAY['normal', 'rush-mode', 'creative-mode'];
    v_badges := ARRAY['level_up', 'verified_level_up'];
  END IF;

  IF v_has_premium_access THEN
    v_available_modes := ARRAY['normal', 'rush-mode', 'deep-thinking', 'creative-mode'];
    v_available_models := ARRAY[
      'gemini-3.1-flash-lite-preview',
      'gpt-4-turbo',
      'gpt-4',
      'claude-sonnet'
    ];
  END IF;

  IF v_is_pro THEN
    v_token_limit := 120000;
    v_file_upload_limit := 6;
    v_room_minutes_limit := 90;
    v_xp_multiplier := 2;
    v_badges := ARRAY['pro'];
  ELSIF v_is_plus THEN
    v_token_limit := NULL;
    v_file_upload_limit := 10;
    v_room_minutes_limit := 120;
    v_xp_multiplier := 3;
    v_badges := ARRAY['plus'];
  END IF;

  RETURN jsonb_build_object(
    'accountState', COALESCE(v_user.account_state, 'onboarding_pending'),
    'planTier', COALESCE(v_user.account_type::TEXT, 'free'),
    'levelUpActive', v_level_up_active,
    'hasPremiumAccess', v_has_premium_access,
    'canPurchasePremium', COALESCE(v_user.account_state, 'onboarding_pending') = 'active_verified' AND NOT v_has_premium_access,
    'tokenWindowHours', 4,
    'tokenLimit', v_token_limit,
    'fileUploadLimit', v_file_upload_limit,
    'historyWindowDays', v_history_window_days,
    'roomMinutesLimit', v_room_minutes_limit,
    'xpMultiplier', v_xp_multiplier,
    'availableModes', to_jsonb(v_available_modes),
    'availableModels', to_jsonb(v_available_models),
    'badges', to_jsonb(v_badges)
  );
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 3. AUTO-CLEANUP: Purge anonymous accounts inactive 60+ days
--    Call via pg_cron or Supabase scheduled function.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_stale_anonymous_accounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '60 days';
  v_deleted_count INTEGER := 0;
  v_auth_id UUID;
BEGIN
  -- Find anonymous users whose public profile hasn't been
  -- touched in 60 days and who never verified an email.
  FOR v_auth_id IN
    SELECT u.auth_user_id
    FROM public.users u
    WHERE u.email IS NULL
      AND COALESCE(u.account_state, 'onboarding_pending') IN ('onboarding_pending', 'active_unverified')
      AND COALESCE(u.auth_method, 'anonymous') IN ('anonymous', 'guest')
      AND COALESCE(u.updated_at, u.created_at, NOW()) < v_cutoff
  LOOP
    -- Delete from Supabase Auth (cascades to public.users via trigger/FK)
    -- NOTE: This requires the service role. When called via pg_cron inside
    -- Supabase, the function runs as the owner (superuser), so this works.
    -- From an external cron, call via the management API instead.
    DELETE FROM public.users WHERE auth_user_id = v_auth_id;
    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  RAISE NOTICE 'Cleaned up % stale anonymous accounts', v_deleted_count;
  RETURN v_deleted_count;
END;
$$;
