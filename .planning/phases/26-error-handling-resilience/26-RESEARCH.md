# Phase 26: Error Handling & Resilience - Research

**Researched:** 2026-02-06
**Domain:** React 19 / Next.js 16 error handling patterns, component-level error states
**Confidence:** HIGH

## Summary

Phase 26 must establish shared error handling patterns and fix missing error states across the entire LMS. Research involved auditing all 48+ API-consuming client components, 37 page routes, and all forms to catalog the current state of error handling.

The codebase has a mixed landscape: some components (BUG-04, BUG-05 fixes, coach forms, voice conversation) already have good error handling, while others (analytics dashboard, search bar, student list, knowledge base search) silently swallow errors. There are zero `error.tsx` files in the entire App Router tree, meaning uncaught server component errors show the default Next.js error page with no recovery option. There is also no `global-error.tsx`.

**Primary recommendation:** Create a shared error UI component library (`ErrorAlert`, `RetryButton`, `InlineError`) and a Next.js `error.tsx` boundary at key route segments, then systematically apply them to the ~15-20 components with missing or inadequate error states identified in this audit.

## Standard Stack

### Core (Already Installed - No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.2.3 | Error Boundary class components | Only class components can catch render errors |
| Next.js 16 | 16.1.4 | `error.tsx` file convention for route-level error boundaries | Built-in, zero config |
| react-hook-form | 7.71.1 | Form validation with `formState.errors` | Already used in all admin/interaction forms |
| zod | 4.3.6 | Schema validation for form inputs | Already used with `@hookform/resolvers` |
| lucide-react | 0.563.0 | Icons for error states (AlertCircle, RefreshCw, etc.) | Already used throughout app |

### Supporting (Already Available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| framer-motion | 12.29.2 | Animated error state transitions | Already used in VoiceConversation, TextInteraction |
| @radix-ui/* | various | Accessible UI primitives | Already used for dialogs, popovers |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom error UI components | sonner/react-hot-toast | Toast library adds dependency; inline error messages are better for forms and persistent errors. Toasts suit ephemeral success messages but the app currently has none. NOT recommended for Phase 26 (scope creep). |
| Custom ErrorBoundary class | react-error-boundary package | Package adds ~2KB, provides `useErrorBoundary` hook. However, Next.js `error.tsx` convention already wraps routes. Custom class only needed if wrapping individual client components. Simple enough to hand-roll. |
| Per-component error states | Global error context/provider | Over-engineering for this use case; component-local error state is simpler and already the established pattern |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/
│   ├── ui/
│   │   ├── error-alert.tsx       # NEW: Shared error display component
│   │   └── retry-button.tsx      # NEW: Shared retry button component
│   └── error-boundary.tsx        # NEW: Reusable React Error Boundary wrapper
├── app/
│   ├── error.tsx                 # NEW: Root-level error boundary
│   ├── global-error.tsx          # NEW: Catches root layout errors
│   └── (dashboard)/
│       ├── error.tsx             # NEW: Dashboard-level error boundary
│       └── admin/
│           └── error.tsx         # NEW: Admin section error boundary
```

### Pattern 1: Next.js error.tsx File Convention (Route-Level)
**What:** Place `error.tsx` files at route segment boundaries to catch uncaught exceptions in server and client components within that segment.
**When to use:** Every major route segment should have one. At minimum: root, `(dashboard)`, and `admin`.
**Example:**
```typescript
// Source: Context7 /vercel/next.js v16.1.5 error-handling docs
'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
        <p className="text-zinc-400 text-sm mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  )
}
```

### Pattern 2: Shared Error Alert Component (Component-Level)
**What:** A reusable inline error display component that all API-consuming components use.
**When to use:** Any component that catches a fetch error and needs to show it to the user.
**Example:**
```typescript
// src/components/ui/error-alert.tsx
interface ErrorAlertProps {
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorAlert({ message, onRetry, className }: ErrorAlertProps) {
  return (
    <div className={`rounded-md bg-red-500/10 border border-red-500/30 p-4 ${className || ''}`}>
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}
```

### Pattern 3: Form Error Handling (Already Established)
**What:** Forms use local `error` state + inline error div. React Hook Form + Zod handles field-level validation.
**When to use:** All forms already follow this pattern. Phase 26 should ensure consistency.
**Example (existing pattern from CourseForm, CoachFeedbackForm, etc.):**
```typescript
const [error, setError] = useState<string | null>(null);

// In submit handler:
try {
  const response = await fetch(url, { method, body: JSON.stringify(data) });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error || "Failed to save");
  }
  onSuccess();
} catch (err) {
  setError(err instanceof Error ? err.message : "Failed to save");
}

// In JSX:
{error && (
  <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
    {error}
  </div>
)}
```

### Pattern 4: Server Component Error Handling (For Server Pages)
**What:** Server components that query the database should use try/catch and render inline error UI rather than letting errors bubble to the error boundary.
**When to use:** Server component pages that do DB queries (dashboard, course detail, lesson player, my-feedback, etc.)
**Note:** These pages currently have NO try/catch on their DB queries. If Neon is down, they throw and show the default error page.
**Example:**
```typescript
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  try {
    const courses = await db.select()...;
    return <CourseGrid courses={courses} />;
  } catch (error) {
    console.error("Dashboard query failed:", error);
    return (
      <ErrorState
        message="Unable to load your courses. Please try refreshing the page."
      />
    );
  }
}
```

### Anti-Patterns to Avoid

- **Silent catch blocks:** `catch (error) { console.error(error); }` with no user-visible feedback. Found in ~8 components (AnalyticsDashboard, StudentList, SearchBar, useNotifications, etc.).
- **Empty state masquerading as error:** Setting `results = []` on error makes it look like "no results found" instead of "search failed". Found in SearchBar and SearchPageClient.
- **console.error-only error handling:** Error is logged but user sees nothing. Found in several hooks and components.
- **Generic "Something went wrong":** Should provide specific, actionable messages. ChatPanel error says "Something went wrong." which should say what failed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Route-level error catching | Custom React ErrorBoundary for pages | Next.js `error.tsx` convention | Automatic, works with server components, provides `reset()` for recovery |
| Global error catching | Manual try/catch in root layout | Next.js `global-error.tsx` | Catches errors in root layout itself |
| Form field validation | Custom validation logic | react-hook-form + zod (already in use) | Already established pattern, used in 8+ forms |
| Error logging | Custom logging | console.error (current approach is adequate for now) | Production error service is out of v3.1 scope |

**Key insight:** Phase 26 should create ~3 shared UI components, ~3-4 error.tsx files, and then do a systematic pass through components applying the patterns. No new libraries needed.

## Common Pitfalls

### Pitfall 1: Confusing Empty State with Error State
**What goes wrong:** Component shows "No items" when the API actually failed. User thinks there's nothing there when actually the system is broken.
**Why it happens:** Catch block sets data to `[]` without setting an error flag. The empty state check (`items.length === 0`) triggers.
**How to avoid:** Always track error state separately: `const [error, setError] = useState(false)`. Render error state BEFORE empty state check.
**Warning signs:** Component shows empty state but console has "Failed to fetch" errors.
**Found in:** AnalyticsDashboard (silently uses default values on API failure), SearchBar (sets results to empty), StudentList (only console.error on fetch failure), SearchPageClient (sets results to empty array on error).

### Pitfall 2: Server Components Without Try/Catch
**What goes wrong:** Server component pages throw unhandled exceptions when the database is unreachable, showing Next.js default error page with no retry option.
**Why it happens:** Server components query the database directly but don't wrap in try/catch. Works fine when DB is up; breaks ugly when it's down.
**How to avoid:** Wrap DB queries in try/catch and render a styled error component, OR rely on `error.tsx` at the route segment level (but those don't exist yet).
**Warning signs:** No `error.tsx` files exist anywhere in the app.
**Found in:** All server component pages (dashboard, course detail, lesson player, my-feedback, coach submissions detail, admin pages).

### Pitfall 3: No Retry Mechanism
**What goes wrong:** Error state is shown but user has no way to recover without manually refreshing the page.
**Why it happens:** Component shows error text but no button to re-fetch.
**How to avoid:** Every error state should have either a retry button (for client-side fetches) or a "refresh the page" message (for server-rendered errors).
**Warning signs:** Error UI without any action button.
**Found in:** MyConversationsPage (retry = `window.location.reload()`), SubmissionQueue (error shown but no retry button).

### Pitfall 4: Optimistic Updates Without Rollback Feedback
**What goes wrong:** User performs an action, optimistic update shows it succeeded, but the API call fails silently. The rollback happens but user doesn't know something went wrong.
**Why it happens:** Optimistic update + catch block that only rolls back state without showing error.
**How to avoid:** Always show error state after rollback. CoachNotesPanel already does this well (has both rollback AND error message).
**Warning signs:** State reverts without explanation.
**Found in:** useLanguagePreference has rollback + error state (good). CoachNotesPanel has rollback + error (good). These are already handled.

## Comprehensive Component Audit

### Components WITH Good Error Handling (Leave As-Is)

| Component | Error Pattern | Retry | Notes |
|-----------|--------------|-------|-------|
| `CertificateDownloadButton` | Inline error text below button | Implicit (click again) | Fixed in BUG-04 |
| `NotificationPanel` | Full error state with "Try again" link | Yes | Fixed in BUG-05 |
| `CoachFeedbackForm` | Inline error div + field validation | Clear on re-submit | Good pattern |
| `CoachNotesPanel` | Error div + optimistic rollback | Error clears on retry | Good pattern |
| `SubmissionQueue` | Error div rendered above content | No (missing) | Has error state but no retry button |
| `TextInteraction` | Error in feedback display area | "Try Again" button | Good pattern |
| `AudioInteraction` | Error in feedback display + contextual messages | "Try Again" button | Good, includes 502/504 messages |
| `VoiceConversation` | Full error state with icon + retry button | Yes | Excellent pattern to copy |
| `ChatPanel` | Error banner with "Try again" link | Yes (re-sends last message) | Good |
| `StudentAccessManager` | Inline error div | Clears on next action | Good |
| `CourseForm` | Inline error + field validation | Clear on re-submit | Good |
| `LessonForm` | Inline error + field validation | Clear on re-submit | Good |
| `ModuleForm` | Inline error + field validation | Clear on re-submit | Good (assumed, same pattern) |
| `InteractionForm` | Inline error + field validation | Clear on re-submit | Good |
| `PromptForm` | Inline error + field validation | Clear on re-submit | Good (assumed) |
| `KbEntryForm` | Inline error | Clear on re-submit | Good (assumed) |
| `MyConversationsPage` | Error text + "Try again" link | Yes (page reload) | Functional but reload is not ideal |
| `LanguagePreferenceSelector` | Error text below select | Clears on next change | Good |
| `NotificationPreferences` | Has error handling in fetch | No visible error UI | Needs check |

### Components WITH MISSING or INADEQUATE Error Handling (Fix These)

| Component | File | Issue | Severity | Fix |
|-----------|------|-------|----------|-----|
| `AnalyticsDashboard` | `src/app/(dashboard)/admin/analytics/AnalyticsDashboard.tsx` | Silently ignores failed API calls - uses `if (res.ok)` but no error state on failure | HIGH | Add error state, show error UI per section or globally |
| `SearchBar` | `src/components/search/SearchBar.tsx` | Catch block sets `results=[]` and `isOpen=false` - search failure looks like "no results" | MEDIUM | Show inline error message in search results area |
| `StudentList` (admin) | `src/components/admin/StudentList.tsx` | Catch block only console.errors - user sees nothing on fetch failure | HIGH | Add error state and error UI with retry |
| `AILogList` | `src/components/admin/AILogList.tsx` | Needs audit - likely similar to StudentList pattern | MEDIUM | Add error state |
| `ContentList` | `src/components/admin/ContentList.tsx` | Needs audit - admin listing component | MEDIUM | Add error state |
| `SearchPageClient` (KB) | `src/app/(dashboard)/admin/knowledge/search/SearchPageClient.tsx` | Error catch sets `results=[]` - search failure looks like "no results for X" | MEDIUM | Show error message instead of "no results" |
| `SubmissionQueue` | `src/components/coach/SubmissionQueue.tsx` | Has error state display but NO retry button | LOW | Add retry button |
| `ConversationCard` | `src/app/(dashboard)/my-conversations/page.tsx` | Transcript load failure is silently caught | LOW | Show "Failed to load transcript" message |
| `FieldMappingTable` | `src/app/(dashboard)/admin/ghl/components/FieldMappingTable.tsx` | Needs audit | LOW | Add error state if missing |
| `SyncEventLog` | `src/app/(dashboard)/admin/ghl/components/SyncEventLog.tsx` | Needs audit | LOW | Add error state if missing |
| `ConnectionStatus` | `src/app/(dashboard)/admin/ghl/components/ConnectionStatus.tsx` | Needs audit | LOW | Add error state if missing |
| `TagManager` | `src/components/tags/TagManager.tsx` | Needs audit | MEDIUM | Add error state if missing |
| `AutoTagRuleEditor` | `src/components/tags/AutoTagRuleEditor.tsx` | Needs audit | LOW | Add error state if missing |
| `GhlProfileSection` | `src/components/ghl/GhlProfileSection.tsx` | Needs audit | LOW | Add error state if missing |
| `StudentListWithTags` | `src/app/(dashboard)/coach/students/StudentListWithTags.tsx` | Needs audit | MEDIUM | Add error state if missing |
| `StudentTagsSection` | `src/app/(dashboard)/admin/students/[studentId]/StudentTagsSection.tsx` | Needs audit | LOW | Add error state if missing |
| `BatchAssignModal` | `src/components/admin/BatchAssignModal.tsx` | Needs audit | LOW | Add error state if missing |
| `BatchEditModal` | `src/components/admin/BatchEditModal.tsx` | Needs audit | LOW | Add error state if missing |
| `MoveContentModal` | `src/components/admin/MoveContentModal.tsx` | Needs audit | LOW | Add error state if missing |
| `VideoLibrary` | `src/components/admin/VideoLibrary.tsx` | Needs audit | MEDIUM | Add error state if missing |
| `KbFileUpload` | `src/components/admin/KbFileUpload.tsx` | Needs audit | LOW | Add error state if missing |
| `VersionHistory` | `src/components/admin/VersionHistory.tsx` | Needs audit | LOW | Add error state if missing |
| `FilterPresetManager` | `src/components/admin/FilterPresetManager.tsx` | Needs audit | LOW | Add error state if missing |

### Server Component Pages (No Error Boundaries)

| Page | File | Issue |
|------|------|-------|
| Dashboard | `src/app/(dashboard)/dashboard/page.tsx` | No try/catch on DB queries; no error.tsx in route |
| Course Detail | `src/app/(dashboard)/courses/[courseId]/page.tsx` | No try/catch on DB queries |
| Lesson Player | `src/app/(dashboard)/lessons/[lessonId]/page.tsx` | No try/catch on DB queries |
| My Feedback | `src/app/(dashboard)/my-feedback/page.tsx` | Has try/catch but returns `[]` on error (silent failure to empty state) |
| Coach Submissions | `src/app/(dashboard)/coach/submissions/[submissionId]/page.tsx` | Has try/catch but returns null (triggers `notFound()`) |
| Admin Courses | `src/app/(dashboard)/admin/courses/page.tsx` | Needs audit |
| Admin Students | `src/app/(dashboard)/admin/students/page.tsx` | Needs audit |
| Coach Page | `src/app/(dashboard)/coach/page.tsx` | Needs audit |
| All other admin pages | Various | Need audit for DB query error handling |

### Hooks With Silent Error Handling

| Hook | File | Issue |
|------|------|-------|
| `useNotifications` | `src/hooks/useNotifications.ts` | Silent catch (intentional - non-critical polling). OK to leave. |
| `useProgress` | `src/hooks/useProgress.ts` | Has error state in hook but video progress update failures only console.error. OK - progress is best-effort. |
| `useLanguagePreference` | `src/hooks/useLanguagePreference.ts` | Has proper error state with rollback. Good. |
| `useUploadQueue` | `src/hooks/useUploadQueue.ts` | Needs audit. |

## Code Examples

### Shared ErrorAlert Component
```typescript
// src/components/ui/error-alert.tsx
'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'

interface ErrorAlertProps {
  message: string
  onRetry?: () => void
  className?: string
  variant?: 'inline' | 'block'
}

export function ErrorAlert({
  message,
  onRetry,
  className = '',
  variant = 'inline',
}: ErrorAlertProps) {
  if (variant === 'block') {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm text-red-400 mb-3">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`rounded-md bg-red-500/10 border border-red-500/30 p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-red-400">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

### Route-Level error.tsx
```typescript
// src/app/(dashboard)/error.tsx
'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Something went wrong
        </h2>
        <p className="text-zinc-400 text-sm mb-6">
          We encountered an unexpected error. This has been logged and we'll look into it.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
```

### Fixing Silent Catch Anti-Pattern (AnalyticsDashboard Example)
```typescript
// Before (silent failure):
try {
  const [overviewRes, completionRes] = await Promise.all([...]);
  if (overviewRes.ok) setOverview(await overviewRes.json());
  if (completionRes.ok) setCompletion(await completionRes.json());
} catch (error) {
  console.error("Error fetching analytics:", error);
}

// After (visible error state):
const [error, setError] = useState<string | null>(null);

try {
  setError(null);
  const [overviewRes, completionRes] = await Promise.all([...]);

  const failedEndpoints: string[] = [];
  if (overviewRes.ok) setOverview(await overviewRes.json());
  else failedEndpoints.push('overview');
  if (completionRes.ok) setCompletion(await completionRes.json());
  else failedEndpoints.push('completion');

  if (failedEndpoints.length > 0) {
    setError(`Failed to load: ${failedEndpoints.join(', ')}. Some data may be incomplete.`);
  }
} catch (error) {
  console.error("Error fetching analytics:", error);
  setError("Failed to load analytics data. Please try again.");
}

// In JSX:
{error && <ErrorAlert message={error} onRetry={() => fetchData(dateRange)} />}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Class-based ErrorBoundary only | Next.js `error.tsx` + class ErrorBoundary | Next.js 13+ (App Router) | Route-level error handling is declarative via file convention |
| `getServerSideProps` try/catch | Server Component inline error handling | Next.js 13+ (App Router) | Server components handle their own errors or bubble to error.tsx |
| Client-only error handling | Server + Client error handling needed | React 19 / Next.js 16 | Must handle errors in both server and client components |

**Deprecated/outdated:**
- `pages/` directory `_error.tsx` pattern: Replaced by App Router `error.tsx` and `global-error.tsx`
- `getStaticProps`/`getServerSideProps` error handling: Not applicable in App Router

## Open Questions

1. **How granular should error.tsx files be?**
   - What we know: Next.js supports error.tsx at any route segment level. Errors bubble up to nearest parent error.tsx.
   - What's unclear: Whether to place error.tsx at every route or just at key boundaries.
   - Recommendation: Start with 3 error.tsx files: root `app/error.tsx`, `app/(dashboard)/error.tsx`, and `app/global-error.tsx`. This covers all routes with recovery. If specific pages need custom error UI, those can be added in Phases 27-29.

2. **Should server components use inline try/catch or rely on error.tsx?**
   - What we know: Both approaches work. Inline try/catch gives more control over error messages; error.tsx is automatic but generic.
   - Recommendation: For Phase 26, add error.tsx boundaries as the safety net. Leave inline try/catch improvements in server component pages to Phases 27-29 where each page gets individual UX attention. This prevents duplicating work between Phase 26 and Phases 27-29.

3. **How to handle the ~15 "Needs audit" components?**
   - What we know: These are mostly admin/coach components that may or may not have error handling.
   - Recommendation: The Wave 1 audit plan should read each one and catalog its state. Only fix the HIGH/MEDIUM severity ones in Phase 26; leave LOW severity ones for Phases 27-29 per-role polish.

## Task Breakdown Recommendation

### Wave 1: Audit + Shared Infrastructure
- Create shared `ErrorAlert` component (inline + block variants)
- Create `error.tsx` at root, `(dashboard)`, and `global-error.tsx`
- Complete the "Needs audit" components in the table above
- Produce a final catalog document for Phases 27-29

### Wave 2: Apply Fixes to HIGH/MEDIUM Components
- Fix AnalyticsDashboard (silent failure -> visible error)
- Fix SearchBar (empty results on error -> error message)
- Fix StudentList admin (console-only -> visible error + retry)
- Fix SearchPageClient KB (empty results on error -> error message)
- Fix SubmissionQueue (add retry button to existing error state)
- Fix ConversationCard (transcript load failure -> visible message)
- Fix any HIGH/MEDIUM components found in Wave 1 audit
- Fix my-feedback page (returns [] on error -> should show error state)

## Sources

### Primary (HIGH confidence)
- Context7 `/vercel/next.js/v16.1.5` - error.tsx file convention, error handling patterns, global-error.tsx
- Context7 `/websites/react_dev` - React 19 ErrorBoundary class component, createRoot error callbacks
- Direct codebase audit of all 48+ client components and 37 page routes in `src/`

### Secondary (MEDIUM confidence)
- Existing patterns from BUG-04 (CertificateDownloadButton) and BUG-05 (NotificationPanel) as reference implementations

### Tertiary (LOW confidence)
- None. All findings are from direct codebase inspection and official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already installed, no new dependencies needed
- Architecture: HIGH - Patterns verified against Next.js 16 and React 19 official docs via Context7
- Pitfalls: HIGH - All identified from direct codebase audit, every finding cites a specific file
- Component audit: HIGH for audited components, MEDIUM for "Needs audit" items

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable - no fast-moving dependencies)
