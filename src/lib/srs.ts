import "server-only";

import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { savedVocabulary, srsCards, srsDecks, srsReviews, type SrsRating } from "@/db/schema";
import { scheduleFsrsReview } from "@/lib/fsrs";

export async function getOrCreateDefaultDeck(userId: string) {
  const existing = await db.query.srsDecks.findFirst({
    where: and(eq(srsDecks.userId, userId), eq(srsDecks.isDefault, true)),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(srsDecks)
    .values({
      userId,
      name: "Default Deck",
      description: "Auto-created starter deck",
      isDefault: true,
    })
    .returning();

  return created;
}

export async function createSrsCardFromSavedVocabulary(params: {
  userId: string;
  savedVocabularyId: string;
  deckId?: string;
}) {
  const vocab = await db.query.savedVocabulary.findFirst({
    where: and(
      eq(savedVocabulary.id, params.savedVocabularyId),
      eq(savedVocabulary.userId, params.userId)
    ),
  });
  if (!vocab) {
    throw new Error("Vocabulary item not found");
  }

  const defaultDeck = params.deckId
    ? { id: params.deckId }
    : await getOrCreateDefaultDeck(params.userId);

  const [existing] = await db
    .select({ id: srsCards.id })
    .from(srsCards)
    .where(
      and(
        eq(srsCards.userId, params.userId),
        eq(srsCards.sourceType, "vocabulary"),
        eq(srsCards.sourceId, params.savedVocabularyId),
        isNull(srsCards.archivedAt)
      )
    );

  if (existing) {
    return { id: existing.id, alreadyExists: true as const };
  }

  const [inserted] = await db
    .insert(srsCards)
    .values({
      userId: params.userId,
      deckId: defaultDeck.id,
      sourceType: "vocabulary",
      sourceId: vocab.id,
      traditional: vocab.traditional,
      simplified: vocab.simplified,
      pinyin: vocab.pinyin,
      jyutping: vocab.jyutping,
      meaning: (vocab.definitions ?? []).filter((d: string) => !d.startsWith("CL:")).slice(0, 3).join("; ") || "No definition",
      example: vocab.notes ?? null,
    })
    .returning({ id: srsCards.id });

  return { id: inserted.id, alreadyExists: false as const };
}

export async function createSrsCardFromDictionaryWord(params: {
  userId: string;
  deckId?: string;
  traditional: string;
  simplified?: string;
  pinyin?: string;
  jyutping?: string;
  meaning: string;
  example?: string;
  sourceType?: "reader" | "manual" | "practice" | "grammar" | "assessment";
}) {
  const deck = params.deckId
    ? { id: params.deckId }
    : await getOrCreateDefaultDeck(params.userId);

  const [inserted] = await db
    .insert(srsCards)
    .values({
      userId: params.userId,
      deckId: deck.id,
      sourceType: params.sourceType ?? "reader",
      traditional: params.traditional,
      simplified: params.simplified ?? params.traditional,
      pinyin: params.pinyin ?? null,
      jyutping: params.jyutping ?? null,
      meaning: params.meaning,
      example: params.example ?? null,
    })
    .returning({ id: srsCards.id });

  return inserted;
}

export async function getDueCards(userId: string, limit = 50, deckId?: string) {
  const whereClause = deckId
    ? and(
        eq(srsCards.userId, userId),
        eq(srsCards.deckId, deckId),
        isNull(srsCards.archivedAt),
        lte(srsCards.due, new Date())
      )
    : and(
        eq(srsCards.userId, userId),
        isNull(srsCards.archivedAt),
        lte(srsCards.due, new Date())
      );

  return db.query.srsCards.findMany({
    where: whereClause,
    orderBy: [asc(srsCards.due)],
    limit,
  });
}

export async function reviewCard(params: {
  userId: string;
  cardId: string;
  rating: SrsRating;
}) {
  const card = await db.query.srsCards.findFirst({
    where: and(eq(srsCards.id, params.cardId), eq(srsCards.userId, params.userId)),
  });
  if (!card) {
    throw new Error("Card not found");
  }

  const result = scheduleFsrsReview(
    {
      state: card.state,
      stability: Number(card.stability ?? 0.3),
      difficulty: Number(card.difficulty ?? 5),
      elapsedDays: card.elapsedDays ?? 0,
      reps: card.reps ?? 0,
      lapses: card.lapses ?? 0,
    },
    params.rating
  );

  await db.insert(srsReviews).values({
    cardId: card.id,
    userId: params.userId,
    rating: params.rating,
    stateBefore: card.state,
    stateAfter: result.nextState,
    stability: result.stability,
    difficulty: result.difficulty,
    elapsedDays: result.elapsedDays,
    scheduledDays: result.scheduledDays,
  });

  const [updated] = await db
    .update(srsCards)
    .set({
      state: result.nextState,
      due: result.dueAt,
      stability: result.stability,
      difficulty: result.difficulty,
      elapsedDays: result.elapsedDays,
      scheduledDays: result.scheduledDays,
      reps: result.reps,
      lapses: result.lapses,
      lastReviewAt: new Date(),
    })
    .where(and(eq(srsCards.id, card.id), eq(srsCards.userId, params.userId)))
    .returning();

  return updated;
}

export async function getSrsStats(userId: string) {
  const [counts] = await db
    .select({
      dueToday: sql<number>`COUNT(*) FILTER (WHERE ${srsCards.due} <= NOW() AND ${srsCards.archivedAt} IS NULL)`,
      newCount: sql<number>`COUNT(*) FILTER (WHERE ${srsCards.state} = 'new' AND ${srsCards.archivedAt} IS NULL)`,
      learningCount: sql<number>`COUNT(*) FILTER (WHERE ${srsCards.state} IN ('learning', 'relearning') AND ${srsCards.archivedAt} IS NULL)`,
      reviewCount: sql<number>`COUNT(*) FILTER (WHERE ${srsCards.state} = 'review' AND ${srsCards.archivedAt} IS NULL)`,
      masteredCount: sql<number>`COUNT(*) FILTER (WHERE ${srsCards.stability} >= 30 AND ${srsCards.archivedAt} IS NULL)`,
      total: sql<number>`COUNT(*) FILTER (WHERE ${srsCards.archivedAt} IS NULL)`,
    })
    .from(srsCards)
    .where(eq(srsCards.userId, userId));

  return {
    dueToday: Number(counts?.dueToday ?? 0),
    new: Number(counts?.newCount ?? 0),
    learning: Number(counts?.learningCount ?? 0),
    review: Number(counts?.reviewCount ?? 0),
    mastered: Number(counts?.masteredCount ?? 0),
    total: Number(counts?.total ?? 0),
  };
}

export async function getDecksWithCounts(userId: string) {
  const decks = await db.query.srsDecks.findMany({
    where: eq(srsDecks.userId, userId),
    orderBy: [asc(srsDecks.name)],
  });

  if (decks.length === 0) {
    const created = await getOrCreateDefaultDeck(userId);
    return [
      {
        ...created,
        totalCards: 0,
        dueCards: 0,
      },
    ];
  }

  const deckIds = decks.map((d) => d.id);

  const counts = await db
    .select({
      deckId: srsCards.deckId,
      totalCards: sql<number>`COUNT(*)`,
      dueCards: sql<number>`COUNT(*) FILTER (WHERE ${srsCards.due} <= NOW())`,
    })
    .from(srsCards)
    .where(
      and(
        eq(srsCards.userId, userId),
        isNull(srsCards.archivedAt),
        inArray(srsCards.deckId, deckIds)
      )
    )
    .groupBy(srsCards.deckId);

  const countMap = new Map(
    counts.map((c) => [c.deckId, { totalCards: Number(c.totalCards), dueCards: Number(c.dueCards) }])
  );

  return decks.map((deck) => ({
    ...deck,
    totalCards: countMap.get(deck.id)?.totalCards ?? 0,
    dueCards: countMap.get(deck.id)?.dueCards ?? 0,
  }));
}
