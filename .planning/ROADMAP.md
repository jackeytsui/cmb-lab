# Roadmap: CantoMando Blueprint

## Milestones

- v1.0 Core LMS - Phases 1-9 (shipped 2026-01-27)
- v1.1 Coach Tools & Student AI Assistant - Phases 10-13 (shipped 2026-01-30)
- v2.0 Production Ready - Phases 14-20 (shipped 2026-01-30)
- v3.0 Student Management & CRM - Phases 21-24 (shipped 2026-01-31)
- v3.1 Bug Fixes & Polish - Phases 25-29 (shipped 2026-02-06)
- v4.0 Practice & Homework Platform - Phases 30-36 (shipped 2026-02-07)
- v5.0 Engagement & Polish - Phases 37-43 (shipped 2026-02-08)
- v6.0 Reading & Dictionary - Phases 44-49 (shipped 2026-02-09)
- v7.0 Video Listening Lab - Phases 50-55 (shipped 2026-02-10)
- v8.0 Video Conversation Engine - Phases 56-61 (shipped 2026-02-14)
- v9.0 Role-Based Access Control - Phases 62-68 (shipped 2026-02-15)
- **v10.0 Mastery & Intelligence** - Phases 69-74 (shipped 2026-02-16)

<details>
<summary>v1.0 through v9.0 (Phases 1-68) - SHIPPED</summary>

See `.planning/milestones/` for archived roadmaps.
See `.planning/MILESTONES.md` for milestone summaries.

- v1.0 Core LMS: 9 phases, 29 plans
- v1.1 Coach Tools: 4 phases, 20 plans
- v2.0 Production Ready: 7 phases, 14 plans
- v3.0 CRM Integration: 4 phases, 16 plans
- v3.1 Bug Fixes: 5 phases, 10 plans
- v4.0 Practice Platform: 7 phases, 33 plans
- v5.0 Engagement: 7 phases, 28 plans
- v6.0 Reading & Dictionary: 6 phases, 16 plans
- v7.0 Video Listening Lab: 6 phases, 14 plans
- v8.0 Video Conversation Engine: 6 phases, 12 plans
- v9.0 Role-Based Access Control: 7 phases, 14 plans

**Total shipped: 68 phases, 230 plans**

</details>

## v10.0 Mastery & Intelligence

**Milestone Goal:** Transform CantoMando from a course delivery platform into a comprehensive mastery engine -- SRS flashcards for long-term retention, tone-specific training, grammar reference library, placement/HSK assessments, AI-powered exercise generation, coach prompt testing lab, and smart study recommendations that tie everything together.

**Architecture:** Zero new npm packages. Custom FSRS-5 implementation (~100 lines of TypeScript) for spaced repetition. Azure Speech (existing) for tone training. n8n webhooks (existing) for AI content generation. Existing exercise types and grading functions reused for assessments. All AI output goes through coach review before reaching students.

**Phase Numbering:**
- Integer phases (69, 70, 71...): Planned milestone work
- Decimal phases (69.1, 69.2): Urgent insertions if needed (marked INSERTED)

- [x] **Phase 69: SRS Flashcard System** - FSRS-5 scheduler, flashcard schema, review player, deck management, one-click card creation from Reader/vocab/practice, and dashboard integration
  **Plans:** 1/1 complete
- [x] **Phase 70: Grammar Library & HSK Data** - Browsable grammar patterns by HSK level, search, coach editor with TipTap, AI draft generation via n8n, Cantonese vs Mandarin diffs, and lesson/practice set cross-links
  **Plans:** 1/1 complete
- [x] **Phase 71: Tone Training** - Tone identification drills, production recording with Azure scoring, Mandarin minimal pairs, Cantonese 6-tone drills, tone sandhi practice, and per-tone accuracy tracking
  **Plans:** 1/1 complete
- [x] **Phase 72: Assessment & Placement** - Adaptive placement quiz, HSK mock tests levels 1-6, per-section scoring, HSK level estimation, and coach custom assessment builder
  **Plans:** 1/1 complete
- [x] **Phase 73: Auto-Exercise Generation & Prompt Lab** - AI exercise generation from lesson/reader content via n8n, coach approval workflow, Zod validation, plus AI prompt testing lab with A/B comparison, batch tests, and promotion to production
  **Plans:** 1/1 complete
- [x] **Phase 74: Smart Study Engine** - Weak area identification from SRS/practice/tone data, daily study plan generation, "Study Today" dashboard widget, time goal calibration, and content recommendations
  **Plans:** 1/1 complete

## Phase Details

### Phase 69: SRS Flashcard System
**Goal**: Students can create, organize, and review flashcards using FSRS-5 spaced repetition, with one-click card creation from anywhere in the app and a daily review habit loop on the dashboard
**Depends on**: Phase 68 (v9.0 complete)
**Requirements**: FLASH-01, FLASH-02, FLASH-03, FLASH-04, FLASH-05, FLASH-06, FLASH-07, FLASH-08, FLASH-09, FLASH-10
**Success Criteria** (what must be TRUE):
  1. Student clicks "Add to SRS" on a Reader character popup or saved vocabulary item and a flashcard is created with character, pinyin/jyutping, meaning, and example sentence pre-populated
  2. Student opens the flashcard review page, sees cards in a full-screen flip interface, rates each card (Again/Hard/Good/Easy), and the next review date is computed by FSRS-5 scheduling
  3. Student creates custom decks (by topic, lesson, HSK level, or custom grouping), moves cards between decks, and creates manual flashcards with custom front/back text
  4. Student sees a dashboard badge showing "X cards due today" and a review statistics section with new/learning/review/mastered counts
  5. Student hears TTS audio (Mandarin and/or Cantonese) for each card during review by tapping an audio button

### Phase 70: Grammar Library & HSK Data
**Goal**: Students can browse, search, and bookmark a structured grammar reference organized by HSK level, with Cantonese-Mandarin comparisons, and coaches can author or AI-generate new grammar patterns
**Depends on**: Phase 69 (SRS schema must exist for grammar-to-SRS cross-references)
**Requirements**: GRAM-01, GRAM-02, GRAM-03, GRAM-04, GRAM-05, GRAM-06, GRAM-07, GRAM-08
**Success Criteria** (what must be TRUE):
  1. Student navigates to the grammar library and sees patterns organized by HSK level (1-6) and category (verb, particle, sentence structure, etc.), and can filter/browse by either dimension
  2. Student opens a grammar pattern and sees a structured explanation, 3+ example sentences with translations, common mistakes, and where applicable a "Cantonese vs Mandarin" section showing structural differences
  3. Student searches grammar patterns by Chinese characters, pinyin, or English keyword and gets relevant results
  4. Coach creates a new grammar pattern via admin panel using a TipTap rich text editor, or clicks "Generate AI Draft" to have an n8n webhook produce a draft for review and editing before publishing
  5. Student bookmarks grammar patterns and sees cross-links to relevant lessons and practice sets where the pattern appears

### Phase 71: Tone Training
**Goal**: Students can systematically train their tone perception and production for both Mandarin (4 tones + sandhi) and Cantonese (6 tones) through drills that track accuracy over time and surface weakest tones
**Depends on**: Phase 69 (foundation complete; tone training is independent but sequenced after SRS)
**Requirements**: TONE-01, TONE-02, TONE-03, TONE-04, TONE-05, TONE-06
**Success Criteria** (what must be TRUE):
  1. Student opens a tone identification drill, hears Azure TTS audio of a Chinese syllable, selects the correct tone number from options, and sees immediate right/wrong feedback
  2. Student records their pronunciation of a tone, gets Azure per-character accuracy scoring as tone feedback, and sees which tones they nailed vs missed
  3. Student practices Mandarin minimal pairs (e.g., ma with tones 1/2/3/4) and Cantonese 6-tone contrastive drills with audio examples and scoring
  4. Student drills Mandarin tone sandhi rules (3rd-tone changes, bu/yi context-dependent tones) with before/after examples
  5. Student views a tone accuracy dashboard showing per-tone-number accuracy over time, with their weakest tones highlighted for targeted practice

### Phase 72: Assessment & Placement
**Goal**: New students can take a quick placement quiz to find their level, any student can take HSK mock tests (levels 1-6) to benchmark proficiency, and coaches can build custom assessments
**Depends on**: Phase 70 (needs grammar patterns and HSK vocabulary data for question pools)
**Requirements**: ASSESS-01, ASSESS-02, ASSESS-03, ASSESS-04, ASSESS-05, ASSESS-06
**Success Criteria** (what must be TRUE):
  1. Student takes a 5-10 minute placement quiz with adaptive difficulty (questions get harder or easier based on performance) and receives a recommended starting course/lesson at the end
  2. Student takes an HSK-level mock test (levels 1-6) using existing exercise types (MCQ, fill-blank, matching, ordering, audio, free text) and sees a per-section score breakdown (listening, reading, vocabulary)
  3. Student views their estimated HSK level on a profile/dashboard page, computed from vocabulary coverage, test scores, and SRS mastery data
  4. Coach creates a custom assessment quiz by selecting exercises from the existing pool and setting pass thresholds
  5. System maps placement results to existing course content and recommends specific lessons to start with

### Phase 73: Auto-Exercise Generation & Prompt Lab
**Goal**: Coaches can auto-generate exercises from lesson and reader content via AI, review and approve before publishing, and systematically test AI prompt quality with saved test cases and batch runs
**Depends on**: Phase 70 (needs grammar data for grammar-based exercise generation), Phase 72 (assessment system validates exercise types work end-to-end)
**Requirements**: AUTOX-01, AUTOX-02, AUTOX-03, AUTOX-04, AUTOX-05, AUTOX-06, PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04, PROMPT-05, PROMPT-06
**Success Criteria** (what must be TRUE):
  1. Coach selects a lesson transcript or reader text and clicks "Generate Exercises" -- system creates cloze, reordering, matching, and fill-blank exercises via n8n webhook, validated against ExerciseDefinition Zod schemas
  2. Coach sees generated exercises in a review queue with approve/edit/reject actions, and only approved exercises become visible to students as assignable practice set content
  3. Coach opens the Prompt Testing Lab, enters a prompt and sample student input, and sees the AI-generated output inline without affecting any production prompt
  4. Coach runs a side-by-side A/B comparison of two prompt versions on the same input and sees outputs displayed in parallel columns
  5. Coach saves test cases (sample inputs with expected output patterns), runs batch tests against all saved cases, sees a pass/fail summary, and promotes a tested prompt version to production with one click

### Phase 74: Smart Study Engine
**Goal**: Students see personalized "what to study next" recommendations on their dashboard, powered by data from SRS review history, practice scores, tone accuracy, and assessment results
**Depends on**: Phase 69 (SRS data), Phase 71 (tone data), Phase 72 (assessment data), Phase 73 (full feature surface for recommendations)
**Requirements**: STUDY-01, STUDY-02, STUDY-03, STUDY-04, STUDY-05, STUDY-06
**Success Criteria** (what must be TRUE):
  1. Student's dashboard shows a "Study Today" section with prioritized activities: due SRS cards, weak vocabulary areas, recommended practice sets, and suggested tone drills
  2. System identifies weak vocabulary from FSRS retention rates (high lapse count, low stability) and weak topics from practice set scores, surfacing them as targeted review recommendations
  3. Student sets a daily study time goal (15min, 30min, 1hr) and sees a personalized daily study plan with time-based breakdown of activities
  4. System recommends specific lessons, practice sets, flashcard decks, or grammar patterns based on performance gaps and learning progression

### Phase 76: Team Feedback & Polish
**Goal**: Address 9 team and student feedback items: sidebar icon differentiation, TTS bug fix, coaching note enhancements (Mando-Canto copy-over translation, per-entry notes, GHL form embed), student export access, tone-colored characters across the platform, fathom link in CSV, and assigned coach display fix
**Depends on**: Phase 75
**Requirements**: FB-01, FB-02, FB-03, FB-04, FB-05, FB-06, FB-07, FB-08, FB-09
**Success Criteria** (what must be TRUE):
  1. Inner Circle and 1:1 Coaching have distinct icons in the sidebar (visible when collapsed)
  2. Editing Cantonese jyutping in coaching notes does not trigger Mandarin TTS
  3. Coaching notes have a "Copy Over" button that translates entries between Mandarin and Cantonese using GPT-4o-mini
  4. Each coaching note entry has an "Add Notes" button for explanations and extra notes
  5. GHL tracking form is embedded in the 1:1 lesson notes page
  6. Students can see and use the export button in 1:1 and Inner Circle sessions
  7. Chinese characters are tone-colored (Pleco-style) across Reader, flashcards, coaching notes, and dictionary popups
  8. Fathom link is included in CSV export files
  9. Assigned coach shows correctly in admin Students tab

**Plans:** 4/4 plans complete
Plans:
- [x] 76-01-PLAN.md — Quick fixes (sidebar icons, TTS bug, export access, fathom link, coach display)
- [x] 76-02-PLAN.md — Coaching enhancements (copy-over translation, per-entry notes, GHL form)
- [x] 76-03-PLAN.md — Tone-colored characters (Reader, flashcards, vocabulary)
- [ ] 76-04-PLAN.md — Gap closure: tone colors in coaching notes and dictionary popups

## Progress

**Execution Order:**
Phases execute in numeric order: 69 -> 70 -> 71 -> 72 -> 73 -> 74 -> 75
Decimal phases (if inserted) execute between their surrounding integers.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 69. SRS Flashcard System | v10.0 | 1/1 | Complete | 2026-02-16 |
| 70. Grammar Library & HSK Data | v10.0 | 1/1 | Complete | 2026-02-16 |
| 71. Tone Training | v10.0 | 1/1 | Complete | 2026-02-16 |
| 72. Assessment & Placement | v10.0 | 1/1 | Complete | 2026-02-16 |
| 73. Auto-Exercise Generation & Prompt Lab | v10.0 | 1/1 | Complete | 2026-02-16 |
| 74. Smart Study Engine | v10.0 | 1/1 | Complete | 2026-02-16 |
| 75. LTO Student Access & Mandarin Accelerator | - | 2/4 | Complete    | 2026-03-24 |
| 76. Team Feedback & Polish | - | 3/4 | Complete    | 2026-03-25 |

---
*Roadmap created: 2026-02-16*
*Last updated: 2026-03-25 after adding phase 76*
