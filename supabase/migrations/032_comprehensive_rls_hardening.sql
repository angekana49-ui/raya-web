-- ============================================================
-- RAYA - Migration 032: Comprehensive RLS Hardening
-- ============================================================
-- Objective: Ensure strict Row Level Security (RLS) across all
-- critical tables (study_rooms, conversations, messages, users)
-- blocking all unauthorized operations from frontend clients.
-- Note: Supabase Service Role (backend API) bypasses RLS safely.
-- ============================================================

-- 1. Ensure RLS is enabled on all target tables
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STUDY ROOMS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view active rooms" ON public.study_rooms;
DROP POLICY IF EXISTS "Creators can manage their rooms" ON public.study_rooms;

-- SELECT: Anyone (even anon guests) can view active rooms, creators can view all their rooms
CREATE POLICY "study_rooms_select" ON public.study_rooms
  FOR SELECT
  USING (
    is_active = true
    OR created_by IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- INSERT / UPDATE / DELETE: Strictly limited to the creator of the room
CREATE POLICY "study_rooms_insert" ON public.study_rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "study_rooms_update" ON public.study_rooms
  FOR UPDATE TO authenticated
  USING (
    created_by IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    created_by IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "study_rooms_delete" ON public.study_rooms
  FOR DELETE TO authenticated
  USING (
    created_by IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );


-- ============================================================
-- CONVERSATIONS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "own_conversations" ON public.conversations;

-- SELECT / ALL: Strictly limited to conversation owners
CREATE POLICY "conversations_all" ON public.conversations
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );


-- ============================================================
-- MESSAGES POLICIES
-- ============================================================
DROP POLICY IF EXISTS "own_messages" ON public.messages;
DROP POLICY IF EXISTS "active_study_room_messages_read" ON public.messages;

-- SELECT: Owner of conversation OR anyone (even anon guests) if the conversation is an active study room
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT
  USING (
    (
      auth.uid() IS NOT NULL AND conversation_id IN (
        SELECT c.id FROM public.conversations c 
        JOIN public.users u ON u.id = c.user_id 
        WHERE u.auth_user_id = auth.uid()
      )
    )
    OR
    (
      -- Tied to an ACTIVE study room (public preview)
      conversation_id IN (
        SELECT sr.conversation_id FROM public.study_rooms sr 
        WHERE sr.is_active = true AND sr.conversation_id IS NOT NULL
      )
    )
  );

-- INSERT / UPDATE / DELETE: Strictly limited to conversation owner via frontend.
-- Guests posting into active study rooms must pass through secure backend API APIs (Service Role).
CREATE POLICY "messages_mutation" ON public.messages
  FOR ALL TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND conversation_id IN (
      SELECT c.id FROM public.conversations c 
      JOIN public.users u ON u.id = c.user_id 
      WHERE u.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND conversation_id IN (
      SELECT c.id FROM public.conversations c 
      JOIN public.users u ON u.id = c.user_id 
      WHERE u.auth_user_id = auth.uid()
    )
  );


-- ============================================================
-- USERS POLICIES
-- ============================================================
DROP POLICY IF EXISTS "own_profile" ON public.users;
DROP POLICY IF EXISTS "users_read_all" ON public.users;

-- SELECT: Anyone (even anon guests) can read basic profiles (needed for room presence & chat avatars)
CREATE POLICY "users_select" ON public.users
  FOR SELECT
  USING (true);

-- UPDATE: Only modify your own profile
CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- INSERT: Done by secure backend trigger or signup flow
CREATE POLICY "users_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
