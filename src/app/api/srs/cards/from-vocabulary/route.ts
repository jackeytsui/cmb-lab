import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSrsCardFromDictionaryWord, createSrsCardFromSavedVocabulary } from "@/lib/srs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    savedVocabularyId?: string;
    deckId?: string;
    traditional?: string;
    simplified?: string;
    pinyin?: string;
    jyutping?: string;
    meaning?: string;
    example?: string;
    sourceType?: "reader" | "vocabulary" | "practice";
  };

  try {
    if (body.savedVocabularyId) {
      const result = await createSrsCardFromSavedVocabulary({
        userId: user.id,
        savedVocabularyId: body.savedVocabularyId,
        deckId: body.deckId,
      });
      return NextResponse.json(result, { status: result.alreadyExists ? 200 : 201 });
    }

    if (!body.traditional?.trim() || !body.meaning?.trim()) {
      return NextResponse.json(
        { error: "Either savedVocabularyId or (traditional + meaning) is required" },
        { status: 400 }
      );
    }

    const created = await createSrsCardFromDictionaryWord({
      userId: user.id,
      deckId: body.deckId,
      traditional: body.traditional.trim(),
      simplified: body.simplified?.trim(),
      pinyin: body.pinyin?.trim(),
      jyutping: body.jyutping?.trim(),
      meaning: body.meaning.trim(),
      example: body.example?.trim(),
      sourceType:
        body.sourceType === "vocabulary"
          ? "reader"
          : body.sourceType ?? "reader",
    });

    return NextResponse.json({ id: created.id, alreadyExists: false }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create card";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
