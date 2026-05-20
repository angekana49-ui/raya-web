# Changes Summary

This document summarizes the recent updates applied to the project.

## Security improvements
- Rotated and replaced access keys and tokens used by the deployment pipeline to limit exposure.
- Strengthened onboarding flows and restored access keys handling to reduce account takeover risk.
- Hardened RPCs and Row-Level Security (RLS) policies to avoid recursion and limit privileged operations.

## Database / Backend
- Added `create_study_room` RPC to centralize room creation and avoid direct client-table inserts.
- Fixed RLS recursion in `study_room_participants` and related policies to prevent infinite recursion errors.
- Added migration files under `supabase/migrations/` (local copy). Apply migrations to your DB using your normal process.

## Frontend / UI
- Improved frontend error handling for RPC calls so errors are logged and surfaced correctly.
- Fixed sidebar overlap and nesting issues on mobile devices (responsive layout corrections).
- Minor UI refinements to room creation flow and onboarding nudges.

## Memory & Cache
- Improved the memory cache and context handling to reduce stale state and improve restore reliability.

## Notes
- The `supabase/` folder has been added to `.gitignore` to avoid committing local secrets and infra state.
- Please run your normal migration/apply steps on your Supabase environment to apply the new migrations and RPC functions.

If you want a shorter commit message, use: "Security improvements, UI refinements, memory persistence updates".
