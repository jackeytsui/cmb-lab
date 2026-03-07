---
phase: 06
plan: 02
subsystem: audio-interactions
tags: [audio, grading, api, n8n, webhook, formdata]
dependencies:
  requires: ["06-01"]
  provides: ["audio-grading-api", "audio-interaction-complete"]
  affects: ["07-coach-dashboard"]
tech-stack:
  added: []
  patterns: ["formdata-upload", "mock-fallback", "dynamic-file-extension"]
key-files:
  created:
    - src/app/api/grade-audio/route.ts
  modified:
    - src/lib/grading.ts
    - src/components/audio/AudioInteraction.tsx
decisions:
  - id: audio-formdata
    choice: "FormData for audio upload instead of base64"
    why: "Efficient binary transfer, proper MIME type handling"
  - id: mock-fallback-audio
    choice: "Mock response when N8N_AUDIO_GRADING_WEBHOOK_URL not configured"
    why: "Enable development without n8n, score 85 for consistency"
  - id: dynamic-extension
    choice: "getFileExtensionForMimeType for audio filename"
    why: "Cross-browser compatibility (webm/mp4/ogg)"
metrics:
  duration: 4min
  completed: 2026-01-27
---

# Phase 06 Plan 02: Audio Grading Integration Summary

Audio grading API with n8n webhook integration and complete AudioInteraction flow.

## What Was Built

### API Route: /api/grade-audio

Created POST endpoint accepting FormData with audio file:
- Parses FormData (audio, interactionId, expectedAnswer, language)
- Validates audio file exists and has content
- Mock response fallback when webhook not configured (score 85)
- 15 second timeout matching text grading pattern
- Forwards to n8n webhook as FormData
- Error handling: 401/400/502/504/500

### Audio Grading Types

Extended grading.ts with audio-specific types:
- `AudioGradingRequest` - metadata sent with audio
- `AudioGradingResponse` - extends GradingResponse with optional transcription

### AudioInteraction Updates

Wired component to real API:
- Calls /api/grade-audio with FormData
- Dynamic file extension (webm/mp4/ogg) based on detected MIME type
- Added `expectedAnswer` prop for grading comparison
- Displays transcription when available ("What we heard: ...")
- User-friendly error messages for timeout and service unavailable

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Audio transfer | FormData | Efficient binary, proper MIME handling |
| File naming | Dynamic extension | Cross-browser (Chrome webm, Safari mp4) |
| Mock response | Score 85, isCorrect: true | Consistent dev testing |
| Transcription display | Below feedback, italic | Clear but secondary info |

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Verification

1. Audio grading API accepts FormData and returns grading response - PASSED
2. Mock fallback enables development without n8n configured - PASSED
3. AudioInteraction uses dynamic file extension based on MIME - PASSED
4. AudioInteraction displays transcription when available - PASSED
5. Audio submission follows same retry logic as text - PASSED
6. User sees clear error messages for timeout/service unavailable - PASSED

## Commits

| Hash | Message |
|------|---------|
| c58f9f5 | feat(06-02): add audio grading API route |
| 98f518a | feat(06-02): wire AudioInteraction to grading API |

## Next Phase Readiness

Phase 06-03 (Audio Playback) can proceed:
- AudioInteraction complete with grading flow
- Audio recording and submission working
- n8n webhook pattern established

### Integration Requirements

To enable real audio grading:
1. Create n8n workflow with Webhook trigger
2. Add OpenAI Whisper transcription node
3. Add comparison logic
4. Set N8N_AUDIO_GRADING_WEBHOOK_URL in .env.local
