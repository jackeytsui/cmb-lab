/**
 * VideoAsk → Vocal Hack migration: import normalized JSON into CMB Lab
 *
 * Reads the normalized lesson JSON produced by scripts/videoask-migrate.ts and
 * inserts them into Course Library as `vocal_hack` lessons, in order. By
 * default it creates a new *draft* course + module so nothing touches live
 * courses until you're ready; pass --course / --module to target existing ones.
 *
 * pinyin is auto-generated from each sentence's Chinese with the exact
 * jieba/tone-sandhi pipeline the lesson editor uses (annotateSentence /
 * smartRomanise). English is left blank — open the lesson in the editor and it
 * auto-fills on blur, or add it during review.
 *
 * Usage:
 *   npx tsx scripts/videoask-import.ts                       # new draft course
 *   npx tsx scripts/videoask-import.ts --dry-run
 *   npx tsx scripts/videoask-import.ts --course <id> --module <id>
 *   npx tsx scripts/videoask-import.ts --canto               # Cantonese variant
 *
 * Options:
 *   --in <dir>            Input dir (default: scripts/scraped-videoask).
 *   --course <id>         Existing course_library_courses.id to import into.
 *   --module <id>         Existing course_library_modules.id to import into.
 *   --course-title <s>    Title for the new course (default: "VideoAsk Migration").
 *   --module-title <s>    Title for the new module (default: "Vocal Hacks").
 *   --canto               Import as vocal_hack_canto (jyutping romanisation).
 *   --allow-incomplete    Import lessons still flagged needsReview (default: skip).
 *   --dry-run             Print the plan; write nothing to the database.
 *
 * Required env (.env.local): DATABASE_URL
 */

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { and, eq, isNull, max } from "drizzle-orm";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
} from "../src/db/schema";
import { annotateSentence } from "../src/lib/mandarin-annotate";
import { smartRomanise } from "../src/lib/romanise";
import {
  toVocalHackContent,
  type NormalizedVocalHackLesson,
} from "../src/lib/videoask-mapping";

// ---------------------------------------------------------------------------
// CLI
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

const args = parseArgs(process.argv.slice(2));
if (args.help || args.h) {
  console.log(
    "Usage: npx tsx scripts/videoask-import.ts [--in dir] [--course id] " +
      "[--module id] [--canto] [--allow-incomplete] [--dry-run]",
  );
  process.exit(0);
}

const IN_DIR =
  (args.in as string | undefined) ??
  path.join(process.cwd(), "scripts", "scraped-videoask");
const CANTO = !!args.canto;
const LESSON_TYPE = CANTO ? "vocal_hack_canto" : "vocal_hack";
const ROMAN_LANG: "mandarin" | "cantonese" = CANTO ? "cantonese" : "mandarin";
const DRY_RUN = !!args["dry-run"];
const ALLOW_INCOMPLETE = !!args["allow-incomplete"];

// ---------------------------------------------------------------------------
// pinyin / jyutping generation (same pipeline as the lesson editor)
// ---------------------------------------------------------------------------

function generateRomanisation(chinese: string): string {
  const text = chinese.trim();
  if (!text) return "";
  if (ROMAN_LANG === "cantonese") return smartRomanise(text, "cantonese");
  return annotateSentence(text)
    .filter((a) => a.pinyin)
    .map((a) => a.pinyin)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Load normalized lessons
// ---------------------------------------------------------------------------

interface LoadedLesson extends NormalizedVocalHackLesson {
  sortOrder?: number;
}

async function loadLessons(dir: string): Promise<LoadedLesson[]> {
  const files = (await readdir(dir)).filter(
    (f) => f.endsWith(".json") && f !== "index.json" && !f.endsWith(".videos.json"),
  );
  if (files.length === 0) {
    throw new Error(`No lesson JSON files found in ${dir}`);
  }
  const lessons: LoadedLesson[] = [];
  for (const file of files.sort()) {
    const parsed = JSON.parse(
      await readFile(path.join(dir, file), "utf8"),
    ) as LoadedLesson;
    lessons.push(parsed);
  }
  // Order by explicit sortOrder when present, else filename order.
  lessons.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return lessons;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const lessons = await loadLessons(IN_DIR);
  console.log(`Loaded ${lessons.length} normalized lesson(s) from ${IN_DIR}\n`);

  // Split by review status. Lessons still needing Chinese/video are skipped
  // unless --allow-incomplete, so we never publish half-blank sentences.
  const importable: LoadedLesson[] = [];
  for (const l of lessons) {
    if (l.needsReview && !ALLOW_INCOMPLETE) {
      console.log(
        `  SKIP (needs review): ${l.title} — ${l.stats.sentencesNeedingChinese} sentence(s) need Chinese, ${l.stats.sentencesNeedingVideo} need video`,
      );
      continue;
    }
    importable.push(l);
  }
  if (importable.length === 0) {
    console.log(
      "\nNothing to import. Fill in the flagged `chinese` fields (or pass --allow-incomplete) and re-run.",
    );
    return;
  }

  console.log(`\n${importable.length} lesson(s) ready to import as ${LESSON_TYPE}.`);

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Plan:\n");
    for (const l of importable) {
      const withRoman = l.sentences.filter((s) => s.chinese).length;
      console.log(
        `  • ${l.title} — ${l.sentences.length} sentence(s), pinyin for ${withRoman}`,
      );
    }
    return;
  }

  // Everything below writes to the database.
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL is not set in .env.local");
    process.exit(1);
  }
  const db = drizzle(neon(process.env.DATABASE_URL));

  // --- Resolve target course + module ---------------------------------------
  let courseId = args.course as string | undefined;
  if (!courseId) {
    const title =
      (args["course-title"] as string | undefined) ?? "VideoAsk Migration";
    const [course] = await db
      .insert(courseLibraryCourses)
      .values({
        title,
        summary: "Imported from VideoAsk.",
        status: "draft",
        isPublished: false,
      })
      .returning({ id: courseLibraryCourses.id });
    courseId = course.id;
    console.log(`\nCreated draft course "${title}" (${courseId})`);
  } else {
    const [existing] = await db
      .select({ id: courseLibraryCourses.id })
      .from(courseLibraryCourses)
      .where(
        and(
          eq(courseLibraryCourses.id, courseId),
          isNull(courseLibraryCourses.deletedAt),
        ),
      );
    if (!existing) {
      console.error(`Error: course ${courseId} not found`);
      process.exit(1);
    }
    console.log(`\nImporting into existing course ${courseId}`);
  }

  let moduleId = args.module as string | undefined;
  if (!moduleId) {
    const title = (args["module-title"] as string | undefined) ?? "Vocal Hacks";
    const [nextSort] = await db
      .select({ v: max(courseLibraryModules.sortOrder) })
      .from(courseLibraryModules)
      .where(
        and(
          eq(courseLibraryModules.courseId, courseId),
          isNull(courseLibraryModules.deletedAt),
        ),
      );
    const [mod] = await db
      .insert(courseLibraryModules)
      .values({
        courseId,
        title,
        sortOrder: (nextSort?.v ?? -1) + 1,
      })
      .returning({ id: courseLibraryModules.id });
    moduleId = mod.id;
    console.log(`Created module "${title}" (${moduleId})`);
  } else {
    const [existing] = await db
      .select({ id: courseLibraryModules.id })
      .from(courseLibraryModules)
      .where(
        and(
          eq(courseLibraryModules.id, moduleId),
          isNull(courseLibraryModules.deletedAt),
        ),
      );
    if (!existing) {
      console.error(`Error: module ${moduleId} not found`);
      process.exit(1);
    }
    console.log(`Importing into existing module ${moduleId}`);
  }

  // --- Insert lessons in order ----------------------------------------------
  const [baseSort] = await db
    .select({ v: max(courseLibraryLessons.sortOrder) })
    .from(courseLibraryLessons)
    .where(
      and(
        eq(courseLibraryLessons.moduleId, moduleId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    );
  let sortOrder = (baseSort?.v ?? -1) + 1;

  let inserted = 0;
  for (const l of importable) {
    // Fill pinyin/jyutping from Chinese (English left for the editor).
    const withRoman: NormalizedVocalHackLesson = {
      ...l,
      sentences: l.sentences.map((s) => ({
        ...s,
        pinyin: s.pinyin?.trim() ? s.pinyin : generateRomanisation(s.chinese),
      })),
    };
    const content = toVocalHackContent(withRoman);

    await db.insert(courseLibraryLessons).values({
      moduleId,
      title: l.title,
      lessonType: LESSON_TYPE,
      content,
      sortOrder: sortOrder++,
    });
    inserted++;
    console.log(
      `  ✓ ${l.title} (${content.sentences.length} sentence(s))`,
    );
  }

  console.log(`\nImported ${inserted} lesson(s) into module ${moduleId}.`);
  console.log(
    `Review at /admin/course-library/${courseId} — the course is a draft ` +
      "until you publish it.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
