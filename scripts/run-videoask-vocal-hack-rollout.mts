import { config } from "dotenv";

const envFile =
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--env-file="))
    ?.split("=", 2)[1] ?? ".env.local";

config({ path: envFile });

const args = new Set(process.argv.slice(2));
const mode = args.has("--transcribe")
  ? "transcribe"
  : args.has("--reromanise")
    ? "reromanise"
    : args.has("--publish")
      ? "publish"
    : "status";
const confirmed = args.has("--confirm");
const placementIds = process.argv
  .slice(2)
  .flatMap((argument) =>
    argument.startsWith("--placement-id=")
      ? [argument.split("=", 2)[1]]
      : [],
  );
const requestedConcurrency = Number(
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--concurrency="))
    ?.split("=", 2)[1] ?? 4,
);
const requestedMaxClips = Number(
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--max-clips="))
    ?.split("=", 2)[1] ?? Number.POSITIVE_INFINITY,
);
const concurrency = Math.min(
  8,
  Math.max(1, Number.isFinite(requestedConcurrency) ? requestedConcurrency : 4),
);
const maxClips = Number.isFinite(requestedMaxClips)
  ? Math.max(1, Math.round(requestedMaxClips))
  : Number.POSITIVE_INFINITY;

async function main() {
  const {
    getVocalHackWorkflowStatus,
    processNextVocalHackSentence,
    publishReadyStrongVocalHackPlacements,
    publishVocalHackPlacement,
    queueVocalHackTranscription,
  } = await import("../src/lib/videoask/vocal-hack-workflow");

  function summarize(
    workflow: Awaited<ReturnType<typeof getVocalHackWorkflowStatus>>,
  ) {
    const sentences = workflow.sentences;
    return {
      placements: workflow.placements.length,
      published: workflow.placements.filter(
        (placement) => placement.status === "published",
      ).length,
      ready: sentences.ready ?? 0,
      pending: sentences.pending ?? 0,
      processing: sentences.processing ?? 0,
      failed: sentences.failed ?? 0,
      held: sentences.held ?? 0,
    };
  }

  if (mode === "status") {
    console.log(JSON.stringify(summarize(await getVocalHackWorkflowStatus())));
    return;
  }

  if (!confirmed) {
    throw new Error(
      mode === "transcribe"
        ? "Refusing to queue transcription without --confirm. This sends staged coach clips to the configured OpenAI account."
        : mode === "reromanise"
          ? "Refusing to update staged romanisation without --confirm."
          : "Refusing to publish staged lessons without --confirm.",
    );
  }

  if (mode === "publish") {
    const [{ desc, isNotNull }, { db }, schema] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db"),
      import("../src/db/schema"),
    ]);
    const [actor] = await db
      .select({ id: schema.videoaskVocalHackPlacements.approvedBy })
      .from(schema.videoaskVocalHackPlacements)
      .where(
        isNotNull(schema.videoaskVocalHackPlacements.approvedBy),
      )
      .orderBy(desc(schema.videoaskVocalHackPlacements.publishedAt))
      .limit(1);
    if (!actor?.id) {
      throw new Error(
        "No previous administrator approval is available for the publication audit trail.",
      );
    }

    if (placementIds.length > 0) {
      const published = [];
      for (const placementId of placementIds) {
        published.push({
          placementId,
          ...(await publishVocalHackPlacement(placementId, actor.id)),
        });
      }
      console.log(JSON.stringify({ published }));
      return;
    }

    let published = 0;
    while (true) {
      const batch = await publishReadyStrongVocalHackPlacements(actor.id, 10);
      published += batch.published;
      console.log(
        `Published ${published}; ${batch.remaining} strong placements remain.`,
      );
      if (batch.failures.length > 0) {
        console.error(JSON.stringify({ failures: batch.failures }));
        throw new Error(
          `${batch.failures.length} publication(s) failed: ${batch.failures[0].error}`,
        );
      }
      if (batch.remaining === 0 || batch.attempted === 0) break;
    }
    console.log(JSON.stringify({ published }));
    return;
  }

  if (mode === "reromanise") {
    const [{ eq }, { db }, schema, { smartRomanise }] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db"),
      import("../src/db/schema"),
      import("../src/lib/romanise"),
    ]);
    const rows = await db
      .select({
        id: schema.videoaskVocalHackSentences.id,
        chinese: schema.videoaskVocalHackSentences.chinese,
        pinyin: schema.videoaskVocalHackSentences.pinyin,
        language: schema.videoaskVocalHackPlacements.language,
      })
      .from(schema.videoaskVocalHackSentences)
      .innerJoin(
        schema.videoaskVocalHackPlacements,
        eq(
          schema.videoaskVocalHackPlacements.id,
          schema.videoaskVocalHackSentences.placementId,
        ),
      );
    const changed = rows.flatMap((row) => {
      if (!row.chinese) return [];
      const pinyin = smartRomanise(
        row.chinese,
        row.language === "cantonese" ? "cantonese" : "mandarin",
      );
      return pinyin === row.pinyin ? [] : [{ id: row.id, pinyin }];
    });
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(8, changed.length) }, async () => {
        while (cursor < changed.length) {
          const row = changed[cursor++];
          await db
            .update(schema.videoaskVocalHackSentences)
            .set({ pinyin: row.pinyin, updatedAt: new Date() })
            .where(eq(schema.videoaskVocalHackSentences.id, row.id));
        }
      }),
    );
    console.log(JSON.stringify({ inspected: rows.length, changed: changed.length }));
    return;
  }

  const queued = await queueVocalHackTranscription({ mode: "safe" });
  console.log(
    `Queued ${queued.sentences} sentence clips across ${queued.placements} placements (concurrency ${concurrency}).`,
  );

  let processed = 0;
  let failedAttempts = 0;
  let remaining = queued.sentences;

  while (processed < maxClips) {
    const workerCount = Math.min(concurrency, maxClips - processed);
    const batch = await Promise.all(
      Array.from({ length: workerCount }, () => processNextVocalHackSentence()),
    );
    const completed = batch.filter((result) => result.status !== "empty");
    if (completed.length === 0) {
      remaining = Math.max(
        0,
        ...batch.map((result) => result.remaining ?? 0),
      );
      break;
    }

    processed += completed.length;
    failedAttempts += completed.filter(
      (result) => result.status === "failed",
    ).length;
    if (processed % 20 < concurrency || processed === queued.sentences) {
      console.log(
        `Processed ${processed}; failed attempts ${failedAttempts}; checking the durable queue…`,
      );
    }
  }

  const summary = summarize(await getVocalHackWorkflowStatus());
  const intentionallyPaused =
    Number.isFinite(maxClips) && processed >= maxClips;
  remaining =
    summary.pending + summary.processing + summary.failed + summary.held;
  console.log(
    JSON.stringify({
      processed,
      failedAttempts,
      intentionallyPaused,
      remaining,
      ...summary,
    }),
  );
  if (!intentionallyPaused && (remaining > 0 || summary.failed > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
