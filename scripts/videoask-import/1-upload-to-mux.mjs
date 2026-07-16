#!/usr/bin/env node
/**
 * Step 1 - Ingest VideoAsk videos into Mux.
 *
 * Reads a normalized manifest (see manifest.example.json), and for every lesson
 * that has a `videoUrl` but no `muxPlaybackId`, creates a Mux asset directly from
 * that URL (Mux pulls the file server-side, so no local download is needed),
 * waits for it to become ready, then writes `muxPlaybackId`, `muxAssetId` and
 * `durationSeconds` back into the manifest in place.
 *
 * Idempotent: lessons that already have a muxPlaybackId are skipped, so you can
 * re-run after a failure without re-uploading.
 *
 * Requires env: MUX_TOKEN_ID, MUX_TOKEN_SECRET  (same tokens the app uses).
 *
 * Usage:
 *   node scripts/videoask-import/1-upload-to-mux.mjs [path/to/videoask-manifest.json]
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import Mux from "@mux/mux-node";

const manifestPath = process.argv[2] || "./videoask-manifest.json";

if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
  console.error("Missing MUX_TOKEN_ID / MUX_TOKEN_SECRET in the environment (.env).");
  process.exit(1);
}

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForAsset(assetId, { timeoutMs = 15 * 60 * 1000, intervalMs = 5000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const asset = await mux.video.assets.retrieve(assetId);
    if (asset.status === "ready") return asset;
    if (asset.status === "errored") {
      throw new Error(`Mux asset ${assetId} errored: ${JSON.stringify(asset.errors ?? {})}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for Mux asset ${assetId} to become ready.`);
    }
    await sleep(intervalMs);
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const lessons = manifest.modules.flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l })));

  const pending = lessons.filter(({ lesson }) => lesson.videoUrl && !lesson.muxPlaybackId);
  console.log(`Manifest: ${lessons.length} lesson(s); ${pending.length} need Mux ingest.`);

  let done = 0;
  for (const { module, lesson } of pending) {
    const label = `[${module.title} > ${lesson.title}]`;
    try {
      console.log(`${label} creating Mux asset from ${lesson.videoUrl}`);
      const asset = await mux.video.assets.create({
        input: [{ url: lesson.videoUrl }],
        playback_policy: ["public"],
        encoding_tier: "baseline",
      });
      const ready = await waitForAsset(asset.id);
      const playbackId = ready.playback_ids?.find((p) => p.policy === "public")?.id
        ?? ready.playback_ids?.[0]?.id;
      if (!playbackId) throw new Error("Asset became ready but has no playback id.");

      lesson.muxAssetId = ready.id;
      lesson.muxPlaybackId = playbackId;
      if (typeof ready.duration === "number") {
        lesson.durationSeconds = Math.round(ready.duration);
      }
      done += 1;
      console.log(`${label} ready -> playbackId=${playbackId} (${lesson.durationSeconds ?? "?"}s)`);

      // Persist after every success so a crash never loses completed work.
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    } catch (err) {
      console.error(`${label} FAILED: ${err.message}`);
      console.error("Stopping so you can inspect. Re-run to resume (completed lessons are skipped).");
      process.exit(1);
    }
  }

  console.log(`Done. ${done} lesson(s) ingested. Manifest updated: ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
