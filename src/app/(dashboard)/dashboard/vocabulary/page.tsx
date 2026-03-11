import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { savedVocabulary } from "@/db/schema";
import { VocabularyClient } from "./VocabularyClient";
import { FeatureGate } from "@/components/auth/FeatureGate";

export const metadata = {
  title: "My Vocabulary | Canto to Mando",
};

/**
 * Saved vocabulary list page.
 *
 * Server component that queries all saved vocabulary for the authenticated
 * user and passes them to VocabularyClient for interactive rendering.
 */
export default async function VocabularyPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/sign-in");
  }

  const items = await db
    .select()
    .from(savedVocabulary)
    .where(eq(savedVocabulary.userId, user.id))
    .orderBy(desc(savedVocabulary.createdAt));

  return (
    <FeatureGate feature="dictionary_reader">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">My Vocabulary</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Words you&apos;ve saved from the Reader
          </p>
        </div>

        <VocabularyClient items={items} />
      </div>
    </FeatureGate>
  );
}
