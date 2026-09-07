-- Repair three incomplete phrases reported from the Foundations Tone Pair
-- Vocal Hack lessons. Every replacement is guarded by the exact current
-- values so unexpected content drift fails instead of silently overwriting it.

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
          '5f938cca-ed07-43a7-a598-a1827d5e5bda',
          '已', 'yǐ', 'already',
          '已经', 'yǐ jīng', 'already'
        ),
        (
          'dc2d6912-38c5-45fe-ac9b-ac07c9160fd1',
          '我想', 'wǒ xiǎng', 'I remembered',
          '我想起', 'wǒ xiǎng qǐ', 'I remembered'
        ),
        (
          '3971c449-da9d-42ae-a165-c54890d00355',
          '下', 'xià', 'Raining',
          '下雨', 'xià yǔ', 'Raining'
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
    WHERE lesson."lesson_type" = 'vocal_hack'
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
        WHERE lesson."lesson_type" = 'vocal_hack'
          AND lesson."deleted_at" IS NULL
          AND sentence ->> 'id' = correction.sentence_id
          AND sentence ->> 'chinese' = correction.replacement_chinese
          AND sentence ->> 'pinyin' = correction.replacement_pinyin
          AND sentence ->> 'english' = correction.replacement_english
      ) INTO replacement_exists;

      IF NOT replacement_exists THEN
        RAISE EXCEPTION
          'Reported Vocal Hack correction % did not match expected or replacement values',
          correction.sentence_id;
      END IF;
    END IF;
  END LOOP;
END
$migration$;

-- Keep the import/review staging rows aligned so a later VideoAsk republish
-- cannot restore the incomplete wording.
WITH corrected_ids(sentence_id) AS (
  VALUES
    ('5f938cca-ed07-43a7-a598-a1827d5e5bda'),
    ('dc2d6912-38c5-45fe-ac9b-ac07c9160fd1'),
    ('3971c449-da9d-42ae-a165-c54890d00355')
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
    AND lesson."lesson_type" = 'vocal_hack'
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
