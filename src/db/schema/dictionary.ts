import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  smallint,
  boolean,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================
// Enums
// ============================================================

export const dictionarySourceEnum = pgEnum("dictionary_source", [
  "cedict",
  "canto",
  "both",
]);

// ============================================================
// Tables
// ============================================================

// Bilingual dictionary entries from CC-CEDICT and CC-Canto
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    traditional: varchar("traditional", { length: 50 }).notNull(),
    simplified: varchar("simplified", { length: 50 }).notNull(),
    pinyin: varchar("pinyin", { length: 200 }).notNull(), // numbered tones from CEDICT ("zhong1 guo2")
    pinyinDisplay: varchar("pinyin_display", { length: 200 }), // tone marks version
    jyutping: varchar("jyutping", { length: 200 }), // nullable — not all entries have Cantonese
    definitions: text("definitions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    source: dictionarySourceEnum("source").notNull().default("cedict"),
    isSingleChar: boolean("is_single_char").notNull().default(false), // populated during seeding
    frequencyRank: integer("frequency_rank"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("dictionary_entries_traditional_idx").on(table.traditional),
    index("dictionary_entries_simplified_idx").on(table.simplified),
    index("dictionary_entries_pinyin_idx").on(table.pinyin),
  ]
);

// Per-character radical, stroke, and etymology data from Make Me a Hanzi
// Uses the character itself as natural PK (lookups are always by character)
export const characterData = pgTable(
  "character_data",
  {
    character: varchar("character", { length: 1 }).primaryKey(),
    pinyin: text("pinyin").array(), // array of readings from Make Me a Hanzi
    jyutping: text("jyutping").array(), // from CC-Canto / to-jyutping
    radical: varchar("radical", { length: 4 }),
    radicalMeaning: varchar("radical_meaning", { length: 50 }),
    strokeCount: smallint("stroke_count"),
    decomposition: varchar("decomposition", { length: 100 }), // IDS string like "⿰亻尔"
    etymologyType: varchar("etymology_type", { length: 20 }), // pictographic/ideographic/pictophonetic
    etymologyHint: text("etymology_hint"), // learner-facing hint
    etymologyPhonetic: varchar("etymology_phonetic", { length: 10 }), // phonetic component
    etymologySemantic: varchar("etymology_semantic", { length: 10 }), // semantic component
    definition: text("definition"), // brief learner-friendly definition
    frequencyRank: integer("frequency_rank"),
    strokePaths: jsonb("stroke_paths"), // SVG path data from Make Me a Hanzi graphics.txt
    strokeMedians: jsonb("stroke_medians"), // animation median points
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("character_data_radical_idx").on(table.radical),
    index("character_data_stroke_count_idx").on(table.strokeCount),
    index("character_data_frequency_idx").on(table.frequencyRank),
  ]
);

// ============================================================
// Type Inference
// ============================================================

export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;
export type NewDictionaryEntry = typeof dictionaryEntries.$inferInsert;
export type CharacterData = typeof characterData.$inferSelect;
export type NewCharacterData = typeof characterData.$inferInsert;
export type DictionarySource = (typeof dictionarySourceEnum.enumValues)[number];
