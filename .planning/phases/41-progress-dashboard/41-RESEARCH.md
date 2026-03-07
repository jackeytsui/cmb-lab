# Phase 41: Progress Dashboard - Research

**Researched:** 2026-02-08
**Domain:** Data visualization, dashboard UI, charting, heatmaps
**Confidence:** HIGH

## Summary

Phase 41 builds a dedicated progress dashboard page at `/dashboard/progress` where students see a rich personal overview: XP timeline chart, GitHub-style activity heatmap, mastery map, badge collection, and weekly comparison card. The codebase already has all the data infrastructure needed -- `xp_events` (append-only ledger), `daily_activity` (one row per user per day with XP, lesson/practice/conversation counts, goal tracking), `lesson_progress` (per-lesson completion), and `practice_attempts` (per-set scores). The existing `getXPDashboard()` function and `/api/xp` route provide level, streak, daily, and ring data. The user-facing `XPOverview` component on the main dashboard already renders level badge, streak display, activity rings, and daily goal progress.

The core technical challenge is adding **Recharts** (via shadcn/ui Charts) for the XP timeline area chart, choosing a lightweight heatmap library for the activity calendar, and building efficient SQL aggregation queries for timeline/heatmap/mastery data. No new database tables are needed -- all data sources exist. The main work is: (1) install recharts + shadcn chart component, (2) add `react-activity-calendar` for the heatmap, (3) build API routes or server-side data fetching functions for timeline, heatmap, mastery, and badge data, (4) compose the dashboard page from distinct card components.

**Primary recommendation:** Use server components for the page shell with client component cards for interactive elements (chart toggles, tooltips). Fetch all data server-side via direct DB queries (not self-fetching API routes, per the known 401 bug pattern). Use Recharts `AreaChart` via shadcn/ui `ChartContainer` for the XP timeline, `react-activity-calendar` for the heatmap, and custom grid components for mastery map and badge collection.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^2.15 | XP timeline area chart | Decision already locked in STATE.md; shadcn/ui Charts wraps it |
| @/components/ui/chart | shadcn/ui | ChartContainer, ChartTooltip, ChartConfig wrappers | Locked decision: "Recharts via shadcn/ui Charts for dashboard" |
| react-activity-calendar | ^3.1 | GitHub-style contribution heatmap | 20k weekly downloads, 170kB install, MIT, purpose-built for this exact use case |
| framer-motion | ^12.29 (already installed) | Animated counters in weekly summary | Already used extensively in XP components and celebrations |
| date-fns | ^4.1 (already installed) | Date manipulation for timeline/heatmap ranges | Already in use for XP timezone utilities |
| @date-fns/tz | ^1.4 (already installed) | Timezone-aware date calculations | Already in use in xp.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.563 (installed) | Icons for badges, mastery indicators | Already used throughout project |
| @radix-ui/react-tabs | (via shadcn/ui tabs) | Daily/weekly/monthly toggle on XP chart | Already installed as src/components/ui/tabs.tsx |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-activity-calendar | Custom SVG grid | Heatmap is deceptively complex (day alignment, month labels, responsive sizing, color scales) -- library handles all edge cases |
| react-activity-calendar | @uiw/react-heat-map | react-activity-calendar has better React 19 compat, simpler API, lighter bundle |
| recharts | visx / nivo | Project decision already locked to Recharts via shadcn/ui Charts |

**Installation:**
```bash
npx shadcn@latest add chart
npm install react-activity-calendar
```

Note: `npx shadcn@latest add chart` will install `recharts` as a dependency AND create `src/components/ui/chart.tsx` with `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, and `ChartConfig` type.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(dashboard)/dashboard/progress/
│   ├── page.tsx              # Server component — data fetching + layout
│   └── loading.tsx           # Skeleton loading state
├── components/progress/
│   ├── XPTimeline.tsx        # Client — AreaChart with daily/weekly/monthly toggle
│   ├── ActivityHeatmap.tsx   # Client — react-activity-calendar wrapper
│   ├── MasteryMap.tsx        # Client or Server — grid of course/module/lesson completion
│   ├── BadgeCollection.tsx   # Client — earned vs locked badges with progress
│   └── WeeklySummary.tsx     # Client — comparison card with animated counters
├── lib/
│   └── progress-dashboard.ts # Server — all DB queries for dashboard data
```

### Pattern 1: Server-Side Data Fetching (No API Route Self-Fetch)
**What:** Fetch all dashboard data via direct DB queries in the server component, then pass as props to client components.
**When to use:** Always for this page — avoids the known 401 self-fetch bug.
**Example:**
```typescript
// src/app/(dashboard)/dashboard/progress/page.tsx
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getXPTimeline,
  getActivityHeatmap,
  getMasteryData,
  getBadgeData,
  getWeeklySummary,
} from "@/lib/progress-dashboard";

export default async function ProgressPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // Parallel data fetching
  const [timeline, heatmap, mastery, badges, weekly] = await Promise.all([
    getXPTimeline(user.id, user.timezone),
    getActivityHeatmap(user.id),
    getMasteryData(user.id),
    getBadgeData(user.id),
    getWeeklySummary(user.id, user.timezone),
  ]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Overview stats bar */}
      {/* XP Timeline card */}
      {/* Activity Heatmap card */}
      {/* Mastery Map card */}
      {/* Badge Collection card */}
      {/* Weekly Summary card */}
    </div>
  );
}
```

### Pattern 2: shadcn/ui ChartContainer + Recharts AreaChart
**What:** Wrap Recharts components in shadcn's ChartContainer for consistent theming and tooltip styling.
**When to use:** For the XP Timeline area chart (DASH-02).
**Example:**
```typescript
// Source: shadcn/ui docs + Recharts docs (Context7 verified)
"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  xp: {
    label: "XP Earned",
    color: "#10b981", // emerald to match existing learn ring color
  },
} satisfies ChartConfig;

interface XPTimelineProps {
  data: { date: string; xp: number }[];
}

export function XPTimeline({ data }: XPTimelineProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
      <AreaChart data={data} margin={{ left: 12, right: 12 }}>
        <defs>
          <linearGradient id="fillXP" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-xp)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-xp)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value) => {
            const d = new Date(value);
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="xp"
          stroke="var(--color-xp)"
          fill="url(#fillXP)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
```

### Pattern 3: react-activity-calendar Heatmap
**What:** Use `react-activity-calendar` with data from `daily_activity` table mapped to the required format.
**When to use:** For the activity heatmap (DASH-03).
**Example:**
```typescript
"use client";

import ActivityCalendar from "react-activity-calendar";

interface HeatmapDay {
  date: string;   // "YYYY-MM-DD"
  count: number;  // total XP or activity count
  level: 0 | 1 | 2 | 3 | 4; // intensity tier
}

interface ActivityHeatmapProps {
  data: HeatmapDay[];
}

// Map raw activity counts to 0-4 levels
// Level 0: no activity, 1: light, 2: moderate, 3: active, 4: very active
export function computeLevel(totalXp: number): 0 | 1 | 2 | 3 | 4 {
  if (totalXp === 0) return 0;
  if (totalXp < 25) return 1;
  if (totalXp < 75) return 2;
  if (totalXp < 150) return 3;
  return 4;
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  return (
    <ActivityCalendar
      data={data}
      maxLevel={4}
      colorScheme="dark"
      theme={{
        dark: ["#1a1a2e", "#10b981", "#059669", "#047857", "#065f46"],
      }}
      labels={{
        totalCount: "{{count}} XP earned in the last year",
      }}
    />
  );
}
```

### Pattern 4: Mastery Map as Nested Progress Grid
**What:** Query course > module > lesson completion percentages, render as a visual grid with progress bars.
**When to use:** For the mastery map (DASH-04).
**Data query pattern:**
```typescript
// Query all courses the user has access to, with module/lesson completion counts
// Join: courseAccess -> courses -> modules -> lessons -> lessonProgress
// Group by course, then by module, to get completion percentages
```

### Pattern 5: Badge Collection (Earned vs Locked)
**What:** Define badge milestones as static configuration (not DB-stored), compute earned/locked status from existing data at render time.
**When to use:** For DASH-05. Phase 40's celebration system uses inline badge components (XPBadge, StreakBadge) but does NOT persist badges to a database table. This phase should follow the same pattern: define milestones statically, compute from current user stats.
**Example badge definitions:**
```typescript
interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide icon name
  category: "learning" | "streak" | "xp" | "practice";
  check: (stats: UserStats) => { earned: boolean; progress: number; target: number };
}

const BADGES: BadgeDefinition[] = [
  {
    id: "first_lesson",
    title: "First Steps",
    description: "Complete your first lesson",
    icon: "BookOpen",
    category: "learning",
    check: (s) => ({ earned: s.lessonsCompleted >= 1, progress: Math.min(s.lessonsCompleted, 1), target: 1 }),
  },
  {
    id: "streak_7",
    title: "Week Warrior",
    description: "Maintain a 7-day streak",
    icon: "Flame",
    category: "streak",
    check: (s) => ({ earned: s.longestStreak >= 7, progress: Math.min(s.longestStreak, 7), target: 7 }),
  },
  {
    id: "xp_100",
    title: "Century Club",
    description: "Earn 100 XP",
    icon: "Trophy",
    category: "xp",
    check: (s) => ({ earned: s.totalXP >= 100, progress: Math.min(s.totalXP, 100), target: 100 }),
  },
  // ... more badges
];
```

### Anti-Patterns to Avoid
- **Self-fetching API routes from server components:** Known to cause 401 errors because auth cookies are not forwarded. Always use direct DB queries in server components.
- **Pre-computing badge status in the database:** Badges are derivable from existing data (XP, streak, lesson count). Storing them creates a sync problem. Compute at read time.
- **Using ResponsiveContainer from recharts with shadcn/ui:** The shadcn `ChartContainer` already handles responsiveness. Do not nest a `ResponsiveContainer` inside it.
- **Fetching 365 days of data on every page load without caching:** The heatmap query should be efficient (indexed on userId + activityDate) but consider the query cost. The `daily_activity` table has a composite index on `(userId, activityDate)` which makes range queries fast.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Activity heatmap / contribution calendar | Custom SVG grid with day alignment, month labels, weekday labels, responsive sizing | `react-activity-calendar` | Handles day-of-week alignment, month boundary labels, color scaling, responsive layout, tooltip on hover, dark mode support. ~170kB install. |
| Area chart with tooltips | Custom canvas/SVG charting | Recharts via shadcn/ui ChartContainer | Tooltips, gradients, axis formatting, responsive container all built-in |
| Animated number counter | Custom requestAnimationFrame loop | framer-motion `animate()` / `useMotionValue` | Already used in StreakDisplay and ScoreReveal -- proven pattern |
| Date range grouping (daily/weekly/monthly) | Manual date math loops | date-fns `eachDayOfInterval`, `eachWeekOfInterval`, `startOfWeek`, `format` | Already installed, handles timezone edge cases |

**Key insight:** The heatmap is the most deceptively complex visual element. Day-of-week alignment (weeks start Sunday vs Monday), month boundary labels, handling empty days, responsive SVG sizing, and 4-tier color mapping all have subtle edge cases that `react-activity-calendar` solves.

## Common Pitfalls

### Pitfall 1: N+1 Queries in Mastery Map
**What goes wrong:** Fetching course list, then fetching modules per course, then lessons per module, then progress per lesson.
**Why it happens:** Natural object hierarchy suggests recursive fetching.
**How to avoid:** Use a single SQL query with JOINs and GROUP BY to get completion counts at each level. The dashboard page already demonstrates this pattern in `DashboardPage` where it joins courses -> modules -> lessons -> lessonProgress in one query.
**Warning signs:** Multiple sequential DB calls inside a `.map()` loop.

### Pitfall 2: Heatmap Data Gaps
**What goes wrong:** `react-activity-calendar` expects a contiguous array of dates for the past year. If a user has no activity on a day, that date must still appear with `count: 0, level: 0`.
**Why it happens:** The `daily_activity` table only has rows for days WITH activity.
**How to avoid:** Generate the full 365-day range using `date-fns/eachDayOfInterval`, then left-merge with actual activity data. Fill missing days with `{ date, count: 0, level: 0 }`.
**Warning signs:** Gaps or misaligned squares in the heatmap.

### Pitfall 3: Timezone Mismatch Between Heatmap and XP Data
**What goes wrong:** Activity dates in `daily_activity.activityDate` are stored in the user's timezone (via `getEffectiveDate()`). The heatmap must use the same timezone to match.
**Why it happens:** Server-side date generation defaults to UTC.
**How to avoid:** Use the user's stored `timezone` field when generating the date range and when querying. The `@date-fns/tz` library (already installed) provides `TZDate.tz()`.
**Warning signs:** Activity appearing on wrong day in heatmap (off by one).

### Pitfall 4: Weekly Summary Division by Zero
**What goes wrong:** Week-over-week comparison shows NaN or Infinity when previous week has zero activity.
**Why it happens:** Percentage change formula: `(current - previous) / previous * 100` divides by zero.
**How to avoid:** Guard with: if previous is 0, show absolute change or "New" indicator instead of percentage.
**Warning signs:** NaN rendering in the UI.

### Pitfall 5: Chart Not Rendering (Zero Height)
**What goes wrong:** Recharts chart renders as invisible/collapsed.
**Why it happens:** shadcn/ui ChartContainer requires an explicit `min-h-[VALUE]` or the chart collapses to zero height.
**How to avoid:** Always set `className="min-h-[250px] w-full"` on ChartContainer.
**Warning signs:** Chart section appears empty but data is loaded.

### Pitfall 6: Missing Loading Skeleton
**What goes wrong:** Page shows empty white space during data loading.
**Why it happens:** Server component pages need a `loading.tsx` file for streaming/Suspense fallback.
**How to avoid:** Create `loading.tsx` in the progress page directory following the established project convention (Skeleton component, bg-zinc-800, content-area only).
**Warning signs:** Flash of empty content before page renders.

## Code Examples

Verified patterns from the existing codebase:

### XP Timeline Data Query
```typescript
// Aggregate daily XP totals for timeline chart
// Uses existing daily_activity table with (userId, activityDate) index

import { db } from "@/db";
import { dailyActivity } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { subDays, format, eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { TZDate } from "@date-fns/tz";

export async function getXPTimeline(
  userId: string,
  timezone: string,
  range: "daily" | "weekly" | "monthly" = "daily"
) {
  const now = TZDate.tz(timezone);
  const daysBack = range === "daily" ? 30 : range === "weekly" ? 90 : 365;
  const startDate = format(subDays(now, daysBack), "yyyy-MM-dd");
  const endDate = format(now, "yyyy-MM-dd");

  const rows = await db
    .select({
      date: dailyActivity.activityDate,
      xp: dailyActivity.totalXp,
    })
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        gte(dailyActivity.activityDate, startDate),
        lte(dailyActivity.activityDate, endDate)
      )
    )
    .orderBy(dailyActivity.activityDate);

  // Fill gaps for daily view
  // For weekly/monthly, aggregate after fetching
  return rows;
}
```

### Heatmap Data Query
```typescript
// Fetch past year of daily activity for heatmap
export async function getActivityHeatmap(userId: string) {
  const endDate = format(new Date(), "yyyy-MM-dd");
  const startDate = format(subDays(new Date(), 364), "yyyy-MM-dd");

  const rows = await db
    .select({
      date: dailyActivity.activityDate,
      totalXp: dailyActivity.totalXp,
      lessonCount: dailyActivity.lessonCount,
      practiceCount: dailyActivity.practiceCount,
      conversationCount: dailyActivity.conversationCount,
    })
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        gte(dailyActivity.activityDate, startDate),
        lte(dailyActivity.activityDate, endDate)
      )
    );

  // Build lookup map
  const activityMap = new Map(rows.map((r) => [r.date, r]));

  // Generate contiguous 365-day array for react-activity-calendar
  const allDays = eachDayOfInterval({
    start: new Date(startDate),
    end: new Date(endDate),
  });

  return allDays.map((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const activity = activityMap.get(dateStr);
    const totalXp = activity?.totalXp ?? 0;
    return {
      date: dateStr,
      count: totalXp,
      level: computeLevel(totalXp),
    };
  });
}
```

### Mastery Data Query (Single JOIN)
```typescript
// Single query for mastery map — avoids N+1
import { courses, modules, lessons, lessonProgress, courseAccess, users } from "@/db/schema";

export async function getMasteryData(userId: string) {
  const results = await db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      moduleId: modules.id,
      moduleTitle: modules.title,
      totalLessons: sql<number>`COUNT(DISTINCT ${lessons.id})`,
      completedLessons: sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN ${lessonProgress.lessonId} END)`,
    })
    .from(courseAccess)
    .innerJoin(users, eq(courseAccess.userId, users.id))
    .innerJoin(courses, eq(courseAccess.courseId, courses.id))
    .leftJoin(modules, eq(modules.courseId, courses.id))
    .leftJoin(lessons, eq(lessons.moduleId, modules.id))
    .leftJoin(lessonProgress, and(
      eq(lessonProgress.lessonId, lessons.id),
      eq(lessonProgress.userId, users.id)
    ))
    .where(and(
      eq(users.id, userId),
      isNull(courses.deletedAt),
      isNull(modules.deletedAt),
      isNull(lessons.deletedAt),
    ))
    .groupBy(courses.id, courses.title, modules.id, modules.title);

  // Reshape into nested structure: course -> modules -> completion %
  return results;
}
```

### Weekly Summary Comparison
```typescript
// Compare this week vs last week stats
export async function getWeeklySummary(userId: string, timezone: string) {
  const now = TZDate.tz(timezone);
  const thisWeekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const lastWeekStart = format(subDays(startOfWeek(now, { weekStartsOn: 1 }), 7), "yyyy-MM-dd");
  const lastWeekEnd = format(subDays(startOfWeek(now, { weekStartsOn: 1 }), 1), "yyyy-MM-dd");
  const today = format(now, "yyyy-MM-dd");

  const [thisWeek, lastWeek] = await Promise.all([
    aggregateWeek(userId, thisWeekStart, today),
    aggregateWeek(userId, lastWeekStart, lastWeekEnd),
  ]);

  return { thisWeek, lastWeek };
}

async function aggregateWeek(userId: string, start: string, end: string) {
  const [result] = await db
    .select({
      totalXp: sql<number>`COALESCE(SUM(${dailyActivity.totalXp}), 0)`,
      lessonsCompleted: sql<number>`COALESCE(SUM(${dailyActivity.lessonCount}), 0)`,
      practiceCompleted: sql<number>`COALESCE(SUM(${dailyActivity.practiceCount}), 0)`,
      daysActive: sql<number>`COUNT(*)`,
      goalsMet: sql<number>`COALESCE(SUM(CASE WHEN ${dailyActivity.goalMet} THEN 1 ELSE 0 END), 0)`,
    })
    .from(dailyActivity)
    .where(and(
      eq(dailyActivity.userId, userId),
      gte(dailyActivity.activityDate, start),
      lte(dailyActivity.activityDate, end)
    ));
  return result;
}
```

### Animated Counter Pattern (Existing in Codebase)
```typescript
// Already proven in src/components/xp/StreakDisplay.tsx
// Re-use AnimatedCount for weekly summary numbers
function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView || value === 0) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate(latest) { setDisplay(Math.round(latest)); },
    });
    return () => controls.stop();
  }, [isInView, value]);

  return <span ref={ref}>{display}</span>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ResponsiveContainer wrapping charts | shadcn ChartContainer handles responsiveness | shadcn/ui chart component (2024) | Don't use ResponsiveContainer inside ChartContainer |
| Custom tooltip styling | ChartTooltipContent from shadcn/ui | shadcn/ui chart component (2024) | Consistent dark theme tooltips out of the box |
| `react-calendar-heatmap` (last major update 2021) | `react-activity-calendar` v3 (active 2025) | 2024 | Better React 18/19 support, TypeScript types, dark mode theme prop |

**Deprecated/outdated:**
- `react-calendar-heatmap`: Last major release was v4.0 in 2021, less maintained. Use `react-activity-calendar` instead.
- Recharts `ResponsiveContainer` inside shadcn: Redundant since `ChartContainer` handles it.

## Open Questions

1. **Heatmap activity level thresholds**
   - What we know: Need a 4-tier color scale (levels 0-4). Daily XP values range from 0 to potentially 500+.
   - What's unclear: Exact XP thresholds for each tier.
   - Recommendation: Use 0/25/75/150 XP thresholds for levels 0-4 (maps roughly to: nothing / did a few exercises / met casual goal / met serious goal). These can be tuned later without code changes since the mapping function is isolated.

2. **Badge definitions scope**
   - What we know: Requirements mention "first lesson, 7-day streak, 100 XP." No badge persistence table exists.
   - What's unclear: Full list of badges. How many should Phase 41 include?
   - Recommendation: Define 8-12 static badges covering the 4 categories (learning, streak, XP, practice). Keep them as a TypeScript const array with check functions. Can always add more later.

3. **Navigation: dedicated route or tab on main dashboard?**
   - What we know: Requirements say "dedicated progress dashboard page."
   - What's unclear: URL structure -- `/dashboard/progress` or `/progress`.
   - Recommendation: Use `/dashboard/progress` to keep it under the dashboard route group. Add a sidebar navigation link "Progress" under the Learning section.

4. **Weekly summary "goal hit rate"**
   - What we know: DASH-06 mentions "goal hit rate" in weekly comparison.
   - What's unclear: Is this the % of days where daily goal was met?
   - Recommendation: Yes -- `goalsMet / daysInWeek * 100`. Use 7 as denominator for last week, current day-of-week for this week (to avoid penalizing for future days).

## Sources

### Primary (HIGH confidence)
- shadcn/ui Chart documentation (Context7 `/websites/ui_shadcn`) -- ChartContainer, ChartTooltip, ChartConfig pattern, installation
- Recharts documentation (Context7 `/recharts/recharts`) -- AreaChart, XAxis, YAxis, gradients, ResponsiveContainer
- Existing codebase: `src/db/schema/xp.ts`, `src/lib/xp-service.ts`, `src/lib/xp.ts`, `src/components/xp/*` -- verified data model, existing patterns, query patterns

### Secondary (MEDIUM confidence)
- [react-activity-calendar GitHub](https://github.com/grubersjoe/react-activity-calendar) -- API props, data format `{ date, count, level }`, theme customization
- [react-activity-calendar npm](https://www.npmjs.com/package/react-activity-calendar) -- v3.1.1, 20k weekly downloads, 170kB install size, MIT license
- [shadcn/ui Charts installation](https://ui.shadcn.com/docs/components/radix/chart) -- `npx shadcn@latest add chart` installs recharts and creates chart.tsx

### Tertiary (LOW confidence)
- Heatmap level thresholds (0/25/75/150) -- my recommendation based on the XP system constants, not validated by user testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- locked decisions (Recharts, shadcn/ui Charts) verified via Context7; react-activity-calendar verified via npm/GitHub
- Architecture: HIGH -- follows existing codebase patterns exactly (server-side data fetch, client components for interactivity, parallel Promise.all)
- Pitfalls: HIGH -- all pitfalls derived from existing codebase bugs (401 self-fetch) and known library constraints (ChartContainer min-h, heatmap contiguous dates)
- Data model: HIGH -- all required data already exists in xp_events, daily_activity, lesson_progress, practice_attempts tables

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable domain, libraries unlikely to change significantly)
