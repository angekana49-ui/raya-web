-- ============================================================
-- RAYA — Migration 002 : User profiles (display_name + school_level)
-- À coller dans : Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Ajout des colonnes sur la table users existante
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS school_level TEXT;


-- ────────────────────────────────────────────────────────────
-- 2. RPC — Charger le profil utilisateur (DB → client)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'displayName', COALESCE(u.display_name, u.full_name, ''),
    'schoolLevel',  COALESCE(u.school_level, '')
  ) INTO result
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();
  RETURN result;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 3. RPC — Sauvegarder le profil (client → DB)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_user_profile(
  p_display_name TEXT,
  p_school_level TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET
    display_name = p_display_name,
    school_level = p_school_level
  WHERE auth_user_id = auth.uid();
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 4. Backfill — user existant angekana49
-- ────────────────────────────────────────────────────────────

-- (optionnel : à remplir manuellement si tu veux pré-renseigner)
-- UPDATE public.users
--   SET display_name = 'Ange', school_level = 'Terminale / Grade 12'
--   WHERE auth_user_id = 'd5346335-feab-4277-90e8-e05fdc0ab336';
