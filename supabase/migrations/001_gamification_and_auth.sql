-- ============================================================
-- RAYA — Migration 001 : Gamification + Auth init
-- À coller dans : Supabase Dashboard → SQL Editor → Run
-- ============================================================
-- Notes importantes :
--   • users.auth_user_id → auth.users.id  (contrainte unique déjà existante)
--   • conversations.user_id → users.id    (pas auth.uid() directement)
--   • gamification_state.user_id → auth.users.id (lien direct, plus simple)
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. GAMIFICATION STATE
--    Une ligne par auth user. Upsertée depuis le client.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gamification_state (
  user_id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp               INTEGER     NOT NULL DEFAULT 0,
  xp_today               INTEGER     NOT NULL DEFAULT 0,
  xp_by_day              JSONB       NOT NULL DEFAULT '{}',
  streak_count           INTEGER     NOT NULL DEFAULT 0,
  longest_streak         INTEGER     NOT NULL DEFAULT 0,
  last_activity_date     DATE,
  hearts                 INTEGER     NOT NULL DEFAULT 5,
  last_heart_regen       TIMESTAMPTZ DEFAULT NOW(),
  week_key               TEXT,
  month_key              TEXT,
  weekly_completed       INTEGER     NOT NULL DEFAULT 0,
  monthly_completed      INTEGER     NOT NULL DEFAULT 0,
  completed_mission_ids  TEXT[]      DEFAULT '{}',
  today_missions         JSONB       NOT NULL DEFAULT '[]',
  badges                 JSONB       NOT NULL DEFAULT '[]',
  skills                 JSONB       NOT NULL DEFAULT '[]',
  recent_feed            JSONB       NOT NULL DEFAULT '[]',
  learning_loop          JSONB       NOT NULL DEFAULT '[]',
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────
-- 2. MISSIONS LOG
--    Audit trail pour l'analytics école.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.missions_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id       TEXT        NOT NULL,
  mission_title    TEXT,
  mission_type     TEXT        CHECK (mission_type IN ('regular', 'bonus', 'daily')),
  xp_earned        INTEGER     NOT NULL DEFAULT 0,
  hearts_earned    INTEGER     NOT NULL DEFAULT 0,
  conversation_id  UUID        REFERENCES public.conversations(id) ON DELETE SET NULL,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS missions_log_user_id_idx     ON public.missions_log (user_id);
CREATE INDEX IF NOT EXISTS missions_log_completed_at_idx ON public.missions_log (completed_at DESC);


-- ────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.gamification_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;

-- Gamification : accès direct via auth.uid()
DROP POLICY IF EXISTS "own_gamification" ON public.gamification_state;
CREATE POLICY "own_gamification" ON public.gamification_state
  FOR ALL USING (user_id = auth.uid());

-- Missions log
DROP POLICY IF EXISTS "own_missions" ON public.missions_log;
CREATE POLICY "own_missions" ON public.missions_log
  FOR ALL USING (user_id = auth.uid());

-- Conversations : user_id = users.id (pas auth.uid() directement)
DROP POLICY IF EXISTS "own_conversations" ON public.conversations;
CREATE POLICY "own_conversations" ON public.conversations
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Messages : via ownership de la conversation
DROP POLICY IF EXISTS "own_messages" ON public.messages;
CREATE POLICY "own_messages" ON public.messages
  FOR ALL USING (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      JOIN public.users u ON u.id = c.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Users : chaque user gère son propre profil
DROP POLICY IF EXISTS "own_profile" ON public.users;
CREATE POLICY "own_profile" ON public.users
  FOR ALL USING (auth_user_id = auth.uid());


-- ────────────────────────────────────────────────────────────
-- 4. TRIGGER — Auto-init à l'inscription
--    Crée profil users + gamification_state dès signup.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, email, username, full_name, role, account_type)
  VALUES (
    NEW.id,
    NEW.email,
    split_part(NEW.email, '@', 1),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'student',
    'free'
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  INSERT INTO public.gamification_state (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ────────────────────────────────────────────────────────────
-- 5. FONCTION RPC — Upsert gamification (client → DB)
--    Appelée depuis useGamification, debounced 3s.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_gamification(state jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.gamification_state (
    user_id, total_xp, xp_today, xp_by_day,
    streak_count, longest_streak, last_activity_date,
    hearts, last_heart_regen, week_key, month_key,
    weekly_completed, monthly_completed, completed_mission_ids,
    today_missions, badges, skills, recent_feed, learning_loop, updated_at
  )
  VALUES (
    auth.uid(),
    COALESCE((state->>'totalXp')::int,          0),
    COALESCE((state->>'xpToday')::int,           0),
    COALESCE(state->'xpByDay',                   '{}'),
    COALESCE((state->>'streakCount')::int,        0),
    COALESCE((state->>'longestStreak')::int,      0),
    (state->>'lastActivityDate')::date,
    COALESCE((state->>'hearts')::int,             5),
    (state->>'lastHeartRegen')::timestamptz,
    state->>'weekKey',
    state->>'monthKey',
    COALESCE((state->>'weeklyCompleted')::int,    0),
    COALESCE((state->>'monthlyCompleted')::int,   0),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(state->'completedMissionIds', '[]'))),
    COALESCE(state->'todaysMissions',  '[]'),
    COALESCE(state->'badges',          '[]'),
    COALESCE(state->'skills',          '[]'),
    COALESCE(state->'recentFeed',      '[]'),
    COALESCE(state->'learningLoop',    '[]'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_xp              = EXCLUDED.total_xp,
    xp_today              = EXCLUDED.xp_today,
    xp_by_day             = EXCLUDED.xp_by_day,
    streak_count          = EXCLUDED.streak_count,
    longest_streak        = EXCLUDED.longest_streak,
    last_activity_date    = EXCLUDED.last_activity_date,
    hearts                = EXCLUDED.hearts,
    last_heart_regen      = EXCLUDED.last_heart_regen,
    week_key              = EXCLUDED.week_key,
    month_key             = EXCLUDED.month_key,
    weekly_completed      = EXCLUDED.weekly_completed,
    monthly_completed     = EXCLUDED.monthly_completed,
    completed_mission_ids = EXCLUDED.completed_mission_ids,
    today_missions        = EXCLUDED.today_missions,
    badges                = EXCLUDED.badges,
    skills                = EXCLUDED.skills,
    recent_feed           = EXCLUDED.recent_feed,
    learning_loop         = EXCLUDED.learning_loop,
    updated_at            = NOW();
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 6. FONCTION RPC — Charger gamification (DB → client)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_gamification()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  SELECT to_jsonb(g) INTO result
  FROM public.gamification_state g
  WHERE g.user_id = auth.uid();
  RETURN result;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- 7. BACKFILL — Profil + gamification pour l'user existant
--    angekana49@gmail.com | d5346335-feab-4277-90e8-e05fdc0ab336
-- ────────────────────────────────────────────────────────────

INSERT INTO public.users (auth_user_id, email, username, full_name, role, account_type)
VALUES (
  'd5346335-feab-4277-90e8-e05fdc0ab336',
  'angekana49@gmail.com',
  'angekana49',
  'angekana49',
  'student',
  'free'
)
ON CONFLICT (auth_user_id) DO NOTHING;

INSERT INTO public.gamification_state (user_id)
VALUES ('d5346335-feab-4277-90e8-e05fdc0ab336')
ON CONFLICT (user_id) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 8. INDEX supplémentaires
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS gamification_user_id_idx      ON public.gamification_state (user_id);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx  ON public.conversations (updated_at DESC);
