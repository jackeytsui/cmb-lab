-- Normalize the two residual corrections so generated romanisation and
-- displayed syllables remain one-to-one after the video-alignment cleanup.

DO $migration$
DECLARE
  correction record;
  changed_count integer;
  replacement_exists boolean;
BEGIN
  FOR correction IN
    SELECT *
    FROM (
      VALUES
        (
          '68978898-8df4-4a40-a6b9-03ab9ba9c6cf',
          '您是Ⅰ型还是Ⅱ型糖尿病？平时吃药还是打胰岛素？',
          'nín shì yī xíng hái shì èr xíng táng niào bìng píng shí chī yào hái shì dǎ yí dǎo sù',
          'Do you have type 1 or type 2 diabetes? Do you usually take medication or use insulin?',
          '您是一型还是二型糖尿病？平时吃药还是打胰岛素？',
          'nín shì yī xíng hái shì èr xíng táng niào bìng píng shí chī yào hái shì dǎ yí dǎo sù',
          'Do you have type 1 or type 2 diabetes? Do you usually take medication or use insulin?'
        ),
        (
          'dafaef58-5811-425c-83f6-97eb53ec2bda',
          '够了，谢谢！你需要先热身吗？',
          'gòu le xiè xie nǐ xū yào xiān rè shēn ma',
          'That''s enough, thank you! Do you need to warm up first?',
          '够了，谢谢！你需要先热身吗？',
          'gòu le xiè xiè nǐ xū yào xiān rè shēn ma',
          'That''s enough, thank you! Do you need to warm up first?'
        )
    ) AS fixes(
      sentence_id, expected_chinese, expected_pinyin, expected_english,
      replacement_chinese, replacement_pinyin, replacement_english
    )
  LOOP
    UPDATE "course_library_lessons" AS lesson
    SET
      "content" = jsonb_set(
        lesson."content",
        '{sentences}',
        (
          SELECT jsonb_agg(
            CASE
              WHEN sentence ->> 'id' = correction.sentence_id
                AND sentence ->> 'chinese' = correction.expected_chinese
                AND sentence ->> 'pinyin' = correction.expected_pinyin
                AND sentence ->> 'english' = correction.expected_english
              THEN sentence || jsonb_build_object(
                'chinese', correction.replacement_chinese,
                'pinyin', correction.replacement_pinyin,
                'english', correction.replacement_english
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
        WHERE sentence ->> 'id' = correction.sentence_id
          AND sentence ->> 'chinese' = correction.expected_chinese
          AND sentence ->> 'pinyin' = correction.expected_pinyin
          AND sentence ->> 'english' = correction.expected_english
      );

    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count = 0 THEN
      SELECT EXISTS (
        SELECT 1
        FROM "course_library_lessons" AS lesson
        CROSS JOIN LATERAL jsonb_array_elements(lesson."content" -> 'sentences') AS existing(sentence)
        WHERE lesson."lesson_type" IN ('vocal_hack', 'vocal_hack_canto')
          AND lesson."deleted_at" IS NULL
          AND sentence ->> 'id' = correction.sentence_id
          AND sentence ->> 'chinese' = correction.replacement_chinese
          AND sentence ->> 'pinyin' = correction.replacement_pinyin
          AND sentence ->> 'english' = correction.replacement_english
      ) INTO replacement_exists;

      IF NOT replacement_exists THEN
        RAISE EXCEPTION
          'Residual Vocal Hack romanisation correction % did not match',
          correction.sentence_id;
      END IF;
    END IF;
  END LOOP;
END
$migration$;

WITH corrected_ids(sentence_id) AS (
  VALUES
    ('68978898-8df4-4a40-a6b9-03ab9ba9c6cf'),
    ('dafaef58-5811-425c-83f6-97eb53ec2bda')
),
published_sentences AS (
  SELECT placement."id" AS placement_id, entry.sentence
  FROM "videoask_vocal_hack_placements" AS placement
  JOIN "course_library_lessons" AS lesson
    ON lesson."id" = placement."published_lesson_id"
  CROSS JOIN LATERAL jsonb_array_elements(lesson."content" -> 'sentences')
    AS entry(sentence)
  JOIN corrected_ids
    ON corrected_ids.sentence_id = entry.sentence ->> 'id'
  WHERE placement."status" = 'published'
    AND placement."published_lesson_id" IS NOT NULL
    AND lesson."deleted_at" IS NULL
    AND lesson."lesson_type" IN ('vocal_hack', 'vocal_hack_canto')
)
UPDATE "videoask_vocal_hack_sentences" AS staged
SET
  "chinese" = published.sentence ->> 'chinese',
  "pinyin" = published.sentence ->> 'pinyin',
  "english" = published.sentence ->> 'english',
  "status" = 'ready',
  "last_error" = NULL,
  "updated_at" = now()
FROM published_sentences AS published
WHERE staged."placement_id" = published.placement_id
  AND staged."id"::text = published.sentence ->> 'id';
