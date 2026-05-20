-- RAYA - Migration 024: Stronger verified bonuses for Level Up users

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

  v_is_pro := COALESCE(v_user.account_type::TEXT, 'free') = 'pro';
  v_is_plus := COALESCE(v_user.account_type::TEXT, 'free') = 'plus';
  v_has_premium_access := v_is_pro OR v_is_plus;
  v_is_verified := COALESCE(v_user.account_state, 'onboarding_pending') = 'active_verified' OR v_has_premium_access;

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
