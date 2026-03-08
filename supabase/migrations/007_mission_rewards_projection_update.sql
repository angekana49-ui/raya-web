-- ============================================================
-- RAYA - Migration 007: Mission rewards event + projection update
-- ============================================================

-- 1) Extend learning_events allowed event types
ALTER TABLE public.learning_events
  DROP CONSTRAINT IF EXISTS learning_events_event_type_check;

ALTER TABLE public.learning_events
  ADD CONSTRAINT learning_events_event_type_check
  CHECK (
    event_type IN (
      'message_sent',
      'assistant_response',
      'insight_validated',
      'mission_graded',
      'mission_rewarded',
      'xp_awarded'
    )
  );


-- 2) Rebuild daily stats to include mission rewards
CREATE OR REPLACE VIEW public.learning_daily_user_stats AS
WITH event_counts AS (
  SELECT
    le.user_id,
    DATE(le.occurred_at) AS activity_date,
    COUNT(*) FILTER (WHERE le.event_type = 'message_sent') AS messages_sent,
    COUNT(*) FILTER (WHERE le.event_type = 'assistant_response') AS assistant_responses,
    COUNT(*) FILTER (WHERE le.event_type = 'insight_validated') AS validated_insights,
    COUNT(*) FILTER (WHERE le.event_type = 'mission_graded') AS missions_graded,
    COALESCE(SUM(
      CASE
        WHEN le.event_type = 'xp_awarded'
          AND jsonb_typeof(le.payload->'xp_earned') = 'number'
          THEN (le.payload->>'xp_earned')::int
        ELSE 0
      END
    ), 0) AS exchange_xp_awarded,
    COALESCE(SUM(
      CASE
        WHEN le.event_type = 'mission_rewarded'
          AND jsonb_typeof(le.payload->'xp_earned') = 'number'
          THEN (le.payload->>'xp_earned')::int
        ELSE 0
      END
    ), 0) AS mission_xp_awarded,
    COALESCE(SUM(
      CASE
        WHEN le.event_type = 'mission_rewarded'
          AND jsonb_typeof(le.payload->'hearts_earned') = 'number'
          THEN (le.payload->>'hearts_earned')::int
        ELSE 0
      END
    ), 0) AS hearts_earned
  FROM public.learning_events le
  GROUP BY le.user_id, DATE(le.occurred_at)
),
insight_stats AS (
  SELECT
    lie.user_id,
    lie.activity_date,
    AVG(lie.pkm_delta) AS avg_pkm_delta,
    COUNT(*) FILTER (WHERE lie.student_verdict = 'correct') AS correct_count,
    COUNT(*) FILTER (WHERE lie.student_verdict = 'partial') AS partial_count,
    COUNT(*) FILTER (WHERE lie.student_verdict = 'incorrect') AS incorrect_count,
    COUNT(*) FILTER (WHERE lie.exchange_type = 'social') AS social_count
  FROM public.learning_insight_events lie
  GROUP BY lie.user_id, lie.activity_date
)
SELECT
  ec.user_id,
  u.school_id,
  u.class_year_id,
  ec.activity_date,
  ec.messages_sent,
  ec.assistant_responses,
  ec.validated_insights,
  ec.missions_graded,
  (ec.exchange_xp_awarded + ec.mission_xp_awarded) AS xp_awarded,
  COALESCE(is2.avg_pkm_delta, 0)::numeric(6,4) AS avg_pkm_delta,
  COALESCE(is2.correct_count, 0) AS correct_count,
  COALESCE(is2.partial_count, 0) AS partial_count,
  COALESCE(is2.incorrect_count, 0) AS incorrect_count,
  COALESCE(is2.social_count, 0) AS social_count,
  CASE
    WHEN COALESCE(is2.correct_count, 0) + COALESCE(is2.partial_count, 0) + COALESCE(is2.incorrect_count, 0) = 0
      THEN NULL
    ELSE ROUND(
      COALESCE(is2.correct_count, 0)::numeric
      / (COALESCE(is2.correct_count, 0) + COALESCE(is2.partial_count, 0) + COALESCE(is2.incorrect_count, 0))::numeric,
      4
    )
  END AS correctness_rate,
  ec.exchange_xp_awarded,
  ec.mission_xp_awarded,
  ec.hearts_earned
FROM event_counts ec
JOIN public.users u ON u.id = ec.user_id
LEFT JOIN insight_stats is2
  ON is2.user_id = ec.user_id
 AND is2.activity_date = ec.activity_date;


-- 3) Rebuild school overview with extra mission reward columns
CREATE OR REPLACE VIEW public.learning_school_overview AS
SELECT
  lds.school_id,
  lds.class_year_id,
  lds.activity_date,
  COUNT(DISTINCT lds.user_id) AS active_students,
  SUM(lds.messages_sent) AS total_messages_sent,
  SUM(lds.validated_insights) AS total_validated_insights,
  SUM(lds.missions_graded) AS total_missions_graded,
  SUM(lds.xp_awarded) AS total_xp_awarded,
  ROUND(AVG(lds.avg_pkm_delta), 4) AS avg_pkm_delta,
  ROUND(AVG(lds.correctness_rate), 4) AS avg_correctness_rate,
  SUM(lds.exchange_xp_awarded) AS total_exchange_xp_awarded,
  SUM(lds.mission_xp_awarded) AS total_mission_xp_awarded,
  SUM(lds.hearts_earned) AS total_hearts_earned
FROM public.learning_daily_user_stats lds
GROUP BY lds.school_id, lds.class_year_id, lds.activity_date;
