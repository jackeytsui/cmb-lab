-- Align residual Vocal Hack rows confirmed after a third transcription pass.
-- Guard every replacement against the exact current learner-facing values.

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
          'ad57fa14-6690-455b-abb0-a73752f6ea94',
          '你来这里的目的是什幺？',
          'nǐ lái zhè lǐ de mù dì shì shén yāo',
          'What is your purpose for coming here?',
          '你来这里的目的是什么？',
          'nǐ lái zhè lǐ de mù dì shì shén me',
          'What is your purpose for coming here?'
        ),
        (
          '22a20420-3862-47d5-8cae-f31c6163693c',
          '我的成绩太差了，我让父母失望了。',
          'wǒ de chéng jì tài chà le wǒ ràng fù mǔ shī wàng le',
          'My grades are too poor, and I''ve disappointed my parents.',
          '我的成绩太差了，我让我父母失望了。',
          'wǒ de chéng jì tài chà le wǒ ràng wǒ fù mǔ shī wàng le',
          'My grades are too poor, and I''ve disappointed my parents.'
        ),
        (
          '32279d3f-6417-41e0-842a-2fe5d2e77bf5',
          '她很聪明，不过有时候有点粗心。',
          'tā hěn cōng ming bú guò yǒu shí hòu yǒu diǎn cū xīn',
          'She is very smart, but sometimes she is a bit careless.',
          '不过她也有韧性，得到鼓励后通常能重新振作。',
          'bú guò tā yě yǒu rèn xìng dé dào gǔ lì hòu tōng cháng néng chóng xīn zhèn zuò',
          'However, she is also resilient and can usually bounce back after receiving encouragement.'
        ),
        (
          '1271589d-18ce-4c8a-9031-d1b77510481f',
          '我胸好痛，而且有点喘不过气。',
          'wǒ xiōng hǎo tòng ér qiě yǒu diǎn chuǎn bú guò qì',
          'My chest hurts a lot, and I''m a bit short of breath.',
          '我胸口痛，而且有点喘不过气。',
          'wǒ xiōng kǒu tòng ér qiě yǒu diǎn chuǎn bú guò qì',
          'My chest hurts a lot, and I''m a bit short of breath.'
        ),
        (
          '5042ef6e-6df5-4589-a6f9-9c85afa19ffa',
          '嘴嘴开。',
          'zuǐ zuǐ kāi',
          'Open your mouth.',
          '嘴嘴开啊。',
          'zuǐ zuǐ kāi a',
          'Open your mouth.'
        ),
        (
          'dafaef58-5811-425c-83f6-97eb53ec2bda',
          '你需要先热身吗？',
          'nǐ xū yào xiān rè shēn ma',
          'Do you need to warm up first?',
          '够了，谢谢！你需要先热身吗？',
          'gòu le xiè xie nǐ xū yào xiān rè shēn ma',
          'That''s enough, thank you! Do you need to warm up first?'
        ),
        (
          '68978898-8df4-4a40-a6b9-03ab9ba9c6cf',
          '您是Ⅰ型还是Ⅱ型糖尿病？',
          'nín shì xíng hái shì xíng táng niào bìng',
          'Do you have type 1 or type 2 diabetes? Do you usually take medication or use insulin?',
          '您是Ⅰ型还是Ⅱ型糖尿病？平时吃药还是打胰岛素？',
          'nín shì yī xíng hái shì èr xíng táng niào bìng píng shí chī yào hái shì dǎ yí dǎo sù',
          'Do you have type 1 or type 2 diabetes? Do you usually take medication or use insulin?'
        ),
        (
          '899b6e12-4383-47e9-a06e-1040c66ed36e',
          '等您六十五岁的时候，不用自己申请。',
          'děng nín liù shí wǔ suì de shí hòu bú yòng zì jǐ shēn qǐng',
          'You can withdraw cash from it at any bank or ATM.',
          '等您六十五岁的时候，不用自己申请。',
          'děng nín liù shí wǔ suì de shí hòu bú yòng zì jǐ shēn qǐng',
          'When you turn sixty-five, you will not need to apply on your own.'
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
          'Residual Vocal Hack correction % did not match the expected or replacement values',
          correction.sentence_id;
      END IF;
    END IF;
  END LOOP;
END
$migration$;

-- Keep the published review staging copy aligned with the learner view.
WITH corrected_ids(sentence_id) AS (
  VALUES
    ('ad57fa14-6690-455b-abb0-a73752f6ea94'),
    ('22a20420-3862-47d5-8cae-f31c6163693c'),
    ('32279d3f-6417-41e0-842a-2fe5d2e77bf5'),
    ('1271589d-18ce-4c8a-9031-d1b77510481f'),
    ('5042ef6e-6df5-4589-a6f9-9c85afa19ffa'),
    ('dafaef58-5811-425c-83f6-97eb53ec2bda'),
    ('68978898-8df4-4a40-a6b9-03ab9ba9c6cf'),
    ('899b6e12-4383-47e9-a06e-1040c66ed36e')
),
published_sentences AS (
  SELECT
    placement."id" AS placement_id,
    entry.sentence
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
