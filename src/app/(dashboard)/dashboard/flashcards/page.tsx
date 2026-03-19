import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { FlashcardsClient } from "./FlashcardsClient";

export const metadata = {
  title: "Flashcards - Canto to Mando Lab",
};

export default async function FlashcardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Flashcards</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your starred and saved items from coaching sessions, AI Passage Reader, and YouTube Listening Lab.
        </p>
      </div>
      <FlashcardsClient />
    </div>
  );
}
