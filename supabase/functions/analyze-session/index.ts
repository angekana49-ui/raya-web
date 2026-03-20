/**
 * analyze-session — Hybrid Edge Function (v2)
 *
 * BEFORE (v1): Read entire conversation → send to Gemini → generate insight
 *   → ~4000-8000 tokens/session, non-deterministic scores
 *
 * NOW (v2): Accept SessionSummary from client (deterministic) → Gemini only
 *   writes 2 sentences for the teacher → ~500 tokens/session (90% reduction)
 *
 * BACKWARD COMPAT: If no session_summary is provided, falls back to v1 flow.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionSummaryInput {
  class_year_id: string
  school_id: string
  subject: string | null
  exchange_count: number
  correct_ratio: number
  avg_cognitive_depth: number
  avg_resilience: number
  deepest_gap_level: number | null
  mastery_score: number
  off_curriculum_ratio: number
  concepts_covered: string[]
  curriculum_refs: string[]
  session_hour: number
  session_duration_min: number
  teacher_recommendation: string | null
  critical_gap: string | null
  engine_version: string
}

interface InsightPayload {
  subject: string
  chapter: string | null
  difficulty_level: 'beginner' | 'intermediate' | 'advanced'
  mastery_score: number
  critical_gap: string | null
  concepts_acquired: string[]
  recommended_action: string
  student_effort_level: 'Élevé' | 'Moyen' | 'Faible'
  sample_size: number
}

// ─── CORS headers ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: CORS })
    }

    const body = await req.json()
    const { conversation_id, session_summary } = body

    // Init Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // V2 PATH: SessionSummary provided by client (deterministic + cheap)
    // ═══════════════════════════════════════════════════════════════════════

    if (session_summary) {
      const ss = session_summary as SessionSummaryInput

      if (!ss.class_year_id || !ss.school_id) {
        return new Response(
          JSON.stringify({ error: 'class_year_id and school_id required in session_summary' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } }
        )
      }

      // Use Gemini ONLY for qualitative fields (if not already provided by client)
      let teacherRec = ss.teacher_recommendation
      let criticalGap = ss.critical_gap

      if (!teacherRec && ss.exchange_count >= 3) {
        // Minimal Gemini call — just 2 sentences, ~500 tokens max
        const qualResult = await generateQualitativeInsight(ss)
        teacherRec = qualResult.recommendation
        criticalGap = qualResult.gap ?? criticalGap
      }

      // Map to insight row format
      const effortLevel = ss.avg_cognitive_depth >= 0.7 ? 'Élevé'
        : ss.avg_cognitive_depth >= 0.35 ? 'Moyen' : 'Faible'

      const difficultyLevel = ss.mastery_score >= 0.75 ? 'advanced'
        : ss.mastery_score >= 0.5 ? 'intermediate' : 'beginner'

      const { data: insertedInsight, error: insertError } = await supabase
        .from('insights')
        .insert({
          class_year_id: ss.class_year_id,
          school_id: ss.school_id,
          subject: ss.subject || 'General',
          chapter: null,
          difficulty_level: difficultyLevel,
          mastery_score: Math.round(ss.mastery_score * 100) / 100,
          critical_gap: criticalGap,
          concepts_acquired: ss.concepts_covered,
          recommended_action: teacherRec || 'No specific recommendation for this session.',
          student_effort_level: effortLevel,
          sample_size: 1,
          period: 'daily',
          // V2 fields
          engine_version: 'v2',
          avg_cognitive_depth: ss.avg_cognitive_depth,
          avg_resilience: ss.avg_resilience,
          deepest_gap_level: ss.deepest_gap_level,
          off_curriculum_ratio: ss.off_curriculum_ratio,
          curriculum_refs: ss.curriculum_refs,
          session_hour: ss.session_hour,
          session_duration_min: ss.session_duration_min,
          exchange_count: ss.exchange_count,
          correct_ratio: ss.correct_ratio,
        })
        .select()
        .single()

      if (insertError) {
        // If v2 columns don't exist yet, retry with v1 columns only
        if (insertError.message?.includes('column')) {
          console.warn('V2 columns not yet migrated, falling back to v1 insert')
          const { data: fallbackInsight, error: fallbackError } = await supabase
            .from('insights')
            .insert({
              class_year_id: ss.class_year_id,
              school_id: ss.school_id,
              subject: ss.subject || 'General',
              chapter: null,
              difficulty_level: difficultyLevel,
              mastery_score: Math.round(ss.mastery_score * 100) / 100,
              critical_gap: criticalGap,
              concepts_acquired: ss.concepts_covered,
              recommended_action: teacherRec || 'No specific recommendation for this session.',
              student_effort_level: effortLevel,
              sample_size: 1,
              period: 'daily',
            })
            .select()
            .single()

          if (fallbackError) throw new Error(`DB insert error: ${fallbackError.message}`)

          return new Response(
            JSON.stringify({ success: true, insight: fallbackInsight, engine: 'v2-compat' }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
          )
        }
        throw new Error(`DB insert error: ${insertError.message}`)
      }

      console.log(`[v2] Insight generated for session (${ss.exchange_count} exchanges, ${ss.subject})`)

      return new Response(
        JSON.stringify({ success: true, insight: insertedInsight, engine: 'v2' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
      )
    }

    // ═══════════════════════════════════════════════════════════════════════
    // V1 PATH (legacy): Full conversation → Gemini analysis
    // Kept for backward compatibility — will be removed once all clients
    // send session_summary
    // ═══════════════════════════════════════════════════════════════════════

    if (!conversation_id) {
      return new Response(
        JSON.stringify({ error: 'conversation_id or session_summary required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select(`
        id,
        title,
        context_type,
        messages (
          id,
          sender,
          text,
          timestamp
        ),
        users!inner (
          id,
          class_year_id,
          school_id
        )
      `)
      .eq('id', conversation_id)
      .single()

    if (fetchError || !conversation) {
      return new Response(
        JSON.stringify({ error: 'Conversation not found', details: fetchError }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!conversation.users.class_year_id) {
      console.log('Skipping insight: user not enrolled in school')
      return new Response(
        JSON.stringify({ success: false, message: 'User not enrolled, no insight generated' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const conversationText = conversation.messages
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((m: any) => `${m.sender === 'user' ? 'Élève' : 'RAYA'}: ${m.text}`)
      .join('\n')

    const prompt = `Tu es un système d'analyse pédagogique pour enseignants.

CONVERSATION ÉLÈVE-IA:
${conversationText}

CONTEXTE:
- Titre: ${conversation.title}
- Type: ${conversation.context_type}

TÂCHE:
Analyse cette conversation et génère un insight pédagogique ANONYME au format JSON STRICT suivant:

{
  "subject": "Matière principale (Mathématiques, Physique, Chimie, Biologie, Histoire, Géographie, Philosophie, Langues, Informatique, ou General si hors-sujet)",
  "chapter": "Chapitre/thème spécifique abordé (ou null si non identifiable)",
  "difficulty_level": "beginner|intermediate|advanced",
  "mastery_score": 0.75,
  "critical_gap": "Difficulté principale détectée par l'élève (ou null si aucune)",
  "concepts_acquired": ["Concept1", "Concept2", "Concept3"],
  "recommended_action": "Action concrète pour l'enseignant (max 200 caractères)",
  "student_effort_level": "Élevé|Moyen|Faible",
  "sample_size": 1
}

RÈGLES CRITIQUES:
1. mastery_score entre 0.00 et 1.00 (précision 2 décimales)
2. AUCUNE information identifiante sur l'élève
3. Si conversation générale/hors-sujet → subject: "General", chapter: null
4. critical_gap uniquement si vraie difficulté pédagogique détectée
5. concepts_acquired: liste des notions que l'élève semble avoir comprises
6. recommended_action: conseil actionnable pour l'enseignant
7. student_effort_level basé sur qualité/profondeur des questions
8. RETOURNER UNIQUEMENT LE JSON, PAS DE TEXTE AUTOUR

Génère le JSON maintenant:`

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 1024,
          }
        })
      }
    )

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text()
      throw new Error(`Gemini API error: ${errorData}`)
    }

    const geminiData = await geminiResponse.json()

    if (!geminiData.candidates || geminiData.candidates.length === 0) {
      throw new Error('No response from Gemini')
    }

    const insightRaw = geminiData.candidates[0].content.parts[0].text

    let cleanJson = insightRaw.trim()
    cleanJson = cleanJson.replace(/```json\n?/g, '')
    cleanJson = cleanJson.replace(/```\n?/g, '')
    cleanJson = cleanJson.trim()

    const insight: InsightPayload = JSON.parse(cleanJson)

    if (insight.mastery_score < 0 || insight.mastery_score > 1) {
      insight.mastery_score = Math.max(0, Math.min(1, insight.mastery_score))
    }

    const { data: insertedInsight, error: insertError } = await supabase
      .from('insights')
      .insert({
        class_year_id: conversation.users.class_year_id,
        school_id: conversation.users.school_id,
        subject: insight.subject,
        chapter: insight.chapter,
        difficulty_level: insight.difficulty_level,
        mastery_score: Math.round(insight.mastery_score * 100) / 100,
        critical_gap: insight.critical_gap,
        concepts_acquired: insight.concepts_acquired,
        recommended_action: insight.recommended_action,
        student_effort_level: insight.student_effort_level,
        sample_size: insight.sample_size,
        period: 'daily'
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`Database insert error: ${insertError.message}`)
    }

    console.log(`[v1-legacy] Insight generated for conversation ${conversation_id}`)

    return new Response(
      JSON.stringify({ success: true, insight: insertedInsight, conversation_id, engine: 'v1' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } }
    )

  } catch (error) {
    console.error('Error in analyze-session:', error)
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  }
})

// ─── Qualitative Gemini call (minimal, ~500 tokens) ───────────────────────────

async function generateQualitativeInsight(ss: SessionSummaryInput): Promise<{
  recommendation: string | null
  gap: string | null
}> {
  try {
    const prompt = `You are a pedagogical advisor. Based on these AGGREGATED CLASS-LEVEL analytics (not individual student data), write:

1. One actionable recommendation for the teacher (max 200 chars)
2. The most critical learning gap detected (max 150 chars, or null)

Subject: ${ss.subject || 'General'}
Mastery score: ${ss.mastery_score}
Cognitive depth: ${ss.avg_cognitive_depth.toFixed(2)} (0=surface, 1=deep)
Resilience: ${ss.avg_resilience.toFixed(2)} (0=gives up, 1=persists)
Prerequisite gap: ${ss.deepest_gap_level ?? 'none'} levels below
Off-curriculum curiosity: ${(ss.off_curriculum_ratio * 100).toFixed(0)}%
Concepts: ${ss.concepts_covered.slice(0, 5).join(', ') || 'none'}

Reply in this exact JSON format ONLY:
{"recommendation": "...", "gap": "..." or null}
`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 256 }
        })
      }
    )

    if (!res.ok) return { recommendation: null, gap: null }

    const data = await res.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    let clean = raw.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)

    return {
      recommendation: parsed.recommendation || null,
      gap: parsed.gap || null,
    }
  } catch (e) {
    console.warn('Qualitative insight generation failed (non-fatal):', e)
    return { recommendation: null, gap: null }
  }
}
