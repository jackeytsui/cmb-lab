# Claude Code Handoff - v10.0 Mastery & Intelligence

**Project:** `New-LMS`  
**Date:** February 16, 2026  
**Scope completed:** Phases 69-74 (entire v10.0 milestone)

---

## 1) What was completed

### Phase 69 - SRS Flashcard System
Implemented:
- FSRS scheduler logic and SRS service layer
- SRS schema tables:
  - `srs_decks`
  - `srs_cards`
  - `srs_reviews`
- APIs:
  - `GET/POST /api/srs/decks`
  - `GET/POST/PATCH /api/srs/cards`
  - `POST /api/srs/cards/from-vocabulary`
  - `GET /api/srs/review/next`
  - `POST /api/srs/review`
  - `GET /api/srs/stats`
- Student page:
  - `/dashboard/srs`
- One-click add-to-SRS entry points:
  - Reader popup
  - Vocabulary list
  - Missed practice result items

### Phase 70 - Grammar Library & HSK Data
Implemented:
- Grammar schema tables:
  - `grammar_patterns`
  - `grammar_bookmarks`
- APIs:
  - `GET/POST /api/grammar/patterns`
  - `POST/DELETE /api/grammar/patterns/[patternId]/bookmark`
  - `POST /api/grammar/generate-draft` (webhook + fallback)
- Student pages:
  - `/dashboard/grammar`
  - `/dashboard/grammar/[patternId]`
- Coach/admin page:
  - `/admin/grammar` (uses existing TipTap editor)

### Phase 71 - Tone Training
Implemented:
- Tone schema table:
  - `tone_practice_attempts`
- APIs:
  - `GET /api/tone/drills`
  - `GET/POST /api/tone/attempts`
  - `POST /api/tone/score-pronunciation`
- Student page:
  - `/dashboard/tone`
- Includes identification drills, production recording/scoring path, and per-tone accuracy tracker

### Phase 72 - Assessment & Placement
Implemented:
- Assessment schema tables:
  - `assessments`
  - `assessment_questions`
  - `assessment_attempts`
- APIs:
  - `GET/POST /api/assessments`
  - `GET/POST /api/assessments/[assessmentId]/attempts`
- Student pages:
  - `/dashboard/assessments`
  - `/dashboard/assessments/[assessmentId]`
- Coach/admin page:
  - `/admin/assessments`
- Scoring reuses existing grading functions and returns section breakdown + estimated HSK level

### Phase 73 - Auto Exercise Generation & Prompt Lab
Implemented:
- Prompt lab schema tables:
  - `prompt_lab_cases`
  - `prompt_lab_runs`
- APIs:
  - `POST /api/admin/exercise-generation`
  - `GET/POST /api/admin/prompt-lab/cases`
  - `POST /api/admin/prompt-lab/run`
- Coach/admin pages:
  - `/admin/exercise-generation`
  - `/admin/prompt-lab`
- Webhook-first approach with local fallback outputs

### Phase 74 - Smart Study Engine
Implemented:
- Study preferences schema table:
  - `study_preferences`
- Study recommendation service:
  - `src/lib/study.ts`
- APIs:
  - `GET /api/study/today`
  - `GET/POST /api/study/preferences`
- Dashboard integration:
  - `Study Today` card added to `/dashboard`
  - goal presets (15/30/60 min)

---

## 2) Planning artifacts updated

Updated and aligned to completed state:
- `.planning/STATE.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/PROJECT.md`

Created phase docs:
- `.planning/phases/69-srs-flashcard-system/*`
- `.planning/phases/70-grammar-library-hsk-data/*`
- `.planning/phases/71-tone-training/*`
- `.planning/phases/72-assessment-placement/*`
- `.planning/phases/73-auto-exercise-generation-prompt-lab/*`
- `.planning/phases/74-smart-study-engine/*`

---

## 3) Database migration status

Generated migration artifacts:
- `src/db/migrations/0024_clammy_banshee.sql`
- `src/db/migrations/meta/0024_snapshot.json`
- `src/db/migrations/meta/_journal.json` (updated)

Important:
- Migration is generated but not applied in this run.
- Apply with your normal DB deploy flow (`db:migrate`/`db:push` policy as appropriate).

---

## 4) Validation performed

Commands run:
- `npx tsc --noEmit` -> passed
- `npm run build` -> passed

Build warnings seen (non-fatal in this environment):
- Upstash Redis URL placeholders trigger warnings during build-time route evaluation:
  - invalid URL: `"placeholder"`
- Build still completed successfully.

---

## 5) Open issues / risks / follow-up

### Environment / infra
1. Azure speech config required for full production tone scoring:
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`

2. n8n webhook URLs needed for production AI generation:
- `N8N_GRAMMAR_GEN_WEBHOOK_URL`
- `N8N_EXERCISE_GEN_WEBHOOK_URL`

3. Upstash Redis env values should be valid HTTPS URLs to remove warnings:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Product/quality follow-ups
4. Assessment calibration still needs real student data for tuning score thresholds.
5. Grammar library initial content seeding is still needed for stronger student launch experience.
6. Service worker route/cache update for new routes is still pending:
- `/dashboard/srs`
- `/dashboard/grammar`
- `/dashboard/tone`
- `/dashboard/assessments`

---

## 6) Key files to review first (for Claude Code)

Core data/model:
- `src/db/schema/srs.ts`
- `src/db/schema/grammar.ts`
- `src/db/schema/tone.ts`
- `src/db/schema/assessment.ts`
- `src/db/schema/prompt-lab.ts`
- `src/db/schema/study.ts`
- `src/db/schema/index.ts`

Core logic/services:
- `src/lib/fsrs.ts`
- `src/lib/srs.ts`
- `src/lib/study.ts`

Main UI entry points:
- `src/app/(dashboard)/dashboard/srs/page.tsx`
- `src/app/(dashboard)/dashboard/grammar/page.tsx`
- `src/app/(dashboard)/dashboard/grammar/[patternId]/page.tsx`
- `src/app/(dashboard)/dashboard/tone/page.tsx`
- `src/app/(dashboard)/dashboard/assessments/page.tsx`
- `src/app/(dashboard)/dashboard/assessments/[assessmentId]/page.tsx`
- `src/app/(dashboard)/admin/grammar/page.tsx`
- `src/app/(dashboard)/admin/assessments/page.tsx`
- `src/app/(dashboard)/admin/exercise-generation/page.tsx`
- `src/app/(dashboard)/admin/prompt-lab/page.tsx`
- `src/components/dashboard/StudyTodayCard.tsx`
- `src/components/layout/AppSidebar.tsx`

Integration touchpoints:
- `src/components/reader/CharacterPopup.tsx`
- `src/components/reader/popup/AddToSRSButton.tsx`
- `src/app/(dashboard)/dashboard/vocabulary/VocabularyClient.tsx`
- `src/components/practice/player/PracticeResults.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`

API entry points:
- `src/app/api/srs/*`
- `src/app/api/grammar/*`
- `src/app/api/tone/*`
- `src/app/api/assessments/*`
- `src/app/api/admin/exercise-generation/route.ts`
- `src/app/api/admin/prompt-lab/*`
- `src/app/api/study/*`

Migration:
- `src/db/migrations/0024_clammy_banshee.sql`

---

## 7) Suggested immediate next commands

1. Apply DB migration in target environment.
2. Set required env vars (Azure/n8n/Upstash).
3. Run smoke checks on these routes:
- `/dashboard/srs`
- `/dashboard/grammar`
- `/dashboard/tone`
- `/dashboard/assessments`
- `/admin/grammar`
- `/admin/assessments`
- `/admin/exercise-generation`
- `/admin/prompt-lab`
4. Run a quick role-access check (student/coach/admin visibility).
5. Decide whether to start `v11.0` planning or run a hardening/QA phase first.

