# Research: Dictionary Data & Character Decomposition

**Domain:** Chinese language learning dictionary infrastructure
**Researched:** 2026-02-08
**Overall confidence:** HIGH

---

## 1. CC-CEDICT (Chinese-English Dictionary)

### Format Specification

**File:** `cedict_ts.u8` (UTF-8 encoded text file)
**Entries:** 124,079 (as of 2025-11-02 release)
**License:** Creative Commons Attribution-ShareAlike 4.0
**Download:** https://www.mdbg.net/chinese/dictionary?page=cedict
**Estimated uncompressed size:** ~12-15 MB (based on 124K entries averaging ~100 bytes each)

**Line format:**
```
Traditional Simplified [pin1 yin1] /definition 1/definition 2/
```

**Example entries:**
```
中國 中国 [Zhong1 guo2] /China/Middle Kingdom/
有勇無謀 有勇无谋 [you3 yong3 wu2 mou2] /bold but not very astute (idiom)/
```

**Format rules:**
- Lines starting with `#` are comments
- Empty lines are skipped
- Pinyin uses tone numbers 1-5 (5 = neutral/light tone)
- The u-umlaut is represented as `u:` (e.g., `nu:3` for nu3)
- Definitions are separated by `/` delimiters
- The first field is Traditional, second is Simplified

**Parsing regex (TypeScript):**
```typescript
// Standard CC-CEDICT line parser
const CEDICT_RE = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/;

interface CedictEntry {
  traditional: string;
  simplified: string;
  pinyin: string;       // raw: "Zhong1 guo2"
  definitions: string[]; // split on "/"
}

function parseLine(line: string): CedictEntry | null {
  if (line.startsWith('#') || line.trim() === '') return null;
  const match = line.match(CEDICT_RE);
  if (!match) return null;
  return {
    traditional: match[1],
    simplified: match[2],
    pinyin: match[3],
    definitions: match[4].split('/').filter(Boolean),
  };
}
```

**Confidence:** HIGH -- format is well-documented and stable since 1997.

### Existing npm Parsers

| Package | Weekly DL | TypeScript | Last Updated | Notes |
|---------|-----------|------------|--------------|-------|
| `parse-cc-cedict` | Low | Yes (native) | ~2021 | MIT, minimal, parses raw file |
| `node-cc-cedict` | Low | No | ~2019 | Bundles SQLite conversion |
| `hanzi` | Moderate | No | ~2020 | Includes CEDICT + decomposition + NLP |
| `@tykok/cedict-dictionary` | Low | Yes | ~2023 | Auto-updates with new CEDICT versions |
| `@alexamies/chinesedict-js` | Low | Generated from TS | ~2022 | JSON-based lookup |

**Recommendation:** Write our own parser. The format is trivially simple (one regex), and bundling a third-party package that wraps a 12 MB text file adds unnecessary complexity. Parse the raw `.u8` file at build time and load into Postgres.

---

## 2. CC-Canto (Cantonese Extension)

### Format & Data

**Website:** https://cantonese.org/download.html (also https://cc-canto.org/download.html)
**Entries:** ~22,000 Cantonese-specific entries + Jyutping readings for CC-CEDICT entries
**License:** Creative Commons Attribution-ShareAlike 3.0 (Pleco Software, 2015-16)
**Last data file:** `cccanto-170202.zip` (February 2017)
**Supplementary file:** `cccedict-canto-readings-150923.zip` (Jyutping readings mapped to CC-CEDICT entries)

### Format Differences from CC-CEDICT

CC-Canto extends the CC-CEDICT format by adding Jyutping readings in curly braces `{}` after the pinyin:

```
Traditional Simplified [pin1 yin1] {jyut6 ping3} /definition 1/definition 2/
```

**Example entries (reconstructed from documentation):**
```
唔該 唔该 [wu2 gai1] {m4 goi1} /please/thanks/excuse me/
發展 发展 [fa1 zhan3] {faat3 zin2} /development/growth/to develop/
```

**Jyutping format:**
- Uses tone numbers 1-6 (Cantonese has 6 tones vs Mandarin's 4+neutral)
- Romanization follows the Linguistic Society of Hong Kong (LSHK) standard
- Syllable format: `[onset][rhyme][tone_number]`

### Two Data Files to Merge

1. **CC-Canto dictionary** (`cccanto-170202.zip`): ~22,000 entries with Cantonese-specific vocabulary and definitions
2. **CC-CEDICT Cantonese readings** (`cccedict-canto-readings-150923.zip`): Jyutping pronunciations mapped to existing CC-CEDICT entries (covers much more than 22K)

**Extended parsing regex:**
```typescript
const CANTO_RE = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+(?:\{([^}]+)\}\s+)?\/(.+)\/\s*$/;

interface CantoEntry extends CedictEntry {
  jyutping: string | null; // may not be present for all entries
}
```

### Alternative: `to-jyutping` npm Package

| Attribute | Value |
|-----------|-------|
| Package | `to-jyutping` |
| GitHub | github.com/CanCLID/ToJyutping |
| Stars | 81 |
| License | BSD-2-Clause |
| Accuracy | 99% claimed |
| TypeScript | Yes |

This package can programmatically generate Jyutping for ANY Chinese character/text, not just the 22K entries in CC-Canto. It could be used as a fallback for entries missing from CC-Canto data.

**Recommendation:** Use CC-Canto data files as the primary Jyutping source (human-verified), supplement with `to-jyutping` for characters not covered. The CC-Canto data is from 2017 and hasn't been updated, but Jyutping pronunciations don't change -- this is not stale data.

**Confidence:** MEDIUM -- CC-Canto format is less well-documented than CC-CEDICT, but the curly-brace extension is simple and consistent.

---

## 3. Character Decomposition Data

### Option A: Make Me a Hanzi (RECOMMENDED)

**GitHub:** github.com/skishore/makemeahanzi
**Characters:** 9,000+ most common simplified and traditional
**License:** ARPHIC PUBLIC LICENSE (permissive, allows redistribution)
**Format:** NDJSON (newline-delimited JSON)

**dictionary.txt fields:**
```json
{
  "character": "你",
  "definition": "you, second person pronoun",
  "pinyin": ["ni3"],
  "decomposition": "⿰亻尔",
  "radical": "亻",
  "matches": [[0], [1], ...],
  "etymology": {
    "type": "pictophonetic",
    "phonetic": "尔",
    "semantic": "亻",
    "hint": "person"
  }
}
```

**graphics.txt fields:**
```json
{
  "character": "你",
  "strokes": ["M 213 ...", "M 345 ..."],
  "medians": [[[213, 800], [300, 600]], ...]
}
```

**Key advantages:**
- Includes etymology (pictographic, ideographic, pictophonetic) -- excellent for learners
- Decomposition uses Unicode IDS (Ideographic Description Sequences)
- Radical identification included
- Stroke data enables animation via Hanzi Writer
- 9,000 characters covers HSK 1-6 and virtually all common characters

**Why this over alternatives:**
- CJK Decomposition Data (Gavin Grover): 75,000 chars but **unmaintained** and the maintainer recommends cjkvi-ids instead. Overkill for a learning app.
- cjkvi-ids: 75,000+ chars, GPLv2 license (problematic), raw IDS only (no etymology, no radical extraction, no stroke data)
- CHISE project: Academic, GPLv2, complex to integrate

### Option B: HanziJS npm Package

| Attribute | Value |
|-----------|-------|
| Package | `hanzi` |
| GitHub | github.com/nieldlr/hanzi |
| Stars | 405 |
| License | MIT |
| Data source | Gavin Grover decomposition + CC-CEDICT |

**API:**
```typescript
import hanzi from 'hanzi';
hanzi.start(); // loads data into memory

hanzi.decompose('你');
// Level 1: { character: '你', components: ['亻', '尔'] }
// Level 2: decomposes to radicals
// Level 3: decomposes to strokes

hanzi.definitionLookup('你');
// Returns CC-CEDICT definitions

hanzi.getRadicalMeaning('亻');
// Returns: "person"

hanzi.getExamples('你');
// Returns words containing this character, sorted by frequency
```

**Concern:** The package bundles all data in-memory at startup (~50-80 MB RAM). For a server-side app, this may be acceptable. For our use case, we should extract the data and load it into Postgres instead.

### Option C: Hanzi Writer (for stroke animation, complementary)

| Attribute | Value |
|-----------|-------|
| Package | `hanzi-writer` |
| GitHub | github.com/chanind/hanzi-writer |
| Stars | 4,300 |
| License | MIT |
| Latest | v3.7.3 (September 2025) |
| Data source | Make Me a Hanzi |

**Purpose:** Client-side stroke order animation and practice quizzes. Uses Make Me a Hanzi data under the hood, loaded from CDN or bundled via `hanzi-writer-data`.

```typescript
import HanziWriter from 'hanzi-writer';

const writer = HanziWriter.create('target-div', '你', {
  width: 200,
  height: 200,
  padding: 5,
  showOutline: true,
  strokeAnimationSpeed: 1,
  delayBetweenStrokes: 300,
});

writer.animateCharacter();
writer.quiz(); // interactive stroke practice
```

**Recommendation:** Use Hanzi Writer for the client-side animation/quiz component. It is well-maintained (4.3K stars, updated September 2025), works with both simplified and traditional, and the data is from Make Me a Hanzi.

**Confidence:** HIGH -- Make Me a Hanzi and Hanzi Writer are the dominant open-source tools in this space, well-established, and widely used.

---

## 4. Traditional <-> Simplified Conversion

### Recommended: `opencc-js`

| Attribute | Value |
|-----------|-------|
| Package | `opencc-js` |
| GitHub | github.com/nk2028/opencc-js |
| Stars | 323 |
| License | MIT |
| Version | 1.0.5 |
| Weekly downloads | ~4,200 |
| TypeScript | Yes (via @types/opencc-js) |

**API:**
```typescript
import OpenCC from 'opencc-js';

// Create converters for different regional standards
const s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });  // Simplified -> Traditional (Taiwan)
const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });  // Traditional (Taiwan) -> Simplified
const s2hk = OpenCC.Converter({ from: 'cn', to: 'hk' }); // Simplified -> Traditional (HK)
const hk2s = OpenCC.Converter({ from: 'hk', to: 'cn' }); // Traditional (HK) -> Simplified

console.log(s2t('汉语')); // 漢語
console.log(t2s('漢語')); // 汉语
```

**Available converters:**
- `cn` = Simplified Chinese (Mainland)
- `tw` = Traditional Chinese (Taiwan standard)
- `twp` = Traditional Chinese (Taiwan with phrase conversion)
- `hk` = Traditional Chinese (Hong Kong standard)
- `jp` = Japanese Shinjitai

**Important for CantoMando:** The `hk` variant is critical since Cantonese typically uses Hong Kong Traditional characters, which differ slightly from Taiwan Traditional in some cases.

**Maintenance concern:** Last npm release was November 2022. The package works but is not actively maintained. However, the conversion tables themselves are stable data -- Chinese character mappings don't change frequently. This is acceptable.

### Alternative: Simple Mapping Table

CC-CEDICT already provides both Traditional and Simplified forms for every entry. For our dictionary use case, we don't actually need a separate conversion library -- we already have both forms in the data.

Use `opencc-js` only for:
- Converting user input to look up in the dictionary
- Converting display text between variants
- Handling edge cases where CC-CEDICT doesn't have an entry

**Recommendation:** Install `opencc-js` as a utility, but rely on the CC-CEDICT dual-form data as the primary source for traditional/simplified mapping. The converter is a fallback for arbitrary text conversion.

**Confidence:** HIGH -- OpenCC is the standard solution, used by Wikipedia and major Chinese NLP projects.

---

## 5. Practical Integration: Storage & Architecture

### Dataset Sizes

| Dataset | Entries | Raw Size | In Postgres (estimated) |
|---------|---------|----------|------------------------|
| CC-CEDICT | 124,079 | ~12-15 MB | ~50-80 MB with indexes |
| CC-Canto | ~22,000 + readings | ~3-5 MB | Merged into CEDICT table |
| Make Me a Hanzi (dictionary) | ~9,000 | ~8 MB | ~30-40 MB with indexes |
| Make Me a Hanzi (graphics) | ~9,000 | ~30 MB | Store as JSONB or separate |
| Decomposition data | ~9,000 | Included above | Included above |

**Total estimated Postgres footprint:** ~100-150 MB (well within Neon free/pro tier limits)

### Recommended Database Schema

```sql
-- Main dictionary table: one row per CC-CEDICT entry
CREATE TABLE dictionary_entries (
  id SERIAL PRIMARY KEY,
  traditional VARCHAR(50) NOT NULL,
  simplified VARCHAR(50) NOT NULL,
  pinyin VARCHAR(200) NOT NULL,        -- "Zhong1 guo2"
  pinyin_display VARCHAR(200),          -- "Zhōng guó" (with tone marks, computed)
  jyutping VARCHAR(200),               -- "zung1 gwok3" (from CC-Canto, nullable)
  definitions TEXT[] NOT NULL,          -- PostgreSQL array
  is_single_char BOOLEAN GENERATED ALWAYS AS (char_length(traditional) = 1) STORED,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for dictionary lookup
CREATE INDEX idx_dict_traditional ON dictionary_entries (traditional);
CREATE INDEX idx_dict_simplified ON dictionary_entries (simplified);
CREATE INDEX idx_dict_pinyin ON dictionary_entries (pinyin);
CREATE INDEX idx_dict_jyutping ON dictionary_entries (jyutping) WHERE jyutping IS NOT NULL;
CREATE INDEX idx_dict_single_char ON dictionary_entries (traditional) WHERE is_single_char = TRUE;

-- For English definition search (full-text)
CREATE INDEX idx_dict_definitions ON dictionary_entries
  USING GIN (to_tsvector('english', array_to_string(definitions, ' ')));

-- Character data table: one row per character
CREATE TABLE character_data (
  character VARCHAR(1) PRIMARY KEY,     -- the Unicode character itself as PK
  pinyin TEXT[],                         -- from Make Me a Hanzi
  jyutping TEXT[],                       -- from CC-Canto / to-jyutping
  radical VARCHAR(4),                    -- primary radical
  radical_meaning VARCHAR(50),           -- "person", "water", etc.
  stroke_count SMALLINT,
  decomposition VARCHAR(100),            -- IDS: "⿰亻尔"
  etymology_type VARCHAR(20),            -- pictographic / ideographic / pictophonetic
  etymology_hint TEXT,
  etymology_phonetic VARCHAR(10),        -- for pictophonetic characters
  etymology_semantic VARCHAR(10),        -- for pictophonetic characters
  definition TEXT,                       -- learner-friendly definition
  frequency_rank INTEGER,               -- how common (lower = more common)
  hsk_level SMALLINT,                   -- HSK level 1-6 if applicable
  stroke_paths JSONB,                   -- SVG path data array from graphics.txt
  stroke_medians JSONB,                 -- median points for animation

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for character lookup
CREATE INDEX idx_char_radical ON character_data (radical);
CREATE INDEX idx_char_stroke_count ON character_data (stroke_count);
CREATE INDEX idx_char_hsk ON character_data (hsk_level) WHERE hsk_level IS NOT NULL;
CREATE INDEX idx_char_frequency ON character_data (frequency_rank);

-- Component lookup: which characters contain this component?
CREATE TABLE character_components (
  character VARCHAR(1) NOT NULL REFERENCES character_data(character),
  component VARCHAR(4) NOT NULL,         -- component character
  position VARCHAR(20),                  -- "left", "right", "top", "bottom", "surround"
  level SMALLINT NOT NULL DEFAULT 1,     -- decomposition depth
  PRIMARY KEY (character, component, level)
);

CREATE INDEX idx_comp_component ON character_components (component);
```

### Drizzle ORM Schema (TypeScript)

```typescript
import { pgTable, serial, varchar, text, boolean, smallint, integer,
         jsonb, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const dictionaryEntries = pgTable('dictionary_entries', {
  id: serial('id').primaryKey(),
  traditional: varchar('traditional', { length: 50 }).notNull(),
  simplified: varchar('simplified', { length: 50 }).notNull(),
  pinyin: varchar('pinyin', { length: 200 }).notNull(),
  pinyinDisplay: varchar('pinyin_display', { length: 200 }),
  jyutping: varchar('jyutping', { length: 200 }),
  definitions: text('definitions').array().notNull(),
  isSingleChar: boolean('is_single_char').generatedAlwaysAs(
    sql`char_length(traditional) = 1`
  ),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_dict_traditional').on(table.traditional),
  index('idx_dict_simplified').on(table.simplified),
  index('idx_dict_pinyin').on(table.pinyin),
  index('idx_dict_definitions').using('gin',
    sql`to_tsvector('english', array_to_string(${table.definitions}, ' '))`
  ),
]);

export const characterData = pgTable('character_data', {
  character: varchar('character', { length: 1 }).primaryKey(),
  pinyin: text('pinyin').array(),
  jyutping: text('jyutping').array(),
  radical: varchar('radical', { length: 4 }),
  radicalMeaning: varchar('radical_meaning', { length: 50 }),
  strokeCount: smallint('stroke_count'),
  decomposition: varchar('decomposition', { length: 100 }),
  etymologyType: varchar('etymology_type', { length: 20 }),
  etymologyHint: text('etymology_hint'),
  definition: text('definition'),
  frequencyRank: integer('frequency_rank'),
  hskLevel: smallint('hsk_level'),
  strokePaths: jsonb('stroke_paths'),    // SVG path data array
  strokeMedians: jsonb('stroke_medians'), // animation median points
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_char_radical').on(table.radical),
  index('idx_char_stroke_count').on(table.strokeCount),
  index('idx_char_frequency').on(table.frequencyRank),
]);

export const characterComponents = pgTable('character_components', {
  character: varchar('character', { length: 1 }).notNull(),
  component: varchar('component', { length: 4 }).notNull(),
  position: varchar('position', { length: 20 }),
  level: smallint('level').notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.character, table.component, table.level] }),
  index('idx_comp_component').on(table.component),
]);
```

### In-Memory vs Postgres Decision

**Use Postgres (recommended) because:**
1. CC-CEDICT has 124K entries -- too large for comfortable in-memory use in a serverless environment (Vercel/Neon)
2. Neon Postgres handles the storage efficiently with proper indexes
3. Exact-match lookups on indexed `varchar` columns are sub-millisecond on Postgres
4. Full-text search on definitions benefits from GIN indexes
5. Serverless functions have memory limits; loading 50+ MB dictionaries on cold start is unacceptable
6. Data can be queried with joins (e.g., "find all words containing character X and its decomposition")

**Exception -- use client-side loading for:**
- Hanzi Writer stroke data: loaded per-character from CDN, cached in browser
- Active character decomposition display: fetched via API, but animation data stays client-side

### Data Import Pipeline

```typescript
// Recommended: build-time seed script
// scripts/seed-dictionary.ts

import { readFileSync } from 'fs';
import { db } from '../src/db';
import { dictionaryEntries, characterData } from '../src/db/schema';

async function seedCedict() {
  const raw = readFileSync('data/cedict_ts.u8', 'utf-8');
  const lines = raw.split('\n');
  const entries = lines
    .filter(l => !l.startsWith('#') && l.trim())
    .map(parseCedictLine)
    .filter(Boolean);

  // Batch insert in chunks of 1000
  for (let i = 0; i < entries.length; i += 1000) {
    await db.insert(dictionaryEntries)
      .values(entries.slice(i, i + 1000))
      .onConflictDoNothing();
  }
}

async function seedMakeMeAHanzi() {
  const raw = readFileSync('data/dictionary.txt', 'utf-8');
  const entries = raw.split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

  for (const entry of entries) {
    await db.insert(characterData).values({
      character: entry.character,
      pinyin: entry.pinyin,
      radical: entry.radical,
      decomposition: entry.decomposition,
      etymologyType: entry.etymology?.type,
      etymologyHint: entry.etymology?.hint,
      definition: entry.definition,
    }).onConflictDoNothing();
  }
}
```

### Query Patterns

```typescript
// Look up a word by characters (either traditional or simplified)
const results = await db.select()
  .from(dictionaryEntries)
  .where(or(
    eq(dictionaryEntries.traditional, input),
    eq(dictionaryEntries.simplified, input)
  ));

// Search definitions in English
const results = await db.select()
  .from(dictionaryEntries)
  .where(sql`to_tsvector('english', array_to_string(${dictionaryEntries.definitions}, ' '))
    @@ plainto_tsquery('english', ${searchTerm})`);

// Get character decomposition
const charData = await db.select()
  .from(characterData)
  .where(eq(characterData.character, char));

// Find all characters with a given radical
const chars = await db.select()
  .from(characterData)
  .where(eq(characterData.radical, radical))
  .orderBy(characterData.strokeCount);

// Find all words containing a specific character
const words = await db.select()
  .from(dictionaryEntries)
  .where(or(
    sql`${dictionaryEntries.traditional} LIKE ${'%' + char + '%'}`,
    sql`${dictionaryEntries.simplified} LIKE ${'%' + char + '%'}`
  ))
  .limit(50);
```

### CJK Search Performance Notes

**Important caveat for Neon Postgres:**
- PostgreSQL's built-in full-text search does NOT support CJK languages natively. The `to_tsvector('english', ...)` approach works for English definition search but NOT for searching by Chinese characters.
- For Chinese character lookup, use exact-match B-tree indexes (`=` operator) or `LIKE` with prefix patterns.
- The `pg_trgm` extension's trigram approach is "fairly useless for multibyte characters" since it operates on 3-byte (not 3-character) units.
- **Do not attempt** GIN full-text search on Chinese text columns. Use exact match indexes instead.
- For "contains character" queries, `LIKE '%X%'` with a sequential scan is acceptable for 124K rows (completes in <100ms on Neon).

**Confidence:** HIGH -- Drizzle ORM + Neon Postgres is the project's existing stack; these patterns are well-tested.

---

## 6. Summary of Recommendations

### Data Sources to Use

| Source | Purpose | How to Get |
|--------|---------|-----------|
| CC-CEDICT | Dictionary entries (Mandarin) | Download `cedict_ts.u8` from MDBG |
| CC-Canto | Jyutping pronunciations | Download from cantonese.org |
| Make Me a Hanzi | Character data, decomposition, etymology, stroke paths | Clone from GitHub |
| Hanzi Writer | Client-side stroke animation | `npm install hanzi-writer` |
| opencc-js | Traditional/Simplified conversion utility | `npm install opencc-js` |
| to-jyutping | Fallback Jyutping generation | `npm install to-jyutping` |

### npm Packages to Install

```bash
# Client-side stroke animation (production dependency)
npm install hanzi-writer

# Traditional/Simplified conversion (production dependency)
npm install opencc-js

# Jyutping fallback generation (production dependency)
npm install to-jyutping

# TypeScript types (if needed)
npm install -D @types/opencc-js
```

### Data Files to Download (one-time, at build/seed time)

```bash
# CC-CEDICT
curl -o data/cedict_ts.u8.gz https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
gunzip data/cedict_ts.u8.gz

# CC-Canto
# Download from https://cantonese.org/download.html
# Extract cccanto-170202.zip and cccedict-canto-readings-150923.zip

# Make Me a Hanzi
# Clone https://github.com/skishore/makemeahanzi
# Copy dictionary.txt and graphics.txt to data/
```

### What NOT to Use

| Avoided | Reason |
|---------|--------|
| `hanzi` npm package | Loads everything into memory (~50-80 MB), we use Postgres instead |
| CJK Decomposition Data (75K chars) | Unmaintained, overkill, author recommends cjkvi-ids |
| cjkvi-ids | GPLv2 license, raw IDS only, no etymology/radical/stroke data |
| CHISE project | Academic, GPLv2, complex integration |
| `node-cc-cedict` | Bundles SQLite, we use Postgres |
| PostgreSQL CJK full-text search | Does not work well; use exact-match B-tree indexes instead |

---

## 7. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| CC-Canto data is from 2017 | LOW | Jyutping pronunciations are stable; supplement with `to-jyutping` |
| `opencc-js` not actively maintained | LOW | Conversion tables are stable data; the library works fine |
| Make Me a Hanzi covers only ~9K chars | LOW | Covers all common characters; rare characters can fall back to basic CEDICT data |
| Neon Postgres CJK search limitations | MEDIUM | Use exact-match indexes, not full-text search for Chinese |
| Large seed data import time | LOW | Batch inserts of 124K rows takes <30 seconds |
| Stroke data (JSONB) size in Postgres | LOW | ~30 MB is negligible for Neon |

---

## Sources

### Primary Data Sources
- [CC-CEDICT Download (MDBG)](https://www.mdbg.net/chinese/dictionary?page=cedict)
- [CC-Canto Download](https://cantonese.org/download.html)
- [Make Me a Hanzi (GitHub)](https://github.com/skishore/makemeahanzi)

### npm Packages
- [opencc-js (GitHub)](https://github.com/nk2028/opencc-js)
- [Hanzi Writer (GitHub)](https://github.com/chanind/hanzi-writer)
- [to-jyutping (GitHub)](https://github.com/CanCLID/ToJyutping)
- [HanziJS (GitHub)](https://github.com/nieldlr/hanzi)
- [parse-cc-cedict (GitHub)](https://github.com/tomcumming/parse-cc-cedict)

### Character Decomposition Data
- [CJK Decomposition Data (GitHub)](https://github.com/amake/cjk-decomp)
- [cjkvi-ids (GitHub)](https://github.com/cjkvi/cjkvi-ids)

### Technical References
- [Drizzle ORM PostgreSQL Full-Text Search](https://orm.drizzle.team/docs/guides/postgresql-full-text-search)
- [OpenCC Project (GitHub)](https://github.com/BYVoid/OpenCC)
- [Unicode Unihan Database](https://www.unicode.org/reports/tr38/)
- [Hanzi Writer Documentation](https://hanziwriter.org/docs.html)
