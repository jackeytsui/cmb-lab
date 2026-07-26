/**
 * VideoAsk → CMB Lab Video Threads migration
 *
 * Two-phase, resumable migration following the GHL scraper pattern
 * (scripts/ghl-scrape-course.ts): phase 1 exports raw VideoAsk data to local
 * JSON so we always keep an untouched copy; phase 2 transforms and imports
 * into the video-threads system, ingesting each question's video into Mux
 * directly from VideoAsk's CDN URL (no local download needed).
 *
 *   VideoAsk form     → video_threads row        (marker [videoask:<form_id>]
 *                                                 in description = idempotency)
 *   VideoAsk question → video_thread_steps row   (sortOrder = question order)
 *   question video    → Mux asset + video_uploads row
 *                                                 (mux_upload_id = videoask:<question_id>)
 *   option jumps      → step.logic  [{ condition, nextStepId }]
 *   default jump      → step.fallbackStepId
 *
 * Usage:
 *   # 1. Export everything (or a subset) from VideoAsk to .migration/videoask/
 *   npx tsx scripts/migrate-videoask.ts export [--forms id1,id2] [--limit N]
 *
 *   # 2. Preview what an import would do (no DB or Mux writes)
 *   npx tsx scripts/migrate-videoask.ts import --dry-run [--limit N]
 *
 *   # 3. Small-batch test: import one form for real
 *   npx tsx scripts/migrate-videoask.ts import --limit 1 --creator-email you@example.com
 *
 *   # 4. Full run
 *   npx tsx scripts/migrate-videoask.ts import --creator-email you@example.com
 *
 * Flags:
 *   --forms id1,id2        Only these VideoAsk form ids
 *   --limit N              Cap number of forms processed (small-batch testing)
 *   --dry-run              Import phase: print the plan, write nothing
 *   --skip-videos          Import steps without Mux ingest (uploadId left null;
 *                          videoUrl still set to the VideoAsk CDN url)
 *   --replace              Re-import forms that already have a migrated thread
 *                          (deletes the existing thread; steps cascade)
 *   --creator-email X      LMS user (by email) recorded as thread creator and
 *                          video uploader. Required for non-dry-run imports.
 *   --storage blob|mux     Where videos land (default blob — private Vercel
 *                          Blob store, same as course-library content, played
 *                          via /api/video-threads/stream. mux ingests to Mux
 *                          instead; requires a paid Mux plan at our volume.)
 *   --wait-minutes N       Mux only: how long to wait for assets to become
 *                          ready before giving up on playback ids (default 10)
 *
 * Required env vars (.env.local):
 *   VIDEOASK_API_TOKEN   Bearer token. Quick start: log into app.videoask.com,
 *                        Account → API → copy token (valid ~2h). For long runs
 *                        create a Developer App (Organization Settings →
 *                        Developer Apps) and use its OAuth access token.
 *   DATABASE_URL         Neon Postgres (import phase)
 *   BLOB_READ_WRITE_TOKEN             Vercel Blob token (--storage blob)
 *   MUX_TOKEN_ID / MUX_TOKEN_SECRET   Mux API credentials (--storage mux)
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { desc, eq, like } from "drizzle-orm";
import Mux from "@mux/mux-node";
import { put } from "@vercel/blob";
import * as schema from "../src/db/schema";
import {
  transformForm,
  resolveStepConnections,
  videoaskMarker,
  type VideoAskForm,
  type NormalizedThread,
} from "../src/lib/videoask-migration";

const { videoThreads, videoThreadSteps, videoUploads, users } = schema;

const VIDEOASK_API = "https://api.videoask.com";
const EXPORT_DIR = path.join(process.cwd(), ".migration", "videoask");
const FORMS_DIR = path.join(EXPORT_DIR, "forms");
const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  command: "export" | "import";
  forms: string[] | null;
  limit: number | null;
  dryRun: boolean;
  skipVideos: boolean;
  replace: boolean;
  creatorEmail: string | null;
  waitMinutes: number;
  storage: "blob" | "mux";
}

function parseArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command !== "export" && command !== "import") {
    console.error(
      "Usage: npx tsx scripts/migrate-videoask.ts <export|import> [flags]\n" +
        "Run with a command to see behavior; see file header for flags."
    );
    process.exit(1);
  }

  const args: CliArgs = {
    command,
    forms: null,
    limit: null,
    dryRun: false,
    skipVideos: false,
    replace: false,
    creatorEmail: null,
    waitMinutes: 10,
    storage: "blob",
  };

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    switch (flag) {
      case "--forms":
        args.forms = (rest[++i] ?? "").split(",").filter(Boolean);
        break;
      case "--limit":
        args.limit = Number(rest[++i]);
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--skip-videos":
        args.skipVideos = true;
        break;
      case "--replace":
        args.replace = true;
        break;
      case "--creator-email":
        args.creatorEmail = rest[++i] ?? null;
        break;
      case "--wait-minutes":
        args.waitMinutes = Number(rest[++i]) || 10;
        break;
      case "--storage": {
        const value = rest[++i];
        if (value !== "blob" && value !== "mux") {
          console.error(`--storage must be "blob" or "mux", got: ${value}`);
          process.exit(1);
        }
        args.storage = value;
        break;
      }
      default:
        console.error(`Unknown flag: ${flag}`);
        process.exit(1);
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// VideoAsk API client
// ---------------------------------------------------------------------------

function videoaskHeaders(): Record<string, string> {
  const token = process.env.VIDEOASK_API_TOKEN;
  if (!token) {
    console.error(
      "VIDEOASK_API_TOKEN is required. Get one from app.videoask.com → Account → API."
    );
    process.exit(1);
  }
  return { Authorization: `Bearer ${token}` };
}

async function videoaskGet<T>(pathname: string): Promise<T> {
  const res = await fetch(`${VIDEOASK_API}${pathname}`, {
    headers: videoaskHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `VideoAsk API ${res.status} on ${pathname}: ${body.slice(0, 300)}`
    );
  }
  return (await res.json()) as T;
}

interface FormListPage {
  results?: VideoAskForm[];
  // Some responses return the array directly
  [key: number]: unknown;
}

async function listAllForms(): Promise<VideoAskForm[]> {
  const forms: VideoAskForm[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await videoaskGet<FormListPage | VideoAskForm[]>(
      `/forms?limit=${PAGE_SIZE}&offset=${offset}`
    );
    const batch = Array.isArray(page) ? page : page.results ?? [];
    forms.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return forms;
}

// ---------------------------------------------------------------------------
// Phase 1: export
// ---------------------------------------------------------------------------

async function runExport(args: CliArgs): Promise<void> {
  await mkdir(FORMS_DIR, { recursive: true });

  console.log("Listing VideoAsk forms…");
  let forms = await listAllForms();
  console.log(`  found ${forms.length} form(s)`);

  if (args.forms) {
    forms = forms.filter((f) => args.forms!.includes(f.form_id));
  }
  if (args.limit) {
    forms = forms.slice(0, args.limit);
  }

  const manifest: {
    exportedAt: string;
    forms: { formId: string; title: string | null; questions: number; respondents: number | null }[];
  } = { exportedAt: new Date().toISOString(), forms: [] };

  for (const summary of forms) {
    // The list endpoint may omit questions — fetch full detail per form.
    const detail = await videoaskGet<VideoAskForm>(`/forms/${summary.form_id}`);
    const file = path.join(FORMS_DIR, `${detail.form_id}.json`);
    await writeFile(file, JSON.stringify(detail, null, 2));
    const questionCount = detail.questions?.length ?? 0;
    manifest.forms.push({
      formId: detail.form_id,
      title: detail.title ?? null,
      questions: questionCount,
      respondents: detail.respondents_count ?? null,
    });
    console.log(
      `  exported ${detail.form_id}  "${detail.title ?? "(untitled)"}"  ${questionCount} question(s)`
    );
  }

  await writeFile(
    path.join(EXPORT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(
    `\nDone. ${manifest.forms.length} form(s) exported to ${path.relative(process.cwd(), FORMS_DIR)}/`
  );
}

// ---------------------------------------------------------------------------
// Phase 2: import
// ---------------------------------------------------------------------------

/**
 * Stream a VideoAsk CDN video into the private Vercel Blob store.
 * Mirrors the GHL migration pattern (scripts/ghl-scrape-course.ts).
 * Retries transient failures twice before giving up.
 */
async function mirrorVideoToBlob(
  mediaUrl: string,
  formId: string,
  questionId: string
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(mediaUrl);
      if (!resp.ok || !resp.body) {
        throw new Error(`VideoAsk CDN ${resp.status}`);
      }
      const blob = await put(
        `video-threads/videoask-migration/${formId}/${questionId}.mp4`,
        resp.body,
        {
          access: "private",
          addRandomSuffix: true,
          contentType: "video/mp4",
          token: process.env.BLOB_READ_WRITE_TOKEN!,
        }
      );
      return blob.url;
    } catch (err) {
      lastError = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Create a Mux asset from a URL, retrying transient failures (429/5xx) with
 * exponential backoff. Returns null on permanent failure (bad input URL).
 */
async function createMuxAssetWithRetry(
  mux: Mux,
  url: string,
  passthrough: string
): Promise<{ id: string } | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await mux.video.assets.create({
        inputs: [{ url }],
        playback_policies: ["public"],
        encoding_tier: "baseline",
        passthrough,
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (retryable && attempt < 3) {
        const wait = 2000 * 2 ** attempt;
        console.warn(`  Mux ${status} — retrying in ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      console.warn(`  Mux asset create failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
  return null;
}

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required for the import phase.");
    process.exit(1);
  }
  return drizzle(neon(url), { schema });
}

async function loadExportedForms(args: CliArgs): Promise<VideoAskForm[]> {
  let files: string[];
  try {
    files = (await readdir(FORMS_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    console.error(
      `No export found at ${FORMS_DIR}. Run the export phase first:\n` +
        "  npx tsx scripts/migrate-videoask.ts export"
    );
    process.exit(1);
  }

  const forms: VideoAskForm[] = [];
  for (const file of files.sort()) {
    const raw = await readFile(path.join(FORMS_DIR, file), "utf8");
    forms.push(JSON.parse(raw) as VideoAskForm);
  }

  let selected = forms;
  if (args.forms) {
    selected = selected.filter((f) => args.forms!.includes(f.form_id));
  }
  if (args.limit) {
    selected = selected.slice(0, args.limit);
  }
  return selected;
}

function printDryRun(threads: NormalizedThread[]): void {
  let empty = 0;
  for (const thread of threads) {
    if (thread.steps.length === 0) {
      empty++;
      console.log(`\nThread: "${thread.title}" (${thread.vaFormId}) — 0 questions, would be SKIPPED`);
      continue;
    }
    console.log(
      `\nThread: "${thread.title}"  (videoask form ${thread.vaFormId}, status ${thread.status ?? "?"})`
    );
    console.log(`  ${thread.steps.length} step(s)`);
    for (const step of thread.steps) {
      const jumps =
        step.optionJumps.length > 0
          ? ` jumps: ${step.optionJumps.map((j) => `"${j.optionValue}"→${j.vaTargetQuestionId}`).join(", ")}`
          : "";
      const fallback = step.defaultJumpVaQuestionId
        ? ` default→${step.defaultJumpVaQuestionId}`
        : "";
      const warnings = [
        ...step.externalUrlJumps.map((u) => `URL jump (unsupported): ${u}`),
        ...(step.crossQuestionConditions > 0
          ? [`${step.crossQuestionConditions} cross-question condition(s) left unwired`]
          : []),
      ];
      console.log(
        `  [${step.sortOrder}] ${step.responseType}${step.isEndScreen ? " (end screen)" : ""}` +
          `  media=${step.mediaUrl ? "yes" : "no"}  "${(step.promptText ?? "").slice(0, 60)}"${jumps}${fallback}`
      );
      for (const warning of warnings) console.log(`      ⚠ ${warning}`);
    }
  }
  console.log(
    `\nDry run: ${threads.length - empty} thread(s) would be created` +
      (empty ? `, ${empty} empty form(s) skipped` : "") +
      ". No writes performed."
  );
}

async function runImport(args: CliArgs): Promise<void> {
  const rawForms = await loadExportedForms(args);
  if (rawForms.length === 0) {
    console.log("Nothing to import (no exported forms matched the filters).");
    return;
  }

  const threads = rawForms.map(transformForm);

  if (args.dryRun) {
    printDryRun(threads);
    return;
  }

  if (!args.creatorEmail) {
    console.error(
      "--creator-email is required for a real import (thread creator + video uploader)."
    );
    process.exit(1);
  }

  const db = createDb();

  // Most recent account wins when the email has duplicate user rows
  // (happens after Clerk re-signups).
  const [creator] = await db
    .select({ id: users.id, clerkId: users.clerkId, email: users.email })
    .from(users)
    .where(eq(users.email, args.creatorEmail))
    .orderBy(desc(users.createdAt))
    .limit(1);
  if (!creator) {
    console.error(`No LMS user found with email ${args.creatorEmail}.`);
    process.exit(1);
  }
  console.log(`Creator: ${creator.email} (user ${creator.id}, clerk ${creator.clerkId})`);

  const useMux = !args.skipVideos && args.storage === "mux";
  const useBlob = !args.skipVideos && args.storage === "blob";

  const mux = useMux
    ? new Mux({
        tokenId: process.env.MUX_TOKEN_ID,
        tokenSecret: process.env.MUX_TOKEN_SECRET,
      })
    : null;
  if (useMux && (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET)) {
    console.error("MUX_TOKEN_ID / MUX_TOKEN_SECRET required for --storage mux.");
    process.exit(1);
  }
  if (useBlob && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN required for --storage blob (or pass --skip-videos).");
    process.exit(1);
  }
  console.log(`Video storage: ${args.skipVideos ? "skipped (VideoAsk URL fallback)" : args.storage}`);

  let imported = 0;
  let skipped = 0;
  // Assets awaiting Mux encode across ALL forms; polled once after the loop.
  const pendingAssets: { vaQuestionId: string; muxAssetId: string; dbId: string }[] = [];

  for (const thread of threads) {
    if (thread.steps.length === 0) {
      console.log(`SKIP  "${thread.title}" (${thread.vaFormId}) — form has no questions.`);
      skipped++;
      continue;
    }
    const marker = videoaskMarker(thread.vaFormId);

    // Idempotency: skip (or replace) forms already migrated
    const existing = await db
      .select({ id: videoThreads.id })
      .from(videoThreads)
      .where(like(videoThreads.description, `%${marker}%`))
      .limit(1);

    if (existing.length > 0) {
      if (!args.replace) {
        console.log(`SKIP  "${thread.title}" — already migrated (${marker}). Use --replace to re-import.`);
        skipped++;
        continue;
      }
      console.log(`REPLACE  "${thread.title}" — deleting thread ${existing[0].id}`);
      await db.delete(videoThreads).where(eq(videoThreads.id, existing[0].id));
    }

    console.log(`\nImporting "${thread.title}" (${thread.steps.length} steps)…`);

    // --- Blob mirror (default): copy each question video into the private
    // Vercel Blob store, same as course-library content. Steps get the blob
    // URL as videoUrl; the player streams it via /api/video-threads/stream.
    const uploadIdByQuestion = new Map<string, string>();
    const blobUrlByQuestion = new Map<string, string>();

    if (useBlob) {
      const mediaSteps = thread.steps.filter((s) => s.mediaUrl);
      const CONCURRENCY = 4;
      for (let i = 0; i < mediaSteps.length; i += CONCURRENCY) {
        await Promise.all(
          mediaSteps.slice(i, i + CONCURRENCY).map(async (step) => {
            try {
              const blobUrl = await mirrorVideoToBlob(step.mediaUrl!, thread.vaFormId, step.vaQuestionId);
              blobUrlByQuestion.set(step.vaQuestionId, blobUrl);
            } catch (err) {
              console.warn(
                `  video ${step.vaQuestionId}: blob mirror FAILED — ${err instanceof Error ? err.message : err} ` +
                  "(step keeps the VideoAsk URL fallback; use --replace to retry this form)"
              );
            }
          })
        );
      }
      console.log(`  mirrored ${blobUrlByQuestion.size}/${mediaSteps.length} video(s) to blob`);
    }

    // --- Mux ingest (--storage mux; reuses assets from previous partial runs) ---
    // Assets are only created here; readiness is polled once globally after
    // all forms are processed, so encoding runs in parallel on Mux's side.
    if (mux) {
      for (const step of thread.steps) {
        if (!step.mediaUrl) continue;
        const syntheticUploadId = `videoask:${step.vaQuestionId}`;

        const [existingUpload] = await db
          .select({ id: videoUploads.id, status: videoUploads.status, muxAssetId: videoUploads.muxAssetId })
          .from(videoUploads)
          .where(eq(videoUploads.muxUploadId, syntheticUploadId))
          .limit(1);

        if (existingUpload) {
          uploadIdByQuestion.set(step.vaQuestionId, existingUpload.id);
          if (existingUpload.status !== "ready" && existingUpload.muxAssetId) {
            pendingAssets.push({
              vaQuestionId: step.vaQuestionId,
              muxAssetId: existingUpload.muxAssetId,
              dbId: existingUpload.id,
            });
          }
          console.log(`  video ${step.vaQuestionId}: reusing existing upload (${existingUpload.status})`);
          continue;
        }

        const asset = await createMuxAssetWithRetry(mux, step.mediaUrl, syntheticUploadId);
        if (!asset) {
          // e.g. non-direct-file URLs (one form points at a Vimeo player page).
          // Step keeps the original URL as videoUrl fallback.
          console.warn(`  video ${step.vaQuestionId}: Mux ingest FAILED for ${step.mediaUrl}`);
          continue;
        }

        const [record] = await db
          .insert(videoUploads)
          .values({
            muxUploadId: syntheticUploadId,
            muxAssetId: asset.id,
            filename: `${thread.vaFormId}/${step.vaQuestionId}.mp4`,
            status: "processing",
            category: "prompt",
            tags: ["videoask-migration"],
            uploadedBy: creator.clerkId,
          })
          .returning({ id: videoUploads.id });

        uploadIdByQuestion.set(step.vaQuestionId, record.id);
        pendingAssets.push({
          vaQuestionId: step.vaQuestionId,
          muxAssetId: asset.id,
          dbId: record.id,
        });
        console.log(`  video ${step.vaQuestionId}: Mux ingest started (asset ${asset.id})`);
      }
    }

    // --- Thread + steps (two passes: insert, then wire logic uuids) ---
    const [threadRow] = await db
      .insert(videoThreads)
      .values({
        title: thread.title,
        description: thread.description,
        createdBy: creator.id,
      })
      .returning({ id: videoThreads.id });

    const idMap = new Map<string, string>();
    for (const step of thread.steps) {
      const [stepRow] = await db
        .insert(videoThreadSteps)
        .values({
          threadId: threadRow.id,
          uploadId: uploadIdByQuestion.get(step.vaQuestionId) ?? null,
          videoUrl: blobUrlByQuestion.get(step.vaQuestionId) ?? step.mediaUrl,
          promptText: step.promptText,
          responseType: step.responseType,
          allowedResponseTypes: step.allowedResponseTypes,
          responseOptions: step.responseOptions,
          isEndScreen: step.isEndScreen,
          sortOrder: step.sortOrder,
          positionX: step.positionX,
          positionY: step.positionY,
        })
        .returning({ id: videoThreadSteps.id });
      idMap.set(step.vaQuestionId, stepRow.id);
    }

    for (const step of thread.steps) {
      const { logic, fallbackStepId, unresolved } = resolveStepConnections(step, idMap);
      if (unresolved.length > 0) {
        console.warn(
          `  step ${step.vaQuestionId}: unresolved jump target(s) ${unresolved.join(", ")} — left unwired`
        );
      }
      if (logic || fallbackStepId) {
        await db
          .update(videoThreadSteps)
          .set({ logic, fallbackStepId })
          .where(eq(videoThreadSteps.id, idMap.get(step.vaQuestionId)!));
      }
    }

    console.log(`  created thread ${threadRow.id} with ${thread.steps.length} step(s)`);
    imported++;
  }

  // --- Global Mux readiness pass: attach playback ids as encodes finish ---
  if (mux && pendingAssets.length > 0) {
    console.log(`\nWaiting for ${pendingAssets.length} Mux asset(s) to finish encoding (max ${args.waitMinutes}m)…`);
    const deadline = Date.now() + args.waitMinutes * 60_000;
    let ready = 0;
    let errored = 0;
    while (pendingAssets.length > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5_000));
      for (let i = pendingAssets.length - 1; i >= 0; i--) {
        const pending = pendingAssets[i];
        let asset;
        try {
          asset = await mux.video.assets.retrieve(pending.muxAssetId);
        } catch {
          continue; // transient; retry on next sweep
        }
        if (asset.status === "ready") {
          await db
            .update(videoUploads)
            .set({
              status: "ready",
              muxPlaybackId: asset.playback_ids?.[0]?.id ?? null,
              durationSeconds: asset.duration ? Math.round(asset.duration) : null,
            })
            .where(eq(videoUploads.id, pending.dbId));
          ready++;
          pendingAssets.splice(i, 1);
        } else if (asset.status === "errored") {
          await db
            .update(videoUploads)
            .set({ status: "errored", errorMessage: JSON.stringify(asset.errors ?? null) })
            .where(eq(videoUploads.id, pending.dbId));
          console.error(`  video ${pending.vaQuestionId}: Mux ERRORED`);
          errored++;
          pendingAssets.splice(i, 1);
        }
      }
      if ((ready + errored) % 50 < 5) {
        console.log(`  ${ready} ready, ${errored} errored, ${pendingAssets.length} still encoding…`);
      }
    }
    console.log(`Encoding complete: ${ready} ready, ${errored} errored, ${pendingAssets.length} timed out.`);
    if (pendingAssets.length > 0) {
      console.warn(
        "Timed-out videos keep the VideoAsk URL fallback; re-running import later reuses the assets and attaches playback ids."
      );
    }
  }

  console.log(`\nDone. Imported ${imported}, skipped ${skipped} (already migrated).`);
  console.log(
    "Verify in the app: /admin/video-threads → open the migrated thread in the builder, " +
      "check step order, videos, and branching edges, then test-run it from /dashboard/threads."
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "export") {
    await runExport(args);
  } else {
    await runImport(args);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
