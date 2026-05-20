-- ============================================================
-- RAYA - Migration 011: RLS hardening for anonymous auth
-- ============================================================

-- Helper: explicit anonymous/permanent split from Supabase Auth JWT.
CREATE OR REPLACE FUNCTION public.is_anonymous_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;


-- ============================================================
-- 1. Make ownership policies explicit
--    Anonymous users are still allowed on core student tables,
--    but policies now clearly require a real auth session and
--    define both USING and WITH CHECK.
-- ============================================================

DROP POLICY IF EXISTS "own_gamification" ON public.gamification_state;
CREATE POLICY "own_gamification" ON public.gamification_state
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "own_missions" ON public.missions_log;
CREATE POLICY "own_missions" ON public.missions_log
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "own_conversations" ON public.conversations;
CREATE POLICY "own_conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id IN (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id IN (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "own_messages" ON public.messages;
CREATE POLICY "own_messages" ON public.messages
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND conversation_id IN (
      SELECT c.id
      FROM public.conversations c
      JOIN public.users u ON u.id = c.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND conversation_id IN (
      SELECT c.id
      FROM public.conversations c
      JOIN public.users u ON u.id = c.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "own_profile" ON public.users;
CREATE POLICY "own_profile" ON public.users
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND auth_user_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "own_learning_events" ON public.learning_events;
CREATE POLICY "own_learning_events" ON public.learning_events
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id IN (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id IN (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "own_email_usage_windows" ON public.email_usage_windows;
CREATE POLICY "own_email_usage_windows" ON public.email_usage_windows
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id IN (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id IN (
      SELECT id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  );


-- ============================================================
-- 2. School snapshots must not trust editable JWT user_metadata
--    and should exclude anonymous users.
-- ============================================================

DROP POLICY IF EXISTS "Schools read own snapshots" ON public.weekly_snapshots;
CREATE POLICY "Schools read own snapshots" ON public.weekly_snapshots
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND public.is_anonymous_user() = false
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.school_id = weekly_snapshots.school_id
    )
  );


-- ============================================================
-- 3. Analytics/reporting views should not be exposed directly
--    from the public API for now.
--    Also force security_invoker so they do not bypass table RLS
--    if access is later granted back intentionally.
--    Some projects may not have every analytics view yet, so this
--    block only touches views that actually exist.
-- ============================================================

DO $$
DECLARE
  view_name TEXT;
  protected_views TEXT[] := ARRAY[
    'learning_insight_events',
    'learning_daily_user_stats',
    'learning_school_overview',
    'learning_class_concept_gaps',
    'learning_school_dashboard_compact',
    'learning_class_dashboard_compact',
    'learning_class_misconceptions',
    'learning_student_engagement'
  ];
BEGIN
  FOREACH view_name IN ARRAY protected_views
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = view_name
    ) THEN
      EXECUTE format(
        'ALTER VIEW public.%I SET (security_invoker = true)',
        view_name
      );
      EXECUTE format(
        'REVOKE SELECT ON public.%I FROM anon, authenticated',
        view_name
      );
    END IF;
  END LOOP;
END $$;
