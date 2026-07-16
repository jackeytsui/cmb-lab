#!/usr/bin/env node
/**
 * Step 2 - Assemble the CantoMando course-import payload from the manifest.
 *
 * Transforms the normalized manifest (with muxPlaybackId already filled by
 * step 1) into the exact JSON shape accepted by
 *   POST /api/admin/courses/[courseId]/import
 * i.e. { modules: [ { title, description?, lessons: [ { title, description?,
 *        content?, video?: { muxPlaybackId, durationSeconds? } } ] } ] }.
 *
 * Pure transform - no network, no credentials. Fails loudly if any lesson that
 * has a videoUrl is still missing its muxPlaybackId (run step 1 first).
 *
 * Usage:
 *   node scripts/videoask-import/2-build-import-json.mjs \
 *     [path/to/videoask-manifest.json] [path/to/import-payload.json]
 */
import { readFile, writeFile } from "node:fs/promises";

const manifestPath = process.argv[2] || "./videoask-manifest.json";
const outPath = process.argv[3] || "./import-payload.json";

function toContent(text) {
  if (!text || !text.trim()) return undefined;
  // If it already looks like HTML, pass through; otherwise wrap paragraphs.
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.trim().replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const problems = [];

  const modules = manifest.modules.map((m) => ({
    title: m.title,
    ...(m.description ? { description: m.description } : {}),
    lessons: m.lessons.map((l) => {
      if (l.videoUrl && !l.muxPlaybackId) {
        problems.push(`${m.title} > ${l.title}: has videoUrl but no muxPlaybackId (run step 1).`);
      }
      const content = toContent(l.text);
      return {
        title: l.title,
        ...(l.description ? { description: l.description } : {}),
        ...(content ? { content } : {}),
        ...(l.muxPlaybackId
          ? {
              video: {
                muxPlaybackId: l.muxPlaybackId,
                ...(typeof l.durationSeconds === "number"
                  ? { durationSeconds: l.durationSeconds }
                  : {}),
              },
            }
          : {}),
      };
    }),
  }));

  if (problems.length) {
    console.error("Cannot build payload - unresolved videos:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }

  const payload = { modules };
  await writeFile(outPath, JSON.stringify(payload, null, 2) + "\n");

  const lessonCount = modules.reduce((n, m) => n + m.lessons.length, 0);
  const withVideo = modules.reduce(
    (n, m) => n + m.lessons.filter((l) => l.video).length,
    0,
  );
  console.log(`Wrote ${outPath}`);
  console.log(`  modules: ${modules.length}`);
  console.log(`  lessons: ${lessonCount} (${withVideo} with video)`);
  console.log(`  targetCourseId (from manifest): ${manifest.targetCourseId}`);
  console.log("");
  console.log("Next: dry-run the import (see README step 5) before replacing anything.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
