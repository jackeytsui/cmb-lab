# Feature Landscape: Discord-Style RBAC for CantoMando LMS

**Domain:** Role-based access control for a tiered language learning platform
**Researched:** 2026-02-14
**Overall confidence:** HIGH (well-established patterns, existing codebase thoroughly analyzed)

---

## Current System Baseline

Before defining RBAC features, here is what exists today and what it constrains:

| Existing Concept | Implementation | RBAC Impact |
|-----------------|----------------|-------------|
| User roles | `roleEnum: student/coach/admin` on `users` table | Hierarchical, single-role-per-user. Governs dashboard routing only. |
| Course access | `course_access` table (userId + courseId + accessTier + expiresAt) | Per-course grants. Webhook, coach, or admin sourced. Already supports expiration. |
| Access tiers | `accessTierEnum: preview/full` | Binary content gating per course. `previewLessonCount` on courses table. |
| Auth checks | `hasMinimumRole("coach")` / `checkRole("admin")` in ~135 files | Server-side, role-hierarchy-based. Controls coach/admin UI access. |
| Feature access | None -- all students with course access get ALL features | No feature-level gating exists for AI bot, dictionary, practice, video threads, listening lab. |
| Tags | `tags` + `student_tags` with auto-tag rules | Organizational/CRM labels, not access-controlling. |
| Enrollment | Webhook at `/api/webhooks/enroll` receives email + courseId | 1:1 mapping: one webhook call = one course access row. |
| Bulk operations | `assign_course` / `remove_course` / `add_tag` / `remove_tag` per student | Operates on individual course_access rows. |

**Key pain point:** A coach who wants "Bronze tier = Courses A+B" and "Premium = all courses + AI conversation + practice sets" must currently make N separate course_access grants per student and has NO way to gate features like AI conversations or practice sets by tier.

---

## Table Stakes

Features users expect from a role/tier packaging system. Missing any = product feels broken for the stated use case.

### TS-1: Named Roles (Packages/Tiers)

| Attribute | Value |
|-----------|-------|
| **What** | Coach/admin can create named roles like "Bronze", "Silver", "Premium", "Trial" with a description and color |
| **Why Expected** | The entire point of the system. Without named roles, there is nothing to assign. |
| **Complexity** | Low |
| **Dependencies** | None (new `roles` table) |
| **Integration Points** | Admin UI for CRUD, displayed on student profile cards, student dashboard |

A role is a named bundle of permissions. Following the Discord pattern, roles are **additive** -- a user can have multiple roles and their effective permissions are the union of all assigned roles' permissions. This is the standard pattern across Discord, Azure RBAC, Auth0, and every major platform.

### TS-2: Role-to-Course Mapping

| Attribute | Value |
|-----------|-------|
| **What** | Each role grants access to zero or more courses. "Bronze" grants [Course A, Course B]. "Premium" grants [All courses]. |
| **Why Expected** | This is the core use case: packaging courses into tiers instead of managing per-student per-course rows. |
| **Complexity** | Low |
| **Dependencies** | TS-1 (roles exist), existing `courses` table |
| **Integration Points** | Replaces direct `course_access` for role-derived access. Legacy `course_access` rows remain for individual overrides. |

Implementation: a `role_courses` join table (roleId + courseId). When resolving "does this student have access to Course X?", check: (a) any assigned role grants Course X, OR (b) a direct `course_access` row exists (legacy/override). Union model.

### TS-3: Role Assignment to Students

| Attribute | Value |
|-----------|-------|
| **What** | Admin/coach can assign one or more roles to a student. Roles stack additively (like Discord). |
| **Why Expected** | Roles are useless without assignment. Must support multiple roles per student (e.g., "Bronze" + "AI Add-on"). |
| **Complexity** | Low |
| **Dependencies** | TS-1 (roles exist) |
| **Integration Points** | Student profile page, bulk operations, enrollment webhook |

Implementation: `user_roles` join table (userId + roleId + assignedBy + assignedAt + expiresAt). The expiresAt column is nullable (null = permanent). This mirrors the existing `course_access` pattern.

### TS-4: Permission Resolver

| Attribute | Value |
|-----------|-------|
| **What** | A centralized function that computes a student's effective permissions from all their roles + direct grants. Returns a resolved permission set. |
| **Why Expected** | Every page/API that checks access needs one function to call, not scattered logic. This is the most architecturally critical feature. |
| **Complexity** | Moderate |
| **Dependencies** | TS-1, TS-2, TS-3, TS-5 |
| **Integration Points** | Replaces ~50 files that currently query `courseAccess` directly. Becomes the single source of truth for "can this user do X?" |

The resolver must:
1. Gather all roles assigned to user (filtering expired role assignments)
2. Union all courses from all roles (including "all courses" wildcard)
3. Union all feature permissions from all roles
4. Merge with any direct `course_access` overrides (backward compatibility)
5. Return a typed object: `{ courses: Set<courseId>, features: Set<featureKey>, accessTiers: Map<courseId, 'preview' | 'full'> }`
6. Be cacheable per-request (not globally, since roles can change between requests)

Existing `hasMinimumRole` stays unchanged -- it controls coach/admin dashboard access, which is orthogonal to student RBAC.

### TS-5: Feature-Level Permissions

| Attribute | Value |
|-----------|-------|
| **What** | Roles can grant access to platform features beyond courses: AI conversation bot, practice sets, dictionary/reader, video listening lab, certificates, video threads, AI chat. |
| **Why Expected** | The stated use case is "Premium = all courses + features." Without feature gating, roles are just course bundles and miss half the value. |
| **Complexity** | Moderate |
| **Dependencies** | TS-1 (roles exist), TS-4 (resolver) |
| **Integration Points** | Every feature entry point (~8 locations) needs a permission check |

Feature permissions use a fixed enum, NOT arbitrary permission strings. Based on the existing codebase, the gatable features are:

| Feature Key | Current Entry Points | Notes |
|------------|---------------------|-------|
| `ai_conversation` | VoiceConversation component, `/api/realtime/token` | Real-time AI voice practice |
| `practice_sets` | `/practice/[setId]`, `/dashboard/practice` | Coach-created exercises |
| `dictionary_reader` | `/dashboard/reader`, `/dashboard/vocabulary` | Text reader with dictionary lookup |
| `listening_lab` | `/dashboard/listening` | YouTube listening exercises |
| `video_threads` | `/dashboard/threads` | Video conversation threads |
| `certificates` | Certificate generation endpoints | Completion certificates |
| `ai_chat` | `/api/chat`, floating chatbot | Text-based AI assistant |

Storage: a `role_features` join table (roleId + featureKey). If ANY of a student's roles includes a feature, the student has it (additive union). No explicit "deny" -- absence of a feature in all roles means no access.

### TS-6: Role Expiration

| Attribute | Value |
|-----------|-------|
| **What** | Role assignments can have an optional expiration date. After expiry, the role no longer contributes to the student's permissions. |
| **Why Expected** | Already exists on `course_access.expiresAt`. Subscriptions, trial periods, and seasonal access all require temporal roles. This is not a new concept for this codebase. |
| **Complexity** | Low |
| **Dependencies** | TS-3 (role assignment has `expiresAt` column) |
| **Integration Points** | Resolver (TS-4) filters out expired assignments. Admin UI shows expiration date. |

This is NOT auto-revocation (no background job deleting rows). The resolver simply ignores expired assignments at query time, exactly like the current `course_access` pattern: `or(isNull(expiresAt), gt(expiresAt, new Date()))`.

### TS-7: Admin/Coach Role Management UI

| Attribute | Value |
|-----------|-------|
| **What** | Admin pages to create/edit/delete roles, assign courses and features to roles, and view which students hold each role. Coach-accessible pages to assign/remove roles on their students. |
| **Why Expected** | The system is useless without a UI. Coaches are the primary users -- they need to manage student packages without SQL or API calls. |
| **Complexity** | Moderate |
| **Dependencies** | TS-1 through TS-6 all must exist for the UI to have something to manage |
| **Integration Points** | Existing admin layout (`/admin/*`), existing student detail page (`/admin/students/[id]`), existing coach students page (`/coach/students`) |

Two UI surfaces:
1. **Role builder** (`/admin/roles` or `/admin/roles/[roleId]`): Create role with name/description/color, toggle courses, toggle features. List view showing all roles with student count.
2. **Student role assignment**: On existing student detail page, section showing current roles with add/remove. On coach students page, role assignment in student row or detail.

### TS-8: Webhook Enrollment with Role Assignment

| Attribute | Value |
|-----------|-------|
| **What** | The enrollment webhook (`/api/webhooks/enroll`) accepts a `roleId` or `roleName` in addition to (or instead of) `courseId`. Assigning a role via webhook grants all the role's courses and features at once. |
| **Why Expected** | The webhook is how GoHighLevel triggers enrollment after purchase. If roles exist but the webhook only knows about individual courses, the automation is broken. |
| **Complexity** | Low |
| **Dependencies** | TS-1, TS-3 |
| **Integration Points** | Existing webhook route (modify, not replace) |

**Backward compatible:** If `courseId` is provided without `roleId`, fall back to direct course_access (legacy behavior). If `roleId` is provided, assign the role. If both are provided, do both. This ensures existing GHL workflows continue working during migration.

---

## Differentiators

Features that set the product apart. Not expected from a basic RBAC system, but high value.

### D-1: Wildcard Course Access on Roles

| Attribute | Value |
|-----------|-------|
| **What** | A role can be flagged "all courses" instead of listing specific courses. New courses added later are automatically included. |
| **Value Proposition** | Eliminates maintenance burden for premium/VIP tiers. Coach creates "VIP" once and never has to update it when new courses are published. |
| **Complexity** | Low |
| **Dependencies** | TS-2 |

Implementation: a boolean `allCourses` column on the `roles` table. The resolver checks this flag before querying `role_courses`. Trivially cheap to implement but saves ongoing admin effort.

### D-2: Role Stacking Visualization

| Attribute | Value |
|-----------|-------|
| **What** | On the student profile, a visual breakdown showing "This student has access to Course A because of [Bronze], AI Chat because of [AI Add-on]" -- attributing each permission to the role that grants it. |
| **Value Proposition** | Critical for debugging "why can/can't this student see X?" when multiple roles stack. Discord's role debug view is one of its most praised features. |
| **Complexity** | Moderate |
| **Dependencies** | TS-4 (resolver must return attribution data, not just boolean access) |

The resolver needs to track which role contributed which permission. Instead of just returning `Set<courseId>`, return `Map<courseId, roleId[]>`.

### D-3: Bulk Role Assignment

| Attribute | Value |
|-----------|-------|
| **What** | Extend existing bulk operations to support `assign_role` and `remove_role`, allowing a coach to apply a tier to 50+ students at once. |
| **Value Proposition** | Coaches running cohorts onboard batches, not individuals. Without this, they click one student at a time. |
| **Complexity** | Low |
| **Dependencies** | TS-3, existing bulk operations infrastructure (`bulkSchema`, `/api/admin/students/bulk`) |

The existing `bulkSchema` already supports four operation types. Adding two more (`assign_role`, `remove_role`) follows the exact same validated pattern. The bulk operations table already logs operations with undo support.

### D-4: Role-Based Access Tier Override

| Attribute | Value |
|-----------|-------|
| **What** | Roles can specify an access tier (preview/full) per course, not just binary grant/deny. A "Trial" role grants preview access to all courses while "Premium" grants full. |
| **Value Proposition** | Enables trial/freemium funnels without separate course_access rows per student. |
| **Complexity** | Moderate |
| **Dependencies** | TS-2, existing `accessTierEnum` on `course_access` |

Implementation: `role_courses` table gets an `accessTier` column (default: `full`). When a student has multiple roles granting the same course with different tiers, resolver picks the highest tier (full > preview). This mirrors how existing `course_access` works but at the role level.

### D-5: Student-Facing Tier Display

| Attribute | Value |
|-----------|-------|
| **What** | Students see their current role/tier name on their dashboard with clear indication of what is included vs locked. Locked features show upgrade prompts instead of being invisibly hidden. |
| **Value Proposition** | Drives upsells. Students see "Practice Sets [Premium feature]" and know what they are missing. Hidden features generate no demand; visible-but-locked features do. |
| **Complexity** | Moderate |
| **Dependencies** | TS-4 (resolver), TS-5 (feature permissions) |

UI patterns:
- Dashboard sidebar shows role badge(s): "Bronze Member"
- Locked features show a lock icon + role name needed: "Unlock with Premium"
- Feature pages show gated state with upgrade CTA instead of 404/redirect

### D-6: Role Templates (Preset Roles)

| Attribute | Value |
|-----------|-------|
| **What** | System ships with pre-built role configurations: "Free Trial" (preview access, limited features), "Standard" (selected courses, core features), "Premium" (all courses, all features). Coach can clone and customize. |
| **Value Proposition** | Reduces setup from "design your own RBAC" to "pick a template and tweak." |
| **Complexity** | Low |
| **Dependencies** | TS-1, TS-7 (UI to create from template) |

Implementation: seed data + "Clone role" button in the admin UI. No special infrastructure needed.

### D-7: Migration Tool (Course Access to Roles)

| Attribute | Value |
|-----------|-------|
| **What** | A one-time admin tool that analyzes existing `course_access` rows, groups students by common access patterns, suggests roles to create, and migrates students to the new roles. |
| **Value Proposition** | Smooth transition from old system. Without this, the admin manually re-creates every student's access as roles. |
| **Complexity** | Moderate |
| **Dependencies** | TS-1, TS-3, existing course_access data |

The migration tool:
1. Queries all distinct (courseId set) combinations from course_access
2. Shows: "42 students have access to [Course A, Course B]. Suggested role: 'Bronze'"
3. Coach names the role, confirms courses/features, clicks "Create & Migrate"
4. Tool creates the role, assigns it to those 42 students, optionally archives the course_access rows

### D-8: GHL/Webhook Role Name Lookup

| Attribute | Value |
|-----------|-------|
| **What** | Webhook accepts `roleName` (string) in addition to `roleId` (UUID), doing a case-insensitive lookup. This allows GHL automations to use human-readable names like "Premium" instead of UUIDs. |
| **Value Proposition** | GHL workflows are configured by coaches, not developers. Typing "Premium" is far easier than pasting a UUID. |
| **Complexity** | Low |
| **Dependencies** | TS-8 (webhook role support) |

---

## Anti-Features

Features to explicitly NOT build. Each would add complexity without proportional value for this use case.

### AF-1: Arbitrary Permission Strings

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Letting admins create custom permission keys like `can_view_lesson_3_on_tuesdays` | Explodes complexity. Hard to enforce, impossible to validate, a nightmare to debug. This is the #1 RBAC anti-pattern: "over-fine-grained permissions" leads to unmanageable systems. | Use a fixed feature enum defined in code. Features map 1:1 to actual platform capabilities. Adding a new feature means adding a new enum value in a code change, not admin configuration. |

### AF-2: Per-Lesson/Per-Module Permission Overrides

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Granting/denying access to individual lessons or modules within a course, like Discord's channel overrides | This LMS has ~10 courses and ~100 lessons. The complexity of per-lesson permissions is not justified. Permission resolution becomes O(lessons) instead of O(roles). It also breaks the existing linear lesson unlock flow (`checkLessonUnlock`). | Gate at the course level. If specific lessons need restriction, group them into a separate course. The existing `previewLessonCount` already handles the "first N lessons free" pattern. |

### AF-3: Explicit Deny Permissions

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Three-state permission system (allow/deny/inherit) where "deny" overrides "allow" from other roles | This is Discord's most confusing feature. Non-technical coaches will not understand why a permission is denied when one role grants it. The three-state model is the #1 source of RBAC bugs. | Pure additive model only. If a student should not have a permission, do not assign them a role that grants it. To revoke, remove the role. |

### AF-4: Role Hierarchy with Inheritance

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| "Premium inherits from Silver which inherits from Bronze" -- hierarchical role chains | Inheritance chains create invisible permission dependencies. Editing Bronze silently changes Premium behavior. Coaches will not understand why modifying one role affects students on a different role. Every RBAC guide warns about this for small-team systems. | Flat roles with explicit permissions. If Premium should include everything Bronze has, list the same courses and features on both. The data duplication is trivial (a few join table rows); the clarity is worth it. |

### AF-5: Dynamic/Conditional Permissions

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| "Access feature X only if student has completed Y% of course" or "Access AI bot only during business hours" or "Grant premium after 30 consecutive login days" | Mixes business logic into the permission layer. Makes permission resolution unpredictable, un-cacheable, and impossible to explain to coaches. | Keep RBAC static: a student either has a feature or does not. Progress-gating (the existing `checkLessonUnlock`) remains a separate concern. Engagement rewards are handled by the XP/streak system, not by permissions. |

### AF-6: Per-Student Feature Overrides

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| "Give student X the AI bot even though their role does not include it" as a direct per-student feature grant | Creates a shadow permission system parallel to roles. Debugging "why does this student have X?" becomes impossible when both roles AND individual feature overrides exist. | Keep direct `course_access` for course-level individual overrides (it already exists and is backward-compatible). For feature access, manage exclusively through roles. If one student needs a special feature, create a small "AI Add-on" role and assign it. Roles are cheap to create. |

### AF-7: Real-Time Permission Push

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| WebSocket/SSE push to immediately reflect permission changes in the student's active browser session | Enormous infrastructure complexity for a rare event. Permission changes happen when coaches edit settings, not while students are mid-lesson. The edge case of "student is on AI chat page when their role is removed" does not justify WebSocket infrastructure. | Resolve permissions on each page load / API call (the current pattern). One stale page session after a role change is acceptable. The next navigation or API call picks up the change. |

### AF-8: Role-Based UI Theming

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Different dashboard layouts, colors, or navigation based on role tier ("Premium students get a dark gold theme") | Maintenance nightmare multiplied by the number of roles. Every UI change needs testing across all role themes. Adds zero learning value. | Show role badge/name on the dashboard (D-5). Use the role color for the badge, not the entire UI. |

---

## Feature Dependencies

```
TS-1 (Named Roles) ─────────────────────────────────────────────┐
  |                                                               |
  ├── TS-2 (Role-to-Course Mapping) ──────────────────┐          |
  |                                                    |          |
  ├── TS-3 (Role Assignment to Students) ─────────────┤          |
  |                                                    |          |
  ├── TS-5 (Feature-Level Permissions) ───────────────┤          |
  |                                                    |          |
  └── TS-6 (Role Expiration) ─────────────────────────┤          |
                                                       |          |
                                               TS-4 (Permission Resolver)
                                                       |
                                        ┌──────────────┼──────────────┐
                                        |              |              |
                                 TS-7 (Admin UI)  TS-8 (Webhook)  Feature Gating
                                        |              |          (enforcement in
                                        |              |           ~8 entry points)
                                        |              |
                                   D-3 (Bulk)     D-8 (Name Lookup)
                                   D-6 (Templates)
                                   D-7 (Migration)

Standalone (depends on TS-2 only):
  D-1 (Wildcard "all courses" flag)
  D-4 (Access tier per role-course)

Depends on TS-4 resolver output:
  D-2 (Stacking Visualization)
  D-5 (Student-Facing Tier Display)
```

**Critical path:** TS-1 -> TS-2 + TS-3 + TS-5 + TS-6 -> TS-4 -> TS-7 + TS-8 + Feature Enforcement

Everything flows from the role definition (TS-1) through the resolver (TS-4) to the UI and enforcement layers.

---

## MVP Recommendation

### Phase 1: Schema + Resolver Foundation

**Build:** TS-1, TS-2, TS-3, TS-5, TS-6, TS-4, D-1

Rationale: Build the entire data model and permission resolver in one phase. Include the wildcard flag (D-1) because it is a single boolean column with no extra complexity. This phase has zero UI -- it is testable via seed data, database queries, and API tests.

**Delivers:** Roles exist in the database. The resolver can compute any student's effective permissions. All downstream features have a foundation to build on.

### Phase 2: Admin UI + Role Management

**Build:** TS-7, D-6, D-3

Rationale: Coaches need to create and manage roles before anything is enforced. Include role templates (D-6) as seed data. Include bulk role assignment (D-3) because the infrastructure already exists in the bulk operations system.

**Delivers:** Coaches can create roles, configure their courses and features, assign roles to individual or bulk students.

### Phase 3: Webhook + Feature Enforcement + Student Experience

**Build:** TS-8, D-8, Feature gating enforcement, D-5

Rationale: Wire up the webhook for automated enrollment via roles. Enforce feature permissions across all ~8 entry points (the actual "gates"). Add student-facing tier display so locked features show upgrade prompts.

**Delivers:** End-to-end RBAC is live. GHL can assign roles via webhook. Features are gated. Students see their tier and what is locked.

### Phase 4: Migration + Attribution + Polish

**Build:** D-7, D-2, D-4

Rationale: Migrate existing students from course_access to roles. Add role stacking visualization for debugging. Add access tier overrides per role-course if trial funnels are needed.

**Delivers:** Smooth transition for existing students. Full debugging tools. Production-ready RBAC.

### Defer Indefinitely

None of the anti-features (AF-1 through AF-8). These are not deferred -- they are explicitly rejected.

---

## Impact on Existing System

This section maps how the RBAC system integrates with (and modifies) existing code.

### Files That Need Modification

| Category | Approximate Count | Change Type |
|----------|-------------------|-------------|
| Course access queries (`courseAccess` joins) | ~50 files | Replace with resolver call or add resolver as alternative path |
| Feature entry points (pages + API routes) | ~8 features, ~16 files | Add `resolvePermissions().features.has(key)` check |
| Enrollment webhook | 1 file | Add `roleId`/`roleName` handling |
| Bulk operations | 2 files (schema + route) | Add `assign_role`/`remove_role` operations |
| Student profile pages | 2-3 files | Show role badges, role management UI |
| Admin layout/navigation | 1-2 files | Add "Roles" nav item |

### Backward Compatibility

The migration strategy is **additive, not destructive**:

1. `course_access` table stays. It becomes the "individual override" layer.
2. `hasMinimumRole` stays. It controls coach/admin dashboard access (unchanged).
3. The resolver checks both roles AND course_access, unioning the results.
4. Existing webhook payload with `courseId` continues working.
5. No existing functionality breaks during rollout.

### The `hasMinimumRole` Distinction

The existing `hasMinimumRole("coach")` / `hasMinimumRole("admin")` pattern is NOT part of the RBAC system. It controls which dashboard a user sees (student vs coach vs admin). The new RBAC controls what a STUDENT can access within the student experience. These are orthogonal concerns and should remain separate.

---

## Sources

- [Discord Roles and Permissions](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions) -- additive permission stacking model
- [Discord Permission Hierarchy](https://support.discord.com/hc/en-us/articles/206141927-How-is-the-permission-hierarchy-structured) -- hierarchy design principles
- [How Discord Built Access (Permit.io)](https://www.permit.io/blog/how-discord-built-access-an-authorization-management-portal) -- internal RBAC portal design
- [How to Design an RBAC System (NocoBase)](https://www.nocobase.com/en/blog/how-to-design-rbac-role-based-access-control-system) -- role hierarchy and inheritance patterns
- [RBAC in LMS (TheLearningOS)](https://www.thelearningos.com/enterprise-knowledge/role-based-access-control-in-lms-a-comprehensive-guide) -- LMS-specific RBAC guide
- [Managing User Roles in LMS (eLearning Industry)](https://elearningindustry.com/best-practices-for-managing-user-roles-and-permissions-in-your-lms) -- least privilege, role management best practices
- [How to Build an RBAC Layer (Oso)](https://www.osohq.com/learn/rbac-role-based-access-control) -- permission resolution patterns, anti-patterns
- [Auth0 RBAC Docs](https://auth0.com/docs/manage-users/access-control/rbac) -- additive union model documentation
- [Azure RBAC (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/role-based-access-control/overview) -- union-based stacking, deny assignments
- [Enterprise Ready RBAC Guide](https://www.enterpriseready.io/features/role-based-access-control/) -- SaaS tier mapping to roles
- [Tutor LMS Subscriptions](https://tutorlms.com/blog/tutor-lms-subscriptions-memberships/) -- course bundle subscription patterns
- [RBAC Multiple Group Assignments (Nerdio)](https://nmehelp.getnerdio.com/hc/en-us/articles/26124385542797-Role-based-Access-Control-RBAC-Multiple-Group-Assignments) -- multi-role resolution
- Codebase analysis: `src/db/schema/access.ts`, `src/lib/auth.ts`, `src/app/api/webhooks/enroll/route.ts`, `src/app/api/admin/students/bulk/route.ts`, and ~50 files querying `courseAccess` directly

---

*Feature research for: CantoMando Blueprint - Discord-Style RBAC*
*Researched: 2026-02-14*
*Confidence: HIGH*
