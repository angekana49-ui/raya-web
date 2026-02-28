/**
 * Assessment Engine — Learning Analytics Layer
 *
 * Pure functions. No side-effects. No AI calls.
 * Analyses user messages and RAYA's insight to produce:
 *  - Objective gamification events (XP, skill progress, mission events)
 *  - School analytics data points
 *
 * ANTI-CHEAT: All values derived from conversation metadata
 * or from the server-side RayaInsight, never from user self-reporting.
 */

import type { RayaInsight } from "@/services/raya-ai.service";

// ─── Public Types ─────────────────────────────────────────────────────────────

export type QuestionType = "conceptual" | "exercise" | "correction" | "other";

export type MissionEventType =
  | "message_sent"
  | "subject_practiced"
  | "exchange_completed"
  | "correction_requested";

export interface MissionEvent {
  type: MissionEventType;
  subject?: string;
}

export interface MessageAnalysis {
  subject: string | null;      // detected skill key (algebra|grammar|physics|null)
  questionType: QuestionType;
  complexityScore: number;     // 0–1 (rough estimate from message length + terms)
}

export interface ExchangeResult {
  xpEarned: number;
  skillKey: string | null;     // which skill to advance (null if unknown)
  skillDelta: number;          // how many points to add to the skill progress bar
  missionEvents: MissionEvent[];
  qualityLabel: "Excellent" | "Good" | "Keep practicing";
  /** Structured data for future school analytics */
  analyticsPoint: AnalyticsPoint;
}

export interface AnalyticsPoint {
  timestamp: number;
  subject: string | null;
  questionType: QuestionType;
  pkm_global: number | null;   // 0–1, null if no insight
  pkm_accuracy: number | null;
  engagement_level: number | null;
  question_quality: "low" | "medium" | "high" | null;
  intervention_needed: boolean;
  recommendation_for_teacher: string | null;
}

// ─── Internal maps ────────────────────────────────────────────────────────────

/** Map AI subject_area strings → skill keys used in the gamification hook */
const AI_SUBJECT_TO_SKILL: Record<string, string> = {
  Algebra:     "algebra",
  Mathematics: "algebra",
  Math:        "algebra",
  Maths:       "algebra",
  Grammar:     "grammar",
  French:      "grammar",
  English:     "grammar",
  Literature:  "grammar",
  Writing:     "grammar",
  Physics:     "physics",
  Chemistry:   "physics",
  Science:     "physics",
  Biology:     "physics",
};

const SKILL_PATTERNS: { key: string; regex: RegExp }[] = [
  { key: "algebra", regex: /algebra|equat|polynôm|polynome|variable|factori|calcul/i },
  { key: "grammar", regex: /grammar|grammaire|conjugu|verbe|spelling|orthograph|syntax/i },
  { key: "physics", regex: /physic|physique|force|énergi|energie|vitesse|accélér|accel|newton/i },
];

// ─── Step 1: Analyse the USER message (before sending to AI) ─────────────────

/**
 * Called with the raw user message text before sending.
 * Returns a lightweight analysis used later in evaluateExchange().
 */
export function analyzeUserMessage(text: string): MessageAnalysis {
  // Subject from keywords
  let subject: string | null = null;
  for (const p of SKILL_PATTERNS) {
    if (p.regex.test(text)) { subject = p.key; break; }
  }

  // Question type
  let questionType: QuestionType = "other";
  if (/correct|fix|mistake|error|wrong|check my|review my|faute|corriger/i.test(text)) {
    questionType = "correction";
  } else if (/solve|calculate|compute|find|prove|demonstrate|résoudre|calculer|trouver/i.test(text)) {
    questionType = "exercise";
  } else if (/explain|what is|what are|how does|why|define|describe|expliquer|qu'est|comment|pourquoi/i.test(text)) {
    questionType = "conceptual";
  }

  // Complexity: length + technical vocabulary density
  const words = text.trim().split(/\s+/).length;
  const complexityScore = Math.min(1, words / 40);

  return { subject, questionType, complexityScore };
}

// ─── Step 2: Evaluate the full exchange (after stream completes) ──────────────

/**
 * Called once the stream is complete.
 * Combines the user message analysis with the AI insight (if available).
 *
 * @param insight    RayaInsight parsed from ---RAYA_INSIGHT--- block, or null
 * @param analysis   Result of analyzeUserMessage() called before sending
 * @param turnCount  Total messages sent in this session (user side only)
 */
export function evaluateExchange(
  insight: RayaInsight | null,
  analysis: MessageAnalysis,
  turnCount: number
): ExchangeResult {
  const events: MissionEvent[] = [];

  // ── Always: message sent ──
  events.push({ type: "message_sent" });

  // ── Subject detection (insight takes priority over keyword) ──
  let skillKey: string | null = null;
  if (insight?.academic?.subject_area) {
    skillKey = AI_SUBJECT_TO_SKILL[insight.academic.subject_area] ?? analysis.subject;
  } else {
    skillKey = analysis.subject;
  }

  if (skillKey) {
    events.push({ type: "subject_practiced", subject: skillKey });
  }

  // ── Correction event ──
  if (analysis.questionType === "correction") {
    events.push({ type: "correction_requested" });
  }

  // ── Exchange completion: every 2nd message counts as a completed exchange ──
  if (turnCount >= 2) {
    events.push({ type: "exchange_completed" });
  }

  // ── XP and skill delta from insight PKM (server-validated scores) ──
  let xpEarned = 8;
  let skillDelta = 2;
  let qualityLabel: ExchangeResult["qualityLabel"] = "Keep practicing";

  if (insight?.academic?.pkm) {
    const pkm = insight.academic.pkm;
    // Sanitize: scores must be in [0, 1]
    const globalScore = Math.max(0, Math.min(1, pkm.global ?? 0));
    const accuracy    = Math.max(0, Math.min(1, pkm.accuracy ?? 0));

    if (globalScore >= 0.85) {
      xpEarned = 30; skillDelta = 10; qualityLabel = "Excellent";
    } else if (accuracy >= 0.7) {
      xpEarned = 15; skillDelta = 5;  qualityLabel = "Good";
    } else {
      xpEarned = 8;  skillDelta = 2;  qualityLabel = "Keep practicing";
    }

    // Engagement bonus
    const persistence = Math.max(0, Math.min(1, insight.pedagogical?.engagement?.persistence ?? 0));
    if (persistence >= 0.8) xpEarned += 10;
  } else {
    // No insight available: estimate from complexity
    xpEarned = 8 + Math.floor(analysis.complexityScore * 7);
    skillDelta = 2 + Math.floor(analysis.complexityScore * 3);
  }

  // ── Build analytics point for future school dashboard ──
  const analyticsPoint: AnalyticsPoint = {
    timestamp: Date.now(),
    subject: skillKey,
    questionType: analysis.questionType,
    pkm_global:   insight?.academic?.pkm?.global    != null ? Math.max(0, Math.min(1, insight.academic.pkm.global))    : null,
    pkm_accuracy: insight?.academic?.pkm?.accuracy  != null ? Math.max(0, Math.min(1, insight.academic.pkm.accuracy))  : null,
    engagement_level: insight?.pedagogical?.engagement?.level ?? null,
    question_quality: insight?.pedagogical?.engagement?.question_quality ?? null,
    intervention_needed: insight?.recommendations?.intervention_needed ?? false,
    recommendation_for_teacher: insight?.recommendations?.for_teacher ?? null,
  };

  return { xpEarned, skillKey, skillDelta, missionEvents: events, qualityLabel, analyticsPoint };
}
