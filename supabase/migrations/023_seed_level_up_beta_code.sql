-- RAYA - Migration 023: Seed first B2C Level Up beta code

INSERT INTO public.promo_codes (
  code,
  description,
  discount_type,
  discount_value,
  max_uses,
  current_uses,
  valid_from,
  valid_until,
  applicable_plans,
  is_active,
  bonus_features
)
SELECT
  'RAYA2024',
  'B2C beta Level Up code for early growth tests',
  'percentage'::public.discount_type,
  50,
  NULL,
  0,
  NOW(),
  NULL,
  '["pro","plus"]'::jsonb,
  TRUE,
  '["level_up","discount_50_first_plan","beta_offer"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM public.promo_codes
  WHERE UPPER(code) = 'RAYA2024'
);
