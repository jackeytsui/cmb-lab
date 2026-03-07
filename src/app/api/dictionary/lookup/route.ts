import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { dictionaryEntries } from "@/db/schema";
import { or, eq } from "drizzle-orm";

/**
 * GET /api/dictionary/lookup?word=X
 *
 * Returns dictionary entries matching the word (traditional or simplified).
 * Typically returns 1-5 entries per word, never more than ~20.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const word = searchParams.get("word");

    if (!word || word.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing word parameter" },
        { status: 400 }
      );
    }

    const trimmed = word.trim();
    const charCodes = [...trimmed].map(c => c.charCodeAt(0)).join(",");
    console.log(`[Dictionary Lookup] Searching for: "${trimmed}" (Codes: ${charCodes})`);

    const entries = await db
      .select({
        id: dictionaryEntries.id,
        traditional: dictionaryEntries.traditional,
        simplified: dictionaryEntries.simplified,
        pinyin: dictionaryEntries.pinyin,
        pinyinDisplay: dictionaryEntries.pinyinDisplay,
        jyutping: dictionaryEntries.jyutping,
        definitions: dictionaryEntries.definitions,
        source: dictionaryEntries.source,
        isSingleChar: dictionaryEntries.isSingleChar,
      })
      .from(dictionaryEntries)
      .where(
        or(
          eq(dictionaryEntries.traditional, trimmed),
          eq(dictionaryEntries.simplified, trimmed)
        )
      );

    console.log(`[Dictionary Lookup] Found ${entries.length} entries for "${trimmed}"`);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Dictionary lookup failed:", error);
    return NextResponse.json(
      { error: "Dictionary lookup failed" },
      { status: 500 }
    );
  }
}
