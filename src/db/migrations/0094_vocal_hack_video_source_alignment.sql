-- Align every confirmed Vocal Hack display field with the coach video.
-- Each replacement is guarded by sentence ID and all three current display
-- values, so later editorial work is never overwritten.

DO $migration$
DECLARE
  correction record;
BEGIN
  FOR correction IN
    SELECT *
    FROM (
      VALUES
        ('594abdf4-3b2d-4699-aac5-d3c025a42f28', '我是一位香港人。', 'wǒ shì yí wèi xiāng gǎng rén', 'I am from Hong Kong.', '我是香港人。', 'wǒ shì xiāng gǎng rén', 'I am from Hong Kong.'),
        ('fdcae3ae-1738-4fd7-befe-b2cbc94d234d', '工作。', 'gōng zuò', 'Work.', '工作，工作，工作。', 'gōng zuò gōng zuò gōng zuò', 'Work, work, work.'),
        ('94ee2249-0efd-4cc6-940e-321dcc73a235', '手机。', 'shǒu jī', 'Mobile phone.', '手机，手机，手机。', 'shǒu jī shǒu jī shǒu jī', 'Mobile phone, mobile phone, mobile phone.'),
        ('1a27cd77-7167-44d8-a637-82ce962528fa', '电脑科学，听起来很难。', 'diàn nǎo kē xué tīng qǐ lái hěn nán', 'Computer science sounds very difficult.', '哦，电脑科学，听起来很难哦。', 'ò diàn nǎo kē xué tīng qǐ lái hěn nán ò', 'Oh, computer science sounds very difficult.'),
        ('6eca6c88-c3ec-46e4-83bb-eb771b65f905', '有时候挺难的，不过也很有趣。', 'yǒu shí hòu tǐng nán de bú guò yě hěn yǒu qù', 'Sometimes it''s quite difficult, but also very interesting.', '是啊，有时候挺难的，不过也很有趣。', 'shì a yǒu shí hòu tǐng nán de bú guò yě hěn yǒu qù', 'Yes, sometimes it''s quite difficult, but also very interesting.'),
        ('1bf9bd9c-094f-4f32-a733-5905f474290d', '姥奶奶，不用担心', 'lǎo nǎi nai bú yòng dān xīn', 'Grandma, don''t worry.', '老奶奶，不用担心。', 'lǎo nǎi nai bú yòng dān xīn', 'Grandma, don''t worry.'),
        ('b9ca017a-7fc6-41b8-9192-b46fa909ec55', '直走然后右转。', 'zhí zǒu rán hòu yòu zhuǎn', 'Go straight and then turn right.', '哦，直走，然后右转。', 'ò zhí zǒu rán hòu yòu zhuǎn', 'Oh, go straight and then turn right.'),
        ('687feac3-07c7-4739-969e-aaf868f8a000', '谢谢你啊，小朋友，你真是太好了。', 'xiè xiè nǐ a xiǎo péng yǒu nǐ zhēn shì tài hǎo le', 'Thank you, little friend, you are really great.', '哎呀，谢谢你啊，小朋友，你真是太好了。', 'āi yā xiè xiè nǐ a xiǎo péng yǒu nǐ zhēn shì tài hǎo le', 'Oh, thank you, little friend, you are really great.'),
        ('19effac9-067c-4226-97c7-db800763b247', '不用。', 'bú yòng', 'No need.', '不用，不用。', 'bú yòng bú yòng', 'No need, no need.'),
        ('fe5089ec-1458-4500-8e2a-e72c56e88714', '你好啊，怎么称呼你？', 'nǐ hǎo a zěn me chēng hu nǐ', 'Hello, what should I call you?', '你好啊，怎么称呼你啊？', 'nǐ hǎo a zěn me chēng hu nǐ a', 'Hello, what should I call you?'),
        ('70d3ab62-ba86-4d46-a1f7-c20aaf0fc5e0', '有点忙，有很多事情要处理。', 'yǒu diǎn máng yǒu hěn duō shì qíng yào chǔ lǐ', 'I''m a bit busy with a lot of things to handle.', '有点忙，有很多事情要处理。你呢？', 'yǒu diǎn máng yǒu hěn duō shì qíng yào chǔ lǐ nǐ ne', 'I''m a bit busy with a lot of things to handle. How about you?'),
        ('58b07330-5371-4f0b-8cdc-e8878a0c9412', '哦，你喜欢住在这里吗？', 'ò nǐ xǐ huan zhù zài zhè lǐ ma', 'Oh, do you like living here?', '你喜欢住在这里吗？', 'nǐ xǐ huan zhù zài zhè lǐ ma', 'Do you like living here?'),
        ('8ee12a9f-758f-4cc4-b319-1cba92b414b5', '我很喜欢这里，大家都很友善。', 'wǒ hěn xǐ huan zhè lǐ dà jiā dōu hěn yǒu shàn', 'I really like it here; everyone is very friendly.', '喜欢，我很喜欢这里，大家都很友善。', 'xǐ huan wǒ hěn xǐ huan zhè lǐ dà jiā dōu hěn yǒu shàn', 'Yes, I really like it here; everyone is very friendly.'),
        ('7a8eb411-41b3-4ea4-b98a-ea6aa8761229', '你在哪个公司做营销？', 'nǐ zài nǎ gè gōng sī zuò yíng xiāo', 'Which company do you work for in marketing?', '你呢？你在哪一家公司做营销？', 'nǐ ne nǐ zài nǎ yì jiā gōng sī zuò yíng xiāo', 'How about you? Which company do you work for in marketing?'),
        ('a029ce5a-9485-4bc8-8418-d1bda18c3f28', '我喜欢看书和爬山。', 'wǒ xǐ huan kàn shū hé pá shān', 'I like reading and hiking.', '我喜欢看书和爬山。你呢？你平时喜欢做什么？', 'wǒ xǐ huan kàn shū hé pá shān nǐ ne nǐ píng shí xǐ huan zuò shén me', 'I like reading and hiking. How about you? What do you usually like to do?'),
        ('a638d63d-ce8b-4612-9758-b51a72aac979', '我喜欢跑步和打游戏。', 'wǒ xǐ huan pǎo bù hé dǎ yóu xì', 'I like running and playing games.', '我喜欢跑步和打游戏，你喜欢运动吗?', 'wǒ xǐ huan pǎo bù hé dǎ yóu xì nǐ xǐ huan yùn dòng ma', 'I like running and playing games. Do you like sports?'),
        ('e0c98a1a-f85a-4903-b3c0-6e58a3039b29', '我们最喜欢可以打卡的景点。', 'wǒ men zuì xǐ huan kě yǐ dǎ kǎ de jǐng diǎn', 'Our favorite attractions are those where we can take photos.', '我们最喜欢可以打卡的景点了。', 'wǒ men zuì xǐ huan kě yǐ dǎ kǎ de jǐng diǎn le', 'Our favorite attractions are those where we can take photos.'),
        ('b9e13b8e-170a-4f41-b0fe-36b8507f3342', '我因为生了孩子所以辞职了。', 'wǒ yīn wéi shēng le hái zi suǒ yǐ cí zhí le', 'I quit my job because I had a baby.', '我因为生了孩子，所以辞职了。当妈妈有点忙。你呢?', 'wǒ yīn wéi shēng le hái zi suǒ yǐ cí zhí le dāng mā ma yǒu diǎn máng nǐ ne', 'I quit my job because I had a baby. Being a mom is a bit busy. How about you?'),
        ('4b093bf5-e1f5-46e2-8047-d5ad346f6f76', '我圣诞节会回家看看我爸妈。', 'wǒ shèng dàn jié huì huí jiā kàn kàn wǒ bà mā', 'I will go home to see my parents for Christmas.', '我圣诞节会回家看看我爸妈。你呢？最近有什么有趣的经历吗?', 'wǒ shèng dàn jié huì huí jiā kàn kàn wǒ bà mā nǐ ne zuì jìn yǒu shén me yǒu qù de jīng lì ma', 'I will go home to see my parents for Christmas. How about you? Any interesting experiences recently?'),
        ('d6719996-64af-46fa-b235-0953ba139eec', '选这个颜色吧。', 'xuǎn zhè ge yán sè ba', 'Choose this color.', '选这个颜色吧，这个更好看。', 'xuǎn zhè ge yán sè ba zhè ge gèng hǎo kàn', 'Choose this color, it''s better looking.'),
        ('ca08b4a9-0efb-455e-9904-f31d5b612f5d', '图书馆对面就是地铁站。', 'tú shū guǎn duì miàn jiù shì dì tiě zhàn', 'The subway station is right across from the library.', '图书馆对面就是地铁站了。', 'tú shū guǎn duì miàn jiù shì dì tiě zhàn le', 'The subway station is right across from the library.'),
        ('856b4ad2-9b5e-45d4-83d3-2755c83ee955', '我现在在机场的到达大厅。', 'wǒ xiàn zài zài jī chǎng de dào dá dà tīng', 'I am now at the arrival hall of the airport.', '我现在在机场的到达大厅。我的电话是', 'wǒ xiàn zài zài jī chǎng de dào dá dà tīng wǒ de diàn huà shì', 'I am now at the arrival hall of the airport. My phone number is'),
        ('40688fc6-89fb-410f-a322-523f948e21af', '车子会在十分钟内到达车号室。', 'chē zi huì zài shí fēn zhōng nèi dào dá chē hào shì', 'The car will arrive at the cab area in ten minutes.', '好的，车子会在十分钟内到达，车号是……', 'hǎo de chē zi huì zài shí fēn zhōng nèi dào dá chē hào shì', 'Okay. The car will arrive within ten minutes. The car number is…'),
        ('e980264f-da20-4a71-bcc7-1444730c9fb7', '没关系，反正我现在不想要了。', 'méi guān xì fǎn zhèng wǒ xiàn zài bù xiǎng yào le', 'It''s okay, I don''t want it right now anyway.', '没关系，反正我现在不想要了，真的。', 'méi guān xì fǎn zhèng wǒ xiàn zài bù xiǎng yào le zhēn de', 'It''s okay, I don''t want it right now anyway, really.'),
        ('b19a435c-091d-4784-aed6-aa56d31a35fc', '这个用中文怎么说？', 'zhè ge yòng zhōng wén zěn me shuō', 'How do you say this in Chinese?', '这个用中文怎么说？那个呢？', 'zhè ge yòng zhōng wén zěn me shuō nà ge ne', 'How do you say this in Chinese? What about that?'),
        ('76cd535f-b852-444b-a4c9-8aa94b2b7aef', '我先帮你量一下体温。', 'wǒ xiān bāng nǐ liáng yí xià tǐ wēn', 'I''ll measure your temperature first.', '我先帮你量一下体温。三十八度，你在发烧。', 'wǒ xiān bāng nǐ liáng yí xià tǐ wēn sān shí bā dù nǐ zài fā shāo', 'I''ll measure your temperature first. It''s 38 degrees, you have a fever.'),
        ('c52b4d52-6f0e-4afa-8f51-13dfa57ee14f', '烘熟或是饭后服用都可以。', 'hōng shú huò shì fàn hòu fú yòng dōu kě yǐ', 'You can consume it either after cooking or after a meal.', '空腹或是饭后服用都可以。', 'kōng fù huò shì fàn hòu fú yòng dōu kě yǐ', 'You can take it either on an empty stomach or after a meal.'),
        ('c0f9aaa2-e5b9-4477-9509-ac1b4b1e3d0d', '这个药有副作用吗?', 'zhè ge yào yǒu fù zuò yòng ma', 'Does this medicine have side effects?', '好的，谢谢。这个药有副作用吗?', 'hǎo de xiè xiè zhè ge yào yǒu fù zuò yòng ma', 'Okay, thank you. Does this medicine have side effects?'),
        ('9c2f5acb-969c-4e57-b8ce-4017a7baa5f0', '那你是怎么投资的？', 'nà nǐ shì zěn me tóu zī de', 'So how do you invest?', '那你是怎么投资的？风险大吗？', 'nà nǐ shì zěn me tóu zī de fēng xiǎn dà ma', 'So how do you invest? Is it risky?'),
        ('1e706adb-8ec9-489a-95af-e0cb65084958', '你好，我叫Janelle，你叫咩名？', 'haa1 lou3 ngo5 giu3 aa3 nei5 giu3 me1 meng2', 'Hello, my name is Janelle. What is your name?', 'Hello，我叫Janelle，你叫咩名？', 'ngo5 giu3 nei5 giu3 me1 meng2', 'Hello, my name is Janelle. What is your name?'),
        ('e59c5e0d-f7b2-46ba-9375-dab818fb7643', '五蚊一磅', 'ng5 man1 jat1 bong6', 'Five dollars per pound.', '五蚊一磅，五蚊一公斤。', 'ng5 man1 jat1 bong6 ng5 man1 jat1 gung1 gan1', 'Five dollars per pound, five dollars per kilogram.'),
        ('7afdaa4b-92d1-445b-95ac-7ea05e862947', '你要大樽定細樽？', 'nei5 jiu3 daai6 zeon1 ding6 sai3 zeon1', 'Do you want a large bottle or a small bottle?', '有，你要大樽定細樽？', 'jau5 nei5 jiu3 daai6 zeon1 ding6 sai3 zeon1', 'Yes, do you want a large bottle or a small bottle?'),
        ('03d525a5-685e-46fe-83c9-0a7e7e71a6eb', '我下個星期六得閒喇。', 'ngo5 haa6 go3 sing1 kei4 luk6 dak1 haan4 aa3', 'I will be free next Saturday.', '我下個星期六得閒呀。', 'ngo5 haa6 go3 sing1 kei4 luk6 dak1 haan4 aa3', 'I will be free next Saturday.'),
        ('9c83e621-d03f-4852-af97-caeb97253e86', '去到，碼頭附近有個巴士站。', 'heoi3 dou3 maa5 tau4 fu6 gan6 jau5 go3 baa1 si2 zaam6', 'Yes. There''s a bus stop near the pier.', '去到呀，碼頭附近有個巴士站。', 'heoi3 dou3 aa3 maa5 tau4 fu6 gan6 jau5 go3 baa1 si2 zaam6', 'Yes. There''s a bus stop near the pier.'),
        ('f4990c9c-30b9-4180-99cd-6a6033119f04', '你有冇投資，定係儲錢?', 'nei5 jau5 mou5 tau4 zi1 ding6 hai6 zing6 hai6 cou5 cin2', 'Do you invest or save money?', '你有冇投資，定係淨係儲錢?', 'nei5 jau5 mou5 tau4 zi1 ding6 hai6 zing6 hai6 cou5 cin2', 'Do you invest or just save money?'),
        ('5a6a1248-ec93-4534-96dc-a7af4f952b2f', '他其实很聪明，只是需要一点时间去适应。', 'tā qí shí hěn cōng ming zhǐ shì xū yào yì diǎn shí jiān qù shì yìng', 'He is actually very smart; he just needs a little time to adapt.', '那太好了，他其实很聪明，只是需要一点时间去适应。', 'nà tài hǎo le tā qí shí hěn cōng ming zhǐ shì xū yào yì diǎn shí jiān qù shì yìng', 'That''s great, he is actually very smart; he just needs a little time to adapt.'),
        ('02955550-3716-42c0-98c3-642e9aecd4f0', '好呀，不过要先刷牙。', 'hǎo ya bú guò yào xiān shuā yá', 'Okay, but we need to brush our teeth first.', '好呀，不过要先刷牙牙。', 'hǎo ya bú guò yào xiān shuā yá yá', 'Okay, but we need to brush our teeth first.'),
        ('f8b1ea9b-738f-48bc-80d3-8b078acddd6f', '来，穿衣服吧。', 'lái chuān yī fu ba', 'Come on, let’s get dressed.', '来，穿衣衣咯。', 'lái chuān yī yī gē', 'Come on, let’s get dressed.'),
        ('5b823711-e7ff-4c79-b569-535068fcf076', '好呀，穿好了，现在变成小熊熊了。', 'hǎo ya chuān hǎo le xiàn zài biàn chéng xiǎo xióng xióng le', 'Okay, I''ve finished getting dressed. Now I''ve turned into a little bear.', '好呀，穿好喽，现在变成小熊熊了。', 'hǎo ya chuān hǎo lou xiàn zài biàn chéng xiǎo xióng xióng le', 'Okay, I''ve finished getting dressed. Now I''ve turned into a little bear.'),
        ('409c26b5-4b60-4d4d-a11b-294fa7d48d87', '宝宝，吃饭饭啰。', 'bǎo bao chī fàn fàn luō', 'Baby, it''s time to eat.', '宝宝，吃饭饭喽。', 'bǎo bao chī fàn fàn lou', 'Baby, it''s time to eat.'),
        ('5d79c237-203b-4b2d-b439-9a8ac1ba5ba5', '来，一口饭。', 'lái yì kǒu fàn', 'Come, take a bite of the rice.', '来，一口饭饭。', 'lái yì kǒu fàn fàn', 'Come, take a bite of the rice.'),
        ('35947ab3-2a1a-4528-b0d5-2b6969fb621f', '真乖，吃下去了。', 'zhēn guāi chī xià qù le', 'Very good, you ate it.', '真乖，吃下去了，好香香。', 'zhēn guāi chī xià qù le hǎo xiāng xiāng', 'Very good, you ate it. It''s very fragrant.'),
        ('944e7951-3921-4e9e-a99e-7c5b7b699e79', '不要洗。', 'bú yào xǐ', 'Don''t wash.', '不要，不要洗。', 'bú yào bú yào xǐ', 'Don''t, don''t wash.'),
        ('9b88f317-d7b0-4b80-b6d4-e557b2e3af90', '宝宝，天黑黑喔，要睡觉啦。', 'bǎo bao tiān hēi hēi wō yào shuì jiào lā', 'Baby, it''s dark now, time to sleep.', '宝宝，天黑黑喽，要睡觉觉啦。', 'bǎo bao tiān hēi hēi lou yào shuì jiào jué lā', 'Baby, it''s dark now, time to sleep.'),
        ('12102370-d9b6-4c7a-979d-8c46ac842b06', '好，又听小兔兔。', 'hǎo yòu tīng xiǎo tù tù', 'Okay, let''s listen to the little bunny again.', '好，要听小兔兔。', 'hǎo yào tīng xiǎo tù tù', 'Okay, I want to hear the little bunny story.'),
        ('2a4cd53f-772d-4947-b5c3-38b40db111be', '你能给你的痛感评分吗？', 'nǐ néng gěi nǐ de tòng gǎn píng fēn ma', 'Can you rate your pain?', '你能给你的痛感评分吗？一分是最轻微的疼痛，十分是最严重的疼痛。', 'nǐ néng gěi nǐ de tòng gǎn píng fēn ma yì fēn shì zuì qīng wēi de téng tòng shí fēn shì zuì yán zhòng de téng tòng', 'Can you rate your pain? One is the least severe pain, and ten is the most severe pain.'),
        ('a4cefeae-3f9d-4ae5-bac5-1cca241d40cd', '你有饮食限制吗？', 'nǐ yǒu yǐn shí xiàn zhì ma', 'Do you have any dietary restrictions?', '你有饮食限制吗？你每天通常吃些什么？', 'nǐ yǒu yǐn shí xiàn zhì ma nǐ měi tiān tōng cháng chī xiē shén me', 'Do you have any dietary restrictions? What do you usually eat every day?'),
        ('4346c33e-ed07-4bf6-aa71-38a909553f14', '你的排便情况如何？', 'nǐ de pái biàn qíng kuàng rú hé', 'How is your bowel movement?', '你的排便情况如何？你多久拉一次大便？', 'nǐ de pái biàn qíng kuàng rú hé nǐ duō jiǔ lā yí cì dà biàn', 'How is your bowel movement? How often do you have a bowel movement?'),
        ('a439880f-3b5a-40c5-8de2-eddf839be17d', '你有过手术或住院的历史吗？', 'nǐ yǒu guò shǒu shù huò zhù yuàn de lì shǐ ma', 'Do you have a history of surgery or hospitalization?', '你有过手术或住院的历史吗？是因为什么原因?', 'nǐ yǒu guò shǒu shù huò zhù yuàn de lì shǐ ma shì yīn wèi shén me yuán yīn', 'Do you have a history of surgery or hospitalization? What was the reason?'),
        ('1b338313-3421-4818-aed4-0ffd9db774d1', '我们会抽一些血。', 'wǒ men huì chōu yì xiē xuè', 'We will draw some blood.', '我们会抽一些血，你之前有没有在抽血或抽完血后感到晕眩或恶心？', 'wǒ men huì chōu yì xiē xuè nǐ zhī qián yǒu méi yǒu zài chōu xuè huò chōu wán xuè hòu gǎn dào yūn xuàn huò ě xīn', 'We will draw some blood. Have you ever felt dizzy or nauseous during or after a blood draw?'),
        ('c76f37c3-ac97-4855-a1f5-2d528eaa78f9', '外科医生会进来向你解释手术。', 'wài kē yī shēng huì jìn lái xiàng nǐ jiě shì shǒu shù', 'The surgeon will come in to explain the surgery to you.', '外科医生会进来向你解释你的手术。', 'wài kē yī shēng huì jìn lái xiàng nǐ jiě shì nǐ de shǒu shù', 'The surgeon will come in to explain your surgery to you.'),
        ('b2070683-ac93-4320-8f6d-45eed73facb8', '你和谁一起住？', 'nǐ hé shuí yì qǐ zhù', 'Who do you live with?', '你和谁一起住？你有家人吗？他们住得近吗？', 'nǐ hé shuí yì qǐ zhù nǐ yǒu jiā rén ma tā men zhù dé jìn ma', 'Who do you live with? Do you have family? Do they live nearby?'),
        ('eb821a9e-5e08-43b5-9164-aee4611e05b5', '你有家庭护理吗？', 'nǐ yǒu jiā tíng hù lǐ ma', 'Do you have home care?', '你有家庭护理吗？有人来你家照顾你的生活起居吗？', 'nǐ yǒu jiā tíng hù lǐ ma yǒu rén lái nǐ jiā zhào gù nǐ de shēng huó qǐ jū ma', 'Do you have home care? Does someone come to your home to take care of your daily needs?'),
        ('3f213586-a57a-4ad7-b066-12cdca1ea839', '你做什么工作？', 'nǐ zuò shén me gōng zuò', 'What do you do for work?', '你做什么工作，或者你以前做过什么工作？', 'nǐ zuò shén me gōng zuò huò zhě nǐ yǐ qián zuò guò shén me gōng zuò', 'What do you do for work, or what have you done before?'),
        ('43724564-f12a-4194-9a35-028f07efacfa', '我是一名老师。', 'wǒ shì yì míng lǎo shī', 'I am a teacher.', '我是一个老师，已经做了三十年了。', 'wǒ shì yí gè lǎo shī yǐ jīng zuò le sān shí nián le', 'I am a teacher; I have been teaching for thirty years.'),
        ('0d8add82-cd45-4850-8d50-52b74f821181', '我女儿下班了来接我，公交很方便。', 'wǒ nǚ ér xià bān le lái jiē wǒ gōng jiāo hěn fāng biàn', 'My daughter picks me up after work; the bus is very convenient.', '我女儿下班了来接我，我自己坐车也行，公交很方便。', 'wǒ nǚ ér xià bān le lái jiē wǒ wǒ zì jǐ zuò chē yě xíng gōng jiāo hěn fāng biàn', 'My daughter will pick me up after work. I can also take the bus; it''s very convenient.'),
        ('cfba0892-a4e5-4348-af3d-c653e81e0ae3', '数据量多吗？需要花时间清洗吗？', 'shù jù liáng duō ma xū yào huā shí jiān qīng xǐ ma', 'Is the data volume large? Does it require time to clean?', '数据量多不多？需要花时间清洗吗？', 'shù jù liáng duō bu duō xū yào huā shí jiān qīng xǐ ma', 'Is the data volume large or not? Does it require time to clean?'),
        ('dac3f4c7-55ae-499d-8e57-2870b3bbbaa1', '那这个模型打算上线吗？', 'nà zhè ge mó xíng dǎ suàn shàng xiàn ma', 'Is this model planned to go live?', '那这模型打算上线吗？', 'nà zhè mó xíng dǎ suàn shàng xiàn ma', 'Is this model planned to go live?'),
        ('637ad8ba-921b-4774-b65c-09da374d1b0d', '没有出界，好球。', 'méi yǒu chū jiè hǎo qiú', 'Not out of bounds, good shot.', '没有，没出界，好球。', 'méi yǒu méi chū jiè hǎo qiú', 'No, not out of bounds, good shot.'),
        ('ae34e335-37cd-4c89-b3b4-fbb274719ffd', '15比0，你领先。', 'bǐ nǐ lǐng xiān', '15 to 0, you''re in the lead.', '十五比零，你领先。', 'shí wǔ bǐ líng nǐ lǐng xiān', '15 to 0, you''re in the lead.'),
        ('48561e90-b538-43af-b09b-a1adf469f2d8', '6比4，你赢了一局。', 'bǐ nǐ yíng le yì jú', '6 to 4, you won a game.', '六比四，你赢了一局。', 'liù bǐ sì nǐ yíng le yì jú', '6 to 4, you won a game.'),
        ('51290fb1-3414-46d6-851f-3deae815a066', '别担心，打得很好。', 'bié dān xīn dǎ dé hěn hǎo', 'Don''t worry, you''re playing very well.', '别担心，打得很好。再来一局吗？', 'bié dān xīn dǎ dé hěn hǎo zài lái yì jú ma', 'Don''t worry, you''re playing very well. Want to play another game?'),
        ('33e4d87b-72c1-4a3c-bd91-eb0b2a00a8bf', '换搭档更有意思，我想和你一对试试。', 'huàn dā dàng gèng yǒu yì sī wǒ xiǎng hé nǐ yí duì shì shì', 'Switching partners is more fun; I want to try pairing up with you.', '换吧，换搭档更有意思。我想和你一对试试。', 'huàn ba huàn dā dàng gèng yǒu yì sī wǒ xiǎng hé nǐ yí duì shì shì', 'Switching partners is more fun; I want to try pairing up with you.'),
        ('dc25702a-e644-40d3-b1f5-67b2eaa4d018', '你们以前养过狗吗？', 'nǐ men yǐ qián yǎng guò gǒu ma', 'Have you ever had a dog?', '你们以前养过狗吗？后来怎么处理的？', 'nǐ men yǐ qián yǎng guò gǒu ma hòu lái zěn me chǔ lǐ de', 'Have you ever had a dog? How did you handle it later?'),
        ('f659effc-4c49-4066-9a0a-fb49de4a3d10', '你先坐着别动，让她自己过来。', 'nǐ xiān zuò zhe bié dòng ràng tā zì jǐ guò lái', 'You sit still first and let her come over by herself.', '你先坐着别动，让他自己过来。', 'nǐ xiān zuò zhe bié dòng ràng tā zì jǐ guò lái', 'Sit still and let him come over by himself.'),
        ('4e1f2fd4-6a37-4ef9-8d6b-22632027277e', '谢谢，你先在这稍等一下，我待会儿送你出去。', 'xiè xiè nǐ xiān zài zhè shāo děng yí xià wǒ dài huì er sòng nǐ chū qù', 'Thank you, please wait here for a moment, and I will take you out shortly.', '谢谢，你先在这儿稍等一下，我待会儿送你出去。', 'xiè xiè nǐ xiān zài zhè ér shāo děng yí xià wǒ dài huì er sòng nǐ chū qù', 'Thank you, please wait here for a moment, and I will take you out shortly.'),
        ('c777af6a-a00f-4b06-a927-6f20982e9d3d', '要是万一你因为什么原因养不了他，一定得把他送回来给我们。', 'yào shi wàn yī nǐ yīn wèi shén me yuán yīn yǎng bù liǎo tā yí dìng dé bǎ tā sòng huí lái gěi wǒ men', 'If for any reason you can’t take care of him, you must return him to us.', '要是万一你因为什么原因养不了他了，一定得把他送回来给我们。', 'yào shi wàn yī nǐ yīn wèi shén me yuán yīn yǎng bù liǎo tā le yí dìng dé bǎ tā sòng huí lái gěi wǒ men', 'If for any reason you can’t take care of him, you must return him to us.'),
        ('58a3851f-394e-4c5c-8479-5275f035ec95', '我挺喜欢他的，想领养他。', 'wǒ tǐng xǐ huan tā de xiǎng lǐng yǎng tā', 'I really like him and want to adopt him.', '嗯，我挺喜欢他的，想领养他。', 'ǹg wǒ tǐng xǐ huan tā de xiǎng lǐng yǎng tā', 'I really like him and want to adopt him.'),
        ('2494f312-f135-48ce-be5f-f84f52bedd6a', '这笔交易我最多可以申请到百分之多少的贷款？', 'zhè bǐ jiāo yì wǒ zuì duō kě yǐ shēn qǐng dào bǎi fēn zhī duō shǎo de dài kuǎn', 'How much of the loan can I apply for on this transaction?', '顺便问一下，这笔交易我最多可以申请到百分之多少的贷款？', 'shùn biàn wèn yí xià zhè bǐ jiāo yì wǒ zuì duō kě yǐ shēn qǐng dào bǎi fēn zhī duō shǎo de dài kuǎn', 'By the way, how much of the loan can I apply for on this transaction?'),
        ('5e9b9566-1b4e-4d54-b310-91de64b490d3', '正常情况下您可以申请到80%到90%。', 'zhèng cháng qíng kuàng xià nín kě yǐ shēn qǐng dào dào', 'Under normal circumstances, you can apply for 80% to 90%.', '正常情况下您可以申请到百分之八十到九十。', 'zhèng cháng qíng kuàng xià nín kě yǐ shēn qǐng dào bǎi fēn zhī bā shí dào jiǔ shí', 'Under normal circumstances, you can apply for 80% to 90%.'),
        ('57169a65-ebce-4eb8-a4b8-2c37ebb4ed92', '第一份出价是四百四十万。', 'dì yī fèn chū jià shì sì bǎi sì shí wàn', 'The first bid is four million four hundred forty thousand.', '第一份出价是四百四十万，第二份出价是四百五十五万。', 'dì yī fèn chū jià shì sì bǎi sì shí wàn dì èr fèn chū jià shì sì bǎi wǔ shí wǔ wàn', 'The first bid is 4.4 million. The second bid is 4.55 million.'),
        ('50bb6a98-52c1-421c-8459-35208b36ec45', '会怎么影响净息差？', 'huì zěn me yǐng xiǎng jìng xī chà', 'will affect net interest margins?', '会怎么影响净息差？', 'huì zěn me yǐng xiǎng jìng xī chà', 'How will it affect net interest margins?'),
        ('d48f2d1b-f2eb-4889-aacb-83a0c4788680', '我想申请。', 'wǒ xiǎng shēn qǐng', 'I want to apply.', '嗯，我想申请。', 'ǹg wǒ xiǎng shēn qǐng', 'Hmm, I want to apply.'),
        ('e9684b61-b63d-4a83-8c9a-694449706a03', '传说的时候会全额退还。', 'chuán shuō de shí hòu huì quán é tuì huán', 'It is said that a full refund will be given at the time.', '还车的时候会全额退款。', 'hái chē de shí hòu huì quán é tuì kuǎn', 'The deposit will be refunded in full when you return the bike.'),
        ('e3852089-13b7-4219-bcf5-5854e21809cf', '你好，我是处理买卖物业的律师。', 'ní hǎo wǒ shì chú lǐ mǎi mài wù yè de lǜ shī', 'Hello, I am a lawyer handling property transactions.', '加油。', 'jiā yóu', 'Keep it up!'),
        ('1e4bdf37-dd8d-4f85-87a8-d18f23998b1b', '请问有什么可以帮到你', 'qǐng wèn yǒu shén me ké yǐ bāng dào nǐ', 'How can I help you?', '教练说。', 'jiào liàn shuō', 'The coach said.'),
        ('df0c345e-e7ee-4c26-839a-7505cbf053a1', '我們去洗手間', 'wǒ men qù xí shǒu jiān', 'Let''s go to the restroom.', '娜娜。', 'nà nà', 'Nana.'),
        ('78e95a0f-6d7b-4532-8c18-0e5a66909e30', '正常67岁退休的话，每个月可以领一千块。', 'zhèng cháng suì tuì xiū de huà měi gè yuè kě yǐ lǐng yì qiān kuài', 'If you retire at the normal age of 67, you can receive a thousand yuan a month.', '正常六十七岁退休的话，每个月可以领一千块。', 'zhèng cháng liù shí qī suì tuì xiū de huà měi gè yuè kě yǐ lǐng yì qiān kuài', 'If you retire at the normal age of sixty-seven, you can receive one thousand dollars per month.'),
        ('661928fc-8473-40a6-a70f-175854f332e3', '对，先拿5%的用户试试，看一周再说。', 'duì xiān ná de yòng hù shì shì kàn yì zhōu zài shuō', 'Yes, let''s try it with 5% of the users and see how it goes after a week.', '对，先拿百分之五的用户试试，看一周再说。', 'duì xiān ná bǎi fēn zhī wǔ de yòng hù shì shì kàn yì zhōu zài shuō', 'Yes, let''s try it with 5% of the users and see how it goes after a week.'),
        ('091cd666-0ab6-42f0-96f6-0edd0699c4d5', '你好丽莎，我叫张伟，出生日期是1990年5月1日。', 'nǐ hǎo lì shā wǒ jiào zhāng wěi chū shēng rì qī shì nián yuè rì', 'Hello Lisa, my name is Zhang Wei, and my birth date is May 1st, 1990.', '你好丽莎，我叫张伟，出生日期是一九九零年五月一日。', 'nǐ hǎo lì shā wǒ jiào zhāng wěi chū shēng rì qī shì yī jiǔ jiǔ líng nián wǔ yuè yī rì', 'Hello Lisa, my name is Zhang Wei, and my birth date is May 1st, 1990.'),
        ('600aec2f-d09a-43b9-8c70-364a52a84c2f', '我把收入分成几部分，30%存起来。', 'wǒ bǎ shōu rù fēn chéng jǐ bù fen cún qǐ lái', 'I divide my income into several parts, saving 30%.', '我把收入分成几部分，百分之三十存起来。', 'wǒ bǎ shōu rù fēn chéng jǐ bù fen bǎi fēn zhī sān shí cún qǐ lái', 'I divide my income into several parts, saving 30%.'),
        ('c92bb28f-a926-40bd-a55b-209ecd171c17', '比如存够6到12个月的生活费。', 'bǐ rú cún gòu dào gè yuè de shēng huó fèi', 'For example, save enough living expenses for 6 to 12 months.', '比如存够六到十二个月的生活费。', 'bǐ rú cún gòu liù dào shí èr gè yuè de shēng huó fèi', 'For example, save enough living expenses for 6 to 12 months.'),
        ('2bb78415-c17d-4ffd-a7b8-126175c8fc1d', '今天是2021年1月12号。', 'jīn tiān shì nián yuè hào', 'Today is January 12, 2021.', '今天是二零二一年一月十二号。', 'jīn tiān shì èr líng èr yī nián yī yuè shí èr hào', 'Today is January 12, 2021.'),
        ('e4458eff-5dc6-4b9a-8e58-5760df52f48f', '重量没有问题。这是您的登机牌，登机口是A32。', 'zhòng liàng méi yǒu wèn tí zhè shì nín de dēng jī pái dēng jī kǒu shì', 'The weight is fine. Here is your boarding pass, and the boarding gate is A32.', '重量没有问题。这是您的登机牌，登机口是A三十二。', 'zhòng liàng méi yǒu wèn tí zhè shì nín de dēng jī pái dēng jī kǒu shì sān shí èr', 'The weight is fine. Here is your boarding pass, and the boarding gate is A32.'),
        ('dff9bb94-11a1-454e-ba26-5e519754a584', '这是您的房卡，您住503号房。', 'zhè shì nín de fáng kǎ nín zhù hào fáng', 'Here is your key card; you are in room 503.', '这是您的房卡，您住五零三号房。', 'zhè shì nín de fáng kǎ nín zhù wǔ líng sān hào fáng', 'Here is your key card; you are in room 503.'),
        ('1e1eb967-7bb9-4f62-bc60-e7c2520a1f17', '如果你继续这样追他，他会不喜欢你。', 'rú guǒ nǐ jì xù zhè yàng zhuī tā tā huì bù xǐ huan nǐ', 'If you keep pursuing him like this, he won''t like you.', '如果你继续这样追她，她会不喜欢你。', 'rú guǒ nǐ jì xù zhè yàng zhuī tā tā huì bù xǐ huan nǐ', 'If you keep pursuing her like this, she won''t like you.'),
        ('12b4834a-fac8-423a-af37-fe8d929256b9', '明天晚上七点有桌子，请问您贵姓?', 'míng tiān wǎn shàng qī diǎn yǒu zhuō zi qǐng wèn nín guì xìng', 'Do you have a reservation for a table at seven tomorrow evening, may I ask your last name?', '明天晚上七点有桌子，请问您贵姓?', 'míng tiān wǎn shàng qī diǎn yǒu zhuō zi qǐng wèn nín guì xìng', 'There is a table available at seven tomorrow evening. May I have your last name?'),
        ('0dc40f47-fb7e-4526-8b74-576d904e1005', '我的电话号码是', 'wǒ de diàn huà hào mǎ shì', 'My phone number is.', '我的电话号码是', 'wǒ de diàn huà hào mǎ shì', 'My phone number is…'),
        ('bcac5c48-c7d7-4c5e-a0ec-f39ba312cc75', '即使不忙的时候，我也感觉不到快乐。', 'jí shǐ bù máng de shí hòu wǒ yě gǎn jué bú dào kuài lè', 'Even when I''m not busy, I still feel no happiness.', '即使不忙的时候，我也感觉不到快乐。', 'jí shǐ bù máng de shí hòu wǒ yě gǎn jué bú dào kuài lè', 'I still can''t feel any happiness.'),
        ('a6f7834a-2260-426e-a632-3fb077862d08', '你想喺酒店食生果?', 'nei5 soeng2 hai2 zau2 dim3 sik6 saang1 gwo2', 'Do you eat fruit at the hotel?', '你想喺酒店食生果?', 'nei5 soeng2 hai2 zau2 dim3 sik6 saang1 gwo2', 'Do you want to eat fruit at the hotel?'),
        ('0ad7dfd1-c25d-4a1a-b2d4-7819599b459b', '我聽日買新電腦', 'ngo5 ting1 jat6 maai5 san1 din6 nou5', 'I will buy a new computer tomorrow.', '我聽日買新電腦', 'ngo5 ting1 jat6 maai5 san1 din6 nou5', 'I need to buy a few pieces of clothing at the shop at noon.'),
        ('c35b6cb6-eb39-4066-89b1-be69819ee7a7', '今次呢個客嘅預算唔多', 'gam1 ci3 ni1 go3 haak3 ge3 jyu6 syun3 m4 do1', 'This client''s budget isn''t much.', '今次呢個客嘅預算唔多', 'gam1 ci3 ni1 go3 haak3 ge3 jyu6 syun3 m4 do1', 'This client''s budget is limited.'),
        ('2e54b228-d0da-47b8-b6be-de7684bc154c', '又話我份工唔穩定', 'jau6 waa6 ngo5 fan6 gung1 m4 wan2 ding6', 'They say my job is unstable.', '又話我份工唔穩定', 'jau6 waa6 ngo5 fan6 gung1 m4 wan2 ding6', 'They also say my job is unstable.'),
        ('32279d3f-6417-41e0-842a-2fe5d2e77bf5', '不过，他也有韧性，得到鼓励后通常能重新振作。', 'bú guò tā yě yǒu rèn xìng dé dào gǔ lì hòu tōng cháng néng chóng xīn zhèn zuò', 'However, he is resilient and usually can recover after receiving encouragement.', '她很聪明，不过有时候有点粗心。', 'tā hěn cōng ming bú guò yǒu shí hòu yǒu diǎn cū xīn', 'She is very smart, but sometimes she is a bit careless.'),
        ('b26fec9f-408b-4993-a639-3f1686523f24', '我肚子的右边痛。', 'wǒ dù zǐ de yòu biān tòng', 'My right side of the stomach hurts.', '我肚子的右边痛。', 'wǒ dù zǐ de yòu biān tòng', 'The right side of my stomach hurts.'),
        ('94e3aee3-6701-40e4-b86c-6eddb91485c5', '要小熊熊的。', 'yào xiǎo xióng xióng de', 'It should be cute like a little bear.', '要小熊熊的。', 'yào xiǎo xióng xióng de', 'I want the little bear one.'),
        ('8c8a229d-8955-4e03-a2b8-2474e6fc638e', '那妈妈讲故事好不好?', 'nà mā ma jiǎng gù shì hǎo bu hǎo', 'Is it good for mom to tell a story?', '那妈妈讲故事好不好?', 'nà mā ma jiǎng gù shì hǎo bu hǎo', 'Would you like Mom to tell you a story?'),
        ('68978898-8df4-4a40-a6b9-03ab9ba9c6cf', '您是Ⅰ型还是Ⅱ型糖尿病？', 'nín shì xíng hái shì xíng táng niào bìng', 'Are you type 1 or type 2 diabetes?', '您是Ⅰ型还是Ⅱ型糖尿病？', 'nín shì xíng hái shì xíng táng niào bìng', 'Do you have type 1 or type 2 diabetes? Do you usually take medication or use insulin?'),
        ('f4c98f1d-8d05-4697-b38c-d46e537fb874', '没有', 'méi yǒu', 'There is none.', '没有', 'méi yǒu', 'No.'),
        ('7415d577-391d-4ef8-825c-0d6fb1ae9b80', '没有，我没有使用任何辅助设备。', 'méi yǒu wǒ méi yǒu shǐ yòng rèn hé fǔ zhù shè bèi', 'No, I didn’t use any assistive devices.', '没有，我没有使用任何辅助设备。', 'méi yǒu wǒ méi yǒu shǐ yòng rèn hé fǔ zhù shè bèi', 'I don''t use oxygen.'),
        ('0ed94f35-5b54-4990-ab16-2cd1f1eae449', '目前在用逻辑回归和随机森林两个对比着看。', 'mù qián zài yòng luó jí huí guī hé suí jī sēn lín liǎng gè duì bǐ zhe kàn', 'Currently comparing logistic regression and random forest.', '目前在用逻辑回归和随机森林两个对比着看。', 'mù qián zài yòng luó jí huí guī hé suí jī sēn lín liǎng gè duì bǐ zhe kàn', 'I''m currently comparing logistic regression and random forest.'),
        ('8cd95c4a-816c-4bb0-a688-a8f1e6baaf54', '不了，我有点累了，你们想用场地吗？', 'bù liǎo wǒ yǒu diǎn lèi le nǐ men xiǎng yòng chǎng dì ma', 'No, I''m a bit tired. Do you want to use the field?', '不了，我有点累了，你们想用场地吗？', 'bù liǎo wǒ yǒu diǎn lèi le nǐ men xiǎng yòng chǎng dì ma', 'The court next to us is free.'),
        ('7adc65f3-1bcc-430f-9c66-72cbda00d5e2', '我们只记那些超过十年的婚姻。', 'wǒ men zhī jì nà xiē chāo guò shí nián de hūn yīn', 'We only count marriages lasting more than ten years.', '我们只记那些超过十年的婚姻。', 'wǒ men zhī jì nà xiē chāo guò shí nián de hūn yīn', 'We only record marriages lasting more than ten years.'),
        ('899b6e12-4383-47e9-a06e-1040c66ed36e', '等您六十五岁的时候，不用自己申请。', 'děng nín liù shí wǔ suì de shí hòu bú yòng zì jǐ shēn qǐng', 'When you turn sixty-five, you won''t need to apply yourself.', '等您六十五岁的时候，不用自己申请。', 'děng nín liù shí wǔ suì de shí hòu bú yòng zì jǐ shēn qǐng', 'You can withdraw cash from it at any bank or ATM.'),
        ('c0dc089d-8ba7-40f8-ba6a-245f3e14ebb1', '米在第二排。', 'mǐ zài dì èr pái', 'The rice is on the second shelf.', '米在第二排。', 'mǐ zài dì èr pái', 'The rice is in the second aisle.'),
        ('44ed6238-d8c8-4e1a-966c-e2b8bb22f19c', '你要出去。', 'nǐ yào chū qù 。', 'You need to go out.', '你要出去。', 'nǐ yào chū qù', 'You need to go out.'),
        ('1b057a17-3f4c-4339-a9b6-66400d2e5e0f', '我要去公园。', 'wǒ yào qù gōng yuán 。', 'I want to go to the park.', '我要去公园。', 'wǒ yào qù gōng yuán', 'I want to go to the park.'),
        ('8c8611e8-a230-4e88-9545-14d9065447bf', '因为他要做功课。', 'yīn wèi tā yào zuò gōng kè 。', 'Because he has to do his homework.', '因为他要做功课。', 'yīn wèi tā yào zuò gōng kè', 'Because he has to do his homework.'),
        ('119be8b2-e32d-48fa-8c31-acebcc1a0971', '他们要去睡觉。', 'tā men yào qù shuì jiào 。', 'They are going to sleep.', '他们要去睡觉。', 'tā men yào qù shuì jiào', 'They are going to sleep.'),
        ('f5ecee58-9aba-47bd-a95b-9a2ee78e96d1', '我们要去餐厅吃饭。', 'wǒ men yào qù cān tīng chī fàn 。', 'We are going to the restaurant to eat.', '我们要去餐厅吃饭。', 'wǒ men yào qù cān tīng chī fàn', 'We are going to the restaurant to eat.'),
        ('c66d3ca7-0bcf-4620-8ed0-09f2c5033a0b', '你有冇每個月定個budget?', 'nei5 jau5 mou5 mui5 go3 jyut6 ding6 go3 budget', 'Do you set a budget every month?', '你有冇每個月定個budget?', 'nei5 jau5 mou5 mui5 go3 jyut6 ding6 go3', 'Do you set a budget every month?'),
        ('575389f9-9f0a-4615-bc3d-d73505cec519', 'WiFi密碼係乜?', 'Wi-Fi mat6 maa5 hai6 mat1', 'What is the WiFi password?', 'WiFi密碼係乜?', 'mat6 maa5 hai6 mat1', 'What is the WiFi password?'),
        ('a16cc633-22b4-42a5-8505-366e05383fe2', '做ABC都幾複雜。', 'zou6 ABC dou1 gei2 fuk1 zaap6', 'Being an ABC is quite complicated.', '做ABC都幾複雜。', 'zou6 dou1 gei2 fuk1 zaap6', 'Being an ABC is quite complicated.'),
        ('9a83e370-d324-4bfb-98fe-cb803811fb4b', '我可能會遲到，到時再text你。', 'ngo5 ho2 nang4 wui5 ci4 dou3 dou3 si4 zoi3 text nei5', 'I might be late; I''ll text you then.', '我可能會遲到，到時再text你。', 'ngo5 ho2 nang4 wui5 ci4 dou3 dou3 si4 zoi3 nei5', 'I might be late; I''ll text you then.'),
        ('773a94cb-c6c4-42bc-9a7d-994d6070a41b', '幾好喎，你有冇LinkedIn呀?', 'gei2 hou2 wo3 nei5 jau5 mou5 LinkedIn aa3', 'That''s great! Do you have LinkedIn?', '幾好喎，你有冇LinkedIn呀?', 'gei2 hou2 wo3 nei5 jau5 mou5 aa3', 'That''s great! Do you have LinkedIn?'),
        ('3d89103b-02bc-4f6e-b8ed-b56ba8db8b63', '你可以 add 我。', 'nei5 ho2 ji5 add ngo5', 'You can add me.', '你可以 add 我。', 'nei5 ho2 ji5 ngo5', 'You can add me.'),
        ('578b9a70-8be0-4cf7-b0d3-9728e622fa0f', '咁你改完個proposal之後', 'gam2 nei5 goi2 jyun4 go3 proposal zi1 hau6', 'So after you revise the proposal.', '咁你改完個proposal之後', 'gam2 nei5 goi2 jyun4 go3 zi1 hau6', 'So after you revise the proposal.'),
        ('c3adec78-1e39-4307-967c-fdc3e0e5b927', '再send出嚟俾大家睇下', 'zoi3 send ceot1 lei4 bei2 daai6 gaa1 tai2 haa5', 'Send it out for everyone to see.', '再send出嚟俾大家睇下', 'zoi3 ceot1 lei4 bei2 daai6 gaa1 tai2 haa5', 'Send it out for everyone to see.'),
        ('742b7dec-8055-43d8-86eb-df42fba38861', '冇問題，我同marketing嗰邊夾一夾。', 'mou5 man6 tai4 ngo5 tung4 Marketing go2 bin1 gaap3 jat1 gaap3', 'No problem, I''ll coordinate with the marketing team.', '冇問題，我同marketing嗰邊夾一夾。', 'mou5 man6 tai4 ngo5 tung4 go2 bin1 gaap3 jat1 gaap3', 'No problem, I''ll coordinate with the marketing team.')
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
  END LOOP;
END
$migration$;
