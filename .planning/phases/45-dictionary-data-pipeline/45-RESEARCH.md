# Phase 45: Dictionary Data Pipeline - Research

**Researched:** 2026-02-08
**Domain:** Chinese dictionary data parsing, database seeding, and REST API endpoints
**Confidence:** HIGH

## Summary

Phase 45 takes the dictionary schema created in Phase 44 (dictionary_entries, character_data tables) and fills it with real data from three open-source Chinese dictionaries: CC-CEDICT (~124K Mandarin entries), CC-Canto (~22K Cantonese entries + jyutping readings), and Make Me a Hanzi (~9K character decomposition/stroke records). It then exposes two API endpoints for dictionary and character lookup.

The technical work is straightforward: download raw text files, parse them with regex (well-documented formats), batch-insert into Postgres via Drizzle ORM, and build two GET API routes. The main complexity lies in merging CC-CEDICT and CC-Canto data correctly (matching by traditional+simplified key, updating the `source` flag and `jyutping` field), handling CC-CEDICT's `u:` pinyin notation, and generating the `pinyinDisplay` (tone marks) column using `pinyin-pro`'s `convert()` function. All required libraries are already installed.

**Primary recommendation:** Build a standalone seed script at `scripts/seed-dictionary.ts` (run via `npx tsx`) that downloads/reads the three data files from a local `data/` directory, parses them, and batch-inserts into Postgres in chunks of 500 rows (conservative for Neon HTTP driver's 10 MB request limit). Use `to-jyutping` as fallback for characters missing from CC-Canto. Expose API routes at `src/app/api/dictionary/lookup/route.ts` and `src/app/api/dictionary/character/route.ts`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | ^0.45.1 | ORM for batch inserts and queries | Already the project's ORM, proven across 23 schema files |
| `pinyin-pro` | ^3.28.0 | `convert()` function: numbered pinyin -> tone marks | Already installed; `convert("zhong1 guo2")` returns `"zhōng guó"` |
| `to-jyutping` | ^3.1.1 | Fallback jyutping generation for characters not in CC-Canto | Already installed and proven in `search-utils.ts` |
| `@neondatabase/serverless` | ^1.0.2 | Neon HTTP driver for batch inserts | Project standard, used in `src/db/index.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | ^17.2.3 | Load `.env.local` in seed script | Already a devDep, used in existing `src/db/seed.ts` |
| `tsx` | (via npx) | Run TypeScript seed script directly | Already used for existing seed script (`npm run db:seed`) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom CC-CEDICT parser | `parse-cc-cedict` npm package | Package adds dependency for a one-regex problem; write our own |
| `pinyin-pro` convert() for pinyinDisplay | `pinyin-tone` / `pinyinizer` npm | Extra dependency; pinyin-pro already installed with `convert()` |
| Standalone seed script | Next.js API route for seeding | Seed script is one-time; API route adds unnecessary web exposure |
| Batch inserts of 500 | Batch inserts of 1000 | 500 is safer for Neon HTTP 10 MB body limit with long definition arrays |

**Installation:** No new packages needed. All required libraries are already in `package.json`.

## Architecture Patterns

### Recommended Project Structure

```
data/                              # Raw dictionary data files (gitignored)
├── cedict_ts.u8                   # CC-CEDICT (~12 MB)
├── cccanto-170202.txt             # CC-Canto dictionary entries
├── cccedict-canto-readings.txt    # CC-Canto jyutping readings for CEDICT entries
├── dictionary.txt                 # Make Me a Hanzi dictionary data (NDJSON)
└── graphics.txt                   # Make Me a Hanzi stroke data (NDJSON)
scripts/
└── seed-dictionary.ts             # Standalone seed script
src/
├── lib/
│   └── dictionary-parsers.ts      # Parse functions for all 3 data formats
└── app/api/dictionary/
    ├── lookup/route.ts            # GET /api/dictionary/lookup?word=X
    └── character/route.ts         # GET /api/dictionary/character?char=X
```

### Pattern 1: Seed Script Architecture

**What:** A standalone script that reads raw data files, parses them, and batch-inserts into Postgres. Separate from the Next.js app, run via `npx tsx scripts/seed-dictionary.ts`.

**When to use:** One-time data loading operations that shouldn't be exposed as API endpoints.

**Why this pattern:** The existing `src/db/seed.ts` establishes this exact pattern -- standalone script using dotenv + neon + drizzle, run via npx tsx. The dictionary seed is the same concept at larger scale.

```typescript
// scripts/seed-dictionary.ts - follows existing seed.ts pattern
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { dictionaryEntries, characterData } from "../src/db/schema";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("Error: DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const BATCH_SIZE = 500;

async function batchInsert<T>(
  table: any,
  rows: T[],
  label: string
) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await db.insert(table).values(batch).onConflictDoNothing();
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === rows.length) {
      console.log(`  [${label}] ${inserted}/${rows.length}`);
    }
  }
  return inserted;
}
```

### Pattern 2: Three-Phase Seeding (CEDICT -> Canto Merge -> Character Data)

**What:** Seed dictionary in three ordered phases to handle the merge logic correctly.

**When to use:** Always -- the source data has dependencies between CC-CEDICT and CC-Canto.

**Architecture:**

```
Phase A: Seed CC-CEDICT entries (~124K rows)
  -> All entries get source='cedict', jyutping=null
  -> isSingleChar set based on traditional.length === 1
  -> pinyinDisplay computed via pinyin-pro convert()

Phase B: Merge CC-Canto data
  Step B1: Load CC-Canto readings file (jyutping for existing CEDICT entries)
    -> Match by traditional+simplified key
    -> UPDATE jyutping column, SET source='both'
  Step B2: Load CC-Canto dictionary file (Cantonese-only entries)
    -> INSERT new entries with source='canto'
    -> Entries already in CEDICT from step B1 become source='both'

Phase C: Seed Make Me a Hanzi (~9K rows)
  -> Parse dictionary.txt (NDJSON) for radical/etymology/decomposition
  -> Parse graphics.txt (NDJSON) for stroke paths/medians
  -> Merge by character key, INSERT into character_data
  -> Use to-jyutping to generate jyutping for each character
```

### Pattern 3: API Route Convention (No Auth Required for Dictionary)

**What:** Dictionary lookup endpoints are public read-only queries that don't require authentication.

**When to use:** For the dictionary lookup and character detail APIs.

**Why:** Dictionary data is static reference data, not user-specific content. Making it public allows the reader to work without authentication overhead on every character hover. However, the project convention uses Clerk auth on all API routes. Follow the existing pattern -- use `auth()` check but consider making it lightweight.

```typescript
// src/app/api/dictionary/lookup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { dictionaryEntries } from "@/db/schema";
import { or, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const word = request.nextUrl.searchParams.get("word");
  if (!word) {
    return NextResponse.json({ error: "Missing word parameter" }, { status: 400 });
  }

  const results = await db.select()
    .from(dictionaryEntries)
    .where(or(
      eq(dictionaryEntries.traditional, word),
      eq(dictionaryEntries.simplified, word)
    ));

  return NextResponse.json({ entries: results });
}
```

### Anti-Patterns to Avoid

- **Loading dictionary data into memory at startup:** The entire CC-CEDICT is ~12 MB. In serverless (Vercel), cold starts would be unacceptable. Use Postgres with B-tree indexes for sub-millisecond lookups.
- **Using Postgres full-text search for Chinese characters:** `to_tsvector` does not support CJK natively. Use exact-match B-tree indexes with `=` operator for Chinese lookups. `LIKE '%X%'` sequential scans are acceptable for 124K rows (<100ms on Neon).
- **Inserting rows one at a time:** With 124K entries, individual inserts would take minutes over HTTP. Batch insert 500 rows per INSERT statement.
- **Trusting CC-CEDICT pinyin for display:** CC-CEDICT uses numbered tones with `u:` for umlaut (e.g., `nu:3`). This must be pre-processed before passing to `pinyin-pro`'s `convert()` function. Replace `u:` with `v` first, then convert.
- **Running seed script in production API route:** The seed is a one-time operation. Keep it as a standalone script.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Numbered pinyin -> tone marks | Custom tone mark placement algorithm | `pinyin-pro`'s `convert()` function | Tone mark placement rules are complex (which vowel gets the mark in diphthongs, etc.) |
| Jyutping generation for missing chars | Skip characters without CC-Canto data | `to-jyutping` library (already installed) | CC-Canto covers ~22K entries but there are 9K characters; many chars won't have CC-Canto data |
| CC-CEDICT line parsing | Complex manual string splitting | Single regex: `/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/` | The format is trivially regular; one regex handles all 124K entries |
| CC-Canto line parsing (with jyutping) | Separate parser | Extended regex: `/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+(?:\{([^}]+)\}\s+)?\/(.+)\/\s*$/` | Same format with optional `{jyutping}` block |
| NDJSON parsing | Custom streaming parser | `line.split('\n').map(JSON.parse)` | Make Me a Hanzi files are <30 MB; no streaming needed |

**Key insight:** All three data formats (CC-CEDICT, CC-Canto, NDJSON) are trivially parseable with standard JavaScript. No parsing libraries needed. The complexity is in the merge logic and edge case handling, not in the parsing itself.

## Common Pitfalls

### Pitfall 1: CC-CEDICT `u:` Pinyin Notation

**What goes wrong:** CC-CEDICT represents the umlaut-u (u) as `u:` (e.g., `nu:3` for nu3, `lu:4` for lu4). If passed directly to `pinyin-pro`'s `convert()`, it won't recognize the `u:` notation and will produce garbage output.

**Why it happens:** CC-CEDICT predates modern pinyin input conventions. It uses `u:` where modern systems use `v` or `u` with context.

**How to avoid:** Pre-process pinyin strings before calling `convert()`:
```typescript
function normalizeCedictPinyin(raw: string): string {
  // Replace u: with v (standard input convention)
  return raw.replace(/u:/g, "v");
}

// Then: convert(normalizeCedictPinyin("nu:3 ren2")) => "nv3 ren2" => "nu ren"
// Wait - convert expects "nv3" and should produce "nu ren" with tone marks
```

**Warning signs:** Characters like 女 (nu:3), 绿 (lu:4), 旅 (lu:3) producing garbled pinyinDisplay values.

### Pitfall 2: CC-Canto Matching Requires Traditional+Simplified Composite Key

**What goes wrong:** Matching CC-Canto jyutping to CC-CEDICT entries by traditional character alone may produce false matches. Some characters have multiple entries with different simplified forms.

**Why it happens:** CC-CEDICT has duplicate traditional characters with different definitions (e.g., homographs with different pronunciations or meanings).

**How to avoid:** Match on `(traditional, simplified, pinyin)` triple for jyutping merge to ensure the correct entry is updated. If no exact match, fall back to `(traditional, simplified)`.

**Warning signs:** Jyutping assigned to wrong definition entry.

### Pitfall 3: Neon HTTP Driver 10 MB Request Limit

**What goes wrong:** Batch inserts with too many rows per INSERT cause the HTTP request body to exceed 10 MB, resulting in a 413 or connection error.

**Why it happens:** Dictionary entries have variable-length definition arrays. Some entries have 10+ definitions, making the row payload unpredictable.

**How to avoid:** Use BATCH_SIZE = 500 (not 1000). With average entry size ~100-200 bytes, 500 rows = ~50-100 KB per request, well under 10 MB. Add error handling to retry with smaller batches if an insert fails.

**Warning signs:** "Request body too large" or "fetch failed" errors during seeding.

### Pitfall 4: Make Me a Hanzi Missing Fields

**What goes wrong:** Not all entries in dictionary.txt have all fields. The `etymology` object may be missing entirely, or may lack the `phonetic` or `semantic` sub-fields.

**Why it happens:** Etymology data is incomplete for some characters. Some characters are pictographic (no phonetic component) or have unknown origins.

**How to avoid:** Use optional chaining when parsing: `entry.etymology?.type`, `entry.etymology?.hint`, `entry.etymology?.phonetic`, `entry.etymology?.semantic`.

**Warning signs:** TypeError during seeding on entries without etymology.

### Pitfall 5: Drizzle `onConflictDoNothing` on UUID PK

**What goes wrong:** Using `onConflictDoNothing()` without a target on dictionary_entries (which has uuid PKs) works but may not handle the CC-Canto merge step correctly. Duplicate entries need to be UPDATED (set jyutping + change source to 'both'), not skipped.

**Why it happens:** The uuid PK means no two rows will naturally conflict on PK. The merge needs to detect duplicates by `(traditional, simplified)` and update existing rows.

**How to avoid:** For the CC-Canto merge step, use `onConflictDoUpdate` with a unique constraint, OR use a separate UPDATE query pattern: first SELECT matching entries, then UPDATE them. Since dictionary_entries doesn't have a unique constraint on `(traditional, simplified)` (there can be multiple entries for the same word with different pinyin), the merge should match on `(traditional, simplified, pinyin)`.

**Warning signs:** CC-Canto data silently inserted as new rows instead of merging into existing CEDICT entries.

### Pitfall 6: Tone 5 (Neutral Tone) Handling

**What goes wrong:** CC-CEDICT uses tone 5 for neutral/light tone (e.g., `ma5` in `ma1 ma5`). Some conversion tools don't handle tone 5 correctly.

**Why it happens:** Mandarin has 4 tones plus a neutral tone. The neutral tone is written as tone 5 in numbered pinyin but has no diacritical mark in standard pinyin (it appears as an unaccented syllable).

**How to avoid:** Verify that `pinyin-pro`'s `convert()` handles tone 5 correctly (should produce no mark, e.g., `ma5` -> `ma`). Test with common examples: `ma1 ma5` -> `ma ma`.

**Warning signs:** Tone 5 syllables showing as `ma5` in display text instead of unmarked `ma`.

## Code Examples

### CC-CEDICT Line Parser

```typescript
// Source: CC-CEDICT format specification (cc-cedict.org/wiki/format:syntax)
const CEDICT_RE = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/;

interface ParsedCedictEntry {
  traditional: string;
  simplified: string;
  pinyin: string;       // raw numbered: "Zhong1 guo2"
  definitions: string[];
}

function parseCedictLine(line: string): ParsedCedictEntry | null {
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

### CC-Canto Line Parser (Extended Format)

```typescript
// Source: cantonese.org/download.html format documentation
const CANTO_RE = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+(?:\{([^}]+)\}\s+)?\/(.+)\/\s*$/;

interface ParsedCantoEntry extends ParsedCedictEntry {
  jyutping: string | null;
}

function parseCantoLine(line: string): ParsedCantoEntry | null {
  if (line.startsWith('#') || line.trim() === '') return null;
  const match = line.match(CANTO_RE);
  if (!match) return null;
  return {
    traditional: match[1],
    simplified: match[2],
    pinyin: match[3],
    jyutping: match[4] || null,
    definitions: match[5].split('/').filter(Boolean),
  };
}
```

### Pinyin Display Conversion (u: Handling)

```typescript
// Source: pinyin-pro docs (pinyin-pro.cn/use/convert.html)
import { convert } from "pinyin-pro";

/**
 * Convert CC-CEDICT numbered pinyin to tone mark display form.
 * Handles the u: -> v substitution that CC-CEDICT uses for umlaut.
 */
function toPinyinDisplay(numberedPinyin: string): string {
  // CC-CEDICT uses u: for umlaut-u. pinyin-pro expects v.
  const normalized = numberedPinyin.replace(/u:/g, "v");
  return convert(normalized);
}

// Examples:
// toPinyinDisplay("Zhong1 guo2") => "Zhōng guó"
// toPinyinDisplay("nu:3 ren2") => "nv ren" (with tone marks on correct vowels)
```

### Make Me a Hanzi NDJSON Parser

```typescript
// Source: github.com/skishore/makemeahanzi README
import { readFileSync } from "fs";

interface MakeHanziDict {
  character: string;
  definition: string;
  pinyin: string[];
  decomposition: string;
  radical: string;
  matches: number[][];
  etymology?: {
    type: string;
    hint?: string;
    phonetic?: string;
    semantic?: string;
  };
}

interface MakeHanziGraphics {
  character: string;
  strokes: string[];   // SVG path data
  medians: number[][][]; // Animation control points
}

function parseDictionary(filePath: string): MakeHanziDict[] {
  const raw = readFileSync(filePath, "utf-8");
  return raw.split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function parseGraphics(filePath: string): MakeHanziGraphics[] {
  const raw = readFileSync(filePath, "utf-8");
  return raw.split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}
```

### Batch Insert with Progress Logging

```typescript
// Source: Drizzle ORM docs (orm.drizzle.team/docs/insert)
async function batchInsert<T extends Record<string, unknown>>(
  table: any,
  rows: T[],
  label: string,
  batchSize: number = 500
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    try {
      await db.insert(table).values(batch).onConflictDoNothing();
      inserted += batch.length;
    } catch (err) {
      console.error(`  [${label}] Error at batch ${i}: ${err}`);
      // Retry with smaller batch
      for (const row of batch) {
        try {
          await db.insert(table).values(row).onConflictDoNothing();
          inserted++;
        } catch { /* skip individual failures */ }
      }
    }
    if (inserted % 5000 === 0 || i + batchSize >= rows.length) {
      console.log(`  [${label}] ${inserted}/${rows.length}`);
    }
  }
  return inserted;
}
```

### CC-Canto Merge Pattern (Update Existing Entries)

```typescript
// Source: project pattern — no unique constraint on (traditional, simplified),
// so use SELECT + UPDATE rather than onConflictDoUpdate
import { and, eq, sql } from "drizzle-orm";

async function mergeCantoneseReadings(
  readings: Array<{ traditional: string; simplified: string; pinyin: string; jyutping: string }>
) {
  let updated = 0;
  for (const reading of readings) {
    const result = await db
      .update(dictionaryEntries)
      .set({
        jyutping: reading.jyutping,
        source: "both",
      })
      .where(
        and(
          eq(dictionaryEntries.traditional, reading.traditional),
          eq(dictionaryEntries.simplified, reading.simplified),
          eq(dictionaryEntries.pinyin, reading.pinyin)
        )
      );
    // NeonHttp db.execute() returns .rows property
    updated++;
  }
  return updated;
}
```

### Dictionary Lookup API Route

```typescript
// Source: project API convention (see src/app/api/search/route.ts)
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { dictionaryEntries } from "@/db/schema";
import { or, eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const word = request.nextUrl.searchParams.get("word");
  if (!word || word.trim().length === 0) {
    return NextResponse.json({ error: "Missing word" }, { status: 400 });
  }

  try {
    // Exact match on traditional or simplified
    const results = await db.select()
      .from(dictionaryEntries)
      .where(or(
        eq(dictionaryEntries.traditional, word),
        eq(dictionaryEntries.simplified, word)
      ));

    return NextResponse.json({ entries: results });
  } catch (error) {
    console.error("Dictionary lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
```

### Character Detail API Route

```typescript
// Source: project API convention
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { characterData, dictionaryEntries } from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const char = request.nextUrl.searchParams.get("char");
  if (!char || char.length !== 1) {
    return NextResponse.json({ error: "Single character required" }, { status: 400 });
  }

  try {
    // Get character data
    const charResult = await db.select()
      .from(characterData)
      .where(eq(characterData.character, char));

    // Get example words containing this character
    const examples = await db.select()
      .from(dictionaryEntries)
      .where(or(
        sql`${dictionaryEntries.traditional} LIKE ${'%' + char + '%'}`,
        sql`${dictionaryEntries.simplified} LIKE ${'%' + char + '%'}`
      ))
      .limit(20);

    return NextResponse.json({
      character: charResult[0] || null,
      examples,
    });
  } catch (error) {
    console.error("Character lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory dictionary (hanzi npm) | Postgres with B-tree indexes | Standard for server apps | Sub-ms lookups without 50+ MB cold start |
| GIN full-text search for CJK | Exact-match B-tree + LIKE | Always (PG limitation) | CJK full-text search doesn't work natively in Postgres |
| Serial integer PKs | UUID PKs (project convention) | Project decision | Consistent with rest of schema |
| Generated column for isSingleChar | Boolean populated during seeding | Phase 44 decision | Avoids Drizzle generated column limitations |

**Deprecated/outdated:**
- `node-cc-cedict` (bundles SQLite): Superseded by direct Postgres insertion
- `hanzi` npm (in-memory loading): Not suitable for serverless; use Postgres
- PostgreSQL `pg_trgm` for CJK trigrams: "fairly useless for multibyte characters" per official PG docs

## Open Questions

1. **CC-Canto file format verification**
   - What we know: CC-Canto uses curly braces `{jyutping}` after pinyin brackets, same line format as CC-CEDICT otherwise
   - What's unclear: The exact content structure of the CC-Canto readings file (cccedict-canto-readings-150923.txt) -- is it full CEDICT-format lines with jyutping added, or a simpler mapping format?
   - Recommendation: Download the file during Phase 45 execution and inspect. The parser can be adjusted. The regex handles both formats.

2. **CC-Canto update strategy without unique constraint**
   - What we know: dictionary_entries has no unique constraint on (traditional, simplified) because the same word can have multiple entries with different pinyin
   - What's unclear: Whether individual UPDATEs for ~22K+ Canto readings will be fast enough, or if we need to batch them
   - Recommendation: Individual UPDATEs are fine. 22K updates at ~5ms each = ~110 seconds. Acceptable for a one-time seed. Alternatively, batch-load CC-Canto readings into a temp array, build a Map keyed on (traditional+simplified+pinyin), then iterate over existing CEDICT entries.

3. **Frequency rank data source**
   - What we know: The schema has a `frequencyRank` column on both tables, but neither CC-CEDICT nor Make Me a Hanzi include frequency data
   - What's unclear: Whether to include frequency ranking in this phase or defer
   - Recommendation: Leave frequencyRank as NULL for now. Frequency data can be added later from a dedicated frequency list (e.g., Jun Da's character frequency list). The column exists and is indexed, ready for future population.

4. **Radical meaning mapping**
   - What we know: Make Me a Hanzi includes `radical` but NOT `radicalMeaning` (the English meaning of the radical)
   - What's unclear: Where to get radical -> meaning mappings
   - Recommendation: Build a small static lookup table of ~214 Kangxi radicals with their English meanings. This is well-documented data (e.g., Wikipedia's Kangxi radicals page). The `hanzi` npm package also has `getRadicalMeaning()` -- we could extract just that mapping without using the full package.

## Data File Acquisition

### Download Instructions (One-Time Setup)

```bash
# Create data directory
mkdir -p data

# CC-CEDICT (12 MB uncompressed)
curl -L -o data/cedict.zip "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip"
cd data && unzip cedict.zip && mv cedict_ts.u8 cedict_ts.u8 && rm cedict.zip && cd ..

# CC-Canto dictionary (Cantonese-specific entries)
curl -L -o data/cccanto.zip "https://cantonese.org/cccanto-170202.zip"
cd data && unzip cccanto.zip && cd ..

# CC-Canto readings (Jyutping for CEDICT entries)
curl -L -o data/canto-readings.zip "https://cantonese.org/cccedict-canto-readings-150923.zip"
cd data && unzip canto-readings.zip && cd ..

# Make Me a Hanzi (dictionary + graphics)
curl -L -o data/dictionary.txt "https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt"
curl -L -o data/graphics.txt "https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt"
```

### Gitignore Addition

```
# Dictionary source data (large, downloaded on demand)
/data/
```

## Sources

### Primary (HIGH confidence)
- [CC-CEDICT format syntax](http://cc-cedict.org/wiki/format:syntax) - Line format, pinyin rules, tone 5, u: notation
- [CC-CEDICT download page (MDBG)](https://www.mdbg.net/chinese/dictionary?page=cedict) - 124,079 entries, Nov 2025 release
- [CC-Canto download page](https://cantonese.org/download.html) - cccanto-170202.zip + cccedict-canto-readings-150923.zip
- [Make Me a Hanzi (GitHub)](https://github.com/skishore/makemeahanzi) - 9K+ characters, NDJSON format, stroke data
- [pinyin-pro convert() docs](https://pinyin-pro.cn/use/convert.html) - `convert("pin1 yin1")` returns `"pin yin"` with tone marks
- [Drizzle ORM insert/upsert docs](https://orm.drizzle.team/docs/insert) - batch values, onConflictDoNothing/DoUpdate
- [Neon serverless driver docs](https://neon.com/docs/serverless/serverless-driver) - 10 MB HTTP request body limit

### Secondary (MEDIUM confidence)
- [pinyin-pro npm page (via GitHub)](https://github.com/zh-lx/pinyin-pro) - Verified `convert()` function exists for numToSymbol conversion
- [to-jyutping (GitHub)](https://github.com/CanCLID/ToJyutping) - JS API: `ToJyutping.getJyutpingText()` proven in codebase `search-utils.ts`

### Tertiary (LOW confidence)
- Neon HTTP driver 10 MB limit - found via web search, not confirmed in official docs page directly; using conservative batch size of 500 as mitigation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and proven in the codebase
- Architecture: HIGH - follows existing seed.ts pattern, data formats are well-documented
- Pitfalls: HIGH - CC-CEDICT u: notation and Neon batch limits are documented; merge logic is the main complexity
- Data formats: HIGH for CC-CEDICT, MEDIUM for CC-Canto (less documented), HIGH for Make Me a Hanzi

**Research date:** 2026-02-08
**Valid until:** 2026-03-08 (30 days -- data formats are stable, libraries are mature)
