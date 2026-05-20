-- ============================================================
-- RAYA - Migration 016: RPC Auth Helpers
-- Résoudre auth.uid() → public.users.id côté client
-- ============================================================

-- Retourne l'ID interne (public.users) de l'utilisateur connecté
-- Utile pour les inserts côté client (anon key) qui ont besoin du FK vers users.id
CREATE OR REPLACE FUNCTION public.get_db_user_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;

-- Retourne le profil complet (id DB + username + school level)
CREATE OR REPLACE FUNCTION public.get_db_user_profile()
RETURNS TABLE(
  db_id UUID,
  username TEXT,
  display_name TEXT,
  school_level TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, username, display_name, school_level
  FROM public.users
  WHERE auth_user_id = auth.uid();
$$;
