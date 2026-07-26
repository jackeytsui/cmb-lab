/**
 * VideoAsk → Vocal Hack migration: scrape + normalize + mirror videos
 *
 * Reads VideoAsk forms (each form is one "Video Ask"), maps each one to a
 * Course Library **Vocal Hack** lesson, mirrors every step video to Vercel
 * Blob, and writes one normalized JSON file per form into
 * scripts/scraped-videoask/. A human reviews those files (filling in any
 * Chinese that couldn't be auto-extracted) and then runs
 * scripts/videoask-import.ts to load them into CMB Lab.
 *
 * This mirrors scripts/ghl-scrape-course.ts: a local one-shot script, not a
 * Next.js route, because mirroring many large videos would blow past
 * serverless timeouts and the credentials are per-operator.
 *
 * Two input modes:
 *   1. --from-api   (default) Talk to the VideoAsk REST API directly using the
 *                   same credentials the MCP uses (VIDEOASK_API_KEY or the
 *                   OAuth trio). Add --list to just print your forms.
 *   2. --from-json <dir>  Read get_form JSON dumps you exported through the
 *                   VideoAsk MCP (Claude Code / Codex). No VideoAsk credentials
 *                   needed. Each file should be the object returned by
 *                   get_form (has `form` + `questions`/`raw_questions`).
 *
 * Usage:
 *   npx tsx scripts/videoask-migrate.ts --list
 *   npx tsx scripts/videoask-migrate.ts --forms <id1,id2> [--skip-videos] [--limit-videos N]
 *   npx tsx scripts/videoask-migrate.ts --from-json scripts/videoask-input [--skip-videos]
 *
 * Required env (.env.local):
 *   VIDEOASK_API_KEY  (or VIDEOASK_CLIENT_ID/SECRET/REFRESH_TOKEN)  — for --from-api
 *   BLOB_READ_WRITE_TOKEN  — Vercel Blob token (skip with --skip-videos)
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { put } from "@vercel/blob";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  normalizeFormToVocalHack,
  type NormalizedVocalHackLesson,
  type VideoAskForm,
  type VideoAskQuestion,
} from "../src/lib/videoask-mapping";
import { VideoAskClient } from "./videoask-client";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const USAGE = `
VideoAsk → Vocal Hack migration (scrape + mirror)

Usage:
  npx tsx scripts/videoask-migrate.ts --list
  npx tsx scripts/videoask-migrate.ts --forms <id1,id2,...> [options]
  npx tsx scripts/videoask-migrate.ts --from-json <dir> [options]

Options:
  --list                 List your VideoAsk forms (id + title) and exit.
  --forms <ids>          Comma-separated form ids to migrate (API mode).
  --all                  Migrate every form returned by list_forms (API mode).
  --from-json <dir>      Read get_form JSON dumps from <dir> instead of the API.
  --skip-videos          Don't mirror videos to Blob (fast dry run of mapping).
  --limit-videos <N>     Stop after mirroring N videos (testing).
  --out <dir>            Output dir (default: scripts/scraped-videoask).
  --limit-forms <N>      With --all, cap how many forms to pull (default 100).

Required env (.env.local):
  VIDEOASK_API_KEY  or  VIDEOASK_CLIENT_ID/SECRET/REFRESH_TOKEN   (API mode)
  BLOB_READ_WRITE_TOKEN                                           (unless --skip-videos)
`;

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(USAGE);
  process.exit(0);
}

const OUT_DIR =
  (args.out as string | undefined) ??
  path.join(process.cwd(), "scripts", "scraped-videoask");
const SKIP_VIDEOS = !!args["skip-videos"];
const LIMIT_VIDEOS = args["limit-videos"]
  ? parseInt(args["limit-videos"] as string, 10)
  : Infinity;
const FROM_JSON = args["from-json"] as string | undefined;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// ---------------------------------------------------------------------------
// Video mirroring (identical strategy to the GHL scraper)
// ---------------------------------------------------------------------------

interface VideoManifestEntry {
  blobUrl: string;
  sourceUrl: string;
  sizeBytes: number;
  mirroredAt: string;
}
type VideoManifest = Record<string, VideoManifestEntry>;

async function loadManifest(filePath: string): Promise<VideoManifest> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as VideoManifest;
  } catch {
    return {};
  }
}

async function mirrorVideoToBlob(
  sourceUrl: string,
  formId: string,
  sentenceId: string,
): Promise<{ blobUrl: string; sizeBytes: number }> {
  const resp = await fetch(sourceUrl);
  if (!resp.ok || !resp.body) {
    throw new Error(`fetch ${resp.status} ${sourceUrl}`);
  }
  const sizeBytes = Number(resp.headers.get("content-length") ?? "0");
  const contentType = resp.headers.get("content-type") ?? "video/mp4";
  const ext = contentType.includes("webm") ? "webm" : "mp4";
  // Store private-only, matching src/app/api/admin/course-library/upload/route.ts.
  const blob = await put(
    `course-library/video/videoask-migration/${formId}/${sentenceId}.${ext}`,
    resp.body,
    {
      access: "private",
      addRandomSuffix: true,
      contentType,
      token: BLOB_TOKEN!,
    },
  );
  return { blobUrl: blob.url, sizeBytes };
}

let videoCounter = 0;

async function mirrorLessonVideos(
  lesson: NormalizedVocalHackLesson,
  manifestPath: string,
): Promise<void> {
  const manifest = await loadManifest(manifestPath);
  let mirrored = 0;
  let failed = 0;

  for (const s of lesson.sentences) {
    if (!s.sourceVideoUrl) continue; // needsVideo — nothing to mirror
    if (videoCounter >= LIMIT_VIDEOS) {
      console.log(`    [limit] --limit-videos=${LIMIT_VIDEOS} reached`);
      break;
    }
    videoCounter++;

    const cached = manifest[s.id];
    if (cached) {
      s.videoUrl = cached.blobUrl;
      mirrored++;
      console.log(`    [cached] ${s.id} -> already mirrored`);
      continue;
    }
    try {
      process.stdout.write(`    [upload] ${s.id} ... `);
      const { blobUrl, sizeBytes } = await mirrorVideoToBlob(
        s.sourceVideoUrl,
        lesson.videoaskFormId,
        s.id,
      );
      s.videoUrl = blobUrl;
      manifest[s.id] = {
        blobUrl,
        sourceUrl: s.sourceVideoUrl,
        sizeBytes,
        mirroredAt: new Date().toISOString(),
      };
      mirrored++;
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`ok (${(sizeBytes / 1024 / 1024).toFixed(1)}MB)`);
    } catch (err) {
      failed++;
      console.log(`FAIL: ${(err as Error).message}`);
    }
  }
  console.log(`    videos: mirrored=${mirrored} failed=${failed}`);
}

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

interface FormBundle {
  form: VideoAskForm;
  questions: VideoAskQuestion[];
}

/** Read get_form JSON dumps from a directory (MCP export mode). */
async function loadBundlesFromJson(dir: string): Promise<FormBundle[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    throw new Error(`No .json files found in ${dir}`);
  }
  const bundles: FormBundle[] = [];
  for (const file of files.sort()) {
    const parsed = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    // Accept either the raw get_form result or { form, questions }.
    const form = (parsed.form ?? parsed) as VideoAskForm;
    const questions = (parsed.questions ??
      parsed.raw_questions ??
      []) as VideoAskQuestion[];
    bundles.push({ form, questions });
    console.log(`  loaded ${file} (${questions.length} steps)`);
  }
  return bundles;
}

/** Pull forms from the VideoAsk API (direct mode). */
async function loadBundlesFromApi(formIds: string[]): Promise<FormBundle[]> {
  const client = new VideoAskClient();
  const bundles: FormBundle[] = [];
  for (const id of formIds) {
    process.stdout.write(`  fetching form ${id} ... `);
    const result = await client.getForm(id);
    console.log(`${result.questions.length} steps`);
    bundles.push({
      form: result.form as VideoAskForm,
      questions: result.questions,
    });
  }
  return bundles;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --list: print forms and exit.
  if (args.list) {
    const client = new VideoAskClient();
    const limit = args["limit-forms"]
      ? parseInt(args["limit-forms"] as string, 10)
      : 100;
    const forms = await client.listForms(limit);
    console.log(`\n${forms.length} form(s):\n`);
    for (const f of forms) {
      const id = f.form_id ?? f.id ?? "(no id)";
      const title = f.title ?? f.name ?? "(untitled)";
      console.log(`  ${id}  ${title}`);
    }
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  const scrapedAt = new Date().toISOString();

  // Resolve the list of forms to process.
  let bundles: FormBundle[];
  if (FROM_JSON) {
    console.log(`Reading MCP JSON dumps from ${FROM_JSON}`);
    bundles = await loadBundlesFromJson(FROM_JSON);
  } else {
    let formIds: string[] = [];
    if (args.all) {
      const client = new VideoAskClient();
      const limit = args["limit-forms"]
        ? parseInt(args["limit-forms"] as string, 10)
        : 100;
      const forms = await client.listForms(limit);
      formIds = forms
        .map((f) => f.form_id ?? f.id)
        .filter((x): x is string => !!x);
    } else {
      formIds = String((args.forms as string) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (formIds.length === 0) {
      console.error("Error: pass --forms <ids>, --all, or --from-json <dir>\n");
      console.error(USAGE);
      process.exit(1);
    }
    console.log(`Fetching ${formIds.length} form(s) from the VideoAsk API`);
    bundles = await loadBundlesFromApi(formIds);
  }

  if (!SKIP_VIDEOS && !BLOB_TOKEN) {
    console.error(
      "Error: BLOB_READ_WRITE_TOKEN is required to mirror videos (or pass --skip-videos)\n",
    );
    process.exit(1);
  }

  let anyReview = false;
  const index: Array<{ file: string; formId: string; title: string; needsReview: boolean }> = [];

  // Preserve the order forms were given ("one by one, in order").
  for (let i = 0; i < bundles.length; i++) {
    const { form, questions } = bundles[i];
    const lesson = normalizeFormToVocalHack(form, questions, { scrapedAt });
    console.log(
      `\n=== ${lesson.title} (${lesson.videoaskFormId || "no-id"}) ===`,
    );
    console.log(
      `  steps=${lesson.stats.totalSteps} sentences=${lesson.sentences.length}` +
        ` needChinese=${lesson.stats.sentencesNeedingChinese}` +
        ` needVideo=${lesson.stats.sentencesNeedingVideo}`,
    );

    if (!SKIP_VIDEOS) {
      const manifestPath = path.join(
        OUT_DIR,
        `${lesson.videoaskFormId || `form-${i}`}.videos.json`,
      );
      await mirrorLessonVideos(lesson, manifestPath);
    } else {
      console.log("  (--skip-videos: not mirroring)");
    }

    const fileName = `${String(i).padStart(3, "0")}-${
      lesson.videoaskFormId || `form-${i}`
    }.json`;
    const outPath = path.join(OUT_DIR, fileName);
    // sortOrder for import = position in this run.
    await writeFile(
      outPath,
      JSON.stringify({ sortOrder: i, ...lesson }, null, 2),
    );
    console.log(`  wrote ${path.relative(process.cwd(), outPath)}`);

    if (lesson.needsReview) anyReview = true;
    index.push({
      file: fileName,
      formId: lesson.videoaskFormId,
      title: lesson.title,
      needsReview: lesson.needsReview,
    });
  }

  // A manifest that videoask-import.ts consumes (order + review flags).
  await writeFile(
    path.join(OUT_DIR, "index.json"),
    JSON.stringify({ scrapedAt, lessons: index }, null, 2),
  );
  console.log(`\nWrote ${path.relative(process.cwd(), path.join(OUT_DIR, "index.json"))}`);

  console.log("\nDone.");
  if (anyReview) {
    console.log(
      "\n⚠  Some lessons need review (missing Chinese or video). Open the JSON\n" +
        "   files above, fill in the `chinese` field for any sentence with\n" +
        '   "needsChinese": true, then run scripts/videoask-import.ts.',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
