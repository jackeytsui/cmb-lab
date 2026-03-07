import "server-only";

import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  practiceAttempts,
  srsCards,
  studyPreferences,
  tonePracticeAttempts,
  grammarBookmarks,
} from "@/db/schema";

export interface StudyTodayRecommendation {
  id: string;
  type: "srs" | "practice" | "tone" | "grammar";
  title: string;
  detail: string;
  priority: number;
  estimatedMinutes: number;
  href: string;
}

export async function getStudyPreferences(userId: string) {
  const pref = await db.query.studyPreferences.findFirst({
    where: eq(studyPreferences.userId, userId),
  });

  return pref ?? { userId, dailyMinutes: 30, updatedAt: new Date() };
}

export async function upsertStudyPreferences(userId: string, dailyMinutes: number) {
  const existing = await db.query.studyPreferences.findFirst({
    where: eq(studyPreferences.userId, userId),
  });

  if (existing) {
    const [updated] = await db
      .update(studyPreferences)
      .set({ dailyMinutes })
      .where(eq(studyPreferences.userId, userId))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(studyPreferences)
    .values({ userId, dailyMinutes })
    .returning();
  return created;
}

export async function getStudyToday(userId: string) {
  const [dueCards, weakPractice, weakTone, bookmarkedGrammar, pref] = await Promise.all([
    db.query.srsCards.findMany({
      where: and(
        eq(srsCards.userId, userId),
        isNull(srsCards.archivedAt),
        lte(srsCards.due, new Date()),
      ),
      orderBy: [desc(srsCards.updatedAt)],
      limit: 200,
    }),
    db.query.practiceAttempts.findMany({
      where: eq(practiceAttempts.userId, userId),
      orderBy: [desc(practiceAttempts.startedAt)],
      limit: 20,
    }),
    db.query.tonePracticeAttempts.findMany({
      where: eq(tonePracticeAttempts.userId, userId),
      orderBy: [desc(tonePracticeAttempts.createdAt)],
      limit: 20,
    }),
    db.query.grammarBookmarks.findMany({
      where: eq(grammarBookmarks.userId, userId),
      limit: 5,
    }),
    getStudyPreferences(userId),
  ]);

  const dueTodayCount = dueCards.length;
  const weakPracticeAttempts = weakPractice.filter((a) => (a.score ?? 0) < 70).length;
  const avgTone = weakTone.length
    ? weakTone.reduce((acc, a) => acc + Number(a.score ?? 0), 0) / weakTone.length
    : 100;

  const recommendations: StudyTodayRecommendation[] = [];

  if (dueTodayCount > 0) {
    recommendations.push({
      id: "srs-due",
      type: "srs",
      title: `Review ${dueTodayCount} due flashcards`,
      detail: "Spaced repetition reviews keep retention high.",
      priority: 100,
      estimatedMinutes: Math.max(10, Math.ceil(dueTodayCount / 6)),
      href: "/dashboard/srs",
    });
  }

  recommendations.push({
    id: "practice-weak",
    type: "practice",
    title: weakPracticeAttempts > 0
      ? `Revisit ${weakPracticeAttempts} weak practice attempts`
      : "Keep practice momentum",
    detail: weakPracticeAttempts > 0
      ? "You scored below 70 on recent attempts. Retake one set."
      : "Try one practice set to maintain progress.",
    priority: weakPracticeAttempts > 0 ? 80 : 45,
    estimatedMinutes: weakPracticeAttempts > 0 ? 20 : 15,
    href: "/dashboard/practice",
  });

  recommendations.push({
    id: "tone-drill",
    type: "tone",
    title: avgTone < 75 ? "Tone accuracy booster" : "Tone maintenance drill",
    detail: avgTone < 75
      ? "Recent tone performance indicates confusion. Run a focused drill."
      : "Quick tone drills to protect pronunciation gains.",
    priority: avgTone < 75 ? 70 : 40,
    estimatedMinutes: 10,
    href: "/dashboard/tone",
  });

  if (bookmarkedGrammar.length > 0) {
    recommendations.push({
      id: "grammar-review",
      type: "grammar",
      title: "Review bookmarked grammar patterns",
      detail: `You have ${bookmarkedGrammar.length} saved grammar items ready for revision.`,
      priority: 35,
      estimatedMinutes: 10,
      href: "/dashboard/grammar",
    });
  }

  const sorted = recommendations.sort((a, b) => b.priority - a.priority);
  const totalSuggestedMinutes = sorted.reduce((sum, item) => sum + item.estimatedMinutes, 0);

  return {
    dailyGoalMinutes: pref.dailyMinutes,
    totalSuggestedMinutes,
    recommendations: sorted,
  };
}
