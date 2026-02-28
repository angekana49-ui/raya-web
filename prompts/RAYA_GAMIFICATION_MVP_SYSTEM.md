# RAYA Gamification MVP System

## Purpose
This document defines the **MVP add-on system** for RAYA to increase student retention through light, meaningful gamification while preserving the educational core.

It includes:
- prompt patch to append to the current RAYA V2 system prompt,
- product rules for XP/streak/missions/skills,
- database schema for this system only.

---

## 1) Prompt Add-On (Append to Current RAYA V2 Prompt)

Add this section **after** your current tutoring and insight rules.

```md
## GAMIFICATION INTEGRITY LAYER (MVP)

You are not only a tutor; you are also a progression signal source for the app.
Your pedagogical priority remains: teach, validate, and prevent copy-paste behavior.

### A. Core Principle
- Never reward passive behavior.
- Reward only demonstrated student effort and reasoning.
- Keep motivation high, but never fake mastery.

### B. Countable Effort Criteria
Set `attempt_detected=true` only if at least one is true:
1. Student provides a concrete attempt (partial or full),
2. Student explains their reasoning in their own words,
3. Student answers a validation check you asked.

If none is true, set `attempt_detected=false`.

### C. Anti-Cheat Rule
If the student requests direct copyable answers without effort:
- stay in coaching mode,
- ask for first step attempt,
- set `attempt_detected=false`,
- set `effort_score=0`.

### D. Lightweight Motivation
- Keep tone encouraging and forward-moving.
- Celebrate effort, not just correctness.
- Do not mention internal scoring mechanics unless explicitly asked.

### E. Mandatory Insight Block
For academic turns, return this exact tagged block:

---RAYA_INSIGHT_MVP---
{
  "turn_type": "diagnostic|teaching|validation|practice|exam",
  "attempt_detected": true,
  "effort_score": 0,
  "mastery_delta": 0.0,
  "skill_key": "string_or_null",
  "gap_detected": "string_or_null",
  "next_step": "short actionable recommendation"
}
---END_RAYA_INSIGHT_MVP---

Rules:
- `effort_score` range: 0..100
- `mastery_delta` range: -0.20..+0.20
- if off-topic/social: return
  - `turn_type="practice"`
  - `attempt_detected=false`
  - `effort_score=0`
  - `mastery_delta=0`
  - `skill_key=null`
  - `gap_detected=null`
  - `next_step="Return to an academic task"`
```

---

## 2) MVP Product Rules (App/Backend)

These rules are enforced by backend, not by the model.

### 2.1 XP Rules
- Base XP awarded only if `attempt_detected=true`.
- Suggested formula:
  - `base = min(20, round(effort_score / 5))`
  - `mastery_bonus = round(max(0, mastery_delta) * 40)`
  - `turn_xp = base + mastery_bonus`
- If `attempt_detected=false`, `turn_xp = 0`.
- Daily XP cap (MVP): `200`.

### 2.2 Streak Rules
- A streak day is valid if user has at least one turn with:
  - `attempt_detected=true` and `turn_xp > 0`.
- Grace window: 1 missed day.
- Store `last_active_date`, `streak_count`, `grace_used`.

### 2.3 Daily Mission (Single)
- One mission per day, simple and finite.
- Example mission types:
  - `countable_turns >= 2`
  - `one_validation_correct`
  - `one_gap_fixed`
- Mission reward: +25 XP (subject to daily cap).

### 2.4 Skill Progress
- Track 3-6 skill buckets max in MVP.
- Update skill progress from `mastery_delta`.
- Clamp progress 0..100.

### 2.5 Anti-Farming Guardrails
- Repeated identical low-effort prompts: zero XP.
- Hard cap countable turns/day for bonus logic (example: 20).
- Ignore turns shorter than a minimum useful threshold (optional).

---

## 3) Database Schema (System Only)

PostgreSQL / Supabase SQL (minimal MVP tables).

```sql
-- 1) Profile-level progression state
create table if not exists user_progress_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp integer not null default 0,
  level integer not null default 1,
  streak_count integer not null default 0,
  grace_used boolean not null default false,
  last_active_date date,
  daily_xp integer not null default 0,
  daily_xp_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Skill progression by user
create table if not exists user_skill_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_key text not null,
  progress numeric(5,2) not null default 0, -- 0..100
  attempts_count integer not null default 0,
  successes_count integer not null default 0,
  last_gap text,
  updated_at timestamptz not null default now(),
  unique(user_id, skill_key)
);

-- 3) Turn-level insight + awarded score log (audit-friendly)
create table if not exists learning_turn_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid,
  message_id text,
  turn_type text not null,
  attempt_detected boolean not null default false,
  effort_score integer not null default 0,
  mastery_delta numeric(4,2) not null default 0,
  skill_key text,
  gap_detected text,
  next_step text,
  awarded_xp integer not null default 0,
  source_model text,
  created_at timestamptz not null default now()
);

-- 4) Daily mission state
create table if not exists user_daily_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_date date not null,
  mission_type text not null,
  target_value integer not null,
  current_value integer not null default 0,
  completed boolean not null default false,
  reward_xp integer not null default 25,
  completed_at timestamptz,
  unique(user_id, mission_date)
);

-- 5) Optional compact XP transactions
create table if not exists xp_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, -- turn_xp | mission_reward | correction | admin
  amount integer not null,
  ref_id uuid, -- can reference learning_turn_events.id or user_daily_missions.id
  created_at timestamptz not null default now()
);

-- Useful indexes
create index if not exists idx_learning_turn_events_user_created
  on learning_turn_events(user_id, created_at desc);

create index if not exists idx_user_daily_missions_user_date
  on user_daily_missions(user_id, mission_date desc);
```

---

## 4) Integration Notes (MVP)

1. Parse insight block `RAYA_INSIGHT_MVP` in backend route after each assistant turn.
2. Compute XP with backend rules.
3. Upsert `user_progress_state`, `user_skill_progress`.
4. Insert audit row in `learning_turn_events`.
5. Evaluate/update today mission in `user_daily_missions`.
6. Return a compact UI payload to frontend:
   - `turn_xp`,
   - `daily_xp`,
   - `streak_count`,
   - `mission_progress`,
   - `updated_skills` (top 3 only).

---

## 5) MVP Boundaries

- Keep visual gamification subtle (micro-feedback only).
- No complex leaderboards in MVP.
- No competitive social mechanics in MVP.
- Focus on personal progress loop and daily return behavior.

