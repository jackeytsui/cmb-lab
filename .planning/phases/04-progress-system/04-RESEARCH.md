# Phase 4: Progress System - Research

**Researched:** 2026-01-26
**Domain:** Lesson Progress Tracking, Linear Progression Unlock, Completion State Persistence
**Confidence:** HIGH

## Summary

Phase 4 implements progress tracking for the LMS, enabling the system to track lesson completion, enforce linear progression (lesson N must complete before lesson N+1 unlocks), and calculate completion state based on video finished AND all interactions passed. This research covers three primary domains:

1. **Progress Data Model**: A `lesson_progress` table linking users to lessons with completion status, video watch percentage, and interaction completion tracking. Uses composite unique constraint (userId + lessonId) with upsert pattern for idempotent updates.

2. **Linear Progression Logic**: Query-based unlock determination - lesson N+1 is accessible only if lesson N (by sortOrder within module) has `completedAt` timestamp. Implemented as database query + server-side check, not UI-only.

3. **Completion Criteria**: Lesson completion requires BOTH video watched to end (95%+ watch percentage) AND all filtered interactions for that lesson marked as passed in `interaction_attempts`. Progress updates via API with atomic database operations.

**Primary recommendation:** Create `lesson_progress` table with composite key, use Drizzle `onConflictDoUpdate` for upsert pattern, calculate completion state server-side with single query joining interactions, and expose progress via API routes with caching.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | ^0.38.x | Database queries with relations | Already in project, type-safe |
| @neondatabase/serverless | ^0.10.x | Neon HTTP driver | Already configured |
| Zod | ^3.24.x | Request validation | Already in project |
| Next.js API Routes | 16.x | Progress API endpoints | Standard for external access |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `unstable_cache` | Next.js built-in | Cache progress queries | Dashboard page, reduce DB load |
| XState v5 | ^5.x | Video player state (existing) | Emits video completion events |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Database progress storage | localStorage | No cross-device sync, no analytics |
| API Routes | Server Actions | Server Actions fine for mutations, Routes better for GET caching |
| Polling for unlock state | WebSocket | Overkill for LMS, polling on navigation sufficient |

**Installation:**
```bash
# No new packages required - uses existing Drizzle + Next.js stack
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   └── schema/
│       └── progress.ts        # lesson_progress table + relations
├── app/
│   └── api/
│       └── progress/
│           ├── route.ts       # GET user progress summary
│           └── [lessonId]/
│               └── route.ts   # GET/POST lesson progress
├── lib/
│   ├── progress.ts            # Progress calculation utilities
│   └── unlock.ts              # Linear progression unlock logic
├── hooks/
│   └── useProgress.ts         # Client-side progress hook
└── components/
    └── progress/
        ├── ProgressBar.tsx    # Visual progress indicator
        └── LessonLock.tsx     # Lock/unlock indicator
```

### Pattern 1: Lesson Progress Table Schema
**What:** Database table tracking individual lesson progress per user
**When to use:** All progress tracking operations
**Example:**
```typescript
// Source: Drizzle ORM docs + LMS best practices
import {
  pgTable,
  uuid,
  timestamp,
  integer,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { lessons } from "./courses";

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    // Video completion tracking
    videoWatchedPercent: integer("video_watched_percent").notNull().default(0),
    videoCompletedAt: timestamp("video_completed_at"),
    // Interaction completion tracking
    interactionsCompleted: integer("interactions_completed").notNull().default(0),
    interactionsTotal: integer("interactions_total").notNull().default(0),
    // Overall lesson completion
    completedAt: timestamp("completed_at"),
    // Timestamps
    startedAt: timestamp("started_at").notNull().defaultNow(),
    lastAccessedAt: timestamp("last_accessed_at").notNull().defaultNow(),
  },
  (table) => [
    // Composite unique constraint: one progress record per user per lesson
    unique("lesson_progress_user_lesson_unique").on(table.userId, table.lessonId),
  ]
);

// Relations
export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  user: one(users, {
    fields: [lessonProgress.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [lessonProgress.lessonId],
    references: [lessons.id],
  }),
}));

export type LessonProgress = typeof lessonProgress.$inferSelect;
export type NewLessonProgress = typeof lessonProgress.$inferInsert;
```

### Pattern 2: Upsert Progress with Drizzle
**What:** Create or update progress record atomically
**When to use:** Every video time update and interaction completion
**Example:**
```typescript
// Source: Drizzle ORM onConflictDoUpdate docs
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonProgress } from "@/db/schema/progress";

interface UpdateProgressInput {
  userId: string;
  lessonId: string;
  videoWatchedPercent?: number;
  interactionCompleted?: boolean;
}

export async function upsertLessonProgress(input: UpdateProgressInput) {
  const { userId, lessonId, videoWatchedPercent, interactionCompleted } = input;

  // Build set clause for updates
  const setClause: Record<string, unknown> = {
    lastAccessedAt: new Date(),
  };

  if (videoWatchedPercent !== undefined) {
    // Only update if new percent is higher (prevent regression)
    setClause.videoWatchedPercent = sql`GREATEST(${lessonProgress.videoWatchedPercent}, ${videoWatchedPercent})`;

    // Mark video complete if >= 95%
    if (videoWatchedPercent >= 95) {
      setClause.videoCompletedAt = sql`COALESCE(${lessonProgress.videoCompletedAt}, NOW())`;
    }
  }

  if (interactionCompleted) {
    setClause.interactionsCompleted = sql`${lessonProgress.interactionsCompleted} + 1`;
  }

  const [progress] = await db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId,
      videoWatchedPercent: videoWatchedPercent ?? 0,
      interactionsCompleted: interactionCompleted ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.userId, lessonProgress.lessonId],
      set: setClause,
    })
    .returning();

  return progress;
}
```

### Pattern 3: Check Lesson Completion Criteria
**What:** Determine if lesson is complete (video + all interactions)
**When to use:** After video ends or interaction completes
**Example:**
```typescript
// Source: Business logic from requirements
import { db } from "@/db";
import { lessonProgress, interactions, interactionAttempts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { filterInteractionsByPreference } from "@/lib/interactions";

interface CompletionCheck {
  isComplete: boolean;
  videoComplete: boolean;
  interactionsComplete: boolean;
  interactionsPassed: number;
  interactionsRequired: number;
}

export async function checkLessonCompletion(
  userId: string,
  lessonId: string,
  languagePreference: "cantonese" | "mandarin" | "both"
): Promise<CompletionCheck> {
  // Get progress record
  const progress = await db.query.lessonProgress.findFirst({
    where: and(
      eq(lessonProgress.userId, userId),
      eq(lessonProgress.lessonId, lessonId)
    ),
  });

  // Get all interactions for this lesson
  const allInteractions = await db.query.interactions.findMany({
    where: eq(interactions.lessonId, lessonId),
  });

  // Filter by language preference (same logic as video player)
  const requiredInteractions = filterInteractionsByPreference(
    allInteractions,
    languagePreference
  );

  // Count passed interactions (has at least one correct attempt)
  const passedInteractionIds = await db
    .select({ interactionId: interactionAttempts.interactionId })
    .from(interactionAttempts)
    .where(
      and(
        eq(interactionAttempts.userId, userId),
        eq(interactionAttempts.isCorrect, true)
      )
    )
    .groupBy(interactionAttempts.interactionId);

  const passedSet = new Set(passedInteractionIds.map((r) => r.interactionId));
  const interactionsPassed = requiredInteractions.filter((i) =>
    passedSet.has(i.id)
  ).length;

  const videoComplete = progress?.videoCompletedAt !== null;
  const interactionsComplete = interactionsPassed >= requiredInteractions.length;
  const isComplete = videoComplete && interactionsComplete;

  return {
    isComplete,
    videoComplete,
    interactionsComplete,
    interactionsPassed,
    interactionsRequired: requiredInteractions.length,
  };
}
```

### Pattern 4: Linear Progression Unlock Check
**What:** Determine if a lesson is accessible based on previous lesson completion
**When to use:** Before rendering lesson, before allowing navigation
**Example:**
```typescript
// Source: LearnDash linear progression pattern
import { db } from "@/db";
import { lessons, lessonProgress, modules } from "@/db/schema";
import { eq, and, lt, desc } from "drizzle-orm";

interface UnlockStatus {
  isUnlocked: boolean;
  reason?: "first_lesson" | "previous_complete" | "previous_incomplete";
  previousLessonId?: string;
  previousLessonTitle?: string;
}

export async function checkLessonUnlock(
  userId: string,
  lessonId: string
): Promise<UnlockStatus> {
  // Get target lesson with its module and sortOrder
  const targetLesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: {
      module: true,
    },
  });

  if (!targetLesson) {
    return { isUnlocked: false, reason: "previous_incomplete" };
  }

  // Find previous lesson in same module (by sortOrder)
  const previousLesson = await db.query.lessons.findFirst({
    where: and(
      eq(lessons.moduleId, targetLesson.moduleId),
      lt(lessons.sortOrder, targetLesson.sortOrder)
    ),
    orderBy: [desc(lessons.sortOrder)],
  });

  // First lesson in module is always unlocked
  if (!previousLesson) {
    return { isUnlocked: true, reason: "first_lesson" };
  }

  // Check if previous lesson is completed
  const prevProgress = await db.query.lessonProgress.findFirst({
    where: and(
      eq(lessonProgress.userId, userId),
      eq(lessonProgress.lessonId, previousLesson.id)
    ),
  });

  if (prevProgress?.completedAt) {
    return { isUnlocked: true, reason: "previous_complete" };
  }

  return {
    isUnlocked: false,
    reason: "previous_incomplete",
    previousLessonId: previousLesson.id,
    previousLessonTitle: previousLesson.title,
  };
}
```

### Pattern 5: Progress API Route with Caching
**What:** API endpoint to fetch user progress with caching
**When to use:** Dashboard, course navigation
**Example:**
```typescript
// Source: Next.js unstable_cache docs
// app/api/progress/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { lessonProgress, users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Cache progress for 60 seconds
const getCachedProgress = unstable_cache(
  async (userId: string) => {
    return db.query.lessonProgress.findMany({
      where: eq(lessonProgress.userId, userId),
      with: {
        lesson: {
          with: {
            module: {
              with: {
                course: true,
              },
            },
          },
        },
      },
    });
  },
  ["user-progress"],
  { revalidate: 60, tags: ["progress"] }
);

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get internal user ID
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const progress = await getCachedProgress(user.id);

  return NextResponse.json({ progress });
}
```

### Pattern 6: Video Completion Event Handler
**What:** Handle video ended event from player
**When to use:** When video playback reaches the end
**Example:**
```typescript
// Source: Existing video player pattern
"use client";

import { useCallback } from "react";

interface UseVideoCompletionOptions {
  lessonId: string;
  onComplete?: () => void;
}

export function useVideoCompletion({ lessonId, onComplete }: UseVideoCompletionOptions) {
  // Track video completion (95% threshold)
  const handleTimeUpdate = useCallback(
    async (currentTime: number, duration: number) => {
      if (duration === 0) return;

      const percent = Math.floor((currentTime / duration) * 100);

      // Update progress every 10% milestone
      if (percent % 10 === 0) {
        await fetch(`/api/progress/${lessonId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoWatchedPercent: percent }),
        });
      }
    },
    [lessonId]
  );

  // Handle video ended
  const handleVideoEnded = useCallback(async () => {
    const response = await fetch(`/api/progress/${lessonId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoWatchedPercent: 100 }),
    });

    const data = await response.json();
    if (data.lessonComplete) {
      onComplete?.();
    }
  }, [lessonId, onComplete]);

  return { handleTimeUpdate, handleVideoEnded };
}
```

### Anti-Patterns to Avoid
- **Storing progress only in localStorage**: No cross-device sync, data loss on clear, no analytics
- **Checking unlock status client-side only**: Users can bypass by manipulating state
- **Using polling to check completion**: Expensive; use event-driven updates instead
- **Not filtering interactions by language preference**: Completion criteria must match what user sees
- **Allowing video skip to count as complete**: Must track actual watch percentage, not just "ended" event
- **Race conditions on concurrent requests**: Use atomic upsert operations, not read-then-write

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress upsert | Manual INSERT...ON CONFLICT | Drizzle `onConflictDoUpdate` | Atomic, handles composite keys |
| Query caching | Manual cache object | `unstable_cache` | Built-in tag-based invalidation |
| Percentage calculation | String parsing | SQL `GREATEST()` | Atomic comparison in DB |
| Composite unique | Manual check-then-insert | PostgreSQL unique constraint | Race-condition free |
| Progress aggregation | Multiple queries | Drizzle `with` relations | Single query, type-safe |

**Key insight:** Progress tracking requires atomic operations to prevent race conditions. The pattern is: upsert with `onConflictDoUpdate`, use SQL expressions for comparisons (`GREATEST`, `COALESCE`), and enforce completion criteria server-side.

## Common Pitfalls

### Pitfall 1: Race Condition on Progress Updates
**What goes wrong:** Two concurrent requests update progress, one overwrites the other
**Why it happens:** Read-then-write pattern without locking
**How to avoid:** Use Drizzle `onConflictDoUpdate` with SQL expressions like `GREATEST()`
**Warning signs:** Progress jumping backwards, completion state flickering

### Pitfall 2: Completion Check Ignores Language Preference
**What goes wrong:** User with "Mandarin only" preference can't complete lesson because system expects Cantonese interactions
**Why it happens:** Completion check queries all interactions instead of filtering
**How to avoid:** Always apply `filterInteractionsByPreference()` before counting required interactions
**Warning signs:** Lesson shows incomplete even after user passed all visible interactions

### Pitfall 3: Video "Ended" Event Triggers Premature Completion
**What goes wrong:** User skips to end, video fires "ended", marked complete
**Why it happens:** Trusting ended event without tracking actual watch time
**How to avoid:** Track `videoWatchedPercent` throughout playback, require 95%+ for completion
**Warning signs:** Users completing lessons in seconds

### Pitfall 4: Unlock Check Performance on Large Catalogs
**What goes wrong:** Dashboard loads slowly due to N+1 queries checking each lesson's unlock status
**Why it happens:** Checking each lesson individually in a loop
**How to avoid:** Batch query all progress for enrolled courses, compute unlock status in memory
**Warning signs:** Dashboard load time scales with course count

### Pitfall 5: Progress Cache Staleness After Completion
**What goes wrong:** User completes lesson, navigates to dashboard, sees old progress
**Why it happens:** Cache not invalidated after progress update
**How to avoid:** Use `revalidateTag("progress")` after successful completion POST
**Warning signs:** User must refresh to see updated progress

### Pitfall 6: Module/Course Progress Calculation Drift
**What goes wrong:** Module shows 50% but only 1 of 3 lessons complete
**Why it happens:** Caching aggregate values instead of computing from source
**How to avoid:** Always compute module/course progress from `lessonProgress` records
**Warning signs:** Progress percentages don't match visible completion states

## Code Examples

Verified patterns from official sources:

### Drizzle Upsert with Composite Key
```typescript
// Source: Drizzle ORM docs - onConflictDoUpdate
await db
  .insert(lessonProgress)
  .values({
    userId,
    lessonId,
    videoWatchedPercent: 50,
  })
  .onConflictDoUpdate({
    target: [lessonProgress.userId, lessonProgress.lessonId],
    set: {
      videoWatchedPercent: sql`GREATEST(${lessonProgress.videoWatchedPercent}, 50)`,
      lastAccessedAt: new Date(),
    },
  });
```

### Next.js Cache with Tags
```typescript
// Source: Next.js unstable_cache docs
import { unstable_cache, revalidateTag } from "next/cache";

const getProgress = unstable_cache(
  async (userId: string) => {
    return db.query.lessonProgress.findMany({
      where: eq(lessonProgress.userId, userId),
    });
  },
  ["user-progress"],
  { revalidate: 60, tags: ["progress"] }
);

// After updating progress:
revalidateTag("progress");
```

### Drizzle Count with Relations
```typescript
// Source: Drizzle ORM docs - $count with relational queries
const coursesWithProgress = await db.query.courses.findMany({
  with: {
    modules: {
      with: {
        lessons: true,
      },
    },
  },
  extras: {
    completedLessons: db.$count(
      lessonProgress,
      and(
        eq(lessonProgress.userId, userId),
        isNotNull(lessonProgress.completedAt)
      )
    ),
  },
});
```

### Atomic Timestamp Update
```typescript
// Source: SQL patterns + Drizzle docs
// Only set completedAt if both video AND interactions are done
await db
  .update(lessonProgress)
  .set({
    completedAt: sql`
      CASE
        WHEN video_completed_at IS NOT NULL
          AND interactions_completed >= interactions_total
        THEN COALESCE(completed_at, NOW())
        ELSE NULL
      END
    `,
  })
  .where(
    and(
      eq(lessonProgress.userId, userId),
      eq(lessonProgress.lessonId, lessonId)
    )
  );
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage progress | Database with upsert | Always for LMS | Cross-device sync, analytics |
| Manual caching | `unstable_cache` | Next.js 14+ | Tag-based invalidation |
| Raw SQL upserts | Drizzle `onConflictDoUpdate` | Drizzle 0.28+ | Type-safe, composite key support |
| Polling for updates | Event-driven + cache invalidation | Modern React | Better UX, lower load |

**Deprecated/outdated:**
- `getStaticProps` for progress: Replaced by Server Components with caching
- Manual optimistic updates: React 19 `useOptimistic` handles this (already in project)
- Redux for progress state: Server state should stay on server, fetch when needed

## Open Questions

Things that couldn't be fully resolved:

1. **First Module Unlock Logic**
   - What we know: First lesson in module is always unlocked
   - What's unclear: Should first module require completing previous module's last lesson?
   - Recommendation: Implement module-level linear progression as optional flag on course

2. **Progress Visibility to Coaches**
   - What we know: Phase 7 involves coach dashboard
   - What's unclear: Should coaches see real-time progress or periodic snapshots?
   - Recommendation: Use same progress tables, add coach-filtered queries in Phase 7

3. **Video Progress Update Frequency**
   - What we know: Every timeupdate event would be too frequent
   - What's unclear: What interval balances accuracy vs. API load?
   - Recommendation: Update at 10% milestones (0%, 10%, 20%... 100%), not every second

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM onConflictDoUpdate](https://orm.drizzle.team/docs/insert#on-conflict-do-update) - Upsert pattern with composite keys
- [Next.js unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) - Cache with tags and revalidation
- [Drizzle ORM Relations](https://orm.drizzle.team/docs/rqb) - Relational query builder

### Secondary (MEDIUM confidence)
- [LearnDash Course Progression](https://www.learndash.com/support/docs/core/courses/course-progression/) - Linear progression pattern reference
- [GeeksforGeeks LMS Database Design](https://www.geeksforgeeks.org/sql/how-to-design-a-database-for-learning-management-system-lms/) - Schema design patterns
- [Snyk Race Condition Guide](https://learn.snyk.io/lesson/race-condition/) - Concurrent update patterns

### Tertiary (LOW confidence)
- WebSearch results on video completion tracking - general patterns, no specific implementation verified
- Community discussions on LMS progress systems - conceptual, patterns vary by platform

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses existing Drizzle + Next.js patterns from project
- Database schema: HIGH - Follows established LMS patterns with Drizzle-specific syntax
- Unlock logic: HIGH - Well-documented pattern from LearnDash and similar platforms
- Caching: MEDIUM - `unstable_cache` API may change, but pattern is stable
- Pitfalls: MEDIUM - Based on known patterns, some project-specific edge cases

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable technologies)
