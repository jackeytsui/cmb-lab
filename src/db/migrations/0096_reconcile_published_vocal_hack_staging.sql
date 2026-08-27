-- Reconcile review staging with the published learner-facing Vocal Hack copy.
--
-- Video/source audits in 0087 and 0094 intentionally corrected published
-- lesson text, order, and two wrong-source clips. The immutable VideoAsk import
-- tables keep the raw source snapshot; this review staging table should mirror
-- the approved live lesson so a later admin action cannot reintroduce rejected
-- transcripts. Every mutation is restricted to a valid published placement
-- whose lesson still identifies the same VideoAsk form.

WITH published_sentences AS (
  SELECT
    placement."id" AS placement_id,
    entry.sentence,
    entry.ordinality
  FROM "videoask_vocal_hack_placements" AS placement
  JOIN "course_library_lessons" AS lesson
    ON lesson."id" = placement."published_lesson_id"
  CROSS JOIN LATERAL jsonb_array_elements(lesson."content" -> 'sentences')
    WITH ORDINALITY AS entry(sentence, ordinality)
  WHERE placement."status" = 'published'
    AND placement."published_lesson_id" IS NOT NULL
    AND lesson."deleted_at" IS NULL
    AND lesson."lesson_type" IN ('vocal_hack', 'vocal_hack_canto')
    AND lesson."content" ->> 'sourceProvider' = 'videoask'
    AND lesson."content" ->> 'sourceFormImportId' = placement."form_import_id"::text
    AND jsonb_typeof(lesson."content" -> 'sentences') = 'array'
)
UPDATE "videoask_vocal_hack_sentences" AS staged
SET
  "sort_order" = COALESCE(
    (published.sentence ->> 'order')::integer,
    (published.ordinality - 1)::integer
  ),
  "video_url" = published.sentence ->> 'videoUrl',
  "source_prompt_text" = published.sentence ->> 'sourcePromptText',
  "chinese" = published.sentence ->> 'chinese',
  "pinyin" = published.sentence ->> 'pinyin',
  "english" = published.sentence ->> 'english',
  "status" = 'ready',
  "last_error" = NULL,
  "updated_at" = now()
FROM published_sentences AS published
WHERE staged."placement_id" = published.placement_id
  AND staged."id"::text = published.sentence ->> 'id'
  AND published.sentence ->> 'videoUrl' IS NOT NULL
  AND published.sentence ->> 'chinese' IS NOT NULL
  AND published.sentence ->> 'pinyin' IS NOT NULL
  AND published.sentence ->> 'english' IS NOT NULL;

-- Remove only published staging rows that were deliberately removed from the
-- corresponding live lesson. Raw source steps remain preserved separately in
-- videoask_step_imports and can still be audited.
DELETE FROM "videoask_vocal_hack_sentences" AS staged
USING "videoask_vocal_hack_placements" AS placement,
      "course_library_lessons" AS lesson
WHERE staged."placement_id" = placement."id"
  AND lesson."id" = placement."published_lesson_id"
  AND placement."status" = 'published'
  AND placement."published_lesson_id" IS NOT NULL
  AND lesson."deleted_at" IS NULL
  AND lesson."lesson_type" IN ('vocal_hack', 'vocal_hack_canto')
  AND lesson."content" ->> 'sourceProvider' = 'videoask'
  AND lesson."content" ->> 'sourceFormImportId' = placement."form_import_id"::text
  AND jsonb_typeof(lesson."content" -> 'sentences') = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(lesson."content" -> 'sentences') AS entry(sentence)
    WHERE entry.sentence ->> 'id' = staged."id"::text
  );

-- Recompute workflow counts from the reconciled rows instead of trusting the
-- original form step count.
UPDATE "videoask_vocal_hack_placements" AS placement
SET
  "total_sentences" = jsonb_array_length(lesson."content" -> 'sentences'),
  "ready_sentences" = (
    SELECT count(*)::integer
    FROM "videoask_vocal_hack_sentences" AS staged
    WHERE staged."placement_id" = placement."id"
      AND staged."status" = 'ready'
  ),
  "last_error" = NULL,
  "updated_at" = now()
FROM "course_library_lessons" AS lesson
WHERE lesson."id" = placement."published_lesson_id"
  AND placement."status" = 'published'
  AND placement."published_lesson_id" IS NOT NULL
  AND lesson."deleted_at" IS NULL
  AND lesson."lesson_type" IN ('vocal_hack', 'vocal_hack_canto')
  AND lesson."content" ->> 'sourceProvider' = 'videoask'
  AND lesson."content" ->> 'sourceFormImportId' = placement."form_import_id"::text
  AND jsonb_typeof(lesson."content" -> 'sentences') = 'array';
