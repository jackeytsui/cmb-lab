---
phase: 13-ai-chatbot
plan: 04
subsystem: ui
tags: [react, ruby-elements, chinese, pinyin, jyutping, annotations, ai-prompts, seed]

# Dependency graph
requires:
  - phase: 13-01
    provides: Chat API foundation with message parts interface
  - phase: 10-01
    provides: AI prompts database schema and seeding pattern
provides:
  - ChineseAnnotation component for ruby-annotated Chinese text
  - parseAnnotatedText helper for [char|pinyin|jyutping] format parsing
  - Chatbot system prompt in AI prompts database
affects: [13-05, chat-api]

# Tech tracking
tech-stack:
  added: []
  patterns: [ruby-element annotations for Chinese characters, annotation format parsing regex]

key-files:
  created: [src/components/chat/ChineseAnnotation.tsx]
  modified: [src/components/chat/ChatMessage.tsx, src/db/seed.ts]

key-decisions:
  - "Regex [content|pipe] matching ensures only valid annotations parsed (brackets without pipes treated as plain text)"
  - "Changed chatbot system prompt UUID from plan-suggested 440020 to 440014 (440020 already used by VOICE_TUTOR_SYSTEM_V1_ID)"

patterns-established:
  - "Annotation format: [character(s)|pinyin|jyutping] parsed by parseAnnotatedText"
  - "Ruby element rendering with yellow Pinyin / cyan Jyutping color convention"

# Metrics
duration: 3min
completed: 2026-01-30
---

# Phase 13 Plan 04: Chinese Annotation Rendering Summary

**Ruby annotation component for chat Chinese text with [char|pinyin|jyutping] parsing, plus chatbot system prompt seeded in AI prompts database**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-30T01:02:52Z
- **Completed:** 2026-01-30T01:05:24Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ChineseAnnotation component renders ruby elements with yellow Pinyin and cyan Jyutping annotations
- parseAnnotatedText splits mixed annotated/plain text into typed segments
- ChatMessage updated to render annotations inline within chat bubbles
- Chatbot system prompt seeded with annotation format instructions, KB search guidance, and teaching approach

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ChineseAnnotation component and update ChatMessage** - `16488d8` (feat)
2. **Task 2: Seed chatbot system prompt in AI prompts database** - `8b983dc` (feat)

## Files Created/Modified
- `src/components/chat/ChineseAnnotation.tsx` - Ruby annotation renderer + parseAnnotatedText helper
- `src/components/chat/ChatMessage.tsx` - Updated to parse and render annotations in message text
- `src/db/seed.ts` - Added chatbot-system prompt with annotation format instructions

## Decisions Made
- Regex requires at least one pipe inside brackets to identify annotations (brackets without pipes are plain text)
- Changed chatbot system prompt UUID from plan-suggested `550e8400...440020` to `550e8400...440014` since `440020` was already used by `VOICE_TUTOR_SYSTEM_V1_ID`
- Chatbot prompt includes language preference handling (mandarin-only, cantonese-only, both)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UUID conflict with existing seed data**
- **Found during:** Task 2
- **Issue:** Plan suggested UUID `550e8400-e29b-41d4-a716-446655440020` which is already used by `VOICE_TUTOR_SYSTEM_V1_ID`
- **Fix:** Used `550e8400-e29b-41d4-a716-446655440014` instead (next available in sequence)
- **Files modified:** src/db/seed.ts
- **Verification:** No duplicate UUIDs in seed file
- **Committed in:** 8b983dc

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor UUID change to avoid conflict. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Run `npm run db:seed` when ready to populate the chatbot system prompt.

## Next Phase Readiness
- ChineseAnnotation component ready for use in chat responses
- Chatbot system prompt ready to be loaded via `getPrompt('chatbot-system', ...)`
- Plan 05 (final wiring) can connect the chat API to the database prompt

---
*Phase: 13-ai-chatbot*
*Completed: 2026-01-30*
