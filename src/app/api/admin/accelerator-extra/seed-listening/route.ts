import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { listeningQuestions } from "@/db/schema";
import { count } from "drizzle-orm";

const QUESTIONS = [
  { sortOrder: 1, chineseText: "你是哪里人？", correctPinyin: "nǐ shì nǎ lǐ rén", wrongPinyin1: "nǐ shì nǎ lǐ ma", wrongPinyin2: "nǐ shì nǎ gè rén", wrongPinyin3: "nǐ shì nǎ lǐ de" },
  { sortOrder: 2, chineseText: "我刚刚搬来纽约。", correctPinyin: "wǒ gāng gāng bān lái niǔ yuē", wrongPinyin1: "wǒ gāng gāng qù lái niǔ yuē", wrongPinyin2: "wǒ gāng gāng bān qù niǔ yuē", wrongPinyin3: "wǒ gāng gāng bān lái běi jīng" },
  { sortOrder: 3, chineseText: "你为什么决定搬来这里？", correctPinyin: "nǐ wèi shén me jué dìng bān lái zhè lǐ", wrongPinyin1: "nǐ wèi shén me jué dìng qù zhè lǐ", wrongPinyin2: "nǐ wèi shén me xiǎng lái zhè lǐ", wrongPinyin3: "nǐ wèi shén me jué dìng bān lái nà lǐ" },
  { sortOrder: 4, chineseText: "你喜欢住在这里吗？", correctPinyin: "nǐ xǐ huan zhù zài zhè lǐ ma", wrongPinyin1: "nǐ xǐ huan qù zài zhè lǐ ma", wrongPinyin2: "nǐ xǐ huan zhù zài nà lǐ ma", wrongPinyin3: "nǐ xǐ huan chī zài zhè lǐ ma" },
  { sortOrder: 5, chineseText: "大家都很友善。", correctPinyin: "dà jiā dōu hěn yǒu shàn", wrongPinyin1: "dà jiā dōu hěn rè qíng", wrongPinyin2: "dà jiā yě hěn yǒu shàn", wrongPinyin3: "dà jiā dōu bù yǒu shàn" },
  { sortOrder: 6, chineseText: "你需要帮忙吗？", correctPinyin: "nǐ xū yào bāng máng ma", wrongPinyin1: "nǐ yào bu yào bāng máng", wrongPinyin2: "nǐ xū yào mǎi dōng xī ma", wrongPinyin3: "nǐ xū yào kàn yi kàn ma" },
  { sortOrder: 7, chineseText: "有什么可以帮到你？", correctPinyin: "yǒu shén me kě yǐ bāng dào nǐ", wrongPinyin1: "yǒu shén me kě yǐ wèn nǐ", wrongPinyin2: "yǒu shén me kě yǐ kàn nǐ", wrongPinyin3: "yǒu shén me kě yǐ gěi nǐ" },
  { sortOrder: 8, chineseText: "请问酱油在哪里？", correctPinyin: "qǐng wèn jiàng yóu zài nǎ lǐ", wrongPinyin1: "qǐng wèn jiàng yóu zài zhè lǐ", wrongPinyin2: "qǐng wèn jiàng yóu mài duō shǎo", wrongPinyin3: "qǐng wèn jiàng yóu shì shén me" },
  { sortOrder: 9, chineseText: "这包米多少钱？", correctPinyin: "zhè bāo mǐ duō shǎo qián", wrongPinyin1: "zhè ge mǐ duō shǎo qián", wrongPinyin2: "zhè bāo mǐ zěn me mài", wrongPinyin3: "zhè bāo mǐ duō shǎo gè" },
  { sortOrder: 10, chineseText: "我想要一磅鸡胸肉。", correctPinyin: "wǒ xiǎng yào yí bàng jī xiōng ròu", wrongPinyin1: "wǒ xiǎng yào liǎng bàng jī xiōng ròu", wrongPinyin2: "wǒ xiǎng mǎi yí bàng jī ròu", wrongPinyin3: "wǒ xiǎng yào yí bàng zhū ròu" },
  { sortOrder: 11, chineseText: "鸡胸肉每磅八块。", correctPinyin: "jī xiōng ròu měi bàng bā kuài", wrongPinyin1: "jī xiōng ròu měi bàng shí kuài", wrongPinyin2: "jī ròu měi bàng bā kuài", wrongPinyin3: "jī xiōng ròu měi jīn bā kuài" },
  { sortOrder: 12, chineseText: "还要其他东西吗？", correctPinyin: "hái yào qí tā dōng xī ma", wrongPinyin1: "hái yào bié de ma", wrongPinyin2: "hái yào shén me ma", wrongPinyin3: "hái yào chī de ma" },
  { sortOrder: 13, chineseText: "最近的地铁站怎么走？", correctPinyin: "zuì jìn de dì tiě zhàn zěn me zǒu", wrongPinyin1: "zuì jìn de gōng jiāo zhàn zěn me zǒu", wrongPinyin2: "dì tiě zhàn zài nǎ lǐ", wrongPinyin3: "zuì jìn de dì tiě zěn me qù" },
  { sortOrder: 14, chineseText: "一直往前走。", correctPinyin: "yì zhí wǎng qián zǒu", wrongPinyin1: "yì zhí wǎng hòu zǒu", wrongPinyin2: "yì zhí wǎng yòu zǒu", wrongPinyin3: "yì zhí wǎng zuǒ zǒu" },
  { sortOrder: 15, chineseText: "到第二个路口右转。", correctPinyin: "dào dì èr gè lù kǒu yòu zhuǎn", wrongPinyin1: "dào dì yī gè lù kǒu yòu zhuǎn", wrongPinyin2: "dào dì èr gè lù kǒu zuǒ zhuǎn", wrongPinyin3: "dào dì sān gè lù kǒu yòu zhuǎn" },
  { sortOrder: 16, chineseText: "图书馆对面就是地铁站了。", correctPinyin: "tú shū guǎn duì miàn jiù shì dì tiě zhàn le", wrongPinyin1: "tú shū guǎn hòu miàn jiù shì dì tiě zhàn le", wrongPinyin2: "tú shū guǎn duì miàn shì gōng jiāo zhàn", wrongPinyin3: "tú shū guǎn duì miàn jiù shì shāng diàn le" },
  { sortOrder: 17, chineseText: "你知道要走多久吗？", correctPinyin: "nǐ zhī dào yào zǒu duō jiǔ ma", wrongPinyin1: "nǐ zhī dào yào děng duō jiǔ ma", wrongPinyin2: "nǐ zhī dào yào qù nǎ lǐ ma", wrongPinyin3: "nǐ zhī dào yào huā duō shǎo qián ma" },
  { sortOrder: 18, chineseText: "大概五分钟就到了。", correctPinyin: "dà gài wǔ fēn zhōng jiù dào le", wrongPinyin1: "dà gài shí fēn zhōng jiù dào le", wrongPinyin2: "dà gài wǔ fēn zhōng cái dào", wrongPinyin3: "dà gài wǔ fēn zhōng jiù zǒu le" },
  { sortOrder: 19, chineseText: "好久不见。", correctPinyin: "hǎo jiǔ bú jiàn", wrongPinyin1: "hǎo jiǔ bù lái", wrongPinyin2: "hǎo jiǔ bù shuō", wrongPinyin3: "hǎo jiǔ bú qù" },
  { sortOrder: 20, chineseText: "你最近怎么样？", correctPinyin: "nǐ zuì jìn zěn me yàng", wrongPinyin1: "nǐ zuì jìn zài nǎ lǐ", wrongPinyin2: "nǐ zuì jìn máng bu máng", wrongPinyin3: "nǐ zuì jìn xǐ huan shén me" },
  { sortOrder: 21, chineseText: "我还在同一家公司工作。", correctPinyin: "wǒ hái zài tóng yì jiā gōng sī gōng zuò", wrongPinyin1: "wǒ hái zài nà jiā gōng sī gōng zuò", wrongPinyin2: "wǒ zài xīn gōng sī gōng zuò", wrongPinyin3: "wǒ hái zài tóng yí gè dì fāng gōng zuò" },
  { sortOrder: 22, chineseText: "你有旅行的计划吗？", correctPinyin: "nǐ yǒu lǚ xíng de jì huà ma", wrongPinyin1: "nǐ yǒu gōng zuò de jì huà ma", wrongPinyin2: "nǐ xǐ huan lǚ xíng ma", wrongPinyin3: "nǐ yào qù lǚ xíng ma" },
  { sortOrder: 23, chineseText: "我下个礼拜会回家探望我爸妈。", correctPinyin: "wǒ xià gè lǐ bài huì huí jiā tàn wàng wǒ bà mā", wrongPinyin1: "wǒ xià gè lǐ bài huì qù gōng sī gōng zuò", wrongPinyin2: "wǒ xià gè lǐ bài huì qù lǚ xíng", wrongPinyin3: "wǒ xià gè lǐ bài huì kàn péng yǒu" },
  { sortOrder: 24, chineseText: "你发短信给我。", correctPinyin: "nǐ fā duǎn xìn gěi wǒ", wrongPinyin1: "nǐ dǎ diàn huà gěi wǒ", wrongPinyin2: "nǐ fā yóu jiàn gěi wǒ", wrongPinyin3: "nǐ gěi wǒ dǎ diàn huà" },
  { sortOrder: 25, chineseText: "请问有没有订位？", correctPinyin: "qǐng wèn yǒu méi yǒu dìng wèi", wrongPinyin1: "qǐng wèn yǒu méi yǒu kòng wèi", wrongPinyin2: "qǐng wèn kě yǐ jìn qù ma", wrongPinyin3: "qǐng wèn jǐ diǎn kāi mén" },
  { sortOrder: 26, chineseText: "炸酱面是我们的招牌菜。", correctPinyin: "zhà jiàng miàn shì wǒ men de zhāo pái cài", wrongPinyin1: "zhà jiàng miàn shì wǒ men de jiā cháng cài", wrongPinyin2: "zhà jiàng miàn shì wǒ men de rè mén cài", wrongPinyin3: "zhà jiàng miàn shì wǒ men de xīn cài" },
  { sortOrder: 27, chineseText: "我对花生过敏。", correctPinyin: "wǒ duì huā shēng guò mǐn", wrongPinyin1: "wǒ duì hǎi xiān guò mǐn", wrongPinyin2: "wǒ bù xǐ huan huā shēng", wrongPinyin3: "wǒ duì huā shēng méi xìng qù" },
  { sortOrder: 28, chineseText: "你要饮料吗？", correctPinyin: "nǐ yào yǐn liào ma", wrongPinyin1: "nǐ yào chī fàn ma", wrongPinyin2: "nǐ yào hē shuǐ ma", wrongPinyin3: "nǐ yào diǎn shén me ma" },
  { sortOrder: 29, chineseText: "麻烦帮我拿一个盒子过来。", correctPinyin: "má fán bāng wǒ ná yí gè hé zi guò lái", wrongPinyin1: "má fán bāng wǒ ná yí gè dài zi guò lái", wrongPinyin2: "má fán bāng wǒ mǎi yí gè hé zi", wrongPinyin3: "má fán bāng wǒ kàn yi kàn hé zi" },
  { sortOrder: 30, chineseText: "请问你想刷卡还是付现金？", correctPinyin: "qǐng wèn nǐ xiǎng shuā kǎ hái shì fù xiàn jīn", wrongPinyin1: "qǐng wèn nǐ xiǎng yòng shén me fù qián", wrongPinyin2: "qǐng wèn nǐ yǒu méi yǒu kǎ", wrongPinyin3: "qǐng wèn nǐ xiǎng mǎi shén me" },
];

/**
 * POST /api/admin/accelerator-extra/seed-listening
 * One-time seed endpoint for listening training questions.
 * Idempotent — skips if questions already exist.
 */
export async function POST() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [existing] = await db.select({ count: count() }).from(listeningQuestions);
  if (existing.count > 0) {
    return NextResponse.json({
      message: `Already seeded — ${existing.count} questions exist.`,
      seeded: false,
    });
  }

  await db.insert(listeningQuestions).values(QUESTIONS);

  return NextResponse.json({
    message: `Seeded ${QUESTIONS.length} listening questions.`,
    seeded: true,
  });
}
