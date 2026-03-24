# Phase 75: LTO Student Access & Mandarin Accelerator - Research

**Researched:** 2026-03-24
**Domain:** Feature gating, content management CRUD, interactive Chinese language exercises
**Confidence:** HIGH

## Summary

Phase 75 adds three bonus "Mandarin Accelerator" features for LTO students, gated by a CRM tag mapped to a feature key. The codebase already has a complete tag-feature override system (`tag-feature-access.ts`), a `FeatureGate` component, and feature-gated sidebar sections. The core infrastructure work is minimal: add `mandarin_accelerator` to `FEATURE_KEYS`, create a tag named `feature:enable:mandarin_accelerator`, and add a new sidebar section.

The three features (Typing Kit, Conversation Scripts, Reader Passages) all follow the same pattern already established in the codebase: Drizzle schema tables, API routes for CRUD, admin panel for content management, and student-facing pages under the dashboard. The Typing Kit requires a new interactive component with character-by-character comparison. Conversation Scripts need audio file handling via existing Vercel Blob infrastructure. Reader Passages reuse the existing `ReaderClient` component with preloaded text.

**Primary recommendation:** Follow existing patterns exactly. The tag-feature-override system, admin CRUD pattern, Vercel Blob upload pattern, and ReaderClient are all proven. No new libraries needed -- this is a content-and-UI phase, not an infrastructure phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** LTO students identified by `LTO_student` CRM tag, NOT a separate role. Tag triggers tag-feature override enabling `mandarin_accelerator` feature key.
- **D-02:** Tag managed via both GHL CRM sync (auto on purchase) and manual coach tagging in admin panel.
- **D-03:** Mandarin Accelerator sidebar section completely hidden for non-LTO students (no locked/teaser state).
- **D-04:** Tag removal revokes access but preserves all progress data. Re-adding tag restores access with progress intact.
- **D-05:** Dedicated typing drill UI (new component), not reusing existing practice set exercise types. Duolingo-ish feel with character-by-character feedback.
- **D-06:** Exact match checking -- student types exact expected Chinese sentence. Green if correct, red + show correct answer if wrong.
- **D-07:** Two separate sections: Mandarin (20 sentences) and Cantonese (20 sentences). Student picks which to practice.
- **D-08:** Each prompt shows English translation + romanisation (pinyin/jyutping). Student types Chinese characters.
- **D-09:** Retry until correct -- unlimited retries, must get it right to advance. Consistent with mastery philosophy.
- **D-10:** Demo video (Sheldon's explanation + demonstration) embedded at top of Typing Kit page. Watchable or skippable.
- **D-11:** Content managed via coach admin panel with bulk upload option (CSV/JSON).
- **D-12:** Progress tracked per student -- completion count per section with progress bar. Resume where left off.
- **D-13:** 10 scenarios as card grid. Tap to enter practice flow.
- **D-14:** Two-column layout per script: Speaker role on one side, Responder on the other. Chinese + romanisation + English per line.
- **D-15:** Student practices both roles (all lines get self-checked).
- **D-16:** Both Cantonese and Mandarin shown inline per dialogue line -- Canto first, then Mando.
- **D-17:** Pre-recorded audio by Janelle (uploaded files, not Azure TTS).
- **D-18:** Self-checking: student marks each line as "good" or "not good" (honor system).
- **D-19:** Self-check ratings tracked with progress per script. Student can see which lines rated "not good" and revisit.
- **D-20:** Content managed via coach admin panel + bulk upload. Each scenario has metadata + ordered dialogue lines with audio files.
- **D-21:** Curated passages list page showing 5 passages by title. Student taps to open in existing Reader.
- **D-22:** Full Reader experience -- all features work. ONLY restriction: LTO students cannot paste/import/create their own passages.
- **D-23:** Content managed via coach admin panel + bulk upload.
- **D-24:** Simple read status tracking -- "Read" / "Unread" badge per passage.

### Claude's Discretion
- DB schema design for typing sentences, conversation scripts, and curated passages
- Admin panel layout and form design for content management
- Bulk upload file format (CSV vs JSON) and validation approach
- Progress tracking table schema
- Sidebar section icon and ordering

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Standard Stack

### Core (Already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^16.1.6 | App Router, Server Components, API routes | Project framework |
| React | 19.2.3 | UI rendering | Project framework |
| Drizzle ORM | ^0.45.1 | Database schema, queries, migrations | Project ORM |
| Zod | ^4.3.6 | Validation for API inputs, bulk upload parsing | Project validation |
| @clerk/nextjs | ^6.36.10 | Auth, user identity | Project auth |
| @vercel/blob | ^2.3.1 | Audio file storage for conversation scripts | Already used for audio courses |
| Lucide React | (existing) | Icons for sidebar, UI elements | Project icon library |

### Supporting (Already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui components | (existing) | Button, Input, Card, Progress, etc. | All UI components |
| TipTap (rich text) | (existing) | Admin content editing if needed | Grammar admin uses it |

### Alternatives Considered
None needed. This phase uses exclusively existing project dependencies.

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  db/schema/
    accelerator.ts                    # New schema file for all 3 features + progress
  app/(dashboard)/
    dashboard/accelerator/
      page.tsx                        # Mandarin Accelerator landing/hub page
      typing/
        page.tsx                      # Typing Unlock Kit student page
        TypingDrillClient.tsx         # Client component for typing exercises
      scripts/
        page.tsx                      # Conversation Scripts list (card grid)
        [scriptId]/
          page.tsx                    # Individual script practice flow
          ScriptPracticeClient.tsx    # Client component for self-check flow
      reader/
        page.tsx                      # Curated passages list page
        [passageId]/
          page.tsx                    # Opens passage in Reader component
    admin/accelerator/
      page.tsx                        # Admin hub for all 3 features
      typing/
        page.tsx                      # Admin: manage typing sentences
      scripts/
        page.tsx                      # Admin: manage conversation scripts
      reader/
        page.tsx                      # Admin: manage curated passages
  app/api/admin/accelerator/
    typing/route.ts                   # CRUD + bulk upload for typing sentences
    scripts/route.ts                  # CRUD + bulk upload for scripts
    scripts/upload/route.ts           # Audio upload for scripts (Vercel Blob)
    reader/route.ts                   # CRUD + bulk upload for passages
  app/api/accelerator/
    typing/progress/route.ts          # Student typing progress
    scripts/progress/route.ts         # Student script self-check progress
    reader/progress/route.ts          # Student read status
```

### Pattern 1: Tag-Feature Override for Access Gating
**What:** Map the `LTO_student` tag to the `mandarin_accelerator` feature key using the existing tag-feature override system.
**When to use:** Gating the entire Mandarin Accelerator section.
**How it works:**
1. Add `"mandarin_accelerator"` to `FEATURE_KEYS` array in `src/lib/permissions.ts`
2. Create a tag named `feature:enable:mandarin_accelerator` in the tags table
3. Assign this tag to LTO students (via admin panel or GHL sync)
4. The existing `parseFeatureTag()` in `tag-feature-access.ts` automatically parses the tag name and enables the feature
5. `applyFeatureTagOverrides()` in the dashboard layout merges the override into `enabledFeatures`
6. Sidebar items with `featureKey: "mandarin_accelerator"` are shown/hidden automatically

**Critical detail:** The tag naming convention is `feature:enable:<feature_key>`. The `LTO_student` tag itself does NOT directly gate access -- a separate tag named `feature:enable:mandarin_accelerator` must exist and be assigned. The CONTEXT says "LTO_student tag triggers a tag-feature override" which means either: (a) the LTO_student tag IS named `feature:enable:mandarin_accelerator`, or (b) the system needs a mapping from `LTO_student` to the feature tag. Current code only supports option (a) -- tags with the `feature:enable:*` naming pattern. **Recommendation:** Create the tag as `feature:enable:mandarin_accelerator` and have the GHL webhook assign this tag when LTO purchase is detected. The admin-facing label can still show "LTO Student" via the tag description field.

### Pattern 2: Admin CRUD with Bulk Upload
**What:** Follow the existing admin content management pattern (list + create/edit forms + API routes).
**When to use:** All three features need admin content management.
**Example pattern (from grammar admin):**
```typescript
// API route: POST /api/admin/accelerator/typing
// Accepts single item or array for bulk upload
const bodySchema = z.union([
  singleSentenceSchema,
  z.object({ sentences: z.array(singleSentenceSchema) }),
]);
```

### Pattern 3: Vercel Blob Client Upload for Audio
**What:** Use existing Vercel Blob `handleUpload` pattern for conversation script audio files.
**When to use:** Uploading pre-recorded audio clips for dialogue lines.
**Implementation:** Follow `src/app/api/admin/audio-course/upload/route.ts` exactly -- use `handleUpload` with `onBeforeGenerateToken` for auth, store blob URL in DB.

### Pattern 4: Reusing ReaderClient with Preloaded Content
**What:** The existing `ReaderClient` accepts an `initialText` prop. For curated passages, server-fetch the passage content and pass it as `initialText`.
**When to use:** Curated Reader passages feature.
**Key insight:** `ReaderClient({ initialText?: string })` -- the component already supports receiving preloaded text. The curated passages page simply loads the passage body from DB and renders `<ReaderClient initialText={passageBody} />`. Must also wrap in `<FeatureGate feature="mandarin_accelerator">`.
**Restriction handling (D-22):** LTO students get full Reader features but cannot create their own content. This means the curated passage reader page should NOT render the ImportDialog or text input area. Options: (a) add a `readOnly` prop to ReaderClient, or (b) create a thin wrapper that hides import UI. Option (b) is simpler and avoids modifying existing code.

### Pattern 5: Feature-Gated Sidebar Section
**What:** Add a new sidebar section for Mandarin Accelerator, gated by `mandarin_accelerator` feature key.
**When to use:** Navigation.
**Implementation in AppSidebar.tsx:**
```typescript
{
  label: "Mandarin Accelerator",
  minRole: "student",
  items: [
    { title: "Typing Unlock Kit", url: "/dashboard/accelerator/typing", icon: Keyboard, featureKey: "mandarin_accelerator" },
    { title: "Conversation Scripts", url: "/dashboard/accelerator/scripts", icon: MessageSquare, featureKey: "mandarin_accelerator" },
    { title: "AI Reader (Curated)", url: "/dashboard/accelerator/reader", icon: BookOpenText, featureKey: "mandarin_accelerator" },
  ],
}
```

### Anti-Patterns to Avoid
- **Creating a new role for LTO students:** The tag-feature override system exists specifically to avoid role proliferation. LTO students keep the Student role.
- **Modifying ReaderClient core for read-only mode:** Don't change existing Reader code. Create a wrapper component that passes `initialText` and hides the import/paste UI.
- **Storing audio files in the database:** Use Vercel Blob for audio, store only the URL in the DB.
- **Building a custom tag-to-feature mapping system:** The existing `feature:enable:<key>` tag convention handles this. Don't add a new mapping table.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Feature gating | Custom middleware/checks | Existing `FeatureGate` + `tag-feature-access.ts` | Proven pattern, handles edge cases |
| Audio file storage | Custom upload pipeline | Vercel Blob `handleUpload` | Already handles large files, auth, CDN |
| Chinese text comparison | Character-level diff library | Simple `===` string comparison | D-06 specifies exact match only |
| Progress persistence | Custom state management | DB table with upsert pattern | Follows `lessonProgress` pattern |
| Sidebar gating | Custom visibility logic | `featureKey` prop on nav items | Already implemented in `AppSidebar` |

**Key insight:** This phase is almost entirely "follow existing patterns with new content." The only genuinely new UI is the Typing Drill component.

## Common Pitfalls

### Pitfall 1: Tag Naming Convention Mismatch
**What goes wrong:** Creating a tag named `LTO_student` and expecting it to gate the `mandarin_accelerator` feature.
**Why it happens:** CONTEXT.md says "LTO_student CRM tag" but the tag-feature system requires tags named `feature:enable:<feature_key>`.
**How to avoid:** Name the tag `feature:enable:mandarin_accelerator`. The GHL webhook sync assigns this tag to students who purchase the LTO product. The admin panel shows this tag with a friendly description like "LTO Student - Mandarin Accelerator Access".
**Warning signs:** Feature not appearing for tagged students.

### Pitfall 2: FEATURE_KEYS Array Not Updated
**What goes wrong:** Adding sidebar items and FeatureGate checks for `mandarin_accelerator` but forgetting to add it to the `FEATURE_KEYS` const array in `permissions.ts`.
**Why it happens:** The feature key is used in multiple places (permissions.ts, FeatureGate, AppSidebar).
**How to avoid:** First task in implementation: add `"mandarin_accelerator"` to `FEATURE_KEYS` and update `FEATURE_LABELS` in FeatureGate.tsx.
**Warning signs:** TypeScript errors on `FeatureKey` type, feature tag overrides silently ignored.

### Pitfall 3: FeatureKey Type Not Synced in AppSidebar
**What goes wrong:** `AppSidebar.tsx` has a local `FeatureKey` type definition (line 26-35) that duplicates `FEATURE_KEYS`. Adding the new key to `permissions.ts` but not to AppSidebar's local type.
**Why it happens:** The sidebar has its own inline type definition rather than importing from permissions.ts (because it's a client component and permissions.ts is server-only).
**How to avoid:** Add `"mandarin_accelerator"` to both the `FEATURE_KEYS` array in `permissions.ts` AND the local `FeatureKey` type in `AppSidebar.tsx`.

### Pitfall 4: Chinese Character Comparison Edge Cases
**What goes wrong:** Exact match fails due to Unicode normalization differences, full-width vs half-width punctuation, or invisible characters.
**Why it happens:** Chinese text can have variant Unicode representations for the same visual character.
**How to avoid:** Normalize both expected and student input before comparison: strip zero-width characters, normalize Unicode (NFC), and trim whitespace. For punctuation, decide whether to include it in matching (recommendation: strip punctuation from both sides before comparison to reduce student frustration).

### Pitfall 5: Bulk Upload Audio Orphaning
**What goes wrong:** Uploading audio files to Vercel Blob during bulk import, then the DB insert fails, leaving orphaned blob files.
**Why it happens:** Two-phase operation (upload files, then insert DB records) without transaction.
**How to avoid:** For bulk upload of scripts with audio: first validate all CSV/JSON data, then upload audio files, then insert DB records. On failure, clean up uploaded blobs. Or: require audio upload as a separate step after script data is saved.

### Pitfall 6: Reader Import UI Leaking to Curated Mode
**What goes wrong:** LTO students using curated Reader passages can still see the import/paste dialog and create their own content.
**Why it happens:** `ReaderClient` always renders `ImportDialog` and text input.
**How to avoid:** Create a `CuratedReaderClient` wrapper that either: (a) passes a prop to hide import UI, or (b) wraps ReaderClient and overlays/removes the import elements. Simplest: add a `hideImport?: boolean` prop to ReaderClient.

## Code Examples

### Adding the Feature Key
```typescript
// src/lib/permissions.ts
export const FEATURE_KEYS = [
  "ai_conversation",
  "practice_sets",
  "dictionary_reader",
  "audio_courses",
  "listening_lab",
  "coaching_material",
  "video_threads",
  "certificates",
  "ai_chat",
  "mandarin_accelerator",  // NEW
] as const;
```

### DB Schema Design (Recommended)
```typescript
// src/db/schema/accelerator.ts
import { pgTable, uuid, text, timestamp, integer, boolean, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// --- Typing Sentences ---
export const typingLanguageEnum = pgEnum("typing_language", ["mandarin", "cantonese"]);

export const typingSentences = pgTable("typing_sentences", {
  id: uuid("id").defaultRandom().primaryKey(),
  language: typingLanguageEnum("language").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  chineseText: text("chinese_text").notNull(),       // Expected answer
  englishText: text("english_text").notNull(),        // English translation prompt
  romanisation: text("romanisation").notNull(),       // Pinyin or Jyutping
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("typing_sentences_language_idx").on(table.language),
  index("typing_sentences_sort_order_idx").on(table.sortOrder),
]);

// --- Typing Progress ---
export const typingProgress = pgTable("typing_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sentenceId: uuid("sentence_id").notNull().references(() => typingSentences.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("typing_progress_user_sentence_unique").on(table.userId, table.sentenceId),
  index("typing_progress_user_id_idx").on(table.userId),
]);

// --- Conversation Scripts ---
export const conversationScripts = pgTable("conversation_scripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  speakerRole: text("speaker_role").notNull(),       // e.g. "Waiter"
  responderRole: text("responder_role").notNull(),    // e.g. "Customer"
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export const scriptLines = pgTable("script_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  scriptId: uuid("script_id").notNull().references(() => conversationScripts.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  role: text("role").notNull(),                       // "speaker" or "responder"
  cantoneseText: text("cantonese_text").notNull(),
  mandarinText: text("mandarin_text").notNull(),
  cantoneseRomanisation: text("cantonese_romanisation").notNull(),  // Jyutping
  mandarinRomanisation: text("mandarin_romanisation").notNull(),    // Pinyin
  englishText: text("english_text").notNull(),
  cantoneseAudioUrl: text("cantonese_audio_url"),     // Vercel Blob URL
  mandarinAudioUrl: text("mandarin_audio_url"),       // Vercel Blob URL
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("script_lines_script_id_idx").on(table.scriptId),
  index("script_lines_sort_order_idx").on(table.sortOrder),
]);

// --- Script Progress (self-check) ---
export const scriptLineProgress = pgTable("script_line_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lineId: uuid("line_id").notNull().references(() => scriptLines.id, { onDelete: "cascade" }),
  selfRating: text("self_rating").notNull(),          // "good" or "not_good"
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("script_line_progress_user_line_unique").on(table.userId, table.lineId),
  index("script_line_progress_user_id_idx").on(table.userId),
]);

// --- Curated Passages ---
export const curatedPassages = pgTable("curated_passages", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),                       // Chinese text content
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

// --- Passage Read Status ---
export const passageReadStatus = pgTable("passage_read_status", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  passageId: uuid("passage_id").notNull().references(() => curatedPassages.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("passage_read_status_user_passage_unique").on(table.userId, table.passageId),
  index("passage_read_status_user_id_idx").on(table.userId),
]);
```

### Typing Drill -- Character-by-Character Comparison
```typescript
// Normalize Chinese input for comparison
function normalizeForComparison(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u200B\u200C\u200D\uFEFF\uFFFD]/g, "")  // Zero-width chars
    .replace(/\s+/g, "")                                   // All whitespace
    .trim();
}

// Check exact match
function checkAnswer(input: string, expected: string): boolean {
  return normalizeForComparison(input) === normalizeForComparison(expected);
}

// Character-by-character feedback for visual display
function getCharFeedback(input: string, expected: string): Array<{ char: string; correct: boolean }> {
  const normInput = normalizeForComparison(input);
  const normExpected = normalizeForComparison(expected);
  return [...normInput].map((char, i) => ({
    char,
    correct: i < normExpected.length && char === normExpected[i],
  }));
}
```

### Bulk Upload Validation (Recommended: JSON)
```typescript
// Typing sentences bulk upload schema
const typingSentenceBulkSchema = z.object({
  sentences: z.array(z.object({
    language: z.enum(["mandarin", "cantonese"]),
    chineseText: z.string().min(1),
    englishText: z.string().min(1),
    romanisation: z.string().min(1),
    sortOrder: z.number().int().optional(),
  })),
});

// Conversation script bulk upload schema
const scriptBulkSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  speakerRole: z.string().min(1),
  responderRole: z.string().min(1),
  lines: z.array(z.object({
    role: z.enum(["speaker", "responder"]),
    cantoneseText: z.string().min(1),
    mandarinText: z.string().min(1),
    cantoneseRomanisation: z.string().min(1),
    mandarinRomanisation: z.string().min(1),
    englishText: z.string().min(1),
    // Audio URLs added separately after upload
  })),
});
```

**Recommendation: Use JSON over CSV for bulk uploads.** Rationale:
1. Conversation scripts have nested structure (script -> lines) which CSV handles poorly
2. Chinese characters in CSV risk encoding issues
3. JSON validates directly with Zod
4. Consistent format across all three features
5. Easy for Janelle to prepare (or convert from a spreadsheet via a simple tool)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Role-based feature gating only | Tag-based feature overrides | Already in codebase | Enables per-student feature grants without role changes |
| Server-side file upload | Vercel Blob client upload | Already in codebase | Handles large audio files without 4.5MB serverless limit |

**No deprecated/outdated patterns to worry about for this phase.**

## Open Questions

1. **Demo Video Hosting (D-10)**
   - What we know: Sheldon's demo video needs to be embedded at top of Typing Kit page
   - What's unclear: Is this a YouTube embed, Mux video, or direct file? The project uses Mux for course videos.
   - Recommendation: Use a simple YouTube/Loom embed if the video already exists externally. If it needs hosting, upload to Mux via existing pipeline. Store the embed URL in an app settings table or as a hardcoded config.

2. **GHL Webhook Tag Sync (D-02)**
   - What we know: Tag should be auto-assigned on LTO purchase via GHL CRM sync
   - What's unclear: Does the existing GHL webhook handler already support creating/assigning feature tags, or does it need extension?
   - Recommendation: Check `src/db/schema/ghl.ts` and existing webhook handlers. Likely needs a small mapping addition in the GHL sync logic to assign `feature:enable:mandarin_accelerator` tag on LTO purchase event.

3. **ReaderClient Modification vs Wrapper**
   - What we know: LTO students should not be able to import/create their own passages (D-22)
   - What's unclear: How tightly coupled is the import UI to ReaderClient?
   - Recommendation: Add a `hideImport?: boolean` prop to `ReaderClient` -- it's a single boolean that conditionally renders `ImportDialog`. Minimal change, maximum clarity.

## Sources

### Primary (HIGH confidence)
- `src/lib/permissions.ts` -- Feature key system, FEATURE_KEYS array, resolvePermissions
- `src/lib/tag-feature-access.ts` -- Tag-feature override mechanism, parseFeatureTag naming convention
- `src/components/auth/FeatureGate.tsx` -- Feature gating component with tag override integration
- `src/components/layout/AppSidebar.tsx` -- Sidebar feature gating pattern, local FeatureKey type
- `src/app/(dashboard)/layout.tsx` -- Dashboard layout with enabledFeatures resolution and tag overrides
- `src/app/(dashboard)/dashboard/reader/ReaderClient.tsx` -- Reader accepts initialText prop
- `src/app/api/admin/audio-course/upload/route.ts` -- Vercel Blob upload pattern
- `src/db/schema/grammar.ts` -- Example content schema pattern (Drizzle)
- `src/db/schema/tags.ts` -- Tags and studentTags schema
- `src/db/schema/progress.ts` -- Progress tracking pattern (lessonProgress)

### Secondary (MEDIUM confidence)
- `src/lib/student-role.ts` -- Default student feature assignment pattern
- `src/app/(dashboard)/admin/grammar/AdminGrammarClient.tsx` -- Admin CRUD client pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- follows established patterns exactly (feature gating, admin CRUD, blob upload, reader)
- Pitfalls: HIGH -- identified from direct code inspection of existing patterns
- Schema design: MEDIUM -- recommended schema follows project conventions but is Claude's discretion per CONTEXT.md

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- no fast-moving external dependencies)
