# Research: Chinese Text Reader UX & Architecture

**Project:** CantoMando Blueprint v6.0 Reading & Dictionary
**Researched:** 2026-02-08
**Overall confidence:** HIGH (existing stack already has key pieces; domain well-studied)

---

## 1. Existing Chinese Reader Apps -- Landscape Analysis

### Pleco Reader

**What it does well:**
- Tap any word in a document/clipboard and instantly see the full dictionary entry (definition, pinyin, stroke order, example sentences) in a popup panel
- Document Reader supports .txt, .pdf, Word, and web pages
- Clipboard Reader is free -- paste any Chinese text and get instant lookup
- OCR mode reads characters from camera/screen (paid add-on)
- Lookup is **word-aware** -- tapping a character within a multi-character word selects the whole word, not just the character

**UX pattern:** Bottom panel dictionary entry (not inline popup). Tap to look up, panel slides up from bottom. User reads text in top half, dictionary in bottom half. This split-view is the gold standard for mobile dictionary reading.

**Weakness:** Pleco is a dictionary-first app. For long-form reading, the experience is functional but not optimized -- no graded content, no progress tracking, no phonetic annotations inline.

**Confidence:** HIGH (official docs at android.pleco.com/manual/310/reader.html + multiple review sources)

### Du Chinese

**What it does well:**
- **Tap-and-hold** on any character shows pinyin, hanzi, and English translation in a top bar
- **Pinyin toggle** above characters with "Difficult words only" mode that auto-hides pinyin for words below the story's level -- this is a standout feature
- **Sentence-level English translation** across the top, tap to show/hide
- **Audio sync** -- highlighted words synchronize with audio playback (karaoke-style)
- **6 difficulty levels** from elementary to master, with stories getting progressively longer
- **Audiobook mode** for listening-only practice
- Progress charts tracking lessons read, words read, characters read

**UX pattern:** Clean, full-width text display. Pinyin annotations appear above characters (small, light-colored). Tapping a word highlights it and shows definition in a persistent top bar rather than a floating popup. This avoids popup occlusion issues.

**What users like:** "The design of this app is absurdly good" -- multiple reviewers praise the clean interface. Quick loading. Intuitive reading flow.

**What users complain about:** No Cantonese support (Mandarin only). Premium paywall hits quickly. No custom text import -- only their curated content.

**Confidence:** HIGH (multiple detailed reviews from ltl-school.com, flexiclasses.com, alllanguageresources.com)

### The Chairman's Bao (TCB)

**What it does well:**
- **News-based graded reading** -- 9,500+ articles at HSK 1-6+ levels, several new articles daily
- **Pop-up dictionary** on word tap
- **Grammar notes** inline with reading content
- **Stroke order** and writing practice
- **Offline mode** for saved articles
- Cross-device sync (web, iOS, Android)

**UX pattern:** Article-based layout similar to a news app. Clean typography. Dictionary popup on tap. Grammar points highlighted inline. More content-focused than Pleco's dictionary-first approach.

**Weakness:** Limited interactive exercises. Reading and listening focused -- no speaking practice. No Cantonese support.

**Confidence:** HIGH (multiple reviews, official site, App Store listing)

### Readibu

**What it does well (unique patterns):**
- **Import-friendly** -- reads Chinese web novels, short stories, children's stories from URLs or pasted text
- **Simplified-Traditional conversion** built in
- **Pinyin/Zhuyin display** over words (user toggleable)
- **Text-to-speech** for read-aloud
- **Popover Quiz Mode** (premium) -- quizzes you on words while reading
- **Smart Name Recognition** (premium) -- identifies character names in novels
- **Syntax Analysis** (premium) -- breaks down sentence grammar

**UX pattern:** Full-page reader with configurable overlays. Pop-up dictionary on tap. Settings panel for display preferences (font size, background, annotation type).

**Confidence:** MEDIUM (App Store + Google Play descriptions, limited independent reviews)

### Dong Chinese

**What it does well (unique patterns):**
- **Component breakdown** is the standout feature -- decomposes characters into meaningful components rather than just traditional radicals
- Wiki-style character entries showing stroke order, pronunciations, definitions, origins, and component breakdowns
- **8 character construction categories** (different from the traditional 6-category system)
- Covers first 1000 difficulty levels based on graded readers + frequency + standardized tests
- Free and open-source character wiki

**UX pattern:** Encyclopedia/wiki layout for character study. Not a continuous reader -- more of a reference tool with structured character exploration.

**Confidence:** MEDIUM (official site dong-chinese.com/wiki, limited review coverage)

### HanziCraft

**What it does well:** Detailed character decomposition with visual breakdown of radicals and components. Shows character etymology and stroke order. Clean web-based interface.

**UX pattern:** Single-character lookup tool, not a continuous reader. Enter a character, see its full breakdown.

**Confidence:** LOW (limited search results -- need direct verification)

### Synthesis: What the CantoMando Reader Should Learn

| Pattern | Source App | Adopt? | Why |
|---------|-----------|--------|-----|
| Tap-to-lookup with popup/panel | All apps | YES | Core expected feature |
| Pinyin annotations above text | Du Chinese | YES | Already have phonetic fonts for this |
| "Difficult words only" annotation mode | Du Chinese | DEFER | Nice-to-have, requires word-level difficulty data |
| Sentence-level English translation | Du Chinese | DEFER | Could be AI-generated later |
| Component/radical breakdown in popup | Dong Chinese | YES | High learning value for character study |
| Simplified-Traditional toggle | Readibu | YES | Already in requirements |
| TTS read-aloud | Readibu/TCB | YES | Azure TTS already configured |
| Custom text import (paste + file) | Pleco/Readibu | YES | Already in requirements |
| Audio-synced highlighting | Du Chinese | DEFER | Complex, not in v6.0 scope |
| Graded content library | Du Chinese/TCB | NO | Content comes from lessons, not built-in library |

**Key insight for this project:** No existing app supports **dual Cantonese/Mandarin** annotations. This is the primary differentiator. The annotation mode selector (Jyutping/Pinyin/Plain) is unique in the market.

---

## 2. Chinese Text Segmentation

Chinese text has no spaces between words. "I love eating rice" in Chinese is "我爱吃饭" -- four characters, but the segmentation is "我/爱/吃饭" (I / love / eat-rice). Correct segmentation matters for:
- Knowing which characters form a word (for dictionary lookup)
- Placing annotations correctly (pinyin for "吃饭" vs "吃" + "饭")
- Touch/click target boundaries

### Option A: Intl.Segmenter (RECOMMENDED)

**What it is:** Built-in browser/Node.js API for locale-aware text segmentation. Part of ECMAScript Intl specification.

**Browser support (Baseline April 2024):**
- Chrome 87+ (Dec 2020)
- Edge 87+ (Dec 2020)
- Safari 14.1+ (Apr 2021)
- Firefox 125+ (Apr 2024)

**Node.js support:** Node.js 16+ (native V8 ICU data)

**Usage:**
```typescript
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const segments = segmenter.segment('我爱吃饭');
// Yields: "我" (word), "爱" (word), "吃饭" (word)
```

**Pros:**
- Zero dependencies -- built into the runtime
- Works on both server (Node.js 16+) and client (all modern browsers)
- No dictionary files to load (uses ICU data bundled with the engine)
- Fast -- native C++ implementation, no JS overhead
- Handles both Simplified and Traditional Chinese
- No install size impact

**Cons:**
- Accuracy is "good enough" but not as precise as jieba for complex NLP tasks. Uses Unicode UAX #29 word boundary rules + ICU dictionary data, which handles common words well but may mis-segment rare compounds or slang
- Quality may vary slightly between browser engines (V8 vs JavaScriptCore vs SpiderMonkey)
- No user-customizable dictionary

**Accuracy assessment:** For a reader app where the goal is dictionary lookup (not NLP analysis), Intl.Segmenter is more than sufficient. Even if a compound word is split into two segments, the user can still tap either character and get a useful definition. The "tolerable accuracy" trade-off documented by Yongfu Liao (yongfu.name/2024/08/28/ws-in-browser/) applies directly to this use case.

**Confidence:** HIGH (MDN docs, web.dev blog, Baseline status confirmed)

### Option B: @node-rs/jieba (Server-Side Alternative)

**What it is:** Rust-based jieba Chinese word segmentation compiled to native Node.js addon. Fastest jieba implementation for Node.js.

**Version:** 2.0.1 (last published ~1 year ago)
**Performance:** 8,246 ops/sec for 1,184-word text (33% faster than nodejieba's 6,392 ops/sec)

**Functions:** `cut()`, `cutAll()`, `cutForSearch()`, `tag()` (part-of-speech), `extract()` (keyword extraction)

**Pros:**
- Higher segmentation accuracy than Intl.Segmenter for complex text
- Custom dictionary support for domain-specific terms
- Part-of-speech tagging (useful for grammar features later)

**Cons:**
- Native addon -- requires platform-specific binaries (linux-x64-gnu, darwin-arm64, etc.)
- 20+ MB install size for dictionaries
- Server-side only -- cannot run in browser
- Requires pre-segmentation on server before sending to client
- Adds deployment complexity (binary compatibility with Vercel/serverless)

**Confidence:** HIGH (npm page with benchmark data)

### Option C: nodejieba (Server-Side, Older)

**Version:** 3.5.2 (last published ~4 months ago)
**What it is:** C++ jieba port with Node.js N-API bindings
**Performance:** 6,392 ops/sec (slower than @node-rs/jieba)
**Skip reason:** @node-rs/jieba is strictly better in every dimension.

### Recommendation: Use Intl.Segmenter

**Why:** For a reader app, segmentation quality needs to be "good enough for dictionary lookup" -- not "perfect for NLP research." Intl.Segmenter meets this bar with zero dependencies, works on both server and client, and avoids the deployment complexity of native addons on serverless platforms. The project is already on Next.js 16 (Node.js 20+), so Intl.Segmenter is guaranteed available.

**Fallback strategy:** If users report frequent mis-segmentation of specific words, add a custom word boundary correction layer that maintains a lookup table of known compounds. This is simpler than introducing jieba as a dependency.

**Where to run it:** Client-side. Segmentation is fast enough to run on every render. No need to pre-segment on the server -- the browser's Intl.Segmenter handles it instantly for typical reader text lengths (under 10,000 characters).

---

## 3. Ruby/Annotation Rendering in HTML

### HTML `<ruby>` + `<rt>` Tags

**Browser support:** Universal. `<ruby>` and `<rt>` have been supported since IE 5, Chrome 5, Firefox 38, Safari 5. The `<rp>` fallback tag shows parentheses in browsers that don't support ruby (essentially none in 2026).

**CSS `ruby-position` (Baseline December 2024):**
- `over` -- annotation above text (default, correct for Chinese pinyin/jyutping)
- `under` -- annotation below text
- `alternate` -- alternates between over/under for multiple annotation levels
- `inter-character` -- between characters, for vertical text
- Chrome 87+, Firefox 38+, Safari 18.2+

**Basic usage:**
```html
<ruby>
  你好
  <rp>(</rp><rt>ni hao</rt><rp>)</rp>
</ruby>
```

**Styling control:**
```css
ruby { ruby-position: over; }
rt { font-size: 0.5em; color: #fbbf24; /* yellow for pinyin */ }
```

**Confidence:** HIGH (MDN docs, Baseline status confirmed)

### The Project's Custom Font Approach

The project already has a **custom phonetic font** system (`font-hanzi-pinyin` and `font-cantonese-visual`) that renders annotations **automatically** when applied to Chinese text via CSS class. The font itself contains the annotation glyphs -- no `<ruby>` HTML is needed.

**How it works:** Apply `className="font-hanzi-pinyin"` to a `<span>` containing Chinese text, and the font renders pinyin above each character automatically. This is controlled in `globals.css` via `--font-hanzi-pinyin` and `--font-cantonese-visual` CSS variables, with the `PhoneticText` component as the React wrapper.

**Current status:** Font variables are set to `sans-serif` (placeholder) in `layout.tsx`. The actual `.ttf`/`.woff2` font files need to be provided and loaded via `next/font/local`.

### How Ruby and Custom Fonts Interact

These are **two separate annotation systems** that should be used for different purposes:

| Feature | Custom Font | HTML Ruby |
|---------|-------------|-----------|
| Purpose | Continuous reading with phonetic annotations | Character popup dictionary detail |
| Rendering | Automatic via font glyph substitution | Explicit HTML markup |
| Control | All-or-nothing per text block | Per-character/word granular |
| Performance | Excellent (just CSS class toggle) | Good (but more DOM nodes) |
| Use in Reader | Main text display with annotation mode | Popup content showing pronunciation |

**Recommendation:** Use the **custom font** for the main reader text display (toggle between Jyutping/Pinyin/Plain annotation modes). Use **HTML `<ruby>`** only inside the character popup for showing pronunciation details where you need precise per-character control and color coding (yellow for pinyin, cyan for jyutping, matching the existing `ChineseAnnotation` component pattern).

The existing `ChineseAnnotation.tsx` component already uses `<ruby>` + `<rt>` with color-coded annotations. This pattern should be reused in the character popup.

---

## 4. Text Import Handling

### .txt File Parsing with Encoding Detection

**The problem:** Chinese .txt files may be encoded as UTF-8, GB2312/GBK/GB18030 (Mainland China), or Big5 (Taiwan/Hong Kong). Loading a GB2312 file as UTF-8 produces garbled text (mojibake).

**Recommended library: `jschardet`**
- npm: `jschardet`
- Port of Python's chardet (battle-tested encoding detection)
- Detects UTF-8, GB2312, GB18030, Big5, EUC-TW, HZ-GB-2312, ISO-2022-CN
- Returns encoding name + confidence score (e.g., `{ encoding: 'Big5', confidence: 0.99 }`)
- Works with `Buffer` input

**Usage pattern:**
```typescript
import jschardet from 'jschardet';

// Detect encoding from file buffer
const result = jschardet.detect(buffer);
// { encoding: 'GB2312', confidence: 0.95 }

// Decode with detected encoding
const decoder = new TextDecoder(result.encoding);
const text = decoder.decode(buffer);
```

**Alternative: `chardet` (node-chardet)**
- Pure TypeScript, similar to jschardet
- `detectFile()` / `detectFileSync()` for direct file reading
- `analyse()` returns all possible encodings with confidence scores
- Slightly newer but less battle-tested than jschardet

**Recommendation:** Use `jschardet` because it's a direct port of Python's chardet which has years of production use with Chinese text. Fallback to UTF-8 if confidence is below 0.5.

**Confidence:** HIGH (jschardet GitHub + npm docs confirm Chinese encoding support)

### .pdf Text Extraction

**Current state:** The project already has `pdf-parse` v2.4.5 as a dependency and a working `extractTextFromPdf()` function in `src/lib/chunking.ts`. This function is used for the knowledge base RAG chunking feature.

**Reuse strategy:** The existing `extractTextFromPdf()` can be called directly for the reader's PDF import. The function handles:
- Dynamic import of pdf-parse (avoids build-time issues)
- Buffer input from file upload
- Returns plain text string

**Chinese PDF considerations:**
- Modern PDFs with embedded Unicode fonts extract correctly with pdf-parse
- Older PDFs with CID-keyed fonts (common in Chinese academic papers) may produce garbled output
- Scanned PDFs produce no text (would need OCR, which is out of scope)

**Recommendation:** Reuse the existing `extractTextFromPdf()` from `src/lib/chunking.ts`. Add a user-facing warning if extracted text appears to be empty or garbled (heuristic: check if result contains CJK characters).

**Confidence:** HIGH (already implemented and working in the codebase)

### Max Text Length Considerations

| Text Length | Characters | Performance Impact |
|-------------|------------|-------------------|
| Short article | < 2,000 | No issues |
| Long article | 2,000-10,000 | Acceptable -- DOM renders ~10K spans smoothly |
| Novel chapter | 10,000-50,000 | **Needs virtualization** -- 50K hoverable spans is heavy |
| Full book | 50,000+ | **Must paginate** -- not practical as single page |

**Recommendation:** Set a soft limit of 50,000 characters per reader session. For longer texts, paginate into chunks. For v6.0, a 20,000 character limit is safe without virtualization. Display a warning for texts exceeding this.

---

## 5. Hover Popup Architecture for React

### The Core Challenge

A Chinese reader page may have 1,000-5,000 visible characters, each of which should be hoverable/tappable to show a dictionary popup. Creating 5,000 individual Popover component instances is not viable.

### Pattern: Single Shared Popup (RECOMMENDED)

**Architecture:** Render one single popup component. Track which word/character is currently hovered via state. Position the popup relative to the hovered element using Floating UI or manual positioning.

```
[Reader Text Container]
  - 1000+ <span> elements (one per word/character)
  - Each span has onMouseEnter / onTouchStart handlers
  - Handlers set activeWord state + cursor position

[Single Popup Component]
  - Conditionally rendered when activeWord !== null
  - Positioned via Floating UI virtualElement or manual coords
  - Content populated from dictionary lookup of activeWord
```

**Why this works:**
- Only 1 popup in the DOM at any time (vs 5,000)
- Event delegation can further reduce handler count
- Dictionary lookup happens on hover, not on render
- Popup content updates are cheap (just state change)

### Positioning: Floating UI vs Radix Popover

The project already uses Radix UI (Popover, Tooltip, Dialog). Radix Popover internally uses Floating UI for positioning. However, Radix Popover is designed for **one trigger = one popover instance**, which doesn't fit the single-shared-popup pattern.

**Recommendation: Use `@floating-ui/react-dom` directly**

Radix's Popover component expects a `<Popover.Trigger>` wrapping each triggering element. With 5,000 characters, this means 5,000 Radix Popover instances -- exactly what we want to avoid.

Instead, use Floating UI's `useFloating` hook with a **virtual reference element**:

```typescript
import { useFloating, offset, flip, shift } from '@floating-ui/react-dom';

// Virtual reference -- no real DOM element needed as anchor
const virtualRef = useRef({ getBoundingClientRect: () => rect });

const { refs, floatingStyles } = useFloating({
  placement: 'top',
  middleware: [offset(8), flip(), shift()],
});

// On hover, update the virtual reference's rect to match the hovered span
function handleWordHover(event: React.MouseEvent, word: string) {
  const rect = event.currentTarget.getBoundingClientRect();
  refs.setReference({ getBoundingClientRect: () => rect });
  setActiveWord(word);
}
```

**Key benefit:** `@floating-ui/react-dom` is already an indirect dependency (Radix uses it internally). Adding it as a direct dependency adds zero bundle weight.

**Confidence:** HIGH (Floating UI docs confirm virtual element pattern)

### Event Handling Strategy

**Desktop (hover):**
- `onMouseEnter` on each word `<span>` sets active word + triggers dictionary lookup
- `onMouseLeave` starts a 200ms delay before closing popup (allows cursor to enter popup)
- Popup itself has `onMouseEnter` (cancel close) and `onMouseLeave` (close)

**Mobile (touch):**
- `onTouchStart` / `onClick` on each word `<span>` toggles popup
- Tap outside popup or tap different word to dismiss
- No hover state on touch devices -- tap is the primary interaction

**Implementation detail:** Use a `useIsTouchDevice()` hook or CSS `@media (hover: hover)` to differentiate behavior. The project already uses responsive patterns throughout.

### Performance Optimization

| Technique | Impact | When to Use |
|-----------|--------|-------------|
| Event delegation | HIGH | Always -- attach one handler to container, use `event.target` to identify word |
| `React.memo` on word spans | MEDIUM | If re-renders become visible |
| Debounced dictionary lookup | MEDIUM | If lookup is async (DB query) |
| Virtualized rendering | HIGH | Only if text exceeds ~20,000 characters |
| CSS `content-visibility: auto` | LOW | For very long texts, auto-skip offscreen rendering |

**Event delegation pattern:**
```typescript
function handleContainerMouseOver(e: React.MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.dataset.word) {
    setActiveWord(target.dataset.word);
    // Position popup relative to target
  }
}

<div onMouseOver={handleContainerMouseOver}>
  {words.map(w => <span key={w.id} data-word={w.text}>{w.text}</span>)}
</div>
```

This reduces from N event listeners to 1 event listener on the container.

### Accessibility

- Popup should have `role="tooltip"` or `role="dialog"` (dialog if it contains interactive elements like audio playback)
- Active word should have `aria-describedby` pointing to popup ID
- Keyboard navigation: Tab through words, Enter/Space to open popup, Escape to close
- Screen reader: Announce word + pronunciation when focused
- `prefers-reduced-motion`: Disable popup animations

**Confidence:** HIGH (W3C WAI-ARIA tooltip pattern, Floating UI docs)

---

## 6. Dictionary Data Layer

### CC-CEDICT (Mandarin)

**What:** Community-maintained Chinese-English dictionary. ~120,000 entries. Format: `Traditional Simplified [pinyin] /definition1/definition2/`

**npm packages:**
- `node-cc-cedict` -- Async JS API with premade SQLite conversion
- `parse-cc-cedict` -- Parses raw CEDICT format (7 years old, but format is stable)
- `@alexamies/chinesedict-js` -- Browser module, loads from JSON

**Recommended approach:** Download CC-CEDICT data file, parse into JSON at build time, store in Neon Postgres as a `dictionary_entries` table. Query by character/word for instant lookup. This aligns with the existing DB-first architecture.

### CC-Canto (Cantonese)

**What:** Cantonese-English dictionary in CEDICT format with Jyutping pronunciations. Smaller than CC-CEDICT (~30,000 entries) but essential for Cantonese support.

**Note:** npm ecosystem has limited CC-Canto tooling. The data file itself is freely available and uses the same format as CC-CEDICT, so the same parser works for both.

### Radical/Component Decomposition

**Library: `hanzi` npm package**
- `decompose(char, level)` -- 3 levels: Once, Radical, Graphical
- `decomposeMany(string)` -- batch decomposition
- Returns radical meaning
- Returns array of characters sharing the same component

**Recommendation:** Use `hanzi` for the component breakdown feature in the character popup. Run server-side and cache results (decomposition data is static -- a character's radicals never change).

### Pronunciation Libraries (Already in Project)

- `pinyin-pro` v3.28.0 -- Already installed. Supports per-character pinyin with tone marks. Has `html()` function that generates `<ruby>` markup automatically. Handles polyphonic characters.
- `to-jyutping` v3.1.1 -- Already installed. Converts Chinese text to Jyutping. Used in `search-utils.ts`.

**Key `pinyin-pro` feature for the reader:** The `html()` function generates ready-to-use HTML with `<ruby>` tags, with CSS classes for styling (`py-result-item`, `py-chinese-item`, `py-pinyin-item`). This can be used directly in the popup content.

### Traditional-Simplified Conversion

**Library: `opencc-js`**
- Pure JavaScript, works in browser and Node.js
- Supports: `hk` (Hong Kong Traditional), `tw` (Taiwan Traditional), `cn` (Simplified), `t` (Traditional generic)
- Usage: `const converter = OpenCC.Converter({ from: 'hk', to: 'cn' }); converter('漢語') // '汉语'`
- Version 1.0.5
- CDN available with separate bundles for s2t and t2s conversions (smaller bundle when only one direction needed)

**Recommendation:** Install `opencc-js`. Run conversion client-side (it's fast, ~1ms for typical article length). The `from: 'hk'` to `to: 'cn'` configuration is specifically relevant for this Cantonese-focused project.

---

## 7. Existing Codebase Assets to Reuse

The project already has significant infrastructure that the reader can build on:

| Asset | Location | Reuse For |
|-------|----------|-----------|
| `PhoneticText` component | `src/components/phonetic/PhoneticText.tsx` | Main reader text with font-based annotations |
| `ChineseAnnotation` component | `src/components/chat/ChineseAnnotation.tsx` | Character popup ruby rendering |
| `parseAnnotatedText()` | `src/components/chat/ChineseAnnotation.tsx` | Parsing annotated segments |
| `extractTextFromPdf()` | `src/lib/chunking.ts` | PDF import for reader |
| `pinyin-pro` | `package.json` | Pinyin lookup + HTML generation |
| `to-jyutping` | `package.json` | Jyutping lookup |
| `pdf-parse` | `package.json` | PDF text extraction |
| Azure TTS integration | `src/lib/pronunciation.ts` | Audio playback (zh-CN + zh-HK) |
| Radix UI Tooltip | `src/components/ui/tooltip.tsx` | Design system consistency |
| Radix UI Popover | `@radix-ui/react-popover` in deps | Potential use for settings panels |
| `useLanguagePreference` hook | Referenced in PhoneticText | Annotation mode detection |
| `NotoSansSC-Regular.ttf` | `public/fonts/` | Chinese font fallback |

---

## 8. Recommended Architecture

### Component Hierarchy

```
ReaderPage (server component -- route handler)
  |
  +-- ReaderShell (client component -- state management)
        |
        +-- ReaderToolbar
        |     +-- ImportButton (paste / .txt / .pdf)
        |     +-- AnnotationModeSelector (Jyutping / Pinyin / Plain)
        |     +-- ScriptToggle (Traditional / Simplified)
        |     +-- FontSizeControl
        |
        +-- ReaderTextArea (the main text display)
        |     +-- WordSpan[] (one per segmented word)
        |           data-word="吃饭" data-index={n}
        |
        +-- CharacterPopup (single instance, Floating UI positioned)
        |     +-- CharacterHeader (character + pronunciation)
        |     +-- DefinitionSection (English meanings)
        |     +-- PronunciationRow (pinyin + jyutping + TTS buttons)
        |     +-- ComponentBreakdown (radical/component tree)
        |     +-- ExampleSentences (with read-aloud)
        |
        +-- ReaderFooter
              +-- CharacterCount
              +-- ReadingProgress (scroll percentage)
```

### Data Flow

```
1. User imports text (paste/file)
     |
     v
2. [Client] Encoding detection (jschardet) if file upload
     |
     v
3. [Client] Intl.Segmenter segments text into words
     |
     v
4. [Client] Render WordSpan[] with data-word attributes
     |
     v
5. User hovers/taps a word
     |
     v
6. [Client] Set activeWord state
     |
     v
7. [Client -> Server] Fetch dictionary entry for word
     |  (API route: /api/dictionary/lookup?word=吃饭)
     |
     v
8. [Server] Query dictionary_entries table
     |  - CC-CEDICT for Mandarin definitions + pinyin
     |  - CC-Canto for Cantonese definitions + jyutping
     |  - hanzi.decompose() for radical breakdown
     |  - AI fallback if no dictionary entry found
     |
     v
9. [Client] Display popup with entry data
     |
     v
10. User taps TTS button
      |
      v
11. [Client -> Server] Azure TTS request
      |  (reuse existing pronunciation.ts pattern)
      |
      v
12. [Client] Play audio
```

### Database Schema Addition

```sql
-- Dictionary entries table (pre-loaded from CC-CEDICT + CC-Canto)
CREATE TABLE dictionary_entries (
  id SERIAL PRIMARY KEY,
  simplified TEXT NOT NULL,
  traditional TEXT NOT NULL,
  pinyin TEXT,              -- with tone marks
  jyutping TEXT,            -- from CC-Canto or to-jyutping
  definitions TEXT[] NOT NULL, -- array of English definitions
  source TEXT NOT NULL,     -- 'cedict' | 'canto' | 'ai'
  frequency INTEGER,        -- word frequency rank (for sorting)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dict_simplified ON dictionary_entries(simplified);
CREATE INDEX idx_dict_traditional ON dictionary_entries(traditional);
```

---

## 9. Technology Recommendations Summary

### Must Install (New Dependencies)

| Package | Version | Purpose | Size Impact |
|---------|---------|---------|-------------|
| `opencc-js` | ^1.0.5 | Traditional/Simplified conversion | ~2MB (dictionary data) |
| `jschardet` | latest | File encoding detection | ~200KB |
| `hanzi` | latest | Character radical decomposition | ~5MB (decomposition data) |
| `@floating-ui/react-dom` | latest | Popup positioning | ~0KB (already indirect dep) |

### Already Available (No Install Needed)

| Package | Use |
|---------|-----|
| `pinyin-pro` | Pinyin lookup, HTML ruby generation |
| `to-jyutping` | Jyutping lookup |
| `pdf-parse` | PDF text extraction |
| `@radix-ui/react-popover` | Settings panels, non-text popups |
| `Intl.Segmenter` | Chinese word segmentation (built-in) |

### Explicitly NOT Recommended

| Package | Why Not |
|---------|---------|
| `nodejieba` / `@node-rs/jieba` | Native addon deployment complexity, Intl.Segmenter sufficient |
| `@floating-ui/react` (full) | Overkill -- `react-dom` subset is enough |
| Custom ruby rendering library | Native `<ruby>` + existing ChineseAnnotation component sufficient |
| `chardet` (node-chardet) | jschardet is more battle-tested for Chinese encodings |

---

## 10. Critical Pitfalls

### Pitfall 1: Popup Occlusion on Mobile
**What goes wrong:** Popup covers the text the user is trying to read, especially on small screens.
**Prevention:** Position popup above the text by default. On mobile, consider a bottom sheet pattern (like Pleco) instead of a floating popup. Use Floating UI's `flip()` middleware to auto-reposition when near screen edges.

### Pitfall 2: Segmentation Boundary Errors
**What goes wrong:** Intl.Segmenter splits a word incorrectly (e.g., "中华人民共和国" split as "中华" + "人民" + "共和国" instead of one unit). User taps "人民" and gets a different definition than expected.
**Prevention:** Accept this as inherent to any segmentation approach. The popup should show the selected segment's definition AND offer "expand selection" / "shrink selection" controls to let users manually adjust word boundaries. This is what Pleco does.

### Pitfall 3: Dictionary Misses
**What goes wrong:** User looks up a word not in CC-CEDICT or CC-Canto. Popup shows "No definition found."
**Prevention:** Implement a fallback chain: (1) exact word match, (2) individual character lookup, (3) AI-generated definition via existing n8n webhook. Cache AI results in the dictionary table for future lookups.

### Pitfall 4: Font File Dependency
**What goes wrong:** The custom phonetic fonts (`font-hanzi-pinyin`, `font-cantonese-visual`) are still placeholders (set to `sans-serif`). Without the actual font files, the annotation mode selector does nothing visible.
**Prevention:** This is listed as a v6.0 prerequisite. The font files MUST be obtained and configured before the reader can ship. If fonts are unavailable, fall back to HTML `<ruby>` rendering using `pinyin-pro`'s `html()` function as the annotation display mechanism.

### Pitfall 5: PDF Text Extraction Quality
**What goes wrong:** Chinese PDFs with image-based text or CID-keyed fonts produce garbled or empty output.
**Prevention:** Show a clear error message: "Could not extract text from this PDF. Try copying the text and pasting it instead." Do not silently show garbled text.

### Pitfall 6: TTS Rate Limiting
**What goes wrong:** User rapidly clicks TTS buttons for different characters, overwhelming the Azure Speech API.
**Prevention:** Debounce TTS requests (300ms). Queue requests and cancel previous in-flight request when a new one arrives. Show loading state on TTS button. Consider caching audio for frequently looked-up words.

### Pitfall 7: Memory with Large Texts
**What goes wrong:** Importing a 100,000-character novel creates 100K+ DOM nodes, each with event data attributes, causing browser tab to become sluggish.
**Prevention:** Hard limit at 50,000 characters with pagination. Warn at 20,000. For v6.0, 20,000 is a safe ceiling without virtualization.

---

## Sources

### Chinese Reader Apps
- [Pleco Reader Manual](https://android.pleco.com/manual/310/reader.html) -- HIGH confidence
- [Du Chinese Review (LTL School)](https://ltl-school.com/du-chinese/) -- HIGH confidence
- [Du Chinese Review (FlexiClasses)](https://flexiclasses.com/mandarin/du-chinese-review/) -- HIGH confidence
- [Du Chinese Review (ALR)](https://www.alllanguageresources.com/du-chinese-review/) -- HIGH confidence
- [TCB Review (TravelChinaCheaper)](https://www.travelchinacheaper.com/learn-to-read-chinese-actually-have-fun) -- HIGH confidence
- [Dong Chinese Wiki](https://www.dong-chinese.com/wiki) -- MEDIUM confidence
- [Best Chinese Reading Apps (Mandarin Companion)](https://mandarincompanion.com/6-best-apps-for-reading-chinese/) -- HIGH confidence

### Text Segmentation
- [Intl.Segmenter MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter) -- HIGH confidence
- [Intl.Segmenter Baseline (web.dev)](https://web.dev/blog/intl-segmenter) -- HIGH confidence
- [Word Segmentation in Browser (Yongfu)](https://yongfu.name/2024/08/28/ws-in-browser/) -- MEDIUM confidence
- [@node-rs/jieba npm](https://www.npmjs.com/package/@node-rs/jieba) -- HIGH confidence

### Ruby Annotations
- [MDN ruby-position](https://developer.mozilla.org/en-US/docs/Web/CSS/ruby-position) -- HIGH confidence
- [MDN ruby element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/ruby) -- HIGH confidence
- [W3C Ruby Styling](https://www.w3.org/International/articles/ruby/styling.en.html) -- HIGH confidence

### Libraries
- [pinyin-pro html function](https://pinyin-pro.cn/en/use/html.html) -- MEDIUM confidence
- [opencc-js GitHub](https://github.com/nk2028/opencc-js) -- HIGH confidence
- [jschardet GitHub](https://github.com/aadsm/jschardet) -- HIGH confidence
- [hanzi npm](https://www.npmjs.com/package/hanzi) -- HIGH confidence
- [Floating UI React](https://floating-ui.com/docs/react) -- HIGH confidence

### Popup Architecture
- [Floating UI Popover](https://floating-ui.com/docs/popover) -- HIGH confidence
- [W3C WAI-ARIA Tooltip Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) -- HIGH confidence
- [Radix Popover](https://www.radix-ui.com/primitives/docs/components/popover) -- HIGH confidence
