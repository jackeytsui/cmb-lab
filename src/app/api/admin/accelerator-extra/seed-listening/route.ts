import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { listeningQuestions } from "@/db/schema";
import { count } from "drizzle-orm";

const QUESTIONS = [
  { sortOrder: 1, chineseText: "你是哪里人？", correctPinyin: "ni shi na li ren", wrongPinyin1: "ni shi na li ma", wrongPinyin2: "ni shi na ge ren", wrongPinyin3: "ni shi na li de" },
  { sortOrder: 2, chineseText: "我刚刚搬来纽约。", correctPinyin: "wo gang gang ban lai niu yue", wrongPinyin1: "wo gang gang qu lai niu yue", wrongPinyin2: "wo gang gang ban qu niu yue", wrongPinyin3: "wo gang gang ban lai bei jing" },
  { sortOrder: 3, chineseText: "你为什么决定搬来这里？", correctPinyin: "ni wei shen me jue ding ban lai zhe li", wrongPinyin1: "ni wei shen me jue ding qu zhe li", wrongPinyin2: "ni wei shen me xiang lai zhe li", wrongPinyin3: "ni wei shen me jue ding ban lai na li" },
  { sortOrder: 4, chineseText: "你喜欢住在这里吗？", correctPinyin: "ni xi huan zhu zai zhe li ma", wrongPinyin1: "ni xi huan qu zai zhe li ma", wrongPinyin2: "ni xi huan zhu zai na li ma", wrongPinyin3: "ni xi huan chi zai zhe li ma" },
  { sortOrder: 5, chineseText: "大家都很友善。", correctPinyin: "da jia dou hen you shan", wrongPinyin1: "da jia dou hen re qing", wrongPinyin2: "da jia ye hen you shan", wrongPinyin3: "da jia dou bu you shan" },
  { sortOrder: 6, chineseText: "你需要帮忙吗？", correctPinyin: "ni xu yao bang mang ma", wrongPinyin1: "ni yao bu yao bang mang", wrongPinyin2: "ni xu yao mai dong xi ma", wrongPinyin3: "ni xu yao kan yi kan ma" },
  { sortOrder: 7, chineseText: "有什么可以帮到你？", correctPinyin: "you shen me ke yi bang dao ni", wrongPinyin1: "you shen me ke yi wen ni", wrongPinyin2: "you shen me ke yi kan ni", wrongPinyin3: "you shen me ke yi gei ni" },
  { sortOrder: 8, chineseText: "请问酱油在哪里？", correctPinyin: "qing wen jiang you zai na li", wrongPinyin1: "qing wen jiang you zai zhe li", wrongPinyin2: "qing wen jiang you mai duo shao", wrongPinyin3: "qing wen jiang you shi shen me" },
  { sortOrder: 9, chineseText: "这包米多少钱？", correctPinyin: "zhe bao mi duo shao qian", wrongPinyin1: "zhe ge mi duo shao qian", wrongPinyin2: "zhe bao mi zen me mai", wrongPinyin3: "zhe bao mi duo shao ge" },
  { sortOrder: 10, chineseText: "我想要一磅鸡胸肉。", correctPinyin: "wo xiang yao yi bang ji xiong rou", wrongPinyin1: "wo xiang yao liang bang ji xiong rou", wrongPinyin2: "wo xiang mai yi bang ji rou", wrongPinyin3: "wo xiang yao yi bang zhu rou" },
  { sortOrder: 11, chineseText: "鸡胸肉每磅八块。", correctPinyin: "ji xiong rou mei bang ba kuai", wrongPinyin1: "ji xiong rou mei bang shi kuai", wrongPinyin2: "ji rou mei bang ba kuai", wrongPinyin3: "ji xiong rou mei jin ba kuai" },
  { sortOrder: 12, chineseText: "还要其他东西吗？", correctPinyin: "hai yao qi ta dong xi ma", wrongPinyin1: "hai yao bie de ma", wrongPinyin2: "hai yao shen me ma", wrongPinyin3: "hai yao chi de ma" },
  { sortOrder: 13, chineseText: "最近的地铁站怎么走？", correctPinyin: "zui jin de di tie zhan zen me zou", wrongPinyin1: "zui jin de gong jiao zhan zen me zou", wrongPinyin2: "di tie zhan zai na li", wrongPinyin3: "zui jin de di tie zen me qu" },
  { sortOrder: 14, chineseText: "一直往前走。", correctPinyin: "yi zhi wang qian zou", wrongPinyin1: "yi zhi wang hou zou", wrongPinyin2: "yi zhi wang you zou", wrongPinyin3: "yi zhi wang zuo zou" },
  { sortOrder: 15, chineseText: "到第二个路口右转。", correctPinyin: "dao di er ge lu kou you zhuan", wrongPinyin1: "dao di yi ge lu kou you zhuan", wrongPinyin2: "dao di er ge lu kou zuo zhuan", wrongPinyin3: "dao di san ge lu kou you zhuan" },
  { sortOrder: 16, chineseText: "图书馆对面就是地铁站了。", correctPinyin: "tu shu guan dui mian jiu shi di tie zhan le", wrongPinyin1: "tu shu guan hou mian jiu shi di tie zhan le", wrongPinyin2: "tu shu guan dui mian shi gong jiao zhan", wrongPinyin3: "tu shu guan dui mian jiu shi shang dian le" },
  { sortOrder: 17, chineseText: "你知道要走多久吗？", correctPinyin: "ni zhi dao yao zou duo jiu ma", wrongPinyin1: "ni zhi dao yao deng duo jiu ma", wrongPinyin2: "ni zhi dao yao qu na li ma", wrongPinyin3: "ni zhi dao yao hua duo shao qian ma" },
  { sortOrder: 18, chineseText: "大概五分钟就到了。", correctPinyin: "da gai wu fen zhong jiu dao le", wrongPinyin1: "da gai shi fen zhong jiu dao le", wrongPinyin2: "da gai wu fen zhong cai dao", wrongPinyin3: "da gai wu fen zhong jiu zou le" },
  { sortOrder: 19, chineseText: "好久不见。", correctPinyin: "hao jiu bu jian", wrongPinyin1: "hao jiu bu lai", wrongPinyin2: "hao jiu bu shuo", wrongPinyin3: "hao jiu bu qu" },
  { sortOrder: 20, chineseText: "你最近怎么样？", correctPinyin: "ni zui jin zen me yang", wrongPinyin1: "ni zui jin zai na li", wrongPinyin2: "ni zui jin mang bu mang", wrongPinyin3: "ni zui jin xi huan shen me" },
  { sortOrder: 21, chineseText: "我还在同一家公司工作。", correctPinyin: "wo hai zai tong yi jia gong si gong zuo", wrongPinyin1: "wo hai zai na jia gong si gong zuo", wrongPinyin2: "wo zai xin gong si gong zuo", wrongPinyin3: "wo hai zai tong yi ge di fang gong zuo" },
  { sortOrder: 22, chineseText: "你有旅行的计划吗？", correctPinyin: "ni you lv xing de ji hua ma", wrongPinyin1: "ni you gong zuo de ji hua ma", wrongPinyin2: "ni xi huan lv xing ma", wrongPinyin3: "ni yao qu lv xing ma" },
  { sortOrder: 23, chineseText: "我下个礼拜会回家探望我爸妈。", correctPinyin: "wo xia ge li bai hui hui jia tan wang wo ba ma", wrongPinyin1: "wo xia ge li bai hui qu gong si gong zuo", wrongPinyin2: "wo xia ge li bai hui qu lv xing", wrongPinyin3: "wo xia ge li bai hui kan peng you" },
  { sortOrder: 24, chineseText: "你发短信给我。", correctPinyin: "ni fa duan xin gei wo", wrongPinyin1: "ni da dian hua gei wo", wrongPinyin2: "ni fa you jian gei wo", wrongPinyin3: "ni gei wo da dian hua" },
  { sortOrder: 25, chineseText: "请问有没有订位？", correctPinyin: "qing wen you mei you ding wei", wrongPinyin1: "qing wen you mei you kong wei", wrongPinyin2: "qing wen ke yi jin qu ma", wrongPinyin3: "qing wen ji dian kai men" },
  { sortOrder: 26, chineseText: "炸酱面是我们的招牌菜。", correctPinyin: "zha jiang mian shi wo men de zhao pai cai", wrongPinyin1: "zha jiang mian shi wo men de jia chang cai", wrongPinyin2: "zha jiang mian shi wo men de re men cai", wrongPinyin3: "zha jiang mian shi wo men de xin cai" },
  { sortOrder: 27, chineseText: "我对花生过敏。", correctPinyin: "wo dui hua sheng guo min", wrongPinyin1: "wo dui hai xian guo min", wrongPinyin2: "wo bu xi huan hua sheng", wrongPinyin3: "wo dui hua sheng mei xing qu" },
  { sortOrder: 28, chineseText: "你要饮料吗？", correctPinyin: "ni yao yin liao ma", wrongPinyin1: "ni yao chi fan ma", wrongPinyin2: "ni yao he shui ma", wrongPinyin3: "ni yao dian shen me ma" },
  { sortOrder: 29, chineseText: "麻烦帮我拿一个盒子过来。", correctPinyin: "ma fan bang wo na yi ge he zi guo lai", wrongPinyin1: "ma fan bang wo na yi ge dai zi guo lai", wrongPinyin2: "ma fan bang wo mai yi ge he zi", wrongPinyin3: "ma fan bang wo kan yi kan he zi" },
  { sortOrder: 30, chineseText: "请问你想刷卡还是付现金？", correctPinyin: "qing wen ni xiang shua ka hai shi fu xian jin", wrongPinyin1: "qing wen ni xiang yong shen me fu qian", wrongPinyin2: "qing wen ni you mei you ka", wrongPinyin3: "qing wen ni xiang mai shen me" },
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
