# Phase 62: Schema & Permission Resolver - Research

**Researched:** 2026-02-14
**Domain:** Drizzle ORM schema design + permission resolution with React cache()
**Confidence:** HIGH

## Summary

Phase 62 builds four new Drizzle tables (`roles`, `role_courses`, `role_features`, `user_roles`) and a centralized `resolvePermissions(userId)` function that unions role-based grants with existing `courseAccess` records. The existing v9.0 research documents (RBAC-ARCHITECTURE.md, RBAC-STACK.md, RBAC-SUMMARY.md) already provide exhaustive schema definitions, resolver algorithms, and architecture decisions. This phase-specific research validates those findings against the actual codebase and identifies implementation-specific details the planner needs.

The codebase has a proven pattern for join tables with foreign keys, cascade deletes, unique indexes, and Drizzle relations -- the `tags.ts` + `studentTags` schema is nearly identical to the `roles` + `user_roles` structure needed here. The resolver is a pure async function (~100 LOC) that executes 3 parallel queries and returns a `PermissionSet` object. React `cache()` from React 19 provides per-request deduplication with zero configuration.

**Primary recommendation:** Follow the schema exactly as specified in v9.0-RBAC-ARCHITECTURE.md with one correction: use TEXT column (not pgEnum) for `role_features.featureKey` per Decision 6, validated by a Zod enum at the API boundary. Model the `userRoles` table after the existing `studentTags` join table pattern (same structure: uuid PK, two FKs with cascade, unique composite index, assignedBy nullable FK).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 (installed) | Table definitions, queries, relations | Already used for all 27 schema files; pgTable/uuid/text/timestamp patterns proven |
| drizzle-kit | 0.31.8 (installed) | Migration generation | `npm run db:generate` and `npm run db:migrate` workflows established |
| @neondatabase/serverless | 1.0.2 (installed) | HTTP database driver | Same Neon HTTP connector used by entire codebase |
| react (cache) | 19.2.3 (installed) | Per-request deduplication | Built-in React 19 API for server component memoization |
| zod | 4.3.6 (installed) | Feature key validation | Already used in 10+ files for API/form validation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm/pg-core | via drizzle-orm | Column types: uuid, text, boolean, integer, timestamp, pgEnum | All table definitions |
| drizzle-orm (relations) | via drizzle-orm | Drizzle relational queries (one/many) | For Drizzle query builder convenience methods |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom resolver (~100 LOC) | CASL (@casl/ability) | CASL solves ABAC with subject/action/conditions; this is additive set union -- too simple for CASL overhead |
| React cache() | @upstash/redis | Redis adds infrastructure complexity; per-request dedup is sufficient for <1000 users. Add Redis later if p95 > 50ms |
| TEXT + Zod for feature keys | pgEnum | Decision 6 explicitly chose TEXT to avoid Postgres enum rollback limitation (ALTER TYPE ADD VALUE cannot be rolled back) |

**Installation:**
```bash
# No packages to install. Everything is already in package.json.
# The only command needed is Drizzle migration after schema creation:
npm run db:generate
npm run db:migrate
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   ├── roles.ts         # NEW: roles, role_courses, role_features, user_roles tables + relations
│   └── index.ts         # MODIFY: add `export * from "./roles"`
├── lib/
│   ├── permissions.ts   # NEW: resolvePermissions(), PermissionSet, cache wrapper
│   └── auth.ts          # UNCHANGED: hasMinimumRole() stays as-is
└── types/
    └── globals.d.ts     # UNCHANGED: Roles type stays for legacy system
```

### Pattern 1: Join Table with Cascade Deletes (from existing `studentTags`)
**What:** The `studentTags` table pattern is the exact template for `userRoles`.
**When to use:** For all four new join/entity tables.
**Source:** `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/tags.ts`

```typescript
// Existing pattern from tags.ts -- follow this exactly for user_roles
export const studentTags = pgTable(
  "student_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => users.id),
    assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("student_tags_user_tag_unique").on(table.userId, table.tagId),
    index("student_tags_assigned_by_idx").on(table.assignedBy),
  ]
);
```

### Pattern 2: Drizzle Relations with Multiple References to Same Table
**What:** When a table has two FK columns pointing to the same parent table (e.g., `userId` and `assignedBy` both reference `users`), Drizzle requires `relationName` to disambiguate.
**When to use:** For `userRoles` relations (both `userId` and `assignedBy` reference `users`).
**Source:** `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/tags.ts` (lines 80-95)

```typescript
// Existing pattern -- two FKs to users table need relationName
export const studentTagsRelations = relations(studentTags, ({ one }) => ({
  user: one(users, {
    fields: [studentTags.userId],
    references: [users.id],
    relationName: "studentTagUser",      // disambiguation
  }),
  assignedByUser: one(users, {
    fields: [studentTags.assignedBy],
    references: [users.id],
    relationName: "studentTagAssigner",  // disambiguation
  }),
  tag: one(tags, {
    fields: [studentTags.tagId],
    references: [tags.id],
  }),
}));
```

### Pattern 3: React cache() for Per-Request Deduplication
**What:** Wrap the resolver in React `cache()` so multiple calls within the same server render pass return the cached result. The cache key is the userId string argument.
**When to use:** Export the cached version as the primary API. Import and call it from any server component or API route.
**Source:** React 19 official docs (react.dev/reference/react/cache)

```typescript
// src/lib/permissions.ts
import { cache } from "react";

// Internal implementation (not exported)
async function _resolvePermissions(userId: string): Promise<PermissionSet> {
  // ... 3 parallel queries, union logic ...
}

// Exported: cached per-request
export const resolvePermissions = cache(_resolvePermissions);
```

**Important:** `cache()` only deduplicates within a single server request. Different requests get fresh resolutions. The cache key is determined by `Object.is()` comparison of arguments -- since `userId` is a string, this works correctly.

### Pattern 4: canAccessModule() and canAccessLesson() via Course Hierarchy
**What:** The phase success criteria require `canAccessModule()` and `canAccessLesson()` methods. Modules belong to courses (FK `modules.courseId`), lessons belong to modules (FK `lessons.moduleId`). Module/lesson access is derived from course access -- if you have access to the course, you have access to its modules/lessons.
**When to use:** The PermissionSet needs these methods for downstream phases. They require a DB lookup to find the parent courseId.
**Implementation approach:** Two options:
1. **Lazy lookup (recommended):** `canAccessModule(moduleId)` queries DB for the module's courseId, then checks `canAccessCourse(courseId)`. Same for `canAccessLesson(lessonId)` -- lookup lesson -> module -> course, then check course access.
2. **Eager preload:** Load all courseId -> moduleId -> lessonId mappings upfront. Wasteful for single checks, useful only if checking many modules/lessons.

```typescript
// Recommended: lazy lookup with helper functions
async canAccessModule(moduleId: string): Promise<boolean> {
  const mod = await db.query.modules.findFirst({
    where: eq(modules.id, moduleId),
    columns: { courseId: true },
  });
  if (!mod) return false;
  return this.canAccessCourse(mod.courseId);
}

async canAccessLesson(lessonId: string): Promise<boolean> {
  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: { module: { columns: { courseId: true } } },
  });
  if (!lesson) return false;
  return this.canAccessCourse(lesson.module.courseId);
}
```

**Note:** These methods are async (unlike `canAccessCourse()` which is sync after resolution). This is acceptable because they are called at page boundaries, not in tight loops.

### Pattern 5: Existing courseAccess Expiration Pattern
**What:** The codebase already filters expired access with `or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date()))`. The resolver must use the same pattern for `userRoles.expiresAt`.
**When to use:** In the resolver's initial query to load active role assignments.
**Source:** `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/app/(dashboard)/courses/page.tsx` (lines 49-52)

```typescript
// Existing pattern for courseAccess expiration filtering
or(
  isNull(courseAccess.expiresAt),
  gt(courseAccess.expiresAt, new Date())
)

// Apply same pattern to userRoles:
or(
  isNull(userRoles.expiresAt),
  gt(userRoles.expiresAt, new Date())
)
```

### Anti-Patterns to Avoid

- **Storing RBAC permissions in Clerk claims:** Cookie size limit is ~1.2KB. Multiple role IDs + feature sets would overflow. Keep Clerk metadata minimal: only `{ role: "student" | "coach" | "admin" }` for legacy dashboard routing.
- **Using pgEnum for role_features.featureKey:** Decision 6 says TEXT columns. pgEnum ALTER TYPE ADD VALUE cannot be rolled back in a transaction. Use TEXT column with Zod validation at API boundary instead.
- **Calling resolvePermissions() multiple times in same request without cache():** Each call makes 3 parallel DB queries. Always use the cache()-wrapped export.
- **Mixing hasMinimumRole() and resolvePermissions() concerns:** `hasMinimumRole()` = "which dashboard" (student/coach/admin). `resolvePermissions()` = "what content/features". They are orthogonal systems. Never use one where the other belongs.
- **Querying courseAccess directly in new code:** All new code must use `resolvePermissions()`. Direct courseAccess queries bypass role-based access. Existing files migrate incrementally in later phases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-request caching | Custom Map/WeakMap cache | React `cache()` | Built into React 19, handles server request lifecycle automatically, zero configuration |
| Feature key validation | Runtime string checks | Zod enum schema with TypeScript const array | Type-safe at compile time, validated at runtime, single source of truth |
| UUID generation | Manual uuid library | Drizzle `.defaultRandom()` | Database generates UUIDs; no application-side generation needed |
| Access tier comparison | Custom comparison logic | Simple `tier === "full"` check with "full > preview" merge rule | Only two tiers exist; a single ternary handles the merge |

**Key insight:** The permission model is additive-only (union, no deny). This is simpler than what RBAC libraries like CASL solve. A ~100 LOC custom resolver with `Set.has()` and `Map.get()` is clearer and more maintainable than importing a framework.

## Common Pitfalls

### Pitfall 1: pgEnum for Feature Keys
**What goes wrong:** Using `pgEnum("feature_key", [...])` for `role_features.featureKey`. Adding a new feature later requires `ALTER TYPE feature_key ADD VALUE 'new_feature'` which cannot be rolled back within a transaction.
**Why it happens:** The v9.0-RBAC-ARCHITECTURE.md uses pgEnum for feature keys, but Decision 6 (made after that doc) explicitly chose TEXT columns.
**How to avoid:** Use `text("feature_key").notNull()` in the Drizzle schema. Validate with a Zod enum at the API boundary. Define the valid feature keys as a TypeScript `const` array.
**Warning signs:** Any `pgEnum("feature_key"` in the schema file.

### Pitfall 2: Drizzle Relations Name Collision
**What goes wrong:** `userRoles` has two FK columns referencing `users` (userId and assignedBy). Without `relationName`, Drizzle throws "AmbiguousRelation" error.
**Why it happens:** Drizzle cannot infer which FK maps to which relation when multiple point to the same table.
**How to avoid:** Add `relationName: "userRoleUser"` and `relationName: "userRoleAssigner"` to the two `one(users, ...)` calls in relations. Follow the existing `studentTags` pattern exactly.
**Warning signs:** Runtime error about ambiguous relations during `db.query.userRoles.findMany({ with: { user: true } })`.

### Pitfall 3: Resolver Returns Stale Data Across Requests
**What goes wrong:** Using module-level memoization (e.g., `const cache = new Map()`) instead of React `cache()`. This caches across ALL requests, not just the current one, leading to stale permissions.
**Why it happens:** Confusion between module-level singleton (persists across requests in serverless) and request-scoped caching.
**How to avoid:** Use React `cache()` exclusively. It invalidates automatically between server requests. Never use a module-level Map or global variable for permission caching.
**Warning signs:** Permissions don't update after role changes until server restart.

### Pitfall 4: Forgetting to Export from schema/index.ts
**What goes wrong:** New tables defined in `roles.ts` but `export * from "./roles"` not added to `src/db/schema/index.ts`. Drizzle cannot find the tables. Queries fail silently or throw "table not found."
**Why it happens:** Every other schema file in the project is already registered. Easy to forget the new one.
**How to avoid:** Add `export * from "./roles"` to `src/db/schema/index.ts` immediately after creating the file. Run `npm run db:generate` to verify Drizzle picks up the new tables.
**Warning signs:** `drizzle-kit generate` produces no migration SQL.

### Pitfall 5: accessTierEnum Import
**What goes wrong:** Creating a duplicate `accessTierEnum` in `roles.ts` instead of importing from `access.ts`. Postgres rejects duplicate enum type names.
**Why it happens:** The `role_courses` table needs `accessTier` column with the same enum as `courseAccess`.
**How to avoid:** Import `accessTierEnum` from `./access` in `roles.ts`. The codebase already exports it.
**Warning signs:** Migration SQL shows `CREATE TYPE "access_tier"` when it already exists.

### Pitfall 6: canAccessModule/canAccessLesson as Sync Methods
**What goes wrong:** Defining `canAccessModule()` as a synchronous method on PermissionSet when it requires a DB lookup to find the parent courseId.
**Why it happens:** `canAccessCourse()` is sync (checks a Set). The module/lesson variants need a DB query first.
**How to avoid:** Make `canAccessModule()` and `canAccessLesson()` async or provide them as standalone async helper functions rather than methods on the PermissionSet object. The PermissionSet can remain a plain data object with sync methods for what it already knows (courses, features), while module/lesson checks are separate async helpers.
**Warning signs:** Attempting to call `db.query.modules.findFirst()` inside a non-async method.

## Code Examples

### Schema Definition (roles.ts)
Verified pattern derived from existing `tags.ts` + `access.ts` + v9.0-RBAC-ARCHITECTURE.md:

```typescript
// src/db/schema/roles.ts
import {
  pgTable, uuid, text, timestamp, boolean, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { courses } from "./courses";
import { accessTierEnum } from "./access";  // Reuse existing enum

// ---- Tables ----

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),        // TEXT not pgEnum (Decision 6)
  description: text("description"),
  color: text("color").notNull().default("#6b7280"),
  allCourses: boolean("all_courses").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});

export const roleCourses = pgTable("role_courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  accessTier: accessTierEnum("access_tier").notNull().default("full"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("role_courses_role_course_unique").on(table.roleId, table.courseId),
  index("role_courses_role_id_idx").on(table.roleId),
]);

export const roleFeatures = pgTable("role_features", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),   // TEXT not pgEnum (Decision 6)
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("role_features_role_feature_unique").on(table.roleId, table.featureKey),
  index("role_features_role_id_idx").on(table.roleId),
]);

export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => users.id),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_roles_user_role_unique").on(table.userId, table.roleId),
  index("user_roles_user_id_idx").on(table.userId),
  index("user_roles_role_id_idx").on(table.roleId),
]);
```

### Permission Resolver with React cache()
Pattern from React 19 docs + v9.0-RBAC-ARCHITECTURE.md:

```typescript
// src/lib/permissions.ts
import { cache } from "react";
import { db } from "@/db";
import { userRoles, roles, roleCourses, roleFeatures, courseAccess } from "@/db/schema";
import { eq, and, or, isNull, gt, inArray } from "drizzle-orm";

export interface PermissionSet {
  courseIds: Set<string>;
  features: Set<string>;
  accessTiers: Map<string, "preview" | "full">;
  hasWildcardAccess: boolean;
  canAccessCourse(courseId: string): boolean;
  canUseFeature(featureKey: string): boolean;
  getAccessTier(courseId: string): "preview" | "full" | null;
}

async function _resolvePermissions(userId: string): Promise<PermissionSet> {
  // 1. Load active (non-expired) role assignments
  const activeRoles = await db
    .select({ roleId: userRoles.roleId, allCourses: roles.allCourses })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(
      eq(userRoles.userId, userId),
      isNull(roles.deletedAt),
      or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date()))
    ));

  const roleIds = activeRoles.map(r => r.roleId);
  const hasWildcardAccess = activeRoles.some(r => r.allCourses);

  // 2. Parallel fetch: role-courses, role-features, direct course_access
  const [roleCourseRows, roleFeatureRows, directGrants] = await Promise.all([
    hasWildcardAccess ? Promise.resolve([]) :
      roleIds.length > 0 ? db.select({ courseId: roleCourses.courseId, accessTier: roleCourses.accessTier })
        .from(roleCourses).where(inArray(roleCourses.roleId, roleIds)) : Promise.resolve([]),
    roleIds.length > 0 ? db.select({ featureKey: roleFeatures.featureKey })
      .from(roleFeatures).where(inArray(roleFeatures.roleId, roleIds)) : Promise.resolve([]),
    db.select({ courseId: courseAccess.courseId, accessTier: courseAccess.accessTier })
      .from(courseAccess).where(and(
        eq(courseAccess.userId, userId),
        or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date()))
      )),
  ]);

  // 3. Build permission set (union all sources)
  const courseIds = new Set<string>();
  const features = new Set<string>();
  const accessTiers = new Map<string, "preview" | "full">();

  for (const row of roleCourseRows) {
    courseIds.add(row.courseId);
    const current = accessTiers.get(row.courseId);
    if (!current || row.accessTier === "full") accessTiers.set(row.courseId, row.accessTier);
  }
  for (const row of roleFeatureRows) features.add(row.featureKey);
  for (const row of directGrants) {
    courseIds.add(row.courseId);
    const current = accessTiers.get(row.courseId);
    if (!current || row.accessTier === "full") accessTiers.set(row.courseId, row.accessTier);
  }

  return {
    courseIds, features, accessTiers, hasWildcardAccess,
    canAccessCourse: (id) => hasWildcardAccess || courseIds.has(id),
    canUseFeature: (key) => features.has(key),
    getAccessTier: (id) => hasWildcardAccess ? "full" : accessTiers.get(id) ?? null,
  };
}

export const resolvePermissions = cache(_resolvePermissions);
```

### Feature Key Constants with Zod Validation
```typescript
// Defined alongside permissions or in a shared constants file
export const FEATURE_KEYS = [
  "ai_conversation",
  "practice_sets",
  "dictionary_reader",
  "listening_lab",
  "video_threads",
  "certificates",
  "ai_chat",
] as const;

export type FeatureKey = typeof FEATURE_KEYS[number];

// Zod schema for API validation
import { z } from "zod";
export const featureKeySchema = z.enum(FEATURE_KEYS);
```

### canAccessModule / canAccessLesson Helpers
```typescript
// Async helpers (not methods on PermissionSet)
import { db } from "@/db";
import { modules, lessons } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function canAccessModule(
  permissions: PermissionSet,
  moduleId: string
): Promise<boolean> {
  const mod = await db.query.modules.findFirst({
    where: eq(modules.id, moduleId),
    columns: { courseId: true },
  });
  if (!mod) return false;
  return permissions.canAccessCourse(mod.courseId);
}

export async function canAccessLesson(
  permissions: PermissionSet,
  lessonId: string
): Promise<boolean> {
  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: { module: { columns: { courseId: true } } },
  });
  if (!lesson) return false;
  return permissions.canAccessCourse(lesson.module.courseId);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pgEnum for all restricted strings | TEXT + Zod validation | Decision 6 (this milestone) | Avoids irreversible ALTER TYPE ADD VALUE migrations |
| Direct courseAccess queries in ~50 files | Centralized resolvePermissions() | This phase (new) | Single source of truth for access; incremental migration |
| No feature gating | Feature keys as TEXT with Zod enum | This phase (new) | Enables per-role feature toggles in Phase 64+ |
| useMemo for caching | React cache() for server components | React 19 (2024) | Request-scoped, automatic lifecycle, no manual invalidation |

**Deprecated/outdated:**
- `useMemo` for cross-component deduplication: Only works within a single component. `cache()` works across components in the same server render.
- pgEnum for dynamic values: Cannot be rolled back. TEXT + application validation is the safer approach for values that may change.

## Open Questions

1. **canAccessModule/canAccessLesson as PermissionSet methods vs standalone helpers**
   - What we know: The phase success criteria say PermissionSet must have `canAccessModule()` and `canAccessLesson()` methods. But these require async DB lookups (module -> courseId, lesson -> moduleId -> courseId).
   - What's unclear: Should PermissionSet be a class with async methods, or should we use standalone async helper functions that accept a PermissionSet argument?
   - Recommendation: Use standalone async helpers (`canAccessModule(permissions, moduleId)`) rather than class methods. This keeps PermissionSet as a plain serializable object with sync methods for what it already knows (courses, features). The helpers import `db` directly. This matches the codebase style (no classes, all functions). The success criteria is satisfied either way -- the API surface exists.

2. **Feature key list finality**
   - What we know: 7 feature keys identified in research: `ai_conversation`, `practice_sets`, `dictionary_reader`, `listening_lab`, `video_threads`, `certificates`, `ai_chat`.
   - What's unclear: Whether this list is final or will be refined in Phase 64 (Permission Builder).
   - Recommendation: Define the 7 keys now. They are validated by Zod at the API boundary, so adding a new key is a one-line code change + zero migration (TEXT column, not pgEnum). No risk in shipping with this list.

3. **Resolver behavior when user has zero roles AND zero courseAccess**
   - What we know: Resolver unions both sources. If both are empty, the PermissionSet has empty courseIds and features.
   - What's unclear: Whether this should be a special case (e.g., return a "no access" sentinel).
   - Recommendation: Return a normal PermissionSet with empty sets. `canAccessCourse()` returns false, `canUseFeature()` returns false. No special case needed. Callers already handle "no access" via redirects.

## Sources

### Primary (HIGH confidence)
- Existing codebase files (verified):
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/tags.ts` -- studentTags join table pattern (template for userRoles)
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/access.ts` -- courseAccess table, accessTierEnum (reused)
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/users.ts` -- users table, roleEnum
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/courses.ts` -- courses, modules, lessons hierarchy
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/schema/index.ts` -- schema barrel exports
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/db/index.ts` -- Neon HTTP driver with server-only guard
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/src/lib/auth.ts` -- resolveRole(), hasMinimumRole(), getCurrentUser()
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/drizzle.config.ts` -- migration config
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/package.json` -- dependency versions verified
- Context7 `/drizzle-team/drizzle-orm-docs` -- pgTable, references, onDelete cascade, index patterns
- Context7 `/websites/react_dev` -- React cache() API, per-request memoization, shared module pattern
- Prior v9.0 research:
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/research/v9.0-RBAC-ARCHITECTURE.md` -- full schema + resolver design
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/research/v9.0-RBAC-STACK.md` -- zero-dependency stack decision
  - `/Users/sheldonho/Documents/CLAUDE/New-LMS/.planning/research/v9.0-RBAC-SUMMARY.md` -- phase structure + pitfalls

### Secondary (MEDIUM confidence)
- React cache() official docs (react.dev/reference/react/cache) -- verified via Context7
- Drizzle ORM official docs (orm.drizzle.team) -- foreign keys, cascade, indexes verified via Context7

### Tertiary (LOW confidence)
- None. All findings verified against codebase and official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, all patterns proven in 27 existing schema files
- Architecture: HIGH -- prior v9.0 research is exhaustive, validated against actual codebase code paths
- Pitfalls: HIGH -- all pitfalls verified against existing code patterns and Decision 6 constraints

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- Drizzle ORM, React cache(), and Postgres schema patterns change infrequently)
