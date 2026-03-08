-- ============================================================
-- RAYA - Migration 006: Compact school dashboards from learning_events
-- No new RLS policies. No edge functions. Views only.
-- ============================================================

-- School-level daily dashboard (global établissement)
CREATE OR REPLACE VIEW public.learning_school_dashboard_compact AS
SELECT
  lso.school_id,
  lso.activity_date,
  lso.active_students,
  lso.total_messages_sent,
  lso.total_validated_insights,
  lso.total_missions_graded,
  lso.total_xp_awarded,
  lso.avg_pkm_delta,
  lso.avg_correctness_rate,
  (
    SELECT json_agg(
      json_build_object(
        'class_year_id', x.class_year_id,
        'active_students', x.active_students,
        'avg_pkm_delta', x.avg_pkm_delta,
        'avg_correctness_rate', x.avg_correctness_rate
      )
      ORDER BY x.active_students DESC
    )
    FROM (
      SELECT
        lso2.class_year_id,
        SUM(lso2.active_students) AS active_students,
        ROUND(AVG(lso2.avg_pkm_delta), 4) AS avg_pkm_delta,
        ROUND(AVG(lso2.avg_correctness_rate), 4) AS avg_correctness_rate
      FROM public.learning_school_overview lso2
      WHERE lso2.school_id = lso.school_id
        AND lso2.activity_date = lso.activity_date
        AND lso2.class_year_id IS NOT NULL
      GROUP BY lso2.class_year_id
      LIMIT 10
    ) x
  ) AS class_snapshots
FROM public.learning_school_overview lso;


-- Class-level dashboard with top concept gaps (par classe)
CREATE OR REPLACE VIEW public.learning_class_dashboard_compact AS
SELECT
  lso.school_id,
  lso.class_year_id,
  lso.activity_date,
  lso.active_students,
  lso.total_messages_sent,
  lso.total_validated_insights,
  lso.total_missions_graded,
  lso.total_xp_awarded,
  lso.avg_pkm_delta,
  lso.avg_correctness_rate,
  (
    SELECT json_agg(
      json_build_object(
        'concept_id', g.concept_id,
        'attempts', g.attempts,
        'avg_pkm_delta', g.avg_pkm_delta,
        'incorrect_attempts', g.incorrect_attempts
      )
      ORDER BY g.avg_pkm_delta ASC, g.attempts DESC
    )
    FROM (
      SELECT
        lcg.concept_id,
        lcg.attempts,
        lcg.avg_pkm_delta,
        lcg.incorrect_attempts
      FROM public.learning_class_concept_gaps lcg
      WHERE lcg.school_id = lso.school_id
        AND lcg.class_year_id = lso.class_year_id
      ORDER BY lcg.avg_pkm_delta ASC, lcg.attempts DESC
      LIMIT 5
    ) g
  ) AS top_concept_gaps
FROM public.learning_school_overview lso
WHERE lso.class_year_id IS NOT NULL;
