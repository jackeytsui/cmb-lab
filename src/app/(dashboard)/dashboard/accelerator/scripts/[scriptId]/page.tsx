import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  conversationScripts,
  scriptLines,
  scriptLineProgress,
} from "@/db/schema/accelerator";
import { eq, asc, and, gt, lt, desc } from "drizzle-orm";
import { FeatureGate } from "@/components/auth/FeatureGate";
import ScriptPracticeClient from "./ScriptPracticeClient";

export default async function ScriptPracticePage({
  params,
}: {
  params: Promise<{ scriptId: string }>;
}) {
  const { scriptId } = await params;

  return (
    <FeatureGate feature="mandarin_accelerator">
      <ScriptPracticeContent scriptId={scriptId} />
    </FeatureGate>
  );
}

async function ScriptPracticeContent({ scriptId }: { scriptId: string }) {
  // Fetch script with lines
  const script = await db.query.conversationScripts.findFirst({
    where: eq(conversationScripts.id, scriptId),
    with: {
      lines: {
        orderBy: [asc(scriptLines.sortOrder)],
      },
    },
  });

  if (!script) return notFound();

  // Fetch user progress
  const { userId: clerkId } = await auth();
  let initialRatings: Array<{ lineId: string; selfRating: string }> = [];

  if (clerkId) {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });

    if (user) {
      const progress = await db
        .select({
          lineId: scriptLineProgress.lineId,
          selfRating: scriptLineProgress.selfRating,
        })
        .from(scriptLineProgress)
        .innerJoin(
          scriptLines,
          eq(scriptLineProgress.lineId, scriptLines.id)
        )
        .where(
          and(
            eq(scriptLineProgress.userId, user.id),
            eq(scriptLines.scriptId, scriptId)
          )
        );

      initialRatings = progress;
    }
  }

  // Find previous and next scripts
  const [prevScript, nextScript] = await Promise.all([
    db.query.conversationScripts.findFirst({
      where: lt(conversationScripts.sortOrder, script.sortOrder),
      orderBy: [desc(conversationScripts.sortOrder)],
      columns: { id: true },
    }),
    db.query.conversationScripts.findFirst({
      where: gt(conversationScripts.sortOrder, script.sortOrder),
      orderBy: [asc(conversationScripts.sortOrder)],
      columns: { id: true },
    }),
  ]);

  return (
    <ScriptPracticeClient
      script={{
        id: script.id,
        title: script.title,
        description: script.description,
        speakerRole: script.speakerRole,
        responderRole: script.responderRole,
      }}
      prevScriptId={prevScript?.id ?? null}
      nextScriptId={nextScript?.id ?? null}
      nextScriptTitle={null}
      lines={script.lines.map((l) => ({
        id: l.id,
        sortOrder: l.sortOrder,
        role: l.role,
        cantoneseText: l.cantoneseText,
        mandarinText: l.mandarinText,
        cantoneseRomanisation: l.cantoneseRomanisation,
        mandarinRomanisation: l.mandarinRomanisation,
        englishText: l.englishText,
        cantoneseAudioUrl: l.cantoneseAudioUrl,
        mandarinAudioUrl: l.mandarinAudioUrl,
      }))}
      initialRatings={initialRatings}
    />
  );
}
