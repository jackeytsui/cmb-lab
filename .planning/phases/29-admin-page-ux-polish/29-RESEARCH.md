# Phase 29: Admin Page UX Polish - Research

**Researched:** 2026-02-06
**Domain:** Next.js 16 admin page error handling, loading states, form validation, and content management UX
**Confidence:** HIGH

## Summary

Phase 29 must polish every admin-facing page so admins never see raw errors, blank loading screens, or confusing states. The codebase has 35+ admin files across 8 major page areas: dashboard, courses CRUD, students management, analytics, AI logs, prompts, knowledge base, and content management. All patterns needed are already established from Phases 26-28: `ErrorAlert` (inline + block variants), `Skeleton` component, `loading.tsx` convention, server-component try/catch, `{data, error}` tuple returns, and `useCallback`-extracted fetch functions for retry.

The admin pages are a mix of server components (dashboard, students, AI logs, knowledge base, student detail, KB entry detail, uploads) and client components (courses list, course/module/lesson detail, analytics dashboard, KB search, content management). Many already have good error handling from Phase 26 fixes (AnalyticsDashboard, VideoLibrary, StudentList, AILogList, ContentList, SearchPageClient). The primary remaining gaps are: (1) no `loading.tsx` files exist for any admin route, (2) several server component pages have no try/catch around DB queries (admin dashboard, students page, AI logs page, knowledge base pages, uploads page, student detail page), (3) CRUD form error messages use ad-hoc error divs instead of `ErrorAlert`, (4) delete operations use `alert()` for error feedback and `confirm()` for confirmation, and (5) the content upload pipeline lacks network error specificity.

**Primary recommendation:** Create `loading.tsx` skeletons for the 4 most important admin server-component routes, add try/catch with `ErrorAlert` to all server-component pages that do DB queries, replace ad-hoc error divs in CRUD forms with `ErrorAlert` for styling consistency, and improve error specificity in content upload and batch operation flows. No new dependencies needed.

## Standard Stack

### Core (Already Installed - No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 16 | 16.1.4 | `loading.tsx` file convention for Suspense-based loading states | Built-in streaming with automatic Suspense boundaries |
| React 19 | 19.2.3 | Suspense for async server components | `loading.tsx` wraps page in Suspense automatically |
| Skeleton component | n/a | `src/components/ui/skeleton.tsx` - animated placeholder | Already installed, used in analytics, VideoLibrary, StudentList, AILogList |
| ErrorAlert component | n/a | `src/components/ui/error-alert.tsx` - inline + block variants | Created in Phase 26-01, used across student/coach pages |
| react-hook-form | 7.71.1 | Form validation with `formState.errors` | Already used in CourseForm, ModuleForm, LessonForm, InteractionForm |
| zod | 4.3.6 | Schema validation for form inputs | Already used with `@hookform/resolvers` |
| lucide-react | 0.563.0 | Icons for error/empty states | Already used throughout |

### Supporting (Already Available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-alert-dialog | installed | Accessible confirmation dialogs | Replace `window.confirm()` in delete operations (optional improvement) |
| date-fns | installed | Time formatting | Already used in student detail, AI logs, KB entries |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Ad-hoc error divs in forms | ErrorAlert component | ErrorAlert provides consistent styling with retry support. Use ErrorAlert. |
| `window.confirm()` for deletes | Radix AlertDialog | AlertDialog is more accessible and styled, but `confirm()` is functional. OPTIONAL improvement -- not required by success criteria. |
| `alert()` for delete errors | ErrorAlert inline | ErrorAlert is non-blocking and styled. Use ErrorAlert. |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
src/
├── app/
│   └── (dashboard)/
│       └── admin/
│           ├── loading.tsx                  # NEW: Admin dashboard loading skeleton
│           ├── students/
│           │   └── loading.tsx              # NEW: Students page loading skeleton
│           ├── ai-logs/
│           │   └── loading.tsx              # NEW: AI logs loading skeleton
│           └── knowledge/
│               └── loading.tsx              # NEW: Knowledge base loading skeleton
```

Files to modify:

```
src/
├── app/
│   └── (dashboard)/
│       └── admin/
│           ├── page.tsx                     # MODIFY: Add try/catch around stat queries
│           ├── students/
│           │   ├── page.tsx                 # MODIFY: Add try/catch around getStudentsPageData
│           │   └── [studentId]/
│           │       └── page.tsx             # MODIFY: Add try/catch around DB queries
│           ├── ai-logs/
│           │   └── page.tsx                 # MODIFY: Add try/catch around DB queries
│           ├── knowledge/
│           │   ├── page.tsx                 # MODIFY: Add try/catch around DB queries
│           │   ├── new/page.tsx             # MODIFY: Add try/catch around category fetch
│           │   └── [entryId]/page.tsx       # MODIFY: Add try/catch around DB queries
│           ├── content/
│           │   └── uploads/page.tsx         # MODIFY: Add try/catch around DB queries
│           ├── courses/
│           │   ├── page.tsx                 # MODIFY: Replace ad-hoc error div with ErrorAlert
│           │   └── [courseId]/
│           │       ├── page.tsx             # MODIFY: Replace ad-hoc error/loading with ErrorAlert + Skeleton
│           │       └── modules/
│           │           └── [moduleId]/
│           │               ├── page.tsx     # MODIFY: Same as course detail
│           │               └── lessons/
│           │                   └── [lessonId]/
│           │                       └── page.tsx  # MODIFY: Same as course detail
├── components/
│   └── admin/
│       ├── CourseForm.tsx                   # MODIFY: Replace ad-hoc error div with ErrorAlert
│       ├── ModuleForm.tsx                   # MODIFY: Replace ad-hoc error div with ErrorAlert
│       ├── LessonForm.tsx                   # MODIFY: Replace ad-hoc error div with ErrorAlert
│       └── KbEntryForm.tsx                  # MODIFY: Replace ad-hoc error p tag with ErrorAlert
```

### Pattern 1: Server Component Try/Catch (Admin Dashboard)
**What:** Wrap all DB queries in try/catch, render inline ErrorAlert on failure, preserve non-DB elements (greeting, nav cards).
**When to use:** All admin server component pages with DB queries.
**Why important:** Admin dashboard currently has 5 parallel count queries with NO try/catch. If Neon is unreachable, the page throws and shows the generic error.tsx boundary instead of a styled admin error.
**Example:**
```typescript
// In admin/page.tsx
export default async function AdminDashboardPage() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) redirect("/dashboard");

  const user = await currentUser();
  const displayName = user?.firstName || "Admin";

  // Stats in try/catch; nav cards always render
  let stats = { courses: 0, lessons: 0, students: 0, prompts: 0, kbEntries: 0 };
  let statsError: string | null = null;

  try {
    const [courseCount, lessonCount, studentCount, promptCount, kbEntryCount] =
      await Promise.all([...]);
    stats = { ... };
  } catch (error) {
    console.error("Admin dashboard stats query failed:", error);
    statsError = "Unable to load dashboard stats. Please try refreshing the page.";
  }

  return (
    <div>
      <p>Welcome back, {displayName}.</p>
      {/* Stats section */}
      {statsError ? (
        <ErrorAlert variant="block" message={statsError} />
      ) : (
        <StatsCards stats={stats} />
      )}
      {/* Navigation cards always render (no DB dependency) */}
      <ManagementCards />
    </div>
  );
}
```

### Pattern 2: Replace Ad-Hoc Error Divs in Forms with ErrorAlert
**What:** CRUD forms currently use `<div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>` for server-side error display. Replace with `<ErrorAlert message={error} />`.
**When to use:** All admin forms (CourseForm, ModuleForm, LessonForm, KbEntryForm).
**Why:** Consistent styling with the shared ErrorAlert component. Same visual result but uses the centralized component.
**Example:**
```typescript
// BEFORE (CourseForm):
{error && (
  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
    {error}
  </div>
)}

// AFTER:
{error && <ErrorAlert message={error} />}
```

### Pattern 3: Replace alert() with Inline Error State for Delete Operations
**What:** Course/module/lesson delete handlers currently use `alert()` for error feedback. Replace with component-level error state rendered as ErrorAlert.
**When to use:** All delete operations in admin CRUD pages.
**Example:**
```typescript
// BEFORE:
const handleDelete = async (courseId: string) => {
  if (!confirm("Are you sure?")) return;
  try {
    // ...delete
  } catch (err) {
    alert(err instanceof Error ? err.message : "Failed to delete course");
  }
};

// AFTER:
const [deleteError, setDeleteError] = useState<string | null>(null);

const handleDelete = async (courseId: string) => {
  if (!confirm("Are you sure?")) return;
  setDeleteError(null);
  try {
    // ...delete
  } catch (err) {
    setDeleteError(err instanceof Error ? err.message : "Failed to delete course");
  }
};

// In JSX:
{deleteError && <ErrorAlert message={deleteError} />}
```

### Pattern 4: loading.tsx for Admin Server Component Pages
**What:** Place `loading.tsx` files at admin route segments that have server component pages doing DB queries.
**When to use:** Admin dashboard, students page, AI logs page, knowledge base page.
**Not needed for:** Client component pages (courses list, analytics, content management, KB search) -- these handle their own loading states already.
**Example:**
```typescript
// src/app/(dashboard)/admin/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboardLoading() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Greeting skeleton */}
        <div className="mb-8">
          <Skeleton className="h-5 w-80 bg-zinc-800" />
        </div>
        {/* Stats skeleton */}
        <div className="mb-12">
          <Skeleton className="h-6 w-24 mb-4 bg-zinc-800" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
                <Skeleton className="h-9 w-16 mb-2 bg-zinc-700" />
                <Skeleton className="h-4 w-24 bg-zinc-700" />
              </div>
            ))}
          </div>
        </div>
        {/* Nav cards skeleton */}
        <Skeleton className="h-6 w-28 mb-4 bg-zinc-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
              <Skeleton className="h-12 w-12 mb-4 rounded-lg bg-zinc-700" />
              <Skeleton className="h-5 w-32 mb-2 bg-zinc-700" />
              <Skeleton className="h-4 w-48 bg-zinc-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **`alert()` for error feedback:** Blocking, unstyled, cannot be retried. Use inline ErrorAlert instead.
- **No try/catch on server component DB queries:** Found in admin dashboard, students page, AI logs page, knowledge base pages, uploads page, and student detail page. All must be wrapped.
- **Form error as plain `<p>` tag:** KbEntryForm uses `<p className="text-sm text-red-400">{error}</p>` without the border/background. Replace with ErrorAlert for consistency.
- **Loading skeleton that doesn't match page layout:** Each loading.tsx should mirror the actual page structure (stats cards grid, navigation cards grid, data table layout) for spatial continuity.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Page loading states | Custom loading per page | Next.js `loading.tsx` + `Skeleton` component | Automatic Suspense integration, already used in Phases 27-28 |
| Error display in forms | Custom error divs | `ErrorAlert` from Phase 26 | Consistent styling, already established across student/coach pages |
| Error boundaries | Custom per-page | `error.tsx` files from Phase 26 | Already exists at dashboard, root, and global levels as safety net |
| Form validation | Custom validation logic | react-hook-form + zod (already in use) | Already established in all CRUD forms |
| Content list loading | Custom spinner | `ContentList` already has `loading` prop with Skeleton | Already implemented in Phase 11 |

**Key insight:** Phase 29 is about APPLYING the patterns from Phases 26-28 to admin pages. No new component libraries, patterns, or dependencies need to be invented. The work is systematic: add loading.tsx skeletons, wrap DB queries in try/catch, replace ad-hoc error rendering with ErrorAlert, and improve error specificity in a few client components.

## Common Pitfalls

### Pitfall 1: Admin Dashboard Stats Query Failure Shows Blank Cards or NaN
**What goes wrong:** Admin dashboard runs 5 parallel count queries with NO try/catch. If any query fails, the entire page throws and shows the generic error.tsx boundary. If partial failure occurs inside Promise.all, NaN could appear in stat cards.
**Why it happens:** `Promise.all` rejects on first failure. The `Number(result[0]?.count || 0)` pattern handles missing data but not thrown errors.
**How to avoid:** Wrap the entire `Promise.all` in try/catch. On error, show ErrorAlert in place of the stats section. Navigation cards should still render (they don't depend on DB).
**Warning signs:** Stats cards show "0" or "NaN" when DB is under load.
**Found in:** `src/app/(dashboard)/admin/page.tsx` lines 30-49.

### Pitfall 2: Students Page Has No Try/Catch Around getStudentsPageData
**What goes wrong:** The students page calls `getStudentsPageData()` directly without try/catch. If the query builder throws (invalid sort column, DB connection failure), the page crashes to error.tsx.
**Why it happens:** `getStudentsPageData` is imported from `src/lib/student-queries.ts` and called directly in the server component.
**How to avoid:** Wrap in try/catch, return a default empty result on error, show ErrorAlert.
**Found in:** `src/app/(dashboard)/admin/students/page.tsx` line 45.

### Pitfall 3: Student Detail Page Has Extensive DB Queries Without Try/Catch
**What goes wrong:** Student detail page has 4+ parallel DB queries and a large sequential query block for progress data. If any fails, the entire page crashes.
**Why it happens:** The page builds a complex course/module/lesson progress tree from multiple queries, none wrapped in try/catch.
**How to avoid:** Wrap the summary stats + activity timeline fetch in try/catch. Separately wrap the detailed progress fetch in try/catch. Render each section independently with its own error state.
**Found in:** `src/app/(dashboard)/admin/students/[studentId]/page.tsx` lines 183-362.

### Pitfall 4: AI Logs Page Has Heavy DB Queries Without Try/Catch
**What goes wrong:** AI logs page runs 2 parallel DB queries joining 4+ tables each. If either fails, the page crashes.
**Why it happens:** The queries are complex JOINs across interactionAttempts, interactions, users, lessons, and submissions.
**How to avoid:** Wrap in try/catch, show ErrorAlert, pass empty arrays to AILogList on error.
**Found in:** `src/app/(dashboard)/admin/ai-logs/page.tsx` lines 52-143.

### Pitfall 5: Knowledge Base Pages Have No Try/Catch
**What goes wrong:** KB main page, new entry page, and entry detail page all query the database without try/catch. Entry detail page calls `notFound()` for missing entries, which is correct, but a DB connection failure would also crash the page instead of showing a friendly error.
**Why it happens:** Server components query DB directly with no error handling.
**How to avoid:** Wrap DB queries in try/catch. Distinguish "entry not found" (notFound()) from "DB query failed" (ErrorAlert).
**Found in:** `src/app/(dashboard)/admin/knowledge/page.tsx` lines 30-50, `[entryId]/page.tsx` lines 48-84, `new/page.tsx` lines 23-29.

### Pitfall 6: Course/Module/Lesson Delete Uses alert() for Error Feedback
**What goes wrong:** When a delete operation fails, the user sees a native browser `alert()` dialog. This is unstyled, blocking, and inconsistent with the rest of the app.
**Why it happens:** Quick implementation using `alert()` in Phase 9 catch blocks.
**How to avoid:** Add a `deleteError` state variable. Render as inline ErrorAlert. Clear on next action.
**Found in:** `src/app/(dashboard)/admin/courses/page.tsx` line 62, `[courseId]/page.tsx` line 79, `[moduleId]/page.tsx` line 79.

### Pitfall 7: Uploads Page Has No Try/Catch
**What goes wrong:** The uploads page queries `videoUploads` table directly with no error handling. DB failure crashes the page.
**Found in:** `src/app/(dashboard)/admin/content/uploads/page.tsx` lines 14-18.

### Pitfall 8: BatchAssignModalWrapper Silently Fails on Video Fetch
**What goes wrong:** When the batch assign modal opens, it fetches unassigned videos. The `.then()` chain has no error handling -- if the fetch fails, `videos` stays empty and the user thinks there are no videos to assign.
**Found in:** `src/app/(dashboard)/admin/content/ContentManagementClient.tsx` lines 219-226.

## Page-by-Page Gap Analysis

### Admin Dashboard (`src/app/(dashboard)/admin/page.tsx`)
**Type:** Server component
**Current state:**
- 5 parallel count queries with NO try/catch
- No loading skeleton (no `loading.tsx`)
- Navigation cards hardcoded (no DB dependency) -- GOOD
- Greeting uses Clerk data (no DB) -- GOOD

**Gaps:**
1. Add `loading.tsx` with stats + nav card grid skeleton
2. Add try/catch around stats queries, show ErrorAlert on failure
3. Nav cards and greeting should always render regardless of stats query failure

**Requirements covered:** UXA-01

### Admin Courses List (`src/app/(dashboard)/admin/courses/page.tsx`)
**Type:** Client component
**Current state:**
- Has `fetchCourses` with useCallback + try/catch -- GOOD
- Has error state display -- EXISTS but uses ad-hoc div, not ErrorAlert
- Has loading state via ContentList `loading` prop -- GOOD
- Delete error uses `alert()` -- BAD
- Empty state via ContentList `emptyMessage` -- GOOD

**Gaps:**
1. Replace ad-hoc error div with ErrorAlert (add onRetry)
2. Replace `alert()` in delete handler with inline error state

**Requirements covered:** UXA-02 (partial)

### Admin Course Detail (`src/app/(dashboard)/admin/courses/[courseId]/page.tsx`)
**Type:** Client component
**Current state:**
- Has `fetchCourse` with useCallback + try/catch -- GOOD
- Has loading state with animate-pulse skeleton -- GOOD (but basic)
- Has error state display -- EXISTS but uses ad-hoc div, not ErrorAlert
- Delete module error uses `alert()` -- BAD
- Reorder error handled by ContentList inline ErrorAlert -- GOOD

**Gaps:**
1. Replace ad-hoc error div with ErrorAlert
2. Replace `alert()` in module delete handler with inline error state

**Requirements covered:** UXA-02 (partial)

### Admin Module Detail (`src/app/(dashboard)/admin/courses/[courseId]/modules/[moduleId]/page.tsx`)
**Type:** Client component
**Current state:** Same pattern as course detail. Same gaps.

**Gaps:** Same as course detail.

### Admin Lesson Detail (`src/app/(dashboard)/admin/courses/.../lessons/[lessonId]/page.tsx`)
**Type:** Client component
**Current state:**
- Has loading + error states -- GOOD (same pattern)
- Has interaction fetch that silently fails (`console.error` only) -- BAD
- Interaction fetch uses `if (response.ok)` but no error state on failure -- GAP

**Gaps:**
1. Replace ad-hoc error div with ErrorAlert
2. Add error state for interaction fetch failure (line 79-85)
3. Show error when interactions fail to load instead of silently showing empty timeline

**Requirements covered:** UXA-02 (partial)

### Admin Students Page (`src/app/(dashboard)/admin/students/page.tsx`)
**Type:** Server component
**Current state:**
- Calls `getStudentsPageData()` directly with NO try/catch
- No loading skeleton (no `loading.tsx`)
- StudentDataTable handles its own empty/filter states -- GOOD

**Gaps:**
1. Add `loading.tsx` with student table skeleton
2. Add try/catch around `getStudentsPageData`, show ErrorAlert on failure

**Requirements covered:** UXA-03

### Admin Student Detail (`src/app/(dashboard)/admin/students/[studentId]/page.tsx`)
**Type:** Server component
**Current state:**
- Multiple parallel DB queries with NO try/catch
- Complex progress data assembly with NO try/catch
- Has proper empty states for activity timeline -- GOOD
- GhlProfileSection and StudentTagsSection handle their own errors -- GOOD

**Gaps:**
1. Add try/catch around main queries, show ErrorAlert on failure
2. Preserve student info card even if stats/progress queries fail

**Requirements covered:** UXA-03 (partial)

### Analytics Dashboard (`src/app/(dashboard)/admin/analytics/AnalyticsDashboard.tsx`)
**Type:** Client component
**Current state:**
- Has per-endpoint failure tracking with ErrorAlert banner and retry -- GOOD (fixed in Phase 26-02)
- Has loading state via OverviewCards `loading` prop -- GOOD
- Has CSV export links -- GOOD

**Gaps:** None significant. Already polished in Phase 26.

**Requirements covered:** UXA-01 (partially -- analytics is separate from admin dashboard stats)

### AI Logs Page (`src/app/(dashboard)/admin/ai-logs/page.tsx`)
**Type:** Server component
**Current state:**
- Complex JOIN queries with NO try/catch
- AILogList client component has its own error/loading/empty states -- GOOD (fixed in Phase 26-03)
- No loading skeleton

**Gaps:**
1. Add `loading.tsx` with AI logs skeleton
2. Add try/catch around DB queries, pass empty arrays to AILogList on error

**Requirements covered:** UXA-01 (admin pages general)

### Knowledge Base Page (`src/app/(dashboard)/admin/knowledge/page.tsx`)
**Type:** Server component
**Current state:**
- Parallel DB queries with NO try/catch
- KbEntryList client component has proper empty state per category -- GOOD
- No loading skeleton

**Gaps:**
1. Add `loading.tsx` with knowledge entries skeleton
2. Add try/catch around DB queries, show ErrorAlert on failure

**Requirements covered:** UXA-04

### KB Entry Detail (`src/app/(dashboard)/admin/knowledge/[entryId]/page.tsx`)
**Type:** Server component
**Current state:**
- 4 parallel DB queries with NO try/catch
- Uses `notFound()` for missing entry -- GOOD
- KbFileUpload has client-side validation (PDF type, 10MB) -- GOOD
- KbEntryForm has error state -- GOOD (but uses ad-hoc `<p>` tag)

**Gaps:**
1. Add try/catch around DB queries (distinguish "not found" from "query failed")
2. Replace KbEntryForm error `<p>` with ErrorAlert

**Requirements covered:** UXA-04, UXA-05

### KB New Entry (`src/app/(dashboard)/admin/knowledge/new/page.tsx`)
**Type:** Server component
**Current state:**
- Category fetch with NO try/catch
- KbEntryForm handles its own submit errors -- GOOD

**Gaps:**
1. Add try/catch around category fetch (page should still render with empty categories on failure)

**Requirements covered:** UXA-04

### KB Search (`src/app/(dashboard)/admin/knowledge/search/SearchPageClient.tsx`)
**Type:** Client component
**Current state:**
- Has proper error state with retry (separate `searchError` state) -- GOOD (fixed in Phase 26-02)
- Categories fetch fails silently (acceptable -- categories are optional filter)
- AbortController for cancelling in-flight requests -- GOOD

**Gaps:** None significant. Already polished in Phase 26.

**Requirements covered:** UXA-04

### Content Management (`src/app/(dashboard)/admin/content/ContentManagementClient.tsx`)
**Type:** Client component
**Current state:**
- VideoUploadZone has upload progress with error per item -- GOOD
- VideoLibrary has ErrorAlert with retry -- GOOD (fixed in Phase 26-03)
- BatchAssignModalWrapper silently fails on video fetch -- BAD
- useUploadQueue has per-item error messages -- GOOD
- Upload guidelines shown -- GOOD

**Gaps:**
1. Add error handling to BatchAssignModalWrapper video fetch
2. Consider showing more specific upload error messages (network vs. file format vs. server error)

**Requirements covered:** UXA-05

### Uploads Page (`src/app/(dashboard)/admin/content/uploads/page.tsx`)
**Type:** Server component
**Current state:**
- Direct DB query with NO try/catch
- Has empty state -- GOOD
- Has status badges -- GOOD

**Gaps:**
1. Add try/catch around DB query, show ErrorAlert on failure

**Requirements covered:** UXA-05

### CRUD Forms Consistency Check

| Form | Error State | Zod Validation | Required Fields Marked | Server Error Display | Style |
|------|------------|----------------|----------------------|---------------------|-------|
| CourseForm | Yes | Yes (`courseSchema`) | title (*) | Ad-hoc div | Replace with ErrorAlert |
| ModuleForm | Yes | Yes (`moduleSchema`) | title (*) | Ad-hoc div | Replace with ErrorAlert |
| LessonForm | Yes | Yes (`lessonSchema`) | title (*) | Ad-hoc div | Replace with ErrorAlert |
| InteractionForm | Yes | Yes (`interactionSchema`) | timestamp, type, language, prompt (*) | Ad-hoc div | Replace with ErrorAlert |
| KbEntryForm | Yes | Manual (HTML required) | title, content (*) | Plain `<p>` tag | Replace with ErrorAlert |

**Key finding:** All CRUD forms already have:
- Client-side validation (Zod or HTML required)
- Server-side error capture and display
- Required field indicators (red asterisks)
- Submit button disabled during submission

The gap is purely styling consistency: replace 5 different ad-hoc error rendering patterns with the shared ErrorAlert component.

## Code Examples

### Server Component Try/Catch for Students Page
```typescript
// src/app/(dashboard)/admin/students/page.tsx
export default async function AdminStudentsPage({ searchParams }: { ... }) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) redirect("/dashboard");

  const params = await searchParams;
  // ... parse search params (unchanged)

  let result: StudentPageResult;
  let queryError: string | null = null;

  try {
    result = await getStudentsPageData({ ... });
  } catch (error) {
    console.error("Students page query failed:", error);
    result = { students: [], total: 0 };
    queryError = "Unable to load student data. Please try refreshing the page.";
  }

  return (
    <div>
      {/* Breadcrumb and header always render */}
      {queryError ? (
        <ErrorAlert variant="block" message={queryError} />
      ) : (
        <StudentDataTable data={result.students} total={result.total} ... />
      )}
    </div>
  );
}
```

### Form ErrorAlert Replacement
```typescript
// In CourseForm (and all other admin forms):
import { ErrorAlert } from "@/components/ui/error-alert";

// Replace:
{error && (
  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
    {error}
  </div>
)}

// With:
{error && <ErrorAlert message={error} />}
```

### Delete Error Inline State
```typescript
// In courses/page.tsx:
const [deleteError, setDeleteError] = useState<string | null>(null);

const handleDelete = async (courseId: string) => {
  if (!confirm("Are you sure you want to delete this course?")) return;
  setDeleteError(null);
  try {
    const response = await fetch(`/api/admin/courses/${courseId}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Failed to delete course");
    fetchCourses();
  } catch (err) {
    setDeleteError(err instanceof Error ? err.message : "Failed to delete course");
  }
};

// In JSX (above the course list):
{deleteError && <ErrorAlert message={deleteError} />}
```

### Admin Dashboard Loading Skeleton
```typescript
// src/app/(dashboard)/admin/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboardLoading() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Skeleton className="h-5 w-80 bg-zinc-800" />
        </div>
        {/* Stats section */}
        <div className="mb-12">
          <Skeleton className="h-6 w-24 mb-4 bg-zinc-800" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
                <Skeleton className="h-9 w-16 mb-2 bg-zinc-700" />
                <Skeleton className="h-4 w-24 bg-zinc-700" />
              </div>
            ))}
          </div>
        </div>
        {/* Management cards */}
        <Skeleton className="h-6 w-28 mb-4 bg-zinc-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800 p-6">
              <Skeleton className="h-12 w-12 mb-4 rounded-lg bg-zinc-700" />
              <Skeleton className="h-5 w-32 mb-2 bg-zinc-700" />
              <Skeleton className="h-4 w-48 bg-zinc-700" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No loading states for admin pages | `loading.tsx` Suspense boundaries with Skeleton | Phases 27-28 established pattern | Admin pages get same treatment as student/coach pages |
| `alert()` for delete errors | Inline ErrorAlert component | Phase 26 established ErrorAlert | Non-blocking, styled, consistent |
| Ad-hoc error divs in forms | Shared ErrorAlert component | Phase 26 created ErrorAlert | Single source of truth for error styling |
| No try/catch on server components | Inline try/catch with ErrorAlert fallback | Phases 27-28 established pattern | Page-specific error messages instead of generic error.tsx |

**Deprecated/outdated:**
- `alert()` for error feedback: Use inline ErrorAlert instead
- Ad-hoc error divs with custom classes: Use the shared ErrorAlert component
- Server components without try/catch: Established in Phases 27-28 that all server pages should wrap DB queries

## Task Breakdown Recommendation

### Wave 1 (29-01): Admin Dashboard Stats, CRUD Forms, and Student Management
**Focus:** UXA-01, UXA-02, UXA-03

**Admin Dashboard (UXA-01):**
- Create `admin/loading.tsx` with stats + nav card grid skeleton
- Add try/catch around stats queries, show ErrorAlert on failure, preserve nav cards

**CRUD Form Validation Consistency (UXA-02):**
- Replace ad-hoc error divs with ErrorAlert in CourseForm, ModuleForm, LessonForm, KbEntryForm
- Replace `alert()` with inline deleteError state in courses page, course detail page, module detail page
- Add error state for interaction fetch failure in lesson detail page

**Student Management (UXA-03):**
- Create `admin/students/loading.tsx` with student table skeleton
- Add try/catch around `getStudentsPageData` in students page
- Add try/catch around DB queries in student detail page, preserve student info on partial failure

### Wave 2 (29-02): Knowledge Base and Content Management
**Focus:** UXA-04, UXA-05

**Knowledge Base (UXA-04):**
- Create `admin/knowledge/loading.tsx` with entry list skeleton
- Add try/catch to knowledge base main page, new entry page, entry detail page
- Distinguish "entry not found" from "query failed" in entry detail page

**Content Management (UXA-05):**
- Add error handling to BatchAssignModalWrapper video fetch
- Add try/catch to uploads page
- Create `admin/ai-logs/loading.tsx` with log list skeleton (bonus: also an admin page)
- Add try/catch to AI logs page

## Open Questions

1. **Should `window.confirm()` be replaced with Radix AlertDialog for delete confirmations?**
   - What we know: `window.confirm()` is functional but unstyled and blocking. Radix AlertDialog is already installed and provides accessible, styled confirmation dialogs.
   - What's unclear: Whether this is in scope for "UX polish" or whether it's a new feature/enhancement.
   - Recommendation: Keep `confirm()` for now. It works, is understood by all users, and replacing it adds complexity without addressing a success criterion. Mention as a potential future enhancement.

2. **Should course/module/lesson detail pages use Skeleton component instead of animate-pulse divs?**
   - What we know: These client component pages already have inline loading skeletons using `<div className="animate-pulse">` with plain divs. The Skeleton component from shadcn/ui also uses animate-pulse but provides a consistent API.
   - Recommendation: The existing animate-pulse loading is functional. Replacing with Skeleton is a minor consistency improvement but not required. Keep existing if time is tight; replace if convenient during ErrorAlert updates.

3. **How to handle student detail page partial failures?**
   - What we know: The page has 3 distinct data sections: (1) student info + summary stats, (2) activity timeline, (3) detailed course progress. Each could fail independently.
   - Recommendation: Wrap the entire main query block in one try/catch. If it fails, show ErrorAlert below the breadcrumb/back link. The student info card requires the `student` lookup which is separate (and already has `notFound()` handling). This keeps it simple while still graceful.

## Sources

### Primary (HIGH confidence)
- Direct codebase audit of all 35+ admin files across 8 page areas
- Phase 26 research and implementation (ErrorAlert, error.tsx patterns)
- Phase 27 research and implementation (loading.tsx, server component try/catch patterns)
- Phase 28 plans and implementation (coach page patterns, direct extension of 27)
- `src/components/ui/skeleton.tsx` - existing Skeleton component
- `src/components/ui/error-alert.tsx` - established ErrorAlert component

### Secondary (MEDIUM confidence)
- Next.js `loading.tsx` convention behavior (verified from project setup and Phases 27-28 usage)
- react-hook-form + zod validation patterns (verified from existing admin form code)

### Tertiary (LOW confidence)
- None. All findings are from direct codebase inspection and established patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already installed, zero new dependencies needed
- Architecture: HIGH - Patterns directly copy from Phases 27-28 (student/coach pages)
- Pitfalls: HIGH - All identified from direct codebase audit with specific file/line references
- Page-by-page analysis: HIGH - Every admin page was read and gaps catalogued
- CRUD form audit: HIGH - All 5 forms read and validation/error patterns documented

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable - no fast-moving dependencies, all patterns established internally)
