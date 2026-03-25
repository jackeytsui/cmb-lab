import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  conversationScripts,
  scriptLines,
  scriptLineProgress,
} from "@/db/schema/accelerator";
import { eq, asc, and, sql } from "drizzle-orm";
import { FeatureGate } from "@/components/auth/FeatureGate";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { AdminEditLink } from "../AdminEditLink";

export default async function ScriptsPage() {
  return (
    <FeatureGate feature="mandarin_accelerator">
      <ScriptsContent />
    </FeatureGate>
  );
}

async function ScriptsContent() {
  const { userId: clerkId } = await auth();
  let dbUserId: string | null = null;

  if (clerkId) {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });
    dbUserId = user?.id ?? null;
  }

  // Fetch all scripts with line counts
  const scripts = await db.query.conversationScripts.findMany({
    orderBy: [asc(conversationScripts.sortOrder)],
    with: {
      lines: {
        columns: { id: true },
      },
    },
  });

  // Fetch user progress for good-rated lines
  let goodCountMap: Map<string, number> = new Map();
  if (dbUserId) {
    const progress = await db
      .select({
        scriptId: scriptLines.scriptId,
        goodCount: sql<number>`count(*)`.as("good_count"),
      })
      .from(scriptLineProgress)
      .innerJoin(scriptLines, eq(scriptLineProgress.lineId, scriptLines.id))
      .where(
        and(
          eq(scriptLineProgress.userId, dbUserId),
          eq(scriptLineProgress.selfRating, "good")
        )
      )
      .groupBy(scriptLines.scriptId);

    for (const row of progress) {
      goodCountMap.set(row.scriptId, Number(row.goodCount));
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Conversation Scripts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Practice speaking with real-life dialogue scenarios.
          </p>
        </div>
        <AdminEditLink href="/admin/accelerator/scripts" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scripts.map((script) => {
          const totalLines = script.lines.length;
          const goodCount = goodCountMap.get(script.id) ?? 0;
          const progressPercent =
            totalLines > 0 ? Math.round((goodCount / totalLines) * 100) : 0;

          return (
            <Link
              key={script.id}
              href={`/dashboard/accelerator/scripts/${script.id}`}
              className="block group"
            >
              <div className="border border-border rounded-xl p-5 bg-card hover:bg-accent hover:border-border transition-colors h-full flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <MessageSquare className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">
                      {script.title}
                    </h2>
                    {script.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {script.description}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  Speaker: {script.speakerRole} / Responder:{" "}
                  {script.responderRole}
                </p>

                <div className="mt-auto">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>
                      {goodCount}/{totalLines} lines practiced
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {scripts.length === 0 && (
        <p className="text-muted-foreground text-sm py-12 text-center">
          No conversation scripts available yet.
        </p>
      )}
    </div>
  );
}
