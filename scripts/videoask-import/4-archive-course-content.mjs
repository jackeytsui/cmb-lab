#!/usr/bin/env node
/**
 * Step 4 - DESTRUCTIVE. Archive (soft-delete) a course's existing modules and
 * lessons so the append-only importer can then populate it with fresh content.
 *
 * This is the "replace" half of "replace course content". It sets deleted_at on
 * every non-deleted module and lesson of the target course. Students lose access
 * to the old lessons immediately. This is irreversible via this script - recovery
 * means restoring from the step-3 backup.
 *
 * Guard rails:
 *   - Defaults to DRY-RUN. Nothing changes unless you pass --confirm.
 *   - Requires a --backup <file> produced by step 3 for THIS course, whose counts
 *     match the live data, and taken within the last 24h. Refuses otherwise.
 *   - Runs inside a single transaction.
 *
 * Requires env: DATABASE_URL
 *
 * Usage (dry-run):
 *   node scripts/videoask-import/4-archive-course-content.mjs --course <id> --backup ./backups/<file>.json
 * Usage (execute):
 *   node scripts/videoask-import/4-archive-course-content.mjs --course <id> --backup ./backups/<file>.json --confirm
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name) => process.argv.includes(name);

const courseId = arg("--course");
const backupPath = arg("--backup");
const confirm = has("--confirm");

if (!courseId || !backupPath) {
  console.error("Usage: node scripts/videoask-import/4-archive-course-content.mjs --course <id> --backup <file> [--confirm]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in the environment (.env).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  // --- Validate the backup file ---
  let backup;
  try {
    backup = JSON.parse(await readFile(backupPath, "utf8"));
  } catch {
    console.error(`Cannot read backup file: ${backupPath}`);
    process.exit(1);
  }
  if (backup.kind !== "cantomando-course-backup" || backup.courseId !== courseId) {
    console.error("Backup file does not match this course. Run step 3 for this exact courseId first.");
    process.exit(1);
  }
  const ageMs = Date.now() - Date.parse(backup.takenAt);
  if (!(ageMs >= 0) || ageMs > 24 * 60 * 60 * 1000) {
    console.error("Backup is missing a valid timestamp or is older than 24h. Take a fresh backup (step 3).");
    process.exit(1);
  }

  // --- Compare backup counts against live data ---
  const [{ count: liveModules }] = await sql`
    SELECT COUNT(*)::int AS count FROM modules
    WHERE course_id = ${courseId} AND deleted_at IS NULL
  `;
  const [{ count: liveLessons }] = await sql`
    SELECT COUNT(*)::int AS count FROM lessons l
    JOIN modules m ON m.id = l.module_id
    WHERE m.course_id = ${courseId} AND l.deleted_at IS NULL
  `;
  if (liveModules !== backup.counts.modules || liveLessons !== backup.counts.lessons) {
    console.error("Live content differs from the backup (someone edited the course since the backup).");
    console.error(`  live:   modules=${liveModules} lessons=${liveLessons}`);
    console.error(`  backup: modules=${backup.counts.modules} lessons=${backup.counts.lessons}`);
    console.error("Take a fresh backup (step 3) and re-run.");
    process.exit(1);
  }

  console.log(`Course ${courseId}: will archive ${liveModules} module(s) and ${liveLessons} lesson(s).`);

  if (!confirm) {
    console.log("");
    console.log("DRY RUN - nothing changed. Re-run with --confirm to archive.");
    return;
  }

  // --- Execute (soft delete) ---
  await sql.transaction([
    sql`
      UPDATE lessons SET deleted_at = NOW()
      WHERE deleted_at IS NULL
        AND module_id IN (SELECT id FROM modules WHERE course_id = ${courseId})
    `,
    sql`
      UPDATE modules SET deleted_at = NOW()
      WHERE deleted_at IS NULL AND course_id = ${courseId}
    `,
  ]);

  console.log("Archived. Existing modules/lessons for this course are now soft-deleted.");
  console.log("Next: import the new content (README step 5). Recovery = restore from the backup.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
