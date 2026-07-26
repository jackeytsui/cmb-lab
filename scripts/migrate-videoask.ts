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
 *   --wait-minutes N       How long to wait for Mux assets to become ready
 *                          before giving up on playback ids (default 10)
 *
 * Required env vars (.env.local):
 *   VIDEOASK_API_TOKEN   Bearer token. Quick start: log into app.videoask.com,
 *                        Account → API → copy token (valid ~2h). For long runs
 *                        create a Developer App (Organization Settings →
 *                        Developer Apps) and use its OAuth access token.
 *   DATABASE_URL         Neon Postgres (import phase)
 *   MUX_TOKEN_ID / MUX_TOKEN_SECRET   Mux API credentials (import phase,
 *                        unless --skip-videos)
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, like } from "drizzle-orm";
import Mux from "@mux/mux-node";
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
      title: detail.title ?? detail.label ?? null,
      questions: questionCount,
      respondents: detail.respondents_count ?? null,
    });
    console.log(
      `  exported ${detail.form_id}  "${detail.title ?? detail.label ?? "(untitled)"}"  ${questionCount} question(s)`
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
  for (const thread of threads) {
    console.log(`\nThread: "${thread.title}"  (videoask form ${thread.vaFormId})`);
    console.log(`  ${thread.steps.length} step(s), ${thread.respondentsCount ?? "?"} historical respondents (not migrated)`);
    for (const step of thread.steps) {
      const jumps =
        step.optionJumps.length > 0
          ? ` jumps: ${step.optionJumps.map((j) => `"${j.optionValue}"→${j.vaTargetQuestionId}`).join(", ")}`
          : "";
      const fallback = step.defaultJumpVaQuestionId
        ? ` default→${step.defaultJumpVaQuestionId}`
        : "";
      console.log(
        `  [${step.sortOrder}] ${step.responseType}${step.isEndScreen ? " (end screen)" : ""}` +
          `  media=${step.mediaUrl ? "yes" : "no"}  "${(step.promptText ?? "").slice(0, 60)}"${jumps}${fallback}`
      );
    }
  }
  console.log(`\nDry run: ${threads.length} thread(s) would be created. No writes performed.`);
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

  const [creator] = await db
    .select({ id: users.id, clerkId: users.clerkId, email: users.email })
    .from(users)
    .where(eq(users.email, args.creatorEmail))
    .limit(1);
  if (!creator) {
    console.error(`No LMS user found with email ${args.creatorEmail}.`);
    process.exit(1);
  }

  const mux = args.skipVideos
    ? null
    : new Mux({
        tokenId: process.env.MUX_TOKEN_ID,
        tokenSecret: process.env.MUX_TOKEN_SECRET,
      });
  if (!args.skipVideos && (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET)) {
    console.error("MUX_TOKEN_ID / MUX_TOKEN_SECRET required (or pass --skip-videos).");
    process.exit(1);
  }

  let imported = 0;
  let skipped = 0;

  for (const thread of threads) {
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

    // --- Mux ingest (reuses assets from previous partial runs) ---
    const uploadIdByQuestion = new Map<string, string>();
    const pendingAssets: { vaQuestionId: string; muxAssetId: string; dbId: string }[] = [];

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

        const asset = await mux.video.assets.create({
          inputs: [{ url: step.mediaUrl }],
          playback_policies: ["public"],
          encoding_tier: "baseline",
          passthrough: syntheticUploadId,
        });

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

      // Wait for Mux to finish pulling/encoding so steps get playback ids
      const deadline = Date.now() + args.waitMinutes * 60_000;
      while (pendingAssets.length > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5_000));
        for (let i = pendingAssets.length - 1; i >= 0; i--) {
          const pending = pendingAssets[i];
          const asset = await mux.video.assets.retrieve(pending.muxAssetId);
          if (asset.status === "ready") {
            await db
              .update(videoUploads)
              .set({
                status: "ready",
                muxPlaybackId: asset.playback_ids?.[0]?.id ?? null,
                durationSeconds: asset.duration ? Math.round(asset.duration) : null,
              })
              .where(eq(videoUploads.id, pending.dbId));
            console.log(`  video ${pending.vaQuestionId}: ready`);
            pendingAssets.splice(i, 1);
          } else if (asset.status === "errored") {
            await db
              .update(videoUploads)
              .set({ status: "errored", errorMessage: JSON.stringify(asset.errors ?? null) })
              .where(eq(videoUploads.id, pending.dbId));
            console.error(`  video ${pending.vaQuestionId}: Mux ERRORED`);
            pendingAssets.splice(i, 1);
          }
        }
      }
      for (const still of pendingAssets) {
        console.warn(
          `  video ${still.vaQuestionId}: still processing after ${args.waitMinutes}m — ` +
            "step will fall back to the VideoAsk URL until Mux finishes (re-run import later; it reuses the asset)."
        );
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
          videoUrl: step.mediaUrl,
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
