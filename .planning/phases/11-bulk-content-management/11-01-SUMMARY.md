---
phase: 11
plan: 01
subsystem: video-infrastructure
tags: [mux, video-upload, webhook, database-schema]
dependency-graph:
  requires: [01-foundation, 09-admin-panel]
  provides: [mux-upload-url-api, mux-webhook-handler, video-uploads-schema]
  affects: [11-02, 11-03, 11-04, 11-05]
tech-stack:
  added: ["@mux/mux-node"]
  patterns: [direct-upload, webhook-signature-verification, status-tracking]
key-files:
  created:
    - src/lib/mux.ts
    - src/db/schema/uploads.ts
    - src/app/api/admin/mux/upload-url/route.ts
    - src/app/api/admin/mux/webhook/route.ts
  modified:
    - package.json
    - src/db/schema/index.ts
    - .env.example
decisions:
  - "@mux/mux-node SDK for official Mux integration"
  - "uploadStatusEnum: pending, uploading, processing, ready, errored"
  - "Webhook signature verification using HMAC-SHA256"
  - "Coach role minimum for upload URL generation"
metrics:
  duration: 8min
  completed: 2026-01-28
---

# Phase 11 Plan 01: Mux Upload Infrastructure Summary

Mux direct upload with webhook status tracking via @mux/mux-node SDK.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install Mux SDK and create client | bec7186 | src/lib/mux.ts, package.json |
| 2 | Create video uploads schema | b8a28f8 | src/db/schema/uploads.ts |
| 3 | Create upload URL and webhook API routes | 5b665ad | API routes in src/app/api/admin/mux/ |

## What Was Built

### Mux Client (src/lib/mux.ts)
- Singleton Mux client using MUX_TOKEN_ID and MUX_TOKEN_SECRET
- Exported for use across the application

### Video Uploads Schema (src/db/schema/uploads.ts)
- `uploadStatusEnum`: pending, uploading, processing, ready, errored
- `videoUploads` table with:
  - Mux identifiers (muxUploadId, muxAssetId, muxPlaybackId)
  - Upload metadata (filename, status, errorMessage)
  - Video metadata (durationSeconds)
  - Assignment (lessonId - nullable until assigned)
  - Ownership (uploadedBy references users.clerkId)
  - Timestamps (createdAt, updatedAt)

### Upload URL API (POST /api/admin/mux/upload-url)
- Requires coach role minimum
- Accepts `{ filename: string }` in request body
- Creates Mux direct upload with cors_origin and playback_policy
- Tracks upload in database with pending status
- Returns `{ uploadUrl, uploadId }`

### Webhook Handler (POST /api/admin/mux/webhook)
- Verifies Mux signature using MUX_WEBHOOK_SECRET
- Handles webhook events:
  - `video.upload.asset_created`: Sets status to "processing"
  - `video.asset.ready`: Sets status to "ready", stores playbackId and duration
  - `video.asset.errored`: Sets status to "errored" with message
  - `video.upload.errored`: Sets status to "errored" with message

## Verification Results

- [x] npm run build compiles without TypeScript errors
- [x] video_uploads table created in database
- [x] API route files exist at correct paths
- [x] Database schema includes uploadStatusEnum and videoUploads table
- [x] Mux client properly configured in src/lib/mux.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zod v4 / React Hook Form type incompatibility**
- **Found during:** Task 1 build verification
- **Issue:** Pre-existing type errors in CourseForm, LessonForm, ModuleForm due to Zod v4 inference incompatibility with react-hook-form resolver
- **Fix:** Changed from `z.infer<typeof schema>` to explicit type definitions and cast resolver `as never`
- **Files modified:** src/components/admin/CourseForm.tsx, LessonForm.tsx, ModuleForm.tsx
- **Commit:** bec7186

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| @mux/mux-node SDK | Official Mux SDK for Node.js, well-maintained |
| uploadStatusEnum with 5 states | Covers full upload lifecycle from URL generation to ready/error |
| HMAC-SHA256 signature verification | Mux webhook security best practice |
| lessonId as nullable FK | Allows uploads before assignment to specific lesson |
| uploadedBy references clerkId | Consistent with existing user reference pattern |

## Environment Variables Added

```
MUX_WEBHOOK_SECRET=  # Added to .env.example
```

Note: MUX_TOKEN_ID and MUX_TOKEN_SECRET already existed in .env.example.

## Next Steps

- 11-02: Bulk upload UI component
- 11-03: Upload queue management with rate limiting
- 11-04: Video-lesson assignment interface
- 11-05: Upload status dashboard

## Next Phase Readiness

This plan provides:
- Mux client for SDK operations
- Database schema for tracking upload status
- API endpoints for upload URL generation and webhook handling

Ready for 11-02 to build the upload UI that calls POST /api/admin/mux/upload-url.
