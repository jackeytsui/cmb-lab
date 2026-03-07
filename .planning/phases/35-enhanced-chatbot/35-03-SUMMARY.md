---
phase: 35-enhanced-chatbot
plan: 03
subsystem: api, ui
tags: [ai-sdk, chat-persistence, useChat, onFinish, consumeStream, conversation-management]

# Dependency graph
requires:
  - phase: 35-01
    provides: "Chat persistence schema (chatConversations, chatMessages tables) and helpers (saveChat, loadChat, listUserConversations)"
  - phase: 35-02
    provides: "iMessage-style ChatBubble, ChatMessage, ChatPanel components with formatRelativeTime"
provides:
  - "Server-side chat persistence via onFinish callback in toUIMessageStreamResponse"
  - "GET /api/chat/conversations endpoint for listing user conversations"
  - "GET /api/chat/[chatId] endpoint for loading conversation messages"
  - "Enhanced useChatbot hook with chatId, lessonId, initialMessages support"
  - "ChatConversationList component for conversation switching"
  - "ChatWidget with conversation load-on-open and lesson detection from pathname"
affects: [35-04, 35-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "consumeStream() fire-and-forget pattern for server-side persistence even if client disconnects"
    - "key={chatId} on ChatPanel to force remount when switching conversations"
    - "AI SDK v6 `messages` prop (not `initialMessages`) for seeding chat with persisted messages"
    - "Pathname regex matching for lesson context detection"

key-files:
  created:
    - src/app/api/chat/conversations/route.ts
    - src/app/api/chat/[chatId]/route.ts
    - src/components/chat/ChatConversationList.tsx
  modified:
    - src/app/api/chat/route.ts
    - src/hooks/useChatbot.ts
    - src/components/chat/ChatWidget.tsx
    - src/components/chat/ChatPanel.tsx

key-decisions:
  - "AI SDK v6 uses `messages` prop on useChat (not `initialMessages`) for seeding persisted conversations"
  - "consumeStream() called fire-and-forget (no await) after building response but before returning"
  - "ChatPanel key={chatId} forces full remount including useChat state reset when switching conversations"
  - "Conversation list rendered as overlay inside ChatPanel's message area (not a separate modal)"
  - "getCurrentUser() called in chat route after Clerk auth for internal userId mapping"

patterns-established:
  - "consumeStream + onFinish: Server-side persistence pattern that survives client disconnect"
  - "key-based remount: Force React to reinitialize hooks by changing component key"

# Metrics
duration: 6min
completed: 2026-02-07
---

# Phase 35 Plan 03: Chat Persistence Integration Summary

**End-to-end chat persistence via onFinish + consumeStream server-side, with conversation list/switch UI and load-on-open restore**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-07T04:21:31Z
- **Completed:** 2026-02-07T04:27:56Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Chat messages now persist to database via onFinish callback in toUIMessageStreamResponse
- consumeStream() ensures persistence even if client disconnects mid-stream
- Opening chatbot auto-loads the most recent conversation with full message history
- Conversation list shows all past chats with titles, timestamps, and message counts
- Students can start new conversations and switch between existing ones
- All API endpoints protected with auth (Clerk + internal user verification)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add persistence to chat API and create conversation endpoints** - `b820d8c` (feat)
2. **Task 2: Wire persistence to client -- useChatbot, ChatWidget, ChatPanel, ConversationList** - `166a41a` (feat)

## Files Created/Modified
- `src/app/api/chat/route.ts` - Added onFinish persistence callback, consumeStream, chatId/lessonId extraction, getCurrentUser lookup
- `src/app/api/chat/conversations/route.ts` - GET endpoint listing user conversations with optional lessonId filter
- `src/app/api/chat/[chatId]/route.ts` - GET endpoint loading conversation messages with ownership check
- `src/hooks/useChatbot.ts` - Enhanced hook accepting chatId, lessonId, initialMessages; passes to useChat and DefaultChatTransport
- `src/components/chat/ChatWidget.tsx` - Conversation load-on-open, lesson detection from pathname, new/select conversation handlers
- `src/components/chat/ChatPanel.tsx` - New Chat (+) and History buttons, ChatConversationList overlay, persistence props to useChatbot
- `src/components/chat/ChatConversationList.tsx` - Scrollable conversation list with title, relative timestamp, message count, active highlight

## Decisions Made
- AI SDK v6 uses `messages` prop on useChat (not `initialMessages` which was removed in v6) for seeding persisted conversations
- consumeStream() is called without await (fire-and-forget) after building the Response but before returning it -- this ensures the stream is fully consumed server-side so onFinish fires even if the client disconnects
- ChatPanel uses `key={chatId}` so switching conversations forces a full remount, reinitializing the useChat hook with new messages
- Conversation list is rendered as an overlay inside the message area of ChatPanel (toggled by History button) rather than a separate modal
- getCurrentUser() called in chat route after Clerk auth check to map Clerk userId to internal user.id for database persistence

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AI SDK v6 `initialMessages` -> `messages` prop**
- **Found during:** Task 2 (useChatbot hook update)
- **Issue:** Plan specified `initialMessages` prop on useChat, but AI SDK v6 renamed it to `messages` in the ChatInit interface
- **Fix:** Changed `initialMessages: initialMessages as any` to `messages: initialMessages as any` in the useChat call
- **Files modified:** src/hooks/useChatbot.ts
- **Verification:** `npx tsc --noEmit` passes with no errors
- **Committed in:** 166a41a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix -- `initialMessages` prop does not exist in AI SDK v6 useChat. No scope creep.

## Issues Encountered
None beyond the initialMessages rename addressed above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full persistence loop operational: send message -> onFinish saves -> reload -> restore
- Ready for Plan 04 (lesson context injection) which will use the lessonId field already wired through
- Ready for Plan 05 (streaming enhancements) which builds on the current streaming infrastructure

## Self-Check: PASSED

---
*Phase: 35-enhanced-chatbot*
*Completed: 2026-02-07*
