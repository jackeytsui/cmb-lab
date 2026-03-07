---
phase: 30-foundation-and-fonts
plan: 02
subsystem: ai
tags: [openai-realtime, voice-ai, language-preference, canto-mando, pedagogy, prompts]

# Dependency graph
requires:
  - phase: 30-foundation-and-fonts
    provides: "useLanguagePreference hook, LanguagePreference type, voice AI infrastructure"
provides:
  - "Language-aware voice AI tutor that respects user's cantonese/mandarin/both preference"
  - "CANTO-MANDO pedagogy sections in voice-tutor and chatbot system prompts"
  - "buildLanguageDirective() helper for language-specific AI instructions"
affects: [31-practice-builder, 32-grading-engine, 33-student-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Language preference threading: component hook -> connect() -> buildLessonInstructions()"
    - "Language directive builder pattern: switch on LanguagePreference enum"

key-files:
  created: []
  modified:
    - src/lib/lesson-context.ts
    - src/hooks/useRealtimeConversation.ts
    - src/components/voice/VoiceConversation.tsx
    - src/db/seed.ts

key-decisions:
  - "Language directive appended as separate section after lesson context (not injected into system prompt)"
  - "Default language preference is 'both' when not specified"
  - "Seed prompts use onConflictDoNothing for idempotent re-runs"

patterns-established:
  - "Language preference threading: VoiceConversation -> connect(id, pref) -> buildLessonInstructions(id, pref) -> buildLanguageDirective(pref)"

# Metrics
duration: 8min
completed: 2026-02-06
---

# Phase 30 Plan 02: Language Preference Threading Summary

**Voice AI tutor now respects cantonese/mandarin/both preference via threaded call chain, with Canto-Mando pedagogy sections in all AI system prompts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-06T13:35:26Z
- **Completed:** 2026-02-06T13:43:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Language preference threaded from VoiceConversation through connect() to buildLessonInstructions()
- Three-branch LANGUAGE DIRECTIVE builder (cantonese, mandarin, both) with specific teaching guidance per mode
- Voice-tutor-system and chatbot-system seed prompts enhanced with Canto-Mando pedagogy sections
- DEFAULT_VOICE_TUTOR_SYSTEM fallback constant updated with matching pedagogy

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread language preference through voice AI call chain** - `a79af08` (feat)
2. **Task 2: Update seed prompts with Canto-Mando pedagogical awareness** - `88f4cb6` (feat)

## Files Created/Modified
- `src/lib/lesson-context.ts` - Added languagePreference param, buildLanguageDirective(), CANTO-MANDO TEACHING METHOD to fallback
- `src/hooks/useRealtimeConversation.ts` - Added languagePreference to connect() signature and passed to buildLessonInstructions
- `src/components/voice/VoiceConversation.tsx` - Imported useLanguagePreference hook, passes preference to connect()
- `src/db/seed.ts` - Added CANTO-MANDO TEACHING METHOD to voice-tutor-system, CANTO-MANDO CONNECTIONS to chatbot-system

## Decisions Made
- Language directive is appended as a separate section after lesson context rather than injected into the base system prompt. This keeps the system prompt stable for DB versioning while the directive is dynamically generated per session.
- Default language preference is "both" when not specified, preserving backward compatibility.
- The CANTO-MANDO pedagogy content covers cognates, tonal mapping, vocabulary bridges, grammar parallels, and pronunciation contrasts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Build fails at static page generation due to missing Clerk publishableKey environment variable (pre-existing issue, not related to changes). TypeScript compilation passes cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Voice AI fully language-aware and ready for student use
- Chatbot prompts enhanced with cross-language teaching methodology
- Language preference infrastructure established for future phases (practice exercises, grading)

## Self-Check: PASSED

---
*Phase: 30-foundation-and-fonts*
*Completed: 2026-02-06*
