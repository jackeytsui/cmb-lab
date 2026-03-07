---
phase: 33-practice-set-player
plan: 06
subsystem: practice-player-core
tags: [hook, useReducer, grading-dispatch, exercise-renderer, feedback, framer-motion]

dependency_graph:
  requires: [33-01, 33-02, 33-03, 33-04, 33-05]
  provides: [player-state-hook, exercise-dispatcher, feedback-display]
  affects: [33-07] # Full player page assembly

tech_stack:
  added: []
  patterns: [useReducer-state-machine, polymorphic-dispatcher, client-server-grading-split]

file_tracking:
  key_files:
    created:
      - src/hooks/usePracticePlayer.ts
      - src/components/practice/player/ExerciseRenderer.tsx
      - src/components/practice/player/PracticeFeedback.tsx
    modified: []

decisions:
  - id: useReducer-player-state
    decision: "useReducer with explicit action types for player lifecycle management"
    rationale: "Complex state transitions (navigation, grading, retry, auto-complete) need predictable state machine behavior"
  - id: client-server-grading-split
    decision: "handleSubmit checks def.type to route to client-side grading (instant) or server-side API (async)"
    rationale: "MCQ, fill-blank, matching, ordering are deterministic; free_text and audio require AI"
  - id: isGrading-race-prevention
    decision: "isGrading flag toggled via SET_GRADING action to disable navigation during AI grading"
    rationale: "Prevents user from navigating away while server-side grading is in flight"
  - id: auto-complete-detection
    decision: "SUBMIT_ANSWER reducer checks if all exercises have results and auto-sets completed status"
    rationale: "No separate 'complete' button needed if all exercises are graded"
  - id: type-safe-ordering-branch
    decision: "Explicit def.type === 'ordering' check instead of else fallthrough in handleSubmit"
    rationale: "TypeScript discriminated union narrowing requires explicit type check, not just array.includes guard"

metrics:
  duration: "~4 min"
  completed: 2026-02-07
---

# Phase 33 Plan 06: Player Core (Hook, Renderer, Feedback) Summary

**One-liner:** useReducer-based player hook with client/server grading dispatch, polymorphic exercise renderer dispatching to 6 types, and animated feedback component with Framer Motion.

## What Was Built

### 1. usePracticePlayer Hook (`src/hooks/usePracticePlayer.ts`)

State machine managing full player lifecycle:

- **PlayerState**: exercises, currentIndex, responses, results, status, isGrading, timing, attemptId
- **10 actions**: START, SUBMIT_ANSWER, SET_GRADING, NEXT_EXERCISE, PREV_EXERCISE, JUMP_TO, COMPLETE, RETRY_EXERCISE, RETRY_ALL, SET_ATTEMPT_ID
- **handleSubmit**: Critical function that routes grading based on exercise type:
  - Deterministic (MCQ, fill-blank, matching, ordering) -> instant client-side grading via imported functions
  - AI-graded (free_text) -> JSON POST to /api/practice/grade
  - AI-graded (audio_recording) -> FormData POST to /api/practice/grade
- **Derived values**: currentExercise, isFirst/LastExercise, hasResult, progress (0-100), totalCorrect, totalScore
- **Race condition prevention**: isGrading flag disables navigation during server grading

### 2. ExerciseRenderer (`src/components/practice/player/ExerciseRenderer.tsx`)

Polymorphic dispatcher that routes to the correct renderer based on `definition.type`:
- multiple_choice -> MultipleChoiceRenderer
- fill_in_blank -> FillInBlankRenderer
- matching -> MatchingRenderer
- ordering -> OrderingRenderer
- audio_recording -> AudioRecordingRenderer
- free_text -> FreeTextRenderer
- Fallback for unknown types

### 3. PracticeFeedback (`src/components/practice/player/PracticeFeedback.tsx`)

Animated per-exercise feedback display:
- Green background + CheckCircle for correct, Red background + XCircle for incorrect
- Score badge (e.g., "Score: 75/100")
- Explanation hint area with Lightbulb icon (yellow background, shown when explanation exists)
- Framer Motion AnimatePresence with fade-in + y-offset animation

## Task Commits

| Task | Name | Type | Commit | Key Files |
|------|------|------|--------|-----------|
| 1 | Create usePracticePlayer hook | feat | `e6c7261` | src/hooks/usePracticePlayer.ts |
| 2 | Create ExerciseRenderer and PracticeFeedback | feat | `f0717a7` | src/components/practice/player/ExerciseRenderer.tsx, src/components/practice/player/PracticeFeedback.tsx |

## Verification Results

```
npx tsc --noEmit
# Zero errors — all 3 files compile cleanly
```

Key link verification:
- usePracticePlayer imports all 4 grading functions from `@/lib/practice-grading` (Plan 01 output)
- ExerciseRenderer imports all 6 renderer components from `./renderers/` (Plans 03-05 output)
- PracticeFeedback imports GradeResult from `@/lib/practice-grading`

## Decisions Made

1. **useReducer state machine** — Complex state transitions (10 action types) need predictable state machine behavior over useState.
2. **Client-server grading split in handleSubmit** — def.type determines instant client-side grading vs async server API call.
3. **isGrading race prevention** — SET_GRADING action flag prevents navigation/re-submission during AI grading.
4. **Auto-complete detection** — SUBMIT_ANSWER reducer auto-detects when all exercises are graded and sets completed status.
5. **Explicit type narrowing for ordering** — TypeScript can't narrow discriminated unions through `Array.includes()`, so explicit `def.type === "ordering"` check is required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript discriminated union narrowing in handleSubmit**

- **Found during:** Task 1
- **Issue:** Using `else` fallthrough after `Array.includes()` guard didn't narrow `def` to `OrderingDefinition`. TypeScript saw it as `OrderingDefinition | AudioRecordingDefinition | FreeTextDefinition`.
- **Fix:** Changed `else { ... }` to `else if (def.type === "ordering") { ... } else { return; }` for proper type narrowing.
- **Files modified:** src/hooks/usePracticePlayer.ts
- **Commit:** `e6c7261`

## Next Phase Readiness

- usePracticePlayer hook is ready for the full player page assembly (Plan 07)
- ExerciseRenderer can be dropped into any container that provides PracticeExercise + onSubmit callback
- PracticeFeedback can be rendered alongside ExerciseRenderer using the GradeResult from state.results
- All 3 files compile with zero errors

## Self-Check: PASSED
