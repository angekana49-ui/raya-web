/**
 * Assessment Engine — Learning Analytics Layer
 *
 * Pure functions. No side-effects. No AI calls.
 * Produces gamification events (XP, skill progress, mission events)
 * from user message analysis + RAYA's insight JSON.
 *
 * XP philosophy:
 *   - Passive engagement (discussion, explanation): 1–3 XP
 *   - Real work with proof (exercise/test): 10–25 XP
 *   - Missions & challenges: 50–150 XP (handled by hook)
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
  subject: string | null;
  questionType: QuestionType;
  complexityScore: number; // 0–1
}

export interface SkillProgress {
  key: string;
  delta: number;
}

export interface MissionGrade {
  score: number;   // integer 0–max
  max: 10 | 20;
  feedback: string;
}

export interface ExchangeResult {
  xpEarned: number;
  skillProgress: SkillProgress[];   // primary + transversal skills with individual deltas
  missionEvents: MissionEvent[];
  qualityLabel: "Excellent" | "Good" | "Keep practicing";
  isAcademic: boolean;
  analyticsPoint: AnalyticsPoint;
  missionGrade?: MissionGrade;  // present when RAYA graded a mission response
  /** @deprecated use skillProgress[0]?.key — kept for backwards compat */
  skillKey: string | null;
  /** @deprecated use skillProgress[0]?.delta — kept for backwards compat */
  skillDelta: number;
}

export interface AnalyticsPoint {
  timestamp: number;
  subject: string | null;
  questionType: QuestionType;
  pkm_global: number | null;
  pkm_accuracy: number | null;
  engagement_level: number | null;
  question_quality: "low" | "medium" | "high" | null;
  intervention_needed: boolean;
  recommendation_for_teacher: string | null;
  // MOAT signals (deterministic, no AI call)
  cognitive_depth: 'surface' | 'procedural' | 'deep';
  prerequisite_gap_depth: number | null;  // 0 = on-level, -2 = 2 levels below
  resilience_score: number | null;        // computed by session aggregator (per-exchange = null)
  curriculum_ref: string | null;          // standards reference (CCSS, BAC, etc.)
  is_off_curriculum: boolean;             // student exploring beyond syllabus
}

// ─── Skill Catalog (exported for useGamification) ─────────────────────────────

/** All skills RAYA can track. Key → display label. */
export const SKILL_CATALOG: Record<string, string> = {
  // STEM
  algebra:       "Algebra",
  geometry:      "Geometry",
  calculus:      "Calculus",
  statistics:    "Statistics & Probability",
  physics:       "Physics",
  mechanics:     "Mechanics",
  chemistry:     "Chemistry",
  biology:       "Biology",
  cs:            "Computer Science",
  electronics:   "Electronics",
  civil_eng:     "Civil Engineering",
  // Humanities
  literature:    "Literature",
  grammar:       "Grammar & Writing",
  philosophy:    "Philosophy",
  history:       "History",
  geography:     "Geography",
  economics:     "Economics",
  law:           "Law & Civics",
  languages:     "Languages",
  arts:          "Arts",
  accounting:    "Accounting",
  // Transversal
  problem_solving:   "Problem Solving",
  critical_thinking: "Critical Thinking",
  argumentation:     "Argumentation",
};

const HUMANITIES_SKILLS = new Set([
  "literature", "grammar", "philosophy", "history",
  "geography", "economics", "law", "languages", "arts", "accounting",
]);

// ─── Mapping: AI subject names → skill keys ───────────────────────────────────

const AI_SUBJECT_TO_SKILL: Record<string, string> = {
  // Mathematics
  Algebra: "algebra", Mathematics: "algebra", Math: "algebra", Maths: "algebra",
  "Mathématiques": "algebra", Arithmétique: "algebra",
  Geometry: "geometry", Trigonometry: "geometry", Géométrie: "geometry",
  Calculus: "calculus", Analysis: "calculus", Analyse: "calculus",
  Statistics: "statistics", Probability: "statistics",
  "Statistiques": "statistics", Probabilités: "statistics",
  // Sciences
  Physics: "physics", Physique: "physics",
  Mechanics: "mechanics", "Mécanique": "mechanics",
  "Industrial Mechanics": "mechanics", "Mécanique Industrielle": "mechanics",
  "Mécanique Générale": "mechanics",
  Chemistry: "chemistry", Chimie: "chemistry",
  Biology: "biology", "Life Sciences": "biology", "Sciences de la Vie": "biology",
  SVT: "biology", Biologie: "biology",
  // Technology
  "Computer Science": "cs", Programming: "cs", Coding: "cs",
  Informatique: "cs", Algorithmique: "cs",
  Electronics: "electronics", Électronique: "electronics",
  Electrical: "electronics", Électrotechnique: "electronics",
  "Civil Engineering": "civil_eng", "Génie Civil": "civil_eng", BTP: "civil_eng",
  // Humanities
  Literature: "literature", Littérature: "literature", Reading: "literature",
  Grammar: "grammar", Writing: "grammar", Français: "grammar",
  French: "grammar", English: "grammar", Grammaire: "grammar",
  Philosophy: "philosophy", Ethics: "philosophy", Philosophie: "philosophy",
  History: "history", Histoire: "history",
  Geography: "geography", Géographie: "geography",
  Economics: "economics", "Économie": "economics", Economy: "economics",
  Law: "law", Droit: "law", Civics: "law", "Sciences Juridiques": "law",
  Spanish: "languages", German: "languages", Arabic: "languages",
  Chinese: "languages", Espagnol: "languages", Allemand: "languages",
  Arabe: "languages",
  Arts: "arts", Music: "arts", "Arts Plastiques": "arts",
  Accounting: "accounting", Comptabilité: "accounting",
};

// ─── Mapping: concept_id prefix → skill key ───────────────────────────────────
// concept_id format from RAYA: "SUBJ-TOPIC-CODE"

const CONCEPT_PREFIX_TO_SKILL: Record<string, string> = {
  MATH: "algebra",  ALG: "algebra",
  GEOM: "geometry", TRIG: "geometry",
  CALC: "calculus", ANAL: "calculus",
  STAT: "statistics", PROB: "statistics",
  PHYS: "physics",
  MECA: "mechanics", MECH: "mechanics",
  CHEM: "chemistry", CHIM: "chemistry",
  BIO: "biology", SVT: "biology",
  CS: "cs", INFO: "cs", PROG: "cs", CODE: "cs", ALGO: "cs",
  ELEC: "electronics", ELECRO: "electronics", ELECTRO: "electronics",
  CIVIL: "civil_eng", GC: "civil_eng", BTP: "civil_eng",
  LIT: "literature", LITT: "literature",
  GRAM: "grammar", LANG: "grammar", FR: "grammar", EN: "grammar",
  PHIL: "philosophy", ETH: "philosophy",
  HIST: "history",
  GEO: "geography",
  ECON: "economics",
  LAW: "law", DROIT: "law",
  ARTS: "arts", ART: "arts",
  ACC: "accounting", COMPTA: "accounting",
};

// ─── Keyword patterns for user message analysis ────────────────────────────────

const SKILL_PATTERNS: { key: string; regex: RegExp }[] = [
  { key: "algebra",     regex: /algebra|algèbre|equat|polynôm|polynome|variable|factori|calcul\b/i },
  { key: "geometry",    regex: /geometry|géométri|triangle|angle|cercle|circle|pythagore/i },
  { key: "calculus",    regex: /calculus|dérivée|intégral|limite|limit|derivative/i },
  { key: "statistics",  regex: /statistic|probabilit|moyenne|variance|écart.type|distribution/i },
  { key: "physics",     regex: /physic|physique|force\b|énergi|energie|vitesse|accélér|accel|newton|lumière|optic/i },
  { key: "mechanics",   regex: /mécaniq|mechanic|poutre|engrenage|couple|torsion|résistance.des.matériaux|rdm|statique/i },
  { key: "chemistry",   regex: /chimi|chemistry|molécul|réaction|acide|base|ion|oxyd/i },
  { key: "biology",     regex: /biologi|svt|cellule|cell|génétiq|adn|dna|organisme|écosyst/i },
  { key: "cs",          regex: /programm|algorithm|code|fonction|boucle|variable|python|javascript|sql|réseau|network/i },
  { key: "electronics", regex: /électron|electronic|circuit|transistor|résistance\b|condensateur|tension|courant|ampère/i },
  { key: "civil_eng",   regex: /génie.civil|btp|béton|structure|fondation|architecture\b|construction/i },
  { key: "literature",  regex: /littératur|literature|roman|poésie|poetry|auteur|oeuvre|analyse.littér/i },
  { key: "grammar",     regex: /grammar|grammaire|conjugu|verbe|spelling|orthograph|syntax|subjonctif|accord/i },
  { key: "philosophy",  regex: /philosoph|éthique|ethics|morale|conscience|liberté|raison|descartes|platon/i },
  { key: "history",     regex: /histoir|history|guerre|révolution|empire|siècle|période|civilisation/i },
  { key: "geography",   regex: /géographi|geography|continent|pays|région|climate|carte|territoire/i },
  { key: "economics",   regex: /économi|economics|marché|market|pib|gdp|inflation|monnaie|offrande|demande/i },
  { key: "law",         regex: /droit|law|juridiq|contrat|loi\b|tribunal|constitution|article\b.*loi/i },
  { key: "accounting",  regex: /comptabil|accounting|bilan|compte|débit|crédit|tva|fiscalit/i },
];

// ─── Step 1: Analyse user message ─────────────────────────────────────────────

export function analyzeUserMessage(text: string): MessageAnalysis {
  let subject: string | null = null;
  for (const p of SKILL_PATTERNS) {
    if (p.regex.test(text)) { subject = p.key; break; }
  }

  let questionType: QuestionType = "other";
  if (/correct|fix|mistake|error|wrong|check my|review my|faute|corriger/i.test(text)) {
    questionType = "correction";
  } else if (/solve|calculate|compute|find|prove|demonstrate|résoudre|calculer|trouver/i.test(text)) {
    questionType = "exercise";
  } else if (/explain|what is|what are|how does|why|define|describe|expliquer|qu'est|comment|pourquoi/i.test(text)) {
    questionType = "conceptual";
  }

  const words = text.trim().split(/\s+/).length;
  const complexityScore = Math.min(1, words / 40);

  return { subject, questionType, complexityScore };
}

// ─── MOAT Signal Detectors (pure, deterministic, no AI) ───────────────────────

/**
 * Classify the cognitive depth of a student's question.
 * - surface: recall / "what is X?" / "give me the formula"
 * - procedural: "how to solve", "steps to", "calculate"
 * - deep: "why", "how come", reasoning about underlying logic
 */
export function detectCognitiveDepth(text: string): 'surface' | 'procedural' | 'deep' {
  // Deep: reasoning, causality, logic-seeking
  if (/pourquoi|why|how come|logique|reasoning|explain\s*(why|how)|comment\s*(se fait|fonctionne|est[- ]ce possible|ça marche)|what.*underlying|but why|raison/i.test(text)) {
    return 'deep';
  }
  // Procedural: step-by-step, solving, computation
  if (/how (to|do|can)|solve|calculer|étapes|steps|résoudre|compute|trouver|démontrer|prove|find the|méthode|procedure/i.test(text)) {
    return 'procedural';
  }
  // Surface: recall, definitions, formulas
  return 'surface';
}

/**
 * Detect if a student's question is off-curriculum (curiosity-driven).
 * Checks for topics that are typically beyond standard K-12 syllabi.
 */
export function detectOffCurriculum(text: string): boolean {
  return /\b(intelligence artificielle|artificial intelligence|machine learning|blockchain|quantum|crypto|entrepreneurship|startup|space\s*x|nasa|black hole|trou noir|dark matter|matière noire|stock market|bourse|trading|app development|game design|ethical hacking|cybersecurity|neuroscience|astrophysique|robotics|3d print|réalité virtuelle|virtual reality|data science)\b/i.test(text);
}

/**
 * Parse a prerequisite_gap_level string into a numeric depth.
 * e.g. "4ème" when student is in "Terminale" → -8 levels gap.
 * Returns null if no gap detected, 0 if on-level, negative for gap depth.
 */
export function parseGapDepth(gapLevel: string | undefined, currentLevel?: string): number | null {
  if (!gapLevel) return null;
  // Simple ordinal mapping for French system (extendable for US/UK)
  const frenchLevels: Record<string, number> = {
    'cp': 1, 'ce1': 2, 'ce2': 3, 'cm1': 4, 'cm2': 5,
    '6ème': 6, '6eme': 6, '5ème': 7, '5eme': 7,
    '4ème': 8, '4eme': 8, '3ème': 9, '3eme': 9,
    '2nde': 10, 'seconde': 10, '1ère': 11, 'premiere': 11,
    'terminale': 12, 'tle': 12,
  };
  const gapNum = frenchLevels[gapLevel.toLowerCase().trim()];
  const currentNum = currentLevel ? frenchLevels[currentLevel.toLowerCase().trim()] : null;
  if (gapNum == null) return null;
  if (currentNum == null) return -1;  // gap detected but can't measure depth
  return gapNum - currentNum;  // negative = gap is below current level
}

// ─── Step 2: Evaluate full exchange ───────────────────────────────────────────

export function evaluateExchange(
  insight: RayaInsight | null,
  analysis: MessageAnalysis,
  turnCount: number
): ExchangeResult {
  const events: MissionEvent[] = [];

  // ── Schema detection ──
  const raw = insight as any;
  const v3   = raw?.exchange_type != null ? raw as V3Insight : null;
  const legacy = !v3 && raw?.academic?.pkm ? raw as Record<string, any> : null;
  const light = !v3 ? raw?.academic_data as Record<string, unknown> | null | undefined : undefined;

  const hasAcademicSignal = analysis.subject !== null || analysis.questionType !== "other";

  // ── Social/academic detection ──
  const isExplicitlySocial =
    // RAYA explicitly said social
    (v3 !== null && v3?.exchange_type === "social") ||
    // RAYA said discussion/explanation but pkm_delta=0 AND user message had no academic signal
    // → RAYA made an error classifying a casual message as academic
    (v3 !== null &&
      (v3.exchange_type === "discussion" || v3.exchange_type === "explanation") &&
      v3.pkm_delta === 0 &&
      !hasAcademicSignal) ||
    // Light schema with no academic data
    (insight !== null && !v3 && light === null);

  const isSocial   = isExplicitlySocial || (!insight && !hasAcademicSignal);
  const isAcademic = !isSocial;

  // ── Always fire engagement event (message_sent missions) ──
  events.push({ type: "message_sent" });

  // ── Primary skill detection ────────────────────────────────────────────────
  let primarySkill: string | null = null;

  if (isAcademic) {
    if (v3?.concept_id) {
      // Parse concept_id prefix: "MECA-STAT-BEAM" → "MECA" → "mechanics"
      const prefix = v3.concept_id.split("-")[0].toUpperCase();
      primarySkill =
        CONCEPT_PREFIX_TO_SKILL[prefix] ??
        SKILL_PATTERNS.find((p) => p.regex.test(v3.concept_id))?.key ??
        analysis.subject;
    } else if (legacy?.academic?.subject_area) {
      primarySkill = AI_SUBJECT_TO_SKILL[String(legacy.academic.subject_area)] ?? analysis.subject;
    } else if (light?.conceptid) {
      const prefix = String(light.conceptid).split("-")[0].toUpperCase();
      primarySkill =
        CONCEPT_PREFIX_TO_SKILL[prefix] ??
        SKILL_PATTERNS.find((p) => p.regex.test(String(light.conceptid)))?.key ??
        analysis.subject;
    } else {
      primarySkill = analysis.subject;
    }
  }

  if (isAcademic && primarySkill) events.push({ type: "subject_practiced", subject: primarySkill });
  if (analysis.questionType === "correction") events.push({ type: "correction_requested" });
  if (isAcademic && turnCount >= 2) events.push({ type: "exchange_completed" });

  // ── XP and skill deltas ────────────────────────────────────────────────────
  let xpEarned = 0;
  let primaryDelta = 0;
  const skillProgress: SkillProgress[] = [];
  let qualityLabel: ExchangeResult["qualityLabel"] = "Keep practicing";

  if (isAcademic) {
    if (v3) {
      const t = v3.exchange_type;
      const verdict = v3.student_verdict;
      const hasMentalWork = v3.pkm_delta > 0;

      if (t === "test") {
        if (verdict === "correct")       { xpEarned = 25; primaryDelta = 12; qualityLabel = "Excellent"; }
        else if (verdict === "partial")  { xpEarned = 15; primaryDelta = 6;  qualityLabel = "Good"; }
        else                             { xpEarned = 3;  primaryDelta = 1; }
      } else if (t === "exercise") {
        if (verdict === "correct")       { xpEarned = 20; primaryDelta = 10; qualityLabel = "Excellent"; }
        else if (verdict === "partial")  { xpEarned = 10; primaryDelta = 4;  qualityLabel = "Good"; }
        else                             { xpEarned = 3;  primaryDelta = 1; }
      } else if (t === "discussion") {
        xpEarned = hasMentalWork ? 3 : 1;
        primaryDelta = hasMentalWork ? 2 : 0;
      } else if (t === "explanation") {
        xpEarned = 1;
        primaryDelta = 0;
      }

      // pkm_delta bonus on skill delta
      if (v3.pkm_delta > 0) {
        primaryDelta = Math.max(primaryDelta, Math.ceil(v3.pkm_delta * 12));
      }

      // ── Transversal skills ──
      if (t === "exercise" && verdict === "correct") {
        skillProgress.push({ key: "problem_solving", delta: 5 });
      }
      if (t === "discussion" && hasMentalWork) {
        skillProgress.push({ key: "critical_thinking", delta: 3 });
      }
      if (t === "discussion" && hasMentalWork && primarySkill && HUMANITIES_SKILLS.has(primarySkill)) {
        skillProgress.push({ key: "argumentation", delta: 4 });
      }

    } else if (legacy?.academic?.pkm) {
      const pkm = legacy.academic.pkm;
      const g = Math.max(0, Math.min(1, pkm.global ?? 0));
      const a = Math.max(0, Math.min(1, pkm.accuracy ?? 0));
      if (g >= 0.85)      { xpEarned = 25; primaryDelta = 12; qualityLabel = "Excellent"; }
      else if (a >= 0.7)  { xpEarned = 15; primaryDelta = 6;  qualityLabel = "Good"; }
      else                { xpEarned = 3;  primaryDelta = 2; }
      const persist = Math.max(0, Math.min(1, Number(legacy?.pedagogical?.engagement?.persistence ?? 0)));
      if (persist >= 0.8) xpEarned = Math.min(xpEarned + 5, 25);

    } else if (light?.pkm_mastery != null) {
      const pkm = Math.max(0, Math.min(1, Number(light.pkm_mastery)));
      if (pkm >= 0.85)     { xpEarned = 25; primaryDelta = 12; qualityLabel = "Excellent"; }
      else if (pkm >= 0.7) { xpEarned = 15; primaryDelta = 6;  qualityLabel = "Good"; }
      else                 { xpEarned = 3;  primaryDelta = 2; }

    } else {
      // No AI insight — estimate from message analysis alone (minimal XP)
      if (analysis.questionType === "exercise")       { xpEarned = 10; primaryDelta = 4; qualityLabel = "Good"; }
      else if (analysis.questionType === "correction") { xpEarned = 5;  primaryDelta = 3; }
      else if (analysis.questionType === "conceptual") { xpEarned = 3;  primaryDelta = 2; }
      else                                             { xpEarned = 1;  primaryDelta = 0; }
    }
  }

  // Build primary skill progress
  if (primarySkill && primaryDelta > 0) {
    skillProgress.unshift({ key: primarySkill, delta: primaryDelta });
  }

  // ── Analytics point ──
  const pkmFromLight = light?.pkm_mastery != null ? Number(light.pkm_mastery) : null;
  const analyticsPoint: AnalyticsPoint = {
    timestamp: Date.now(),
    subject: primarySkill,
    questionType: analysis.questionType,
    pkm_global:
      legacy?.academic?.pkm?.global != null
        ? Math.max(0, Math.min(1, Number(legacy.academic.pkm.global)))
        : v3 != null ? Math.max(0, Math.min(1, v3.pkm_delta)) : pkmFromLight,
    pkm_accuracy: legacy?.academic?.pkm?.accuracy != null
      ? Math.max(0, Math.min(1, Number(legacy.academic.pkm.accuracy))) : null,
    engagement_level:
      v3?.engagement != null
        ? Math.max(0, Math.min(1, v3.engagement))
        : (legacy?.pedagogical?.engagement?.level ?? null),
    question_quality:           legacy?.pedagogical?.engagement?.question_quality  ?? null,
    intervention_needed:        legacy?.recommendations?.intervention_needed       ?? false,
    recommendation_for_teacher:
      v3?.teacher_note != null
        ? v3.teacher_note
        : (legacy?.recommendations?.for_teacher ?? null),
    // MOAT signals
    cognitive_depth: isAcademic ? (v3?.cognitive_depth ?? detectCognitiveDepth(analysis.questionType === 'other' ? '' : analysis.questionType)) : 'surface',
    prerequisite_gap_depth: v3?.prerequisite_gap_level ? parseGapDepth(v3.prerequisite_gap_level) : null,
    resilience_score: null,  // computed by session-aggregator across multiple exchanges
    curriculum_ref: v3?.curriculum_ref ?? null,
    is_off_curriculum: false,  // set by caller who has access to the raw user message
  };

  // Extract mission_grade if RAYA graded a mission response
  let missionGrade: MissionGrade | undefined;
  if (v3?.mission_grade) {
    const mg = v3.mission_grade;
    const max = (mg.max === 10 || mg.max === 20) ? mg.max : 10;
    missionGrade = {
      score: Math.max(0, Math.min(max, Math.round(mg.score))),
      max,
      feedback: String(mg.feedback ?? ""),
    };
  }

  return {
    xpEarned,
    skillProgress,
    missionEvents: events,
    qualityLabel,
    isAcademic,
    analyticsPoint,
    missionGrade,
    // backwards compat
    skillKey: primarySkill,
    skillDelta: primaryDelta,
  };
}

// ─── v3.0 insight schema (internal) ───────────────────────────────────────────
interface V3Insight {
  exchange_type: "test" | "exercise" | "discussion" | "explanation" | "social";
  student_verdict: "correct" | "partial" | "incorrect" | "not_applicable";
  difficulty: "easy" | "medium" | "hard";
  concept_id: string;
  pkm_delta: number;
  // School-reporting fields (optional — present for academic exchanges)
  subject_area?: string;
  curriculum?: { country?: string; grade?: string; exam?: string };
  errors?: string[];
  misconceptions?: string[];
  teacher_note?: string;
  engagement?: number;
  mission_grade?: { score: number; max: number; feedback: string };
  // MOAT signals (optional — populated when RAYA detects them)
  prerequisite_gap_level?: string;
  cognitive_depth?: 'surface' | 'procedural' | 'deep';
  curriculum_ref?: string;
}
