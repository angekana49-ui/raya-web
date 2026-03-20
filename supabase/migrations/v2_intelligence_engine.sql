-- ============================================================================
-- BlueStift Intelligence Engine v2 — Schema Migration
-- ============================================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================================

-- ─── 1. Add v2 columns to existing 'insights' table ──────────────────────────
-- These are optional columns so existing v1 rows won't be affected

DO $$ BEGIN
  -- Engine version marker
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='engine_version') THEN
    ALTER TABLE insights ADD COLUMN engine_version TEXT DEFAULT 'v1';
  END IF;

  -- MOAT signal columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='avg_cognitive_depth') THEN
    ALTER TABLE insights ADD COLUMN avg_cognitive_depth NUMERIC(3,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='avg_resilience') THEN
    ALTER TABLE insights ADD COLUMN avg_resilience NUMERIC(3,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='deepest_gap_level') THEN
    ALTER TABLE insights ADD COLUMN deepest_gap_level INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='off_curriculum_ratio') THEN
    ALTER TABLE insights ADD COLUMN off_curriculum_ratio NUMERIC(3,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='curriculum_refs') THEN
    ALTER TABLE insights ADD COLUMN curriculum_refs TEXT[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='session_hour') THEN
    ALTER TABLE insights ADD COLUMN session_hour INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='session_duration_min') THEN
    ALTER TABLE insights ADD COLUMN session_duration_min INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='exchange_count') THEN
    ALTER TABLE insights ADD COLUMN exchange_count INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='insights' AND column_name='correct_ratio') THEN
    ALTER TABLE insights ADD COLUMN correct_ratio NUMERIC(4,3);
  END IF;
END $$;


-- ─── 2. Create 'weekly_snapshots' table ───────────────────────────────────────
-- Aggregated weekly data per class+subject — the core table for dashboard trends

CREATE TABLE IF NOT EXISTS weekly_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_year_id UUID NOT NULL,
  school_id UUID NOT NULL,
  subject TEXT NOT NULL,
  week_start DATE NOT NULL,

  -- Aggregated signals (from all insights of that week)
  avg_mastery NUMERIC(4,3),              -- 0.000 – 1.000
  avg_cognitive_depth NUMERIC(3,2),      -- 0.00 – 1.00
  avg_resilience NUMERIC(3,2),           -- 0.00 – 1.00
  deepest_gap_level INTEGER,             -- worst prerequisite gap
  off_curriculum_ratio NUMERIC(3,2),     -- 0.00 – 1.00
  session_count INTEGER DEFAULT 0,       -- total sessions that week
  student_count INTEGER DEFAULT 0,       -- distinct students (count only, no IDs)
  exchange_count INTEGER DEFAULT 0,      -- total exchanges
  avg_correct_ratio NUMERIC(4,3),        -- 0.000 – 1.000
  concepts_covered TEXT[],               -- unique concept list
  curriculum_refs TEXT[],                -- standards references
  peak_hour INTEGER,                     -- most common study hour (0-23)

  -- Qualitative (AI-generated, from most relevant insight)
  top_critical_gap TEXT,
  top_recommendation TEXT,

  -- Trend (computed relative to previous week)
  mastery_trend NUMERIC(5,3),            -- delta vs previous week (e.g. +0.05 or -0.03)

  -- Meta
  engine_version TEXT DEFAULT 'v2',
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(class_year_id, subject, week_start)
);

-- RLS: schools can only read their own snapshots
ALTER TABLE weekly_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if re-running
DROP POLICY IF EXISTS "Schools read own snapshots" ON weekly_snapshots;

CREATE POLICY "Schools read own snapshots" ON weekly_snapshots
  FOR SELECT USING (
    school_id::TEXT = (auth.jwt() -> 'user_metadata' ->> 'school_id')
  );


-- ─── 3. Weekly aggregation function ──────────────────────────────────────────
-- Call this via pg_cron every Monday, or manually from Supabase dashboard
-- Usage: SELECT aggregate_weekly_snapshots();

CREATE OR REPLACE FUNCTION aggregate_weekly_snapshots(
  p_week_start DATE DEFAULT date_trunc('week', now() - interval '7 days')::DATE
)
RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      i.class_year_id,
      i.school_id,
      i.subject,
      p_week_start AS week_start,
      ROUND(AVG(i.mastery_score), 3) AS avg_mastery,
      ROUND(AVG(i.avg_cognitive_depth), 2) AS avg_cognitive_depth,
      ROUND(AVG(i.avg_resilience), 2) AS avg_resilience,
      MIN(i.deepest_gap_level) AS deepest_gap_level,
      ROUND(AVG(i.off_curriculum_ratio), 2) AS off_curriculum_ratio,
      COUNT(*) AS session_count,
      SUM(COALESCE(i.exchange_count, 1)) AS exchange_count,
      ROUND(AVG(i.correct_ratio), 3) AS avg_correct_ratio,
      -- Flatten and deduplicate concepts
      ARRAY(SELECT DISTINCT unnest FROM unnest(
        array_agg(COALESCE(i.concepts_acquired, ARRAY[]::TEXT[]))
      )) AS concepts_covered,
      ARRAY(SELECT DISTINCT unnest FROM unnest(
        array_agg(COALESCE(i.curriculum_refs, ARRAY[]::TEXT[]))
      )) AS curriculum_refs,
      -- Most common study hour
      (SELECT mode() WITHIN GROUP (ORDER BY i2.session_hour)
       FROM insights i2
       WHERE i2.class_year_id = i.class_year_id
         AND i2.subject = i.subject
         AND i2.session_hour IS NOT NULL
         AND i2.created_at >= p_week_start
         AND i2.created_at < p_week_start + interval '7 days'
      ) AS peak_hour,
      -- Best critical gap and recommendation
      (SELECT i3.critical_gap FROM insights i3
       WHERE i3.class_year_id = i.class_year_id AND i3.subject = i.subject
         AND i3.critical_gap IS NOT NULL
         AND i3.created_at >= p_week_start AND i3.created_at < p_week_start + interval '7 days'
       ORDER BY i3.mastery_score ASC LIMIT 1
      ) AS top_critical_gap,
      (SELECT i4.recommended_action FROM insights i4
       WHERE i4.class_year_id = i.class_year_id AND i4.subject = i.subject
         AND i4.recommended_action IS NOT NULL
         AND i4.created_at >= p_week_start AND i4.created_at < p_week_start + interval '7 days'
       ORDER BY i4.created_at DESC LIMIT 1
      ) AS top_recommendation
    FROM insights i
    WHERE i.created_at >= p_week_start
      AND i.created_at < p_week_start + interval '7 days'
      AND i.subject IS NOT NULL
      AND i.subject != 'General'
    GROUP BY i.class_year_id, i.school_id, i.subject
  LOOP
    -- Calculate trend vs previous week
    DECLARE
      prev_mastery NUMERIC;
      trend NUMERIC;
    BEGIN
      SELECT ws.avg_mastery INTO prev_mastery
      FROM weekly_snapshots ws
      WHERE ws.class_year_id = rec.class_year_id
        AND ws.subject = rec.subject
        AND ws.week_start = rec.week_start - interval '7 days';

      trend := CASE WHEN prev_mastery IS NOT NULL
        THEN ROUND(rec.avg_mastery - prev_mastery, 3)
        ELSE NULL END;

      INSERT INTO weekly_snapshots (
        class_year_id, school_id, subject, week_start,
        avg_mastery, avg_cognitive_depth, avg_resilience,
        deepest_gap_level, off_curriculum_ratio,
        session_count, exchange_count, avg_correct_ratio,
        concepts_covered, curriculum_refs, peak_hour,
        top_critical_gap, top_recommendation,
        mastery_trend, student_count
      ) VALUES (
        rec.class_year_id, rec.school_id, rec.subject, rec.week_start,
        rec.avg_mastery, rec.avg_cognitive_depth, rec.avg_resilience,
        rec.deepest_gap_level, rec.off_curriculum_ratio,
        rec.session_count, rec.exchange_count, rec.avg_correct_ratio,
        rec.concepts_covered, rec.curriculum_refs, rec.peak_hour,
        rec.top_critical_gap, rec.top_recommendation,
        trend, 0  -- student_count filled separately (privacy: need distinct count only)
      )
      ON CONFLICT (class_year_id, subject, week_start) DO UPDATE SET
        avg_mastery = EXCLUDED.avg_mastery,
        avg_cognitive_depth = EXCLUDED.avg_cognitive_depth,
        avg_resilience = EXCLUDED.avg_resilience,
        deepest_gap_level = EXCLUDED.deepest_gap_level,
        off_curriculum_ratio = EXCLUDED.off_curriculum_ratio,
        session_count = EXCLUDED.session_count,
        exchange_count = EXCLUDED.exchange_count,
        avg_correct_ratio = EXCLUDED.avg_correct_ratio,
        concepts_covered = EXCLUDED.concepts_covered,
        curriculum_refs = EXCLUDED.curriculum_refs,
        peak_hour = EXCLUDED.peak_hour,
        top_critical_gap = EXCLUDED.top_critical_gap,
        top_recommendation = EXCLUDED.top_recommendation,
        mastery_trend = EXCLUDED.mastery_trend,
        created_at = now();

      inserted_count := inserted_count + 1;
    END;
  END LOOP;

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 4. Optional: pg_cron job (run every Monday at 3am UTC) ──────────────────
-- Uncomment these lines if pg_cron is enabled on your Supabase project:
--
-- SELECT cron.schedule(
--   'aggregate-weekly-snapshots',
--   '0 3 * * 1',  -- Every Monday at 3:00 UTC
--   $$SELECT aggregate_weekly_snapshots()$$
-- );
