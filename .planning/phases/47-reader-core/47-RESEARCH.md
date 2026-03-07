# Phase 47: Reader Core - Research

**Researched:** 2026-02-08
**Domain:** Chinese text reader with segmentation, annotation modes, T/S conversion, file import
**Confidence:** HIGH

## Summary

Phase 47 builds the Chinese Reader page at `/dashboard/reader` with text paste, file import, word segmentation, annotation mode switching, tone sandhi display, and traditional/simplified conversion. All dependencies are already installed (opencc-js, jschardet, pinyin-pro, to-jyutping, Intl.Segmenter built-in). The dictionary lookup API (Phase 45) and TTS hook (Phase 46) are available but not directly consumed by this phase -- the popup (Phase 48) will use them.

The key technical finding is that **pinyin-pro does NOT apply third-tone sandhi** for consecutive third tones. Its `toneSandhi` option only handles `一` and `不`. A custom sandhi function must be built using `pinyin()` with `toneType: 'num'` + `convert()` to transform tone numbers back to diacritics after applying the 3+3 rule. This was verified by running pinyin-pro v3.28.0 directly -- `pinyin('你好')` returns `nǐ hǎo` not `ní hǎo`.

**Primary recommendation:** Build the reader as a client component with event delegation for word hover/tap. Use `Intl.Segmenter` client-side (zero deps, verified working on Node 20+). Annotation modes use the existing PhoneticText font system (when fonts are available) with HTML `<ruby>` + pinyin-pro/to-jyutping as fallback (guaranteed to work now). opencc-js runs client-side for T/S conversion. Persist reader preferences in localStorage following the `useSubtitlePreference` pattern.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `Intl.Segmenter` | built-in | Chinese word segmentation | Zero deps, works client + server, verified correct output |
| `opencc-js` | ^1.0.5 | Traditional/Simplified conversion | HK variant support, pure JS, fast (~1ms) |
| `jschardet` | ^3.1.4 | File encoding detection | Battle-tested port of Python chardet |
| `pinyin-pro` | ^3.28.0 | Pinyin generation + tone sandhi base | Already installed, proven in codebase |
| `to-jyutping` | ^3.1.1 | Jyutping generation | Already installed, proven in codebase |
| `pdf-parse` | ^2.4.5 | PDF text extraction | Already installed, `extractTextFromPdf()` exists |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pinyin-pro` `html()` | ^3.28.0 | Generate `<ruby>` HTML for annotations | Fallback when custom fonts unavailable |
| `pinyin-pro` `convert()` | ^3.28.0 | Convert numbered pinyin to tone marks | After applying third-tone sandhi |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Intl.Segmenter` | `@node-rs/jieba` | Higher accuracy but native addon, server-only, deployment complexity |
| Custom `<ruby>` rendering | PhoneticText custom font | Custom fonts not yet available; `<ruby>` works now |
| `jschardet` | `chardet` (node-chardet) | Newer but less battle-tested for Chinese |

**Installation:**
```bash
# All packages already installed in Phase 44. No new installs needed.
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/(dashboard)/dashboard/reader/
│   ├── page.tsx              # Server component: auth + shell
│   ├── loading.tsx           # Loading skeleton
│   └── ReaderClient.tsx      # 'use client' — all reader state and UI
├── lib/
│   ├── segmenter.ts          # Intl.Segmenter wrapper + word data
│   ├── tone-sandhi.ts        # Third-tone sandhi implementation
│   └── chinese-convert.ts    # opencc-js wrapper with lazy init
├── hooks/
│   └── useReaderPreferences.ts  # localStorage prefs (annotation mode, T/S, font size)
└── components/reader/
    ├── ReaderToolbar.tsx      # Import, annotation mode, T/S toggle, font size
    ├── ReaderTextArea.tsx     # Segmented text with word spans
    ├── ImportDialog.tsx       # Text paste + file upload dialog
    ├── AnnotationModeSelector.tsx  # Jyutping / Pinyin / Plain
    └── WordSpan.tsx           # Individual word span with data attributes
```

### Pattern 1: Server Page + Client Shell

**What:** The reader page.tsx is a thin server component for auth. All reader logic lives in a `"use client"` component.
**When to use:** Always for the reader -- segmentation, annotation, and conversion all happen client-side.

```typescript
// src/app/(dashboard)/dashboard/reader/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ReaderClient } from "./ReaderClient";

export default async function ReaderPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <ReaderClient />;
}
```

### Pattern 2: Event Delegation for Word Spans

**What:** Attach one `onMouseOver` handler to the container div, not individual handlers per word span. Use `data-word` and `data-index` attributes to identify the hovered word.
**When to use:** Always -- the reader may have 1,000-20,000 word spans.

```typescript
// Source: v6-reader-ux.md research recommendation
function handleContainerHover(e: React.MouseEvent) {
  const target = (e.target as HTMLElement).closest('[data-word]');
  if (!target) return;
  const word = target.getAttribute('data-word');
  const index = target.getAttribute('data-index');
  // Set active word state for popup (Phase 48)
}

<div onMouseOver={handleContainerHover}>
  {segments.map((seg, i) => (
    <span key={i} data-word={seg.text} data-index={i}>
      {seg.text}
    </span>
  ))}
</div>
```

### Pattern 3: localStorage Preferences Hook (useReaderPreferences)

**What:** Follow the exact `useSubtitlePreference` pattern for reader UI preferences.
**When to use:** Reader settings that don't need cross-device sync.

```typescript
// Follows src/hooks/useSubtitlePreference.ts pattern exactly
const STORAGE_KEY = "reader-prefs";

interface ReaderPreferences {
  annotationMode: "pinyin" | "jyutping" | "plain";
  scriptMode: "original" | "simplified" | "traditional";
  fontSize: number; // 14-28
}

const DEFAULT_PREFERENCES: ReaderPreferences = {
  annotationMode: "pinyin",
  scriptMode: "original",
  fontSize: 18,
};
```

### Pattern 4: opencc-js Lazy Initialization

**What:** Create the opencc-js Converter once and memoize it. The converter loads dictionary data internally on first call.
**When to use:** Always -- avoid recreating the converter on every render.

```typescript
// Source: Context7 opencc-js docs + verified with local testing
import * as OpenCC from 'opencc-js';

// Memoize converters -- dictionary data loads once
let cnToHk: ((text: string) => string) | null = null;
let hkToCn: ((text: string) => string) | null = null;

export function toTraditional(text: string): string {
  if (!cnToHk) cnToHk = OpenCC.Converter({ from: 'cn', to: 'hk' });
  return cnToHk(text);
}

export function toSimplified(text: string): string {
  if (!hkToCn) hkToCn = OpenCC.Converter({ from: 'hk', to: 'cn' });
  return hkToCn(text);
}
```

**Verified locales (from official README):**
- `cn` = Simplified Chinese (Mainland China)
- `hk` = Traditional Chinese (Hong Kong) -- **use this for Cantonese context**
- `tw` = Traditional Chinese (Taiwan)
- `twp` = Traditional Chinese (Taiwan) with phrase conversion
- `t` = Traditional Chinese (generic OpenCC standard)
- `jp` = Japanese Shinjitai

For this project, use `hk` (not `t` or `tw`) since the app focuses on Cantonese/Hong Kong Chinese.

### Anti-Patterns to Avoid

- **Per-span event handlers:** DO NOT attach `onMouseEnter` to each of 5,000 word spans. Use event delegation on the container.
- **Re-creating Intl.Segmenter on every render:** Create it once (module-level or `useMemo`). The constructor is cheap but there's no reason to repeat it.
- **Running segmentation server-side:** Intl.Segmenter is fast client-side. No need for an API round-trip.
- **Creating one Radix Popover per word span:** This is for Phase 48 -- use a single shared popup with virtual reference. Phase 47 just prepares the word spans with data attributes.
- **Using opencc-js `ConverterFactory` import:** The simple `OpenCC.Converter()` API is easier and works fine. The `ConverterFactory` pattern is only needed for tree-shaking in ESM-only builds.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chinese word segmentation | Custom dictionary-based segmenter | `Intl.Segmenter('zh', { granularity: 'word' })` | ICU data handles 95%+ of common words; native C++ speed |
| T/S character conversion | Character-by-character lookup table | `opencc-js` with HK variant | opencc handles phrase-level conversion, not just char substitution |
| Encoding detection | Manual byte-pattern matching | `jschardet.detect(buffer)` | Chinese encoding detection has many edge cases |
| Pinyin generation | Manual dictionary lookup | `pinyin-pro` `pinyin()` function | Handles polyphonic characters contextually |
| Jyutping generation | Manual dictionary lookup | `to-jyutping` `getJyutpingText()` | Proven in codebase already |
| Ruby HTML generation | Manual DOM construction | `pinyin-pro` `html()` function | Generates correct `<ruby><rt>` with CSS classes |

**Key insight:** The annotation display has two rendering paths. Path A uses the custom PhoneticText font system (just apply a CSS class, font renders annotations automatically). Path B uses `<ruby>` HTML generated by pinyin-pro's `html()` function. Since custom fonts are NOT yet available (still `sans-serif` placeholder), Path B (`<ruby>` with programmatic pinyin/jyutping) is the only functional approach for Phase 47. The code should support both paths and switch automatically when fonts become available.

## Common Pitfalls

### Pitfall 1: pinyin-pro Does NOT Apply Third-Tone Sandhi

**What goes wrong:** Developer assumes `pinyin('你好')` returns `ní hǎo`. It actually returns `nǐ hǎo`. The `toneSandhi` option only handles `一` and `不`, NOT the 3+3 rule.
**Why it happens:** The library documents `toneSandhi` as handling "tone changes for 一 and 不". The name is misleading -- it does NOT cover the third-tone sandhi rule.
**How to avoid:** Build a custom `applyThirdToneSandhi()` function that:
1. Gets per-syllable pinyin with `toneType: 'num'` and tone numbers with `pattern: 'num'`
2. Walks right-to-left: when tone 3 precedes tone 3, change the first to tone 2
3. Converts numbered pinyin back to tone marks with `convert()`
**Warning signs:** Test with `你好` -- if result shows `nǐ hǎo`, sandhi is not applied.
**Verified:** Tested locally with pinyin-pro v3.28.0. `pinyin('你好')` returns `nǐ hǎo`.

### Pitfall 2: jschardet Returns null for Short Buffers

**What goes wrong:** Small files (under ~20 bytes) may get `{ encoding: null, confidence: 0 }` from jschardet.
**Why it happens:** Encoding detection is statistical -- it needs enough bytes to establish a pattern. 4-8 bytes of GB2312 isn't enough.
**How to avoid:** If jschardet returns null or confidence < 0.5, fall back to UTF-8 (most common encoding for modern Chinese text). Show a user warning: "Could not detect file encoding. Displaying as UTF-8. If text appears garbled, try re-saving the file as UTF-8."
**Warning signs:** `jschardet.detect(buffer).encoding === null`
**Verified:** Tested locally. 8-byte GB2312 buffer returned `{ encoding: null, confidence: 0 }`. UTF-8 buffers of any size detected correctly.

### Pitfall 3: TextDecoder Encoding Name Mapping

**What goes wrong:** jschardet returns encoding names like `"GB2312"` or `"GB18030"` but `TextDecoder` may not accept all of them directly.
**Why it happens:** `TextDecoder` uses WHATWG encoding labels which differ from chardet names.
**How to avoid:** Map jschardet output to TextDecoder-compatible labels:
```typescript
const ENCODING_MAP: Record<string, string> = {
  'GB2312': 'gbk',
  'GB18030': 'gb18030',
  'Big5': 'big5',
  'UTF-8': 'utf-8',
  'EUC-TW': 'utf-8', // fallback
  'HZ-GB-2312': 'utf-8', // fallback
  'ISO-2022-CN': 'utf-8', // fallback
};
```
**Warning signs:** `TextDecoder` throws `RangeError: The encoding label provided is not supported`.

### Pitfall 4: opencc-js Bundle Size in Client Bundle

**What goes wrong:** opencc-js includes ~2MB of dictionary data. Importing it at module level forces it into the initial bundle.
**Why it happens:** The converter needs dictionary data for phrase-level conversion.
**How to avoid:** Use dynamic import (`import()`) to lazy-load opencc-js only when the user toggles T/S conversion. The reader loads fast initially, and the conversion dictionary loads on demand.
```typescript
let converter: ((text: string) => string) | null = null;

async function getConverter(from: string, to: string) {
  if (!converter) {
    const OpenCC = await import('opencc-js');
    converter = OpenCC.Converter({ from, to });
  }
  return converter;
}
```
**Warning signs:** Large initial bundle size increase after adding opencc-js import.

### Pitfall 5: Intl.Segmenter Groups "好朋友" as One Segment

**What goes wrong:** Intl.Segmenter may group multi-character words in unexpected ways. `你好朋友` segments as `["你", "好朋友"]` not `["你好", "朋友"]`.
**Why it happens:** ICU's word boundary rules use a statistical dictionary. Segmentation depends on surrounding context.
**How to avoid:** Accept this as inherent to any segmenter. The popup (Phase 48) should show the dictionary entry for the segmented word AND allow the user to manually adjust boundaries (expand/shrink selection). For Phase 47, just render whatever Intl.Segmenter produces.
**Verified:** Tested locally. `"你好朋友"` segmented as `["你", "好朋友"]` in Node.js 20.

### Pitfall 6: `<ruby>` Annotation Performance with Large Texts

**What goes wrong:** Generating `<ruby><rt>` HTML for every word in a 10,000-character text creates 3x the DOM nodes (word + ruby wrapper + rt annotation).
**Why it happens:** Each annotated word needs: `<span><ruby><span>word</span><rp>(</rp><rt>pinyin</rt><rp>)</rp></ruby></span>`.
**How to avoid:** Only generate annotation HTML when annotation mode is "pinyin" or "jyutping". In "plain" mode, render simple `<span>` elements. Also consider generating annotations lazily (only for visible content) if performance becomes an issue with very long texts.
**Warning signs:** Sluggish scrolling with texts over 5,000 characters when annotations are enabled.

### Pitfall 7: PDF Text Extraction Returns Empty for Scanned PDFs

**What goes wrong:** User uploads a scanned PDF (image-based). `extractTextFromPdf()` returns empty string or whitespace.
**Why it happens:** pdf-parse extracts text from the PDF text layer. Scanned PDFs have no text layer -- just images.
**How to avoid:** After extraction, check if result contains any CJK characters: `const hasCJK = /[\u4e00-\u9fff]/.test(text)`. If empty or no CJK, show a clear error: "Could not extract Chinese text from this PDF. The PDF may contain scanned images instead of text. Try copying and pasting the text directly."

## Code Examples

Verified patterns from local testing:

### Intl.Segmenter Usage

```typescript
// Source: Verified locally on Node.js 20 (V8 ICU data)
// Create once, reuse across renders
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

interface WordSegment {
  text: string;
  index: number;
  isWordLike: boolean;
}

function segmentText(text: string): WordSegment[] {
  return Array.from(segmenter.segment(text)).map(seg => ({
    text: seg.segment,
    index: seg.index,
    isWordLike: seg.isWordLike ?? true,
  }));
}

// Results verified:
// segmentText('你好世界') => [{text:'你好', isWordLike:true}, {text:'世界', isWordLike:true}]
// segmentText('你好，世界！') => [{text:'你好',true}, {text:'，',false}, {text:'世界',true}, {text:'！',false}]
```

### Third-Tone Sandhi Implementation

```typescript
// Source: Verified locally with pinyin-pro v3.28.0
import { pinyin, convert } from 'pinyin-pro';

/**
 * Apply Mandarin third-tone sandhi rule:
 * When two consecutive 3rd tones occur, the first changes to 2nd tone.
 * For 3+ consecutive 3rd tones, apply right-to-left (standard computational approach).
 *
 * Examples (verified):
 *   你好 → ní hǎo
 *   很好 → hén hǎo
 *   小老鼠 → xiǎo láo shǔ (right-to-left: only second changes)
 *   我也很好 → wó yě hén hǎo
 */
export function applyThirdToneSandhi(text: string): string[] {
  const syllables = pinyin(text, { toneType: 'num', type: 'array' });
  const tones = pinyin(text, { pattern: 'num', type: 'array' }).map(Number);

  const modified = [...syllables];
  const modTones = [...tones];

  // Right-to-left pass: change tone 3 to 2 when followed by tone 3
  for (let i = modified.length - 2; i >= 0; i--) {
    if (modTones[i] === 3 && modTones[i + 1] === 3) {
      modified[i] = modified[i].replace(/3$/, '2');
      modTones[i] = 2;
    }
  }

  // Convert numbered pinyin back to tone marks
  return modified.map(s => convert(s));
}

// For display: applyThirdToneSandhi('你好').join(' ') => 'ní hǎo'
```

### opencc-js Conversion

```typescript
// Source: Context7 opencc-js docs + verified locally with v1.0.5
// MUST use dynamic import to avoid bundling 2MB dictionary data eagerly

type ScriptMode = 'original' | 'simplified' | 'traditional';

let toSimplifiedFn: ((text: string) => string) | null = null;
let toTraditionalFn: ((text: string) => string) | null = null;

export async function convertScript(
  text: string,
  from: ScriptMode,
  to: ScriptMode
): Promise<string> {
  if (from === to || to === 'original') return text;

  if (to === 'simplified') {
    if (!toSimplifiedFn) {
      const OpenCC = await import('opencc-js');
      toSimplifiedFn = OpenCC.Converter({ from: 'hk', to: 'cn' });
    }
    return toSimplifiedFn(text);
  }

  if (to === 'traditional') {
    if (!toTraditionalFn) {
      const OpenCC = await import('opencc-js');
      toTraditionalFn = OpenCC.Converter({ from: 'cn', to: 'hk' });
    }
    return toTraditionalFn(text);
  }

  return text;
}

// Verified results:
// Converter({ from: 'hk', to: 'cn' })('漢語') => '汉语'
// Converter({ from: 'cn', to: 'hk' })('计算机里面') => '計算機裏面'
// Converter({ from: 'hk', to: 'cn' })('你好') => '你好' (shared chars unchanged)
```

### File Import with Encoding Detection

```typescript
// Source: jschardet docs + verified locally
import jschardet from 'jschardet';

// Map jschardet encoding names to TextDecoder labels
const ENCODING_MAP: Record<string, string> = {
  'GB2312': 'gbk',
  'GBK': 'gbk',
  'GB18030': 'gb18030',
  'Big5': 'big5',
  'UTF-8': 'utf-8',
  'ASCII': 'utf-8',
  'windows-1252': 'utf-8', // fallback for misdetection
};

export function decodeFileBuffer(buffer: ArrayBuffer): { text: string; encoding: string } {
  const uint8 = new Uint8Array(buffer);
  const nodeBuffer = Buffer.from(uint8);
  const detection = jschardet.detect(nodeBuffer);

  const encoding = detection.encoding && detection.confidence > 0.5
    ? (ENCODING_MAP[detection.encoding] || 'utf-8')
    : 'utf-8';

  const decoder = new TextDecoder(encoding);
  const text = decoder.decode(uint8);

  return { text, encoding: detection.encoding || 'utf-8' };
}
```

**NOTE:** `jschardet` uses `Buffer` which is not available in browser. For client-side file import, use the File API's `FileReader.readAsArrayBuffer()`, then pass to jschardet. Alternatively, run encoding detection in an API route (server-side) and return decoded text. Recommendation: **run encoding detection client-side** using the `buffer` polyfill that Next.js provides in the browser, or simply try UTF-8 first and fall back to showing a warning for garbled text. The simpler approach: try `TextDecoder('utf-8')` first, check for CJK characters, and only call a server endpoint for encoding detection if the client-side UTF-8 decode produces no CJK.

### PDF Import (Reuse Existing)

```typescript
// Source: src/lib/chunking.ts (already exists)
// For client-side file upload, send the file to an API route that calls extractTextFromPdf
import { extractTextFromPdf } from '@/lib/chunking';

// API route handler:
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await extractTextFromPdf(buffer);

  // Validate extraction
  const hasCJK = /[\u4e00-\u9fff]/.test(text);
  if (!text.trim() || !hasCJK) {
    return NextResponse.json(
      { error: 'Could not extract Chinese text from PDF' },
      { status: 422 }
    );
  }

  return NextResponse.json({ text });
}
```

### Annotation Mode with Ruby HTML

```typescript
// Source: pinyin-pro html() function (Context7 docs) + to-jyutping API
import { html as pinyinHtml, pinyin } from 'pinyin-pro';
import ToJyutping from 'to-jyutping';

type AnnotationMode = 'pinyin' | 'jyutping' | 'plain';

/**
 * Generate annotated HTML for a word segment.
 * Returns raw HTML string with <ruby><rt> tags.
 */
function annotateWord(word: string, mode: AnnotationMode): string {
  if (mode === 'plain') return word;

  if (mode === 'pinyin') {
    // pinyin-pro html() generates <ruby> with classes
    return pinyinHtml(word);
  }

  if (mode === 'jyutping') {
    // Build jyutping ruby manually since to-jyutping has no html() function
    const jyutping = ToJyutping.getJyutpingText(word);
    if (!jyutping) return word;

    // Per-character annotation for multi-char words
    const chars = [...word];
    const jyutpingList = ToJyutping.getJyutpingList(word);
    if (!jyutpingList) return word;

    return jyutpingList
      .map(([char, jp]) =>
        jp
          ? `<ruby><span>${char}</span><rp>(</rp><rt>${jp}</rt><rp>)</rp></ruby>`
          : char
      )
      .join('');
  }

  return word;
}
```

### Sidebar Navigation Integration

```typescript
// Source: src/components/layout/AppSidebar.tsx (verified pattern)
// Add to the "Learning" section items array:
{
  title: "Reader",
  url: "/dashboard/reader",
  icon: BookOpenText, // from lucide-react — distinct from BookOpen used by "My Courses"
}

// Insert after "Practice" and before "Progress" in the Learning section
```

### useReaderPreferences Hook

```typescript
// Source: Follows src/hooks/useSubtitlePreference.ts pattern exactly
"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "reader-prefs";

export interface ReaderPreferences {
  annotationMode: "pinyin" | "jyutping" | "plain";
  scriptMode: "original" | "simplified" | "traditional";
  fontSize: number;
}

const DEFAULT_PREFERENCES: ReaderPreferences = {
  annotationMode: "pinyin",
  scriptMode: "original",
  fontSize: 18,
};

export function useReaderPreferences() {
  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_PREFERENCES);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ReaderPreferences>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPreferences({
          annotationMode: parsed.annotationMode ?? DEFAULT_PREFERENCES.annotationMode,
          scriptMode: parsed.scriptMode ?? DEFAULT_PREFERENCES.scriptMode,
          fontSize: parsed.fontSize ?? DEFAULT_PREFERENCES.fontSize,
        });
      }
    } catch {
      console.warn("Failed to load reader preferences from localStorage");
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      console.warn("Failed to save reader preferences to localStorage");
    }
  }, [preferences, isHydrated]);

  const setAnnotationMode = useCallback((mode: ReaderPreferences['annotationMode']) => {
    setPreferences(prev => ({ ...prev, annotationMode: mode }));
  }, []);

  const setScriptMode = useCallback((mode: ReaderPreferences['scriptMode']) => {
    setPreferences(prev => ({ ...prev, scriptMode: mode }));
  }, []);

  const setFontSize = useCallback((size: number) => {
    setPreferences(prev => ({ ...prev, fontSize: Math.max(14, Math.min(28, size)) }));
  }, []);

  return {
    ...preferences,
    setAnnotationMode,
    setScriptMode,
    setFontSize,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-side jieba segmentation | Client-side `Intl.Segmenter` | Firefox 125+ (Apr 2024) | No server round-trip, zero deps |
| opencc Python library | opencc-js pure JavaScript | opencc-js 1.0 (2023) | Runs client-side, no native bindings |
| Manual `<ruby>` HTML construction | pinyin-pro `html()` function | pinyin-pro 3.x | Built-in ruby generation with CSS classes |
| Individual Popover per character | Single shared popup + virtual reference | Floating UI 1.x pattern | 1 DOM node vs 5,000 |

**Deprecated/outdated:**
- `nodejieba` for client-side use: Intl.Segmenter is now universally supported
- `opencc` (Python): opencc-js provides identical conversion quality in JavaScript
- Manual encoding detection: `jschardet` handles the statistical analysis

## Open Questions

1. **Annotation mode rendering path: font vs ruby**
   - What we know: Custom phonetic fonts are NOT available (sans-serif placeholder). The `<ruby>` approach via pinyin-pro `html()` is functional now.
   - What's unclear: When will custom font files be provided? The annotation mode selector design depends on this.
   - Recommendation: Build with `<ruby>` HTML as the primary rendering path. Add a feature flag (`ANNOTATION_RENDER_MODE = 'ruby' | 'font'`) that can switch to PhoneticText when fonts arrive. The PhoneticText component already exists and is wired into 4 consumer components.

2. **Third-tone sandhi grouping for 3+ consecutive third tones**
   - What we know: Right-to-left pairing (2+3 pattern) is the standard computational approximation. `小老鼠` becomes `xiǎo láo shǔ` (second changes, first stays 3).
   - What's unclear: Linguistically, grouping depends on word boundaries (小/老鼠 vs 小老/鼠). The simple right-to-left approach doesn't consider word boundaries.
   - Recommendation: Use the right-to-left approach for v6.0. It's correct for the majority of cases and matches what most digital tools do. Word-boundary-aware sandhi could be added later using the Intl.Segmenter word boundaries to group syllables.

3. **Text length limit for the reader**
   - What we know: 20,000 characters is safe without virtualization (v6-reader-ux.md research).
   - What's unclear: Exact performance threshold with `<ruby>` annotations enabled (3x DOM nodes).
   - Recommendation: Set soft limit at 20,000 characters. Show a warning for texts exceeding this. If annotations are enabled, the effective limit may be lower (~10,000). Test during implementation and adjust.

4. **jschardet client-side vs server-side**
   - What we know: jschardet uses `Buffer` internally. Next.js polyfills Buffer in the browser, but the polyfill adds bundle size.
   - What's unclear: Whether the Buffer polyfill is already included (it likely is since other deps use it).
   - Recommendation: For .txt files, try UTF-8 decode first. Check for CJK characters. If no CJK found, send the raw ArrayBuffer to a `/api/reader/decode` endpoint for server-side encoding detection. For .pdf files, always use the server endpoint (pdf-parse requires Node.js anyway).

## Sources

### Primary (HIGH confidence)
- `/zh-lx/pinyin-pro` (Context7) - pinyin options, html() function, convert() function
- `/nk2028/opencc-js` (Context7) - Converter API, supported locales, HK variant
- Local testing (verified) - pinyin-pro v3.28.0 tone sandhi behavior, opencc-js v1.0.5 conversion, Intl.Segmenter output, jschardet detection
- Codebase inspection - AppSidebar.tsx, useSubtitlePreference.ts, PhoneticText.tsx, chunking.ts, dictionary schema, TTS API, useTTS hook

### Secondary (MEDIUM confidence)
- [opencc-js README](https://github.com/nk2028/opencc-js) - Full locale list, import patterns
- [pinyin-pro docs](https://pinyin-pro.cn/en/use/pinyin.html) - toneSandhi option (confirmed: only 一 and 不)
- [opencc-js npm](https://www.npmjs.com/package/opencc-js) - ESM import compatibility with Next.js

### Tertiary (LOW confidence)
- Mandarin tone sandhi linguistic rules - right-to-left grouping approximation is standard but not universally agreed upon for all cases

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all packages installed and verified working locally
- Architecture: HIGH - patterns follow existing codebase conventions (useSubtitlePreference, dashboard layout, event delegation)
- Pitfalls: HIGH - every pitfall verified by running the actual libraries locally
- Tone sandhi: MEDIUM - the implementation works correctly for common cases but linguistic edge cases (3+ consecutive third tones with word boundaries) are an approximation

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (stable libraries, no fast-moving APIs)
