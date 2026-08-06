import { config } from "dotenv";

config({ path: ".env.local" });

const args = new Set(process.argv.slice(2));
const mode = args.has("--transcribe") ? "transcribe" : "status";
const confirmed = args.has("--confirm");
const requestedConcurrency = Number(
  process.argv
    .slice(2)
    .find((argument) => argument.startsWith("--concurrency="))
    ?.split("=", 2)[1] ?? 4,
);
const concurrency = Math.min(
  8,
  Math.max(1, Number.isFinite(requestedConcurrency) ? requestedConcurrency : 4),
);

async function main() {
  const {
    getVocalHackWorkflowStatus,
    processNextVocalHackSentence,
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
      "Refusing to queue transcription without --confirm. This sends staged coach clips to the configured OpenAI account.",
    );
  }

  const queued = await queueVocalHackTranscription({ mode: "safe" });
  console.log(
    `Queued ${queued.sentences} sentence clips across ${queued.placements} placements (concurrency ${concurrency}).`,
  );

  let processed = 0;
  let failedAttempts = 0;
  let remaining = queued.sentences;

  while (true) {
    const batch = await Promise.all(
      Array.from({ length: concurrency }, () => processNextVocalHackSentence()),
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
  console.log(
    JSON.stringify({ processed, failedAttempts, remaining, ...summary }),
  );
  if (remaining > 0 || summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
