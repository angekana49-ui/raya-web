import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

Deno.serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        }
      })
    }

    const { conversation_id } = await req.json()

    if (!conversation_id) {
      return new Response(
        JSON.stringify({ error: 'conversation_id required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Init Supabase client avec service role (bypass RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Récupérer conversation + messages + user info
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

    // Vérifier que l'élève a un class_year_id (inscrit dans école)
    if (!conversation.users.class_year_id) {
      console.log('Skipping insight: user not enrolled in school')
      return new Response(
        JSON.stringify({
          success: false,
          message: 'User not enrolled, no insight generated'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Préparer texte conversation pour Gemini
    const conversationText = conversation.messages
      .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((m: any) => `${m.sender === 'user' ? 'Élève' : 'RAYA'}: ${m.text}`)
      .join('\n')

    // Prompt pour Gemini
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

    // Appel API Gemini 2.0 Flash
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
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

    // Parser JSON (gérer cas où Gemini ajoute ```json ou du texte)
    let cleanJson = insightRaw.trim()
    cleanJson = cleanJson.replace(/```json\n?/g, '')
    cleanJson = cleanJson.replace(/```\n?/g, '')
    cleanJson = cleanJson.trim()

    const insight: InsightPayload = JSON.parse(cleanJson)

    // Validation basique
    if (insight.mastery_score < 0 || insight.mastery_score > 1) {
      insight.mastery_score = Math.max(0, Math.min(1, insight.mastery_score))
    }

    // Insérer insight dans DB
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

    console.log(`Insight generated for conversation ${conversation_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        insight: insertedInsight,
        conversation_id: conversation_id
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )

  } catch (error) {
    console.error('Error in analyze-session:', error)

    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
  }
})
