# Phase 52: Dictionary & Vocabulary Integration - Research

**Researched:** 2026-02-09
**Domain:** Chinese word segmentation in transcript context, dictionary popup reuse, phonetic annotations, T/S conversion, vocabulary highlighting
**Confidence:** HIGH

## Summary

Phase 52 transforms the plain-text transcript panel (built in Phase 51) into an interactive word-level learning surface. Every word in the transcript must be segmented, hoverable/tappable, and wired to the existing CharacterPopup dictionary infrastructure from v6.0 (Phases 45-48). The phase also adds phonetic annotation modes (pinyin/jyutping/plain), Traditional/Simplified conversion, and vocabulary highlighting with known/unknown word counts.

The key architectural insight is that nearly all the required infrastructure already exists: `segmentText()` (Intl.Segmenter), `WordSpan` (interactive word component with annotations), `useCharacterPopup` hook (dictionary fetch, popup state, vocabulary save/unsave), `CharacterPopup` (Floating UI positioned popup with TTS, stroke animation, radical breakdown), `PhoneticText` (font-based phonetic annotation wrapper), `convertScript()` (opencc-js T/S conversion), and the `/api/vocabulary` and `/api/dictionary/lookup` API routes. The work is primarily **integration and wiring**, not building new systems.

The transcript panel currently renders plain text in `TranscriptLine` components. Phase 52 must replace that plain text with segmented `WordSpan` components using event delegation, and lift the `useCharacterPopup` hook and `CharacterPopup` component into the `ListeningClient` orchestrator (mirroring the exact pattern used by `ReaderClient`). The vocabulary API already returns the full saved vocabulary set on mount, providing the data needed for highlight styling and word counts.

**Primary recommendation:** Follow the ReaderClient pattern exactly -- use `useCharacterPopup` at the page level, pass `showPopup`/`hidePopup` callbacks down, render a single `CharacterPopup` instance, segment each caption line's text via `segmentText()`, render `WordSpan` components with event delegation, and add toolbar controls for annotation mode, script mode, and vocabulary stats.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Intl.Segmenter` | Built-in | Word-level segmentation of caption text | Zero deps, already proven in `src/lib/segmenter.ts` |
| `@floating-ui/react-dom` | ^2.1.7 | Popup positioning for CharacterPopup | Already installed, used by CharacterPopup |
| `opencc-js` | ^1.0.5 | Traditional/Simplified conversion | Already installed, used by `src/lib/chinese-convert.ts` |
| `pinyin-pro` | ^3.28.0 | Pinyin annotation in WordSpan | Already installed, used by WordSpan |
| `to-jyutping` | ^3.1.1 | Jyutping annotation in WordSpan | Already installed, used by WordSpan |
| `use-debounce` | ^10.1.0 | Debounced dictionary fetch in useCharacterPopup | Already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | (installed) | Icons for toolbar controls (Languages, Type, BarChart3) | Annotation mode/script/vocab stat icons |
| `cn()` via `clsx` + `tailwind-merge` | (installed) | Conditional styling for vocabulary highlights | Known/unknown word distinction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reusing existing WordSpan | Building a new TranscriptWordSpan | No benefit; WordSpan already handles all annotation modes, event delegation data attributes, and memoization. Reuse directly. |
| Font-based annotations (PhoneticText) | HTML ruby annotations via WordSpan | WordSpan already handles ruby annotations per-word; PhoneticText is a wrapper for entire text blocks. For transcript, WordSpan ruby is better because it preserves per-word interactivity. |
| Client-side vocabulary set (Map) | Server-side pre-computed highlights | Client set is already loaded by useCharacterPopup on mount; checking `savedVocabMap.has(word)` is O(1). No API call needed per word. |

**Installation:**
```bash
# No new dependencies needed. All tools are already installed.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/video/
│   ├── TranscriptPanel.tsx      # MODIFY: add annotation/script/vocab props
│   ├── TranscriptLine.tsx       # MODIFY: replace plain text with WordSpan segments
│   └── TranscriptToolbar.tsx    # NEW: annotation mode, script mode, vocab stats
├── hooks/
│   ├── useCharacterPopup.ts     # REUSE as-is (already provides savedVocabMap)
│   └── useVideoSync.ts          # REUSE as-is
├── lib/
│   ├── segmenter.ts             # REUSE as-is
│   └── chinese-convert.ts       # REUSE as-is
└── app/(dashboard)/dashboard/listening/
    └── ListeningClient.tsx      # MODIFY: integrate popup, toolbar, vocab tracking
```

### Pattern 1: ReaderClient Integration Pattern (PROVEN)
**What:** Wire `useCharacterPopup` at the page-level orchestrator, pass callbacks down, render one `CharacterPopup` instance.
**When to use:** Whenever a page needs interactive Chinese text with dictionary popup.
**Example (from existing ReaderClient.tsx):**
```typescript
// Source: src/app/(dashboard)/dashboard/reader/ReaderClient.tsx
export function ReaderClient() {
  const {
    activeWord, isVisible, lookupData, characterData,
    isLoading, error, virtualEl,
    showPopup, hidePopup, cancelHide, isSaved, toggleSave,
  } = useCharacterPopup();

  const handleWordHover = useCallback(
    (word: string, _index: number, element: HTMLElement) => {
      showPopup(word, element);
    },
    [showPopup],
  );

  return (
    <>
      {/* Text area with WordSpan components */}
      <ReaderTextArea onWordHover={handleWordHover} onWordClick={handleWordHover} />

      {/* Single popup instance */}
      <CharacterPopup
        isVisible={isVisible}
        virtualEl={virtualEl}
        activeWord={activeWord}
        lookupData={lookupData}
        characterData={characterData}
        isLoading={isLoading}
        error={error}
        isSaved={activeWord ? isSaved(lookupData?.entries[0]?.traditional ?? activeWord) : false}
        onToggleSave={() => { const entry = lookupData?.entries[0]; if (entry) toggleSave(entry); }}
        onHide={hidePopup}
        onCancelHide={cancelHide}
      />
    </>
  );
}
```

### Pattern 2: Event Delegation for WordSpan Hover/Click
**What:** Attach a single `onMouseOver`/`onClick` handler to the transcript container, then walk up the DOM to find `[data-word]` ancestor.
**When to use:** When rendering many WordSpan components (100+ per transcript).
**Example (from existing ReaderTextArea.tsx):**
```typescript
// Source: src/components/reader/ReaderTextArea.tsx
function findWordElement(target: EventTarget): HTMLElement | null {
  const el = target as HTMLElement;
  if (!el.closest) return null;
  return el.closest("[data-word]") as HTMLElement | null;
}

const handleMouseOver = useCallback((e: React.MouseEvent) => {
  const wordEl = findWordElement(e.target);
  if (!wordEl) return;
  const word = wordEl.getAttribute("data-word");
  const indexStr = wordEl.getAttribute("data-index");
  if (!word || indexStr === null) return;
  onWordHover(word, Number(indexStr), wordEl);
}, [onWordHover]);
```

### Pattern 3: Vocabulary Highlight via savedVocabMap
**What:** The `useCharacterPopup` hook already loads the user's saved vocabulary on mount into a `Map<string, string>` (traditional -> id). Use `savedVocabMap.has(word)` to style known words differently.
**When to use:** Any time vocabulary highlighting is needed.
**Key detail:** The `isSaved` function from `useCharacterPopup` checks `savedVocabMap.has(traditional)`. For transcript words, we need access to the raw map (or the `isSaved` function) to determine highlighting. Currently `isSaved` is exposed by the hook, but it takes a `traditional` form. Since transcript text may be in simplified, we need to check both forms or normalize.

**Important consideration:** The `savedVocabulary` table stores words by `traditional` form. If the transcript displays simplified text, we need to also check against `simplified` form. The vocabulary API currently only returns `{ id, traditional }`. For highlighting, we have two options:
1. Expand the API to also return `simplified` and build a dual-key map.
2. Segment words are already in the displayed form; dictionary entries have both forms. The simplest approach: expand the vocabulary API to return `simplified` along with `traditional`, build two lookup maps, and check both.

### Pattern 4: T/S Conversion on Caption Text
**What:** Apply `convertScript()` to each caption line's text when scriptMode changes.
**When to use:** When user toggles Traditional/Simplified in the transcript toolbar.
**Key detail:** `convertScript()` is async (lazy loads opencc-js on first call). For the transcript, apply conversion to all caption texts in a single pass when the mode changes, caching the results. The ReaderClient already demonstrates this pattern with `rawText -> displayText` via useEffect.

```typescript
// Source: src/lib/chinese-convert.ts
export async function convertScript(
  text: string,
  from: ScriptMode,
  to: ScriptMode,
): Promise<string> { /* ... */ }
```

For the transcript, convert each caption's text and store the converted versions in state. Segment the converted text (not the original) for display.

### Anti-Patterns to Avoid
- **Per-WordSpan event handlers:** Do NOT attach individual onMouseOver/onClick to each WordSpan. Use event delegation on the container (one handler) with `data-word` / `data-index` attributes. The ReaderTextArea already proves this pattern.
- **Per-character Radix Popover instances:** Do NOT wrap each word in a Radix Popover. Use a single shared CharacterPopup with Floating UI virtual positioning. This is already the established pattern.
- **Re-segmenting on every render:** `segmentText()` is synchronous and fast, but should still be memoized with `useMemo` keyed on the text content. The ReaderClient already does this.
- **Fetching vocabulary per word:** Do NOT make an API call per word to check if it's saved. Load the full vocabulary set once on mount (already done by `useCharacterPopup`).
- **Storing converted text per caption in DB:** Keep the original text in the DB. Apply T/S conversion client-side on display. This avoids duplicating data and keeps the single source of truth.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chinese word segmentation | Custom tokenizer | `segmentText()` wrapping `Intl.Segmenter` | Already built at `src/lib/segmenter.ts`, zero deps, proven |
| Dictionary popup | New popup component | `CharacterPopup` + `useCharacterPopup` | Already built with TTS, stroke animation, radical breakdown, save/unsave |
| Pinyin/Jyutping annotations | Custom annotation renderer | `WordSpan` component | Already handles all 3 modes (pinyin, jyutping, plain) with memoization |
| T/S conversion | Character mapping table | `convertScript()` wrapping opencc-js | Already built at `src/lib/chinese-convert.ts` with lazy loading |
| Vocabulary save/unsave | Custom API + state | `useCharacterPopup` hook | Already handles optimistic save/unsave with API calls |
| Popup positioning | Manual rect calculation | Floating UI via `CharacterPopup` | Already handles flip, shift, offset middleware |

**Key insight:** Phase 52 is an integration phase, not a building phase. Every major subsystem exists. The work is wiring existing components into the transcript context and adding a toolbar with controls.

## Common Pitfalls

### Pitfall 1: Vocabulary Check Across Script Forms
**What goes wrong:** Student views transcript in simplified, but their saved vocabulary stores the traditional form. `isSaved("计算机")` returns false even though "計算機" is saved.
**Why it happens:** The `savedVocabMap` in `useCharacterPopup` is keyed by `traditional` only. Transcript text may be displayed in simplified form (after T/S conversion).
**How to avoid:** Either (a) expand the vocabulary API to return `simplified` alongside `traditional` and build a dual-key lookup, or (b) before checking `isSaved`, look up the word in the dictionary to get both forms and check both. Option (a) is simpler and more efficient -- one extra column in the GET response.
**Warning signs:** Vocabulary highlights appear only when viewing in traditional mode, disappear in simplified mode.

### Pitfall 2: Event Delegation Across Nested Ruby Elements
**What goes wrong:** When WordSpan renders in pinyin/jyutping mode, each character is wrapped in `<ruby>` with `<rt>` sub-elements. A click on the `<rt>` (annotation text) doesn't bubble up to the `[data-word]` span correctly.
**Why it happens:** `closest("[data-word]")` walks up the DOM tree. If the user clicks the `<rt>` element inside a `<ruby>` inside the `[data-word]` span, it should find the ancestor. This actually works correctly because `closest()` searches ancestors, and `<rt>` is inside the `[data-word]` span.
**How to avoid:** No special handling needed -- `closest("[data-word]")` handles this correctly. But verify by testing clicks on annotation text.
**Warning signs:** Clicking on pinyin/jyutping text above a character doesn't trigger the popup.

### Pitfall 3: Auto-Scroll Conflict with Popup Interaction
**What goes wrong:** Student hovers a word to see the popup, but the auto-scroll (from Phase 51) moves the transcript, causing the hovered word to move out from under the cursor, closing the popup.
**Why it happens:** `useVideoSync` updates `activeCaptionIndex` every 1-5 seconds, which triggers `scrollIntoView` on the active line. If the student is reading a different line and hovering a word, the scroll yanks the content away.
**How to avoid:** The TranscriptPanel already has user-scroll detection that pauses auto-scroll for 4 seconds. Extend this: when the popup is visible (`isVisible` from `useCharacterPopup`), suppress auto-scroll entirely. Resume auto-scroll when the popup closes.
**Warning signs:** Popup flickers or closes unexpectedly while video is playing.

### Pitfall 4: Segmentation Mismatch Between Display and Lookup
**What goes wrong:** `segmentText()` segments "你好世界" as ["你好", "世界"], but the dictionary has an entry for "你" and "好" separately, not "你好" as a compound. The popup shows "你好" but the dictionary lookup returns no results.
**Why it happens:** Intl.Segmenter uses ICU dictionary data which may group characters differently than CC-CEDICT entries.
**How to avoid:** The existing CharacterPopup already handles this gracefully -- it shows "No dictionary entry found" with guidance. The `useCharacterPopup` hook searches by both traditional and simplified forms. Most common words like "你好" DO have CEDICT entries. For edge cases, the individual character fallback (clicking individual characters) is available.
**Warning signs:** Common words showing "No dictionary entry found" -- indicates segmentation is too aggressive or too conservative.

### Pitfall 5: Performance with Many Segmented Lines
**What goes wrong:** A long video may have 200+ caption lines. Segmenting all lines and rendering WordSpan components for every line (even offscreen ones) causes initial render lag.
**Why it happens:** `segmentText()` is fast (~1ms per line), but rendering 200 lines x 10 words/line = 2000 WordSpan components at once with ruby annotations creates significant DOM.
**How to avoid:** Only segment and render WordSpan components for visible lines. For offscreen lines, render plain text (the current TranscriptLine behavior). Use the scroll container's viewport to determine which lines are near-visible. Alternatively, accept the initial cost -- 2000 memoized spans is manageable on modern browsers.
**Warning signs:** Noticeable stutter when first loading a long transcript with annotations enabled.

### Pitfall 6: Script Conversion Async Delay
**What goes wrong:** User toggles from "Original" to "Simplified" and sees a brief flash of original text before conversion completes.
**Why it happens:** `convertScript()` is async because opencc-js is lazy-loaded via dynamic import. First call loads the ~2MB dictionary data.
**How to avoid:** Show a subtle loading indicator during conversion (the ReaderClient already does this with `isConverting` state). Pre-load the converter on page mount if the user's last-used script mode was not "original". Cache converted text so toggling back and forth is instant after first conversion.
**Warning signs:** Text flickers between scripts when toggling, or the toggle feels unresponsive.

## Code Examples

### Segmenting a Caption Line
```typescript
// Source: src/lib/segmenter.ts (existing, proven)
import { segmentText, type WordSegment } from "@/lib/segmenter";

const caption = "你好，我是学生。";
const segments = segmentText(caption);
// => [
//   { text: "你好", index: 0, isWordLike: true },
//   { text: "，", index: 2, isWordLike: false },
//   { text: "我", index: 3, isWordLike: true },
//   { text: "是", index: 4, isWordLike: true },
//   { text: "学生", index: 5, isWordLike: true },
//   { text: "。", index: 7, isWordLike: false },
// ]
```

### Rendering WordSpans in a Transcript Line
```typescript
// Pattern from existing ReaderTextArea.tsx, adapted for transcript
import { WordSpan, type AnnotationMode } from "@/components/reader/WordSpan";
import { segmentText } from "@/lib/segmenter";
import { useMemo } from "react";

function TranscriptLineContent({
  text,
  annotationMode,
}: {
  text: string;
  annotationMode: AnnotationMode;
}) {
  const segments = useMemo(() => segmentText(text), [text]);

  return (
    <>
      {segments.map((seg, i) => (
        <WordSpan
          key={i}
          text={seg.text}
          index={i}
          isWordLike={seg.isWordLike}
          annotationMode={annotationMode}
        />
      ))}
    </>
  );
}
```

### Vocabulary Highlight Styling
```typescript
// Extend WordSpan or wrap it to add vocabulary highlight
// The data-word attribute is already set by WordSpan -- use CSS to style
// known words differently based on a parent class or data attribute.

// Option A: CSS-only approach with data attributes
// In the transcript container, add data-known="true" to known words
<span data-word="你好" data-known="true" className="...">你好</span>

// Option B: Pass isKnown prop to a modified WordSpan
// Add optional isKnown prop that applies a distinct background
const KNOWN_WORD_CLASS = "bg-emerald-500/10 border-b border-emerald-500/30";
const UNKNOWN_WORD_CLASS = ""; // default, no special styling
```

### Word Count Computation
```typescript
// Count known vs unknown words for the current video's transcript
function computeVocabStats(
  captions: { text: string }[],
  savedVocabSet: Set<string>, // set of traditional forms
): { known: number; unknown: number; total: number } {
  const uniqueWords = new Set<string>();

  for (const caption of captions) {
    const segments = segmentText(caption.text);
    for (const seg of segments) {
      if (seg.isWordLike) {
        uniqueWords.add(seg.text);
      }
    }
  }

  let known = 0;
  let unknown = 0;
  for (const word of uniqueWords) {
    if (savedVocabSet.has(word)) {
      known++;
    } else {
      unknown++;
    }
  }

  return { known, unknown, total: uniqueWords.size };
}
```

### T/S Conversion on Caption Array
```typescript
// Convert all captions when script mode changes
import { convertScript, type ScriptMode } from "@/lib/chinese-convert";

async function convertCaptions(
  captions: { text: string; startMs: number; endMs: number; sequence: number }[],
  scriptMode: ScriptMode,
): Promise<string[]> {
  if (scriptMode === "original") {
    return captions.map((c) => c.text);
  }

  // Convert all texts in parallel
  const converted = await Promise.all(
    captions.map((c) => convertScript(c.text, "original", scriptMode))
  );
  return converted;
}
```

## Existing Infrastructure Inventory

### Components (REUSE)
| Component | Location | What It Does | How Phase 52 Uses It |
|-----------|----------|-------------|---------------------|
| `CharacterPopup` | `src/components/reader/CharacterPopup.tsx` | Floating UI popup with dictionary entry, TTS, stroke animation, save button | Mount once in ListeningClient, position over hovered transcript word |
| `WordSpan` | `src/components/reader/WordSpan.tsx` | Memoized word span with pinyin/jyutping/plain annotation modes, data-word/data-index attrs | Render inside each TranscriptLine to replace plain text |
| `PopupHeader` | `src/components/reader/popup/PopupHeader.tsx` | Word, pinyin, jyutping, definitions, TTS buttons | Sub-component of CharacterPopup (indirect reuse) |
| `SaveVocabularyButton` | `src/components/reader/popup/SaveVocabularyButton.tsx` | Bookmark toggle for saving words | Sub-component of CharacterPopup (indirect reuse) |
| `ToneComparison` | `src/components/reader/popup/ToneComparison.tsx` | Per-character Mandarin/Cantonese tone display | Sub-component of CharacterPopup (indirect reuse) |
| `RadicalBreakdown` | `src/components/reader/popup/RadicalBreakdown.tsx` | Radical, decomposition, etymology | Sub-component of CharacterPopup (indirect reuse) |
| `StrokeAnimation` | `src/components/reader/popup/StrokeAnimation.tsx` | HanziWriter stroke animation | Sub-component of CharacterPopup (indirect reuse) |
| `ExampleWords` | `src/components/reader/popup/ExampleWords.tsx` | Example words containing the character | Sub-component of CharacterPopup (indirect reuse) |
| `PhoneticText` | `src/components/phonetic/PhoneticText.tsx` | Font-based phonetic annotation wrapper | NOT directly used -- WordSpan handles annotations per-word with ruby instead |
| `TranscriptPanel` | `src/components/video/TranscriptPanel.tsx` | Scrollable caption list with auto-scroll | MODIFY: add props for annotation mode, script mode, vocab set |
| `TranscriptLine` | `src/components/video/TranscriptLine.tsx` | Single caption line (timestamp + text) | MODIFY: replace plain text with segmented WordSpan components |

### Hooks (REUSE)
| Hook | Location | What It Does | How Phase 52 Uses It |
|------|----------|-------------|---------------------|
| `useCharacterPopup` | `src/hooks/useCharacterPopup.ts` | Popup state, dictionary fetch, vocabulary tracking | Mount in ListeningClient (same pattern as ReaderClient) |
| `useVideoSync` | `src/hooks/useVideoSync.ts` | Polls YouTube player, finds active caption | Already wired in ListeningClient (no changes needed) |
| `useLanguagePreference` | `src/hooks/useLanguagePreference.ts` | User's Mandarin/Cantonese preference | Determine default annotation mode |
| `useTTS` | `src/hooks/useTTS.ts` | Text-to-speech playback | Already used by CharacterPopup (indirect reuse) |

### Libraries (REUSE)
| Library | Location | What It Does | How Phase 52 Uses It |
|---------|----------|-------------|---------------------|
| `segmentText` | `src/lib/segmenter.ts` | Intl.Segmenter wrapper for Chinese word segmentation | Segment each caption line's text |
| `convertScript` | `src/lib/chinese-convert.ts` | opencc-js T/S conversion with lazy loading | Convert caption text when script mode changes |
| `applyThirdToneSandhi` | `src/lib/tone-sandhi.ts` | Third-tone sandhi rules for pinyin | Used internally by WordSpan (indirect reuse) |

### API Routes (REUSE)
| Route | Location | What It Does | How Phase 52 Uses It |
|-------|----------|-------------|---------------------|
| `GET /api/dictionary/lookup?word=X` | `src/app/api/dictionary/lookup/route.ts` | Dictionary entry lookup | Called by useCharacterPopup on word hover (no changes needed) |
| `GET /api/vocabulary` | `src/app/api/vocabulary/route.ts` | User's saved vocabulary list | Called by useCharacterPopup on mount; provides data for vocab highlights |
| `POST /api/vocabulary` | `src/app/api/vocabulary/route.ts` | Save word to vocabulary | Called by useCharacterPopup toggleSave (no changes needed) |
| `DELETE /api/vocabulary?id=X` | `src/app/api/vocabulary/route.ts` | Remove saved word | Called by useCharacterPopup toggleSave (no changes needed) |

### DB Schema (REUSE)
| Table | Location | Relevant Fields |
|-------|----------|----------------|
| `dictionary_entries` | `src/db/schema/dictionary.ts` | traditional, simplified, pinyin, pinyinDisplay, jyutping, definitions, source, isSingleChar |
| `character_data` | `src/db/schema/dictionary.ts` | character, radical, strokeCount, decomposition, etymology*, strokePaths, strokeMedians |
| `saved_vocabulary` | `src/db/schema/vocabulary.ts` | userId, traditional, simplified, pinyin, jyutping, definitions |
| `video_sessions` | `src/db/schema/video.ts` | userId, youtubeVideoId, captionSource, captionLang, captionCount |
| `video_captions` | `src/db/schema/video.ts` | videoSessionId, sequence, startMs, endMs, text |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-word Popover instances | Single shared popup via Floating UI virtual element | v6.0 (Phase 46) | Eliminates thousands of DOM nodes; O(1) popup instances |
| Server-side segmentation (jieba) | Client-side Intl.Segmenter | v6.0 (Phase 45) | Zero deps, no server round-trip for segmentation |
| Full vocabulary re-fetch on each page | Load once on mount, optimistic updates | v6.0 (Phase 47) | Single GET on mount, Map-based O(1) lookups |

**Deprecated/outdated:**
- None. All existing infrastructure is current and well-tested.

## Open Questions

1. **Vocabulary highlight across script forms**
   - What we know: `savedVocabulary` stores `traditional` and `simplified` forms. The `useCharacterPopup` hook builds a Map keyed by `traditional` only. The GET /api/vocabulary returns only `{ id, traditional }`.
   - What's unclear: When transcript is displayed in simplified, how to efficiently check if a word is known.
   - Recommendation: Expand GET /api/vocabulary to also return `simplified`. Build two lookup Sets (one for traditional, one for simplified). Check the displayed form against the appropriate Set. This is a minimal API change (one extra column) with no performance impact.

2. **Auto-scroll suppression during popup interaction**
   - What we know: TranscriptPanel has user-scroll detection (pauses auto-scroll for 4 seconds). The popup can appear anywhere in the transcript.
   - What's unclear: Whether 4-second pause is sufficient, or if auto-scroll should be suppressed entirely while popup is visible.
   - Recommendation: Pass `isPopupVisible` as a prop to TranscriptPanel. When true, skip the auto-scroll behavior entirely. This is a simple boolean check in the existing auto-scroll useEffect.

3. **Annotation mode line height in transcript context**
   - What we know: WordSpan with pinyin/jyutping mode renders ruby annotations that need extra vertical space (line-height: 3 vs 2 for plain). ReaderTextArea adjusts line height based on annotation mode.
   - What's unclear: Whether the compact transcript panel has room for ruby annotations without making each line too tall.
   - Recommendation: Use a slightly smaller rt font size in transcript context (e.g., `text-[0.5em]` instead of `text-[0.6em]`) and reduced line height. Test visually. Consider making annotation mode available only in the transcript panel (not on the video overlay) to contain the layout impact.

4. **Word count freshness after saving a new word**
   - What we know: `useCharacterPopup` updates `savedVocabMap` optimistically when a word is saved via the popup. Vocab stats (known/unknown count) are derived from this map.
   - What's unclear: Whether the word count display should update in real-time as words are saved.
   - Recommendation: Yes, derive word count from the `savedVocabMap` state. Since the map updates optimistically, the count will update instantly when a word is saved. Use `useMemo` to recompute on map changes.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- All component, hook, library, and API code reviewed directly from the repository
  - `src/components/reader/CharacterPopup.tsx` -- Popup component
  - `src/components/reader/WordSpan.tsx` -- Interactive word span
  - `src/hooks/useCharacterPopup.ts` -- Popup state hook
  - `src/lib/segmenter.ts` -- Segmentation utility
  - `src/lib/chinese-convert.ts` -- T/S conversion
  - `src/app/api/vocabulary/route.ts` -- Vocabulary API
  - `src/app/api/dictionary/lookup/route.ts` -- Dictionary API
  - `src/app/(dashboard)/dashboard/reader/ReaderClient.tsx` -- Reader integration pattern
  - `src/app/(dashboard)/dashboard/listening/ListeningClient.tsx` -- Current listening lab page
  - `src/components/video/TranscriptPanel.tsx` -- Current transcript component
  - `src/components/video/TranscriptLine.tsx` -- Current line component

### Secondary (MEDIUM confidence)
- `.planning/research/v6-dictionary-data.md` -- v6.0 dictionary data research (comprehensive, proven by implementation)
- `.planning/research/v6-reader-ux.md` -- v6.0 reader UX research (patterns validated by shipped Reader page)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already installed and proven in the Reader feature
- Architecture: HIGH -- Following the exact same pattern as the Reader page (ReaderClient), which is shipped and working
- Pitfalls: HIGH -- Most pitfalls are specific to integrating existing systems; root causes are well-understood from v6.0 experience
- Integration complexity: LOW-MEDIUM -- Work is primarily wiring, not building; the main risk is auto-scroll/popup interaction

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable -- all dependencies are mature and already in use)
