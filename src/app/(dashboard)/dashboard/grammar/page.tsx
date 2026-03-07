import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import GrammarLibraryClient from "./GrammarLibraryClient";

export default async function GrammarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Grammar Library</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Browse grammar patterns by HSK level, category, and search keywords.
        </p>
      </div>
      <GrammarLibraryClient />
    </div>
  );
}
