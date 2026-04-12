-- ============================================================
-- RAYA - Migration 014: Study Rooms Persistence
-- ============================================================

CREATE TABLE IF NOT EXISTS public.study_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  mission      TEXT NOT NULL,
  duration     INTEGER NOT NULL DEFAULT 60, -- minutes
  ai_mode      TEXT NOT NULL CHECK (ai_mode IN ('passive', 'active')),
  online_count INTEGER DEFAULT 1,
  max_members  INTEGER DEFAULT 8,
  is_active    BOOLEAN DEFAULT true,
  files        JSONB DEFAULT '[]', -- Metadata of attached files
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS study_rooms_created_by_idx ON public.study_rooms (created_by);
CREATE INDEX IF NOT EXISTS study_rooms_active_idx ON public.study_rooms (is_active);

-- Enable RLS
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Anyone can view active rooms" ON public.study_rooms;
CREATE POLICY "Anyone can view active rooms" ON public.study_rooms
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Creators can manage their rooms" ON public.study_rooms;
CREATE POLICY "Creators can manage their rooms" ON public.study_rooms
  FOR ALL USING (
    created_by IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Sync with conversations (Optional but good: each room could have a direct conversation_id)
ALTER TABLE public.study_rooms ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;
