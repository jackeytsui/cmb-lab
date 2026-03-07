# Existing Codebase Assets for v6.0: Reading & Dictionary

**Project:** CantoMando Blueprint LMS
**Researched:** 2026-02-08
**Confidence:** HIGH (all findings from direct codebase inspection)

---

## 1. Azure Speech SDK Integration

### Current Implementation

The codebase uses the **Azure Speech REST API** (not the SDK npm package) for pronunciation assessment. This is a server-side-only integration.

**Core file:** `src/lib/pronunciation.ts` (203 lines)

| Item | Details |
|------|---------|
| API Type | REST API (not npm SDK) -- accepts raw audio directly, no format conversion needed |
| Endpoint | `https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` |
| Languages | `zh-CN` (Mandarin) and `zh-HK` (Cantonese) |
| Assessment config | `GradingSystem: "HundredMark"`, `Granularity: "Phoneme"`, `Dimension: "Comprehensive"`, `EnableProsodyAssessment: "True"` |
| Auth | API key header `Ocp-Apim-Subscription-Key` |
| Audio formats | OGG/OPUS, WebM/OPUS, WAV/PCM -- mapped from browser MIME types |
| Timeout | 20 seconds via AbortController |

**Key functions:**
- `assessPronunciation(audioBuffer, referenceText, language, mimeType)` -- line 48
- `mapToAzureContentType(mimeType)` -- line 24
- `parseAzureResponse(data)` -- line 148
- `generatePronunciationFeedback(result)` -- line 189

**Type definitions:** `src/types/pronunciation.ts` (36 lines)
- `PronunciationAssessmentResult` -- overall + per-word scores
- `PronunciationWordResult` -- word, accuracyScore, errorType

### API Routes Using Azure Speech

| Route | File | Purpose |
|-------|------|---------|
| `POST /api/practice/grade` | `src/app/api/practice/grade/route.ts` | Pronunciation assessment for practice exercises (Azure primary, n8n fallback) |
| `POST /api/grade-audio` | `src/app/api/grade-audio/route.ts` | Audio grading for lesson interactions (n8n only, no Azure) |

**Important:** The practice grade route (line 246-275) has a dual path:
1. If `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` are set AND `targetPhrase` exists, use Azure directly
2. Otherwise, fall back to n8n audio grading webhook

### Environment Variables

From `.env.example` (lines 118-124):
```
AZURE_SPEECH_KEY=your-azure-speech-key        # Optional
AZURE_SPEECH_REGION=eastus                     # Optional
```

### Reusability for TTS

**Assessment:** The current Azure integration is **pronunciation assessment only** (Speech-to-Text direction). TTS requires a completely different Azure endpoint:

- Current: `stt.speech.microsoft.com` (Speech-to-Text with pronunciation scoring)
- TTS would use: `tts.speech.microsoft.com` (Text-to-Speech)

**What CAN be reused:**
- The same `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` credentials work for both STT and TTS -- same Azure Speech resource
- The REST API pattern (fetch with `Ocp-Apim-Subscription-Key` header)
- The `AbortController` timeout pattern
- The locale mapping logic (`"cantonese" -> "zh-HK"`, `"mandarin" -> "zh-CN"`)

**What CANNOT be reused:**
- The endpoint URL (different service)
- The request format (TTS sends SSML, not audio)
- The response parsing (TTS returns audio, not JSON)
- All the pronunciation-specific logic

**No new npm packages needed** -- Azure TTS can be called via the same REST pattern used for pronunciation.

### Audio Utilities

`src/lib/audio-utils.ts` (101 lines) -- Cross-browser audio recording support:
- `getSupportedMimeType()` -- detects best audio format
- `validateAudioBlob()` -- validates audio data
- `getFileExtensionForMimeType()` -- MIME to extension
- `isAudioRecordingSupported()` -- browser capability check

These are recording-focused (input) but the MIME type detection logic could inform TTS audio playback format selection.

---

## 2. Custom Font System

### Current State (Post-Phase 30)

Phase 30 (completed 2026-02-06) built the font infrastructure but **actual custom font files have NOT been provided yet**. The system currently falls back to `sans-serif`.

#### Font Loading Architecture

**Root layout** (`src/app/layout.tsx`, lines 42-52):
```typescript
{/* Comment explains: replace 'sans-serif' with localFont().style.fontFamily
    once custom .woff2/.ttf font files are provided */}
<html
  lang="en"
  className="dark"
  style={{
    '--font-hp-src': 'sans-serif',      // Placeholder for Hanzi Pinyin font
    '--font-cv-src': 'sans-serif',      // Placeholder for Cantonese Visual font
  } as React.CSSProperties}
>
```

**CSS theme** (`src/app/globals.css`, lines 11-12):
```css
--font-hanzi-pinyin: var(--font-hp-src), "Noto Sans SC", sans-serif;
--font-cantonese-visual: var(--font-cv-src), "Noto Sans SC", sans-serif;
```

**Font files in `public/fonts/`:**
- `Inter-Regular.ttf` (877 KB) -- not loaded via `next/font`, used by `@react-pdf/renderer`
- `NotoSansSC-Regular.ttf` (17.8 MB) -- Chinese sans-serif, referenced as CSS fallback but NOT loaded via `next/font` (too large)

**No `src/fonts/` directory exists yet** -- planned but not created.

#### PhoneticText Component

**File:** `src/components/phonetic/PhoneticText.tsx` (41 lines)

Scoped font wrapper that applies the correct font based on language preference:
- `"cantonese"` -> `font-cantonese-visual` class
- `"mandarin"` or `"both"` -> `font-hanzi-pinyin` class

Uses `useLanguagePreference()` hook internally (line 31).

Currently integrated into 4 consumer components:
- `TextInteraction.tsx` (line 114)
- `AudioInteraction.tsx` (line 168)
- `ChatMessage.tsx` (line 65)
- `FeedbackDisplay.tsx` (lines 38, 59, 73)

#### ChineseAnnotation Component

**File:** `src/components/chat/ChineseAnnotation.tsx` (111 lines)

Parses `[char|pinyin|jyutping]` annotation format into HTML `<ruby>` elements:
- Yellow for Pinyin annotations
- Cyan for Jyutping annotations

Includes `parseAnnotatedText()` function that splits text into annotated/plain segments.

**Relevance to v6.0 Reading/Dictionary:** This component already handles inline phonetic annotation rendering with ruby HTML. The Reader feature could reuse this pattern for character-level annotations, or use the PhoneticText approach with custom fonts, or combine both.

#### Subtitle Preference Hook

**File:** `src/hooks/useSubtitlePreference.ts` (117 lines)

Manages Pinyin/Jyutping annotation visibility via localStorage:
- `showPinyin: boolean`
- `showJyutping: boolean`
- `togglePinyin()`, `toggleJyutping()`

**Relevance:** Reader preferences (show/hide annotations) could follow this exact pattern.

### Pinyin/Jyutping Libraries Already Installed

Both romanization libraries are installed and used:

| Library | Version | File | Usage |
|---------|---------|------|-------|
| `pinyin-pro` | ^3.28.0 | `src/lib/search-utils.ts` | Convert Chinese chars to Pinyin (no tones) for search indexing |
| `to-jyutping` | ^3.1.1 | `src/lib/search-utils.ts` | Convert Chinese chars to Jyutping for search indexing |

**Relevance to Dictionary:** These same libraries can generate Pinyin/Jyutping for any Chinese text the user taps in the Reader. They are already proven to work in this codebase.

---

## 3. Lesson Data Model

### Content Hierarchy

```
Course (courses table)
  -> Module (modules table, FK: course_id)
    -> Lesson (lessons table, FK: module_id)
      -> Interaction (interactions table, FK: lesson_id)
```

### Schema Details

**Courses** (`src/db/schema/courses.ts`):
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| title | text | NOT NULL |
| description | text | nullable |
| thumbnailUrl | text | nullable |
| isPublished | boolean | default false |
| previewLessonCount | integer | default 3 |
| sortOrder | integer | default 0 |
| searchPinyin | text | Pre-computed Pinyin for search |
| searchJyutping | text | Pre-computed Jyutping for search |

**Modules** (`src/db/schema/courses.ts`):
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| courseId | uuid | FK -> courses, CASCADE delete |
| title | text | NOT NULL |
| description | text | nullable |
| sortOrder | integer | default 0 |

**Lessons** (`src/db/schema/courses.ts`):
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| moduleId | uuid | FK -> modules, CASCADE delete |
| title | text | NOT NULL |
| description | text | nullable |
| muxPlaybackId | text | Video playback ID |
| muxAssetId | text | Video asset ID |
| durationSeconds | integer | nullable |
| sortOrder | integer | default 0 |
| searchPinyin | text | Pre-computed Pinyin |
| searchJyutping | text | Pre-computed Jyutping |

**Interactions** (`src/db/schema/interactions.ts`):
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| lessonId | uuid | FK -> lessons, CASCADE delete |
| timestamp | integer | Seconds into video |
| type | enum | "text" or "audio" |
| language | enum | "cantonese", "mandarin", or "both" |
| prompt | text | What to show the student |
| expectedAnswer | text | For AI grading context (nullable) |
| correctThreshold | integer | Score 0-100 needed to pass, default 80 |
| sortOrder | integer | default 0 |

### Text Content Fields Available for Reader Pre-loading

The following fields contain Chinese text that could be loaded into a Reading feature:

| Field | Location | Content Type |
|-------|----------|-------------|
| `interactions.prompt` | Interaction checkpoints | Chinese prompts shown during video |
| `interactions.expectedAnswer` | Interaction checkpoints | Expected Chinese responses |
| `lessons.title` | Lesson metadata | May contain Chinese |
| `lessons.description` | Lesson metadata | May contain Chinese |
| `courses.title` / `description` | Course metadata | May contain Chinese |

**Gap:** There is **no dedicated "reading content" or "transcript" field** on lessons. The current data model is video-centric (Mux playback). A Reader feature would need either:
1. A new `readingContent` text field on lessons (for lesson-associated reading)
2. A new `reading_passages` table (for standalone reading content)
3. Both (reading can be lesson-attached OR standalone)

### Practice System (Related)

`src/db/schema/practice.ts` -- Contains exercise definitions with Chinese content:
- `practiceExercises.definition` -- JSONB with typed exercise content (MultipleChoice, FillInBlank, Matching, Ordering, AudioRecording, FreeText)
- These exercise definitions contain Chinese text that could be used for reading practice

### Knowledge Base (Potential Dictionary Source)

`src/db/schema/knowledge.ts` -- Existing knowledge base system:
- `kbEntries` -- title + rich text content
- `kbChunks` -- Searchable text chunks with indexing
- `kbCategories` -- Categorization

**Relevance:** The knowledge base chunking system could potentially be adapted for dictionary entries, but it is designed for free-form knowledge articles, not structured dictionary data (character, definition, stroke count, radicals, example sentences). A dedicated dictionary table would be cleaner.

---

## 4. Existing UI Components

### shadcn/ui Components Installed

**Config:** `components.json` -- style: `new-york`, RSC: true, icons: `lucide`

| Component | File | Notes |
|-----------|------|-------|
| alert-dialog | `src/components/ui/alert-dialog.tsx` | Confirmation dialogs |
| avatar | `src/components/ui/avatar.tsx` | User avatars |
| button | `src/components/ui/button.tsx` | Primary UI button |
| card | `src/components/ui/card.tsx` | Content cards |
| chart | `src/components/ui/chart.tsx` | Recharts wrapper |
| collapsible | `src/components/ui/collapsible.tsx` | Expandable sections |
| dialog | `src/components/ui/dialog.tsx` | Modal dialogs |
| dropdown-menu | `src/components/ui/dropdown-menu.tsx` | Dropdown menus |
| error-alert | `src/components/ui/error-alert.tsx` | Error display |
| form | `src/components/ui/form.tsx` | React Hook Form integration |
| input | `src/components/ui/input.tsx` | Text input |
| label | `src/components/ui/label.tsx` | Form labels |
| progress | `src/components/ui/progress.tsx` | Progress bars |
| select | `src/components/ui/select.tsx` | Select dropdowns |
| separator | `src/components/ui/separator.tsx` | Visual dividers |
| sheet | `src/components/ui/sheet.tsx` | Slide-out panels |
| sidebar | `src/components/ui/sidebar.tsx` | Full sidebar system (728 lines) |
| skeleton | `src/components/ui/skeleton.tsx` | Loading skeletons |
| switch | `src/components/ui/switch.tsx` | Toggle switches |
| tabs | `src/components/ui/tabs.tsx` | Tab panels |
| textarea | `src/components/ui/textarea.tsx` | Multi-line input |
| tooltip | `src/components/ui/tooltip.tsx` | Hover tooltips |

**NOT installed but needed for v6.0:**
| Component | Why Needed |
|-----------|-----------|
| **Popover** | Radix Popover (`@radix-ui/react-popover` v1.1.15 is already in `package.json`!) but the shadcn popover.tsx component is NOT in `src/components/ui/`. Need to add via `npx shadcn@latest add popover`. Critical for dictionary tap-to-define popover. |
| **Scroll Area** | For reader content with smooth scrolling |
| **Toggle / Toggle Group** | For reader toolbar (show/hide annotations, font size) |
| **Badge** | For tagging word difficulty levels, HSK/HKCEE levels |
| **Command** | For dictionary search (cmd+k pattern) |

**Important discovery:** `@radix-ui/react-popover` v1.1.15 is installed as a dependency (line 35 of package.json) but no `popover.tsx` exists in `src/components/ui/`. Some component may import it directly. The shadcn wrapper component needs to be added.

### Sidebar Layout Pattern

**Dashboard layout** (`src/app/(dashboard)/layout.tsx`, 52 lines):
```
SidebarProvider (manages expand/collapse state, persists in cookie)
  -> AppSidebar (role-based navigation sections)
  -> SidebarInset (main content area)
       -> header (SidebarTrigger + SearchBar + NotificationBell)
       -> main (children)
```

**AppSidebar** (`src/components/layout/AppSidebar.tsx`, 115 lines):
- Three nav sections: Learning (student), Coach Tools (coach), Admin (admin)
- Role-based filtering using hierarchy array
- Collapsible icon mode

**Relevance to Reader:** A Reading/Dictionary section would add a new nav item to the "Learning" section. The sidebar layout is well-established and extensible.

### Additional Libraries Installed

| Library | Version | Relevance to v6.0 |
|---------|---------|-------------------|
| `framer-motion` | ^12.29.2 | Animations for reader interactions (page turns, popover entries) |
| `@tanstack/react-table` | ^8.21.3 | Could display dictionary word lists |
| `react-hook-form` + `@hookform/resolvers` | ^7.71.1 / ^5.2.2 | Form handling for reader settings |
| `zod` | ^4.3.6 | Schema validation for dictionary/reading data |
| `use-debounce` | ^10.1.0 | Debounce dictionary search input |
| `@dnd-kit/react` + `@dnd-kit/helpers` | ^0.2.3 | Drag-and-drop for reading exercises (sentence reordering) |
| `xstate` + `@xstate/react` | ^5.25.1 / ^6.0.0 | State machines for reader flow |

---

## 5. User Preferences System

### Database Column

`src/db/schema/users.ts` (line 7-11, 19-21):
```typescript
export const languagePreferenceEnum = pgEnum("language_preference", [
  "cantonese", "mandarin", "both",
]);

// In users table:
languagePreference: languagePreferenceEnum("language_preference")
  .notNull()
  .default("both"),
```

Additional user preference columns:
- `dailyGoalXp` (integer, default 100)
- `timezone` (text, default "UTC")
- `showCohortRankings` (boolean, default false)

### Preferences API

**File:** `src/app/api/user/preferences/route.ts` (171 lines)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/user/preferences` | Fetch languagePreference, dailyGoalXp, timezone, showCohortRankings |
| `PATCH` | `/api/user/preferences` | Update any subset of preferences |

Validation:
- languagePreference: must be "cantonese", "mandarin", or "both"
- dailyGoalXp: integer 10-500
- timezone: non-empty string, max 64 chars
- showCohortRankings: boolean

### Client-Side Hook

**File:** `src/hooks/useLanguagePreference.ts` (124 lines)

```typescript
const { preference, isLoading, error, setPreference, refresh } = useLanguagePreference();
```

Features: Fetches on mount, optimistic updates with rollback, error handling.

### Settings UI

**File:** `src/components/settings/SettingsForm.tsx` (360 lines)

Four sections: Language Preference (3 cards), Daily XP Goal (4 tiers), Timezone (select), Notification Preferences (toggles).

### Adding Reader-Specific Preferences

**Strategy options:**

1. **Add columns to users table** (simple, limited):
   - `readerFontSize: integer` (default 16)
   - `readerShowPinyin: boolean` (default true)
   - `readerShowJyutping: boolean` (default true)
   - Pros: works with existing PATCH API pattern
   - Cons: couples reader settings to user record, migration needed

2. **JSONB preferences column** (flexible):
   - Add `preferences: jsonb` column to users
   - Store structured prefs: `{ reader: { fontSize: 16, showPinyin: true, ... }, ... }`
   - Pros: extensible without schema changes
   - Cons: no column-level validation

3. **localStorage only** (like useSubtitlePreference):
   - Already proven pattern in `src/hooks/useSubtitlePreference.ts`
   - Pros: no API call, instant, no migration
   - Cons: not synced across devices

**Recommendation:** Use localStorage (option 3) for reader UI preferences (font size, annotation visibility) following the `useSubtitlePreference` pattern. These are view preferences that don't need server persistence. Reserve DB columns for important learning state.

---

## 6. Pending Cleanup Items

### Migrations

There are **11 migrations** in `src/db/migrations/`:
```
0000_majestic_kylun.sql     (initial schema)
0001_huge_husk.sql
0002_young_squadron_sinister.sql
0003_demonic_flatman.sql
0004_peaceful_bullseye.sql
0005_careful_green_goblin.sql   <-- untracked (git status)
0006_watery_richard_fisk.sql
0007_rapid_lockjaw.sql
0008_striped_shotgun.sql
0009_smart_the_professor.sql
0010_regular_cardiac.sql
```

Migration 0005 is showing as untracked in git status. This may need to be committed before v6.0 work begins.

### Azure Speech Credential Status

- Credentials are marked **optional** in `.env.example`
- The code gracefully handles missing credentials (line 56-58 of pronunciation.ts throws, and practice grade route catches and falls back to n8n)
- No TTS-specific credentials exist yet
- Same `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` can serve TTS

### Custom Font File Status

- **Font infrastructure is COMPLETE** (Phase 30, verified 2026-02-06)
- **Actual font files NOT provided** -- system uses `sans-serif` fallback
- CSS variables `--font-hp-src` and `--font-cv-src` are set to `'sans-serif'` in layout.tsx
- `src/fonts/` directory was planned but **not created**
- `PhoneticText` component exists and is wired into 4 consumer components
- When font files arrive, only need: (1) place files in `src/fonts/`, (2) add `localFont()` calls, (3) update CSS variable values

### No TODOs or FIXMEs

Grep for `TODO|FIXME|HACK|XXX` across all `.ts` and `.tsx` files returned **zero matches**. The codebase is clean.

### Untracked Files in Git

From git status:
```
D middleware.ts                                      # Deleted file
?? .planning/phases/04-progress-system/04-VERIFICATION.md
?? .planning/v1-MILESTONE-AUDIT.md
?? src/db/migrations/0005_careful_green_goblin.sql
?? src/middleware.ts                                 # New middleware
```

---

## 7. Summary of Reusable Assets for v6.0

### Directly Reusable (No Changes Needed)

| Asset | File | v6.0 Use |
|-------|------|---------|
| `pinyin-pro` library | `package.json` | Generate Pinyin for any Chinese text in reader |
| `to-jyutping` library | `package.json` | Generate Jyutping for any Chinese text in reader |
| `useLanguagePreference` hook | `src/hooks/useLanguagePreference.ts` | Reader knows which annotations to show |
| `useSubtitlePreference` hook | `src/hooks/useSubtitlePreference.ts` | Pattern for reader view preferences (font size, annotations) |
| `PhoneticText` component | `src/components/phonetic/PhoneticText.tsx` | Wrap reader Chinese text for font annotation |
| `ChineseAnnotation` component | `src/components/chat/ChineseAnnotation.tsx` | Ruby annotation rendering for dictionary popover |
| `parseAnnotatedText()` function | `src/components/chat/ChineseAnnotation.tsx` | Parse `[char|pinyin|jyutping]` format |
| Azure Speech credentials | `.env` | Same key works for TTS (new endpoint, same auth) |
| Sidebar layout | `src/components/layout/AppSidebar.tsx` | Add "Reading" nav item to Learning section |
| Rate limiting | `src/lib/rate-limit.ts` | Rate-limit dictionary API and TTS API calls |
| Preferences API | `src/app/api/user/preferences/route.ts` | Extensible for reader preferences if needed |
| `@radix-ui/react-popover` | `package.json` | Already installed, need shadcn wrapper for dictionary popover |

### Needs Extending

| Asset | What to Add | For |
|-------|-------------|-----|
| Database schema | New `reading_passages` and `dictionary_entries` tables | Reader content and dictionary data |
| XP system | New XP source: `"reading_complete"` | Award XP for completing reading passages |
| `xpSourceEnum` | Add `"reading_complete"` value | Track reading XP events |
| AppSidebar nav | Add Reading item to Learning section | Navigation |
| `globals.css` font setup | No change needed until font files arrive | Font display |

### Needs Building from Scratch

| Component | Purpose |
|-----------|---------|
| Reader page/route | `/dashboard/reader` or `/reader/[id]` |
| Dictionary popover | Tap/click Chinese character -> show definition, pinyin, jyutping |
| Dictionary search | Search by character, pinyin, jyutping, English |
| TTS API route | `POST /api/tts` -- Azure Text-to-Speech integration |
| Reading passage admin | Admin UI for creating/editing reading content |
| Word list / vocabulary tracker | Save words from reader to personal word list |

---

## 8. Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Azure Speech integration | HIGH | Direct source file inspection |
| Font system status | HIGH | Phase 30 verification report + direct file reads |
| Data model | HIGH | Schema files read line-by-line |
| UI components | HIGH | Globbed and listed actual files |
| Preferences system | HIGH | API route + hook + settings form all read |
| TTS reusability assessment | MEDIUM | Azure TTS REST API pattern is well-documented but not yet used in this codebase -- needs verification during implementation |

---

## Sources

All findings from direct codebase inspection. Key files read:

- `src/lib/pronunciation.ts` -- Azure pronunciation assessment
- `src/types/pronunciation.ts` -- Assessment type definitions
- `src/app/api/practice/grade/route.ts` -- Practice grading route with Azure + n8n
- `src/app/api/grade-audio/route.ts` -- Audio grading route
- `src/db/schema/courses.ts` -- Course/Module/Lesson schema
- `src/db/schema/users.ts` -- User schema with languagePreference
- `src/db/schema/interactions.ts` -- Interaction checkpoint schema
- `src/db/schema/practice.ts` -- Practice exercise schema
- `src/db/schema/progress.ts` -- Lesson progress schema
- `src/db/schema/xp.ts` -- XP events and daily activity schema
- `src/db/schema/knowledge.ts` -- Knowledge base schema
- `src/db/schema/index.ts` -- Schema barrel exports
- `src/app/layout.tsx` -- Root layout with font CSS variables
- `src/app/globals.css` -- Tailwind theme with font registrations
- `src/app/(dashboard)/layout.tsx` -- Dashboard sidebar layout
- `src/components/layout/AppSidebar.tsx` -- Navigation structure
- `src/components/phonetic/PhoneticText.tsx` -- Phonetic font wrapper
- `src/components/chat/ChineseAnnotation.tsx` -- Ruby annotation renderer
- `src/components/settings/SettingsForm.tsx` -- Settings UI
- `src/components/ui/sidebar.tsx` -- Sidebar component system
- `src/hooks/useLanguagePreference.ts` -- Language preference hook
- `src/hooks/useSubtitlePreference.ts` -- Subtitle annotation preference hook
- `src/lib/audio-utils.ts` -- Browser audio utilities
- `src/lib/search-utils.ts` -- Pinyin/Jyutping search indexing
- `src/lib/lesson-context.ts` -- Voice AI lesson context builder
- `src/lib/interactions.ts` -- Language preference types
- `src/types/exercises.ts` -- Exercise definition types
- `.env.example` -- Environment variable documentation
- `package.json` -- All installed dependencies
- `components.json` -- shadcn/ui configuration
- `.planning/phases/30-foundation-and-fonts/` -- Phase 30 research and verification
