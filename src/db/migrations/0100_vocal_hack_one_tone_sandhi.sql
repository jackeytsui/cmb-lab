-- Apply the standard fourth-tone sandhi for 一 before the third-tone 型.

DO $migration$
DECLARE
  changed_count integer;
  replacement_exists boolean;
BEGIN
  UPDATE "course_library_lessons" AS lesson
  SET
    "content" = jsonb_set(
      lesson."content",
      '{sentences}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN sentence ->> 'id' = '68978898-8df4-4a40-a6b9-03ab9ba9c6cf'
              AND sentence ->> 'chinese' = '您是一型还是二型糖尿病？平时吃药还是打胰岛素？'
              AND sentence ->> 'pinyin' = 'nín shì yī xíng hái shì èr xíng táng niào bìng píng shí chī yào hái shì dǎ yí dǎo sù'
              AND sentence ->> 'english' = 'Do you have type 1 or type 2 diabetes? Do you usually take medication or use insulin?'
            THEN sentence || jsonb_build_object(
              'pinyin', 'nín shì yì xíng hái shì èr xíng táng niào bìng píng shí chī yào hái shì dǎ yí dǎo sù'
            )
            ELSE sentence
          END
          ORDER BY ordinal
        )
        FROM jsonb_array_elements(lesson."content" -> 'sentences')
          WITH ORDINALITY AS entries(sentence, ordinal)
      ),
      false
    ),
    "updated_at" = now()
  WHERE lesson."lesson_type" IN ('vocal_hack', 'vocal_hack_canto')
    AND jsonb_typeof(lesson."content" -> 'sentences') = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(lesson."content" -> 'sentences') AS existing(sentence)
      WHERE sentence ->> 'id' = '68978898-8df4-4a40-a6b9-03ab9ba9c6cf'
        AND sentence ->> 'chinese' = '您是一型还是二型糖尿病？平时吃药还是打胰岛素？'
        AND sentence ->> 'pinyin' = 'nín shì yī xíng hái shì èr xíng táng niào bìng píng shí chī yào hái shì dǎ yí dǎo sù'
        AND sentence ->> 'english' = 'Do you have type 1 or type 2 diabetes? Do you usually take medication or use insulin?'
    );

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count = 0 THEN
    SELECT EXISTS (
      SELECT 1
      FROM "course_library_lessons" AS lesson
      CROSS JOIN LATERAL jsonb_array_elements(lesson."content" -> 'sentences') AS existing(sentence)
      WHERE lesson."lesson_type" IN ('vocal_hack', 'vocal_hack_canto')
        AND lesson."deleted_at" IS NULL
        AND sentence ->> 'id' = '68978898-8df4-4a40-a6b9-03ab9ba9c6cf'
        AND sentence ->> 'pinyin' = 'nín shì yì xíng hái shì èr xíng táng niào bìng píng shí chī yào hái shì dǎ yí dǎo sù'
    ) INTO replacement_exists;

    IF NOT replacement_exists THEN
      RAISE EXCEPTION 'Vocal Hack 一型 tone-sandhi correction did not match';
    END IF;
  END IF;
END
$migration$;

WITH published_sentence AS (
  SELECT placement."id" AS placement_id, entry.sentence
  FROM "videoask_vocal_hack_placements" AS placement
  JOIN "course_library_lessons" AS lesson
    ON lesson."id" = placement."published_lesson_id"
  CROSS JOIN LATERAL jsonb_array_elements(lesson."content" -> 'sentences')
    AS entry(sentence)
  WHERE placement."status" = 'published'
    AND placement."published_lesson_id" IS NOT NULL
    AND lesson."deleted_at" IS NULL
    AND entry.sentence ->> 'id' = '68978898-8df4-4a40-a6b9-03ab9ba9c6cf'
)
UPDATE "videoask_vocal_hack_sentences" AS staged
SET
  "chinese" = published.sentence ->> 'chinese',
  "pinyin" = published.sentence ->> 'pinyin',
  "english" = published.sentence ->> 'english',
  "status" = 'ready',
  "last_error" = NULL,
  "updated_at" = now()
FROM published_sentence AS published
WHERE staged."placement_id" = published.placement_id
  AND staged."id"::text = published.sentence ->> 'id';
