import { redirect } from "next/navigation";
import { hasMinimumRole } from "@/lib/auth";
import { VocabularyListsClient } from "./VocabularyListsClient";

export default async function CoachVocabularyPage() {
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    redirect("/dashboard");
  }

  return <VocabularyListsClient />;
}
