# Phase 67: Migration & Compatibility - Research

**Researched:** 2026-02-15
**Domain:** Database migration script, courseAccess-to-RBAC role conversion, admin verification tooling
**Confidence:** HIGH

## Summary

Phase 67 implements MIGRATE-01 (auto-migrate existing courseAccess records to a "Legacy Access" role on first v9.0 deploy) and MIGRATE-04 (existing students retain all current access after migration). The resolver already unions role-based grants with courseAccess records (MIGRATE-02/03, done in Phase 62), and hasMinimumRole() is unchanged (MIGRATE-05, done in Phase 62). This phase only needs to create the migration script and admin verification.

The production database (Neon project `noisy-cell-02790846`) currently has **1 user** (admin), **1 courseAccess record** (admin user -> Beginner Cantonese, full tier, granted_by admin), **2 courses**, **0 roles**, and **0 user_roles**. This is a pre-production system -- the migration is being built before real students exist. However, the migration must handle the general case: multiple students with different courseAccess patterns (varying course sets, access tiers, expiration dates, granted_by sources).

The migration approach is straightforward: (1) analyze distinct courseAccess patterns (unique combinations of course sets + access tiers), (2) create one "Legacy Access" role per distinct pattern, (3) assign students to their matching role, (4) courseAccess rows remain untouched as the "direct override" layer per Decision 2. The admin verification tool compares pre-migration courseAccess grants against post-migration resolved permissions to confirm zero regressions.

**Primary recommendation:** Implement migration as an idempotent admin API endpoint (not a Drizzle migration or startup script), triggered manually from an admin UI page. This allows the admin to preview the migration, run it, verify results, and re-run safely if needed. The migration script groups students by their courseAccess fingerprint (sorted course IDs + tiers), creates one role per fingerprint, and bulk-assigns students. An admin verification page queries both systems and highlights any discrepancies.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 (installed) | Query courseAccess, insert roles/roleCourses/userRoles | Already used for all DB operations in the project |
| react (cache) | 19.2.3 (installed) | resolvePermissions() deduplication during verification | Already wrapped in Phase 62 |
| zod | 4.3.6 (installed) | API request validation for migration trigger endpoint | Already used throughout API layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm (sql) | via drizzle-orm | Raw SQL for pattern analysis GROUP BY queries | For efficient grouping of courseAccess records |
| next/navigation | via next | Redirect for unauthorized admin access | Standard auth guard pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Admin API endpoint | Drizzle migration SQL | Migrations run once automatically but cannot be previewed, retried, or verified interactively. Admin API is safer for data migration. |
| Admin API endpoint | Startup script in app initialization | Startup scripts block deployment, cannot show progress, and are harder to debug. Admin endpoint allows manual trigger with preview. |
| One role per pattern | One role per student | Creates role explosion. If 50 students all have the same 3 courses, they should share one role, not get 50 identical roles. |
| Grouping by course set | Grouping by individual course | Individual course roles lose the "bundle" concept. A student with courses A+B+C should get one "Legacy: A+B+C" role, not three separate roles. |

**Installation:**
```bash
# No packages to install. Everything is already in package.json.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/api/admin/migration/
│   └── route.ts              # NEW: Migration API (preview + execute + verify)
├── app/(dashboard)/admin/migration/
│   └── page.tsx              # NEW: Admin migration UI page
└── lib/
    └── permissions.ts        # UNCHANGED: resolvePermissions() already unions both systems
```

### Pattern 1: CourseAccess Fingerprinting
**What:** Group students by their identical courseAccess pattern (sorted list of courseId + accessTier pairs). Students with the same fingerprint get the same "Legacy Access" role.
**When to use:** During migration analysis to determine how many roles to create.
**Source:** Codebase analysis of `src/db/schema/access.ts` courseAccess table structure

```typescript
// Fingerprint: sorted courseId:accessTier pairs joined with "|"
// Example: "11111111-...:full|22222222-...:preview"
// Students with identical fingerprints share the same legacy role

interface AccessPattern {
  fingerprint: string;
  courseGrants: { courseId: string; accessTier: "preview" | "full" }[];
  studentIds: string[];
  studentCount: number;
}

// SQL approach: GROUP BY on a constructed fingerprint
const patterns = await db.execute(sql`
  SELECT
    user_id,
    STRING_AGG(course_id || ':' || access_tier, '|' ORDER BY course_id) as fingerprint
  FROM course_access
  WHERE expires_at IS NULL OR expires_at > NOW()
  GROUP BY user_id
`);
```

### Pattern 2: Idempotent Migration with Marker
**What:** Use a naming convention or metadata to detect if migration has already run. Check if a role named "Legacy Access" (or prefixed with "Legacy:") already exists before creating.
**When to use:** Every time the migration endpoint is called, to safely support re-runs.
**Source:** Existing soft-delete pattern in codebase (`roles.deletedAt`)

```typescript
// Check if migration already ran
const existingLegacyRoles = await db
  .select({ id: roles.id })
  .from(roles)
  .where(and(
    sql`${roles.name} LIKE 'Legacy:%'`,
    isNull(roles.deletedAt)
  ));

if (existingLegacyRoles.length > 0) {
  return { alreadyMigrated: true, roleCount: existingLegacyRoles.length };
}
```

### Pattern 3: Admin Verification via Symmetric Comparison
**What:** For each student, compare their courseAccess grants against their resolvePermissions() output. Any courseId in courseAccess that is NOT in the resolved PermissionSet is a regression.
**When to use:** After migration runs, as the admin verification step.
**Source:** Phase 62 resolver at `src/lib/permissions.ts` already implements the union logic

```typescript
// Verification: for each student with courseAccess records,
// resolve their permissions and check that every courseAccess courseId
// appears in the resolved courseIds set.
interface VerificationResult {
  studentId: string;
  email: string;
  courseAccessGrants: string[];  // courseIds from courseAccess
  resolvedCourseIds: string[];  // courseIds from resolvePermissions()
  missingFromResolved: string[]; // REGRESSIONS (should be empty)
  status: "pass" | "fail";
}
```

### Pattern 4: Transaction-Wrapped Bulk Insert
**What:** Wrap the entire migration (role creation + roleCourses + userRoles inserts) in a database transaction. If any step fails, everything rolls back cleanly.
**When to use:** During migration execution to ensure atomicity.
**Source:** Drizzle ORM transaction pattern (used in bulk operations at `src/app/api/admin/students/bulk/route.ts`)

```typescript
await db.transaction(async (tx) => {
  // 1. Create role
  const [role] = await tx.insert(roles).values({
    name: `Legacy: ${patternLabel}`,
    description: "Auto-created during v9.0 migration from courseAccess records",
    color: "#9ca3af", // neutral gray
  }).returning();

  // 2. Create role-course mappings
  await tx.insert(roleCourses).values(
    pattern.courseGrants.map(grant => ({
      roleId: role.id,
      courseId: grant.courseId,
      accessTier: grant.accessTier,
    }))
  );

  // 3. Assign students to role
  await tx.insert(userRoles).values(
    pattern.studentIds.map(studentId => ({
      userId: studentId,
      roleId: role.id,
      assignedBy: null, // system migration
    }))
  );
});
```

### Anti-Patterns to Avoid

- **Deleting courseAccess rows during migration:** Decision 2 explicitly states courseAccess persists as "direct override" layer. The resolver unions both systems. Never delete courseAccess data.
- **Running migration in a Drizzle migration file:** Drizzle migrations run automatically on deploy and cannot be previewed or verified. Data migrations should be manual admin operations.
- **Creating one role per student:** If 50 students share the same course set, they should share one role. Per-student roles create role explosion that defeats the purpose of RBAC.
- **Ignoring expired courseAccess:** Only migrate active (non-expired) courseAccess records. Expired records represent past access that should not be converted to permanent roles.
- **Migrating admin/coach users:** The `hasMinimumRole()` system handles admin/coach access. Only students (users with `role = 'student'`) should be migrated to RBAC roles.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grouping students by access pattern | Custom loop with Map accumulator | PostgreSQL `STRING_AGG` + `GROUP BY` | Database-side grouping is faster and handles edge cases (NULL, ordering) correctly |
| Transaction management | Try/catch with manual rollback | Drizzle `db.transaction()` | Built-in transaction support with automatic rollback on throw |
| Role name generation | Random UUIDs or timestamps | Descriptive names from course titles | "Legacy: Beginner Cantonese + Test Course 1" is far more useful than "Legacy-abc123" for admin debugging |
| Verification comparison | Manual Set difference | `resolvePermissions()` + courseAccess query comparison | The resolver is the source of truth; comparing against it guarantees correctness |

**Key insight:** The migration is a one-time data transformation. The complexity is in the analysis (grouping patterns), not in the execution (bulk inserts). The resolver already handles the hard part (union logic). The migration just needs to create role records that match existing courseAccess patterns.

## Common Pitfalls

### Pitfall 1: Race Condition During Migration
**What goes wrong:** A webhook creates a new courseAccess record while migration is running. The new record is not included in the migration analysis, and the student's pattern changes mid-migration.
**Why it happens:** The migration is not atomic across the analysis and execution phases.
**How to avoid:** Run the migration in a single transaction. Or accept that the resolver already unions both systems -- any courseAccess record created during migration will still be honored by the resolver even if it was not included in a legacy role. The resolver is the safety net.
**Warning signs:** Post-migration verification shows students with courseAccess grants not matched by any role (this is OK because the resolver unions both sources).

### Pitfall 2: Role Name Collision with Existing Roles
**What goes wrong:** An admin already manually created a role named "Legacy Access" or "Legacy: Beginner Cantonese" before migration runs. The migration INSERT fails with unique constraint violation.
**Why it happens:** The `roles.name` column has a UNIQUE constraint.
**How to avoid:** Use `ON CONFLICT DO NOTHING` or check for existing names first. Alternatively, prefix with a unique identifier like "Legacy (migrated): ..." or add a timestamp suffix. The idempotency check (Pattern 2) should catch this case.
**Warning signs:** Migration endpoint returns 500 with "unique_violation" error.

### Pitfall 3: Expired CourseAccess Included in Migration
**What goes wrong:** A student's courseAccess record has `expires_at` in the past, but the migration still creates a permanent role for it. The student now has access they should have lost.
**Why it happens:** The migration query does not filter on `expires_at`.
**How to avoid:** Always filter: `WHERE expires_at IS NULL OR expires_at > NOW()`. This matches the resolver's behavior at `src/lib/permissions.ts` line 119-122.
**Warning signs:** Students report having access to courses they should no longer see.

### Pitfall 4: Empty Pattern After Filtering
**What goes wrong:** A student has only expired courseAccess records. After filtering, they have no active grants. The migration creates an empty role with no course mappings.
**Why it happens:** The fingerprint is empty string for students with zero active grants.
**How to avoid:** Skip students with zero active courseAccess records. They have no access to migrate. If they later gain access via webhook, the webhook will assign them a proper role.
**Warning signs:** Migration creates a role named "Legacy: (empty)" with no courses.

### Pitfall 5: Feature Grants Missing from Legacy Roles
**What goes wrong:** The legacy system has no feature gating -- all features are available to all students. The migration creates legacy roles with course access but no features. After migration, students lose access to AI conversation, practice sets, etc.
**Why it happens:** courseAccess records only track course access, not feature access. There was no feature gating before RBAC.
**How to avoid:** Grant ALL features to legacy roles. Before RBAC, every student with course access had access to all features. The migration must preserve this by adding all 7 feature keys to every legacy role.
**Warning signs:** Students report "Feature not available in your plan" errors after migration. This is the most critical pitfall.

## Code Examples

Verified patterns from existing codebase:

### Migration Analysis Query
```typescript
// Source: Pattern derived from src/db/schema/access.ts courseAccess table
// and src/lib/permissions.ts resolver logic

import { db } from "@/db";
import { courseAccess, users, courses } from "@/db/schema";
import { eq, and, or, isNull, gt, sql } from "drizzle-orm";

interface MigrationPreview {
  patterns: {
    fingerprint: string;
    courseNames: string[];
    courseTiers: { courseId: string; courseTitle: string; accessTier: "preview" | "full" }[];
    studentCount: number;
    studentEmails: string[];
    suggestedRoleName: string;
  }[];
  totalStudents: number;
  totalRolesToCreate: number;
  alreadyMigrated: boolean;
}

async function analyzeMigration(): Promise<MigrationPreview> {
  const now = new Date();

  // Get all active courseAccess for students only
  const activeGrants = await db
    .select({
      userId: courseAccess.userId,
      courseId: courseAccess.courseId,
      accessTier: courseAccess.accessTier,
      courseTitle: courses.title,
      userEmail: users.email,
    })
    .from(courseAccess)
    .innerJoin(users, eq(courseAccess.userId, users.id))
    .innerJoin(courses, eq(courseAccess.courseId, courses.id))
    .where(and(
      eq(users.role, "student"),
      or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now))
    ));

  // Group by user, build fingerprint
  const userGrants = new Map<string, {
    email: string;
    grants: { courseId: string; courseTitle: string; accessTier: "preview" | "full" }[];
  }>();

  for (const row of activeGrants) {
    if (!userGrants.has(row.userId)) {
      userGrants.set(row.userId, { email: row.userEmail, grants: [] });
    }
    userGrants.get(row.userId)!.grants.push({
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      accessTier: row.accessTier,
    });
  }

  // Build fingerprints and group students
  const patternMap = new Map<string, {
    courseTiers: { courseId: string; courseTitle: string; accessTier: "preview" | "full" }[];
    students: { id: string; email: string }[];
  }>();

  for (const [userId, data] of userGrants) {
    // Sort grants by courseId for consistent fingerprint
    const sorted = [...data.grants].sort((a, b) => a.courseId.localeCompare(b.courseId));
    const fingerprint = sorted.map(g => `${g.courseId}:${g.accessTier}`).join("|");

    if (!patternMap.has(fingerprint)) {
      patternMap.set(fingerprint, { courseTiers: sorted, students: [] });
    }
    patternMap.get(fingerprint)!.students.push({ id: userId, email: data.email });
  }

  // Build preview
  const patterns = Array.from(patternMap.entries()).map(([fp, data]) => {
    const courseNames = data.courseTiers.map(ct => ct.courseTitle);
    return {
      fingerprint: fp,
      courseNames,
      courseTiers: data.courseTiers,
      studentCount: data.students.length,
      studentEmails: data.students.map(s => s.email),
      suggestedRoleName: `Legacy: ${courseNames.join(" + ")}`,
    };
  });

  return {
    patterns,
    totalStudents: userGrants.size,
    totalRolesToCreate: patterns.length,
    alreadyMigrated: false, // caller should check separately
  };
}
```

### Migration Execution
```typescript
// Source: Pattern derived from src/lib/roles.ts createRole()
// and src/lib/user-roles.ts assignRole()

import { roles, roleCourses, roleFeatures, userRoles } from "@/db/schema";
import { FEATURE_KEYS } from "@/lib/permissions";

async function executeMigration(preview: MigrationPreview): Promise<{
  rolesCreated: number;
  studentsAssigned: number;
}> {
  let rolesCreated = 0;
  let studentsAssigned = 0;

  for (const pattern of preview.patterns) {
    await db.transaction(async (tx) => {
      // 1. Create the legacy role
      const [role] = await tx
        .insert(roles)
        .values({
          name: pattern.suggestedRoleName,
          description: `Auto-migrated from courseAccess records during v9.0 deploy. ${pattern.studentCount} student(s).`,
          color: "#9ca3af", // neutral gray for legacy roles
        })
        .returning();

      // 2. Add course mappings
      if (pattern.courseTiers.length > 0) {
        await tx.insert(roleCourses).values(
          pattern.courseTiers.map(ct => ({
            roleId: role.id,
            courseId: ct.courseId,
            accessTier: ct.accessTier,
          }))
        );
      }

      // 3. Add ALL feature keys (pre-RBAC, all features were available)
      await tx.insert(roleFeatures).values(
        FEATURE_KEYS.map(featureKey => ({
          roleId: role.id,
          featureKey,
        }))
      );

      // 4. Assign students to this role
      if (pattern.studentEmails.length > 0) {
        const studentIds = pattern.courseTiers.length > 0
          ? /* get from pattern data */ []
          : [];
        // In real code, pass studentIds through the pattern
      }

      rolesCreated++;
    });
  }

  return { rolesCreated, studentsAssigned };
}
```

### Verification Query
```typescript
// Source: src/lib/permissions.ts resolvePermissions()

import { resolvePermissions } from "@/lib/permissions";

interface VerificationRow {
  studentId: string;
  email: string;
  directCourseIds: string[];     // from courseAccess
  resolvedCourseIds: string[];   // from resolvePermissions()
  missingCourses: string[];      // in direct but not resolved (REGRESSION)
  extraCourses: string[];        // in resolved but not direct (OK - from roles)
  status: "pass" | "fail";
}

async function verifyMigration(): Promise<{
  results: VerificationRow[];
  totalChecked: number;
  totalPassed: number;
  totalFailed: number;
}> {
  // Get all students with courseAccess
  const studentsWithAccess = await db
    .select({
      userId: courseAccess.userId,
      courseId: courseAccess.courseId,
      email: users.email,
    })
    .from(courseAccess)
    .innerJoin(users, eq(courseAccess.userId, users.id))
    .where(and(
      eq(users.role, "student"),
      or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date()))
    ));

  // Group by student
  const studentMap = new Map<string, { email: string; courseIds: string[] }>();
  for (const row of studentsWithAccess) {
    if (!studentMap.has(row.userId)) {
      studentMap.set(row.userId, { email: row.email, courseIds: [] });
    }
    studentMap.get(row.userId)!.courseIds.push(row.courseId);
  }

  const results: VerificationRow[] = [];

  for (const [studentId, data] of studentMap) {
    const permissions = await resolvePermissions(studentId);
    const resolvedIds = Array.from(permissions.courseIds);

    const missing = data.courseIds.filter(id => !permissions.canAccessCourse(id));
    const extra = resolvedIds.filter(id => !data.courseIds.includes(id));

    results.push({
      studentId,
      email: data.email,
      directCourseIds: data.courseIds,
      resolvedCourseIds: resolvedIds,
      missingCourses: missing,
      extraCourses: extra,
      status: missing.length === 0 ? "pass" : "fail",
    });
  }

  return {
    results,
    totalChecked: results.length,
    totalPassed: results.filter(r => r.status === "pass").length,
    totalFailed: results.filter(r => r.status === "fail").length,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct courseAccess queries in ~23 files | resolvePermissions() unions courseAccess + roles | Phase 62 (2026-02-14) | New code uses resolver; old code still works because courseAccess persists |
| No feature gating (all features available) | Feature keys on roles control access | Phase 64-65 (2026-02-14/15) | Legacy roles MUST include all feature keys to preserve pre-migration behavior |
| Manual course grants via admin UI | Roles bundle courses + features | Phase 63-64 (2026-02-14) | Migration creates roles matching existing courseAccess patterns |

**Deprecated/outdated:**
- None relevant. The migration is new functionality that has no predecessor.

## Open Questions

1. **Role naming for single-course vs multi-course patterns**
   - What we know: If a student has access to only "Beginner Cantonese", the role name would be "Legacy: Beginner Cantonese". If they have 5 courses, the name could become very long.
   - What's unclear: Maximum practical length of role names. The `roles.name` column is `text` (unlimited), but long names may look bad in the UI.
   - Recommendation: Truncate course name lists at 3 courses, use ellipsis: "Legacy: Beginner Cantonese + Test Course 1 + ... (3 more)". This keeps names readable while remaining descriptive.

2. **Whether to migrate admin/coach courseAccess records**
   - What we know: The single existing courseAccess record belongs to the admin user (Sheldon Ho). Admins and coaches already see all courses via `hasMinimumRole("coach")` bypass in page components.
   - What's unclear: Should admin/coach courseAccess records be migrated to roles, or skipped?
   - Recommendation: Skip admin/coach users. They do not need RBAC roles -- `hasMinimumRole()` handles their access (Decision 4). Only migrate users with `role = 'student'`.

3. **Migration page placement in admin UI**
   - What we know: Admin pages are at `/admin/*` with navigation cards on the admin dashboard.
   - What's unclear: Whether migration should be a permanent admin page or a one-time tool.
   - Recommendation: Create it as a permanent page at `/admin/migration`. Even after initial migration, it can be used to verify ongoing consistency between courseAccess and role-based access. The "preview" mode is always useful for debugging.

## Sources

### Primary (HIGH confidence)
- Existing codebase files (verified):
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/access.ts` -- courseAccess table: userId, courseId, accessTier, expiresAt, grantedBy columns
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/roles.ts` -- roles, roleCourses, roleFeatures, userRoles tables with all constraints
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/permissions.ts` -- resolvePermissions() with union logic, FEATURE_KEYS constant (7 keys), PermissionSet interface
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/roles.ts` -- createRole() with auto-incrementing sortOrder pattern
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/user-roles.ts` -- assignRole() with upsert pattern
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/auth.ts` -- hasMinimumRole() unchanged, resolveRole() unchanged
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/api/webhooks/enroll/route.ts` -- webhook handler with role + courseAccess dual support
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/(dashboard)/courses/page.tsx` -- uses resolvePermissions() for student access, hasMinimumRole("coach") bypass
- Production database (Neon `noisy-cell-02790846`):
  - `course_access`: 1 record (admin user, Beginner Cantonese, full, no expiry)
  - `users`: 1 user (admin), 0 students
  - `courses`: 2 courses (Beginner Cantonese, Test Course 1)
  - `roles`: 0 roles, `user_roles`: 0 assignments
- Prior phase research and verification:
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/phases/62-schema-permission-resolver/62-RESEARCH.md` -- resolver design, schema patterns
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/phases/62-schema-permission-resolver/62-VERIFICATION.md` -- confirmed MIGRATE-02/03/05 satisfied
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/research/v9.0-RBAC-ARCHITECTURE.md` -- migration strategy (Phase 5: Migration Tool)

### Secondary (MEDIUM confidence)
- `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/research/v9.0-RBAC-SUMMARY.md` -- Phase 4 migration tool description
- `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/REQUIREMENTS.md` -- MIGRATE-01, MIGRATE-04 requirement text
- `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/STATE.md` -- Decision 2 (courseAccess persists), Decision 3 (MIGRATE split), Decision 8 (migration near end)

### Tertiary (LOW confidence)
- None. All findings verified against codebase and production database.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed; all patterns exist in codebase (createRole, assignRole, db.transaction, resolvePermissions)
- Architecture: HIGH -- migration is a straightforward data transformation; the resolver already handles the union logic that makes verification trivial
- Pitfalls: HIGH -- all 5 pitfalls verified against actual schema constraints and resolver behavior; Pitfall 5 (missing features) is the most critical and easily preventable

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- migration patterns and database schema do not change frequently)
