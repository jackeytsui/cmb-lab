import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWatchHistory } from "@/lib/video-history";
import { HistoryClient } from "./HistoryClient";
import { ArrowLeft } from "lucide-react";

/**
 * Watch History page -- server component that queries DB directly.
 * Lists all previously watched videos with completion progress.
 */
export default async function WatchHistoryPage() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    redirect("/sign-in");
  }

  // Look up internal user from DB (same pattern as dashboard page)
  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (!user) {
    redirect("/sign-in");
  }

  const entries = await getWatchHistory(user.id);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with back link */}
      <div className="mb-8">
        <Link
          href="/dashboard/listening"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Listening Lab
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Watch History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {entries.length > 0
            ? `${entries.length} video${entries.length === 1 ? "" : "s"} watched`
            : "No videos watched yet"}
        </p>
      </div>

      <HistoryClient entries={entries} />
    </div>
  );
}
