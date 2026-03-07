# Phase 15: In-App Notifications - Research

**Researched:** 2026-01-30
**Domain:** In-app notification system (database-backed, polling-based, Next.js + Drizzle ORM)
**Confidence:** HIGH

## Summary

This phase adds an in-app notification system to the LMS so students and coaches see important events (like coach feedback) inside the app, alongside existing email notifications. The system stores notifications in a database table, displays them via a bell icon with unread count badge in a shared header, and allows users to manage read state and mute preferences.

The architecture is straightforward: a new `notifications` table and `notification_preferences` table in Postgres via Drizzle ORM, REST API routes for CRUD + polling, a client-side `useNotifications` hook with `setInterval` + `visibilitychange` for 30-second refresh, and Radix UI Popover for the dropdown panel. No WebSocket or SSE infrastructure is needed -- simple polling every 30 seconds is sufficient for this notification volume (low-frequency, non-chat).

**Primary recommendation:** Build a simple polling-based notification system using existing stack (Drizzle ORM, Radix UI Popover, Next.js API routes). No new dependencies needed. Create a shared header/navbar component to house the bell icon, since the app currently has no shared navigation component.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | ^0.45.1 | Notifications + preferences schema | Already used for all DB tables |
| @radix-ui/react-popover | ^1.1.x | Notification dropdown panel | Already using Radix UI primitives; popover is the correct pattern for bell dropdowns |
| lucide-react | ^0.563.0 | Bell, BellDot, Check icons | Already used across the codebase |
| Next.js API routes | 16.1.4 | REST endpoints for notifications | Existing pattern for all API routes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 | Relative timestamps ("2 min ago") | Already installed, use `formatDistanceToNow` |
| zod | ^4.3.6 | Request validation | Already used in other API routes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Polling (30s) | Server-Sent Events (SSE) | SSE gives instant delivery but adds complexity; polling is simpler and sufficient for this use case (notifications are not time-critical to the second) |
| Polling (30s) | WebSockets | Overkill -- bidirectional comms not needed, adds significant infrastructure |
| Custom build | Knock / Novu / MagicBell | Third-party services add cost and dependency for a simple feature; the LMS has low notification volume |
| @radix-ui/react-popover | @radix-ui/react-dropdown-menu | Dropdown menu is for action menus; Popover is for content panels like notification lists |

**Installation:**
```bash
npm install @radix-ui/react-popover
```

Only one new package needed. Everything else is already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── notifications.ts         # notifications + notification_preferences tables
├── app/api/notifications/
│   ├── route.ts                 # GET (list), POST (create - internal)
│   ├── [notificationId]/
│   │   └── route.ts             # PATCH (mark read)
│   ├── read-all/
│   │   └── route.ts             # POST (mark all read)
│   ├── count/
│   │   └── route.ts             # GET (unread count only - lightweight)
│   └── preferences/
│       └── route.ts             # GET, PATCH (notification preferences)
├── lib/
│   └── notifications.ts         # Server-side helper: createNotification()
├── hooks/
│   └── useNotifications.ts      # Client hook: polling + visibility + state
├── components/
│   └── notifications/
│       ├── NotificationBell.tsx  # Bell icon + badge + popover trigger
│       ├── NotificationPanel.tsx # Dropdown panel with notification list
│       └── NotificationItem.tsx  # Single notification row
└── components/
    └── layout/
        └── AppHeader.tsx         # NEW shared header with bell, user menu, nav
```

### Pattern 1: Shared Header Component
**What:** Currently, every dashboard page renders its own `<header>` inline. A shared `AppHeader` component should be created to house the notification bell alongside navigation links and the Clerk user button.
**When to use:** Required -- the bell icon must appear on every dashboard page.
**Example:**
```typescript
// src/components/layout/AppHeader.tsx
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { UserButton } from "@clerk/nextjs";

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center justify-between px-4 py-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex items-center gap-4">
        <NotificationBell />
        <UserButton />
      </div>
    </header>
  );
}
```

### Pattern 2: Lightweight Count Endpoint for Polling
**What:** A dedicated `/api/notifications/count` endpoint that returns only the unread count (single integer). The full notification list is fetched only when the popover opens.
**When to use:** Every 30-second poll and every tab focus event.
**Why:** Minimizes database load and network traffic. A `SELECT COUNT(*)` with an index on `(user_id, read)` is extremely fast.
```typescript
// GET /api/notifications/count
// Response: { unreadCount: 3 }
```

### Pattern 3: Polling with Visibility Detection
**What:** `useNotifications` hook combines `setInterval` (30s) with `document.visibilitychange` to pause polling when tab is hidden and immediately refresh when tab regains focus.
**When to use:** Always -- this is the core refresh mechanism (NOTIF-06).
**Example:**
```typescript
// src/hooks/useNotifications.ts
"use client";
import { useState, useEffect, useCallback, useRef } from "react";

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Silently fail -- notification count is non-critical
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchCount();

    // Poll every 30 seconds
    intervalRef.current = setInterval(fetchCount, 30_000);

    // Visibility change handler
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchCount(); // Immediate refresh on tab focus
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchCount]);

  return { unreadCount, refresh: fetchCount };
}
```

### Pattern 4: Notification Creation as Server-Side Helper
**What:** A `createNotification()` function in `src/lib/notifications.ts` that inserts a notification row. Called from server-side code (API routes, server actions) -- never directly from the client.
**When to use:** When coach submits feedback (NOTIF-05), or any future notification trigger.
**Example:**
```typescript
// src/lib/notifications.ts
import { db } from "@/db";
import { notifications } from "@/db/schema";

export async function createNotification(params: {
  userId: string;      // Target user's DB ID
  type: string;        // "coach_feedback" | "system" | etc.
  title: string;
  body: string;
  linkUrl?: string;    // Optional deep link
}) {
  return db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    linkUrl: params.linkUrl,
  }).returning();
}
```

### Anti-Patterns to Avoid
- **Client-side notification creation:** Never let the client create notifications directly. Notifications are created server-side as side effects of business events.
- **Polling the full notification list:** Poll only the count. Fetch the full list only when the user opens the dropdown.
- **Global state library for notifications:** A simple `useNotifications` hook with local state is sufficient. No need for Zustand, Redux, or React Context for this.
- **Toasts as primary notification mechanism:** Toasts are ephemeral and disappear. In-app notifications must be persistent and stored in the database.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dropdown positioning | Custom absolute positioning | @radix-ui/react-popover | Handles collision detection, portals, accessibility, keyboard nav |
| Relative time display | Custom "X minutes ago" logic | date-fns `formatDistanceToNow` | Edge cases with localization, "just now" vs "1 minute ago" |
| Polling interval management | Raw setInterval | Custom `useNotifications` hook (described above) | Must handle cleanup, visibility, and race conditions |
| Request validation | Manual field checking | Zod schemas | Consistent with rest of codebase, type-safe |

**Key insight:** The notification system itself is simple enough to build custom (no need for Knock, Novu, etc.), but the UI primitives (popover, time formatting) should use established libraries.

## Common Pitfalls

### Pitfall 1: No Database Index on User + Read Status
**What goes wrong:** Notification count queries become slow as the table grows because they scan all rows.
**Why it happens:** Developers create the table but forget to index the most-queried columns.
**How to avoid:** Add a composite index on `(user_id, read)` from day one. Also index `(user_id, created_at)` for the list query.
**Warning signs:** Count endpoint taking >50ms in production.

### Pitfall 2: Race Condition on "Mark All Read"
**What goes wrong:** User clicks "Mark All Read" while new notifications arrive, potentially marking unseen notifications as read.
**Why it happens:** Using `UPDATE ... WHERE user_id = X AND read = false` without a timestamp boundary.
**How to avoid:** Use `UPDATE ... WHERE user_id = X AND read = false AND created_at <= :timestamp` where timestamp is the moment the user opened the panel.
**Warning signs:** Users report missing notifications they never saw.

### Pitfall 3: Missing Header Component
**What goes wrong:** The bell icon must appear on every dashboard page but there is no shared header/navbar.
**Why it happens:** The current app renders headers inline in each page component.
**How to avoid:** Create a shared `AppHeader` component and refactor dashboard pages to use it. This is a prerequisite for the notification bell.
**Warning signs:** Bell appearing on some pages but not others; duplicated header code.

### Pitfall 4: Notification Preferences Not Checked at Creation Time
**What goes wrong:** Muted notifications still appear in the dropdown.
**Why it happens:** Checking preferences only at display time means notifications are still created and counted.
**How to avoid:** Check user preferences in `createNotification()` BEFORE inserting the row. If the user has muted that category, skip insertion entirely.
**Warning signs:** Users complain about notifications appearing for categories they muted.

### Pitfall 5: Polling Continues When Tab Is Hidden
**What goes wrong:** Wasted API calls and database queries when user isn't looking at the page.
**Why it happens:** Using `setInterval` without `visibilitychange` detection.
**How to avoid:** Implement the visibility-aware polling pattern (Pattern 3 above).
**Warning signs:** Unexpectedly high request volume on the count endpoint.

### Pitfall 6: Forgetting to Clean Up Old Notifications
**What goes wrong:** Notifications table grows unbounded, slowing queries and consuming storage.
**Why it happens:** No retention policy.
**How to avoid:** Add a `deletedAt` soft-delete column (consistent with codebase pattern) and periodically clean up notifications older than 90 days, or implement pagination with a hard limit (e.g., show last 50).
**Warning signs:** Table exceeding 100k rows per user.

## Code Examples

### Notifications Schema (Drizzle ORM)
```typescript
// src/db/schema/notifications.ts
// Source: Follows existing codebase patterns from interactions.ts, submissions.ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// Notification type enum
export const notificationTypeEnum = pgEnum("notification_type", [
  "coach_feedback",
  "submission_graded",
  "course_access",
  "system",
]);

// Notification category enum (for mute preferences)
export const notificationCategoryEnum = pgEnum("notification_category", [
  "feedback",     // Coach feedback, AI grading results
  "progress",     // Course access, milestones
  "system",       // System announcements, maintenance
]);

// Notifications table
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  category: notificationCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").notNull().default(false),
  linkUrl: text("link_url"),              // Deep link into the app
  metadata: text("metadata"),             // JSON string for extra data
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
  deletedAt: timestamp("deleted_at"),     // Soft delete (codebase pattern)
}, (table) => [
  index("notifications_user_read_idx").on(table.userId, table.read),
  index("notifications_user_created_idx").on(table.userId, table.createdAt),
]);

// Notification preferences table
export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  category: notificationCategoryEnum("category").notNull(),
  muted: boolean("muted").notNull().default(false),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("notification_prefs_user_idx").on(table.userId),
]);

// Relations
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.userId],
      references: [users.id],
    }),
  })
);

// Type inference
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
```

### Notification Bell Component (Radix UI Popover)
```typescript
// src/components/notifications/NotificationBell.tsx
"use client";
import { Bell } from "lucide-react";
import { Popover } from "radix-ui";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPanel } from "./NotificationPanel";

export function NotificationBell() {
  const { unreadCount, refresh } = useNotifications();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="relative p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-5 w-5 text-zinc-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="w-80 max-h-96 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50"
          sideOffset={8}
          align="end"
        >
          <NotificationPanel onAction={refresh} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

### Integration Point: Coach Feedback Creates Notification
```typescript
// In src/app/api/submissions/[submissionId]/feedback/route.ts
// Add after the existing email notification trigger (step 7):

// 8. Create in-app notification for student
import { createNotification } from "@/lib/notifications";

await createNotification({
  userId: submission.userId,   // Student's DB user ID
  type: "coach_feedback",
  category: "feedback",
  title: "New feedback from your coach",
  body: `${currentUser.name || "Your coach"} left feedback on your ${submission.lesson.title} submission`,
  linkUrl: `/my-feedback`,     // Deep link to feedback page
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSockets for everything | Polling for low-frequency, SSE for medium, WS for high | 2023+ | Simpler architecture for notification-volume apps |
| Custom dropdown positioning | Radix UI Popover/Dropdown primitives | 2022+ | Automatic collision detection, accessibility |
| Class components with componentDidMount | useEffect + useCallback hooks | React 16.8+ | Cleaner lifecycle management for polling |
| REST polling | React Query / SWR with refetchInterval | 2023+ | Built-in caching, deduplication -- but overkill for a single count endpoint |

**Deprecated/outdated:**
- `@radix-ui/react-popover` import style changed: use `import { Popover } from "radix-ui"` (new unified import) instead of `import * as Popover from "@radix-ui/react-popover"` (old pattern). The project should use the unified import.

## Open Questions

1. **Should notifications table use `jsonb` for metadata instead of `text`?**
   - What we know: Postgres `jsonb` allows querying inside the JSON, `text` is simpler and matches codebase pattern (no other tables use jsonb)
   - What's unclear: Whether future features will need to query notification metadata
   - Recommendation: Start with `text` (JSON string). Migrate to `jsonb` only if querying metadata becomes necessary.

2. **Should the header be a layout-level component or per-page?**
   - What we know: The app currently has no shared layout for `(dashboard)` pages. Each page renders its own header.
   - What's unclear: Whether refactoring all pages to use a shared header is in scope for this phase
   - Recommendation: Create `AppHeader` component and integrate it into the `(dashboard)` route group layout. This is the correct architecture and prevents the bell from being missing on any page. The refactor is minimal since pages use consistent header patterns.

3. **Notification retention policy**
   - What we know: Without cleanup, the table grows indefinitely
   - What's unclear: Exact retention period
   - Recommendation: Implement soft delete with `deletedAt`. Show only last 50 notifications in the panel. Defer automated cleanup to a future phase.

## Sources

### Primary (HIGH confidence)
- Context7 `/drizzle-team/drizzle-orm-docs` - pgTable schema, indexes, relations, enums, type inference
- Context7 `/websites/radix-ui-primitives` - Popover component API (trigger, content, portal, positioning)
- Codebase analysis: `src/db/schema/*.ts`, `src/app/api/submissions/[submissionId]/feedback/route.ts`, `src/lib/auth.ts`, `src/app/(dashboard)/dashboard/page.tsx`

### Secondary (MEDIUM confidence)
- [Real-Time Notifications with SSE in Next.js](https://www.pedroalonso.net/blog/sse-nextjs-real-time-notifications/) - Confirmed polling vs SSE vs WebSocket tradeoffs
- [Implementing Polling in React](https://medium.com/@sfcofc/implementing-polling-in-react-a-guide-for-efficient-real-time-data-fetching-47f0887c54a7) - useInterval + visibilitychange pattern
- [Building In-App Notifications in Next.js (Stream)](https://getstream.io/blog/in-app-notifications-nextjs/) - Architecture validation
- [Top 7 Notification Solutions for Next.js](https://dev.to/ethanleetech/top-7-notification-solutions-for-nextjs-application-160k) - Confirmed custom build is appropriate for simple cases

### Tertiary (LOW confidence)
- Radix UI unified import (`import { Popover } from "radix-ui"`) -- verified against package but may depend on installed version

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in use except @radix-ui/react-popover (same Radix ecosystem)
- Architecture: HIGH - Patterns derived from existing codebase analysis and well-established polling patterns
- Pitfalls: HIGH - Common database and polling pitfalls are well-documented in the ecosystem
- Schema design: HIGH - Follows exact same patterns as existing tables (interactions.ts, submissions.ts)
- Radix Popover import style: MEDIUM - Unified import may depend on version installed

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (stable domain, 30-day validity)
