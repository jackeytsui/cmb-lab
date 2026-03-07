# Phase 1: Foundation - Research

**Researched:** 2026-01-26
**Domain:** Database Schema (Drizzle + Neon), Authentication (Clerk), Video Playback (Mux)
**Confidence:** HIGH

## Summary

Phase 1 establishes the technical foundation for the CantoMando Blueprint LMS. This research covers three core areas:

1. **Database Schema with Drizzle ORM + Neon Postgres**: Setting up a serverless PostgreSQL database with proper schema design including UUIDs, timestamps, soft deletes, and relations for Course > Module > Lesson hierarchy plus user course access.

2. **Clerk Authentication**: Implementing email/password authentication with session persistence, role-based access control (admin/coach/student) via public metadata, middleware protection, and external webhook for account creation with course access grants.

3. **Mux Video Player**: Integrating the Mux Player React component for basic video streaming with standard controls, playback speed options, and poster/thumbnail support.

**Primary recommendation:** Use Drizzle ORM with Neon HTTP driver for serverless deployment, Clerk's `publicMetadata` for simple RBAC (not Organizations), and `@mux/mux-player-react` for drop-in video playback.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | ^0.44.x | Type-safe ORM for PostgreSQL | Lightweight, serverless-ready, excellent TypeScript support |
| `@neondatabase/serverless` | ^0.10.x | Neon serverless Postgres driver | HTTP/WebSocket connections for Edge/serverless |
| `drizzle-kit` | ^0.31.x | Schema migrations CLI | Generates and applies migrations |
| `@clerk/nextjs` | ^6.36.x | Authentication for Next.js | Full-featured auth with webhooks, metadata, middleware |
| `@mux/mux-player-react` | ^3.10.x | Video player component | Official Mux player, feature-rich, Mux Data integration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | ^16.x | Environment variable loading | Load `.env` files for database URLs |
| `svix` | ^1.x | Webhook signature verification | Verify Clerk webhook payloads (included with Clerk) |
| `uuid` | ^9.x | UUID generation | Generate UUIDs client-side if needed (optional, prefer database) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle ORM | Prisma | Prisma is heavier, Drizzle is more SQL-like and lightweight |
| Clerk publicMetadata | Clerk Organizations | Organizations is for B2B multi-tenant, overkill for simple roles |
| Mux Player React | Video.js + Mux | Mux Player has built-in Mux integration, no extra config |
| Neon HTTP driver | Neon WebSocket driver | HTTP is simpler for serverless; WebSocket for long-running connections |

**Installation:**
```bash
npm install drizzle-orm @neondatabase/serverless @clerk/nextjs @mux/mux-player-react
npm install -D drizzle-kit dotenv
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth routes (sign-in, sign-up)
│   ├── (dashboard)/       # Protected dashboard routes
│   ├── api/               # API routes
│   │   └── webhooks/      # Webhook endpoints
│   │       └── clerk/     # Clerk webhook handler
│   └── layout.tsx         # Root layout with ClerkProvider
├── components/
│   └── video/
│       └── VideoPlayer.tsx # Mux player wrapper
├── db/
│   ├── index.ts           # Drizzle client export
│   ├── schema/
│   │   ├── index.ts       # Schema barrel export
│   │   ├── users.ts       # Users table
│   │   ├── courses.ts     # Courses, modules, lessons
│   │   └── access.ts      # Course access grants
│   └── migrations/        # Generated migration files
├── lib/
│   ├── auth.ts            # Auth helpers (checkRole, etc.)
│   └── mux.ts             # Mux helpers (if needed)
├── types/
│   └── globals.d.ts       # TypeScript global types (Clerk roles)
└── proxy.ts               # Next.js 16 middleware (was middleware.ts)
```

### Pattern 1: Drizzle Schema with UUIDs and Timestamps
**What:** Define tables with UUID primary keys, createdAt/updatedAt timestamps, and optional soft delete
**When to use:** All tables in this project
**Example:**
```typescript
// Source: Context7 Drizzle ORM docs
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role", { enum: ["student", "coach", "admin"] }).notNull().default("student"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"), // Soft delete
});

export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
});

// Type inference
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Pattern 2: Clerk Middleware with Role Protection
**What:** Protect routes based on user roles stored in session claims
**When to use:** Middleware for admin/coach-only routes
**Example:**
```typescript
// Source: Context7 Clerk docs
// proxy.ts (Next.js 16) or middleware.ts (Next.js 15)
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isCoachRoute = createRouteMatcher(["/coach(.*)"]);
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/courses(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { sessionClaims } = await auth();
  const role = sessionClaims?.metadata?.role;

  // Admin routes - admin only
  if (isAdminRoute(req) && role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Coach routes - admin or coach
  if (isCoachRoute(req) && !["admin", "coach"].includes(role)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Protected routes - must be signed in
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

### Pattern 3: Clerk Webhook for User Creation
**What:** API route that receives Clerk webhooks, verifies signature, creates user in database
**When to use:** Sync Clerk users to database, handle external enrollment webhooks
**Example:**
```typescript
// Source: Context7 Clerk docs
// app/api/webhooks/clerk/route.ts
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);

    if (evt.type === "user.created") {
      const { id, email_addresses, first_name, last_name } = evt.data;
      const primaryEmail = email_addresses.find(
        (e) => e.id === evt.data.primary_email_address_id
      )?.email_address;

      await db.insert(users).values({
        clerkId: id,
        email: primaryEmail!,
        name: `${first_name || ""} ${last_name || ""}`.trim() || null,
        role: "student", // Default role
      });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Error", { status: 400 });
  }
}
```

### Pattern 4: Basic Mux Player Component
**What:** Wrapper component for Mux video player with standard controls
**When to use:** All video playback in the application
**Example:**
```typescript
// Source: Context7 Mux docs + Mux API reference
// components/video/VideoPlayer.tsx
"use client";

import MuxPlayer from "@mux/mux-player-react";

interface VideoPlayerProps {
  playbackId: string;
  title?: string;
  poster?: string;
  onEnded?: () => void;
}

export function VideoPlayer({ playbackId, title, poster, onEnded }: VideoPlayerProps) {
  return (
    <MuxPlayer
      playbackId={playbackId}
      streamType="on-demand"
      // Controls
      playbackRates={[0.5, 1, 1.5, 2]}
      // Poster/thumbnail
      poster={poster}
      thumbnailTime={0}
      // No autoplay - student presses play
      autoPlay={false}
      // Metadata for Mux Data analytics
      metadata={{
        video_title: title || "Untitled",
        player_name: "CantoMando Blueprint",
      }}
      // Callbacks
      onEnded={onEnded}
      // Styling
      style={{ width: "100%", aspectRatio: "16/9" }}
    />
  );
}
```

### Anti-Patterns to Avoid
- **Using serial IDs instead of UUIDs:** UUIDs are more secure, don't expose record count, work better distributed
- **Putting auth logic only in middleware:** CVE-2025-29927 showed middleware can be bypassed; verify at data access layer too
- **Hardcoding roles in multiple places:** Define role types once in `globals.d.ts`, use checkRole() helper everywhere
- **Using Clerk Organizations for simple roles:** Overkill complexity when publicMetadata suffices
- **Manual webhook signature verification:** Use Clerk's built-in `verifyWebhook()` helper

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom UUID logic | `uuid().defaultRandom()` in schema | Postgres `gen_random_uuid()` is cryptographically secure |
| Webhook verification | Manual HMAC validation | `verifyWebhook()` from Clerk | Handles Svix signatures, timing attacks, header parsing |
| Session token parsing | Manual JWT decode | `auth()` from Clerk | Handles validation, refresh, edge cases |
| Video player controls | Custom HTML5 video wrapper | `@mux/mux-player-react` | Years of edge case handling, browser quirks, DRM |
| Role checking | Inline role comparisons | `checkRole()` utility | Centralized, type-safe, testable |
| Soft delete filtering | Manual WHERE clauses | Drizzle `isNull(table.deletedAt)` | Consistent, can't forget to filter |

**Key insight:** Authentication, video playback, and webhook verification have numerous edge cases that take months to discover. Use battle-tested libraries.

## Common Pitfalls

### Pitfall 1: Next.js 16 Middleware Rename
**What goes wrong:** Middleware file named `middleware.ts` doesn't work in Next.js 16
**Why it happens:** Next.js 16 renamed middleware to `proxy.ts` with `proxy` export
**How to avoid:** Check Next.js version; use `proxy.ts` for Next.js 16+, `middleware.ts` for 15 and below
**Warning signs:** Middleware not executing, auth not working on protected routes

### Pitfall 2: Clerk Webhook Raw Body Requirement
**What goes wrong:** "Invalid signature" errors when verifying Clerk webhooks
**Why it happens:** Body was parsed as JSON before signature verification
**How to avoid:** Use `verifyWebhook(req)` which handles raw body correctly in Next.js App Router
**Warning signs:** Webhook verification consistently fails despite correct secret

### Pitfall 3: Missing Session Token Claims Configuration
**What goes wrong:** `sessionClaims?.metadata?.role` is undefined even after setting publicMetadata
**Why it happens:** Session token doesn't include metadata by default
**How to avoid:** Configure session token in Clerk Dashboard to include `"metadata": "{{user.public_metadata}}"`
**Warning signs:** Role checks always fail, metadata present in dashboard but not in code

### Pitfall 4: Drizzle $onUpdate Not Triggering
**What goes wrong:** `updatedAt` field doesn't update when records change
**Why it happens:** `$onUpdate()` only works with Drizzle's update operations, not raw SQL
**How to avoid:** Always use Drizzle's `db.update()` method, or use database triggers
**Warning signs:** `updatedAt` stays at creation time after edits

### Pitfall 5: Mux Player Autoplay Blocked
**What goes wrong:** Video autoplay fails silently in browsers
**Why it happens:** Browsers block autoplay with sound by default
**How to avoid:** Use `autoPlay={false}` (our requirement) or `autoPlay="muted"` if needed
**Warning signs:** Video doesn't start, no error messages, works in some browsers

### Pitfall 6: Missing Mux Playback ID vs Asset ID
**What goes wrong:** Videos don't play, 404 errors from Mux
**Why it happens:** Using Asset ID instead of Playback ID with the player
**How to avoid:** Store and use `playbackId` (from Asset's playback_ids array), not `assetId`
**Warning signs:** Valid-looking ID but player shows loading forever or errors

## Code Examples

Verified patterns from official sources:

### Drizzle + Neon Connection
```typescript
// Source: Context7 Drizzle docs
// db/index.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

### Drizzle Config
```typescript
// Source: Context7 Drizzle docs
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Course Access Schema
```typescript
// Source: Based on Context7 patterns + project requirements
// db/schema/access.ts
import { pgTable, uuid, timestamp, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { courses } from "./courses";

export const courseAccess = pgTable("course_access", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  accessTier: text("access_tier", { enum: ["preview", "full"] }).notNull().default("full"),
  expiresAt: timestamp("expires_at"), // null = lifetime access
  grantedBy: text("granted_by"), // "webhook" | "coach" | "admin"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().$onUpdate(() => new Date()),
});

export const courseAccessRelations = relations(courseAccess, ({ one }) => ({
  user: one(users, { fields: [courseAccess.userId], references: [users.id] }),
  course: one(courses, { fields: [courseAccess.courseId], references: [courses.id] }),
}));
```

### TypeScript Globals for Clerk Roles
```typescript
// Source: Context7 Clerk docs
// types/globals.d.ts
export type Roles = "student" | "coach" | "admin";

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      role?: Roles;
    };
  }
}
```

### Role Check Utility
```typescript
// Source: Context7 Clerk docs
// lib/auth.ts
import { auth } from "@clerk/nextjs/server";
import { Roles } from "@/types/globals";

export async function checkRole(role: Roles): Promise<boolean> {
  const { sessionClaims } = await auth();
  return sessionClaims?.metadata?.role === role;
}

export async function hasMinimumRole(minimumRole: Roles): Promise<boolean> {
  const { sessionClaims } = await auth();
  const userRole = sessionClaims?.metadata?.role;

  const roleHierarchy: Roles[] = ["student", "coach", "admin"];
  const userLevel = roleHierarchy.indexOf(userRole || "student");
  const requiredLevel = roleHierarchy.indexOf(minimumRole);

  return userLevel >= requiredLevel;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` | Next.js 16 (Dec 2025) | Rename file, change export name |
| `authMiddleware()` | `clerkMiddleware()` | Clerk v6 | Simpler API, better defaults |
| Serial IDs | UUID with `.defaultRandom()` | PostgreSQL 13+ | Industry standard for distributed systems |
| `drizzle-kit generate:pg` | `drizzle-kit generate` | drizzle-kit 0.21+ | Simplified CLI commands |
| Svix manual verification | `verifyWebhook()` from Clerk | Clerk SDK updates | Built-in, safer |

**Deprecated/outdated:**
- `authMiddleware()` from Clerk - removed in v6, use `clerkMiddleware()`
- `serial()` for IDs - prefer `uuid().defaultRandom()` for security
- `@mux-elements/mux-player-react` - moved to `@mux/mux-player-react` scope

## Open Questions

Things that couldn't be fully resolved:

1. **Exact Next.js version in this project**
   - What we know: Project constraint says "Next.js 15", but Next.js 16 is current
   - What's unclear: Whether to use 15 or 16
   - Recommendation: Use Next.js 15 as specified in PROJECT.md, use `middleware.ts` accordingly

2. **External enrollment webhook payload structure**
   - What we know: Webhook creates user AND grants course access in single call
   - What's unclear: Exact fields from external CRM system
   - Recommendation: Design flexible schema; accept `{ email, name?, courseId, accessTier? }`

3. **Number of preview lessons**
   - What we know: Preview tier gives access to "first few lessons"
   - What's unclear: Exact number (2? 3? configurable per course?)
   - Recommendation: Store preview lesson count on course table, default to 3

4. **Coach role includes student capabilities?**
   - What we know: CONTEXT.md says "lean toward yes for simplicity"
   - What's unclear: Should coach be able to take courses as student?
   - Recommendation: Yes - use role hierarchy where coach >= student access

## Sources

### Primary (HIGH confidence)
- Context7 `/drizzle-team/drizzle-orm-docs` - Schema definition, UUID columns, relations, Neon setup
- Context7 `/clerk/clerk-docs` - Middleware, webhooks, RBAC with metadata, session claims
- Context7 `/websites/mux` - Player React component, props, autoplay, poster handling

### Secondary (MEDIUM confidence)
- [Mux Player React API Reference](https://www.mux.com/docs/guides/player-api-reference/react) - Full prop documentation
- [Clerk Basic RBAC Guide](https://clerk.com/docs/references/nextjs/basic-rbac) - Role implementation patterns
- [Drizzle Neon Tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon) - Connection setup

### Tertiary (LOW confidence)
- Community discussions on soft delete patterns - no built-in feature, manual implementation
- Next.js 16 middleware rename - recent change, verify with project's Next.js version

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via Context7 and official docs
- Architecture: HIGH - Patterns from official documentation with code examples
- Pitfalls: HIGH - Common issues documented in official sources and CVE disclosures

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable technologies)
