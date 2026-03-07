# Phase 65: Student Role Assignment & Access Enforcement - Research

**Researched:** 2026-02-14
**Domain:** Role assignment CRUD API + UI, bulk operations extension, course/feature access enforcement via permission resolver integration
**Confidence:** HIGH

## Summary

Phase 65 has two distinct halves: (1) building the assignment UI and API so coaches can assign/remove roles to students, and (2) integrating the permission resolver into student-facing pages so access enforcement actually works. These halves are independent and can be planned as separate plans.

The assignment half is straightforward: add API endpoints for CRUD operations on the `userRoles` table (which already exists from Phase 62 with `userId`, `roleId`, `assignedBy`, `expiresAt`, and a unique constraint on `userId+roleId`), build a role assignment section on the student profile page (`/admin/students/[studentId]`), and extend the existing `StudentBulkActions` component to support `assign_role` and `remove_role` operations alongside the existing `assign_course`, `remove_course`, `add_tag`, `remove_tag` operations.

The enforcement half is the more impactful change. Currently, **zero pages call `resolvePermissions()`** -- the resolver exists (built in Phase 62, updated in Phase 64) but nothing uses it. All 17 files that check course access do direct `courseAccess` table queries. Phase 65 must NOT migrate these 17 files (that is Phase 67's job). Instead, Phase 65 adds an **enforcement layer on top of the existing system**: student-facing course list pages and feature pages check the resolver IN ADDITION TO the existing courseAccess queries. The key insight is that the resolver already unions both systems (roleCourses + courseAccess), so calling `resolvePermissions()` on student-facing pages replaces the need for direct courseAccess queries on those pages while maintaining backward compatibility. For features (AI bot, dictionary, listening lab, etc.), no gating exists at all today -- Phase 65 creates a `FeatureGate` wrapper component and integrates it into the 7 feature entry points.

**Primary recommendation:** Split into two plans: (1) Role Assignment API + UI (ASSIGN-01 through ASSIGN-07), and (2) Access Enforcement on student-facing pages (ACCESS-03, ACCESS-04). Plan 1 is pure additive CRUD with no behavior changes for students. Plan 2 is the higher-risk enforcement integration that changes what students see.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 (installed) | userRoles CRUD queries, permission resolver queries | Used across all 28 schema files |
| zod | 4.3.6 (installed) | API request validation for role assignment mutations | Used in all admin API routes |
| react | 19.2.3 (installed) | UI components for role assignment section and feature gating | Project framework |
| next | 16.1.4 (installed) | API routes, Server Components, React cache() | Project framework |
| sonner | 2.0.7 (installed) | Toast notifications for assignment/removal feedback | Used in 20+ components |
| lucide-react | 0.563.0 (installed) | Icons (Shield, ShieldCheck, Lock, Calendar, UserPlus, UserMinus) | Used across entire app |
| date-fns | 4.1.0 (installed) | Date formatting for expiration display | Used throughout student pages |
| @tanstack/react-table | (installed) | StudentDataTable already uses this; column extension needed | Powers admin student table |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Badge | (installed) | Role badges on student profile (same colored badges as roles list) | Show assigned roles with role color |
| Select | (installed) | Role picker dropdown for single assignment | When assigning a role from student profile |
| Popover + Calendar | NOT installed | Date picker for expiration | Decision needed: hand-roll simple date input vs install |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HTML date input for expiration | shadcn Calendar + Popover | Decision 5 says zero new packages. HTML `<input type="date">` is sufficient and avoids adding Calendar/Popover components. Dark theme styling via CSS. |
| Inline role assignment on student profile | Separate role assignment page | Inline is faster for coaches; matches existing StudentCourseAccess inline toggle pattern. |
| Server Component FeatureGate | Client-side permission context | Server Component check is more secure (can't be bypassed), matches existing server-component-first architecture, and uses React cache() for dedup. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── roles.ts              # EXISTS: userRoles table already has assignedBy, expiresAt
├── lib/
│   ├── permissions.ts         # EXISTS: resolvePermissions() + PermissionSet (use in pages)
│   └── user-roles.ts          # NEW: assignRole, removeRole, getUserRoles CRUD functions
├── app/
│   ├── api/admin/
│   │   ├── students/
│   │   │   ├── [studentId]/
│   │   │   │   └── roles/
│   │   │   │       └── route.ts   # NEW: GET/POST/DELETE for student role assignments
│   │   │   └── bulk/
│   │   │       └── route.ts       # MODIFY: Add assign_role + remove_role operations
│   │   └── roles/route.ts        # EXISTS: GET list of roles (for picker dropdown)
│   └── (dashboard)/
│       ├── admin/students/
│       │   └── [studentId]/
│       │       └── page.tsx       # MODIFY: Add roles section with assignment UI
│       ├── courses/
│       │   ├── page.tsx           # MODIFY: Use resolvePermissions() for course list
│       │   └── [courseId]/
│       │       └── page.tsx       # MODIFY: Use resolvePermissions() for access check
│       ├── lessons/
│       │   └── [lessonId]/
│       │       └── page.tsx       # MODIFY: Use resolvePermissions() for access check
│       └── dashboard/
│           ├── listening/page.tsx # MODIFY: Add FeatureGate wrapper
│           ├── reader/page.tsx    # MODIFY: Add FeatureGate wrapper
│           ├── vocabulary/page.tsx# MODIFY: Add FeatureGate wrapper
│           ├── practice/page.tsx  # MODIFY: Add FeatureGate wrapper
│           └── page.tsx           # MODIFY: Use resolvePermissions() for dashboard courses
├── components/
│   ├── admin/
│   │   ├── StudentRoleAssignment.tsx  # NEW: Role assignment section for student profile
│   │   ├── StudentBulkActions.tsx     # MODIFY: Add assign_role/remove_role buttons
│   │   └── columns.tsx               # MODIFY: Add roles column to student table
│   └── auth/
│       └── FeatureGate.tsx        # NEW: Server component wrapper for feature gating
```

### Pattern 1: Role Assignment CRUD Service
**What:** A service module (`src/lib/user-roles.ts`) with functions for assigning, removing, and listing roles for a student. Follows the same pattern as `src/lib/roles.ts` (Role CRUD) and `src/lib/tags.ts` (tag assignment).
**When to use:** All role assignment operations from API endpoints.

```typescript
// src/lib/user-roles.ts
import { db } from "@/db";
import { userRoles, roles } from "@/db/schema";
import { eq, and, isNull, or, gt } from "drizzle-orm";

export async function getUserRoles(userId: string) {
  return db
    .select({
      id: userRoles.id,
      roleId: userRoles.roleId,
      roleName: roles.name,
      roleColor: roles.color,
      roleDescription: roles.description,
      assignedBy: userRoles.assignedBy,
      expiresAt: userRoles.expiresAt,
      createdAt: userRoles.createdAt,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(roles.deletedAt)
      )
    );
}

export async function assignRole(
  userId: string,
  roleId: string,
  assignedBy: string,
  expiresAt?: Date
) {
  // Upsert: if already assigned, update expiresAt; if not, insert
  const existing = await db.query.userRoles.findFirst({
    where: and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)),
  });

  if (existing) {
    // Update expiresAt if provided, otherwise leave unchanged
    if (expiresAt !== undefined) {
      await db
        .update(userRoles)
        .set({ expiresAt, assignedBy })
        .where(eq(userRoles.id, existing.id));
    }
    return { action: "updated" as const, id: existing.id };
  }

  const [inserted] = await db
    .insert(userRoles)
    .values({ userId, roleId, assignedBy, expiresAt: expiresAt ?? null })
    .returning({ id: userRoles.id });

  return { action: "created" as const, id: inserted.id };
}

export async function removeRole(userId: string, roleId: string) {
  const deleted = await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
    .returning({ id: userRoles.id });

  return deleted.length > 0;
}
```

### Pattern 2: Student Role Assignment API
**What:** REST endpoints at `/api/admin/students/[studentId]/roles` for GET (list assignments), POST (assign), and DELETE (remove).
**When to use:** Called from the StudentRoleAssignment component on the student profile page.

```typescript
// GET /api/admin/students/[studentId]/roles
// Returns: { roles: UserRoleWithDetails[], availableRoles: Role[] }
// - roles: currently assigned roles with name, color, expiresAt, assignedBy
// - availableRoles: all non-deleted roles NOT already assigned (for picker)

// POST /api/admin/students/[studentId]/roles
// Body: { roleId: string, expiresAt?: string (ISO date) }
// Creates assignment, returns the new assignment

// DELETE /api/admin/students/[studentId]/roles
// Body: { roleId: string }
// Removes assignment, returns success
```

### Pattern 3: Bulk Role Operations Extension
**What:** Extend the existing `POST /api/admin/students/bulk` endpoint to support `assign_role` and `remove_role` operations. Extend the `StudentBulkActions` component to add "Assign Role" and "Remove Role" buttons that show a role picker.
**When to use:** When coach selects multiple students and wants to assign/remove a role in bulk.

```typescript
// Extended bulk schema
const bulkSchema = z.object({
  operation: z.enum([
    "assign_course", "remove_course",
    "add_tag", "remove_tag",
    "assign_role", "remove_role",  // NEW
  ]),
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  targetId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),  // NEW: optional for assign_role
});

// In the switch statement, add:
case "assign_role": {
  await assignRole(studentId, targetId, currentUser.id, expiresAt ? new Date(expiresAt) : undefined);
  results.push({ studentId, success: true });
  break;
}
case "remove_role": {
  const removed = await removeRole(studentId, targetId);
  results.push({
    studentId,
    success: removed,
    error: removed ? undefined : "Role not assigned",
  });
  break;
}
```

### Pattern 4: FeatureGate Server Component
**What:** A server component that checks `resolvePermissions()` for a specific feature key. Renders children if the user has access, or a locked fallback if not. Used on every feature page entry point.
**When to use:** Wrapping feature page content (listening lab, reader, practice, conversations, etc.).

```typescript
// src/components/auth/FeatureGate.tsx
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolvePermissions, type FeatureKey } from "@/lib/permissions";

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export async function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return fallback ?? null;

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) return fallback ?? null;

  const permissions = await resolvePermissions(user.id);

  if (permissions.canUseFeature(feature)) {
    return <>{children}</>;
  }

  return fallback ?? <FeatureLockedFallback featureName={feature} />;
}
```

### Pattern 5: Permission-Aware Course List
**What:** Replace the direct `courseAccess` JOIN on student-facing pages with `resolvePermissions()`. The resolver already unions courseAccess + roleCourses, so switching to the resolver is a direct replacement that also adds role-based access.
**When to use:** `/courses` page, `/dashboard` page, `/courses/[courseId]` page, `/lessons/[lessonId]` page.

**Critical insight:** The resolver's `canAccessCourse()` already checks both the `courseIdSet` (from roleCourses) AND direct courseAccess grants. The `hasWildcardAccess` flag handles `allCourses=true` roles. So the course list page can query ALL non-deleted courses, then filter by `permissions.canAccessCourse(courseId)`.

```typescript
// BEFORE (current): direct courseAccess JOIN
const userCourses = await db
  .select({ id: courses.id, ... })
  .from(courseAccess)
  .innerJoin(users, eq(courseAccess.userId, users.id))
  .innerJoin(courses, eq(courseAccess.courseId, courses.id))
  .where(and(eq(users.clerkId, clerkId), ...));

// AFTER (Phase 65): use resolvePermissions()
const permissions = await resolvePermissions(user.id);
const allCourses = await db.select(...).from(courses).where(isNull(courses.deletedAt));
const userCourses = allCourses.filter(c => permissions.canAccessCourse(c.id));
```

**Note:** This changes the query structure. The current approach JOINs courseAccess directly, getting the accessTier from courseAccess. The new approach needs the accessTier from the resolver: `permissions.getAccessTier(courseId)`.

### Pattern 6: Locked/Upgrade Prompt for Features
**What:** When a student lacks access to a feature, show a locked indicator with an upgrade prompt rather than hiding the feature entirely. This is requirement ACCESS-04: "show a locked state or upgrade prompt instead of being silently hidden."
**When to use:** Sidebar navigation items and feature page entry points.

```tsx
// Locked fallback component for features
function FeatureLockedFallback({ featureName }: { featureName: string }) {
  const labels: Record<string, string> = {
    ai_conversation: "AI Conversation Bot",
    practice_sets: "Practice Sets",
    dictionary_reader: "Dictionary",
    listening_lab: "YouTube Listening Lab",
    video_threads: "Video Threads",
    certificates: "Certificates",
    ai_chat: "AI Chat",
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Lock className="w-12 h-12 text-zinc-600 mb-4" />
      <h2 className="text-xl font-semibold text-zinc-300">
        {labels[featureName] ?? featureName} is Locked
      </h2>
      <p className="text-zinc-500 mt-2 max-w-md">
        This feature is not included in your current plan.
        Contact your coach to upgrade your access.
      </p>
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Migrating ALL 17 courseAccess-querying files in Phase 65:** This is Phase 67's job. Phase 65 only touches student-facing page entry points (5 pages: /courses, /courses/[courseId], /lessons/[lessonId], /dashboard, /dashboard/reader). Admin and API routes that use courseAccess directly continue working -- the resolver unions both systems, so courseAccess grants are NOT lost.
- **Client-side feature gating only:** Client-side checks are bypassable. The `FeatureGate` is a Server Component that runs on the server. Client-side ChatWidget needs a different approach: fetch a permissions endpoint or pass feature flags from the layout.
- **Removing courseAccess queries from admin pages:** Admin pages (student profile, analytics) query courseAccess for display purposes, not for access control. These stay as-is.
- **Using middleware for feature gating:** Middleware runs on every request and only has access to Clerk session claims, not database permissions. Feature gating must happen at the page/component level with DB queries.
- **Blocking student profile page load for role data:** The role assignment section should be a separate client component with its own data fetching (useEffect), matching the existing StudentCourseAccess and StudentTagsSection patterns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date picker for expiration | Custom calendar component | HTML `<input type="date">` with dark theme CSS | Decision 5 disallows new packages. HTML date input works on all browsers, auto-handles timezones, and is accessible. |
| Role assignment per-student | Custom modal flow | Inline section on student profile page (same pattern as StudentCourseAccess) | Matches existing UX. Coach already toggles course access inline; role assignment should feel identical. |
| Bulk role operations | Separate bulk UI | Extend existing StudentBulkActions component | Already has picker dialog, results dialog, undo support. Adding `assign_role`/`remove_role` is 20 lines. |
| Feature permission check | Custom hook or context | Server Component FeatureGate + resolvePermissions() with React cache() | Server-side is more secure. cache() eliminates duplicate DB queries within a request. |
| Expiration filtering | Application-level date comparison | Already handled by resolver: `or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))` | The resolver in permissions.ts already filters expired assignments (line 82-83). |

**Key insight:** The hardest part of Phase 65 is NOT building the assignment UI (that is standard CRUD). It is correctly integrating `resolvePermissions()` into 5 student-facing pages without breaking existing access that comes from `courseAccess` records. The resolver already handles this union, but the page-level query rewrites must be carefully tested.

## Common Pitfalls

### Pitfall 1: Breaking Existing CourseAccess-Based Access When Switching to Resolver
**What goes wrong:** Student has access via courseAccess table (legacy direct grant). Developer switches the `/courses` page to use `resolvePermissions()` but the resolver does not include direct courseAccess grants. Student loses access.
**Why it happens:** Misunderstanding the resolver's union behavior.
**How to avoid:** The resolver at `src/lib/permissions.ts` lines 112-124 already queries `courseAccess` and merges into the `courseIdSet`. Verify this by reading the resolver code before modifying any page. Test with a student who has ONLY courseAccess grants (no roles) to confirm they still see their courses.
**Warning signs:** Students who were previously enrolled suddenly see empty course list.

### Pitfall 2: FeatureGate in Root Layout (Client/Server Mismatch for ChatWidget)
**What goes wrong:** The ChatWidget is rendered in `src/app/layout.tsx` (root layout, server component). But ChatWidget itself is a client component. Wrapping it in a server-component FeatureGate is fine for the server render, but the client-side ChatWidget uses `useUser()` from Clerk and manages its own state.
**Why it happens:** The ChatWidget is a global floating component, not a page-level feature. It exists outside the dashboard layout.
**How to avoid:** For ChatWidget (ai_chat feature): pass a `features` prop from the dashboard layout server component, OR create a small client-side permissions hook that fetches `/api/me/permissions` on mount. Alternatively, conditionally render ChatWidget in the dashboard layout instead of the root layout, and only include it when the user has the feature.
**Warning signs:** ChatWidget renders for unauthenticated users, or blocks root layout SSR, or shows for students without ai_chat permission.

### Pitfall 3: Duplicate Role Assignments from Rapid UI Clicks
**What goes wrong:** Coach clicks "Assign" rapidly, two POST requests fire, and a unique constraint violation occurs on `user_roles_user_role_unique`.
**Why it happens:** No client-side debounce or optimistic locking.
**How to avoid:** Use optimistic UI update (immediately add role badge, disable assign button) and handle 409/duplicate gracefully in the API. The existing `StudentCourseAccess.tsx` pattern at lines 49-79 shows this exact approach.
**Warning signs:** Console errors showing unique constraint violations. Role appearing duplicated in the UI.

### Pitfall 4: Expiration Timezone Confusion
**What goes wrong:** Coach sets expiration to "2026-03-15" meaning end of day in their timezone. Database stores it as "2026-03-15T00:00:00Z" (midnight UTC). Student in UTC+8 loses access at 8 AM on March 15 instead of midnight.
**Why it happens:** HTML `<input type="date">` returns a date string without timezone. Converting to a Date in JavaScript uses local browser timezone.
**How to avoid:** When coach sets an expiration date, always set time to end of day UTC (23:59:59 UTC). Document this behavior. The resolver compares against `now()`, so as long as the stored timestamp is in UTC, the comparison is correct.
**Warning signs:** Access expiring earlier or later than expected depending on coach/student timezone.

### Pitfall 5: Course List Page Shows All Courses (Performance/Information Leak)
**What goes wrong:** Phase 65 changes the course list page from querying courseAccess (small result set) to querying ALL courses then filtering by resolver. If there are many courses, this loads unnecessary data. More critically, if filtering happens client-side, course titles could leak to students who should not see them.
**Why it happens:** Switching from a JOIN-based query (only returns enrolled courses) to a filter-based approach (loads all, filters).
**How to avoid:** Two approaches:
1. **Server-side filter (recommended):** Query all courses server-side, filter by `permissions.canAccessCourse()`, return only permitted courses. No data leak. With <20 courses, performance is fine.
2. **Resolver-driven query:** Extract `courseIds` from the PermissionSet and use `inArray(courses.id, [...permissions.courseIds])` to only query permitted courses from DB. More efficient for large catalogs, but needs special handling for `hasWildcardAccess` (which should return all courses).
**Warning signs:** Student sees course titles they should not have access to. Slow page load with many courses.

### Pitfall 6: Bulk Role Assignment Without Expiration Option
**What goes wrong:** Coach bulk-assigns a role to 50 students but cannot set an expiration date on the bulk operation. Each student gets a permanent assignment. To add expiration later, coach must edit each student individually.
**Why it happens:** The existing bulk operations UI does not have an expiration date field.
**How to avoid:** Add an optional expiration date field to the bulk role assignment picker dialog. When the coach selects a role, they can optionally check "Set expiration" and pick a date. The bulk API already supports per-operation metadata via the request body.
**Warning signs:** Coach assigns trial roles in bulk with no expiration, then manually has to clean up.

### Pitfall 7: Student Roles Column in Data Table Not Updating After Bulk Operation
**What goes wrong:** Coach bulk-assigns roles, sees the success toast, but the student table still shows old role data because it was server-rendered and not refreshed.
**Why it happens:** The `StudentBulkActions.onOperationComplete` callback calls `router.refresh()` which re-renders server components. But if the roles column data comes from the same data fetch and is cached, it may show stale data.
**How to avoid:** The existing `onOperationComplete` already calls `router.refresh()`. Ensure the student data query includes role information in its SELECT. The `router.refresh()` in Next.js App Router re-fetches server component data, so this should work correctly.
**Warning signs:** Stale role badges in the student table after bulk operations.

## Code Examples

### Example 1: StudentRoleAssignment Component

```tsx
// src/components/admin/StudentRoleAssignment.tsx
"use client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Loader2, X, UserPlus, Calendar } from "lucide-react";

interface AssignedRole {
  id: string;
  roleId: string;
  roleName: string;
  roleColor: string;
  expiresAt: string | null;
  createdAt: string;
}

interface AvailableRole {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

interface StudentRoleAssignmentProps {
  studentId: string;
}

export function StudentRoleAssignment({ studentId }: StudentRoleAssignmentProps) {
  const [assigned, setAssigned] = useState<AssignedRole[]>([]);
  const [available, setAvailable] = useState<AvailableRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await fetch(`/api/admin/students/${studentId}/roles`);
        if (res.ok) {
          const data = await res.json();
          setAssigned(data.roles);
          setAvailable(data.availableRoles);
        }
      } catch {
        toast.error("Failed to load roles");
      } finally {
        setLoading(false);
      }
    }
    fetchRoles();
  }, [studentId]);

  const handleAssign = async () => {
    if (!selectedRoleId) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: selectedRoleId,
          expiresAt: expiresAt || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to assign role");
      const data = await res.json();
      // Move role from available to assigned
      const role = available.find(r => r.id === selectedRoleId);
      if (role) {
        setAssigned(prev => [...prev, data.assignment]);
        setAvailable(prev => prev.filter(r => r.id !== selectedRoleId));
      }
      setSelectedRoleId("");
      setExpiresAt("");
      toast.success("Role assigned");
    } catch {
      toast.error("Failed to assign role");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (roleId: string) => {
    const prev = [...assigned];
    setAssigned(a => a.filter(r => r.roleId !== roleId));
    try {
      const res = await fetch(`/api/admin/students/${studentId}/roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      if (!res.ok) throw new Error("Failed to remove role");
      // Add back to available
      const removed = prev.find(r => r.roleId === roleId);
      if (removed) {
        setAvailable(a => [...a, {
          id: removed.roleId,
          name: removed.roleName,
          color: removed.roleColor,
          description: null,
        }]);
      }
      toast.success("Role removed");
    } catch {
      setAssigned(prev); // Revert
      toast.error("Failed to remove role");
    }
  };

  // ... render with loading, assigned list with remove buttons, assign form with select + date input
}
```

### Example 2: Extended Bulk Operations

```typescript
// Addition to StudentBulkActions ACTION_BUTTONS array
{
  operation: "assign_role",
  label: "Assign Role",
  icon: ShieldPlus,  // or UserPlus
  pickerTitle: "Select role to assign",
  fetchEndpoint: "/api/admin/roles",
},
{
  operation: "remove_role",
  label: "Remove Role",
  icon: ShieldMinus,  // or UserMinus
  pickerTitle: "Select role to remove",
  fetchEndpoint: "/api/admin/roles",
},
```

### Example 3: FeatureGate Usage on Pages

```tsx
// src/app/(dashboard)/dashboard/listening/page.tsx
import { FeatureGate } from "@/components/auth/FeatureGate";
import { ListeningClient } from "./ListeningClient";

export default async function ListeningPage() {
  // Existing auth check stays...
  return (
    <FeatureGate feature="listening_lab">
      <ListeningClient />
    </FeatureGate>
  );
}
```

### Example 4: Permission-Aware Course Detail Page

```typescript
// Replace the direct courseAccess check in /courses/[courseId]/page.tsx
// BEFORE (lines 50-58 of current file):
const access = await db.query.courseAccess.findFirst({
  where: and(
    eq(courseAccess.userId, user.id),
    eq(courseAccess.courseId, courseId),
    or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date()))
  ),
});
if (!access) {
  redirect("/dashboard");
}

// AFTER:
const permissions = await resolvePermissions(user.id);
if (!permissions.canAccessCourse(courseId)) {
  redirect("/dashboard");
}
```

### Example 5: Student Roles Column in Data Table

```tsx
// Addition to columns.tsx StudentRow interface
interface StudentRow {
  // ... existing fields
  roles: { id: string; name: string; color: string; expiresAt: string | null }[];
}

// New column definition
{
  accessorKey: "roles",
  header: "Roles",
  cell: ({ getValue }) => {
    const roles = getValue<StudentRow["roles"]>();
    if (!roles || roles.length === 0) {
      return <span className="text-zinc-600">--</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {roles.map((role) => (
          <Badge
            key={role.id}
            style={{
              backgroundColor: `${role.color}20`,
              color: role.color,
              borderColor: `${role.color}40`,
            }}
            className="text-[11px] py-0"
          >
            {role.name}
          </Badge>
        ))}
      </div>
    );
  },
  enableSorting: false,
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct courseAccess queries on every page | Centralized resolvePermissions() (built, not yet used) | Phase 62 (resolver built), Phase 65 (integration) | Single point of access control. Eliminates scattered queries across 17 files. |
| No feature gating | Feature gating via FeatureGate server component | Phase 65 (new) | 7 features can be gated per-role. Students see locked indicator instead of hidden features. |
| Course access = courseAccess table only | Course access = union(courseAccess, roleCourses) | Phase 62 (resolver unions both), Phase 65 (pages start using it) | Students gain access from BOTH roles and direct grants. No access is lost. |

**Deprecated/outdated:**
- Direct `courseAccess` queries for student-facing access control are deprecated in favor of `resolvePermissions()`. Phase 65 migrates 5 key student-facing pages. Phase 67 will migrate the remaining 12 files.

## Open Questions

1. **ChatWidget Feature Gating Approach**
   - What we know: ChatWidget renders in root layout (server component) but is itself a client component. FeatureGate is a server component. We cannot fetch the user's database ID in the root layout without a DB query on every page load.
   - What's unclear: Should ChatWidget move from root layout to dashboard layout (which already has auth)? Or should it stay global but self-gate via a client-side `/api/me/permissions` call?
   - Recommendation: Move ChatWidget rendering to the dashboard layout (`src/app/(dashboard)/layout.tsx`) where we already have `userId` from Clerk. Pass a `features` prop from a server-side resolver call. This is cleaner than adding a client-side permissions API. The ChatWidget only makes sense inside the dashboard anyway (it needs a lesson context).

2. **Date Picker for Role Expiration**
   - What we know: Decision 5 says zero new npm packages. HTML `<input type="date">` provides a native date picker.
   - What's unclear: Will the dark theme styling of a native date input look acceptable in the admin UI?
   - Recommendation: Use `<input type="date">` with Tailwind classes matching the existing form styling (bg-zinc-800, border-zinc-700, text-white). Chrome and Firefox render the calendar picker natively. If it looks bad, a simple custom dropdown (month/day/year selects) can be built in ~30 lines without new dependencies.

3. **Should /courses Page Show All Courses (Locked Indicator) or Only Accessible Courses?**
   - What we know: Requirement ACCESS-03 says "Student sees only courses/modules/lessons they have permission to access" and success criterion 4 says "unauthorized content is hidden or shows a locked indicator."
   - What's unclear: "Hidden" vs "locked indicator" is an OR condition. Which UX is better?
   - Recommendation: For courses, show ONLY accessible courses (no locked indicators). Students should see a clean list of what they can access. For features (ACCESS-04), show the feature in sidebar but with a lock icon and show a locked page when they navigate to it. This matches the requirement's phrasing: ACCESS-03 says "sees only" (filter), ACCESS-04 says "show a locked state" (indicator).

4. **Scope of Pages to Enforce in Phase 65 vs Phase 67**
   - What we know: There are 17 files with direct courseAccess queries. Phase 67 handles migration. Phase 65 handles enforcement.
   - What's unclear: Which exact set of pages should Phase 65 convert to use resolvePermissions()?
   - Recommendation: Phase 65 converts the 5 critical student-facing entry points: (1) `/dashboard` page, (2) `/courses` page, (3) `/courses/[courseId]` page, (4) `/lessons/[lessonId]` page, (5) `/dashboard/reader` page (uses courseAccess for lesson text access). All other files (admin pages, API routes, coach pages) continue using direct queries until Phase 67.

## Sources

### Primary (HIGH confidence)
- **Existing codebase files (verified by reading):**
  - `src/db/schema/roles.ts` lines 68-83 -- `userRoles` table already exists with userId, roleId, assignedBy, expiresAt, unique index on (userId, roleId)
  - `src/lib/permissions.ts` lines 67-205 -- Full resolver with courseAccess union, expiration filtering, module/lesson granular grants, React cache() wrapping
  - `src/lib/roles.ts` lines 1-139 -- Role CRUD service pattern (to follow for user-roles service)
  - `src/components/admin/StudentCourseAccess.tsx` lines 49-79 -- Optimistic toggle + revert-on-error pattern (to follow for role assignment)
  - `src/components/admin/StudentBulkActions.tsx` lines 36-71 -- ACTION_BUTTONS array with picker pattern (to extend for roles)
  - `src/app/api/admin/students/bulk/route.ts` lines 10-14, 56-119 -- Bulk operations schema + switch statement (to extend for roles)
  - `src/components/admin/columns.tsx` lines 7-17 -- StudentRow interface + tags column pattern (to follow for roles column)
  - `src/app/(dashboard)/admin/students/[studentId]/page.tsx` -- Student profile page structure with sections
  - `src/app/(dashboard)/courses/page.tsx` lines 26-56 -- Current courseAccess JOIN for course list (to replace with resolver)
  - `src/app/(dashboard)/courses/[courseId]/page.tsx` lines 50-58 -- Current courseAccess check for course detail (to replace with resolver)
  - `src/app/(dashboard)/lessons/[lessonId]/page.tsx` lines 74-84 -- Current courseAccess check for lesson page (to replace with resolver)
  - `src/app/(dashboard)/dashboard/page.tsx` lines 41-70 -- Current courseAccess JOIN for dashboard courses (to replace with resolver)
  - `src/app/(dashboard)/dashboard/listening/page.tsx` -- Listening page with no feature gating (to add FeatureGate)
  - `src/app/(dashboard)/dashboard/reader/page.tsx` -- Reader page with courseAccess check (to add FeatureGate)
  - `src/app/layout.tsx` lines 57-58 -- ChatWidget rendered in root layout (may need to move)
  - `src/app/(dashboard)/layout.tsx` lines 22-27 -- Dashboard layout with Clerk auth and role resolution
  - `src/middleware.ts` -- Clerk middleware with role-based routing (unchanged by Phase 65)
  - `src/components/layout/AppSidebar.tsx` -- Sidebar with role-based section filtering (may add feature lock icons)

- **Phase 64 artifacts:** All API endpoints confirmed working. Permission resolver updated with granular grants.
- **Phase 62 artifacts:** userRoles table exists in database with correct schema.

### Secondary (MEDIUM confidence)
- RBAC architecture docs (`.planning/research/v9.0-RBAC-SUMMARY.md`) confirmed FeatureGate component was planned as a server component wrapper.
- React cache() behavior for per-request dedup confirmed by Phase 62 resolver implementation.

### Tertiary (LOW confidence)
- None. All findings verified against existing codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, zero new packages, patterns match existing codebase exactly
- Architecture: HIGH -- CRUD service + API endpoints follow established patterns (roles.ts, tags.ts, StudentCourseAccess.tsx); FeatureGate is a simple server component wrapper; resolver integration is straightforward query replacement
- Pitfalls: HIGH -- Primary risk (breaking courseAccess access) is mitigated by resolver's built-in union behavior (verified by reading resolver code); ChatWidget gating has a clear solution path

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- CRUD patterns and resolver integration do not change frequently)
