-- ============================================================
-- RAYA - Migration 035: Anti-Farm & Promo Code Security
-- ============================================================

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

  -- ====================================================================
  -- ANTI-FARMING SECURITY CHECK
  -- 1. Block purely anonymous users
  -- 2. Block 'recovery_key' (ZKAR) users from claiming premium codes 
  --    (ZKAR is great for access, but vulnerable to mass-generation scripts)
  -- 3. Require an explicitly verified email account
  -- ====================================================================
  IF COALESCE(v_user.auth_method, 'anonymous') IN ('anonymous', 'recovery_key', 'guest') THEN
    RAISE EXCEPTION 'Les comptes Invité et Carte de Récupération ne peuvent pas utiliser de codes Level-Up. Veuillez lier et vérifier une adresse email.';
  END IF;

  IF COALESCE(v_user.account_state, 'onboarding_pending') != 'active_verified' THEN
    RAISE EXCEPTION 'Vous devez vérifier votre adresse email pour utiliser un code Level-Up afin de prévenir les abus.';
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
    jsonb_build_object('bonus_features', COALESCE(v_promo.bonus_features, '[]'::jsonb))
  );

  UPDATE public.promo_codes
  SET current_uses = COALESCE(current_uses, 0) + 1
  WHERE id = v_promo.id;

  RETURN jsonb_build_object(
    'redeemed', TRUE,
    'alreadyRedeemed', FALSE,
    'message', 'Level Up Code applied successfully!',
    'bonusFeatures', COALESCE(v_promo.bonus_features, '[]'::jsonb),
    'entitlements', public.get_user_entitlements()
  );
END;
$$;
