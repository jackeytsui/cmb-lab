import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, curatedPassages, passageReadStatus } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { FeatureGate } from "@/components/auth/FeatureGate";
import Link from "next/link";
import { BookOpen, CheckCircle2, ArrowRight, Trophy } from "lucide-react";
import { AdminEditLink } from "../AdminEditLink";

async function CuratedPassagesList() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!user) redirect("/sign-in");

  const passages = await db
    .select()
    .from(curatedPassages)
    .orderBy(asc(curatedPassages.sortOrder));

  const readStatuses = await db
    .select({ passageId: passageReadStatus.passageId })
    .from(passageReadStatus)
    .where(eq(passageReadStatus.userId, user.id));

  const readPassageIds = new Set(readStatuses.map((s) => s.passageId));
  const allRead =
    passages.length > 0 && passages.every((p) => readPassageIds.has(p.id));
  const readCount = passages.filter((p) => readPassageIds.has(p.id)).length;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Comprehensive AI Reader
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Short Mandarin reading passages. Tap any passage to open in the
            Reader with dictionary lookup, pinyin, and audio.
          </p>
        </div>
        <AdminEditLink href="/admin/accelerator/reader" />
      </div>

      {/* Progress bar */}
      {passages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Progress</span>
            <span>
              {readCount}/{passages.length} read
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{
                width: `${(readCount / passages.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* All completed banner */}
      {allRead && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
          <Trophy className="w-6 h-6 text-emerald-500 shrink-0" />
          <div>
            <p className="font-semibold text-foreground">All Completed!</p>
            <p className="text-sm text-muted-foreground">
              You have read all {passages.length} passages.
            </p>
          </div>
        </div>
      )}

      {passages.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8">
          No passages available yet. Check back soon!
        </p>
      ) : (
        <div className="space-y-6">
          {passages.map((passage, idx) => {
            const isRead = readPassageIds.has(passage.id);
            return (
              <div
                key={passage.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <h2 className="text-lg font-bold text-foreground">
                    Passage {idx + 1} — {passage.title}
                  </h2>
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

                {/* English description */}
                {passage.description && (
                  <div className="px-5 pb-2">
                    <p className="text-sm text-muted-foreground italic">
                      {passage.description}
                    </p>
                  </div>
                )}

                {/* Passage text */}
                <div className="px-5 pb-3">
                  <p className="text-base leading-relaxed text-foreground">
                    {passage.body}
                  </p>
                </div>

                {/* Open in Reader button */}
                <div className="px-5 pb-4">
                  <Link
                    href={`/dashboard/accelerator/reader/${passage.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/50 px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    Open in Reader
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </Link>
                </div>
              </div>
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
