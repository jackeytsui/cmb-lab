-- Correct high-confidence Vocal Hack transcription and translation defects in
-- Confident Cantonese Kickstarter. Every change is guarded by lesson ID,
-- sentence order, field name, and the exact current value so this migration is
-- safe to rerun and will not overwrite later editorial work.

DO $migration$
DECLARE
  correction record;
BEGIN
  FOR correction IN
    SELECT *
    FROM (
      VALUES
        ('d536a6d6-fbb3-4edd-b83f-07d993071656'::uuid, 0, 'chinese', '你好，我叫Janella，你叫咩名？', '你好，我叫Janelle，你叫咩名？'),
        ('d536a6d6-fbb3-4edd-b83f-07d993071656'::uuid, 0, 'english', 'Hello, my name is Janella. What is your name?', 'Hello, my name is Janelle. What is your name?'),
        ('e31ac84e-a996-4ef4-bdf9-65aeaea61dc2'::uuid, 3, 'english', 'Do you want to eat fruit at the hotel?', 'Do you eat fruit at the hotel?'),
        ('ec47ad75-c00c-4e62-9519-75bb79e339c1'::uuid, 11, 'english', 'Is there more?', 'Anything else?'),
        ('273949bb-e91b-4a5e-babd-13443e5b094a'::uuid, 0, 'chinese', '佢雕頭組鍾意喺星巴克買咖啡。', '佢朝頭早鍾意喺星巴克買咖啡。'),
        ('273949bb-e91b-4a5e-babd-13443e5b094a'::uuid, 0, 'english', 'His team likes to buy coffee at Starbucks.', 'He likes to buy coffee at Starbucks in the morning.'),
        ('37adf628-4f48-4515-8c0a-50d2cb323764'::uuid, 3, 'english', 'Let''s all go together, this time I treat.', 'Together—this one''s on me.'),
        ('6386454a-b749-4170-b666-1f167c5ec968'::uuid, 1, 'pinyin', 'ng5 man1 jat1 bong6 ng5 man1 jat1 gung1 gan1', 'ng5 man1 jat1 bong6'),
        ('6386454a-b749-4170-b666-1f167c5ec968'::uuid, 4, 'pinyin', 'jau5 nei5 jiu3 daai6 zeon1 ding6 sai3 zeon1', 'nei5 jiu3 daai6 zeon1 ding6 sai3 zeon1'),
        ('6386454a-b749-4170-b666-1f167c5ec968'::uuid, 5, 'english', 'It''s a small bottle.', 'A small bottle is fine.'),
        ('c5ff072a-4cbb-4c0b-acb8-3e4c4ca3fc2c'::uuid, 1, 'english', 'He needs to take a little money from the bank today.', 'He needs to withdraw a little money from the bank today.'),
        ('6f69aa01-4b69-4612-a36a-5ba8aed2dd42'::uuid, 7, 'english', 'Their daughter just got born.', 'Their daughter was just born.'),
        ('de68b636-9ced-4588-b503-74cd6c40352b'::uuid, 0, 'english', 'We will eat apples and oranges this afternoon.', 'We will eat apples and oranges tomorrow afternoon.'),
        ('ce8eda07-8fa0-473f-805d-29e7352955e5'::uuid, 1, 'english', 'I am a investment consultant.', 'I am an investment consultant.'),
        ('74c4284d-1500-49da-bcb6-776c76694f09'::uuid, 2, 'chinese', '我聽班想喺酒吧見我啲同事。', '我聽晚想喺酒吧見我啲同事。'),
        ('74c4284d-1500-49da-bcb6-776c76694f09'::uuid, 2, 'english', 'I heard that the class wants to meet my colleagues at the bar.', 'I want to meet my colleagues at the bar tomorrow night.'),
        ('cd1cc292-4620-499d-b305-ab79ccfa2b8a'::uuid, 3, 'english', 'I have something to do early tomorrow morning.', 'I have something to do in the morning.'),
        ('cd1cc292-4620-499d-b305-ab79ccfa2b8a'::uuid, 10, 'english', 'I might be late, I''ll text you when I arrive.', 'I might be late; I''ll text you then.'),
        ('45da0fe3-0942-4a7c-8c70-f14c7606be21'::uuid, 3, 'pinyin', 'daa2 gaau2 saai3 ngo5 maai5 zo2 siu2 siu2 saang1 gwo2 lei4', 'daai6 gaa1 hou2 saai3 ngo5 maai5 zo2 siu2 siu2 saang1 gwo2 lei4'),
        ('45da0fe3-0942-4a7c-8c70-f14c7606be21'::uuid, 4, 'english', 'Don''t be so polite.', 'You shouldn''t have.'),
        ('45da0fe3-0942-4a7c-8c70-f14c7606be21'::uuid, 5, 'english', 'Make yourself comfortable, behave like it''s your own home.', 'Make yourself at home.'),
        ('45da0fe3-0942-4a7c-8c70-f14c7606be21'::uuid, 10, 'chinese', '好喇呀，唔該。', '可樂呀，唔該。'),
        ('45da0fe3-0942-4a7c-8c70-f14c7606be21'::uuid, 10, 'english', 'Alright, thank you.', 'Coke, please.'),
        ('b1869e34-86e4-4e8a-9293-a831440ef82c'::uuid, 2, 'chinese', '我哋旅行。', '我嚟旅行。'),
        ('b1869e34-86e4-4e8a-9293-a831440ef82c'::uuid, 2, 'english', 'We are traveling.', 'I''m here to travel.'),
        ('b1869e34-86e4-4e8a-9293-a831440ef82c'::uuid, 4, 'chinese', '唔得，下個星期四走。', '五日，下個星期四走。'),
        ('b1869e34-86e4-4e8a-9293-a831440ef82c'::uuid, 4, 'english', 'No, we''re leaving next Thursday.', 'Five days. I''m leaving next Thursday.'),
        ('b1869e34-86e4-4e8a-9293-a831440ef82c'::uuid, 8, 'chinese', '由喺我電話度，我可以畀你睇。', '有喺我電話度，我可以畀你睇。'),
        ('b1869e34-86e4-4e8a-9293-a831440ef82c'::uuid, 8, 'english', 'I can show you from my phone.', 'It''s on my phone; I can show you.'),
        ('888da798-c016-476e-afa4-85562ca08e8b'::uuid, 11, 'chinese', '去到碼頭附近有個巴士站。', '去到，碼頭附近有個巴士站。'),
        ('888da798-c016-476e-afa4-85562ca08e8b'::uuid, 11, 'english', 'There is a bus stop near the pier.', 'Yes. There''s a bus stop near the pier.'),
        ('d3019cf1-0230-45cd-989d-6d11ace8ba3e'::uuid, 5, 'chinese', '我嘅電話號碼係', '我嘅電話號碼係……'),
        ('d3019cf1-0230-45cd-989d-6d11ace8ba3e'::uuid, 5, 'pinyin', 'ngo5 ge3 din6 waa2 hou6 maa5 hai6', 'ngo5 ge3 din6 waa2 hou6 maa5 hai6...'),
        ('d3019cf1-0230-45cd-989d-6d11ace8ba3e'::uuid, 5, 'english', 'My phone number is.', 'My phone number is…'),
        ('d3019cf1-0230-45cd-989d-6d11ace8ba3e'::uuid, 7, 'chinese', '塞內唔該', '室內唔該。'),
        ('d3019cf1-0230-45cd-989d-6d11ace8ba3e'::uuid, 7, 'english', 'Reserve a table, please.', 'Indoors, please.'),
        ('d3019cf1-0230-45cd-989d-6d11ace8ba3e'::uuid, 9, 'pinyin', 'zoeng1 toi2 ngo5 dei6 zing6 hai6 wui5 bong1 bong1 nei5 lau4 sap6 ng5 fan1 zung1', 'zoeng1 toi2 ngo5 dei6 zing6 hai6 wui5 bong1 nei5 lau4 sap6 ng5 fan1 zung1'),
        ('bfcb2c7d-2c83-4a0b-bc0a-91275317dc22'::uuid, 2, 'chinese', '你係邊個仔?', '你係邊個？'),
        ('bfcb2c7d-2c83-4a0b-bc0a-91275317dc22'::uuid, 2, 'pinyin', 'nei5 hai6 bin1 go3 go3 zai2', 'nei5 hai6 bin1 go3'),
        ('cee8e1b2-f6fe-4340-a407-f72a74a5ff42'::uuid, 4, 'english', 'It started to be serious since last night, about two days ago.', 'About two days. It got worse last night.'),
        ('bfe8693e-da49-4dcf-9c79-bb5941e7d503'::uuid, 2, 'pinyin', 'gam1 jat6 sau1 gung1 zi1 cin4 jing1 goi1 jing1 goi1 gaau2 dak1 dim6', 'gam1 jat6 sau1 gung1 zi1 cin4 jing1 goi1 gaau2 dak1 dim6'),
        ('b19ebf7f-5804-4a7a-b551-6da60a5db3de'::uuid, 7, 'chinese', '好耐佢哋幫我介紹多啲客。', '後來佢哋幫我介紹多啲客。'),
        ('b19ebf7f-5804-4a7a-b551-6da60a5db3de'::uuid, 7, 'english', 'They have helped me introduce more clients for a long time.', 'Later, they helped refer more clients to me.'),
        ('b19ebf7f-5804-4a7a-b551-6da60a5db3de'::uuid, 9, 'chinese', '你可以呃我', '你可以 add 我。'),
        ('b19ebf7f-5804-4a7a-b551-6da60a5db3de'::uuid, 9, 'english', 'You can deceive me.', 'You can add me.'),
        ('b19ebf7f-5804-4a7a-b551-6da60a5db3de'::uuid, 10, 'pinyin', 'hou2 aa3 ci4 di1 dak1 haan4 lan4 ngo5 dei6 ho2 ji5 jam2 bui1 gaa3 fe1', 'hou2 aa3 ci4 di1 dak1 haan4 ngo5 dei6 ho2 ji5 jam2 bui1 gaa3 fe1'),
        ('31f8bf95-de68-4706-913d-7556e13b2dd1'::uuid, 1, 'chinese', '你未分妻係美國人定係德國人?', '你未婚妻係美國人定係德國人？'),
        ('31f8bf95-de68-4706-913d-7556e13b2dd1'::uuid, 1, 'english', 'Is your wife American or German?', 'Is your fiancée American or German?'),
        ('a408a49c-5cf8-458f-95e0-aef5151a49f4'::uuid, 0, 'english', 'I recently want to start managing my finances.', 'I''ve recently wanted to start managing my finances.'),
        ('a408a49c-5cf8-458f-95e0-aef5151a49f4'::uuid, 2, 'english', 'Yes, I’ve categorized my expenses into three categories.', 'Yes, I’ve divided my expenses into three categories.'),
        ('9c1fe67e-0a44-4ae1-a69e-1844156c1909'::uuid, 4, 'english', 'He also said my boyfriend has no future.', 'They also say my boyfriend has no future.'),
        ('9c1fe67e-0a44-4ae1-a69e-1844156c1909'::uuid, 7, 'chinese', '你可以試吓唔用指紮嘅方式', '你可以試吓唔用指責嘅方式'),
        ('9c1fe67e-0a44-4ae1-a69e-1844156c1909'::uuid, 7, 'english', 'You can try not using the bandaging method.', 'You can try not using an accusatory approach.'),
        ('f446ded4-348a-44dc-9dcb-127133e83a1d'::uuid, 3, 'chinese', '點解你會咁覺得？', '點解你會咁覺得？係唔係我做咗啲咩？'),
        ('f446ded4-348a-44dc-9dcb-127133e83a1d'::uuid, 3, 'english', 'Why do you feel that way?', 'Why do you feel that way? Is it because of something I did?'),
        ('473fa886-df2f-4817-ac88-cf4dd84f9d79'::uuid, 0, 'english', 'I enter university.', 'I got into university.'),
        ('ab4ff8de-f19e-46b0-89d0-c3c4838b3470'::uuid, 3, 'english', 'Buy a fridge online for cheaper.', 'Buying a fridge online is cheaper.'),
        ('3ceaba6e-214f-4f7b-a358-3d4386590369'::uuid, 4, 'chinese', '我覺得自己太牙燥人', '我覺得自己太亞洲人'),
        ('3ceaba6e-214f-4f7b-a358-3d4386590369'::uuid, 4, 'english', 'I think I''m too talkative.', 'I feel like I''m too Asian.'),
        ('3ceaba6e-214f-4f7b-a358-3d4386590369'::uuid, 6, 'english', 'I also feel that I am not a true Chinese.', 'I also feel like I''m not truly Chinese.'),
        ('3ceaba6e-214f-4f7b-a358-3d4386590369'::uuid, 9, 'english', 'Often feel unable to express what I truly want to say.', 'I often feel unable to express what I truly want to say.'),
        ('3ceaba6e-214f-4f7b-a358-3d4386590369'::uuid, 13, 'english', 'Understand your own racial background.', 'Understand their own ethnic background.')
    ) AS fixes(lesson_id, sentence_order, field_name, expected_value, replacement_value)
  LOOP
    UPDATE "course_library_lessons" AS lesson
    SET
      "content" = jsonb_set(
        lesson."content",
        '{sentences}',
        (
          SELECT jsonb_agg(
            CASE
              WHEN sentence ->> 'order' = correction.sentence_order::text
                AND sentence ->> correction.field_name = correction.expected_value
              THEN jsonb_set(
                sentence,
                ARRAY[correction.field_name],
                to_jsonb(correction.replacement_value::text),
                false
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
    WHERE lesson."id" = correction.lesson_id
      AND lesson."lesson_type" = 'vocal_hack_canto'
      AND jsonb_typeof(lesson."content" -> 'sentences') = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(lesson."content" -> 'sentences') AS existing(sentence)
        WHERE sentence ->> 'order' = correction.sentence_order::text
          AND sentence ->> correction.field_name = correction.expected_value
      );
  END LOOP;
END
$migration$;

-- The VideoAsk source audit confirms that these two Asking for Direction clips
-- repeat the Passing Immigration lesson's sentence 2 and sentence 9 legacy
-- transcripts. Remove only the exact misplaced rows and then close the order
-- gaps so learner progress and response numbering stay contiguous.
UPDATE "course_library_lessons" AS lesson
SET
  "content" = jsonb_set(
    lesson."content",
    '{sentences}',
    (
      SELECT jsonb_agg(
        jsonb_set(
          filtered.sentence,
          '{order}',
          to_jsonb((filtered.new_ordinal - 1)::integer),
          false
        )
        ORDER BY filtered.new_ordinal
      )
      FROM (
        SELECT
          entries.sentence,
          row_number() OVER (ORDER BY entries.original_ordinal) AS new_ordinal
        FROM jsonb_array_elements(lesson."content" -> 'sentences')
          WITH ORDINALITY AS entries(sentence, original_ordinal)
        WHERE NOT (
          (
            entries.sentence ->> 'order' = '1'
            AND entries.sentence ->> 'chinese' = '你今次嚟係做咩㗎?'
            AND entries.sentence ->> 'pinyin' = 'nei5 gam1 ci3 lei4 hai6 zou6 me1 gaa3'
            AND entries.sentence ->> 'english' = 'What are you doing here this time?'
          )
          OR
          (
            entries.sentence ->> 'order' = '8'
            AND entries.sentence ->> 'chinese' = '有喺我電話度，我可以畀你睇。'
            AND entries.sentence ->> 'pinyin' = 'jau5 hai2 ngo5 din6 waa2 dou6 ngo5 ho2 ji5 bei2 nei5 tai2'
            AND entries.sentence ->> 'english' = 'I can show you on my phone.'
          )
        )
      ) AS filtered
    ),
    false
  ),
  "updated_at" = now()
WHERE lesson."id" = '888da798-c016-476e-afa4-85562ca08e8b'
  AND lesson."lesson_type" = 'vocal_hack_canto'
  AND jsonb_typeof(lesson."content" -> 'sentences') = 'array'
  AND jsonb_array_length(lesson."content" -> 'sentences') = 12
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(lesson."content" -> 'sentences') AS existing(sentence)
    WHERE sentence ->> 'order' = '1'
      AND sentence ->> 'chinese' = '你今次嚟係做咩㗎?'
      AND sentence ->> 'pinyin' = 'nei5 gam1 ci3 lei4 hai6 zou6 me1 gaa3'
      AND sentence ->> 'english' = 'What are you doing here this time?'
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(lesson."content" -> 'sentences') AS existing(sentence)
    WHERE sentence ->> 'order' = '8'
      AND sentence ->> 'chinese' = '有喺我電話度，我可以畀你睇。'
      AND sentence ->> 'pinyin' = 'jau5 hai2 ngo5 din6 waa2 dou6 ngo5 ho2 ji5 bei2 nei5 tai2'
      AND sentence ->> 'english' = 'I can show you on my phone.'
  );

UPDATE "course_library_lessons"
SET
  "title" = 'Conversations with Your Partner (Vocal Hack)',
  "updated_at" = now()
WHERE "id" = 'f446ded4-348a-44dc-9dcb-127133e83a1d'
  AND "title" = 'Conversations with your Partner (Vocal Hack)';
