# Phase 1: Foundation - Context

**Gathered:** 2026-01-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the technical foundation: database schema with Drizzle + Neon, Clerk authentication with roles and webhook account creation, and basic Mux video player. This phase delivers the infrastructure all other features depend on.

</domain>

<decisions>
## Implementation Decisions

### Database Structure
- Soft delete pattern: add `deletedAt` column, filter out deleted records in queries
- Audit fields: `createdAt` and `updatedAt` on all tables (timestamps only, no user tracking)
- ID generation: UUIDs for all primary keys
- Content hierarchy: Course → Module → Lesson (three levels)

### Auth Flow & Roles
- Three distinct roles: Admin, Coach, Student
- External webhook creates user AND grants course access in single call
- Webhook source: External CRM/system (design generic webhook that works for any source)

### Video Player Basics
- Full standard controls: play/pause, scrubber, volume, fullscreen
- Playback speed options available (0.5x, 1x, 1.5x, 2x)
- No autoplay: video shows thumbnail, student presses play when ready
- Fullscreen mode supported

### Course Access Model
- Students can have access to multiple courses simultaneously
- Optional expiration date on access grants (can be lifetime or expire)
- When access expires: progress data preserved, course hidden. If access restored, student continues where they left off.
- Two access tiers: Preview (first few lessons) and Full access

### Claude's Discretion
- Whether coach role inherently includes student capabilities (lean toward yes for simplicity)
- Exact webhook payload structure and authentication method
- Video player poster/thumbnail handling
- How many lessons are included in "preview" tier

</decisions>

<specifics>
## Specific Ideas

No specific references provided — open to standard approaches for LMS foundations.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-01-26*
