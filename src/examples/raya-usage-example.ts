/**
 * RAYA AI Service - Usage Examples
 *
 * This file demonstrates how to use the RayaAIService
 */

import { RayaAIService, ProgressionState } from '../services/raya-ai.service';
import * as dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// EXAMPLE 1: Simple Chat (Non-Streaming)
// ============================================================================

async function example1_simpleChat() {
  console.log('\n=== EXAMPLE 1: Simple Chat ===\n');

  const raya = new RayaAIService({
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-2.0-flash-exp',
    temperature: 0.75,
    thinkingBudget: 24576,
    enableTools: true,
  });

  const response = await raya.chat(
    "Hi! I'm in 9th grade in Cameroon and I need help with quadratic equations.",
    'free'
  );

  console.log('RAYA:', response.text);

  if (response.insight) {
    console.log('\n[INSIGHT GENERATED]');
    console.log('Concept:', response.insight.academic.concept);
    console.log('PKM Global:', response.insight.academic.pkm.global);
  }
}

// ============================================================================
// EXAMPLE 2: Streaming Chat
// ============================================================================

async function example2_streamingChat() {
  console.log('\n=== EXAMPLE 2: Streaming Chat ===\n');

  const raya = new RayaAIService({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  const stream = raya.chatStream(
    "Explain the discriminant to me",
    'free'
  );

  process.stdout.write('RAYA: ');

  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      // Stream chunk
      process.stdout.write(chunk);
    } else {
      // Final response
      console.log('\n\n[FINAL RESPONSE]');
      if (chunk.insight) {
        console.log('PKM:', chunk.insight.academic.pkm.global);
      }
      if (chunk.progression) {
        console.log('XP Earned:', chunk.progression.xp_earned);
        console.log('Level:', chunk.progression.level);
      }
    }
  }
}

// ============================================================================
// EXAMPLE 3: Multi-Turn Conversation with Progression
// ============================================================================

async function example3_multiTurnWithProgression() {
  console.log('\n=== EXAMPLE 3: Multi-Turn with Progression ===\n');

  const raya = new RayaAIService({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  // Student progression state
  let progressionState: ProgressionState = {
    total_xp: 450,
    level: 4,
    badges: ['🔥 Rising Flame'],
    streak_days: 5,
    last_session_date: new Date().toISOString(),
  };

  // Turn 1
  console.log('Student: "What is a quadratic equation?"');
  let response = await raya.chat(
    "What is a quadratic equation?",
    'free',
    progressionState
  );
  console.log('RAYA:', response.text.substring(0, 200) + '...\n');

  // Turn 2
  console.log('Student: "Can you give me an example?"');
  response = await raya.chat(
    "Can you give me an example?",
    'free',
    progressionState
  );
  console.log('RAYA:', response.text.substring(0, 200) + '...\n');

  // Turn 3 - Student answers a validation question
  console.log('Student: "Delta = 16 - 12 = 4, so 2 solutions"');
  response = await raya.chat(
    "Delta = 16 - 12 = 4, so 2 solutions",
    'free',
    progressionState
  );
  console.log('RAYA:', response.text.substring(0, 200) + '...\n');

  if (response.progression) {
    console.log('[PROGRESSION UPDATE]');
    console.log('XP Earned:', response.progression.xp_earned);
    console.log('New Level:', response.progression.level);
    console.log('Badges Unlocked:', response.progression.badges_unlocked);

    // Update state
    progressionState.total_xp += response.progression.xp_earned;
    progressionState.level = response.progression.level;
    progressionState.badges.push(...response.progression.badges_unlocked);
  }

  if (response.insight) {
    console.log('\n[PEDAGOGICAL INSIGHT]');
    console.log('PKM Global:', response.insight.academic.pkm.global);
    console.log('Engagement:', response.insight.pedagogical.engagement.level);
    console.log('Recommendation:', response.insight.recommendations.for_student);
  }

  console.log('\n[CONVERSATION HISTORY]');
  console.log('Total turns:', raya.getHistory().length);
}

// ============================================================================
// EXAMPLE 4: Chat with Image
// ============================================================================

async function example4_chatWithImage() {
  console.log('\n=== EXAMPLE 4: Chat with Image ===\n');

  const raya = new RayaAIService({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  // Assuming you have an image of a math problem
  const imagePath = './test-images/math-problem.jpg';

  try {
    const response = await raya.chatWithImage(
      "Can you help me solve this equation?",
      imagePath,
      'free'
    );

    console.log('RAYA:', response.text);

    if (response.insight) {
      console.log('\n[MULTIMODAL INSIGHT]');
      console.log('Used image:', response.insight.context.multimodal_used);
    }
  } catch (error) {
    console.error('Image not found. Create test-images/math-problem.jpg to test this.');
  }
}

// ============================================================================
// EXAMPLE 5: Premium User with EXAM Mode
// ============================================================================

async function example5_premiumExamMode() {
  console.log('\n=== EXAMPLE 5: Premium EXAM Mode ===\n');

  const raya = new RayaAIService({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  const response = await raya.chat(
    "I have an exam tomorrow! Solve this quickly: x² - 5x + 6 = 0",
    'premium' // Premium user
  );

  console.log('RAYA:', response.text);

  if (response.insight) {
    console.log('\nSession Type:', response.insight.context.session_type);
  }
}

// ============================================================================
// EXAMPLE 6: Managing Conversation History
// ============================================================================

async function example6_historyManagement() {
  console.log('\n=== EXAMPLE 6: History Management ===\n');

  const raya = new RayaAIService({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  // Chat 1
  await raya.chat("Hi, I'm Kevin from Cameroon, 9th grade");
  console.log('History length after chat 1:', raya.getHistory().length);

  // Chat 2
  await raya.chat("What's a quadratic equation?");
  console.log('History length after chat 2:', raya.getHistory().length);

  // Save history (e.g., to database)
  const savedHistory = raya.getHistory();
  console.log('Saved history:', savedHistory.length, 'messages');

  // Clear for new session
  raya.clearHistory();
  console.log('History after clear:', raya.getHistory().length);

  // Restore history
  raya.setHistory(savedHistory);
  console.log('History after restore:', raya.getHistory().length);
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

async function runAll() {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_KEY) {
    console.error('ERROR: GEMINI_API_KEY not found in environment variables');
    console.error('Create a .env file with: GEMINI_API_KEY=your_key_here');
    process.exit(1);
  }

  try {
    // Run examples (comment out the ones you don't want to run)
    await example1_simpleChat();
    // await example2_streamingChat();
    // await example3_multiTurnWithProgression();
    // await example4_chatWithImage();
    // await example5_premiumExamMode();
    // await example6_historyManagement();
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  runAll();
}
