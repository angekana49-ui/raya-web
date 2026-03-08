-- ============================================================
-- RAYA - Migration 008: Enrich learning_insight_events view
--   with school-reporting fields from the v3 insight schema:
--   subject_area, curriculum, errors, misconceptions,
--   teacher_note, engagement
--
-- Strategy: DROP CASCADE all dependent views, then recreate
--   everything from scratch (views only — no data loss).
-- ============================================================

-- Drop all dependent views first (CASCADE would get them anyway, but explicit is clearer)
DROP VIEW IF EXISTS public.learning_class_concept_gaps CASCADE;
DROP VIEW IF EXISTS public.learning_school_overview CASCADE;
DROP VIEW IF EXISTS public.learning_daily_user_stats CASCADE;
DROP VIEW IF EXISTS public.learning_class_misconceptions CASCADE;
DROP VIEW IF EXISTS public.learning_student_engagement CASCADE;
DROP VIEW IF EXISTS public.learning_insight_events CASCADE;


-- ── 1. Base insight projection ────────────────────────────────────────────────

CREATE VIEW public.learning_insight_events AS
SELECT
  le.id AS event_id,
  le.user_id,
  u.school_id,
  u.class_year_id,
  le.conversation_id,
  le.occurred_at,
  DATE(le.occurred_at) AS activity_date,

  -- Core fields
  le.payload->>'exchange_type'    AS exchange_type,
  le.payload->>'student_verdict'  AS student_verdict,
  le.payload->>'difficulty'       AS difficulty,
  le.payload->>'concept_id'       AS concept_id,
  CASE
    WHEN jsonb_typeof(le.payload->'pkm_delta') = 'number'
      THEN (le.payload->>'pkm_delta')::numeric
    ELSE NULL
  END AS pkm_delta,

  -- School-reporting fields (v3 blend schema)
  le.payload->>'subject_area'          AS subject_area,
  le.payload->'curriculum'->>'country' AS curriculum_country,
  le.payload->'curriculum'->>'grade'   AS curriculum_grade,
  le.payload->'curriculum'->>'exam'    AS curriculum_exam,
  CASE
    WHEN jsonb_typeof(le.payload->'errors') = 'array'
      THEN le.payload->'errors'
    ELSE '[]'::jsonb
  END AS errors,
  CASE
    WHEN jsonb_typeof(le.payload->'misconceptions') = 'array'
      THEN le.payload->'misconceptions'
    ELSE '[]'::jsonb
  END AS misconceptions,
  le.payload->>'teacher_note'     AS teacher_note,
  CASE
    WHEN jsonb_typeof(le.payload->'engagement') = 'number'
      THEN (le.payload->>'engagement')::numeric
    ELSE NULL
  END AS engagement,

  -- Mission grade
  CASE
    WHEN jsonb_typeof(le.payload->'mission_grade') = 'object'
      AND jsonb_typeof((le.payload->'mission_grade')->'score') = 'number'
      THEN ((le.payload->'mission_grade')->>'score')::int
    ELSE NULL
  END AS mission_score,
  CASE
    WHEN jsonb_typeof(le.payload->'mission_grade') = 'object'
      AND jsonb_typeof((le.payload->'mission_grade')->'max') = 'number'
      THEN ((le.payload->'mission_grade')->>'max')::int
    ELSE NULL
  END AS mission_max

FROM public.learning_events le
JOIN public.users u ON u.id = le.user_id
WHERE le.event_type = 'insight_validated';


-- ── 2. Daily per-student stats (unchanged logic, rebuilt after base view) ─────

CREATE VIEW public.learning_daily_user_stats AS
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
    ), 0) AS xp_awarded
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
  ec.xp_awarded,
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
  END AS correctness_rate
FROM event_counts ec
JOIN public.users u ON u.id = ec.user_id
LEFT JOIN insight_stats is2
  ON is2.user_id = ec.user_id
 AND is2.activity_date = ec.activity_date;


-- ── 3. Class/school overview ──────────────────────────────────────────────────

CREATE VIEW public.learning_school_overview AS
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
  ROUND(AVG(lds.correctness_rate), 4) AS avg_correctness_rate
FROM public.learning_daily_user_stats lds
GROUP BY lds.school_id, lds.class_year_id, lds.activity_date;


-- ── 4. Weak concepts by class ─────────────────────────────────────────────────

CREATE VIEW public.learning_class_concept_gaps AS
SELECT
  lie.school_id,
  lie.class_year_id,
  lie.concept_id,
  COUNT(*) AS attempts,
  ROUND(AVG(lie.pkm_delta), 4) AS avg_pkm_delta,
  COUNT(*) FILTER (WHERE lie.student_verdict = 'incorrect') AS incorrect_attempts
FROM public.learning_insight_events lie
WHERE lie.concept_id IS NOT NULL
  AND lie.concept_id <> ''
GROUP BY lie.school_id, lie.class_year_id, lie.concept_id
HAVING COUNT(*) >= 5;


-- ── 5. Top misconceptions per class (new) ────────────────────────────────────

CREATE VIEW public.learning_class_misconceptions AS
SELECT
  lie.school_id,
  lie.class_year_id,
  lie.subject_area,
  misconception.value AS misconception,
  COUNT(*) AS occurrences
FROM public.learning_insight_events lie,
     jsonb_array_elements_text(lie.misconceptions) AS misconception(value)
WHERE lie.misconceptions <> '[]'::jsonb
  AND lie.misconceptions IS NOT NULL
GROUP BY lie.school_id, lie.class_year_id, lie.subject_area, misconception.value
HAVING COUNT(*) >= 2
ORDER BY occurrences DESC;


-- ── 6. Engagement quality per student — rolling 30 days (new) ────────────────

CREATE VIEW public.learning_student_engagement AS
SELECT
  lie.user_id,
  lie.school_id,
  lie.class_year_id,
  ROUND(AVG(lie.engagement), 3) AS avg_engagement,
  COUNT(*) AS insight_count,
  COUNT(*) FILTER (WHERE lie.student_verdict = 'correct') AS correct_count,
  COUNT(*) FILTER (WHERE lie.student_verdict = 'incorrect') AS incorrect_count
FROM public.learning_insight_events lie
WHERE lie.occurred_at >= NOW() - INTERVAL '30 days'
  AND lie.engagement IS NOT NULL
GROUP BY lie.user_id, lie.school_id, lie.class_year_id;
