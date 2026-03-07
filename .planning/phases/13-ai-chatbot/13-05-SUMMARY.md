---
phase: 13-ai-chatbot
plan: 05
subsystem: ui
tags: [chatbot, accessibility, mobile, framer-motion, error-handling, keyboard-shortcuts]

# Dependency graph
requires:
  - phase: 13-03
    provides: useChatbot hook, ChatWidget global mount, ChatPanel/ChatMessage components
  - phase: 13-04
    provides: ChineseAnnotation rendering, chatbot system prompt with language preference
provides:
  - Mobile responsive chat panel (full-width on small screens)
  - Keyboard navigation (Escape to close)
  - Error recovery with retry
  - Stop generation button
  - Fade-in message animations
  - Accessible aria-labels
  - Tool invocation indicator for RAG searches
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escape key listener via useEffect keydown handler"
    - "Error recovery pattern: clearError + re-send last user message"
    - "Stop streaming via AI SDK stop() function"
    - "Responsive panel sizing with calc(100vw-3rem) / fixed width breakpoint"

key-files:
  modified:
    - src/components/chat/ChatWidget.tsx
    - src/components/chat/ChatPanel.tsx
    - src/components/chat/ChatMessage.tsx

key-decisions:
  - "Escape key closes chat panel (standard UI convention)"
  - "Error retry re-sends last user message automatically"
  - "Stop button uses red Square icon for visual distinction from Send"
  - "Mobile panel uses calc(100vw-3rem) width and 70vh height"
  - "Tool invocation shows 'Searching knowledge base...' only while pending (not after result)"

patterns-established:
  - "Responsive chat panel: calc-based mobile sizing with sm: breakpoint for desktop"
  - "AI SDK error recovery: clearError() then re-send"

# Metrics
duration: 5min
completed: 2026-01-30
---

# Phase 13 Plan 05: Chatbot Polish Summary

**Mobile responsive chatbot with keyboard shortcuts, error recovery, stop generation, fade-in animations, and accessibility labels**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-30T01:10:00Z
- **Completed:** 2026-01-30T01:15:00Z
- **Tasks:** 1 auto + 1 checkpoint (human-verified)
- **Files modified:** 3

## Accomplishments
- Mobile responsive panel (full-width on small screens, 380px on desktop)
- Keyboard navigation: Escape closes panel, auto-focus on input
- Error recovery with "Try again" button that re-sends last message
- Stop generation button during streaming
- Fade-in animation on messages via framer-motion
- Accessible aria-labels on all interactive elements
- Tool invocation indicator ("Searching knowledge base...") during RAG
- break-words prevents long message overflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Add polish -- mobile responsiveness, keyboard handling, error recovery, accessibility** - `78f52e6` (feat)

**Plan metadata:** (pending docs commit)

## Files Modified
- `src/components/chat/ChatWidget.tsx` - Mobile responsive sizing, Escape key handler, accessible aria-labels
- `src/components/chat/ChatPanel.tsx` - Auto-focus, error recovery with retry, stop button, input ref
- `src/components/chat/ChatMessage.tsx` - Fade-in animation, break-words, tool invocation indicator

## Decisions Made
- Escape key closes chat panel (standard UI convention)
- Error retry re-sends last user message automatically via clearError + sendMessage
- Stop button uses red Square icon for visual distinction from cyan Send button
- Mobile panel uses calc(100vw-3rem) width and 70vh height for near-full-screen on mobile
- Tool invocation indicator only shown while tool is pending (not after result returned)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 8 CHAT requirements verified (CHAT-01 through CHAT-08)
- Phase 13 (AI Chatbot) is now complete
- Milestone v1.1 is fully complete (all 4 phases: 10, 11, 12, 13)

---
*Phase: 13-ai-chatbot*
*Completed: 2026-01-30*
