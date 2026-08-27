-- Align the remaining Vocal Hack rows confirmed by three independent
-- transcriptions with the coach video. Every replacement is guarded by the
-- exact current display values and fails loudly if the live source has drifted.

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
          'c8f92c5b-db28-4f23-9501-9512a8c66228',
          '在家里觉得安全吗？',
          'zài jiā lǐ jué de ān quán ma',
          'Do you feel safe at home?',
          '在家里觉得安全吗？有没有人让您害怕？',
          'zài jiā lǐ jué de ān quán ma yǒu méi yǒu rén ràng nín hài pà',
          'Do you feel safe at home? Is there anyone who makes you afraid?'
        ),
        (
          '17dfa53c-1bbb-4dbb-9e62-acd33647170b',
          '您现在在吃什么药?',
          'nín xiàn zài zài chī shén me yào',
          'What medication are you taking now?',
          '好，那就行。您现在在吃什么药？',
          'hǎo nà jiù xíng nín xiàn zài zài chī shén me yào',
          'Okay, that''s good. What medication are you taking now?'
        ),
        (
          '95477360-45f4-42cc-8cea-123d5c89723f',
          '你係邊個？',
          'nei5 hai6 bin1 go3',
          'Who are you?',
          '你係邊個個仔？',
          'nei5 hai6 bin1 go3 go3 zai2',
          'Whose son are you?'
        ),
        (
          'abfa15b8-d45e-4c52-a8ce-0961524e87c8',
          '社保卡、退休金、配偶福利和伤残津贴。',
          'shè bǎo kǎ tuì xiū jīn pèi ǒu fú lì hé shāng cán jīn tiē',
          'Social Security cards, retirement benefits, spousal benefits, and disability benefits.',
          '社保卡、退休金和配偶福利、伤残津贴。',
          'shè bǎo kǎ tuì xiū jīn hé pèi ǒu fú lì shāng cán jīn tiē',
          'Social Security cards, retirement benefits, spousal benefits, and disability benefits.'
        ),
        (
          '9fbe9898-5389-4482-88e1-9a85e72f4c5c',
          '我哋聽日下午食蘋果同橙',
          'ngo5 dei6 ting1 jat6 haa6 zau3 sik6 ping4 gwo2 tung4 caang2',
          'We will eat apples and oranges tomorrow afternoon.',
          '我哋聽日下晝食蘋果同橙。',
          'ngo5 dei6 ting1 jat6 haa6 zau3 sik6 ping4 gwo2 tung4 caang2',
          'We will eat apples and oranges tomorrow afternoon.'
        ),
        (
          '0da0f1b1-9a98-40f3-8c05-43c2b238aeed',
          '嘉倩而家喺房唱緊呢首歌',
          'gaa1 ze1 ji4 gaa1 hai2 fong2 coeng3 gan2 ni1 sau2 go1',
          'Ga Sin is singing this song in the room right now.',
          '家姐而家喺房唱緊呢首歌。',
          'gaa1 ze1 ji4 gaa1 hai2 fong2 coeng3 gan2 ni1 sau2 go1',
          'My older sister is singing this song in the room right now.'
        ),
        (
          'cb17c681-c6c7-4f05-a92b-3888fbfc9f07',
          '坐月子期间不要碰冷水。',
          'zuò yuè zǐ qī jiān bú yào pèng lěng shuǐ',
          'You shouldn’t touch cold water during the postpartum recovery period.',
          '坐月子期间不要碰冷水吗？',
          'zuò yuè zǐ qī jiān bú yào pèng lěng shuǐ ma',
          'Shouldn''t you avoid touching cold water during postpartum recovery?'
        ),
        (
          'bea8a3e7-5d4a-4470-9a07-28e6bf2c6fcb',
          '但对于我来说，这是我头一回养狗。',
          'dàn duì yú wǒ lái shuō zhè shì wǒ tóu yì huí yǎng gǒu',
          'But for me, this is my first time raising a dog.',
          '但对我来说，这是我头一回养狗。',
          'dàn duì wǒ lái shuō zhè shì wǒ tóu yì huí yǎng gǒu',
          'But for me, this is my first time raising a dog.'
        ),
        (
          '3120c8f4-8dfb-4c05-9625-0f33302617f1',
          '如果破水，要立刻到医院通知护士。',
          'rú guǒ pò shuǐ yào lì kè dào yī yuàn tōng zhī hù shì',
          'If your water breaks, go to the hospital immediately and inform the nurse.',
          '如果破水，要立刻到医院跟通知护士。',
          'rú guǒ pò shuǐ yào lì kè dào yī yuàn gēn tōng zhī hù shì',
          'If your water breaks, go to the hospital immediately and inform the nurse.'
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
          'Vocal Hack correction % did not match the expected or replacement values',
          correction.sentence_id;
      END IF;
    END IF;
  END LOOP;
END
$migration$;

-- Keep the published review staging copy aligned with the corrected learner
-- view so a later VideoAsk publish cannot restore the old fields.
WITH corrected_ids(sentence_id) AS (
  VALUES
    ('c8f92c5b-db28-4f23-9501-9512a8c66228'),
    ('17dfa53c-1bbb-4dbb-9e62-acd33647170b'),
    ('95477360-45f4-42cc-8cea-123d5c89723f'),
    ('abfa15b8-d45e-4c52-a8ce-0961524e87c8'),
    ('9fbe9898-5389-4482-88e1-9a85e72f4c5c'),
    ('0da0f1b1-9a98-40f3-8c05-43c2b238aeed'),
    ('cb17c681-c6c7-4f05-a92b-3888fbfc9f07'),
    ('bea8a3e7-5d4a-4470-9a07-28e6bf2c6fcb'),
    ('3120c8f4-8dfb-4c05-9625-0f33302617f1')
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
