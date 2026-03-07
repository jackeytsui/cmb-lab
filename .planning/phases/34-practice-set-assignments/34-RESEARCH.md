# Phase 34: Practice Set Assignments - Research

**Researched:** 2026-02-07
**Domain:** Multi-level assignment system (curriculum-based + free assignment) with student dashboard and filtering
**Confidence:** HIGH

## Summary

Phase 34 implements the assignment layer connecting published practice sets to students. Coaches can attach practice sets to curriculum levels (lesson, module, course) so enrolled students automatically see them, or freely assign them to specific students or tag-based groups. Students get a dedicated practice dashboard with filtering by course, status, and due date.

The codebase is extremely well-positioned. The `practice_set_assignments` table already exists with the polymorphic `targetType` + `targetId` pattern (enum values: `course`, `module`, `lesson`, `student`, `tag`). The unique constraint on `(practiceSetId, targetType, targetId)` prevents duplicates. The practice player from Phase 33 is complete and ready to receive assignments. The tag system from Phase 23 provides the infrastructure for tag-based group assignments. The `courseAccess` table provides enrollment data for resolving curriculum-level assignments to students. The existing admin API pattern (`/api/admin/...` with `hasMinimumRole("coach")`) is established.

The key technical challenge is the **assignment resolution query**: given a student, find all practice sets assigned to them via any path (direct student assignment, tag membership, or enrollment in a course/module/lesson). This requires a UNION-style query joining multiple tables. The student dashboard is a new page at `/dashboard/practice` (or similar) that renders this resolved list with filtering.

**Primary recommendation:** Build assignment CRUD API routes under `/api/admin/assignments`, a resolution library (`lib/assignments.ts`) that computes a student's effective assignments from all paths, a coach-facing assignment dialog on the practice set builder/list pages, and a student-facing practice dashboard page with status and filtering.

## Standard Stack

No new package installations required. Everything needed is already in the project.

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.2.3 | Component rendering | Already installed |
| Next.js 16 | 16.1.4 | App Router pages, API routes, server components | Already installed |
| Drizzle ORM | 0.45.1 | Database queries for assignments, resolution | Already installed |
| Clerk | 6.36.10 | Auth, session claims, role checks | Already installed |
| Zod | 4.3.6 | Assignment request validation | Already installed |
| date-fns | 4.1.0 | Due date formatting, relative time display | Already installed |
| lucide-react | 0.563.0 | Icons (calendar, filter, check, clock, etc.) | Already installed |
| @radix-ui/react-select | 2.2.6 | Course/status filter dropdowns | Already installed as shadcn Select |
| @radix-ui/react-popover | 1.1.15 | Date picker / assignment dialog | Already installed |
| @radix-ui/react-alert-dialog | 1.1.15 | Delete assignment confirmation | Already installed |

### Supporting (Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| use-debounce | 10.1.0 | Debounce filter changes on student dashboard | Already installed |
| @tanstack/react-table | 8.21.3 | Table display for assignment list (if needed) | Already installed, used in student management |
| framer-motion | 12.29.2 | Subtle animations on status transitions | Already installed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native HTML date input for due date | @radix-ui/react-date-picker or react-day-picker | No date picker library is installed; native `<input type="datetime-local">` is sufficient for an optional due date field. Adding a date picker library adds dependency for minimal benefit. |
| UNION query for assignment resolution | Multiple sequential queries merged in JS | UNION is cleaner and more performant. Drizzle ORM supports raw SQL via `sql` template tag for complex queries, which is the project pattern (see analytics routes). |
| Server component for student dashboard | Client component with useEffect fetch | Server component is the project pattern for all student pages (dashboard, course detail, lesson player). Direct DB queries avoid self-fetch anti-pattern. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── assignments.ts                    # Assignment CRUD + resolution helpers
├── app/
│   ├── api/admin/assignments/
│   │   ├── route.ts                      # POST create, GET list assignments
│   │   └── [assignmentId]/
│   │       └── route.ts                  # PUT update, DELETE remove assignment
│   ├── (dashboard)/
│   │   ├── dashboard/practice/
│   │   │   └── page.tsx                  # Student practice dashboard (ASSIGN-06, ASSIGN-07)
│   │   └── admin/exercises/
│   │       └── ExerciseListClient.tsx    # Extended with "Assign" button per practice set
│   └── components/
│       └── practice/
│           └── assignments/
│               ├── AssignmentDialog.tsx   # Coach dialog for creating assignments
│               ├── AssignmentList.tsx     # List of assignments on a practice set
│               └── PracticeDashboard.tsx  # Student-facing assignment list with filters
```

### Pattern 1: Assignment Resolution Query (Confidence: HIGH)

**What:** Given a student's user ID, resolve ALL practice sets assigned to them through any path: direct student assignment, tag membership, or course/module/lesson enrollment.

**When to use:** Student practice dashboard page load.

**Example:**
```typescript
// src/lib/assignments.ts
// Source: Existing Drizzle ORM patterns in the codebase

import { db } from "@/db";
import { practiceSetAssignments, practiceAttempts, practiceSets, courseAccess, studentTags } from "@/db/schema";
import { sql, eq, and, isNull, inArray, or } from "drizzle-orm";

interface ResolvedAssignment {
  assignmentId: string;
  practiceSetId: string;
  practiceSetTitle: string;
  practiceSetDescription: string | null;
  targetType: string;
  targetLabel: string; // e.g., "Course: Lesson 1" or "Direct Assignment"
  dueDate: Date | null;
  assignedAt: Date;
  status: "pending" | "completed";
  bestScore: number | null;
  attemptCount: number;
}

export async function getStudentAssignments(userId: string): Promise<ResolvedAssignment[]> {
  // 1. Get user's enrolled course IDs
  const enrolledCourseIds = await db
    .select({ courseId: courseAccess.courseId })
    .from(courseAccess)
    .where(eq(courseAccess.userId, userId));

  // 2. Get user's tag IDs
  const userTagIds = await db
    .select({ tagId: studentTags.tagId })
    .from(studentTags)
    .where(eq(studentTags.userId, userId));

  // 3. Get module IDs and lesson IDs from enrolled courses
  // (Modules and lessons derive from course enrollment)

  // 4. Query assignments matching any of:
  //    - targetType='student' AND targetId=userId
  //    - targetType='tag' AND targetId IN (userTagIds)
  //    - targetType='course' AND targetId IN (enrolledCourseIds)
  //    - targetType='module' AND targetId IN (moduleIds from enrolled courses)
  //    - targetType='lesson' AND targetId IN (lessonIds from enrolled courses)

  // 5. JOIN with practiceSets for title/description
  // 6. LEFT JOIN with practiceAttempts for status/score
  // 7. Return resolved list
}
```

### Pattern 2: Coach Assignment Dialog (Confidence: HIGH)

**What:** A dialog/modal where coaches select a target type (course, module, lesson, student, tag), pick a target, optionally set a due date, and create the assignment.

**When to use:** From the practice set list page or builder, coach clicks "Assign" on a published practice set.

**Example:**
```typescript
// The dialog uses existing patterns:
// - <Select> from shadcn for target type dropdown
// - Cascading selects for course -> module -> lesson hierarchy
// - Student search + multi-select for direct student assignment
// - Tag list with checkboxes for tag-based assignment
// - Native <input type="datetime-local"> for optional due date
// - POST to /api/admin/assignments with { practiceSetId, targetType, targetId, dueDate }
```

### Pattern 3: Student Dashboard Server Component (Confidence: HIGH)

**What:** A server component that queries the resolved assignments directly from the database (no self-fetch) and passes data to a client component for filtering.

**When to use:** Student practice dashboard page.

**Example:**
```typescript
// src/app/(dashboard)/dashboard/practice/page.tsx
// Follows the exact pattern of dashboard/page.tsx and courses/[courseId]/page.tsx

export default async function PracticeDashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!dbUser) redirect("/sign-in");

  const assignments = await getStudentAssignments(dbUser.id);

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <AppHeader title="Practice" />
      <PracticeDashboard assignments={assignments} />
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Self-fetch in server components:** Never call own API routes from server components. Query DB directly. This is a documented gotcha in the project (see MEMORY.md).
- **Polymorphic foreign key without validation:** The `targetId` is a UUID pointing to different tables depending on `targetType`. Always validate that the target exists before creating an assignment.
- **Ignoring published status:** Only published practice sets should be assignable. Filter on `practiceSets.status = 'published'` when creating assignments.
- **N+1 query on resolution:** Don't resolve assignments one-by-one. Batch-resolve all assignments for a student in a single query (or minimal queries).
- **Missing enrollment check:** For curriculum-level assignments (course/module/lesson), only show the assignment to students who are enrolled in the course. The `courseAccess` table is the source of truth.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date formatting | Custom date formatter | `date-fns` `format`, `formatDistanceToNow` | Already installed, handles locales and relative time |
| Role-based access check | Manual session parsing | `hasMinimumRole("coach")` from `lib/auth.ts` | Existing helper handles the role hierarchy |
| User ID resolution | Manual Clerk-to-DB lookup | `getCurrentUser()` from `lib/auth.ts` | Existing helper does Clerk-to-internal-ID mapping |
| Loading skeletons | Custom shimmer elements | `<Skeleton>` from `components/ui/skeleton.tsx` | Already installed shadcn Skeleton component |
| Error states | Custom error divs | `<ErrorAlert>` from `components/ui/error-alert.tsx` | Project-wide pattern for error display |
| Delete confirmation | Custom modal | `<AlertDialog>` from `components/ui/alert-dialog.tsx` | Already installed, used in ExerciseList |
| Select dropdowns | Custom dropdowns | `<Select>` from `components/ui/select.tsx` | Already installed shadcn Select |

**Key insight:** The entire UI component library is already in place from v3.1 polish phases. Focus on composition, not component creation.

## Common Pitfalls

### Pitfall 1: Assignment Resolution Performance
**What goes wrong:** The resolution query joins across 5+ tables and can be slow for students enrolled in many courses with many assignments.
**Why it happens:** UNION queries with multiple JOINs and subqueries.
**How to avoid:** Use indexed lookups. The `practice_set_assignments` table has a unique constraint index on `(practiceSetId, targetType, targetId)`. Ensure `courseAccess(userId)`, `studentTags(userId)`, `modules(courseId)`, and `lessons(moduleId)` are indexed (they are, via FK constraints). Consider a step-by-step approach: first collect all valid target IDs, then query assignments with `IN` clauses.
**Warning signs:** Dashboard page load exceeds 500ms for a student with many courses.

### Pitfall 2: Stale Assignment Data After Unenrollment
**What goes wrong:** Student is unenrolled from a course but still sees assignments attached to that course's lessons/modules.
**Why it happens:** Assignments are not cascaded on course access removal.
**How to avoid:** Resolution query ALWAYS checks current `courseAccess` at query time. If a student loses access, the resolution query naturally excludes those assignments. Do NOT cache resolved assignments.
**Warning signs:** Student sees practice sets for courses they no longer have access to.

### Pitfall 3: Duplicate Assignments from Multiple Paths
**What goes wrong:** A practice set assigned to both a course AND a lesson within that course shows up twice in the student's dashboard.
**Why it happens:** Multiple assignment rows resolve to the same practice set for the same student.
**How to avoid:** Deduplicate by `practiceSetId` in the resolution query (use `DISTINCT ON` or `GROUP BY practiceSetId`). Show the most specific assignment context (lesson > module > course > tag > direct).
**Warning signs:** Student sees the same practice set listed multiple times.

### Pitfall 4: Assigning Draft or Archived Practice Sets
**What goes wrong:** Coach assigns a practice set that is not published, and students can't actually play it.
**Why it happens:** No validation on assignment creation.
**How to avoid:** Assignment creation API must verify `practiceSets.status === 'published'`. Also, the student player page already checks for published status (`if (!practiceSet || practiceSet.status !== "published") notFound()`), but the dashboard should not show unpublished assignments.
**Warning signs:** Student sees an assignment on their dashboard but gets a 404 when clicking it.

### Pitfall 5: Invalid targetId for Target Type
**What goes wrong:** Coach creates an assignment with `targetType: 'course'` but provides a lesson UUID as `targetId`.
**Why it happens:** No server-side validation that targetId corresponds to a valid entity of the declared target type.
**How to avoid:** In the assignment creation API, validate that the targetId exists in the correct table based on targetType: courses for 'course', modules for 'module', lessons for 'lesson', users for 'student', tags for 'tag'.
**Warning signs:** Assignment created but never resolves for any student.

### Pitfall 6: Due Date Timezone Handling
**What goes wrong:** Coach sets a due date in their timezone, but it displays differently for students in other timezones.
**Why it happens:** Timestamps stored without timezone context.
**How to avoid:** Store due dates as UTC timestamps (the Drizzle `timestamp` type does this by default). Display using the browser's local timezone on the client. Use `date-fns` `format` for consistent display. For this project, timezone differences are unlikely to be an issue (small cohort, likely same timezone), but the pattern should be correct.
**Warning signs:** Due dates appear off by hours.

## Code Examples

Verified patterns from the existing codebase:

### Assignment CRUD Library Functions
```typescript
// src/lib/assignments.ts
// Pattern: follows lib/practice.ts exactly

import { db } from "@/db";
import { practiceSetAssignments, practiceSets } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function createAssignment(data: {
  practiceSetId: string;
  targetType: "course" | "module" | "lesson" | "student" | "tag";
  targetId: string;
  assignedBy: string;
  dueDate?: Date;
}) {
  // 1. Verify practice set exists and is published
  const set = await db.query.practiceSets.findFirst({
    where: and(
      eq(practiceSets.id, data.practiceSetId),
      eq(practiceSets.status, "published"),
      isNull(practiceSets.deletedAt),
    ),
  });
  if (!set) throw new Error("Practice set not found or not published");

  // 2. Validate targetId exists in correct table (see Pitfall 5)

  // 3. Insert assignment (unique constraint prevents duplicates)
  const [assignment] = await db
    .insert(practiceSetAssignments)
    .values({
      practiceSetId: data.practiceSetId,
      targetType: data.targetType,
      targetId: data.targetId,
      assignedBy: data.assignedBy,
      dueDate: data.dueDate ?? null,
    })
    .returning();

  return assignment;
}

export async function deleteAssignment(id: string) {
  const [deleted] = await db
    .delete(practiceSetAssignments)
    .where(eq(practiceSetAssignments.id, id))
    .returning();
  return deleted ?? null;
}

export async function updateAssignmentDueDate(id: string, dueDate: Date | null) {
  const [updated] = await db
    .update(practiceSetAssignments)
    .set({ dueDate })
    .where(eq(practiceSetAssignments.id, id))
    .returning();
  return updated ?? null;
}
```

### Assignment Resolution (Student-Side Query)
```typescript
// Key insight: Use step-by-step ID collection then single assignment query

// Step 1: Collect all targetIds that match this student
const validTargetEntries: { type: string; id: string }[] = [];

// Direct student assignments
validTargetEntries.push({ type: "student", id: userId });

// Tag-based assignments
const userTags = await db.select({ tagId: studentTags.tagId })
  .from(studentTags).where(eq(studentTags.userId, userId));
for (const t of userTags) {
  validTargetEntries.push({ type: "tag", id: t.tagId });
}

// Course enrollment assignments
const enrollments = await db.select({ courseId: courseAccess.courseId })
  .from(courseAccess).where(eq(courseAccess.userId, userId));
for (const e of enrollments) {
  validTargetEntries.push({ type: "course", id: e.courseId });
}

// Module/lesson assignments (from enrolled courses)
// Fetch modules for enrolled courses, then lessons for those modules

// Step 2: Build OR conditions and query assignments
// Step 3: JOIN with practiceSets for metadata
// Step 4: LEFT JOIN with practiceAttempts for completion status
// Step 5: Deduplicate by practiceSetId
```

### API Route Pattern (Coach-Facing)
```typescript
// src/app/api/admin/assignments/route.ts
// Follows exact pattern of /api/admin/practice-sets/route.ts

import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const body = await request.json();
  // Validate with Zod, create assignment, return result
}
```

### Student Dashboard Filter Pattern
```typescript
// Client component receives full assignment list from server component
// Filters are applied client-side (small dataset, instant feedback)

interface PracticeDashboardProps {
  assignments: ResolvedAssignment[];
}

export function PracticeDashboard({ assignments }: PracticeDashboardProps) {
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dueDateSort, setDueDateSort] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    let result = assignments;
    if (courseFilter !== "all") {
      result = result.filter(a => a.courseId === courseFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter(a => a.status === statusFilter);
    }
    // Sort by due date
    return result.sort((a, b) => { /* due date comparison */ });
  }, [assignments, courseFilter, statusFilter, dueDateSort]);

  return (/* filter controls + assignment cards */);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polymorphic joins via single discriminator column | Same - `targetType` + `targetId` is standard for multi-target references | Established pattern | Works well for 5 target types with unique constraint |
| Client-side data fetching for dashboards | Server components with direct DB queries | Next.js App Router pattern since v13 | Better performance, no waterfall, no auth cookie issues |
| Custom filter UI | shadcn Select + native inputs | Already in project | Consistent with existing UI |

**No deprecated patterns to worry about.** The existing schema and UI patterns are current.

## Open Questions

Things that couldn't be fully resolved:

1. **Student dashboard navigation placement**
   - What we know: The student dashboard is at `/dashboard`. The practice page is at `/practice/[setId]`. No "Practice" link exists in the student navigation yet.
   - What's unclear: Should the practice dashboard be at `/dashboard/practice` (nested under dashboard) or `/practice` (top-level)? The middleware already protects `/practice(.*)`.
   - Recommendation: Use `/dashboard/practice` to keep it under the existing dashboard layout. Add a link/card to the main dashboard page.

2. **Assignment dialog complexity**
   - What we know: Coaches need to select a target (course, module, lesson, student, or tag). Course/module/lesson requires cascading selects. Student requires search. Tag requires a tag list.
   - What's unclear: Should this be a full-page form, a modal dialog, or a side panel?
   - Recommendation: Use AlertDialog (modal) pattern consistent with existing BatchAssignModal. Different form sections based on selected target type.

3. **Batch assignment from admin students page**
   - What we know: The admin students page already has bulk operations (assign courses, assign tags). ASSIGN-04 says "freely assign to specific students or student groups/tags."
   - What's unclear: Should assignments also be accessible from the student management dashboard, or only from the practice sets page?
   - Recommendation: Primary UI is from practice sets page (coach assigns FROM a practice set TO students/targets). Secondary: consider a "Practice" tab on student detail page showing their assignments. Keep Phase 34 focused on the primary flow.

4. **Where assignments display in curriculum views (ASSIGN-01, -02, -03)**
   - What we know: Students should see practice sets "after watching the video" (lesson), "in the module view" (module), "in the course view" (course).
   - What's unclear: Exact UI placement. Is it a section below the video? A card in the module list? A tab on the course page?
   - Recommendation: For lesson-level: show a "Practice" section below the video player on the lesson page. For module-level: show practice set cards after the lesson list in each module section. For course-level: show a "Practice Sets" section on the course detail page. Keep it simple with a link card that navigates to the existing `/practice/[setId]` page.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Direct examination of `src/db/schema/practice.ts`, `src/lib/practice.ts`, `src/app/(dashboard)/` page patterns, `src/app/api/admin/` API patterns, `src/components/ui/` available components
- **Drizzle ORM schema** - Verified `practiceSetAssignments` table exists with exact column structure: `id`, `practiceSetId`, `targetType`, `targetId`, `assignedBy`, `dueDate`, `createdAt`, unique constraint on `(practiceSetId, targetType, targetId)`
- **Middleware configuration** - Verified `/practice(.*)` is already in the protected routes list
- **Existing patterns** - Admin API routes (practice-sets, exercises, tags), server component direct-DB-query pattern, coach role checks, ErrorAlert/Skeleton/Select UI components

### Secondary (MEDIUM confidence)
- **Assignment resolution approach** - Step-by-step ID collection + IN-clause query is a common Drizzle pattern used in analytics routes and student management queries in this codebase

### Tertiary (LOW confidence)
- None. All findings verified against codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new packages needed, all tools already installed
- Architecture: HIGH - All patterns verified against existing codebase pages/APIs
- Pitfalls: HIGH - Identified from actual codebase analysis (enrollment checks, self-fetch anti-pattern, unique constraints)

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable - internal patterns, no external dependencies)
