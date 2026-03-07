---
phase: 35-enhanced-chatbot
plan: 05
subsystem: ui
tags: [ai-sdk, tool-calling, exercises, phonetic, chinese, chat, grading]

# Dependency graph
requires:
  - phase: 35-02
    provides: ChatMessage component with ChatBubble and ChineseAnnotation rendering
  - phase: 35-03
    provides: Chat persistence with JSONB parts column storing tool invocation data
  - phase: 35-04
    provides: Lesson context injection for vocabulary-aware exercise generation
  - phase: 32
    provides: Practice grading functions (gradeMultipleChoice, gradeFillInBlank)
provides:
  - generateExercise AI tool for inline MCQ and fill-in-blank exercise generation
  - ChatExercise component for interactive exercise rendering in chat
  - PhoneticText wrapping on user-typed Chinese text in chat bubbles
  - renderUserText function for Chinese character segment detection
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AI SDK tool calling for interactive component generation (tool returns data, client renders component)"
    - "Per-part iteration in ChatMessage for mixed text/tool-invocation rendering"
    - "Non-global regex for Chinese character detection with global regex for splitting"

key-files:
  created:
    - src/components/chat/ChatExercise.tsx
  modified:
    - src/app/api/chat/route.ts
    - src/components/chat/ChatMessage.tsx

key-decisions:
  - "Simple equality check for MCQ grading via existing gradeMultipleChoice (no new grading library)"
  - "Per-blank correctness tracking via manual normalize-compare alongside gradeFillInBlank for visual feedback"
  - "Non-global CHINESE_CHAR_REGEX for test, global split regex for segmentation (avoids lastIndex bug)"
  - "User messages use renderUserText (PhoneticText on Chinese segments); assistant messages keep renderAnnotatedText (annotation parsing)"
  - "Exercise data returned as-is from tool execute function (client-side rendering, no server-side HTML)"
  - "hasAnyContent check replaces isStreaming-based fallback for streaming indicator"

patterns-established:
  - "Tool invocation rendering: check toolName to route to correct component (ChatExercise for exercises, null for KB results)"
  - "renderUserText pattern: split on Chinese character regex, wrap matches in PhoneticText"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 35 Plan 05: Inline Exercises & Phonetic User Text Summary

**generateExercise AI tool calling with interactive MCQ/fill-in-blank ChatExercise component and PhoneticText on user-typed Chinese text**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T04:32:02Z
- **Completed:** 2026-02-07T04:35:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- AI can generate MCQ and fill-in-blank exercises via tool calling that render as interactive components in chat
- Client-side grading with immediate visual feedback (green/red borders, checkmarks, correct answers, explanations)
- User-typed Chinese text in chat bubbles displays with phonetic annotation font via PhoneticText
- ChatMessage now iterates all parts in order, properly routing text and tool invocations

## Task Commits

Each task was committed atomically:

1. **Task 1: Add generateExercise tool to chat API and create ChatExercise component** - `25737cc` (feat)
2. **Task 2: Render exercises in ChatMessage and add PhoneticText to user Chinese text** - `62d8a10` (feat)

## Files Created/Modified
- `src/components/chat/ChatExercise.tsx` - Interactive inline exercise renderer (MCQ + fill-in-blank with client-side grading)
- `src/app/api/chat/route.ts` - Added generateExercise tool definition in streamText tools
- `src/components/chat/ChatMessage.tsx` - Per-part rendering with exercise routing, renderUserText for Chinese PhoneticText

## Decisions Made
- Reused existing gradeMultipleChoice and gradeFillInBlank from practice-grading library (no new grading code)
- Per-blank correctness tracked separately from overall GradeResult for granular visual feedback on fill-in-blank
- Used non-global CHINESE_CHAR_REGEX for .test() to avoid lastIndex state bug with global regex
- User messages use renderUserText (Chinese detection + PhoneticText); assistant messages keep renderAnnotatedText unchanged
- Exercise tool returns raw exercise data for client-side rendering (no server-side HTML generation)
- hasAnyContent check for streaming indicator replaces the old isStreaming-only pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 35 (Enhanced Chatbot) is now complete with all 5 plans delivered
- All CHAT requirements satisfied: UI (01), phonetic text (02), persistence (03), lesson context (04), inline exercises (05)
- Ready for Phase 36 or milestone completion

## Self-Check: PASSED

---
*Phase: 35-enhanced-chatbot*
*Completed: 2026-02-07*
