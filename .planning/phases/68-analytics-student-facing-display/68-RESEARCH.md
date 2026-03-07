# Phase 68: Analytics & Student-Facing Display - Research

**Researched:** 2026-02-15
**Domain:** RBAC analytics dashboard, expiration warnings, role stacking visualization, access attribution, student-facing role display
**Confidence:** HIGH

## Summary

Phase 68 is the final phase of v9.0 RBAC. It builds analytics and visualization on top of the fully operational RBAC infrastructure (Phases 62-67). The phase has two distinct audiences: (1) admin/coach views showing role usage analytics (student counts, expiration warnings, stacking patterns, access attribution), and (2) a student-facing view showing the student their own assigned roles and what each role grants.

The codebase already has all the data primitives needed. The `roles`, `roleCourses`, `roleFeatures`, and `userRoles` tables (in `src/db/schema/roles.ts`) contain every relationship needed for analytics. The `resolvePermissions()` function (in `src/lib/permissions.ts`) already computes the effective permission set. The `getRoles()` function (in `src/lib/roles.ts`) already returns student counts per role. Existing admin analytics patterns (`src/app/api/admin/analytics/*` and `src/app/(dashboard)/admin/analytics/`) demonstrate the established approach: server-side API routes with parallel Promise.all queries, client-side dashboard components with loading skeletons.

No new npm packages are needed. All six requirements (ANALYTICS-01 through ANALYTICS-06) can be implemented using Drizzle ORM queries, existing UI component patterns (Badge, Skeleton, card layout), and the existing permission infrastructure. The main implementation work is: (1) new API endpoints for role analytics data, (2) a new admin analytics section or page for role-specific analytics, (3) access attribution queries that trace which role grants which course/feature, and (4) a new section on the student settings page showing their roles.

**Primary recommendation:** Build two new API routes (role analytics summary + student access attribution), extend the existing admin roles page or create a new role analytics tab, and add a roles section to the student settings page. No new pages are needed for admin -- the existing roles list page already shows student counts (ANALYTICS-01), so the remaining admin requirements (expiration warnings, stacking, attribution) can be added as a new admin page at `/admin/roles/analytics` or integrated into existing pages.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 (installed) | All analytics queries against roles/userRoles/roleCourses/roleFeatures tables | Already used for every DB query in the project |
| react | 19.2.3 (installed) | cache() for permission resolver dedup; React Server Components for server-side data fetching | Already the foundation of the entire app |
| zod | 4.3.6 (installed) | API parameter validation | Already used throughout API layer |
| date-fns | (installed) | Date formatting for expiration dates, "X days until expiry" | Already used in roles page and student assignment components |
| lucide-react | (installed) | Icons for analytics cards and role badges | Already used throughout the admin UI |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | (installed) | Toast notifications | When user interactions need feedback |
| @/components/ui/badge | (installed) | Role color badges | Display role names with colors |
| @/components/ui/skeleton | (installed) | Loading states for analytics cards | During data fetching |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom card components | Recharts/chart library | Charts are overkill for tabular role analytics; simple cards and tables match existing analytics dashboard pattern |
| New dedicated analytics page | Tabs on existing roles page | Separate page is cleaner -- roles page is already feature-complete with CRUD; analytics is a different concern |
| Server Components for all views | Client components with fetch() | Student-facing roles section can be a Server Component (read-only data); admin analytics should match the existing client-side fetch pattern for consistency with AnalyticsDashboard |

**Installation:**
```bash
# No packages to install. Everything is already in package.json.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── api/admin/
│   │   └── roles/
│   │       └── analytics/
│   │           └── route.ts            # NEW: Role analytics API (student counts, expirations, stacking)
│   ├── (dashboard)/admin/
│   │   └── roles/
│   │       └── analytics/
│   │           └── page.tsx            # NEW: Role analytics dashboard page
│   └── (dashboard)/settings/
│       └── page.tsx                    # MODIFY: Add roles section
├── components/
│   ├── admin/
│   │   └── RoleAnalytics*.tsx          # NEW: Role analytics UI components
│   └── settings/
│       └── MyRolesSection.tsx          # NEW: Student-facing roles display
└── lib/
    └── role-analytics.ts              # NEW: Analytics query functions
```

### Pattern 1: Parallel Analytics Queries
**What:** Execute all analytics queries in a single Promise.all call, matching the existing analytics dashboard pattern.
**When to use:** For the role analytics API endpoint that needs student counts, expiration data, and stacking data simultaneously.
**Source:** Existing pattern at `src/app/api/admin/analytics/overview/route.ts` lines 76-82

```typescript
// Source: Existing pattern from src/app/api/admin/analytics/overview/route.ts
const [rolesSummary, expiring7d, expiring30d, multiRoleStudents] = await Promise.all([
  getRolesSummary(),
  getExpiringAssignments(7),
  getExpiringAssignments(30),
  getMultiRoleStudents(),
]);
```

### Pattern 2: Expiration Warning Query
**What:** Query userRoles JOIN roles JOIN users to find assignments expiring within N days.
**When to use:** For ANALYTICS-02 (7-day) and ANALYTICS-03 (30-day) expiration warnings.
**Source:** Schema analysis of `src/db/schema/roles.ts` -- `userRoles.expiresAt` is the key column

```typescript
// Source: Schema from src/db/schema/roles.ts lines 68-83
import { userRoles, roles, users } from "@/db/schema";
import { and, isNull, gt, lt, isNotNull } from "drizzle-orm";

async function getExpiringAssignments(withinDays: number) {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  return db
    .select({
      userId: userRoles.userId,
      userName: users.name,
      userEmail: users.email,
      roleName: roles.name,
      roleColor: roles.color,
      expiresAt: userRoles.expiresAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        isNull(roles.deletedAt),
        isNotNull(userRoles.expiresAt),
        gt(userRoles.expiresAt, now),       // not yet expired
        lt(userRoles.expiresAt, cutoff),     // expires within N days
      )
    )
    .orderBy(asc(userRoles.expiresAt));
}
```

### Pattern 3: Multi-Role Student Detection (Role Stacking)
**What:** Query students who have more than one active role, with their role list. Uses GROUP BY + HAVING COUNT > 1.
**When to use:** For ANALYTICS-04 (coach sees which students have multiple roles).
**Source:** Drizzle ORM groupBy pattern

```typescript
// Find students with multiple active roles
async function getMultiRoleStudents() {
  const now = new Date();

  // Step 1: Find userIds with count > 1
  const multiRoleUsers = await db
    .select({
      userId: userRoles.userId,
      roleCount: sql<number>`COUNT(*)`.as("role_count"),
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    )
    .groupBy(userRoles.userId)
    .having(sql`COUNT(*) > 1`);

  if (multiRoleUsers.length === 0) return [];

  // Step 2: For each student, get their role details
  const userIds = multiRoleUsers.map((u) => u.userId);
  const assignments = await db
    .select({
      userId: userRoles.userId,
      userName: users.name,
      userEmail: users.email,
      roleName: roles.name,
      roleColor: roles.color,
      expiresAt: userRoles.expiresAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        inArray(userRoles.userId, userIds),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    );

  // Group by user
  const grouped = new Map<string, { name: string | null; email: string; roles: Array<{ name: string; color: string; expiresAt: Date | null }> }>();
  for (const row of assignments) {
    if (!grouped.has(row.userId)) {
      grouped.set(row.userId, { name: row.userName, email: row.userEmail, roles: [] });
    }
    grouped.get(row.userId)!.roles.push({
      name: row.roleName,
      color: row.roleColor,
      expiresAt: row.expiresAt,
    });
  }

  return Array.from(grouped.entries()).map(([userId, data]) => ({
    userId,
    name: data.name,
    email: data.email,
    roles: data.roles,
    roleCount: data.roles.length,
  }));
}
```

### Pattern 4: Access Attribution (Which Role Grants What)
**What:** For a specific student, show the breakdown of what each role grants (courses and features), so the coach can see _why_ a student has access to something.
**When to use:** For ANALYTICS-05 (access attribution per student).
**Source:** Schema from `src/db/schema/roles.ts` -- roleCourses and roleFeatures tables

```typescript
// Source: Combines queries from src/lib/permissions.ts and src/lib/user-roles.ts
async function getAccessAttribution(userId: string) {
  const now = new Date();

  // Get active role assignments
  const assignments = await db
    .select({
      roleId: userRoles.roleId,
      roleName: roles.name,
      roleColor: roles.color,
      allCourses: roles.allCourses,
      expiresAt: userRoles.expiresAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    );

  const roleIds = assignments.map((a) => a.roleId);
  if (roleIds.length === 0) return { roles: [], directAccess: [] };

  // Get course and feature grants per role
  const [courseGrants, featureGrants] = await Promise.all([
    db.select({
      roleId: roleCourses.roleId,
      courseId: roleCourses.courseId,
      courseTitle: courses.title,
      moduleId: roleCourses.moduleId,
      lessonId: roleCourses.lessonId,
      accessTier: roleCourses.accessTier,
    })
    .from(roleCourses)
    .innerJoin(courses, eq(roleCourses.courseId, courses.id))
    .where(inArray(roleCourses.roleId, roleIds)),

    db.select({
      roleId: roleFeatures.roleId,
      featureKey: roleFeatures.featureKey,
    })
    .from(roleFeatures)
    .where(inArray(roleFeatures.roleId, roleIds)),
  ]);

  // Group by role
  return assignments.map((assignment) => ({
    roleId: assignment.roleId,
    roleName: assignment.roleName,
    roleColor: assignment.roleColor,
    allCourses: assignment.allCourses,
    expiresAt: assignment.expiresAt,
    courses: courseGrants
      .filter((g) => g.roleId === assignment.roleId)
      .map((g) => ({
        courseId: g.courseId,
        courseTitle: g.courseTitle,
        moduleId: g.moduleId,
        lessonId: g.lessonId,
        accessTier: g.accessTier,
      })),
    features: featureGrants
      .filter((g) => g.roleId === assignment.roleId)
      .map((g) => g.featureKey),
  }));
}
```

### Pattern 5: Student-Facing Roles Display
**What:** A read-only section showing the current student their assigned roles, expiration dates, and what each role grants. Uses the same data shape as access attribution but fetched via a student-accessible API or Server Component.
**When to use:** For ANALYTICS-06 (student profile shows assigned roles).
**Source:** Settings page pattern at `src/app/(dashboard)/settings/page.tsx` -- server-side data fetch then pass to client component

```typescript
// Server Component approach (matches settings page pattern):
// In settings/page.tsx, fetch the current user's roles and pass to MyRolesSection

import { getCurrentUser } from "@/lib/auth";
import { getAccessAttribution } from "@/lib/role-analytics";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const roleAttribution = await getAccessAttribution(user.id);

  return (
    <div>
      {/* existing settings sections */}
      <MyRolesSection roles={roleAttribution} />
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Calling resolvePermissions() for analytics:** The resolver is designed for access checks (returns Sets/Maps for O(1) lookups). Analytics queries need relational data (which role grants which course) that the resolver intentionally flattens. Use direct Drizzle queries against the roles tables instead.
- **Adding analytics queries to the existing permission resolver:** The resolver is cache()-wrapped and optimized for per-request dedup. Adding analytics data to it would bloat every page load. Keep analytics as separate query functions.
- **Exposing admin analytics API to students:** The student-facing view (ANALYTICS-06) should use a separate API endpoint or Server Component that only returns the current user's own roles, NOT the admin analytics endpoint.
- **Building real-time dashboards with WebSocket:** The data changes infrequently (role assignments are manual). Simple fetch-on-load is sufficient. Matches the existing analytics dashboard pattern.
- **Using client-side filtering for large student lists:** The admin analytics for expiration warnings and multi-role students should be server-side queries, not client-side filtering of all students.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date difference display ("expires in 3 days") | Custom date math | `date-fns` `formatDistanceToNow()` or `differenceInDays()` | Already imported in roles page; handles edge cases (negative days, timezone) |
| Loading skeleton states | Custom shimmer animation | `@/components/ui/skeleton` | Already used in OverviewCards and throughout admin |
| Role color badges | Custom styled spans | `@/components/ui/badge` with inline style | Already used in roles page and StudentRoleAssignment |
| Parallel query execution | Sequential awaits | `Promise.all()` | Already the standard pattern in all analytics routes |
| Access check for admin pages | Custom role checking | `hasMinimumRole("coach")` or `hasMinimumRole("admin")` | Already used in every admin page and API route |

**Key insight:** Every building block for Phase 68 already exists in the codebase. The analytics queries are straightforward JOINs on tables that already have proper indexes (`user_roles_user_id_idx`, `user_roles_role_id_idx`, `role_courses_role_id_idx`, `role_features_role_id_idx`). The UI patterns (cards, tables, badges, loading states) are all established. This phase is assembly, not invention.

## Common Pitfalls

### Pitfall 1: Counting Expired Assignments in Student Counts
**What goes wrong:** ANALYTICS-01 shows inflated student counts because expired role assignments are counted.
**Why it happens:** The existing `getRoles()` function in `src/lib/roles.ts` counts ALL `userRoles` rows, including expired ones (see lines 25-31 -- no expiration filter).
**How to avoid:** Either fix `getRoles()` to filter out expired assignments, or create a separate analytics query that filters `WHERE expires_at IS NULL OR expires_at > NOW()`. The latter is safer to avoid breaking existing behavior.
**Warning signs:** Student count in analytics is higher than the actual number of students with active access.

### Pitfall 2: Deleted Roles Appearing in Analytics
**What goes wrong:** Soft-deleted roles (with `deletedAt` set) appear in the analytics dashboard.
**Why it happens:** Forgetting to filter `WHERE deleted_at IS NULL` on the roles table in analytics queries.
**How to avoid:** Always include `isNull(roles.deletedAt)` in every analytics query that joins the roles table. This is already the pattern in `getRoles()` at `src/lib/roles.ts` line 11.
**Warning signs:** Analytics show roles with `_deleted_` suffix in the name.

### Pitfall 3: Student-Facing Data Leaking Admin Information
**What goes wrong:** The student-facing roles section (ANALYTICS-06) exposes admin-only data like which coach assigned the role, or how many other students have the same role.
**Why it happens:** Reusing the admin API endpoint for the student view without filtering the response.
**How to avoid:** Create a separate student-facing endpoint or Server Component that only returns: role name, color, description, expiration date, and granted courses/features. Never expose `assignedBy`, student counts, or other students' data.
**Warning signs:** Students can see coach names or other students' information.

### Pitfall 4: N+1 Query Problem in Access Attribution
**What goes wrong:** For each student in the multi-role list, a separate query fetches their role details. With 100 multi-role students, this is 100 extra queries.
**Why it happens:** Naive loop-per-student approach instead of batch query.
**How to avoid:** Use `inArray()` to batch-fetch all role assignments for all multi-role students in a single query, then group client-side. This is shown in Pattern 3 above.
**Warning signs:** Analytics page takes 10+ seconds to load when there are many students.

### Pitfall 5: Expiration Warning Showing Already-Expired Roles
**What goes wrong:** The "expiring in 7 days" list includes roles that have already expired (expiresAt in the past).
**Why it happens:** Only filtering `lt(expiresAt, cutoff)` without also filtering `gt(expiresAt, now)`.
**How to avoid:** Always use both bounds: `gt(expiresAt, now) AND lt(expiresAt, cutoff)`. This ensures only future-expiring roles are shown.
**Warning signs:** Expired roles appear in the expiration warning list with negative days remaining.

## Code Examples

Verified patterns from existing codebase:

### Role Summary Query (ANALYTICS-01 baseline already exists)
```typescript
// Source: src/lib/roles.ts lines 8-41
// getRoles() already returns studentCount per role.
// For ANALYTICS-01, this existing function can be reused directly.
// But note: it counts ALL assignments, not just active (non-expired) ones.
// For accurate analytics, add expiration filtering:

async function getRolesWithActiveStudentCounts() {
  const now = new Date();

  const allRoles = await db
    .select()
    .from(roles)
    .where(isNull(roles.deletedAt))
    .orderBy(asc(roles.sortOrder), asc(roles.name));

  // Count only active (non-expired) assignments
  const studentCounts = await db
    .select({
      roleId: userRoles.roleId,
      count: count(),
    })
    .from(userRoles)
    .where(or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now)))
    .groupBy(userRoles.roleId);

  const countMap = new Map(studentCounts.map((sc) => [sc.roleId, sc.count]));

  return allRoles.map((role) => ({
    ...role,
    activeStudentCount: countMap.get(role.id) ?? 0,
  }));
}
```

### Feature Key Display Labels
```typescript
// Source: src/lib/permissions.ts lines 20-28
// FEATURE_KEYS defines the valid feature keys.
// For display, map technical keys to human-readable labels:

const FEATURE_LABELS: Record<string, string> = {
  ai_conversation: "AI Conversation",
  practice_sets: "Practice Sets",
  dictionary_reader: "Dictionary Reader",
  listening_lab: "Listening Lab",
  video_threads: "Video Threads",
  certificates: "Certificates",
  ai_chat: "AI Chat",
};
```

### Admin Analytics API Route Pattern
```typescript
// Source: src/app/api/admin/analytics/overview/route.ts
// Follow the exact same auth + error handling pattern:

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach"); // coach can see role analytics
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await getRoleAnalytics();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching role analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch role analytics" },
      { status: 500 }
    );
  }
}
```

### Student-Facing Roles (Server Component Pattern)
```typescript
// Source: Matches settings page pattern at src/app/(dashboard)/settings/page.tsx
// The settings page uses getCurrentUser() and passes data to client component.
// For ANALYTICS-06, add a roles section the same way:

// In the SettingsPage server component:
const user = await getCurrentUser();
const userRoleData = await getStudentRoleView(user.id);

// getStudentRoleView returns safe data (no admin info):
async function getStudentRoleView(userId: string) {
  const now = new Date();

  const assignments = await db
    .select({
      roleName: roles.name,
      roleColor: roles.color,
      roleDescription: roles.description,
      expiresAt: userRoles.expiresAt,
      roleId: userRoles.roleId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    );

  // For each role, get what it grants
  const roleIds = assignments.map((a) => a.roleId);
  if (roleIds.length === 0) return [];

  const [courseGrants, featureGrants] = await Promise.all([
    db.select({
      roleId: roleCourses.roleId,
      courseTitle: courses.title,
      accessTier: roleCourses.accessTier,
    })
    .from(roleCourses)
    .innerJoin(courses, eq(roleCourses.courseId, courses.id))
    .where(inArray(roleCourses.roleId, roleIds)),

    db.select({
      roleId: roleFeatures.roleId,
      featureKey: roleFeatures.featureKey,
    })
    .from(roleFeatures)
    .where(inArray(roleFeatures.roleId, roleIds)),
  ]);

  return assignments.map((a) => ({
    name: a.roleName,
    color: a.roleColor,
    description: a.roleDescription,
    expiresAt: a.expiresAt,
    courses: courseGrants.filter((g) => g.roleId === a.roleId),
    features: featureGrants.filter((g) => g.roleId === a.roleId).map((g) => g.featureKey),
  }));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No role analytics (pre-RBAC) | RBAC data model with roles/userRoles/roleCourses/roleFeatures | Phases 62-67 (2026-02-14/15) | All data for analytics queries now exists in well-indexed tables |
| Direct courseAccess only | Union of roleAccess + courseAccess via resolver | Phase 62 (2026-02-14) | Access attribution must consider both sources |
| No student-facing role info | Students see course list without understanding _why_ they have access | Pre-Phase 68 | Phase 68 adds transparency for students |
| Student counts include expired | getRoles() counts all assignments without expiry filtering | Phase 63 (current) | Phase 68 should fix this for accurate analytics |

**Deprecated/outdated:**
- None relevant. The RBAC system was just built and has no deprecated patterns yet.

## Open Questions

1. **Where should the role analytics page live?**
   - What we know: The sidebar has "Roles" at `/admin/roles` and "Analytics" at `/admin/analytics`. Role analytics is a different concern from role CRUD (existing roles page) and from learning analytics (existing analytics page).
   - What's unclear: Should role analytics be (a) a sub-page of roles at `/admin/roles/analytics`, (b) a new tab on the existing analytics page, or (c) a standalone page?
   - Recommendation: Create at `/admin/roles/analytics` as a sub-page of roles. This keeps role-related content together. The existing analytics page (`/admin/analytics`) focuses on learning metrics (completion rates, drop-off) -- mixing in RBAC analytics would dilute its focus. Note: No sidebar entry needed; link from the roles page.

2. **Should the student-facing roles section be on the settings page or a new page?**
   - What we know: The settings page (`/settings`) currently has language, daily goal, timezone, and notification preferences. It is the closest equivalent to a "student profile" page.
   - What's unclear: Whether roles information fits conceptually with settings, or should be a separate "My Access" page.
   - Recommendation: Add a new section to the settings page. The settings page is already the student's "about me" page. Adding a read-only "My Roles & Access" section at the top or bottom keeps things consolidated. If the section grows, it can be extracted later.

3. **Should the existing `getRoles()` student count be fixed to filter expired assignments?**
   - What we know: `getRoles()` in `src/lib/roles.ts` counts ALL `userRoles` rows including expired ones. This affects the roles list page and potentially ANALYTICS-01.
   - What's unclear: Whether fixing this would break any expectations (e.g., admin expects to see total-ever-assigned count).
   - Recommendation: Keep `getRoles()` unchanged for backward compatibility. Create a separate `getRolesWithActiveStudentCounts()` function for the analytics view that filters on expiration. The existing roles list page is acceptable showing total assignments; the analytics page should show active-only counts.

4. **How should access attribution handle the `allCourses` wildcard?**
   - What we know: When a role has `allCourses = true`, it grants access to every course. The `roleCourses` table may have zero rows for this role (courses are not listed individually).
   - What's unclear: How to display this in the attribution view -- show "All Courses" label or enumerate every course?
   - Recommendation: Display a special "All Courses" indicator rather than enumerating. Enumerating could be confusing because it would list courses the admin has not explicitly added to the role. The `allCourses` flag is already exposed in the role data (`src/db/schema/roles.ts` line 24).

5. **Should the admin see access attribution for a specific student, or a global attribution view?**
   - What we know: ANALYTICS-05 says "Coach can see access attribution (which role granted specific course/feature access to student)." This implies a per-student view.
   - What's unclear: Whether this should be accessible from the student detail view or from a separate search interface.
   - Recommendation: Add a per-student attribution view. The most natural place is as a section on the admin student detail page (which already has `StudentRoleAssignment` and `StudentCourseAccess` components). Add a new `StudentAccessAttribution` component below the existing role assignment section.

## Sources

### Primary (HIGH confidence)
- Existing codebase files (verified by reading):
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/roles.ts` -- roles, roleCourses, roleFeatures, userRoles tables with all columns, constraints, relations, and indexes
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/access.ts` -- courseAccess table (direct grants, separate from RBAC)
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/courses.ts` -- courses, modules, lessons tables
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/users.ts` -- users table with role enum (student/coach/admin)
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/permissions.ts` -- resolvePermissions(), PermissionSet interface, FEATURE_KEYS constant (7 keys), cache() wrapping
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/roles.ts` -- getRoles() with studentCount, createRole(), updateRole(), softDeleteRole()
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/user-roles.ts` -- getUserRoles(), assignRole(), removeRole()
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/auth.ts` -- hasMinimumRole(), getCurrentUser()
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/api/admin/roles/route.ts` -- GET/POST roles API with coach auth
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/api/admin/roles/[roleId]/route.ts` -- GET/PATCH/DELETE role API with tree data
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/api/admin/students/[studentId]/roles/route.ts` -- GET/POST/DELETE student role assignment API
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/api/admin/analytics/overview/route.ts` -- Analytics API pattern (auth, Promise.all, error handling)
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/(dashboard)/admin/roles/page.tsx` -- Roles list page with student counts
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/(dashboard)/admin/roles/[roleId]/page.tsx` -- Role detail page with PermissionTree
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/(dashboard)/admin/analytics/AnalyticsDashboard.tsx` -- Analytics dashboard client component pattern
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/(dashboard)/admin/analytics/components/OverviewCards.tsx` -- Overview cards with loading skeletons
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/(dashboard)/admin/page.tsx` -- Admin dashboard with nav cards
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/(dashboard)/settings/page.tsx` -- Student settings page (where ANALYTICS-06 will be added)
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/components/admin/StudentRoleAssignment.tsx` -- Existing role assignment component with optimistic UI
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/components/settings/SettingsForm.tsx` -- Student settings form pattern
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/components/layout/AppSidebar.tsx` -- Sidebar navigation structure
- `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/REQUIREMENTS.md` -- ANALYTICS-01 through ANALYTICS-06 requirement definitions
- `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/STATE.md` -- All 30 project decisions, current position

### Secondary (MEDIUM confidence)
- `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/phases/67-migration-compatibility/67-RESEARCH.md` -- Phase 67 research showing migration patterns and data state

### Tertiary (LOW confidence)
- None. All findings verified against existing codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new libraries; all query patterns exist in codebase (Promise.all, Drizzle JOINs, grouped counts)
- Architecture: HIGH -- follows established patterns (analytics API routes, client-side dashboard with fetching, Server Components for settings)
- Pitfalls: HIGH -- all 5 pitfalls verified against actual schema and existing code; Pitfall 1 (expired assignment counts) confirmed by reading getRoles() source

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- RBAC tables and UI patterns do not change frequently)
