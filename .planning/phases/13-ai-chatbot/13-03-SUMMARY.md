---
phase: 13-ai-chatbot
plan: 03
subsystem: ui
tags: [ai-sdk, useChat, streaming, clerk, react, hooks]

# Dependency graph
requires:
  - phase: 13-01
    provides: POST /api/chat streaming endpoint with RAG tool
  - phase: 13-02
    provides: ChatWidget, ChatPanel, ChatMessage UI components
provides:
  - useChatbot hook wrapping useChat with language preference injection
  - ChatPanel wired to streaming /api/chat via AI SDK
  - ChatWidget mounted globally with Clerk auth gate
  - Auto-scroll, streaming indicator, error display
affects: [13-04 context features, 13-05 polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [DefaultChatTransport from ai package for useChat transport, useUser auth gate in client components]

key-files:
  created:
    - src/hooks/useChatbot.ts
  modified:
    - src/components/chat/ChatPanel.tsx
    - src/components/chat/ChatWidget.tsx
    - src/components/chat/ChatMessage.tsx
    - src/app/layout.tsx

key-decisions:
  - "DefaultChatTransport imported from 'ai' package (not @ai-sdk/react)"
  - "ChatMessage role type widened to string for UIMessage compatibility"
  - "useUser from @clerk/nextjs for client-side auth gate in ChatWidget"

patterns-established:
  - "useChatbot hook pattern: wrap useChat with app-specific defaults (transport, body params)"
  - "Global widget pattern: client component in server layout, self-hides when unauthenticated"

# Metrics
duration: 2min
completed: 2026-01-30
---

# Phase 13 Plan 03: Chat UI Wiring Summary

**useChatbot hook connecting ChatPanel to streaming /api/chat with language preference injection and global auth-gated widget mount**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-30T01:03:05Z
- **Completed:** 2026-01-30T01:05:32Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created useChatbot hook wrapping AI SDK useChat with DefaultChatTransport and automatic language preference injection
- Replaced ChatPanel stub with real streaming integration (sendMessage, setMessages, auto-scroll, error display)
- Mounted ChatWidget globally in root layout with Clerk auth gate (only renders for signed-in users)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useChatbot hook and wire ChatPanel to streaming API** - `f15d161` (feat)
2. **Task 2: Mount ChatWidget in root layout for all authenticated users** - `79ae3c3` (feat)

## Files Created/Modified
- `src/hooks/useChatbot.ts` - Hook wrapping useChat with DefaultChatTransport and language preference
- `src/components/chat/ChatPanel.tsx` - Replaced stub with real AI SDK integration
- `src/components/chat/ChatMessage.tsx` - Widened role type for UIMessage compatibility
- `src/components/chat/ChatWidget.tsx` - Added useUser auth gate
- `src/app/layout.tsx` - Added ChatWidget after children

## Decisions Made
- DefaultChatTransport is exported from `ai` package, not `@ai-sdk/react` (discovered during TypeScript check)
- ChatMessage role type widened from `'user' | 'assistant'` to `string` to accept UIMessage's broader role union (includes `'system'`)
- useUser from @clerk/nextjs for client-side auth check (lightweight, no server round-trip)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DefaultChatTransport import location**
- **Found during:** Task 1 (useChatbot hook creation)
- **Issue:** Plan specified importing DefaultChatTransport from `@ai-sdk/react`, but it's exported from `ai` package
- **Fix:** Changed import to `import { DefaultChatTransport } from 'ai'`
- **Files modified:** src/hooks/useChatbot.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** f15d161

**2. [Rule 1 - Bug] ChatMessage role type too narrow for UIMessage**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** ChatMessage accepted `role: 'user' | 'assistant'` but UIMessage includes `'system'` role
- **Fix:** Widened role type to `string` for full UIMessage compatibility
- **Files modified:** src/components/chat/ChatMessage.tsx
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** f15d161

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- AI SDK 6 exports DefaultChatTransport from the main `ai` package, not the `@ai-sdk/react` sub-package. Resolved by checking actual type exports.

## User Setup Required

None - no additional external service configuration required beyond existing OPENAI_API_KEY.

## Next Phase Readiness
- Streaming chatbot fully functional on all pages for authenticated users
- Ready for context injection features (Plan 04) and polish (Plan 05)
- OPENAI_API_KEY must be configured for runtime operation

---
*Phase: 13-ai-chatbot*
*Completed: 2026-01-30*
