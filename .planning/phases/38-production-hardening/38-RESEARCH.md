# Phase 38: Production Hardening - Research

**Researched:** 2026-02-07
**Domain:** Build pipeline, DB optimization, security headers, environment config, loading states, lint
**Confidence:** HIGH

## Summary

Phase 38 addresses seven production-readiness concerns discovered through the v5.0 planning audit. The build currently fails because Clerk-authenticated server components attempt static generation at build time (no Clerk publishable key available). Database tables have 20+ foreign keys without indexes, which will degrade query performance as data grows. Security headers (CSP, HSTS, Permissions-Policy) are partially configured but missing critical directives. The `.env.example` is stale (lists only 10 of 22+ required variables). Loading states need updating for the new sidebar layout. And 72 lint issues (28 errors, 44 warnings) need triage.

This is a "fix what exists" phase with no new libraries to install. All work uses existing tools: Next.js config, Drizzle schema modifications, ESLint. The build fix is the critical path -- everything else is parallel.

**Primary recommendation:** Fix the build first (`export const dynamic = "force-dynamic"` on the dashboard layout), then handle DB indexes, security headers, env docs, loading states, and lint in parallel waves.

## Standard Stack

No new libraries needed. All work uses the existing stack:

### Core
| Library | Version | Purpose | How Used in Phase 38 |
|---------|---------|---------|---------------------|
| Next.js | 16.1.4 | Framework | `force-dynamic` layout export, security headers in `next.config.ts` |
| Drizzle ORM | (current) | Database | `index()` declarations in schema files, migration generation |
| ESLint | (current) | Linting | Fix errors, suppress edge cases with `eslint-disable` |

### Supporting
| Library | Version | Purpose | How Used |
|---------|---------|---------|----------|
| drizzle-kit | (current) | Migration tool | `npm run db:generate` after adding indexes |
| @clerk/nextjs | ^6.36.10 | Auth | CSP domains, force-dynamic requirement |
| @upstash/redis | (current) | Rate limiting | Env vars for `.env.example` |

### Alternatives Considered
None -- this phase uses only existing tools.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Pattern 1: Force-Dynamic Layout for Clerk Pages
**What:** Export `dynamic = "force-dynamic"` from the dashboard layout to prevent static generation of all Clerk-authenticated pages.
**When to use:** When an entire route group uses `auth()` or `currentUser()` at render time.
**Why:** The build error (`Missing publishableKey`) occurs because Next.js tries to statically generate pages that call Clerk's `auth()`. The dashboard layout already calls `auth()`, so making it force-dynamic propagates to all child pages.

```typescript
// Source: Next.js docs (https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
// src/app/(dashboard)/layout.tsx
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }) {
  const { userId } = await auth();
  // ...
}
```

**Confidence:** HIGH -- verified via Context7 Next.js docs and confirmed by the exact build error output.

### Pattern 2: Drizzle Index Declaration
**What:** Add `index()` calls in the table's third argument (the callback returning an array).
**When to use:** On every foreign key column that doesn't already have a unique constraint (unique constraints auto-create indexes).

```typescript
// Source: Drizzle ORM docs (https://rqbv2.drizzle-orm-fe.pages.dev/docs/indexes-constraints)
import { index, pgTable, uuid, text } from "drizzle-orm/pg-core";

export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  // ...
}, (table) => [
  index("modules_course_id_idx").on(table.courseId),
]);
```

**Confidence:** HIGH -- verified via Context7 Drizzle ORM docs, and the `notifications.ts` schema already uses this exact pattern.

### Pattern 3: Security Headers in next.config.ts
**What:** Add CSP, HSTS, and Permissions-Policy headers in the existing `headers()` function.
**When to use:** Applied globally via the `/(.*)`  source pattern.

```typescript
// Source: Next.js docs (https://nextjs.org/docs/app/guides/content-security-policy)
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://img.clerk.com https://image.mux.com;
  font-src 'self';
  connect-src 'self' https://*.clerk.accounts.dev https://api.openai.com https://stream.mux.com;
  frame-src https://challenges.cloudflare.com;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`;
```

**Confidence:** MEDIUM -- Clerk domain patterns depend on the user's specific Clerk instance URL (`.clerk.accounts.dev` for development, custom domain for production). The exact FAPI hostname must be confirmed from the user's Clerk dashboard.

### Pattern 4: Loading State inside Sidebar Layout
**What:** Loading.tsx files render inside the `<main>` area of the sidebar layout (they replace page content, not the whole shell).
**When to use:** Every page directory should have a loading.tsx that provides skeleton UI matching the page's structure.

```typescript
// Loading states render inside SidebarInset > main
// They should NOT include sidebar or header -- those are in layout.tsx
export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Skeleton className="h-9 w-72 bg-zinc-800" />
      {/* page-specific skeletons */}
    </div>
  );
}
```

**Confidence:** HIGH -- verified from existing loading.tsx files in the codebase (dashboard, coach, admin).

### Anti-Patterns to Avoid
- **Adding force-dynamic per page:** Don't add `export const dynamic = "force-dynamic"` to each of ~41 page files. Add it once to the `(dashboard)/layout.tsx`.
- **Creating indexes with raw SQL:** Don't write SQL migrations by hand. Declare indexes in Drizzle schema and use `npm run db:generate` to auto-create the migration.
- **Overly strict CSP in dev mode:** Include `'unsafe-eval'` in dev mode for Next.js hot reload. Use `process.env.NODE_ENV` to differentiate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSP nonce generation | Manual nonce middleware | `clerkMiddleware()` CSP option (v6.14.0+) or static CSP in `next.config.ts` | Clerk has built-in CSP support; manual nonces are error-prone with streaming |
| Index migration files | Hand-written SQL files | `npm run db:generate` after adding `index()` to schema | Drizzle Kit auto-generates correct SQL from schema declarations |
| Loading state boilerplate | Custom loading logic | Next.js `loading.tsx` file convention | Framework handles Suspense boundaries automatically |

**Key insight:** This is a configuration/cleanup phase. Every task uses existing framework features -- no custom solutions needed.

## Common Pitfalls

### Pitfall 1: CSP Breaks Clerk Login UI
**What goes wrong:** Clerk's login components use inline styles (CSS-in-JS) and load scripts from Clerk's CDN. A strict CSP without proper allowlisting causes the sign-in page to be blank or non-functional.
**Why it happens:** Clerk requires `style-src 'unsafe-inline'`, `script-src` with Clerk's FAPI domain, and `frame-src https://challenges.cloudflare.com`.
**How to avoid:** Test the CSP header with browser devtools console open -- CSP violations are logged there. Include Clerk's domains in the CSP before deploying.
**Warning signs:** Blank sign-in page, console errors mentioning "Refused to load script" or "Refused to apply inline style".

### Pitfall 2: Missing Index on Composite Foreign Keys
**What goes wrong:** Tables with composite unique constraints (e.g., `lesson_progress` has `unique(userId, lessonId)`) already have an implicit index on the leading column. Adding a redundant index wastes space.
**Why it happens:** Postgres creates an index for unique constraints automatically.
**How to avoid:** Skip explicit indexes on columns that are the first column of an existing unique constraint. Only add indexes on non-unique foreign keys.
**Warning signs:** `db:generate` produces duplicate index names or conflicting SQL.

### Pitfall 3: force-dynamic on Root Layout Breaks Static Pages
**What goes wrong:** If `force-dynamic` is added to the root `app/layout.tsx` instead of `app/(dashboard)/layout.tsx`, it forces ALL pages (including `/verify/[id]`, `/sign-in`, public pages) to be dynamically rendered.
**Why it happens:** The dynamic export propagates to all children of the layout.
**How to avoid:** Add `force-dynamic` ONLY to `app/(dashboard)/layout.tsx`. Public pages like `/verify/[id]` and auth pages should remain statically optimizable.
**Warning signs:** Slow TTFB on public pages, unnecessary server load.

### Pitfall 4: ESLint error-boundaries Rule on Server Components
**What goes wrong:** ESLint's `react-hooks/error-boundaries` rule flags try/catch in server components that return JSX. But server components CAN safely try/catch around data fetching and return different JSX based on the result.
**Why it happens:** The rule is designed for client components where try/catch around JSX rendering doesn't catch React rendering errors. But in server components, the try/catch wraps the async data fetching, not the rendering.
**How to avoid:** Suppress with `// eslint-disable-next-line react-hooks/error-boundaries` for server component try/catch patterns. Fix genuine bugs separately.
**Warning signs:** Many false positives on server component pages.

### Pitfall 5: Upstash Redis Errors During Build
**What goes wrong:** The build output shows `[Upstash Redis] Unable to find environment variable: UPSTASH_REDIS_REST_URL`. This happens because the rate limit module (`src/lib/rate-limit.ts`) calls `Redis.fromEnv()` at module scope.
**Why it happens:** During build, env vars are not available. Module-level initialization runs during build when pages import the rate limit module.
**How to avoid:** This is a warning, not a build failure. The actual build failure is the Clerk publishableKey error. Once force-dynamic is added, these pages won't be statically generated and the Redis warning disappears.
**Warning signs:** Redis warnings in build output (benign after force-dynamic fix).

## Code Examples

### Build Fix: force-dynamic on Dashboard Layout
```typescript
// Source: Codebase investigation + Next.js docs
// File: src/app/(dashboard)/layout.tsx
// Add this export BEFORE the default export

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // existing code unchanged
}
```

### Index Declaration Pattern
```typescript
// Source: Drizzle ORM docs + existing notifications.ts pattern
// File: src/db/schema/courses.ts (example)
import { index } from "drizzle-orm/pg-core";

export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // ...
}, (table) => [
  index("modules_course_id_idx").on(table.courseId),
]);
```

### Security Headers in next.config.ts
```typescript
// Source: Next.js docs + Clerk CSP docs
const isDev = process.env.NODE_ENV === "development";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://*.clerk.accounts.dev https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://img.clerk.com https://image.mux.com;
  font-src 'self';
  connect-src 'self' https://*.clerk.accounts.dev https://api.openai.com https://stream.mux.com https://*.upstash.io;
  frame-src https://challenges.cloudflare.com;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\n/g, "");

// In the headers() function, add to the /(.*) source:
{
  key: "Content-Security-Policy",
  value: cspHeader,
},
{
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
},
{
  key: "Permissions-Policy",
  value: "camera=(self), microphone=(self), geolocation=()",
},
```

## Detailed Findings by Requirement

### PROD-01: Build Fix
**Current state:** `npm run build` fails with:
```
Error occurred prerendering page "/admin/ai-logs"
Error: @clerk/clerk-react: Missing publishableKey
```
**Root cause:** Next.js 16 tries to statically prerender pages. The `(dashboard)/layout.tsx` calls `auth()` which requires Clerk env vars not available at build time.
**Fix:** Add `export const dynamic = "force-dynamic"` to `src/app/(dashboard)/layout.tsx`. This single change prevents static generation for ALL dashboard pages (~41 pages).
**Confidence:** HIGH

### PROD-02: Database Indexes
**Current state:** Only the `notifications` table has explicit indexes (3 indexes). All other tables rely on primary keys and unique constraints for indexing. Foreign key columns WITHOUT indexes:

**Tables and their unindexed foreign keys:**

| Table | Column | FK Target |
|-------|--------|-----------|
| modules | course_id | courses.id |
| lessons | module_id | modules.id |
| course_access | user_id | users.id |
| course_access | course_id | courses.id |
| interactions | lesson_id | lessons.id |
| interaction_attempts | interaction_id | interactions.id |
| interaction_attempts | user_id | users.id |
| lesson_progress | user_id | users.id |
| lesson_progress | lesson_id | lessons.id |
| submissions | user_id | users.id |
| submissions | interaction_id | interactions.id |
| submissions | lesson_id | lessons.id |
| submissions | reviewed_by | users.id |
| coach_feedback | coach_id | users.id |
| coach_notes | coach_id | users.id |
| coach_notes | student_id | users.id |
| coach_notes | submission_id | submissions.id |
| conversations | user_id | users.id |
| conversations | lesson_id | lessons.id |
| conversation_turns | conversation_id | conversations.id |
| ai_prompt_versions | prompt_id | ai_prompts.id |
| ai_prompt_versions | created_by | users.id |
| video_uploads | lesson_id | lessons.id |
| kb_entries | category_id | kb_categories.id |
| kb_file_sources | entry_id | kb_entries.id |
| kb_chunks | entry_id | kb_entries.id |
| kb_chunks | file_source_id | kb_file_sources.id |
| certificates | user_id | users.id |
| certificates | course_id | courses.id |
| tags | created_by | users.id |
| student_tags | user_id | users.id |
| student_tags | tag_id | tags.id |
| student_tags | assigned_by | users.id |
| auto_tag_rules | tag_id | tags.id |
| auto_tag_rules | created_by | users.id |
| bulk_operations | performed_by | users.id |
| filter_presets | created_by | users.id |
| practice_sets | created_by | users.id |
| practice_exercises | practice_set_id | practice_sets.id |
| practice_set_assignments | practice_set_id | practice_sets.id |
| practice_set_assignments | assigned_by | users.id |
| practice_attempts | practice_set_id | practice_sets.id |
| practice_attempts | user_id | users.id |
| chat_conversations | user_id | users.id |
| chat_conversations | lesson_id | lessons.id |
| chat_messages | conversation_id | chat_conversations.id |

**Skip (already indexed via unique constraints):**
- `lesson_progress.(userId, lessonId)` -- composite unique creates index on leading column (userId)
- `certificates.(userId, courseId)` -- composite unique creates index on leading column (userId)
- `student_tags.(userId, tagId)` -- unique index on composite already exists
- `coach_feedback.submissionId` -- `.unique()` creates implicit index
- `ghl_contacts.userId` -- `.unique()` creates implicit index

**Total: ~44 indexes needed across 20 schema files**

**Confidence:** HIGH -- enumerated directly from schema files.

### PROD-03: N+1 Query Elimination
**Current state:**
- **Course detail page** (`src/app/(dashboard)/courses/[courseId]/page.tsx`): Already uses Drizzle `with` clause for modules/lessons nested loading. Already batch-fetches progress. This is WELL-OPTIMIZED already. Minor improvement: the practice set section makes 2 separate queries that could potentially be consolidated.
- **Coach dashboard** (`src/app/(dashboard)/coach/page.tsx`): Uses `currentUser()` from Clerk (1 query). The `SubmissionQueue` is a CLIENT component that fetches via API. No server-side N+1 here -- the N+1 risk is in the API route.
- **Practice results** (`src/app/(dashboard)/practice/[setId]/page.tsx`): Makes 3 sequential queries (getPracticeSet, listExercises, getCurrentUser). These could be consolidated with `with` clause or `Promise.all`.

**Recommendation:** The course detail page is already well-optimized. Focus on:
1. Practice results page: use `db.query.practiceSets.findFirst({ with: { exercises: true } })` instead of two separate calls
2. Audit the coach submission API route for N+1 patterns
3. The `getStudentAssignments` function in `src/lib/assignments.ts` makes 4-5 sequential queries that could be parallelized with `Promise.all`

**Confidence:** HIGH -- verified by reading the actual page source code.

### PROD-04: Security Headers
**Current state:** `next.config.ts` already has:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- Service worker-specific headers

**Missing:**
- `Content-Security-Policy` (need to allow Clerk, Mux, OpenAI domains)
- `Strict-Transport-Security` (HSTS)
- `Permissions-Policy`

**Clerk CSP domains required:**
- `script-src`: `https://*.clerk.accounts.dev`, `https://challenges.cloudflare.com`
- `style-src`: `'unsafe-inline'` (Clerk CSS-in-JS)
- `connect-src`: `https://*.clerk.accounts.dev`, `https://api.openai.com`, `https://stream.mux.com`, `https://*.upstash.io`
- `img-src`: `https://img.clerk.com`, `https://image.mux.com`
- `frame-src`: `https://challenges.cloudflare.com`
- `worker-src`: `'self' blob:`

**Note:** Clerk's actual FAPI domain depends on the instance. For development it's typically `*.clerk.accounts.dev`. For production with a custom domain, it would be `clerk.yourdomain.com`. Using wildcard `*.clerk.accounts.dev` covers dev instances.

**Permissions-Policy:** Grant `camera` and `microphone` to self (needed for voice AI and audio recording), deny `geolocation`.

**Confidence:** MEDIUM -- CSP domains verified from Clerk docs, but exact FAPI URL depends on user's Clerk instance.

### PROD-05: .env.example
**Current state:** `.env.example` lists only 10 variables. The codebase uses 22+ environment variables.

**Complete env var inventory from codebase grep:**

| Variable | Used In | Current in .env.example? |
|----------|---------|--------------------------|
| DATABASE_URL | `src/db/index.ts`, `drizzle.config.ts` | YES |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk auto-reads | YES |
| CLERK_SECRET_KEY | Clerk auto-reads | YES |
| CLERK_WEBHOOK_SECRET | `src/app/api/webhooks/clerk/route.ts` | YES |
| NEXT_PUBLIC_CLERK_SIGN_IN_URL | Clerk config | YES |
| NEXT_PUBLIC_CLERK_SIGN_UP_URL | Clerk config | YES |
| MUX_TOKEN_ID | `src/lib/mux.ts` | YES |
| MUX_TOKEN_SECRET | `src/lib/mux.ts` | YES |
| MUX_WEBHOOK_SECRET | `src/app/api/admin/mux/webhook/route.ts` | YES |
| NEXT_PUBLIC_TEST_MUX_PLAYBACK_ID | `test-video/page.tsx` | YES |
| ENROLLMENT_WEBHOOK_SECRET | `src/app/api/webhooks/enroll/route.ts` | YES |
| OPENAI_API_KEY | `@ai-sdk/openai` auto-reads, `src/app/api/realtime/token/route.ts` | **NO** |
| UPSTASH_REDIS_REST_URL | `@upstash/redis` auto-reads | **NO** |
| UPSTASH_REDIS_REST_TOKEN | `@upstash/redis` auto-reads | **NO** |
| N8N_GRADING_WEBHOOK_URL | `src/app/api/grade/route.ts` | **NO** |
| N8N_AUDIO_GRADING_WEBHOOK_URL | `src/app/api/grade-audio/route.ts` | **NO** |
| N8N_COACH_FEEDBACK_WEBHOOK_URL | `src/app/api/notify/coach-feedback/route.ts` | **NO** |
| N8N_WEBHOOK_AUTH_HEADER | Multiple grade routes | **NO** |
| NEXT_PUBLIC_APP_URL | `src/app/api/admin/mux/upload-url/route.ts`, `verify/page.tsx` | **NO** |
| GHL_API_TOKEN | `src/lib/ghl/client.ts` | **NO** |
| GHL_LOCATION_ID | `src/lib/ghl/client.ts` | **NO** |
| GHL_WEBHOOK_URL | `src/lib/ghl/webhooks.ts` | **NO** |
| GHL_INBOUND_WEBHOOK_SECRET | `src/app/api/webhooks/ghl/route.ts` | **NO** |
| CRON_SECRET | `src/app/api/cron/*/route.ts` | **NO** |
| AZURE_SPEECH_KEY | `src/lib/pronunciation.ts` | **NO** |
| AZURE_SPEECH_REGION | `src/lib/pronunciation.ts` | **NO** |
| NEXT_PUBLIC_MUX_PLAYBACK_ID | `test-interactive/page.tsx` | **NO** |

**Missing: 16 variables** (previously stated ~12, actual count is 16).

**Confidence:** HIGH -- enumerated by grepping all `process.env.*` references.

### PROD-06: Loading States
**Current state:** 11 loading.tsx files exist. 30 page directories are MISSING loading.tsx files.

**Existing loading.tsx files (11):**
1. `dashboard/loading.tsx`
2. `courses/[courseId]/loading.tsx`
3. `lessons/[lessonId]/loading.tsx`
4. `my-feedback/loading.tsx`
5. `coach/loading.tsx`
6. `coach/conversations/loading.tsx`
7. `coach/submissions/[submissionId]/loading.tsx`
8. `admin/loading.tsx`
9. `admin/students/loading.tsx`
10. `admin/ai-logs/loading.tsx`
11. `admin/knowledge/loading.tsx`

**Missing loading.tsx (30 pages):**
- Student area: `settings`, `my-conversations`, `dashboard/practice`, `practice/[setId]`
- Coach area: `coach/students`, `coach/pronunciation`, `coach/conversations/[conversationId]`
- Admin area: `admin/exercises`, `admin/exercises/new`, `admin/exercises/[exerciseId]`, `admin/analytics`, `admin/knowledge/[entryId]`, `admin/knowledge/new`, `admin/knowledge/search`, `admin/content`, `admin/content/uploads`, `admin/courses`, `admin/courses/new`, `admin/courses/[courseId]`, `admin/courses/[courseId]/modules/[moduleId]`, `admin/courses/[courseId]/modules/[moduleId]/lessons/[lessonId]`, `admin/courses/[courseId]/modules/[moduleId]/lessons/new`, `admin/courses/[courseId]/modules/new`, `admin/prompts`, `admin/prompts/[promptId]`, `admin/practice-sets/[setId]/builder`, `admin/ghl`, `admin/students/[studentId]`
- Test pages: `test-interactive`, `test-video` (low priority)

**Loading states should NOT include sidebar or header** -- those render from `layout.tsx`. Loading states only fill the `<main>` area.

**Strategy:** For efficiency, many admin sub-pages can share a parent directory's loading.tsx via Next.js' segment inheritance. Create loading.tsx at key parent levels and only create page-specific ones where the skeleton needs to match the page layout closely.

**Confidence:** HIGH -- enumerated from filesystem comparison.

### PROD-07: Lint Errors
**Current state:** 72 problems (28 errors, 44 warnings).

**Error Categories:**

1. **`react-hooks/error-boundaries` (8 errors):** Server component try/catch around data fetching + JSX return. This is a false positive for server components -- the try/catch wraps the async query, not the React rendering. **Action:** Suppress with eslint-disable comments.

2. **`react-hooks/refs` (6 errors):** Accessing ref `.current` during render in `useBuilderState.ts`, `VideoPreviewPlayer.tsx`, `test-interactive/page.tsx`. **Action:** Fix by moving ref access into `useMemo` or outside render path.

3. **`react-hooks/set-state-in-effect` (4 errors):** Calling setState synchronously inside useEffect in `useNotifications.ts`, `usePWAInstall.ts`, `useSubtitlePreference.ts`, `ChatWidget.tsx`. **Action:** These are loading-from-localStorage / initial-fetch patterns. Suppress or refactor to use state initialization.

4. **`@typescript-eslint/no-explicit-any` (7 errors):** Generic `any` types in exercise form components and pronunciation page. **Action:** Fix with proper types.

5. **`react/no-unescaped-entities` (1 error):** Unescaped `'` in dashboard page. **Action:** Fix with `&apos;`.

6. **Compilation Skipped warning (1):** StudentDataTable incompatible library. **Action:** Suppress.

7. **`@typescript-eslint/no-unused-vars` (17 warnings):** Unused imports and variables. **Action:** Fix with `--fix` or manual removal.

8. **`react-hooks/exhaustive-deps` (2 warnings):** Missing useEffect dependencies. **Action:** Fix or suppress.

9. **`@next/next/no-img-element` (1 warning):** CourseCard using `<img>` instead of `next/image`. **Action:** Low priority, suppress.

10. **Unused eslint-disable directives (6 warnings):** Old suppression comments no longer needed. **Action:** Remove with `--fix`.

**Confidence:** HIGH -- enumerated from direct ESLint output.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getServerSideProps` | `export const dynamic = "force-dynamic"` | Next.js 13+ (App Router) | Layout-level dynamic export covers all child pages |
| Clerk manual CSP | `clerkMiddleware()` CSP option | @clerk/nextjs 6.14.0+ | Can auto-inject CSP headers, but manual config works fine |
| Hand-written SQL indexes | `index()` in Drizzle schema + `db:generate` | Drizzle ORM current | Schema-driven migrations are the standard approach |

## Open Questions

1. **Clerk FAPI domain:** The exact Clerk FAPI hostname is needed for CSP. Development instances use `*.clerk.accounts.dev`. Production might use a custom domain. The CSP should work for both by using a wildcard pattern, but the user should verify the exact domain from their Clerk dashboard.
   - **Recommendation:** Use `https://*.clerk.accounts.dev` for now, add a comment explaining the production domain substitution.

2. **Mux streaming domain:** Mux video streaming uses `stream.mux.com` and images use `image.mux.com`. These should be confirmed by checking Mux network requests in browser devtools.
   - **Recommendation:** Include both `stream.mux.com` and `image.mux.com`.

3. **Loading.tsx coverage priority:** 30 pages are missing loading.tsx. Creating all 30 is excessive for a single plan. Some admin sub-pages inherit loading from parent directories naturally.
   - **Recommendation:** Create loading.tsx for high-traffic pages (settings, practice, coach/students, coach/pronunciation, dashboard/practice) and shared admin-level loading states. Skip test pages and deeply nested admin CRUD form pages where the parent loading.tsx suffices.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/rqbv2_drizzle-orm-fe_pages_dev` -- Index declaration syntax
- Context7 `/websites/nextjs` -- force-dynamic export, CSP headers, HSTS
- Codebase: All 20 schema files read and FK columns enumerated
- Codebase: `npm run build` output (exact error captured)
- Codebase: `npx eslint src/` output (all 72 issues captured)
- Codebase: `process.env.*` grep across all source files

### Secondary (MEDIUM confidence)
- [Clerk CSP Docs](https://clerk.com/docs/guides/secure/best-practices/csp-headers) -- CSP domain requirements
- [Next.js CSP Guide](https://nextjs.org/docs/app/guides/content-security-policy) -- CSP header format

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Build fix (PROD-01): HIGH -- exact error captured and fix verified in docs
- DB indexes (PROD-02): HIGH -- all FK columns enumerated from schema files
- N+1 queries (PROD-03): HIGH -- actual page code read and analyzed
- Security headers (PROD-04): MEDIUM -- Clerk FAPI domain needs user confirmation
- .env.example (PROD-05): HIGH -- all env vars enumerated from codebase grep
- Loading states (PROD-06): HIGH -- all pages and loading.tsx enumerated
- Lint errors (PROD-07): HIGH -- all 72 issues captured and categorized

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable -- frameworks and patterns well-established)
