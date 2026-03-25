import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, curatedPassages, passageReadStatus } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { FeatureGate } from "@/components/auth/FeatureGate";
import Link from "next/link";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { AdminEditLink } from "../AdminEditLink";

async function CuratedPassagesList() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) redirect("/sign-in");

  // Fetch all passages ordered by sortOrder
  const passages = await db
    .select()
    .from(curatedPassages)
    .orderBy(asc(curatedPassages.sortOrder));

  // Fetch current user's read status
  const readStatuses = await db
    .select({ passageId: passageReadStatus.passageId })
    .from(passageReadStatus)
    .where(eq(passageReadStatus.userId, user.id));

  const readPassageIds = new Set(readStatuses.map((s) => s.passageId));

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            AI Reader (Curated Passages)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Read curated Mandarin passages with full Reader features.
          </p>
        </div>
        <AdminEditLink href="/admin/accelerator/reader" />
      </div>

      {passages.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8">
          No passages available yet. Check back soon!
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {passages.map((passage) => {
            const isRead = readPassageIds.has(passage.id);
            return (
              <Link
                key={passage.id}
                href={`/dashboard/accelerator/reader/${passage.id}`}
                className="block rounded-lg border border-border bg-card p-5 hover:bg-accent hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="w-5 h-5 text-muted-foreground shrink-0" />
                    <h2 className="text-lg font-semibold text-foreground truncate">
                      {passage.title}
                    </h2>
                  </div>
                  {isRead ? (
                    <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      Read
                    </span>
                  ) : (
                    <span className="inline-flex items-center shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground border border-border">
                      Unread
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {passage.body.slice(0, 120)}
                  {passage.body.length > 120 ? "..." : ""}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AcceleratorReaderPage() {
  return (
    <FeatureGate feature="mandarin_accelerator">
      <CuratedPassagesList />
    </FeatureGate>
  );
}
