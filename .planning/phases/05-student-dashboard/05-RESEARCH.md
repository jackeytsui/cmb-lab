# Phase 5: Student Dashboard - Research

**Researched:** 2026-01-27
**Domain:** Dashboard UI, Progress Visualization, Responsive Design, Dark Mode Theming
**Confidence:** HIGH

## Summary

Phase 5 implements the student-facing dashboard for course navigation and progress visualization. This builds directly on the progress system from Phase 4 (lesson_progress table, checkLessonUnlock, useProgress hook) and the existing dashboard page structure. The implementation requires:

1. **Course Grid with Progress Bars**: Display enrolled courses in a responsive grid with visual progress indicators. Each course card shows completion percentage calculated from lesson_progress records.

2. **Lesson Navigation with Lock States**: Students navigate to lessons, with locked lessons showing a lock icon and message about which prerequisite to complete. The existing `checkLessonUnlock` function already provides this logic.

3. **Dark Mode Cinematic Aesthetic**: The app already uses `className="dark"` on html element with oklch-based CSS custom properties. Enhance with subtle gradient accents and refined visual hierarchy.

4. **Mobile Responsive Design**: Use Tailwind CSS 4 responsive prefixes (`md:`, `lg:`) for grid layouts, with shadcn/ui Sheet for mobile navigation drawer (already installed).

**Primary recommendation:** Extend the existing dashboard page with Progress component from shadcn/ui, add course detail pages with module/lesson navigation, use Lucide icons for lock/unlock states, and apply cinematic styling through gradient accents and refined color tokens.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui Progress | Latest | Progress bar component | Built on Radix UI, dark mode ready, matches existing components |
| shadcn/ui Card | Latest | Course/module cards | Already using card patterns, includes CardHeader/CardContent/CardFooter |
| shadcn/ui Skeleton | Latest | Loading states | Matches component library, simple pulse animation |
| Lucide React | ^0.563.0 | Icons (Lock, LockOpen, Play) | Already in package.json, tree-shakeable |
| Tailwind CSS 4 | ^4 | Responsive grid, dark mode | Already configured with oklch colors |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Sheet | Already installed | Mobile navigation drawer | Hamburger menu on mobile |
| Framer Motion | ^12.29.2 | Page transitions, hover effects | Already in project, optional enhancement |
| Next.js loading.js | Built-in | Route-level loading states | Streaming skeleton while data loads |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui Progress | Custom CSS progress bar | shadcn matches existing UI, accessible, easier |
| Lucide icons | Heroicons | Lucide already installed, same quality |
| CSS grid | Flexbox grid | CSS grid better for 2D layouts, equal-height cards |

**Installation:**
```bash
# Add new shadcn components
npx shadcn@latest add progress
npx shadcn@latest add card
npx shadcn@latest add skeleton

# No new npm packages needed - all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   ├── page.tsx           # Course grid (enhance existing)
│   │   │   └── loading.tsx        # Skeleton grid
│   │   └── courses/
│   │       └── [courseId]/
│   │           ├── page.tsx       # Module list with progress
│   │           ├── loading.tsx    # Module skeleton
│   │           └── lessons/
│   │               └── [lessonId]/
│   │                   └── page.tsx  # Lesson player (existing video player)
├── components/
│   ├── ui/
│   │   ├── progress.tsx           # shadcn Progress
│   │   ├── card.tsx               # shadcn Card
│   │   └── skeleton.tsx           # shadcn Skeleton
│   └── dashboard/
│       ├── CourseCard.tsx         # Course with progress bar
│       ├── CourseGrid.tsx         # Responsive grid layout
│       ├── ModuleAccordion.tsx    # Expandable module with lessons
│       ├── LessonItem.tsx         # Lesson row with lock state
│       └── ProgressRing.tsx       # Circular progress (optional)
├── lib/
│   └── progress.ts                # Already has CompletionStatus type
└── hooks/
    └── useProgress.ts             # Already implemented
```

### Pattern 1: Course Card with Progress Bar
**What:** Card component showing course thumbnail, title, and progress bar
**When to use:** Dashboard course grid
**Example:**
```typescript
// Source: shadcn/ui Progress + existing CourseCard pattern
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

interface CourseCardProps {
  course: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    totalLessons: number;
    completedLessons: number;
  };
}

export function CourseCard({ course }: CourseCardProps) {
  const progressPercent = course.totalLessons > 0
    ? Math.round((course.completedLessons / course.totalLessons) * 100)
    : 0;

  return (
    <Link href={`/courses/${course.id}`}>
      <Card className="overflow-hidden hover:bg-accent/50 transition-colors group">
        {/* Thumbnail with aspect ratio */}
        <div className="aspect-video bg-muted relative overflow-hidden">
          {course.thumbnailUrl ? (
            <img
              src={course.thumbnailUrl}
              alt={course.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <PlayCircle className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
        </div>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg line-clamp-2">{course.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Progress value={progressPercent} className="flex-1" />
            <span className="text-sm text-muted-foreground tabular-nums">
              {progressPercent}%
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

### Pattern 2: Lesson Item with Lock State
**What:** Row component showing lesson with lock/unlock visual state
**When to use:** Course detail page lesson list
**Example:**
```typescript
// Source: Lucide icons + checkLessonUnlock pattern
import { Lock, LockOpen, Play, CheckCircle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LessonItemProps {
  lesson: {
    id: string;
    title: string;
    durationSeconds: number | null;
  };
  isUnlocked: boolean;
  isCompleted: boolean;
  previousLessonTitle?: string;
}

export function LessonItem({
  lesson,
  isUnlocked,
  isCompleted,
  previousLessonTitle,
}: LessonItemProps) {
  const Wrapper = isUnlocked ? Link : "div";
  const wrapperProps = isUnlocked
    ? { href: `/courses/${courseId}/lessons/${lesson.id}` }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg transition-colors",
        isUnlocked
          ? "hover:bg-accent/50 cursor-pointer"
          : "opacity-60 cursor-not-allowed"
      )}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0">
        {isCompleted ? (
          <CheckCircle className="w-6 h-6 text-green-500" />
        ) : isUnlocked ? (
          <Play className="w-6 h-6 text-primary" />
        ) : (
          <Lock className="w-6 h-6 text-muted-foreground" />
        )}
      </div>

      {/* Lesson Info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium truncate",
          !isUnlocked && "text-muted-foreground"
        )}>
          {lesson.title}
        </p>
        {!isUnlocked && previousLessonTitle && (
          <p className="text-sm text-muted-foreground">
            Complete "{previousLessonTitle}" first
          </p>
        )}
      </div>

      {/* Duration */}
      {lesson.durationSeconds && (
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatDuration(lesson.durationSeconds)}
        </span>
      )}
    </Wrapper>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
```

### Pattern 3: Responsive Course Grid
**What:** CSS Grid layout that adapts from 1 to 3 columns
**When to use:** Dashboard course list
**Example:**
```typescript
// Source: Tailwind CSS 4 grid classes
export function CourseGrid({ courses }: { courses: Course[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  );
}
```

### Pattern 4: Loading Skeleton for Course Grid
**What:** loading.tsx file with skeleton placeholders
**When to use:** While dashboard data loads
**Example:**
```typescript
// Source: shadcn/ui Skeleton + Next.js loading.js pattern
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header skeleton */}
      <div className="mb-8">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-5 w-48" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="aspect-video" />
            <CardHeader className="pb-2">
              <Skeleton className="h-6 w-3/4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

### Pattern 5: Progress Calculation Query
**What:** Database query to get course progress summary
**When to use:** Dashboard data fetching
**Example:**
```typescript
// Source: Drizzle ORM relations + existing schema
import { db } from "@/db";
import { courses, modules, lessons, lessonProgress } from "@/db/schema";
import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";

interface CourseWithProgress {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  totalLessons: number;
  completedLessons: number;
}

export async function getCoursesWithProgress(
  userId: string
): Promise<CourseWithProgress[]> {
  // Query courses with lesson counts and completion counts
  const result = await db
    .select({
      id: courses.id,
      title: courses.title,
      thumbnailUrl: courses.thumbnailUrl,
      // Subquery for total lessons
      totalLessons: sql<number>`(
        SELECT COUNT(*)
        FROM lessons l
        INNER JOIN modules m ON l.module_id = m.id
        WHERE m.course_id = courses.id
        AND l.deleted_at IS NULL
        AND m.deleted_at IS NULL
      )`,
      // Subquery for completed lessons
      completedLessons: sql<number>`(
        SELECT COUNT(*)
        FROM lesson_progress lp
        INNER JOIN lessons l ON lp.lesson_id = l.id
        INNER JOIN modules m ON l.module_id = m.id
        WHERE m.course_id = courses.id
        AND lp.user_id = ${userId}
        AND lp.completed_at IS NOT NULL
        AND l.deleted_at IS NULL
        AND m.deleted_at IS NULL
      )`,
    })
    .from(courses)
    .where(isNull(courses.deletedAt));

  return result;
}
```

### Anti-Patterns to Avoid
- **N+1 queries for progress**: Don't fetch each lesson's progress individually; use subqueries or joins
- **Client-side progress calculation**: Calculate on server, send ready-to-display data
- **Forgetting loading states**: Always add loading.tsx for data-fetching routes
- **Hardcoded breakpoints**: Use Tailwind responsive prefixes, not custom media queries
- **Inconsistent lock UI**: Always show why locked (previous lesson title), not just a lock icon

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Progress bar | Custom div with width | shadcn/ui Progress | Accessible, animated, styled |
| Skeleton loading | Custom CSS pulse | shadcn/ui Skeleton | Matches design system |
| Lock/unlock icons | Custom SVG | Lucide Lock/LockOpen | Consistent icon set |
| Mobile drawer | Custom modal | shadcn/ui Sheet | Handles animation, focus trap |
| Responsive grid | Flexbox with calc | Tailwind CSS grid classes | Simpler, responsive by default |
| Dark mode | Manual class toggle | Already configured in layout.tsx | Uses oklch colors, system ready |

**Key insight:** The existing codebase already has the hard parts (progress tracking, unlock logic, dark mode, Sheet component). This phase is about composing existing patterns into a cohesive dashboard UI.

## Common Pitfalls

### Pitfall 1: Progress Bar Not Updating After Lesson Completion
**What goes wrong:** User completes lesson, returns to dashboard, sees old progress
**Why it happens:** Server Components cache data; no revalidation triggered
**How to avoid:** Use `revalidatePath("/dashboard")` after progress update in API route; or use `revalidateTag("progress")`
**Warning signs:** Users refreshing page to see updated progress

### Pitfall 2: Layout Shift When Data Loads
**What goes wrong:** Page jumps when courses load, poor CLS score
**Why it happens:** Skeleton dimensions don't match actual content
**How to avoid:** Match skeleton dimensions exactly (same aspect-video for thumbnails, same card padding)
**Warning signs:** Visible content jumping, lighthouse warnings

### Pitfall 3: Lock State Stale After Completing Previous Lesson
**What goes wrong:** Lesson stays locked even though prerequisite just completed
**Why it happens:** Course page not revalidated after lesson completion
**How to avoid:** Revalidate course page path when lesson completes; consider router.refresh() on client
**Warning signs:** User has to manually refresh to unlock next lesson

### Pitfall 4: Mobile Grid Too Cramped
**What goes wrong:** Course cards look squeezed on mobile
**Why it happens:** Fixed padding/margins not responsive
**How to avoid:** Use responsive padding (`px-4 md:px-6 lg:px-8`), single column on mobile
**Warning signs:** Text truncating aggressively, touch targets too small

### Pitfall 5: Dark Mode Colors Not Cinematic
**What goes wrong:** Dashboard looks flat, not "cinematic"
**Why it happens:** Using default oklch without accents
**How to avoid:** Add subtle gradient overlays, use accent color for progress bars, add subtle shadows/glows
**Warning signs:** Looks like generic dark theme, not premium/cinematic

### Pitfall 6: Forgetting Course Access Check
**What goes wrong:** User can view course page for courses they don't have access to
**Why it happens:** Only dashboard checks access, course detail page doesn't
**How to avoid:** Add access check in course detail page (same pattern as dashboard query)
**Warning signs:** 403 errors or data leaks

## Code Examples

Verified patterns from official sources:

### shadcn/ui Progress Component
```typescript
// Source: https://ui.shadcn.com/docs/components/progress
import { Progress } from "@/components/ui/progress"

// Basic usage
<Progress value={33} />

// With custom styling for cinematic effect
<Progress
  value={75}
  className="h-2 bg-muted"
  // Target indicator child for custom color
  style={{ "--progress-indicator": "var(--chart-1)" } as React.CSSProperties}
/>
```

### Next.js loading.tsx with Suspense
```typescript
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/loading
// app/(dashboard)/dashboard/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  // Automatically wrapped in Suspense by Next.js
  return (
    <div className="animate-in fade-in duration-500">
      {/* Skeleton content */}
    </div>
  );
}
```

### Responsive Grid with Tailwind CSS 4
```typescript
// Source: Tailwind CSS docs - grid system
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
  {/* Mobile: 1 column, Tablet: 2 columns, Desktop: 3-4 columns */}
  {/* Gap increases on larger screens */}
</div>
```

### Mobile Navigation with Sheet
```typescript
// Source: Existing Sheet component in project
"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        {/* Navigation links */}
      </SheetContent>
    </Sheet>
  );
}
```

### Cinematic Dark Mode Styling
```css
/* Source: Tailwind CSS 4 oklch theming + design trends */
/* Enhance existing dark theme with cinematic accents */

.dark {
  /* Subtle gradient overlay for depth */
  --cinematic-gradient: linear-gradient(
    180deg,
    oklch(0.18 0.01 264) 0%,
    oklch(0.12 0.02 264) 100%
  );

  /* Glow effect for interactive elements */
  --glow-primary: 0 0 20px oklch(0.5 0.2 264 / 30%);
}

/* Apply to cards for cinematic feel */
.cinematic-card {
  background: var(--card);
  box-shadow:
    0 4px 6px -1px oklch(0 0 0 / 20%),
    0 2px 4px -2px oklch(0 0 0 / 10%);
}

.cinematic-card:hover {
  box-shadow:
    0 10px 15px -3px oklch(0 0 0 / 30%),
    0 4px 6px -4px oklch(0 0 0 / 20%);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| getServerSideProps | Server Components with loading.tsx | Next.js 13+ App Router | Streaming, better UX |
| CSS-in-JS for dark mode | CSS custom properties with oklch | Tailwind CSS 4 | Simpler, better performance |
| Fixed breakpoints | Container queries + responsive prefixes | Tailwind CSS 4 | More flexible responsive |
| Custom progress components | shadcn/ui Progress with Radix | shadcn/ui evolution | Accessible, consistent |
| Manual lock state checks | Existing checkLessonUnlock function | Phase 4 | Reuse existing logic |

**Deprecated/outdated:**
- `getStaticProps` for user-specific data: Use Server Components
- `next-themes` for dark mode: Not needed when using class="dark" directly
- Custom CSS grid with calc(): Use Tailwind grid-cols-* classes

## Open Questions

Things that couldn't be fully resolved:

1. **Progress Bar Color Customization**
   - What we know: shadcn Progress uses accent color by default
   - What's unclear: Best way to make indicator color more "cinematic" (gradient, glow)
   - Recommendation: Use `[&>*]:bg-gradient-to-r` to target indicator, or CSS custom property

2. **Course Detail Page Layout**
   - What we know: Need modules with lessons, progress for each
   - What's unclear: Accordion vs. flat list for modules
   - Recommendation: Start with flat list per module, consider Accordion if many modules

3. **Navigation Header on Mobile**
   - What we know: Sheet component for drawer, hamburger menu pattern
   - What's unclear: Should header be sticky? Should it hide on scroll?
   - Recommendation: Sticky header with hamburger, simple implementation first

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Progress](https://ui.shadcn.com/docs/components/progress) - Component API and usage
- [shadcn/ui Card](https://ui.shadcn.com/docs/components/card) - Card subcomponents
- [shadcn/ui Skeleton](https://ui.shadcn.com/docs/components/skeleton) - Loading state patterns
- [Next.js loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading) - Route-level loading
- [Tailwind CSS Grid](https://tailwindcss.com/docs/grid-template-columns) - Responsive grid
- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode) - Dark mode configuration
- [Lucide Icons](https://lucide.dev/icons/) - Lock, LockOpen, Play icons

### Secondary (MEDIUM confidence)
- [LMS Dashboard Best Practices](https://www.educate-me.co/blog/lms-dashboard) - Progress visualization patterns
- [LearnDash Course Grid](https://learndash.com/support/kb/core/courses/course-grid/) - Course grid layout patterns
- [Tailwind CSS 4 OKLCH Theming](https://medium.com/@sir.raminyavari/theming-in-tailwind-css-v4-support-multiple-color-schemes-and-dark-mode-ba97aead5c14) - oklch color theming
- [Building Dashboard with Next.js 16](https://dev.to/fytroy/building-a-luxury-analytics-dashboard-with-nextjs-16-tailwind-v4-155h) - Dashboard patterns

### Tertiary (LOW confidence)
- [Cinematic Dark UI Trends 2026](https://reallygooddesigns.com/graphic-design-trends-2026/) - Design direction, conceptual
- [CSS Glow Effects](https://uicookies.com/css-glow-effects/) - Glow effect inspiration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components already in project or standard shadcn/ui
- Architecture patterns: HIGH - Extends existing dashboard, uses proven patterns
- Progress visualization: HIGH - shadcn/ui Progress documented, straightforward
- Responsive design: HIGH - Tailwind CSS 4 grid well-documented
- Cinematic styling: MEDIUM - Design direction clear, specific implementation TBD
- Lock state UI: HIGH - Uses existing checkLessonUnlock, standard icon patterns

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (30 days - stable technologies, UI patterns)
