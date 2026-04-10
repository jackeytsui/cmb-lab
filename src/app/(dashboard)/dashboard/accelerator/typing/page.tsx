import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, typingSentences, typingProgress } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { FeatureGate } from "@/components/auth/FeatureGate";
import TypingDrillClient, { type PhrasePair } from "./TypingDrillClient";
import { AdminEditLink } from "../AdminEditLink";
import { ContentPageClient } from "../ContentPageClient";
import { CompletionToggle } from "../CompletionToggle";

export default async function TypingDrillPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) redirect("/sign-in");

  // Fetch all sentences ordered by sortOrder
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
    .orderBy(asc(typingSentences.sortOrder), asc(typingSentences.language));

  // Group into pairs by sortOrder (same sortOrder = same phrase pair)
  const pairMap = new Map<number, PhrasePair>();
  for (const s of sentences) {
    if (!pairMap.has(s.sortOrder)) {
      pairMap.set(s.sortOrder, {
        sortOrder: s.sortOrder,
        english: s.englishText,
        cantonese: null,
        mandarin: null,
      });
    }
    const pair = pairMap.get(s.sortOrder)!;
    const side = {
      id: s.id,
      chineseText: s.chineseText,
      romanisation: s.romanisation,
    };
    if (s.language === "cantonese") {
      pair.cantonese = side;
    } else {
      pair.mandarin = side;
    }
    pair.english = s.englishText;
  }
  const pairs = Array.from(pairMap.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  // Fetch user's completed sentence IDs (and which were skipped).
  // The `skipped` column was added in a later migration — fall back gracefully
  // if it doesn't exist yet so the page still works pre-migration.
  let completedIds: string[] = [];
  let skippedIds: string[] = [];
  try {
    const progressRows = await db
      .select({
        sentenceId: typingProgress.sentenceId,
        skipped: typingProgress.skipped,
      })
      .from(typingProgress)
      .where(eq(typingProgress.userId, user.id));

    completedIds = progressRows.map((r) => r.sentenceId);
    skippedIds = progressRows.filter((r) => r.skipped).map((r) => r.sentenceId);
  } catch (err) {
    // If the skipped column doesn't exist yet (pre-migration), fall back to
    // the legacy query that just fetches sentenceId.
    console.warn(
      "[Typing Drill] Failed to read 'skipped' column — falling back to legacy query:",
      err instanceof Error ? err.message : err,
    );
    const legacyRows = await db
      .select({ sentenceId: typingProgress.sentenceId })
      .from(typingProgress)
      .where(eq(typingProgress.userId, user.id));
    completedIds = legacyRows.map((r) => r.sentenceId);
  }

  return (
    <FeatureGate feature="mandarin_accelerator">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              The Chinese Typing Unlock Kit
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Practice typing Chinese characters — Cantonese and Mandarin side
              by side.
            </p>
          </div>
          <AdminEditLink href="/admin/accelerator/typing" />
        </div>
        <ContentPageClient
          title="Typing Unlock Kit"
          description="Watch the video and download the guide to set up Chinese typing on your device."
          videoKey="accelerator.typing_unlock_kit.video_url"
          pdfKey="accelerator.typing_unlock_kit.pdf_url"
          scrollToId="typing-practice"
          scrollToLabel="Start Typing Practice"
        />
        <div id="typing-practice">
          <TypingDrillClient
            pairs={pairs}
            initialCompletedIds={completedIds}
            initialSkippedIds={skippedIds}
          />
        </div>
        <CompletionToggle completionKey="typing_unlock_kit" />
      </div>
    </FeatureGate>
  );
}
