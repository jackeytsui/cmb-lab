---
phase: 05-student-dashboard
plan: 02
execution:
  started: 2026-01-27T02:44:10Z
  completed: 2026-01-27T02:46:15Z
  duration: 2min
dependencies:
  requires:
    - phase-04 (progress foundation with lessonProgress schema)
    - phase-01 (database schema, auth)
  provides:
    - Course detail page with module/lesson navigation
    - LessonCard component with three visual states
    - ModuleSection component for grouping
  affects:
    - 05-03 (lesson player page will use similar patterns)
tech-stack:
  added: []
  patterns:
    - Batch progress queries (avoid N+1)
    - Linear unlock computation in-memory
    - Framer Motion hover animations
key-files:
  created:
    - src/app/(dashboard)/courses/[courseId]/page.tsx
    - src/components/course/LessonCard.tsx
    - src/components/course/ModuleSection.tsx
  modified: []
decisions:
  - id: unlock-batch-query
    choice: Batch fetch all progress then compute in-memory
    reason: Efficient - single query vs N+1 for unlock checks
  - id: first-lesson-always-unlocked
    choice: First lesson in each module is always accessible
    reason: Matches existing unlock.ts logic and project decisions
metrics:
  tasks: 3/3
  commits: 3
---

# Phase 05 Plan 02: Course Detail Page Summary

Course detail page with module/lesson navigation showing lock/unlock/complete states based on linear progression.

## What Was Built

### LessonCard Component (`src/components/course/LessonCard.tsx`)

Client component handling three visual states:

1. **Locked** - Lock icon, opacity-50, pointer-events-none, "Complete X first" message
2. **Unlocked** - Play icon (cyan), clickable Link, Framer Motion hover scale
3. **Completed** - Checkmark icon (green), clickable for re-watch

Features:
- Duration formatting (MM:SS)
- Truncated title/description
- Previous lesson title display for lock message

### ModuleSection Component (`src/components/course/ModuleSection.tsx`)

Server component for semantic grouping:
- Module title and optional description
- Children slot for LessonCard components
- Consistent spacing (space-y-4 for section, space-y-3 for lessons)

### Course Detail Page (`src/app/(dashboard)/courses/[courseId]/page.tsx`)

Server component with:
- Auth check (Clerk + internal user lookup)
- Access verification (courseAccess with expiry check)
- Nested data fetch (course -> modules -> lessons via relations)
- **Batch progress query** - single query for all lesson progress, not N+1
- In-memory unlock computation
- Back navigation to dashboard
- Empty states for missing modules/lessons

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 81c1404 | feat | Create LessonCard component with lock states |
| 70217e7 | feat | Create ModuleSection component |
| 6459924 | feat | Create course detail page with unlock logic |

## Deviations from Plan

None - plan executed exactly as written.

## Key Implementation Details

### Batch Progress Query Pattern

```typescript
// Single query for all lessons
const progressRecords = await db.query.lessonProgress.findMany({
  where: and(
    eq(lessonProgress.userId, user.id),
    inArray(lessonProgress.lessonId, allLessonIds)
  ),
});
const progressMap = new Map(progressRecords.map(p => [p.lessonId, p]));

// Compute unlock in-memory (O(n) where n = total lessons)
for (const module of course.modules) {
  for (let i = 0; i < module.lessons.length; i++) {
    // First lesson always unlocked, rest check previous completedAt
  }
}
```

### Visual State Logic

```typescript
const isLocked = !isUnlocked;
const Icon = isCompleted ? Check : isUnlocked ? Play : Lock;
const iconColor = isCompleted ? "green-500" : isUnlocked ? "cyan-500" : "zinc-500";
```

## Success Criteria

- [x] LessonCard component handles locked/unlocked/completed states
- [x] ModuleSection component groups lessons under module heading
- [x] Course detail page fetches course with nested modules/lessons
- [x] Unlock status computed efficiently (batch query, not N+1)
- [x] First lesson in module is always accessible
- [x] Visual distinction clear between locked/unlocked/completed
- [x] Navigation works for unlocked lessons

## Next Phase Readiness

Ready for 05-03 (Lesson Player Page):
- LessonCard links to `/lessons/${lesson.id}`
- Progress system from Phase 4 already integrated
- Same auth/access patterns can be reused
