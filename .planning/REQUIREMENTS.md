# Requirements: CantoMando Blueprint

**Defined:** 2026-02-16
**Core Value:** The interactive video player that transforms passive watching into active engagement — students can't just watch, they must demonstrate understanding at each checkpoint to progress.

## v10.0 Requirements

Requirements for Mastery & Intelligence milestone. Each maps to roadmap phases.

### SRS Flashcards

- [x] **FLASH-01**: User can create flashcards from saved vocabulary (character, pinyin/jyutping, meaning, example sentence auto-populated from dictionary)
- [x] **FLASH-02**: User can create custom flashcards manually (front text, back text, optional audio)
- [x] **FLASH-03**: User can organize flashcards into decks (by topic, lesson, HSK level, or custom grouping)
- [x] **FLASH-04**: User can review flashcards with FSRS-5 scheduling (algorithm determines optimal next review interval based on difficulty rating and history)
- [x] **FLASH-05**: User can rate recall difficulty during review (again/hard/good/easy) with card states (new/learning/review/relearning)
- [x] **FLASH-06**: User can hear TTS audio for each card (Mandarin and/or Cantonese via existing Azure TTS pipeline)
- [x] **FLASH-07**: User can see review statistics (cards due today, new, learning, mastered counts) on dashboard
- [x] **FLASH-08**: User can add flashcards from Reader character popup in one click
- [x] **FLASH-09**: User can add flashcards from practice set missed questions
- [x] **FLASH-10**: Dashboard shows daily due card count badge and review reminder

### Smart Study Engine

- [x] **STUDY-01**: System identifies weak vocabulary from FSRS retention rates (cards with high lapse count or low stability)
- [x] **STUDY-02**: System identifies weak topics from practice set scores and interaction pass rates
- [x] **STUDY-03**: Dashboard shows "Study Today" section with prioritized activities (due cards, weak areas, recommended content)
- [x] **STUDY-04**: System recommends specific lessons, practice sets, or flashcard decks based on performance gaps
- [x] **STUDY-05**: System generates personalized daily study plan with time-based breakdown
- [x] **STUDY-06**: User can set daily study time goal (15min, 30min, 1hr) to calibrate recommendations

### AI Prompt Testing Lab

- [x] **PROMPT-01**: Coach can test an AI prompt against a sample student input and see the generated output inline
- [x] **PROMPT-02**: Coach can compare outputs from two prompt versions side-by-side on the same input
- [x] **PROMPT-03**: Coach can save test cases (sample inputs with optional expected output patterns)
- [x] **PROMPT-04**: Coach can run batch tests against all saved test cases for a prompt and see aggregate results
- [x] **PROMPT-05**: Coach can see pass/fail summary with individual test case details for each batch run
- [x] **PROMPT-06**: Coach can promote a tested prompt version to production with one click

### Tone Training

- [x] **TONE-01**: User can practice tone identification (listen to Azure TTS audio, select correct tone number from options)
- [x] **TONE-02**: User can practice tone production (record pronunciation, score via Azure per-character accuracy as tone proxy)
- [x] **TONE-03**: User can practice Mandarin minimal pairs (mā/má/mǎ/mà with audio examples and scoring)
- [x] **TONE-04**: User can practice Cantonese tones (6 contrastive tones with audio examples and scoring)
- [x] **TONE-05**: System tracks tone accuracy over time per tone number and identifies weakest tones
- [x] **TONE-06**: User can drill Mandarin tone sandhi rules (3rd tone changes, 不/一 context-dependent tones)

### Assessment & Placement

- [x] **ASSESS-01**: User can take a quick placement quiz (5-10 minutes, adaptive difficulty via binary search on HSK levels)
- [x] **ASSESS-02**: System recommends starting course/lesson based on placement results and maps to existing content
- [x] **ASSESS-03**: User can take HSK-level mock tests (levels 1-6) using existing exercise types (MCQ, fill-blank, matching, ordering, audio, free text)
- [x] **ASSESS-04**: System scores HSK mock tests with per-section breakdown (listening, reading, vocabulary)
- [x] **ASSESS-05**: User can see estimated HSK level based on vocabulary coverage, test scores, and SRS mastery data
- [x] **ASSESS-06**: Coach can create custom assessment quizzes by selecting exercises and setting pass thresholds

### Grammar Pattern Library

- [x] **GRAM-01**: User can browse grammar patterns organized by HSK level (1-6) and category (verb, noun, particle, sentence structure, etc.)
- [x] **GRAM-02**: User can search grammar patterns by keyword (Chinese characters, pinyin, English meaning)
- [x] **GRAM-03**: Each grammar pattern shows structured explanation, 3+ example sentences with translations, and common mistakes
- [x] **GRAM-04**: Grammar patterns show Cantonese vs Mandarin structural differences where applicable
- [x] **GRAM-05**: User can bookmark grammar patterns for later review
- [x] **GRAM-06**: Coach can create and edit grammar pattern entries via admin panel with TipTap rich text editor
- [x] **GRAM-07**: Coach can generate AI draft grammar explanations via n8n webhook for review and editing before publishing
- [x] **GRAM-08**: Grammar patterns link to relevant lessons and practice sets where the pattern appears

### Auto-Generated Exercises

- [x] **AUTOX-01**: System generates cloze deletion exercises from lesson transcript text via n8n webhook
- [x] **AUTOX-02**: System generates sentence reordering exercises from lesson sentences via n8n webhook
- [x] **AUTOX-03**: System generates vocabulary matching exercises from lesson/deck word lists via n8n webhook
- [x] **AUTOX-04**: System generates fill-in-the-blank exercises from Reader content via n8n webhook
- [x] **AUTOX-05**: Coach can review, approve, edit, or reject auto-generated exercises before they appear to students
- [x] **AUTOX-06**: Approved auto-exercises integrate into the practice set system as assignable content with existing exercise types and Zod validation

## Phase 75 Requirements

Requirements for LTO Student Access & Mandarin Accelerator. Maps to Phase 75.

### Access Gating

- **LTO-01**: LTO students are identified by a CRM tag mapped to the `mandarin_accelerator` feature key via the existing tag-feature override system
- **LTO-02**: Tag is manageable via admin panel (manual coach tagging) and GHL CRM sync (auto on purchase)
- **LTO-03**: Mandarin Accelerator sidebar section is completely hidden for non-LTO students (no locked/teaser state)
- **LTO-04**: Tag removal revokes access but preserves all progress data; re-adding tag restores access with progress intact

### Typing Unlock Kit

- **LTO-05**: Student can practice typing Chinese characters from English + romanisation prompts with exact-match checking (green/red feedback, character-by-character detail)
- **LTO-06**: Two sections: Mandarin (20 sentences) and Cantonese (20 sentences) with per-section progress bars
- **LTO-07**: Retry until correct -- unlimited retries, must get it right to advance; progress tracked per student with resume capability
- **LTO-08**: Coach can manage typing sentences via admin panel with CRUD and JSON bulk upload

### Conversation Scripts

- **LTO-09**: 10 scenarios displayed as card grid; each opens a two-column dialogue practice flow with speaker/responder roles
- **LTO-10**: Both Cantonese and Mandarin shown inline per dialogue line (Canto first), with pre-recorded audio playback after speaking attempt
- **LTO-11**: Student self-rates each line as "good" or "not good"; progress tracked per script with ability to revisit not-good lines
- **LTO-12**: Coach can manage scripts with dialogue lines, upload audio files per line via Vercel Blob, and bulk upload via JSON

### Reader Passages

- **LTO-13**: Curated passages list shows 5 passages with read/unread badges; student opens passage in existing Reader with full features
- **LTO-14**: LTO students cannot create/import their own passages from the curated reader page (import UI hidden)
- **LTO-15**: Coach can manage curated passages via admin panel with CRUD and JSON bulk upload

## v11.0+ Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Handwriting Practice

- **WRITE-01**: User can practice writing characters with stroke-by-stroke guidance via HanziWriter
- **WRITE-02**: System grades stroke order correctness
- **WRITE-03**: User can practice in free-write mode without guides

### Advanced SRS

- **SRS-01**: User can import/export flashcard decks (CSV, Anki-compatible format)
- **SRS-02**: User can share flashcard decks with other students
- **SRS-03**: FSRS optimizer auto-tunes parameters from review history after sufficient data (3+ months)

### Advanced Assessment

- **AADV-01**: Listening comprehension section with audio-only questions
- **AADV-02**: Speaking assessment section with AI-graded oral responses
- **AADV-03**: Progress-over-time assessment comparison charts

## Out of Scope

| Feature | Reason |
|---------|--------|
| ML-based study recommendations | Heuristic approach sufficient for <100 students; ML adds complexity without proportional value |
| Gamified SRS (lives, power-ups) | Premium adult audience prefers clean study tools over game mechanics |
| Community flashcard marketplace | Small student base doesn't justify social features; coach-curated content is better |
| Automatic prompt deployment | All prompt changes must be coach-reviewed; no unsupervised AI output changes |
| Real-time multiplayer tone games | High complexity, low educational value vs structured drills |
| OCR-based character recognition | Out of scope per PROJECT.md; typing/paste input only |
| Handwriting practice | Deferred to v11.0+ per user request |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLASH-01 | Phase 69 | Done |
| FLASH-02 | Phase 69 | Done |
| FLASH-03 | Phase 69 | Done |
| FLASH-04 | Phase 69 | Done |
| FLASH-05 | Phase 69 | Done |
| FLASH-06 | Phase 69 | Done |
| FLASH-07 | Phase 69 | Done |
| FLASH-08 | Phase 69 | Done |
| FLASH-09 | Phase 69 | Done |
| FLASH-10 | Phase 69 | Done |
| STUDY-01 | Phase 74 | Done |
| STUDY-02 | Phase 74 | Done |
| STUDY-03 | Phase 74 | Done |
| STUDY-04 | Phase 74 | Done |
| STUDY-05 | Phase 74 | Done |
| STUDY-06 | Phase 74 | Done |
| PROMPT-01 | Phase 73 | Done |
| PROMPT-02 | Phase 73 | Done |
| PROMPT-03 | Phase 73 | Done |
| PROMPT-04 | Phase 73 | Done |
| PROMPT-05 | Phase 73 | Done |
| PROMPT-06 | Phase 73 | Done |
| TONE-01 | Phase 71 | Done |
| TONE-02 | Phase 71 | Done |
| TONE-03 | Phase 71 | Done |
| TONE-04 | Phase 71 | Done |
| TONE-05 | Phase 71 | Done |
| TONE-06 | Phase 71 | Done |
| ASSESS-01 | Phase 72 | Done |
| ASSESS-02 | Phase 72 | Done |
| ASSESS-03 | Phase 72 | Done |
| ASSESS-04 | Phase 72 | Done |
| ASSESS-05 | Phase 72 | Done |
| ASSESS-06 | Phase 72 | Done |
| GRAM-01 | Phase 70 | Done |
| GRAM-02 | Phase 70 | Done |
| GRAM-03 | Phase 70 | Done |
| GRAM-04 | Phase 70 | Done |
| GRAM-05 | Phase 70 | Done |
| GRAM-06 | Phase 70 | Done |
| GRAM-07 | Phase 70 | Done |
| GRAM-08 | Phase 70 | Done |
| AUTOX-01 | Phase 73 | Done |
| AUTOX-02 | Phase 73 | Done |
| AUTOX-03 | Phase 73 | Done |
| AUTOX-04 | Phase 73 | Done |
| AUTOX-05 | Phase 73 | Done |
| AUTOX-06 | Phase 73 | Done |
| LTO-01 | Phase 75 | Planned |
| LTO-02 | Phase 75 | Planned |
| LTO-03 | Phase 75 | Planned |
| LTO-04 | Phase 75 | Planned |
| LTO-05 | Phase 75 | Planned |
| LTO-06 | Phase 75 | Planned |
| LTO-07 | Phase 75 | Planned |
| LTO-08 | Phase 75 | Planned |
| LTO-09 | Phase 75 | Planned |
| LTO-10 | Phase 75 | Planned |
| LTO-11 | Phase 75 | Planned |
| LTO-12 | Phase 75 | Planned |
| LTO-13 | Phase 75 | Planned |
| LTO-14 | Phase 75 | Planned |
| LTO-15 | Phase 75 | Planned |

**Coverage:**
- v10.0 requirements: 48 total (all done)
- Phase 75 requirements: 15 total (planned)
- Mapped to phases: 63
- Unmapped: 0

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-03-24 after Phase 75 planning*
