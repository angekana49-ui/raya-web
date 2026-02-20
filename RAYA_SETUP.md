# RAYA v2.0 - Setup & Usage Guide

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `@google/genai` - New Google GenAI SDK with tools support
- `dotenv` - Environment variables management
- `ts-node` - TypeScript execution for testing

### 2. Configure API Key

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your API key from: https://makersuite.google.com/app/apikey

### 3. Run Test Examples

```bash
npm run test:raya
```

---

## 📁 Project Structure

```
raya-web/
├── prompts/
│   ├── RAYA_v2.0_SYSTEM_PROMPT_EN.md    # English system prompt
│   └── RAYA_v2.0_SYSTEM_PROMPT.md       # French system prompt
├── src/
│   ├── services/
│   │   └── raya-ai.service.ts           # Main RAYA AI service
│   └── examples/
│       └── raya-usage-example.ts        # Usage examples
├── .env                                  # Your API keys (create this)
└── package.json
```

---

## 🎯 Service Features

### **RayaAIService** - Hybrid Optimized Version

Combines the best of both worlds:

✅ **From Google AI Studio:**
- New `@google/genai` SDK
- Tools integration (urlContext, googleSearch)
- Thinking config for better reasoning
- Streaming support

✅ **From Custom Logic:**
- Automatic `---RAYA_INSIGHT---` parsing
- Progression system (XP, badges, levels)
- Conversation history management
- Multimodal support (text + images)
- PKM scoring calculation

---

## 💻 Usage Examples

### Example 1: Simple Chat

```typescript
import { RayaAIService } from './services/raya-ai.service';

const raya = new RayaAIService({
  apiKey: process.env.GEMINI_API_KEY!,
  model: 'gemini-2.0-flash-exp',
  temperature: 0.75,
  enableTools: true,
});

const response = await raya.chat(
  "Hi! I'm in 9th grade in Cameroon. Help me with quadratic equations.",
  'free' // or 'premium'
);

console.log(response.text);
console.log(response.insight); // Pedagogical insights
console.log(response.progression); // XP, level, badges
```

### Example 2: Streaming Chat

```typescript
const stream = raya.chatStream(
  "Explain the discriminant to me",
  'free'
);

for await (const chunk of stream) {
  if (typeof chunk === 'string') {
    process.stdout.write(chunk); // Stream chunks
  } else {
    console.log(chunk.insight); // Final response
  }
}
```

### Example 3: Multi-Turn with Progression

```typescript
let progressionState = {
  total_xp: 450,
  level: 4,
  badges: ['🔥 Rising Flame'],
  streak_days: 5,
  last_session_date: new Date().toISOString(),
};

// Turn 1
let response = await raya.chat(
  "What is a quadratic equation?",
  'free',
  progressionState
);

// Turn 2
response = await raya.chat(
  "Can you give me an example?",
  'free',
  progressionState
);

// Update progression
if (response.progression) {
  progressionState.total_xp += response.progression.xp_earned;
  progressionState.level = response.progression.level;
}
```

### Example 4: Chat with Image

```typescript
const response = await raya.chatWithImage(
  "Can you help me solve this equation?",
  './path/to/math-problem.jpg',
  'free'
);

console.log(response.text);
```

### Example 5: Managing History

```typescript
// Get history (e.g., to save to database)
const history = raya.getHistory();

// Clear history (new session)
raya.clearHistory();

// Restore history (continuing session)
raya.setHistory(previousHistory);
```

---

## 🔧 Configuration Options

```typescript
new RayaAIService({
  apiKey: string;                    // Required: Your Gemini API key
  model?: string;                    // Optional: Default 'gemini-2.0-flash-exp'
  temperature?: number;              // Optional: Default 0.75
  thinkingBudget?: number;          // Optional: Default 24576
  enableTools?: boolean;             // Optional: Default true
  systemPromptPath?: string;         // Optional: Custom prompt path
});
```

### Available Models:
- `gemini-2.0-flash-exp` (Recommended - Fast, powerful, cheap)
- `gemini-flash-lite-latest` (Ultra cheap for testing)
- `gemini-1.5-pro` (More powerful, slower, expensive)

---

## 📊 Response Structure

### RayaResponse

```typescript
{
  text: string;                     // Main response text (cleaned)
  insight: RayaInsight | null;      // Pedagogical insights
  progression?: {                   // Progression data
    xp_earned: number;
    level: number;
    badges_unlocked: string[];
  }
}
```

### RayaInsight

Full professional educational insights:

```typescript
{
  session_id: string;
  timestamp: string;

  academic: {
    concept: string;
    subject_area: string;
    curriculum_alignment: {...};
    pkm: {
      global: number;              // 0.00-1.00
      reformulation: number;
      accuracy: number;
      application: number;
      // ... more
    };
    performance: {
      attempts: number;
      successes: number;
      errors: string[];
      misconceptions: string[];
      breakthrough_moments: string[];
    };
  };

  pedagogical: {
    learning_patterns: {...};
    engagement: {...};
    metacognition: {...};
    study_habits?: {...};
  };

  recommendations: {
    for_student: string;
    for_teacher: string;
    next_steps: string[];
    intervention_needed: boolean;
    estimated_time_to_mastery: string;
  };

  context: {
    session_type: 'SOCRATIC' | 'EXAM_DIRECT' | 'REVIEW';
    session_duration_minutes: number;
    turn_count: number;
    multimodal_used: boolean;
    exam_proximity: number | null;
  };
}
```

---

## 🎓 Integration in Your App

### Next.js API Route Example

```typescript
// pages/api/chat.ts
import { RayaAIService } from '@/services/raya-ai.service';
import type { NextApiRequest, NextApiResponse } from 'next';

const raya = new RayaAIService({
  apiKey: process.env.GEMINI_API_KEY!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const { message, userTier, progressionState } = req.body;

    const response = await raya.chat(message, userTier, progressionState);

    res.status(200).json(response);
  }
}
```

### React Component Example

```typescript
// components/RayaChat.tsx
import { useState } from 'react';

export function RayaChat() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState(null);

  const handleSubmit = async () => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        userTier: 'free',
        progressionState: {...}
      }),
    });

    const data = await res.json();
    setResponse(data);
  };

  return (
    <div>
      <input value={message} onChange={(e) => setMessage(e.target.value)} />
      <button onClick={handleSubmit}>Send</button>
      {response && <div>{response.text}</div>}
    </div>
  );
}
```

---

## 🔑 Key Differences from AI Studio Code

| Feature | AI Studio Code | RAYA Service |
|---------|---------------|--------------|
| SDK | ✅ `@google/genai` | ✅ `@google/genai` |
| Tools | ✅ urlContext, googleSearch | ✅ urlContext, googleSearch |
| Thinking | ✅ thinkingConfig | ✅ thinkingConfig |
| Streaming | ✅ Basic | ✅ Advanced with parsing |
| Insight Parsing | ❌ None | ✅ Automatic |
| Progression | ❌ None | ✅ XP, Badges, Levels |
| Images | ❌ None | ✅ Full support |
| History | ❌ Manual | ✅ Managed |
| Architecture | ❌ Script only | ✅ Service class |

---

## 🚨 Important Notes

### BLACKOUT Rules
The service respects BLACKOUT rules automatically. No JSON insights are generated for:
- Private/intimate life topics
- Sensitive opinions (politics, religion)
- Mental health (non-academic)
- Trivial conversations (greetings, jokes)

### PKM Reliability
- PKM scores ONLY reflect what students **produce**, not what they read
- PROVE-FIRST protocol is enforced by the prompt
- Validation questions are mandatory after explanations

### Tier System
- **Free users**: SOCRATIC mode only (no direct answers)
- **Premium users**: Access to EXAM mode (direct answers when urgent)

---

## 🐛 Troubleshooting

### "Module @google/genai not found"
```bash
npm install @google/genai
```

### "GEMINI_API_KEY not defined"
Create `.env` file with your API key

### "System prompt file not found"
Check that `prompts/RAYA_v2.0_SYSTEM_PROMPT_EN.md` exists

### Streaming doesn't work
Make sure you're using `for await` with async generator:
```typescript
for await (const chunk of stream) { ... }
```

---

## 📝 Next Steps

1. ✅ Install dependencies (`npm install`)
2. ✅ Create `.env` with your API key
3. ✅ Run test examples (`npm run test:raya`)
4. ✅ Integrate in your Next.js app
5. ✅ Deploy and test in production

---

## 🤝 Support

For issues, check:
- The example file: `src/examples/raya-usage-example.ts`
- The service code: `src/services/raya-ai.service.ts`
- Google GenAI docs: https://ai.google.dev/

---

**RAYA v2.0** - Built for education, powered by AI 🎓✨
