# Phase 42: Coach Practice Results - Research

**Researched:** 2026-02-08
**Domain:** Coach analytics dashboard, SQL aggregation, data tables with filtering, Recharts bar charts
**Confidence:** HIGH

## Summary

Phase 42 builds a coach-facing practice analytics page at `/coach/practice-results` where coaches can drill into individual student practice attempts and see aggregate analytics across all practice sets. The core data infrastructure already exists: `practice_attempts` stores per-student attempt records with score, timestamps, and a `results` JSONB column containing per-exercise correctness breakdowns keyed by exercise ID. The `practice_exercises` table holds exercise definitions, and `practice_sets` groups them. The `users` table provides student names/emails for filtering.

The page has three logical sections corresponding to the three requirements: (1) a filterable table of per-student attempt details (COACH-01), (2) aggregate analytics cards and charts showing average scores, completion rates, and hardest exercises (COACH-02), and (3) a filter bar with student name search, practice set selector, date range picker, and score range slider (COACH-03). The existing codebase has established patterns for all of these: the admin analytics dashboard uses client-side fetching with `DateRangeFilter`; the coach pronunciation page demonstrates querying `practiceAttempts` JOINed with `users` and `practiceSets` as a server component; the progress dashboard uses Recharts via shadcn/ui `ChartContainer` for charts. No new database tables are needed. No new npm packages are needed -- `recharts`, `@/components/ui/chart.tsx`, `@/components/ui/select.tsx`, `@/components/ui/input.tsx`, and `date-fns` are all already installed.

The primary architectural decision is whether to use server-side data fetching (like the progress dashboard) or client-side fetching with API routes (like the admin analytics dashboard). Since COACH-03 requires combinable filters that change frequently, the **client-side fetching pattern** (admin analytics style) is the better fit. The page server component handles auth and renders the shell; a client component manages filter state and fetches data from a new API route. This avoids full-page reloads on every filter change.

**Primary recommendation:** Build a single client-side `CoachPracticeResults` component with filter state managed via URL search params (for shareability). Create a new API route `GET /api/coach/practice-results` that accepts query params for all four filter dimensions and returns both the detailed attempt rows and aggregate stats in a single response. Use Recharts `BarChart` via shadcn/ui `ChartContainer` for the aggregate analytics visualizations.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^2.15.4 | Bar charts for aggregate analytics | Already installed; locked decision for all charts in v5.0 |
| @/components/ui/chart | shadcn/ui | ChartContainer, ChartTooltip wrappers | Already generated in Phase 41 |
| drizzle-orm | ^0.45.1 | SQL queries with type safety | Project ORM, all queries use Drizzle |
| date-fns | ^4.1.0 | Date range parsing and formatting | Already installed and used throughout |
| zod | ^4.3.6 | Query param validation | Already installed, used for form validation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @/components/ui/select | installed | Practice set dropdown filter | Filter bar |
| @/components/ui/input | installed | Student name search, score range | Filter bar |
| @/components/ui/skeleton | installed | Loading states for tables and charts | Loading state |
| @/components/ui/card | installed | Aggregate stat cards | Overview section |
| lucide-react | ^0.563.0 | Icons for filter bar, empty states | Throughout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side fetching | Server-side with revalidation | Client-side better for frequent filter changes -- avoids full page reload |
| Single API endpoint | Multiple endpoints (attempts + aggregates) | Single endpoint reduces waterfalls, coach page needs both together |
| URL search params for filters | React state only | URL params enable shareable/bookmarkable filtered views |
| Plain HTML table | shadcn/ui DataTable (tanstack-table) | DataTable is overkill here -- no column resizing, row selection, or virtual scrolling needed. Project uses plain HTML tables everywhere (admin analytics). |

**Installation:**
```bash
# No new packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(dashboard)/coach/practice-results/
│   ├── page.tsx              # Server component — auth check + shell
│   └── loading.tsx           # Skeleton loading state
├── components/coach/
│   ├── PracticeResultsPanel.tsx    # Client — main panel with filters + data
│   ├── PracticeAttemptTable.tsx    # Client — per-student attempt detail table
│   ├── PracticeAggregateCards.tsx  # Client — overview stat cards
│   ├── PracticeAggregateCharts.tsx # Client — bar charts for avg scores + difficulty
│   └── PracticeFilters.tsx         # Client — filter bar (student, set, date, score)
├── app/api/coach/practice-results/
│   └── route.ts              # API — combined query for attempts + aggregates
├── lib/
│   └── coach-practice.ts     # Server — DB query functions
```

### Pattern 1: Coach Auth Guard (Server Component)
**What:** Server component checks `hasMinimumRole("coach")` before rendering.
**When to use:** Every coach page. Matches existing pattern in all coach routes.
**Example:**
```typescript
// src/app/(dashboard)/coach/practice-results/page.tsx
import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { PracticeResultsPanel } from "@/components/coach/PracticeResultsPanel";

export default async function CoachPracticeResultsPage() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Practice Results</h1>
      <PracticeResultsPanel />
    </div>
  );
}
```

### Pattern 2: Client-Side Fetching with Filter State (Admin Analytics Pattern)
**What:** Client component manages filter state and fetches from API route on filter change.
**When to use:** When filters change frequently and should not cause full page reload.
**Example:**
```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

interface Filters {
  studentName: string;
  practiceSetId: string;
  dateFrom: string;
  dateTo: string;
  scoreMin: string;
  scoreMax: string;
}

function buildQueryString(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.studentName) params.set("student", filters.studentName);
  if (filters.practiceSetId) params.set("setId", filters.practiceSetId);
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.scoreMin) params.set("scoreMin", filters.scoreMin);
  if (filters.scoreMax) params.set("scoreMax", filters.scoreMax);
  const str = params.toString();
  return str ? `?${str}` : "";
}
```

### Pattern 3: Combined API Response (Attempts + Aggregates)
**What:** Single API endpoint returns both detailed attempts and aggregate stats to minimize round trips.
**When to use:** When the page always needs both data types and they share the same filter context.
**Example response shape:**
```typescript
interface CoachPracticeResponse {
  // COACH-01: Per-student attempt details
  attempts: {
    attemptId: string;
    studentName: string | null;
    studentEmail: string;
    practiceSetTitle: string;
    score: number | null;
    totalExercises: number;
    correctCount: number;
    startedAt: string;
    completedAt: string | null;
    timeTakenSeconds: number | null; // computed: completedAt - startedAt
    perExercise: {
      exerciseId: string;
      exerciseType: string;
      isCorrect: boolean;
      score: number;
    }[];
  }[];
  // COACH-02: Aggregate analytics
  aggregates: {
    totalAttempts: number;
    totalStudents: number;
    overallAvgScore: number;
    overallCompletionRate: number; // % of attempts that were completed
    perSet: {
      setId: string;
      setTitle: string;
      avgScore: number;
      attemptCount: number;
      completionRate: number;
    }[];
    hardestExercises: {
      exerciseId: string;
      exerciseType: string;
      practiceSetTitle: string;
      avgScore: number;
      attemptCount: number;
      incorrectRate: number; // % of times answered incorrectly
    }[];
  };
  // Metadata for filter dropdowns
  practiceSets: { id: string; title: string }[];
}
```

### Pattern 4: Recharts BarChart for Aggregate Visualization
**What:** Use shadcn/ui ChartContainer with Recharts BarChart for avg scores per practice set and hardest exercises.
**When to use:** For COACH-02 aggregate analytics visualization.
**Example:**
```typescript
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  avgScore: {
    label: "Avg Score",
    color: "#10b981",
  },
} satisfies ChartConfig;

interface SetScoreChartProps {
  data: { setTitle: string; avgScore: number; attemptCount: number }[];
}

export function SetScoreChart({ data }: SetScoreChartProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
      <BarChart data={data} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} stroke="#27272a" />
        <XAxis
          dataKey="setTitle"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fill: "#a1a1aa" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fill: "#a1a1aa" }}
          domain={[0, 100]}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="avgScore" fill="var(--color-avgScore)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
```

### Pattern 5: Inline HTML Table (Admin Analytics Pattern)
**What:** Use plain HTML tables with Tailwind styling, matching the existing admin analytics table pattern.
**When to use:** For the per-student attempt detail table (COACH-01).
**Example:**
```typescript
// Follow the exact pattern from CompletionTable.tsx and DifficultyTable.tsx
<div className="overflow-x-auto rounded-lg border border-zinc-700">
  <table className="w-full text-sm">
    <thead className="sticky top-0 bg-zinc-800 text-left text-zinc-400">
      <tr className="border-b border-zinc-700">
        <th className="px-4 py-3 font-medium">Student</th>
        <th className="px-4 py-3 font-medium">Practice Set</th>
        <th className="px-4 py-3 font-medium">Score</th>
        <th className="px-4 py-3 font-medium">Correct</th>
        <th className="px-4 py-3 font-medium">Time</th>
        <th className="px-4 py-3 font-medium">Date</th>
      </tr>
    </thead>
    <tbody>
      {/* Map attempts to rows */}
    </tbody>
  </table>
</div>
```

### Anti-Patterns to Avoid
- **Self-fetching API routes from server components:** Known to cause 401 errors. Use client-side fetch from client components OR direct DB queries from server components. Never both.
- **N+1 queries per exercise result:** Do NOT query per-exercise results one at a time. The JSONB `results` column already contains all per-exercise data -- parse it in JavaScript, not with separate queries.
- **Fetching all attempts without limit:** Always paginate or limit. Default to last 90 days + LIMIT 200 for initial load.
- **Parsing JSONB in SQL:** Postgres can query into JSONB, but it's slower and harder to type-check than fetching the whole column and parsing in JS. Keep SQL simple, parse JSONB client-side.
- **Separate API calls for attempts and aggregates:** Causes waterfall and double auth check. Combine into one endpoint.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date range filter UI | Custom date picker | Existing `DateRangeFilter` pattern from admin analytics (HTML `<input type="date">`) | Already proven, matches dark theme, zero deps |
| Chart tooltips and theming | Custom tooltip components | shadcn/ui `ChartTooltipContent` | Already themed for dark mode, handles formatting |
| Score color coding | Inline ternary chains | Extract `scoreColor()` and `scoreBgColor()` helper functions | Already exists in coach/pronunciation/page.tsx -- reuse pattern |
| Date range parsing | Manual string parsing | Existing `parseDateRange()` from `@/lib/analytics.ts` | Already handles null/invalid dates, returns `Date | null` |
| CSV export | Custom file generation | Existing `formatCsvResponse()` from `@/lib/analytics.ts` | Already handles escaping, Content-Disposition headers |

**Key insight:** The codebase already has 80% of the patterns needed. The admin analytics dashboard is the closest analog for filter + table + chart patterns. The coach pronunciation page is the closest analog for querying practice data across all students.

## Common Pitfalls

### Pitfall 1: Time Taken Calculation Overflow
**What goes wrong:** `completedAt - startedAt` produces milliseconds. If a student leaves mid-attempt and returns hours later, the time is misleadingly large.
**Why it happens:** `startedAt` is set when the attempt is created, not when active practice begins.
**How to avoid:** Cap displayed time at a reasonable maximum (e.g., 30 minutes). Show "30m+" for anything over. Or calculate based on actual exercise interactions if available.
**Warning signs:** Time values showing hours or days for a 10-question practice set.

### Pitfall 2: JSONB Results Column is Null for Incomplete Attempts
**What goes wrong:** Trying to iterate over `results` when the attempt was started but never completed returns null, causing `.entries()` TypeError.
**Why it happens:** `results` is nullable. It's only populated when the student completes the practice set.
**How to avoid:** Always guard: `const perExercise = attempt.results ? Object.entries(attempt.results as Record<string, ...>) : []`. Filter for `completedAt IS NOT NULL` in the main query unless explicitly showing in-progress attempts.
**Warning signs:** Runtime errors on attempts with null results.

### Pitfall 3: Exercise Definition Lookup N+1
**What goes wrong:** For each attempt's per-exercise breakdown, querying the exercise definition individually to get the exercise type and question text.
**Why it happens:** The `results` JSONB only stores `{ score, isCorrect, response }` -- no exercise type or question text.
**How to avoid:** Batch-load all exercise definitions for the relevant practice sets in a single query using `WHERE practice_set_id IN (...)`. Build a lookup Map. This is exactly how `coach/pronunciation/page.tsx` handles it.
**Warning signs:** Multiple sequential DB calls inside a loop.

### Pitfall 4: Aggregate Queries Without Filtering
**What goes wrong:** Computing `AVG(score)` across ALL attempts in the database when filters should be applied.
**Why it happens:** Forgetting to apply the same WHERE clause to aggregate queries that's applied to the detail query.
**How to avoid:** Build a shared WHERE clause builder that both the detail query and aggregate queries use. The admin analytics pattern does this with `parseDateRange()` applied to all queries.
**Warning signs:** Aggregate numbers don't change when filters are applied.

### Pitfall 5: Hardest Exercises Ranking by Wrong Metric
**What goes wrong:** Ranking by lowest average score, but an exercise attempted once with score 0 outranks a consistently difficult exercise with 30 attempts averaging 45%.
**Why it happens:** No minimum attempt threshold.
**How to avoid:** Only include exercises with >= 3 attempts in the "hardest exercises" ranking. This prevents outliers from one-off results.
**Warning signs:** Obscure exercises appearing at the top of the difficulty list.

### Pitfall 6: Missing Loading Skeleton Convention
**What goes wrong:** Loading state doesn't match the established project convention.
**Why it happens:** Forgetting the convention defined in prior decisions.
**How to avoid:** Follow the loading skeleton convention: default export, Skeleton from `@/components/ui/skeleton`, `bg-zinc-800`, content-area only (no sidebar/header). See `coach/loading.tsx` and `dashboard/progress/loading.tsx` for examples.
**Warning signs:** Inconsistent loading state appearance.

### Pitfall 7: Missing Sidebar Navigation Link
**What goes wrong:** The page exists but coaches can't find it because there's no sidebar link.
**Why it happens:** Forgetting to add the new route to `AppSidebar.tsx`.
**How to avoid:** Add a new item to the "Coach Tools" section in `navSections` with `minRole: "coach"`. Use `BarChart3` or `ClipboardList` icon from lucide-react.
**Warning signs:** Page only accessible via direct URL.

## Code Examples

Verified patterns from the existing codebase:

### Query All Practice Attempts with Student + Set Info
```typescript
// Source: coach/pronunciation/page.tsx pattern adapted for general practice results
import { db } from "@/db";
import {
  practiceAttempts,
  practiceSets,
  practiceExercises,
  users,
} from "@/db/schema";
import { eq, and, gte, lte, isNotNull, desc, sql, inArray, ilike } from "drizzle-orm";

interface PracticeResultsFilters {
  studentName?: string;
  practiceSetId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  scoreMin?: number;
  scoreMax?: number;
}

export async function getPracticeAttempts(filters: PracticeResultsFilters) {
  // Build dynamic WHERE conditions
  const conditions = [isNotNull(practiceAttempts.completedAt)];

  if (filters.studentName) {
    conditions.push(
      ilike(users.name, `%${filters.studentName}%`)
    );
  }
  if (filters.practiceSetId) {
    conditions.push(eq(practiceAttempts.practiceSetId, filters.practiceSetId));
  }
  if (filters.dateFrom) {
    conditions.push(gte(practiceAttempts.completedAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(practiceAttempts.completedAt, filters.dateTo));
  }
  if (filters.scoreMin !== undefined) {
    conditions.push(gte(practiceAttempts.score, filters.scoreMin));
  }
  if (filters.scoreMax !== undefined) {
    conditions.push(lte(practiceAttempts.score, filters.scoreMax));
  }

  const attempts = await db
    .select({
      attemptId: practiceAttempts.id,
      practiceSetId: practiceAttempts.practiceSetId,
      score: practiceAttempts.score,
      totalExercises: practiceAttempts.totalExercises,
      correctCount: practiceAttempts.correctCount,
      startedAt: practiceAttempts.startedAt,
      completedAt: practiceAttempts.completedAt,
      results: practiceAttempts.results,
      studentName: users.name,
      studentEmail: users.email,
      setTitle: practiceSets.title,
    })
    .from(practiceAttempts)
    .innerJoin(users, eq(practiceAttempts.userId, users.id))
    .innerJoin(practiceSets, eq(practiceAttempts.practiceSetId, practiceSets.id))
    .where(and(...conditions))
    .orderBy(desc(practiceAttempts.completedAt))
    .limit(200);

  return attempts;
}
```

### Aggregate Analytics Query
```typescript
// Source: admin analytics pattern adapted for practice data
export async function getPracticeAggregates(filters: PracticeResultsFilters) {
  // Same WHERE conditions as above
  const conditions = [isNotNull(practiceAttempts.completedAt)];
  // ... apply same filters ...

  // Per-set averages
  const perSet = await db
    .select({
      setId: practiceSets.id,
      setTitle: practiceSets.title,
      avgScore: sql<number>`ROUND(AVG(${practiceAttempts.score}), 1)`,
      attemptCount: sql<number>`COUNT(*)`,
      completedCount: sql<number>`COUNT(CASE WHEN ${practiceAttempts.completedAt} IS NOT NULL THEN 1 END)`,
    })
    .from(practiceAttempts)
    .innerJoin(practiceSets, eq(practiceAttempts.practiceSetId, practiceSets.id))
    .innerJoin(users, eq(practiceAttempts.userId, users.id))
    .where(and(...conditions))
    .groupBy(practiceSets.id, practiceSets.title)
    .orderBy(sql`AVG(${practiceAttempts.score}) ASC`);

  // Overall stats
  const [overall] = await db
    .select({
      totalAttempts: sql<number>`COUNT(*)`,
      totalStudents: sql<number>`COUNT(DISTINCT ${practiceAttempts.userId})`,
      avgScore: sql<number>`ROUND(AVG(${practiceAttempts.score}), 1)`,
    })
    .from(practiceAttempts)
    .innerJoin(users, eq(practiceAttempts.userId, users.id))
    .where(and(...conditions));

  return { perSet, overall };
}
```

### Hardest Exercises Computation (JavaScript-side JSONB Parsing)
```typescript
// Parse JSONB results to find exercises with lowest correct rates
// This avoids complex Postgres JSONB queries
export function computeHardestExercises(
  attempts: { results: Record<string, { isCorrect: boolean; score: number }> | null }[],
  exerciseMap: Map<string, { type: string; practiceSetTitle: string }>
) {
  const exerciseStats = new Map<string, { correct: number; total: number; totalScore: number }>();

  for (const attempt of attempts) {
    if (!attempt.results) continue;
    for (const [exerciseId, result] of Object.entries(attempt.results)) {
      const stats = exerciseStats.get(exerciseId) ?? { correct: 0, total: 0, totalScore: 0 };
      stats.total++;
      if (result.isCorrect) stats.correct++;
      stats.totalScore += result.score ?? 0;
      exerciseStats.set(exerciseId, stats);
    }
  }

  return Array.from(exerciseStats.entries())
    .filter(([, stats]) => stats.total >= 3) // Minimum 3 attempts threshold
    .map(([exerciseId, stats]) => ({
      exerciseId,
      exerciseType: exerciseMap.get(exerciseId)?.type ?? "unknown",
      practiceSetTitle: exerciseMap.get(exerciseId)?.practiceSetTitle ?? "Unknown",
      avgScore: Math.round(stats.totalScore / stats.total),
      attemptCount: stats.total,
      incorrectRate: Math.round(((stats.total - stats.correct) / stats.total) * 100),
    }))
    .sort((a, b) => a.avgScore - b.avgScore) // Lowest average score = hardest
    .slice(0, 10); // Top 10 hardest
}
```

### Score Color Helper (Reusable from Pronunciation Page)
```typescript
// Source: coach/pronunciation/page.tsx — reuse this exact pattern
function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function scoreBgColor(score: number): string {
  if (score >= 80) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 60) return "bg-yellow-500/20 text-yellow-400";
  return "bg-red-500/20 text-red-400";
}
```

### Filter Bar Pattern
```typescript
// Matches admin analytics DateRangeFilter pattern, extended with additional filters
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PracticeFiltersProps {
  practiceSets: { id: string; title: string }[];
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
}

export function PracticeFilters({
  practiceSets,
  filters,
  onFilterChange,
}: PracticeFiltersProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      {/* Student name search */}
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Student</label>
        <input
          type="text"
          placeholder="Search by name..."
          value={filters.studentName}
          onChange={(e) => onFilterChange({ ...filters, studentName: e.target.value })}
          className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-white outline-none focus:border-zinc-500"
        />
      </div>

      {/* Practice set selector */}
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Practice Set</label>
        <Select
          value={filters.practiceSetId}
          onValueChange={(v) => onFilterChange({ ...filters, practiceSetId: v })}
        >
          <SelectTrigger className="h-9 w-[200px] border-zinc-700 bg-zinc-800">
            <SelectValue placeholder="All sets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sets</SelectItem>
            {practiceSets.map((set) => (
              <SelectItem key={set.id} value={set.id}>{set.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date range */}
      <div>
        <label className="mb-1 block text-sm text-zinc-400">From</label>
        <input type="date" value={filters.dateFrom} onChange={(e) => onFilterChange({ ...filters, dateFrom: e.target.value })}
          className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-white outline-none focus:border-zinc-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">To</label>
        <input type="date" value={filters.dateTo} onChange={(e) => onFilterChange({ ...filters, dateTo: e.target.value })}
          className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-white outline-none focus:border-zinc-500"
        />
      </div>

      {/* Score range */}
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Min Score</label>
        <input type="number" min="0" max="100" value={filters.scoreMin} onChange={(e) => onFilterChange({ ...filters, scoreMin: e.target.value })}
          className="h-9 w-20 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-white outline-none focus:border-zinc-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-zinc-400">Max Score</label>
        <input type="number" min="0" max="100" value={filters.scoreMax} onChange={(e) => onFilterChange({ ...filters, scoreMax: e.target.value })}
          className="h-9 w-20 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm text-white outline-none focus:border-zinc-500"
        />
      </div>

      {/* Apply + Clear buttons */}
      <button onClick={handleApply} className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 transition-colors">Apply</button>
      <button onClick={handleClear} className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-4 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors">Clear</button>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server component with revalidation for filtered data | Client-side fetch with filter state | Admin analytics dashboard (Phase 17) | Better UX for multi-filter pages |
| Separate API calls per section | Combined response with attempts + aggregates | Current best practice | Fewer round trips, consistent filter application |
| Querying JSONB in Postgres with `->>`/`jsonb_each` | Fetching whole JSONB column and parsing in JavaScript | Project convention | Simpler SQL, better TypeScript type safety |

**Deprecated/outdated:**
- None for this phase. All patterns are current and proven in the codebase.

## Data Model Reference

### practiceAttempts Table (source of truth)
```
id              UUID PK
practice_set_id UUID FK -> practice_sets.id
user_id         UUID FK -> users.id
score           INTEGER nullable (0-100, null until completed)
total_exercises INTEGER NOT NULL
correct_count   INTEGER NOT NULL DEFAULT 0
started_at      TIMESTAMP NOT NULL DEFAULT NOW()
completed_at    TIMESTAMP nullable
results         JSONB nullable
  -> Record<exerciseId, { score: number; isCorrect: boolean; response: string;
                          feedback?: string; pronunciationDetails?: {...} }>
```

### Key Indexes (already exist)
- `practice_attempts_practice_set_id_idx` on `practice_set_id`
- `practice_attempts_user_id_idx` on `user_id`

### Missing Index (consider adding)
- `practice_attempts_completed_at_idx` on `completed_at` -- the coach page will frequently filter by `completedAt IS NOT NULL` and date range. This index would help, but is optional since the table is likely small for this LMS.

### JSONB Results Shape (actual runtime data)
The `results` column stores `Record<string, GradeResult>` where GradeResult is:
```typescript
{
  isCorrect: boolean;
  score: number;       // 0-100
  feedback: string;
  explanation?: string;
  pronunciationDetails?: PronunciationAssessmentResult;
}
```
This is stored by `PracticePlayer.tsx` on completion via the attempts API route.

## Sidebar Navigation Update

The `AppSidebar.tsx` file at `src/components/layout/AppSidebar.tsx` needs a new entry in the "Coach Tools" section:

```typescript
{
  label: "Coach Tools",
  minRole: "coach",
  items: [
    { title: "Coach Dashboard", url: "/coach", icon: Users },
    { title: "Pronunciation", url: "/coach/pronunciation", icon: Mic },
    { title: "Conversations", url: "/coach/conversations", icon: MessageSquare },
    { title: "Students", url: "/coach/students", icon: Users },
    // ADD:
    { title: "Practice Results", url: "/coach/practice-results", icon: BarChart3 },
  ],
},
```

Note: Import `BarChart3` from lucide-react (already imported in the file but used only in Admin section -- it can be reused).

## Open Questions

1. **Per-exercise breakdown: expandable row or separate page?**
   - What we know: COACH-01 requires "per-exercise correctness breakdown." The `results` JSONB stores per-exercise `isCorrect` + `score`.
   - What's unclear: Should clicking an attempt row expand inline to show per-exercise details, or navigate to a separate detail page?
   - Recommendation: Use expandable rows (click to toggle). This avoids an extra page/route and keeps the coach in context. The exercise breakdown is typically 5-15 items -- fits inline. Use a collapsible section under each row.

2. **Student email fallback vs name-only search**
   - What we know: The `users.name` field is nullable. Some students might only have an email.
   - What's unclear: Should the student filter search both name and email?
   - Recommendation: Yes, search both. Use `OR(ilike(users.name, ...), ilike(users.email, ...))`. This is more useful since some users may not have set a display name.

3. **Pagination for large datasets**
   - What we know: The initial implementation uses `LIMIT 200`.
   - What's unclear: Will 200 be enough? Should we add cursor-based pagination?
   - Recommendation: Start with LIMIT 200 + the date range filter (default last 90 days). This constrains the result set naturally. Add pagination later only if coaches report needing it. The LMS is for high-ticket adult learners -- unlikely to have thousands of students.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/db/schema/practice.ts` -- practice_attempts, practice_exercises, practice_sets table definitions and JSONB type
- Existing codebase: `src/app/(dashboard)/coach/pronunciation/page.tsx` -- proven pattern for querying practice attempts across all students with JOIN to users and practice_sets
- Existing codebase: `src/app/(dashboard)/admin/analytics/` -- proven pattern for client-side filtered dashboard with DateRangeFilter, API routes, and HTML tables
- Existing codebase: `src/components/progress/XPTimeline.tsx` -- proven Recharts + shadcn/ui ChartContainer pattern
- Existing codebase: `src/components/layout/AppSidebar.tsx` -- sidebar navigation structure with role-based filtering
- Existing codebase: `src/lib/analytics.ts` -- `parseDateRange()` and CSV export utilities
- Existing codebase: `src/hooks/usePracticePlayer.ts` -- confirms `results` JSONB shape as `Record<string, GradeResult>`
- Existing codebase: `src/lib/practice-grading.ts` -- `GradeResult` interface definition

### Secondary (MEDIUM confidence)
- Recharts BarChart documentation -- bar chart props, radius, data formatting (verified via Context7 in Phase 41 research)
- shadcn/ui Chart documentation -- ChartContainer usage with BarChart (verified via Context7 in Phase 41 research)

### Tertiary (LOW confidence)
- Hardest exercises "minimum 3 attempts" threshold -- my recommendation, not validated by user testing
- Time taken cap at 30 minutes -- my recommendation for display purposes

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in the codebase, no new dependencies
- Architecture: HIGH -- follows established codebase patterns exactly (admin analytics for client-side filtering, coach pronunciation for cross-student practice data queries, progress dashboard for Recharts charts)
- Data model: HIGH -- `practiceAttempts` schema and JSONB structure verified from schema definition, API route, player component, and pronunciation page
- Pitfalls: HIGH -- all derived from actual codebase patterns and known issues (null results, N+1 queries, self-fetch 401 bug)
- Aggregate queries: MEDIUM -- SQL patterns are standard but exact performance characteristics depend on data volume

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable domain, no dependency changes expected)
