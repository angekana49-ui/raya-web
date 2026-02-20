# RAYA API Routes Documentation

## 🎯 Available Endpoints

### 1. `/api/raya/chat` - Simple Chat (Non-Streaming)
### 2. `/api/raya/stream` - Streaming Chat (Real-time)
### 3. `/api/raya/image` - Chat with Image

---

## 📡 Endpoint Details

### 1. POST `/api/raya/chat`

**Simple chat endpoint with full response.**

#### Request Body (JSON)

```typescript
{
  message: string;                    // Required: User message
  userTier?: 'free' | 'premium';      // Optional: Default 'free'
  progressionState?: {                // Optional: Student progression
    total_xp: number;
    level: number;
    badges: string[];
    streak_days: number;
    last_session_date: string;
  };
  conversationHistory?: any[];        // Optional: Previous messages
  sessionId?: string;                 // Optional: Session identifier
}
```

#### Response (JSON)

```typescript
{
  success: true,
  data: {
    text: string;                     // RAYA's response text
    insight: RayaInsight | null;      // Pedagogical insights
    progression?: {                   // XP/Level changes
      xp_earned: number;
      level: number;
      badges_unlocked: string[];
    };
    conversationHistory: any[];       // Updated history
    sessionId: string;                // Session ID
  }
}
```

#### Example Usage

```typescript
const response = await fetch('/api/raya/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "What's a quadratic equation?",
    userTier: 'free',
  }),
});

const data = await response.json();
console.log(data.data.text);      // RAYA's response
console.log(data.data.insight);   // Insights
```

---

### 2. POST `/api/raya/stream`

**Streaming chat with Server-Sent Events (SSE).**

#### Request Body (JSON)

```typescript
{
  message: string;                    // Required: User message
  userTier?: 'free' | 'premium';      // Optional: Default 'free'
  progressionState?: {...};           // Optional: Student progression
  conversationHistory?: any[];        // Optional: Previous messages
  sessionId?: string;                 // Optional: Session identifier
}
```

#### Response (SSE Stream)

```typescript
// Event type: chunk (text streaming)
data: {
  "type": "chunk",
  "content": "The discriminant..."
}

// Event type: complete (final response)
data: {
  "type": "complete",
  "content": {
    "text": "...",
    "insight": {...},
    "progression": {...},
    "conversationHistory": [...],
    "sessionId": "..."
  }
}

// Event type: error (if error occurs)
data: {
  "type": "error",
  "error": "Error message"
}
```

#### Example Usage

```typescript
const response = await fetch('/api/raya/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "Explain the discriminant",
    userTier: 'free',
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));

      if (data.type === 'chunk') {
        console.log(data.content); // Stream text
      } else if (data.type === 'complete') {
        console.log(data.content); // Final data
      }
    }
  }
}
```

---

### 3. POST `/api/raya/image`

**Chat with image attachment (multimodal).**

#### Request (FormData)

```typescript
const formData = new FormData();
formData.append('message', 'Can you solve this equation?');
formData.append('image', imageFile); // File object
formData.append('userTier', 'free');
formData.append('progressionState', JSON.stringify({...})); // Optional
formData.append('conversationHistory', JSON.stringify([...])); // Optional
formData.append('sessionId', 'session_123'); // Optional
```

#### Response (JSON)

```typescript
{
  success: true,
  data: {
    text: string;                     // RAYA's response
    insight: RayaInsight | null;      // Insights
    progression?: {...};              // XP/Level changes
    conversationHistory: any[];       // Updated history
    sessionId: string;                // Session ID
  }
}
```

#### Example Usage

```typescript
const formData = new FormData();
formData.append('message', 'Help me solve this');
formData.append('image', imageFile);
formData.append('userTier', 'free');

const response = await fetch('/api/raya/image', {
  method: 'POST',
  body: formData,
});

const data = await response.json();
console.log(data.data.text);
```

---

## 🔄 Full Conversation Flow

### Example: Multi-Turn Chat with Progression

```typescript
let conversationHistory = [];
let sessionId = '';
let progressionState = {
  total_xp: 450,
  level: 4,
  badges: ['🔥 Rising Flame'],
  streak_days: 5,
  last_session_date: new Date().toISOString(),
};

// Turn 1
let response = await fetch('/api/raya/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "I'm in 9th grade Cameroon. Help with quadratic equations.",
    userTier: 'free',
    progressionState,
    conversationHistory,
    sessionId,
  }),
});

let data = await response.json();
console.log('RAYA:', data.data.text);

// Update state
conversationHistory = data.data.conversationHistory;
sessionId = data.data.sessionId;
if (data.data.progression) {
  progressionState.total_xp += data.data.progression.xp_earned;
  progressionState.level = data.data.progression.level;
}

// Turn 2
response = await fetch('/api/raya/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "What's the discriminant?",
    userTier: 'free',
    progressionState,
    conversationHistory,
    sessionId,
  }),
});

data = await response.json();
console.log('RAYA:', data.data.text);

// Update state again...
conversationHistory = data.data.conversationHistory;
if (data.data.progression) {
  progressionState.total_xp += data.data.progression.xp_earned;
}
```

---

## 📊 Response Types

### RayaInsight Structure

```typescript
{
  session_id: string;
  timestamp: string;

  academic: {
    concept: string;                  // "Discriminant of quadratic equations"
    subject_area: string;             // "Algebra"
    curriculum_alignment: {
      country: string;                // "CM"
      system: string;                 // "francophone"
      grade: string;                  // "3eme"
      exam: string;                   // "BEPC"
      topic_code: string;             // "ALG-3-EQ2-DISC"
    };
    pkm: {
      global: number;                 // 0.00 - 1.00
      reformulation: number;
      accuracy: number;
      application: number;
      conceptual_understanding: number;
      procedural_fluency: number;
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
    learning_patterns: {
      style_indicators: string[];     // ["visual learner"]
      effective_strategies: string[]; // ["Step-by-step"]
      struggle_points: string[];      // ["Abstract symbolism"]
    };
    engagement: {
      level: number;                  // 0.00 - 1.00
      persistence: number;
      question_quality: 'low' | 'medium' | 'high';
      autonomy: number;
      help_seeking_behavior: 'too little' | 'appropriate' | 'too much';
    };
    metacognition: {
      self_awareness: number;
      error_detection: number;
      strategy_adaptation: number;
    };
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

## 🔐 Environment Variables

Make sure `.env` contains:

```bash
GEMINI_API_KEY=your_gemini_api_key_here

# Optional overrides
RAYA_MODEL=gemini-2.0-flash-exp
RAYA_TEMPERATURE=0.75
RAYA_THINKING_BUDGET=24576
```

---

## 🚨 Error Handling

All endpoints return errors in this format:

```typescript
{
  error: string;                      // Error type
  message: string;                    // Error details
}
```

### Common Errors

| Status | Error | Solution |
|--------|-------|----------|
| 400 | "Message is required" | Provide message in request |
| 400 | "Image file is required" | Provide image file |
| 500 | "GEMINI_API_KEY not configured" | Add key to .env |
| 500 | "Internal server error" | Check server logs |

---

## 📱 React Component Examples

Full working examples in: `src/examples/frontend-usage-examples.tsx`

- ✅ Simple Chat
- ✅ Streaming Chat
- ✅ Image Chat
- ✅ Progression Chat
- ✅ Full Chat Component

---

## 🎯 Best Practices

### 1. **Conversation History**
Always pass `conversationHistory` to maintain context:

```typescript
// Save history after each response
setConversationHistory(data.data.conversationHistory);

// Pass it in next request
body: JSON.stringify({
  message: "...",
  conversationHistory,
})
```

### 2. **Session Management**
Use `sessionId` to track conversations:

```typescript
// Save session ID
setSessionId(data.data.sessionId);

// Reuse in subsequent requests
body: JSON.stringify({
  message: "...",
  sessionId,
})
```

### 3. **Progression Tracking**
Update progression state after each response:

```typescript
if (data.data.progression) {
  setProgressionState(prev => ({
    ...prev,
    total_xp: prev.total_xp + data.data.progression.xp_earned,
    level: data.data.progression.level,
    badges: [...prev.badges, ...data.data.progression.badges_unlocked],
  }));
}
```

### 4. **Error Handling**
Always wrap API calls in try-catch:

```typescript
try {
  const response = await fetch('/api/raya/chat', {...});
  const data = await response.json();

  if (!data.success) {
    console.error('API Error:', data.error);
  }
} catch (error) {
  console.error('Network Error:', error);
}
```

### 5. **Streaming**
Use streaming for better UX:

```typescript
// For long responses, use streaming
fetch('/api/raya/stream', {...})

// For short responses, use normal chat
fetch('/api/raya/chat', {...})
```

---

## 🧪 Testing

### Test with cURL

```bash
# Simple chat
curl -X POST http://localhost:3000/api/raya/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is 2+2?","userTier":"free"}'

# Streaming
curl -X POST http://localhost:3000/api/raya/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"Explain quadratic equations","userTier":"free"}'

# Image (with a test image)
curl -X POST http://localhost:3000/api/raya/image \
  -F "message=Solve this equation" \
  -F "image=@test.jpg" \
  -F "userTier=free"
```

---

**RAYA API Routes** - Ready to use! 🚀
