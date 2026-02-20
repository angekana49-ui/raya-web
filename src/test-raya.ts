/**
 * Script de test pour RAYA v2.0
 *
 * Usage:
 *   1. npm install @google/genai
 *   2. Définir GEMINI_API_KEY dans l'environnement
 *   3. npx ts-node src/test-raya.ts
 */

import { createRayaChatService, UserContext } from './services/raya-chat.service';

async function testRaya() {
  // Vérifier la clé API
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY non définie!');
    console.log('\nDéfinissez-la avec:');
    console.log('  Windows: set GEMINI_API_KEY=votre_clé');
    console.log('  Linux/Mac: export GEMINI_API_KEY=votre_clé');
    process.exit(1);
  }

  console.log('🚀 Initialisation de RAYA v2.0...\n');

  // Créer le service
  const raya = createRayaChatService();

  // Contexte utilisateur de test
  const userContext: UserContext = {
    id: 'test_user_001',
    tier: 'free', // ou 'premium'
    name: 'Maeva'
  };

  // Conversations de test
  const testMessages = [
    "Salut!",
    "Je suis en 3ème au Cameroun",
    "J'ai pas compris les équations du 2nd degré",
    "Oui j'ai vu le discriminant mais je comprends pas à quoi ça sert"
  ];

  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    TEST RAYA v2.0');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const message of testMessages) {
    console.log(`👤 ÉLÈVE: ${message}`);
    console.log('---');

    try {
      const response = await raya.chat(userContext.id, message, userContext);

      console.log(`🤖 RAYA: ${response.text}`);

      if (response.xpEarned && response.xpEarned > 0) {
        console.log(`\n   ✨ +${response.xpEarned} XP`);
      }

      if (response.badgeUnlocked) {
        console.log(`\n   🏆 Badge débloqué: ${response.badgeUnlocked.emoji} ${response.badgeUnlocked.name}`);
      }

      if (response.levelUp) {
        console.log(`\n   📈 Niveau ${response.newLevel} atteint!`);
      }

      if (response.insight) {
        console.log('\n   📊 Insight:', JSON.stringify(response.insight, null, 2));
      }

    } catch (error) {
      console.error(`❌ Erreur:`, error);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Pause entre les messages (pour éviter rate limiting)
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Afficher les stats finales
  console.log('📊 STATS FINALES:');
  console.log(raya.getRetrospective(userContext.id));
}

// Lancer le test
testRaya().catch(console.error);
