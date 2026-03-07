---
phase: 35-enhanced-chatbot
plan: 01
subsystem: database
tags: [drizzle, postgres, jsonb, chat, persistence, ai-sdk]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: users table, lessons table (foreign keys)
provides:
  - chat_conversations and chat_messages database tables
  - saveChat, loadChat, listUserConversations persistence helpers
  - ChatConversation, ChatMessage type exports
affects: [35-03 (chat API route uses saveChat/loadChat), 35-04 (sidebar uses listUserConversations), 35-05 (history restore uses loadChat)]

# Tech tracking
tech-stack:
  added: []
  patterns: [delete-then-insert message sync, JSONB parts storage for AI SDK UIMessage, subquery left join for counts]

key-files:
  created:
    - src/db/schema/chat.ts
    - src/lib/chat-persistence.ts
    - src/db/migrations/0006_watery_richard_fisk.sql
  modified:
    - src/db/schema/index.ts

key-decisions:
  - "JSONB parts column stores UIMessage parts array directly (not stringified text) for full AI SDK fidelity"
  - "Plain text role column (not enum) because AI SDK uses string roles that may expand"
  - "Delete-then-insert pattern for messages because onFinish provides full array (avoids diff complexity)"
  - "lessonId FK uses onDelete set null (general chats have no lesson, lesson deletion shouldn't delete conversations)"
  - "Auto-title from lesson title first, then first user message text (truncated to 50 chars)"

patterns-established:
  - "Chat persistence via delete-then-insert full message array sync"
  - "Subquery left join pattern for efficient message count aggregation"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 35 Plan 01: Chat Persistence Schema Summary

**chat_conversations + chat_messages tables with JSONB parts storage and saveChat/loadChat/listUserConversations helpers**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T04:14:56Z
- **Completed:** 2026-02-07T04:18:05Z
- **Tasks:** 2
- **Files modified:** 4 (+ 2 migration metadata files)

## Accomplishments
- chat_conversations table with userId FK (cascade), nullable lessonId FK (set null), auto-title, timestamps
- chat_messages table with JSONB parts column for storing AI SDK UIMessage parts array directly
- Three persistence helpers: saveChat (upsert + auto-title), loadChat (chronological), listUserConversations (with counts)
- Drizzle migration 0006 generated with proper CREATE TABLE + FK constraints

## Task Commits

Each task was committed atomically:

1. **Task 1: Create chat database schema** - `23aaecb` (feat)
2. **Task 2: Create chat persistence helpers** - `62f5b75` (feat)

## Files Created/Modified
- `src/db/schema/chat.ts` - chatConversations + chatMessages tables, relations, type exports
- `src/db/schema/index.ts` - Added barrel export for chat module
- `src/lib/chat-persistence.ts` - saveChat, loadChat, listUserConversations helpers
- `src/db/migrations/0006_watery_richard_fisk.sql` - CREATE TABLE migration for both chat tables

## Decisions Made
- JSONB parts column stores UIMessage parts array directly (not stringified text) for full AI SDK message fidelity when restoring conversations
- Plain text role column (not pgEnum) because AI SDK uses string roles that may expand beyond "user"/"assistant"
- Delete-then-insert pattern for messages: onFinish provides the full message array, so replacing all messages avoids complex diff logic and ensures consistency
- lessonId FK uses onDelete "set null" rather than cascade so lesson deletion preserves general chat history
- Auto-title derivation: lesson title first (if lessonId), then first user message text truncated to 50 chars
- Subquery left join for efficient message count in listUserConversations (single query instead of N+1)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Migration needs to be applied to the database via `npm run db:migrate` or `npm run db:push`.

## Next Phase Readiness
- Schema and persistence layer ready for Plan 03 (chat API route) to call saveChat/loadChat
- Plan 04 (conversation sidebar) can use listUserConversations
- Plan 05 (history restore) can use loadChat
- Migration must be applied to the database before runtime usage

## Self-Check: PASSED

---
*Phase: 35-enhanced-chatbot*
*Completed: 2026-02-07*
