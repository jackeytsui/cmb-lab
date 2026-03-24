---
phase: 75-lto-student-access-mandarin-accelerator
plan: 01
subsystem: access-control, database, navigation
tags: [feature-gating, schema, sidebar, tag-system]
dependency_graph:
  requires: []
  provides: [mandarin_accelerator-feature-key, accelerator-db-tables, accelerator-seed-tag]
  affects: [permissions, sidebar-navigation, tag-feature-access]
tech_stack:
  added: []
  patterns: [tag-feature-override, feature-gated-sidebar-section]
key_files:
  created:
    - src/db/schema/accelerator.ts
    - src/scripts/seed-accelerator-tag.ts
    - src/db/migrations/0033_ancient_odin.sql
  modified:
    - src/lib/permissions.ts
    - src/components/auth/FeatureGate.tsx
    - src/components/layout/AppSidebar.tsx
    - src/db/schema/index.ts
decisions:
  - Used existing tag-feature override system (no new infra needed for LTO gating)
  - Seeded tag as system type consistent with GHL auto-created tags
  - Placed Mandarin Accelerator sidebar section between Review and Coach Tools
metrics:
  duration: 277s
  completed: 2026-03-24T22:37:40Z
---

# Phase 75 Plan 01: Mandarin Accelerator Infrastructure Summary

Feature key, 7 DB tables, sidebar nav section, and seed tag for LTO student access gating via existing tag-feature override system.

## What Was Done

### Task 1: Add mandarin_accelerator feature key and sidebar section (a24b475)
- Added `mandarin_accelerator` to `FEATURE_KEYS` array in `src/lib/permissions.ts`
- Added label `"Mandarin Accelerator"` to `FEATURE_LABELS` in `src/components/auth/FeatureGate.tsx`
- Added `mandarin_accelerator` to local `FeatureKey` type in `AppSidebar.tsx`
- Added Mandarin Accelerator sidebar section with 3 nav items:
  - Typing Unlock Kit (`/dashboard/accelerator/typing`)
  - Conversation Scripts (`/dashboard/accelerator/scripts`)
  - AI Reader (Curated) (`/dashboard/accelerator/reader`)
- All items gated by `featureKey: "mandarin_accelerator"` -- section hidden for non-LTO students

### Task 2: Create Accelerator DB schema and run migration (b4e14ea)
- Created `src/db/schema/accelerator.ts` with 7 tables and 1 enum:
  - `typingLanguageEnum` (mandarin, cantonese)
  - `typingSentences` -- typing drill content with language, Chinese text, English prompt, romanisation
  - `typingProgress` -- per-student completion tracking with unique (userId, sentenceId)
  - `conversationScripts` -- scenario metadata with speaker/responder roles
  - `scriptLines` -- dialogue lines with Cantonese + Mandarin text, romanisation, audio URLs
  - `scriptLineProgress` -- self-rating tracking with unique (userId, lineId)
  - `curatedPassages` -- preloaded Reader passages with title and body
  - `passageReadStatus` -- read tracking with unique (userId, passageId)
- All progress tables have `onDelete: cascade` on user and parent FK references
- Added Drizzle relations for all parent-child relationships
- Exported from `src/db/schema/index.ts`
- Generated migration `0033_ancient_odin.sql`

### Task 3: Seed feature:enable:mandarin_accelerator tag (4395636)
- Created idempotent seed script at `src/scripts/seed-accelerator-tag.ts`
- Seeds tag with type "system", amber color (#f59e0b), descriptive text
- No changes needed to GHL webhook handler -- existing `processInboundTagUpdate` handles auto-creation
- No changes needed to admin tag UI -- existing `TagManager` can assign any tag
- Both paths (admin manual + GHL auto-sync) grant feature via existing `parseFeatureTag()` + `applyFeatureTagOverrides()`

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Tag type = "system"**: Consistent with GHL auto-created tags, distinguishes from coach-created tags
2. **Sidebar placement**: Mandarin Accelerator section placed after Review and before Coach Tools (logical grouping: student features before coach/admin)
3. **Migration includes other pending schema**: drizzle-kit bundled app_settings and audio_lesson_notes tables that were already in schema but unmigrated -- this is expected behavior

## Verification Results

- TypeScript compilation: PASS (no errors)
- Feature key in permissions.ts: 1 occurrence
- Feature key in AppSidebar.tsx: 4 occurrences (type + 3 nav items)
- Schema exports: 7 tables + 1 enum + 7 relations
- Seed script: exists and is idempotent
