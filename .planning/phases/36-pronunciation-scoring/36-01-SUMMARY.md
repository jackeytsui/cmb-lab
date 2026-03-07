---
phase: 36-pronunciation-scoring
plan: 01
subsystem: pronunciation-scoring
tags: [azure-speech, rest-api, pronunciation, audio-grading, chinese]
requires:
  - phase: 33-practice-set-player
    provides: practice grade route and GradeResult type
provides:
  - Azure Speech REST API pronunciation assessment service
  - Extended GradeResult with pronunciationDetails field
  - Three-tier audio grading fallback (Azure -> n8n -> mock)
affects:
  - 36-02 (PronunciationResult UI reads pronunciationDetails from GradeResult)
  - 36-03 (coach review dashboard queries pronunciation results)
tech-stack:
  added: []
  patterns: [azure-rest-api-pronunciation, three-tier-grading-fallback]
key-files:
  created:
    - src/types/pronunciation.ts
    - src/lib/pronunciation.ts
  modified:
    - src/lib/practice-grading.ts
    - src/app/api/practice/grade/route.ts
key-decisions:
  - "REST API over SDK: no microsoft-cognitiveservices-speech-sdk installed, pure fetch-based approach avoids audio format conversion dependency"
  - "Three-tier fallback: Azure pronunciation (when configured + targetPhrase) -> n8n webhook -> mock response for dev"
  - "Language mapping: cantonese -> zh-HK, mandarin/both -> zh-CN (Mandarin default per project convention)"
  - "GradeResult extended with optional pronunciationDetails (backward compatible, existing graders unaffected)"
duration: 6min
completed: 2026-02-07
---

# Phase 36 Plan 01: Azure Pronunciation Service & Grade Route Integration Summary

**Azure Speech REST API pronunciation assessment with three-tier audio grading fallback and extended GradeResult type**

## Performance

- **Duration:** 6 minutes
- **Started:** 2026-02-07T06:07:03Z
- **Completed:** 2026-02-07T06:13:53Z
- **Tasks:** 2/2
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- Created `PronunciationAssessmentResult` and `PronunciationWordResult` type definitions for Azure Speech API responses
- Built `assessPronunciation()` service that calls Azure Speech REST API with base64-encoded pronunciation assessment config, 20-second timeout, and proper error handling
- Built `mapToAzureContentType()` to map browser MIME types (ogg, webm, wav) to Azure-compatible Content-Type headers
- Built `generatePronunciationFeedback()` for human-readable score-based feedback messages
- Extended `GradeResult` interface with optional `pronunciationDetails` field (backward compatible)
- Integrated Azure pronunciation assessment into the practice grade route as the highest-priority audio grading path
- Established three-tier fallback: Azure (when AZURE_SPEECH_KEY + AZURE_SPEECH_REGION + targetPhrase) -> n8n webhook -> mock
- Unified `GradeResult` from a single source of truth (`practice-grading.ts`) instead of duplicate inline definition in route.ts

## Task Commits

1. Task 1: Create pronunciation types and Azure REST API service - `5aa3d0c`
2. Task 2: Extend GradeResult and integrate Azure scoring into grade route - `636cb99`

## Files Created/Modified

- `src/types/pronunciation.ts` - PronunciationAssessmentResult and PronunciationWordResult type definitions
- `src/lib/pronunciation.ts` - Azure Speech REST API service with assessPronunciation, mapToAzureContentType, generatePronunciationFeedback exports (176 lines)
- `src/lib/practice-grading.ts` - Extended GradeResult with optional pronunciationDetails field
- `src/app/api/practice/grade/route.ts` - Added Azure pronunciation path before n8n fallback, imported shared GradeResult, removed inline type

## Decisions Made

1. **REST API over SDK:** Used Azure Speech REST API (direct fetch) instead of the microsoft-cognitiveservices-speech-sdk npm package. The REST API accepts OGG/WebM audio directly, avoiding the need for ffmpeg or audio format conversion. This was recommended in the research phase.
2. **Three-tier fallback:** Azure pronunciation assessment is tried first when credentials are configured AND a targetPhrase exists. Falls back to n8n webhook, then to mock response. This ensures the system works in all environments.
3. **Language mapping:** "cantonese" maps to zh-HK, everything else (including "mandarin" and "both") maps to zh-CN. This follows the project convention of defaulting to Mandarin.
4. **Single GradeResult source:** Removed the inline `interface GradeResult` from route.ts and imported from `practice-grading.ts` to maintain a single source of truth. This ensures the new `pronunciationDetails` field is available everywhere.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Buffer type not assignable to BodyInit in fetch**

- **Found during:** Task 1
- **Issue:** TypeScript's DOM types don't recognize Node.js `Buffer` as a valid `BodyInit` for `fetch()`. The `body: audioBuffer` line caused a compilation error.
- **Fix:** Wrapped with `new Uint8Array(audioBuffer)` which is a valid BodyInit type and preserves the buffer data.
- **Files modified:** `src/lib/pronunciation.ts`
- **Commit:** `5aa3d0c`

**2. [Rule 1 - Bug] GradeResult type mismatch for transcription field**

- **Found during:** Task 2
- **Issue:** The old inline `GradeResult` in route.ts included a `transcription` field used by mock and n8n audio responses. The shared `GradeResult` from `practice-grading.ts` doesn't have this field (it's not part of the core grading contract).
- **Fix:** Removed explicit `: GradeResult` type annotation from the two response objects that include `transcription`, letting TypeScript infer the type. The `NextResponse.json()` call accepts any serializable value.
- **Files modified:** `src/app/api/practice/grade/route.ts`
- **Commit:** `636cb99`

## Issues Encountered

None beyond the deviations noted above.

## User Setup Required

Azure Speech Services credentials are required for pronunciation scoring. See `.planning/phases/36-pronunciation-scoring/36-USER-SETUP.md` for:
- Environment variables: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`
- Azure Portal setup steps
- Verification instructions
- Pricing information

Without Azure credentials, the system gracefully falls back to n8n audio grading.

## Next Phase Readiness

Plan 36-02 (PronunciationResult UI + player hook + feedback wiring) can proceed. It depends on:
- `PronunciationAssessmentResult` type (created in this plan)
- `GradeResult.pronunciationDetails` field (added in this plan)
- The grade route returning pronunciation data (implemented in this plan)

Plan 36-03 (Coach pronunciation review dashboard) can also proceed in parallel with 36-02.

## Self-Check: PASSED
