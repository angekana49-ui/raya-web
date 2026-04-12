-- ============================================================
-- RAYA - Migration 013: Fix Chat Tables & Persistence
-- ============================================================

-- 1. Create CONVERSATIONS table if not exists
CREATE TABLE IF NOT EXISTS public.conversations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  preview      TEXT DEFAULT '',
  is_active    BOOLEAN DEFAULT true,
  context_type TEXT DEFAULT 'general',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- 2. Create MESSAGES table if not exists
CREATE TABLE IF NOT EXISTS public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender          TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
  text            TEXT NOT NULL,
  timestamp       TIMESTAMPTZ DEFAULT now(),
  has_files       BOOLEAN DEFAULT false,
  model_used      TEXT,
  mode_used       TEXT DEFAULT 'normal',
  tokens_used     INTEGER DEFAULT 0,
  parent_id       UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON public.conversations (user_id);
CREATE INDEX IF NOT EXISTS conversations_updated_at_idx ON public.conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_timestamp_idx ON public.messages (timestamp ASC);

-- 4. Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 5. Policies
DROP POLICY IF EXISTS "own_conversations" ON public.conversations;
CREATE POLICY "own_conversations" ON public.conversations
  FOR ALL USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "own_messages" ON public.messages;
CREATE POLICY "own_messages" ON public.messages
  FOR ALL USING (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      JOIN public.users u ON u.id = c.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- 6. Trigger for updated_at on conversations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
