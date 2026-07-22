-- Convert the remaining audio lessons in the "CM School" modules of
-- "The Canto to Mando Blueprint - Intermediate" to Listening Practice
-- (Conversation Starters shipped separately in 0069). Titles kept.
-- Sentences from the CM School scripts (long lines split at natural
-- boundaries; trivial standalone "OK/thanks" lines and fill-in-the-blank
-- phone-number stubs omitted); pinyin auto-generated (jieba + tone sandhi,
-- one syllable per Han character); English from the scripts (tourist script
-- translated).
--
-- Idempotent + scoped: each statement only touches the still-audio lesson in
-- its matching CM School module, in that course.

-- Talking about Where You're From
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"ecf01418-327d-4430-8b7a-8197f1ac27be","order":0,"chinese":"你是哪里人？","pinyin":"nǐ shì ná lǐ rén","english":"Where are you from?","audioUrl":null},{"id":"bba93671-3799-4c81-9401-5bfd1d0049b7","order":1,"chinese":"我是上海人。你呢？","pinyin":"wǒ shì shàng hǎi rén nǐ ne","english":"I''m from Shanghai. What about you?","audioUrl":null},{"id":"62e963c7-1e21-426a-a624-c271b783118b","order":2,"chinese":"我是北京人。我刚刚搬来上海。","pinyin":"wǒ shì běi jīng rén wǒ gāng gāng bān lái shàng hǎi","english":"I''m from Beijing. I just moved to Shanghai.","audioUrl":null},{"id":"ee42ef43-0f09-4eb9-9a09-19875becda9b","order":3,"chinese":"你为什么决定搬到这里？","pinyin":"nǐ wèi shén me jué dìng bān dào zhè lǐ","english":"Why did you decide to move here?","audioUrl":null},{"id":"3a8c0625-f1e7-4577-8f20-f06fb9a14358","order":4,"chinese":"我是因为工作所以搬过来的。","pinyin":"wǒ shì yīn wèi gōng zuò suó yǐ bān guò lái de","english":"I moved here for work.","audioUrl":null},{"id":"cece2555-9a6b-43a9-b1a8-3c5714fff956","order":5,"chinese":"哦，你喜欢住在这里吗？","pinyin":"ò nǐ xǐ huan zhù zài zhè lǐ ma","english":"Oh, do you like living here?","audioUrl":null},{"id":"c4cc1c3c-02d3-4978-9487-5a8fd4264c4c","order":6,"chinese":"喜欢，我很喜欢这里，大家都很友善。","pinyin":"xǐ huan wǒ hěn xǐ huan zhè lǐ dà jiā dōu hěn yǒu shàn","english":"Yes, I like it very much. Everyone is very friendly.","audioUrl":null},{"id":"0cc8acd8-cfd8-440c-8e98-c7ca9d13a0fd","order":7,"chinese":"那就好！如果你需要帮忙，随时告诉我。","pinyin":"nà jiù hǎo rú guǒ nǐ xū yào bāng máng suí shí gào sù wǒ","english":"That''s good! Let me know if you need any help.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%where%'
      AND m."title" ILIKE '%from%'
  );

-- Talking About Your Job
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"147b5738-e9f9-4ed5-80db-3daf545eeaad","order":0,"chinese":"你是做什么工作的？","pinyin":"nǐ shì zuò shén me gōng zuò de","english":"What do you do for work?","audioUrl":null},{"id":"202cf76b-1723-428d-beb7-0a8656659d24","order":1,"chinese":"我是软件工程师，你呢？","pinyin":"wǒ shì ruǎn jiàn gōng chéng shī nǐ ne","english":"I''m a software engineer. What about you?","audioUrl":null},{"id":"efdd718a-a937-4e7f-b13c-dd915b1662df","order":2,"chinese":"我是做市场营销的。你通常做哪一方面的软件？","pinyin":"wǒ shì zuò shì chǎng yíng xiāo de nǐ tōng cháng zuò nǎ yì fāng miàn de ruǎn jiàn","english":"I work in marketing. What kind of software do you usually work on?","audioUrl":null},{"id":"f258c2f2-a881-41eb-9830-a78b088e49da","order":3,"chinese":"我专门开发手机应用。","pinyin":"wǒ zhuān mén kāi fā shǒu jī yìng yòng","english":"I specialize in developing mobile applications.","audioUrl":null},{"id":"06a5aab7-6234-4ea9-98fe-546b014d61e7","order":4,"chinese":"你呢？你在哪一家公司做营销？","pinyin":"nǐ ne nǐ zài nǎ yì jiā gōng sī zuò yíng xiāo","english":"What about you? Which company do you work for in marketing?","audioUrl":null},{"id":"d14d35a8-caa1-460d-8dba-39e1d324b09a","order":5,"chinese":"我是自由工作者。","pinyin":"wǒ shì zì yóu gōng zuò zhě","english":"I''m a freelancer.","audioUrl":null},{"id":"6bf443f7-5093-4fcb-a60c-131a1e94d86b","order":6,"chinese":"那你通常跟什么客户合作？","pinyin":"nà nǐ tōng cháng gēn shén me kè hù hé zuò","english":"Who are your usual clients?","audioUrl":null},{"id":"b1dd15d5-313f-41f9-976b-80037790167c","order":7,"chinese":"大部分是初创公司和小型企业。","pinyin":"dà bù fen shì chū chuàng gōng sī hé xiǎo xíng qǐ yè","english":"Mostly startups and small businesses.","audioUrl":null},{"id":"eb23089f-26ce-436d-9d21-2b612a1d35ab","order":8,"chinese":"对了，你在哪里上班？","pinyin":"duì le nǐ zài ná lǐ shàng bān","english":"By the way, where is your office?","audioUrl":null},{"id":"88e6d32e-1157-4c99-97a5-5ecf1a514082","order":9,"chinese":"我的办公室在上海的静安区。你呢？","pinyin":"wǒ de bàn gōng shì zài shàng hǎi de jìng ān qū nǐ ne","english":"My office is in Jing''an District, Shanghai. What about you?","audioUrl":null},{"id":"87671baf-d2ff-45cd-beba-7a50a86f8cf3","order":10,"chinese":"我通常在家上班。","pinyin":"wǒ tōng cháng zài jiā shàng bān","english":"I usually work from home.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%job%'
  );

-- Talking About Hobbies
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"24606c8b-6288-4b84-9a9e-75919d6e2c52","order":0,"chinese":"除了羽毛球之外，你有什么兴趣？","pinyin":"chú le yǔ máo qiú zhī wài nǐ yǒu shén me xìng qù","english":"Besides badminton, what are your hobbies?","audioUrl":null},{"id":"5f9a0a1b-e64b-4d09-9111-9197da900cdf","order":1,"chinese":"我喜欢看书和爬山。","pinyin":"wǒ xǐ huan kàn shū hé pá shān","english":"I like reading and hiking.","audioUrl":null},{"id":"34a78a48-2076-434e-9094-3006d2d5e31b","order":2,"chinese":"你呢？你平时喜欢做什么？","pinyin":"nǐ ne nǐ píng shí xǐ huan zuò shén me","english":"What about you? What do you like to do in your free time?","audioUrl":null},{"id":"20476a53-efa8-42b5-8d39-c6651fe51515","order":3,"chinese":"我喜欢跑步和打游戏。你喜欢运动吗？","pinyin":"wǒ xǐ huan pǎo bù hé dǎ yóu xì nǐ xǐ huan yùn dòng ma","english":"I like running and playing video games. Do you like sports?","audioUrl":null},{"id":"bc3a8e6e-4d5e-4329-845d-bc14d2e8a643","order":4,"chinese":"我有时候会去健身房，但我不太擅长做运动。","pinyin":"wǒ yǒu shí hòu huì qù jiàn shēn fáng dàn wǒ bù tài shàn cháng zuò yùn dòng","english":"I sometimes go to the gym, but I''m not very good at sports.","audioUrl":null},{"id":"a3f0b943-6939-4999-813f-e9db87b2e268","order":5,"chinese":"没关系！你喜欢看什么类型的书？","pinyin":"méi guān xì nǐ xǐ huan kàn shén me lèi xíng de shū","english":"That''s okay! What kind of books do you like to read?","audioUrl":null},{"id":"55a511a0-4aa7-4065-a7bc-89c5ee2f4c33","order":6,"chinese":"我喜欢看科幻小说。","pinyin":"wǒ xǐ huan kàn kē huàn xiǎo shuō","english":"I like reading science fiction novels.","audioUrl":null},{"id":"90d25f56-9de6-481b-bed3-9866702daba9","order":7,"chinese":"那你喜欢玩什么类型的游戏？","pinyin":"nà nǐ xǐ huan wán shén me lèi xíng de yóu xì","english":"What kind of games do you like to play?","audioUrl":null},{"id":"fbe451c1-7836-4b8c-8634-a3ff6672e54c","order":8,"chinese":"我喜欢玩有剧情的冒险游戏。","pinyin":"wǒ xǐ huan wán yǒu jù qíng de mào xiǎn yóu xì","english":"I like playing story-driven adventure games.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%hobb%'
  );

-- Making Plans
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"efa02230-235d-4e4e-8156-c274592557e5","order":0,"chinese":"你有爬过山吗？","pinyin":"nǐ yǒu pá guò shān ma","english":"Have you ever been hiking?","audioUrl":null},{"id":"2656ea70-bc94-496d-a7ce-82350fd806d5","order":1,"chinese":"还没，但我一直想去。你有兴趣一起爬山吗？","pinyin":"hái méi dàn wǒ yì zhí xiǎng qù nǐ yǒu xìng qù yì qǐ pá shān ma","english":"Not yet, but I''ve always wanted to. Are you interested in going hiking together?","audioUrl":null},{"id":"0e3b9df4-9cb8-44fd-ac14-05e3ba856dac","order":2,"chinese":"当然有！你有想去的地方吗？","pinyin":"dāng rán yǒu nǐ yǒu xiǎng qù de dì fāng ma","english":"Of course! Do you have a place in mind?","audioUrl":null},{"id":"6e2762b7-88ef-4a81-8418-9dfd1e3af359","order":3,"chinese":"我都可以，看你。","pinyin":"wǒ dōu ké yǐ kàn nǐ","english":"I''m good with anything. It''s up to you.","audioUrl":null},{"id":"72877ef2-5227-48ab-a1eb-f98457f92f0e","order":4,"chinese":"那我决定好了。你什么时候有空？","pinyin":"nà wǒ jué dìng hǎo le nǐ shén me shí hòu yǒu kōng","english":"Then I''ll decide. When are you free?","audioUrl":null},{"id":"f8a80096-fd8c-44a6-b9dc-a32191b13405","order":5,"chinese":"下星期六好吗？","pinyin":"xià xīng qī liù hǎo ma","english":"How about next Saturday?","audioUrl":null},{"id":"6bdbd405-6463-491e-9e3c-63d16f36db77","order":6,"chinese":"我下星期六约了朋友。星期天怎么样？","pinyin":"wǒ xià xīng qī liù yuē le péng yǒu xīng qī tiān zěn me yàng","english":"I''ve already made plans with friends next Saturday. How about Sunday?","audioUrl":null},{"id":"2bba4986-235a-42a0-8d76-c08cc5e0429d","order":7,"chinese":"好啊。我们几点见面？","pinyin":"hǎo a wǒ men jí diǎn jiàn miàn","english":"Sure! What time should we meet?","audioUrl":null},{"id":"b65e34e5-6be4-4c4d-b5e7-58433fc6bf65","order":8,"chinese":"我早上九点开车来接你。","pinyin":"wǒ zǎo shàng jiú diǎn kāi chē lái jiē nǐ","english":"I''ll drive to pick you up at 9 AM.","audioUrl":null},{"id":"9ea63f82-33c7-4a72-95a2-ca66b49e7cc7","order":9,"chinese":"太好了！我很期待。","pinyin":"tài hǎo le wǒ hěn qī dài","english":"That''s great! I''m really looking forward to it.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%plan%'
  );

-- Catching up with Friends
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"dd6e93b6-9fa3-4ed9-aaa0-cbd2f843b0a9","order":0,"chinese":"好久不见！你最近怎么样？","pinyin":"háo jiǔ bú jiàn nǐ zuì jìn zěn me yàng","english":"Long time no see! How have you been?","audioUrl":null},{"id":"8a508c2c-32b6-4c27-affe-a0afe4e9e475","order":1,"chinese":"我因为生了孩子所以辞职了。","pinyin":"wǒ yīn wèi shēng le hái zi suó yǐ cí zhí le","english":"I quit my job because I had a baby.","audioUrl":null},{"id":"03177d31-c01d-4bec-9094-2589c1dd4351","order":2,"chinese":"当妈妈有点忙。你呢？","pinyin":"dāng mā ma yóu diǎn máng nǐ ne","english":"Being a mom is keeping me busy. What about you?","audioUrl":null},{"id":"9b61b1cf-43ec-4d24-b431-21b34363173a","order":3,"chinese":"恭喜！我还是老样子，在同一家公司工作。","pinyin":"gōng xǐ wǒ hái shì lǎo yàng zi zài tóng yì jiā gōng sī gōng zuò","english":"Congratulations! I''m still the same, working at the same company.","audioUrl":null},{"id":"2218cf36-70a1-49ce-9b17-1650d2f3414f","order":4,"chinese":"工作稳定很好啊。那你有旅行的计划吗？","pinyin":"gōng zuò wěn dìng hěn hǎo a nà nǐ yǒu lǚ xíng de jì huà ma","english":"A stable job is great! Do you have any travel plans?","audioUrl":null},{"id":"72dcc61d-2fb7-43a1-a05a-29637442c992","order":5,"chinese":"我圣诞节会回家看看我爸妈。","pinyin":"wǒ shèng dàn jié huì huí jiā kàn kàn wǒ bà mā","english":"I''ll visit my parents during Christmas.","audioUrl":null},{"id":"28442903-d26b-4e02-852f-1686d4e6d038","order":6,"chinese":"你呢？最近有什么有趣的经历吗？","pinyin":"nǐ ne zuì jìn yǒu shén me yǒu qù de jīng lì ma","english":"What about you? Had any interesting experiences lately?","audioUrl":null},{"id":"bd90f075-0031-4873-a88e-d77cdae5eb9d","order":7,"chinese":"我上个礼拜碰到我们的共同朋友 Jenny！","pinyin":"wǒ shàng gè lǐ bài pèng dào wǒ men de gòng tóng péng yǒu","english":"I ran into our mutual friend Jenny last week!","audioUrl":null},{"id":"25ced0a8-ff9a-4745-a0e4-cd09ad4cae0c","order":8,"chinese":"我们应该找时间出来见面。","pinyin":"wǒ men yīng gāi zhǎo shí jiān chū lái jiàn miàn","english":"We should find time to meet up.","audioUrl":null},{"id":"acb7ee91-3bae-499c-a20c-e2f3f0819c2e","order":9,"chinese":"好啊！你发短信给我，我们安排一下。","pinyin":"hǎo a nǐ fā duǎn xìn gěi wǒ wǒ men ān pái yí xià","english":"Sounds great! Send me a text, and we''ll plan something.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%catching up%'
  );

-- Introducing Yourself as a Tourist
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"67c924c2-4de6-4db6-be86-b246004ccda2","order":0,"chinese":"你好，我是来自美国的游客。","pinyin":"ní hǎo wǒ shì lái zì měi guó de yóu kè","english":"Hello, I''m a tourist from the United States.","audioUrl":null},{"id":"1b86d639-1bb0-4b5a-8972-acb4b4194897","order":1,"chinese":"你好！欢迎来到中国。你们在这里有什么计划？","pinyin":"ní hǎo huān yíng lái dào zhōng guó nǐ men zài zhè lǐ yǒu shén me jì huà","english":"Hello! Welcome to China. What are your plans while you''re here?","audioUrl":null},{"id":"57a9babb-a64e-4f6e-8cc2-41e82c1207f9","order":2,"chinese":"我们打算去北京和上海玩。","pinyin":"wǒ men dǎ suàn qù běi jīng hé shàng hǎi wán","english":"We''re planning to visit Beijing and Shanghai.","audioUrl":null},{"id":"3d049b52-bffc-4211-89c5-f66528c6bc28","order":3,"chinese":"听起来不错！你们需要旅游建议吗？","pinyin":"tīng qǐ lái bú cuò nǐ men xū yào lǚ yóu jiàn yì ma","english":"Sounds great! Do you need any travel tips?","audioUrl":null},{"id":"93116ee5-769b-49d9-a3be-dca96cb0e56b","order":4,"chinese":"当然需要，我们想知道一些当地的美食推荐。","pinyin":"dāng rán xū yào wǒ men xiǎng zhī dào yì xiē dāng dì de měi shí tuī jiàn","english":"Of course — we''d love some local food recommendations.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%tourist%'
  );

-- Passing Immigration
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"1f3b158c-982e-4374-8161-a30449e83a58","order":0,"chinese":"你好，请出示你的护照和入境卡。","pinyin":"ní hǎo qǐng chū shì nǐ de hù zhào hé rù jìng kǎ","english":"Hello, please show your passport and entry card.","audioUrl":null},{"id":"822c6d29-5cb2-437a-ae1d-c84056a990ce","order":1,"chinese":"好的，给你。","pinyin":"hǎo de gěi nǐ","english":"Okay, here you go.","audioUrl":null},{"id":"ffc71937-12b2-4f93-902b-7c782a020f06","order":2,"chinese":"请摘下帽子和眼镜，看着这里不要动。","pinyin":"qǐng zhāi xià mào zi hé yǎn jìng kàn zhe zhè lǐ bú yào dòng","english":"Please take off your hat and glasses, look here and don''t move.","audioUrl":null},{"id":"ddd307f7-8458-4597-b39f-d7737fff995d","order":3,"chinese":"你来这里的目的是什么？","pinyin":"nǐ lái zhè lǐ de mù dì shì shén me","english":"What is the purpose of your visit?","audioUrl":null},{"id":"6ef10273-c3c0-42df-8905-3a4ba41201e5","order":4,"chinese":"我来旅游。","pinyin":"wǒ lái lǚ yóu","english":"I am here for tourism.","audioUrl":null},{"id":"14049e60-63fa-41b5-820c-f5b65fce9455","order":5,"chinese":"你打算留多久？","pinyin":"nǐ dǎ suàn liú duō jiǔ","english":"How long do you plan to stay?","audioUrl":null},{"id":"f934f64d-c858-43a7-b2c1-f8ab3905d2be","order":6,"chinese":"一个星期。","pinyin":"yí gè xīng qī","english":"One week.","audioUrl":null},{"id":"3160a4f9-66b1-442c-a946-82df55d11be3","order":7,"chinese":"好的，欢迎来到中国，祝你旅途愉快！","pinyin":"hǎo de huān yíng lái dào zhōng guó zhù nǐ lǚ tú yú kuài","english":"Okay, welcome to China, have a pleasant trip!","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%immigration%'
  );

-- Checking in at the Hotel
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"899d8ba5-f491-4b0d-9524-4818b77dca77","order":0,"chinese":"您好，欢迎光临，请问有预订吗？","pinyin":"nín hǎo huān yíng guāng lín qǐng wèn yǒu yù dìng ma","english":"Hello, welcome, do you have a reservation?","audioUrl":null},{"id":"36927185-c2ab-4474-9318-643a3131de6a","order":1,"chinese":"有的，我姓王，预订了一间房。","pinyin":"yǒu de wǒ xìng wáng yù dìng le yì jiān fáng","english":"Yes, I have. My last name is Wang, I reserved a room.","audioUrl":null},{"id":"9d07bffd-cbab-4f93-9280-e056b787f8e1","order":2,"chinese":"没问题，现在帮您办理入住手续。","pinyin":"méi wèn tí xiàn zài bāng nín bàn lǐ rù zhù shǒu xù","english":"No problem, let me help you with the check-in process.","audioUrl":null},{"id":"3eb97edb-088a-4990-8a99-9ffeb968fd56","order":3,"chinese":"请给我所有住客的护照。","pinyin":"qǐng gěi wǒ suó yǒu zhù kè de hù zhào","english":"Please give me all guests'' passports.","audioUrl":null},{"id":"ddd4529b-6308-4462-9f97-01478c18fb2f","order":4,"chinese":"王小姐，您预订了一个双人间。","pinyin":"wáng xiáo jiě nín yù dìng le yí gè shuāng rén jiān","english":"Miss Wang, you booked a double room.","audioUrl":null},{"id":"71ccc159-d445-41e2-a499-80b6bb556f22","order":5,"chinese":"这是您的房卡，您住503号房。","pinyin":"zhè shì nín de fáng kǎ nín zhù hào fáng","english":"This is your room key; you''re in room 503.","audioUrl":null},{"id":"f3f6bca5-e0a5-4294-954a-f88b8d40a7ee","order":6,"chinese":"谢谢！请问早餐什么时候开始供应？","pinyin":"xiè xiè qǐng wèn zǎo cān shén me shí hòu kāi shǐ gōng yìng","english":"Thank you! When does breakfast start?","audioUrl":null},{"id":"ca327059-b552-4e09-a3df-de730e199c80","order":7,"chinese":"早餐的供应时间是早上七点到十点。","pinyin":"zǎo cān de gōng yìng shí jiān shì zǎo shàng qī diǎn dào shí diǎn","english":"Breakfast is served from 7 to 10 a.m.","audioUrl":null},{"id":"bcd7d89e-8eda-4dc0-a09f-1b958cda515a","order":8,"chinese":"餐厅在一楼。如果有任何需要，随时联系前台。","pinyin":"cān tīng zài yī lóu rú guǒ yǒu rèn hé xū yào suí shí lián xì qián tái","english":"The restaurant is on the first floor. If you need anything, feel free to contact the front desk.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%hotel%'
  );

-- Asking for Directions
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"18e6c164-7d61-4cec-9301-01fcdd820e2b","order":0,"chinese":"你好，请问最近的地铁站怎么走？","pinyin":"ní hǎo qǐng wèn zuì jìn de dì tiě zhàn zěn me zǒu","english":"Hello, can you tell me how to get to the nearest subway station?","audioUrl":null},{"id":"6b97a9b3-474b-4966-9cfb-11c0aecc758e","order":1,"chinese":"你一直往前走，到第二个路口右转。","pinyin":"nǐ yì zhí wǎng qián zǒu dào dì èr gè lù kǒu yòu zhuǎn","english":"Keep going straight, and turn right at the second intersection.","audioUrl":null},{"id":"35e73527-6f05-4f43-ae63-f588c3ec0e43","order":2,"chinese":"就会看到图书馆。图书馆对面就是地铁站了。","pinyin":"jiù huì kàn dào tú shū guǎn tú shū guǎn duì miàn jiù shì dì tiě zhàn le","english":"You''ll see the library. The subway station is opposite the library.","audioUrl":null},{"id":"c484977a-2797-4618-9d91-66b1658fa53a","order":3,"chinese":"你知道要走多久吗？","pinyin":"nǐ zhī dào yào zǒu duō jiǔ ma","english":"Do you know how long it will take to get there?","audioUrl":null},{"id":"756a9cce-4737-4ed2-a788-43aa0398871a","order":4,"chinese":"大概五分钟就到了。","pinyin":"dà gài wǔ fēn zhōng jiù dào le","english":"It should take about five minutes.","audioUrl":null},{"id":"d3c9bdf0-d348-4c4b-b182-018d1d878a87","order":5,"chinese":"不客气，祝你旅途愉快！","pinyin":"bù kè qì zhù nǐ lǚ tú yú kuài","english":"You''re welcome, have a nice trip!","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%direction%'
  );

-- Booking a Taxi
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"bfdea08e-4796-4f00-8e9a-454de6a9e53d","order":0,"chinese":"你好，我想预定一辆到市中心的出租车。","pinyin":"ní hǎo wǒ xiǎng yù dìng yí liàng dào shì zhōng xīn de chū zū chē","english":"Hello, I''d like to book a taxi to the city center.","audioUrl":null},{"id":"f80f0243-72e6-47ff-b05d-98e2c95d589b","order":1,"chinese":"好的，请告诉我你的位置和电话号码。","pinyin":"hǎo de qǐng gào sù wǒ nǐ de wèi zhì hé diàn huà hào mǎ","english":"Okay, please tell me your location and contact number.","audioUrl":null},{"id":"d10d088c-2691-4796-bda8-09fa3503627f","order":2,"chinese":"我现在在机场的到达大厅。","pinyin":"wǒ xiàn zài zài jī chǎng de dào dá dà tīng","english":"I''m currently at the airport arrival hall.","audioUrl":null},{"id":"c7693f6c-f8d9-407c-bba1-ef61e58f107f","order":3,"chinese":"好的，车子会在十分钟内到达。","pinyin":"hǎo de chē zi huì zài shí fēn zhōng nèi dào dá","english":"Okay, the car will arrive within 10 minutes.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%booking%'
      AND m."title" ILIKE '%taxi%'
  );

-- Talking to the Taxi Driver
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"b2a71d07-d2f7-446e-93b9-1944c48f3f6c","order":0,"chinese":"你好，请问你要去市中心哪里？","pinyin":"ní hǎo qǐng wèn nǐ yào qù shì zhōng xīn ná lǐ","english":"Hello, where in the city center are you going?","audioUrl":null},{"id":"64a81b6b-d1ad-40cb-91aa-5dbe18334851","order":1,"chinese":"四季酒店。","pinyin":"sì jì jiǔ diàn","english":"Four Seasons Hotel.","audioUrl":null},{"id":"f45f9ae8-affb-4471-aa44-252d3ba61e0a","order":2,"chinese":"现在是繁忙时间，可能有点堵车。","pinyin":"xiàn zài shì fán máng shí jiān kě néng yóu diǎn dǔ chē","english":"It''s rush hour now, there might be some traffic.","audioUrl":null},{"id":"c7aa6ab8-11ba-4821-b202-2127bfc1dcb9","order":3,"chinese":"没关系，我不赶时间。","pinyin":"méi guān xì wǒ bù gǎn shí jiān","english":"That''s okay, I''m not in a hurry.","audioUrl":null},{"id":"d0632a7d-772c-43ea-8518-bda024b8f653","order":4,"chinese":"好。请系好安全带。","pinyin":"hǎo qǐng xì hǎo ān quán dài","english":"Alright. Please fasten your seatbelt.","audioUrl":null},{"id":"62213526-ddda-4938-8c05-22832cb540ec","order":5,"chinese":"知道了。这里有什么好玩的地方可以推荐吗？","pinyin":"zhī dào le zhè lǐ yǒu shén me hǎo wán de dì fāng ké yǐ tuī jiàn ma","english":"Got it. Are there any fun places around here that you can recommend?","audioUrl":null},{"id":"15b8d081-f215-483c-b6c1-efe4fae43b8e","order":6,"chinese":"当然，市中心有一个不错的博物馆。","pinyin":"dāng rán shì zhōng xīn yǒu yí gè bú cuò de bó wù guǎn","english":"Of course, there''s a nice museum in the city center.","audioUrl":null},{"id":"27d03b24-73a1-4379-a3bc-b31da1cc2050","order":7,"chinese":"还有一个很大的购物中心。","pinyin":"hái yǒu yí gè hěn dà de gòu wù zhōng xīn","english":"There''s also a very big shopping mall.","audioUrl":null},{"id":"a4e06d6a-2e47-433a-bcbb-7b608a83a392","order":8,"chinese":"另外，晚上可以去河边散步，风景很美。","pinyin":"lìng wài wǎn shàng ké yǐ qù hé biān sàn bù fēng jǐng hěn měi","english":"Also, you can take a walk by the river in the evening; the scenery is beautiful.","audioUrl":null},{"id":"8522e27e-2e9a-4282-a491-2eb3fbee5da4","order":9,"chinese":"听起来不错，谢谢你的建议。","pinyin":"tīng qǐ lái bú cuò xiè xiè nǐ de jiàn yì","english":"Sounds great, thank you for the suggestion.","audioUrl":null},{"id":"26025937-b256-4574-bc4d-fad955dd9ec8","order":10,"chinese":"不客气。酒店到了，五十六块。","pinyin":"bù kè qì jiǔ diàn dào le wǔ shí liù kuài","english":"You''re welcome. We''ve arrived at the hotel; that''ll be 56 yuan.","audioUrl":null},{"id":"b62e77c6-f392-4d8e-8ac4-07c37342d6cc","order":11,"chinese":"给你六十，不用找了。有发票吗？","pinyin":"gěi nǐ liù shí bú yòng zhǎo le yǒu fā piào ma","english":"Here''s 60, keep the change. Do you have a receipt?","audioUrl":null},{"id":"1d72215b-14cd-4d75-9236-ab19b9a431d0","order":12,"chinese":"有。别忘了你的行李。","pinyin":"yǒu bié wàng le nǐ de xíng li","english":"Yes, I do. Don''t forget your luggage.","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%taxi driver%'
  );

-- Renting a Bike
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"0c8eace3-c038-4165-931f-3cf239ba643a","order":0,"chinese":"你好，请问怎么租借自行车？","pinyin":"ní hǎo qǐng wèn zěn me zū jiè zì xíng chē","english":"Hello, how do I rent a bicycle?","audioUrl":null},{"id":"180dc792-a29c-4267-8dd0-83743880fd20","order":1,"chinese":"您好，我们有两种租法。","pinyin":"nín hǎo wǒ men yǒu liáng zhǒng zū fǎ","english":"Hello, we offer two rental options.","audioUrl":null},{"id":"68661852-8335-4516-b463-a7fc0cdeee3b","order":2,"chinese":"可以按小时付费，也可以按天付费。","pinyin":"ké yǐ àn xiǎo shí fù fèi yě ké yǐ àn tiān fù fèi","english":"You can pay by the hour or by the day.","audioUrl":null},{"id":"c8ebcbe0-d1df-4d3e-ac67-cb2225f574db","order":3,"chinese":"租金分别是多少？","pinyin":"zū jīn fēn bié shì duō shǎo","english":"What are the respective rental fees?","audioUrl":null},{"id":"a489f952-d8a9-4c35-bd55-e0eaa58eedcd","order":4,"chinese":"时租是每小时20元，日租是每天100元。","pinyin":"shí zū shì měi xiǎo shí yuán rì zū shì měi tiān yuán","english":"Hourly rental is 20 yuan per hour, and daily rental is 100 yuan per day.","audioUrl":null},{"id":"f1b66d79-882d-4b6b-9f94-1a5e316f675c","order":5,"chinese":"需要先付押金吗？","pinyin":"xū yào xiān fù yā jīn ma","english":"Do I need to pay a deposit first?","audioUrl":null},{"id":"de972d63-ffc0-4438-9ba9-9652cc09d97c","order":6,"chinese":"是的，需要先付押金。还车的时候会全额退还。","pinyin":"shì de xū yào xiān fù yā jīn hái chē de shí hòu huì quán é tuì huán","english":"Yes, you need to pay a deposit first. It will be fully refunded when you return the bike.","audioUrl":null},{"id":"d5a668bb-a5d7-4096-a700-e07c219655af","order":7,"chinese":"好的，有防盗锁吗？","pinyin":"hǎo de yǒu fáng dào suǒ ma","english":"Alright, is there an anti-theft lock as well?","audioUrl":null},{"id":"85fab609-4c30-4c0e-af58-7cb338ddd960","order":8,"chinese":"有的，我们会提供一个防盗锁，您可以放心使用。","pinyin":"yǒu de wǒ men huì tí gōng yí gè fáng dào suǒ nín ké yǐ fàng xīn shǐ yòng","english":"Yes, we provide an anti-theft lock, so you can use it without worry.","audioUrl":null},{"id":"fadb1841-1c78-4658-9c77-adf19b50955d","order":9,"chinese":"好，那我租四个小时，谢谢！","pinyin":"hǎo nà wǒ zū sì gè xiǎo shí xiè xiè","english":"Great, I''ll rent it for four hours. Thank you!","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%bike%'
  );

-- Making a Reservation
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"b0c089f7-61e8-4112-a746-cb73bfe4c3a9","order":0,"chinese":"您好，欢迎致电本店！请问有什么可以帮您？","pinyin":"nín hǎo huān yíng zhì diàn běn diàn qǐng wèn yǒu shén me ké yǐ bāng nín","english":"Hello, thank you for calling our restaurant! How can I assist you?","audioUrl":null},{"id":"a5b51bbf-4061-4051-ba53-77116e8eaaba","order":1,"chinese":"你好，我想订位。","pinyin":"ní hǎo wǒ xiǎng dìng wèi","english":"Hello, I would like to make a reservation.","audioUrl":null},{"id":"084d37ef-3ad5-43ba-b4a5-40a732ee1f1e","order":2,"chinese":"请问几位？","pinyin":"qǐng wèn jǐ wèi","english":"How many people?","audioUrl":null},{"id":"e8d620a0-d1e6-45a9-ac91-e482e4273f32","order":3,"chinese":"我们一共四个人。","pinyin":"wǒ men yí gòng sì gè rén","english":"There are four of us.","audioUrl":null},{"id":"0c223c9d-8cc5-4aaa-a913-fb5eb423b467","order":4,"chinese":"请问明天晚上七点有桌子吗？","pinyin":"qǐng wèn míng tiān wǎn shàng qī diǎn yǒu zhuō zi ma","english":"Is there a table available at 7 PM tomorrow?","audioUrl":null},{"id":"2245e37e-10ba-427a-a590-4d71d8c2b8e8","order":5,"chinese":"好的，请稍等，我帮您看一下。","pinyin":"hǎo de qǐng shāo děng wǒ bāng nín kàn yí xià","english":"Sure, please hold on while I check.","audioUrl":null},{"id":"b9071118-ad0d-460a-9c24-67687b0d97f4","order":6,"chinese":"明天晚上七点有桌子。请问您贵姓？","pinyin":"míng tiān wǎn shàng qī diǎn yǒu zhuō zi qǐng wèn nín guì xìng","english":"There is a table available at 7 PM tomorrow. May I have your last name?","audioUrl":null},{"id":"fa14a9e0-63c7-45a4-a395-7f204058340c","order":7,"chinese":"我姓王。","pinyin":"wǒ xìng wáng","english":"My last name is Wang.","audioUrl":null},{"id":"8563af04-e74b-4ad5-bdb3-bf67e6c68fea","order":8,"chinese":"请问王先生的电话号码是什么？","pinyin":"qǐng wèn wáng xiān shēng de diàn huà hào mǎ shì shén me","english":"May I have your phone number, Mr. Wang?","audioUrl":null},{"id":"99dc93be-858b-4e1c-b832-fe7ed90df388","order":9,"chinese":"我的电话号码是1234-5678。","pinyin":"wǒ de diàn huà hào mǎ shì","english":"My phone number is 1234-5678.","audioUrl":null},{"id":"6aaa2a92-dec2-40c3-a630-5e2565524884","order":10,"chinese":"好的，王先生，已经帮您订好了。","pinyin":"hǎo de wáng xiān shēng yǐ jīng bāng nín dìng hǎo le","english":"Alright, Mr. Wang, your reservation is confirmed.","audioUrl":null},{"id":"82931b2f-df06-4772-a159-c63b1db33887","order":11,"chinese":"谢谢！明天见。","pinyin":"xiè xiè míng tiān jiàn","english":"Thank you! See you tomorrow.","audioUrl":null},{"id":"6d27e162-4306-4927-8fa4-a43c5720cf2d","order":12,"chinese":"不客气，明天见！","pinyin":"bù kè qì míng tiān jiàn","english":"You''re welcome, see you tomorrow!","audioUrl":null}]}'::jsonb,
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
      AND m."title" ILIKE '%reservation%'
  );
