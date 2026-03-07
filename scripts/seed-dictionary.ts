/**
 * Dictionary Seed Script
 *
 * Seeds dictionary_entries and character_data tables from three data sources:
 * - CC-CEDICT (~124K bilingual dictionary entries)
 * - CC-Canto (~22K jyutping readings + ~34K Cantonese-specific entries)
 * - Make Me a Hanzi (~9K character decomposition/stroke/etymology data)
 *
 * Idempotent: uses onConflictDoNothing() so re-running is safe.
 *
 * Usage: npm run db:seed-dictionary
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { convert } from "pinyin-pro";
import ToJyutping from "to-jyutping";
import { readFileSync } from "fs";
import { dictionaryEntries, characterData } from "../src/db/schema";
import {
  parseCedictLine,
  parseCantoLine,
  parseMakeHanziDictionary,
  parseMakeHanziGraphics,
  normalizeCedictPinyin,
} from "../src/lib/dictionary-parsers";

// Load environment variables from .env.local
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("Error: DATABASE_URL environment variable is not set");
  console.error("Please configure DATABASE_URL in .env.local");
  process.exit(1);
}

const sqlClient = neon(process.env.DATABASE_URL);
const db = drizzle(sqlClient);

// ============================================================
// Kangxi Radicals Meaning Map (~214 radicals)
// ============================================================

const KANGXI_RADICALS: Record<string, string> = {
  "一": "one",
  "丨": "line",
  "丶": "dot",
  "丿": "slash",
  "乙": "second",
  "亅": "hook",
  "二": "two",
  "亠": "lid",
  "人": "person",
  "亻": "person",
  "儿": "legs",
  "入": "enter",
  "八": "eight",
  "冂": "down box",
  "冖": "cover",
  "冫": "ice",
  "几": "table",
  "凵": "open box",
  "刀": "knife",
  "刂": "knife",
  "力": "power",
  "勹": "wrap",
  "匕": "spoon",
  "匚": "box",
  "匸": "hiding",
  "十": "ten",
  "卜": "divination",
  "卩": "seal",
  "厂": "cliff",
  "厶": "private",
  "又": "again",
  "口": "mouth",
  "囗": "enclosure",
  "土": "earth",
  "士": "scholar",
  "夂": "go",
  "夊": "go slowly",
  "夕": "evening",
  "大": "big",
  "女": "woman",
  "子": "child",
  "宀": "roof",
  "寸": "inch",
  "小": "small",
  "尢": "lame",
  "尸": "corpse",
  "屮": "sprout",
  "山": "mountain",
  "巛": "river",
  "川": "river",
  "工": "work",
  "己": "oneself",
  "巾": "turban",
  "干": "dry",
  "幺": "small",
  "广": "shelter",
  "廴": "stride",
  "廾": "two hands",
  "弋": "shoot",
  "弓": "bow",
  "彐": "snout",
  "彡": "bristle",
  "彳": "step",
  "心": "heart",
  "忄": "heart",
  "戈": "halberd",
  "戶": "door",
  "户": "door",
  "手": "hand",
  "扌": "hand",
  "支": "branch",
  "攴": "rap",
  "攵": "rap",
  "文": "script",
  "斗": "dipper",
  "斤": "axe",
  "方": "square",
  "无": "not",
  "日": "sun",
  "曰": "say",
  "月": "moon",
  "木": "tree",
  "欠": "lack",
  "止": "stop",
  "歹": "death",
  "殳": "weapon",
  "毋": "do not",
  "比": "compare",
  "毛": "fur",
  "氏": "clan",
  "气": "steam",
  "水": "water",
  "氵": "water",
  "火": "fire",
  "灬": "fire",
  "爪": "claw",
  "父": "father",
  "爻": "mix",
  "爿": "split wood",
  "片": "slice",
  "牙": "fang",
  "牛": "cow",
  "犬": "dog",
  "犭": "dog",
  "玄": "dark",
  "玉": "jade",
  "王": "jade",
  "瓜": "melon",
  "瓦": "tile",
  "甘": "sweet",
  "生": "life",
  "用": "use",
  "田": "field",
  "疋": "bolt of cloth",
  "疒": "illness",
  "癶": "footsteps",
  "白": "white",
  "皮": "skin",
  "皿": "dish",
  "目": "eye",
  "矛": "spear",
  "矢": "arrow",
  "石": "stone",
  "示": "spirit",
  "礻": "spirit",
  "禸": "track",
  "禾": "grain",
  "穴": "cave",
  "立": "stand",
  "竹": "bamboo",
  "米": "rice",
  "糸": "silk",
  "纟": "silk",
  "缶": "jar",
  "网": "net",
  "罒": "net",
  "羊": "sheep",
  "羽": "feather",
  "老": "old",
  "而": "and",
  "耒": "plow",
  "耳": "ear",
  "聿": "brush",
  "肉": "meat",
  "臣": "minister",
  "自": "self",
  "至": "arrive",
  "臼": "mortar",
  "舌": "tongue",
  "舛": "oppose",
  "舟": "boat",
  "艮": "stopping",
  "色": "color",
  "艸": "grass",
  "艹": "grass",
  "虍": "tiger",
  "虫": "insect",
  "血": "blood",
  "行": "walk",
  "衣": "clothes",
  "衤": "clothes",
  "襾": "west",
  "見": "see",
  "角": "horn",
  "言": "speech",
  "訁": "speech",
  "谷": "valley",
  "豆": "bean",
  "豕": "pig",
  "豸": "badger",
  "貝": "shell",
  "赤": "red",
  "走": "run",
  "足": "foot",
  "身": "body",
  "車": "cart",
  "辛": "bitter",
  "辰": "morning",
  "辵": "walk",
  "辶": "walk",
  "邑": "city",
  "阝": "city",
  "酉": "wine",
  "釆": "distinguish",
  "里": "village",
  "金": "gold",
  "釒": "gold",
  "長": "long",
  "門": "gate",
  "阜": "mound",
  "隶": "slave",
  "隹": "short-tailed bird",
  "雨": "rain",
  "靑": "blue",
  "青": "blue",
  "非": "wrong",
  "面": "face",
  "革": "leather",
  "韋": "tanned leather",
  "韭": "leek",
  "音": "sound",
  "頁": "leaf",
  "風": "wind",
  "飛": "fly",
  "食": "eat",
  "飠": "eat",
  "首": "head",
  "香": "fragrant",
  "馬": "horse",
  "骨": "bone",
  "高": "tall",
  "髟": "hair",
  "鬥": "fight",
  "鬯": "sacrificial wine",
  "鬲": "cauldron",
  "鬼": "ghost",
  "魚": "fish",
  "鳥": "bird",
  "鹵": "salt",
  "鹿": "deer",
  "麥": "wheat",
  "麻": "hemp",
  "黃": "yellow",
  "黍": "millet",
  "黑": "black",
  "黹": "embroidery",
  "黽": "frog",
  "鼎": "tripod",
  "鼓": "drum",
  "鼠": "rat",
  "鼻": "nose",
  "齊": "even",
  "齒": "tooth",
  "龍": "dragon",
  "龜": "turtle",
  "龠": "flute",
  // Common variant forms
  "⺀": "ice",
  "⺌": "small",
  "⺍": "small",
  "⺊": "divination",
  "⺈": "knife",
  "⺮": "bamboo",
  "⺡": "water",
  "⺣": "fire",
  "⺪": "net",
  "⺫": "eye",
  "⺬": "spirit",
  "⺭": "spirit",
  "⺶": "sheep",
  "⺹": "old",
  "⺼": "meat",
  "⻏": "city",
  "⻖": "mound",
  "⻗": "rain",
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * Convert numbered pinyin (with u: normalization and tone 5 handling) to tone marks.
 * CEDICT uses tone 5 for neutral tone; pinyin-pro doesn't handle it.
 */
function convertToPinyinDisplay(rawPinyin: string): string {
  // First normalize u: -> v
  let normalized = normalizeCedictPinyin(rawPinyin);
  // Replace tone 5 (neutral) with no number — pinyin-pro treats numberless as neutral
  normalized = normalized.replace(/([a-zA-Zv])5/g, "$1");
  try {
    return convert(normalized);
  } catch {
    return rawPinyin;
  }
}

/**
 * Generic batch insert with progress logging.
 * Uses onConflictDoNothing for idempotency.
 * On batch failure, retries row-by-row.
 */
async function batchInsert<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  label: string,
  batchSize = 500
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.insert(table).values(batch as any) as any).onConflictDoNothing();
      inserted += batch.length;
    } catch (err) {
      console.warn(
        `  Batch ${i}-${i + batch.length} failed for ${label}, retrying row-by-row...`
      );
      // Retry row-by-row
      for (const row of batch) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db.insert(table).values(row as any) as any).onConflictDoNothing();
          inserted++;
        } catch (rowErr) {
          // Skip this row
          console.warn(`  Skipped row in ${label}:`, (rowErr as Error).message?.slice(0, 80));
        }
      }
    }

    if ((i + batchSize) % 5000 < batchSize || i + batchSize >= rows.length) {
      console.log(
        `  ${label}: ${Math.min(i + batchSize, rows.length)}/${rows.length} processed`
      );
    }
  }

  return inserted;
}

// ============================================================
// Phase A: Seed CC-CEDICT
// ============================================================

async function seedCedict(): Promise<number> {
  console.log("\n=== Phase A: Seeding CC-CEDICT ===");

  const content = readFileSync("data/cedict_ts.u8", "utf-8");
  const lines = content.split("\n");

  const rows: Record<string, unknown>[] = [];

  for (const line of lines) {
    const entry = parseCedictLine(line);
    if (!entry) continue;

    rows.push({
      traditional: entry.traditional,
      simplified: entry.simplified,
      pinyin: entry.pinyin,
      pinyinDisplay: convertToPinyinDisplay(entry.pinyin),
      definitions: entry.definitions,
      source: "cedict" as const,
      isSingleChar: entry.traditional.length === 1,
    });
  }

  console.log(`  Parsed ${rows.length} CC-CEDICT entries`);

  const inserted = await batchInsert(dictionaryEntries, rows, "CC-CEDICT", 500);
  console.log(`  Inserted ${inserted} CC-CEDICT entries`);

  return rows.length;
}

// ============================================================
// Phase B: Merge CC-Canto data
// ============================================================

async function seedCantoReadings(): Promise<number> {
  console.log("\n=== Phase B1: Merging CC-Canto readings (jyutping for CEDICT entries) ===");

  const content = readFileSync("data/cccedict-canto-readings-150923.txt", "utf-8");
  const lines = content.split("\n");

  // Parse all readings into memory
  const readings: Array<{
    traditional: string;
    simplified: string;
    pinyin: string;
    jyutping: string;
  }> = [];

  for (const line of lines) {
    const entry = parseCantoLine(line);
    if (!entry || !entry.jyutping) continue;
    readings.push({
      traditional: entry.traditional,
      simplified: entry.simplified,
      pinyin: entry.pinyin,
      jyutping: entry.jyutping,
    });
  }

  console.log(`  Parsed ${readings.length} readings`);

  // Batch update using raw SQL with VALUES list for performance
  // Process in batches of 200 to keep query size manageable
  const batchSize = 200;
  let totalUpdated = 0;

  for (let i = 0; i < readings.length; i += batchSize) {
    const batch = readings.slice(i, i + batchSize);

    // Build a VALUES list for the batch update
    const valuesList = batch
      .map((r) => {
        const trad = r.traditional.replace(/'/g, "''");
        const simp = r.simplified.replace(/'/g, "''");
        const pin = r.pinyin.replace(/'/g, "''");
        const jyut = r.jyutping.replace(/'/g, "''");
        return `('${trad}', '${simp}', '${pin}', '${jyut}')`;
      })
      .join(",\n");

    const updateQuery = `
      UPDATE dictionary_entries AS de
      SET jyutping = v.jyutping, source = 'both'::dictionary_source
      FROM (VALUES ${valuesList}) AS v(traditional, simplified, pinyin, jyutping)
      WHERE de.traditional = v.traditional
        AND de.simplified = v.simplified
        AND de.pinyin = v.pinyin
    `;

    try {
      await sqlClient.query(updateQuery, []);
      totalUpdated += batch.length;
    } catch (err) {
      console.warn(`  Batch ${i}-${i + batch.length} update failed:`, (err as Error).message?.slice(0, 100));
    }

    if ((i + batchSize) % 5000 < batchSize || i + batchSize >= readings.length) {
      console.log(`  Readings: ${Math.min(i + batchSize, readings.length)}/${readings.length} processed`);
    }
  }

  console.log(`  Updated ${totalUpdated} readings in batches`);
  return readings.length;
}

async function seedCantoDictionary(): Promise<number> {
  console.log("\n=== Phase B2: Seeding CC-Canto dictionary entries ===");

  const content = readFileSync("data/cccanto-webdist.txt", "utf-8");
  const lines = content.split("\n");

  // First pass: collect all entries
  const cantoEntries: Array<{
    traditional: string;
    simplified: string;
    pinyin: string;
    jyutping: string | null;
    definitions: string[];
  }> = [];

  for (const line of lines) {
    const entry = parseCantoLine(line);
    if (!entry) continue;
    cantoEntries.push(entry);
  }

  console.log(`  Parsed ${cantoEntries.length} CC-Canto dictionary entries`);

  // Step 1: Batch update jyutping for entries that match existing CEDICT entries
  const entriesWithJyutping = cantoEntries.filter((e) => e.jyutping);
  const batchSize = 200;
  let totalUpdated = 0;

  console.log(`  Updating jyutping for ${entriesWithJyutping.length} entries with existing CEDICT matches...`);

  for (let i = 0; i < entriesWithJyutping.length; i += batchSize) {
    const batch = entriesWithJyutping.slice(i, i + batchSize);
    const valuesList = batch
      .map((r) => {
        const trad = r.traditional.replace(/'/g, "''");
        const simp = r.simplified.replace(/'/g, "''");
        const pin = r.pinyin.replace(/'/g, "''");
        const jyut = (r.jyutping ?? "").replace(/'/g, "''");
        return `('${trad}', '${simp}', '${pin}', '${jyut}')`;
      })
      .join(",\n");

    const updateQuery = `
      UPDATE dictionary_entries AS de
      SET jyutping = v.jyutping, source = 'both'::dictionary_source
      FROM (VALUES ${valuesList}) AS v(traditional, simplified, pinyin, jyutping)
      WHERE de.traditional = v.traditional
        AND de.simplified = v.simplified
        AND de.pinyin = v.pinyin
    `;

    try {
      await sqlClient.query(updateQuery, []);
      totalUpdated += batch.length;
    } catch (err) {
      console.warn(`  Batch update failed:`, (err as Error).message?.slice(0, 100));
    }

    if ((i + batchSize) % 5000 < batchSize || i + batchSize >= entriesWithJyutping.length) {
      console.log(`  Update pass: ${Math.min(i + batchSize, entriesWithJyutping.length)}/${entriesWithJyutping.length} processed`);
    }
  }

  console.log(`  Attempted jyutping update for ${totalUpdated} entries`);

  // Step 2: Insert all canto entries as new rows with source='canto'
  // onConflictDoNothing will skip entries that already exist (same id won't collide since UUIDs)
  // But we have no unique constraint on traditional+simplified+pinyin, so we need to
  // check which entries DON'T already have a match to avoid duplicates.
  // Strategy: Insert all as 'canto', they'll get unique UUIDs. Then the data has both
  // the CEDICT version and the Canto version. This is actually fine for a dictionary —
  // multiple entries for the same word with different definitions is normal.
  // However, for entries already updated to 'both' above, we should skip insertion.
  // The simplest approach: just insert all canto entries. The CEDICT entries keep their
  // existing rows (now with jyutping), and canto-specific entries get new rows.
  // To avoid duplicating entries that were already merged, we check if a CEDICT entry exists.

  // For efficiency, collect all traditional+simplified+pinyin triples we need to check
  // and batch-check them in SQL.
  const newRows: Record<string, unknown>[] = [];

  // Process in chunks for the existence check
  const checkBatchSize = 500;
  for (let i = 0; i < cantoEntries.length; i += checkBatchSize) {
    const batch = cantoEntries.slice(i, i + checkBatchSize);

    // Build a VALUES list for existence check
    const valuesList = batch
      .map((r) => {
        const trad = r.traditional.replace(/'/g, "''");
        const simp = r.simplified.replace(/'/g, "''");
        const pin = r.pinyin.replace(/'/g, "''");
        return `('${trad}', '${simp}', '${pin}')`;
      })
      .join(",\n");

    const existsQuery = `
      SELECT v.traditional, v.simplified, v.pinyin
      FROM (VALUES ${valuesList}) AS v(traditional, simplified, pinyin)
      WHERE EXISTS (
        SELECT 1 FROM dictionary_entries de
        WHERE de.traditional = v.traditional
          AND de.simplified = v.simplified
          AND de.pinyin = v.pinyin
      )
    `;

    try {
      const existing = await sqlClient.query(existsQuery, []);
      const existingSet = new Set(
        existing.map(
          (r: Record<string, string>) => `${r.traditional}|${r.simplified}|${r.pinyin}`
        )
      );

      for (const entry of batch) {
        const key = `${entry.traditional}|${entry.simplified}|${entry.pinyin}`;
        if (!existingSet.has(key)) {
          newRows.push({
            traditional: entry.traditional,
            simplified: entry.simplified,
            pinyin: entry.pinyin,
            pinyinDisplay: convertToPinyinDisplay(entry.pinyin),
            jyutping: entry.jyutping,
            definitions: entry.definitions,
            source: "canto" as const,
            isSingleChar: entry.traditional.length === 1,
          });
        }
      }
    } catch (err) {
      // Fallback: add all entries from this batch as new
      console.warn(`  Existence check failed, inserting batch as new:`, (err as Error).message?.slice(0, 100));
      for (const entry of batch) {
        newRows.push({
          traditional: entry.traditional,
          simplified: entry.simplified,
          pinyin: entry.pinyin,
          pinyinDisplay: convertToPinyinDisplay(entry.pinyin),
          jyutping: entry.jyutping,
          definitions: entry.definitions,
          source: "canto" as const,
          isSingleChar: entry.traditional.length === 1,
        });
      }
    }

    if ((i + checkBatchSize) % 5000 < checkBatchSize || i + checkBatchSize >= cantoEntries.length) {
      console.log(`  Existence check: ${Math.min(i + checkBatchSize, cantoEntries.length)}/${cantoEntries.length} processed`);
    }
  }

  console.log(`  Found ${newRows.length} new canto-only entries to insert`);

  if (newRows.length > 0) {
    const inserted = await batchInsert(
      dictionaryEntries,
      newRows,
      "CC-Canto new entries",
      500
    );
    console.log(`  Inserted ${inserted} new CC-Canto-only entries`);
  }

  return cantoEntries.length;
}

// ============================================================
// Phase C: Seed Make Me a Hanzi
// ============================================================

async function seedMakeHanzi(): Promise<number> {
  console.log("\n=== Phase C: Seeding Make Me a Hanzi ===");

  const dictData = parseMakeHanziDictionary("data/dictionary.txt");
  const graphicsData = parseMakeHanziGraphics("data/graphics.txt");

  console.log(`  Parsed ${dictData.length} dictionary entries`);
  console.log(`  Parsed ${graphicsData.length} graphics entries`);

  // Build maps by character
  const dictMap = new Map(dictData.map((d) => [d.character, d]));
  const graphicsMap = new Map(graphicsData.map((g) => [g.character, g]));

  // Get all unique characters from both sources
  const allChars = new Set([...dictMap.keys(), ...graphicsMap.keys()]);

  const rows: Record<string, unknown>[] = [];

  for (const char of allChars) {
    const dict = dictMap.get(char);
    const graphics = graphicsMap.get(char);

    // Generate jyutping for the character
    let jyutpingArr: string[] | null = null;
    try {
      const jyutpingList = ToJyutping.getJyutpingList(char);
      if (jyutpingList && jyutpingList.length > 0) {
        const extracted = jyutpingList
          .map((tuple: [string, string | null]) => tuple[1])
          .filter((j: string | null): j is string => j !== null && j !== "");
        if (extracted.length > 0) {
          jyutpingArr = extracted;
        }
      }
    } catch {
      // jyutping generation failed, leave as null
    }

    const radical = dict?.radical ?? null;

    rows.push({
      character: char,
      pinyin: dict?.pinyin ?? null,
      jyutping: jyutpingArr,
      radical: radical,
      radicalMeaning: radical ? KANGXI_RADICALS[radical] ?? null : null,
      strokeCount: graphics?.strokes?.length ?? null,
      decomposition: dict?.decomposition ?? null,
      etymologyType: dict?.etymology?.type ?? null,
      etymologyHint: dict?.etymology?.hint ?? null,
      etymologyPhonetic: dict?.etymology?.phonetic ?? null,
      etymologySemantic: dict?.etymology?.semantic ?? null,
      definition: dict?.definition ?? null,
      strokePaths: graphics?.strokes ?? null,
      strokeMedians: graphics?.medians ?? null,
    });
  }

  console.log(`  Prepared ${rows.length} character_data rows`);

  const inserted = await batchInsert(characterData, rows, "Make Me a Hanzi", 500);
  console.log(`  Inserted ${inserted} character_data entries`);

  return rows.length;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("=== Dictionary Seed Script ===");
  console.log(`Started: ${new Date().toISOString()}\n`);

  const start = Date.now();

  // Check existing data — if tables already have data, truncate for clean seed
  const existingDict = await sqlClient.query("SELECT count(*) FROM dictionary_entries", []);
  const existingChar = await sqlClient.query("SELECT count(*) FROM character_data", []);
  const dictCount = parseInt(existingDict[0].count as string, 10);
  const charCount = parseInt(existingChar[0].count as string, 10);

  if (dictCount > 0 || charCount > 0) {
    console.log(`  Found existing data: ${dictCount} dictionary entries, ${charCount} character data`);
    console.log("  Truncating tables for clean re-seed...");
    await sqlClient.query("TRUNCATE dictionary_entries, character_data", []);
    console.log("  Tables truncated.\n");
  }

  // Phase A: CC-CEDICT
  const cedictCount = await seedCedict();

  // Phase B: CC-Canto
  const readingsCount = await seedCantoReadings();
  const cantoCount = await seedCantoDictionary();

  // Phase C: Make Me a Hanzi
  const hanziCount = await seedMakeHanzi();

  const duration = ((Date.now() - start) / 1000).toFixed(1);

  console.log("\n=== Seed Complete ===");
  console.log(`Duration: ${duration}s`);
  console.log(`CC-CEDICT entries: ${cedictCount}`);
  console.log(`CC-Canto readings: ${readingsCount}`);
  console.log(`CC-Canto dictionary: ${cantoCount}`);
  console.log(`Make Me a Hanzi characters: ${hanziCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
