import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  coachingNoteStars,
  coachingNotes,
  coachingSessions,
  savedVocabulary,
} from "@/db/schema";

/**
 * GET /api/flashcards
 * Returns all flashcard items for the current user:
 *   - Starred coaching notes (from 1:1 and inner circle)
 *   - Saved vocabulary (from AI Passage Reader and YouTube Listening Lab)
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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

  const coachingCards = starredRows.map((row) => ({
    id: `coaching-${row.noteId}`,
    source: "coaching" as const,
    sourceLabel:
      row.sessionType === "one_on_one"
        ? "1:1 Coaching"
        : "Inner Circle",
    sessionTitle: row.sessionTitle,
    chinese: row.textOverride || row.text,
    romanization: row.romanization || "",
    english: row.translation || "",
    pane: row.pane,
    createdAt: row.starredAt?.toISOString() ?? new Date().toISOString(),
    noteId: row.noteId,
  }));

  // 2. Saved vocabulary (from Reader and Listening Lab)
  const vocabRows = await db
    .select()
    .from(savedVocabulary)
    .where(eq(savedVocabulary.userId, dbUser.id))
    .orderBy(desc(savedVocabulary.createdAt));

  const vocabCards = vocabRows.map((row) => ({
    id: `vocab-${row.id}`,
    source: "vocabulary" as const,
    sourceLabel: "Saved Vocabulary",
    chinese: row.traditional,
    simplified: row.simplified,
    romanization: [row.pinyin, row.jyutping].filter(Boolean).join(" / "),
    english: (row.definitions ?? []).join("; "),
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    vocabId: row.id,
  }));

  return NextResponse.json({
    cards: [...coachingCards, ...vocabCards],
  });
}
