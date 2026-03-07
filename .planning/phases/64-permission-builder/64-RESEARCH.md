# Phase 64: Permission Builder - Research

**Researched:** 2026-02-14
**Domain:** Hierarchical course tree with checkboxes + feature toggles for RBAC role configuration (Drizzle schema evolution, React tree state, auto-save with debounce)
**Confidence:** HIGH

## Summary

Phase 64 builds the Permission Builder UI -- the screen where a coach opens a role's detail page and configures which courses, modules, lessons, and platform features that role grants access to. This is the core value proposition of the RBAC system: roles are just names until this builder wires them to content.

The main challenge is a **schema gap**: the existing `roleCourses` table (from Phase 62) only has `courseId` with a unique constraint on `(roleId, courseId)`. It does NOT have `moduleId` or `lessonId` columns. However, requirements PERM-02 and PERM-03 demand module-level and lesson-level granular access. This means Phase 64 must either (a) add `moduleId` and `lessonId` nullable columns to `roleCourses` and drop the existing unique index, or (b) create a new `roleModules` and `roleLessons` join table. Option (a) is recommended because it keeps a single table and matches the phase description's stated schema. The original RBAC research explicitly rejected per-lesson/module overrides, but the Phase 64 requirements override that decision.

The UI is a hierarchical tree: courses at the top, expandable to modules, expandable to lessons, each with a checkbox. A separate section has feature toggles (7 feature keys already defined in `src/lib/permissions.ts`). The tree uses the existing Radix UI Collapsible component (already installed as `src/components/ui/collapsible.tsx`) for expand/collapse behavior, and needs the shadcn/ui Checkbox component (not yet installed, per Decision 5 this is the second allowed addition). Auto-save uses `useDebouncedCallback` from `use-debounce` (already installed) with optimistic UI updates, a spinner indicator, and sonner toast confirmation.

**Primary recommendation:** Evolve the `roleCourses` schema to add nullable `moduleId` and `lessonId` columns. Build a `/admin/roles/[roleId]` detail page with two sections: (1) a course permission tree using native Radix Collapsible + Checkbox, and (2) a feature permission section using Switch toggles. All permission changes auto-save via debounced PATCH/POST calls to new API endpoints. No "Save" button -- each toggle fires an individual API call after a short debounce.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 (installed) | Schema evolution, permission queries (insert/delete roleCourses, roleFeatures) | Used in all 28 schema files and every `src/lib/*.ts` service |
| drizzle-kit | 0.31.8 (installed) | Generate migration for schema changes (add moduleId/lessonId columns) | Used for all schema migrations |
| zod | 4.3.6 (installed) | API request validation for permission mutations | Used in all admin API routes |
| react | 19.2.3 (installed) | Component tree state management for hierarchical checkbox tree | Project framework |
| next | 16.1.4 (installed) | API routes, App Router pages | Project framework |
| use-debounce | 10.1.0 (installed) | `useDebouncedCallback` for auto-save debouncing | Used in SearchBar, useWatchProgress, useCharacterPopup |
| sonner | 2.0.7 (installed) | Toast notifications for save confirmation | Used in 20+ components across the app |
| lucide-react | 0.563.0 (installed) | Icons (ChevronRight, ChevronDown, Check, Loader2, Shield, Settings) | Used across entire admin UI |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Checkbox | (to install) | Checkbox for course/module/lesson tree items | Decision 5: second allowed shadcn/ui component |
| Radix Collapsible | 1.4.3 (installed via radix-ui) | Expand/collapse for tree hierarchy | Already exists as `src/components/ui/collapsible.tsx` |
| Switch | (installed) | Feature permission toggles | Already exists as `src/components/ui/switch.tsx` |
| Badge | (installed) | Role color badge on detail page header | Already installed from Phase 63 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flat roleCourses + moduleId/lessonId | Separate roleModules + roleLessons tables | More tables = more joins. Single table with nullable FKs is simpler, matches the phase description, and allows a single query to load all grants. |
| Custom tree component | @tanstack/react-table with expanding rows | Overkill for a simple 3-level tree. Custom tree with Collapsible + Checkbox is ~100 lines and more readable. |
| Individual auto-save per toggle | Batch save with "Save" button | Requirements explicitly state "auto-save with spinner and toast" (PERM-07). Individual saves are simpler and give immediate feedback. |
| Debounce with react-hook-form | useDebouncedCallback from use-debounce | No form needed -- each toggle is an independent mutation. useDebouncedCallback is already the codebase pattern. |

**Installation:**
```bash
# Install Checkbox component (the second and final allowed shadcn/ui addition)
npx shadcn@latest add checkbox
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── roles.ts              # MODIFY: Add moduleId + lessonId to roleCourses, update unique index
├── lib/
│   └── permissions.ts         # MODIFY: Update resolver to handle module/lesson-level grants
├── app/
│   ├── api/admin/roles/[roleId]/
│   │   ├── route.ts           # EXISTS: GET single role (extend to include permissions)
│   │   ├── courses/
│   │   │   └── route.ts       # NEW: PUT to sync course/module/lesson permissions for a role
│   │   └── features/
│   │       └── route.ts       # NEW: PUT to sync feature permissions for a role
│   └── (dashboard)/admin/roles/
│       └── [roleId]/
│           └── page.tsx       # NEW: Role detail page with permission builder
├── components/admin/
│   ├── PermissionTree.tsx     # NEW: Course > Module > Lesson hierarchical checkbox tree
│   └── FeaturePermissions.tsx # NEW: Feature toggle grid with Switch components
└── components/ui/
    └── checkbox.tsx           # NEW: shadcn/ui Checkbox (installed via CLI)
```

### Pattern 1: Schema Evolution with Nullable Foreign Keys
**What:** Add `moduleId` and `lessonId` nullable columns to the existing `roleCourses` table. A row with only `courseId` set means "full course access." A row with `courseId` + `moduleId` means "access to that specific module." A row with `courseId` + `moduleId` + `lessonId` means "access to that specific lesson."
**When to use:** When the permission grant granularity varies from course-level to lesson-level.

```typescript
// Updated roleCourses schema -- add moduleId and lessonId
export const roleCourses = pgTable("role_courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  moduleId: uuid("module_id")
    .references(() => modules.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .references(() => lessons.id, { onDelete: "cascade" }),
  accessTier: accessTierEnum("access_tier").notNull().default("full"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  // New composite unique: prevent duplicate grants at any level
  uniqueIndex("role_courses_unique").on(
    table.roleId, table.courseId, table.moduleId, table.lessonId
  ),
  index("role_courses_role_id_idx").on(table.roleId),
]);
```

**CRITICAL: Null handling in unique indexes.** PostgreSQL treats NULLs as distinct in unique indexes. This means `(role1, course1, NULL, NULL)` and another `(role1, course1, NULL, NULL)` would NOT violate the unique constraint -- Postgres sees each NULL as unique. To handle this, use `COALESCE` in a unique expression index OR enforce uniqueness in application code. The simplest approach is application-level dedup: before inserting a course-level grant, delete any existing row with the same roleId + courseId + NULL moduleId + NULL lessonId.

### Pattern 2: Hierarchical Tree with Checkbox State
**What:** A 3-level tree (Course > Module > Lesson) where checking a parent auto-checks all children, and unchecking all children auto-unchecks the parent.
**When to use:** Permission builder UI for course access grants.

The tree state logic:
- **Course checked (all children):** Insert a single `roleCourses` row with only `courseId` set (moduleId=null, lessonId=null). This means "full course access."
- **Module checked (all lessons):** Insert `roleCourses` row with `courseId` + `moduleId` (lessonId=null).
- **Lesson checked individually:** Insert `roleCourses` row with `courseId` + `moduleId` + `lessonId`.
- **"Select All" on course:** Delete all granular rows for that course, insert single course-level row.
- **Uncheck course:** Delete all rows matching that roleId + courseId (regardless of module/lesson granularity).

```typescript
// Tree state derivation from DB rows
type PermissionGrant = {
  courseId: string;
  moduleId: string | null;
  lessonId: string | null;
};

function deriveTreeState(
  grants: PermissionGrant[],
  courseTree: CourseTree[]
): Map<string, "checked" | "indeterminate" | "unchecked"> {
  const state = new Map<string, "checked" | "indeterminate" | "unchecked">();

  for (const course of courseTree) {
    const courseGrants = grants.filter(g => g.courseId === course.id);

    // Full course access?
    if (courseGrants.some(g => g.moduleId === null && g.lessonId === null)) {
      state.set(course.id, "checked");
      // All modules and lessons are implicitly checked
      for (const mod of course.modules) {
        state.set(mod.id, "checked");
        for (const lesson of mod.lessons) {
          state.set(lesson.id, "checked");
        }
      }
      continue;
    }

    // Check each module
    let allModulesChecked = true;
    let anyModuleChecked = false;

    for (const mod of course.modules) {
      const moduleGrants = courseGrants.filter(g => g.moduleId === mod.id);

      // Full module access?
      if (moduleGrants.some(g => g.lessonId === null)) {
        state.set(mod.id, "checked");
        for (const lesson of mod.lessons) {
          state.set(lesson.id, "checked");
        }
        anyModuleChecked = true;
        continue;
      }

      // Check individual lessons
      const grantedLessonIds = new Set(moduleGrants.map(g => g.lessonId));
      let allLessonsChecked = true;
      let anyLessonChecked = false;

      for (const lesson of mod.lessons) {
        if (grantedLessonIds.has(lesson.id)) {
          state.set(lesson.id, "checked");
          anyLessonChecked = true;
        } else {
          state.set(lesson.id, "unchecked");
          allLessonsChecked = false;
        }
      }

      if (allLessonsChecked && mod.lessons.length > 0) {
        state.set(mod.id, "checked");
        anyModuleChecked = true;
      } else if (anyLessonChecked) {
        state.set(mod.id, "indeterminate");
        anyModuleChecked = true;
        allModulesChecked = false;
      } else {
        state.set(mod.id, "unchecked");
        allModulesChecked = false;
      }
    }

    if (allModulesChecked && course.modules.length > 0) {
      state.set(course.id, "checked");
    } else if (anyModuleChecked) {
      state.set(course.id, "indeterminate");
    } else {
      state.set(course.id, "unchecked");
    }
  }

  return state;
}
```

### Pattern 3: Auto-Save with Debounced API Calls
**What:** Each checkbox/toggle change triggers an optimistic UI update immediately, then fires a debounced API call. A loading spinner shows during the API call. A toast confirms success or shows an error.
**When to use:** All permission toggles (PERM-07).

```typescript
// Auto-save pattern using useDebouncedCallback
"use client";
import { useDebouncedCallback } from "use-debounce";
import { toast } from "sonner";

function usePermissionSave(roleId: string) {
  const [saving, setSaving] = useState(false);

  const saveCoursePermission = useDebouncedCallback(
    async (courseId: string, moduleId: string | null, lessonId: string | null, granted: boolean) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/admin/roles/${roleId}/courses`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId, moduleId, lessonId, granted }),
        });
        if (!res.ok) throw new Error("Save failed");
        toast.success("Permissions updated");
      } catch {
        toast.error("Failed to save permission");
        // Caller should revert optimistic state
      } finally {
        setSaving(false);
      }
    },
    300 // 300ms debounce
  );

  return { saveCoursePermission, saving };
}
```

### Pattern 4: "Select All" Bulk Toggle
**What:** Clicking "Select All" on a course checks all modules and lessons. Clicking it again deselects everything. This fires a single API call that replaces all granular grants with one course-level grant (or deletes all grants).
**When to use:** PERM-06: Quick grant/revoke all access for a course or module.

```typescript
// API endpoint for "Select All" on a course
// PUT /api/admin/roles/[roleId]/courses
// Body: { courseId, moduleId: null, lessonId: null, granted: true }
// Server logic:
//   1. Delete all existing roleCourses rows for this roleId + courseId
//   2. If granted=true, insert single row with moduleId=null, lessonId=null
//   This replaces granular grants with a course-level wildcard.
```

### Pattern 5: Role Detail Page (New Route)
**What:** A new page at `/admin/roles/[roleId]` that loads the role details, the full course tree, and the role's current permissions. Displays the role header (name, badge, description) followed by two tabbed sections: Course Permissions and Feature Permissions.
**When to use:** When coach clicks on a role row in the roles list page.

The roles list page already has click handlers for edit -- this phase extends navigation so clicking a role row navigates to `/admin/roles/{roleId}` for the full detail/permission builder view.

### Anti-Patterns to Avoid
- **Loading the full course tree in a single API call without pagination:** For small LMS instances (<20 courses, <200 lessons) this is fine. For larger instances, consider lazy-loading modules on expand. The current codebase has ~5-15 courses, so eager loading is appropriate.
- **Saving the entire permission tree on every change:** Instead, save only the changed item. The API should accept a single permission grant/revoke, not a full tree replacement. This prevents race conditions and makes optimistic updates simple.
- **Using react-hook-form for the tree:** The tree is not a form -- it is a collection of independent toggles. Each toggle is an independent mutation. Do NOT wrap the tree in a form element or use react-hook-form.
- **Building a custom Checkbox:** Decision 5 explicitly allows the shadcn/ui Checkbox component. Install it via CLI.
- **Conflating the "allCourses" flag with the permission tree:** The `roles.allCourses` boolean is a wildcard that grants ALL courses. When `allCourses=true`, the course tree should show all checkboxes as checked and disabled (indicating they are granted by the wildcard, not individually). The permission tree only manages individual grants when `allCourses=false`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Checkbox with indeterminate state | Custom checkbox element | shadcn/ui Checkbox with `data-state="indeterminate"` | Radix UI Checkbox natively supports checked/unchecked/indeterminate. Decision 5 allows it. |
| Expand/collapse tree nodes | Custom accordion or visibility toggle | Radix Collapsible (already installed as `src/components/ui/collapsible.tsx`) | Already in the codebase, handles animation and accessibility. |
| Feature toggle switches | Custom toggle buttons | Switch component (already at `src/components/ui/switch.tsx`) | Already installed and used in the codebase. |
| Debounced auto-save | Custom setTimeout/clearTimeout | `useDebouncedCallback` from `use-debounce` | Already used in 4+ hooks (SearchBar, useWatchProgress, useCharacterPopup). |
| Toast notifications | Custom notification system | `sonner` via `toast.success()` / `toast.error()` | Already used in 20+ components. |
| Optimistic updates | Loading state blocking UI | Pattern from `StudentCourseAccess.tsx` | Same optimistic toggle + revert-on-error pattern at `src/components/admin/StudentCourseAccess.tsx` lines 49-79. |

**Key insight:** The Permission Builder UI is essentially a tree of independent toggles with auto-save. Each toggle is a tiny API call. The complexity is in the tree state derivation (checked/indeterminate/unchecked) and the schema evolution, not the UI components themselves.

## Common Pitfalls

### Pitfall 1: PostgreSQL NULL Uniqueness in Composite Index
**What goes wrong:** The unique index on `(roleId, courseId, moduleId, lessonId)` does not prevent duplicate rows when `moduleId` and `lessonId` are NULL, because PostgreSQL treats each NULL as distinct in unique indexes.
**Why it happens:** SQL standard says NULL != NULL. Two rows with `(role1, course1, NULL, NULL)` are NOT considered duplicates by a regular unique index.
**How to avoid:** Use application-level dedup: before inserting, run a `DELETE` for the exact match (using `IS NULL` for null columns), then `INSERT`. Alternatively, use a partial unique index with `COALESCE`:
```sql
CREATE UNIQUE INDEX role_courses_unique ON role_courses (
  role_id, course_id,
  COALESCE(module_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(lesson_id, '00000000-0000-0000-0000-000000000000')
);
```
**Recommendation:** Use the `COALESCE` approach in the migration since it guarantees uniqueness at the database level without relying on application code.
**Warning signs:** Duplicate permission rows appearing in the database. Tree showing inconsistent state.

### Pitfall 2: Cascading Checkbox State Does Not Match DB Grants
**What goes wrong:** UI shows a course as "checked" (all children selected) but the DB has individual module/lesson grants instead of a single course-level grant. Or vice versa: DB has a course-level grant but UI shows individual checkboxes checked without the parent being fully checked.
**Why it happens:** Mismatch between the "meaning" of a course-level grant (single row with null moduleId/lessonId = all access) and the UI rendering (all children checked).
**How to avoid:** Always derive tree state from DB grants, never from UI state alone. The `deriveTreeState` function (Pattern 2) handles this correctly. When toggling a course on, collapse all granular grants into one course-level row. When toggling a course off, delete ALL rows for that course.
**Warning signs:** Tree state flickers or shows inconsistent checked/indeterminate states after save.

### Pitfall 3: Permission Resolver Not Updated for Granular Grants
**What goes wrong:** The existing `resolvePermissions()` in `src/lib/permissions.ts` only queries `roleCourses.courseId` (line 87-91). It does NOT check `moduleId` or `lessonId`. After adding granular grants, `canAccessCourse()` returns false for a course where the role only grants specific modules.
**Why it happens:** The resolver was built for course-level-only grants. Module/lesson grants are a new concept.
**How to avoid:** Update the resolver to handle three grant levels:
1. Course-level grant (moduleId=null): grants the entire course.
2. Module-level grant (moduleId set, lessonId=null): grants that module.
3. Lesson-level grant (lessonId set): grants that lesson.
`canAccessCourse()` should return true if ANY grant exists for that course (regardless of granularity). `canAccessModule()` should return true if either a course-level grant or a matching module-level grant exists. `canAccessLesson()` should return true if a course-level, matching module-level, or matching lesson-level grant exists.
**Warning signs:** Students with module-level grants cannot see the course at all.

### Pitfall 4: Race Conditions with Rapid Toggle Clicks
**What goes wrong:** Coach rapidly toggles checkboxes. Multiple API calls fire in overlapping order. A "grant" arrives after a "revoke", or vice versa, leaving the DB in an inconsistent state.
**Why it happens:** Even with debounce, if the user toggles fast enough, the debounced function can fire for intermediate states.
**How to avoid:** Two approaches:
1. **Approach A (simpler):** Use `useDebouncedCallback` with `{ leading: false, trailing: true }` (default). This ensures only the final state is sent. If the user toggles on-off-on within 300ms, only the final "on" is sent.
2. **Approach B (robust):** Queue mutations and send them sequentially. Each mutation waits for the previous one to complete. This is more complex but prevents out-of-order execution.
**Recommendation:** Approach A is sufficient for this use case. The 300ms debounce captures the final state.
**Warning signs:** Permission state in DB does not match what the UI shows after rapid toggling.

### Pitfall 5: Missing Course Tree Data Endpoint
**What goes wrong:** The permission builder needs the full course > module > lesson hierarchy to render the tree. The existing `/api/admin/courses` endpoint only returns courses with module counts, NOT nested modules and lessons. The `/api/admin/courses/[courseId]` endpoint returns nested data but only for a single course.
**Why it happens:** No existing endpoint returns the full hierarchical tree across all courses.
**How to avoid:** Create a new endpoint or extend the existing one. Options:
1. **New endpoint:** `GET /api/admin/roles/[roleId]/tree` that returns all courses with nested modules and lessons, PLUS the role's current grants. Single fetch for the whole builder.
2. **Reuse + extend:** Fetch `/api/admin/courses` for the list, then lazy-load modules/lessons per course on expand.
**Recommendation:** Option 1 (single endpoint). With <20 courses and <200 lessons, the payload is small. This avoids waterfall fetches and simplifies the UI.
**Warning signs:** N+1 fetch problem where expanding each course triggers a separate API call.

### Pitfall 6: The `allCourses` Flag Conflict
**What goes wrong:** A role has `allCourses=true`. Coach opens the permission builder and sees all courses checked. Coach unchecks one course. Now what? Does `allCourses` stay true? Is the course excluded? The current schema has no exclusion mechanism.
**Why it happens:** `allCourses` is a wildcard boolean on the `roles` table. It conflicts with granular course grants.
**How to avoid:** When `allCourses=true`, the course tree should be shown as all-checked and disabled with a banner: "This role grants access to all courses. Disable 'All Courses' to manage individual course access." Provide a toggle for `allCourses` at the top of the permission tree. When toggled off, the existing `roleCourses` rows become the source of truth.
**Warning signs:** Coach unchecks a course but student still has access because `allCourses=true` overrides.

## Code Examples

### Example 1: Fetching Course Tree with Role Grants

```typescript
// GET /api/admin/roles/[roleId] -- extend to include full tree + grants
// Server-side data fetching for the permission builder page

import { db } from "@/db";
import { courses, modules, lessons, roleCourses, roleFeatures, roles } from "@/db/schema";
import { eq, and, isNull, asc, inArray } from "drizzle-orm";

async function getRoleWithPermissions(roleId: string) {
  // 1. Get role
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)));

  if (!role) return null;

  // 2. Three parallel queries
  const [courseList, courseGrants, featureGrants] = await Promise.all([
    // Full course tree (all non-deleted courses with modules and lessons)
    db.select().from(courses).where(isNull(courses.deletedAt)).orderBy(asc(courses.sortOrder)),
    // Role's course permission grants
    db.select().from(roleCourses).where(eq(roleCourses.roleId, roleId)),
    // Role's feature grants
    db.select({ featureKey: roleFeatures.featureKey }).from(roleFeatures).where(eq(roleFeatures.roleId, roleId)),
  ]);

  // 3. Get all modules and lessons for the course tree
  const courseIds = courseList.map(c => c.id);
  const [moduleList, lessonList] = await Promise.all([
    courseIds.length > 0
      ? db.select().from(modules)
          .where(and(isNull(modules.deletedAt), inArray(modules.courseId, courseIds)))
          .orderBy(asc(modules.sortOrder))
      : [],
    courseIds.length > 0
      ? db.select().from(lessons)
          .where(isNull(lessons.deletedAt))
          .orderBy(asc(lessons.sortOrder))
      : [],
  ]);

  // 4. Build nested tree
  const tree = courseList.map(course => ({
    ...course,
    modules: moduleList
      .filter(m => m.courseId === course.id)
      .map(mod => ({
        ...mod,
        lessons: lessonList.filter(l => l.moduleId === mod.id),
      })),
  }));

  return {
    role,
    courseTree: tree,
    courseGrants,
    featureGrants: featureGrants.map(f => f.featureKey),
  };
}
```

### Example 2: Permission Tree Component Structure

```tsx
// src/components/admin/PermissionTree.tsx
"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, ChevronDown, Loader2 } from "lucide-react";

interface CourseNode {
  id: string;
  title: string;
  modules: ModuleNode[];
}
interface ModuleNode {
  id: string;
  title: string;
  lessons: LessonNode[];
}
interface LessonNode {
  id: string;
  title: string;
}

type CheckState = "checked" | "indeterminate" | "unchecked";

interface PermissionTreeProps {
  courseTree: CourseNode[];
  checkStates: Map<string, CheckState>;
  onToggleCourse: (courseId: string, checked: boolean) => void;
  onToggleModule: (courseId: string, moduleId: string, checked: boolean) => void;
  onToggleLesson: (courseId: string, moduleId: string, lessonId: string, checked: boolean) => void;
  saving: boolean;
  disabled?: boolean; // true when allCourses=true
}
```

### Example 3: Feature Permissions Component

```tsx
// src/components/admin/FeaturePermissions.tsx
"use client";
import { Switch } from "@/components/ui/switch";
import { FEATURE_KEYS } from "@/lib/permissions";

const FEATURE_LABELS: Record<string, { label: string; description: string }> = {
  ai_conversation: { label: "AI Conversation Bot", description: "Voice practice with AI tutor" },
  practice_sets: { label: "Practice Sets", description: "Interactive exercises and quizzes" },
  dictionary_reader: { label: "Dictionary", description: "Built-in Chinese dictionary" },
  listening_lab: { label: "YouTube Listening Lab", description: "YouTube-based listening practice" },
  video_threads: { label: "Video Threads", description: "Video response activities" },
  certificates: { label: "Certificates", description: "Course completion certificates" },
  ai_chat: { label: "AI Chat", description: "Text-based AI conversation" },
};

interface FeaturePermissionsProps {
  enabledFeatures: Set<string>;
  onToggle: (featureKey: string, enabled: boolean) => void;
  saving: boolean;
}
```

### Example 4: Auto-Save Course Permission API

```typescript
// PUT /api/admin/roles/[roleId]/courses/route.ts
import { z } from "zod";

const coursePermissionSchema = z.object({
  courseId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  lessonId: z.string().uuid().nullable(),
  granted: z.boolean(),
});

// Handler:
// If granted=true: upsert the permission row
// If granted=false: delete the matching permission row
// If courseId with null module/lesson: this is "Select All" for the course
//   - Delete all granular rows for this roleId + courseId first
//   - If granted, insert single course-level row
```

### Example 5: Feature Permission API

```typescript
// PUT /api/admin/roles/[roleId]/features/route.ts
import { z } from "zod";
import { featureKeySchema } from "@/lib/permissions";

const featurePermissionSchema = z.object({
  featureKey: featureKeySchema,
  enabled: z.boolean(),
});

// Handler:
// If enabled=true: INSERT INTO role_features (roleId, featureKey) ON CONFLICT DO NOTHING
// If enabled=false: DELETE FROM role_features WHERE roleId AND featureKey
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Course-level-only access grants | Granular module/lesson grants via nullable FK columns | Phase 64 (new) | Enables fine-grained content access control. Requires schema migration and resolver update. |
| Separate "Save" button for forms | Auto-save with debounce for toggle-based UIs | Current codebase practice (StudentCourseAccess) | Better UX for many-toggle interfaces. Eliminates "forgot to save" problem. |
| Window.confirm() for destructive actions | Styled Dialog confirmations | Phase 63+ | Consistent dark-themed UI, better accessibility. |

**Deprecated/outdated:**
- The original RBAC research (v9.0-RBAC-SUMMARY.md) explicitly rejected per-lesson/module overrides. Phase 64 requirements override that decision. The resolver must be updated to handle the new granularity.

## Open Questions

1. **Updating the Permission Resolver for Granular Grants**
   - What we know: The resolver at `src/lib/permissions.ts` currently only queries `roleCourses.courseId`. It needs to handle `moduleId` and `lessonId` grants.
   - What's unclear: Should `canAccessCourse()` return true when only a single lesson within that course is granted? This matters for course list display.
   - Recommendation: Yes -- if ANY content within a course is granted (even a single lesson), `canAccessCourse()` should return true. This allows the student to see the course in their list and navigate to the granted content. The UI can then show locked/unlocked states per module/lesson within the course.

2. **"All Courses" Toggle Placement**
   - What we know: The `roles` table has an `allCourses` boolean that grants wildcard access. The permission tree needs to interact with this flag.
   - What's unclear: Should the "All Courses" toggle be on the role edit form (from Phase 63) or on the permission builder page?
   - Recommendation: Place it at the top of the permission tree section as a prominent toggle with explanation text. When enabled, the course tree is shown grayed out with a "Granted via All Courses" label. This keeps all permission configuration in one place.

3. **Navigation from Roles List to Permission Builder**
   - What we know: The roles list at `/admin/roles` currently only has Edit (opens dialog) and Delete buttons.
   - What's unclear: How should the coach navigate to the permission builder? Click the role row? A dedicated "Configure Permissions" button?
   - Recommendation: Make the role name/row clickable, navigating to `/admin/roles/[roleId]`. This detail page shows role info at the top (editable) and the permission builder below. Add a "Configure" or "Permissions" button on each role row as well for clarity.

## Sources

### Primary (HIGH confidence)
- **Existing codebase files (verified by reading):**
  - `src/db/schema/roles.ts` -- Current roleCourses schema (courseId only, no moduleId/lessonId). Lines 37-50.
  - `src/db/schema/courses.ts` -- Course/Module/Lesson hierarchy with sortOrder, deletedAt soft-delete. Lines 13-93.
  - `src/lib/permissions.ts` -- Permission resolver with FEATURE_KEYS, PermissionSet, cache() wrapping. Lines 1-209.
  - `src/lib/roles.ts` -- Role CRUD service (getRoles, createRole, updateRole, softDeleteRole). Lines 1-139.
  - `src/app/api/admin/roles/[roleId]/route.ts` -- Existing GET/PATCH/DELETE endpoints for single role. Lines 1-130.
  - `src/app/api/admin/courses/[courseId]/route.ts` -- Pattern for fetching course with nested modules/lessons. Lines 1-71.
  - `src/components/admin/StudentCourseAccess.tsx` -- Optimistic toggle + revert-on-error pattern. Lines 49-79.
  - `src/components/ui/collapsible.tsx` -- Radix Collapsible (already installed). Lines 1-33.
  - `src/components/ui/switch.tsx` -- Radix Switch (already installed). Lines 1-35.
  - `src/hooks/useWatchProgress.ts` -- useDebouncedCallback pattern from use-debounce. Lines 51-60.
  - `package.json` -- All dependency versions verified.

- **Phase 62 verification:** All 4 RBAC tables exist, resolver works, React cache() applied.
- **Phase 63 artifacts:** Role CRUD service, API routes, admin page, RoleForm, Badge component all confirmed working.

- **RBAC Architecture docs:**
  - `.planning/research/v9.0-RBAC-SUMMARY.md` -- Overall RBAC decisions, feature keys, architecture approach.
  - `.planning/research/v9.0-RBAC-ARCHITECTURE.md` -- Permission resolver design, access control flow.

### Secondary (MEDIUM confidence)
- PostgreSQL NULL handling in unique indexes is well-documented PostgreSQL behavior. COALESCE approach is standard workaround.
- Radix UI Checkbox supports `checked` prop accepting `boolean | "indeterminate"` -- this is documented in the Radix Checkbox primitive API.

### Tertiary (LOW confidence)
- None. All findings verified against existing codebase and established PostgreSQL behavior.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, patterns verified in codebase, only Checkbox needs installation via CLI
- Architecture: HIGH -- tree state derivation is pure logic, API patterns follow existing codebase exactly, schema evolution uses standard Drizzle migrations
- Pitfalls: HIGH -- NULL uniqueness is well-documented PostgreSQL behavior; race condition mitigation follows existing use-debounce patterns; resolver update logic is straightforward

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- Drizzle ORM, Radix UI, and tree state patterns change infrequently)
