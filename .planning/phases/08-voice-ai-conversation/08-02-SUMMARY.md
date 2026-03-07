---
phase: 08-voice-ai-conversation
plan: 02
subsystem: api
tags: [conversations, transcript, lesson-context, pronunciation, ai-prompting]

# Dependency graph
requires:
  - phase: 08-01
    provides: WebRTC connection hook and ephemeral token
provides:
  - Conversations database schema for transcript storage
  - Lesson context builder for AI instructions
  - API routes for conversation CRUD
  - Real-time transcript capture in hook
affects: [08-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lesson-aware AI prompting with pronunciation feedback
    - Real-time transcript accumulation from data channel events
    - Batch turn insert on conversation end

key-files:
  created:
    - src/db/schema/conversations.ts
    - src/lib/lesson-context.ts
    - src/app/api/conversations/route.ts
    - src/app/api/conversations/[conversationId]/route.ts
  modified:
    - src/db/schema/index.ts
    - src/hooks/useRealtimeConversation.ts

key-decisions:
  - "turn_role pgEnum for user/assistant distinction"
  - "Conversation created before WebRTC connects (pre-session record)"
  - "Transcript accumulated client-side, batch inserted on disconnect"
  - "AI transcript from delta events, user from transcription.completed"
  - "Generic fallback instructions when lesson not found"

patterns-established:
  - "buildLessonInstructions queries lesson -> module -> course chain"
  - "PATCH endpoint handles both ending conversation and inserting turns"
  - "Coach/admin access via hasMinimumRole check"

# Metrics
duration: 7min
completed: 2026-01-27
---

# Phase 8 Plan 2: Lesson Context and Transcript Storage Summary

**Lesson-aware AI prompting with pronunciation feedback and conversation transcript persistence**

## Performance

- **Duration:** 7 min
- **Started:** 2026-01-27T05:29:57Z
- **Completed:** 2026-01-27T05:37:17Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 2

## Accomplishments
- Database schema for voice conversations with user/assistant turns
- Lesson context builder that injects vocabulary and pronunciation guidelines into AI instructions
- CRUD API routes for conversations with role-based access
- Real-time transcript capture from OpenAI Realtime API events
- Automatic transcript persistence on disconnect

## Task Commits

Each task was committed atomically:

1. **Task 1: Create conversations schema and lesson context builder** - `71aa4a1` (feat)
2. **Task 2: Create conversation API routes and wire transcript capture** - `405e415` (feat)

## Files Created
- `src/db/schema/conversations.ts` - Conversations and conversation_turns tables with turn_role enum
- `src/lib/lesson-context.ts` - buildLessonInstructions for lesson-aware AI prompting
- `src/app/api/conversations/route.ts` - GET (list) and POST (create) endpoints
- `src/app/api/conversations/[conversationId]/route.ts` - GET (with turns) and PATCH (end/add turns)

## Files Modified
- `src/db/schema/index.ts` - Added conversations export
- `src/hooks/useRealtimeConversation.ts` - Added lesson context, transcript capture, and database persistence

## Decisions Made
- **turn_role enum**: Distinguishes user (student) and assistant (AI) speech turns
- **Pre-session record**: Conversation created before WebRTC connects for reliable tracking
- **Client-side accumulation**: Turns stored in React state, batch inserted on disconnect
- **Dual transcript sources**: AI uses delta events, user uses transcription.completed event
- **Graceful fallback**: Generic tutor instructions if lesson not found

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Key Implementation Details

### AI Instructions Structure
The buildLessonInstructions function creates a comprehensive prompt including:
- Current lesson, module, and course context
- Vocabulary from lesson interactions (prompt + expected answer)
- Guidelines for language switching and encouragement
- **PRONUNCIATION FEEDBACK section** with specific instructions for tone correction

### Transcript Capture Events
- `response.audio_transcript.delta` - AI speaking (accumulated)
- `response.audio_transcript.done` - AI finished (turn saved)
- `conversation.item.input_audio_transcription.completed` - User speech (turn saved)

### API Access Control
- Users see their own conversations
- Coach/admin can view any student's via ?studentId= parameter
- PATCH for ending/adding turns restricted to conversation owner

## Next Phase Readiness
- Schema and APIs ready for conversation UI
- Hook exposes turns array for real-time transcript display
- Conversations can be queried for coach review

---
*Phase: 08-voice-ai-conversation*
*Completed: 2026-01-27*
