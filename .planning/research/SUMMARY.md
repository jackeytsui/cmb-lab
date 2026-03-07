# Research Summary: v10.0 Mastery & Intelligence

**Project:** CantoMando Blueprint LMS — v10.0 Milestone
**Domain:** SRS Flashcards, Smart Study Engine, Tone Training, Assessment/Placement, Grammar Library, Auto-Exercise Generation, AI Prompt Testing Lab
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

v10.0 transforms CantoMando from a lesson-delivery LMS into an adaptive learning platform with spaced repetition, intelligent study guidance, tone-specific training, proficiency assessment, structured grammar reference, AI-powered content generation, and coach tooling for prompt quality assurance. This milestone adds seven interconnected feature domains to a mature codebase that has shipped 68 phases.

**The critical finding:** No new npm packages are needed. The existing stack covers every technical requirement. The FSRS-5 spaced repetition algorithm is small enough (~100 lines of pure TypeScript) to implement in-house, following the same pattern as existing utilities like `tone-sandhi.ts` (79 lines) and `practice-grading.ts` (206 lines). Tone training reuses the existing Azure Speech pronunciation pipeline, where per-character accuracy scores work as tone scoring for Chinese (each character = one syllable with one tone). Auto-exercise generation routes through n8n webhooks using the existing OpenAI integration. Assessment tests are thin wrappers over the existing practice set system with 7 exercise types already validated by Zod schemas.

**Key risks are content-related, not technical:** The grammar library launches empty without AI-assisted seeding; assessment calibration requires real student testing; AI-generated exercises will produce wrong answers that need coach review. The architecture is designed so that all AI output goes through human approval before reaching students. The smart study recommendation engine is deliberately heuristic-based (not ML), which is appropriate for the current user scale (<100 students). It queries across SRS card states, practice scores, daily activity, and grammar progress to produce a prioritized study plan cached in Redis for 30 minutes.

The single highest-impact feature is SRS flashcards because students already save vocabulary (`saved_vocabulary` table has data) and have no way to systematically review it (the output loop is missing). Everything else builds on or benefits from SRS being in place.

## Key Findings

### Recommended Stack

**Zero new packages.** The v9.0 milestone established a zero-new-packages policy. v10.0 continues this. Every feature can be built with existing dependencies plus new Postgres schema, API routes, components, and AI prompts.

**Core technologies:**
- **Custom FSRS-5 implementation** (~100 lines of pure TypeScript) — Spaced repetition scheduling. Zero dependencies. FSRS-5 outperforms SM-2 by 20-30% fewer reviews for same retention. Reference implementation: femto-fsrs. Decision: Implement in-house, NOT add `ts-fsrs` package (22KB minified). The algorithm is comparable in complexity to existing utilities.
- **Azure Speech REST API** (already integrated) — Pronunciation + tone scoring. Per-character accuracy with tone detection. Working in production for practice audio grading. Reused for tone training production drills.
- **Azure TTS** (already integrated) — Reference audio playback. Redis-cached for zh-CN and zh-HK. Used in Reader TTS and tone training identification drills.
- **n8n webhooks** (existing pattern) — AI grading + content generation. Two new webhooks needed: grammar generation and exercise generation. All AI calls go through n8n (project constraint).
- **pinyin-pro** (^3.28.0, installed) — Mandarin tone extraction. Returns tone numbers per syllable.
- **to-jyutping** (^3.1.1, installed) — Cantonese tone extraction. Provides Jyutping romanization with tone numbers (1-6).
- **Upstash Redis** (^1.36.1, installed) — Study recommendation cache (30-min TTL), drill pool cache. Already configured.
- **Neon Postgres** (existing) — All persistent data. 9 new tables for SRS, tone, assessment, grammar, prompt testing.
- **Drizzle ORM** (^0.45.1, installed) — Schema, queries, migrations. All existing tables use Drizzle.
- **Radix UI + Framer Motion + Recharts + HanziWriter + TipTap** (all installed) — UI components for flashcard player, tone charts, grammar editor, assessment timer, SRS review heatmap.

**Zero `npm install` commands needed for v10.0.** Only database migrations and optional seed scripts.

### Expected Features

**Must have (table stakes):**
- **SRS flashcards with FSRS scheduling** — Industry standard since Anki adopted FSRS. SM-2 feels outdated. Card states (New/Learning/Review/Relearning) and 4 rating buttons (Again/Hard/Good/Easy) are standard UX.
- **Auto-card creation from saved vocabulary** — Students already save words in the reader (`saved_vocabulary` table). Cards should auto-generate.
- **Daily review queue with count badge** — "You have 42 cards due" core SRS loop motivator.
- **Review session player** — Full-screen card review with flip animation, rating buttons, progress bar.
- **Tone identification drills** — Every Chinese learning app has this. "Which tone is this?" with audio playback.
- **Tone pair practice** — Tone pairs are how Chinese is actually spoken. Yoyo Chinese, Dong Chinese, Ka app all have this.
- **Placement test on signup / on demand** — Mandarin Bean, SuperTest, Hanbridge, Sishu all offer this. Premium adults expect to skip beginner content.
- **HSK level estimation from test results** — Map score to HSK 1-6 level. Students need to know where they stand.
- **Browsable grammar reference by HSK level** — AllSet Learning Grammar Wiki has ~450 patterns (54 at HSK1, 79 at HSK2, etc.). This is reference content students expect.
- **"What to study next" widget on dashboard** — Busuu, Duolingo, and every modern platform surface this. Reduces decision paralysis.
- **AI-generated exercises from vocabulary lists** — Coaches create vocab lists; system should auto-generate matching exercises.

**Should have (differentiators):**
- **Dual-language SRS cards (Mandarin + Cantonese)** — No major SRS app handles both Mandarin AND Cantonese pronunciation on the same card. Pleco has both dictionaries but separate review flows.
- **Cantonese 6-tone training** — Every tone trainer is Mandarin-only (4 tones). Cantonese has 6 contrastive tones and is severely underserved in the app ecosystem. Unique selling point.
- **SRS integrated with lesson progress** — Most SRS apps are standalone. CantoMando auto-creates SRS cards from lesson vocabulary as student progresses through courses.
- **AI prompt testing lab for coaches** — Coaches can A/B test grading prompts with real student submissions. No Chinese LMS has this.
- **Grammar pattern exercises auto-linked to lessons** — Coaches tag lessons with grammar points; system auto-generates targeted review exercises when student reaches that lesson.
- **Smart review with context sentences** — During SRS review, show the sentence where student first encountered the word (from reader or lesson). Provides meaningful context instead of isolated flashcards.
- **One-click "Add to SRS" from anywhere** — Reader popup, vocabulary list, practice results, grammar examples. Single click creates a flashcard. Reduces friction for the most important learning action.

**Defer (v2+):**
- **Voice conversation-driven SRS** — After voice AI conversation, extract vocabulary student struggled with and auto-add to SRS review queue. High complexity. Needs SRS to be stable + richer conversation data.
- **Real-time pitch visualization** — Web Audio API F0 extraction + canvas rendering is high complexity for v10.0. Azure per-character pronunciation scores are sufficient for initial tone training. Static tone diagrams for visual reference.
- **Full CAT/IRT adaptive testing engine** — Item Response Theory requires thousands of calibrated test items. Overkill for ~50-200 premium students. Simple adaptive logic is good enough for placement.
- **User-created card templates** — Anki's HTML/CSS template system is powerful but complex to build and support. Premium users on a curated platform don't need this when the platform controls the learning experience.
- **Offline-first SRS** — Service worker + IndexedDB sync for offline flashcard review is massive engineering effort involving conflict resolution and sync queues. Browser cache handles brief disconnections only.

### Architecture Approach

**Guiding principle: Extend existing patterns, don't reinvent.** Every new feature domain follows the established pattern:
```
src/db/schema/{domain}.ts          -- Drizzle table + relations + types
src/app/api/{domain}/route.ts      -- REST endpoints (auth + rate limit)
src/components/{domain}/           -- UI components
src/lib/{domain}.ts or {domain}/   -- Business logic
src/hooks/use{Domain}.ts           -- Client-side data hooks
```

**Major components:**

1. **SRS Flashcard System** — Add SRS columns directly to `saved_vocabulary` (avoids migration entirely). `srs_review_log` table is append-only for analytics. `srs_decks` table for user-created groupings. FSRS scheduling runs server-side as pure functions in `src/lib/srs-scheduler.ts` (no side effects, fully testable). Review flow designed for non-atomic neon-http writes: review log FIRST as source of truth, self-heal on next review. Integration: auto-creates cards from `saved_vocabulary`, reuses XP system (`practice_exercise` source), integrates with activity rings.

2. **Smart Study Engine** — Queries across `saved_vocabulary` (SRS state), `interaction_attempts` (lesson quiz performance), `practice_attempts` (exercise results), `conversations` (voice AI sessions), `lesson_progress` (completion status), `daily_activity` (streak/XP). No new tables. Computes on-demand, caches in Upstash Redis for 30 minutes (keyed by `study:${userId}`), invalidates on any learning activity. Denormalized approach avoids N+1 query explosions across data sources.

3. **Tone Training Module** — `tone_drill_results` table for attempt history. Four drill types: identification (listen, select tone number), production (record audio, Azure pronunciation assessment), minimal pairs (generated from `dictionary_entries` where entries differ by one tone), sandhi drills (use existing `tone-sandhi.ts` for before/after sandhi examples). Leverages existing infrastructure: `pronunciation.ts` (Azure Speech), `tts.ts` (Azure TTS), `pinyin-pro` (tone extraction), `to-jyutping` (Cantonese tone numbers). Dual-language: Mandarin 4-tone + Cantonese 6-tone systems.

4. **Assessment System** — `assessments` table stores test definitions. `assessment_attempts` table stores student results. Key design: reuse `ExerciseDefinition` union type (7 variants) from existing practice system. Assessment questions use the exact same type. Grading reuses `practice-grading.ts` functions. Adaptive placement algorithm: simple binary search (start medium difficulty, step up/down based on rolling accuracy). Not full CAT/IRT — good enough for placement at current scale.

5. **Grammar Pattern Library** — `grammar_patterns` table with seed data from AllSet Learning structure (HSK 1-6). Each pattern: title, structure, level, language (cantonese/mandarin/both), explanation, cantoneseDiff, examples, relatedPatterns, tags, status (draft/published). Design: coach-first, AI-assisted. "Generate AI Draft" button calls n8n webhook with grammar-generation prompt. Response is inserted as `draft` status pattern. Coach reviews, edits, publishes. Bidirectional links to lessons and exercises via `grammar_pattern_id` FK.

6. **Auto-Exercise Generation** — No new tables. Generated exercises are inserted into existing `practice_exercises` table (within a new practice set) with `status: 'draft'` on the parent `practice_sets` row. Coaches approve by changing status to `published`. Generation pipeline routes through n8n webhook with content + generation prompt (from `ai_prompts`). Validation: every generated exercise must pass `ExerciseDefinition` Zod schema validation. Cross-reference all Chinese content against `dictionary_entries` table to catch tone errors. NEVER auto-publish generated exercises.

7. **AI Prompt Testing Lab** — `prompt_test_cases` table (saved test cases per prompt), `prompt_test_runs` table (test execution results). Integration with existing `ai_prompts` system: lab reads from `ai_prompts` and `ai_prompt_versions` tables. "Promote to production" writes to `ai_prompts.currentContent` and creates new `ai_prompt_versions` entry (existing update flow). AI calls go through n8n: test execution sends prompt + test case input to existing grading webhooks. Response compared against `expectedOutput` assertions. CRITICAL: testing lab NEVER writes to ai_prompts or ai_prompt_versions during testing — test prompts exist only in request/response cycle.

### Critical Pitfalls

**From 45K comprehensive PITFALLS.md, top 5 critical risks:**

1. **FSRS Implementation Gets the Math Wrong** — FSRS-5 looks simple (~100 lines) but state transitions between New → Learning → Review → Relearning have subtle rules. Off-by-one errors in elapsed_days calculation or incorrect stability/difficulty update formulas degrade the entire SRS experience. Unlike a UI bug, bad scheduling silently degrades learning over weeks before anyone notices. **Prevention:** Port the femto-fsrs reference implementation exactly, then write comprehensive unit tests against known FSRS-5 test vectors (available in fsrs4anki wiki). Add logging: every review saves computed interval to `srs_review_log`. **Detection:** Monitor average retention rate after 2 weeks. FSRS-5 targets ~90% retention. If retention drops below 80% or rises above 95% (over-reviewing), algorithm needs adjustment.

2. **Non-Atomic Neon-HTTP Operations Create Inconsistent SRS State** — Project uses `drizzle-orm/neon-http` which does NOT support real database transactions. When you call `db.transaction()`, Drizzle sends queries sequentially but without BEGIN/COMMIT — each query is independent HTTP request. SRS review flow is inherently multi-step: update card state, log review, compute new interval, award XP. Partial failure leaves inconsistent state (rescheduled but no review logged). **Prevention:** Design for non-atomic writes with idempotency and reconciliation. Write review log FIRST (source of truth). Include client-generated review UUID to prevent duplicates. On next review of any card, verify last review was fully processed (self-healing pattern).

3. **Smart Study Engine Creates N+1 Query Explosions** — "Smart Study" needs to aggregate data from 6+ tables: `saved_vocabulary` (SRS state), `interaction_attempts` (lesson quiz), `practice_attempts` (exercises), `conversations` (voice AI), `lesson_progress` (completion), `daily_activity` (streak/XP). Naive implementation queries each table separately per student. With 50+ saved words and 30+ completed lessons, generates 100+ database round-trips per dashboard load. Neon-http makes each query a separate HTTP request (no connection pooling), so N+1 patterns are dramatically worse than with traditional connection. Neon cold start compounds the problem (first load after idle: 8-15 seconds). **Prevention:** Create denormalized `study_summary` table updated incrementally on each activity (not full recompute). Smart Study dashboard reads from ONE table — single query, O(1) regardless of data volume.

4. **AI-Generated Exercises with Wrong Answers** — GPT-4o-mini generates fill-in-blank exercises with incorrect Chinese characters, or multiple-choice questions where "correct" answer is wrong. LLMs conflate Mandarin and Cantonese vocabulary, mix simplified and traditional characters, generate plausible-but-wrong pinyin tones (especially for multi-syllabic words with tone sandhi). **Prevention:** ALL generated exercises go through coach review before publishing (status: 'draft' until approved). NEVER auto-publish. Validate against `ExerciseDefinition` schema before saving. Cross-reference generated Chinese text against `dictionary_entries` table to catch tone errors. Include "Report Error" button on every exercise for students.

5. **Adding New Enum Values to Existing pgEnums Requires Raw SQL Migration** — SRS needs new XP source types (`srs_review`, `tone_drill`, `assessment_complete`). PostgreSQL enums are notoriously difficult to modify. You cannot `ALTER TYPE ... ADD VALUE` inside a transaction (PostgreSQL limitation). Drizzle ORM's migration generator handles enum additions inconsistently — sometimes generating `ALTER TYPE`, sometimes `DROP TYPE` + `CREATE TYPE` (which fails if any column uses the enum). Project already hit this exact problem: "DB enum mismatch: `interaction_type` enum had `{fill_blank, short_answer}` but code sends `{text, audio}`" (from MEMORY.md). **Prevention:** ALWAYS use raw SQL migrations for enum changes, never rely on Drizzle generator. Each `ADD VALUE` is non-transactional. Update Drizzle schema to match. If Drizzle generates conflicting migration, delete it and keep manual one. **Alternative:** Reuse existing enum values: `practice_exercise` for SRS reviews, disambiguate via `entityType` field in `xp_events`.

## Implications for Roadmap

Based on research, suggested phase structure for v10.0:

### Phase 1: SRS Foundation (Schema + FSRS + Review UI)
**Rationale:** Everything else depends on SRS schema existing. Vocabulary seeding, smart study, and auto-card creation all reference SRS card state. This is the highest-impact feature because students already save vocabulary (the input data exists) and have no way to systematically review it (the output loop is missing).

**Delivers:** SRS card schema (add columns to `saved_vocabulary`), FSRS-5 scheduler implementation, review log table, basic review UI (flashcard player with flip animation), deck management (create/edit/delete decks), review statistics (heatmap, retention graph, forecast).

**Addresses (from FEATURES.md):**
- SRS flashcards with FSRS scheduling (table stakes)
- Card states: New/Learning/Review/Relearning (table stakes)
- Four rating buttons: Again/Hard/Good/Easy (table stakes)
- Auto-card creation from saved vocabulary (table stakes)
- Daily review queue with count badge (table stakes)
- Review session player (table stakes)

**Avoids (from PITFALLS.md):**
- FSRS math errors (Pitfall 1) by porting femto-fsrs exactly and writing comprehensive unit tests against known test vectors
- Non-atomic SRS state corruption (Pitfall 2) by designing review log as source of truth with self-healing pattern
- Enum migration trap (Pitfall 5) by reusing existing `practice_exercise` XP source, disambiguating via `entityType`

**Dependencies:** None (foundational phase)

**Research flags:** HIGH priority to get FSRS-5 implementation right. Write tests first. Validate intervals against SRS benchmark expected outputs.

---

### Phase 2: HSK Vocabulary + Grammar Data (Content Seeding)
**Rationale:** Provides content for SRS cards, assessment questions, and grammar exercises. Assessment tests need HSK vocab data for question pools. Grammar library needs seeded patterns. This is primarily a content curation phase, not a code-heavy phase.

**Delivers:** HSK vocabulary seed script (from complete-hsk-vocabulary and hsk30 GitHub repos), `grammar_patterns` schema, AI draft generation workflow (n8n webhook for grammar), coach grammar editor, grammar browse/filter UI, grammar pattern detail pages.

**Addresses (from FEATURES.md):**
- Browsable grammar reference by HSK level (table stakes)
- Each pattern: structure, explanation, examples, common mistakes (table stakes)
- Search and filter by level, category, keyword (table stakes)
- Cantonese grammar differences highlighted (differentiator)

**Avoids (from PITFALLS.md):**
- Grammar content bottleneck (Pitfall 6 from v10.0-PITFALLS.md) by using AI draft generation from day one to seed 50+ HSK 1-3 patterns
- HSK data quality issues (Pitfall 5 from v10.0-PITFALLS.md) by cross-referencing two sources and validating after seed

**Uses (from STACK.md):**
- TipTap editor (existing) for grammar pattern rich text
- n8n webhook for grammar draft generation (new webhook: `N8N_GRAMMAR_GEN_WEBHOOK_URL`)
- Drizzle migrations for `grammar_patterns` table

**Dependencies:** None (can run in parallel with Phase 1)

**Research flags:** Content seeding quality is the bottleneck, not engineering. Validate HSK data quality post-seed. Estimate coach review throughput for AI-drafted grammar patterns.

---

### Phase 3: Tone Training (4 Drill Types + Dual Language)
**Rationale:** Builds on existing Azure Speech pipeline. Independent of SRS/grammar. Chinese-specific high-value feature. Cantonese 6-tone system is unique differentiator (almost no competitor does this).

**Delivers:** `tone_drill_results` table, 4 drill types (identification, production, minimal pairs, sandhi), tone accuracy tracking per tone number, dual-language support (Mandarin 4-tone + Cantonese 6-tone), tone training page.

**Addresses (from FEATURES.md):**
- Tone identification drills (table stakes)
- Tone pair practice (table stakes)
- Pronunciation recording + comparison (table stakes)
- Per-tone accuracy tracking (table stakes)
- Cantonese 6-tone training (differentiator)

**Avoids (from PITFALLS.md):**
- Tone training interprets Azure prosody scores as tone accuracy (Pitfall 5 from PITFALLS.md) by using per-character accuracy score (not prosody) as primary metric
- Tone training UI doesn't account for Cantonese's 6-9 tones (Pitfall 15 from PITFALLS.md) by designing dual-language tone system from the start
- Audio latency ruins experience (Pitfall 8 from v10.0-PITFALLS.md) by pre-fetching TTS audio and Redis caching

**Uses (from STACK.md):**
- Azure Speech REST API (existing) for pronunciation + tone scoring
- Azure TTS (existing) for reference audio playback
- pinyin-pro (existing) for Mandarin tone extraction
- to-jyutping (existing) for Cantonese tone extraction
- Upstash Redis (existing) for drill pool cache

**Dependencies:** None (independent phase)

**Research flags:** Standard patterns from existing pronunciation pipeline. LOW risk. Test per-character accuracy approach with real student audio samples before building full UI.

---

### Phase 4: Assessment System (Placement Test + HSK Mocks)
**Rationale:** Needs HSK vocab data from Phase 2 for question pools. Critical for new student onboarding and placing students at the right level. Assessment test reuses existing exercise types and grading functions — thin wrapper over practice system.

**Delivers:** `assessments` and `assessment_attempts` tables, placement test builder, adaptive question selection (simple binary search), HSK mock tests (fixed question sets), assessment player (timed, reuses exercise renderers), results page (level placement + skill breakdown), retake with progress comparison.

**Addresses (from FEATURES.md):**
- Placement test on signup / on demand (table stakes)
- HSK level estimation from test results (table stakes)
- Skill breakdown: reading / listening / grammar / vocabulary (table stakes)
- Basic adaptive difficulty (table stakes)
- Assessment retake with progress comparison (differentiator)

**Avoids (from PITFALLS.md):**
- Assessment placement too high or too low (Pitfall 4 from v10.0-PITFALLS.md) by requiring 5-8 questions per HSK level and allowing manual override
- Assessment tests expose questions after first attempt (Pitfall 11 from PITFALLS.md) by building question pool (3-5x test length) with random selection per attempt
- Score normalization trap (Pitfall 7 from PITFALLS.md) by normalizing all exercise scores to common scale before aggregation

**Uses (from STACK.md):**
- Existing `ExerciseDefinition` types (MCQ, fill-blank, ordering, matching, audio) for assessment questions
- `practice-grading.ts` functions for grading (reuse existing logic)
- Radix UI for assessment timer, progress bar

**Dependencies:** Needs grammar patterns from Phase 2 for item bank content

**Research flags:** Question calibration needs real student testing. Mark as "beta" initially. Track how many students change their level within 7 days of placement (high change rate = bad calibration).

---

### Phase 5: Auto-Exercise Generation + Prompt Lab (AI Content Tools)
**Rationale:** Content generation tools that multiply coach productivity. Prompt testing lab ensures AI quality. Build after core student-facing features are stable (SRS, tone, assessment). These are coach power tools, not student-critical features.

**Delivers:** Exercise generation from lesson transcripts/vocab lists/grammar patterns (n8n webhook), coach approval queue for generated exercises, Zod schema validation, dictionary cross-validation, `prompt_test_cases` and `prompt_test_runs` tables, test runner UI, side-by-side A/B comparison view, batch test results.

**Addresses (from FEATURES.md):**
- AI-generated exercises from vocabulary lists (table stakes)
- AI-generated exercises from grammar patterns (table stakes)
- Coach review before publish (table stakes)
- Exercise quality validation (table stakes)
- AI prompt testing lab for coaches (differentiator)
- Grammar pattern exercises auto-linked to lessons (differentiator)

**Avoids (from PITFALLS.md):**
- AI-generated exercises with wrong answers (Pitfall 3 from v10.0-PITFALLS.md, Pitfall 6 from PITFALLS.md) by requiring coach review before publish, Zod schema validation, dictionary cross-check
- Prompt testing lab corrupts production AI responses (Pitfall 9 from PITFALLS.md) by enforcing read-only testing with no database writes
- n8n webhook timeout for batch exercise generation (Pitfall 10 from v10.0-PITFALLS.md) by limiting batch size to 5 exercises per call

**Uses (from STACK.md):**
- n8n webhook for exercise generation (new webhook: `N8N_EXERCISE_GEN_WEBHOOK_URL`)
- Existing `ExerciseDefinition` Zod schemas for validation
- Existing `ai_prompts` + `ai_prompt_versions` tables for prompt versioning
- Existing practice set builder with draft/published status

**Dependencies:** Needs grammar patterns from Phase 2 for grammar-based exercise generation

**Research flags:** n8n workflow design for exercise generation needs workflow creation. MEDIUM complexity. Estimate token costs for exercise generation before building.

---

### Phase 6: Smart Study Engine (Recommendations + Daily Plan)
**Rationale:** Build last because it queries data from all other subsystems (SRS card state, practice scores, tone accuracy, grammar progress, assessment results). Needs SRS data to exist and accumulate for meaningful recommendations. Mostly UX design challenge, not tech.

**Delivers:** Study recommendation algorithm (heuristic-based, not ML), Redis caching (30-min TTL), dashboard "What to study next" widget, daily study plan with time estimates, weak area identification from practice data, progress-based course pacing.

**Addresses (from FEATURES.md):**
- "What to study next" widget on dashboard (table stakes)
- Weakness identification from practice data (table stakes)
- Daily study plan with time estimate (table stakes)
- Progress-based course pacing (table stakes)
- SRS integrated with lesson progress (differentiator)

**Avoids (from PITFALLS.md):**
- N+1 query explosions (Pitfall 3 from PITFALLS.md) by creating denormalized `study_summary` table updated incrementally
- Useless recommendations (Pitfall 7 from v10.0-PITFALLS.md, Pitfall 7 from PITFALLS.md) by capping SRS recommendation at #1 slot only when >20 cards overdue, variety bonus in priority algorithm

**Uses (from STACK.md):**
- Upstash Redis (existing) for recommendation cache
- Queries across all learning domains: `saved_vocabulary` (SRS), `practice_attempts`, `interaction_attempts`, `tone_drill_results`, `lesson_progress`, `daily_activity`

**Dependencies:** Needs SRS data from Phase 1, tone data from Phase 3, assessment data from Phase 4, grammar data from Phase 2. Must come last.

**Research flags:** Straightforward aggregation queries. Mostly UX design challenge (how to present recommendations). LOW technical risk.

---

### Phase Ordering Rationale

**Why this order:**
- **Phase 1 (SRS) first** because SRS schema is a dependency for phases 2, 4, and 6. The `saved_vocabulary` table extension must happen before anything references SRS card state.
- **Phase 2 (Grammar/HSK data) before phases 4 and 5** because assessment questions and exercise generation need HSK/grammar content as input.
- **Phase 3 (Tone Training) is independent** and can run in parallel with Phase 2. It only depends on existing Azure infrastructure.
- **Phase 4 (Assessment) before Phase 6** because the study engine needs assessment data to recommend retaking placement tests or targeting weak skill areas.
- **Phase 5 (Auto-Exercises + Prompt Lab) before Phase 6** because the study engine needs the full feature surface (including auto-generated exercises) to make good recommendations.
- **Phase 6 (Smart Study) last** because it queries data from all other subsystems. Needs time for data to accumulate after features launch.

**Grouping options:**
- **Conservative (3 milestones):** Phases 1-2 → Phases 3-4 → Phases 5-6. Allows time for data accumulation between milestones.
- **Aggressive (1 milestone):** All six phases in v10.0. Faster delivery but higher risk of integration issues.
- **Recommended (2 milestones):** Phases 1-3 (SRS + Grammar + Tone) → Phases 4-6 (Assessment + AI Tools + Smart Study). Balances delivery speed with data accumulation needs.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 1 (SRS):** FSRS-5 implementation validation is HIGH priority. Write tests first. Find or create definitive test vectors. Reference femto-fsrs implementation but verify every formula.
- **Phase 2 (Grammar/HSK):** Content seeding quality is the risk. Validate HSK data quality post-seed. Estimate coach review throughput for AI-drafted grammar patterns (how many per day?).
- **Phase 4 (Assessment):** Question calibration needs real student testing. Per-level question pool size needs validation (literature suggests 15-20 total, but per-level minimum?).
- **Phase 5 (Auto-Exercises):** n8n workflow design for exercise generation needs workflow creation and prompt engineering. Estimate token costs before building.

**Phases with standard patterns (skip research-phase):**
- **Phase 3 (Tone Training):** Standard patterns from existing pronunciation pipeline. LOW risk. Just UI design work.
- **Phase 6 (Smart Study):** Straightforward aggregation queries. Mostly UX design challenge, not tech.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero packages. All technologies already in codebase. Verified package.json and existing usage. FSRS-5 reference implementation exists (femto-fsrs). |
| Features | HIGH | Feature scope well-defined from competitor analysis (Anki, Pleco, Skritter, Duolingo, Busuu, Ka Tones, Dong Chinese, HanyuAce, SuperTest). Clear table-stakes vs differentiators. Dependencies mapped. |
| Architecture | HIGH | All patterns extend existing codebase conventions (29 schema files, 30+ API route groups, 25+ component directories analyzed). Schema designs validated against existing tables. Integration points identified. |
| Pitfalls | HIGH | FSRS math is the main risk (Pitfall 1). Non-atomic neon-http writes are known issue with established mitigation patterns (review log as source of truth). Other pitfalls are standard web app concerns with clear mitigations. |
| HSK/Grammar Data | MEDIUM | HSK JSON sources verified as comprehensive (complete-hsk-vocabulary + hsk30 repos). Grammar content structure verified from AllSet Learning (450 patterns across HSK 1-6). But actual seeding and validation needs to happen during implementation. |
| Azure Tone Scoring | HIGH | Verified via official Microsoft docs (2026-02-10 update). zh-CN and zh-HK support phoneme, syllable, and prosody assessment. Per-character accuracy confirmed. Prosody != tone accuracy (documented limitation). |

**Overall confidence:** HIGH

### Gaps to Address

**Content volume estimation:**
- Grammar library: How many grammar patterns can be AI-drafted and coach-reviewed per day? Need to estimate throughput before committing to "50+ at launch." Recommendation: Start with 20 HSK 1 patterns (most common), expand based on coach feedback.
- Assessment question pool: How many questions are needed per HSK level for reliable placement? Literature suggests 15-20 total, but per-level minimum needs validation. Recommendation: Start with 5 questions per level, monitor placement accuracy, expand pool as needed.

**FSRS-5 validation:**
- Need to find or create definitive test vectors for the custom implementation. The femto-fsrs reference exists but may not have comprehensive tests. Recommendation: Extract test vectors from the fsrs4anki wiki and SRS benchmark repo.

**Cantonese tone training specifics:**
- Azure zh-HK pronunciation assessment is confirmed, but Cantonese has 6-9 tones (depending on analysis). The tone drill UI for Cantonese needs more design research. Recommendation: Start with 6-tone system (high-flat, high-rising, mid-flat, low-falling, low-rising, low-flat), defer tone change/entering tone complexities to v11.

**n8n workflow design:**
- Two new n8n workflows needed (grammar generation, exercise generation). Their exact prompt structure needs to be designed during the implementation phase. Recommendation: Start with simple template-based prompts, iterate based on coach feedback on draft quality.

**Service worker update:**
- New routes (e.g., `/srs`, `/tone`, `/assessment`, `/grammar`) need to be added to `NETWORK_ONLY_PATTERNS` in `public/sw.js`. Cache name needs to be bumped from `cantomando-v1` to `cantomando-v2` when deploying v10.0. (From Pitfall 10 in PITFALLS.md.)

## Sources

### Primary (HIGH confidence)
- [femto-fsrs (zero-dependency FSRS-5 reference)](https://github.com/RickCarlino/femto-fsrs) — Implementation to port
- [FSRS Algorithm Wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs) — Algorithm mechanics
- [SRS Benchmark](https://github.com/open-spaced-repetition/srs-benchmark) — Expected retention rates, FSRS vs SM-2 comparison
- [ts-fsrs (evaluated, not adopted)](https://github.com/open-spaced-repetition/ts-fsrs) — Alternative package (22KB minified)
- [Azure Speech Pronunciation Assessment](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment) — Confirmed prosody != tone accuracy
- [Azure Speech Language Support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=pronunciation-assessment) — Confirmed zh-CN and zh-HK support
- [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) — HSK seed data source
- [ivankra/hsk30](https://github.com/ivankra/hsk30) — HSK seed data cross-reference
- Existing codebase analysis: package.json, 29 schema files, `pronunciation.ts`, `tts.ts`, `practice-grading.ts`, `prompts.ts`, `db/index.ts` (neon-http driver), MEMORY.md (DB enum mismatch history)

### Secondary (MEDIUM confidence)
- [AllSet Learning Chinese Grammar Wiki](https://resources.allsetlearning.com/chinese/grammar/) — Grammar pattern structure (403 on direct fetch, structure inferred from search results)
- [Grammar points by level (AllSet Learning)](https://resources.allsetlearning.com/chinese/grammar/Grammar_points_by_level) — Level distribution
- [Anki for Chinese learning (Hacking Chinese)](https://www.hackingchinese.com/anki-a-friendly-intelligent-spaced-learning-system/) — Competitor analysis
- [Ka Chinese Tones App](https://chinesetones.app/) — Tone training competitor analysis
- [Mandarin Bean HSK online tests](https://mandarinbean.com/hsk-chinese-test-online/) — Assessment competitor analysis
- [Automated cloze question generation with LLMs (arxiv)](https://arxiv.org/abs/2403.02078) — Exercise generation patterns
- [Langfuse A/B testing for LLM prompts](https://langfuse.com/docs/prompt-management/features/a-b-testing) — Prompt testing patterns

### Tertiary (LOW confidence, needs validation)
- Azure tone-level accuracy for Chinese — Per-character accuracy as tone proxy needs empirical validation with real student audio during Phase 3
- FSRS optimizer data requirements — 3 months is an estimate based on Anki community guidance, not official documentation
- Exercise generation cost estimates — $5-20 per bulk pass depends on model choice and transcript length, needs validation during Phase 5

---

*Research completed: 2026-02-16*
*Ready for roadmap: YES*
*Next step: Roadmap creation with 6 suggested phases*
