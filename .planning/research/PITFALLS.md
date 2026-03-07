# Domain Pitfalls: Adding SRS, Smart Study, Tone Training, Assessments, Grammar Library, and Auto-Exercises

**Domain:** Feature expansion for mature Chinese-learning LMS (68 phases shipped)
**Researched:** 2026-02-16
**Confidence:** MEDIUM-HIGH (verified against existing codebase, Azure docs, FSRS docs, and prior project pitfalls)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or major user experience failures.

---

### Pitfall 1: SRS Migration Corrupts or Orphans Existing Saved Vocabulary

**What goes wrong:**
SRS system is built as a new `srs_cards` table. Existing `saved_vocabulary` rows (which students have been bookmarking since v6.0) are not migrated into the SRS system. Students see an empty flashcard deck despite having 50+ saved words. Alternatively, a migration script creates SRS cards from saved vocabulary but uses `INSERT ... SELECT` across tables without handling the neon-http driver's lack of transaction support -- partial failure leaves some words migrated and others not, creating duplicate or orphaned records.

**Why it happens:**
The existing `saved_vocabulary` table (schema in `src/db/schema/vocabulary.ts`) stores bookmarked words with `traditional`, `simplified`, `pinyin`, `jyutping`, and `definitions`. SRS needs additional fields per card: `due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `learning_steps`, `reps`, `lapses`, `state`, `last_review`. The natural instinct is to create a separate SRS table and "link" to vocabulary. But students expect their saved words to BE their flashcard deck -- two separate systems feel broken.

The neon-http driver used by this project (`drizzle-orm/neon-http` in `src/db/index.ts`) does NOT support transactions. The codebase already has comments acknowledging this: `"neon-http driver doesn't support transactions, use sequential queries"` (found in `src/app/api/admin/video-threads/[threadId]/steps/[stepId]/route.ts` and `src/app/api/admin/lessons/reorder/route.ts`). Yet several routes use `db.transaction()` anyway (13 files found using transactions), which works because Drizzle emulates transactions as sequential queries on neon-http -- but they are NOT atomic. A bulk vocabulary-to-SRS migration using `db.transaction()` will silently proceed non-atomically.

**Consequences:**
- Students lose trust in saved vocabulary feature ("where did my words go?")
- Partial migration creates inconsistent state: some words in SRS, some not, no way to tell which
- Duplicate cards if migration is re-run to fix partial failures
- Coach-assigned vocabulary lists (via `vocabulary_list_assignments`) disconnected from SRS

**Prevention:**
```typescript
// OPTION A (Recommended): Add SRS columns directly to saved_vocabulary
// This avoids migration entirely -- existing words get SRS defaults
// SQL migration:
// ALTER TABLE saved_vocabulary
//   ADD COLUMN srs_due TIMESTAMP NOT NULL DEFAULT NOW(),
//   ADD COLUMN srs_stability REAL NOT NULL DEFAULT 0,
//   ADD COLUMN srs_difficulty REAL NOT NULL DEFAULT 0,
//   ADD COLUMN srs_elapsed_days INTEGER NOT NULL DEFAULT 0,
//   ADD COLUMN srs_scheduled_days INTEGER NOT NULL DEFAULT 0,
//   ADD COLUMN srs_learning_steps INTEGER NOT NULL DEFAULT 0,
//   ADD COLUMN srs_reps INTEGER NOT NULL DEFAULT 0,
//   ADD COLUMN srs_lapses INTEGER NOT NULL DEFAULT 0,
//   ADD COLUMN srs_state SMALLINT NOT NULL DEFAULT 0,  -- 0=New
//   ADD COLUMN srs_last_review TIMESTAMP;
// All existing words automatically become "New" SRS cards
// No migration script needed, no partial failure risk

// OPTION B: If separate table is needed, use idempotent per-row migration
async function migrateSavedVocabToSRS(userId: string) {
  const saved = await db.select().from(savedVocabulary)
    .where(eq(savedVocabulary.userId, userId));

  for (const word of saved) {
    const existing = await db.select().from(srsCards)
      .where(and(
        eq(srsCards.userId, userId),
        eq(srsCards.savedVocabularyId, word.id)
      )).limit(1);

    if (existing.length === 0) {
      await db.insert(srsCards).values({
        userId,
        savedVocabularyId: word.id,
        due: new Date(),
        state: 0, // New
        // ... FSRS defaults
      });
    }
  }
}
```

**Detection:**
- Students report empty flashcard decks despite having saved vocabulary
- `SELECT COUNT(*) FROM saved_vocabulary` is much larger than SRS card count
- Coach-assigned vocabulary lists don't appear in SRS review queue

**Phase to address:** SRS Flashcard System -- must be the first concern before any SRS scheduling logic

---

### Pitfall 2: Non-Atomic Neon-HTTP Operations Create Inconsistent SRS State

**What goes wrong:**
Student reviews a flashcard and taps "Good." The API route needs to: (1) update the SRS card with new scheduling parameters, (2) insert a review log entry, (3) award XP via the xp_events table, and (4) update daily_activity counts. With neon-http's non-atomic "transactions," step 1 succeeds, step 2 succeeds, but step 3 fails (maybe the XP source enum doesn't include the new value yet). Now the card is rescheduled but no review log exists, and no XP was awarded. The student reviews the same card again -- it is now double-scheduled because reps was already incremented.

**Why it happens:**
The project uses `drizzle-orm/neon-http` which connects via Neon's HTTP API. This driver does NOT support real database transactions. When you call `db.transaction()`, Drizzle sends the queries sequentially but without BEGIN/COMMIT -- each query is an independent HTTP request. If any query fails, prior queries are NOT rolled back. This is a known limitation documented in the codebase and the project's MEMORY.md.

The SRS review flow is inherently multi-step: update card state, log the review, compute new interval, award XP. All steps must succeed together or none should.

**Consequences:**
- SRS card state becomes inconsistent (rescheduled but no review logged)
- XP tracking drifts from actual study activity
- Students see incorrect streak/daily activity data
- SRS optimizer (if used later) gets corrupted training data from missing/duplicate review logs

**Prevention:**
```typescript
// Design for non-atomic writes with idempotency and reconciliation

// 1. Generate a review ID client-side (UUID) to prevent duplicates
const reviewId = crypto.randomUUID();

// 2. Write review log FIRST (source of truth)
await db.insert(srsReviewLogs).values({
  id: reviewId,
  cardId,
  rating,
  previousState: card.srsState,
  previousStability: card.srsStability,
  reviewedAt: new Date(),
});

// 3. Update card (idempotent via review log check)
await db.update(savedVocabulary)
  .set({
    srsState: newState,
    srsStability: newStability,
    srsDifficulty: newDifficulty,
    srsDue: newDue,
    srsReps: sql`srs_reps + 1`,
    srsLastReview: new Date(),
  })
  .where(eq(savedVocabulary.id, cardId));

// 4. Award XP (fire-and-forget, reconcile later if needed)
try {
  await awardXP(userId, 'srs_review', cardId);
} catch {
  console.error('XP award failed, will reconcile');
}

// 5. On the NEXT review of any card, verify last review was fully processed
// This self-healing pattern catches any partial failures
```

**Detection:**
- Review log count doesn't match card reps count
- XP events for SRS reviews missing or duplicated
- Daily activity counts don't match review log timestamps

**Phase to address:** SRS Flashcard System -- design review flow for non-atomic persistence from day one

---

### Pitfall 3: Smart Study Engine Creates N+1 Query Explosions Across Data Sources

**What goes wrong:**
The "Smart Study" engine needs to aggregate data from multiple existing tables to determine what to study next: `saved_vocabulary` (SRS state), `interaction_attempts` (lesson quiz performance), `practice_attempts` (exercise results), `conversations` (voice AI sessions), `lesson_progress` (completion status), and `daily_activity` (streak/XP). A naive implementation queries each table separately per student, then cross-references in application code. With 50+ saved vocabulary words and 30+ completed lessons, this generates 100+ database round-trips per dashboard load. On Neon with potential cold starts, this means 5-10 second load times.

**Why it happens:**
The existing data is spread across 6+ schema files with no unified "student performance" view. Each feature was built in isolation across 68 phases. There is no materialized view or denormalized summary table. The neon-http driver makes each query a separate HTTP request (no connection pooling, no query pipelining), so N+1 patterns are dramatically worse than with a traditional connection.

The data sources that smart study needs to query:
- `saved_vocabulary` (SRS cards due for review) -- `src/db/schema/vocabulary.ts`
- `interaction_attempts` (weak areas in lessons) -- `src/db/schema/interactions.ts`
- `practice_attempts` (exercise performance) -- `src/db/schema/practice.ts`
- `conversations` (voice conversation quality) -- `src/db/schema/conversations.ts`
- `lesson_progress` (what's been completed) -- `src/db/schema/progress.ts`
- `xp_events` / `daily_activity` (engagement patterns) -- `src/db/schema/xp.ts`

**Consequences:**
- Smart Study dashboard takes 5-10 seconds to load
- High Neon compute usage from excessive queries
- Users abandon the feature because it feels broken
- Neon cold start compounds the problem (first load after idle: 8-15 seconds)

**Prevention:**
```typescript
// 1. Create a denormalized study_summary table updated on each activity
export const studySummary = pgTable("study_summary", {
  userId: uuid("user_id").primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  srsDueCount: integer("srs_due_count").notNull().default(0),
  srsNextDue: timestamp("srs_next_due"),
  weakestArea: text("weakest_area"), // JSON: [{type, id, score}]
  recentAccuracy: integer("recent_accuracy"), // rolling 7-day average
  suggestedActivity: text("suggested_activity"),
  lastComputed: timestamp("last_computed").notNull().defaultNow(),
});

// 2. Update summary incrementally on each activity (not full recompute)
// After SRS review:
await db.update(studySummary)
  .set({
    srsDueCount: sql`srs_due_count - 1`,
    srsNextDue: sql`(SELECT MIN(srs_due) FROM saved_vocabulary
                     WHERE user_id = ${userId} AND srs_due > NOW())`,
    lastComputed: new Date(),
  })
  .where(eq(studySummary.userId, userId));

// 3. Smart Study dashboard reads from ONE table
const summary = await db.select().from(studySummary)
  .where(eq(studySummary.userId, userId));
// Single query, O(1) regardless of data volume
```

**Detection:**
- Dashboard load time exceeds 2 seconds
- Neon dashboard shows query spikes on smart study page loads
- Database query count per page load exceeds 10

**Phase to address:** Smart Study Engine -- design denormalized summary approach before building any UI

---

### Pitfall 4: Adding New Enum Values to Existing pgEnums Requires Raw SQL Migration

**What goes wrong:**
SRS needs new XP source types (`srs_review`, `srs_perfect`, `tone_drill`, `assessment_complete`). Developer adds them to the `xpSourceEnum` in `src/db/schema/xp.ts` and runs `drizzle-kit generate`. Drizzle generates a migration that tries to DROP and RECREATE the enum -- which fails because existing rows reference the old enum values. Or in some Drizzle versions, it generates no migration at all because enum changes are poorly handled.

**Why it happens:**
PostgreSQL enums are notoriously difficult to modify. You cannot `ALTER TYPE ... ADD VALUE` inside a transaction (PostgreSQL limitation). Drizzle ORM's migration generator handles enum additions inconsistently -- sometimes generating `ALTER TYPE`, sometimes `DROP TYPE` + `CREATE TYPE` (which fails if any column uses the enum). This project already hit this exact problem: "DB enum mismatch: `interaction_type` enum had `{fill_blank, short_answer}` but code sends `{text, audio}`" (from MEMORY.md).

The project has at least 25 pgEnums across the schema. The new features will need to add values to several:
- `xp_source`: add `srs_review`, `srs_perfect`, `tone_drill`, `assessment_complete`, `grammar_exercise`
- `prompt_type`: add `tone_training`, `exercise_generation`, `assessment_grading`
- `exercise_type`: add `tone_comparison`, `tone_dictation`, `grammar_fill`, `grammar_transform`
- Possibly new enums for assessment types, grammar categories, etc.

**Consequences:**
- Migration fails in production, blocking deployment
- Manual SQL fixes needed, risking production data
- Drizzle schema and actual database diverge (schema drift)
- Type-safety breaks when TypeScript enum doesn't match database enum

**Prevention:**
```sql
-- ALWAYS use raw SQL migrations for enum changes, never rely on Drizzle generator

-- Step 1: Add new values (each ADD VALUE is non-transactional)
ALTER TYPE xp_source ADD VALUE IF NOT EXISTS 'srs_review';
ALTER TYPE xp_source ADD VALUE IF NOT EXISTS 'srs_perfect';
ALTER TYPE xp_source ADD VALUE IF NOT EXISTS 'tone_drill';
ALTER TYPE xp_source ADD VALUE IF NOT EXISTS 'assessment_complete';
ALTER TYPE xp_source ADD VALUE IF NOT EXISTS 'grammar_exercise';

ALTER TYPE exercise_type ADD VALUE IF NOT EXISTS 'tone_comparison';
ALTER TYPE exercise_type ADD VALUE IF NOT EXISTS 'tone_dictation';
ALTER TYPE exercise_type ADD VALUE IF NOT EXISTS 'grammar_fill';
ALTER TYPE exercise_type ADD VALUE IF NOT EXISTS 'grammar_transform';

ALTER TYPE prompt_type ADD VALUE IF NOT EXISTS 'tone_training';
ALTER TYPE prompt_type ADD VALUE IF NOT EXISTS 'exercise_generation';
ALTER TYPE prompt_type ADD VALUE IF NOT EXISTS 'assessment_grading';

-- Step 2: Update Drizzle schema to match
-- Step 3: Run drizzle-kit generate to verify no additional migration is needed
-- Step 4: If Drizzle generates a conflicting migration, delete it and keep the manual one
```

**Detection:**
- `drizzle-kit generate` produces a migration that DROPs and RECREATEs an enum
- Migration fails with "cannot drop type ... because other objects depend on it"
- TypeScript type errors where enum union type doesn't include new values
- Application crashes with "invalid input value for enum" at runtime

**Phase to address:** FIRST phase of new milestone -- apply all enum changes before any feature code

---

### Pitfall 5: Tone Training Interprets Azure Prosody Scores as Tone Accuracy

**What goes wrong:**
Tone training feature uses Azure Speech pronunciation assessment's `ProsodyScore` as a measure of whether students are producing correct Mandarin tones. A student says "ma" with tone 2 (rising) instead of tone 1 (flat) and gets a prosody score of 85/100. The app says "Great job!" because 85 is above the passing threshold. But the student said the completely wrong tone -- they just said the wrong tone with good prosody (smooth, confident delivery).

**Why it happens:**
Azure's `ProsodyScore` evaluates naturalness of speech patterns (stress, intonation, rhythm, speed) -- it does NOT evaluate whether specific tones are correct. The `AccuracyScore` at the word level is closer to tone correctness for Chinese, but it compares against a native speaker reference model, not against specific tone targets. For Chinese, Azure treats each character as a "word" in the results, but the accuracy score reflects overall phoneme matching, not isolated tone correctness.

The existing pronunciation system (`src/lib/pronunciation.ts`) already parses Azure's response and returns `overallScore`, `accuracyScore`, `fluencyScore`, `completenessScore`, `prosodyScore`, and per-word `accuracyScore`. None of these directly answer "did the student produce tone 1 vs tone 2?"

**Key Azure limitation confirmed:** Prosody assessment IS now supported for zh-CN and zh-HK (expanded in 2025), but prosody evaluates natural speech flow, not individual tone number accuracy. There is no "tone number" output in Azure's response.

**Consequences:**
- Students think they're getting tones right when they're not
- Tone training becomes useless -- gives false confidence
- Students who practice with the tool develop bad tone habits
- Coach credibility undermined when students can't reproduce tones in conversation

**Prevention:**
```typescript
// 1. Use per-character accuracy score (not prosody) as primary metric
function evaluateTone(
  referenceText: string,
  azureResult: PronunciationAssessmentResult
): ToneResult {
  const charResults = azureResult.words;

  // 2. Compare recognized text against reference to detect substitution
  // If reference is a tone-1 word but Azure recognizes a tone-2 word
  const recognizedText = azureResult.recognizedText;
  const isCorrectCharacter = recognizedText.includes(referenceText);

  // 3. Combine accuracy score with character recognition
  return {
    accuracyScore: charResults[0]?.accuracyScore ?? 0,
    recognizedCorrectly: isCorrectCharacter,
    passed: charResults[0]?.accuracyScore >= 70 && isCorrectCharacter,
  };
}

// 4. For minimal pair drilling (ma1 vs ma2 vs ma3 vs ma4),
//    run assessment with the TARGET tone as reference text.
//    High accuracy = student produced the target tone.
//    Low accuracy = student produced a different tone.

// 5. Explicitly label scores as approximate:
//    "Tone accuracy is approximate. For definitive feedback,
//     practice with your coach."
```

**Detection:**
- Students consistently score 80+ on tone drills but can't produce correct tones in conversation
- Azure returns high prosody scores regardless of which tone is spoken
- Tone drill results don't correlate with coach assessments

**Phase to address:** Tone Training -- validate Azure's Chinese tone detection accuracy before building the full UI

---

### Pitfall 6: AI Exercise Generation Produces Culturally Inappropriate or Incorrect Content

**What goes wrong:**
Auto-exercise generation takes lesson transcripts and reader content, sends them to an LLM to generate fill-in-the-blank, multiple choice, and matching exercises. The LLM generates a multiple choice question about Cantonese slang where one of the options is vulgar. Or it generates a fill-in-blank with a "correct" answer that uses Mainland Chinese phrasing when the lesson teaches Hong Kong Cantonese. Or the generated pinyin has wrong tone numbers.

**Why it happens:**
LLMs are not reliable Chinese language authorities. They conflate Mandarin and Cantonese vocabulary, mix simplified and traditional characters, generate plausible-but-wrong pinyin tones (especially for multi-syllabic words with tone sandhi), and don't understand the cultural nuances between Hong Kong Chinese and Mainland Chinese. The existing exercise types (`src/db/schema/practice.ts`: multiple_choice, fill_in_blank, matching, ordering, audio_recording, free_text, video_recording) all have specific JSON schema definitions -- generated exercises must conform exactly to `ExerciseDefinition` types or the practice player crashes.

**Consequences:**
- Students learn incorrect Chinese (wrong tones, wrong characters, wrong register)
- Culturally offensive content damages brand reputation with premium adult audience
- Generated exercises fail runtime validation against `ExerciseDefinition` schema
- Coach has to review every generated exercise, negating time savings

**Prevention:**
```typescript
// 1. ALWAYS generate exercises as "draft" requiring coach approval
await db.insert(practiceExercises).values({
  ...generatedExercise,
  practiceSetId: draftSetId,
  // Containing practice set is DRAFT, never PUBLISHED
});

// 2. Validate against ExerciseDefinition schema before saving
import { exerciseDefinitionSchema } from '@/types/exercises';
const parsed = exerciseDefinitionSchema.safeParse(generatedExercise.definition);
if (!parsed.success) {
  console.error('Generated exercise failed schema validation:', parsed.error);
  return;
}

// 3. Cross-reference generated content against dictionary
// Verify all Chinese characters exist in dictionary_entries
// Verify pinyin matches dictionary pinyin (catches tone errors)
// Verify traditional/simplified consistency

// 4. Include language/dialect constraint in generation prompt
// "Generate exercises in Traditional Chinese appropriate for
//  Hong Kong Cantonese learners."

// 5. Limit to safe exercise types initially:
//    - Multiple choice (easiest to validate)
//    - Matching (pair Chinese with English -- verifiable)
//    - Ordering (sentence structure)
//    AVOID initially: fill_in_blank (many valid answers), free_text
```

**Detection:**
- Coach rejection rate for generated exercises exceeds 30%
- Students report wrong answers in generated exercises
- Generated exercises contain simplified characters when lesson uses traditional

**Phase to address:** Auto-Exercise Generation -- must include dictionary cross-validation and coach review flow

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or degraded user experience.

---

### Pitfall 7: Assessment/Placement Test Reuses Exercise Types Without Scoring Normalization

**What goes wrong:**
Assessment test reuses existing exercise types from the practice system. A multiple choice question is worth 100 or 0 (binary from `gradeMultipleChoice` in `src/lib/practice-grading.ts`). A fill-in-blank with 3 blanks gives proportional scores (33, 67, or 100). An audio recording gets Azure pronunciation score (continuous 0-100). The assessment adds up raw scores and divides by number of questions -- students who get the fill-in-blank section score higher on average than students who get the multiple-choice section, creating placement bias.

**Why it happens:**
The existing grading functions in `src/lib/practice-grading.ts` were built for individual exercise feedback, not for normalized assessment scoring. `gradeMultipleChoice` returns 0 or 100. `gradeFillInBlank` returns proportional scores. `gradeMatching` returns proportional scores. `gradeOrdering` returns proportional scores. Audio grading returns Azure's 0-100 continuous score. These score distributions are fundamentally incomparable.

**Prevention:**
- Normalize all exercise scores to a common scale before aggregation
- Weight questions by difficulty level, not just count
- Use Item Response Theory (IRT) or at minimum a difficulty-weighted average
- Separate assessment grading from practice grading -- different contexts, different scoring needs

**Detection:**
- Placement results cluster at extremes (too many beginners or too many advanced)
- Students placed at same level despite different actual abilities
- Assessment scores don't predict actual performance in courses

**Phase to address:** Assessment/Placement -- design scoring normalization before building test content

---

### Pitfall 8: Grammar Pattern Library Becomes a Static Content Island

**What goes wrong:**
Grammar library is built as a new content type with its own tables, its own pages, its own navigation. It sits alongside lessons, practice sets, and knowledge base entries but doesn't integrate with any of them. Students learn a grammar pattern in the library, then encounter it in a lesson without any cross-reference. The grammar library becomes a reference page that nobody visits after initial curiosity.

**Why it happens:**
The existing content hierarchy is `courses -> modules -> lessons` with separate `kb_entries` for knowledge base and `practice_sets` for exercises. Each was built as an independent feature. Grammar patterns feel like another independent content type, so the natural instinct is to create `grammar_patterns` table and a `/dashboard/grammar` page.

But grammar patterns are most valuable when surfaced IN CONTEXT: "You just encountered this grammar pattern in Lesson 5." Or: "This exercise practices grammar pattern [X]."

**Prevention:**
- Design grammar patterns with bidirectional links to lessons and exercises from day one
- Add `grammar_pattern_id` foreign key to `practice_exercises` and `interactions` tables
- Surface grammar patterns as contextual popups during lesson playback (like the character popup)
- Auto-tag exercises and interactions with relevant grammar patterns during creation
- Include grammar pattern links in SRS cards for grammar-focused vocabulary

**Detection:**
- Grammar library page has low traffic after launch week
- No way to navigate from a lesson to related grammar patterns
- No way to navigate from a grammar pattern to practice exercises
- Grammar and exercises are manually cross-referenced by coaches (doesn't scale)

**Phase to address:** Grammar Pattern Library -- define integration points with existing content before building standalone pages

---

### Pitfall 9: Prompt Testing Lab Side Effects Corrupt Production AI Responses

**What goes wrong:**
AI prompt testing lab is added to the existing prompts dashboard (`/admin/prompts`). Admin edits the "grading_text" prompt in the testing lab, clicks "Test" with sample input, sees results. The test inadvertently saves the draft prompt as the current version. Now all student text grading uses the experimental prompt. Or worse: the testing lab calls the same grading API endpoint that students use, but with a test prompt override parameter -- a bug in the override logic means the test prompt "sticks" for the next real grading request.

**Why it happens:**
The existing `ai_prompts` table (`src/db/schema/prompts.ts`) has `currentContent` (the active prompt) and `currentVersion` (version number). Prompt versions are stored in `ai_prompt_versions`. The prompts dashboard already has update and restore functionality. Both routes use `db.transaction()` (which is non-atomic on neon-http) to update `currentContent` and create a version record.

Adding a "test" capability that shares any code path with the "save" or "restore" functionality risks accidentally triggering a save.

**Prevention:**
```typescript
// 1. Testing lab NEVER writes to ai_prompts or ai_prompt_versions
// Test prompts exist only in the request/response cycle

// 2. Test endpoint is completely separate from production grading
// POST /api/admin/prompts/[promptId]/test
// This endpoint:
//   - Reads the draft content from request body (NOT from database)
//   - Calls the AI provider with the draft content
//   - Returns the result
//   - Does NOT save anything to any database table
//   - Has its own rate limiting (prevent runaway test costs)

// 3. NEVER add a "save test as current" button that bypasses version control
// Force the existing edit -> save -> version flow for any prompt changes
```

**Detection:**
- Students receive unexpected grading feedback after admin tests prompts
- Prompt version history shows unexpected updates during testing sessions
- "currentContent" in ai_prompts table differs from latest ai_prompt_versions entry

**Phase to address:** AI Prompt Testing Lab -- enforce read-only testing with no database writes

---

### Pitfall 10: Service Worker Caches Stale SRS Due Dates and Study Recommendations

**What goes wrong:**
The existing service worker (`public/sw.js`) caches HTML navigations as offline fallback. A student opens the Smart Study dashboard, which shows "15 cards due for review." They complete the reviews. The SW has cached the old dashboard HTML. Next time they open the app (especially on mobile PWA), the cached version shows "15 cards due" again, but clicking Review shows 0 cards.

**Why it happens:**
The current SW's `NETWORK_ONLY_PATTERNS` array includes `/dashboard/` which should prevent caching. BUT the pattern is `^\/dashboard/` -- this matches `/dashboard/vocabulary` and `/dashboard/practice`. If SRS review is at `/dashboard/review` it should be covered, but new routes at other paths (e.g., `/review`, `/study`, `/assessment`) would NOT be covered. Additionally, the `CACHE_NAME = "cantomando-v1"` has never been bumped despite 68 phases of changes. Old service workers can persist indefinitely.

**Prevention:**
- Add all new SRS/study routes to `NETWORK_ONLY_PATTERNS` in `sw.js`
- Bump `CACHE_NAME` to `cantomando-v2` when deploying the new milestone
- Consider switching to network-only for ALL application routes (cache-first only for static assets)
- Test the PWA explicitly after adding new routes

**Detection:**
- Students on mobile/PWA see stale dashboard data
- SRS review counts don't update after completing reviews (on PWA)

**Phase to address:** First phase of milestone -- update service worker configuration before any new routes

---

### Pitfall 11: Assessment Tests Expose Questions After First Attempt

**What goes wrong:**
Placement test has 30 questions. Student takes the test, sees all questions and answers during review. Student shares screenshots with friends. Within a week, the test answers circulate. All new placements are inflated. Assessment becomes useless.

**Why it happens:**
The existing practice system (`practice_attempts`) stores the full `answers` and `results` as JSONB with per-exercise scores. Practice sets are reusable. If assessment tests use the same infrastructure, students can review their answers and share them.

**Prevention:**
- Build a question pool (3-5x the test length) with random selection per attempt
- Never show correct answers after assessment -- only show level placement
- Generate some questions dynamically from the exercise generator (different each time)
- Tag assessment questions with difficulty levels; use adaptive testing
- Store only aggregate results for assessments, not per-question answers

**Detection:**
- All students score suspiciously high on placement tests
- Assessment scores don't correlate with actual course performance
- Same answer patterns across different students

**Phase to address:** Assessment/Placement -- design question pool and anti-sharing strategy before building test flow

---

## Minor Pitfalls

Mistakes that cause annoyance but are relatively fixable.

---

### Pitfall 12: FSRS Parameters Require Review History to Optimize

**What goes wrong:**
ts-fsrs is integrated with default parameters. Cards are scheduled, students review them. After 2 months, someone runs the FSRS optimizer and discovers the default parameters were wrong for this user base. Rescheduling all cards with new parameters causes confusion -- cards that were "due tomorrow" are suddenly "due in 2 weeks."

**Prevention:**
- Start with ts-fsrs default parameters (they're reasonable)
- Log ALL review data from day one (rating, timestamps, previous state) -- this is the optimizer's training data
- Plan a parameter optimization step at the 3-month mark, not earlier (need sufficient data)
- When re-optimizing, apply new parameters only to FUTURE reviews, not retroactively

**Phase to address:** SRS Flashcard System -- ensure review log schema captures all fields needed for future optimization

---

### Pitfall 13: Grammar Library Content Has No Cantonese Equivalent

**What goes wrong:**
Grammar library is built with Mandarin grammar patterns because most Chinese grammar resources are Mandarin-focused. Cantonese-only students find the grammar library useless because Cantonese has different grammar patterns (different sentence-final particles, different aspect markers, different question formation).

**Prevention:**
- Include a `language` field on grammar patterns matching the existing `interactionLanguageEnum` (cantonese | mandarin | both)
- For Cantonese-specific patterns (sentence-final particles like la1, ge3, me1, na4), create dedicated entries
- Filter grammar library view by user's `languagePreference`

**Phase to address:** Grammar Pattern Library -- include language filtering in schema design

---

### Pitfall 14: Auto-Exercise Generation Token Costs Spiral

**What goes wrong:**
Each lesson transcript is 3,000-10,000 tokens. Exercise generation prompt adds 500-1,000 tokens. Generating 10 exercises per lesson requires multiple LLM calls. With 50+ lessons, a full generation pass costs $5-20. Regenerating after prompt tweaks doubles the cost.

**Prevention:**
- Cache generated exercises -- don't regenerate unless lesson content changes
- Chunk transcripts: generate from individual sections, not full transcript
- Use cheaper models for generation (GPT-4o-mini), validate with expensive models
- Generate on-demand (when coach clicks "Generate") not bulk
- Implement a generation budget with cost tracking

**Phase to address:** Auto-Exercise Generation -- implement cost tracking from the first API call

---

### Pitfall 15: Tone Training UI Doesn't Account for Cantonese's 6-9 Tones

**What goes wrong:**
Tone training UI is designed for Mandarin's 4 tones. Visual representations use the standard 4-tone diagram. Cantonese learners see the same UI but Cantonese has 6 contrastive tones (some analyses identify up to 9). The tone diagram is misleading, drill sets are wrong, and Cantonese-specific tone pairs are not covered.

**Prevention:**
- Design tone training with language-specific UI from the start
- Mandarin mode: 4 tones + neutral, standard tone diagram
- Cantonese mode: 6 tones (high-flat, high-rising, mid-flat, low-falling, low-rising, low-flat), Cantonese-specific tone chart
- Cantonese jyutping tone numbers (1-6) map differently than Mandarin pinyin tone numbers (1-4)

**Phase to address:** Tone Training -- design dual-language tone system before building any UI components

---

## Integration Gotchas

Common mistakes when adding these features to the existing CantoMando system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SRS + saved_vocabulary | Creating separate SRS table disconnected from existing bookmarks | Add SRS columns to `saved_vocabulary` or create a 1:1 linked table with migration |
| SRS + XP system | Adding `srs_review` to `xp_source` enum via Drizzle migration | Use raw SQL `ALTER TYPE xp_source ADD VALUE` -- Drizzle mishandles enum additions |
| Smart Study + Neon HTTP | Querying 6 tables sequentially per dashboard load | Create denormalized `study_summary` table updated incrementally |
| Tone Training + pronunciation | Assuming `ProsodyScore` measures tone accuracy | Use per-character `AccuracyScore` and `recognizedText` comparison instead |
| Assessment + practice_grading | Using raw exercise scores for placement decisions | Normalize scores across exercise types before aggregating |
| Grammar Library + lessons | Building grammar as standalone content island | Add `grammar_pattern_id` FK to exercises and interactions for cross-linking |
| Grammar Library + language pref | Building Mandarin-only grammar patterns | Include language field, account for Cantonese grammar |
| Auto-exercises + ExerciseDefinition | LLM outputs don't match schema types | Validate every generated exercise against Zod schema before database insert |
| Auto-exercises + dictionary | LLM generates wrong pinyin/characters | Cross-reference all Chinese content against `dictionary_entries` table |
| Prompt Testing + ai_prompts | Testing lab writes to production prompt table | Testing endpoint is completely read-only, draft only in request cycle |
| Service Worker + new routes | New SRS/study routes not in NETWORK_ONLY_PATTERNS | Update `sw.js` patterns and bump cache version with each milestone |
| Assessment + question security | Showing correct answers after assessment | Never reveal answers, use question pools, generate some dynamically |

---

## Neon-HTTP-Specific Traps

These are unique to this project's use of `drizzle-orm/neon-http` and deserve special attention.

| Operation | What Fails | Workaround |
|-----------|-----------|------------|
| SRS review (update card + insert log + award XP) | `db.transaction()` is NOT atomic -- partial success possible | Write review log FIRST as source of truth, self-heal on next review |
| Bulk SRS card creation from vocabulary | Migration partially completes, leaves inconsistent state | Idempotent per-card insert with existence check |
| Assessment scoring (compute + update placement + award XP) | Score saved but placement not updated | Compute and save as single JSON payload, update placement from that |
| Smart study summary recomputation | Summary update fails mid-way, shows stale data | Design for eventual consistency, timestamp `lastComputed` |
| Prompt version restore (update currentContent + create version) | Already non-atomic (existing code), but testing lab makes it riskier | Testing lab must NEVER touch these tables |

---

## Performance Traps

Patterns that work during development but fail at scale.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| SRS due-date query scans full vocabulary table | Review page slow to determine what's due | Add index on `(user_id, srs_due)` and `(user_id, srs_state)` | >200 saved words per user |
| Smart Study computes recommendations on every load | Dashboard takes 5+ seconds | Pre-compute into summary table, update incrementally | >50 completed lessons + >100 vocabulary words |
| Tone drill sends Azure request per character in isolation | 30 tone drills = 30 API calls = 15+ seconds | Batch characters into phrases, cache scoring results | Any user doing a full tone drill session |
| Grammar library loads all patterns then filters client-side | Page load slow, janky filtering | Server-side filtering with pagination and language filter | >50 grammar patterns |
| Assessment grades all questions via AI in series | 30-question test takes 2+ minutes to grade | Batch grading, client-side grading for deterministic types, AI only for audio/text | Any assessment attempt |
| Auto-exercise regenerates on every page visit | Excessive LLM costs, slow page loads | Generate once, cache, regenerate only on explicit coach action | Any lesson with auto-exercises enabled |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **SRS:** Often missing existing vocabulary migration -- verify saved_vocabulary words appear as SRS cards
- [ ] **SRS:** Often missing review log completeness -- verify logs capture all fields needed for FSRS optimizer
- [ ] **SRS:** Often missing index on `(user_id, srs_due)` -- verify due-card query uses index scan
- [ ] **Smart Study:** Often missing summary table -- verify dashboard loads in <2s with 100+ vocabulary
- [ ] **Smart Study:** Often missing incremental updates -- verify summary updates on each activity
- [ ] **Tone Training:** Often missing Cantonese tone support -- verify 6-tone system works alongside 4-tone Mandarin
- [ ] **Tone Training:** Often missing Azure accuracy validation -- verify per-character accuracy (not prosody) drives tone scores
- [ ] **Assessment:** Often missing score normalization -- verify exercise types contribute equally to placement
- [ ] **Assessment:** Often missing question pool -- verify students see different questions on retake
- [ ] **Grammar Library:** Often missing lesson cross-links -- verify patterns link to relevant lessons and exercises
- [ ] **Grammar Library:** Often missing language filtering -- verify Cantonese students see Cantonese patterns
- [ ] **Auto-Exercises:** Often missing schema validation -- verify generated exercises pass `ExerciseDefinition` Zod parse
- [ ] **Auto-Exercises:** Often missing dictionary cross-check -- verify generated pinyin matches dictionary_entries
- [ ] **Auto-Exercises:** Often missing coach approval -- verify generated exercises are DRAFT, never auto-published
- [ ] **Prompt Testing:** Often missing isolation -- verify testing lab makes ZERO writes to ai_prompts or ai_prompt_versions
- [ ] **Service Worker:** Often missing route updates -- verify new routes are in NETWORK_ONLY_PATTERNS
- [ ] **Enum migrations:** Often missing raw SQL -- verify all new enum values use ALTER TYPE, not Drizzle-generated

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Orphaned vocabulary (no SRS cards) | LOW | Run idempotent migration script to create SRS cards for all saved_vocabulary without SRS data |
| Non-atomic SRS review corruption | MEDIUM | Reconciliation script: compare review logs against card state, fix from log history |
| N+1 query performance | MEDIUM | Add study_summary table and backfill; requires schema change and API refactor |
| Wrong enum migration | HIGH | If Drizzle dropped and recreated enum, must restore from Neon point-in-time recovery |
| False tone scoring | LOW | Update scoring logic to use accuracy instead of prosody; no data migration needed |
| Bad AI-generated exercises | LOW | Delete all draft exercises, regenerate with improved prompt; no student data affected |
| Corrupted production prompts | MEDIUM | Restore from ai_prompt_versions table; students affected until restored |
| Stale service worker cache | LOW-MEDIUM | Bump CACHE_NAME, deploy; must wait for users to reconnect |
| Assessment question leak | MEDIUM | Build question pool system, rotate questions; existing placements may need re-evaluation |
| Grammar island (no integration) | HIGH | Requires adding FK columns to existing tables and backfilling relationships |

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| SRS Flashcards | Vocabulary migration fails non-atomically | Add SRS columns to existing table OR use idempotent per-row migration |
| SRS Flashcards | Enum changes break migration | Apply all enum additions as raw SQL FIRST, before any Drizzle migration |
| SRS Flashcards | Review flow inconsistency | Design for non-atomic writes with review log as source of truth |
| Smart Study Engine | N+1 query explosion | Create denormalized summary table from the start |
| Smart Study Engine | Neon cold start amplifies slow queries | Pre-warm connections on page navigation, cache summary |
| Tone Training | Misinterpreting Azure scores as tone accuracy | Validate per-character accuracy approach before building UI |
| Tone Training | Ignoring Cantonese tones | Design 6-tone Cantonese + 4-tone Mandarin from day one |
| Assessment/Placement | Score normalization across exercise types | Build assessment-specific scoring layer |
| Assessment/Placement | Question security | Question pool + no answer reveal + partial dynamic generation |
| Grammar Library | Static content island | Define integration points (FKs to lessons/exercises) before building pages |
| Auto-Exercise Generation | Schema validation failures | Validate every generated exercise against ExerciseDefinition types |
| Auto-Exercise Generation | Culturally inappropriate content | Always draft, require coach approval, cross-check dictionary |
| AI Prompt Testing | Side effects on production prompts | Testing endpoint is completely isolated, zero database writes |

---

## Sources

### HIGH Confidence (Official Documentation + Codebase Verification)
- Azure Speech Pronunciation Assessment: [How-to Guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment) -- confirmed prosody != tone accuracy, prosody now supported for zh-CN and zh-HK
- Azure Speech: [Characteristics and Limitations](https://learn.microsoft.com/en-us/legal/cognitive-services/speech-service/pronunciation-assessment/characteristics-and-limitations-pronunciation-assessment)
- Azure Speech: [Language Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=pronunciation-assessment) -- confirmed zh-CN and zh-HK support phoneme, syllable, and prosody assessment
- ts-fsrs: [GitHub Repository](https://github.com/open-spaced-repetition/ts-fsrs) -- TypeScript FSRS implementation, card schema verified
- ts-fsrs: [Documentation](https://open-spaced-repetition.github.io/ts-fsrs/) -- Card and ReviewLog types confirmed
- FSRS: [ABC of FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs) -- algorithm mechanics and parameter optimization
- Existing codebase: `src/db/index.ts` confirms neon-http driver (non-transactional)
- Existing codebase: `src/db/schema/vocabulary.ts` confirms saved_vocabulary schema
- Existing codebase: `src/lib/pronunciation.ts` confirms Azure REST API integration
- Existing codebase: `src/db/schema/prompts.ts` confirms prompt versioning system
- Existing codebase: `src/db/schema/xp.ts` confirms xp_source enum and daily_activity table
- Existing codebase: `src/lib/practice-grading.ts` confirms exercise-type-specific scoring
- Existing codebase: `public/sw.js` confirms service worker caching patterns
- Project MEMORY.md: confirms DB enum mismatch history and neon-http transaction limitations

### MEDIUM Confidence (Community + Multiple Sources)
- FSRS vs SM-2: [MemoForge Blog](https://memoforge.app/blog/fsrs-vs-sm2-anki-algorithm-guide-2025/) -- 20-30% fewer reviews with FSRS
- FSRS implementation: [Implementing FSRS in 100 Lines](https://borretti.me/article/implementing-fsrs-in-100-lines)
- femto-fsrs: [Minimal TypeScript FSRS](https://github.com/RickCarlino/femto-fsrs) -- lightweight alternative
- SRS common mistakes: [TrustWrites SRS Guide](https://trustwrites.com/en/education-srs-en/)
- SRS algorithms: [Brainscape Comparison](https://www.brainscape.com/academy/comparing-spaced-repetition-algorithms/)
- AI exercise generation patterns: [Twee](https://twee.com/)

### LOW Confidence (Needs Phase-Specific Validation)
- Azure tone-level accuracy for Chinese (per-character accuracy as tone proxy needs empirical validation with real student audio)
- FSRS optimizer data requirements (3 months is an estimate based on Anki community guidance)
- Exercise generation cost estimates ($5-20 per bulk pass depends on model choice and transcript length)

---

*Pitfalls research for: Feature Expansion -- SRS, Smart Study, Tone Training, Assessments, Grammar Library, Auto-Exercises, Prompt Testing*
*Researched: 2026-02-16*
