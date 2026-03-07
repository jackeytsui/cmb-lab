---
phase: 57-builder-completion
plan: 02
subsystem: ui, api
tags: [mux, video-upload, webcam, react, dialog, thumbnails]

# Dependency graph
requires:
  - phase: 57-builder-completion
    plan: 01
    provides: "Position persistence, save/load cycle, builder page with FlowEditor wiring"
  - phase: 56-flow-editor-node-ux
    provides: "VideoStepNode, FlowEditor, builder page layout"
provides:
  - "VideoRecorder uploads WebM to Mux via direct upload URL with polling"
  - "VideoLibraryPicker dialog for selecting existing Mux videos"
  - "Mux thumbnail display in VideoStepNode and builder page"
  - "Builder page integrates both recording and library selection flows"
affects: [58-basic-player]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Mux direct upload: POST upload-url -> PUT blob -> poll check-status", "Mux thumbnail via image.mux.com/{playbackId}/thumbnail.webp"]

key-files:
  created:
    - "src/components/video-thread/VideoLibraryPicker.tsx"
  modified:
    - "src/components/video-thread/VideoRecorder.tsx"
    - "src/components/video-thread/VideoStepNode.tsx"
    - "src/app/(dashboard)/admin/video-threads/[threadId]/builder/page.tsx"

key-decisions:
  - "Mux direct upload pattern: POST to get URL, PUT blob, poll check-status every 3s up to 60s"
  - "VideoLibraryPicker as separate Dialog component (not inline) for reusability"
  - "Three-state video area: Mux thumbnail (primary) > legacy video fallback > recorder with library picker"

patterns-established:
  - "Mux upload flow: upload-url -> PUT blob -> poll check-status -> onUploadComplete callback"
  - "Library picker pattern: Dialog fetches /api/admin/uploads?status=ready, grid of thumbnails, click to select"
  - "Video area priority: muxPlaybackId thumbnail > videoUrl legacy > recorder"

# Metrics
duration: 6m 0s
completed: 2026-02-14
---

# Phase 57 Plan 02: Video Mux Upload + Library Picker Summary

**Webcam recording uploads to Mux via direct upload, library picker selects existing videos, VideoStepNode shows Mux thumbnails**

## Performance

- **Duration:** 6m 0s
- **Started:** 2026-02-14T04:49:33Z
- **Completed:** 2026-02-14T04:55:33Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- VideoRecorder now uploads recorded WebM blobs to Mux via direct upload URL, with polling until ready (max 60s)
- VideoLibraryPicker dialog shows grid of ready Mux videos with thumbnails, click to select
- VideoStepNode displays Mux thumbnail image (image.mux.com) when playback ID exists, with green checkmark
- Builder page integrates both recording and library selection flows with "Choose from Library" button

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor VideoRecorder to upload via Mux direct upload** - `ea69cdd` (feat)
2. **Task 2: Create VideoLibraryPicker component** - `d23b0b7` (feat)
3. **Task 3: Integrate Mux into builder page and update VideoStepNode thumbnail** - `5737fd4` (feat)

## Files Created/Modified
- `src/components/video-thread/VideoRecorder.tsx` - Refactored: onUpload -> onUploadComplete, Mux direct upload with polling
- `src/components/video-thread/VideoLibraryPicker.tsx` - New: Dialog to pick existing Mux videos from library
- `src/components/video-thread/VideoStepNode.tsx` - Mux thumbnail display, green checkmark badge for attached videos
- `src/app/(dashboard)/admin/video-threads/[threadId]/builder/page.tsx` - Wired VideoRecorder + VideoLibraryPicker, handleRecordingComplete + handleLibrarySelect

## Decisions Made
- Used Mux direct upload pattern (POST upload-url, PUT blob, poll check-status) matching existing API routes
- VideoLibraryPicker as standalone Dialog for reusability across builder contexts
- Three-tier video display: Mux thumbnail (primary) > legacy videoUrl fallback > recorder view

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors (29 total) from uninstalled packages (sonner, @xyflow/react, etc.) -- none related to plan changes
- Build verification skipped due to these pre-existing module-not-found errors (same as 57-01)

## User Setup Required
None - no external service configuration required. Mux API keys must already be configured from prior setup.

## Next Phase Readiness
- Phase 57 (Builder Completion) is now fully complete
- Video recording, library picking, and Mux thumbnail display all wired into builder
- Ready for Phase 58 (Basic Player) which will consume the uploaded video content

## Self-Check: PASSED

- All 4 key files: FOUND
- Commit ea69cdd (Task 1): FOUND
- Commit d23b0b7 (Task 2): FOUND
- Commit 5737fd4 (Task 3): FOUND

---
*Phase: 57-builder-completion*
*Completed: 2026-02-14*
