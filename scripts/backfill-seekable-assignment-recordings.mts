import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { get, put } from "@vercel/blob";
import fixWebmMetaInfo from "fix-webm-metainfo";

type ModernRecordingRow = {
  url: string | null;
};

type LegacySubmissionRow = {
  submission_data: string;
};

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const envPath = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--env="))
  ?.split("=", 2)[1];
const limitArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--limit="))
  ?.split("=", 2)[1];
const limit = limitArgument ? Number(limitArgument) : Number.POSITIVE_INFINITY;

if (envPath) loadEnv({ path: envPath, quiet: true });

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function isWebmUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".blob.vercel-storage.com") &&
      url.pathname.includes("assignment-recordings/") &&
      url.pathname.toLowerCase().endsWith(".webm")
    );
  } catch {
    return false;
  }
}

function legacyRecordingUrls(submissionData: string) {
  try {
    const data = JSON.parse(submissionData) as {
      audioBlobUrl?: unknown;
      recordings?: Array<{ blobUrl?: unknown }>;
    };
    return [
      data.audioBlobUrl,
      ...(Array.isArray(data.recordings)
        ? data.recordings.map((recording) => recording?.blobUrl)
        : []),
    ].filter(isWebmUrl);
  } catch {
    return [];
  }
}

async function collectRecordingUrls(databaseUrl: string) {
  const sql = neon(databaseUrl);
  const [rawSubmissionRows, rawSentenceRows, rawLegacyRows] = await Promise.all([
    sql.query(
      `SELECT student_audio_url AS url
       FROM assignment_submissions
       WHERE student_audio_url IS NOT NULL`,
    ),
    sql.query(
      `SELECT audio_url AS url
       FROM assignment_submission_sentences
       WHERE audio_url IS NOT NULL`,
    ),
    sql.query(
      `SELECT submission_data
       FROM lesson_submissions
       WHERE submission_data LIKE '%assignment-recordings/%'`,
    ),
  ]);
  const submissionRows = rawSubmissionRows as unknown as ModernRecordingRow[];
  const sentenceRows = rawSentenceRows as unknown as ModernRecordingRow[];
  const legacyRows = rawLegacyRows as unknown as LegacySubmissionRow[];

  return [
    ...new Set([
      ...submissionRows.map((row) => row.url).filter(isWebmUrl),
      ...sentenceRows.map((row) => row.url).filter(isWebmUrl),
      ...legacyRows.flatMap((row) => legacyRecordingUrls(row.submission_data)),
    ]),
  ];
}

async function repairRecording(url: string, token: string) {
  const source = await get(url, {
    access: "private",
    token,
    useCache: false,
  });
  if (!source || source.statusCode !== 200 || !source.stream) {
    throw new Error("Recording could not be downloaded");
  }

  const original = await new Response(source.stream).blob();
  const contentType = source.blob.contentType || "audio/webm";
  const typedOriginal = new Blob([original], { type: contentType });
  const repaired = await fixWebmMetaInfo(typedOriginal);
  if (repaired.size === 0) throw new Error("Repair produced an empty recording");

  const [originalBytes, repairedBytes] = await Promise.all([
    original.arrayBuffer(),
    repaired.arrayBuffer(),
  ]);
  const originalView = new Uint8Array(originalBytes);
  const repairedView = new Uint8Array(repairedBytes);
  if (
    originalBytes.byteLength === repairedBytes.byteLength &&
    originalView.every((byte, index) => byte === repairedView[index])
  ) {
    return { before: original.size, after: repaired.size, changed: false };
  }

  await put(source.blob.pathname, repaired, {
    access: "private",
    contentType,
    multipart: repaired.size >= 5 * 1024 * 1024,
    ifMatch: source.blob.etag,
    token,
  });

  return { before: original.size, after: repaired.size, changed: true };
}

async function main() {
  if (!Number.isFinite(limit) && limit !== Number.POSITIVE_INFINITY) {
    throw new Error("--limit must be a positive number");
  }
  if (limit <= 0) throw new Error("--limit must be a positive number");

  const databaseUrl = requiredEnv("DATABASE_URL");
  const token = requiredEnv("BLOB_READ_WRITE_TOKEN");
  const urls = (await collectRecordingUrls(databaseUrl)).slice(0, limit);

  console.log(
    `${apply ? "Repairing" : "Found"} ${urls.length} existing assignment WebM recording(s).`,
  );
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to overwrite each blob safely in place.");
    return;
  }

  let repaired = 0;
  let alreadySeekable = 0;
  const failures: Array<{ url: string; error: string }> = [];
  for (const [index, url] of urls.entries()) {
    try {
      const sizes = await repairRecording(url, token);
      if (sizes.changed) {
        repaired += 1;
        console.log(
          `[${index + 1}/${urls.length}] repaired ${new URL(url).pathname} (${sizes.before} -> ${sizes.after} bytes)`,
        );
      } else {
        alreadySeekable += 1;
        console.log(
          `[${index + 1}/${urls.length}] already seekable ${new URL(url).pathname}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      failures.push({ url, error: message });
      console.error(`[${index + 1}/${urls.length}] failed ${url}: ${message}`);
    }
  }

  console.log(
    JSON.stringify({
      inspected: urls.length,
      repaired,
      alreadySeekable,
      failures,
    }),
  );
  if (failures.length > 0) process.exitCode = 1;
}

await main();
