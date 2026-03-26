/**
 * Replace all typing drill content with the correct phrases.
 * All Cantonese text uses simplified characters.
 *
 * Run: npx tsx src/scripts/seed-typing-content.ts
 */

import { db } from "@/db";
import { typingSentences, typingProgress } from "@/db/schema";
import { sql } from "drizzle-orm";

const PHRASES: {
  english: string;
  mandarin: string;
  mandarinPinyin: string;
  cantonese: string;
  cantoneseJyutping: string;
}[] = [
  {
    english: "You got this!",
    mandarin: "加油！",
    mandarinPinyin: "jiā yóu!",
    cantonese: "加油！",
    cantoneseJyutping: "gaa1 jau4!",
  },
  {
    english: "Sure / That works.",
    mandarin: "可以啊。",
    mandarinPinyin: "kě yǐ a.",
    cantonese: "可以啊。",
    cantoneseJyutping: "ho2 ji5 aa3.",
  },
  {
    english: "I'll wait for you.",
    mandarin: "我等你。",
    mandarinPinyin: "wǒ děng nǐ.",
    cantonese: "我等你。",
    cantoneseJyutping: "ngo5 dang2 nei5.",
  },
  {
    english: "See you tomorrow.",
    mandarin: "明天见。",
    mandarinPinyin: "míng tiān jiàn.",
    cantonese: "听日见。",
    cantoneseJyutping: "ting1 jat6 gin3.",
  },
  {
    english: "Where are you?",
    mandarin: "你在哪儿？",
    mandarinPinyin: "nǐ zài nǎr?",
    cantonese: "你喺边度？",
    cantoneseJyutping: "nei5 hai2 bin1 dou6?",
  },
  {
    english: "Okay, no problem.",
    mandarin: "好的，没问题。",
    mandarinPinyin: "hǎo de, méi wèn tí.",
    cantonese: "好啊，冇问题。",
    cantoneseJyutping: "hou2 aa3, mou5 man6 tai4.",
  },
  {
    english: "Wait for me a moment.",
    mandarin: "等我一下。",
    mandarinPinyin: "děng wǒ yī xià.",
    cantonese: "等我一阵。",
    cantoneseJyutping: "dang2 ngo5 jat1 zan6.",
  },
  {
    english: "I'll be five minutes late.",
    mandarin: "我会迟到五分钟。",
    mandarinPinyin: "wǒ huì chí dào wǔ fēn zhōng.",
    cantonese: "我会迟到五分钟。",
    cantoneseJyutping: "ngo5 wui5 ci4 dou3 ng5 fan1 zung1.",
  },
  {
    english: "Are you busy today?",
    mandarin: "今天忙不忙？",
    mandarinPinyin: "jīn tiān máng bù máng?",
    cantonese: "今日忙唔忙？",
    cantoneseJyutping: "gam1 jat6 mong4 m4 mong4?",
  },
  {
    english: "I'm at home.",
    mandarin: "我在家。",
    mandarinPinyin: "wǒ zài jiā.",
    cantonese: "我喺屋企。",
    cantoneseJyutping: "ngo5 hai2 uk1 kei5.",
  },
  {
    english: "What are you doing?",
    mandarin: "你在干嘛？",
    mandarinPinyin: "nǐ zài gàn ma?",
    cantonese: "你做紧咩？",
    cantoneseJyutping: "nei5 zou6 gan2 me1?",
  },
  {
    english: "I've arrived.",
    mandarin: "我到了。",
    mandarinPinyin: "wǒ dào le.",
    cantonese: "我到咗。",
    cantoneseJyutping: "ngo5 dou3 zo2.",
  },
  {
    english: "I'll reply later.",
    mandarin: "我迟点再回复你。",
    mandarinPinyin: "wǒ chí diǎn zài huí fù nǐ.",
    cantonese: "我迟啲再覆你。",
    cantoneseJyutping: "ngo5 ci4 di1 zoi3 fuk1 nei5.",
  },
  {
    english: "I can't, I'm busy today.",
    mandarin: "不行，我今天有事。",
    mandarinPinyin: "bù xíng, wǒ jīn tiān yǒu shì.",
    cantonese: "唔得，我今日有嘢做。",
    cantoneseJyutping: "m4 dak1, ngo5 gam1 jat6 jau5 je5 zou6.",
  },
  {
    english: "Let me know when you arrive.",
    mandarin: "到了跟我说一声。",
    mandarinPinyin: "dào le gēn wǒ shuō yī shēng.",
    cantonese: "到咗同我讲声。",
    cantoneseJyutping: "dou3 zo2 tung4 ngo5 gong2 seng1.",
  },
  {
    english: "Good night, sleep early.",
    mandarin: "晚安，早点睡。",
    mandarinPinyin: "wǎn ān, zǎo diǎn shuì.",
    cantonese: "早唞，早啲瞓。",
    cantoneseJyutping: "zou2 tau2, zou2 di1 fan3.",
  },
];

async function seed() {
  console.log(`Seeding ${PHRASES.length} phrase pairs (${PHRASES.length * 2} sentences)...`);

  // Clear existing progress and sentences
  await db.delete(typingProgress);
  console.log("Cleared typing progress");
  await db.delete(typingSentences);
  console.log("Cleared existing typing sentences");

  // Insert new sentences
  const rows = PHRASES.flatMap((phrase, idx) => [
    {
      language: "cantonese" as const,
      chineseText: phrase.cantonese,
      englishText: phrase.english,
      romanisation: phrase.cantoneseJyutping,
      sortOrder: idx + 1,
    },
    {
      language: "mandarin" as const,
      chineseText: phrase.mandarin,
      englishText: phrase.english,
      romanisation: phrase.mandarinPinyin,
      sortOrder: idx + 1,
    },
  ]);

  await db.insert(typingSentences).values(rows);
  console.log(`Inserted ${rows.length} sentences (${PHRASES.length} pairs)`);
  console.log("Done!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
