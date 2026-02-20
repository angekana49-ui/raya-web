# RAYA Database Schema & Backend Architecture

## Overview

Ce document décrit la structure complète de la base de données nécessaire pour RAYA, basée sur:
1. Le frontend actuel et ses fonctionnalités
2. Le prompt RAYA v1.0 et ses exigences (PKM, insights, etc.)
3. Les features "coming soon" planifiées

---

## Database Schema (PostgreSQL recommended)

### 1. USERS (Utilisateurs)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    -- Profile
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,

    -- Role: student, teacher, admin
    role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),

    -- Student-specific (from RAYA prompt DATA COLLECTION)
    country VARCHAR(100),
    grade VARCHAR(50),                    -- e.g., "6ème", "Terminale", "Grade 10"
    academic_level VARCHAR(50),           -- e.g., "Beginner", "Intermediate", "Advanced"
    curriculum_language VARCHAR(10),      -- e.g., "fr", "en", "ar"

    -- Teacher-specific
    school_name VARCHAR(255),
    subjects_taught TEXT[],               -- Array of subjects

    -- Preferences
    preferred_language VARCHAR(10) DEFAULT 'en',
    theme VARCHAR(20) DEFAULT 'system',   -- light, dark, system
    notifications_enabled BOOLEAN DEFAULT true,

    -- Learning profile (detected by RAYA)
    learning_style VARCHAR(50),           -- visual, auditory, kinesthetic, reading

    -- Subscription
    subscription_plan VARCHAR(20) DEFAULT 'free' CHECK (subscription_plan IN ('free', 'pro', 'premium', 'institution')),
    subscription_expires_at TIMESTAMP,
    credits_balance INTEGER DEFAULT 0,
    daily_messages_used INTEGER DEFAULT 0,
    daily_messages_reset_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    deleted_at TIMESTAMP                  -- Soft delete
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

---

### 2. CONVERSATIONS

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    title VARCHAR(255),
    preview TEXT,                         -- First message preview

    -- Context (from RAYA prompt)
    subject VARCHAR(100),                 -- e.g., "Mathematics", "French", "Physics"
    topic VARCHAR(255),                   -- Specific topic being discussed
    goal VARCHAR(50),                     -- understand, review, practice

    -- AI Settings used
    ai_model VARCHAR(50) DEFAULT 'gemini-3',
    ai_mode VARCHAR(50) DEFAULT 'normal', -- normal, rush-mode, deep-thinking, creative-mode

    -- Stats
    message_count INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_created ON conversations(created_at DESC);
```

---

### 3. MESSAGES

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

    sender VARCHAR(20) NOT NULL CHECK (sender IN ('user', 'assistant')),
    content TEXT NOT NULL,

    -- AI metadata (for assistant messages)
    ai_model VARCHAR(50),
    ai_mode VARCHAR(50),
    tokens_used INTEGER,
    response_time_ms INTEGER,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
```

---

### 4. FILES (Attachments)

```sql
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- File info
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,    -- UUID-based name in storage
    file_type VARCHAR(50) NOT NULL,       -- image, pdf, document, spreadsheet, other
    mime_type VARCHAR(100),
    file_size BIGINT,                     -- in bytes

    -- Storage
    storage_url TEXT NOT NULL,            -- S3/Cloud Storage URL
    thumbnail_url TEXT,                   -- For images

    -- Processing status
    ocr_text TEXT,                        -- Extracted text (for RAYA multimodal)
    is_processed BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_files_message ON files(message_id);
CREATE INDEX idx_files_user ON files(user_id);
```

---

### 5. AI_INSIGHTS (PKM & Learning Analytics - from RAYA prompt)

```sql
CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,

    -- Session info (from RAYA JSON protocol)
    session_timestamp TIMESTAMP NOT NULL,

    -- Concept tracking
    key_concept VARCHAR(255) NOT NULL,    -- e.g., "Viète's formulas"
    ccs_code VARCHAR(50),                 -- Standardized Concept Code
    subject VARCHAR(100),
    topic VARCHAR(255),

    -- PKM Score breakdown (0.00 - 1.00)
    pkm_global DECIMAL(3,2),              -- Overall understanding
    pkm_reformulation DECIMAL(3,2),       -- 40% weight
    pkm_accuracy DECIMAL(3,2),            -- 30% weight
    pkm_application DECIMAL(3,2),         -- 20% weight
    pkm_feedback DECIMAL(3,2),            -- 10% weight

    -- Understanding level
    mastery_level VARCHAR(20),            -- understood, in_progress, not_understood

    -- Difficulty detection
    difficulty_detected TEXT,             -- Early warning flag
    difficulty_severity VARCHAR(20),      -- low, medium, high, critical

    -- Engagement
    engagement_score DECIMAL(3,2),        -- 0.00 - 1.00
    iteration_count INTEGER,              -- How many attempts

    -- Recommendations
    next_step_recommendations TEXT[],     -- Array of suggestions
    recommended_exercises TEXT[],

    -- Learning style detected
    detected_learning_style VARCHAR(50),  -- visual, auditory, kinesthetic, reading

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Raw JSON for flexibility
    raw_insight_json JSONB
);

CREATE INDEX idx_insights_user ON ai_insights(user_id);
CREATE INDEX idx_insights_concept ON ai_insights(key_concept);
CREATE INDEX idx_insights_subject ON ai_insights(subject);
CREATE INDEX idx_insights_mastery ON ai_insights(mastery_level);
CREATE INDEX idx_insights_created ON ai_insights(created_at DESC);
```

---

### 6. CONCEPT_MASTERY (Aggregated per user per concept)

```sql
CREATE TABLE concept_mastery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Concept info
    ccs_code VARCHAR(50) NOT NULL,
    concept_name VARCHAR(255) NOT NULL,
    subject VARCHAR(100),

    -- Aggregated scores
    current_pkm DECIMAL(3,2),             -- Latest PKM
    average_pkm DECIMAL(3,2),             -- Historical average
    highest_pkm DECIMAL(3,2),

    -- Progress tracking
    attempt_count INTEGER DEFAULT 0,
    last_practiced_at TIMESTAMP,
    mastery_achieved_at TIMESTAMP,        -- When PKM >= 0.85

    -- Spaced repetition
    next_review_at TIMESTAMP,
    review_interval_days INTEGER DEFAULT 1,

    UNIQUE(user_id, ccs_code)
);

CREATE INDEX idx_mastery_user ON concept_mastery(user_id);
CREATE INDEX idx_mastery_subject ON concept_mastery(subject);
CREATE INDEX idx_mastery_review ON concept_mastery(next_review_at);
```

---

### 7. SUBSCRIPTIONS & BILLING

```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    plan VARCHAR(20) NOT NULL,            -- free, pro, premium, institution
    status VARCHAR(20) DEFAULT 'active',  -- active, cancelled, expired, trial

    -- Billing
    price_monthly DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'EUR',
    payment_provider VARCHAR(50),         -- stripe, paypal, mobile_money
    payment_provider_id VARCHAR(255),     -- External subscription ID

    -- Period
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    trial_ends_at TIMESTAMP,
    cancelled_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

---

### 8. PROMO_CODES

```sql
CREATE TABLE promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,

    -- Discount type
    discount_type VARCHAR(20) NOT NULL,   -- percentage, fixed, free_days
    discount_value DECIMAL(10,2),         -- 15 for 15%, or days, or amount

    -- Applicability
    applicable_plans TEXT[],              -- ['pro', 'premium'] or NULL for all

    -- Limits
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    max_uses_per_user INTEGER DEFAULT 1,

    -- Validity
    valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP,

    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_promo_codes_code ON promo_codes(code);
```

---

### 9. PROMO_CODE_USAGES

```sql
CREATE TABLE promo_code_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID REFERENCES promo_codes(id),
    user_id UUID REFERENCES users(id),

    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subscription_id UUID REFERENCES subscriptions(id),

    UNIQUE(promo_code_id, user_id)
);
```

---

### 10. AI_MODELS (Configuration)

```sql
CREATE TABLE ai_models (
    id VARCHAR(50) PRIMARY KEY,           -- e.g., 'gemini-3', 'gpt-4-turbo'

    name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,        -- google, openai, anthropic
    description TEXT,

    -- Capabilities
    features TEXT[],                      -- ['Text', 'Images', 'Code', 'Documents']
    max_tokens INTEGER,
    supports_vision BOOLEAN DEFAULT false,
    supports_files BOOLEAN DEFAULT false,

    -- Cost
    cost_per_request DECIMAL(10,4),       -- In credits

    -- Availability
    is_available BOOLEAN DEFAULT true,
    is_premium BOOLEAN DEFAULT false,
    minimum_plan VARCHAR(20),             -- free, pro, premium

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 11. AI_MODES (Configuration)

```sql
CREATE TABLE ai_modes (
    id VARCHAR(50) PRIMARY KEY,           -- e.g., 'normal', 'rush-mode'

    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),

    -- AI Parameters
    system_prompt TEXT,
    temperature DECIMAL(2,1),
    max_tokens INTEGER,

    -- Availability
    is_premium BOOLEAN DEFAULT false,
    minimum_plan VARCHAR(20),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 12. PROMPT_LIBRARY

```sql
CREATE TABLE prompt_categories (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    emoji VARCHAR(10),
    sort_order INTEGER,
    is_for_teachers BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id VARCHAR(50) REFERENCES prompt_categories(id),

    emoji VARCHAR(10),
    text VARCHAR(255) NOT NULL,           -- Display text
    prompt TEXT NOT NULL,                 -- Full prompt to send

    sort_order INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 13. USER_SESSIONS (Auth)

```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),

    device_info JSONB,                    -- User agent, device type, etc.
    ip_address INET,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
```

---

### 14. USAGE_LOGS (Analytics & Rate Limiting)

```sql
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),

    action_type VARCHAR(50) NOT NULL,     -- message_sent, file_uploaded, model_used

    -- Details
    ai_model VARCHAR(50),
    ai_mode VARCHAR(50),
    tokens_used INTEGER,
    credits_used DECIMAL(10,4),

    -- Request info
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usage_user ON usage_logs(user_id);
CREATE INDEX idx_usage_created ON usage_logs(created_at);
CREATE INDEX idx_usage_action ON usage_logs(action_type);
```

---

### 15. TEACHER_STUDENT_LINKS (For teachers to view student data)

```sql
CREATE TABLE teacher_student_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Permission level
    can_view_insights BOOLEAN DEFAULT true,
    can_view_conversations BOOLEAN DEFAULT false,
    can_assign_exercises BOOLEAN DEFAULT true,

    -- Context
    class_name VARCHAR(100),
    school_year VARCHAR(20),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,

    UNIQUE(teacher_id, student_id)
);

CREATE INDEX idx_links_teacher ON teacher_student_links(teacher_id);
CREATE INDEX idx_links_student ON teacher_student_links(student_id);
```

---

## API Endpoints Required

### Authentication
```
POST   /api/auth/register          - Create account
POST   /api/auth/login             - Login
POST   /api/auth/logout            - Logout
POST   /api/auth/refresh           - Refresh token
POST   /api/auth/forgot-password   - Request password reset
POST   /api/auth/reset-password    - Reset password
DELETE /api/auth/account           - Delete account
```

### User Profile
```
GET    /api/user/profile           - Get current user
PATCH  /api/user/profile           - Update profile
PATCH  /api/user/preferences       - Update preferences (language, theme, etc.)
POST   /api/user/onboarding        - Save country, grade, academic level
```

### Conversations
```
GET    /api/conversations          - List user's conversations
POST   /api/conversations          - Create new conversation
GET    /api/conversations/:id      - Get conversation with messages
PATCH  /api/conversations/:id      - Update conversation (title, archive)
DELETE /api/conversations/:id      - Delete conversation
```

### Messages
```
POST   /api/conversations/:id/messages    - Send message (triggers AI response)
GET    /api/conversations/:id/messages    - Get messages (paginated)
```

### Files
```
POST   /api/files/upload           - Upload file(s)
GET    /api/files/:id              - Get file info
DELETE /api/files/:id              - Delete file
```

### AI
```
POST   /api/ai/chat                - Send message and get AI response (streaming)
GET    /api/ai/models              - List available models
GET    /api/ai/modes               - List available modes
```

### Insights (For teachers)
```
GET    /api/insights/my            - Get own insights (students)
GET    /api/insights/students      - Get students' insights (teachers)
GET    /api/insights/student/:id   - Get specific student insights
GET    /api/insights/concepts      - Get concept mastery overview
```

### Prompts
```
GET    /api/prompts                - Get prompt library
```

### Subscriptions
```
GET    /api/subscription           - Get current subscription
POST   /api/subscription/upgrade   - Upgrade plan
POST   /api/subscription/cancel    - Cancel subscription
POST   /api/promo-codes/validate   - Validate promo code
POST   /api/promo-codes/apply      - Apply promo code
```

---

## Frontend-Backend Connection Flow

### 1. Authentication Flow
```
┌─────────────┐     POST /auth/login      ┌─────────────┐
│   Frontend  │ ──────────────────────────▶│   Backend   │
│  (Next.js)  │                            │  (API)      │
│             │◀────────────────────────── │             │
└─────────────┘    { token, user }         └─────────────┘
       │                                          │
       │  Store token in                          │
       │  httpOnly cookie                         │
       ▼                                          ▼
┌─────────────┐                            ┌─────────────┐
│ localStorage│                            │  Database   │
│ (user info) │                            │ (sessions)  │
└─────────────┘                            └─────────────┘
```

### 2. Chat Message Flow
```
┌─────────────┐                            ┌─────────────┐
│   User      │                            │   RAYA AI   │
│   types     │                            │   (Gemini)  │
└──────┬──────┘                            └──────▲──────┘
       │                                          │
       ▼                                          │
┌─────────────┐     POST /ai/chat          ┌─────────────┐
│  ChatInput  │ ──────────────────────────▶│   Backend   │
│  Component  │                            │             │
│             │◀─────────────────────────  │  1. Save    │
│             │    SSE Stream Response     │     message │
└─────────────┘                            │  2. Call AI │
       │                                   │  3. Stream  │
       │  Update messages[]                │  4. Save    │
       │  state in real-time               │     response│
       ▼                                   │  5. Generate│
┌─────────────┐                            │     insight │
│ MessageList │                            └─────────────┘
│  renders    │                                   │
│  response   │                                   ▼
└─────────────┘                            ┌─────────────┐
                                           │  Database   │
                                           │  messages + │
                                           │  ai_insights│
                                           └─────────────┘
```

### 3. AI Insight Generation Flow (from RAYA prompt)
```
┌─────────────────────────────────────────────────────────┐
│                    RAYA AI Response                      │
│                                                          │
│  User visible part:                                      │
│  "Pour résoudre cette équation, commençons par..."      │
│                                                          │
│  Hidden JSON (parsed by backend):                        │
│  {                                                       │
│    "insight": {                                          │
│      "session_timestamp": "2024-02-05T18:30:00Z",       │
│      "key_concept": "Équations du second degré",        │
│      "ccs_code": "MATH-ALG-EQ2D",                       │
│      "mastery_score": {                                  │
│        "global": 0.72,                                   │
│        "reformulation": 0.80,                            │
│        "accuracy": 0.65,                                 │
│        "application": 0.70,                              │
│        "feedback": 0.75                                  │
│      },                                                  │
│      "difficulty_detected": "Factorisation complexe",   │
│      "engagement_score": 0.85,                          │
│      "next_step_recommendations": [                      │
│        "Pratiquer plus d'exercices de factorisation",   │
│        "Revoir les identités remarquables"              │
│      ],                                                  │
│      "preferred_learning_style": "visual"               │
│    }                                                     │
│  }                                                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      Backend                             │
│                                                          │
│  1. Parse response, extract JSON insight                 │
│  2. Store visible text in messages table                 │
│  3. Store insight in ai_insights table                   │
│  4. Update concept_mastery for the user                  │
│  5. Return only visible text to frontend                 │
└─────────────────────────────────────────────────────────┘
```

### 4. Teacher Dashboard Flow
```
┌─────────────┐                            ┌─────────────┐
│  Teacher    │     GET /insights/students │   Backend   │
│  Dashboard  │ ──────────────────────────▶│             │
│             │                            │  Query      │
│             │◀────────────────────────── │  linked     │
│             │    Aggregated insights     │  students'  │
└─────────────┘                            │  ai_insights│
       │                                   └─────────────┘
       │  Display:
       │  - Class average PKM
       │  - Students struggling
       │  - Common difficulties
       │  - Recommended actions
       ▼
┌─────────────────────────────────────────┐
│  📊 Class Overview                       │
│  ─────────────────────────────────────── │
│  Average PKM: 0.68                       │
│  Students mastered: 12/25                │
│                                          │
│  ⚠️ Common difficulties:                 │
│  - Factorisation (8 students)            │
│  - Équations paramétriques (5 students)  │
│                                          │
│  📈 Top performers:                      │
│  - Marie D. (PKM: 0.92)                  │
│  - Lucas M. (PKM: 0.88)                  │
└─────────────────────────────────────────┘
```

---

## Data Flow Summary

```
┌────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Auth    │  │  Chat    │  │ Sidebar  │  │ Settings │       │
│  │  Pages   │  │  Page    │  │          │  │  Modals  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
└───────┼─────────────┼─────────────┼─────────────┼──────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌────────────────────────────────────────────────────────────────┐
│                      API LAYER (REST + SSE)                     │
│  /auth/*    /ai/chat    /conversations/*    /user/*            │
└────────────────────────────────────────────────────────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌────────────────────────────────────────────────────────────────┐
│                         BACKEND                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Auth    │  │   AI     │  │  CRUD    │  │  Insight │       │
│  │ Service  │  │ Service  │  │ Services │  │ Parser   │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
└───────┼─────────────┼─────────────┼─────────────┼──────────────┘
        │             │             │             │
        │             ▼             │             │
        │      ┌──────────┐        │             │
        │      │  Gemini  │        │             │
        │      │   API    │        │             │
        │      └──────────┘        │             │
        │                          │             │
        ▼             ▼            ▼             ▼
┌────────────────────────────────────────────────────────────────┐
│                       DATABASE                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │  users  │ │messages │ │ files   │ │insights │ │ subs    │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
└────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────┐
│                    FILE STORAGE (S3/Cloud)                      │
│  /uploads/images/*, /uploads/documents/*, /uploads/pdfs/*      │
└────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack Recommendations

### Backend Options
1. **Node.js + Express/Fastify** - JavaScript ecosystem, fast development
2. **Python + FastAPI** - Great for AI integration, async support
3. **Next.js API Routes** - Keep everything in one repo (recommended for MVP)

### Database
- **PostgreSQL** - Robust, supports JSONB for flexible insight data
- **Redis** - For caching, rate limiting, session storage

### File Storage
- **AWS S3** or **Cloudflare R2** - For uploaded files
- **Vercel Blob** - If staying in Vercel ecosystem

### AI Integration
- **Google AI SDK** - For Gemini models
- **OpenAI SDK** - For GPT models (future)
- **Anthropic SDK** - For Claude (future)

### Auth
- **NextAuth.js** - Easy integration with Next.js
- **JWT** - For API authentication

---

## Environment Variables Needed

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/raya

# Auth
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# AI
GOOGLE_AI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-claude-key

# File Storage
AWS_S3_BUCKET=raya-uploads
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# Payments (future)
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# App
NEXT_PUBLIC_APP_URL=https://raya.thebluestift.com
```

---

## Summary

Cette base de données couvre:
- ✅ **Users** avec rôles (student/teacher/admin)
- ✅ **Conversations** et **Messages** avec fichiers
- ✅ **AI Insights** (PKM, mastery, difficulties) - requis par RAYA prompt
- ✅ **Concept Mastery** agrégé par utilisateur
- ✅ **Subscriptions** et **Promo Codes**
- ✅ **AI Models/Modes** configurables
- ✅ **Teacher-Student links** pour le suivi
- ✅ **Usage logs** pour analytics et rate limiting
- ✅ **Prompt library** dynamique

Le frontend actuel est prêt pour cette intégration - il suffit de remplacer les données mock par des appels API réels.
