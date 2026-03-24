import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, typingSentences, typingProgress } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { FeatureGate } from "@/components/auth/FeatureGate";
import TypingDrillClient from "./TypingDrillClient";

export default async function TypingDrillPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) redirect("/sign-in");

  // Fetch all sentences ordered by language then sortOrder
  const sentences = await db
    .select({
      id: typingSentences.id,
      language: typingSentences.language,
      chineseText: typingSentences.chineseText,
      englishText: typingSentences.englishText,
      romanisation: typingSentences.romanisation,
      sortOrder: typingSentences.sortOrder,
    })
    .from(typingSentences)
    .orderBy(asc(typingSentences.language), asc(typingSentences.sortOrder));

  // Fetch user's completed sentence IDs
  const progressRows = await db
    .select({ sentenceId: typingProgress.sentenceId })
    .from(typingProgress)
    .where(eq(typingProgress.userId, user.id));

  const completedIds = progressRows.map((r) => r.sentenceId);

  return (
    <FeatureGate feature="mandarin_accelerator">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">
            Typing Unlock Kit
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Practice typing Chinese characters from English and romanisation
            prompts.
          </p>
        </div>
        <TypingDrillClient
          sentences={sentences}
          initialCompletedIds={completedIds}
        />
      </div>
    </FeatureGate>
  );
}
