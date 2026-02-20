/**
 * RAYA v2.0 — Chat Service (Simplifié)
 *
 * L'IA gère elle-même:
 * - Détection de langue
 * - Adaptation curriculaire
 * - Contexte culturel
 *
 * Le code gère:
 * - Communication avec l'API
 * - Historique de conversation
 * - Progression (XP, badges, streaks)
 * - Validation d'images
 * - Parsing des insights JSON
 */

import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type UserTier = 'free' | 'premium';
export type TurnType = 'DIAGNOSTIC' | 'TEACHING' | 'VALIDATION' | 'EXAM_DIRECT' | 'CHAT';
export type ResponseQuality = 'correct' | 'partial' | 'incorrect' | 'no_attempt' | null;
export type Confidence = 'high' | 'medium' | 'low';

export interface UserContext {
  id: string;
  tier: UserTier;
  name?: string;
}

export interface StudentProfile {
  userId: string;
  name?: string;
  streakDays: number;
  lastSessionDate?: Date;
  totalXP: number;
  level: number;
  badges: Badge[];
  // Historique simplifié - l'IA gère les détails dans sa mémoire contextuelle
  sessionsCount: number;
  conceptsExplored: string[];
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  unlockedAt: Date;
  description: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  hasImage?: boolean;
}

export interface RayaResponse {
  text: string;
  insight: TurnInsight | null;
  awaitingValidation?: boolean;
  xpEarned?: number;
  badgeUnlocked?: Badge | null;
  levelUp?: boolean;
  newLevel?: number;
}

export interface TurnInsight {
  turn: {
    type: TurnType;
    conceptId?: string;
    conceptName?: string;
  };
  student: {
    produced: boolean;
    responseQuality: ResponseQuality;
    effortShown: boolean;
  };
  pkm: {
    countable: boolean;
    delta: number;
    runningScore: number;
    confidence: Confidence;
  };
  pedagogy: {
    misconceptionsDetected: string[];
    prerequisitesMissing: string[];
    nextAction: string;
  };
  context?: {
    country?: string;
    system?: string;
    grade?: string;
    language?: string;
  };
  engagement: {
    sessionTurns: number;
    xpEarned: number;
  };
}

export interface ImageValidationState {
  imageBase64: string;
  awaitingValidation: boolean;
  originalMessage: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESSION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

const XP_PER_LEVEL = 500;

const BADGE_DEFINITIONS: Record<string, Omit<Badge, 'unlockedAt'>> = {
  streak_3: { id: 'streak_3', name: 'Flamme Naissante', emoji: '🔥', description: 'Série de 3 jours' },
  streak_7: { id: 'streak_7', name: 'Flamme Ardente', emoji: '🔥🔥', description: 'Série de 7 jours' },
  streak_30: { id: 'streak_30', name: 'Flamme Éternelle', emoji: '🔥🔥🔥', description: 'Série de 30 jours' },
  first_session: { id: 'first_session', name: 'Premier Pas', emoji: '👣', description: 'Première session complétée' },
  explorer_10: { id: 'explorer_10', name: 'Explorateur', emoji: '🧭', description: '10 concepts explorés' },
  perseverant: { id: 'perseverant', name: 'Persévérant', emoji: '💪', description: 'Continuer malgré les difficultés' },
  sniper: { id: 'sniper', name: 'Sniper', emoji: '🎯', description: 'Série de réponses correctes' },
};

function calculateLevel(totalXP: number): number {
  return Math.floor(totalXP / XP_PER_LEVEL) + 1;
}

function calculateXPFromInsight(insight: TurnInsight | null): number {
  if (!insight || !insight.pkm.countable) return 0;

  const baseXP = insight.engagement.xpEarned || 0;
  if (baseXP > 0) return baseXP;

  // Fallback calculation
  switch (insight.student.responseQuality) {
    case 'correct': return insight.turn.type === 'VALIDATION' ? 25 : 20;
    case 'partial': return 10;
    default: return 5; // XP d'effort
  }
}

function checkBadgeUnlock(profile: StudentProfile): Badge | null {
  const existingIds = new Set(profile.badges.map(b => b.id));

  // First session
  if (profile.sessionsCount === 1 && !existingIds.has('first_session')) {
    return { ...BADGE_DEFINITIONS.first_session, unlockedAt: new Date() };
  }

  // Streak badges
  if (profile.streakDays >= 30 && !existingIds.has('streak_30')) {
    return { ...BADGE_DEFINITIONS.streak_30, unlockedAt: new Date() };
  }
  if (profile.streakDays >= 7 && !existingIds.has('streak_7')) {
    return { ...BADGE_DEFINITIONS.streak_7, unlockedAt: new Date() };
  }
  if (profile.streakDays >= 3 && !existingIds.has('streak_3')) {
    return { ...BADGE_DEFINITIONS.streak_3, unlockedAt: new Date() };
  }

  // Explorer
  if (profile.conceptsExplored.length >= 10 && !existingIds.has('explorer_10')) {
    return { ...BADGE_DEFINITIONS.explorer_10, unlockedAt: new Date() };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(userContext: UserContext, profile: StudentProfile | null): string {
  // Charger le prompt de base
  let prompt: string;
  try {
    const promptPath = join(__dirname, '../../prompts/RAYA_v2.0_SYSTEM_PROMPT.md');
    prompt = readFileSync(promptPath, 'utf-8');
  } catch {
    // Fallback minimal si fichier non trouvé
    prompt = getFallbackPrompt();
  }

  // Ajouter le contexte élève si disponible
  if (profile) {
    prompt += `

## MÉMOIRE ÉLÈVE (Données du système)
- Série actuelle: ${profile.streakDays} jour(s) 🔥
- Niveau: ${profile.level}
- XP Total: ${profile.totalXP}
- Sessions: ${profile.sessionsCount}
${profile.name ? `- Prénom: ${profile.name}` : ''}
${profile.conceptsExplored.length > 0 ? `- Concepts déjà explorés: ${profile.conceptsExplored.slice(-10).join(', ')}` : ''}

Utilise ces informations pour personnaliser tes réponses (rappeler la série, féliciter les progrès, etc.)
`;
  }

  // Ajouter les restrictions selon le tier
  if (userContext.tier === 'free') {
    prompt += `

## RESTRICTIONS (Compte Gratuit)
- Mode EXAM désactivé
- Si l'élève dit "urgent", "exam", "demain":
  → "Le mode réponse rapide est réservé aux comptes Premium. Mais on va quand même avancer efficacement!"
  → Continue avec PROVE-FIRST normal
`;
  } else {
    prompt += `

## COMPTE PREMIUM
- Mode EXAM disponible si mots-clés urgence détectés
- Réponses directes autorisées MAIS toujours 1 validation à la fin
`;
  }

  return prompt;
}

function getFallbackPrompt(): string {
  return `# RAYA v2.0 — Coach Scolaire IA

## IDENTITÉ
Tu es RAYA, coach scolaire exigeant mais bienveillant.

## RÈGLES ABSOLUES
1. PROVE-FIRST: Toujours tester avant d'expliquer
2. Jamais de réponse directe sans validation ensuite
3. Adapter langue et contexte au pays de l'élève
4. Le PKM ne compte QUE ce que l'élève PRODUIT

## PERSONNALITÉ
- Exigeant mais encourageant
- Taquin: "Bien essayé!"
- Loyal: "On fait ça ensemble"

## PREMIÈRE INTERACTION
Si tu ne connais pas le contexte, demande:
- Pays
- Classe/Niveau

## ADAPTATION
Tu gères toi-même l'adaptation:
- Langue de réponse = langue du curriculum
- Exemples avec noms/monnaie locaux
- Format selon l'examen du pays

## FORMAT JSON
Termine chaque échange pédagogique par:
\`\`\`json
{
  "turn": {"type": "DIAGNOSTIC|TEACHING|VALIDATION|EXAM_DIRECT|CHAT", "conceptName": "..."},
  "student": {"produced": true/false, "responseQuality": "correct|partial|incorrect|no_attempt"},
  "pkm": {"countable": true/false, "delta": 0.0, "runningScore": 0.0, "confidence": "high|medium|low"},
  "context": {"country": "...", "grade": "...", "language": "..."},
  "engagement": {"xpEarned": 0}
}
\`\`\`
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CHAT SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class RayaChatService {
  private ai: GoogleGenAI;
  private model: string;

  // Storage (en production: remplacer par DB)
  private conversationHistory: Map<string, ChatMessage[]> = new Map();
  private imageValidationStates: Map<string, ImageValidationState> = new Map();
  private studentProfiles: Map<string, StudentProfile> = new Map();

  constructor(apiKey?: string, model: string = 'gemini-2.0-flash-lite') {
    const key = apiKey || process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY is required');
    }

    this.ai = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Point d'entrée principal - Message texte
   */
  async chat(userId: string, message: string, userContext: UserContext): Promise<RayaResponse> {
    // Vérifier si on attend une validation d'image
    const validationState = this.imageValidationStates.get(userId);
    if (validationState?.awaitingValidation) {
      return this.handleImageValidation(userId, message, userContext, validationState);
    }

    // Récupérer/créer le profil
    const profile = this.getOrCreateProfile(userId, userContext);

    // Mettre à jour le streak
    this.updateStreak(profile);

    // Construire le prompt
    const systemPrompt = buildSystemPrompt(userContext, profile);

    // Récupérer l'historique
    const history = this.conversationHistory.get(userId) || [];

    // Ajouter le message
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Appeler l'API
    const responseText = await this.callAPI(systemPrompt, history);

    // Parser la réponse
    const { text, insight } = this.parseResponse(responseText);

    // Mettre à jour l'historique
    history.push({
      role: 'model',
      content: text,
      timestamp: new Date()
    });

    // Limiter l'historique
    while (history.length > 40) history.shift();
    this.conversationHistory.set(userId, history);

    // Mettre à jour le profil
    const xpEarned = calculateXPFromInsight(insight);
    const previousLevel = profile.level;

    profile.totalXP += xpEarned;
    profile.level = calculateLevel(profile.totalXP);

    // Ajouter le concept si nouveau
    if (insight?.turn.conceptName) {
      const conceptName = insight.turn.conceptName;
      if (!profile.conceptsExplored.includes(conceptName)) {
        profile.conceptsExplored.push(conceptName);
      }
    }

    // Vérifier les badges
    const badgeUnlocked = checkBadgeUnlock(profile);
    if (badgeUnlocked) {
      profile.badges.push(badgeUnlocked);
    }

    const levelUp = profile.level > previousLevel;

    this.studentProfiles.set(userId, profile);

    return {
      text,
      insight,
      xpEarned,
      badgeUnlocked,
      levelUp,
      newLevel: levelUp ? profile.level : undefined
    };
  }

  /**
   * Message avec image
   */
  async chatWithImage(
    userId: string,
    message: string,
    imageBase64: string,
    userContext: UserContext
  ): Promise<RayaResponse> {
    // Sauvegarder l'état pour validation
    this.imageValidationStates.set(userId, {
      imageBase64,
      awaitingValidation: true,
      originalMessage: message
    });

    // Demander validation à l'IA
    const profile = this.getOrCreateProfile(userId, userContext);
    const systemPrompt = buildSystemPrompt(userContext, profile);

    const history = this.conversationHistory.get(userId) || [];

    // Message spécial pour l'image
    const imagePrompt = `
[L'élève a envoyé une image]
Message accompagnant: "${message || '(aucun message)'}"

PROTOCOLE MULTIMODAL:
1. Examine attentivement l'image
2. Transcris TOUT ce que tu vois (texte, formules, schémas)
3. Signale les parties floues ou incertaines
4. Demande confirmation à l'élève AVANT de résoudre

Format ta réponse:
"J'ai lu dans ton image: [transcription]
[Si incertitudes: "J'ai un doute sur... c'est bien ça?"]
C'est correct?"
`;

    history.push({
      role: 'user',
      content: imagePrompt,
      timestamp: new Date(),
      hasImage: true
    });

    // Appeler l'API avec l'image
    const responseText = await this.callAPIWithImage(systemPrompt, history, imageBase64);

    const { text, insight } = this.parseResponse(responseText);

    history.push({
      role: 'model',
      content: text,
      timestamp: new Date()
    });

    this.conversationHistory.set(userId, history);

    return {
      text,
      insight,
      awaitingValidation: true
    };
  }

  /**
   * Gestion de la réponse de validation d'image
   */
  private async handleImageValidation(
    userId: string,
    userResponse: string,
    userContext: UserContext,
    _state: ImageValidationState // Préfixé _ car utilisé implicitement via delete
  ): Promise<RayaResponse> {
    // Effacer l'état de validation
    this.imageValidationStates.delete(userId);

    // Déterminer si c'est une confirmation ou correction
    const isConfirmation = /^(oui|yes|ok|correct|exacte?|c'?est (bon|ça)|ouais|yep|yeah)/i.test(userResponse.trim());

    // Construire le message pour l'IA
    let followUpMessage: string;

    if (isConfirmation) {
      followUpMessage = "[L'élève confirme que la transcription est correcte]\n\nMaintenant applique le protocole PROVE-FIRST sur cet exercice.";
    } else {
      followUpMessage = `[L'élève a corrigé/précisé]: "${userResponse}"\n\nUtilise cette correction et applique le protocole PROVE-FIRST.`;
    }

    // Continuer la conversation normalement
    return this.chat(userId, followUpMessage, userContext);
  }

  /**
   * Appel API Gemini (texte seulement)
   */
  private async callAPI(systemPrompt: string, history: ChatMessage[]): Promise<string> {
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        config: {
          temperature: 0.75,
          maxOutputTokens: 2048,
          systemInstruction: [{ text: systemPrompt }]
        },
        contents
      });

      return response.text || '';
    } catch (error) {
      console.error('Gemini API error:', error);
      throw error;
    }
  }

  /**
   * Appel API Gemini avec image
   */
  private async callAPIWithImage(
    systemPrompt: string,
    history: ChatMessage[],
    imageBase64: string
  ): Promise<string> {
    // Construire les contents avec l'image pour le dernier message
    const contents = history.map((msg, index) => {
      if (index === history.length - 1 && msg.hasImage) {
        return {
          role: msg.role,
          parts: [
            { text: msg.content },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBase64
              }
            }
          ]
        };
      }
      return {
        role: msg.role,
        parts: [{ text: msg.content }]
      };
    });

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        config: {
          temperature: 0.75,
          maxOutputTokens: 2048,
          systemInstruction: [{ text: systemPrompt }]
        },
        contents
      });

      return response.text || '';
    } catch (error) {
      console.error('Gemini API error (with image):', error);
      throw error;
    }
  }

  /**
   * Parse la réponse pour extraire texte et JSON insight
   * Format v2: ---RAYA_INSIGHT---\n{...}\n---END_INSIGHT---
   * Le JSON est généré à la FIN d'un bloc pédagogique, pas à chaque message
   */
  private parseResponse(response: string): { text: string; insight: TurnInsight | null } {
    // Format principal v2: ---RAYA_INSIGHT--- ... ---END_INSIGHT---
    const insightMatch = response.match(/---RAYA_INSIGHT---\s*(\{[\s\S]*?\})\s*---END_INSIGHT---/);

    if (insightMatch) {
      try {
        const rawData = JSON.parse(insightMatch[1]);
        const insight = this.convertBlockInsight(rawData);
        const text = response.replace(/---RAYA_INSIGHT---[\s\S]*?---END_INSIGHT---/, '').trim();
        return { text, insight };
      } catch (e) {
        console.warn('Invalid RAYA_INSIGHT JSON:', e);
      }
    }

    // Fallback: ancien format ---RAYA_DATA--- (compatibilité)
    const dataMatch = response.match(/---RAYA_DATA---\s*(\{[\s\S]*?\})\s*---END_DATA---/);
    if (dataMatch) {
      try {
        const rawData = JSON.parse(dataMatch[1]);
        const insight = this.convertSimplifiedInsight(rawData);
        const text = response.replace(/---RAYA_DATA---[\s\S]*?---END_DATA---/, '').trim();
        return { text, insight };
      } catch (e) {
        console.warn('Invalid RAYA_DATA JSON:', e);
      }
    }

    // Fallback: format ```json ... ```
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const rawData = JSON.parse(jsonMatch[1]);
        const insight = rawData.concept ? this.convertBlockInsight(rawData) :
                        rawData.t ? this.convertSimplifiedInsight(rawData) :
                        rawData as TurnInsight;
        const text = response.replace(/```json[\s\S]*?```/, '').trim();
        return { text, insight };
      } catch (e) {
        console.warn('Invalid JSON in response:', e);
      }
    }

    // Pas de JSON = pas d'insight (normal si BLACKOUT ou milieu de conversation)
    return { text: response, insight: null };
  }

  /**
   * Convertit le format JSON de bloc (résumé de fin de sujet)
   * Input: {"concept":"...", "pkm":{...}, "difficulty":"...", ...}
   */
  private convertBlockInsight(raw: {
    concept: string;
    pkm: {
      global: number;
      reformulation?: number;
      accuracy?: number;
      application?: number;
    };
    difficulty?: string | null;
    engagement?: number;
    recommendation?: string;
    context?: {
      country?: string;
      system?: string;
      grade?: string;
      exam?: string;
    };
  }): TurnInsight {
    const pkmGlobal = raw.pkm?.global || 0;
    const isCountable = pkmGlobal > 0;

    // Calculer XP basé sur le PKM global
    let xpEarned = 0;
    if (pkmGlobal >= 0.85) xpEarned = 50;
    else if (pkmGlobal >= 0.60) xpEarned = 30;
    else if (pkmGlobal >= 0.40) xpEarned = 15;
    else if (pkmGlobal > 0) xpEarned = 10;

    return {
      turn: {
        type: 'VALIDATION', // Un insight de bloc est toujours un bilan
        conceptId: raw.concept?.replace(/\s+/g, '_').toLowerCase(),
        conceptName: raw.concept
      },
      student: {
        produced: isCountable,
        responseQuality: pkmGlobal >= 0.85 ? 'correct' :
                         pkmGlobal >= 0.60 ? 'partial' :
                         pkmGlobal > 0 ? 'incorrect' : null,
        effortShown: (raw.engagement || 0) > 0.5
      },
      pkm: {
        countable: isCountable,
        delta: pkmGlobal, // Pour un bloc, delta = score global
        runningScore: pkmGlobal,
        confidence: pkmGlobal > 0 ? 'high' : 'low' // Insight de bloc = haute confiance
      },
      pedagogy: {
        misconceptionsDetected: raw.difficulty ? [raw.difficulty] : [],
        prerequisitesMissing: [],
        nextAction: pkmGlobal >= 0.85 ? 'advance' : 'reinforce'
      },
      context: raw.context,
      engagement: {
        sessionTurns: 0,
        xpEarned
      }
    };
  }

  /**
   * Convertit le format JSON simplifié (ancien format, compatibilité)
   * Input: {"t":"D","c":"concept","p":0.25,"q":"C","xp":20}
   */
  private convertSimplifiedInsight(raw: {
    t: string;
    c: string;
    p: number;
    q: string;
    xp: number;
  }): TurnInsight {
    const typeMap: Record<string, TurnType> = {
      'D': 'DIAGNOSTIC',
      'T': 'TEACHING',
      'V': 'VALIDATION',
      'E': 'EXAM_DIRECT'
    };

    const qualityMap: Record<string, ResponseQuality> = {
      'C': 'correct',
      'P': 'partial',
      'I': 'incorrect',
      'N': 'no_attempt',
      '-': null
    };

    const turnType = typeMap[raw.t] || 'CHAT';
    const quality = qualityMap[raw.q] || null;
    const studentProduced = raw.q !== '-' && raw.q !== 'N';
    const pkmCountable = studentProduced && raw.p !== 0;

    return {
      turn: {
        type: turnType,
        conceptId: raw.c?.replace(/\s+/g, '_').toLowerCase(),
        conceptName: raw.c
      },
      student: {
        produced: studentProduced,
        responseQuality: quality,
        effortShown: raw.q !== '-'
      },
      pkm: {
        countable: pkmCountable,
        delta: raw.p || 0,
        runningScore: 0,
        confidence: pkmCountable ? 'medium' : 'low'
      },
      pedagogy: {
        misconceptionsDetected: [],
        prerequisitesMissing: [],
        nextAction: turnType === 'TEACHING' ? 'validate' : 'advance'
      },
      engagement: {
        sessionTurns: 0,
        xpEarned: raw.xp || 0
      }
    };
  }

  /**
   * Récupère ou crée un profil élève
   */
  private getOrCreateProfile(userId: string, userContext: UserContext): StudentProfile {
    let profile = this.studentProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        name: userContext.name,
        streakDays: 0,
        totalXP: 0,
        level: 1,
        badges: [],
        sessionsCount: 0,
        conceptsExplored: []
      };
    }

    return profile;
  }

  /**
   * Met à jour la série (streak)
   */
  private updateStreak(profile: StudentProfile): void {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!profile.lastSessionDate) {
      // Première session
      profile.streakDays = 1;
      profile.sessionsCount = 1;
    } else {
      const lastDate = new Date(profile.lastSessionDate);
      const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
      const diffDays = Math.floor((today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Même jour
      } else if (diffDays === 1) {
        // Jour consécutif
        profile.streakDays += 1;
        profile.sessionsCount += 1;
      } else {
        // Série brisée
        profile.streakDays = 1;
        profile.sessionsCount += 1;
      }
    }

    profile.lastSessionDate = now;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MÉTHODES UTILITAIRES PUBLIQUES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Réinitialise l'historique de conversation
   */
  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
    this.imageValidationStates.delete(userId);
  }

  /**
   * Récupère le profil élève
   */
  getProfile(userId: string): StudentProfile | null {
    return this.studentProfiles.get(userId) || null;
  }

  /**
   * Met à jour le nom de l'élève
   */
  setStudentName(userId: string, name: string): void {
    const profile = this.studentProfiles.get(userId);
    if (profile) {
      profile.name = name;
      this.studentProfiles.set(userId, profile);
    }
  }

  /**
   * Génère une rétrospective simple
   */
  getRetrospective(userId: string): string | null {
    const profile = this.studentProfiles.get(userId);
    if (!profile) return null;

    return `
📊 TES STATS

🔥 Série: ${profile.streakDays} jour(s)
⭐ Niveau: ${profile.level}
💎 XP Total: ${profile.totalXP}
📚 Concepts explorés: ${profile.conceptsExplored.length}

🏆 Badges (${profile.badges.length}):
${profile.badges.map(b => `  ${b.emoji} ${b.name}`).join('\n') || '  Aucun pour l\'instant - continue!'}

${profile.conceptsExplored.length > 0 ? `
📖 Derniers sujets:
${profile.conceptsExplored.slice(-5).map(c => `  • ${c}`).join('\n')}
` : ''}
`;
  }

  /**
   * Exporte les données pour persistance
   */
  exportData(): {
    profiles: Array<[string, StudentProfile]>;
    histories: Array<[string, ChatMessage[]]>;
  } {
    return {
      profiles: Array.from(this.studentProfiles.entries()),
      histories: Array.from(this.conversationHistory.entries())
    };
  }

  /**
   * Importe les données depuis une sauvegarde
   */
  importData(data: {
    profiles?: Array<[string, StudentProfile]>;
    histories?: Array<[string, ChatMessage[]]>;
  }): void {
    if (data.profiles) {
      for (const [id, profile] of data.profiles) {
        // Reconvertir les dates
        if (profile.lastSessionDate) {
          profile.lastSessionDate = new Date(profile.lastSessionDate);
        }
        profile.badges = profile.badges.map(b => ({
          ...b,
          unlockedAt: new Date(b.unlockedAt)
        }));
        this.studentProfiles.set(id, profile);
      }
    }

    if (data.histories) {
      for (const [id, history] of data.histories) {
        const converted = history.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        this.conversationHistory.set(id, converted);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

let instance: RayaChatService | null = null;

export function getRayaChatService(apiKey?: string, model?: string): RayaChatService {
  if (!instance) {
    instance = new RayaChatService(apiKey, model);
  }
  return instance;
}

export function createRayaChatService(apiKey?: string, model?: string): RayaChatService {
  return new RayaChatService(apiKey, model);
}

export default RayaChatService;
