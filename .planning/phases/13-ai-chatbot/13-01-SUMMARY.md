---
phase: 13-ai-chatbot
plan: 01
subsystem: api
tags: [ai-sdk, openai, rag, streaming, chat, zod]

# Dependency graph
requires:
  - phase: 12-knowledge-base
    provides: KB chunks schema and search pattern
  - phase: 10-ai-prompts-dashboard
    provides: getPrompt utility for database-backed system prompts
provides:
  - POST /api/chat streaming endpoint with RAG tool
  - searchKnowledgeBase server-side utility
affects: [13-02 chat UI, 13-03 chatbot prompt, 13-04 chat features]

# Tech tracking
tech-stack:
  added: [ai@6.0.62, @ai-sdk/openai@3.0.23, @ai-sdk/react@3.0.64]
  patterns: [AI SDK 6 streamText with inputSchema, stepCountIs stop condition, convertToModelMessages for UIMessage conversion]

key-files:
  created:
    - src/app/api/chat/route.ts
    - src/lib/chat-utils.ts
  modified:
    - package.json

key-decisions:
  - "AI SDK 6 uses inputSchema (not parameters) and stopWhen/stepCountIs (not maxSteps)"
  - "Direct DB query for KB search in chat (not HTTP endpoint call)"
  - "Message history trimmed to last 20 to avoid unbounded token costs"

patterns-established:
  - "AI SDK 6 tool pattern: inputSchema with Zod v4 Standard Schema"
  - "convertToModelMessages must be awaited (returns Promise in v6)"

# Metrics
duration: 6min
completed: 2026-01-30
---

# Phase 13 Plan 01: Chat API Foundation Summary

**Streaming chat API with AI SDK 6, OpenAI gpt-4o, RAG tool searching KB chunks via direct DB query**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-30T00:49:19Z
- **Completed:** 2026-01-30T00:55:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Installed AI SDK 6 with OpenAI provider and React hooks
- Created streaming POST /api/chat with Clerk auth, system prompt from DB, language preference support
- Built searchKnowledgeBase RAG tool querying published KB chunks directly

## Task Commits

Each task was committed atomically:

1. **Task 1: Install AI SDK packages** - `e4c3a23` (chore)
2. **Task 2: Create KB search utility and streaming chat API route** - `9f5553a` (feat)

## Files Created/Modified
- `package.json` - Added ai, @ai-sdk/openai, @ai-sdk/react dependencies
- `src/app/api/chat/route.ts` - Streaming chat endpoint with auth, RAG tool, gpt-4o
- `src/lib/chat-utils.ts` - Server-side KB search utility with ilike pattern matching

## Decisions Made
- AI SDK 6 API: `inputSchema` instead of `parameters`, `stopWhen: stepCountIs(3)` instead of `maxSteps: 3`
- `convertToModelMessages` returns Promise in v6 and must be awaited
- Direct DB query for KB search (reuses same ilike pattern from /api/knowledge/search)
- Message history trimmed to last 20 messages to control token costs
- Inline tool definition without `tool()` wrapper for cleaner Zod v4 type inference

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AI SDK 6 API changes from plan assumptions**
- **Found during:** Task 2 (API route creation)
- **Issue:** Plan specified `parameters` (v3/v4 API), `maxSteps`, and `tool()` wrapper — AI SDK 6 uses `inputSchema`, `stopWhen`/`stepCountIs`, and inline tool objects
- **Fix:** Updated to correct AI SDK 6 API: `inputSchema` for tool schema, `stopWhen: stepCountIs(3)` for multi-step, `await convertToModelMessages()` for async conversion
- **Files modified:** src/app/api/chat/route.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 9f5553a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** API surface change only, same functionality. No scope creep.

## Issues Encountered
- AI SDK 6 has breaking API changes from earlier versions: `parameters` -> `inputSchema`, `maxSteps` -> `stopWhen: stepCountIs(N)`, `convertToModelMessages` is now async. All resolved by consulting actual type definitions.

## Next Phase Readiness
- Chat API endpoint ready for frontend useChat hook integration (Plan 02)
- System prompt slug "chatbot-system" ready for prompt dashboard configuration (Plan 03)
- OPENAI_API_KEY must be configured for runtime operation

---
*Phase: 13-ai-chatbot*
*Completed: 2026-01-30*
