---
phase: 35-enhanced-chatbot
plan: 04
subsystem: api
tags: [openai, drizzle, lesson-context, chatbot, system-prompt, react-hooks]

# Dependency graph
requires:
  - phase: 35-01
    provides: "Chat persistence schema (chatConversations, chatMessages tables)"
  - phase: 35-03
    provides: "Chat persistence wiring (lessonId extraction from URL, chatId in request body)"
provides:
  - "buildChatLessonContext function for lesson-specific AI tutoring"
  - "Lesson vocabulary injection into chatbot system prompt"
  - "Lesson navigation detection with auto-conversation switching"
  - "Lesson-filtered conversation loading"
affects: [35-05-enhanced-chatbot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lesson context builder with innerJoin across lessons/modules/courses/interactions"
    - "previousLessonIdRef pattern for detecting navigation between lessons"
    - "Lesson-scoped conversation filtering via query parameter"

key-files:
  created: []
  modified:
    - "src/app/api/chat/route.ts"
    - "src/components/chat/ChatWidget.tsx"

key-decisions:
  - "buildChatLessonContext defined locally in route.ts (not separate module) since it is chatbot-specific"
  - "No internal try/catch in buildChatLessonContext; caller wraps in try/catch with console.error fallback"
  - "Lesson context appended as separate section to system prompt (not injected into base prompt)"
  - "previousLessonIdRef only triggers handleNewConversation when previous value is non-null (avoids initial mount trigger)"
  - "conversationsLoaded reset on currentLessonId change so re-opening loads lesson-scoped conversations"

patterns-established:
  - "Lesson context injection: query lesson+module+course+interactions, append to system prompt"
  - "Navigation detection: useRef tracking + useEffect watching pathname-derived ID"

# Metrics
duration: 6min
completed: 2026-02-07
---

# Phase 35 Plan 04: Lesson Context Injection Summary

**Lesson-specific chatbot context via buildChatLessonContext (queries lesson/module/course/interactions) with automatic lesson navigation detection and conversation scoping**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-07T04:22:14Z
- **Completed:** 2026-02-07T04:28:26Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Server-side `buildChatLessonContext` function queries lesson title, module, course, and vocabulary (interactions) to build rich AI context
- System prompt augmented with lesson-specific behavior instructions (vocabulary reference, practice suggestions, quiz offers)
- Client-side lesson navigation detection via `previousLessonIdRef` auto-starts new conversations when navigating between lessons
- Conversation loading filtered by `currentLessonId` when on a lesson page

## Task Commits

Each task was committed atomically:

1. **Task 1: Add lesson context builder to chat API** - `e5229b3` (feat)
2. **Task 2: Handle lesson navigation and auto-start conversations** - `166a41a` (feat, included in Plan 03's commit due to parallel execution)

## Files Created/Modified
- `src/app/api/chat/route.ts` - Added buildChatLessonContext function, db imports, lesson context injection into system prompt via fullSystemPrompt
- `src/components/chat/ChatWidget.tsx` - Added previousLessonIdRef, lesson navigation detection useEffect, lesson-filtered conversation loading, conversationsLoaded reset on lesson change

## Decisions Made
- buildChatLessonContext is a local function in route.ts rather than a shared module because it is specific to the chatbot's needs and simpler than the voice tutor's template-based approach
- Error handling is at the caller level only (try/catch in POST handler) since buildChatLessonContext is only called from one place
- Lesson context is appended as a separate section after the language preference section, keeping the base prompt clean
- The previousLessonIdRef only triggers auto-new-conversation when the ref has a non-null previous value, preventing false triggers on initial page load

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 2 changes were included in Plan 03's commit (166a41a) due to parallel execution -- Plan 03 staged ChatWidget.tsx after our Write but before our git add. Changes are correctly persisted in git.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Lesson context injection complete and ready for end-to-end testing
- Plan 05 (Suggested Prompts) can build on this foundation to offer lesson-specific starter prompts
- All success criteria met: lesson vocabulary in AI context, practice topic suggestions, navigation detection, graceful fallback

## Self-Check: PASSED

---
*Phase: 35-enhanced-chatbot*
*Completed: 2026-02-07*
