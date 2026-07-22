-- Convert the audio lesson in the "CM School: Conversation Starters" module
-- of "The Canto to Mando Blueprint - Intermediate" to Listening Practice,
-- keeping its title. Sentences come from the CM School script; pinyin is
-- auto-generated with the app's aligned pipeline (jieba + tone sandhi, one
-- syllable per Han character); English is the script's translation.
--
-- First of the CM School conversions — shipped alone for review before the
-- remaining modules are converted.
--
-- Idempotent + scoped: only the still-audio lesson in that module, in that
-- course.

UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"215d60a8-99cf-40d1-bbe6-a802269ea86e","order":0,"chinese":"你好，我叫 John。你叫什么名字？","pinyin":"ní hǎo wǒ jiào nǐ jiào shén me míng zì","english":"Hello, my name is John. What''s your name?","audioUrl":null},{"id":"497c38b5-a900-49a3-866e-71c252f9f66b","order":1,"chinese":"我叫 Sarah。你是不是第一次来这里打羽毛球？","pinyin":"wǒ jiào nǐ shì bu shì dì yī cì lái zhè lǐ dǎ yǔ máo qiú","english":"My name is Sarah. Is this your first time playing badminton here?","audioUrl":null},{"id":"0fe9590d-12d6-4962-a164-60db26d9b7b5","order":2,"chinese":"对呀。你常来吗？","pinyin":"duì ya nǐ cháng lái ma","english":"Yes. Do you come here often?","audioUrl":null},{"id":"9550fa3e-0b0c-4fdf-9cce-f780bb87ec70","order":3,"chinese":"算是吧，我跟朋友每个星期都会来。","pinyin":"suàn shì ba wǒ gēn péng yǒu měi gè xīng qī dōu huì lái","english":"Kind of. My friends and I come here every week.","audioUrl":null},{"id":"4491b35c-c051-4067-94fe-ccc6b29b200e","order":4,"chinese":"难怪你打得这么厉害。","pinyin":"nán guài nǐ dǎ dé zhè me lì hài","english":"No wonder you play so well.","audioUrl":null},{"id":"9d4f3c00-9930-44c1-8cba-e75e0a06d446","order":5,"chinese":"谢谢！你也打得不错。","pinyin":"xiè xiè nǐ yě dǎ dé bú cuò","english":"Thank you! You''re pretty good too.","audioUrl":null}]}'::jsonb,
    "updated_at" = now()
WHERE l."lesson_type" = 'audio'
  AND l."deleted_at" IS NULL
  AND l."module_id" IN (
    SELECT m."id"
    FROM "course_library_modules" m
    JOIN "course_library_courses" c ON c."id" = m."course_id"
    WHERE m."deleted_at" IS NULL
      AND c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - intermediate'
      AND m."title" ILIKE '%cm school%'
      AND m."title" ILIKE '%conversation%starter%'
  );
