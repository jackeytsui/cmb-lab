---
phase: 31-practice-data-model-exercise-crud
plan: 01
subsystem: database
tags: [drizzle, postgres, zod, jsonb, discriminated-union, exercise-types, pgEnum]

# Dependency graph
requires:
  - phase: 24-tags-bulk-operations
    provides: existing schema patterns, barrel export structure
provides:
  - 4 practice tables (practice_sets, practice_exercises, practice_set_assignments, practice_attempts)
  - 3 new pgEnums (exercise_type, practice_set_status, assignment_target_type)
  - ExerciseDefinition TypeScript union type for 6 exercise types
  - Zod discriminated union schema (exerciseDefinitionSchema) for runtime validation
  - exerciseFormSchema for full exercise form validation
  - shadcn Tabs component
affects: [31-02, 31-03, 31-04, 31-05, 31-06, 32-practice-set-builder, 33-practice-player, 34-assignments]

# Tech tracking
tech-stack:
  added: ["@radix-ui/react-tabs (via shadcn)"]
  patterns: ["JSONB discriminated union with pgEnum type column and .$type<>() for type safety", "Zod v4 z.discriminatedUnion for exercise definition validation"]

key-files:
  created:
    - src/types/exercises.ts
    - src/db/schema/practice.ts
    - src/components/ui/tabs.tsx
  modified:
    - src/db/schema/index.ts

key-decisions:
  - "Reuse interactionLanguageEnum from interactions.ts instead of creating new enum"
  - "JSONB definition column typed with .$type<ExerciseDefinition>() for compile-time safety"
  - "Unique constraint on (practiceSetId, targetType, targetId) prevents duplicate assignments"
  - "Soft delete via deletedAt on practiceSets and practiceExercises (matches project pattern)"

patterns-established:
  - "JSONB discriminated union: pgEnum type column + jsonb definition column + .$type<UnionType>()"
  - "Zod discriminated union: z.discriminatedUnion('type', [...schemas]) for exercise validation"
  - "Exercise form schema: separate Zod schema wrapping definition with metadata (set ID, language, sort order)"

# Metrics
duration: 7min
completed: 2026-02-06
---

# Phase 31 Plan 01: Practice Data Model & Exercise Types Summary

**4 practice tables with JSONB discriminated union pattern, 6 exercise type interfaces with Zod v4 validation schemas, and shadcn Tabs component**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-06T15:20:18Z
- **Completed:** 2026-02-06T15:28:17Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Created TypeScript interfaces and Zod schemas for all 6 exercise types (MCQ, fill-in-blank, matching, ordering, audio recording, free text)
- Created 4 database tables (practice_sets, practice_exercises, practice_set_assignments, practice_attempts) with 3 enums
- Reused existing interactionLanguageEnum from interactions.ts (no duplication)
- Installed shadcn Tabs component for exercise preview UI
- Verified migration file contains correct DDL for all 4 tables with proper foreign keys and unique constraints

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TypeScript types and Zod schemas for all 6 exercise types** - `3184ed1` (feat)
2. **Task 2: Create database schema with 4 tables, 3 enums, and relations** - `ba85961` (feat)
3. **Task 3: Update barrel export, install shadcn Tabs, push schema to database** - `5f7fdf9` (chore)

## Files Created/Modified
- `src/types/exercises.ts` - 6 exercise definition interfaces, ExerciseDefinition union type, 6 Zod schemas, discriminated union schema, exerciseFormSchema
- `src/db/schema/practice.ts` - 4 tables (practice_sets, practice_exercises, practice_set_assignments, practice_attempts), 3 enums, Drizzle relations, type inference exports
- `src/db/schema/index.ts` - Added `export * from "./practice"` barrel export
- `src/components/ui/tabs.tsx` - shadcn Tabs component (Radix UI)
- `package.json` / `package-lock.json` - Added @radix-ui/react-tabs dependency

## Decisions Made
- Reused `interactionLanguageEnum` from interactions.ts (values: cantonese, mandarin, both) -- avoids duplicate pgEnum in Postgres
- Used `.$type<ExerciseDefinition>()` on the JSONB definition column for compile-time type safety
- Added unique constraint on `(practiceSetId, targetType, targetId)` in practice_set_assignments to prevent duplicate assignments
- Used soft delete pattern (deletedAt column) on practiceSets and practiceExercises, matching existing project convention

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run db:push` prompts interactively for table rename/create choices when there is existing schema drift in the database (unrelated tables from n8n workflows). Used `npm run db:generate` instead as fallback per plan instructions. Migration generation confirmed "No schema changes, nothing to migrate" meaning migration files already include the practice tables.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 6 exercise type definitions and Zod schemas ready for form components (Plan 02-05)
- Database schema fully defined with relations and type exports
- shadcn Tabs component available for exercise preview tabbed UI
- Migration file contains all DDL; user should run `npm run db:push` manually or apply migration to create tables in Neon if not yet present

## Self-Check: PASSED

---
*Phase: 31-practice-data-model-exercise-crud*
*Completed: 2026-02-06*
