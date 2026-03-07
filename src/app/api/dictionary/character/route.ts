import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { characterData, dictionaryEntries } from "@/db/schema";
import { eq, or, and, ne, asc, sql } from "drizzle-orm";

/**
 * GET /api/dictionary/character?char=X
 *
 * Returns character data (radical, etymology, strokes) plus example words
 * containing the character. Returns { character: null, examples: [] } if
 * the character is not found in Make Me a Hanzi data.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const char = searchParams.get("char");

    if (!char || [...char].length !== 1) {
      return NextResponse.json(
        { error: "Single character required" },
        { status: 400 }
      );
    }

    // Query character data by natural PK
    const [charResult] = await db
      .select()
      .from(characterData)
      .where(eq(characterData.character, char));

    // Query example words containing this character
    // Exclude single-char entries that are just the character itself
    // Order by frequency rank (common words first)
    const examples = await db
      .select({
        traditional: dictionaryEntries.traditional,
        simplified: dictionaryEntries.simplified,
        pinyin: dictionaryEntries.pinyin,
        pinyinDisplay: dictionaryEntries.pinyinDisplay,
        definitions: dictionaryEntries.definitions,
        source: dictionaryEntries.source,
      })
      .from(dictionaryEntries)
      .where(
        and(
          or(
            sql`${dictionaryEntries.traditional} LIKE ${"%" + char + "%"}`,
            sql`${dictionaryEntries.simplified} LIKE ${"%" + char + "%"}`
          ),
          // Exclude entries that are just this single character
          or(
            ne(dictionaryEntries.traditional, char),
            eq(dictionaryEntries.isSingleChar, false)
          )
        )
      )
      .orderBy(asc(sql`${dictionaryEntries.frequencyRank} NULLS LAST`))
      .limit(20);

    return NextResponse.json({
      character: charResult ?? null,
      examples,
    });
  } catch (error) {
    console.error("Character lookup failed:", error);
    return NextResponse.json(
      { error: "Character lookup failed" },
      { status: 500 }
    );
  }
}
