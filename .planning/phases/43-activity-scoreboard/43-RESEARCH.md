# Phase 43: Activity Scoreboard - Research

**Researched:** 2026-02-08
**Domain:** Gamification scoreboard -- personal bests computation, opt-in cohort percentile rankings, multi-dimension SQL aggregations
**Confidence:** HIGH

## Summary

Phase 43 is the final phase of the v5.0 milestone. It adds two complementary features to the existing progress dashboard: (1) a "Personal Bests" section displaying the student's all-time top records across multiple dimensions, and (2) an optional opt-in cohort ranking system that shows the student's relative standing as percentiles ("Top 25%") without revealing individual names or exact positions.

The codebase already contains everything needed for personal bests computation. The `daily_activity` table has per-day XP totals (highest daily XP = `MAX(total_xp)`), `users.longestStreak` stores the all-time longest streak, `practice_attempts.score` holds per-attempt scores (best practice score = `MAX(score)`), and `lesson_progress.completedAt` provides lesson completion counts. All these are queryable with simple aggregate SQL via Drizzle ORM. No new database tables are needed for personal bests.

For cohort rankings, a new boolean column `show_cohort_rankings` (default `false`) must be added to the `users` table to store the opt-in preference. The percentile calculation uses PostgreSQL's `percent_rank()` window function or a simpler `COUNT(*) WHERE value >= user_value / COUNT(*)` approach to determine the student's relative position across dimensions. Rankings should be computed server-side in the progress dashboard's data-fetching layer (`src/lib/progress-dashboard.ts`), following the established pattern of direct DB queries in server components.

**Primary recommendation:** Add the scoreboard as two new card components on the existing `/dashboard/progress` page. Personal bests data comes from a new `getPersonalBests()` function in `progress-dashboard.ts`. Cohort rankings come from a new `getCohortRankings()` function that runs only when the user has opted in. Add `showCohortRankings` boolean to the users table and extend the existing preferences API to support toggling it.

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 | SQL aggregations (MAX, COUNT, percent_rank) for personal bests and cohort percentiles | Already used for all data access |
| date-fns | 4.1.0 | Date formatting for "achieved on" display | Already used throughout |
| @date-fns/tz | ^1.4 | Timezone-aware date display for personal best timestamps | Already installed |
| framer-motion | 12.29.2 | Animated number reveals on personal best cards | Already used in StreakDisplay, ScoreReveal |
| lucide-react | ^0.563 | Icons for scoreboard dimensions (Flame, Zap, Trophy, Target, etc.) | Already used throughout |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| recharts | ^2.15 | Optional bar/radar chart for cohort position visualization | Only if visual chart is desired beyond text percentiles |
| @/components/ui/switch | shadcn/ui | Opt-in toggle for cohort rankings | Already installed as shadcn component |
| @/components/ui/card | shadcn/ui | Card wrapper for scoreboard sections | Already installed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `percent_rank()` window function | Application-side percentile calculation | Window function is O(1) per user per dimension vs O(n) fetch-all; Postgres handles it natively |
| Adding column to users table | Separate user_settings table | Users table already has dailyGoalXp, timezone preferences; one more boolean is consistent |
| Cards on progress page | Separate /dashboard/scoreboard route | Requirements say "scoreboard placement" depends on Phase 41 dashboard infrastructure; adding to progress page keeps all personal stats in one place |

**Installation:**
```bash
# No new packages needed
# Only a Drizzle migration for the new column:
npm run db:generate
npm run db:migrate
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── users.ts                    # ADD: showCohortRankings boolean column
├── db/migrations/
│   └── XXXX_add_show_cohort_rankings.sql  # Migration for new column
├── lib/
│   └── progress-dashboard.ts       # ADD: getPersonalBests(), getCohortRankings()
├── app/(dashboard)/dashboard/progress/
│   └── page.tsx                    # MODIFY: fetch + render scoreboard sections
├── app/api/user/preferences/
│   └── route.ts                   # MODIFY: support showCohortRankings in PATCH
├── components/progress/
│   ├── PersonalBests.tsx           # NEW: personal bests card component
│   └── CohortRankings.tsx          # NEW: opt-in cohort rankings card component
```

### Pattern 1: Personal Bests as Aggregation Queries

**What:** Compute all personal best records from existing tables using SQL aggregate functions (MAX, COUNT). No denormalized storage needed.
**When to use:** Every time the progress page loads.
**Example:**
```typescript
// Source: Existing pattern from getBadgeStats() in progress-dashboard.ts

export interface PersonalBests {
  longestStreak: number;
  highestDailyXP: number;
  highestDailyXPDate: string | null;
  bestPracticeScore: number | null;
  bestPracticeSetTitle: string | null;
  totalLessonsCompleted: number;
  totalPracticeSetsCompleted: number;
  totalConversations: number;
}

export async function getPersonalBests(userId: string): Promise<PersonalBests> {
  const [
    streakResult,
    highestDailyResult,
    bestPracticeResult,
    lessonsResult,
    practiceCountResult,
    conversationResult,
  ] = await Promise.all([
    // Longest streak — stored on user record
    db.select({ longestStreak: users.longestStreak })
      .from(users)
      .where(eq(users.id, userId)),

    // Highest single-day XP — MAX from daily_activity
    db.select({
      maxXp: sql<number>`MAX(${dailyActivity.totalXp})`,
      maxDate: sql<string>`(SELECT ${dailyActivity.activityDate} FROM ${dailyActivity} WHERE ${dailyActivity.userId} = ${userId} ORDER BY ${dailyActivity.totalXp} DESC LIMIT 1)`,
    })
    .from(dailyActivity)
    .where(eq(dailyActivity.userId, userId)),

    // Best practice score — MAX from practice_attempts (completed only)
    db.select({
      bestScore: sql<number | null>`MAX(${practiceAttempts.score})`,
    })
    .from(practiceAttempts)
    .where(
      and(
        eq(practiceAttempts.userId, userId),
        sql`${practiceAttempts.completedAt} IS NOT NULL`
      )
    ),

    // Total lessons completed
    db.select({ count: sql<number>`COUNT(*)` })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          sql`${lessonProgress.completedAt} IS NOT NULL`
        )
      ),

    // Total practice sets completed
    db.select({ count: sql<number>`COUNT(DISTINCT ${practiceAttempts.id})` })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          sql`${practiceAttempts.completedAt} IS NOT NULL`
        )
      ),

    // Total conversations
    db.select({
      total: sql<number>`COALESCE(SUM(${dailyActivity.conversationCount}), 0)`,
    })
    .from(dailyActivity)
    .where(eq(dailyActivity.userId, userId)),
  ]);

  return {
    longestStreak: streakResult[0]?.longestStreak ?? 0,
    highestDailyXP: Number(highestDailyResult[0]?.maxXp ?? 0),
    highestDailyXPDate: highestDailyResult[0]?.maxDate ?? null,
    bestPracticeScore: bestPracticeResult[0]?.bestScore ?? null,
    bestPracticeSetTitle: null, // join to get title if desired
    totalLessonsCompleted: Number(lessonsResult[0]?.count ?? 0),
    totalPracticeSetsCompleted: Number(practiceCountResult[0]?.count ?? 0),
    totalConversations: Number(conversationResult[0]?.total ?? 0),
  };
}
```

### Pattern 2: Cohort Percentile Ranking with Simple COUNT Approach

**What:** Calculate a student's percentile rank by counting how many students have a lower value, divided by total students. This avoids `percent_rank()` window functions which would require fetching all students.
**When to use:** Only when user has opted in (showCohortRankings = true).
**Example:**
```typescript
// Source: PostgreSQL percentile calculation pattern

export interface CohortRanking {
  dimension: string;
  label: string;
  userValue: number;
  percentile: number; // 0-100, higher = better (e.g., 75 means "Top 25%")
  totalStudents: number;
}

export async function getCohortRankings(userId: string): Promise<CohortRanking[]> {
  // Get user's own values first
  const userStats = await getPersonalBests(userId);
  const totalXP = await getTotalXP(userId);
  const currentStreak = await getCurrentStreak(userId);

  // Get total student count
  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(eq(users.role, "student"));
  const totalStudents = Number(countResult?.count ?? 1);

  // For each dimension, count how many students rank below this user
  const dimensions = [
    {
      dimension: "total_xp",
      label: "Total XP",
      userValue: totalXP,
      query: sql<number>`
        SELECT COUNT(*) FROM (
          SELECT COALESCE(SUM(${dailyActivity.totalXp}), 0) as val
          FROM ${users}
          LEFT JOIN ${dailyActivity} ON ${dailyActivity.userId} = ${users.id}
          WHERE ${users.role} = 'student'
          GROUP BY ${users.id}
          HAVING COALESCE(SUM(${dailyActivity.totalXp}), 0) < ${totalXP}
        ) sub
      `,
    },
    // ... similar for streak, practice score
  ];

  // Percentile = (students below / total students) * 100
  // "Top X%" = 100 - percentile
}
```

### Pattern 3: Opt-In Toggle with Existing Preferences API

**What:** Extend the PATCH `/api/user/preferences` route to accept `showCohortRankings` boolean. The toggle renders inline on the cohort rankings card.
**When to use:** For the opt-in/opt-out flow (SCORE-02).
**Example:**
```typescript
// In src/app/api/user/preferences/route.ts PATCH handler:
// Add showCohortRankings to the update payload:
if (showCohortRankings !== undefined) {
  if (typeof showCohortRankings !== "boolean") {
    return NextResponse.json(
      { error: "showCohortRankings must be a boolean" },
      { status: 400 }
    );
  }
  updateData.showCohortRankings = showCohortRankings;
}
```

### Pattern 4: Server-Side Data Fetching in Progress Page

**What:** Extend the existing progress page's `Promise.all()` to include personal bests and (conditionally) cohort rankings.
**When to use:** On every progress page load.
**Example:**
```typescript
// In src/app/(dashboard)/dashboard/progress/page.tsx:
const [
  /* ...existing fetches... */
  personalBests,
  cohortRankings,
] = await Promise.all([
  /* ...existing calls... */
  getPersonalBests(user.id),
  user.showCohortRankings ? getCohortRankings(user.id) : Promise.resolve(null),
]);
```

### Anti-Patterns to Avoid

- **Showing individual names or exact ranks:** Requirement explicitly says anonymous percentiles only. Never render "Student X has 500 XP" or "#47 of 156."
- **Pre-computing and caching rankings in a separate table:** Adds sync complexity. Direct SQL computation is fast enough for small cohorts (< 500 students). The `daily_activity` table has indexes on `(userId, activityDate)`.
- **Mandatory cohort visibility:** Must be opt-in, default OFF. The toggle must clearly explain what it does.
- **Real-time cohort updates:** Daily recalculation is sufficient. Do not use WebSocket or polling for live ranking updates.
- **Self-fetching API routes from the progress server component:** Causes 401 per the known bug. Always use direct DB queries in the server component.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Percentile calculation | Manual sorting + binary search in JS | SQL `COUNT(*) WHERE val < userVal` / total | Database handles aggregation efficiently; avoids loading all user data into memory |
| Personal best aggregation | Separate denormalized "personal_bests" table | SQL MAX/COUNT on existing tables | No sync problem; existing indexes cover the queries; data always consistent |
| Opt-in preference storage | Separate settings table or localStorage | Boolean column on existing `users` table | Project convention is to store user preferences (dailyGoalXp, timezone) on users table |
| Toggle component | Custom checkbox | shadcn/ui `Switch` component | Already installed, matches dark theme, accessible |
| Animated number display | Custom RAF loop | framer-motion `animate()` | Already proven pattern in StreakDisplay and ScoreReveal components |

**Key insight:** This phase requires no new npm packages, no new database tables, and no new API routes. Everything is built on existing infrastructure: one new column on `users`, two new query functions in `progress-dashboard.ts`, two new UI components, and modifications to the progress page and preferences API.

## Common Pitfalls

### Pitfall 1: N+1 Queries for Cohort Ranking Dimensions
**What goes wrong:** Computing each ranking dimension with a separate correlated subquery per student, resulting in O(students * dimensions) DB calls.
**Why it happens:** Natural temptation to fetch user value, then compare against each other user.
**How to avoid:** Use a single query per dimension that counts students below the user's value. This is O(1) per dimension regardless of cohort size. The `daily_activity` table's `(userId)` index handles the aggregation efficiently.
**Warning signs:** Progress page load time increasing linearly with student count.

### Pitfall 2: Percentile Display Confusion ("Top X%" vs "Xth percentile")
**What goes wrong:** Showing "75th percentile" which many users don't understand, instead of "Top 25%" which is intuitive.
**Why it happens:** Conflating statistical percentile rank with user-friendly display.
**How to avoid:** Always compute as: `topPercent = 100 - percentileRank`. Display as "Top {topPercent}%". Bucket into friendly tiers: "Top 10%", "Top 25%", "Top 50%", "Bottom half". Never show raw percentile numbers.
**Warning signs:** User confusion about whether higher or lower percentile is better.

### Pitfall 3: Division by Zero in Cohort Calculation
**What goes wrong:** NaN or Infinity when total student count is 0 or 1.
**Why it happens:** New deployment or single-user scenario.
**How to avoid:** Guard: `if (totalStudents <= 1) return null` (hide cohort section). Need at least 2 students for meaningful comparison. Consider requiring a minimum cohort size (e.g., 5 students) before showing percentiles.
**Warning signs:** NaN rendering, or "Top 0%" / "Top 100%" for trivial cohorts.

### Pitfall 4: Cohort Rankings Including Inactive Students
**What goes wrong:** Percentile looks artificially good because many students have 0 XP/activity.
**Why it happens:** Including all enrolled students, even those who never logged in.
**How to avoid:** Only include students with at least 1 day of activity in the cohort calculation. This ensures percentiles reflect active learners, not abandoned accounts.
**Warning signs:** Every active student showing "Top 10%" because 90% of accounts are inactive.

### Pitfall 5: Stale Personal Bests After Data Changes
**What goes wrong:** Personal bests show outdated values because they were cached.
**Why it happens:** Premature optimization with caching.
**How to avoid:** Compute personal bests fresh on each page load. The queries are simple MAX/COUNT operations on indexed tables. For the current user count, this takes < 50ms total. No caching needed.
**Warning signs:** Personal best not updating after a new record is set.

### Pitfall 6: Missing Migration for New Column
**What goes wrong:** Build succeeds but runtime fails because `showCohortRankings` column doesn't exist in production DB.
**Why it happens:** Developer forgets to generate and apply the migration.
**How to avoid:** Always run `npm run db:generate` after schema change, then `npm run db:migrate`. Add to the pending todos in STATE.md.
**Warning signs:** Runtime error: "column show_cohort_rankings does not exist."

### Pitfall 7: Best Practice Score Without Completed Filter
**What goes wrong:** Best practice score shows score from an in-progress attempt (which may be 0 or partial).
**Why it happens:** Querying MAX(score) without filtering for completedAt IS NOT NULL.
**How to avoid:** Always include `WHERE completed_at IS NOT NULL` when querying practice attempt scores. The `practiceAttempts.score` is nullable and only set on completion.
**Warning signs:** Personal best showing 0% or unexpectedly low score.

## Code Examples

Verified patterns from the existing codebase:

### Schema Change: Add showCohortRankings to Users Table
```typescript
// In src/db/schema/users.ts — add new column:
import { boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  // ... existing columns ...
  showCohortRankings: boolean("show_cohort_rankings").notNull().default(false),
});
```

### Personal Bests Query: Highest Daily XP
```typescript
// Query pattern matching existing getBadgeStats() in progress-dashboard.ts
// Uses MAX aggregate on indexed daily_activity table

const [highestDaily] = await db
  .select({
    maxXp: sql<number>`COALESCE(MAX(${dailyActivity.totalXp}), 0)`,
  })
  .from(dailyActivity)
  .where(eq(dailyActivity.userId, userId));

// To also get the DATE of the highest XP day:
const [bestDay] = await db
  .select({
    activityDate: dailyActivity.activityDate,
    totalXp: dailyActivity.totalXp,
  })
  .from(dailyActivity)
  .where(eq(dailyActivity.userId, userId))
  .orderBy(desc(dailyActivity.totalXp))
  .limit(1);
```

### Personal Bests Query: Best Practice Score
```typescript
// Get highest practice attempt score (completed attempts only)
const [bestPractice] = await db
  .select({
    bestScore: sql<number | null>`MAX(${practiceAttempts.score})`,
  })
  .from(practiceAttempts)
  .where(
    and(
      eq(practiceAttempts.userId, userId),
      sql`${practiceAttempts.completedAt} IS NOT NULL`
    )
  );
```

### Cohort Percentile: Total XP Dimension
```typescript
// Count students with less total XP than the current user
// Uses existing daily_activity table with (userId) index

const userTotalXP = /* pre-fetched */;

const [belowCount] = await db.execute(sql`
  SELECT COUNT(*) as below_count
  FROM (
    SELECT u.id, COALESCE(SUM(da.total_xp), 0) as total
    FROM users u
    LEFT JOIN daily_activity da ON da.user_id = u.id
    WHERE u.role = 'student'
      AND u.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM daily_activity d2 WHERE d2.user_id = u.id)
    GROUP BY u.id
    HAVING COALESCE(SUM(da.total_xp), 0) < ${userTotalXP}
  ) sub
`);

const studentsBelow = Number(belowCount.rows[0]?.below_count ?? 0);
const percentileRank = totalActiveStudents > 0
  ? Math.round((studentsBelow / totalActiveStudents) * 100)
  : 0;
const topPercent = 100 - percentileRank;
// Display: "Top {topPercent}%"
```

### Cohort Percentile: Streak Dimension
```typescript
// Count students with a shorter longest streak
const userLongestStreak = /* pre-fetched */;

const [belowCount] = await db
  .select({ count: sql<number>`COUNT(*)` })
  .from(users)
  .where(
    and(
      eq(users.role, "student"),
      isNull(users.deletedAt),
      sql`${users.longestStreak} < ${userLongestStreak}`,
      // Only include active students
      sql`EXISTS (SELECT 1 FROM daily_activity da WHERE da.user_id = ${users.id})`
    )
  );
```

### Cohort Percentile: Average Practice Score Dimension
```typescript
// Compare user's average practice score against cohort
const [userAvg] = await db
  .select({
    avg: sql<number>`COALESCE(AVG(${practiceAttempts.score}), 0)`,
  })
  .from(practiceAttempts)
  .where(
    and(
      eq(practiceAttempts.userId, userId),
      sql`${practiceAttempts.completedAt} IS NOT NULL`
    )
  );

const userAvgScore = Number(userAvg?.avg ?? 0);

// Count students with lower average
const [belowCount] = await db.execute(sql`
  SELECT COUNT(*) as below_count
  FROM (
    SELECT pa.user_id, AVG(pa.score) as avg_score
    FROM practice_attempts pa
    JOIN users u ON u.id = pa.user_id
    WHERE pa.completed_at IS NOT NULL
      AND u.role = 'student'
      AND u.deleted_at IS NULL
    GROUP BY pa.user_id
    HAVING AVG(pa.score) < ${userAvgScore}
  ) sub
`);
```

### Opt-In Toggle Component Pattern
```typescript
// Following existing pattern from SettingsForm.tsx optimistic updates
"use client";

import { Switch } from "@/components/ui/switch";
import { useState } from "react";

interface CohortToggleProps {
  initialValue: boolean;
}

export function CohortToggle({ initialValue }: CohortToggleProps) {
  const [enabled, setEnabled] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  async function handleToggle(checked: boolean) {
    setEnabled(checked); // Optimistic update
    setSaving(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showCohortRankings: checked }),
      });
      if (!res.ok) {
        setEnabled(!checked); // Revert on failure
      }
    } catch {
      setEnabled(!checked); // Revert on error
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={saving}
      />
      <span className="text-sm text-zinc-400">
        {enabled ? "Cohort rankings visible" : "Show how I compare"}
      </span>
    </div>
  );
}
```

### Personal Best Card Pattern
```typescript
// Consistent with existing card styles in progress page
interface PersonalBestCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

function PersonalBestCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color = "text-emerald-400",
}: PersonalBestCardProps) {
  return (
    <div className="flex flex-col items-center p-4 rounded-lg bg-zinc-800/50 border border-zinc-800">
      <Icon className={`h-6 w-6 ${color} mb-2`} />
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-zinc-500 mt-1">{label}</p>
      {subtitle && (
        <p className="text-xs text-zinc-600 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Public leaderboards with names and ranks | Opt-in anonymous percentile rankings | 2024+ (gamification research) | Adult learners prefer personal progress; public rankings cause anxiety |
| Pre-computed ranking tables updated via cron | On-demand SQL aggregation | N/A (design choice) | Simpler, always accurate, no sync issues for small cohorts |
| percent_rank() window function over all users | COUNT(*) WHERE val < user_val approach | N/A (design choice) | Avoids loading all user data; O(1) per dimension query |

**Deprecated/outdated:**
- Public leaderboards: Research consistently shows they demotivate lower-ranked adult learners. Opt-in percentiles are the modern approach.
- Cron-based ranking materialization: Only needed for very large cohorts (10k+ users). This LMS has < 500 students.

## Open Questions

1. **Minimum cohort size for percentile display**
   - What we know: Percentiles are meaningless with < 5 active students. With 2 students, you're either "Top 50%" or "Bottom 50%."
   - What's unclear: What minimum threshold to use before showing cohort rankings.
   - Recommendation: Require at least 5 active students (students with >= 1 day of activity) before showing percentile rankings. Below that threshold, show a friendly message: "Cohort rankings require at least 5 active students."

2. **Percentile bucketing vs exact percentage**
   - What we know: "Top 37.5%" is awkward. Friendly buckets like "Top 10%", "Top 25%", "Top 50%" are cleaner.
   - What's unclear: Whether to show exact percentages or bucket them.
   - Recommendation: Bucket into tiers: Top 5%, Top 10%, Top 25%, Top 50%, Top 75%, Top 90%. Round to nearest bucket. This feels more natural and avoids false precision.

3. **Scoreboard placement on progress page**
   - What we know: Phase depends on Phase 41's dashboard infrastructure. The progress page already has 6 sections (Overview, XP Timeline, Heatmap, Mastery Map, Badges, Weekly Summary).
   - What's unclear: Where exactly to place the scoreboard sections.
   - Recommendation: Insert Personal Bests after the Overview section (position 2) since it's a natural extension of the "my stats at a glance" concept. Insert Cohort Rankings after Personal Bests (position 3). This places the most personal data at the top.

4. **Best practice score: per-set or overall?**
   - What we know: `practice_attempts.score` is 0-100 per attempt. Students may complete many different practice sets.
   - What's unclear: Should "best practice score" show the best score on ANY set, or should it show per-set bests?
   - Recommendation: Show single best score across all sets (MAX of all completed attempts). This is simpler and celebrates the highest achievement. Per-set bests can be found in the practice dashboard.

5. **Average practice score for cohort ranking: how to handle students with few attempts?**
   - What we know: A student with one perfect score (100%) would outrank a student with 20 attempts averaging 85%.
   - What's unclear: Whether to require a minimum number of attempts for the practice score ranking.
   - Recommendation: Require at least 3 completed practice attempts to appear in the practice score cohort ranking. This prevents a single lucky attempt from dominating.

## Sources

### Primary (HIGH confidence)
- Codebase: `src/db/schema/xp.ts` -- xp_events and daily_activity tables with indexes
- Codebase: `src/db/schema/users.ts` -- users table with longestStreak, dailyGoalXp, timezone columns
- Codebase: `src/db/schema/practice.ts` -- practiceAttempts table with score, completedAt columns
- Codebase: `src/db/schema/progress.ts` -- lessonProgress table with completedAt column
- Codebase: `src/lib/progress-dashboard.ts` -- existing pattern for parallel DB queries, getBadgeStats(), getWeeklySummary()
- Codebase: `src/app/(dashboard)/dashboard/progress/page.tsx` -- progress page server component with Promise.all() data fetching
- Codebase: `src/app/api/user/preferences/route.ts` -- PATCH API pattern for user preferences
- Codebase: `src/lib/badges.ts` -- UserStats interface, computeBadges() pattern for derived data
- `.planning/research/v5.0-DASHBOARDS.md` Section 8 -- Activity Scoreboard design philosophy, anti-patterns, implementation details
- `.planning/research/v5.0-SUMMARY.md` -- Leaderboard approach: personal bests default, opt-in percentiles

### Secondary (MEDIUM confidence)
- [Leaderboard Design Principles (PMC/NIH)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8097522/) -- Academic research on opt-in rankings for adult learners
- [Psychology of Leaderboards in Learning](https://cluelabs.com/blog/understanding-the-psychology-behind-leaderboard-design/) -- Anti-patterns for public mandatory rankings
- PostgreSQL `percent_rank()` documentation -- Window function for percentile calculation

### Tertiary (LOW confidence)
- Minimum cohort size of 5 -- My recommendation based on statistical reasoning, not validated by UX testing
- Percentile bucketing tiers -- My recommendation for UX friendliness, not based on specific research

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new packages needed; everything uses existing installed libraries
- Architecture: HIGH -- Follows exact existing codebase patterns (server-side data fetch, parallel Promise.all, direct DB queries)
- Pitfalls: HIGH -- Derived from existing codebase bugs (401 self-fetch), requirements constraints (anonymous only), and SQL aggregation edge cases
- Data model: HIGH -- All required data already exists in xp_events, daily_activity, users, practice_attempts, lesson_progress tables
- Cohort ranking SQL: MEDIUM -- The COUNT approach is straightforward but exact query performance depends on student count; needs testing with production data

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable domain, no fast-moving dependencies)
