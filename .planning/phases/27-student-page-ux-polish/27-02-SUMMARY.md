---
phase: 27-student-page-ux-polish
plan: 02
subsystem: ui
tags: [error-handling, loading-skeleton, rate-limiting, webrtc, microphone, retry]

# Dependency graph
requires:
  - phase: 26-error-handling
    provides: ErrorAlert component (inline + block variants)
  - phase: 27-01
    provides: Server component try/catch patterns for student pages
provides:
  - my-feedback error tuple pattern preventing false empty states on DB errors
  - my-feedback loading skeleton
  - my-conversations state-based retry (no page reload)
  - my-conversations skeleton loading and transcript error states
  - Chat rate limit detection with specific user messaging
  - Voice conversation mic permission error differentiation
affects: [28-coach-page-ux-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Return {data, error} tuple from server data functions instead of swallowing errors"
    - "useCallback-extracted fetch for retry without page reload"
    - "Error.name check for WebRTC getUserMedia permission errors"
    - "Error.message substring match for HTTP status-based error differentiation"

# File tracking
key-files:
  created:
    - src/app/(dashboard)/my-feedback/loading.tsx
  modified:
    - src/app/(dashboard)/my-feedback/page.tsx
    - src/app/(dashboard)/my-conversations/page.tsx
    - src/components/chat/ChatPanel.tsx
    - src/hooks/useRealtimeConversation.ts

# Decisions
decisions:
  - id: D27-02-01
    decision: "Use {data, error} return tuple in getFeedback instead of throwing"
    rationale: "Server components can render ErrorAlert directly from error field without try/catch in JSX"
  - id: D27-02-02
    decision: "Transcript retry triggers collapse+expand cycle instead of inline re-fetch"
    rationale: "Simpler state management - handleToggleExpand already handles the fetch logic"
  - id: D27-02-03
    decision: "Check error.message for rate limit strings rather than inspecting response status"
    rationale: "AI SDK useChat wraps API errors in Error objects, original status code only available via message text"

# Metrics
metrics:
  duration: "5 min"
  completed: "2026-02-06"
---

# Phase 27 Plan 02: Student Error Handling & Loading UX Summary

**One-liner:** Fix error masking in my-feedback/my-conversations, add loading skeletons, detect chat rate limits and voice mic permission errors

## What Was Done

### Task 1: Fix my-feedback error masking and add loading skeleton
- Created `loading.tsx` with 3 skeleton feedback cards matching page layout (back link, subtitle, card headers, content lines, Loom embed placeholders)
- Changed `getFeedback()` return type from `FeedbackItem[]` to `{data: FeedbackItem[]; error: string | null}` tuple
- Success path returns `{data: feedbackWithDetails, error: null}`
- Catch block returns descriptive error message instead of empty array
- Page JSX checks error first, showing `ErrorAlert variant="block"` before checking empty state
- Prevents the misleading "No coach feedback yet" when the real issue is a database error

### Task 2: Fix my-conversations retry, transcript errors, chat rate limit, voice mic errors
**my-conversations/page.tsx:**
- Extracted `fetchConversations` into a `useCallback` for reuse from both `useEffect` and retry button
- Replaced `window.location.reload()` error retry with `ErrorAlert` component using state-based retry (`setError(null) + setIsLoading(true) + fetchConversations()`)
- Replaced generic loading spinner with 3 skeleton conversation cards
- Added `transcriptError` state to `ConversationCard` for failed transcript loads
- Non-OK responses and network errors now set `transcriptError` instead of silently failing
- Transcript error shows "Failed to load transcript" with a "Click to retry" button that resets and re-fetches

**ChatPanel.tsx:**
- Enhanced error display to detect rate limit errors by checking `error.message` for "too many" (case-insensitive) or "429"
- Rate limit shows: "You're sending messages too quickly. Please wait a moment before trying again."
- Added offline detection via `navigator.onLine` with specific message
- Falls back to generic "Something went wrong" for other errors
- Kept existing `handleRetry` function intact

**useRealtimeConversation.ts:**
- Replaced generic catch-all error message with specific detection:
  - `NotAllowedError` -> "Microphone access denied. Please allow microphone access in your browser settings and try again."
  - `NotFoundError` -> "No microphone found. Please connect a microphone and try again."
  - `NotReadableError` -> "Microphone is in use by another application. Please close other apps using your mic and try again."
  - Token/session errors -> "Unable to start voice session. The service may be temporarily unavailable."
  - Other errors -> original `e.message` or fallback

## Task Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Fix my-feedback error masking and add loading skeleton | b4f062a | loading.tsx, page.tsx |
| 2 | Fix conversations retry, chat rate limit, and voice mic errors | 482880b | my-conversations/page.tsx, ChatPanel.tsx, useRealtimeConversation.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All 7 verification checks passed:
1. `npx tsc --noEmit` - clean, no errors
2. `loading.tsx` exists at `src/app/(dashboard)/my-feedback/loading.tsx`
3. `window.location.reload` count in my-conversations: 0
4. Both my-feedback and my-conversations import and use ErrorAlert
5. `NotAllowedError` detection present in useRealtimeConversation.ts
6. Rate limit detection ("too many" / "429") present in ChatPanel.tsx
7. `transcriptError` state exists in my-conversations/page.tsx

## Next Phase Readiness

Phase 27 (Student Page UX Polish) is now complete with both plans executed:
- 27-01: Loading skeletons + error handling for dashboard, course detail, lesson player
- 27-02: Error masking fixes, retry improvements, and error specificity for feedback, conversations, chat, voice

Ready to proceed to Phase 28 (Coach Page UX Polish).

## Self-Check: PASSED
