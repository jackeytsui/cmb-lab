# Phase 48: Character Popup - Research

**Researched:** 2026-02-08
**Domain:** Interactive popup UI for Chinese character study (Floating UI positioning, Hanzi Writer animation, dictionary data display, TTS playback, vocabulary persistence)
**Confidence:** HIGH

## Summary

Phase 48 builds the core interactive popup that appears when users hover/tap characters in the Chinese Reader. All infrastructure dependencies are already shipped: the dictionary API (Phase 45), TTS API + useTTS hook (Phase 46), and the reader page with WordSpan event delegation (Phase 47). The popup component itself is the primary deliverable.

The popup must be a **single shared component** positioned via `@floating-ui/react-dom` (already installed at v2.1.7) using a virtual element reference. This avoids creating thousands of Radix Popover instances. The popup displays dictionary definitions, pinyin/jyutping side-by-side tone comparison, radical/component breakdown with etymology, animated stroke order via `hanzi-writer` (v3.7.3, already installed), TTS play buttons for both languages (via existing useTTS hook), example words from the dictionary API, and a save-to-vocabulary button.

A vocabulary save API endpoint (`POST /api/vocabulary`) is needed to persist bookmarked words to the `saved_vocabulary` table (schema already exists from Phase 44). Touch device support uses tap-to-open and tap-elsewhere-to-close behavior.

**Primary recommendation:** Use `@floating-ui/react-dom` `useFloating` with virtual element state for positioning. Break the popup into sub-components (CharacterHeader, ToneComparison, RadicalBreakdown, StrokeAnimation, ExampleWords, SaveButton). Wire into ReaderClient via the existing `onWordHover`/`onWordClick` props on ReaderTextArea.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@floating-ui/react-dom` | ^2.1.7 | Popup positioning with virtual element | Already installed; single shared popup pattern needs virtual ref, not Radix trigger-per-element |
| `hanzi-writer` | ^3.7.3 | Stroke order animation | Already installed; only maintained JS library for Chinese stroke animation (4.3K GitHub stars) |
| `useTTS` hook | local | Audio playback for Mandarin/Cantonese | Already built in Phase 46; handles caching, overlap prevention, error states |
| Dictionary API | local | `/api/dictionary/lookup` + `/api/dictionary/character` | Already built in Phase 45; returns definitions, pinyin, jyutping, radicals, examples |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pinyin-pro` | ^3.28.0 | Generate per-character pinyin with tone marks | Tone comparison display; already installed and used in WordSpan |
| `to-jyutping` | ^3.1.1 | Generate per-character jyutping | Tone comparison display; already installed and used in WordSpan |
| `lucide-react` | installed | Icons for play, bookmark, info | Popup UI controls |
| `framer-motion` | ^12.29.2 | Optional: popup enter/exit animations | If smooth transitions desired; already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@floating-ui/react-dom` virtual element | Radix `Popover` with `PopoverAnchor` | Radix Popover requires a trigger per element (5000 instances); shadcn popover.tsx exists but is wrong pattern for shared popup |
| HanziWriter CDN data loading | Local `charDataLoader` from DB strokePaths | CDN is simpler and already works; DB data is available as fallback. CDN adds ~30KB per character on demand with browser caching |
| Client-side dictionary fetch | Server component data loading | Popup content is dynamic (changes on each hover); client-side fetch with debounce is the correct pattern |

**Installation:**
```bash
# No new packages needed — all dependencies are already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  components/
    reader/
      CharacterPopup.tsx           # Main popup shell (Floating UI positioning + layout)
      popup/
        PopupHeader.tsx            # Character display + pinyin/jyutping + TTS buttons
        ToneComparison.tsx         # Side-by-side Mandarin/Cantonese tone layout
        RadicalBreakdown.tsx       # Radical, decomposition, etymology display
        StrokeAnimation.tsx        # HanziWriter wrapper with play/pause
        ExampleWords.tsx           # Example words list from dictionary API
        SaveVocabularyButton.tsx   # Bookmark/save to personal vocabulary
  hooks/
    useCharacterPopup.ts           # Popup state management (active char, position, data fetching)
  app/
    api/
      vocabulary/
        route.ts                   # POST (save) + GET (list) + DELETE (remove)
```

### Pattern 1: Single Shared Popup with Virtual Element
**What:** One popup component in the DOM, repositioned via Floating UI virtual reference when the user hovers/taps a different word.
**When to use:** When there are hundreds/thousands of potential trigger elements (Chinese characters in reader text).
**Example:**
```typescript
// Source: Context7 /floating-ui/floating-ui — virtual-elements.mdx
import { useFloating, offset, flip, shift } from "@floating-ui/react-dom";

// Virtual element as state — updates when user hovers a new word
const [virtualEl, setVirtualEl] = useState<{
  getBoundingClientRect: () => DOMRect;
} | null>(null);

const { refs, floatingStyles } = useFloating({
  elements: { reference: virtualEl },
  placement: "top",
  middleware: [offset(8), flip(), shift({ padding: 8 })],
});

// When user hovers a word span, update the virtual element
function handleWordHover(word: string, index: number, element: HTMLElement) {
  setVirtualEl({
    getBoundingClientRect: () => element.getBoundingClientRect(),
  });
  setActiveWord(word);
}

// Popup rendered once, positioned dynamically
{activeWord && (
  <div ref={refs.setFloating} style={floatingStyles}>
    <CharacterPopupContent word={activeWord} />
  </div>
)}
```

### Pattern 2: HanziWriter in React with useRef + useEffect
**What:** HanziWriter requires a DOM element to render into. In React, use a ref to get the container element, then create/destroy the writer instance via useEffect.
**When to use:** Rendering stroke order animation inside the popup.
**Example:**
```typescript
// Source: Context7 /websites/hanziwriter_docs
import HanziWriter from "hanzi-writer";

function StrokeAnimation({ character }: { character: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Clear previous character
    containerRef.current.innerHTML = "";

    const writer = HanziWriter.create(containerRef.current, character, {
      width: 120,
      height: 120,
      padding: 5,
      showOutline: true,
      strokeColor: "#e4e4e7",     // zinc-200
      radicalColor: "#22d3ee",    // cyan-400
      outlineColor: "#3f3f46",    // zinc-700
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 300,
      renderer: "svg",
    });
    writerRef.current = writer;

    return () => {
      writerRef.current = null;
    };
  }, [character]);

  const handlePlay = () => writerRef.current?.animateCharacter();
  const handlePause = () => writerRef.current?.pauseAnimation();

  return (
    <div>
      <div ref={containerRef} />
      <button onClick={handlePlay}>Play</button>
      <button onClick={handlePause}>Pause</button>
    </div>
  );
}
```

### Pattern 3: Debounced Dictionary Lookup on Hover
**What:** When hovering rapidly across characters, debounce the API call to avoid flooding the server.
**When to use:** Always for hover-triggered dictionary lookups.
**Example:**
```typescript
// Use existing use-debounce package (already installed)
import { useDebouncedCallback } from "use-debounce";

const fetchDictionaryData = useDebouncedCallback(
  async (word: string) => {
    const [lookupRes, charRes] = await Promise.all([
      fetch(`/api/dictionary/lookup?word=${encodeURIComponent(word)}`),
      // Only fetch character data for single characters
      word.length === 1
        ? fetch(`/api/dictionary/character?char=${encodeURIComponent(word)}`)
        : null,
    ]);
    // ...set state with results
  },
  150 // 150ms debounce for hover
);
```

### Pattern 4: Vocabulary Save/Unsave Toggle
**What:** POST to save, DELETE to unsave — optimistic UI update with rollback on failure.
**When to use:** For the bookmark button in the popup.
**Example:**
```typescript
// POST /api/vocabulary — save a word
// Body: { traditional, simplified, pinyin, jyutping, definitions }
// Returns: { id, ... } of saved entry

// DELETE /api/vocabulary?id=X — remove saved word
// Returns: { success: true }

// Client: optimistic toggle
const [isSaved, setIsSaved] = useState(false);
async function toggleSave() {
  setIsSaved(!isSaved); // optimistic
  try {
    if (!isSaved) {
      await fetch("/api/vocabulary", { method: "POST", body: ... });
    } else {
      await fetch(`/api/vocabulary?id=${savedId}`, { method: "DELETE" });
    }
  } catch {
    setIsSaved(isSaved); // rollback
  }
}
```

### Anti-Patterns to Avoid
- **Per-character Popover instances:** Never create a Radix Popover for each WordSpan. With 5000 characters, this creates 5000 Radix Popover component trees in the DOM.
- **Fetching dictionary data on render:** Dictionary lookups must be on-demand (hover/tap), never on initial render for all visible characters.
- **Synchronous HanziWriter creation:** HanziWriter.create() inserts SVG into the DOM. Must be in useEffect, never in render body.
- **Multiple Audio instances:** Never create a new Audio element without stopping the previous one. The useTTS hook already handles this with stop-before-play.
- **Uncontrolled popup positioning:** Always use Floating UI middleware (flip, shift) to prevent popup from going off-screen.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popup positioning near viewport edges | Manual coordinate calculation + overflow detection | Floating UI `flip()` + `shift()` middleware | Edge cases with scroll, zoom, mobile viewport, RTL are complex |
| Stroke order animation | Canvas drawing with SVG path parsing | HanziWriter (already installed) | Stroke data format, animation timing, quiz grading are deeply complex |
| TTS audio playback with overlap prevention | Raw Audio API management | useTTS hook (already built) | Blob URL caching, autoplay policy, unmount cleanup already handled |
| Chinese word segmentation for hover targets | Regex-based character splitting | Intl.Segmenter via segmentText() (already built) | Multi-character word boundaries require ICU dictionary data |
| Pinyin/Jyutping generation | Manual tone number to diacritic conversion | pinyin-pro + to-jyutping (already installed) | Polyphonic character resolution, tone mark placement, neutral tone handling |

**Key insight:** Phase 48 is primarily a UI assembly phase. Every data source and utility function is already built. The work is wiring existing APIs into a well-structured popup component.

## Common Pitfalls

### Pitfall 1: HanziWriter Instance Cleanup in React
**What goes wrong:** HanziWriter creates SVG elements inside the target container. If the character changes (user hovers a new character), the old SVG persists and stacks with the new one.
**Why it happens:** React's virtual DOM doesn't manage HanziWriter's direct DOM manipulation.
**How to avoid:** In the useEffect cleanup or before creating a new writer, clear the container: `containerRef.current.innerHTML = ""`. Also set `writerRef.current = null` to prevent calling methods on a stale instance.
**Warning signs:** Multiple overlapping stroke animations visible in the popup.

### Pitfall 2: Floating UI Virtual Element Stale Rect
**What goes wrong:** The popup appears at the wrong position or doesn't move when scrolling.
**Why it happens:** The virtual element's `getBoundingClientRect` captures a snapshot at hover time. If the user scrolls, the rect becomes stale.
**How to avoid:** Re-compute the rect on scroll or use `autoUpdate` from Floating UI. For a popup that disappears on scroll/mouseout, this is less critical — but if the popup persists while scrolling, add `autoUpdate`.
**Warning signs:** Popup positioned far from the hovered character after scrolling.

### Pitfall 3: Popup Flicker on Rapid Hover
**What goes wrong:** Moving the mouse quickly across characters causes the popup to flash on/off rapidly, creating visual noise.
**Why it happens:** Each mouseenter/mouseleave pair triggers show/hide. Without debounce, every pixel of mouse movement through word boundaries triggers state changes.
**How to avoid:** Use a 100-150ms debounce on showing the popup. For hiding, use a 200ms delay that cancels if the cursor enters the popup itself or a new word. ReaderTextArea already tracks `lastHoveredIndexRef` to avoid re-triggering for the same word.
**Warning signs:** Popup flashing rapidly when moving mouse across text.

### Pitfall 4: Mobile Touch vs Desktop Hover Conflict
**What goes wrong:** On touch devices, mouseenter fires on tap (simulated hover), causing the popup to appear and immediately close, or open then the tap registers as a click-through.
**Why it happens:** Touch devices simulate mouse events for compatibility. A single tap fires touchstart -> mouseenter -> click in sequence.
**How to avoid:** Detect touch devices via `window.matchMedia('(hover: none)')` or track `ontouchstart` in window. On touch: use click only (not hover) to open popup. Add tap-outside-to-close via a click handler on the document. The ReaderTextArea already provides separate `onWordHover` and `onWordClick` callbacks — use hover for desktop, click for mobile.
**Warning signs:** Popup that opens and immediately closes on mobile tap.

### Pitfall 5: Race Condition Between Dictionary Fetch and Character Change
**What goes wrong:** User hovers character A, API starts fetching. User quickly hovers character B. Response for A arrives after B's fetch started, overwriting B's data.
**Why it happens:** Uncontrolled concurrent fetch requests without cancellation.
**How to avoid:** Use AbortController to cancel the previous fetch when a new hover starts. Or use a request ID / stale check: only apply data if the activeWord still matches the word that was fetched.
**Warning signs:** Popup shows definition for a different character than the one being hovered.

### Pitfall 6: Popup Covering the Hovered Word
**What goes wrong:** Popup appears directly over the word the user is trying to read, forcing them to move the mouse to read the text underneath.
**Why it happens:** Default `placement: "bottom"` puts the popup below, which is fine. But `placement: "top"` can cover the word above in annotated mode where ruby text sits above characters.
**How to avoid:** Use `placement: "top"` with `flip()` middleware. The flip middleware will move it below if there's no room above. Add `offset(8)` for breathing room. In annotated mode (pinyin/jyutping above characters), the line-height is already 3 (set in ReaderTextArea), providing space for both the annotation and the popup offset.
**Warning signs:** User must move mouse off the word to read the popup, triggering mouseout which closes it.

## Code Examples

Verified patterns from official sources and the existing codebase:

### Floating UI Virtual Element in React
```typescript
// Source: Context7 /floating-ui/floating-ui, verified for @floating-ui/react-dom v2.x
import { useFloating, offset, flip, shift } from "@floating-ui/react-dom";

const [virtualEl, setVirtualEl] = useState<VirtualElement | null>(null);

const { refs, floatingStyles } = useFloating({
  elements: { reference: virtualEl },
  placement: "top",
  middleware: [offset(8), flip(), shift({ padding: 8 })],
});

// Update virtual element from ReaderTextArea onWordHover callback
function onWordHover(word: string, index: number, el: HTMLElement) {
  setVirtualEl({
    getBoundingClientRect: () => el.getBoundingClientRect(),
  });
}
```

### HanziWriter Create and Animate
```typescript
// Source: Context7 /websites/hanziwriter_docs, verified for hanzi-writer v3.7.3
import HanziWriter from "hanzi-writer";

const writer = HanziWriter.create(targetElement, character, {
  width: 120,
  height: 120,
  padding: 5,
  showOutline: true,
  strokeColor: "#e4e4e7",       // matches dark theme zinc-200
  radicalColor: "#22d3ee",      // cyan-400 highlight
  outlineColor: "#3f3f46",      // zinc-700
  strokeAnimationSpeed: 1,
  delayBetweenStrokes: 300,
  renderer: "svg",
  // CDN data loading (default) — no charDataLoader needed
});

writer.animateCharacter();      // play animation
writer.pauseAnimation();        // pause
writer.resumeAnimation();       // resume from pause
```

### useTTS Hook in Popup
```typescript
// Source: existing src/hooks/useTTS.ts (Phase 46)
const { speak, stop, isLoading, isPlaying, error } = useTTS();

// Mandarin pronunciation button
<button onClick={() => speak(character, { language: "zh-CN", rate: "slow" })}>
  {isPlaying ? <Volume2 className="animate-pulse" /> : <Volume2 />}
</button>

// Cantonese pronunciation button
<button onClick={() => speak(character, { language: "zh-HK", rate: "slow" })}>
  {isPlaying ? <Volume2 className="animate-pulse" /> : <Volume2 />}
</button>
```

### Dictionary API Response Shape
```typescript
// Source: existing src/app/api/dictionary/lookup/route.ts (Phase 45)
// GET /api/dictionary/lookup?word=你好
// Response:
{
  entries: [{
    id: "uuid",
    traditional: "你好",
    simplified: "你好",
    pinyin: "ni3 hao3",
    pinyinDisplay: "nǐ hǎo",
    jyutping: "nei5 hou2",
    definitions: ["hello", "how are you"],
    source: "both",        // "cedict" | "canto" | "both"
    isSingleChar: false,
  }]
}

// GET /api/dictionary/character?char=你
// Response:
{
  character: {
    character: "你",
    pinyin: ["ni3"],
    jyutping: ["nei5"],
    radical: "亻",
    radicalMeaning: "person",
    strokeCount: 7,
    decomposition: "⿰亻尔",
    etymologyType: "pictophonetic",
    etymologyHint: "person",
    etymologyPhonetic: "尔",
    etymologySemantic: "亻",
    definition: "you, second person pronoun",
    frequencyRank: 9,
    strokePaths: [...],    // SVG path data (JSONB)
    strokeMedians: [...],  // animation median points (JSONB)
  },
  examples: [
    { traditional: "你好", simplified: "你好", pinyin: "ni3 hao3",
      pinyinDisplay: "nǐ hǎo", definitions: ["hello"], source: "both" },
    // ... up to 20 examples ordered by frequency
  ]
}
```

### Vocabulary Save API Pattern
```typescript
// Source: existing vocabulary schema (Phase 44)
// POST /api/vocabulary
// Body: { traditional, simplified, pinyin, jyutping, definitions }
// Uses Clerk auth to get userId

import { db } from "@/db";
import { savedVocabulary } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// Check if already saved (prevent duplicates)
const existing = await db.select({ id: savedVocabulary.id })
  .from(savedVocabulary)
  .where(and(
    eq(savedVocabulary.userId, userId),
    eq(savedVocabulary.traditional, traditional)
  ));

if (existing.length > 0) {
  return NextResponse.json({ id: existing[0].id, alreadySaved: true });
}

const [saved] = await db.insert(savedVocabulary)
  .values({ userId, traditional, simplified, pinyin, jyutping, definitions })
  .returning({ id: savedVocabulary.id });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-element Popover instances | Single shared popup with virtual positioning | Always for high-count trigger scenarios | Performance: 1 DOM element vs thousands |
| Manual coordinate math for popups | Floating UI middleware (flip, shift, offset) | Standard since Floating UI v1 (2022) | Eliminates viewport edge bugs |
| Custom SVG stroke animation | HanziWriter library | Standard since 2018, v3.7.3 current | Handles 9K+ characters with CDN data |
| Audio element per component | Shared hook with blob URL cache | useTTS pattern (Phase 46) | Prevents memory leaks and overlap |

**Deprecated/outdated:**
- `hanzi` npm package for decomposition: Loads ~80MB into memory at startup; project uses DB-stored character_data instead
- `@floating-ui/react` (full version): Overkill for this use case; `@floating-ui/react-dom` (lighter) is sufficient and already installed
- Radix `Popover` for shared popup: Wrong abstraction for single-instance popup with dynamic virtual trigger

## Open Questions

1. **HanziWriter CDN vs DB data for stroke animation**
   - What we know: HanziWriter defaults to loading character data from its CDN (cdn.jsdelivr.net). Our character_data table also has strokePaths and strokeMedians from Make Me a Hanzi.
   - What's unclear: Whether HanziWriter's `charDataLoader` can accept the exact JSON format stored in our DB, or if it expects a different structure than what we seeded.
   - Recommendation: Use the default CDN loading initially (simplest). If CDN latency becomes an issue, implement a `charDataLoader` that reads from the character_data API. The CDN data is browser-cached aggressively, so latency is only on first load per character.

2. **Popup dismiss behavior on desktop**
   - What we know: Desktop uses hover to show popup. Popup must stay visible when cursor enters the popup itself. Popup should dismiss when cursor moves to a different word or leaves the text area.
   - What's unclear: Exact delay timing for the "mouse moved to popup" grace period.
   - Recommendation: Use a 200ms delay before hiding on mouseleave. If cursor enters the popup within 200ms, cancel the hide. This is the standard tooltip pattern from Floating UI documentation.

3. **Tone comparison visual design**
   - What we know: Side-by-side pinyin and jyutping display with tone highlighting. Mandarin has 4 tones + neutral, Cantonese has 6 tones.
   - What's unclear: How exactly to visually highlight similarities and differences between tones.
   - Recommendation: Use color-coded tone numbers: display pinyin in amber/yellow tones and jyutping in cyan tones (matching existing annotation color scheme). Show tone numbers in superscript alongside the romanization. When Mandarin and Cantonese tones are the "same" tone number, highlight with a shared underline or badge.

4. **Vocabulary "already saved" check**
   - What we know: Need to show filled/unfilled bookmark icon based on whether the word is already saved.
   - What's unclear: Whether to check on every popup open (API call) or maintain a client-side set.
   - Recommendation: Fetch the user's saved vocabulary IDs as a Set on reader page mount. Check the Set client-side for instant bookmark state. Update the Set optimistically on save/unsave.

## Sources

### Primary (HIGH confidence)
- Context7 `/floating-ui/floating-ui` — useFloating hook, virtual elements, middleware (offset, flip, shift)
- Context7 `/websites/hanziwriter_docs` — HanziWriter.create, animateCharacter, pauseAnimation, quiz, charDataLoader, all options
- Existing codebase: `src/hooks/useTTS.ts` — TTS hook API contract (speak, stop, isLoading, isPlaying, error)
- Existing codebase: `src/app/api/dictionary/lookup/route.ts` — Dictionary lookup response shape
- Existing codebase: `src/app/api/dictionary/character/route.ts` — Character detail response shape
- Existing codebase: `src/db/schema/dictionary.ts` — dictionaryEntries, characterData table schemas
- Existing codebase: `src/db/schema/vocabulary.ts` — savedVocabulary table schema
- Existing codebase: `src/components/reader/ReaderTextArea.tsx` — onWordHover, onWordClick prop interface
- Existing codebase: `src/components/reader/WordSpan.tsx` — data-word, data-index attributes on spans

### Secondary (MEDIUM confidence)
- `@floating-ui/react-dom` npm (v2.1.7) — installed version matches Context7 docs patterns
- `hanzi-writer` npm (v3.7.3) — installed version matches Context7 docs patterns
- Floating UI docs: virtual elements pattern for single shared popup

### Tertiary (LOW confidence)
- Tone comparison visual design — no established pattern found in Chinese learning apps; our design will be original

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and verified via Context7
- Architecture: HIGH — single shared popup pattern well-documented in Floating UI, all integration points exist
- Pitfalls: HIGH — based on direct codebase inspection of existing components and common React+imperative-lib patterns
- Vocabulary API: HIGH — schema exists, follows established project API patterns
- Tone comparison UX: MEDIUM — original design, no reference implementation found

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable libraries, no fast-moving dependencies)
