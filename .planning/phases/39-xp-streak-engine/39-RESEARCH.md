# Phase 39: XP & Streak Engine - Research

**Researched:** 2026-02-07
**Domain:** Gamification engine — XP ledger, streak tracking, daily activity summary, level progression, activity rings UI
**Confidence:** HIGH

## Summary

Phase 39 implements the core engagement engine for the LMS: an append-only XP ledger that records every learning action, a daily activity summary that aggregates per-day stats, streak tracking with timezone-aware consecutive-day detection, and Apple Watch-style activity rings. The existing codebase provides all necessary integration points — lesson completion (POST /api/progress/[lessonId]), practice set attempts (POST /api/practice/[setId]/attempts), and voice conversations (PATCH /api/conversations/[conversationId]) — each of which will call an `awardXP()` service function after their existing logic succeeds.

The architecture is straightforward: two new Drizzle schema tables (xp_events, daily_activity), one new lib service file (src/lib/xp.ts), XP-awarding calls inserted into 3 existing API routes, one new API route for the XP/streak dashboard data, and one new React component (ActivityRings). No new npm packages are required — date-fns v4.1.0 is already installed, and `@date-fns/tz` (the official timezone companion) needs to be added for TZDate-based day boundary calculations. The activity rings are simple enough to hand-build with SVG + framer-motion (already installed) rather than pulling in a third-party library.

**Primary recommendation:** Build the XP system as an append-only ledger with a denormalized daily_activity summary table. Keep all XP logic in a single `src/lib/xp.ts` service file. Use `@date-fns/tz` TZDate for timezone-aware day boundary detection. Build activity rings as a custom SVG component using stroke-dashoffset animation via framer-motion.

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.1 | Schema definition + queries for xp_events and daily_activity tables | Already used for all 20 schema files in project |
| date-fns | 4.1.0 | Date formatting, comparison, startOfDay | Already used in 19+ files across project |
| framer-motion | 12.29.2 | Activity ring fill animation (pathLength 0->1) | Already used in PracticePlayer, chatbot |
| zod | 4.3.6 | Request body validation for XP API | Already used for exercise form schemas |

### Needs Installation

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @date-fns/tz | latest (^1.2.0) | TZDate class for timezone-aware day boundary calculations | Streak detection: determining "today" in user's IANA timezone |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @date-fns/tz | Manual UTC offset math | Error-prone for DST transitions; TZDate handles this correctly |
| Custom SVG rings | react-activity-rings (npm) | Extra dependency for ~50 lines of SVG; project already has framer-motion |
| Denormalized daily_activity | Real-time aggregation queries | Daily aggregation from xp_events would be slow for dashboard; summary table is O(1) reads |

**Installation:**
```bash
npm install @date-fns/tz
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── xp.ts                    # xp_events + daily_activity tables, enums, relations
├── lib/
│   └── xp.ts                    # awardXP(), getStreak(), getDailyActivity(), getLevel(), updateDailySummary()
├── app/api/
│   └── xp/
│       └── route.ts             # GET: dashboard data (level, streak, daily activity, rings)
├── components/
│   └── xp/
│       ├── ActivityRings.tsx     # SVG concentric rings with framer-motion animation
│       ├── LevelBadge.tsx        # Current level display with progress to next
│       ├── StreakDisplay.tsx      # Current streak with freeze indicators
│       └── DailyGoalProgress.tsx  # Today's XP vs goal with progress bar
```

### Pattern 1: Append-Only XP Ledger with Denormalized Summary
**What:** Every XP-earning action inserts a row into xp_events (never updated/deleted). A daily_activity row is upserted on each XP award to maintain running daily totals.
**When to use:** Always — this is the core data model.
**Example:**
```typescript
// Source: Project pattern from existing upsertLessonProgress in src/lib/progress.ts

export async function awardXP(params: {
  userId: string;
  source: XPSource;
  amount: number;
  entityId?: string;
  entityType?: string;
}): Promise<{ xpAwarded: number; dailyTotal: number; goalMet: boolean }> {
  // 1. Insert into xp_events (append-only)
  const [event] = await db.insert(xpEvents).values({
    userId: params.userId,
    source: params.source,
    amount: params.amount,
    entityId: params.entityId,
    entityType: params.entityType,
  }).returning();

  // 2. Upsert daily_activity summary
  // Get user's timezone for day boundary
  const user = await db.query.users.findFirst({
    where: eq(users.id, params.userId),
    columns: { timezone: true, dailyGoalXp: true },
  });
  const tz = user?.timezone ?? "UTC";
  const todayDate = getTodayInTimezone(tz); // "2026-02-07" string

  // Upsert: increment counters for today
  const [daily] = await db.insert(dailyActivity).values({
    userId: params.userId,
    activityDate: todayDate,
    totalXp: params.amount,
    // increment source-specific counter based on params.source
    lessonCount: params.source === "lesson_complete" ? 1 : 0,
    practiceCount: ["practice_exercise", "practice_perfect"].includes(params.source) ? 1 : 0,
    conversationCount: params.source === "voice_conversation" ? 1 : 0,
    goalMet: params.amount >= (user?.dailyGoalXp ?? 100),
  }).onConflictDoUpdate({
    target: [dailyActivity.userId, dailyActivity.activityDate],
    set: {
      totalXp: sql`${dailyActivity.totalXp} + ${params.amount}`,
      lessonCount: sql`${dailyActivity.lessonCount} + ${params.source === "lesson_complete" ? 1 : 0}`,
      practiceCount: sql`${dailyActivity.practiceCount} + ${["practice_exercise", "practice_perfect"].includes(params.source) ? 1 : 0}`,
      conversationCount: sql`${dailyActivity.conversationCount} + ${params.source === "voice_conversation" ? 1 : 0}`,
      goalMet: sql`CASE WHEN ${dailyActivity.totalXp} + ${params.amount} >= ${user?.dailyGoalXp ?? 100} THEN true ELSE ${dailyActivity.goalMet} END`,
    },
  }).returning();

  // 3. Check if daily goal just met (for bonus XP)
  const goalJustMet = daily.goalMet && daily.totalXp - params.amount < (user?.dailyGoalXp ?? 100);

  return {
    xpAwarded: params.amount,
    dailyTotal: daily.totalXp,
    goalMet: daily.goalMet,
  };
}
```

### Pattern 2: Timezone-Aware Day Boundary with @date-fns/tz
**What:** Use TZDate to determine "today" in the user's IANA timezone for streak detection and daily summary keying.
**When to use:** Any time we need to determine the current date in the user's local timezone.
**Example:**
```typescript
// Source: Context7 @date-fns/tz documentation
import { TZDate } from "@date-fns/tz";
import { format, startOfDay, differenceInCalendarDays } from "date-fns";

/**
 * Get today's date string (YYYY-MM-DD) in the user's timezone.
 * Uses IANA timezone string stored in users.timezone column.
 */
export function getTodayInTimezone(timezone: string): string {
  const now = TZDate.tz(timezone);
  return format(now, "yyyy-MM-dd");
}

/**
 * Check if two dates are consecutive days in user's timezone.
 * Used for streak calculation.
 */
export function areConsecutiveDays(
  dateA: string, // "2026-02-06"
  dateB: string, // "2026-02-07"
): boolean {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  return Math.abs(differenceInCalendarDays(b, a)) === 1;
}
```

### Pattern 3: Streak Algorithm with Grace Period and Freezes
**What:** Walk backward through daily_activity rows to count consecutive active days. A 4-hour grace period means "today" extends until 04:00 tomorrow. Two free freezes per month cover missed days.
**When to use:** When computing current streak for display.
**Example:**
```typescript
export async function getStreak(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  freezesUsedThisMonth: number;
  freezesRemaining: number;
}> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { timezone: true },
  });
  const tz = user?.timezone ?? "UTC";

  // Get "today" with 4-hour grace: if it's before 04:00, count as "yesterday"
  const nowInTz = TZDate.tz(tz);
  const hour = nowInTz.getHours();
  const effectiveToday = hour < 4
    ? format(new TZDate(nowInTz.getTime() - 24 * 60 * 60 * 1000, tz), "yyyy-MM-dd")
    : format(nowInTz, "yyyy-MM-dd");

  // Fetch daily_activity rows in reverse chronological order
  const days = await db.select()
    .from(dailyActivity)
    .where(eq(dailyActivity.userId, userId))
    .orderBy(desc(dailyActivity.activityDate));

  // Walk backward counting streak with freeze support
  let streak = 0;
  let freezesUsed = 0;
  let expectedDate = effectiveToday;

  for (const day of days) {
    const dayStr = format(day.activityDate, "yyyy-MM-dd");

    if (dayStr === expectedDate) {
      // Active day
      streak++;
      expectedDate = getPreviousDate(expectedDate);
    } else if (dayStr < expectedDate) {
      // Missed day(s) — try to use freeze
      const missedDays = differenceInCalendarDays(
        new Date(expectedDate), new Date(dayStr)
      );
      if (missedDays === 1 && freezesUsed < 2) {
        // One missed day, use freeze
        freezesUsed++;
        streak++; // freeze counts as maintaining streak
        expectedDate = dayStr;
        // Re-process this day
        streak++;
        expectedDate = getPreviousDate(expectedDate);
      } else {
        break; // Streak broken
      }
    }
  }

  // Also consider: user might be active today but not yet in the query
  // (the current awardXP call hasn't committed yet)

  return {
    currentStreak: streak,
    longestStreak: Math.max(streak, /* stored longest */),
    freezesUsedThisMonth: freezesUsed,
    freezesRemaining: 2 - freezesUsed,
  };
}
```

### Pattern 4: XP Integration into Existing API Routes (Fire-and-Forget)
**What:** After existing success logic, call `awardXP()` in a fire-and-forget pattern (matching the GHL milestone dispatch pattern already used in the codebase).
**When to use:** At each XP-earning point in existing routes.
**Example:**
```typescript
// In src/app/api/progress/[lessonId]/route.ts — after lessonComplete is set to true:
if (lessonComplete) {
  // Existing: GHL milestone dispatch
  detectAndDispatchMilestones(user.id, lessonId).catch(/* ... */);

  // NEW: Award XP for lesson completion
  awardXP({
    userId: user.id,
    source: "lesson_complete",
    amount: 50,
    entityId: lessonId,
    entityType: "lesson",
  }).catch((err) => console.error("[XP] Lesson XP award failed:", err));
}
```

### Pattern 5: SVG Activity Rings with stroke-dashoffset
**What:** Three concentric SVG circles with stroke-dasharray set to circumference and stroke-dashoffset animated from full to proportional fill.
**When to use:** The ActivityRings component.
**Example:**
```tsx
// Source: Verified SVG pattern from multiple sources
import { motion } from "framer-motion";

interface Ring {
  label: string;        // "Learn" | "Practice" | "Speak"
  current: number;      // today's count
  goal: number;         // daily target
  color: string;        // stroke color
}

function ActivityRings({ rings, size = 120 }: { rings: Ring[]; size?: number }) {
  const strokeWidth = 10;
  const gap = 4;
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((ring, i) => {
        const radius = center - strokeWidth / 2 - i * (strokeWidth + gap);
        const circumference = 2 * Math.PI * radius;
        const progress = Math.min(ring.current / ring.goal, 1);

        return (
          <g key={ring.label}>
            {/* Background ring */}
            <circle
              cx={center} cy={center} r={radius}
              fill="none" stroke={ring.color} strokeWidth={strokeWidth}
              opacity={0.2}
            />
            {/* Progress ring */}
            <motion.circle
              cx={center} cy={center} r={radius}
              fill="none" stroke={ring.color} strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference * (1 - progress) }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              transform={`rotate(-90 ${center} ${center})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
```

### Anti-Patterns to Avoid
- **Mutable XP records:** XP events must be append-only. Never update or delete xp_events rows. This ensures auditability and prevents bugs.
- **UTC-only day boundaries:** Using UTC midnight as "day boundary" breaks for users in timezone offsets (user in UTC+8 would see their streak reset at 4pm). Always use user's stored IANA timezone.
- **Aggregating xp_events on every read:** Querying SUM(amount) FROM xp_events WHERE date = today on every dashboard load is expensive. The daily_activity summary table provides O(1) reads.
- **Blocking XP awards:** XP should never block the user's action. Use fire-and-forget pattern (`.catch()`) so a failed XP insert doesn't fail the lesson completion.
- **Hardcoded timezone offsets:** Never use numeric offsets (+8, -5). Always use IANA strings (Asia/Hong_Kong, America/New_York) which handle DST automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timezone day boundaries | Manual UTC offset math | @date-fns/tz TZDate | DST transitions cause subtle off-by-one bugs; TZDate handles them |
| SVG circle progress math | Complex trigonometry library | stroke-dasharray + stroke-dashoffset | Two CSS properties replace all arc math; universally supported |
| Animated ring fills | Custom RAF animation loop | framer-motion `animate` prop | Already in project; hardware-accelerated; declarative |
| Daily XP aggregation | COUNT/SUM query on every read | Denormalized daily_activity table | O(1) vs O(n); upsert on write is cheap |

**Key insight:** The entire XP system is fundamentally an event-sourcing pattern: immutable events (xp_events) projected into a read-optimized view (daily_activity). This is a well-understood pattern that needs no libraries beyond the ORM.

## Common Pitfalls

### Pitfall 1: Timezone-Unaware Streak Detection
**What goes wrong:** Streak counts based on UTC dates cause false streak breaks for users in Asia/Pacific timezones. User in UTC+12 who learns at 11pm sees streak reset because it's already "tomorrow" in UTC.
**Why it happens:** Developer defaults to `new Date().toISOString().slice(0, 10)` for "today."
**How to avoid:** Always compute "today" using `TZDate.tz(userTimezone)` then `format(tzDate, "yyyy-MM-dd")`. Store activityDate as a DATE column (not TIMESTAMP) keyed on user-local date.
**Warning signs:** Streak resets reported by users in Asia-Pacific timezones.

### Pitfall 2: Double XP Award on Retry
**What goes wrong:** Practice exercise retry awards XP again for the same exercise. Lesson completion re-awards if progress endpoint is called twice.
**Why it happens:** No idempotency check before awarding.
**How to avoid:** For lessons: only award when `lessonComplete` transitions from false to true (existing check: `completion.isComplete && progress.completedAt === null`). For practice exercises: award per-exercise XP only on first correct answer per attempt. For practice set perfect bonus: award only once per attempt.
**Warning signs:** XP totals that seem inflated; students earning XP by repeatedly completing already-passed exercises.

### Pitfall 3: Grace Period Off-By-One
**What goes wrong:** 4-hour grace period implementation uses `hour < 4` but forgets to shift the date check, causing midnight-4am activity to count for the wrong day.
**Why it happens:** Grace period logic is interleaved with day boundary logic.
**How to avoid:** Define a single `getEffectiveDate(timezone)` function that encapsulates the grace period logic, returning the "effective date" for streak purposes. Use it everywhere instead of raw date checks.
**Warning signs:** Streaks that break despite user activity after midnight.

### Pitfall 4: Freeze Count Across Month Boundary
**What goes wrong:** Freeze counter doesn't reset at month boundary, or resets mid-streak.
**Why it happens:** Month boundary detection in user's timezone is tricky.
**How to avoid:** Store `freezesUsedThisMonth` and `freezeResetMonth` in daily_activity or a separate user-level column. Check and reset when month changes.
**Warning signs:** Users reporting they can't use freezes they should have.

### Pitfall 5: Activity Rings Not Matching Daily Goal
**What goes wrong:** Ring shows 100% but daily goal badge shows "not met" — or vice versa.
**Why it happens:** Ring dimensions (Learn, Practice, Speak) have independent goals, but daily XP goal is a single number. They're measuring different things.
**How to avoid:** Clearly separate: (1) Daily XP goal = total XP earned today vs target, displayed as a progress bar. (2) Activity rings = three dimensions showing activity TYPE distribution, not XP amounts. Define ring goals as counts (e.g., 1 lesson, 3 exercises, 1 conversation) not XP values.
**Warning signs:** Confusing UI where ring completion doesn't correlate with goal completion.

### Pitfall 6: Level Calculation Overflow
**What goes wrong:** Level calculation produces values > 50 or negative levels for edge-case XP totals.
**Why it happens:** Inverse quadratic formula without clamping.
**How to avoid:** Always clamp: `Math.min(50, Math.max(1, calculatedLevel))`. Use integer math for XP thresholds, not floating point.
**Warning signs:** Students showing level 51 or level 0.

## Code Examples

### Database Schema: xp_events and daily_activity
```typescript
// Source: Project convention from src/db/schema/*.ts

import {
  pgTable, uuid, text, timestamp, integer, date, boolean, pgEnum, unique, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// XP source types
export const xpSourceEnum = pgEnum("xp_source", [
  "lesson_complete",       // 50 XP
  "practice_exercise",     // 5-10 XP per exercise
  "practice_perfect",      // 25 XP bonus for perfect score
  "voice_conversation",    // 15 XP
  "daily_goal_met",        // 10 XP bonus
]);

// Append-only XP event ledger
export const xpEvents = pgTable("xp_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  source: xpSourceEnum("source").notNull(),
  amount: integer("amount").notNull(),
  entityId: uuid("entity_id"),    // lesson_id, exercise_id, conversation_id, etc.
  entityType: text("entity_type"), // "lesson", "practice_exercise", "practice_set", "conversation"
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("xp_events_user_id_idx").on(table.userId),
  index("xp_events_user_id_created_at_idx").on(table.userId, table.createdAt),
]);

// Daily activity summary (one row per user per day)
export const dailyActivity = pgTable("daily_activity", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  activityDate: date("activity_date").notNull(), // YYYY-MM-DD in user's timezone
  totalXp: integer("total_xp").notNull().default(0),
  lessonCount: integer("lesson_count").notNull().default(0),
  practiceCount: integer("practice_count").notNull().default(0),
  conversationCount: integer("conversation_count").notNull().default(0),
  goalXp: integer("goal_xp").notNull(), // snapshot of user's dailyGoalXp at time of activity
  goalMet: boolean("goal_met").notNull().default(false),
  streakFreezeUsed: boolean("streak_freeze_used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("daily_activity_user_date_unique").on(table.userId, table.activityDate),
  index("daily_activity_user_id_idx").on(table.userId),
  index("daily_activity_user_id_date_idx").on(table.userId, table.activityDate),
]);

// Relations
export const xpEventsRelations = relations(xpEvents, ({ one }) => ({
  user: one(users, { fields: [xpEvents.userId], references: [users.id] }),
}));

export const dailyActivityRelations = relations(dailyActivity, ({ one }) => ({
  user: one(users, { fields: [dailyActivity.userId], references: [users.id] }),
}));

// Types
export type XPEvent = typeof xpEvents.$inferSelect;
export type NewXPEvent = typeof xpEvents.$inferInsert;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type NewDailyActivity = typeof dailyActivity.$inferInsert;
export type XPSource = typeof xpSourceEnum.enumValues[number];
```

### Level Progression Formula
```typescript
// XP required for each level: 100 + (level - 1) * 50
// Level 1: 100 XP, Level 2: 150 XP, Level 3: 200 XP, ..., Level 50: 2550 XP
// Total XP to reach level N: sum from 1 to N-1 of (100 + (i-1)*50)
// = (N-1)*100 + 50*(N-2)*(N-1)/2

export function getXPForLevel(level: number): number {
  // XP needed to go FROM level to level+1
  return 100 + (level - 1) * 50;
}

export function getTotalXPForLevel(level: number): number {
  // Total XP needed to REACH this level (sum of all previous thresholds)
  if (level <= 1) return 0;
  // Sum of arithmetic series: (n/2)(first + last)
  const n = level - 1;
  const first = 100; // XP for level 1->2
  const last = 100 + (level - 2) * 50; // XP for level (level-1)->level
  return (n * (first + last)) / 2;
}

export function calculateLevel(totalXP: number): {
  level: number;
  currentLevelXP: number;  // XP earned within current level
  nextLevelXP: number;     // XP needed for next level
  totalXP: number;
} {
  let level = 1;
  let xpRemaining = totalXP;

  while (level < 50) {
    const needed = getXPForLevel(level);
    if (xpRemaining < needed) break;
    xpRemaining -= needed;
    level++;
  }

  return {
    level: Math.min(level, 50),
    currentLevelXP: level >= 50 ? 0 : xpRemaining,
    nextLevelXP: level >= 50 ? 0 : getXPForLevel(level),
    totalXP,
  };
}
```

### XP Award Integration Points

Three existing API routes need XP award calls:

**1. Lesson completion** — `src/app/api/progress/[lessonId]/route.ts`
```typescript
// After line 146 (existing: lessonComplete = true), add:
if (lessonComplete) {
  // Existing GHL dispatch...
  detectAndDispatchMilestones(user.id, lessonId).catch(/* ... */);
  // NEW: Award XP
  awardXP({ userId: user.id, source: "lesson_complete", amount: 50,
    entityId: lessonId, entityType: "lesson" }).catch(/* ... */);
}
```

**2. Practice set completion** — `src/app/api/practice/[setId]/attempts/route.ts`
```typescript
// After the UPDATE attempt block (when completedAt is set), add:
if (completedAt && score !== undefined) {
  // Award per-exercise XP (variable: 5-10 based on correctCount / totalExercises ratio)
  const exerciseXP = Math.round(5 + (score / 100) * 5) * totalExercises; // 5-10 per ex
  awardXP({ userId: dbUser.id, source: "practice_exercise", amount: exerciseXP,
    entityId: setId, entityType: "practice_set" }).catch(/* ... */);
  // Award perfect bonus
  if (score === 100) {
    awardXP({ userId: dbUser.id, source: "practice_perfect", amount: 25,
      entityId: setId, entityType: "practice_set" }).catch(/* ... */);
  }
}
```

**3. Voice conversation end** — `src/app/api/conversations/[conversationId]/route.ts`
```typescript
// After the endedAt update block (line ~166), add:
if (endedAt === true && durationSeconds >= 30) { // Only award if conversation lasted 30+ seconds
  awardXP({ userId: currentUser.id, source: "voice_conversation", amount: 15,
    entityId: conversationId, entityType: "conversation" }).catch(/* ... */);
}
```

### Daily Goal Met Bonus
```typescript
// Inside awardXP(), after daily_activity upsert:
if (goalJustMet) {
  // Award 10 XP bonus for meeting daily goal
  await db.insert(xpEvents).values({
    userId: params.userId,
    source: "daily_goal_met",
    amount: 10,
    entityId: null,
    entityType: null,
  });
  // Update daily total
  await db.update(dailyActivity)
    .set({ totalXp: sql`${dailyActivity.totalXp} + 10` })
    .where(and(
      eq(dailyActivity.userId, params.userId),
      eq(dailyActivity.activityDate, todayDate),
    ));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| date-fns-tz (v2, separate package) | @date-fns/tz with TZDate class | date-fns v4 (2024) | TZDate is a proper Date subclass; drop-in replacement for Date in all date-fns functions |
| Moment.js timezone | date-fns + @date-fns/tz | 2024+ | Moment is deprecated; date-fns is tree-shakeable and much smaller |
| External activity ring libraries | Custom SVG + framer-motion | Current | stroke-dashoffset technique is ~50 lines; no dependency needed |

**Deprecated/outdated:**
- `date-fns-tz` (the old package): Replaced by `@date-fns/tz` which uses TZDate class instead of functions like `utcToZonedTime` / `zonedTimeToUtc`
- `moment-timezone`: Moment.js is in maintenance mode

## Open Questions

1. **Practice exercise XP calculation precision**
   - What we know: Spec says "5-10 XP per practice exercise." This could mean: (a) flat 5 per exercise, 10 for perfect on that exercise, or (b) scaled 5-10 based on score percentage per exercise.
   - What's unclear: Whether XP is per-exercise or per-set. The spec says "practice exercise (5-10)" which suggests per-exercise.
   - Recommendation: Award per practice set completion, scaled by correctness. Base = 5 * exerciseCount, bonus = up to 5 * exerciseCount for high scores. This keeps the ledger simple (one event per set, not per exercise).

2. **Streak freeze UX**
   - What we know: 2 free freezes per month, used automatically when a day is missed. Positive framing on break.
   - What's unclear: Should freezes be used automatically (system detects missed day and auto-applies), or should user choose to "activate" a freeze before the day ends?
   - Recommendation: Automatic. When checking streak and a gap of 1 day is found, auto-apply freeze if available. This is the simplest UX and matches the "positive framing" design decision — user doesn't stress about manually activating.

3. **Activity ring dimension goals**
   - What we know: Three rings: Learn, Practice, Speak. Daily XP goal is already handled separately (Casual 50, Regular 100, etc.).
   - What's unclear: What constitutes "full" for each ring? The spec doesn't define per-dimension targets.
   - Recommendation: Default ring targets: Learn = 1 lesson, Practice = 5 exercises, Speak = 1 conversation. These are reasonable daily targets for the audience. The rings show activity distribution, complementing (not replacing) the XP goal.

4. **Longest streak persistence**
   - What we know: "preserves longest-streak permanently" per the success criteria.
   - What's unclear: Where to store it — user table column or computed from daily_activity.
   - Recommendation: Add a `longestStreak` integer column to the users table. Update it whenever currentStreak > longestStreak. This is more reliable than recomputing from history (which could be complex with freezes).

## Sources

### Primary (HIGH confidence)
- Context7 `/date-fns/tz` — TZDate constructor, timezone conversion, day boundary handling
- Context7 `/llmstxt/orm_drizzle_team_llms_txt` — Drizzle ORM pgTable, uuid, timestamp, index, relations patterns
- Codebase: `src/db/schema/progress.ts` — Existing schema pattern with composite unique, indexes, relations
- Codebase: `src/lib/progress.ts` — Existing upsert pattern with GREATEST/COALESCE SQL operators
- Codebase: `src/app/api/progress/[lessonId]/route.ts` — Existing lesson completion flow with fire-and-forget GHL dispatch
- Codebase: `src/app/api/practice/[setId]/attempts/route.ts` — Practice attempt create/update flow
- Codebase: `src/app/api/conversations/[conversationId]/route.ts` — Conversation end flow with duration calculation
- Codebase: `src/components/settings/SettingsForm.tsx` — Daily goal tiers, timezone selection already implemented
- Codebase: `src/app/api/user/preferences/route.ts` — PATCH API for dailyGoalXp and timezone already working

### Secondary (MEDIUM confidence)
- DEV Community article on React SVG activity rings (Dec 2025) — SVG technique with stroke-dasharray/dashoffset + framer-motion pathLength
- GitHub: JonasDoesThings/react-activity-rings — API reference for ring component props and rendering approach
- Multiple CodePen examples — SVG circle progress ring implementation pattern

### Tertiary (LOW confidence)
- None. All findings verified against Context7 or codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All core libraries already installed; only @date-fns/tz is new and verified via Context7
- Architecture: HIGH — Event-sourcing pattern with denormalized summary is well-understood; integration points clearly identified in existing code
- Pitfalls: HIGH — Timezone, idempotency, and streak edge cases documented from first-principles analysis of the requirements
- Code examples: HIGH — All patterns derived from existing codebase conventions and verified library documentation

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable domain, no fast-moving dependencies)
