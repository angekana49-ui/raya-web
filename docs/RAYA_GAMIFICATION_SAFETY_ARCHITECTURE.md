# RAYA MVP - Safe Gamification and Insight Architecture

## Context
RAYA is currently a chatbot (not yet agentic), but it must power:
- user-facing game UX (missions, XP, badges, progress),
- school-facing educational insights,
- individualized learning paths.

This is high-risk if AI text is used directly as truth.

## Core Principle
Never use raw chatbot text as the source of truth for progression, XP, or school reports.

Use a 2-layer model:
1. LLM layer: proposes insights/claims.
2. Backend rules layer: validates claims and computes final state deterministically.

## Responsibility Split
### AI (chatbot)
- Proposes personalized mission/exercise suggestions.
- Suggests potential outcomes as structured claims.
- Adapts tone, examples, and pacing per learner.

### Backend rules engine
- Validates completion criteria.
- Computes XP and progression.
- Applies anti-abuse rules.
- Persists validated events/state.
- Produces school reports.

## Data Model Strategy
## 1) Immutable Event Bucket (Source of Truth)
Store all validated learning events in an append-only event log.

Examples:
- `message_sent`
- `exercise_submitted`
- `quiz_correct`
- `mission_step_completed`
- `mission_completed`
- `xp_awarded`

## 2) Derived Student State
Materialize current state from events:
- XP total,
- level,
- streak,
- mission progress,
- skill mastery estimates.

This state must be recalculable from event log.

## 3) School Reporting Layer
Generate reporting views from validated events/state only (never raw LLM text).

## Fairness vs Personalization
Personalized content is good.
Arbitrary rewards are dangerous.

### Fair model
- Missions come from normalized mission types (difficulty + skill bands).
- AI chooses/adapts content inside a mission type.
- XP comes from fixed formulas per mission type and objective completion signals.
- Equal challenge profile => equal reward profile.

## Suggested MVP Rule Design
- Mission types have predefined XP range and completion criteria.
- Completion must meet objective checks (format, minimal quality, required steps).
- Daily/session caps prevent abuse.
- Cooldowns for repeat farming.
- Rule versioning (`rule_version`) on each awarded outcome.

## Suggested Structured Claim Contract (from LLM)
AI can emit claims like:
- `mission_type`
- `difficulty_band`
- `skill_tags`
- `completion_candidate`
- `confidence`

Backend decides final acceptance/rejection.

## Critical Guardrails
- Strict JSON schema validation.
- Idempotency keys to avoid double counting.
- "No validation => no state update" fallback.
- Audit trail with reason codes.
- Rate limits and caps.

## UI Implications (MVP)
The current UI can display:
- XP level bar and badge previews,
- mission progress and steps,
- skills progress and focus suggestions,
- motivational animated elements.

But all final numbers should come from backend-validated state.

## Near-Term Architecture Path
### Phase 1 (now)
- Chatbot + deterministic rules engine + event log.
- No full agent required.

### Phase 2 (when cashflow grows)
- Agentic orchestration for planning/memory/tooling.
- Keep the same deterministic scoring and reporting backbone.

## Bottom Line
You do not need a full agent to launch safely.
You do need strict separation:
- AI for pedagogy and personalization,
- backend rules for truth, fairness, and reporting.

That separation is what protects product trust, school contracts, and long-term scalability.
