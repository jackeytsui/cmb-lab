---
phase: 01-foundation
plan: 01
subsystem: database
tags: [drizzle, neon, postgres, uuid, schema, migrations]

# Dependency graph
requires: []
provides:
  - Drizzle ORM configured with Neon serverless driver
  - Database schema for users, courses, modules, lessons, course_access
  - Type-safe db client exported from src/db/index.ts
  - Migration SQL ready to apply to Neon database
affects: [01-02, 01-03, 02-enrollment, 03-courses, 04-progress]

# Tech tracking
tech-stack:
  added: [drizzle-orm, @neondatabase/serverless, drizzle-kit, dotenv]
  patterns: [UUID primary keys, soft delete with deletedAt, timestamp audit fields, enum types for roles and tiers]

key-files:
  created:
    - src/db/index.ts
    - src/db/schema/index.ts
    - src/db/schema/users.ts
    - src/db/schema/courses.ts
    - src/db/schema/access.ts
    - drizzle.config.ts
    - src/db/migrations/0000_majestic_kylun.sql
  modified:
    - package.json
    - .gitignore
    - .env.example

key-decisions:
  - "Used pgEnum for role, language_preference, access_tier, granted_by instead of text with constraints"
  - "Added cascade delete on foreign keys for automatic cleanup"
  - "Used neon-http driver for serverless deployment (not WebSocket)"

patterns-established:
  - "UUID primary keys: All tables use uuid().defaultRandom().primaryKey()"
  - "Audit timestamps: createdAt (defaultNow), updatedAt ($onUpdate), deletedAt (nullable)"
  - "Schema barrel export: All tables/relations/types re-exported from src/db/schema/index.ts"
  - "Drizzle migrations: Generated SQL in src/db/migrations/, applied via db:push or db:migrate"

# Metrics
duration: 11min
completed: 2026-01-26
---

# Phase 1 Plan 1: Database Schema Summary

**Drizzle ORM with Neon serverless driver, 5 tables (users, courses, modules, lessons, course_access) with UUID PKs, relations, and generated migration SQL**

## Performance

- **Duration:** 11 min 19 sec
- **Started:** 2026-01-26T11:36:16Z
- **Completed:** 2026-01-26T11:47:35Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Next.js 16 project initialized with TypeScript, Tailwind, App Router
- Complete database schema with Course -> Module -> Lesson hierarchy
- Course access grants with preview/full tiers and expiration support
- Migration SQL generated, ready to apply when DATABASE_URL configured

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialize Next.js project and install dependencies** - `66838fd` (feat)
2. **Task 2: Create Drizzle schema files** - `d583492` (feat)
3. **Task 3: Configure Drizzle client and generate migrations** - `5946a26` (feat)

## Files Created/Modified

- `src/db/index.ts` - Drizzle client with neon-http driver, exports `db`
- `src/db/schema/index.ts` - Barrel export for all tables, relations, types
- `src/db/schema/users.ts` - Users table with clerkId, role enum, language preference
- `src/db/schema/courses.ts` - Courses, modules, lessons tables with relations
- `src/db/schema/access.ts` - Course access grants with tier and expiration
- `drizzle.config.ts` - Drizzle Kit configuration for migrations
- `src/db/migrations/0000_majestic_kylun.sql` - Initial migration with all tables
- `package.json` - Added Drizzle dependencies and db scripts
- `.env.example` - DATABASE_URL placeholder
- `.gitignore` - Exception for .env.example

## Decisions Made

1. **Used pgEnum instead of text constraints** - Better type safety, Drizzle generates proper ENUM types in PostgreSQL
2. **Cascade delete on foreign keys** - When course deleted, modules/lessons/access grants automatically cleaned up
3. **previewLessonCount on courses table** - Per-course configuration of how many lessons are in preview tier (default 3)
4. **neon-http driver** - Simpler for serverless, no connection pooling needed (Neon handles it)

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

**External services require manual configuration.**

Before using the database:

1. **Create Neon project** at console.neon.tech -> New Project
2. **Get connection string** from Connection Details -> Connection string (pooled)
3. **Create `.env` file** with:
   ```
   DATABASE_URL=postgresql://user:password@host/database?sslmode=require
   ```
4. **Apply migrations** by running:
   ```bash
   npm run db:push
   ```
5. **Verify** by running `npm run db:studio` to open Drizzle Studio

## Next Phase Readiness

- Schema complete and ready for Clerk authentication integration (plan 01-02)
- Users table has clerkId field for Clerk webhook sync
- Course access table ready for enrollment webhook (plan 01-02)
- Video player can reference lessons.muxPlaybackId once Mux is configured (plan 01-03)

---
*Phase: 01-foundation*
*Completed: 2026-01-26*
