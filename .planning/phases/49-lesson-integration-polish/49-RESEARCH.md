# Phase 49: Lesson Integration & Polish - Research

**Researched:** 2026-02-09
**Domain:** Lesson-to-Reader integration, sentence-level TTS with speed control, AI translation, vocabulary list page, reader error/loading states
**Confidence:** HIGH

## Summary

Phase 49 is primarily an integration and polish phase that connects existing, fully-built subsystems rather than building new technology. The reader (Phase 47), character popup (Phase 48), TTS API (Phase 46), dictionary API (Phase 45), and vocabulary save/unsave (Phase 48) all exist and are functional. The work is: (1) add an "Open in Reader" link on lesson pages that pre-loads interaction text, (2) add sentence-level read-aloud with speed control to the reader UI, (3) add sentence-level AI translation with tap-to-reveal, (4) build a vocabulary list page at `/dashboard/vocabulary`, (5) verify reader preferences already persist in localStorage (they do), (6) add loading skeletons for dictionary lookup and TTS, and (7) add friendly error states for missing entries and TTS failures.

Every requirement maps to existing infrastructure. No new npm packages are needed. No new database schema is needed (savedVocabulary table already has all required columns). The AI translation requires one new API endpoint (`/api/reader/translate`) that calls the existing n8n or OpenAI setup.

**Primary recommendation:** Structure this as 3-4 focused plans: (1) Lesson-to-Reader integration (INTG-02), (2) Sentence TTS + AI translation (TTS-04, READ-06), (3) Vocabulary list page (VOCAB-02), (4) Loading/error states polish. All plans can share a single wave since they touch different areas.

## Standard Stack

### Core (Already Installed -- No New Packages)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `useTTS` hook | custom | Client-side TTS playback with blob caching | Exists at `src/hooks/useTTS.ts` |
| `@floating-ui/react-dom` | ^0.9.4 | Popup positioning for character popup | Already integrated |
| `pinyin-pro` | ^3.28.0 | Pinyin generation for vocabulary display | Already installed |
| `to-jyutping` | ^3.1.1 | Jyutping generation for vocabulary display | Already installed |
| Drizzle ORM | ^0.44.2 | Database queries for vocabulary list | Already installed |
| Clerk | ^6.21.0 | Authentication for vocab page and APIs | Already installed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `use-debounce` | ^10.1.0 | Debounce sentence-level TTS requests | Already installed |
| `lucide-react` | ^0.511.0 | Icons for vocabulary page | Already installed |
| `@upstash/redis` | ^1.36.1 | TTS cache (already configured) | Already integrated |

### Alternatives Considered

None -- this phase uses only existing infrastructure.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

```
src/
  app/
    (dashboard)/
      dashboard/
        vocabulary/
          page.tsx          # NEW: Vocabulary list page (server component)
          loading.tsx       # NEW: Loading skeleton
          VocabularyClient.tsx  # NEW: Client component with filtering
      lessons/
        [lessonId]/
          page.tsx          # MODIFY: Add "Open in Reader" link
    api/
      reader/
        translate/
          route.ts          # NEW: AI sentence translation endpoint
      vocabulary/
        route.ts            # MODIFY: Extend GET with full details (pinyin, jyutping, definitions, date)
  components/
    reader/
      SentenceReadAloud.tsx # NEW: Sentence-level TTS controls
      SentenceTranslation.tsx # NEW: Tap-to-reveal translation overlay
      ReaderTextArea.tsx    # MODIFY: Add sentence detection and selection UI
    layout/
      AppSidebar.tsx        # MODIFY: Add Vocabulary nav item
```

### Pattern 1: Lesson-to-Reader Navigation via URL Search Params

**What:** Pass lesson text to the reader via URL search params or sessionStorage, not via a complex state management system.
**When to use:** When navigating between two pages that need to share a chunk of text.

The lesson page has access to `interactions.prompt` and `interactions.expectedAnswer` text. The reader page needs to receive this text. Two options exist:

**Option A: URL searchParam with sessionStorage (RECOMMENDED)**
```typescript
// Lesson page: Store text in sessionStorage, navigate with marker
const text = interactions.map(i => i.prompt).join('\n\n');
sessionStorage.setItem('reader-preload', text);
router.push('/dashboard/reader?from=lesson&lessonId=' + lessonId);

// Reader page: Check for preload on mount
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('from') === 'lesson') {
    const text = sessionStorage.getItem('reader-preload');
    if (text) {
      setRawText(text);
      sessionStorage.removeItem('reader-preload');
    }
  }
}, []);
```

Why: URL params alone have length limits (~2000 chars). sessionStorage avoids this while being ephemeral (cleared when tab closes). The URL param acts as a signal, not a data carrier.

**Option B: Server-side fetch on reader page**
```typescript
// Reader page: If ?lessonId=X, fetch interactions server-side
const searchParams = await props.searchParams;
const lessonId = searchParams?.lessonId;
if (lessonId) {
  const interactions = await db.query.interactions.findMany({...});
  const text = interactions.map(i => i.prompt).join('\n\n');
  return <ReaderClient initialText={text} />;
}
```

Why not preferred: Requires duplicating access control checks from the lesson page, adds complexity to a server component. But it would work for bookmarked/shared URLs.

**Decision: Use a hybrid.** The server component (`page.tsx`) accepts an optional `lessonId` searchParam, fetches interaction text server-side (reusing existing auth/access patterns), and passes it as `initialText` prop to `ReaderClient`. This is cleaner than sessionStorage and supports direct URL sharing.

**Source:** Direct codebase analysis of `src/app/(dashboard)/lessons/[lessonId]/page.tsx` showing interaction data is already fetched and available.

### Pattern 2: Sentence-Level TTS with Speed Control

**What:** Add a floating play button that appears when the user selects or taps a sentence in the reader, with a speed selector (slow/medium/fast).
**When to use:** For read-aloud functionality at the sentence grain.

The `useTTS` hook already supports the `rate` parameter (`"x-slow" | "slow" | "medium" | "fast"`). The TTS API route, SSML builder, and Redis cache all handle rate correctly. The only new work is UI to:
1. Detect sentence boundaries in the reader text
2. Allow sentence selection (tap on desktop, long-press on mobile, or a sentence-level play button)
3. Show a speed control dropdown near the play button
4. Call `speak(sentenceText, { language, rate })`

**Sentence detection approach:** Chinese sentences end with `。`, `！`, `？`, `；`. Split on these punctuation marks. The reader already has segmented text via Intl.Segmenter; sentences can be detected by scanning for these terminal punctuation segments.

```typescript
const SENTENCE_TERMINATORS = /[。！？；]/;

function detectSentences(segments: WordSegment[]): SentenceRange[] {
  const sentences: SentenceRange[] = [];
  let start = 0;
  for (let i = 0; i < segments.length; i++) {
    if (SENTENCE_TERMINATORS.test(segments[i].text)) {
      sentences.push({
        startIndex: start,
        endIndex: i,
        text: segments.slice(start, i + 1).map(s => s.text).join(''),
      });
      start = i + 1;
    }
  }
  // Handle trailing text without terminator
  if (start < segments.length) {
    sentences.push({
      startIndex: start,
      endIndex: segments.length - 1,
      text: segments.slice(start).map(s => s.text).join(''),
    });
  }
  return sentences;
}
```

### Pattern 3: AI Translation with Tap-to-Reveal

**What:** Show a translation icon per sentence that, when tapped, reveals an AI-generated English translation.
**When to use:** For sentence-level comprehension assistance.

Implementation approach:
1. Each sentence in the reader gets a small translate icon (e.g., `Languages` icon from lucide)
2. Tapping it calls `POST /api/reader/translate` with the sentence text
3. API route calls OpenAI (via `@ai-sdk/openai` or direct fetch to OpenAI API) for translation
4. Translation appears below the sentence with a slide-down animation
5. Translations are cached client-side in a `Map<string, string>` (keyed by sentence text)

The project already uses `@ai-sdk/openai` (installed) and has OpenAI API keys configured. A simple chat completion with a system prompt like "Translate the following Chinese text to natural English. Return only the translation." is sufficient.

**Cache consideration:** Translations should NOT be cached server-side in Redis -- they are per-session, low-reuse (unlike TTS which is shared across users). Client-side Map cache is sufficient.

### Pattern 4: Vocabulary List Page with Server-Side Data

**What:** A dedicated page at `/dashboard/vocabulary` showing all saved words with definitions, pronunciation, and date saved.
**When to use:** When the user wants to review their saved vocabulary.

The `savedVocabulary` table already stores: `traditional`, `simplified`, `pinyin`, `jyutping`, `definitions` (text[]), `notes`, and `createdAt`. The vocabulary API (`GET /api/vocabulary`) currently returns only `{ id, traditional }` for bookmark state tracking. It needs to be extended to return full details for the list page, or a separate query can be done server-side.

**Recommended: Server component with DB query.**
```typescript
// src/app/(dashboard)/dashboard/vocabulary/page.tsx
export default async function VocabularyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const items = await db
    .select()
    .from(savedVocabulary)
    .where(eq(savedVocabulary.userId, user.id))
    .orderBy(desc(savedVocabulary.createdAt));

  return <VocabularyClient items={items} />;
}
```

Client component handles: search/filter, TTS playback per word, delete confirmation, and notes display. No pagination needed initially (users are unlikely to have thousands of saved words in a learning context).

### Anti-Patterns to Avoid

- **Over-engineering sentence TTS:** Do NOT build a karaoke-style word-highlight sync with audio. That requires SSML word boundary events and complex timing logic. Simple play/stop per sentence is sufficient for v6.0.
- **AI translation on initial load:** Do NOT translate all sentences when text is imported. Only translate on tap. API cost and latency make eager translation impractical.
- **Separate vocabulary API for list page:** Do NOT create `/api/vocabulary/list` as a new route. Extend the existing `GET /api/vocabulary` or fetch server-side in the page component (preferred -- avoids client-side fetch waterfall).
- **Complex state management for sentence selection:** Do NOT use xstate or a state machine. A simple `selectedSentenceIndex: number | null` state is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TTS playback | Custom audio manager | `useTTS` hook (exists) | Already handles caching, loading, stop/play, error states |
| Speed control SSML | Custom SSML builder | `buildSSML()` from `src/lib/tts.ts` | Already accepts `rate` parameter |
| Vocabulary data access | Custom ORM queries | Drizzle `savedVocabulary` schema (exists) | Already typed and indexed |
| Authentication | Custom auth checks | `getCurrentUser()` from `src/lib/auth.ts` | Already handles Clerk->DB user lookup |
| Loading skeletons | Custom shimmer components | `Skeleton` from `@/components/ui/skeleton` | shadcn/ui standard component |
| Error display | Custom error UI | `ErrorAlert` from `@/components/ui/error-alert` | Already used across the app |

**Key insight:** This phase is almost entirely integration. Every "building block" already exists. The new code is primarily UI composition and data flow wiring.

## Common Pitfalls

### Pitfall 1: Reader Page Doesn't Accept initialText Prop

**What goes wrong:** The ReaderClient component currently takes no props. Adding lesson integration requires passing initial text to it.
**Why it happens:** The reader was designed for paste/import only, not pre-loaded content.
**How to avoid:** Add an optional `initialText?: string` prop to `ReaderClient`. In the `useState` initializer, use `initialText || ""` as the default for `rawText`. The `page.tsx` server component handles the `lessonId` searchParam lookup and passes the text down.
**Warning signs:** Reader shows empty state despite navigating from a lesson with text.

### Pitfall 2: Interaction Text Missing or Empty

**What goes wrong:** Some lessons may have no interactions (video-only), or interaction prompts may be empty strings. The "Open in Reader" button appears but navigates to an empty reader.
**Why it happens:** Not all lessons have Chinese text interactions.
**How to avoid:** Only show the "Open in Reader" button when `cuePoints.length > 0` and at least one interaction has a non-empty `prompt`. Concatenate unique prompts (avoid duplicates from retry interactions).
**Warning signs:** "Open in Reader" button visible on lessons with only video.

### Pitfall 3: Sentence Boundary Detection Fails for Mixed Content

**What goes wrong:** Text with English mixed in, or text without Chinese sentence terminators (。！？), produces a single giant "sentence" that overwhelms TTS (500-char limit).
**Why it happens:** Some imported text uses Western punctuation (. ! ?) or has no sentence-level punctuation.
**How to avoid:** Include both Chinese and Western sentence terminators in the detection regex: `/[。！？；.!?]/`. Also chunk sentences longer than ~100 characters at the nearest word boundary to stay within TTS limits.
**Warning signs:** TTS returns 400 error for text exceeding 500 characters.

### Pitfall 4: AI Translation API Costs

**What goes wrong:** Users rapidly tap translate on every sentence, generating many OpenAI API calls.
**Why it happens:** No rate limiting or visual cue that translation costs money.
**How to avoid:** Client-side cache prevents re-requesting the same sentence. Rate limit the translate API route (e.g., 20 requests/min). Show a loading state while translating to discourage rapid clicks. The existing `selectLimiter` pattern can be reused.
**Warning signs:** High OpenAI API bill, slow response times.

### Pitfall 5: Vocabulary Page Empty State

**What goes wrong:** New users with zero saved words see a blank white page.
**Why it happens:** No empty state designed for the vocabulary page.
**How to avoid:** Always include an empty state: "No saved vocabulary yet. Open the Reader and tap the bookmark icon on any word to save it." with a link to `/dashboard/reader`.
**Warning signs:** Users confused about how to add vocabulary.

### Pitfall 6: Reader Preferences Already Persist

**What goes wrong:** Implementing reader preference persistence when it already works, wasting development time.
**Why it happens:** Not reading the existing code before planning.
**How to avoid:** Success Criterion 5 is ALREADY MET. The `useReaderPreferences` hook at `src/hooks/useReaderPreferences.ts` persists `annotationMode`, `scriptMode`, and `fontSize` to localStorage under the key `"reader-prefs"`. It follows the `useSubtitlePreference` pattern exactly. **No work needed for this criterion.**
**Warning signs:** Duplicate localStorage entries, preference conflicts.

### Pitfall 7: Loading Skeleton During Dictionary Popup

**What goes wrong:** The character popup already has a loading state (Loader2 spinner) but the success criterion calls for "loading skeletons during dictionary lookup." The existing loading state may be considered sufficient.
**Why it happens:** Ambiguity between "loading skeleton" and "loading spinner."
**How to avoid:** The CharacterPopup already shows `<Loader2 className="animate-spin" />` with "Loading..." text during dictionary fetch. For TTS, `useTTS` exposes `isLoading` state. Both loading states exist. Enhance the popup loading state to use Skeleton components (content-shaped placeholders) instead of a generic spinner to match the app's Skeleton pattern from Phase 38.

## Code Examples

### Lesson Page "Open in Reader" Link

```typescript
// In src/app/(dashboard)/lessons/[lessonId]/page.tsx
// After fetching interactions (line ~131), add a link conditionally:

const interactionTexts = cuePoints
  .map(cp => cp.prompt)
  .filter(Boolean)
  .filter((text, index, arr) => arr.indexOf(text) === index); // unique

const hasReadableText = interactionTexts.length > 0;

// In JSX, after the lesson header:
{hasReadableText && (
  <Link
    href={`/dashboard/reader?lessonId=${lessonId}`}
    className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
  >
    <BookOpenText className="w-4 h-4" />
    Open in Reader
  </Link>
)}
```

### Reader Page with lessonId Search Param

```typescript
// src/app/(dashboard)/dashboard/reader/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { interactions, lessons, courseAccess, users } from "@/db/schema";
import { eq, and, isNull, asc, or, gt } from "drizzle-orm";
import { ReaderClient } from "./ReaderClient";

interface PageProps {
  searchParams: Promise<{ lessonId?: string }>;
}

export default async function ReaderPage({ searchParams }: PageProps) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const params = await searchParams;
  let initialText = "";

  if (params.lessonId) {
    // Fetch interaction text for the lesson
    // (with access control — only if user has course access)
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });

    if (user) {
      const lesson = await db.query.lessons.findFirst({
        where: and(eq(lessons.id, params.lessonId), isNull(lessons.deletedAt)),
        with: { module: { with: { course: true } } },
      });

      if (lesson) {
        // Verify access
        const access = await db.query.courseAccess.findFirst({
          where: and(
            eq(courseAccess.userId, user.id),
            eq(courseAccess.courseId, lesson.module.course.id),
            or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date()))
          ),
        });

        if (access) {
          const lessonInteractions = await db.query.interactions.findMany({
            where: and(
              eq(interactions.lessonId, params.lessonId),
              isNull(interactions.deletedAt)
            ),
            orderBy: [asc(interactions.timestamp)],
          });

          const prompts = lessonInteractions
            .map(i => i.prompt)
            .filter(Boolean);
          const unique = [...new Set(prompts)];
          initialText = unique.join("\n\n");
        }
      }
    }
  }

  return <ReaderClient initialText={initialText || undefined} />;
}
```

### Sentence-Level TTS Speed Control

```typescript
// Sentence read-aloud component
interface SentenceReadAloudProps {
  text: string;
}

function SentenceReadAloud({ text }: SentenceReadAloudProps) {
  const { speak, stop, isLoading, isPlaying } = useTTS();
  const [rate, setRate] = useState<TTSRate>("medium");

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => isPlaying ? stop() : speak(text, { rate })}
        disabled={isLoading}
        className="p-1 rounded hover:bg-zinc-700/50"
      >
        {isPlaying ? <Square className="w-3 h-3" /> :
         isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> :
         <Play className="w-3 h-3" />}
      </button>
      <select
        value={rate}
        onChange={(e) => setRate(e.target.value as TTSRate)}
        className="text-xs bg-transparent border-none text-zinc-400"
      >
        <option value="slow">Slow</option>
        <option value="medium">Normal</option>
        <option value="fast">Fast</option>
      </select>
    </div>
  );
}
```

### Vocabulary List Page

```typescript
// Server component
export default async function VocabularyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const items = await db
    .select()
    .from(savedVocabulary)
    .where(eq(savedVocabulary.userId, user.id))
    .orderBy(desc(savedVocabulary.createdAt));

  return <VocabularyClient items={items} />;
}

// Client component
function VocabularyClient({ items }: { items: SavedVocabulary[] }) {
  const { speak, isLoading, isPlaying } = useTTS();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-zinc-500">
        <BookmarkIcon className="w-12 h-12 mb-3 opacity-50" />
        <p>No saved vocabulary yet</p>
        <p className="text-sm mt-1">
          Open the <Link href="/dashboard/reader" className="text-cyan-400">Reader</Link> and
          bookmark words to build your vocabulary list.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => (
        <VocabularyCard
          key={item.id}
          item={item}
          onSpeak={(text, lang) => speak(text, { language: lang })}
        />
      ))}
    </div>
  );
}
```

### AI Translation API Route

```typescript
// POST /api/reader/translate
// Body: { text: string, targetLanguage?: string }
// Returns: { translation: string }

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text } = await request.json();
  if (!text || text.length > 500) {
    return NextResponse.json({ error: "Invalid text" }, { status: 400 });
  }

  const { text: translation } = await generateText({
    model: openai("gpt-4o-mini"),
    system: "Translate the following Chinese text to natural, fluent English. Return ONLY the English translation, nothing else.",
    prompt: text,
  });

  return NextResponse.json({ translation });
}
```

### Enhanced CharacterPopup Loading Skeleton

```typescript
// Replace the Loader2 spinner with content-shaped Skeleton
{isLoading && !lookupData && (
  <div className="px-3 py-3 space-y-2">
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-12 bg-zinc-800" /> {/* Character */}
      <Skeleton className="h-4 w-20 bg-zinc-800" /> {/* Pinyin */}
    </div>
    <Skeleton className="h-3 w-full bg-zinc-800" /> {/* Definition line 1 */}
    <Skeleton className="h-3 w-3/4 bg-zinc-800" /> {/* Definition line 2 */}
  </div>
)}
```

### Error State for Missing Dictionary Entry with AI Suggestion

```typescript
// Enhanced empty state in CharacterPopup
{!isLoading && !error && !hasLookupData && (
  <div className="px-3 py-4">
    <span className="text-3xl font-bold text-zinc-100">{activeWord}</span>
    <p className="mt-1 text-sm text-zinc-500">
      No dictionary entry found
    </p>
    <button
      onClick={() => requestAIDefinition(activeWord)}
      className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
    >
      Try AI-generated definition
    </button>
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A | All infrastructure built in Phases 44-48 | 2026-02-08/09 | Phase 49 is pure integration |

**Deprecated/outdated:**
- None -- everything used in this phase is current.

## Open Questions

1. **What text to preload from lessons?**
   - What we know: Interactions have `prompt` (the Chinese prompt shown to students) and `expectedAnswer` (the expected Chinese response). Both contain Chinese text suitable for the reader.
   - What's unclear: Should we concatenate prompts only, or include expectedAnswer too? Including both gives more reading material but may confuse students.
   - Recommendation: Include only `prompt` fields by default, as these are the primary instructional text. The expected answers are grading criteria, not reading content.

2. **Sentence-level TTS language detection**
   - What we know: The useTTS hook accepts `language` as "zh-CN" or "zh-HK". The reader has an `annotationMode` but not a direct language setting.
   - What's unclear: Should sentence TTS use the user's `languagePreference` from the database, or the reader's annotation mode?
   - Recommendation: Use the user's `languagePreference` from `useLanguagePreference()` hook (maps "cantonese" -> "zh-HK", "mandarin" -> "zh-CN", "both" -> "zh-CN" default). This is consistent with how TTS buttons work in the popup.

3. **Vocabulary sidebar nav placement**
   - What we know: Reader is already in the Learning section of AppSidebar. Vocabulary is conceptually related.
   - Recommendation: Add "Vocabulary" item right after "Reader" in the Learning section, using `Bookmark` icon from lucide-react.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all files listed in this research
- `src/hooks/useTTS.ts` -- TTS hook with rate, loading, caching
- `src/hooks/useReaderPreferences.ts` -- localStorage persistence already implemented
- `src/hooks/useCharacterPopup.ts` -- Popup state management with dictionary fetch
- `src/app/api/tts/route.ts` -- TTS API with SSML, Redis cache, rate limiting
- `src/app/api/vocabulary/route.ts` -- Vocabulary CRUD API
- `src/db/schema/vocabulary.ts` -- savedVocabulary table schema
- `src/app/(dashboard)/lessons/[lessonId]/page.tsx` -- Lesson page with interaction data
- `src/components/reader/CharacterPopup.tsx` -- Existing loading/error states
- `src/components/reader/ReaderTextArea.tsx` -- Segmented text rendering
- `src/components/layout/AppSidebar.tsx` -- Sidebar navigation structure
- `.planning/research/v6-azure-tts.md` -- TTS research (SSML, rate control)

### Secondary (MEDIUM confidence)
- `@ai-sdk/openai` -- Already installed, generateText API for translation

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and proven in this codebase
- Architecture: HIGH -- all patterns follow existing codebase conventions
- Pitfalls: HIGH -- derived from direct code inspection of existing implementations
- Integration: HIGH -- every dependency (TTS API, vocabulary API, dictionary API, reader, popup) already exists and is functional

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable -- all infrastructure is internal, no external dependency changes expected)
