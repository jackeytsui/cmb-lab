-- Convert the two audio lessons in the "CM School: Getting a cab" module of
-- "The Canto to Mando Blueprint - Intermediate" to Listening Practice.
-- Migration 0070 missed them: it matched modules by roadmap names
-- ("Booking a Taxi" / "Talking to the Taxi Driver"), but on the site both
-- scripts live as two lessons inside one module titled "Getting a cab".
-- Same content decisions as 0070; the two lessons are told apart by their
-- lesson titles. Idempotent: only lessons still typed 'audio'.

-- Booking a Taxi (4 sentences)
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"16a15519-287c-4ca5-b34e-bd3fadc61ecd","order":0,"chinese":"你好，我想预定一辆到市中心的出租车。","pinyin":"ní hǎo wǒ xiǎng yù dìng yí liàng dào shì zhōng xīn de chū zū chē","english":"Hello, I''d like to book a taxi to the city center.","audioUrl":null},{"id":"4b052d30-9d14-4f4a-a66f-5e21cdddbb35","order":1,"chinese":"好的，请告诉我你的位置和电话号码。","pinyin":"hǎo de qǐng gào sù wǒ nǐ de wèi zhì hé diàn huà hào mǎ","english":"Okay, please tell me your location and contact number.","audioUrl":null},{"id":"8da3219f-5af4-48da-833e-f57c74c12033","order":2,"chinese":"我现在在机场的到达大厅。","pinyin":"wǒ xiàn zài zài jī chǎng de dào dá dà tīng","english":"I''m currently at the airport arrival hall.","audioUrl":null},{"id":"81102efa-1061-47b4-be3b-96dc31c5a923","order":3,"chinese":"好的，车子会在十分钟内到达。","pinyin":"hǎo de chē zi huì zài shí fēn zhōng nèi dào dá","english":"Okay, the car will arrive within 10 minutes.","audioUrl":null}]}'::jsonb,
    "updated_at" = now()
WHERE l."lesson_type" = 'audio'
  AND l."deleted_at" IS NULL
  AND l."title" ILIKE '%booking%taxi%'
  AND l."module_id" IN (
    SELECT m."id"
    FROM "course_library_modules" m
    JOIN "course_library_courses" c ON c."id" = m."course_id"
    WHERE m."deleted_at" IS NULL
      AND c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - intermediate'
      AND m."title" ILIKE '%getting a cab%'
  );

-- Talking to the Taxi Driver (13 sentences)
UPDATE "course_library_lessons" AS l
SET "lesson_type" = 'listening_practice',
    "content" = '{"description":"Listen to each sentence and type what you hear.","sentences":[{"id":"2b4ca0da-6f18-4e8e-a2cd-13ed4f14ae3f","order":0,"chinese":"你好，请问你要去市中心哪里？","pinyin":"ní hǎo qǐng wèn nǐ yào qù shì zhōng xīn ná lǐ","english":"Hello, where in the city center are you going?","audioUrl":null},{"id":"d4f455c8-24cc-43e1-b7c1-f8c8231dc40b","order":1,"chinese":"四季酒店。","pinyin":"sì jì jiǔ diàn","english":"Four Seasons Hotel.","audioUrl":null},{"id":"53ecb240-66cc-4d70-821d-50450b61c2b7","order":2,"chinese":"现在是繁忙时间，可能有点堵车。","pinyin":"xiàn zài shì fán máng shí jiān kě néng yóu diǎn dǔ chē","english":"It''s rush hour now, there might be some traffic.","audioUrl":null},{"id":"aa0eb9d7-2610-42e7-876f-455766b3e001","order":3,"chinese":"没关系，我不赶时间。","pinyin":"méi guān xì wǒ bù gǎn shí jiān","english":"That''s okay, I''m not in a hurry.","audioUrl":null},{"id":"d93832ae-ee9a-4289-805a-75efc61698e8","order":4,"chinese":"好。请系好安全带。","pinyin":"hǎo qǐng xì hǎo ān quán dài","english":"Alright. Please fasten your seatbelt.","audioUrl":null},{"id":"19a27a33-e039-4bbd-a826-f6ac2932f1db","order":5,"chinese":"知道了。这里有什么好玩的地方可以推荐吗？","pinyin":"zhī dào le zhè lǐ yǒu shén me hǎo wán de dì fāng ké yǐ tuī jiàn ma","english":"Got it. Are there any fun places around here that you can recommend?","audioUrl":null},{"id":"57a78ecc-c44f-4e46-94d5-e810761c834e","order":6,"chinese":"当然，市中心有一个不错的博物馆。","pinyin":"dāng rán shì zhōng xīn yǒu yí gè bú cuò de bó wù guǎn","english":"Of course, there''s a nice museum in the city center.","audioUrl":null},{"id":"589013a8-5f05-4fea-874a-35fd4598dc02","order":7,"chinese":"还有一个很大的购物中心。","pinyin":"hái yǒu yí gè hěn dà de gòu wù zhōng xīn","english":"There''s also a very big shopping mall.","audioUrl":null},{"id":"107ed0fe-b88e-48f6-9554-7e935e57a341","order":8,"chinese":"另外，晚上可以去河边散步，风景很美。","pinyin":"lìng wài wǎn shàng ké yǐ qù hé biān sàn bù fēng jǐng hěn měi","english":"Also, you can take a walk by the river in the evening; the scenery is beautiful.","audioUrl":null},{"id":"bc882bd2-da3b-4456-b154-15ecf89110e4","order":9,"chinese":"听起来不错，谢谢你的建议。","pinyin":"tīng qǐ lái bú cuò xiè xiè nǐ de jiàn yì","english":"Sounds great, thank you for the suggestion.","audioUrl":null},{"id":"6bbf30fb-d430-4bb5-9352-691b82cb7e7c","order":10,"chinese":"不客气。酒店到了，五十六块。","pinyin":"bù kè qì jiǔ diàn dào le wǔ shí liù kuài","english":"You''re welcome. We''ve arrived at the hotel; that''ll be 56 yuan.","audioUrl":null},{"id":"ab458261-b80a-4e7b-b8b2-1673df002896","order":11,"chinese":"给你六十，不用找了。有发票吗？","pinyin":"gěi nǐ liù shí bú yòng zhǎo le yǒu fā piào ma","english":"Here''s 60, keep the change. Do you have a receipt?","audioUrl":null},{"id":"d99d1c15-d449-40ca-b552-5444127775e7","order":12,"chinese":"有。别忘了你的行李。","pinyin":"yǒu bié wàng le nǐ de xíng li","english":"Yes, I do. Don''t forget your luggage.","audioUrl":null}]}'::jsonb,
    "updated_at" = now()
WHERE l."lesson_type" = 'audio'
  AND l."deleted_at" IS NULL
  AND l."title" ILIKE '%taxi driver%'
  AND l."module_id" IN (
    SELECT m."id"
    FROM "course_library_modules" m
    JOIN "course_library_courses" c ON c."id" = m."course_id"
    WHERE m."deleted_at" IS NULL
      AND c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - intermediate'
      AND m."title" ILIKE '%getting a cab%'
  );
