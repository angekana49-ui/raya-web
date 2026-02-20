# RAYA v2.0 — Guide de Configuration

## Structure des Fichiers

```
raya-web/
├── prompts/
│   └── RAYA_v2.0_SYSTEM_PROMPT.md   ← Prompt complet (à lire pour comprendre RAYA)
├── src/
│   ├── services/
│   │   └── raya-chat.service.ts      ← Service principal
│   └── test-raya.ts                  ← Script de test
├── SETUP.md                          ← Ce fichier
└── package.json
```

## Installation

```bash
# 1. Installer les dépendances
npm install @google/genai

# 2. Si TypeScript n'est pas configuré
npm install -D typescript ts-node @types/node

# 3. Définir la clé API Gemini
# Windows:
set GEMINI_API_KEY=votre_clé_api

# Linux/Mac:
export GEMINI_API_KEY=votre_clé_api
```

## Test Rapide

```bash
npx ts-node src/test-raya.ts
```

## Utilisation dans ton Code

```typescript
import { createRayaChatService, UserContext } from './services/raya-chat.service';

// Créer le service
const raya = createRayaChatService();

// Contexte utilisateur
const user: UserContext = {
  id: 'user_123',
  tier: 'free',  // ou 'premium'
  name: 'Kevin'  // optionnel
};

// Envoyer un message
const response = await raya.chat(user.id, "Salut, je suis en 3ème", user);

console.log(response.text);      // Réponse de RAYA
console.log(response.insight);   // Données JSON (PKM, concept, etc.)
console.log(response.xpEarned);  // XP gagné
```

## Avec une Image

```typescript
import { readFileSync } from 'fs';

// Lire l'image en base64
const imageBuffer = readFileSync('exercice.jpg');
const imageBase64 = imageBuffer.toString('base64');

// Envoyer avec l'image
const response = await raya.chatWithImage(
  user.id,
  "Aide-moi avec cet exercice",
  imageBase64,
  user
);

// RAYA va demander confirmation de la transcription
if (response.awaitingValidation) {
  // L'utilisateur doit confirmer ou corriger
  const confirmation = await raya.chat(user.id, "oui c'est correct", user);
}
```

## Ce que l'IA Gère Automatiquement

L'IA (via le prompt) gère elle-même:

- **Détection de langue** → Répond dans la langue du curriculum
- **Adaptation au pays** → Cameroun, France, USA, Japon, Corée, etc.
- **Contexte culturel** → Noms locaux, monnaie, exemples familiers
- **Format d'examen** → BEPC, BAC, SAT, 수능, etc.
- **Protocole PROVE-FIRST** → Test avant explication

## Ce que le Code Gère

Le service TypeScript gère:

- **Historique de conversation** → Conservé en mémoire (à persister en DB)
- **Progression** → XP, niveaux, badges, streaks
- **Validation d'images** → Demande confirmation avant de traiter
- **Parsing JSON** → Extrait les insights de la réponse

## Réponse Type

```typescript
interface RayaResponse {
  text: string;           // Texte de la réponse
  insight: TurnInsight;   // Données structurées (PKM, concept, etc.)
  xpEarned?: number;      // XP gagné ce tour
  badgeUnlocked?: Badge;  // Badge débloqué (si applicable)
  levelUp?: boolean;      // Passage de niveau?
  newLevel?: number;      // Nouveau niveau
  awaitingValidation?: boolean;  // En attente de confirmation image
}
```

## Différence Free vs Premium

| Feature | Free | Premium |
|---------|------|---------|
| Mode SOCRATIC | ✅ | ✅ |
| Mode EXAM (réponses directes) | ❌ | ✅ |
| Progression (XP, badges) | ✅ | ✅ |
| Mémoire conversation | ✅ | ✅ |

## Prochaines Étapes

1. **Base de données** → Persister les profils et historiques
2. **API REST** → Exposer le service via Express/Fastify
3. **Dashboard élève** → Interface pour voir la progression
4. **Insights école** → Agrégation des données pour les enseignants

## Tester le Prompt Directement

Tu peux copier-coller le contenu de `prompts/RAYA_v2.0_SYSTEM_PROMPT.md` dans:
- Google AI Studio (https://aistudio.google.com)
- N'importe quel playground LLM

Ça te permet de tester et ajuster le prompt sans toucher au code.
