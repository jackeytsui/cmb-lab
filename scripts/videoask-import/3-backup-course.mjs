#!/usr/bin/env node
/**
 * Step 3 - Back up a course's current content BEFORE any destructive replace.
 *
 * Read-only. Dumps the target course + its (non-deleted) modules, lessons and
 * lesson attachments to a timestamped JSON file under ./backups/. This file is
 * required by step 4 (the archive step refuses to run without a matching, fresh
 * backup).
 *
 * Uses a direct Neon connection (the app's `db` is server-only and cannot be
 * imported by a standalone script).
 *
 * Requires env: DATABASE_URL
 *
 * Usage:
 *   node scripts/videoask-import/3-backup-course.mjs --course <courseId>
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const courseId = arg("--course");
if (!courseId) {
  console.error("Usage: node scripts/videoask-import/3-backup-course.mjs --course <courseId>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in the environment (.env).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const [course] = await sql`
    SELECT id, title, description, is_published, sort_order, created_at, updated_at
    FROM courses
    WHERE id = ${courseId} AND deleted_at IS NULL
  `;
  if (!course) {
    console.error(`Course ${courseId} not found (or already deleted).`);
    process.exit(1);
  }

  const modules = await sql`
    SELECT id, title, description, sort_order
    FROM modules
    WHERE course_id = ${courseId} AND deleted_at IS NULL
    ORDER BY sort_order
  `;

  const lessons = await sql`
    SELECT l.id, l.module_id, l.title, l.description, l.content,
           l.mux_playback_id, l.mux_asset_id, l.duration_seconds, l.sort_order
    FROM lessons l
    JOIN modules m ON m.id = l.module_id
    WHERE m.course_id = ${courseId} AND l.deleted_at IS NULL
    ORDER BY l.module_id, l.sort_order
  `;

  const attachments = await sql`
    SELECT a.id, a.lesson_id, a.title, a.url, a.type, a.sort_order
    FROM lesson_attachments a
    JOIN lessons l ON l.id = a.lesson_id
    JOIN modules m ON m.id = l.module_id
    WHERE m.course_id = ${courseId} AND l.deleted_at IS NULL
    ORDER BY a.lesson_id, a.sort_order
  `;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = {
    kind: "cantomando-course-backup",
    version: 1,
    takenAt: new Date().toISOString(),
    courseId,
    course,
    counts: { modules: modules.length, lessons: lessons.length, attachments: attachments.length },
    modules,
    lessons,
    attachments,
  };

  await mkdir("./backups", { recursive: true });
  const outPath = `./backups/course-${courseId}-${stamp}.json`;
  await writeFile(outPath, JSON.stringify(backup, null, 2) + "\n");

  console.log(`Backed up course "${course.title}"`);
  console.log(`  modules: ${modules.length}, lessons: ${lessons.length}, attachments: ${attachments.length}`);
  console.log(`  -> ${outPath}`);
  console.log("");
  console.log("Keep this file. Step 4 requires it to archive existing content.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
