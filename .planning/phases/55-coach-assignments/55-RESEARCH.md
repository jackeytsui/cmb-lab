# Phase 55: Coach Assignments - Research

**Researched:** 2026-02-09
**Domain:** Video assignment system (coach-to-student), progress monitoring, dashboard integration
**Confidence:** HIGH

## Summary

Phase 55 extends the existing practice assignment system to support YouTube video assignments. The codebase already has a mature assignment infrastructure (practice sets with `practiceSetAssignments` table targeting students, tags, courses, modules, lessons) and a complete video progress tracking system (`videoSessions` with `completionPercent`, `lastPositionMs`, `totalWatchedMs`). The new feature connects these two: coaches assign a YouTube URL to students/groups, students see it on their dashboard, and coaches can monitor watch progress.

The key architectural decision is whether to extend the existing `practiceSetAssignments` table or create a dedicated `videoAssignments` table. Given that video assignments are fundamentally different from practice sets (no exercises, no scoring, URL-based instead of content-based, progress is completion-percentage not pass/fail), a separate `videoAssignments` table is the correct approach. This avoids polymorphic complexity and keeps the data model clean.

**Primary recommendation:** Create a new `videoAssignments` table with its own assignment and resolution logic, following the same target-type patterns as `practiceSetAssignments` but tailored for video URLs. Reuse the existing `videoSessions` table for progress data by joining on `youtubeVideoId + userId`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | already installed | Schema definition, migrations, queries | Already used throughout; all schema in `src/db/schema/` |
| Next.js App Router | already installed | API routes, server components, coach/student pages | Already used for all pages |
| Clerk | already installed | Auth, role checking via `hasMinimumRole("coach")` | Already used for all auth |
| Radix UI (Select, Dialog) | already installed | Form dropdowns, modal dialogs | Already used in `AssignmentDialog.tsx` |
| date-fns | already installed | Date formatting, `isPast`, `formatDistanceToNow` | Already used in `PracticeDashboard.tsx`, `HistoryClient.tsx` |
| lucide-react | already installed | Icons | Already used throughout |
| zod | already installed | YouTube URL validation | Already used in `src/lib/youtube.ts` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `use-debounce` | already installed | Debounced search in coach views | If filtering student lists |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate `videoAssignments` table | Extend `practiceSetAssignments` with nullable `youtubeUrl` | Would create awkward nullability (no practiceSetId for video assignments, no youtubeUrl for practice), break existing queries, violate single-responsibility |
| Direct DB queries in server components | API routes fetched from server components | Known 401 bug with self-fetch (v7-14 decision); direct DB is the established pattern |

**Installation:**
```bash
# No new packages needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/video.ts             # EXTEND: add videoAssignments table + relations
├── lib/video-assignments.ts       # NEW: CRUD + resolution queries (follows assignments.ts pattern)
├── app/api/coach/video-assignments/
│   └── route.ts                   # NEW: POST (create) + GET (list) for coach
├── app/api/coach/video-assignments/
│   └── [assignmentId]/route.ts    # NEW: DELETE for coach
├── app/api/coach/video-assignments/
│   └── progress/route.ts          # NEW: GET progress for an assignment (all students)
├── app/(dashboard)/coach/
│   └── video-assignments/
│       └── page.tsx               # NEW: Coach video assignments management page
├── components/coach/
│   └── VideoAssignmentPanel.tsx   # NEW: Coach UI for creating/managing video assignments
│   └── VideoAssignmentProgress.tsx # NEW: Coach view of student progress per assignment
├── components/video/
│   └── AssignedVideoCard.tsx      # NEW: Student-facing card for assigned videos
```

### Pattern 1: Video Assignments Schema
**What:** New `videoAssignments` table storing YouTube URL assignments with target-type polymorphism
**When to use:** Always -- this is the core data model
**Example:**
```typescript
// Source: Follows existing practiceSetAssignments pattern in src/db/schema/practice.ts
export const videoAssignments = pgTable(
  "video_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    youtubeUrl: text("youtube_url").notNull(),
    youtubeVideoId: varchar("youtube_video_id", { length: 11 }).notNull(),
    title: text("title"),           // Coach-provided title (optional, fallback to video title)
    notes: text("notes"),           // Coach notes / instructions
    targetType: assignmentTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    dueDate: timestamp("due_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("video_assignments_assigned_by_idx").on(table.assignedBy),
    index("video_assignments_youtube_video_id_idx").on(table.youtubeVideoId),
    unique("video_assignments_video_target_unique").on(
      table.youtubeVideoId,
      table.targetType,
      table.targetId
    ),
  ]
);
```

### Pattern 2: Student Resolution Query (Reuse Existing Pattern)
**What:** Resolve all video assignments for a student through the same 5 paths as practice assignments
**When to use:** On the student dashboard to show assigned videos
**Example:**
```typescript
// Source: Follows getStudentAssignments() in src/lib/assignments.ts
export async function getStudentVideoAssignments(userId: string) {
  // Step 1: Collect all valid target entries (same as practice assignments)
  //   - Direct student assignment
  //   - Tag-based (via studentTags)
  //   - Course enrollment (via courseAccess)
  //   - Module assignment (modules within enrolled courses)
  //   - Lesson assignment (lessons within enrolled course modules)

  // Step 2: Query videoAssignments matching any target entry

  // Step 3: For each assignment, look up student's videoSession progress
  //   JOIN videoSessions ON (userId + youtubeVideoId)
  //   to get completionPercent, lastPositionMs, totalWatchedMs

  // Step 4: Deduplicate by youtubeVideoId (most specific target wins)

  // Return: assignment + progress data
}
```

### Pattern 3: Coach Progress View Query
**What:** For a given video assignment, show all students who should have it and their watch progress
**When to use:** Coach progress monitoring page
**Example:**
```typescript
// Source: Follows getPracticeResults() in src/lib/coach-practice.ts
export async function getVideoAssignmentProgress(assignmentId: string) {
  // 1. Get the assignment details (youtubeVideoId, targetType, targetId)
  // 2. Resolve all students targeted by this assignment
  //    - student target: just that student
  //    - tag target: all students with that tag
  //    - course target: all students enrolled in that course
  //    - module/lesson targets: all students in parent course
  // 3. For each resolved student, LEFT JOIN videoSessions
  //    ON (student.id = videoSessions.userId AND assignment.youtubeVideoId = videoSessions.youtubeVideoId)
  // 4. Return: student name, email, completionPercent (0 if no session), lastWatched date
}
```

### Pattern 4: Server Component with Direct DB Query
**What:** Coach pages and student dashboard use direct DB queries (not self-fetch API)
**When to use:** All server-rendered pages
**Example:**
```typescript
// Source: Known pattern from v7-14 decision, used in history/page.tsx
export default async function CoachVideoAssignmentsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) redirect("/dashboard");

  // Direct DB query -- avoids self-fetch 401 bug
  const assignments = await listCoachVideoAssignments(coachId);
  return <VideoAssignmentPanel assignments={assignments} />;
}
```

### Anti-Patterns to Avoid
- **Self-fetching API routes from server components:** Known 401 bug (auth cookies not forwarded). Always use direct DB queries in server components.
- **Extending practiceSetAssignments for videos:** Creates awkward polymorphism with nullable foreign keys. Video assignments are a distinct entity.
- **Storing video progress in the assignment table:** Progress already lives in `videoSessions`. Join at query time, don't duplicate.
- **Creating a separate progress tracking mechanism:** The existing `useWatchProgress` hook + `videoSessions` table already handles progress persistence. Students just watch videos normally in the Listening Lab -- progress is tracked automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YouTube URL validation | Custom regex | `extractVideoId()` from `src/lib/youtube.ts` + `youtubeUrlSchema` | Already exists, handles all URL formats |
| Target resolution (student/tag/course/module/lesson) | New resolution logic | Copy pattern from `getStudentAssignments()` in `src/lib/assignments.ts` | Same 5-path resolution, already proven |
| Progress tracking | Custom progress save | Existing `useWatchProgress` hook + `/api/video/progress` route | Already saves progress automatically when student watches |
| Role-based access control | Custom auth checks | `hasMinimumRole("coach")` from `src/lib/auth.ts` | Already used on all coach pages |
| Target entity validation | Custom existence checks | Copy `validateTargetExists()` from `src/lib/assignments.ts` | Already validates course/module/lesson/student/tag existence |
| Date formatting | Custom formatters | `date-fns` (`format`, `isPast`, `formatDistanceToNow`) | Already used in `PracticeDashboard.tsx` and `HistoryClient.tsx` |

**Key insight:** ~80% of this feature is composition of existing patterns. The assignment target resolution, progress tracking, role-based auth, and YouTube URL handling are all solved problems in this codebase. The new work is mostly schema + queries + UI glue.

## Common Pitfalls

### Pitfall 1: Reusing the Existing assignmentTargetTypeEnum
**What goes wrong:** The `assignmentTargetTypeEnum` is already defined in `practice.ts` schema. If you try to create it again in `video.ts`, Drizzle will fail because Postgres enums are database-global.
**Why it happens:** Each `pgEnum()` call generates a `CREATE TYPE` statement. Duplicate names error.
**How to avoid:** Import the existing `assignmentTargetTypeEnum` from `practice.ts` and use it in the `videoAssignments` table definition. The enum is already exported from `src/db/schema/index.ts`.
**Warning signs:** Migration error like `type "assignment_target_type" already exists`.

### Pitfall 2: Progress Data Not Existing Yet
**What goes wrong:** A coach assigns a video, but the student hasn't watched it yet, so there's no `videoSessions` row for that student+video combination. A naive INNER JOIN returns no rows.
**Why it happens:** `videoSessions` are created on-demand when a student loads a video in the Listening Lab, not when an assignment is created.
**How to avoid:** Always LEFT JOIN `videoSessions` when querying progress. Treat missing session as 0% completion. Display "Not started" rather than hiding the student.
**Warning signs:** Students appear to be missing from the progress view.

### Pitfall 3: Self-Fetch 401 in Server Components
**What goes wrong:** Server components that `fetch()` their own API routes don't forward auth cookies, causing 401 errors.
**Why it happens:** Known Next.js behavior documented as v7-14 decision.
**How to avoid:** Use direct DB queries in all server components (the `getWatchHistory` pattern).
**Warning signs:** Data loads in dev but fails in production or when auth is required.

### Pitfall 4: Dashboard Integration Blocking on Failure
**What goes wrong:** If the video assignments query fails, it crashes the entire student dashboard.
**Why it happens:** Unhandled async errors in server components.
**How to avoid:** Wrap video assignment fetching in try/catch like the existing practice assignments pattern in `dashboard/page.tsx` (lines 83-91): fetch non-blocking, show empty state on failure.
**Warning signs:** Dashboard blank when video assignments query has a bug.

### Pitfall 5: Unique Constraint on Assignment
**What goes wrong:** Coach tries to assign the same video to the same target twice, gets a cryptic database error.
**Why it happens:** Unique constraint on (youtubeVideoId, targetType, targetId).
**How to avoid:** Catch Postgres error code 23505 (like `createAssignment()` in `src/lib/assignments.ts` lines 115-124) and return a user-friendly "already assigned" message.
**Warning signs:** 500 error when creating duplicate assignment.

### Pitfall 6: YouTube Video ID Length
**What goes wrong:** `youtubeVideoId` column defined as `varchar(11)` but some edge-case video IDs could theoretically differ.
**Why it happens:** YouTube video IDs are consistently 11 characters, but URL parsing might include extra characters.
**How to avoid:** Use `extractVideoId()` which returns exactly the 11-char ID. Store this, not the raw URL path segment. The existing `videoSessions.youtubeVideoId` is already `varchar(11)`.
**Warning signs:** Insert failures on the varchar constraint.

## Code Examples

### Creating the Video Assignment
```typescript
// Source: Follows createAssignment() pattern from src/lib/assignments.ts
export async function createVideoAssignment(data: {
  youtubeUrl: string;
  title?: string;
  notes?: string;
  targetType: string;
  targetId: string;
  assignedBy: string;
  dueDate?: Date | null;
}) {
  // 1. Validate YouTube URL
  const videoId = extractVideoId(data.youtubeUrl);
  if (!videoId) throw new Error("Invalid YouTube URL");

  // 2. Validate target exists
  await validateTargetExists(data.targetType, data.targetId);

  // 3. Insert with unique constraint catch
  try {
    const [assignment] = await db
      .insert(videoAssignments)
      .values({
        youtubeUrl: data.youtubeUrl,
        youtubeVideoId: videoId,
        title: data.title,
        notes: data.notes,
        targetType: data.targetType as "course" | "module" | "lesson" | "student" | "tag",
        targetId: data.targetId,
        assignedBy: data.assignedBy,
        dueDate: data.dueDate ?? undefined,
      })
      .returning();
    return assignment;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "23505") {
      throw new Error("This video is already assigned to this target");
    }
    throw error;
  }
}
```

### Resolving Student Video Assignments with Progress
```typescript
// Source: Follows getStudentAssignments() in src/lib/assignments.ts
// JOIN with videoSessions for progress data
const assignmentRows = await db
  .select({
    assignmentId: videoAssignments.id,
    youtubeUrl: videoAssignments.youtubeUrl,
    youtubeVideoId: videoAssignments.youtubeVideoId,
    title: videoAssignments.title,
    notes: videoAssignments.notes,
    dueDate: videoAssignments.dueDate,
    assignedAt: videoAssignments.createdAt,
    // Progress from videoSessions (LEFT JOIN -- may be null)
    completionPercent: videoSessions.completionPercent,
    lastPositionMs: videoSessions.lastPositionMs,
    sessionTitle: videoSessions.title,
    lastWatched: videoSessions.updatedAt,
  })
  .from(videoAssignments)
  .leftJoin(
    videoSessions,
    and(
      eq(videoSessions.youtubeVideoId, videoAssignments.youtubeVideoId),
      eq(videoSessions.userId, userId)
    )
  )
  .where(or(...orConditions));
```

### Student Dashboard Integration
```typescript
// Source: Follows practice assignment section in src/app/(dashboard)/dashboard/page.tsx
// Fetch video assignments (non-blocking -- failure won't break dashboard)
let videoAssignments: ResolvedVideoAssignment[] = [];
try {
  if (dbUser) {
    videoAssignments = await getStudentVideoAssignments(dbUser.id);
  }
} catch (err) {
  console.error("Failed to load video assignments:", err);
}
const pendingVideoAssignments = videoAssignments
  .filter((a) => (a.completionPercent ?? 0) < 100)
  .sort((a, b) => {
    if (a.dueDate && b.dueDate)
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
```

### Coach Progress View Query
```typescript
// Source: Follows getPracticeResults() pattern in src/lib/coach-practice.ts
export async function resolveTargetStudents(
  targetType: string,
  targetId: string
): Promise<{ id: string; name: string | null; email: string }[]> {
  switch (targetType) {
    case "student":
      return db.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(eq(users.id, targetId));
    case "tag":
      return db.select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(studentTags, eq(studentTags.userId, users.id))
        .where(eq(studentTags.tagId, targetId));
    case "course":
      return db.select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(courseAccess, eq(courseAccess.userId, users.id))
        .where(eq(courseAccess.courseId, targetId));
    // module and lesson: resolve via parent course
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Self-fetch API routes in server components | Direct DB queries | v7-14 (Phase 54) | Avoids 401 auth bug; all new server components must use direct DB |
| sendBeacon with text/plain | sendBeacon with Blob + application/json | v7-11 (Phase 54) | Progress API already handles both content types |

**Deprecated/outdated:**
- Nothing deprecated; all current patterns are stable.

## Open Questions

1. **Assignment Title vs. Video Title**
   - What we know: Videos get titles populated when first played (from `player.getVideoData().title`). The `videoSessions.title` field is nullable and set on first play.
   - What's unclear: Should the coach provide a custom title at assignment time, or should we auto-populate from YouTube? Both are viable.
   - Recommendation: Allow optional coach-provided title. If not provided, fall back to `videoSessions.title` (from the video itself) or "Untitled Video". The `videoAssignments.title` field should be nullable.

2. **Completion Threshold**
   - What we know: `videoSessions.completionPercent` is 0-100, monotonically increasing. Practice assignments use `completedAt IS NOT NULL` for completion.
   - What's unclear: What percentage counts as "watched"? 80%? 90%? 100%? YouTube videos often have outros that users skip.
   - Recommendation: Use >= 80% as "completed" threshold. This is a common LMS standard and accounts for video outros. Store the threshold as a constant, not hardcoded in queries, so it can be adjusted.

3. **Linking Assignment to Listening Lab**
   - What we know: The Listening Lab (`/dashboard/listening`) loads videos via URL input. The watch history page links to `/dashboard/listening?videoId=...`.
   - What's unclear: Whether clicking an assigned video card should deep-link to the Listening Lab with the video pre-loaded.
   - Recommendation: Yes, link to `/dashboard/listening?videoId={youtubeVideoId}`. The `ListeningClient` would need to check URL params on mount and auto-load the video. This is already partially supported by the history page's link pattern.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/db/schema/video.ts` - videoSessions schema (completionPercent, youtubeVideoId)
- Codebase analysis: `src/db/schema/practice.ts` - practiceSetAssignments schema (target type pattern)
- Codebase analysis: `src/lib/assignments.ts` - getStudentAssignments() resolution logic (5-path targeting)
- Codebase analysis: `src/lib/video-history.ts` - direct DB query pattern for video data
- Codebase analysis: `src/lib/coach-practice.ts` - coach progress view query patterns
- Codebase analysis: `src/lib/youtube.ts` - extractVideoId() + youtubeUrlSchema
- Codebase analysis: `src/app/(dashboard)/dashboard/page.tsx` - dashboard assignment integration pattern
- Codebase analysis: `src/app/(dashboard)/coach/page.tsx` - coach page layout pattern
- Codebase analysis: `src/components/practice/assignments/AssignmentDialog.tsx` - assignment UI pattern

### Secondary (MEDIUM confidence)
- Prior decision v7-14: Direct DB queries for server components (avoids self-fetch 401)
- Prior decision v7-11: Blob with application/json for sendBeacon

### Tertiary (LOW confidence)
- 80% completion threshold recommendation: Based on common LMS industry practice (not codebase-verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Everything is already installed, no new dependencies
- Architecture: HIGH - Direct extension of existing patterns (assignments, video sessions, coach views)
- Pitfalls: HIGH - All identified from actual codebase patterns and known bugs
- Schema design: HIGH - Follows exact existing table patterns with proven approach
- UI patterns: HIGH - Existing components provide clear templates to follow

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable -- no external dependencies or fast-moving APIs)
