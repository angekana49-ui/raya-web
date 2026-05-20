-- ============================================================
-- RAYA - Migration 010: Email usage windows
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_usage_windows (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  window_key TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  file_uploads_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, window_key)
);

CREATE INDEX IF NOT EXISTS email_usage_windows_window_started_idx
  ON public.email_usage_windows (window_started_at DESC);

ALTER TABLE public.email_usage_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_email_usage_windows" ON public.email_usage_windows;
CREATE POLICY "own_email_usage_windows" ON public.email_usage_windows
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );
