# Phase 27: Student Page UX Polish - Research

**Researched:** 2026-02-06
**Domain:** Next.js 16 loading states, skeleton UI, empty states, and error recovery for student-facing pages
**Confidence:** HIGH

## Summary

Phase 27 must polish every student-facing page so students never see a broken, confusing, or blank screen. This means adding loading skeletons (for server-rendered pages via `loading.tsx` and for client-side fetches), meaningful empty states, and graceful error handling for edge cases specific to each page.

The codebase already has strong foundations from Phase 26: `ErrorAlert` component (inline + block variants), three `error.tsx` route boundaries (dashboard, root, global), and the established pattern of `throw` on `!res.ok` with `ErrorAlert` + retry. Phase 27 builds on top of these by addressing the **student-specific** gaps: no `loading.tsx` files exist anywhere, server component pages have no try/catch on DB queries (they rely solely on `error.tsx` boundaries), the my-feedback page silently returns `[]` on errors (masking failures as empty state), the my-conversations page has a basic error state but transcript loading failures are silently swallowed, and the chat widget / voice conversation need rate-limiting and permission-denial user feedback.

The work splits naturally into two waves matching the roadmap plan: Wave 1 covers the core learning flow (dashboard, course detail, lesson player) and Wave 2 covers secondary pages (my-feedback, my-conversations, chat widget, voice conversation).

**Primary recommendation:** Use Next.js `loading.tsx` files for server component page skeletons, add try/catch with inline error rendering to server component pages, use the existing `Skeleton` component from `src/components/ui/skeleton.tsx` for loading states, use `ErrorAlert` for error states, and add specific error messages for rate limiting (429), permission denial, and connection failures in chat/voice components.

## Standard Stack

### Core (Already Installed - No New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 16 | 16.1.4 | `loading.tsx` file convention for Suspense-based loading states | Built-in streaming with automatic Suspense boundaries |
| React 19 | 19.2.3 | Suspense for async server components | `loading.tsx` wraps page in Suspense automatically |
| Skeleton component | n/a | `src/components/ui/skeleton.tsx` - animated placeholder | Already installed, used in admin analytics |
| ErrorAlert component | n/a | `src/components/ui/error-alert.tsx` - inline + block variants | Created in Phase 26-01 |
| lucide-react | 0.563.0 | Icons for empty states, error states | Already used throughout |
| framer-motion | 12.29.2 | Animation for state transitions | Already used in VoiceConversation, ChatWidget |

### Supporting (Already Available)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @ai-sdk/react | 3.0.64 | `useChat` hook with built-in error/status handling | Chat widget already uses via useChatbot |
| date-fns | (installed) | Time formatting for conversation cards | Already used in my-conversations |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `loading.tsx` file convention | React.Suspense with manual fallback | `loading.tsx` is simpler, auto-wraps page segment. Use `loading.tsx`. |
| Skeleton component for each page | Generic spinner | Skeletons provide spatial context of what's loading. Use Skeleton for card grids and lists, spinner only for simple single-element loads. |
| Per-page try/catch in server components | Rely solely on error.tsx | error.tsx gives generic error page; inline try/catch gives page-specific messages. Use both: try/catch for graceful degradation, error.tsx as safety net. |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
src/
├── app/
│   └── (dashboard)/
│       ├── dashboard/
│       │   └── loading.tsx           # NEW: Dashboard loading skeleton
│       ├── courses/
│       │   └── [courseId]/
│       │       └── loading.tsx       # NEW: Course detail loading skeleton
│       ├── lessons/
│       │   └── [lessonId]/
│       │       └── loading.tsx       # NEW: Lesson player loading skeleton
│       ├── my-feedback/
│       │   └── loading.tsx           # NEW: My-feedback loading skeleton
│       └── my-conversations/
│           └── loading.tsx           # NEW: My-conversations loading skeleton (optional - page is client component)
```

Files to modify:

```
src/
├── app/
│   └── (dashboard)/
│       ├── dashboard/
│       │   └── page.tsx              # MODIFY: Add try/catch, improve empty state
│       ├── courses/
│       │   └── [courseId]/
│       │       └── page.tsx          # MODIFY: Add try/catch, edge case handling
│       ├── lessons/
│       │   └── [lessonId]/
│       │       └── page.tsx          # MODIFY: Add try/catch
│       ├── my-feedback/
│       │   └── page.tsx              # MODIFY: Fix silent error->empty masking
│       └── my-conversations/
│           └── page.tsx              # MODIFY: Add ErrorAlert, fix transcript error, add retry
├── components/
│   ├── chat/
│   │   └── ChatPanel.tsx             # MODIFY: Improve error messages (rate limit, connection)
│   └── voice/
│       └── VoiceConversation.tsx      # MODIFY: Add permission denial and timeout messages
```

### Pattern 1: loading.tsx for Server Component Pages
**What:** Place `loading.tsx` in each route directory to show a skeleton while the server component page loads. Next.js automatically wraps the page in React Suspense with this as the fallback.
**When to use:** Every server component page that does DB queries (dashboard, course detail, lesson player, my-feedback).
**Example:**
```typescript
// src/app/(dashboard)/dashboard/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/layout/AppHeader";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <AppHeader title="Dashboard" />
      <div className="container mx-auto px-4 py-8">
        {/* Greeting skeleton */}
        <div className="mb-8">
          <Skeleton className="h-9 w-72 bg-zinc-800" />
          <Skeleton className="h-5 w-48 mt-2 bg-zinc-800" />
        </div>
        {/* Course grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
              <Skeleton className="aspect-video bg-zinc-800" />
              <div className="p-6 space-y-3">
                <Skeleton className="h-5 w-3/4 bg-zinc-800" />
                <Skeleton className="h-4 w-full bg-zinc-800" />
                <Skeleton className="h-2 w-full bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Pattern 2: Server Component Try/Catch with Inline Error
**What:** Wrap DB queries in try/catch and render a styled error component instead of letting errors bubble to the generic error.tsx boundary.
**When to use:** All server component pages that query the database.
**Example:**
```typescript
// In dashboard/page.tsx
export default async function DashboardPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await currentUser();
  const displayName = user?.firstName || "Student";

  try {
    const userCourses = await db.select(...)...;
    // ... normal rendering
  } catch (error) {
    console.error("Dashboard query failed:", error);
    return (
      <div className="min-h-screen bg-zinc-900 text-white">
        <AppHeader title="Dashboard" />
        <div className="container mx-auto px-4 py-8">
          <ErrorAlert
            variant="block"
            message="Unable to load your courses. Please try refreshing the page."
          />
        </div>
      </div>
    );
  }
}
```

### Pattern 3: Distinguishing Error State from Empty State
**What:** Always check error state BEFORE empty state to prevent errors from masquerading as "no data."
**When to use:** Any page/component that fetches data and has an empty state.
**Critical fix for:** my-feedback page (currently returns `[]` on error, showing "No feedback yet" instead of error).
**Example:**
```typescript
// WRONG (current my-feedback pattern):
async function getFeedback(userId: string) {
  try {
    // ... query
    return feedbackItems;
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return [];  // <-- Masks error as empty state!
  }
}

// CORRECT:
async function getFeedback(userId: string): Promise<{ data: FeedbackItem[]; error: string | null }> {
  try {
    // ... query
    return { data: feedbackItems, error: null };
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return { data: [], error: "Unable to load feedback. Please try refreshing." };
  }
}

// In JSX:
{result.error ? (
  <ErrorAlert variant="block" message={result.error} />
) : result.data.length === 0 ? (
  <EmptyState />
) : (
  <FeedbackList items={result.data} />
)}
```

### Pattern 4: Client Component Error with ErrorAlert + Retry
**What:** Replace ad-hoc error rendering with the shared ErrorAlert component and proper retry.
**When to use:** Client components that fetch data (my-conversations, conversation transcript loading).
**Example:**
```typescript
// my-conversations page - replace current error rendering
{error ? (
  <ErrorAlert
    variant="block"
    message={error}
    onRetry={() => {
      setError(null);
      setIsLoading(true);
      fetchConversations();
    }}
  />
) : conversations.length === 0 ? (
  <EmptyState />
) : (
  // ... conversation list
)}
```

### Pattern 5: Rate Limit Error Detection in Chat/Voice
**What:** Detect 429 responses and show specific user-friendly messages with retry timing.
**When to use:** Chat widget and voice conversation components.
**Example:**
```typescript
// In useChatbot or ChatPanel error handling
if (response.status === 429) {
  const data = await response.json().catch(() => ({}));
  const retryAfter = data.retryAfter || response.headers.get('Retry-After') || 60;
  setError(`You're sending messages too quickly. Please wait ${retryAfter} seconds.`);
} else {
  setError("Failed to send message. Please try again.");
}
```

### Anti-Patterns to Avoid

- **Empty loading.tsx with just a spinner:** Skeletons should mirror the page layout so users see spatial context of what's loading. A centered spinner tells users nothing about the page structure.
- **Server component page without try/catch:** Even with error.tsx as a safety net, inline try/catch gives page-specific error messages like "Unable to load your courses" instead of generic "Something went wrong."
- **Error -> Empty masking:** Never set data to `[]` in a catch block without also setting an error flag. This is currently a bug in the my-feedback page.
- **window.location.reload() as retry:** Currently used in my-conversations page. This is a poor UX - it reloads the entire page. Use state-based retry that re-fetches just the failed data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Page loading states | Custom loading spinners per page | Next.js `loading.tsx` + `Skeleton` component | Automatic Suspense integration, layout-matching skeletons |
| Error display | Custom error divs per page | `ErrorAlert` from Phase 26 | Consistent styling, retry support, already established |
| Error boundaries | Custom React.ErrorBoundary per page | `error.tsx` files from Phase 26 | Already exists at dashboard, root, and global levels |
| Rate limit user feedback | Custom retry timer | Parse `Retry-After` header from rate limit response | Server already sends it; just parse and display |

**Key insight:** Phase 27 is about APPLYING the patterns from Phase 26 to student pages and adding loading skeletons. No new component libraries or patterns need to be invented.

## Common Pitfalls

### Pitfall 1: loading.tsx Re-renders Entire Layout
**What goes wrong:** Placing loading.tsx at the wrong level causes the sidebar/header to re-render during navigation.
**Why it happens:** loading.tsx is a Suspense boundary - it replaces everything in its page segment during loading.
**How to avoid:** Place loading.tsx at the page level (e.g., `dashboard/loading.tsx`), NOT at the layout level. The layout already renders the sidebar/header; only the page content should show a skeleton.
**Warning signs:** Sidebar flickers or disappears during navigation.

### Pitfall 2: My-Feedback Silent Error Masking
**What goes wrong:** The `getFeedback()` function returns `[]` on error, so the page shows "No coach feedback yet" when the DB query actually failed.
**Why it happens:** The catch block returns `[]` instead of propagating the error.
**How to avoid:** Return `{ data, error }` tuple from the query function. Render error state before empty state in JSX.
**Warning signs:** Student sees "No coach feedback yet" but has feedback - DB was just momentarily unreachable.
**Found in:** `src/app/(dashboard)/my-feedback/page.tsx` line 109-112.

### Pitfall 3: My-Conversations Transcript Error is Silent
**What goes wrong:** When expanding a conversation card, if the transcript API call fails, the catch block only console.errors. User sees "No transcript available" instead of "Failed to load transcript."
**Why it happens:** The `handleToggleExpand` catch block in ConversationCard doesn't set an error state.
**How to avoid:** Add a `transcriptError` state to ConversationCard. Show "Failed to load transcript. Click to retry." on error.
**Found in:** `src/app/(dashboard)/my-conversations/page.tsx` ConversationCard component, lines 57-79.

### Pitfall 4: Voice Conversation Doesn't Distinguish Permission Denial from Generic Error
**What goes wrong:** When a student denies microphone access, they see "Connection Error - Failed to connect to AI tutor" which doesn't tell them to grant mic permission.
**Why it happens:** `getUserMedia` throws a `NotAllowedError` when permission is denied, but the error message is generic.
**How to avoid:** Check `error.name === 'NotAllowedError'` in the connect catch block and show a specific message: "Microphone access denied. Please allow microphone access in your browser settings."
**Found in:** `src/hooks/useRealtimeConversation.ts` connect function, line 271.

### Pitfall 5: Chat Widget Doesn't Show Rate Limit Feedback
**What goes wrong:** When student hits the 20/min rate limit on the chat API, they see generic "Something went wrong" instead of being told they're sending messages too fast.
**Why it happens:** The AI SDK `useChat` hook handles errors generically. The 429 response from `/api/chat` has a specific `retryAfter` field but the client doesn't parse it.
**How to avoid:** The `useChat` hook from AI SDK v6 provides an `error` object. Check if the error message or response status indicates rate limiting and display a specific message.
**Found in:** `src/components/chat/ChatPanel.tsx` error display, lines 100-107.

### Pitfall 6: Course Detail Page Doesn't Handle All-Locked Edge Case Clearly
**What goes wrong:** When all lessons in a course are locked (student hasn't started), there's no clear "Start with the first lesson" call-to-action. The first lesson IS unlocked, but the all-locked visual state could be confusing.
**Why it happens:** The page already unlocks the first lesson in each module, so this is partially handled. However, there's no overall progress indicator or "Get started" prompt.
**How to avoid:** Add a progress summary at the top of the course detail page (e.g., "0 of 8 lessons complete - Start with Lesson 1") and ensure the first lesson card is visually prominent.
**Found in:** `src/app/(dashboard)/courses/[courseId]/page.tsx`.

## Page-by-Page Gap Analysis

### Dashboard (`src/app/(dashboard)/dashboard/page.tsx`)
**Current state:**
- Server component, queries DB directly
- Has empty state ("No courses yet") with SVG icon - GOOD
- No loading skeleton (no `loading.tsx`)
- No try/catch on DB queries
- No error state if DB query fails

**Gaps to fix:**
1. Add `loading.tsx` with course card grid skeleton
2. Add try/catch around DB queries with ErrorAlert fallback
3. Empty state already exists and is good quality

### Course Detail (`src/app/(dashboard)/courses/[courseId]/page.tsx`)
**Current state:**
- Server component, queries DB directly
- Has empty modules state ("No modules available yet.") - GOOD
- Has empty lessons state ("No lessons in this module yet.") - GOOD
- Has locked lesson state with "Complete X first" text - GOOD
- No loading skeleton
- No try/catch on DB queries

**Gaps to fix:**
1. Add `loading.tsx` with module/lesson list skeleton
2. Add try/catch around DB queries with ErrorAlert fallback
3. Consider adding progress summary at top

### Lesson Player (`src/app/(dashboard)/lessons/[lessonId]/page.tsx`)
**Current state:**
- Server component, queries DB directly
- Has demo video fallback with warning banner - GOOD
- Video player handles interactions and grading errors - GOOD (TextInteraction, AudioInteraction)
- No loading skeleton
- No try/catch on DB queries (for interactions, lesson data)
- VoiceConversation has error state with retry - GOOD

**Gaps to fix:**
1. Add `loading.tsx` with video player area skeleton
2. Add try/catch around DB queries with ErrorAlert fallback
3. VoiceConversation error messages could be more specific (permission denial)

### My-Feedback (`src/app/(dashboard)/my-feedback/page.tsx`)
**Current state:**
- Server component, queries DB via `getFeedback()` helper
- Has empty state ("No coach feedback yet") with icon - GOOD
- Has try/catch but returns `[]` on error - BAD (error masquerades as empty)
- No loading skeleton

**Gaps to fix:**
1. Add `loading.tsx` with feedback card list skeleton
2. Fix `getFeedback()` to return `{ data, error }` tuple
3. Render error state before empty state check

### My-Conversations (`src/app/(dashboard)/my-conversations/page.tsx`)
**Current state:**
- Client component ("use client"), fetches via API
- Has loading state with spinner - BASIC (could be skeleton)
- Has empty state ("No conversations yet") - GOOD
- Has error state with "Try again" button - EXISTS but uses `window.location.reload()` - BAD
- ConversationCard transcript loading is silent on error - BAD

**Gaps to fix:**
1. Improve loading state from spinner to skeleton cards
2. Replace `window.location.reload()` with state-based retry using ErrorAlert
3. Add error state to ConversationCard transcript loading with retry
4. Import and use ErrorAlert component for consistency

### Chat Widget (`src/components/chat/ChatPanel.tsx`)
**Current state:**
- Has error display with "Try again" link - GOOD
- Has retry handler that re-sends last message - GOOD
- Error message is generic "Something went wrong." - NEEDS IMPROVEMENT
- No rate limit detection - GAP
- No connection failure specific message - GAP

**Gaps to fix:**
1. Improve error messages to be specific (rate limit, network, server error)
2. Detect 429 response and show rate limit message with retry timing
3. Show connection failure message when fetch fails entirely

### Voice Conversation (`src/components/voice/VoiceConversation.tsx`)
**Current state:**
- Has full error state with icon + retry - GOOD
- Has connecting state with spinner - GOOD
- Error message is generic for all failure types - NEEDS IMPROVEMENT
- No microphone permission denial specific message - GAP
- No session timeout handling - GAP

**Gaps to fix:**
1. Detect `NotAllowedError` for mic permission denial and show specific message
2. Detect `NotFoundError` for no mic device and show specific message
3. Add session timeout detection (WebRTC connection state monitoring exists but could add time-based timeout)
4. Show more specific error messages based on failure type

## Code Examples

### loading.tsx for Course Detail Page
```typescript
// src/app/(dashboard)/courses/[courseId]/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader } from "@/components/layout/AppHeader";

export default function CourseDetailLoading() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <AppHeader title="" />
      <div className="container mx-auto px-4 py-8">
        {/* Back link skeleton */}
        <Skeleton className="h-5 w-32 mb-6 bg-zinc-800" />
        {/* Description skeleton */}
        <Skeleton className="h-4 w-2/3 mb-8 bg-zinc-800" />
        {/* Module sections */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="mb-8 space-y-4">
            <Skeleton className="h-6 w-48 bg-zinc-800" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-4 p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
                  <Skeleton className="w-10 h-10 rounded-full bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-2/3 bg-zinc-800" />
                    <Skeleton className="h-4 w-1/2 bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Fixed My-Feedback Error Handling
```typescript
// Fixed getFeedback function pattern
async function getFeedback(userId: string): Promise<{
  data: FeedbackItem[];
  error: string | null;
}> {
  try {
    const currentUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
    });
    if (!currentUser) return { data: [], error: null };

    const reviewedSubmissions = await db.select(...)...;
    // ... existing query logic

    return { data: feedbackWithDetails, error: null };
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return {
      data: [],
      error: "Unable to load your feedback. Please try refreshing the page.",
    };
  }
}

// In page JSX:
const { data: feedback, error } = await getFeedback(userId);

{error ? (
  <ErrorAlert variant="block" message={error} />
) : feedback.length === 0 ? (
  <EmptyState />
) : (
  <div className="space-y-6 max-w-3xl">
    {feedback.map((item) => (
      <FeedbackCard key={item.submissionId} feedback={item} />
    ))}
  </div>
)}
```

### Voice Conversation Permission-Specific Errors
```typescript
// In useRealtimeConversation.ts connect catch block
catch (e) {
  console.error("[Realtime] Connection failed:", e);

  let errorMessage = "Failed to connect to AI tutor";

  if (e instanceof Error) {
    if (e.name === "NotAllowedError") {
      errorMessage = "Microphone access denied. Please allow microphone access in your browser settings and try again.";
    } else if (e.name === "NotFoundError") {
      errorMessage = "No microphone found. Please connect a microphone and try again.";
    } else if (e.message.includes("Failed to get voice session token")) {
      errorMessage = "Unable to start voice session. The service may be temporarily unavailable.";
    } else {
      errorMessage = e.message;
    }
  }

  setError(errorMessage);
  setStatus("error");
}
```

### Chat Widget Rate Limit Detection
```typescript
// Enhancement to useChatbot or ChatPanel error handling
// The AI SDK useChat hook provides error.message from the API response
// When status is 429, the API returns: { error: "Too many requests...", retryAfter: N }

// In ChatPanel error display:
{error && (
  <div className="text-red-400 text-xs px-4 py-2 border-t border-gray-700">
    <p>
      {typeof error === 'object' && 'message' in error && error.message.includes('Too many requests')
        ? "You're sending messages too quickly. Please wait a moment before trying again."
        : "Something went wrong."}
    </p>
    <button className="underline hover:text-red-300 mt-1" onClick={handleRetry}>
      Try again
    </button>
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No loading states (blank page during SSR) | `loading.tsx` Suspense boundaries with skeletons | Next.js 13+ (App Router) | Users see layout skeleton instead of blank white/dark page |
| Generic spinner for all loading | Content-aware Skeleton components | Industry standard since ~2020 | Spatial context reduces perceived load time |
| Silent error -> empty state | Error state before empty state check | Phase 26 established pattern | Users know when something fails vs when there's no data |
| `window.location.reload()` for retry | State-based retry (re-fetch without full reload) | Industry standard | Faster, preserves scroll position, no full page flash |

**Deprecated/outdated:**
- Generic centered spinners for page loading: Use layout-matching skeletons instead
- `window.location.reload()` as retry mechanism: Use state reset + re-fetch

## Task Breakdown Recommendation

### Wave 1 (27-01): Dashboard, Course Detail, Lesson Player
Files to create: 3 loading.tsx files
Files to modify: 3 page.tsx files (add try/catch + error rendering)

**Dashboard:**
- Create `dashboard/loading.tsx` with course card grid skeleton
- Add try/catch to DB queries in page.tsx with ErrorAlert fallback

**Course Detail:**
- Create `courses/[courseId]/loading.tsx` with module/lesson skeleton
- Add try/catch to DB queries in page.tsx with ErrorAlert fallback
- Enhance "no modules" and "no lessons" messages

**Lesson Player:**
- Create `lessons/[lessonId]/loading.tsx` with video area skeleton
- Add try/catch to DB queries in page.tsx with ErrorAlert fallback

### Wave 2 (27-02): My-Feedback, My-Conversations, Chat Widget, Voice Conversation
Files to create: 1 loading.tsx file (my-feedback)
Files to modify: 4 files

**My-Feedback:**
- Create `my-feedback/loading.tsx` with feedback card list skeleton
- Fix `getFeedback()` to return `{ data, error }` tuple
- Render error state before empty state

**My-Conversations:**
- Replace `window.location.reload()` with state-based retry
- Add ErrorAlert component import and use
- Add error state to ConversationCard transcript loading
- Improve loading state from spinner to skeleton cards

**Chat Widget:**
- Improve error messages (detect rate limit, connection failure)
- Show specific message for 429 responses

**Voice Conversation:**
- Add permission denial detection (`NotAllowedError`)
- Add no-device detection (`NotFoundError`)
- Improve error message specificity
- Consider session timeout feedback

## Open Questions

1. **Should loading.tsx include the AppHeader?**
   - What we know: AppHeader is a client component with Clerk UserButton, SearchBar, NotificationBell. Including it in loading.tsx means it renders twice (once in loading, once in actual page).
   - Recommendation: Include AppHeader in loading.tsx for visual continuity. Since it's a client component, it will render immediately even in the skeleton. The actual page replaces the entire loading skeleton including the header, so there's no double-render issue in practice.

2. **How to handle rate limiting in AI SDK useChat?**
   - What we know: The `useChat` hook from `@ai-sdk/react` v3 provides an `error` property when the API returns non-200. The rate limit response includes `retryAfter` in the JSON body. The hook doesn't have built-in rate limit parsing.
   - Recommendation: Check `error.message` content in ChatPanel for rate-limit-related text. The existing `handleRetry` already works for retrying. Just improve the error display text.

3. **Should my-conversations loading become a skeleton?**
   - What we know: my-conversations is a client component ("use client"), so `loading.tsx` won't help (it only works with server components). The current spinner-based loading is functional.
   - Recommendation: Keep it as a client component but upgrade the spinner to skeleton cards for better perceived performance. This is a pure client-side change using the Skeleton component.

## Sources

### Primary (HIGH confidence)
- Direct codebase audit of all 7 student-facing pages and their components
- Phase 26 research and implementation (ErrorAlert, error.tsx patterns)
- `src/components/ui/skeleton.tsx` - existing Skeleton component
- `src/components/ui/error-alert.tsx` - established ErrorAlert component
- `src/app/(dashboard)/admin/analytics/components/OverviewCards.tsx` - existing Skeleton usage pattern

### Secondary (MEDIUM confidence)
- Next.js `loading.tsx` convention behavior (verified from project's Next.js 16.1.4 setup)
- AI SDK `useChat` error handling (verified from `@ai-sdk/react` v3 usage in codebase)
- WebRTC error types (NotAllowedError, NotFoundError) from Web API standards

### Tertiary (LOW confidence)
- None. All findings are from direct codebase inspection and established patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already installed, zero new dependencies
- Architecture: HIGH - Patterns directly extend Phase 26 established infrastructure
- Pitfalls: HIGH - All identified from direct codebase audit with specific file/line references
- Page-by-page analysis: HIGH - Every student page was read and gaps catalogued

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable - no fast-moving dependencies, all patterns established internally)
