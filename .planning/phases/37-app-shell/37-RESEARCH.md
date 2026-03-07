# Phase 37: App Shell & Navigation - Research

**Researched:** 2026-02-07
**Domain:** Next.js App Router layout architecture, shadcn/ui sidebar component, role-based navigation
**Confidence:** HIGH

## Summary

Phase 37 wraps the entire authenticated LMS in a persistent sidebar layout using the shadcn/ui sidebar component. The codebase currently has NO sidebar, NO `(dashboard)` layout file, and NO `not-found.tsx`. Every page independently renders its own `<div className="min-h-screen">` wrapper and `<AppHeader>` component. The sidebar component will replace this pattern with a shared layout in `src/app/(dashboard)/layout.tsx` that provides `SidebarProvider` + `AppSidebar` + `SidebarInset` wrapping all authenticated pages.

The shadcn/ui sidebar is a composable component system built on Radix primitives (all already installed). It automatically handles mobile as an offcanvas sheet, persists open/closed state via cookie, detects active routes via `usePathname`, and collapses to icon-only mode. The settings page needs 2 new DB columns (`dailyGoalXp`, `timezone`) on the users table plus a new settings page at `/settings`. The 404 page and error boundary are straightforward Next.js file conventions.

**Primary recommendation:** Install the shadcn/ui sidebar component via CLI (`npx shadcn@latest add sidebar`), create a `(dashboard)/layout.tsx` that wraps all authenticated pages with `SidebarProvider`, build role-based nav data from Clerk session claims, add a settings page with server-side form, and create a branded `not-found.tsx` at the app root.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui sidebar | latest (v3) | Composable sidebar component system | Already decided by user; CSS variables already in `globals.css` |
| Next.js App Router | 16.1.4 | Layout system, `not-found.tsx`, `error.tsx` conventions | Already in use |
| Clerk `@clerk/nextjs` | 6.36.10 | Role detection via `sessionClaims.metadata.role` | Already in use; `auth.ts` has `checkRole()` and `hasMinimumRole()` |
| Drizzle ORM | 0.45.1 | Schema extension for settings columns | Already in use |
| lucide-react | 0.563.0 | Sidebar icons | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-tooltip` | 1.2.8 | Sidebar icon tooltips in collapsed mode | Already installed |
| `@radix-ui/react-collapsible` | 1.1.12 | Collapsible nav groups | Already installed |
| `@radix-ui/react-separator` | 1.1.7 | Visual separators between nav sections | Already installed |
| `@radix-ui/react-dropdown-menu` | 2.1.16 | User menu in sidebar footer | Already installed |
| `@radix-ui/react-avatar` | 1.1.10 | User avatar in sidebar footer | Already installed |
| `@radix-ui/react-dialog` | 1.1.15 | Sheet component (mobile sidebar) | Already installed |
| `next/headers` (cookies) | built-in | Reading `sidebar_state` cookie for SSR | Used for sidebar persistence |
| `zod` | 4.3.6 | Settings form validation | Already installed |
| `react-hook-form` | 7.71.1 | Settings form management | Already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui sidebar | Custom sidebar from scratch | User already decided on shadcn/ui sidebar. No reason to deviate. |
| Cookie persistence for sidebar state | localStorage | Cookie works SSR-side for initial render; localStorage causes flash. Cookie is the shadcn default. |
| Extending users table for settings | Separate user_settings table | Simpler to add columns to existing users table; only 2 new columns needed (dailyGoalXp, timezone). Notification preferences already have their own table. |

**Installation:**
```bash
npx shadcn@latest add sidebar
```

This installs `src/components/ui/sidebar.tsx` and any missing sub-components (tooltip, separator, collapsible). It will also add shadcn/ui components: `avatar`, `collapsible`, `dropdown-menu`, `separator`, `tooltip` if not already present as files in `src/components/ui/`.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (auth)/                    # Auth pages (no sidebar)
│   │   ├── sign-in/
│   │   └── sign-up/
│   ├── (dashboard)/               # All authenticated pages (sidebar layout)
│   │   ├── layout.tsx             # NEW: SidebarProvider + AppSidebar + SidebarInset
│   │   ├── error.tsx              # EXISTS: dashboard error boundary
│   │   ├── dashboard/             # Student dashboard
│   │   ├── courses/               # Course detail
│   │   ├── lessons/               # Lesson player
│   │   ├── practice/              # Practice player
│   │   ├── settings/              # NEW: Student settings page
│   │   │   └── page.tsx
│   │   ├── my-conversations/
│   │   ├── my-feedback/
│   │   ├── coach/                 # Coach tools
│   │   └── admin/                 # Admin tools
│   ├── not-found.tsx              # NEW: Branded 404 page
│   ├── error.tsx                  # EXISTS: Root error boundary
│   ├── global-error.tsx           # EXISTS: Global error boundary
│   ├── layout.tsx                 # EXISTS: Root layout (ClerkProvider, fonts)
│   └── page.tsx                   # EXISTS: Redirect to /dashboard
├── components/
│   ├── layout/
│   │   ├── AppHeader.tsx          # EXISTS: Will be REPLACED by sidebar header
│   │   ├── AppSidebar.tsx         # NEW: Main sidebar component
│   │   ├── NavMain.tsx            # NEW: Role-based nav items
│   │   ├── NavUser.tsx            # NEW: User info in sidebar footer
│   │   └── SidebarHeader.tsx      # NEW: Logo/brand in sidebar header
│   └── ui/
│       ├── sidebar.tsx            # NEW: shadcn/ui sidebar primitives
│       ├── tooltip.tsx            # NEW: Added by sidebar CLI
│       ├── separator.tsx          # NEW: Added by sidebar CLI
│       ├── collapsible.tsx        # NEW: Added by sidebar CLI
│       ├── dropdown-menu.tsx      # NEW: Added by sidebar CLI
│       ├── avatar.tsx             # NEW: Added by sidebar CLI
│       └── sheet.tsx              # EXISTS: Used internally by sidebar for mobile
└── db/
    └── schema/
        └── users.ts               # MODIFY: Add dailyGoalXp, timezone columns
```

### Pattern 1: Dashboard Layout with SidebarProvider
**What:** A shared layout that wraps all `(dashboard)` pages with the sidebar
**When to use:** This is the single layout file that provides the sidebar to all authenticated pages
**Example:**
```typescript
// Source: Context7 /websites/ui_shadcn - Sidebar docs
// src/app/(dashboard)/layout.tsx
import { cookies } from "next/headers";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 px-4">
          <SidebarTrigger className="-ml-1" />
          {/* Breadcrumb or page title can go here */}
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

### Pattern 2: Role-Based Navigation Data
**What:** Sidebar navigation items filtered by the user's role from Clerk session claims
**When to use:** The sidebar must show different nav sections based on student/coach/admin role
**Example:**
```typescript
// Source: Codebase pattern from src/lib/auth.ts + shadcn/ui sidebar docs
import type { Roles } from "@/types/globals";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  items?: { title: string; url: string }[];
};

type NavSection = {
  label: string;
  items: NavItem[];
  minRole: Roles;
};

const navSections: NavSection[] = [
  {
    label: "Learning",
    minRole: "student",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: Home },
      { title: "My Courses", url: "/courses", icon: BookOpen },
      { title: "Practice", url: "/dashboard/practice", icon: ClipboardList },
      { title: "Conversations", url: "/my-conversations", icon: MessageSquare },
      { title: "Feedback", url: "/my-feedback", icon: MessageCircle },
    ],
  },
  {
    label: "Coach Tools",
    minRole: "coach",
    items: [
      { title: "Coach Dashboard", url: "/coach", icon: Users },
      { title: "Submissions", url: "/coach/submissions", icon: Inbox },
      { title: "Pronunciation", url: "/coach/pronunciation", icon: Mic },
      { title: "Conversations", url: "/coach/conversations", icon: MessageSquare },
      { title: "Students", url: "/coach/students", icon: Users },
    ],
  },
  {
    label: "Admin",
    minRole: "admin",
    items: [
      { title: "Admin Dashboard", url: "/admin", icon: Shield },
      { title: "Courses", url: "/admin/courses", icon: BookOpen },
      { title: "Exercises", url: "/admin/exercises", icon: ClipboardList },
      // ... more admin items
    ],
  },
];

// Filter by role hierarchy
function getNavForRole(role: Roles): NavSection[] {
  const roleHierarchy: Roles[] = ["student", "coach", "admin"];
  const userLevel = roleHierarchy.indexOf(role);
  return navSections.filter(
    (section) => userLevel >= roleHierarchy.indexOf(section.minRole)
  );
}
```

### Pattern 3: Active State Highlighting with usePathname
**What:** Detect the current route and highlight the active sidebar item
**When to use:** Every sidebar menu button needs to show an active state
**Example:**
```typescript
// Source: shadcn/ui sidebar docs + Next.js usePathname
"use client";

import { usePathname } from "next/navigation";
import { SidebarMenuButton } from "@/components/ui/sidebar";

function NavItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  // Exact match for top-level routes, startsWith for nested
  const isActive = pathname === item.url || pathname.startsWith(item.url + "/");

  return (
    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
      <Link href={item.url}>
        <item.icon />
        <span>{item.title}</span>
      </Link>
    </SidebarMenuButton>
  );
}
```

### Pattern 4: Page Migration (Removing Per-Page Wrappers)
**What:** Existing pages wrap themselves in `<div className="min-h-screen">` + `<AppHeader>`. The sidebar layout replaces both.
**When to use:** Every page under `(dashboard)` needs this migration
**Example:**
```typescript
// BEFORE (current pattern on ALL pages):
export default async function DashboardPage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <AppHeader title="Dashboard" />
      <div className="container mx-auto px-4 py-8">
        {/* content */}
      </div>
    </div>
  );
}

// AFTER (sidebar provides the shell):
export default async function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* content only -- sidebar + header come from layout.tsx */}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Nesting SidebarProvider:** Never place `SidebarProvider` inside individual pages. It belongs in `(dashboard)/layout.tsx` once.
- **Reading cookies in client components:** The cookie read for `defaultOpen` MUST happen in the server-side layout, not in a client component. The shadcn/ui sidebar handles client-side state updates internally.
- **Duplicating role checks in sidebar:** The sidebar should read the role once (from a server component or passed as prop) and filter nav items client-side. Don't call `auth()` inside every sidebar sub-component.
- **Using min-h-screen on pages after sidebar:** The sidebar layout already provides full-height structure. Pages inside `SidebarInset` should NOT use `min-h-screen`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidebar with collapse/expand | Custom sidebar with CSS transitions | `npx shadcn@latest add sidebar` | 1000+ lines of composable components with mobile, cookies, keyboard shortcuts, a11y built-in |
| Mobile offcanvas menu | Custom sheet/drawer | shadcn/ui sidebar auto-switches to sheet on mobile | Handles breakpoint detection, touch gestures, overlay, animation |
| Sidebar state persistence | localStorage + useEffect | Built-in cookie persistence in SidebarProvider | SSR-safe, no hydration flash, 7-day default TTL |
| Active route detection | Custom route matching | `usePathname()` + `isActive` prop on `SidebarMenuButton` | shadcn/ui sidebar has built-in `isActive` styling via data attributes |
| 404 page | Custom error catching | Next.js `not-found.tsx` convention | Framework-native, automatic for unmatched routes, supports metadata |
| Error boundary | Custom try/catch wrappers | Next.js `error.tsx` + `global-error.tsx` | Already exists in project; just ensure coverage |

**Key insight:** The shadcn/ui sidebar component is extremely comprehensive. It handles mobile detection, cookie persistence, keyboard shortcuts (Cmd+B), collapsible icon mode, tooltips in collapsed mode, and sheet overlay on mobile -- all out of the box. Building any of this manually would be hundreds of lines of brittle code.

## Common Pitfalls

### Pitfall 1: Not Creating (dashboard)/layout.tsx
**What goes wrong:** Without a layout file in the `(dashboard)` route group, there's no shared wrapper for the sidebar. Each page continues rendering independently.
**Why it happens:** The `(dashboard)` route group currently has NO `layout.tsx` -- it's just a folder grouping. The root `layout.tsx` provides `ClerkProvider` but not the sidebar.
**How to avoid:** Create `src/app/(dashboard)/layout.tsx` as the FIRST step. This is the single most important file in the phase.
**Warning signs:** Pages render without a sidebar, or sidebar appears/disappears on navigation.

### Pitfall 2: Forgetting to Remove Per-Page min-h-screen and AppHeader
**What goes wrong:** Pages render with double headers (sidebar header + per-page AppHeader) and broken layout (min-h-screen inside SidebarInset causes overflow).
**Why it happens:** There are 30+ pages that all independently render `<AppHeader>` and `<div className="min-h-screen">`.
**How to avoid:** Systematically migrate every page under `(dashboard)`. Search for `AppHeader` imports and `min-h-screen` classes. The layout provides the shell; pages provide only content.
**Warning signs:** Double headers, scrollbar issues, content overflow beyond viewport.

### Pitfall 3: Cookie Persistence in Next.js 16
**What goes wrong:** The `cookies()` call in the layout can trigger a "Blocking Route Server Data" warning with Next.js 16 Cache Components.
**Why it happens:** Async cookie reads block page rendering if Cache Components is enabled.
**How to avoid:** This project does NOT have Cache Components enabled in `next.config.ts`, so this is not currently an issue. If it's enabled later, wrap the SidebarProvider in a `<Suspense>` boundary.
**Warning signs:** Console warning about "Data that blocks navigation was accessed outside of <Suspense>".

### Pitfall 4: Passing User Role to Client Sidebar
**What goes wrong:** Calling `auth()` in a client component fails. The sidebar component is client-side (uses hooks).
**Why it happens:** `auth()` from `@clerk/nextjs/server` is server-only.
**How to avoid:** Read the role in the server-side layout, pass it as a prop to the `<AppSidebar role={role} />` client component. Alternatively, use `useUser()` from Clerk client SDK inside the sidebar to get user metadata.
**Warning signs:** "auth() is not available in client components" error.

### Pitfall 5: Settings Page Schema Overlap with Phase 39
**What goes wrong:** Phase 37 adds `dailyGoalXp` to the users table, but Phase 39 (XP & Streak Engine) also needs daily goal data.
**Why it happens:** The daily goal setting lives on the settings page (Phase 37) but is consumed by the XP engine (Phase 39).
**How to avoid:** Phase 37 adds the `dailyGoalXp` column with a sensible default (100 = Regular). Phase 39 reads it. The column is the contract between the two phases. Use an integer column, not an enum, so Phase 39 can define exact tier values.
**Warning signs:** Phase 39 creates a duplicate column or can't find the daily goal data.

### Pitfall 6: Not Updating Middleware for /settings Route
**What goes wrong:** The `/settings` page is not accessible because middleware doesn't include it in protected routes.
**Why it happens:** The `isProtectedRoute` matcher in `middleware.ts` currently only includes `/dashboard`, `/courses`, `/lessons`, `/practice`.
**How to avoid:** Add `/settings(.*)` to the `isProtectedRoute` matcher. Or better: since the `(dashboard)` route group is just organizational and doesn't affect URLs, the `/settings` path will be at `/(dashboard)/settings` in the filesystem but `/settings` in the URL.
**Warning signs:** Unauthenticated users can access settings, or authenticated users get redirected away from settings.

## Code Examples

### Installing the Sidebar Component
```bash
# Source: Context7 /websites/ui_shadcn - Sidebar installation
npx shadcn@latest add sidebar
```

### Dashboard Layout with Cookie Persistence
```typescript
// Source: Context7 /websites/ui_shadcn + /websites/nextjs
// src/app/(dashboard)/layout.tsx
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import type { Roles } from "@/types/globals";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const role = (sessionClaims?.metadata?.role || "student") as Roles;
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={role} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
```

### Sidebar Collapsible Mode with Icon-Only
```typescript
// Source: Context7 /websites/ui_shadcn - Sidebar collapsible
<Sidebar collapsible="icon" className="border-r border-zinc-800">
  <SidebarHeader>
    {/* Logo that collapses to icon */}
  </SidebarHeader>
  <SidebarContent>
    <SidebarGroup>
      <SidebarGroupLabel>Learning</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={...} tooltip={item.title}>
                <Link href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  </SidebarContent>
  <SidebarFooter>
    {/* User info + settings link */}
  </SidebarFooter>
  <SidebarRail />
</Sidebar>
```

### not-found.tsx (Branded 404 Page)
```typescript
// Source: Context7 /websites/nextjs - not-found convention
// src/app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-zinc-600 mb-4">404</h1>
        <h2 className="text-xl font-semibold text-white mb-2">Page Not Found</h2>
        <p className="text-zinc-400 text-sm mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
```

### Schema Migration for Settings Fields
```typescript
// Source: Codebase pattern from src/db/schema/users.ts
// Add to users table:
import { integer, text } from "drizzle-orm/pg-core";

// In the users pgTable definition:
dailyGoalXp: integer("daily_goal_xp").notNull().default(100), // Regular tier
timezone: text("timezone").notNull().default("UTC"),
```

### Settings Page Server Action Pattern
```typescript
// Source: Next.js App Router conventions
// src/app/(dashboard)/settings/page.tsx (server component)
import { getCurrentUser } from "@/lib/auth";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>
      <SettingsForm
        languagePreference={user.languagePreference}
        dailyGoalXp={user.dailyGoalXp}
        timezone={user.timezone}
      />
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-page layout wrappers | Shared `(dashboard)/layout.tsx` with sidebar | shadcn/ui sidebar v3 (2024) | Single layout file controls all authenticated page structure |
| Custom mobile drawer | shadcn/ui sidebar auto-mobile sheet | shadcn/ui sidebar built-in | Zero custom code for mobile navigation |
| localStorage sidebar state | Cookie-based persistence with SSR read | shadcn/ui sidebar default | No hydration flash, server-rendered initial state |
| Manual `not-found` handling | `not-found.tsx` file convention | Next.js 14+ (App Router) | Automatic 404 for unmatched routes |

**Deprecated/outdated:**
- `pages/_error.tsx`: Replaced by `error.tsx` / `global-error.tsx` in App Router
- Manual 404 pages via `getStaticPaths fallback: false`: Replaced by `not-found.tsx`

## Existing Codebase Inventory

### What Already Exists (DO NOT recreate)
| Asset | Location | Status |
|-------|----------|--------|
| Root layout with ClerkProvider | `src/app/layout.tsx` | Keep as-is |
| Root error boundary | `src/app/error.tsx` | Keep, enhance styling |
| Global error boundary | `src/app/global-error.tsx` | Keep as-is |
| Dashboard error boundary | `src/app/(dashboard)/error.tsx` | Keep as-is |
| AppHeader component | `src/components/layout/AppHeader.tsx` | Will be replaced by sidebar header |
| Sheet component | `src/components/ui/sheet.tsx` | Used by sidebar internally |
| Auth utilities | `src/lib/auth.ts` | Has `checkRole()`, `hasMinimumRole()`, `getCurrentUser()` |
| Role types | `src/types/globals.d.ts` | Defines `Roles` type and JWT session claims |
| Middleware with role checks | `middleware.ts` | Already has admin/coach route protection |
| User preferences API | `src/app/api/user/preferences/route.ts` | Handles `languagePreference` GET/PATCH |
| Notification preferences API | `src/app/api/notifications/preferences/route.ts` | Handles notification mute/unmute per category |
| Sidebar CSS variables | `src/app/globals.css` | Already defined for light and dark modes |
| All Radix primitives | `node_modules/@radix-ui/` | tooltip, collapsible, separator, dropdown-menu, avatar, dialog all installed |
| ChatWidget (global) | `src/components/chat/ChatWidget.tsx` | Renders in root layout, floats over pages |
| components.json | `/components.json` | shadcn/ui config with new-york style |

### What Needs Creating
| Asset | Location | Purpose |
|-------|----------|---------|
| Sidebar primitives | `src/components/ui/sidebar.tsx` | Via `npx shadcn@latest add sidebar` |
| Tooltip primitives | `src/components/ui/tooltip.tsx` | Via sidebar CLI (dependency) |
| Separator primitives | `src/components/ui/separator.tsx` | Via sidebar CLI (dependency) |
| Collapsible primitives | `src/components/ui/collapsible.tsx` | Via sidebar CLI (dependency) |
| DropdownMenu primitives | `src/components/ui/dropdown-menu.tsx` | Via sidebar CLI (dependency) |
| Avatar primitives | `src/components/ui/avatar.tsx` | Via sidebar CLI (dependency) |
| Dashboard layout | `src/app/(dashboard)/layout.tsx` | SidebarProvider + AppSidebar + SidebarInset |
| AppSidebar component | `src/components/layout/AppSidebar.tsx` | Main sidebar with role-based nav |
| NavMain component | `src/components/layout/NavMain.tsx` | Navigation item renderer |
| NavUser component | `src/components/layout/NavUser.tsx` | User info in sidebar footer |
| Settings page | `src/app/(dashboard)/settings/page.tsx` | User preferences form |
| SettingsForm component | `src/components/settings/SettingsForm.tsx` | Client form for settings |
| Not-found page | `src/app/not-found.tsx` | Branded 404 |
| DB migration | `src/db/migrations/` | Add `dailyGoalXp`, `timezone` to users |

### What Needs Modification
| Asset | Change |
|-------|--------|
| `src/db/schema/users.ts` | Add `dailyGoalXp` (integer, default 100) and `timezone` (text, default "UTC") columns |
| `src/app/api/user/preferences/route.ts` | Extend to support `dailyGoalXp` and `timezone` fields |
| `middleware.ts` | Add `/settings(.*)` to `isProtectedRoute` matcher |
| ~30 page files under `(dashboard)/` | Remove `min-h-screen` wrapper and `<AppHeader>` import (layout provides these) |
| Loading skeletons | Update to not include `AppHeader` since layout now provides header |

## Page Migration Scope

Pages that currently render `<AppHeader>` (need migration):
- `(dashboard)/dashboard/page.tsx`
- `(dashboard)/dashboard/practice/page.tsx`
- `(dashboard)/dashboard/loading.tsx`
- `(dashboard)/courses/[courseId]/page.tsx`
- `(dashboard)/courses/[courseId]/loading.tsx`
- `(dashboard)/lessons/[lessonId]/page.tsx`
- `(dashboard)/my-conversations/page.tsx`
- `(dashboard)/my-feedback/page.tsx`
- `(dashboard)/coach/page.tsx`
- `(dashboard)/coach/loading.tsx`
- `(dashboard)/coach/conversations/page.tsx`
- `(dashboard)/coach/conversations/loading.tsx`
- `(dashboard)/coach/pronunciation/page.tsx`
- `(dashboard)/coach/students/page.tsx`
- `(dashboard)/coach/submissions/[submissionId]/page.tsx`
- `(dashboard)/admin/page.tsx`
- `(dashboard)/admin/loading.tsx`
- All admin sub-pages (~15 pages)

**Total: ~30-35 files** need the wrapper/header removal.

## Open Questions

1. **Sidebar header content**
   - What we know: The sidebar header typically contains a logo/brand. The current app has no logo component.
   - What's unclear: Whether the user wants a text-only brand ("CantoMando") or an icon/logo.
   - Recommendation: Use a text logo with an icon (e.g., the Languages/BookOpen icon) that collapses to just the icon in icon-only mode. Can be changed later.

2. **Settings page location in nav**
   - What we know: NAV-04 requires a settings page. Phase 39 also needs daily goal on settings.
   - What's unclear: Whether settings should be a sidebar nav item or only accessible from the user menu in the sidebar footer.
   - Recommendation: Put a Settings link in the sidebar footer user dropdown menu (consistent with shadcn/ui patterns), and also add a gear icon in the sidebar footer area for quick access.

3. **Page migration strategy**
   - What we know: ~30-35 files need `min-h-screen` and `<AppHeader>` removed.
   - What's unclear: Whether to do this as a batch operation or page-by-page.
   - Recommendation: Batch migration in a single plan. The change is mechanical (remove wrapper div, remove AppHeader import, adjust container). Can be done with search-and-replace patterns.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/ui_shadcn` - Sidebar component documentation, installation, SidebarProvider, composable architecture
- Context7 `/websites/nextjs` - not-found.tsx, error.tsx, layout conventions for App Router
- Codebase analysis - All file paths, component patterns, schema, and API routes verified by direct file reads

### Secondary (MEDIUM confidence)
- [shadcn/ui sidebar docs (v3)](https://v3.shadcn.com/docs/components/sidebar) - Full component API, cookie persistence, mobile behavior
- [Next.js 16 SidebarProvider issue #9189](https://github.com/shadcn-ui/ui/issues/9189) - Cookie persistence + Cache Components conflict (not applicable to this project since Cache Components is not enabled)

### Tertiary (LOW confidence)
- None. All findings verified against codebase and official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - shadcn/ui sidebar is the user's chosen solution; all Radix dependencies already installed
- Architecture: HIGH - Next.js App Router layout patterns well-documented; existing codebase structure fully mapped
- Pitfalls: HIGH - All 6 pitfalls identified from direct codebase analysis and official docs
- Page migration scope: HIGH - Every affected file identified by grep

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable; shadcn/ui sidebar is mature, Next.js 16 layout conventions are settled)
