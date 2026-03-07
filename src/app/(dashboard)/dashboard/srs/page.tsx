import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SRSClient } from "@/components/srs/SRSClient";

export default async function SrsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">SRS Flashcards</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Review your due cards with FSRS scheduling and build long-term memory.
        </p>
      </div>
      <SRSClient />
    </div>
  );
}
