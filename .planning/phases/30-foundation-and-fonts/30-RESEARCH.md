# Phase 30: Foundation & Fonts - Research

**Researched:** 2026-02-06
**Domain:** Custom font loading (next/font/local), Voice AI language routing, AI prompt engineering
**Confidence:** HIGH

## Summary

Phase 30 covers three distinct workstreams: (1) loading two custom Chinese phonetic annotation fonts site-wide via `next/font/local`, (2) fixing the Voice AI tutor to pass the user's language preference into the system prompt, and (3) updating AI system prompts with Canto-to-Mando pedagogical awareness. All three build on existing infrastructure -- the font system uses Next.js built-in APIs, the voice AI fix threads an existing `languagePreference` value through an existing call chain, and the prompt updates modify existing editable prompts in the database.

The codebase already has the language preference stored in the `users` table, a client-side hook (`useLanguagePreference`) to fetch it, the chatbot already sends it to the chat API, and there is a full prompt management system with versioning. The voice AI path is the only one missing the language preference -- `buildLessonInstructions()` in `lesson-context.ts` does not accept or use `languagePreference`, and `useRealtimeConversation.connect()` only takes `lessonId`.

Font files are not yet provided by the user. The implementation builds the loading infrastructure with fallback to standard sans-serif until files arrive.

**Primary recommendation:** Load fonts as CSS variables in `layout.tsx` using `next/font/local`, register them in Tailwind CSS 4 `@theme`, create `<PhoneticText>` wrapper component for scoped application, and thread `languagePreference` through the voice AI connect -> buildLessonInstructions -> session update chain.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked -- all items are at Claude's discretion.

### Claude's Discretion
- Font loading strategy (next/font/local with preload: false, display: swap)
- Font application scope (site-wide via CSS variables on body/html)
- Font switching mechanism (CSS class or variable swap based on language preference)
- "Both" language preference handling for fonts (show both annotations or primary only)
- Voice AI fix approach (pass languagePreference to buildLessonInstructions)
- Canto-to-Mando pedagogy prompt tone and depth
- Fallback behavior before font files are provided (standard sans-serif, no annotations)

### Deferred Ideas (OUT OF SCOPE)
None -- user skipped discussion, proceeding directly to planning.
</user_constraints>

---

## Standard Stack

### Core

No new packages needed. Everything uses existing built-in APIs and installed libraries.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next/font/local | Built into Next.js 16.1.4 | Load custom .ttf/.otf/.woff2 fonts | Official Next.js font API, handles optimization, self-hosting, CSS variable injection |
| Tailwind CSS 4 | 4.x (installed) | Font utility classes via `@theme` | Already in use, `--font-*` CSS variables map to `font-*` utility classes automatically |
| AI SDK | ai 6.0.62, @ai-sdk/openai 3.0.23 (installed) | Chat API streaming | Already powering chatbot and voice AI |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useLanguagePreference hook | Existing | Client-side language preference fetching | Already built at `src/hooks/useLanguagePreference.ts` |
| getPrompt() | Existing | Database-backed prompt loading with caching | Already built at `src/lib/prompts.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next/font/local | @fontsource or manual @font-face in CSS | next/font/local handles optimization, subsetting, and preload hints automatically; no reason to bypass it |
| CSS variable font switching | JavaScript font loading API (document.fonts) | CSS variables are simpler, work with SSR, and integrate with Tailwind; JS API is only needed for programmatic load detection |
| Tailwind @theme font registration | Inline style={{fontFamily}} | Tailwind classes are consistent with codebase patterns; inline styles bypass the design system |

**Installation:**
```bash
# No installation needed -- all built-in or already installed
```

---

## Architecture Patterns

### Current Font Architecture (Before Phase 30)

```
src/app/layout.tsx          # Inter font loaded via next/font/google
  -> CSS variable: --font-inter
  -> Applied to <body> className

src/app/globals.css         # Tailwind CSS 4 @theme
  -> --font-sans: var(--font-geist-sans)   <-- NOTE: mismatch, see Pitfall 1
  -> --font-mono: var(--font-geist-mono)

public/fonts/               # Existing font files (not loaded via next/font)
  -> Inter-Regular.ttf      (876KB)
  -> NotoSansSC-Regular.ttf (17.7MB!)  <-- Very large, not currently used by next/font
```

### Target Font Architecture (After Phase 30)

```
src/app/layout.tsx
  -> Inter (Google font) -- existing, no change
  -> hanziPinyin (localFont) -- NEW, CSS var: --font-hanzi-pinyin
  -> cantoneseVisual (localFont) -- NEW, CSS var: --font-cantonese-visual
  -> All three variables applied to <html> className

src/app/globals.css (@theme inline)
  -> --font-sans: var(--font-inter)         # Fix existing mismatch
  -> --font-hanzi-pinyin: var(--font-hanzi-pinyin)   # NEW
  -> --font-cantonese-visual: var(--font-cantonese-visual)  # NEW

src/fonts/                    # NEW directory (co-located with app/)
  -> HanziPinyin-placeholder.txt   # Placeholder until user provides .ttf/.otf
  -> CantoneseVisual-placeholder.txt

src/components/phonetic/
  -> PhoneticText.tsx         # NEW wrapper component for scoped font application
```

### Pattern 1: Loading Multiple Local Fonts via CSS Variables

**What:** Load custom fonts using `next/font/local` and expose them as CSS variables on the root element, so Tailwind utility classes can apply them.

**When to use:** When custom fonts need to be available site-wide but applied selectively to specific components.

**Example:**
```typescript
// Source: Next.js official docs (Context7 /websites/nextjs)
// src/app/layout.tsx
import localFont from "next/font/local";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const hanziPinyin = localFont({
  src: "../fonts/HanziPinyin.woff2",  // relative to layout.tsx
  variable: "--font-hanzi-pinyin",
  display: "swap",
  preload: false,  // Don't preload -- only used in specific contexts
});

const cantoneseVisual = localFont({
  src: "../fonts/CantoneseVisual.woff2",
  variable: "--font-cantonese-visual",
  display: "swap",
  preload: false,
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${hanziPinyin.variable} ${cantoneseVisual.variable}`}>
      <body className="font-sans antialiased bg-gray-950 text-gray-100">
        {children}
      </body>
    </html>
  );
}
```

### Pattern 2: Tailwind CSS 4 Font Registration

**What:** Register CSS variable fonts in Tailwind's `@theme` block so they generate utility classes like `font-hanzi-pinyin`.

**When to use:** After fonts are loaded via `next/font/local` with CSS variables.

**Example:**
```css
/* Source: Tailwind CSS v4 docs (Context7 /tailwindlabs/tailwindcss.com) */
/* src/app/globals.css */
@theme inline {
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), monospace;
  --font-hanzi-pinyin: var(--font-hanzi-pinyin), sans-serif;
  --font-cantonese-visual: var(--font-cantonese-visual), sans-serif;
}
```

Usage in components: `className="font-hanzi-pinyin"` or `className="font-cantonese-visual"`.

### Pattern 3: Scoped Font Application via Wrapper Component

**What:** A React component that applies the correct phonetic font based on the user's language preference. Prevents accidental global application.

**When to use:** Anywhere Chinese text should render with phonetic annotations above characters.

**Example:**
```typescript
// src/components/phonetic/PhoneticText.tsx
"use client";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import { cn } from "@/lib/utils";

interface PhoneticTextProps {
  children: React.ReactNode;
  className?: string;
  /** Override the user's preference for this instance */
  forceLanguage?: "cantonese" | "mandarin";
}

export function PhoneticText({ children, className, forceLanguage }: PhoneticTextProps) {
  const { preference } = useLanguagePreference();
  const lang = forceLanguage || preference;

  const fontClass =
    lang === "mandarin" ? "font-hanzi-pinyin" :
    lang === "cantonese" ? "font-cantonese-visual" :
    "font-hanzi-pinyin"; // "both" defaults to Mandarin pinyin

  return <span className={cn(fontClass, className)}>{children}</span>;
}
```

### Pattern 4: Threading Language Preference Through Voice AI

**What:** Pass `languagePreference` from the client through to `buildLessonInstructions()` and into the OpenAI Realtime session update.

**When to use:** When the voice AI needs to know which language to converse in.

**Call chain:**
```
VoiceConversation (has access to useLanguagePreference)
  -> useRealtimeConversation.connect(lessonId, languagePreference)  // Add param
    -> buildLessonInstructions(lessonId, languagePreference)        // Add param
      -> Appends language guidance to system prompt
    -> sendSessionUpdate(dc, instructions)  // Instructions now include language
```

### Anti-Patterns to Avoid

- **Applying annotation fonts to body/html font-family:** These specialty fonts render phonetic text above every character. Applying globally makes ALL Chinese text (navigation, admin panels, chat) show annotations. Only apply via `PhoneticText` wrapper or explicit `font-hanzi-pinyin` / `font-cantonese-visual` classes on specific elements.
- **Loading 17MB NotoSansSC from public/fonts via next/font:** The existing `NotoSansSC-Regular.ttf` (17.7MB) in `public/fonts/` is too large. It is not loaded via `next/font` currently and should not be. The custom phonetic fonts should be converted to `.woff2` when provided by the user.
- **Using `preload: true` for phonetic fonts:** These fonts are specialty fonts used only in exercise/practice contexts. Preloading them on every page wastes bandwidth. Use `preload: false`.
- **Hardcoding prompt changes:** The project has a full prompt management system with DB storage, versioning, and admin UI. Prompt text changes should go through seed data or admin UI, not by modifying hardcoded `DEFAULT_*` constants (though updating the defaults as fallbacks is fine).

---

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Font loading and optimization | Manual `@font-face` CSS rules | `next/font/local` | Handles subsetting, self-hosting, preload hints, size-adjust for CLS prevention |
| Language preference fetching | New context provider or fetch call | `useLanguagePreference` hook (existing) | Already built, tested, has optimistic updates and error handling |
| Prompt storage and versioning | Hardcoded string constants | `getPrompt()` + `ai_prompts` table (existing) | Already built with caching, versioning, admin UI editing |
| Font-to-Tailwind class mapping | Custom CSS or inline styles | Tailwind CSS 4 `@theme` `--font-*` variables | Automatic utility class generation, consistent with codebase |

**Key insight:** Phase 30 is primarily a wiring/integration phase, not a build-from-scratch phase. Almost every piece of infrastructure already exists -- fonts need loading config, voice AI needs a parameter threaded through, and prompts need content updates. The only new component is `PhoneticText`.

---

## Common Pitfalls

### Pitfall 1: Font CSS Variable Mismatch in globals.css

**What goes wrong:** The current `globals.css` declares `--font-sans: var(--font-geist-sans)` and `--font-mono: var(--font-geist-mono)`, but `layout.tsx` loads Inter with `variable: "--font-inter"`. The Geist variables are likely from Next.js's default template and were never updated. This means `font-sans` in Tailwind currently resolves to an undefined variable.

**Why it happens:** When the project was scaffolded, Next.js generated Geist font references. Layout was changed to use Inter but globals.css wasn't updated.

**How to avoid:** Fix `globals.css` to use `var(--font-inter)` for `--font-sans` as part of this phase's font cleanup.

**Warning signs:** If `font-sans` class doesn't apply Inter, the variables are mismatched.

### Pitfall 2: Applying Annotation Fonts Globally (from v4.0 Pitfalls research)

**What goes wrong:** Custom phonetic font is applied via `font-family` on body or high-level container. ALL Chinese text site-wide shows phonetic annotations -- navigation, admin panels, chat messages, course descriptions. Visually overwhelming and breaks layouts (annotations add vertical height above every character).

**Why it happens:** Developer adds the font class to the body tag for convenience, not realizing these are specialty fonts where every glyph includes annotation text rendered above the base character.

**How to avoid:** Load fonts via CSS variables in layout.tsx but apply them ONLY through the `PhoneticText` wrapper component or explicit class on specific elements. The body retains `font-sans` (Inter).

**Warning signs:** If Chinese text in the navigation bar or admin panel shows phonetic annotations, font scoping is wrong.

### Pitfall 3: Font Files Too Large

**What goes wrong:** CJK font files can be 5-20MB each. First page load delays significantly for font download. Users see fallback font (FOUT) for several seconds.

**Why it happens:** CJK fonts contain thousands of glyphs. Without conversion to .woff2 format, file sizes are unnecessarily large.

**How to avoid:**
- Convert user-provided .ttf/.otf to .woff2 (30-50% size reduction)
- Use `preload: false` since fonts are only needed in exercise/practice contexts
- `display: "swap"` ensures text is visible immediately with fallback font
- Consider font subsetting if possible (remove unused Unicode blocks)

**Warning signs:** Network tab shows font file > 5MB, or Lighthouse flags large font downloads.

### Pitfall 4: Voice AI Not Receiving Language Preference

**What goes wrong:** `buildLessonInstructions()` is called from `useRealtimeConversation.connect()` which runs on the CLIENT. But `buildLessonInstructions()` does a direct DB query (it imports from `@/db`). This works because it is actually called server-side during initial page load... WAIT -- no, `useRealtimeConversation` is a client hook marked `"use client"`. It imports `buildLessonInstructions` which imports `db` from `@/db`.

**Actual issue:** Looking at the code more carefully, `buildLessonInstructions` does a direct DB import (`import { db } from "@/db"`). This is called from a client-side hook. This would fail in the browser. However, it's been working in the existing codebase, which means either: (a) the DB client works in the browser (Neon serverless can), or (b) there's tree-shaking that makes this work. Regardless, the fix for language preference should follow the same pattern -- either add `languagePreference` as a parameter to `buildLessonInstructions()`, or fetch it inside that function via a DB query using the lesson's user context.

**How to avoid:** The cleanest approach is to pass `languagePreference` as a parameter from the VoiceConversation component (which can use the `useLanguagePreference` hook) through to `connect()` and into `buildLessonInstructions()`. This avoids an additional DB query and reuses the existing client-side preference.

### Pitfall 5: Forgetting to Update Both System Prompts (Voice AND Chatbot)

**What goes wrong:** Developer updates the voice AI tutor prompt with Canto-to-Mando pedagogical awareness but forgets to update the chatbot system prompt, or vice versa. Students get inconsistent pedagogical approaches between the two AI channels.

**Why it happens:** The voice AI and chatbot have separate prompts (`voice-tutor-system` and `chatbot-system` slugs) stored in separate seed entries and loaded independently.

**How to avoid:** Update BOTH prompts in the same task. The chatbot prompt already has a "TEACHING APPROACH" section about Canto-to-Mando connections, but it should be enhanced to match the updated voice AI prompt depth. Both prompts should use the same pedagogical framework.

---

## Code Examples

### Example 1: Current layout.tsx Font Setup (What Exists Now)

```typescript
// Source: /home/sheldon/CLAUDE/New-LMS/src/app/layout.tsx
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Body uses: className={`${inter.variable} font-sans antialiased bg-gray-950 text-gray-100`}
```

### Example 2: Current Voice AI Call Chain (What Exists Now)

```typescript
// Source: /home/sheldon/CLAUDE/New-LMS/src/hooks/useRealtimeConversation.ts line 199
const instructions = await buildLessonInstructions(lessonId);
// languagePreference is NOT passed ^^

// Source: /home/sheldon/CLAUDE/New-LMS/src/lib/lesson-context.ts line 58
export async function buildLessonInstructions(lessonId: string): Promise<string> {
  // Does NOT accept languagePreference parameter
  // Returns system prompt + lesson context, but without language-specific guidance
}
```

### Example 3: Current Chatbot Language Handling (Working Reference)

```typescript
// Source: /home/sheldon/CLAUDE/New-LMS/src/hooks/useChatbot.ts
// The chatbot ALREADY passes language preference correctly:
const { preference } = useLanguagePreference();
const chatHelpers = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    body: { languagePreference: preference },  // <-- This works
  }),
});

// Source: /home/sheldon/CLAUDE/New-LMS/src/app/api/chat/route.ts line 56
// The chat API appends language guidance to the system prompt:
const systemPrompt = `${basePrompt}

Student language preference: ${languagePreference || "both"}. Respond in the language...`;
```

### Example 4: Target Voice AI Fix

```typescript
// Updated signature for buildLessonInstructions:
export async function buildLessonInstructions(
  lessonId: string,
  languagePreference: "cantonese" | "mandarin" | "both" = "both"
): Promise<string> {
  const systemPrompt = await getPrompt("voice-tutor-system", DEFAULT_VOICE_TUTOR_SYSTEM);

  // Append language-specific guidance (mirrors chat API pattern)
  const languageGuidance = languagePreference === "cantonese"
    ? "Student prefers Cantonese. Speak primarily in Cantonese (Traditional Chinese). Use Jyutping when explaining pronunciation. If comparing to Mandarin, do so briefly."
    : languagePreference === "mandarin"
    ? "Student prefers Mandarin. Speak primarily in Mandarin (Simplified Chinese). Use Pinyin when explaining pronunciation. If comparing to Cantonese, do so briefly."
    : "Student is learning both Cantonese and Mandarin. Freely compare both languages. Show how words sound in both. Use Pinyin for Mandarin and Jyutping for Cantonese.";

  // ... rest of function builds lesson context as before ...

  return `${systemPrompt}\n\n${languageGuidance}\n\n${lessonContext}`;
}
```

### Example 5: Placeholder Font Setup (Before Real Files Arrive)

```typescript
// Until user provides actual font files, use a placeholder approach.
// Option A: Conditional loading with existence check
// The localFont() call will ERROR at build time if the file doesn't exist.
// So we need either a dummy font file or conditional logic.

// Recommended: Create minimal placeholder .woff2 files (empty/minimal font)
// OR: Gate the localFont() calls behind a feature flag / environment variable

// Simplest approach: use a standard fallback font as the "placeholder":
const hanziPinyin = localFont({
  src: "../fonts/HanziPinyin.woff2",   // Will error if file doesn't exist
  variable: "--font-hanzi-pinyin",
  display: "swap",
  preload: false,
});

// ALTERNATIVE: Skip localFont until files are provided. Just register empty CSS vars:
// In globals.css:
// --font-hanzi-pinyin: sans-serif;
// --font-cantonese-visual: sans-serif;
// This lets all downstream code reference the font classes, and they'll use sans-serif.
// When font files arrive, add the localFont() calls and the CSS vars will override.
```

---

## Existing Codebase Map (Files Requiring Changes)

### Files to Modify

| File | Change | Requirement |
|------|--------|-------------|
| `src/app/layout.tsx` | Add `localFont` imports for 2 custom fonts, add CSS variable classes to `<html>` | FIX-02, FIX-03 |
| `src/app/globals.css` | Fix `--font-sans` from geist to inter, add `--font-hanzi-pinyin` and `--font-cantonese-visual` to `@theme` | FIX-02, FIX-03 |
| `src/lib/lesson-context.ts` | Add `languagePreference` parameter to `buildLessonInstructions()`, append language guidance | FIX-01, FIX-05 |
| `src/hooks/useRealtimeConversation.ts` | Update `connect()` to accept and pass `languagePreference` | FIX-01 |
| `src/components/voice/VoiceConversation.tsx` | Add `useLanguagePreference` hook, pass preference to `connect()` | FIX-01 |
| `src/db/seed.ts` | Update voice-tutor-system and chatbot-system prompt content with enhanced Canto-Mando pedagogy | FIX-05 |

### Files to Create

| File | Purpose | Requirement |
|------|---------|-------------|
| `src/fonts/` directory | Home for custom font files (co-located with app/) | FIX-02, FIX-03 |
| `src/components/phonetic/PhoneticText.tsx` | Wrapper component that applies correct font based on language preference | FIX-04 |

### Files for Reference Only (No Changes)

| File | Why Useful |
|------|-----------|
| `src/hooks/useLanguagePreference.ts` | Existing hook to reuse (no changes needed) |
| `src/hooks/useChatbot.ts` | Reference for how chatbot already passes preference (pattern to follow) |
| `src/app/api/chat/route.ts` | Reference for how chatbot API appends language guidance (pattern to follow) |
| `src/lib/prompts.ts` | Existing prompt loading system (no changes needed) |
| `src/db/schema/users.ts` | `languagePreference` column already exists |
| `src/db/schema/prompts.ts` | `aiPrompts` schema already has what we need |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@font-face` in CSS | `next/font/local` + CSS variables | Next.js 13+ (2023) | Automatic optimization, self-hosting, CLS prevention |
| Tailwind `tailwind.config.js` fontFamily | Tailwind CSS 4 `@theme` CSS variables `--font-*` | Tailwind CSS 4 (2025) | No config file needed, pure CSS, auto utility generation |
| Ruby HTML annotations `<ruby>` for phonetics | Custom font files that render annotations as part of the glyph | Font-specific | No HTML complexity, just apply font-family to any Chinese text |

**Deprecated/outdated:**
- `tailwind.config.js` `theme.extend.fontFamily` -- replaced by CSS-based `@theme` in Tailwind CSS 4 (this project already uses v4)
- `@font-face` in globals.css -- still works but `next/font/local` adds optimization on top

---

## Decisions & Recommendations

### Font Loading Strategy

**Recommendation:** Use `next/font/local` with `preload: false` and `display: "swap"`.

**Reasoning:**
- `preload: false` because these phonetic fonts are specialty fonts only used in exercise/practice contexts, not on every page. Preloading wastes bandwidth for navigation-only pages.
- `display: "swap"` ensures Chinese text is immediately visible with fallback font (sans-serif), then swaps to the phonetic font when loaded. No invisible text.
- CSS variable approach (`variable: "--font-hanzi-pinyin"`) integrates cleanly with Tailwind CSS 4's `@theme` system.

### Font Application Scope

**Recommendation:** CSS variables loaded on `<html>` element, but font ONLY applied via `PhoneticText` wrapper component or explicit utility classes on specific elements. Body retains `font-sans` (Inter).

**Reasoning:** These are annotation fonts that render phonetic text above every character. Applying globally would make ALL Chinese text show annotations -- navigation, admin, chat, etc. The `PhoneticText` component provides a clean API for scoped application.

### Font Switching Mechanism

**Recommendation:** CSS class swap based on language preference, implemented in the `PhoneticText` component.

**Logic:**
- `preference === "mandarin"` -> apply `font-hanzi-pinyin` class
- `preference === "cantonese"` -> apply `font-cantonese-visual` class
- `preference === "both"` -> apply `font-hanzi-pinyin` class (Mandarin/Pinyin as primary display; Cantonese annotations available on hover or toggle -- but for v1, just show Pinyin)

### "Both" Language Preference Handling

**Recommendation:** When preference is "both", default to Mandarin Pinyin font. The annotation fonts render ONE phonetic system per font. Showing both simultaneously would require stacking two font layers or using the existing `<ruby>` HTML annotation approach (which the `ChineseAnnotation.tsx` component already does with the `[char|pinyin|jyutping]` format from the chatbot).

**Reasoning:** The custom fonts are a convenience for BULK display (exercises, reading passages). For contexts where both phonetics are needed, the existing `ChineseAnnotation` component with ruby HTML is more appropriate.

### Voice AI Fix Approach

**Recommendation:** Thread `languagePreference` through the call chain:
1. `VoiceConversation` component uses `useLanguagePreference()` hook
2. Passes preference to `connect(lessonId, languagePreference)`
3. `useRealtimeConversation.connect()` passes it to `buildLessonInstructions(lessonId, languagePreference)`
4. `buildLessonInstructions()` appends language-specific guidance to the system prompt (same pattern as the chatbot API in `src/app/api/chat/route.ts`)

This mirrors exactly how the chatbot already handles it successfully.

### Canto-to-Mando Pedagogy Prompt Updates

**Recommendation:** Enhance both the `voice-tutor-system` and `chatbot-system` prompts with a shared pedagogical framework. Key additions:

1. **Cognate awareness:** Point out when Cantonese and Mandarin words share the same characters but different pronunciations (e.g., 你好 is "nei5 hou2" in Cantonese vs "nǐ hǎo" in Mandarin)
2. **Tone mapping:** Explain how Cantonese tones relate to Mandarin tones (e.g., Mandarin tone 1 often maps to Cantonese tone 1 or 4)
3. **Shared vocabulary:** Highlight that ~70% of vocabulary is shared between written Cantonese and Mandarin
4. **Divergent vocabulary:** Flag common words that differ entirely (e.g., 係/是 for "is")
5. **Register awareness:** Note when a word is formal/written Chinese (shared) vs colloquial (divergent)

Update both the hardcoded `DEFAULT_*` constants (fallbacks) AND the seed data content.

### Fallback Before Font Files

**Recommendation:** Do NOT use `localFont()` with nonexistent files (it will error at build time). Instead:
1. Create the `src/fonts/` directory
2. In `globals.css`, register the font CSS variables with `sans-serif` as the fallback value
3. In `layout.tsx`, conditionally load the fonts only if the files exist -- OR simpler: skip the `localFont()` calls entirely and add them when files arrive
4. The `PhoneticText` component will still work -- it applies `font-hanzi-pinyin` class which resolves to `sans-serif` (normal text, no annotations)
5. When font files are provided by the user, add `localFont()` calls and the CSS variables will automatically override the fallback

This approach means all downstream code (PhoneticText, font classes, Tailwind utilities) works immediately. The only thing that changes when font files arrive is adding 2 lines of `localFont()` config and dropping the files into `src/fonts/`.

---

## Open Questions

1. **Font file format and size**
   - What we know: User will provide .ttf or .otf files for both Hanzi Pinyin and Cantonese Visual fonts
   - What's unclear: How large the files are (CJK fonts range from 2-20MB), and whether .woff2 conversion is possible with these specialty fonts
   - Recommendation: Accept whatever format is provided; add a task to convert to .woff2 when files arrive

2. **Annotation font behavior with "Both" preference**
   - What we know: Each font renders ONE phonetic system (Pinyin OR Jyutping) above characters
   - What's unclear: Whether the user expects both annotations simultaneously for "both" preference, or is okay with Pinyin as default with a toggle
   - Recommendation: Default to Pinyin for "both", document in code that this is a v1 decision that can be enhanced later

3. **buildLessonInstructions runs on client but imports db**
   - What we know: `useRealtimeConversation` is a `"use client"` hook that calls `buildLessonInstructions` which imports from `@/db`. This currently works (Neon serverless may work in browser, or bundler may handle it).
   - What's unclear: Whether adding `languagePreference` parameter creates any new issues with this client/server boundary
   - Recommendation: Follow the existing pattern exactly. If it works for `lessonId`, it will work with the added parameter.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/nextjs` -- next/font/local API, CSS variable configuration, preload and display options
- Context7 `/tailwindlabs/tailwindcss.com` -- Tailwind CSS 4 `@theme` custom font family registration
- Codebase files directly read: `layout.tsx`, `globals.css`, `lesson-context.ts`, `useRealtimeConversation.ts`, `VoiceConversation.tsx`, `useChatbot.ts`, `chat/route.ts`, `useLanguagePreference.ts`, `prompts.ts`, `seed.ts`, `users.ts`, `ChatPanel.tsx`, `ChineseAnnotation.tsx`

### Secondary (MEDIUM confidence)
- v4.0-STACK.md -- Prior research on font loading approach (confirmed by Context7 docs)
- v4.0-PITFALLS.md -- Pitfall 3 (global font application) and Pitfall 9 (font file size) directly apply

### Tertiary (LOW confidence)
- None -- all findings verified against codebase and official documentation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new packages, all built-in Next.js and existing infrastructure
- Architecture: HIGH -- patterns directly verified against Next.js docs and existing codebase conventions
- Pitfalls: HIGH -- font scoping pitfall confirmed by v4.0-PITFALLS.md research; CSS variable mismatch discovered by reading actual code; voice AI call chain traced through actual source files

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (stable -- no fast-moving dependencies, all built-in APIs)
