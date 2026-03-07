---
phase: 33-practice-set-player
plan: 01
subsystem: practice-grading
tags: [grading, client-side, tdd, vitest, exercises]

dependency_graph:
  requires: [32] # Practice set builder (exercise types defined in Phase 32)
  provides: [client-side-grading-library, grade-result-type]
  affects: [33-02, 33-03, 33-04] # Player hook, player UI, attempt submission

tech_stack:
  added: [vitest]
  patterns: [tdd-red-green, normalize-compare, proportional-scoring]

file_tracking:
  key_files:
    created:
      - src/lib/practice-grading.ts
      - src/lib/__tests__/practice-grading.test.ts
      - vitest.config.ts
    modified:
      - package.json
      - package-lock.json

decisions:
  - id: grading-normalize
    decision: "Use .trim().toLowerCase() for answer normalization (safe for CJK characters)"
    rationale: "toLowerCase is a no-op for Chinese characters, so normalization is safe across all languages"
  - id: proportional-scoring
    decision: "Score = Math.round((correctCount / total) * 100) for partial-credit exercises"
    rationale: "Consistent proportional scoring across fill-in-blank, matching, and ordering"
  - id: matching-identity-check
    decision: "Correct match means leftId === rightId (same pair ID on both sides)"
    rationale: "Each definition pair has a single ID; left and right columns both reference this ID"

metrics:
  duration: "~1 min"
  completed: 2026-02-07
---

# Phase 33 Plan 01: Client-Side Grading Library Summary

**One-liner:** TDD-built client-side grading for 4 deterministic exercise types (MCQ, fill-blank, matching, ordering) with normalize-compare pattern and proportional scoring.

## What Was Built

Four grading functions exported from `src/lib/practice-grading.ts`:

1. **gradeMultipleChoice** - Exact match on `correctOptionId`. Returns score 0 or 100. Feedback includes correct option text on wrong answer.
2. **gradeFillInBlank** - Normalizes answers via `.trim().toLowerCase()` before comparison. Checks both `correctAnswer` and `acceptableAnswers` per blank. Proportional scoring (e.g., 1/2 blanks = 50).
3. **gradeMatching** - Checks if `leftId === rightId` for each user pair. Proportional scoring based on definition pair count.
4. **gradeOrdering** - Looks up each item by ID and checks if `correctPosition === index`. Proportional scoring.

All functions return `GradeResult { isCorrect, score, feedback, explanation? }`.

## TDD Execution

### RED Phase (Task 1)
- 15 test cases written across 4 describe blocks (later expanded to 16 in GREEN)
- Tests covered: correct/incorrect, partial scores, case insensitivity, trimming, acceptable answers, Chinese characters, zero matches, reversed order
- Committed as `test(33-01)` at `4384d92`

### GREEN Phase (Task 2)
- All 4 grading functions implemented
- All 16 tests pass
- Committed as `feat(33-01)` at `bc90ba6`

## Task Commits

| Task | Name | Type | Commit | Key Files |
|------|------|------|--------|-----------|
| 1 | Write failing tests for all 4 grading functions | test (RED) | `4384d92` | src/lib/__tests__/practice-grading.test.ts, vitest.config.ts, package.json |
| 2 | Implement grading functions to pass all tests | feat (GREEN) | `bc90ba6` | src/lib/practice-grading.ts |

## Verification Results

```
 16 passed (16)
 Test Files  1 passed (1)
 Duration    1000ms
```

All 16 tests pass covering:
- 4 gradeMultipleChoice tests (correct, wrong, explanation present, explanation absent)
- 6 gradeFillInBlank tests (all correct, partial, case-insensitive, trimming, acceptable answers, Chinese chars)
- 3 gradeMatching tests (all correct, partial, zero matches)
- 3 gradeOrdering tests (all correct, partial, reversed)

## Decisions Made

1. **Normalize-compare pattern** - `.trim().toLowerCase()` is safe for CJK characters since `toLowerCase` is a no-op for Chinese/Japanese/Korean. No special handling needed.
2. **Proportional scoring formula** - `Math.round((correctCount / total) * 100)` used consistently across fill-blank, matching, and ordering for partial credit.
3. **Matching identity check** - A correct match = `leftId === rightId` because both sides reference the same pair ID from the definition.

## Deviations from Plan

None - plan executed exactly as written. Both TDD tasks were already committed by a prior execution session.

## Next Phase Readiness

- `GradeResult` type is exported and ready for use in the practice player hook (Plan 02)
- All 4 client-side grading functions are available for import from `@/lib/practice-grading`
- No blockers for subsequent plans

## Self-Check: PASSED
