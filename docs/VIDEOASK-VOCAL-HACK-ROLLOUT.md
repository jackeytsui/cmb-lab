# VideoAsk Vocal Hack blending rollout

## Outcome

Blend the team's course-related VideoAsk content into native CMB Lab Vocal
Hack lessons. A VideoAsk form becomes one lesson inside an existing CMB Lab
module. Each coach-video step becomes one reviewable sentence row containing
the coach video, Chinese, pinyin or jyutping, and English.

VideoAsk forms, question snapshots, and private media copies remain in dedicated
source-staging tables for audit and resync. No generated VideoAsk Course Library
course is used or retained.

## Verified scope

- 457 VideoAsk forms are present in the durable import inventory.
- 121 forms in the six verified course-content groups belong in this workflow.
- 336 non-course workflows are deliberately ignored.
- The 121 forms contain 942 coach-video sentence steps.
- Automatic placement: 113 exact, 2 high-confidence, 2 review, and 4 manual.
- 79 existing Vocal Hack placeholders can be replaced and 38 new sibling
  lessons can be added. Four forms require a destination chosen by an admin.
- Source videos already live in private Vercel Blob storage. This workflow does
  not upload them to Mux again.

## Safety invariants

1. Preparing drafts only writes to `videoask_vocal_hack_*` staging tables.
2. AI transcription only writes to staging and processes one private clip per
   request, making it resumable.
3. The original VideoAsk prompt and transcript are retained separately from the
   new Mandarin/Cantonese AI transcript. Generic source labels such as `Step 2`
   remain audit metadata rather than student-facing lesson copy.
4. Only an authenticated CMB Lab admin can publish or roll back.
5. Publishing requires a destination and complete Chinese, romanisation, and
   English for every sentence.
6. Publishing happens one placement at a time after a confirmation naming its
   course, module, and lesson.
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
`0077_videoask_vocal_hack_staging.sql` and
`0078_videoask_source_staging.sql` are applied to the production Neon database
automatically. Migration 0078 backfills normalized source-step fields and
retires the verified legacy generated course only while it remains an
unpublished draft. Its duplicated 457 lessons/threads are removed without
deleting form, media, or Vocal Hack staging records. Confirm both migrations
and the build succeeded in the Vercel deployment log before continuing.

### 2. Verify the read-only placement plan

Open `/admin/integrations/videoask`; the blended-course plan loads
automatically. Select **Open blended-course plan** if it was closed.
The expected totals are:

- 121 course forms
- 336 ignored workflows
- 113 exact
- 2 high-confidence
- 2 needing review
- 4 manual
- 942 sentence videos

Stop if these totals change unexpectedly. Re-scan and investigate the source
inventory rather than preparing drafts from an unexplained plan.

### 3. Prepare staging drafts

Select **Prepare review drafts**. This creates 121 placement rows and up to 942
sentence rows. It does not alter Course Library lessons. Refresh the workflow
and verify the placement and sentence counts.

### 4. Run safe AI transcription

Select **Start/resume safe AI transcription**. This initially includes exact
and high-confidence placements only. The browser calls the durable processor
one clip at a time; it can be paused and resumed without losing completed work.

Each clip is sent to OpenAI for Mandarin or Cantonese transcription. The result
is normalized to one taught sentence (duplicate demonstrations inside the clip
are removed), translated to English, and romanised locally. No course lesson is
published by this step.

### 5. Resolve non-automatic placements

Review these known exceptions explicitly:

- `Foundations (Basic Introduction)` — suggested `CM School: Personal Introduction`
- `Intermediate (Tourist checking in at the airport)` — suggested
  `CM School: Checking in at Hotel`; verify that this is not a hotel/airport
  topic mismatch before accepting it
- `Intermediate (Customers Travelling Recommendations)` — choose the correct
  module manually
- `CMB - Vocal hack` — choose the intended course and module
- `Confident Cantonese - Vocal hack` — choose the intended course and module
- `VOCAL HACK 1` — choose the intended course and module

After choosing and saving a destination, use **AI transcribe missing rows** on
that placement.

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
- the submission reaches the existing Vocal Hack review workflow.

If a pilot is wrong, select **Roll back publication** from its placement audit,
correct the staging draft, and repeat the pilot.

### 7. Publish the remaining placements

Publish in small batches by source group, checking the student view after each
batch. The recommended order is Foundations, Intermediate, Advanced, CM School,
Canto Courses, then Customized. Do not publish the two review matches or four
manual placements until their destination has been confirmed by the content
team.

## Completion evidence

The rollout is complete only when:

- all 121 placements are either published or explicitly documented as excluded;
- every published placement has all sentence rows reviewed;
- the six source groups have no unexplained pending/failed sentences;
- the three pilot flows and a final sample from each source group pass the
  student-view checks above;
- no generated `VideoAsk Migration — …` course remains in the Course Library;
- the durable VideoAsk source/form/question/media staging records remain
  available for audit and resync;
- Vercel deployment and Neon migration logs are retained with the rollout audit.
