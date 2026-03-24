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
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">
          Conversation Scripts
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Practice speaking with real-life dialogue scenarios.
        </p>
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
              <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700 transition-colors h-full flex flex-col">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-amber-900/30">
                    <MessageSquare className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-amber-200 transition-colors">
                      {script.title}
                    </h2>
                    {script.description && (
                      <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">
                        {script.description}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-xs text-zinc-500 mb-3">
                  Speaker: {script.speakerRole} / Responder:{" "}
                  {script.responderRole}
                </p>

                <div className="mt-auto">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                    <span>
                      {goodCount}/{totalLines} lines practiced
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
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
        <p className="text-zinc-500 text-sm py-12 text-center">
          No conversation scripts available yet.
        </p>
      )}
    </div>
  );
}
