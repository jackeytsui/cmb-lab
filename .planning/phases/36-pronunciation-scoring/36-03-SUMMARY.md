---
phase: 36-pronunciation-scoring
plan: 03
subsystem: coach-dashboard
tags: [pronunciation-review, coach-ui, voice-ai, practice-topics, drizzle-query, per-character-accuracy]
requires:
  - phase: 36-pronunciation-scoring
    provides: PronunciationAssessmentResult type and GradeResult.pronunciationDetails from practiceAttempts JSONB
  - phase: 33-practice-set-player
    provides: practiceAttempts table with results JSONB column, practiceExercises with JSONB definition
  - phase: 35-enhanced-chatbot
    provides: my-conversations page with expandable transcript view
provides:
  - Coach pronunciation review dashboard at /coach/pronunciation with per-character accuracy display
  - Coach dashboard navigation cards (pronunciation, conversations, students)
  - Enhanced voice AI with PRACTICE TOPICS section for proactive exercise suggestions
  - PRON-04 verification (student conversation history browsing already functional)
affects:
  - Future coach analytics phases may extend pronunciation review with filtering and aggregation
tech-stack:
  added: []
  patterns: [coach-review-dashboard, jsonb-application-filter, exercise-definition-lookup, proactive-ai-topics]
key-files:
  created:
    - src/app/(dashboard)/coach/pronunciation/page.tsx
  modified:
    - src/app/(dashboard)/coach/page.tsx
    - src/lib/lesson-context.ts
key-decisions:
  - "JSONB filtering in application code: pronunciation attempts extracted from practiceAttempts.results JSONB in JS rather than Drizzle JSONB operators (simpler, small result set limit 100)"
  - "Batch exercise lookup: collect unique practiceSetIds, inArray query for exercises, Map-based lookup for targetPhrase resolution"
  - "Coach dashboard restructured with navigation cards grid (pronunciation/conversations/students) above submission queue"
  - "PRON-04 verified as already implemented: my-conversations page shows full conversation history with expandable transcripts"
  - "PRACTICE TOPICS section added to DEFAULT_LESSON_TEMPLATE with 4 exercise types derived from vocabulary"
patterns-established:
  - "Coach review pattern: server component with role gate, 30-day window query, JSONB extraction, per-item card display"
  - "Navigation cards pattern: grid of Link-wrapped Cards with icon, title, description, ChevronRight, color-coded hover"
duration: 5min
completed: 2026-02-07
---

# Phase 36 Plan 03: Coach Review & Voice AI Topics Summary

**Coach pronunciation review dashboard with per-character accuracy display, navigation cards on coach home, and enhanced voice AI with proactive PRACTICE TOPICS suggestions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-07T06:56:48Z
- **Completed:** 2026-02-07T07:03:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Coach can view student pronunciation attempts at /coach/pronunciation with overall scores, per-character accuracy badges (green/yellow/red), sub-scores (accuracy, fluency, completeness), target phrases, and recognized text
- Coach dashboard restructured with navigation card grid (Pronunciation Review, Conversations, Students) above submission queue
- Voice AI system prompt now includes PRACTICE TOPICS section with 4 exercise types (pronunciation drills, sentence building, conversational practice, comparison exercises) derived from lesson vocabulary
- PRON-04 verified as already complete: my-conversations page shows conversation history with expandable transcripts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create coach pronunciation review dashboard** - `4d6c751` (feat)
2. **Task 2: Enhance voice AI practice topic suggestions and verify PRON-04** - `d91958b` (feat)

## Files Created/Modified
- `src/app/(dashboard)/coach/pronunciation/page.tsx` - Coach pronunciation review page (325 lines) with role gate, 30-day query, JSONB extraction, per-character badges
- `src/app/(dashboard)/coach/page.tsx` - Coach dashboard with navigation cards grid (pronunciation, conversations, students)
- `src/lib/lesson-context.ts` - Enhanced DEFAULT_LESSON_TEMPLATE with PRACTICE TOPICS section

## Decisions Made
- JSONB filtering done in application code (not Drizzle JSONB operators) for simplicity on small result sets (limit 100)
- Batch exercise lookup via inArray + Map for efficient targetPhrase resolution across multiple practice sets
- Coach dashboard navigation cards use color-coded themes: cyan for pronunciation, violet for conversations, amber for students
- PRON-04 (conversation history browsing) verified as already implemented by my-conversations page -- no code changes needed
- PRACTICE TOPICS section uses 4 structured exercise types that the AI can proactively suggest based on lesson vocabulary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Build prerender fails on pre-existing Clerk publishableKey issue (unrelated /admin/ai-logs page). TypeScript compilation passes cleanly. This is a known pre-existing issue not introduced by this plan.

## User Setup Required

None - no external service configuration required. Azure Speech credentials were configured in 36-01.

## Next Phase Readiness
- Phase 36 (Pronunciation Scoring) is now complete: all 3 plans delivered
- Azure pronunciation service (36-01), student UI (36-02), and coach review (36-03) are all functional
- Voice AI enhanced with proactive practice topic suggestions
- PRON-04 and PRON-05 satisfied in this plan

## Self-Check: PASSED

---
*Phase: 36-pronunciation-scoring*
*Completed: 2026-02-07*
