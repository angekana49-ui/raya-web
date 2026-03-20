/**
 * Session Aggregator — Deterministic Session Summary
 *
 * Accumulates AnalyticsPoints across a chat session and produces a
 * privacy-safe SessionSummary at session end.
 *
 * Key invariant: SessionSummary contains class_year_id + school_id
 * but NEVER user_id. Individual student data stays in the browser.
 *
 * Usage:
 *   const agg = new SessionAggregator(classYearId, schoolId);
 *   agg.addExchange(analyticsPoint, userMessageText);
 *   // ... after each exchange ...
 *   const summary = agg.finalize();
 *   // POST summary to Edge Function or Supabase
 */

import type { AnalyticsPoint } from "./assessment-engine";
import { detectCognitiveDepth, detectOffCurriculum } from "./assessment-engine";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface SessionSummary {
  // Identity (class-level, never student-level)
  class_year_id: string;
  school_id: string;

  // Deterministic aggregates
  subject: string | null;                // dominant subject of the session
  exchange_count: number;                // total academic exchanges
  correct_ratio: number;                 // correct / total academic (0–1)
  avg_cognitive_depth: number;           // 0 = surface, 0.5 = procedural, 1 = deep
  avg_resilience: number;                // 0–1 (computed from retry sequences)
  deepest_gap_level: number | null;      // worst prerequisite gap detected
  mastery_score: number;                 // weighted score (correct_ratio * complexity)
  off_curriculum_ratio: number;          // curiosity signal (0–1)
  concepts_covered: string[];            // unique concept_ids touched
  curriculum_refs: string[];             // unique standards references
  session_hour: number;                  // 0–23, local time of session start
  session_duration_min: number;          // approximate duration in minutes

  // Qualitative (from AI — RAYA's teacher_note)
  teacher_recommendation: string | null;
  critical_gap: string | null;

  // Meta
  engine_version: string;
}

export type SessionSummaryPayload = Omit<SessionSummary, "class_year_id" | "school_id">;

// ─── Internal tracking ────────────────────────────────────────────────────────

interface ExchangeRecord {
  point: AnalyticsPoint;
  cognitiveDepth: 'surface' | 'procedural' | 'deep';
  isOffCurriculum: boolean;
}

// Depth weights for numeric averaging
const DEPTH_WEIGHT: Record<string, number> = {
  surface: 0,
  procedural: 0.5,
  deep: 1,
};

// ─── Session Aggregator Class ─────────────────────────────────────────────────

export class SessionAggregator {
  private classYearId: string;
  private schoolId: string;
  private exchanges: ExchangeRecord[] = [];
  private startTime: number;

  // Resilience tracking: sequences of attempts on the same concept
  private currentConceptId: string | null = null;
  private currentConceptAttempts: number = 0;
  private currentConceptResolved: boolean = false;
  private resilienceScores: number[] = [];

  // Qualitative (last non-null values from RAYA)
  private lastTeacherNote: string | null = null;
  private lastCriticalGap: string | null = null;
  private conceptsCovered = new Set<string>();

  constructor(classYearId: string, schoolId: string) {
    this.classYearId = classYearId;
    this.schoolId = schoolId;
    this.startTime = Date.now();
  }

  /**
   * Add an exchange to the session. Call after each evaluateExchange().
   * @param point - The AnalyticsPoint from evaluateExchange()
   * @param userMessage - Raw user message text (for off-curriculum detection)
   * @param conceptId - concept_id from RayaInsight (for resilience tracking)
   * @param wasCorrect - whether student_verdict was "correct" (for resilience)
   */
  addExchange(
    point: AnalyticsPoint,
    userMessage: string,
    conceptId?: string,
    wasCorrect?: boolean
  ): void {
    const cognitiveDepth = detectCognitiveDepth(userMessage);
    const isOffCurriculum = detectOffCurriculum(userMessage);

    this.exchanges.push({ point, cognitiveDepth, isOffCurriculum });
    if (conceptId && conceptId !== '') {
      this.conceptsCovered.add(conceptId);
    }

    // Track teacher notes (keep the last non-null one)
    if (point.recommendation_for_teacher) {
      this.lastTeacherNote = point.recommendation_for_teacher;
    }

    // Track resilience: consecutive attempts on the same concept
    if (conceptId && conceptId !== '') {
      if (conceptId === this.currentConceptId) {
        this.currentConceptAttempts++;
        if (wasCorrect) {
          this.currentConceptResolved = true;
          // Resilience = 1 if resolved, scaled by number of attempts (more attempts = more resilient)
          const score = Math.min(1, this.currentConceptAttempts / 4);
          this.resilienceScores.push(score);
          this.currentConceptId = null;
          this.currentConceptAttempts = 0;
          this.currentConceptResolved = false;
        }
      } else {
        // New concept — finalize previous sequence if unresolved
        if (this.currentConceptId && !this.currentConceptResolved) {
          // Gave up: resilience = 0 (or partial if they tried multiple times)
          const score = Math.min(0.3, this.currentConceptAttempts / 10);
          this.resilienceScores.push(score);
        }
        this.currentConceptId = conceptId;
        this.currentConceptAttempts = 1;
        this.currentConceptResolved = false;
      }
    }

    // Detect critical gap from prerequisite_gap_depth
    if (point.prerequisite_gap_depth != null && point.prerequisite_gap_depth < -1) {
      this.lastCriticalGap = `Prerequisite gap detected: ${Math.abs(point.prerequisite_gap_depth)} levels below current enrollment`;
    }
  }

  /**
   * Finalize the session and produce a privacy-safe summary.
   * Call when the session ends (user leaves, timeout, etc.)
   */
  private buildSummaryPayload(): SessionSummaryPayload {
    const academicExchanges = this.exchanges.filter(e => e.point.subject != null);
    const total = academicExchanges.length || 1; // avoid division by zero

    // Finalize any remaining resilience sequence
    if (this.currentConceptId && !this.currentConceptResolved) {
      const score = Math.min(0.3, this.currentConceptAttempts / 10);
      this.resilienceScores.push(score);
    }

    // Dominant subject (most frequent)
    const subjectCounts: Record<string, number> = {};
    for (const e of academicExchanges) {
      if (e.point.subject) {
        subjectCounts[e.point.subject] = (subjectCounts[e.point.subject] || 0) + 1;
      }
    }
    const dominantSubject = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Correct ratio (from pkm_global > 0.7 as proxy for "correct")
    const correctCount = academicExchanges.filter(e =>
      e.point.pkm_global != null && e.point.pkm_global >= 0.7
    ).length;
    const correctRatio = correctCount / total;

    // Average cognitive depth
    const avgDepth = this.exchanges.reduce((sum, e) => sum + DEPTH_WEIGHT[e.cognitiveDepth], 0) / (this.exchanges.length || 1);

    // Average resilience
    const avgResilience = this.resilienceScores.length > 0
      ? this.resilienceScores.reduce((a, b) => a + b, 0) / this.resilienceScores.length
      : null;

    // Deepest prerequisite gap
    const gaps = academicExchanges
      .map(e => e.point.prerequisite_gap_depth)
      .filter((g): g is number => g != null);
    const deepestGap = gaps.length > 0 ? Math.min(...gaps) : null;

    // Off-curriculum ratio
    const offCount = this.exchanges.filter(e => e.isOffCurriculum).length;
    const offRatio = offCount / (this.exchanges.length || 1);

    // Unique concepts and curriculum refs
    const conceptsSet = new Set<string>();
    const refsSet = new Set<string>();
    for (const e of academicExchanges) {
      if (e.point.curriculum_ref) refsSet.add(e.point.curriculum_ref);
    }

    // Mastery score: weighted by correct ratio and average cognitive depth
    const mastery = correctRatio * 0.6 + avgDepth * 0.25 + (avgResilience ?? 0) * 0.15;

    // Session duration
    const durationMin = Math.round((Date.now() - this.startTime) / 60000);

    return {
      subject: dominantSubject,
      exchange_count: academicExchanges.length,
      correct_ratio: parseFloat(correctRatio.toFixed(3)),
      avg_cognitive_depth: parseFloat(avgDepth.toFixed(3)),
      avg_resilience: avgResilience != null ? parseFloat(avgResilience.toFixed(3)) : 0,
      deepest_gap_level: deepestGap,
      mastery_score: parseFloat(Math.max(0, Math.min(1, mastery)).toFixed(3)),
      off_curriculum_ratio: parseFloat(offRatio.toFixed(3)),
      concepts_covered: [...this.conceptsCovered],
      curriculum_refs: [...refsSet],
      session_hour: new Date(this.startTime).getHours(),
      session_duration_min: durationMin,
      teacher_recommendation: this.lastTeacherNote,
      critical_gap: this.lastCriticalGap,
      engine_version: 'v2',
    };
  }

  finalizePayload(): SessionSummaryPayload {
    return this.buildSummaryPayload();
  }

  finalize(): SessionSummary {
    return {
      class_year_id: this.classYearId,
      school_id: this.schoolId,
      ...this.buildSummaryPayload(),
    };
  }

  /** Reset for a new session (same class/school). */
  reset(): void {
    this.exchanges = [];
    this.startTime = Date.now();
    this.currentConceptId = null;
    this.currentConceptAttempts = 0;
    this.currentConceptResolved = false;
    this.resilienceScores = [];
    this.lastTeacherNote = null;
    this.lastCriticalGap = null;
    this.conceptsCovered = new Set<string>();
  }
}
