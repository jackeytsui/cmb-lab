# Phase 24: Student Management Dashboard - Research

**Researched:** 2026-01-31
**Domain:** Data tables, bulk operations, server-side pagination, CSV export
**Confidence:** HIGH

## Summary

This phase builds a full-featured student management dashboard for coaches, replacing the existing basic student list (simple card-based layout with search only) with a proper data table supporting sorting, filtering, pagination, row selection, bulk operations, and CSV export.

The codebase already has significant scaffolding: an admin students page (`/admin/students`), a student detail page (`/admin/students/[studentId]`), an API route (`/api/admin/students`) with search and tag filtering, course access management APIs, tag assignment APIs, and an analytics CSV export utility. Phase 23 tags infrastructure is fully in place.

**Primary recommendation:** Use TanStack Table v8 (headless) with server-side pagination/sorting/filtering via URL search params. Build custom Tailwind-styled table UI consistent with existing dark theme. Store filter presets in a new Postgres table (not localStorage) for cross-device persistence. Implement bulk operations via a dedicated batch API endpoint with per-student result reporting.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | ^8.21.3 | Headless table logic (sorting, filtering, pagination, row selection) | Industry standard for React data tables; headless design matches existing Tailwind/Radix UI approach; supports server-side pagination via `manualPagination`; built-in row selection with checkbox helpers |
| use-debounce | ^10.1.0 | Search input debouncing | Already in project dependencies |
| date-fns | ^4.1.0 | Date formatting in table cells | Already in project dependencies |
| zod | ^4.3.6 | Request validation for bulk operation APIs | Already in project dependencies |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-virtual | ^3.x | Virtual scrolling for very large datasets | Only if student count exceeds ~500 rows visible at once (unlikely with pagination) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Table (headless) | Material React Table (MRT) | MRT bundles Material UI; this project uses Tailwind/Radix - would add 200KB+ of unused CSS. TanStack Table's headless approach is the right fit. |
| TanStack Table | AG Grid | AG Grid is enterprise/commercial for advanced features. Overkill for this use case. |
| Server-side pagination | Client-side pagination | Client-side breaks with large student counts and doesn't allow efficient DB queries. Server-side is the correct choice. |
| Postgres filter presets | localStorage presets | localStorage doesn't persist cross-device and is lost on cache clear. For a coach tool, Postgres storage is more robust. |

**Installation:**
```bash
npm install @tanstack/react-table
```

This is the only new dependency. Everything else is already in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (dashboard)/admin/students/
│   │   ├── page.tsx                    # Server component: fetch paginated data, pass to client
│   │   ├── StudentDataTable.tsx        # Client component: TanStack Table with all features
│   │   ├── StudentBulkActions.tsx      # Client component: bulk action toolbar
│   │   ├── FilterPresetManager.tsx     # Client component: save/load filter presets
│   │   └── [studentId]/
│   │       ├── page.tsx                # Existing detail page (enhance with activity timeline)
│   │       └── StudentTagsSection.tsx  # Existing (no changes needed)
│   └── api/admin/students/
│       ├── route.ts                    # Enhanced: add sorting, progress filters, at-risk filter
│       ├── bulk/route.ts               # NEW: bulk assign/remove courses and tags
│       ├── bulk/undo/route.ts          # NEW: undo last bulk operation
│       ├── export/route.ts             # NEW: CSV export with column selection
│       └── filter-presets/
│           ├── route.ts                # NEW: CRUD for saved filter presets
│           └── [presetId]/route.ts     # NEW: update/delete specific preset
├── db/schema/
│   └── filter-presets.ts               # NEW: filter_presets table
└── lib/
    └── student-queries.ts              # NEW: shared query builders for student data
```

### Pattern 1: Server-Side Pagination with URL Search Params
**What:** Sync table state (page, pageSize, sort, filters) with URL query parameters. Fetch data in the server component and pass to client.
**When to use:** Always for this dashboard - enables shareable URLs, browser back/forward, and server-side data fetching.
**Example:**
```typescript
// Source: TanStack Table docs + Next.js App Router pattern
// page.tsx (Server Component)
export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 25;
  const sortBy = (params.sortBy as string) || "createdAt";
  const sortOrder = (params.sortOrder as string) || "desc";
  const search = (params.search as string) || "";
  // ... more filters

  const { students, total } = await getStudentsPageData({
    page, pageSize, sortBy, sortOrder, search, /* filters */
  });

  return (
    <StudentDataTable
      data={students}
      total={total}
      pagination={{ page, pageSize }}
      sorting={{ sortBy, sortOrder }}
      filters={{ search }}
    />
  );
}

// StudentDataTable.tsx (Client Component)
"use client";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Use manualPagination, manualSorting, manualFiltering
const table = useReactTable({
  data,
  columns,
  manualPagination: true,
  manualSorting: true,
  manualFiltering: true,
  pageCount: Math.ceil(total / pageSize),
  state: { pagination, sorting, columnFilters, rowSelection },
  onPaginationChange: (updater) => {
    // Push new URL params
    const newParams = new URLSearchParams(searchParams.toString());
    const next = typeof updater === "function"
      ? updater({ pageIndex: page - 1, pageSize })
      : updater;
    newParams.set("page", String(next.pageIndex + 1));
    newParams.set("pageSize", String(next.pageSize));
    router.push(`${pathname}?${newParams.toString()}`);
  },
  enableRowSelection: true,
  onRowSelectionChange: setRowSelection,
  getCoreRowModel: getCoreRowModel(),
});
```

### Pattern 2: Bulk Operations with Per-Student Results
**What:** A single API endpoint that accepts an array of student IDs and an operation, processes each independently, and returns per-student success/failure.
**When to use:** For all bulk operations (course assign/remove, tag add/remove).
**Example:**
```typescript
// POST /api/admin/students/bulk
// Request:
{
  operation: "assign_course" | "remove_course" | "add_tag" | "remove_tag",
  studentIds: string[],
  targetId: string, // courseId or tagId
}

// Response:
{
  operationId: string, // UUID for undo tracking
  results: [
    { studentId: "...", success: true },
    { studentId: "...", success: false, error: "Already enrolled" },
  ],
  summary: { total: 10, succeeded: 9, failed: 1 },
}
```

### Pattern 3: Undo via Operation Log
**What:** Store each bulk operation in a `bulk_operations` table with a TTL. Undo reverses the operation within 5 minutes.
**When to use:** BULKOP-08 requirement - undo last bulk operation within 5 minutes.
**Example:**
```typescript
// Schema for bulk_operations table
export const bulkOperations = pgTable("bulk_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationType: text("operation_type").notNull(), // "assign_course", "remove_course", "add_tag", "remove_tag"
  targetId: text("target_id").notNull(), // courseId or tagId
  studentIds: jsonb("student_ids").notNull(), // string[] of affected student IDs
  succeededIds: jsonb("succeeded_ids").notNull(), // string[] of IDs that succeeded
  performedBy: uuid("performed_by").notNull().references(() => users.id),
  undoneAt: timestamp("undone_at"), // null = not undone
  expiresAt: timestamp("expires_at").notNull(), // createdAt + 5 minutes
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Undo endpoint checks expiresAt > now() AND undoneAt IS NULL
// Then reverses: assign -> remove, remove -> assign, etc.
```

### Pattern 4: Shift-Click Range Selection
**What:** Track lastClickedIndex, on shift+click select all rows between lastClickedIndex and currentIndex.
**When to use:** BULKOP-07 requirement.
**Example:**
```typescript
// In the row click handler:
const handleRowClick = (rowIndex: number, event: React.MouseEvent) => {
  if (event.shiftKey && lastClickedIndex !== null) {
    const start = Math.min(lastClickedIndex, rowIndex);
    const end = Math.max(lastClickedIndex, rowIndex);
    const newSelection: Record<string, boolean> = { ...rowSelection };
    for (let i = start; i <= end; i++) {
      newSelection[String(i)] = true;
    }
    setRowSelection(newSelection);
  } else {
    table.getRow(String(rowIndex)).toggleSelected();
  }
  setLastClickedIndex(rowIndex);
};
```

### Anti-Patterns to Avoid
- **Client-side filtering of full dataset:** Do NOT fetch all students and filter client-side. Use server-side filtering with SQL WHERE clauses. The existing API already does this.
- **Separate API calls per student for bulk ops:** Do NOT loop client-side and call `/api/students/[id]/tags` for each student. Use a single bulk endpoint.
- **Storing filter presets in localStorage only:** Coach filter presets should persist across devices. Use a database table.
- **Coupling table UI to TanStack Table internals:** Keep the table UI in a separate component. TanStack Table is headless - pass it data and state, render your own Tailwind markup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sorting/pagination/filtering state management | Custom state machine | TanStack Table `useReactTable` with manual modes | Handles edge cases around page boundaries, sort toggling, filter debouncing |
| Row selection with select-all | Custom checkbox state | TanStack Table row selection model | Handles indeterminate state, page-level vs all-rows selection, disabled rows |
| CSV generation | Custom string concatenation | Existing `formatCsvResponse` from `src/lib/analytics.ts` | Already handles comma/quote escaping, proper headers |
| Date formatting | Manual date string manipulation | `date-fns` (already installed) | Already used throughout codebase |
| Search debouncing | setTimeout/clearTimeout | `use-debounce` (already installed) | Already used in existing StudentList component |

**Key insight:** The biggest value of TanStack Table is its state management for complex table interactions (sorting + filtering + pagination + selection all interacting correctly). Hand-rolling this leads to bugs around edge cases like "selecting all then changing page" or "sort direction toggle resets page to 1."

## Common Pitfalls

### Pitfall 1: Row Selection Across Pages with Server-Side Pagination
**What goes wrong:** When using `manualPagination`, TanStack Table only knows about the current page's rows. Selecting "all" only selects the visible page, not all filtered results.
**Why it happens:** The table instance doesn't have access to rows on other pages.
**How to avoid:** Use `getToggleAllPageRowsSelectedHandler()` (not `getToggleAllRowsSelectedHandler()`) for the header checkbox. Track selected IDs in a separate `Set<string>` state that persists across pages. Show a banner: "25 students on this page selected. Select all 142 matching students?"
**Warning signs:** Coach selects all, changes page, selection is gone.

### Pitfall 2: N+1 Queries in Student List API
**What goes wrong:** Fetching student tags, progress, and course access as separate queries per student.
**Why it happens:** Natural inclination to use the existing per-student APIs.
**How to avoid:** Build a single query that joins users + lessonProgress + courseAccess + studentTags. Use LEFT JOINs and aggregate with SQL. The existing `/api/admin/students` route already batches tag fetching for the page - extend this pattern.
**Warning signs:** Slow page load times, many database queries per page render.

### Pitfall 3: URL Search Params Causing Full Page Re-renders
**What goes wrong:** Every filter change triggers a full server component re-render via `router.push()`.
**Why it happens:** Server components re-run on URL changes in Next.js App Router.
**How to avoid:** Debounce search input (300ms), use `router.replace()` instead of `router.push()` for filter changes to avoid polluting browser history, and consider a hybrid approach: use URL params for pagination/sort (shareable) but client state for transient filters like search text (with debounced sync to URL).
**Warning signs:** Laggy typing in search box, visible loading flash on every keystroke.

### Pitfall 4: Bulk Operation Race Conditions
**What goes wrong:** Coach clicks "Assign Course" for 50 students, then clicks "Undo" before all assignments complete.
**Why it happens:** Async operations overlapping.
**How to avoid:** Disable the undo button while a bulk operation is in progress. Use a server-side operation status (processing/completed) before allowing undo. Show a progress indicator during bulk operations.
**Warning signs:** Partial undo, inconsistent state.

### Pitfall 5: Undo Window Expiry UX
**What goes wrong:** Coach sees "Undo" button but it silently fails because 5 minutes passed.
**Why it happens:** Client-side timer not synced with server expiry.
**How to avoid:** Show a countdown timer next to the undo button. Check server-side expiry before executing undo. Return a clear error if expired.
**Warning signs:** "Failed to undo" error with no explanation.

### Pitfall 6: CSV Export Blocking the Event Loop
**What goes wrong:** Exporting 10,000 students as CSV takes too long and times out.
**Why it happens:** Building a large CSV string in memory on a serverless function.
**How to avoid:** Use streaming response with `ReadableStream`. Process rows in batches. Set appropriate Content-Disposition headers. The existing `formatCsvResponse` helper works for smaller datasets but may need streaming for very large exports.
**Warning signs:** 504 timeout on export, high memory usage.

## Code Examples

### Server-Side Student Query Builder
```typescript
// Source: Pattern derived from existing /api/admin/students/route.ts
// src/lib/student-queries.ts

import { db } from "@/db";
import { users, courseAccess, lessonProgress, studentTags, tags } from "@/db/schema";
import { eq, sql, ilike, or, inArray, desc, asc, and } from "drizzle-orm";

interface StudentQueryParams {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search?: string;
  tagIds?: string[];
  courseId?: string;
  progressStatus?: "not_started" | "in_progress" | "completed";
  atRisk?: boolean; // inactive > 7 days
}

export async function getStudentsPageData(params: StudentQueryParams) {
  const { page, pageSize, sortBy, sortOrder, search, tagIds, courseId, atRisk } = params;
  const offset = (page - 1) * pageSize;

  // Build WHERE clause
  let whereConditions = [sql`${users.role} = 'student'`];

  if (search) {
    whereConditions.push(
      sql`(${users.name} ILIKE ${`%${search}%`} OR ${users.email} ILIKE ${`%${search}%`})`
    );
  }

  if (tagIds && tagIds.length > 0) {
    whereConditions.push(
      sql`${users.id} IN (
        SELECT DISTINCT ${studentTags.userId} FROM ${studentTags}
        WHERE ${inArray(studentTags.tagId, tagIds)}
      )`
    );
  }

  if (courseId) {
    whereConditions.push(
      sql`${users.id} IN (
        SELECT ${courseAccess.userId} FROM ${courseAccess}
        WHERE ${courseAccess.courseId} = ${courseId}
      )`
    );
  }

  if (atRisk) {
    whereConditions.push(
      sql`${users.id} NOT IN (
        SELECT DISTINCT ${lessonProgress.userId} FROM ${lessonProgress}
        WHERE ${lessonProgress.lastAccessedAt} > NOW() - INTERVAL '7 days'
      )`
    );
  }

  const where = sql.join(whereConditions, sql` AND `);

  // Build ORDER BY
  const sortColumn = {
    name: users.name,
    email: users.email,
    createdAt: users.createdAt,
  }[sortBy] || users.createdAt;

  const orderFn = sortOrder === "asc" ? asc : desc;

  // Execute count + data in parallel
  const [countResult, studentList] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(users).where(where),
    db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(orderFn(sortColumn))
    .limit(pageSize)
    .offset(offset),
  ]);

  const total = Number(countResult[0]?.count || 0);

  // Batch-fetch tags and progress for the page
  const studentIds = studentList.map((s) => s.id);
  // ... (same pattern as existing route.ts for tag batching)

  return { students: studentList, total };
}
```

### TanStack Table Column Definitions
```typescript
// Source: TanStack Table docs - row selection pattern
const columns: ColumnDef<StudentRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected();
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        className="rounded border-zinc-600"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        className="rounded border-zinc-600"
      />
    ),
    enableSorting: false,
    enableColumnFilter: false,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name || row.original.email.split("@")[0],
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "coursesEnrolled",
    header: "Courses",
    enableColumnFilter: false,
  },
  {
    accessorKey: "completionPercent",
    header: "Progress",
    cell: ({ getValue }) => `${getValue()}%`,
  },
  {
    accessorKey: "lastActive",
    header: "Last Active",
    cell: ({ getValue }) => {
      const date = getValue() as string | null;
      return date ? formatDistanceToNow(new Date(date), { addSuffix: true }) : "Never";
    },
  },
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ getValue }) => {
      const tags = getValue() as { id: string; name: string; color: string }[];
      return tags.map((t) => <TagBadge key={t.id} {...t} />);
    },
    enableSorting: false,
  },
];
```

### Bulk Operation API
```typescript
// Source: Custom pattern based on existing access/tags routes
// POST /api/admin/students/bulk
import { z } from "zod";

const bulkSchema = z.object({
  operation: z.enum(["assign_course", "remove_course", "add_tag", "remove_tag"]),
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  targetId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  // Auth check (coach+)
  const body = await request.json();
  const { operation, studentIds, targetId } = bulkSchema.parse(body);

  const results: { studentId: string; success: boolean; error?: string }[] = [];

  for (const studentId of studentIds) {
    try {
      switch (operation) {
        case "assign_course":
          await grantCourseAccess(studentId, targetId);
          break;
        case "add_tag":
          await assignTag(studentId, targetId, currentUser.id);
          break;
        // ... etc
      }
      results.push({ studentId, success: true });
    } catch (err) {
      results.push({ studentId, success: false, error: err.message });
    }
  }

  // Log for undo
  const [op] = await db.insert(bulkOperations).values({
    operationType: operation,
    targetId,
    studentIds,
    succeededIds: results.filter((r) => r.success).map((r) => r.studentId),
    performedBy: currentUser.id,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  }).returning();

  return NextResponse.json({
    operationId: op.id,
    results,
    summary: {
      total: results.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    },
  });
}
```

### Filter Preset Schema
```typescript
// src/db/schema/filter-presets.ts
export const filterPresets = pgTable("filter_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(), // { search, tagIds, courseId, progressStatus, atRisk, sortBy, sortOrder }
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-table v7 (class components, render props) | TanStack Table v8 (hooks, headless, TypeScript-first) | 2022 | Complete rewrite; v8 is current stable |
| Client-side only tables | Server-side pagination with URL sync | Next.js App Router (2023+) | Better for SEO, large datasets, shareable links |
| localStorage filter presets | Database-stored presets | Industry shift | Cross-device, team-shareable, auditable |
| Individual API calls for bulk | Batch API endpoints | Standard practice | Reduces N+1 HTTP calls, enables atomic undo |

**Deprecated/outdated:**
- `react-table` v7: Completely superseded by `@tanstack/react-table` v8. Do not use.
- Client-side-only filtering for admin dashboards: Not viable for datasets that could grow to thousands of students.

## Existing Codebase Assets (Reuse Plan)

These existing files directly support Phase 24 and should be enhanced, not replaced:

| File | Current State | Phase 24 Enhancement |
|------|---------------|----------------------|
| `src/app/api/admin/students/route.ts` | Search + tag filter, offset pagination | Add: sortBy, sortOrder, courseId filter, progressStatus filter, atRisk filter, enriched response with progress data |
| `src/app/(dashboard)/admin/students/page.tsx` | Server component, basic student list | Rewrite: pass searchParams to query builder, render DataTable client component |
| `src/components/admin/StudentList.tsx` | Simple card list with search | Replace with: StudentDataTable using TanStack Table |
| `src/app/(dashboard)/admin/students/[studentId]/page.tsx` | Full detail view with progress, tags, GHL | Add: activity timeline section (STDMGMT-05) |
| `src/lib/analytics.ts` | `formatCsvResponse`, `formatCsvRow`, `parseDateRange` | Reuse for CSV export |
| `src/components/tags/TagFilter.tsx` | Clickable tag pill filter | Reuse in advanced filter panel |
| `src/components/tags/TagBadge.tsx` | Tag display component | Reuse in table cells |
| `src/lib/tags.ts` | `assignTag`, `removeTag`, `getStudentTags` | Reuse in bulk operations |
| `src/app/api/students/[studentId]/access/route.ts` | Grant/revoke course access | Reuse logic in bulk course operations |

## Open Questions

1. **"At-risk" definition specifics**
   - What we know: Existing analytics uses "days inactive" (configurable, default 7). Auto-tag rules support `inactive_days` and `no_progress_days` conditions.
   - What's unclear: Should the student management dashboard use a single at-risk threshold (7 days) or allow the coach to configure the threshold per filter?
   - Recommendation: Default to 7 days inactive (matching existing analytics), but allow override via a dropdown (3/7/14/30 days) in the advanced filter panel.

2. **Activity timeline data sources (STDMGMT-05)**
   - What we know: `lessonProgress.lastAccessedAt` and `lessonProgress.completedAt` track lesson activity. `submissions.createdAt` tracks submission times. `conversations.createdAt` tracks AI conversation starts.
   - What's unclear: Whether to include login events (Clerk doesn't expose these via the DB).
   - Recommendation: Build timeline from lessonProgress, submissions, and conversations tables. Skip login events (would require Clerk webhook integration not yet built).

3. **Cross-page selection for bulk operations**
   - What we know: TanStack Table's row selection is page-scoped with `manualPagination`.
   - What's unclear: Should coaches be able to bulk-operate on all filtered students (not just current page)?
   - Recommendation: Implement a "Select all X matching students" banner (like Gmail). Store selected IDs in client state. When "select all" is used, pass the filter params to the bulk API instead of individual IDs, letting the server resolve the full set.

## Sources

### Primary (HIGH confidence)
- TanStack Table docs (Context7 `/websites/tanstack_table`) - row selection, filtering, pagination, sorting patterns
- Existing codebase analysis - schema files, API routes, component structure
- `@tanstack/react-table` npm v8.21.3 - current stable version

### Secondary (MEDIUM confidence)
- [TanStack Table server-side pagination patterns](https://tanstack.com/table/v8/docs/guide/pagination) - manualPagination configuration
- [Shadcn DataTable server-side pattern](https://medium.com/@destiya.dian/shadcn-datatable-server-side-pagination-on-nextjs-app-router-83a35075c767) - Next.js App Router URL sync pattern
- [React useOptimistic](https://react.dev/reference/react/useOptimistic) - optimistic UI for bulk operations

### Tertiary (LOW confidence)
- [MUI X filter presets with localStorage](https://mui.com/x/react-data-grid/filtering-recipes/) - filter preset UX inspiration (different library, but pattern applicable)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - TanStack Table v8 is the clear choice for headless React tables; verified via Context7 and npm
- Architecture: HIGH - patterns derived from existing codebase conventions and TanStack Table official docs
- Pitfalls: HIGH - common pitfalls verified through official docs, GitHub discussions, and analysis of existing codebase patterns
- Bulk operations/undo: MEDIUM - undo pattern is custom design (no standard library), but approach is straightforward

**Research date:** 2026-01-31
**Valid until:** 2026-03-01 (stable domain, TanStack Table v8 is mature)
