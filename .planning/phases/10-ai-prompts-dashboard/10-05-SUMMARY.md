---
phase: 10-ai-prompts-dashboard
plan: 05
subsystem: api
tags: [grading, prompts, n8n, database, ai]

# Dependency graph
requires:
  - phase: 10-01
    provides: AI prompts database schema and getPrompt function
provides:
  - Grading APIs load prompts from database
  - Text and audio grading prompts seeded in database
  - Coaches can customize grading behavior via AI Prompts dashboard
affects: [grading, n8n-workflows, coach-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Database prompt loading with hardcoded fallback for graceful degradation
    - Template placeholder substitution ({{variable}} syntax)

key-files:
  created: []
  modified:
    - src/db/seed.ts
    - src/app/api/grade/route.ts
    - src/app/api/grade-audio/route.ts
    - src/lib/grading.ts

key-decisions:
  - "Template placeholder syntax: {{variableName}} for dynamic content"
  - "Leave {{transcription}} placeholder for n8n to fill after speech-to-text"
  - "Include prompt in n8n payload (gradingRequest.prompt and FormData.prompt)"

patterns-established:
  - "Grading API prompt loading pattern: getPrompt(slug, DEFAULT) with fallback"

# Metrics
duration: 3min
completed: 2026-01-28
---

# Phase 10 Plan 05: Wire Grading APIs to Database Prompts Summary

**Grading APIs now load customizable prompts from database, enabling coaches to modify grading behavior through AI Prompts dashboard**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-28T06:17:42Z
- **Completed:** 2026-01-28T06:21:24Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Grading prompts seeded in database (grading-text-prompt, grading-audio-prompt)
- Text grading API loads prompt from database with hardcoded fallback
- Audio grading API loads prompt from database with hardcoded fallback
- Prompts included in n8n webhook payloads for processing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add grading prompts to seed.ts** - `fe1918c` (feat)
2. **Task 2: Wire grade/route.ts to database prompts** - `a82d4d8` (feat)
3. **Task 3: Wire grade-audio/route.ts to database prompts** - `0daf713` (feat)

## Files Created/Modified

- `src/db/seed.ts` - Added grading-text-prompt and grading-audio-prompt seed entries with fixed UUIDs
- `src/app/api/grade/route.ts` - Added getPrompt import, default constant, prompt loading and substitution
- `src/app/api/grade-audio/route.ts` - Added getPrompt import, default constant, prompt loading and FormData append
- `src/lib/grading.ts` - Added optional prompt field to GradingRequest interface

## Decisions Made

- Template placeholder syntax uses {{variableName}} for consistency with voice AI prompts
- Audio grading leaves {{transcription}} placeholder for n8n to fill after speech-to-text processing
- Both APIs include the customized prompt in their n8n payloads (JSON prompt field for text, FormData prompt field for audio)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Grading prompts will be created when running `npm run db:seed`.

## Next Phase Readiness

- Phase 10 gap closure complete
- All grading APIs now use database-backed prompts
- Coaches can customize grading prompts through AI Prompts dashboard at /admin/prompts
- Run `npm run db:seed` to create grading prompt entries in database

---
*Phase: 10-ai-prompts-dashboard*
*Completed: 2026-01-28*
