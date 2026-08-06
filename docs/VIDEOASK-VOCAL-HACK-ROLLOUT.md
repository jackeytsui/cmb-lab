# VideoAsk Vocal Hack blending rollout

## Outcome

Blend the team's course-related VideoAsk content into native CMB Lab Vocal
Hack lessons. A VideoAsk form becomes one lesson inside an existing CMB Lab
module. Each coach-video step becomes one reviewable sentence row containing
the coach video, meaningful source prompt, Chinese, pinyin or jyutping,
English, and the original audio/video response rules.

VideoAsk forms, question snapshots, and private media copies remain in dedicated
source-staging tables for audit and resync. No generated VideoAsk Course Library
course is used or retained.

## Verified scope

- 457 VideoAsk forms are present in the durable import inventory.
- 118 reusable forms in the verified course-content groups belong in this
  workflow; 339 non-course/personalized workflows are deliberately ignored.
- The 118 reusable forms contain 938 coach-video sentence steps.
- Automatic placement: 114 exact and 4 high-confidence, with zero review or
  manual destinations remaining.
- 78 existing Vocal Hack placeholders can be replaced and 40 new sibling
  lessons can be added. Every destination is unique.
- Three records in `Customized` were audited as onboarding/research artifacts,
  not reusable lessons. Their source records/media remain archived but are
  intentionally excluded from shared-course publication.
- Source videos already live in private Vercel Blob storage. This workflow does
  not upload them to Mux again.

## Safety invariants

1. Preparing drafts only writes to `videoask_vocal_hack_*` staging tables.
2. AI transcription only writes to staging. Four independently claimed clips
   run concurrently; the queue remains duplicate-safe, pausable, and resumable.
3. The original VideoAsk prompt and transcript are retained separately from the
   new Mandarin/Cantonese AI transcript. Generic source labels such as `Step 2`
   remain audit metadata rather than student-facing lesson copy.
4. Only an authenticated CMB Lab admin can publish or roll back.
5. Publishing requires a destination and complete Chinese, romanisation, and
   English for every sentence.
6. A placement can be published individually, or exact/high ready placements
   can be published in bounded batches after explicit confirmation. The same
   snapshot, validation, and rollback checks run for every lesson.
7. Replacing a placeholder preserves its original content in an audit snapshot.
   Rolling back restores that snapshot. Rolling back a newly created lesson
   soft-deletes that lesson.
8. Rollback refuses to overwrite a lesson that was edited after publication.
9. Source ingestion writes only to `videoask_*` staging/media tables. It does
   not create Course Library courses, modules, lessons, or video threads.

## Production rollout

### 1. Deploy the reviewed code

Push the approved commit to `main`. The Vercel production build runs
`node scripts/apply-migrations.mjs` before `next build`, so migration
`0077_videoask_vocal_hack_staging.sql`,
`0078_videoask_source_staging.sql`, and
`0079_vocal_hack_video_responses.sql` are applied to the production Neon
database automatically. Migration 0078 backfills normalized source-step fields and
retires the verified legacy generated course only while it remains an
unpublished draft. Its duplicated 457 lessons/threads are removed without
deleting form, media, or Vocal Hack staging records. Confirm both migrations
and the build succeeded in the Vercel deployment log before continuing.

### 2. Verify the read-only placement plan

Open `/admin/integrations/videoask`; the blended-course plan loads
automatically. Select **Open blended-course plan** if it was closed.
The expected totals are:

- 118 course forms
- 339 ignored/personalized workflows
- 114 exact
- 4 high-confidence
- 0 needing review
- 0 manual
- 938 sentence videos

Stop if these totals change unexpectedly. Re-scan and investigate the source
inventory rather than preparing drafts from an unexplained plan.

### 3. Prepare staging drafts

Select **Prepare review drafts**. This creates 118 placement rows and up to 938
sentence rows. It does not alter Course Library lessons. Refresh the workflow
and verify the placement and sentence counts.

### 4. Run safe AI transcription

Select **Generate native sentence text**. This includes exact and
high-confidence placements only. The browser calls four durable processors in
parallel; the run can be paused and resumed without losing completed work.

Each clip is sent to OpenAI for Mandarin or Cantonese transcription. The result
is normalized to one taught sentence (duplicate demonstrations inside the clip
are removed), translated to English, and romanised locally. No course lesson is
published by this step.

### 5. Verified destination decisions

The prior exceptions were resolved from source prompts/transcripts and the live
Course Library catalog:

- `Foundations (Basic Introduction)` replaces `Personal Introduction (Vocal Hack)`.
- `Intermediate (Tourist checking in at the airport)` becomes a separate sibling
  under `CM School: Passing Immigration` so it cannot overwrite that lesson.
- `Intermediate (Customers Travelling Recommendations)` becomes a separate
  sibling under `CM School: Making plans`.
- `CMB - Vocal hack`, `Confident Cantonese - Vocal hack`, and `VOCAL HACK 1`
  are personalized onboarding/research artifacts and remain archived/excluded.

### 6. Pilot three representative lessons

Before publishing all placements, publish and test:

1. one exact numbered Mandarin placement that replaces a placeholder;
2. one CM School topic that creates a new sibling Vocal Hack lesson;
3. one Cantonese placement using Traditional Chinese and jyutping.

For each pilot, verify as both admin and student:

- the lesson appears in the intended existing module, beside the related
  Breakdown/Listening material;
- the coach video streams and seeks correctly;
- Chinese, pinyin or jyutping, and English match the spoken sentence;
- repeated coach demonstrations appear only once in text;
- the student can record and submit every sentence;
- the student can choose audio or camera video where VideoAsk allowed both,
  upload an existing recording, re-record, and use the source five-minute limit;
- the submission reaches the existing Vocal Hack review workflow.

If a pilot is wrong, select **Roll back publication** from its placement audit,
correct the staging draft, and repeat the pilot.

### 7. Publish the remaining placements

Use **Publish native lessons** after the pilots pass. It publishes bounded
batches of exact/high mappings and retains an individual rollback snapshot for
each destination. Check a student-view sample from Foundations, Intermediate,
Advanced, CM School, and Canto Courses after rollout. Customized artifacts are
not course lessons and remain excluded.

## Completion evidence

The rollout is complete only when:

- all 118 reusable placements are published and the three Customized artifacts
  remain explicitly documented as excluded;
- every published placement has all sentence rows reviewed;
- the six source groups have no unexplained pending/failed sentences;
- the three pilot flows and a final sample from each source group pass the
  student-view checks above;
- no generated `VideoAsk Migration — …` course remains in the Course Library;
- the durable VideoAsk source/form/question/media staging records remain
  available for audit and resync;
- Vercel deployment and Neon migration logs are retained with the rollout audit.
