-- ============================================================
-- RAYA - Migration 015: Vues, Realtime & Edge Function Setup
-- A appliquer dans Supabase Dashboard -> SQL Editor
-- ============================================================

-- ============================================================
-- 1. VUE: Résumé des rooms actives avec infos créateur
-- ============================================================
CREATE OR REPLACE VIEW public.study_rooms_with_creator AS
SELECT
  r.id,
  r.title,
  r.mission,
  r.duration,
  r.ai_mode,
  r.online_count,
  r.max_members,
  r.is_active,
  r.files,
  r.conversation_id,
  r.created_at,
  r.updated_at,
  u.id AS creator_id,
  u.username AS creator_username,
  u.display_name AS creator_display_name
FROM public.study_rooms r
LEFT JOIN public.users u ON u.id = r.created_by;

-- ============================================================
-- 2. VUE: Conversations avec leur dernier message
-- ============================================================
CREATE OR REPLACE VIEW public.conversations_with_preview AS
SELECT
  c.id,
  c.user_id,
  c.title,
  c.context_type,
  c.is_active,
  c.created_at,
  c.updated_at,
  (
    SELECT m.text
    FROM public.messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.timestamp DESC
    LIMIT 1
  ) AS last_message,
  (
    SELECT COUNT(*)::int
    FROM public.messages m
    WHERE m.conversation_id = c.id
  ) AS message_count
FROM public.conversations c;

-- ============================================================
-- 3. VUE: Statistiques d'apprentissage par utilisateur
-- ============================================================
CREATE OR REPLACE VIEW public.user_learning_stats AS
SELECT
  u.id AS user_id,
  u.username,
  COUNT(DISTINCT c.id) AS total_conversations,
  COUNT(DISTINCT m.id) AS total_messages,
  COUNT(DISTINCT le.id) AS total_learning_events,
  COALESCE(SUM(
    CASE WHEN le.event_type = 'xp_awarded'
    THEN (le.payload->>'xp_earned')::numeric ELSE 0 END
  ), 0) AS total_xp_earned,
  MAX(le.occurred_at) AS last_activity
FROM public.users u
LEFT JOIN public.conversations c ON c.user_id = u.id
LEFT JOIN public.messages m ON m.conversation_id = c.id
LEFT JOIN public.learning_events le ON le.user_id = u.id
GROUP BY u.id, u.username;

-- ============================================================
-- 4. REALTIME: Activer Realtime sur les tables clés
-- (Pour l'écoute des messages en temps réel dans les rooms)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_rooms;

-- ============================================================
-- 5. FONCTION: Auto-update du compteur en ligne dans les rooms
-- (Appelée via trigger ou webhook)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_room_online_count(room_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.study_rooms
  SET online_count = online_count + 1, updated_at = now()
  WHERE id = room_id AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrement_room_online_count(room_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.study_rooms
  SET online_count = GREATEST(online_count - 1, 0), updated_at = now()
  WHERE id = room_id AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. FONCTION: Récupérer les messages d'une room (optimisée)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_room_messages(p_conversation_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE(
  id UUID,
  sender TEXT,
  text TEXT,
  "timestamp" TIMESTAMPTZ,
  model_used TEXT,
  mode_used TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.sender, m.text, m.timestamp, m.model_used, m.mode_used
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. INDEX manquants pour les jointures fréquentes
-- ============================================================
CREATE INDEX IF NOT EXISTS study_rooms_conversation_id_idx ON public.study_rooms (conversation_id);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON public.messages (sender);
CREATE INDEX IF NOT EXISTS learning_events_event_type_idx ON public.learning_events (event_type);
