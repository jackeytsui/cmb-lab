import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  coachingNoteStars,
  coachingNotes,
  coachingSessions,
  flashcardSaves,
  savedVocabulary,
  notepadNotes,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import {
  buildFlashcardContentKey,
  normalizeFlashcardLanguage,
} from "@/lib/flashcards";

/**
 * GET /api/flashcards
 * Returns all flashcard items for the current user:
 *   - Starred coaching notes (from 1:1 and inner circle)
 *   - Saved vocabulary (from AI Passage Reader and YouTube Listening Lab)
 *
 * Uses getCurrentUser() so admins in "View As" mode see the
 * impersonated student's flashcards.
 */
export async function GET() {
  const dbUser = await getCurrentUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Starred coaching notes
  const starredRows = await db
    .select({
      starId: coachingNoteStars.id,
      noteId: coachingNotes.id,
      text: coachingNotes.text,
      textOverride: coachingNotes.textOverride,
      romanization: coachingNotes.romanizationOverride,
      translation: coachingNotes.translationOverride,
      pane: coachingNotes.pane,
      sessionTitle: coachingSessions.title,
      sessionType: coachingSessions.type,
      starredAt: coachingNoteStars.createdAt,
    })
    .from(coachingNoteStars)
    .innerJoin(coachingNotes, eq(coachingNoteStars.noteId, coachingNotes.id))
    .innerJoin(coachingSessions, eq(coachingNotes.sessionId, coachingSessions.id))
    .where(eq(coachingNoteStars.userId, dbUser.id))
    .orderBy(desc(coachingNoteStars.createdAt));

  const coachingCards = starredRows.map((row) => {
    const text = row.textOverride || row.text;
    // Mandarin pane = simplified input, Cantonese pane = traditional input
    const isMandarin = row.pane === "mandarin";
    return {
      id: `coaching-${row.noteId}`,
      source: "coaching" as const,
      chinese: text, // traditional (or original text)
      simplified: isMandarin ? text : undefined, // mandarin notes are already simplified
      romanization: row.romanization || "",
      pinyin: isMandarin ? (row.romanization || "") : "",
      jyutping: !isMandarin ? (row.romanization || "") : "",
      english: row.translation || "",
      pane: row.pane,
      createdAt: row.starredAt?.toISOString() ?? new Date().toISOString(),
      noteId: row.noteId,
    };
  });

  // 2. Saved vocabulary (from Reader and Listening Lab)
  const vocabRows = await db
    .select()
    .from(savedVocabulary)
    .where(eq(savedVocabulary.userId, dbUser.id))
    .orderBy(desc(savedVocabulary.createdAt));

  const vocabCards = vocabRows.map((row) => ({
    id: `vocab-${row.id}`,
    source: "vocabulary" as const,
    chinese: row.traditional,
    simplified: row.simplified,
    pinyin: row.pinyin || "",
    jyutping: row.jyutping || "",
    romanization: [row.pinyin, row.jyutping].filter(Boolean).join(" / "),
    english: (row.definitions ?? [])
      .filter((d) => !d.startsWith("CL:") && !/^\((?:Tw|tw|Taiwan|dialect|archaic|old)\)/.test(d))
      .map((d) => d.replace(/\s*\(Tw\)\s*/gi, "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("; "),
    pane: row.jyutping ? ("cantonese" as const) : ("mandarin" as const),
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    vocabId: row.id,
  }));

  // 2b. Generic flashcard saves from any LMS surface
  const flashcardRows = await db
    .select()
    .from(flashcardSaves)
    .where(eq(flashcardSaves.userId, dbUser.id))
    .orderBy(desc(flashcardSaves.createdAt));

  const savedCards = flashcardRows.map((row) => {
    const normalizedLanguage = normalizeFlashcardLanguage(row.language);
    const pane =
      normalizedLanguage === "cantonese"
        ? "cantonese"
        : normalizedLanguage === "mandarin"
          ? "mandarin"
          : row.jyutping
            ? "cantonese"
            : "mandarin";
    return {
      id: `flashcard-${row.id}`,
      source: "saved" as const,
      chinese: row.chinese,
      simplified: row.simplified ?? undefined,
      pinyin: row.pinyin ?? undefined,
      jyutping: row.jyutping ?? undefined,
      romanization: [row.pinyin, row.jyutping].filter(Boolean).join(" / "),
      english: row.english ?? "",
      pane,
      createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
      flashcardId: row.id,
      sourceLabel: row.sourceLabel,
      sourceType: row.sourceType,
      sourceUrl: row.sourceUrl ?? undefined,
      contentKey: row.contentKey,
    };
  });

  // 3. Starred notepad notes
  const notepadRows = await db
    .select()
    .from(notepadNotes)
    .where(eq(notepadNotes.userId, dbUser.id))
    .orderBy(desc(notepadNotes.createdAt));

  const notepadCards = notepadRows
    .filter((row) => row.starred === 1)
    .map((row) => {
      const text = row.textOverride || row.text;
      const isMandarin = row.pane === "mandarin";
      return {
        id: `notepad-${row.id}`,
        source: "notepad" as const,
        chinese: text,
        simplified: isMandarin ? text : undefined,
        romanization: row.romanizationOverride || "",
        pinyin: isMandarin ? (row.romanizationOverride || "") : "",
        jyutping: !isMandarin ? (row.romanizationOverride || "") : "",
        english: row.translationOverride || "",
        pane: row.pane,
        createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
        noteId: row.id,
      };
    });

  const allCards = [...savedCards, ...coachingCards, ...notepadCards, ...vocabCards];
  const deduped = new Map<string, (typeof allCards)[number]>();
  for (const card of allCards) {
    const inferredLanguage =
      card.pane === "cantonese" ? "cantonese" : "mandarin";
    const key = buildFlashcardContentKey({
      chinese: card.chinese,
      simplified: card.simplified ?? null,
      pinyin: card.pinyin ?? null,
      jyutping: card.jyutping ?? null,
      english: card.english ?? null,
      language: inferredLanguage,
    });
    if (!deduped.has(key)) {
      deduped.set(key, card);
    }
  }

  return NextResponse.json({
    cards: [...deduped.values()],
  });
}
