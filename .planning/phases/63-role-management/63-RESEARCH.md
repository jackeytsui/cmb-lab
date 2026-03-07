# Phase 63: Role Management - Research

**Researched:** 2026-02-14
**Domain:** Admin CRUD UI + API routes for RBAC role management (Drizzle, Zod, react-hook-form, Next.js App Router)
**Confidence:** HIGH

## Summary

Phase 63 builds the admin-facing role management UI and API. The database schema and permission resolver already exist from Phase 62 (four tables: `roles`, `role_courses`, `role_features`, `user_roles`; plus `resolvePermissions()` in `src/lib/permissions.ts`). This phase adds CRUD operations for the `roles` table only -- coaches create/edit/delete roles with name, description, and color. It does NOT wire up role-course or role-feature mappings (that is Phase 64: Permission Builder) and does NOT assign roles to students (that is Phase 65: Assignment & Enforcement).

The codebase has a well-established pattern for admin CRUD: a `src/lib/{domain}.ts` service module with Drizzle queries, API routes at `src/app/api/admin/{domain}/route.ts` with Zod validation and `hasMinimumRole()` guards, and client components at `src/app/(dashboard)/admin/{domain}/page.tsx` using `react-hook-form`. The tags system (`src/lib/tags.ts`, `/api/admin/tags/`, `StudentTagsSection`) is the closest analogue to what roles needs -- both have name, color, description, created_by, and a join table for user assignment. The ContentList component provides drag-and-drop reordering which maps to the `sortOrder` column on roles.

Two new shadcn/ui components are needed per Decision 5: Badge (for role color display) and Checkbox (for Phase 64, not this phase). Only Badge is needed in Phase 63 for displaying role color swatches in the list view.

**Primary recommendation:** Follow the tags CRUD pattern exactly (`src/lib/tags.ts` structure, `/api/admin/tags/` route structure, `CourseForm` react-hook-form pattern). Add `src/lib/roles.ts` service module, `/api/admin/roles/` API routes, and `/admin/roles/` admin pages. Use soft delete (set `deletedAt`) per existing codebase pattern. Protect deletion by counting `user_roles` rows before allowing soft-delete.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 (installed) | Role queries: select, insert, update, soft-delete | Used in all 27 schema files and every `src/lib/*.ts` service |
| zod | 4.3.6 (installed) | API request validation (createRoleSchema, updateRoleSchema) | Used in all admin API routes for input validation |
| react-hook-form | 7.71.1 (installed) | Role create/edit form state management | Used in 9 admin form components (CourseForm, ModuleForm, LessonForm, etc.) |
| @hookform/resolvers | 5.2.2 (installed) | zodResolver for react-hook-form + Zod integration | Used alongside react-hook-form in all admin forms |
| lucide-react | 0.563.0 (installed) | Icons (Shield, Plus, Pencil, Trash2, Search) | Used across entire admin UI |
| Next.js App Router | 16 (installed) | API routes, server components, page routing | Project framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Badge | (to install) | Colored role badge display in list | Role list page, role name with color swatch |
| date-fns | 4.1.0 (installed) | formatDistanceToNow for "created X ago" display | Role list date formatting |
| sonner | 2.0.7 (installed) | Toast notifications for save/delete feedback | After successful create/edit/delete operations |
| @dnd-kit/react | 0.2.3 (installed) | Drag-and-drop reordering via ContentList | Role display order reordering (via existing ContentList) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom role list page | ContentList component | ContentList requires `sortOrder` field (roles has it). But ContentList is optimized for simple lists with reorder -- roles needs search, color badges, student count, and delete protection. Build a custom RoleList instead. |
| Inline color picker | Simple hex input with predefined palette | Full color picker adds complexity. A predefined palette of 8-10 colors (like tag colors in the codebase) is sufficient for role identification. |
| Dialog-based create/edit | Dedicated /admin/roles/new page | Existing pattern is mixed: courses use separate /new page, prompts use inline edit. For roles (simple 3-field form), a Dialog modal is more ergonomic and avoids page navigation. |

**Installation:**
```bash
# Install Badge component (only new dependency for Phase 63)
npx shadcn@latest add badge
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── roles.ts              # NEW: Role CRUD service (getRoles, createRole, updateRole, deleteRole, getRoleStudentCount)
├── app/
│   ├── api/admin/roles/
│   │   ├── route.ts          # NEW: GET (list) + POST (create)
│   │   └── [roleId]/
│   │       └── route.ts      # NEW: GET (single) + PATCH (update) + DELETE (soft-delete)
│   └── (dashboard)/admin/roles/
│       └── page.tsx           # NEW: Role list + create/edit dialog + search + delete
├── components/
│   ├── ui/
│   │   └── badge.tsx         # NEW: shadcn/ui Badge (installed via CLI)
│   └── admin/
│       └── RoleForm.tsx      # NEW: react-hook-form for role create/edit (name, description, color)
└── (existing files modified)
    └── components/layout/AppSidebar.tsx  # MODIFY: Add "Roles" nav item to Admin section
```

### Pattern 1: Service Module (from existing `src/lib/tags.ts`)
**What:** A `src/lib/roles.ts` file with exported async functions for all database operations. Each function takes typed arguments, uses Drizzle queries, and returns typed results.
**When to use:** All role database operations. API routes call these functions; they never import `db` directly for role queries.
**Source:** `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/tags.ts`

```typescript
// src/lib/roles.ts -- follows tags.ts pattern exactly
import { db } from "@/db";
import { roles, userRoles } from "@/db/schema";
import { eq, and, isNull, ilike, asc, count } from "drizzle-orm";
import type { Role, NewRole } from "@/db/schema/roles";

export async function getRoles(filters?: { search?: string }): Promise<(Role & { studentCount: number })[]> {
  // Query non-deleted roles
  const conditions = [isNull(roles.deletedAt)];
  if (filters?.search) {
    conditions.push(ilike(roles.name, `%${filters.search}%`));
  }

  const roleList = await db
    .select()
    .from(roles)
    .where(and(...conditions))
    .orderBy(asc(roles.sortOrder), asc(roles.name));

  // Get student counts per role (separate query, same pattern as courses/moduleCount)
  const studentCounts = await db
    .select({ roleId: userRoles.roleId, count: count() })
    .from(userRoles)
    .groupBy(userRoles.roleId);

  const countMap = new Map(studentCounts.map(r => [r.roleId, Number(r.count)]));

  return roleList.map(role => ({
    ...role,
    studentCount: countMap.get(role.id) || 0,
  }));
}

export async function createRole(data: {
  name: string;
  description?: string;
  color: string;
  createdBy?: string;
}): Promise<Role> {
  // Auto-increment sortOrder
  const maxOrder = await db
    .select({ max: roles.sortOrder })
    .from(roles)
    .where(isNull(roles.deletedAt));
  const nextOrder = (maxOrder[0]?.max ?? -1) + 1;

  const [role] = await db
    .insert(roles)
    .values({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      color: data.color,
      sortOrder: nextOrder,
      createdBy: data.createdBy,
    })
    .returning();
  return role;
}

export async function updateRole(
  roleId: string,
  data: { name?: string; description?: string; color?: string; sortOrder?: number }
): Promise<Role | null> {
  const [updated] = await db
    .update(roles)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description.trim() || null }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    })
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .returning();
  return updated ?? null;
}

export async function softDeleteRole(roleId: string): Promise<{ deleted: boolean; reason?: string }> {
  // Check if any students are assigned
  const [assignmentCount] = await db
    .select({ count: count() })
    .from(userRoles)
    .where(eq(userRoles.roleId, roleId));

  if (Number(assignmentCount.count) > 0) {
    return {
      deleted: false,
      reason: `Cannot delete: ${assignmentCount.count} student(s) are currently assigned this role`,
    };
  }

  const [updated] = await db
    .update(roles)
    .set({ deletedAt: new Date() })
    .where(and(eq(roles.id, roleId), isNull(roles.deletedAt)))
    .returning();

  return { deleted: !!updated };
}
```

### Pattern 2: API Route with Zod Validation (from existing `/api/admin/tags/`)
**What:** Next.js App Router API routes with `hasMinimumRole("coach")` guard, Zod schema validation, and structured JSON responses.
**When to use:** All role API endpoints.
**Source:** `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/api/admin/tags/route.ts`

```typescript
// src/app/api/admin/roles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { getRoles, createRole } from "@/lib/roles";
import { z } from "zod";

const createRoleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
});

export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || undefined;
  const roleList = await getRoles({ search });
  return NextResponse.json({ roles: roleList });
}

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = createRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const currentUser = await getCurrentUser();
  const role = await createRole({ ...parsed.data, createdBy: currentUser?.id });
  return NextResponse.json({ role }, { status: 201 });
}
```

### Pattern 3: Admin Form with react-hook-form + zodResolver (from existing `CourseForm`)
**What:** Client component using `useForm` with `zodResolver`, typed `defaultValues`, `register()` for inputs, and `handleSubmit()` for submission.
**When to use:** Role create/edit form (RoleForm component).
**Source:** `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/components/admin/CourseForm.tsx`

```typescript
// src/components/admin/RoleForm.tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const roleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

type RoleFormData = z.infer<typeof roleFormSchema>;

// COLOR_PALETTE: predefined colors for role selection
const COLOR_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#78716c",
];

export function RoleForm({ role, onSuccess, onCancel }: Props) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema) as never,
    defaultValues: {
      name: role?.name || "",
      description: role?.description || "",
      color: role?.color || "#3b82f6",
    },
  });
  // ... form JSX with Input, Textarea, color palette buttons
}
```

### Pattern 4: Admin List Page with Search (from existing `PromptList`)
**What:** Client component that receives initial data from a server component parent, with client-side filtering/search using `useMemo` and `useState`.
**When to use:** Role list page with name search (ROLE-05).
**Source:** `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/components/admin/PromptList.tsx`

Note: For roles, search can be client-side (filter on `name` field) since the role count will be small (<50). No need for server-side search unless the role count grows significantly. The API supports `?search=` param for future server-side filtering if needed.

### Pattern 5: Soft Delete with Protection (from existing course/module delete pattern)
**What:** Soft-delete by setting `deletedAt = new Date()` instead of hard delete. Before deleting, check if any dependent records exist and block with a user-friendly error message.
**When to use:** Role deletion (ROLE-03 + ROLE-06).
**Source:** `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/api/admin/courses/[courseId]/route.ts` (soft-delete pattern), custom for role protection.

The delete flow:
1. API receives DELETE request for roleId
2. Service function counts `user_roles` rows WHERE `role_id = roleId`
3. If count > 0: return 409 Conflict with `{ error: "Cannot delete: X student(s) are assigned", studentCount: X }`
4. If count === 0: set `deletedAt = new Date()` and return 200
5. Frontend shows warning dialog with student count when deletion is blocked

### Pattern 6: Role Templates / Preset Seeding (ROLE-04)
**What:** Admin action that creates pre-configured roles (Bronze, Silver, Gold) with predefined names, colors, and descriptions. Implemented as a single API endpoint or a button on the roles page.
**When to use:** One-time setup or demo seeding.

```typescript
// Preset templates for ROLE-04
const ROLE_TEMPLATES = [
  { name: "Bronze", color: "#cd7f32", description: "Basic access tier" },
  { name: "Silver", color: "#c0c0c0", description: "Intermediate access tier" },
  { name: "Gold",   color: "#ffd700", description: "Premium access tier" },
];
```

These are just role metadata -- they do NOT include course or feature mappings (that is Phase 64). The templates create roles entries that coaches can later configure with courses/features in the Permission Builder.

### Anti-Patterns to Avoid

- **Hard delete on roles:** The schema has `deletedAt` for soft delete. Never use `db.delete(roles)`. Always set `deletedAt`. The permission resolver already filters `isNull(roles.deletedAt)` (line 73 of `src/lib/permissions.ts`).
- **Duplicate Zod schemas:** Define validation schemas once in the API route file (or a shared `src/lib/validations/roles.ts`). Do NOT duplicate between API route and RoleForm -- import the same schema.
- **Checking role deletion via CASCADE:** The `user_roles` table has `ON DELETE CASCADE` on `roleId`, but we use soft delete, not hard delete. Soft delete does NOT trigger CASCADE. The application must check `user_roles` count manually before soft-deleting.
- **Using Dialog for complex role configuration:** Phase 63 is name/description/color ONLY. The Permission Builder (course + feature selection) is Phase 64 -- do NOT build it here. Keep the form simple with 3 fields.
- **Querying roles without `isNull(deletedAt)`:** Every role query MUST filter soft-deleted records. The only exception is admin cleanup tools.
- **Building a custom Badge component:** Decision 5 says use shadcn/ui Badge. Install it via CLI, do not hand-roll.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color badge display | Custom colored span | shadcn/ui Badge with `style={{ backgroundColor: color }}` | Decision 5: only two shadcn/ui components (Badge, Checkbox). Badge is one of them. |
| Form state management | useState for each field | react-hook-form + zodResolver | Established in 9 admin forms. Handles validation, dirty state, error messages. |
| Toast notifications | Custom notification system | sonner (Toaster already in layout) | Already used in 11 components. `toast.success()` / `toast.error()` pattern. |
| Drag-and-drop reorder | Custom sortOrder management | ContentList component (if reorder needed) | Already handles DnD, optimistic updates, API sync. But may be overkill for roles -- simple sortOrder update via PATCH may suffice. |
| Search/filter | Server-side search with debounce | Client-side `useMemo` filter | Role count will be <50. Client-side filtering is instant. Same pattern as PromptList. |

**Key insight:** Phase 63 is a straightforward admin CRUD page. The codebase has 6+ examples of this pattern (courses, prompts, tags, exercises, knowledge entries, students). Follow them exactly. The only novel aspect is soft-delete protection based on `user_roles` count (ROLE-06).

## Common Pitfalls

### Pitfall 1: Forgetting `isNull(roles.deletedAt)` in Queries
**What goes wrong:** Soft-deleted roles appear in the admin list, confusing coaches.
**Why it happens:** The roles schema uses soft delete (`deletedAt` column), but every query must explicitly filter `WHERE deleted_at IS NULL`.
**How to avoid:** Add `isNull(roles.deletedAt)` to EVERY query in `src/lib/roles.ts`. Use a shared helper or always include it in the query builder chain.
**Warning signs:** Deleted roles reappear in the list after page refresh.

### Pitfall 2: Allowing Deletion of Assigned Roles
**What goes wrong:** Coach deletes a role that students have. Soft delete does not CASCADE to `user_roles`. Students retain stale role assignments pointing to a deleted role. The permission resolver filters `isNull(roles.deletedAt)` in its JOIN, so the role effectively vanishes from students' permissions -- but `user_roles` rows remain, creating data inconsistency.
**Why it happens:** Assuming CASCADE handles cleanup. Soft delete does NOT trigger CASCADE.
**How to avoid:** ALWAYS check `user_roles` count before soft-deleting. Return 409 Conflict with student count when assignment exists. Frontend shows a warning: "This role is assigned to X students. Remove all assignments before deleting."
**Warning signs:** `user_roles` rows with `role_id` pointing to soft-deleted roles.

### Pitfall 3: Unique Constraint on Role Name Including Deleted Roles
**What goes wrong:** Coach deletes "Bronze" role, then tries to create a new "Bronze" role. The unique constraint on `roles.name` rejects it because the soft-deleted row still has that name.
**Why it happens:** The schema has `name: text("name").notNull().unique()` -- the unique index does NOT exclude soft-deleted rows.
**How to avoid:** Two options:
1. **(Recommended)** On soft delete, rename the role to `"[DELETED] Bronze_<uuid>"` to free up the name.
2. **(Alternative)** Drop the unique index and add a partial unique index: `CREATE UNIQUE INDEX roles_name_unique ON roles(name) WHERE deleted_at IS NULL`. This requires a raw SQL migration.
**Warning signs:** "Unique constraint violation" error when creating a role with a name that was previously soft-deleted.

### Pitfall 4: Missing Sidebar Navigation Link
**What goes wrong:** Roles page exists at `/admin/roles` but coaches cannot find it because no sidebar link was added.
**Why it happens:** Forgetting to update `src/components/layout/AppSidebar.tsx` with the new nav item.
**How to avoid:** Add `{ title: "Roles", url: "/admin/roles", icon: Shield }` (or `Tags` icon from lucide-react) to the Admin section of `navSections` in `AppSidebar.tsx`. Place it after "Students" since roles are a related concept.
**Warning signs:** Manual URL entry required to access /admin/roles.

### Pitfall 5: Color Input Validation Mismatch
**What goes wrong:** Frontend sends a color without `#` prefix or with uppercase hex, API rejects it.
**Why it happens:** Inconsistent validation between form and API.
**How to avoid:** Use the same Zod schema in both places: `z.string().regex(/^#[0-9a-fA-F]{6}$/)`. Ensure the color palette in the form always produces lowercase hex with `#` prefix.
**Warning signs:** Form submission fails with "Must be a valid hex color" error.

### Pitfall 6: Not Protecting Default Roles
**What goes wrong:** Coach deletes or renames the "default" role (the one with `isDefault: true`), breaking the system assumption that a default role exists.
**Why it happens:** No guard on default role modification.
**How to avoid:** Check `isDefault` before allowing delete. Optionally prevent renaming the default role. However, since `isDefault` is not used in Phase 63's requirements, this is a future concern. Flag it for Phase 65 when default role assignment is wired up.
**Warning signs:** New students get no role because the default role was deleted.

## Code Examples

### Zod Schemas for Role CRUD

```typescript
// Shared validation schemas
import { z } from "zod";

export const createRoleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
```

### DELETE API Route with Protection (ROLE-06)

```typescript
// src/app/api/admin/roles/[roleId]/route.ts
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { roleId } = await params;
  const result = await softDeleteRole(roleId);

  if (!result.deleted) {
    // ROLE-06: Prevent deletion of assigned roles
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
```

### Role Badge Display

```tsx
// Using shadcn/ui Badge with custom color
import { Badge } from "@/components/ui/badge";

function RoleBadge({ name, color }: { name: string; color: string }) {
  return (
    <Badge
      variant="outline"
      className="border-transparent"
      style={{ backgroundColor: `${color}20`, color: color }}
    >
      {name}
    </Badge>
  );
}
```

### Role Template Seeding (ROLE-04)

```typescript
// POST /api/admin/roles/templates
const ROLE_TEMPLATES = [
  { name: "Bronze", color: "#cd7f32", description: "Basic access tier" },
  { name: "Silver", color: "#c0c0c0", description: "Intermediate access tier" },
  { name: "Gold",   color: "#ffd700", description: "Premium access tier" },
];

export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin"); // Admin only for templates
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const currentUser = await getCurrentUser();
  const created: Role[] = [];

  for (const template of ROLE_TEMPLATES) {
    // Skip if role name already exists (idempotent)
    const existing = await db.select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.name, template.name), isNull(roles.deletedAt)));

    if (existing.length === 0) {
      const role = await createRole({ ...template, createdBy: currentUser?.id });
      created.push(role);
    }
  }

  return NextResponse.json({ created, skipped: ROLE_TEMPLATES.length - created.length });
}
```

### Dialog-Based Create/Edit Form Pattern

```tsx
// Role list page with Dialog for create/edit
"use client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AdminRolesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  const handleCreate = () => {
    setEditingRole(null);
    setDialogOpen(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setDialogOpen(true);
  };

  return (
    <div>
      {/* Search + role list + create button */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Create Role"}</DialogTitle>
          </DialogHeader>
          <RoleForm
            role={editingRole}
            onSuccess={() => { setDialogOpen(false); fetchRoles(); }}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate /new page for each admin entity | Dialog-based create/edit for simple forms | Current codebase practice | Reduces page navigation for 3-field forms; courses/modules still use dedicated pages for complex forms |
| Hard delete with CASCADE | Soft delete with `deletedAt` column | Established pattern across courses, modules, lessons, practice sets | Enables undo, audit trails, and data recovery |
| Inline Zod schema in each file | Shared schemas importable by both API and client | Best practice | Single source of truth; avoids validation drift between form and API |

**Deprecated/outdated:**
- Using `confirm()` for delete confirmation: Browser-native `window.confirm()` is still used in `AdminCoursesPage` but is being replaced by styled Dialog confirmations in newer pages. Use a confirmation Dialog for role deletion with student count warning.

## Open Questions

1. **Color palette vs free-form color picker**
   - What we know: Tags use a hex color field. The schema stores color as TEXT. No color picker component exists in the codebase.
   - What's unclear: Should coaches pick from a fixed palette or enter any hex color?
   - Recommendation: Use a fixed palette of 10 colors (displayed as clickable swatches) with the hex value stored on click. This is simpler and ensures good contrast. Allow manual hex input as a fallback. Do NOT install a color picker package (Decision 5: zero new npm packages).

2. **Role name uniqueness across soft-deleted records**
   - What we know: `roles.name` has a UNIQUE constraint that includes soft-deleted rows.
   - What's unclear: Will coaches want to recreate roles with the same name after deleting them?
   - Recommendation: Handle in the soft-delete function by appending `_deleted_<timestamp>` to the name when soft-deleting. This frees up the name for reuse. Simple and no schema migration needed.

3. **Access level for role management: coach vs admin**
   - What we know: Requirements say "Coach can create/edit/delete" (ROLE-01 through ROLE-03) and "Admin can create templates" (ROLE-04). The tag system uses `hasMinimumRole("coach")`.
   - What's unclear: Should all coaches manage roles, or only admins?
   - Recommendation: Use `hasMinimumRole("coach")` for standard CRUD (matches tag pattern) and `hasMinimumRole("admin")` for template seeding only. This aligns with the requirement text.

4. **Display order management**
   - What we know: The schema has `sortOrder` integer column. ContentList supports drag-and-drop reorder. ROLE-02 mentions "display order" as editable.
   - What's unclear: Is drag-and-drop reorder needed, or just a numeric sort order field in the edit form?
   - Recommendation: Start with a simple numeric `sortOrder` field in the edit form. Drag-and-drop reorder via ContentList can be added later if coaches request it. Keeps the initial implementation simple.

## Sources

### Primary (HIGH confidence)
- Existing codebase files (verified by reading):
  - `src/db/schema/roles.ts` -- RBAC schema (4 tables, relations, types) from Phase 62
  - `src/lib/permissions.ts` -- Permission resolver, filters `isNull(roles.deletedAt)` at line 73
  - `src/lib/tags.ts` -- Tag CRUD service (closest analogue pattern for roles)
  - `src/app/api/admin/tags/route.ts` -- Tag API routes (GET list + POST create)
  - `src/app/api/admin/tags/[tagId]/route.ts` -- Tag API routes (PATCH update + DELETE)
  - `src/app/api/admin/courses/route.ts` -- Course list API with module count pattern (student count analogue)
  - `src/app/api/admin/courses/[courseId]/route.ts` -- Course soft-delete pattern
  - `src/components/admin/CourseForm.tsx` -- react-hook-form + zodResolver pattern
  - `src/components/admin/PromptList.tsx` -- Client-side search/filter pattern
  - `src/components/admin/ContentList.tsx` -- Drag-and-drop reorder pattern
  - `src/components/layout/AppSidebar.tsx` -- Admin navigation structure (line 79-94)
  - `src/lib/auth.ts` -- `hasMinimumRole()` and `getCurrentUser()` functions
  - `.planning/phases/62-schema-permission-resolver/62-VERIFICATION.md` -- Phase 62 verified complete
  - `.planning/research/v9.0-RBAC-SUMMARY.md` -- Overall RBAC architecture decisions

### Secondary (MEDIUM confidence)
- Context7 `/shadcn-ui/ui` -- Badge component installation: `npx shadcn@latest add badge`, variants: default/outline/secondary/destructive
- Context7 `/shadcn-ui/ui` -- Dialog component usage (already installed in codebase)

### Tertiary (LOW confidence)
- None. All findings verified against codebase and official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- every library already installed; every pattern has 3+ existing examples in codebase
- Architecture: HIGH -- follows exact same CRUD pattern as tags/courses/prompts/exercises
- Pitfalls: HIGH -- soft-delete protection verified against schema constraints and permission resolver code

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- admin CRUD patterns, Drizzle ORM, and react-hook-form change infrequently)
